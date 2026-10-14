import { describe, it, expect } from 'vitest';

import { classFromName } from '#utils/cards/combos';
import { parseHistory } from '#utils/history/parse';
import { decisionsOf, replayHand } from '#utils/history/replay';
import {
	chart,
	CHART_IDS,
	CHART_SEAT,
	depthOf,
	jamRange,
	limpRange,
} from '#utils/ranges/charts';
import { formatRange, parseRange, parseStrategy } from '#utils/ranges/notation';
import {
	classifyPreflop,
	overLimpStrategy,
	preflopRange,
} from '#utils/ranges/preflopSpot';
import {
	continueRange,
	rangeCombos,
	rangeFraction,
	toComboRange,
} from '#utils/ranges/range';
import { handTier, marginTier, TRASH_TIER } from '#utils/ranges/tiers';

import emailed from '../../fixtures/emailed.txt?raw';
import {
	BLINDS_HERO_BTN,
	BLINDS_HERO_SB,
	BLINDS_NINE_HERO_LJ,
	handText,
	NINE_SEATS,
	ringHand,
} from '../history/handText';

const cls = classFromName;

describe('range notation', () => {
	it('expands single hands, both suits when unmarked', () => {
		expect(rangeCombos(parseRange('AKs'))).toBe(4);
		expect(rangeCombos(parseRange('AKo'))).toBe(12);
		expect(rangeCombos(parseRange('AK'))).toBe(16);
		expect(rangeCombos(parseRange('77'))).toBe(6);
	});

	it('expands plus and dash runs', () => {
		const pairs = parseRange('TT+');
		expect(['TT', 'JJ', 'QQ', 'KK', 'AA'].every((name) => pairs[cls(name)] === 1)).toBe(
			true
		);
		expect(pairs[cls('99')]).toBe(0);
		// The kicker climbs to just under the high card.
		expect(formatRange(parseRange('ATs+'))).toBe('AKs,AQs,AJs,ATs');
		expect(formatRange(parseRange('T8s+'))).toBe('T9s,T8s');
		expect(formatRange(parseRange('99-77'))).toBe('99,88,77');
		expect(formatRange(parseRange('K9s-K7s'))).toBe('K9s,K8s,K7s');
	});

	it('takes a frequency, the later token winning', () => {
		const range = parseRange('A2s+,A5s:0.5');
		expect(range[cls('A5s')]).toBe(0.5);
		expect(range[cls('A4s')]).toBe(1);
	});

	it('round-trips through its own formatting', () => {
		const range = parseRange('22+,A2s+,KTo+,T9s:0.5,65s:0.25');
		expect(Array.from(parseRange(formatRange(range)))).toEqual(Array.from(range));
	});

	it('rejects nonsense', () => {
		expect(() => parseRange('AKx')).toThrow();
		expect(() => parseRange('KAs')).toThrow();
		expect(() => parseRange('AKs:2')).toThrow();
		expect(() => parseRange('AKs-QJs')).toThrow();
	});

	it('gives the raise priority where a strategy overlaps', () => {
		const strategy = parseStrategy('AA,KK:0.4', 'QQ+');
		expect(strategy.call[cls('AA')]).toBe(0);
		expect(strategy.call[cls('KK')]).toBeCloseTo(0.6);
		expect(strategy.call[cls('QQ')]).toBe(1);
	});
});

