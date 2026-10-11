/**
 * The two ways a starting hand is counted: as one of 169 classes (`AKs`, `77`,
 * `T9o`), which is how preflop charts are written, and as one of 1326 concrete
 * two-card combos, which is what a board interacts with.
 *
 * Classes are indexed as cells of the familiar 13x13 grid, `row * 13 + col`
 * with aces first: pairs on the diagonal, suited hands above it, offsuit below.
 */

import { makeCard, RANK_CHARS, rankOf, suitOf, type Card } from './cards';

export const CLASS_COUNT = 169;
export const COMBO_COUNT = 1326;

export interface Combo {
	/** The higher card, by rank and then suit. */
	a: Card;
	b: Card;
	/** The class the combo belongs to. */
	cls: number;
}

/** Grid cell of the class with ranks `hi >= lo` (0 deuce ... 12 ace). */
export function classIndex(hi: number, lo: number, suited: boolean): number {
	const row = 12 - Math.max(hi, lo);
	const col = 12 - Math.min(hi, lo);
	return row === col || suited ? row * 13 + col : col * 13 + row;
}

/** The class of two concrete cards. */
export function classOf(a: Card, b: Card): number {
	return classIndex(rankOf(a), rankOf(b), suitOf(a) === suitOf(b));
}

/** `AKs`, `77`, `T9o`. */
export function className(cls: number): string {
	const row = Math.floor(cls / 13);
	const col = cls % 13;
	const hi = RANK_CHARS[12 - Math.min(row, col)];
	const lo = RANK_CHARS[12 - Math.max(row, col)];
	return (
		row === col ? hi + lo
		: row < col ? hi + lo + 's'
		: hi + lo + 'o'
	);
}

/** The class named by `AKs` / `77` / `T9o`, or -1. */
export function classFromName(name: string): number {
	const hi = RANK_CHARS.indexOf(name[0]?.toUpperCase() ?? '');
	const lo = RANK_CHARS.indexOf(name[1]?.toUpperCase() ?? '');
	const tail = name.slice(2).toLowerCase();
	if (hi < 0 || lo < 0) return -1;
	if (hi === lo) return tail === '' ? classIndex(hi, lo, false) : -1;
	if (tail !== 's' && tail !== 'o') return -1;
	return classIndex(hi, lo, tail === 's');
}

/** How many combos a class holds: 6 for a pair, 4 suited, 12 offsuit. */
export function classSize(cls: number): number {
	const row = Math.floor(cls / 13);
	const col = cls % 13;
	return (
		row === col ? 6
		: row < col ? 4
		: 12
	);
}

/** All 1326 combos, in a fixed order every combo-indexed array shares. */
export const COMBOS: readonly Combo[] = (() => {
	const combos: Combo[] = [];
	for (let a = 51; a >= 1; a--) {
		for (let b = a - 1; b >= 0; b--) combos.push({ a, b, cls: classOf(a, b) });
	}
	return combos;
})();

/** Index into `COMBOS` of the combo holding these two cards, in either order. */
export function comboIndex(x: Card, y: Card): number {
	const a = Math.max(x, y);
	const b = Math.min(x, y);
	// Rows run a = 51 down to 1, row `a` holding `a` combos.
	const before = ((51 + a + 1) * (51 - a)) / 2;
	return before + (a - 1 - b);
}

/** The concrete combos of one class. */
export function combosOfClass(cls: number): Combo[] {
	const row = Math.floor(cls / 13);
	const col = cls % 13;
	const hi = 12 - Math.min(row, col);
	const lo = 12 - Math.max(row, col);
	const combos: Combo[] = [];
	for (let s = 0; s < 4; s++) {
		for (let t = 0; t < 4; t++) {
			if (row === col ? s <= t : row < col !== (s === t)) continue;
			const x = makeCard(hi, s);
			const y = makeCard(lo, t);
			combos.push({ a: Math.max(x, y), b: Math.min(x, y), cls });
		}
	}
	return combos;
}
