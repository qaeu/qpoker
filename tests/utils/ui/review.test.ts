import { describe, expect, it } from 'vitest';

import { analyzeLog } from '#utils/coach/report';
import {
	countsOf,
	DEFAULT_REVIEW,
	findingsOf,
	isPlayed,
	listHands,
	orderOf,
	positionsOf,
	scenariosOf,
	tallyOf,
	type ReviewQuery,
} from '#utils/ui/review';

import { TWO_HAND_LOG } from '../../integration/appHarness';
import { handText, RIVER_HERO_CALL, TOUGH_FOLD, UNRECONCILED } from '../history/handText';

// 5001 folds aces (a preflop blunder), 5002 opens ace-king (nothing to say),
// 6001 is a good play, 7001 a postflop blunder, 7002 does not reconcile.
const report = analyzeLog(
	[TWO_HAND_LOG, ...[TOUGH_FOLD, RIVER_HERO_CALL, UNRECONCILED].map(handText)].join('\n')
);
const hand = (id: string) => report.hands.find((candidate) => candidate.id === id)!;
const query = (change: Partial<ReviewQuery> = {}): ReviewQuery => ({
	...DEFAULT_REVIEW,
	...change,
});
const ids = (change: Partial<ReviewQuery>) =>
	listHands(report, query(change)).map(({ id }) => id);

