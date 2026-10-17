import { describe, expect, it } from 'vitest';

import {
	DEFAULT_PRESET,
	estimateTree,
	presetOf,
	TREE_PRESETS,
	treeKey,
	validateTree,
	wasmSizes,
	withActualSizes,
} from '#utils/solver/tree';

describe('the solver tree', () => {
	describe('presets', () => {
		it('are all valid', () => {
			for (const preset of Object.values(TREE_PRESETS)) {
				expect(validateTree(preset)).toEqual([]);
			}
		});

		it('hand out copies, so an edit does not change the preset', () => {
			const tree = presetOf(DEFAULT_PRESET);
			tree.river.bet.push(9);
			expect(TREE_PRESETS[DEFAULT_PRESET].river.bet).not.toContain(9);
		});

		it('each hold the one before it', () => {
			const order = [presetOf('simple'), presetOf('standard'), presetOf('detailed')];
			for (let i = 1; i < order.length; i++) {
				const [smaller, larger] = [order[i - 1], order[i]];
				for (const street of ['flop', 'turn', 'river'] as const) {
					expect(larger[street].bet.length).toBeGreaterThanOrEqual(
						smaller[street].bet.length
					);
				}
				expect(larger.raiseCap).toBeGreaterThanOrEqual(smaller.raiseCap);
			}
		});

		it('add no all-in at every node, which multiplies a flop', () => {
			for (const preset of Object.values(TREE_PRESETS))
				expect(preset.addAllIn).toBe(false);
		});

		it('grow from simple to detailed', () => {
			const size = (tree: ReturnType<typeof presetOf>) =>
				estimateTree(tree, 'flop', { oop: 700, ip: 700 }).bytes;
			expect(size(presetOf('simple'))).toBeLessThan(size(presetOf('standard')));
			expect(size(presetOf('standard'))).toBeLessThan(size(presetOf('detailed')));
		});
	});

	describe('validation', () => {
		it('refuses a bet of nothing or a raise of one times', () => {
			const tree = presetOf('standard');
			tree.river.bet = [0];
			tree.turn.raise = [1];
			const problems = validateTree(tree);
			expect(problems).toHaveLength(2);
			expect(problems.join(' ')).toMatch(/river bet/);
			expect(problems.join(' ')).toMatch(/turn raise/);
		});

		it('refuses a street nobody could bet on', () => {
			const tree = presetOf('simple');
			tree.flop.bet = [];
			expect(validateTree(tree).join(' ')).toMatch(/flop has no bet size/);
			tree.addAllIn = true;
			expect(validateTree(tree)).toEqual([]);
		});

		it('refuses too many sizes, a fractional cap and a threshold off the scale', () => {
			const tree = presetOf('standard');
			tree.river.bet = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
			tree.raiseCap = 1.5;
			tree.allInThreshold = 2;
			expect(validateTree(tree)).toHaveLength(3);
		});

		it('refuses a number that is not one', () => {
			const tree = presetOf('standard');
			tree.river.bet = [Number.NaN];
			expect(validateTree(tree).length).toBeGreaterThan(0);
		});
	});

	describe('wasmSizes', () => {
		it('writes the solver’s syntax, sorted and without repeats', () => {
			expect(wasmSizes({ bet: [0.75, 0.33, 0.75], raise: [3, 2.5] })).toEqual({
				bet: '33%, 75%',
				raise: '2.5x, 3x',
			});
		});
	});

	describe('withActualSizes', () => {
		it('adds the sizes bet on the line as a share of the pot', () => {
			const tree = presetOf('simple');
			const next = withActualSizes(tree, 'river', [
				{ kind: 'bet', to: 400, before: 0, facing: 0, pot: 500 },
			]);
			expect(next.river.bet).toEqual([0.66, 0.8]);
			expect(tree.river.bet).toEqual([0.66]);
		});

		it('adds a raise as a multiple of the bet it answers', () => {
			const next = withActualSizes(presetOf('simple'), 'turn', [
				{ kind: 'bet', to: 100, before: 0, facing: 0, pot: 200 },
				{ kind: 'raise', to: 350, before: 0, facing: 100, pot: 300 },
			]);
			expect(next.turn.raise).toEqual([2.5, 3.5]);
			expect(next.turn.bet).toContain(0.5);
		});

		it('leaves checks, calls and sizes already there alone', () => {
			const tree = presetOf('simple');
			const next = withActualSizes(tree, 'river', [
				{ kind: 'check' },
				{ kind: 'bet', to: 66, before: 0, facing: 0, pot: 100 },
			]);
			expect(next).toEqual(tree);
		});

		it('does nothing for a preflop line', () => {
			const tree = presetOf('simple');
			expect(withActualSizes(tree, 'preflop', [{ kind: 'bet', to: 5, pot: 3 }])).toBe(
				tree
			);
		});
	});

	describe('treeKey', () => {
		it('is the same for the same tree however its sizes are ordered', () => {
			const a = presetOf('standard');
			const b = presetOf('standard');
			b.river.bet = [...b.river.bet].reverse();
			expect(treeKey(a)).toBe(treeKey(b));
		});

		it('differs when a setting does', () => {
			const a = presetOf('standard');
			const b = presetOf('standard');
			b.raiseCap += 1;
			expect(treeKey(a)).not.toBe(treeKey(b));
		});
	});

	describe('estimateTree', () => {
		const ranges = { oop: 700, ip: 700 };

		it('counts a river as a small fraction of a flop', () => {
			const tree = presetOf('simple');
			expect(estimateTree(tree, 'river', ranges).bytes * 100).toBeLessThan(
				estimateTree(tree, 'flop', ranges).bytes
			);
		});

		it('halves under compression', () => {
			const estimate = estimateTree(presetOf('standard'), 'turn', ranges);
			expect(estimate.bytesCompressed).toBe(estimate.bytes / 2);
		});

		describe('at the last rung', () => {
			it('stores less than 16-bit alone when a river follows the root', () => {
				const estimate = estimateTree(presetOf('standard'), 'flop', ranges);
				expect(estimate.bytesSmallest).toBeLessThan(estimate.bytesCompressed / 2);
			});

			it('is 16-bit alone for a river root, which is never bucketed', () => {
				const estimate = estimateTree(presetOf('standard'), 'river', ranges);
				expect(estimate.bytesSmallest).toBe(estimate.bytesCompressed);
			});
		});

		it('grows with the raise cap', () => {
			const low = presetOf('standard');
			const high = presetOf('standard');
			high.raiseCap = low.raiseCap + 1;
			expect(estimateTree(high, 'river', ranges).nodes).toBeGreaterThan(
				estimateTree(low, 'river', ranges).nodes
			);
		});
	});
});
