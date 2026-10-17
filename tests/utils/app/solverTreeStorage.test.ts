import { describe, expect, it, vi } from 'vitest';

import {
	loadSolveTarget,
	loadTreePreference,
	saveSolveTarget,
	saveTreePreference,
} from '#utils/app/storage';
import { presetOf } from '#utils/solver/tree';

const KEY = 'qpoker:solverTree';

describe('the stored solver tree', () => {
	it('is the standard tree until the viewer chooses', () => {
		expect(loadTreePreference()).toEqual({
			preset: 'standard',
			tree: presetOf('standard'),
		});
	});

	it('comes back as it was saved', () => {
		const tree = presetOf('detailed');
		tree.river.bet = [0.4, 0.9];
		saveTreePreference({ preset: 'custom', tree });
		expect(loadTreePreference()).toEqual({ preset: 'custom', tree });
		expect(JSON.parse(localStorage.getItem(KEY)!).version).toBe(1);
	});

	it('reads a named preset as it is now, not as it was saved', () => {
		const old = { ...presetOf('detailed'), raiseCap: 3, addAllIn: true };
		localStorage.setItem(
			KEY,
			JSON.stringify({ version: 1, preset: 'detailed', tree: old })
		);
		expect(loadTreePreference()).toEqual({
			preset: 'detailed',
			tree: presetOf('detailed'),
		});
	});

	describe('a value it cannot use', () => {
		it.each([
			['not JSON', '{'],
			['not an object', '42'],
			[
				'another schema',
				JSON.stringify({ version: 99, preset: 'simple', tree: presetOf('simple') }),
			],
			[
				'an unknown preset',
				JSON.stringify({ version: 1, preset: 'huge', tree: presetOf('simple') }),
			],
			[
				'a tree that does not hold up',
				JSON.stringify({
					version: 1,
					preset: 'custom',
					tree: { ...presetOf('simple'), raiseCap: -3 },
				}),
			],
			[
				'a tree with parts missing',
				JSON.stringify({ version: 1, preset: 'custom', tree: {} }),
			],
		])('falls back to the standard tree for %s', (_, stored) => {
			localStorage.setItem(KEY, stored);
			expect(loadTreePreference().preset).toBe('standard');
		});
	});

	describe('storage that throws', () => {
		it('neither reads nor writes', () => {
			const broken = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
				throw new Error('denied');
			});
			const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
				throw new Error('denied');
			});
			expect(loadTreePreference().preset).toBe('standard');
			expect(() => saveTreePreference(loadTreePreference())).not.toThrow();
			broken.mockRestore();
			write.mockRestore();
		});
	});
});

describe('the stored solve target', () => {
	const TARGET_KEY = 'qpoker:solverTarget';

	it('is 0.5% of the pot until the viewer chooses', () => {
		expect(loadSolveTarget()).toBe(0.5);
	});

	it('comes back as it was saved', () => {
		saveSolveTarget(0.2);
		expect(loadSolveTarget()).toBe(0.2);
		expect(JSON.parse(localStorage.getItem(TARGET_KEY)!).version).toBe(1);
	});

	it.each([
		['not JSON', '{'],
		['another schema', JSON.stringify({ version: 99, pct: 0.2 })],
		['out of bounds', JSON.stringify({ version: 1, pct: 40 })],
		['not a number', JSON.stringify({ version: 1, pct: '0.2' })],
	])('falls back to the default for %s', (_, stored) => {
		localStorage.setItem(TARGET_KEY, stored);
		expect(loadSolveTarget()).toBe(0.5);
	});
});
