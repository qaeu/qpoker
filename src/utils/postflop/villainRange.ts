/**
 * The opponent model: what range a player holds after everything they have
 * done. A range starts as the chart range of the preflop line and is then
 * reweighted by each postflop action, by where a combo stands in the range --
 * a bet keeps the top of the range and enough of the bottom to be balanced, a
 * call keeps the middle and the draws, a check sheds strength.
 *
 * The weights are fixed and stated here, not fitted to anyone. They describe a
 * balanced opponent, which is the point of a GTO baseline, and are the largest
 * single approximation in the tool. See docs/postflop-model.md.
 */

import type { Card } from '../cards/cards';
import { COMBO_COUNT, COMBOS } from '../cards/combos';
import { removeDead, type ComboRange } from '../cards/equity';
import { evaluate } from '../cards/evaluate';
import type { Replay, Step } from '../history/replay';
import { preflopRange } from '../ranges/preflopSpot';
import { toComboRange } from '../ranges/range';
import { drawStrength, type DrawStrength } from './handClass';

export type RangeAction = 'bet' | 'raise' | 'call' | 'check';

/** A range ranked on a board. */
export interface RangeView {
	range: ComboRange;
	/** Share of the range each combo beats or ties, 0 to 1. Unset where weight is 0. */
	percentile: Float64Array;
	draws: Uint8Array;
}

/** Hands at or below this percentile, with no draw, are the range's air. */
const AIR_BELOW = 0.3;
/** The top of a range that raises rather than calls a bet. */
const RAISE_TOP = 0.1;

const clamp = (value: number, low: number, high: number): number =>
	Math.min(high, Math.max(low, value));

/** Ranks every combo of a range by its made hand on `board`. */
export function rankRange(range: ComboRange, board: readonly Card[]): RangeView {
	const percentile = new Float64Array(COMBO_COUNT);
	const draws = new Uint8Array(COMBO_COUNT);
	const scored: { index: number; score: number }[] = [];
	const cards: Card[] = [...board, 0, 0];
	let total = 0;

	for (let i = 0; i < COMBO_COUNT; i++) {
		if (range[i] <= 0) continue;
		const hole = [COMBOS[i].a, COMBOS[i].b];
		cards[board.length] = hole[0];
		cards[board.length + 1] = hole[1];
		scored.push({ index: i, score: evaluate(cards) });
		draws[i] = drawStrength(hole, board);
		total += range[i];
	}

	scored.sort((x, y) => x.score - y.score);
	let below = 0;
	for (let i = 0; i < scored.length;) {
		// Equal scores share one percentile: the middle of their band.
		let j = i;
		let band = 0;
		while (j < scored.length && scored[j].score === scored[i].score) {
			band += range[scored[j].index];
			j++;
		}
		const value = total > 0 ? (below + band / 2) / total : 0;
		for (let k = i; k < j; k++) percentile[scored[k].index] = value;
		below += band;
		i = j;
	}
	return { range, percentile, draws };
}

/** The share of a range that bets `size` (a fraction of the pot) for value. */
function valueShare(size: number): number {
	return clamp(0.6 - 0.35 * size, 0.15, 0.55);
}

/**
 * The share of a betting range that should be bluffs for the caller to be
 * indifferent: `s / (1 + 2s)` on the river, and more with cards to come, when
 * a bluff still has equity.
 */
function bluffShare(size: number, cardsToCome: number): number {
	const river = size / (1 + 2 * size);
	return clamp(river * (1 + 0.15 * cardsToCome), 0.05, 0.5);
}

/** How likely each kind of hand is to take an aggressive action, air aside. */
function aggressionWeight(
	percentile: number,
	draw: DrawStrength,
	raise: boolean,
	size: number
): number | null {
	const top = raise ? RAISE_TOP : valueShare(size);
	if (percentile >= 1 - top) return 0.85;
	if (draw === 2) return raise ? 0.3 : 0.6;
	if (draw === 1) return raise ? 0.1 : 0.35;
	if (percentile >= AIR_BELOW) {
		return (
			raise ? 0.02
			: size < 0.5 ? 0.2
			: 0.1
		);
	}
	return null;
}

/** Per-combo probability of betting or raising to `size`. */
function aggression(
	view: RangeView,
	raise: boolean,
	size: number,
	toCome: number
): Float64Array {
	const out = new Float64Array(COMBO_COUNT);
	let value = 0;
	let semi = 0;
	let air = 0;
	for (let i = 0; i < COMBO_COUNT; i++) {
		const weight = view.range[i];
		if (weight <= 0) continue;
		const p = aggressionWeight(
			view.percentile[i],
			view.draws[i] as DrawStrength,
			raise,
			size
		);
		if (p === null) air += weight;
		else {
			out[i] = p;
			const top = raise ? RAISE_TOP : valueShare(size);
			if (view.draws[i] > 0 && view.percentile[i] < 1 - top) semi += weight * p;
			else value += weight * p;
		}
	}
	// Air fills whatever bluffing the draws have not already done.
	const share = bluffShare(size, toCome);
	const wanted = (share / (1 - share)) * value - semi;
	const airBets = air > 0 ? clamp(wanted / air, raise ? 0.02 : 0.05, 0.7) : 0;
	for (let i = 0; i < COMBO_COUNT; i++) {
		if (view.range[i] > 0 && out[i] === 0) out[i] = airBets;
	}
	return out;
}

