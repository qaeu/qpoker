/**
 * The real solver, as the WASM (`npm run build:solver`) and as the CLI's native
 * process (`npm run build:solver:native`). Each engine's cases skip until it is
 * built, and are the proof that the Rust side keeps the contract in
 * `wasmApi.ts`: a game with a known answer, and a hand run end to end.
 */

import { describe, expect, it } from 'vitest';

import { nativeSolver, nativeSolverBuilt } from '../../../src/cli/solverNative';
import { loadNodeSolver, solverBuilt } from '../../../src/cli/solverNode';
import { parseCards } from '#utils/cards/cards';
import { COMBO_COUNT } from '#utils/cards/combos';
import { presetOf } from '#utils/solver/tree';
import { solverIndex } from '#utils/solver/cards';
import type {
	SolverHandle,
	SolverModule,
	WasmInput,
	WasmQuery,
} from '#utils/solver/wasmApi';
import {
	handleSolverMessage,
	type SolverWorkerResponse,
} from '#utils/solverWorkerProtocol';

import { handText, RIVER_HERO_CALL } from '../history/handText';

/** The pairs of two ranks, as the solver numbers them, at weight 1. */
function pairs(rank: string, range: number[]): void {
	const suits = ['c', 'd', 'h', 's'];
	for (const [i, first] of suits.entries()) {
		for (const second of suits.slice(i + 1)) {
			const [a, b] = parseCards(`${rank}${first} ${rank}${second}`);
			range[solverIndex(a, b)] = 1;
		}
	}
}

const empty = () => new Array<number>(COMBO_COUNT).fill(0);

/** Iterates until the solve is this close to equilibrium, in cents of the pot. */
async function converge(handle: SolverHandle, target: number): Promise<number> {
	let exploitability = Infinity;
	for (let iteration = 0; iteration < 5000 && exploitability > target; iteration += 20) {
		exploitability = await handle.step(20);
	}
	return exploitability;
}

const ENGINES: { name: string; built: boolean; load: () => Promise<SolverModule> }[] = [
	{ name: 'the WASM', built: solverBuilt(), load: loadNodeSolver },
	{
		name: 'the native process',
		built: nativeSolverBuilt(),
		load: async () => nativeSolver(),
	},
];

