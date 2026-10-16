/**
 * The solver's pair index and qpoker's `COMBOS` order are two numberings of the
 * same 1326 two-card hands. The card ids are identical (`rank * 4 + suit`); a
 * pair `c1 < c2` is at `c1 * (101 - c1) / 2 + c2 - 1` in the solver, and
 * `COMBOS` runs the higher card down from 51. See `wasmApi.ts`.
 */

import type { Card } from '../cards/cards';
import { COMBO_COUNT, COMBOS } from '../cards/combos';

/** The solver's index of the pair `x`, `y` in either order. */
export function solverIndex(x: Card, y: Card): number {
	const low = Math.min(x, y);
	const high = Math.max(x, y);
	return (low * (101 - low)) / 2 + high - 1;
}

/** `SOLVER_OF[i]` is the solver's index of `COMBOS[i]`. */
export const SOLVER_OF: readonly number[] = COMBOS.map(({ a, b }) => solverIndex(a, b));

/** `COMBO_OF[j]` is the index into `COMBOS` of the solver's pair `j`. */
export const COMBO_OF: readonly number[] = (() => {
	const out = new Array<number>(COMBO_COUNT).fill(-1);
	SOLVER_OF.forEach((solver, combo) => (out[solver] = combo));
	return out;
})();

/** A per-combo array in `COMBOS` order, as the solver's per-pair one. */
export function toSolverOrder(values: ArrayLike<number>): number[] {
	const out = new Array<number>(COMBO_COUNT).fill(0);
	for (let i = 0; i < COMBO_COUNT; i++) out[SOLVER_OF[i]] = values[i];
	return out;
}

/** A solver's per-pair array, as one in `COMBOS` order. */
export function fromSolverOrder(values: ArrayLike<number>): number[] {
	const out = new Array<number>(COMBO_COUNT).fill(0);
	for (let i = 0; i < COMBO_COUNT; i++) out[i] = values[SOLVER_OF[i]];
	return out;
}
