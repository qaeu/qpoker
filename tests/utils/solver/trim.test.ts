import { describe, expect, it } from 'vitest';

import { COMBOS, classFromName, combosOfClass } from '#utils/cards/combos';
import { parseCards } from '#utils/cards/cards';
import { SOLVER_OF, solverIndex } from '#utils/solver/cards';
import { trimInput, TRIM_LADDER, MAX_TRIM } from '#utils/solver/trim';
import { solverSpot } from '#utils/solver/spot';
import { presetOf } from '#utils/solver/tree';
import type { WasmInput } from '#utils/solver/wasmApi';

import { RIVER_HERO_CALL } from '../history/handText';
import { replayOf, stepOf } from './spots';

const spot = () => {
	const found = solverSpot(
		replayOf(RIVER_HERO_CALL),
		stepOf(RIVER_HERO_CALL, 'river', 'check'),
		presetOf('simple')
	);
	if (!found.ok) throw new Error(found.message);
	return found.spot;
};

const mass = (range: readonly number[]) => range.reduce((sum, w) => sum + w, 0);
const live = (range: readonly number[]) => range.filter((w) => w > 0).length;

/** The weight of one class in a range. */
const classMass = (range: readonly number[], name: string) =>
	combosOfClass(classFromName(name)).reduce(
		(sum, { a, b }) => sum + range[solverIndex(a, b)],
		0
	);

describe('trimInput', () => {
	describe('how much it takes', () => {
		it.each(TRIM_LADDER)('takes about %s of each range’s weight', (share) => {
			const { input } = spot();
			const { input: trimmed, trim } = trimInput(input, share, 0);
			for (const side of ['oopRange', 'ipRange'] as const) {
				const cut = 1 - mass(trimmed[side]) / mass(input[side]);
				expect(cut).toBeGreaterThanOrEqual(share);
				// It stops at the first class past the share: one class of a range over.
				expect(cut).toBeLessThan(share + 0.08);
			}
			expect(trim.share).toBe(share);
			expect(trim.oop).toBe(live(input.oopRange) - live(trimmed.oopRange));
			expect(trim.ip).toBe(live(input.ipRange) - live(trimmed.ipRange));
		});

		it('takes more at the deeper rung', () => {
			const { input } = spot();
			const first = trimInput(input, TRIM_LADDER[0], 0).trim;
			const last = trimInput(input, MAX_TRIM, 0).trim;
			expect(last.oop + last.ip).toBeGreaterThan(first.oop + first.ip);
		});
	});

	describe('what it takes', () => {
		it('takes whole classes, so the ranges keep their suit symmetry', () => {
			const { input } = spot();
			const { input: trimmed } = trimInput(input, MAX_TRIM, 0);
			for (const side of ['oopRange', 'ipRange'] as const) {
				const kept = new Map<number, boolean>();
				COMBOS.forEach(({ cls }, i) => {
					const j = SOLVER_OF[i];
					if (input[side][j] <= 0) return;
					const now = trimmed[side][j] > 0;
					expect(kept.get(cls) ?? now).toBe(now);
					kept.set(cls, now);
				});
			}
		});

		it('takes the lightest classes before heavier ones', () => {
			const board = parseCards('Ks Qs 7d 4h 2c');
			const range = new Array<number>(1326).fill(0);
			const set = (name: string, weight: number) => {
				for (const { a, b } of combosOfClass(classFromName(name))) {
					if (![a, b].some((card) => board.includes(card))) {
						range[solverIndex(a, b)] = weight;
					}
				}
			};
			for (const name of ['AA', 'JJ', 'T9s', '65s', '98o']) set(name, 1);
			set('A5s', 0.2);
			const input = { board, oopRange: range, ipRange: range } as WasmInput;
			const { input: trimmed } = trimInput(input, 0.02, 0);
			expect(classMass(trimmed.oopRange, 'A5s')).toBe(0);
			expect(classMass(trimmed.oopRange, 'AA')).toBeGreaterThan(0);
		});

		it('never takes the hero’s class', () => {
			const { input, heroCombo } = spot();
			const heroClass = COMBOS[heroCombo].cls;
			const { input: trimmed } = trimInput(input, MAX_TRIM, heroClass);
			const pair = SOLVER_OF[heroCombo];
			const side = spot().side === 0 ? 'oopRange' : 'ipRange';
			expect(trimmed[side][pair]).toBe(input[side][pair]);
		});

		it('is a pure function of its input', () => {
			const { input } = spot();
			expect(trimInput(input, MAX_TRIM, 0)).toEqual(trimInput(input, MAX_TRIM, 0));
		});
	});
});
