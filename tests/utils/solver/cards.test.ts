import { describe, expect, it } from 'vitest';

import { COMBO_COUNT, COMBOS, comboIndex } from '#utils/cards/combos';
import {
	COMBO_OF,
	fromSolverOrder,
	SOLVER_OF,
	solverIndex,
	toSolverOrder,
} from '#utils/solver/cards';

describe('the solver card mapping', () => {
	describe('solverIndex', () => {
		it('numbers the pairs from the lowest card up', () => {
			expect(solverIndex(0, 1)).toBe(0);
			expect(solverIndex(0, 51)).toBe(50);
			expect(solverIndex(1, 2)).toBe(51);
			expect(solverIndex(50, 51)).toBe(COMBO_COUNT - 1);
		});

		it('does not care which card comes first', () => {
			expect(solverIndex(51, 3)).toBe(solverIndex(3, 51));
		});
	});

	describe('the two orders', () => {
		it('pair every combo with one solver index, all different', () => {
			expect(SOLVER_OF).toHaveLength(COMBO_COUNT);
			expect(new Set(SOLVER_OF).size).toBe(COMBO_COUNT);
			expect(Math.min(...SOLVER_OF)).toBe(0);
			expect(Math.max(...SOLVER_OF)).toBe(COMBO_COUNT - 1);
		});

		it('round-trip a combo through the solver and back', () => {
			for (let i = 0; i < COMBO_COUNT; i++) {
				expect(COMBO_OF[SOLVER_OF[i]]).toBe(i);
			}
		});

		it('round-trip a pair of cards through both indexes', () => {
			for (const { a, b } of COMBOS) {
				expect(COMBOS[COMBO_OF[solverIndex(a, b)]]).toMatchObject({ a, b });
				expect(COMBO_OF[solverIndex(b, a)]).toBe(comboIndex(a, b));
			}
		});
	});

	describe('arrays', () => {
		it('move a value with its combo and back', () => {
			const values = COMBOS.map((_, i) => i + 1);
			const there = toSolverOrder(values);
			const target = comboIndex(40, 7);
			expect(there[solverIndex(40, 7)]).toBe(target + 1);
			expect(fromSolverOrder(there)).toEqual(values);
		});
	});
});
