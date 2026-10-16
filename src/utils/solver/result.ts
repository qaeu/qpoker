/**
 * What a solve says of the hero's hand: a frequency and an EV for each action
 * at the node, how far the action taken fell short of the best one, and the
 * strategy of the hero's whole range folded into the 169 classes of the grid.
 * A readout, like `coach/stepEquity.ts`: it never touches a grading.
 * See docs/solver.md.
 */

import { CLASS_COUNT, classOf, className, COMBO_COUNT, COMBOS } from '../cards/combos';
import { emptyRange, type Strategy } from '../ranges/range';
import { SOLVER_OF } from './cards';
import type { SolverSpot } from './spot';
import type { SolveTrim } from './trim';
import type { WasmAction, WasmQuery } from './wasmApi';

export interface SolveActionRow {
	kind: WasmAction['kind'];
	/** `Bet 2 bb (75%)`. */
	label: string;
	/** For a bet or raise: the total on the street after it, in bb. */
	toBb: number | null;
	/** How often the solver plays it with the hero's hand. */
	frequency: number;
	/** The hero's EV of taking it, in bb, from this node on. */
	evBb: number;
}

/** What the run itself cost and reached. */
export interface SolveStats {
	iterations: number;
	/** Cents, as the solver reports it. */
	exploitability: number;
	nodes: number;
	bytes: number;
	compressed: boolean;
	/** How much was cut from the ranges to fit the budget; null if nothing. */
	trim: SolveTrim | null;
}

export interface SolveResult {
	/** The hero's hand as a class, `AKo`. */
	hand: string;
	street: SolverSpot['street'];
	stepIndex: number;
	actions: SolveActionRow[];
	/** Index into `actions` of what the hero did, or null if the tree has no such action. */
	chosen: number | null;
	/** Index of the action with the best EV. */
	best: number;
	/** The chosen action's EV less the best's: zero or negative. Null with no chosen row. */
	evGapBb: number | null;
	/** The EV of the solver's mixed strategy with this hand, bb. */
	evBb: number;
	/** The hand's equity against the opponent's range here, 0 to 1. */
	equity: number;
	/**
	 * The EV the strategy gets over the EV of calling or checking it down to
	 * the end at the raw equity; null where that is not above nothing.
	 */
	eqr: number | null;
	/**
	 * False when the equilibrium never plays this hand to this node. The rows still
	 * hold: they are what the strategy would do and earn had it got here.
	 */
	reached: boolean;
	/** The pot at the node, bb. */
	potBb: number;
	/** The hero's range at the node: aggressive -> raise, call -> call, the rest -> fold or check. */
	strategy: Strategy;
	/** How much of each class the range holds here, 0 to 1 of the class. */
	held: Float64Array;
	/** Whether the rest of the strategy folds (a bet was faced) or checks. */
	facing: boolean;
	exploitabilityPct: number;
	iterations: number;
	nodes: number;
	bytes: number;
	compressed: boolean;
	trim: SolveTrim | null;
}

const AGGRESSIVE: ReadonlySet<WasmAction['kind']> = new Set(['bet', 'raise', 'allin']);

const round2 = (value: number): number => Math.round(value * 100) / 100;

function labelOf(action: WasmAction, bigBlind: number, pot: number): string {
	const bb = (cents: number) => `${round2(cents / bigBlind)} bb`;
	switch (action.kind) {
		case 'fold':
			return 'Fold';
		case 'check':
			return 'Check';
		case 'call':
			return 'Call';
		case 'bet':
			return `Bet ${bb(action.to ?? 0)}${pot > 0 ? ` (${Math.round(((action.to ?? 0) / pot) * 100)}%)` : ''}`;
		case 'raise':
			return `Raise to ${bb(action.to ?? 0)}`;
		case 'allin':
			return `All-in ${bb(action.to ?? 0)}`;
	}
}

/** The row of the tree the hero's action is, or null if none is near. */
export function matchAction(
	actions: readonly WasmAction[],
	chosen: WasmAction
): number | null {
	if (chosen.kind === 'fold' || chosen.kind === 'check' || chosen.kind === 'call') {
		const found = actions.findIndex((action) => action.kind === chosen.kind);
		return found < 0 ? null : found;
	}
	// A bet is matched to the nearest size, and an all-in to the all-in.
	if (chosen.kind === 'allin') {
		const jam = actions.findIndex((action) => action.kind === 'allin');
		if (jam >= 0) return jam;
	}
	let nearest: number | null = null;
	let gap = Infinity;
	actions.forEach((action, index) => {
		if (!AGGRESSIVE.has(action.kind)) return;
		const off = Math.abs((action.to ?? 0) - (chosen.to ?? 0));
		if (off < gap) {
			gap = off;
			nearest = index;
		}
	});
	return nearest;
}

