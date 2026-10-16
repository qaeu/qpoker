import { describe, expect, it } from 'vitest';

import { parseCards } from '#utils/cards/cards';
import { classFromName, COMBO_COUNT } from '#utils/cards/combos';
import {
	describeClass,
	matchAction,
	resultOf,
	type SolveStats,
} from '#utils/solver/result';
import { solverIndex } from '#utils/solver/cards';
import { solverSpot, type SolverSpot } from '#utils/solver/spot';
import { presetOf } from '#utils/solver/tree';
import type { WasmAction, WasmQuery } from '#utils/solver/wasmApi';

import { RIVER_HERO_CALL } from '../history/handText';
import { replayOf } from './spots';

const found = solverSpot(replayOf(RIVER_HERO_CALL), 14, presetOf('standard'));
if (!found.ok) throw new Error(found.message);
const spot: SolverSpot = found.spot;

const ACTIONS: WasmAction[] = [
	{ kind: 'fold' },
	{ kind: 'call' },
	{ kind: 'raise', to: 1000 },
];
const STATS: SolveStats = {
	iterations: 120,
	exploitability: 4,
	nodes: 55,
	bytes: 2_000_000,
	compressed: false,
	trim: null,
};

/** A query holding only the hero’s hand, with the given frequencies and EVs in cents. */
function queryOf(
	frequency: number[],
	ev: number[],
	extra: Partial<WasmQuery> = {}
): WasmQuery {
	const at = (action: number, pair: number) => action * COMBO_COUNT + pair;
	const strategy = new Array<number>(ACTIONS.length * COMBO_COUNT).fill(0);
	const evs = new Array<number>(ACTIONS.length * COMBO_COUNT).fill(0);
	const weights = new Array<number>(COMBO_COUNT).fill(0);
	const equity = new Array<number>(COMBO_COUNT).fill(0);
	ACTIONS.forEach((_, a) => {
		strategy[at(a, spot.heroPair)] = frequency[a];
		evs[at(a, spot.heroPair)] = ev[a];
	});
	weights[spot.heroPair] = 1;
	equity[spot.heroPair] = 0.3;
	return {
		player: 0,
		actions: ACTIONS,
		pot: 600,
		strategy,
		ev: evs,
		equity,
		weights,
		...extra,
	};
}

