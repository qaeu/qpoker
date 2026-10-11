/**
 * A preflop range: one weight per hand class, 0 (never) to 1 (always), indexed
 * as the 13x13 grid in `cards/combos.ts`. A strategy is two of them -- how
 * often a hand raises and how often it calls -- with folding the remainder.
 */

import { CLASS_COUNT, classSize, COMBO_COUNT, COMBOS } from '../cards/combos';
import type { ComboRange } from '../cards/equity';

export type Range = Float64Array;

export interface Strategy {
	raise: Range;
	call: Range;
}

export type PreflopChoice = 'raise' | 'call' | 'fold';

export const emptyRange = (): Range => new Float64Array(CLASS_COUNT);

export const fullRange = (): Range => new Float64Array(CLASS_COUNT).fill(1);

/** Combos in the range, counting a half-weight class as half its combos. */
export function rangeCombos(range: Range): number {
	let total = 0;
	for (let cls = 0; cls < CLASS_COUNT; cls++) total += range[cls] * classSize(cls);
	return total;
}

/** The share of all 1326 starting hands the range holds. */
export const rangeFraction = (range: Range): number => rangeCombos(range) / COMBO_COUNT;

export function multiplyRanges(a: Range, b: Range): Range {
	const out = emptyRange();
	for (let cls = 0; cls < CLASS_COUNT; cls++) out[cls] = a[cls] * b[cls];
	return out;
}

/** How often each hand continues: raises plus calls. */
export function continueRange(strategy: Strategy): Range {
	const out = emptyRange();
	for (let cls = 0; cls < CLASS_COUNT; cls++) {
		out[cls] = Math.min(1, strategy.raise[cls] + strategy.call[cls]);
	}
	return out;
}

export function foldRange(strategy: Strategy): Range {
	const out = emptyRange();
	for (let cls = 0; cls < CLASS_COUNT; cls++) {
		out[cls] = Math.max(0, 1 - strategy.raise[cls] - strategy.call[cls]);
	}
	return out;
}

/** The frequency a strategy gives one choice with one hand. */
export function frequencyOf(
	strategy: Strategy,
	cls: number,
	choice: PreflopChoice
): number {
	if (choice === 'raise') return strategy.raise[cls];
	if (choice === 'call') return strategy.call[cls];
	return Math.max(0, 1 - strategy.raise[cls] - strategy.call[cls]);
}

/** Spreads class weights over the 1326 concrete combos. */
export function toComboRange(range: Range): ComboRange {
	const out = new Float64Array(COMBO_COUNT);
	for (let i = 0; i < COMBO_COUNT; i++) out[i] = range[COMBOS[i].cls];
	return out;
}