/** The solver's answer for the hero's hand, and its range, as a result. */
export function resultOf(
	spot: SolverSpot,
	query: WasmQuery,
	stats: SolveStats
): SolveResult {
	const { actions } = query;
	const count = actions.length;
	if (count === 0) throw new Error('The solver found no actions at this node.');
	if (query.player !== spot.side) {
		throw new Error('The node the solver reached is not the hero’s.');
	}
	const pair = spot.heroPair;
	// Upstream's weights are reach times the opponent's compatible combos: a count, so scaled to the largest.
	const top = query.weights.reduce((most, weight) => Math.max(most, weight), 0);
	const reachOf = (index: number): number =>
		top > 0 ? (query.weights[index] ?? 0) / top : 0;
	const at = (action: number, index: number) => action * COMBO_COUNT + index;

	const frequency = actions.map((_, a) => query.strategy[at(a, pair)] ?? 0);
	const total = frequency.reduce((sum, value) => sum + value, 0);
	const reached = reachOf(pair) > 0;
	const normal = frequency.map((value) => (total > 0 ? value / total : 0));
	const rows: SolveActionRow[] = actions.map((action, a) => ({
		kind: action.kind,
		label: labelOf(action, spot.bigBlind, query.pot),
		toBb: action.to === undefined ? null : round2(action.to / spot.bigBlind),
		frequency: normal[a],
		evBb: (query.ev[at(a, pair)] ?? 0) / spot.bigBlind,
	}));

	let best = 0;
	rows.forEach((row, a) => {
		if (row.evBb > rows[best].evBb) best = a;
	});
	const chosen = matchAction(actions, spot.chosen);
	const evGapBb =
		chosen === null ? null : Math.min(0, rows[chosen].evBb - rows[best].evBb);
	const evBb = rows.reduce((sum, row) => sum + row.frequency * row.evBb, 0);

	const equity = query.equity[pair] ?? 0;
	const potBb = query.pot / spot.bigBlind;
	const raw = (equity * (query.pot + spot.toCall) - spot.toCall) / spot.bigBlind;
	const eqr = raw > 0.01 ? evBb / raw : null;

	// The range, folded into classes: how often each plays each way, by reach.
	const raise = emptyRange();
	const call = emptyRange();
	const held = emptyRange();
	const reach = new Float64Array(CLASS_COUNT);
	const size = new Float64Array(CLASS_COUNT);
	COMBOS.forEach(({ cls }, i) => {
		const j = SOLVER_OF[i];
		const weight = reachOf(j);
		size[cls]++;
		if (weight <= 0) return;
		reach[cls] += weight;
		actions.forEach((action, a) => {
			const share = weight * (query.strategy[at(a, j)] ?? 0);
			if (AGGRESSIVE.has(action.kind)) raise[cls] += share;
			else if (action.kind === 'call') call[cls] += share;
		});
	});
	for (let cls = 0; cls < CLASS_COUNT; cls++) {
		if (reach[cls] > 0) {
			raise[cls] = Math.min(1, raise[cls] / reach[cls]);
			call[cls] = Math.min(1 - raise[cls], call[cls] / reach[cls]);
		}
		held[cls] = size[cls] > 0 ? Math.min(1, reach[cls] / size[cls]) : 0;
	}

	return {
		hand: className(classOf(spot.heroCards[0], spot.heroCards[1])),
		street: spot.street,
		stepIndex: spot.stepIndex,
		actions: rows,
		chosen,
		best,
		evGapBb,
		evBb,
		equity,
		eqr,
		reached,
		potBb: round2(potBb),
		strategy: { raise, call },
		held,
		facing: actions.some((action) => action.kind === 'fold'),
		exploitabilityPct: spot.pot > 0 ? (stats.exploitability / spot.pot) * 100 : 0,
		iterations: stats.iterations,
		nodes: stats.nodes,
		bytes: stats.bytes,
		compressed: stats.compressed,
		trim: stats.trim,
	};
}

/** What a trim cut, in words, or null when the ranges were solved whole. */
export const trimNote = (trim: SolveTrim | null): string | null =>
	trim
	&& `To fit in memory, ${Math.round(trim.share * 100)}% of each range’s weight was left out: ${trim.oop} out-of-position and ${trim.ip} in-position combos, the lightest classes first.`;

/** A range-grid cell's tooltip: how the class plays here, or that it is not in the range. */
export function describeClass(result: SolveResult, cls: number): string {
	const name = className(cls);
	if (result.held[cls] === 0) return `${name}: not in the range here`;
	const pct = (value: number) => `${Math.round(value * 100)}%`;
	const raise = result.strategy.raise[cls];
	const call = result.strategy.call[cls];
	const rest = Math.max(0, 1 - raise - call);
	return `${name}: weight ${pct(result.held[cls])} here; bets or raises ${pct(raise)}, calls ${pct(call)}, ${result.facing ? 'folds' : 'checks'} ${pct(rest)}`;
}