/** Per-combo probability of continuing against a bet of `size`: call or raise. */
function continuing(view: RangeView, size: number, toCome: number): Float64Array {
	const out = new Float64Array(COMBO_COUNT);
	// Defend the minimum-defence share of the range, strongest hands first.
	const defend = 1 / (1 + size);
	for (let i = 0; i < COMBO_COUNT; i++) {
		if (view.range[i] <= 0) continue;
		const p = view.percentile[i];
		const draw = view.draws[i];
		out[i] =
			p >= 1 - defend ? 0.95
			: draw === 2 ? 0.85
			: draw === 1 ?
				toCome === 2 && size <= 0.75 ?
					0.5
				:	0.25
			:	0.06;
	}
	return out;
}

/**
 * Reweights a range by one action. `size` is the bet as a fraction of the pot:
 * the bet made, for a bet or raise; the bet faced, for a call.
 */
export function applyAction(
	range: ComboRange,
	board: readonly Card[],
	action: RangeAction,
	size: number
): ComboRange {
	const view = rankRange(range, board);
	const toCome = 5 - board.length;
	const out = new Float64Array(COMBO_COUNT);
	let likelihood: Float64Array;

	if (action === 'bet' || action === 'raise') {
		likelihood = aggression(view, action === 'raise', size, toCome);
	} else if (action === 'call') {
		likelihood = continuing(view, size, toCome);
		// The very top raises some of the time, and so calls less.
		for (let i = 0; i < COMBO_COUNT; i++) {
			if (view.range[i] > 0 && view.percentile[i] >= 1 - RAISE_TOP) likelihood[i] = 0.6;
		}
	} else {
		const bets = aggression(view, false, 0.6, toCome);
		likelihood = bets.map((p) => 1 - p);
	}

	for (let i = 0; i < COMBO_COUNT; i++) out[i] = range[i] * likelihood[i];
	return out;
}

export interface BetResponse {
	/** How much of the range folds. */
	foldShare: number;
	/** What is left of it. */
	continues: ComboRange;
}

/** How a range answers a bet of `size` pots. */
export function responseToBet(
	range: ComboRange,
	board: readonly Card[],
	size: number
): BetResponse {
	const view = rankRange(range, board);
	const likelihood = continuing(view, size, 5 - board.length);
	const continues = new Float64Array(COMBO_COUNT);
	let total = 0;
	let kept = 0;
	for (let i = 0; i < COMBO_COUNT; i++) {
		continues[i] = range[i] * likelihood[i];
		total += range[i];
		kept += continues[i];
	}
	return { foldShare: total > 0 ? 1 - kept / total : 1, continues };
}

/** The size of a step's bet or raise, or of the bet a call faced, in pots. */
export function sizeOf(step: Step): number {
	const { action } = step;
	if (action.kind === 'bet')
		return clamp(action.amount / Math.max(1, step.potBefore), 0.1, 3);
	if (action.kind === 'raise') {
		const pot = step.potBefore + step.toCall;
		return clamp((action.amount - step.toCall) / Math.max(1, pot), 0.1, 3);
	}
	return clamp(step.toCall / Math.max(1, step.potBefore - step.toCall), 0.1, 3);
}

/**
 * A player's range just before the action at `beforeIndex`: their preflop
 * range, narrowed by each postflop action they have taken since. `known` are
 * cards the range cannot hold -- the board is removed as it comes.
 */
export function rangeAt(
	replay: Replay,
	player: string,
	beforeIndex: number,
	known: readonly Card[] = []
): ComboRange {
	let range = removeDead(toComboRange(preflopRange(replay, player)), known);
	for (const step of replay.steps) {
		if (step.index >= beforeIndex) break;
		if (step.street === 'preflop' || step.action.player !== player) continue;
		const { kind } = step.action;
		if (kind !== 'bet' && kind !== 'raise' && kind !== 'call' && kind !== 'check')
			continue;
		range = applyAction(removeDead(range, step.board), step.board, kind, sizeOf(step));
	}
	return range;
}

/** Where a hand stands in a range on a board: the share of it the hand beats. */
export function standingIn(
	range: ComboRange,
	hole: readonly Card[],
	board: readonly Card[]
): number {
	const mine = evaluate([...board, ...hole]);
	const cards: Card[] = [...board, 0, 0];
	let below = 0;
	let total = 0;
	for (let i = 0; i < COMBO_COUNT; i++) {
		if (range[i] <= 0) continue;
		cards[board.length] = COMBOS[i].a;
		cards[board.length + 1] = COMBOS[i].b;
		const theirs = evaluate(cards);
		total += range[i];
		if (theirs < mine) below += range[i];
		else if (theirs === mine) below += range[i] / 2;
	}
	return total > 0 ? below / total : 0.5;
}