describe('the Review list', () => {
	describe('orderOf', () => {
		it('reads findings biggest first and hands as played', () => {
			expect(orderOf(query({ show: 'mistakes' }))).toBe('impact');
			expect(orderOf(query({ show: 'plays' }))).toBe('impact');
			expect(orderOf(query({ show: 'all' }))).toBe('time');
			expect(orderOf(query({ show: 'played' }))).toBe('time');
		});

		it('gives way to an order that was asked for', () => {
			expect(orderOf(query({ show: 'mistakes', order: 'time' }))).toBe('time');
			expect(orderOf(query({ show: 'all', order: 'impact' }))).toBe('impact');
		});
	});

	describe('findingsOf', () => {
		it('finds nothing in a hand played on the baseline', () => {
			expect(findingsOf(hand('5002'))).toEqual([]);
		});

		it('gives a mistake its cost and a good play its gain', () => {
			const [fold] = findingsOf(hand('5001'));
			expect(fold.kind).toBe('mistake');
			expect(fold.evBb).toBe(fold.grading.evLostBb);
			expect(fold.evBb).toBeLessThan(0);

			const plays = findingsOf(hand('6001')).filter(({ kind }) => kind === 'play');
			expect(plays).toHaveLength(1);
			expect(plays[0].evBb).toBe(plays[0].grading.goodPlay!.evGainedBb);
			expect(plays[0].evBb).toBeGreaterThan(0);
		});

		it('keeps a hand’s findings in the order they were made', () => {
			const steps = findingsOf(hand('7001')).map(({ grading }) => grading.stepIndex);
			expect(steps).toEqual([...steps].sort((a, b) => a - b));
		});
	});

	describe('isPlayed', () => {
		it('is true once the hero puts chips in by choice', () => {
			expect(isPlayed(hand('5001'))).toBe(false);
			expect(isPlayed(hand('5002'))).toBe(true);
		});
	});

	describe('countsOf', () => {
		it('counts hands, not findings', () => {
			const counts = countsOf(report);
			expect(counts.all).toBe(5);
			expect(counts.played).toBe(3);
			expect(counts.plays).toBe(1);
			expect(counts.ungraded).toBe(1);
			expect(counts.mistakes).toBe(ids({ show: 'mistakes' }).length);
			expect(counts.mistakes).toBeLessThanOrEqual(report.mistakes.length);
		});
	});

	describe('listHands', () => {
		it('lists every hand as played', () => {
			expect(ids({ show: 'all' })).toEqual(['5001', '5002', '6001', '7001', '7002']);
		});

		it('lists the hands the hero played', () => {
			expect(ids({ show: 'played' })).toEqual(['5002', '6001', '7001']);
		});

		it('lists the hands that could not be graded', () => {
			expect(ids({ show: 'ungraded' })).toEqual(['7002']);
		});

		it('lists the good plays', () => {
			expect(ids({ show: 'plays' })).toEqual(['6001']);
		});

		describe('mistakes', () => {
			it('puts the hand with the largest finding first', () => {
				const listed = listHands(report, query());
				const worst = listed.map((item) =>
					Math.min(...item.gradings.map((grading) => grading.evLostBb))
				);
				expect(listed.map(({ id }) => id)).toContain('5001');
				expect(listed.map(({ id }) => id)).toContain('7001');
				expect(worst).toEqual([...worst].sort((a, b) => a - b));
			});

			it('lists them as played when asked', () => {
				const listed = ids({ order: 'time' });
				expect(listed).toEqual([...listed].sort());
			});

			it('narrows by street', () => {
				expect(ids({ street: 'pre' })).toContain('5001');
				expect(ids({ street: 'pre' })).not.toContain('7001');
				expect(ids({ street: 'post' })).toEqual(['7001']);
			});

			it('narrows by kind', () => {
				expect(ids({ kind: 'open-tight' })).toEqual(['5001']);
				expect(ids({ kind: 'call-without-odds' })).toEqual(['7001']);
				expect(ids({ kind: 'bb-overdefend' })).toEqual([]);
			});

			it('narrows by severity', () => {
				const blunders = ids({ floor: 'blunder' });
				expect(blunders).toContain('7001');
				for (const id of blunders) {
					expect(hand(id).gradings.some(({ severity }) => severity === 'blunder')).toBe(
						true
					);
				}
				expect(ids({ floor: 'inaccuracy' }).length).toBeGreaterThanOrEqual(
					blunders.length
				);
			});

			it('needs one finding to pass every filter at once', () => {
				expect(ids({ kind: 'call-without-odds', street: 'pre' })).toEqual([]);
			});
		});

		it('leaves the narrowing out of any other list', () => {
			expect(ids({ show: 'all', street: 'post', floor: 'blunder' })).toHaveLength(5);
		});

		it('sorts a plain list by its findings when asked, ties as played', () => {
			const listed = ids({ show: 'all', order: 'impact' });
			expect(listed).toHaveLength(5);
			expect(listed.slice(-2)).toEqual(['5002', '7002']);
		});
	});

	describe('tallyOf', () => {
		it('sums the cost of the mistakes listed', () => {
			const all = tallyOf(listHands(report, query()), query());
			expect(all.hands).toBe(countsOf(report).mistakes);
			expect(all.evBb).toBeCloseTo(report.totalEvLostBb, 6);

			const post = query({ street: 'post' });
			const tally = tallyOf(listHands(report, post), post);
			expect(tally.hands).toBe(1);
			expect(tally.evBb).toBeLessThan(0);
			expect(tally.evBb!).toBeGreaterThan(all.evBb!);
		});

		it('sums the gain of the good plays', () => {
			const plays = query({ show: 'plays' });
			const tally = tallyOf(listHands(report, plays), plays);
			expect(tally.hands).toBe(1);
			expect(tally.evBb).toBeCloseTo(report.goodPlays[0].goodPlay!.evGainedBb, 6);
		});

		it('has no figure for a plain list of hands', () => {
			const all = query({ show: 'all' });
			expect(tallyOf(listHands(report, all), all)).toEqual({ hands: 5, evBb: null });
		});
	});

	describe('the scope', () => {
		// 7001 is the one hand from the small blind; the rest are under the gun.
		describe('by position', () => {
			it('lists the hands the hero played from one seat', () => {
				expect(ids({ show: 'all', position: 'SB' })).toEqual(['7001']);
				expect(ids({ show: 'all', position: 'UTG' })).toEqual([
					'5001',
					'5002',
					'6001',
					'7002',
				]);
				expect(ids({ show: 'all', position: 'BTN' })).toEqual([]);
			});
		});

		describe('by preflop spot', () => {
			it('lists the hands with a decision of the hero’s in that spot', () => {
				expect(ids({ show: 'all', scenario: 'vs3bet' })).toEqual(['6001']);
				// A hand that was not graded has no decisions to be in a spot.
				expect(ids({ show: 'all', scenario: 'rfi' })).toEqual([
					'5001',
					'5002',
					'6001',
					'7001',
				]);
				expect(ids({ show: 'all', scenario: 'squeeze' })).toEqual([]);
			});
		});

		describe('with the other filters', () => {
			it('cuts down whatever is on show', () => {
				expect(ids({ show: 'mistakes', position: 'SB' })).toEqual(['7001']);
				expect(ids({ show: 'mistakes', position: 'UTG' })).not.toContain('7001');
				expect(ids({ show: 'plays', scenario: 'vs3bet' })).toEqual(['6001']);
				expect(ids({ show: 'ungraded', position: 'UTG' })).toEqual(['7002']);
				expect(ids({ show: 'ungraded', scenario: 'rfi' })).toEqual([]);
			});

			it('takes both at once', () => {
				expect(ids({ show: 'all', position: 'UTG', scenario: 'vs3bet' })).toEqual([
					'6001',
				]);
				expect(ids({ show: 'all', position: 'SB', scenario: 'vs3bet' })).toEqual([]);
			});

			it('is what the counts and the tally are of', () => {
				expect(countsOf(report, { position: 'SB', scenario: null })).toEqual({
					all: 1,
					played: 1,
					mistakes: 1,
					plays: 0,
					ungraded: 0,
				});
				const scoped = query({ position: 'SB' });
				expect(tallyOf(listHands(report, scoped), scoped).hands).toBe(1);
			});
		});

		describe('what there is to choose from', () => {
			it('offers the seats the hero held, earliest first, with their hands', () => {
				expect(positionsOf(report)).toEqual([
					{ id: 'UTG', hands: 4 },
					{ id: 'SB', hands: 1 },
				]);
			});

			it('offers the spots the hero was in', () => {
				const spots = scenariosOf(report);
				expect(spots.map(({ id }) => id)).toEqual(['rfi', 'vs3bet', 'vs5bet']);
				expect(spots[0].hands).toBe(4);
			});

			it('counts each within the other', () => {
				expect(positionsOf(report, { position: null, scenario: 'vs3bet' })).toEqual([
					{ id: 'UTG', hands: 1 },
				]);
				expect(scenariosOf(report, { position: 'SB', scenario: null })).toEqual([
					{ id: 'rfi', hands: 1 },
				]);
			});

			it('keeps the value in the query on the menu, though it lists nothing', () => {
				expect(positionsOf(report, { position: 'BTN', scenario: null })).toContainEqual({
					id: 'BTN',
					hands: 0,
				});
				expect(
					scenariosOf(report, { position: null, scenario: 'squeeze' })
				).toContainEqual({ id: 'squeeze', hands: 0 });
			});
		});
	});
});