describe.each(ENGINES)('the solver, as $name', ({ built, load }) => {
	if (!built) return void it.skip('is not built');

	describe('the polar river game', () => {
		// The out-of-position player holds one bluff-catcher (jacks); the other bets
		// the nuts (aces) or a bluff (fives) into a pot of 100, one size of 100.
		// With s = 1 the bluffs are s / (1 + 2s) of the bets and the catcher calls
		// 1 / (1 + s), a half.
		const S = 1;
		const input = (prefix: WasmInput['prefix']): WasmInput => {
			const oop = empty();
			const ip = empty();
			pairs('J', oop);
			pairs('A', ip);
			pairs('5', ip);
			return {
				board: parseCards('Ks Qs 7d 4h 2c'),
				oopRange: oop,
				ipRange: ip,
				pot: 100,
				stack: 1000,
				rakeRate: 0,
				rakeCap: 0,
				river: { bet: `${S * 100}%`, raise: '' },
				raiseCap: 0,
				allInThreshold: 0,
				addAllIn: false,
				prefix,
			};
		};
		const queryAfter = async (prefix: WasmInput['prefix']): Promise<WasmQuery> => {
			const module = await load();
			const handle = await module.createSolver(JSON.stringify(input(prefix)));
			try {
				await handle.allocate(false);
				expect(await converge(handle, 0.05)).toBeLessThanOrEqual(0.05);
				return JSON.parse(await handle.query()) as WasmQuery;
			} finally {
				handle.free();
			}
		};
		const frequency = (query: WasmQuery, action: number, a: string, b: string) =>
			query.strategy[
				action * COMBO_COUNT
					+ solverIndex(...(parseCards(`${a} ${b}`) as [number, number]))
			];

		it('bluffs s / (1 + 2s) of its bets, within 1%', async () => {
			const query = await queryAfter([{ kind: 'check' }]);
			expect(query.player).toBe(1);
			const bet = query.actions.findIndex((action) => action.kind === 'bet');
			const aces = frequency(query, bet, 'Ac', 'Ad');
			const fives = frequency(query, bet, '5c', '5d');
			expect(aces).toBeGreaterThan(0.99);
			// Six combos of each: the bluffs' share of all the bets.
			const bluffShare = fives / (aces + fives);
			expect(Math.abs(bluffShare - S / (1 + 2 * S))).toBeLessThan(0.01);
		});

		it('calls 1 / (1 + s) with its bluff-catcher, within 1%', async () => {
			const query = await queryAfter([{ kind: 'check' }, { kind: 'bet', to: S * 100 }]);
			expect(query.player).toBe(0);
			const call = query.actions.findIndex((action) => action.kind === 'call');
			expect(Math.abs(frequency(query, call, 'Jc', 'Jd') - 1 / (1 + S))).toBeLessThan(
				0.01
			);
		});
	});

	describe('a hand end to end', () => {
		const solve = async (stepIndex: number) => {
			const module = await load();
			const response = await new Promise<SolverWorkerResponse>((resolve) =>
				handleSolverMessage(
					{
						type: 'solve',
						requestId: 1,
						raw: handText(RIVER_HERO_CALL),
						stepIndex,
						tree: presetOf('simple'),
						rake: 0.04,
						budgetMb: 1500,
					},
					(message) => {
						if (message.type === 'complete' || message.type === 'error') resolve(message);
					},
					async () => module
				)
			);
			expect(response.type).toBe('complete');
			if (response.type !== 'complete') throw new Error('not solved');
			return response.result;
		};

		it('solves the river check at the root, where every hand is reached', async () => {
			const result = await solve(12);
			expect(result.reached).toBe(true);
			expect(result.actions.map((row) => row.kind)).toContain('check');
			expect(result.actions.reduce((sum, row) => sum + row.frequency, 0)).toBeCloseTo(
				1,
				3
			);
			expect(result.chosen).toBe(result.actions.findIndex((row) => row.kind === 'check'));
			expect(result.evGapBb).not.toBeNull();
			expect(result.evGapBb!).toBeLessThanOrEqual(0);
			expect(result.exploitabilityPct).toBeLessThan(2);
		}, 60_000);

		it('walks to the call after a check and a bet, with figures for a hand not reached', async () => {
			const result = await solve(14);
			expect(result.actions.map((row) => row.kind)).toContain('call');
			expect(result.facing).toBe(true);
			// The equilibrium never checks five-four here, yet the hand keeps its figures.
			expect(result.reached).toBe(false);
			expect(result.actions.reduce((sum, row) => sum + row.frequency, 0)).toBeCloseTo(
				1,
				3
			);
			expect(result.equity).toBeGreaterThan(0);
		}, 60_000);
	});
});

describe.skipIf(!solverBuilt() || !nativeSolverBuilt())('the two engines', () => {
	const solve = async (module: SolverModule) => {
		const response = await new Promise<SolverWorkerResponse>((resolve) =>
			handleSolverMessage(
				{
					type: 'solve',
					requestId: 1,
					raw: handText(RIVER_HERO_CALL),
					stepIndex: 12,
					tree: presetOf('simple'),
					rake: 0.04,
					budgetMb: 1500,
				},
				(message) => {
					if (message.type === 'complete' || message.type === 'error') resolve(message);
				},
				async () => module
			)
		);
		if (response.type !== 'complete') throw new Error('not solved');
		return response.result;
	};

	it('agree on a solve, to rounding', async () => {
		const wasm = await solve(await loadNodeSolver());
		const native = await solve(nativeSolver());
		expect(native.iterations).toBe(wasm.iterations);
		expect(native.actions.map((row) => row.kind)).toEqual(
			wasm.actions.map((row) => row.kind)
		);
		native.actions.forEach((row, i) => {
			expect(row.frequency).toBeCloseTo(wasm.actions[i].frequency, 3);
			expect(row.evBb).toBeCloseTo(wasm.actions[i].evBb, 2);
		});
	}, 60_000);

	it('refuse a tree they cannot build alike', async () => {
		const bad = JSON.stringify({ board: [0, 1], prefix: [] });
		const wasm = await loadNodeSolver();
		const reasons = await Promise.all(
			[wasm, nativeSolver()].map(async (module) => {
				try {
					await module.createSolver(bad);
					return 'built';
				} catch (error) {
					return error instanceof Error ? error.message : String(error);
				}
			})
		);
		expect(reasons[0]).toMatch(/Bad solver input/);
		expect(reasons[1]).toMatch(/Bad request|Bad solver input|missing field/);
	});
});