describe('the charts', () => {
	it('parse, at every depth, with frequencies that never exceed one', () => {
		for (const id of CHART_IDS) {
			for (const depth of ['deep', 'mid', 'short'] as const) {
				const strategy = chart(id, depth);
				for (let i = 0; i < 169; i++) {
					expect(strategy.raise[i] + strategy.call[i]).toBeLessThanOrEqual(1 + 1e-9);
				}
			}
		}
		expect(rangeCombos(limpRange())).toBeGreaterThan(100);
		expect(rangeCombos(jamRange('overThreeBet'))).toBeGreaterThan(30);
	});

	it('open wider the later the seat', () => {
		const sizes = (['rfiUtg', 'rfiHj', 'rfiCo', 'rfiBtn'] as const).map((id) =>
			rangeFraction(chart(id).raise)
		);
		expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
		expect(sizes[0]).toBeGreaterThan(0.12);
		expect(sizes[0]).toBeLessThan(0.2);
		expect(sizes[3]).toBeGreaterThan(0.38);
		expect(sizes[3]).toBeLessThan(0.5);
	});

	it('always play aces and never play seven-deuce first in', () => {
		for (const id of ['rfiUtg', 'rfiHj', 'rfiCo', 'rfiBtn', 'rfiSb'] as const) {
			expect(chart(id).raise[cls('AA')]).toBe(1);
			expect(chart(id).raise[cls('72o')]).toBe(0);
		}
	});

	it('defend the big blind wider against later opens', () => {
		const defence = (['bbVsUtg', 'bbVsHj', 'bbVsCo', 'bbVsBtn'] as const).map((id) =>
			rangeFraction(continueRange(chart(id)))
		);
		expect(defence).toEqual([...defence].sort((a, b) => a - b));
	});

	it('shove rather than 4-bet small at mid depth', () => {
		expect(depthOf(45)).toBe('mid');
		expect(depthOf(100)).toBe('deep');
		expect(depthOf(20)).toBe('short');
		expect(chart('btnVs3bet', 'mid').raise[cls('TT')]).toBe(1);
		expect(chart('btnVs3bet', 'deep').raise[cls('TT')]).toBeLessThan(1);
		// A spot with no mid-depth entry falls back to the deep one.
		expect(chart('rfiBtn', 'mid')).toBe(chart('rfiBtn', 'deep'));
	});

	it('rank hands on a ladder from premiums to trash', () => {
		expect(handTier(cls('AA'))).toBe(0);
		expect(handTier(cls('AKs'))).toBe(1);
		expect(handTier(cls('72o'))).toBe(TRASH_TIER);
		expect(handTier(cls('87s'))).toBeLessThan(handTier(cls('K2s')));
		expect(marginTier(chart('rfiUtg').raise)).toBe(3);
		expect(marginTier(chart('rfiBtn').raise)).toBe(6);
	});
});

describe('classifying a preflop spot', () => {
	const replays = parseHistory(emailed).map(replayHand);
	const stackOff = replays.at(-1)!;

	it('follows a hand from the open to the shove', () => {
		const spots = decisionsOf(stackOff, 'hero77').map((step) =>
			classifyPreflop(stackOff, step)
		);
		expect(spots.map((spot) => spot.scenario)).toEqual(['rfi', 'vs3bet', 'vs5bet']);
		expect(spots[0]).toMatchObject({
			position: 'HJ',
			chart: 'rfiHj',
			facingAllIn: false,
		});
		expect(spots[0].raiseToBb).toBe(2.5);
		expect(spots[1]).toMatchObject({
			chart: 'epVs3betIp',
			villainPosition: 'BTN',
			depth: 'mid',
			label: 'HJ vs BTN, facing a 3-bet',
		});
		expect(spots[1].effectiveBb).toBeCloseTo(46.6);
		// No chart reaches a 5-bet: the tightest stands in at low confidence.
		expect(spots[2]).toMatchObject({
			facingAllIn: true,
			chart: 'vs4betTight',
			confidence: 'low',
			label: 'HJ vs BTN, facing a 5-bet',
		});
	});

	it('gives each opponent the range of their line', () => {
		const threeBettor = preflopRange(stackOff, 'Brakeman1990');
		// 3-bet, then shoved over a 4-bet: a narrow, strong range.
		expect(rangeCombos(threeBettor)).toBeLessThan(60);
		expect(threeBettor[cls('AA')]).toBeGreaterThan(0);
		expect(threeBettor[cls('72o')]).toBe(0);
		// A player who never acted could hold anything.
		expect(rangeCombos(preflopRange(stackOff, 'nobody'))).toBe(1326);
		expect(toComboRange(threeBettor)).toHaveLength(1326);
	});

	const spotOf = (lines: string[], button: number, pot: string, winner: string) => {
		const replay = replayHand(
			parseHistory(handText({ heroCards: 'Ah Kh', button, lines, pot, winner }))[0]
		);
		return classifyPreflop(replay, decisionsOf(replay, 'hero')[0]);
	};

	it('tells an open from a limped pot from a squeeze', () => {
		const versusOpen = spotOf(
			[
				...BLINDS_HERO_BTN,
				'*** HOLE CARDS ***',
				'p4: folds',
				'p5: folds',
				'p6: raises $0.15 to $0.25',
				'hero: folds',
				'p2: folds',
				'p3: folds',
				'Uncalled bet ($0.15) returned to p6',
				'p6 collected $0.25 from pot',
			],
			1,
			'0.25',
			'p6'
		);
		expect(versusOpen).toMatchObject({
			scenario: 'vsOpen',
			chart: 'btnVsCo',
			confidence: 'high',
			label: 'BTN vs CO, facing an open',
		});
		expect(versusOpen.raiseToBb).toBeCloseTo(7.5);

		const squeeze = spotOf(
			[
				...BLINDS_HERO_SB,
				'*** HOLE CARDS ***',
				'p3: folds',
				'p4: raises $0.15 to $0.25',
				'p5: calls $0.25',
				'p6: folds',
				'hero: folds',
				'p2: folds',
				'*** FLOP *** [Kd 7s 2c]',
				'p4: bets $0.30',
				'p5: folds',
				'Uncalled bet ($0.30) returned to p4',
				'p4 collected $0.65 from pot',
			],
			6,
			'0.65',
			'p4'
		);
		expect(squeeze).toMatchObject({
			scenario: 'squeeze',
			chart: 'sbVsEp',
			confidence: 'medium',
			callers: 1,
		});

		const limped = spotOf(
			[
				...BLINDS_HERO_BTN,
				'*** HOLE CARDS ***',
				'p4: calls $0.10',
				'p5: folds',
				'p6: folds',
				'hero: folds',
				'p2: folds',
				'p3: checks',
				'*** FLOP *** [Kd 7s 2c]',
				'p3: bets $0.10',
				'p4: folds',
				'Uncalled bet ($0.10) returned to p3',
				'p3 collected $0.25 from pot',
			],
			1,
			'0.25',
			'p3'
		);
		expect(limped).toMatchObject({ scenario: 'vsLimp', limpers: 1, chart: null });
		expect(limped.strategy).toEqual(overLimpStrategy(CHART_SEAT[limped.position]));
		expect(limped.raiseToBb).toBe(3.5);
	});
});

