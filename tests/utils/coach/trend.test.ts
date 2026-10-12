import { describe, it, expect } from 'vitest';

import { analyzeLog } from '#utils/coach/report';
import { minutesOf, scopeHands, sessionsOf } from '#utils/coach/sessions';
import { MIN_TREND_HANDS, trendOf } from '#utils/coach/trend';

import { ringHand } from '../history/handText';

/** `count` hands from `firstId` on, each folding or opening the same cards. */
const run = (count: number, firstId: number, cards: string, action: 'fold' | 'raise') =>
	Array.from({ length: count }, (_, i) => ringHand(6, cards, action, firstId + i));

const handsOf = (...logs: string[][]) => analyzeLog(logs.flat().join('\n')).hands;

// A hand's time is read off its id: 60 ids to the minute, so 1800 are the gap.
const early = run(3, 100, '7c 2d', 'fold');
const late = run(2, 100 + 3 + 1900, '7c 2d', 'fold');

describe('sittings', () => {
	const hands = handsOf(early, late);

	it('reads a hand’s time as minutes on one clock', () => {
		expect(minutesOf('2026-01-02T10:01:00') - minutesOf('2026-01-02T10:00:00')).toBe(1);
		expect(minutesOf('2026-01-03T00:00:00') - minutesOf('2026-01-02T23:59:00')).toBe(1);
		expect(minutesOf('yesterday')).toBeNaN();
	});

	it('starts a new one after a gap of more than half an hour', () => {
		const sessions = sessionsOf(hands);
		expect(sessions.map(({ start, hands: count }) => [start, count])).toEqual([
			[0, 3],
			[3, 2],
		]);
		expect(sessions[0].id).toBe(hands[0].timestamp);
		expect(sessions[1]).toMatchObject({
			first: hands[3].timestamp,
			last: hands[4].timestamp,
		});
	});

	it('has none for no hands', () => {
		expect(sessionsOf([])).toEqual([]);
	});

	describe('a scope', () => {
		const ids = (scope: string) => scopeHands(hands, scope).map((hand) => hand.id);

		it('is every hand, the latest sitting, or one sitting by its id', () => {
			expect(ids('all')).toHaveLength(5);
			expect(ids('latest')).toEqual(hands.slice(3).map((hand) => hand.id));
			expect(ids(hands[0].timestamp)).toEqual(hands.slice(0, 3).map((hand) => hand.id));
		});

		it('counts its days back from the last hand, not from today', () => {
			const [old] = handsOf(run(1, 50, '7c 2d', 'fold'));
			const aged = [{ ...old, id: '1', timestamp: '2025-12-01T10:00:00' }, ...hands];
			expect(scopeHands(aged, 'week')).toHaveLength(5);
			expect(scopeHands(aged, 'month')).toHaveLength(5);
			expect(scopeHands(aged, 'all')).toHaveLength(6);
		});

		it('is every hand when it names a sitting that is not there', () => {
			expect(ids('2020-01-01T00:00:00')).toHaveLength(5);
		});
	});
});

describe('the trend', () => {
	const trend = (...logs: string[][]) => {
		const hands = handsOf(...logs);
		return trendOf(hands, sessionsOf(hands));
	};

	describe('sitting by sitting', () => {
		it('gives each its hands, its result and what its mistakes cost', () => {
			const { points } = trend(run(3, 100, 'As Ad', 'fold'), late);
			expect(points).toHaveLength(2);
			expect(points[0]).toMatchObject({ hands: 3, graded: 3, mistakes: 3, netBb: 0 });
			expect(points[0].evLostBb).toBeLessThan(0);
			expect(points[0].evLostPer100).toBeCloseTo((points[0].evLostBb / 3) * 100);
			expect(points[1]).toMatchObject({ hands: 2, mistakes: 0, evLostBb: 0 });
		});
	});

	describe('the earlier half against the later', () => {
		it('says nothing of a history too short to halve', () => {
			const short = trend(
				run(MIN_TREND_HANDS - 1, 100, 'As Ad', 'fold'),
				run(MIN_TREND_HANDS - 1, 300, 'As Ad', 'raise')
			);
			expect(short).toMatchObject({ halves: null, direction: null, shifts: [] });
		});

		it('names a mistake given up as better, and the cost with it', () => {
			const learned = trend(
				run(MIN_TREND_HANDS, 100, 'As Ad', 'fold'),
				run(MIN_TREND_HANDS, 300, 'As Ad', 'raise')
			);
			expect(learned.direction).toBe('better');
			expect(learned.halves!.earlier).toMatchObject({
				hands: MIN_TREND_HANDS,
				mistakesPer100: 100,
			});
			expect(learned.halves!.later).toMatchObject({ evLostPer100: 0, mistakesPer100: 0 });
			expect(learned.shifts).toMatchObject([
				{ type: 'open-tight', earlier: 100, later: 0, direction: 'better' },
			]);
		});

		it('names a mistake taken up as worse', () => {
			const slipped = trend(
				run(MIN_TREND_HANDS, 100, 'As Ad', 'raise'),
				run(MIN_TREND_HANDS, 300, 'As Ad', 'fold')
			);
			expect(slipped.direction).toBe('worse');
			expect(slipped.shifts[0]).toMatchObject({ direction: 'worse' });
		});

		it('calls no change one that the sample cannot bear', () => {
			// Two mistakes in the earlier hundred and three in the later.
			const steady = trend(
				run(2, 100, 'As Ad', 'fold'),
				run(MIN_TREND_HANDS - 2, 110, 'As Ad', 'raise'),
				run(3, 300, 'As Ad', 'fold'),
				run(MIN_TREND_HANDS - 3, 310, 'As Ad', 'raise')
			);
			expect(steady.halves).not.toBeNull();
			expect(steady.direction).toBeNull();
			expect(steady.shifts).toEqual([]);
		});
	});
});