describe('resultOf', () => {
	describe('the hero’s hand', () => {
		const result = resultOf(spot, queryOf([0.2, 0.5, 0.3], [0, -30, 10]), STATS);

		it('names the actions and gives each its frequency and EV in bb', () => {
			expect(result.actions.map((row) => row.label)).toEqual([
				'Fold',
				'Call',
				'Raise to 100 bb',
			]);
			expect(result.actions.map((row) => row.frequency)).toEqual([0.2, 0.5, 0.3]);
			expect(result.actions.map((row) => row.evBb)).toEqual([0, -3, 1]);
			expect(result.actions[2].toBb).toBe(100);
			expect(result.actions[0].toBb).toBeNull();
		});

		it('finds the played action and the best one, and the gap between them', () => {
			expect(result.chosen).toBe(1);
			expect(result.best).toBe(2);
			expect(result.evGapBb).toBe(-4);
			expect(result.evGapBb).toBeLessThanOrEqual(0);
		});

		it('has no gap when the best action was played', () => {
			const same = resultOf(spot, queryOf([0, 1, 0], [0, 20, 10]), STATS);
			expect(same.best).toBe(1);
			expect(same.evGapBb).toBe(0);
		});

		it('mixes the EV by frequency and reads equity and the node', () => {
			expect(result.evBb).toBeCloseTo(0.2 * 0 + 0.5 * -3 + 0.3 * 1);
			expect(result.equity).toBe(0.3);
			expect(result.potBb).toBe(60);
			expect(result.hand).toBe('54s');
			expect(result.facing).toBe(true);
			expect(result.reached).toBe(true);
		});

		it('says how far the solve got, against the street’s starting pot', () => {
			// 4 cents on a pot of 200.
			expect(result.exploitabilityPct).toBeCloseTo(2);
			expect(result.iterations).toBe(120);
			expect(result.nodes).toBe(55);
		});

		it('measures realised equity against the raw equity at the price', () => {
			// 0.3 * (600 + 400) - 400 = -100 cents: nothing to realise.
			expect(result.eqr).toBeNull();
			const rich = resultOf(
				spot,
				queryOf([0, 1, 0], [0, 400, 0], {
					equity: queryOf([], [], {}).equity.map(() => 0.9),
				}),
				STATS
			);
			// raw = 0.9 * 1000 - 400 = 500 cents; strategy gets 400.
			expect(rich.eqr).toBeCloseTo(0.8);
		});

		it('normalises a strategy that does not quite sum to one', () => {
			const rough = resultOf(spot, queryOf([0.1, 0.4, 0.4], [0, 0, 0]), STATS);
			expect(rough.actions.reduce((sum, row) => sum + row.frequency, 0)).toBeCloseTo(1);
		});
	});

	describe('a hand the equilibrium does not reach', () => {
		it('is marked, and keeps the rows it would play had it got here', () => {
			const query = queryOf([0, 1, 0], [0, 250, 0]);
			query.weights[spot.heroPair] = 0;
			const result = resultOf(spot, query, STATS);
			expect(result.reached).toBe(false);
			expect(result.actions[1].frequency).toBe(1);
			expect(result.actions[1].evBb).toBeGreaterThan(0);
		});
	});

	describe('the range', () => {
		const query = queryOf([0, 0, 0], [0, 0, 0]);
		const [as, ah, ac, ad] = parseCards('As Ah Ac Ad');
		const at = (action: number, pair: number) => action * COMBO_COUNT + pair;
		// One ace pair raises every time, another calls half and folds half.
		query.weights[solverIndex(as, ah)] = 1;
		query.strategy[at(2, solverIndex(as, ah))] = 1;
		query.weights[solverIndex(ac, ad)] = 0.5;
		query.strategy[at(1, solverIndex(ac, ad))] = 0.5;
		query.strategy[at(0, solverIndex(ac, ad))] = 0.5;
		const result = resultOf(spot, query, STATS);
		const aces = classFromName('AA');

		it('folds the combos of a class into one cell by their reach', () => {
			// Weights 1 and 0.5: raise 1/1.5 of the time; call 0.25/1.5; the rest folds.
			expect(result.strategy.raise[aces]).toBeCloseTo(1 / 1.5);
			expect(result.strategy.call[aces]).toBeCloseTo(0.25 / 1.5);
		});

		it('says how much of a class the range holds', () => {
			expect(result.held[aces]).toBeCloseTo(1.5 / 6);
			expect(result.held[classFromName('KK')]).toBe(0);
		});

		it('leaves a hand never held empty', () => {
			expect(result.strategy.raise[classFromName('72o')]).toBe(0);
			expect(result.strategy.call[classFromName('72o')]).toBe(0);
		});

		describe('a cell’s tooltip', () => {
			it('says a hand never held is not in the range, rather than that it folds', () => {
				expect(describeClass(result, classFromName('72o'))).toBe(
					'72o: not in the range here'
				);
			});

			it('gives a held hand its weight and its play', () => {
				expect(describeClass(result, aces)).toBe(
					'AA: weight 25% here; bets or raises 67%, calls 17%, folds 17%'
				);
			});
		});
	});

	describe('a node that is not the hero’s', () => {
		it('is an error', () => {
			expect(() =>
				resultOf(spot, queryOf([0, 1, 0], [0, 0, 0], { player: 1 }), STATS)
			).toThrow(/not the hero/);
		});

		it('is an error when there is nothing to do', () => {
			expect(() => resultOf(spot, queryOf([], [], { actions: [] }), STATS)).toThrow();
		});
	});
});

describe('matchAction', () => {
	const tree: WasmAction[] = [
		{ kind: 'check' },
		{ kind: 'bet', to: 100 },
		{ kind: 'bet', to: 300 },
		{ kind: 'allin', to: 900 },
	];

	it('matches a check, call or fold by kind', () => {
		expect(matchAction(tree, { kind: 'check' })).toBe(0);
		expect(matchAction(tree, { kind: 'call' })).toBeNull();
	});

	it('matches a bet to the nearest size', () => {
		expect(matchAction(tree, { kind: 'bet', to: 250 })).toBe(2);
		expect(matchAction(tree, { kind: 'bet', to: 120 })).toBe(1);
	});

	it('matches an all-in to the all-in', () => {
		expect(matchAction(tree, { kind: 'allin', to: 900 })).toBe(3);
	});

	it('finds nothing when the tree cannot bet', () => {
		expect(matchAction([{ kind: 'check' }], { kind: 'bet', to: 100 })).toBeNull();
	});
});
