import { describe, it, expect } from 'vitest';

import { summariseOpenings } from '#utils/coach/openings';
import { analyzeLog } from '#utils/coach/report';
import { parseHistory } from '#utils/history/parse';
import { replayHand } from '#utils/history/replay';

import { BLINDS_HERO_BTN, BLINDS_HERO_UTG, handText } from '../history/handText';

const folds = (...names: string[]) => names.map((name) => `${name}: folds`);

type FirstIn = 'fold' | 'limp' | 'raise';

/** Hero under the gun does `action`; everyone else gets out of the way. */
function firstIn(
	heroCards: string,
	action: FirstIn,
	heroStack = 10,
	id?: number
): string {
	const lines = {
		fold: [
			...folds('hero', 'p2', 'p3', 'p4', 'p5'),
			'Uncalled bet ($0.05) returned to p6',
			'p6 collected $0.10 from pot',
		],
		limp: [
			'hero: calls $0.10',
			...folds('p2', 'p3', 'p4', 'p5'),
			'p6: checks',
			'*** FLOP *** [Kd 7s 2c]',
			'p6: bets $0.10',
			'hero: folds',
			'Uncalled bet ($0.10) returned to p6',
			'p6 collected $0.25 from pot',
		],
		raise: [
			'hero: raises $0.15 to $0.25',
			...folds('p2', 'p3', 'p4', 'p5', 'p6'),
			'Uncalled bet ($0.15) returned to hero',
			'hero collected $0.25 from pot',
		],
	}[action];
	return handText({
		id,
		heroCards,
		button: 4,
		lines: [...BLINDS_HERO_UTG, '*** HOLE CARDS ***', ...lines],
		pot: action === 'fold' ? '0.10' : '0.25',
		winner: action === 'raise' ? 'hero' : 'p6',
		stacks: { hero: heroStack },
	});
}

/** Hero on the button folds to an open from p4. */
const FACING_AN_OPEN = handText({
	heroCards: 'As Kd',
	button: 1,
	lines: [
		...BLINDS_HERO_BTN,
		'*** HOLE CARDS ***',
		'p4: raises $0.15 to $0.25',
		...folds('p5', 'p6', 'hero', 'p2', 'p3'),
		'Uncalled bet ($0.15) returned to p4',
		'p4 collected $0.25 from pot',
	],
	pot: '0.25',
	winner: 'p4',
});

const openings = (...hands: string[]) =>
	summariseOpenings(parseHistory(hands.join('\n')).map(replayHand), 'hero');

const repeat = (count: number, heroCards: string, action: FirstIn) =>
	Array.from({ length: count }, () => firstIn(heroCards, action));

describe('opening ranges', () => {
	describe('what is counted', () => {
		it('tallies first-in hands by seat and by hand', () => {
			const { rows, shortStacked } = openings(
				firstIn('As Kd', 'raise'),
				firstIn('Ah Kc', 'raise'),
				firstIn('7c 2d', 'fold')
			);
			expect(shortStacked).toBe(0);
			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({
				position: 'UTG',
				chart: 'rfiUtg',
				spots: 3,
				raised: 2,
				limped: 0,
				leak: null,
				deviations: [],
			});
			// Grid order: ace-king offsuit comes before seven-deuce.
			expect(rows[0].hands).toEqual([
				{ hand: 'AKo', dealt: 2, raised: 2, limped: 0, chart: 1 },
				{ hand: '72o', dealt: 1, raised: 0, limped: 0, chart: 0 },
			]);
		});

		it('takes its baseline from the cards actually held', () => {
			const [row] = openings(
				firstIn('As Kd', 'raise'),
				firstIn('Ac Td', 'fold'),
				firstIn('7c 2d', 'fold')
			).rows;
			// Always, half the time, and never.
			expect(row.expected).toBeCloseTo(1.5);
			// Under the gun the chart opens about 17% of hands.
			expect(row.chartRange).toBeGreaterThan(0.12);
			expect(row.chartRange).toBeLessThan(0.2);
		});

		it('leaves out a hand that was not folded to the hero', () => {
			expect(openings(FACING_AN_OPEN).rows).toEqual([]);
		});

		it('leaves out and counts a stack under 30bb', () => {
			const summary = openings(firstIn('As Kd', 'raise', 2));
			expect(summary).toEqual({ rows: [], shortStacked: 1 });
		});

		it('needs the hero’s cards', () => {
			expect(
				summariseOpenings(parseHistory(firstIn('As Kd', 'raise')).map(replayHand), 'p2')
					.rows
			).toEqual([]);
		});
	});

	describe('deviations', () => {
		it('names an open outside the chart, a fold inside it, and a limp', () => {
			const [row] = openings(
				firstIn('7c 2d', 'raise', 10, 7001),
				firstIn('As Ad', 'fold', 10, 7002),
				firstIn('Ks Kd', 'limp', 10, 7003)
			).rows;
			expect(row.limped).toBe(1);
			expect(row.deviations).toEqual([
				{ handId: '7001', hand: '72o', chosen: 'raise' },
				{ handId: '7002', hand: 'AA', chosen: 'fold' },
				{ handId: '7003', hand: 'KK', chosen: 'call' },
			]);
		});

		it('forgives either side of a mixed hand', () => {
			// The chart opens ace-ten offsuit under the gun half the time.
			expect(openings(firstIn('Ac Td', 'raise')).rows[0].deviations).toEqual([]);
			expect(openings(firstIn('Ac Td', 'fold')).rows[0].deviations).toEqual([]);
		});
	});

	describe('leaks', () => {
		it('flags a seat only when the sample can bear it', () => {
			expect(openings(...repeat(3, '7c 2d', 'raise')).rows[0].leak).toBeNull();
			expect(openings(...repeat(20, '7c 2d', 'raise')).rows[0].leak).toBe('high');
			expect(openings(...repeat(20, 'As Ad', 'fold')).rows[0].leak).toBe('low');
		});

		it('does not flag folding bad cards or opening good ones', () => {
			expect(openings(...repeat(20, '7c 2d', 'fold')).rows[0].leak).toBeNull();
			expect(openings(...repeat(20, 'As Ad', 'raise')).rows[0].leak).toBeNull();
		});
	});

	it('is part of the report', () => {
		const report = analyzeLog(firstIn('As Kd', 'raise'));
		expect(report.openings.rows.map((row) => row.position)).toEqual(['UTG']);
	});
});