describe('spots at a fuller table', () => {
	const firstSpot = (text: string) => {
		const replay = replayHand(parseHistory(text)[0]);
		return classifyPreflop(replay, decisionsOf(replay, 'hero')[0]);
	};
	const folds = (...names: string[]) => names.map((name) => `${name}: folds`);
	/** Nine-handed, hero in the lojack behind p7, p8 and p9. */
	const fromLojack = (before: string[], hero: string, after: string[], winner: string) =>
		firstSpot(
			handText({
				heroCards: 'Ah Kh',
				button: 4,
				seats: NINE_SEATS,
				max: 9,
				lines: [...BLINDS_NINE_HERO_LJ, '*** HOLE CARDS ***', ...before, hero, ...after],
				pot: '0.25',
				winner,
			})
		);

	describe('a seat earlier than any chart', () => {
		it('reads UTG’s chart under its own name, at medium confidence', () => {
			for (const [players, seat] of [
				[7, 'UTG'],
				[8, 'UTG'],
				[9, 'UTG'],
			] as const) {
				expect(firstSpot(ringHand(players, 'Ah Kh', 'raise'))).toMatchObject({
					scenario: 'rfi',
					position: seat,
					chart: 'rfiUtg',
					standIn: 'hero',
					confidence: 'medium',
					label: 'UTG, first in',
				});
			}
		});

		it('softens the read on a raise that came from one', () => {
			const spot = fromLojack(
				['p7: folds', 'p8: raises $0.15 to $0.25', 'p9: folds'],
				'hero: folds',
				[
					...folds('p2', 'p3', 'p4', 'p5', 'p6'),
					'Uncalled bet ($0.15) returned to p8',
					'p8 collected $0.25 from pot',
				],
				'p8'
			);
			expect(spot).toMatchObject({
				scenario: 'vsOpen',
				chart: 'ipVsEp',
				standIn: 'villain',
				confidence: 'medium',
				label: 'LJ vs UTG+1, facing an open',
			});
		});
	});

	describe('a seat the charts do cover', () => {
		it('gives the lojack UTG’s chart at full confidence', () => {
			const spot = fromLojack(
				folds('p7', 'p8', 'p9'),
				'hero: raises $0.15 to $0.25',
				[
					...folds('p2', 'p3', 'p4', 'p5', 'p6'),
					'Uncalled bet ($0.15) returned to hero',
					'hero collected $0.25 from pot',
				],
				'hero'
			);
			expect(spot).toMatchObject({
				position: 'LJ',
				chart: 'rfiUtg',
				standIn: null,
				confidence: 'high',
				label: 'LJ, first in',
			});
		});

		it('leaves a six-handed UTG as it was', () => {
			expect(firstSpot(ringHand(6, 'Ah Kh', 'raise'))).toMatchObject({
				position: 'UTG',
				chart: 'rfiUtg',
				standIn: null,
				confidence: 'high',
			});
		});
	});
});
