/**
 * Trims both ranges of a solve that does not fit the memory budget even at
 * 16-bit: the rungs of the ladder after compression. A rung takes away about a
 * share of each range's weight, in whole hand classes (taking single combos
 * would break the suit symmetry the solver merges runouts by, and cost memory),
 * the lowest-weight classes first and, among classes of a weight, an even spread
 * of strength, so the range keeps its shape. The hero's own class is never
 * taken. See docs/solver.md.
 */

import type { Card } from '../cards/cards';
import { COMBOS } from '../cards/combos';
import { evaluate } from '../cards/evaluate';
import { SOLVER_OF } from './cards';
import type { WasmInput } from './wasmApi';

/** The trims tried, in order, as a share of each range's weight. */
export const TRIM_LADDER: readonly number[] = [0.1, 0.25];

/** The deepest trim: the most a solve's ranges lose. */
export const MAX_TRIM = TRIM_LADDER[TRIM_LADDER.length - 1];

/** What a trim took: its rung, and the combos each side lost. */
export interface SolveTrim {
	share: number;
	oop: number;
	ip: number;
}

interface ClassMass {
	cls: number;
	mass: number;
	combos: number;
	/** Mean of the class's combos' strength rank in the range, 0 to 1. */
	strength: number;
}

/** A low-discrepancy key: any prefix of indices sorted by it spreads evenly. */
const spread = (index: number): number => (index * 0.6180339887498949) % 1;

/** A range's live classes, with their weight and strength on `board`. */
function classesOf(range: readonly number[], board: readonly Card[]): ClassMass[] {
	const live = COMBOS.flatMap(({ a, b, cls }, i) => {
		const weight = range[SOLVER_OF[i]];
		return weight > 0 ? [{ cls, weight, value: evaluate([...board, a, b]) }] : [];
	});
	const ranked = [...live].sort((x, y) => x.value - y.value);
	const classes = new Map<number, ClassMass>();
	ranked.forEach(({ cls, weight }, rank) => {
		const entry = classes.get(cls) ?? { cls, mass: 0, combos: 0, strength: 0 };
		entry.mass += weight;
		entry.combos += 1;
		entry.strength += rank / Math.max(1, ranked.length - 1);
		classes.set(cls, entry);
	});
	for (const entry of classes.values()) entry.strength /= entry.combos;
	return [...classes.values()];
}

/**
 * The classes to take from a range for `share` of its weight: by mean weight a
 * combo, lowest first; within a weight, strength-sorted and taken in an even
 * spread. Stops at the first class that reaches the share.
 */
function classesToTrim(
	range: readonly number[],
	board: readonly Card[],
	share: number,
	keep: number
): Set<number> {
	const all = classesOf(range, board);
	const total = all.reduce((sum, entry) => sum + entry.mass, 0);
	const classes = all.filter((entry) => entry.cls !== keep);
	const tier = (entry: ClassMass) => Math.round((entry.mass / entry.combos) * 100);
	const tiers = new Map<number, ClassMass[]>();
	for (const entry of classes)
		tiers.set(tier(entry), [...(tiers.get(tier(entry)) ?? []), entry]);

	const order = [...tiers.keys()]
		.sort((a, b) => a - b)
		.flatMap((key) =>
			tiers
				.get(key)!
				.sort((a, b) => a.strength - b.strength || a.cls - b.cls)
				.map((entry, i) => ({ entry, key: spread(i) }))
				.sort((a, b) => a.key - b.key)
				.map(({ entry }) => entry)
		);

	const taken = new Set<number>();
	let mass = 0;
	for (const entry of order) {
		if (mass >= share * total) break;
		taken.add(entry.cls);
		mass += entry.mass;
	}
	return taken;
}

/** One range with `taken`'s classes zeroed, and how many combos that removed. */
function without(range: readonly number[], taken: Set<number>): [number[], number] {
	const out = [...range];
	let removed = 0;
	COMBOS.forEach(({ cls }, i) => {
		const j = SOLVER_OF[i];
		if (taken.has(cls) && out[j] > 0) {
			out[j] = 0;
			removed++;
		}
	});
	return [out, removed];
}

/**
 * The input with both ranges trimmed by `share` of their weight, keeping the
 * hero's class (`heroClass`) wherever it is held.
 */
export function trimInput(
	input: WasmInput,
	share: number,
	heroClass: number
): { input: WasmInput; trim: SolveTrim } {
	const [oopRange, oop] = without(
		input.oopRange,
		classesToTrim(input.oopRange, input.board, share, heroClass)
	);
	const [ipRange, ip] = without(
		input.ipRange,
		classesToTrim(input.ipRange, input.board, share, heroClass)
	);
	return { input: { ...input, oopRange, ipRange }, trim: { share, oop, ip } };
}
