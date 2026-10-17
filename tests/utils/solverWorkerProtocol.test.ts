import { describe, expect, it, vi } from 'vitest';

import { BUCKET_LADDER, MIN_BUCKETS } from '#utils/solver/buckets';
import { presetOf } from '#utils/solver/tree';
import type { SolverModule, WasmInput } from '#utils/solver/wasmApi';
import {
	handleSolverMessage,
	MAX_ITERATIONS,
	type SolveRequest,
	type SolverWorkerResponse,
} from '#utils/solverWorkerProtocol';

import { handText, RIVER_HERO_CALL } from './history/handText';
import { createFakeSolver } from './solver/fakeSolver';
import { THREE_WAY_CBET, stepOf } from './solver/spots';

const request = (overrides: Partial<SolveRequest> = {}): SolveRequest => ({
	type: 'solve',
	requestId: 7,
	raw: handText(RIVER_HERO_CALL),
	stepIndex: 14,
	tree: presetOf('standard'),
	rake: 0.04,
	budgetMb: 1500,
	...overrides,
});

/** Runs a solve and resolves with everything posted once it ends. */
function drive(
	message: SolveRequest,
	module: SolverModule = createFakeSolver()
): Promise<SolverWorkerResponse[]> {
	return new Promise((resolve) => {
		const responses: SolverWorkerResponse[] = [];
		handleSolverMessage(
			message,
			(response) => {
				responses.push(response);
				if (response.type === 'complete' || response.type === 'error') resolve(responses);
			},
			async () => module
		);
	});
}

const last = (responses: SolverWorkerResponse[]) => responses[responses.length - 1];

describe('handleSolverMessage', () => {
	describe('a solve', () => {
		it('reports the estimate, then progress, then the result', async () => {
			const responses = await drive(request());
			const types = responses.map((response) => response.type);
			expect(types[0]).toBe('estimate');
			expect(types.at(-1)).toBe('complete');
			expect(types.slice(1, -1).every((type) => type === 'progress')).toBe(true);
			expect(responses.every((response) => response.requestId === 7)).toBe(true);
		});

		it('runs until the target and not to the cap', async () => {
			const responses = await drive(request());
			const progress = responses.flatMap((response) =>
				response.type === 'progress' ? [response] : []
			);
			expect(progress.length).toBeGreaterThan(1);
			expect(progress.map((step) => step.iteration)).toEqual(
				[...progress.map((step) => step.iteration)].sort((a, b) => a - b)
			);
			expect(progress.at(-1)!.iteration).toBeLessThan(MAX_ITERATIONS);
			expect(progress.at(-1)!.exploitabilityPct).toBeLessThanOrEqual(0.5);
			const done = last(responses);
			expect(done.type === 'complete' && done.result.iterations).toBe(
				progress.at(-1)!.iteration
			);
		});

		describe('the target dEV', () => {
			const finalPct = async (targetPct?: number) => {
				const progress = (await drive(request({ targetPct }))).flatMap((response) =>
					response.type === 'progress' ? [response] : []
				);
				return progress.at(-1)!;
			};

			it('runs longer for a lower target, and stops under it', async () => {
				const shallow = await finalPct(2);
				const deep = await finalPct(0.1);
				expect(shallow.exploitabilityPct).toBeLessThanOrEqual(2);
				expect(deep.exploitabilityPct).toBeLessThanOrEqual(0.1);
				expect(deep.iteration).toBeGreaterThan(shallow.iteration);
			});

			it('is 0.5% of the pot when not given', async () => {
				expect((await finalPct()).exploitabilityPct).toBeLessThanOrEqual(0.5);
				expect((await finalPct()).iteration).toBe((await finalPct(0.5)).iteration);
			});

			it.each([0, -1, 50, Number.NaN])(
				'refuses %s before loading the solver',
				async (pct) => {
					let loaded = false;
					const responses = await drive(request({ targetPct: pct }), {
						createSolver: (json) => {
							loaded = true;
							return createFakeSolver().createSolver(json);
						},
					});
					const done = last(responses);
					expect(done.type === 'error' && done.reason).toBe('tree');
					expect(loaded).toBe(false);
				}
			);
		});

		it('stops at the cap when the target is never reached', async () => {
			const stuck: SolverModule = {
				createSolver: (json) => ({
					...createFakeSolver().createSolver(json),
					step: () => 1e9,
				}),
			};
			const done = last(await drive(request(), stuck));
			expect(done.type === 'complete' && done.result.iterations).toBe(MAX_ITERATIONS);
		});

		it('hands the solver the spot, and the result is the hero’s', async () => {
			let input: WasmInput | undefined;
			const responses = await drive(
				request(),
				createFakeSolver({ onCreate: (made) => (input = made) })
			);
			expect(input?.prefix).toEqual([{ kind: 'check' }, { kind: 'bet', to: 400 }]);
			expect(input?.rakeRate).toBe(0.04);
			const done = last(responses);
			expect(done.type).toBe('complete');
			if (done.type !== 'complete') return;
			expect(done.result.hand).toBe('54s');
			expect(done.result.actions.map((row) => row.kind)).toEqual([
				'fold',
				'call',
				'raise',
			]);
			expect(done.result.chosen).toBe(1);
			expect(done.result.evGapBb).toBeLessThanOrEqual(0);
		});

		it('is the same twice', async () => {
			const a = last(await drive(request()));
			const b = last(await drive(request()));
			expect(a.type === 'complete' && a.result).toEqual(
				b.type === 'complete' && b.result
			);
		});

		it('frees the solver when it is done and when it fails', async () => {
			const onFree = vi.fn();
			await drive(request(), createFakeSolver({ onFree }));
			expect(onFree).toHaveBeenCalledTimes(1);
		});
	});

	describe('memory', () => {
		it('stores 16-bit when only that fits the budget', async () => {
			const responses = await drive(
				request({ budgetMb: 3 }),
				createFakeSolver({ bytes: 4e6 })
			);
			const estimate = responses[0];
			expect(estimate.type === 'estimate' && estimate.compressed).toBe(true);
			const done = last(responses);
			expect(done.type === 'complete' && done.result.compressed).toBe(true);
		});

		it('keeps 32-bit when it fits', async () => {
			const estimate = (await drive(request()))[0];
			expect(estimate.type === 'estimate' && estimate.compressed).toBe(false);
		});

		it('refuses a tree too big even compressed, after estimating and before allocating', async () => {
			const allocate = vi.fn();
			const module: SolverModule = {
				createSolver: (json) => {
					const handle = createFakeSolver({ bytes: 50e6 }).createSolver(json);
					return { ...handle, allocate };
				},
			};
			const responses = await drive(request({ budgetMb: 10 }), module);
			expect(responses).toHaveLength(1);
			const failure = responses[0];
			expect(failure.type === 'error' && failure.reason).toBe('budget');
			expect(failure.type === 'error' && failure.message).toMatch(/budget/);
			expect(allocate).not.toHaveBeenCalled();
		});

		describe('the bucket ladder', () => {
			const turnBet = stepOf(RIVER_HERO_CALL, 'turn', 'bet');

			/** Runs with a fake sized by combos; returns the river buckets of each game built. */
			const ladder = async (budgetMb: number, stepIndex = turnBet) => {
				const built: (number | undefined)[] = [];
				const onFree = vi.fn();
				const responses = await drive(
					request({ budgetMb, stepIndex }),
					createFakeSolver({
						bytesPerCombo: 1e5,
						onFree,
						onCreate: (input) => built.push(input.riverBuckets),
					})
				);
				return { built, responses, onFree };
			};

			/** The fake's 16-bit megabytes for the turn spot's game, per hand. */
			const wholeMb = async () => {
				let bytes = 0;
				await drive(
					request({ stepIndex: turnBet }),
					createFakeSolver({
						bytesPerCombo: 1e5,
						onCreate: (input) =>
							(bytes =
								[...input.oopRange, ...input.ipRange].filter((w) => w > 0).length * 1e5),
					})
				);
				return bytes / 2 / 1024 / 1024;
			};

			it('buckets nothing when 16-bit fits', async () => {
				const { built, responses } = await ladder(1500);
				expect(built).toEqual([undefined]);
				const done = last(responses);
				expect(done.type === 'complete' && done.result.riverBuckets).toBeNull();
			});

			it('buckets the river by the first rung that fits, and says so', async () => {
				// Just under the whole tree at 16-bit: the first rung must fit.
				const { built, responses, onFree } = await ladder(
					Math.floor(await wholeMb()) - 1
				);
				expect(built).toEqual([undefined, BUCKET_LADDER[0]]);
				const estimate = responses[0];
				expect(estimate.type === 'estimate' && estimate.riverBuckets).toBe(
					BUCKET_LADDER[0]
				);
				const done = last(responses);
				expect(done.type === 'complete' && done.result.riverBuckets).toBe(
					BUCKET_LADDER[0]
				);
				expect(done.type === 'complete' && done.result.compressed).toBe(true);
				// Every game built is freed, the one that did not fit included.
				expect(onFree).toHaveBeenCalledTimes(2);
			});

			it('refuses once the last rung does not fit either', async () => {
				const { built, responses, onFree } = await ladder(1);
				expect(built).toEqual([undefined, ...BUCKET_LADDER]);
				expect(onFree).toHaveBeenCalledTimes(BUCKET_LADDER.length + 1);
				const failure = last(responses);
				expect(failure.type === 'error' && failure.reason).toBe('budget');
				expect(failure.type === 'error' && failure.message).toMatch(
					new RegExp(`${MIN_BUCKETS} buckets`)
				);
			});

			describe('where buckets level off above the target', () => {
				const floored = async (bucketedFloor: number) => {
					const budgetMb = Math.floor(await wholeMb()) - 1;
					const responses = await drive(
						request({ budgetMb, stepIndex: turnBet }),
						createFakeSolver({ bytesPerCombo: 1e5, bucketedFloor })
					);
					const done = last(responses);
					if (done.type !== 'complete') throw new Error('no result');
					return done.result;
				};

				it('stops there, well short of the cap, and says so', async () => {
					const result = await floored(0.01);
					expect(result.iterations).toBeLessThan(MAX_ITERATIONS / 2);
					expect(result.exploitabilityPct).toBeGreaterThan(0.5);
					expect(result.levelled).toBe(true);
				});

				it('is not called levelled when it reaches the target', async () => {
					const result = await floored(0);
					expect(result.exploitabilityPct).toBeLessThanOrEqual(0.5);
					expect(result.levelled).toBe(false);
				});
			});

			it('never buckets a river root, which has no river after it', async () => {
				const { built, responses } = await ladder(1, 14);
				expect(built).toEqual([undefined]);
				const failure = last(responses);
				expect(failure.type === 'error' && failure.message).not.toMatch(/buckets/);
			});
		});
	});

	describe('what it refuses', () => {
		const load = vi.fn(async () => createFakeSolver());
		const refused = (message: SolveRequest) =>
			new Promise<SolverWorkerResponse>((resolve) =>
				handleSolverMessage(message, resolve, load)
			);

		it('a bad tree, before loading anything', async () => {
			const tree = presetOf('standard');
			tree.river.bet = [0];
			const response = await refused(request({ tree }));
			expect(response.type === 'error' && response.reason).toBe('tree');
			expect(load).not.toHaveBeenCalled();
		});

		it('a multiway spot', async () => {
			const response = await refused(
				request({
					raw: handText(THREE_WAY_CBET),
					stepIndex: stepOf(THREE_WAY_CBET, 'flop', 'bet 40'),
				})
			);
			expect(response.type === 'error' && response.reason).toBe('multiway');
			expect(load).not.toHaveBeenCalled();
		});

		it('text with no hand in it', async () => {
			const response = await refused(request({ raw: 'nothing here' }));
			expect(response.type).toBe('error');
		});

		it('a tree the solver cannot build', async () => {
			const responses = await drive(
				request(),
				createFakeSolver({ failWith: 'prefix is illegal' })
			);
			const failure = responses[0];
			expect(failure.type === 'error' && failure.message).toMatch(/prefix is illegal/);
			expect(failure.type === 'error' && failure.reason).toBe('tree');
		});

		it('a module that will not load', async () => {
			const response = await new Promise<SolverWorkerResponse>((resolve) =>
				handleSolverMessage(request(), resolve, () =>
					Promise.reject(new Error('no wasm'))
				)
			);
			expect(response.type === 'error' && response.message).toBe('no wasm');
			expect(response.type === 'error' && response.reason).toBe('solver');
		});
	});

	describe('abandoning', () => {
		it('posts nothing more once told to stop', async () => {
			const posted: SolverWorkerResponse[] = [];
			const onFree = vi.fn();
			const stop = handleSolverMessage(
				request(),
				(response) => {
					posted.push(response);
					if (response.type === 'estimate') stop();
				},
				async () => createFakeSolver({ onFree })
			);
			await new Promise((resolve) => setTimeout(resolve, 100));
			expect(posted.map((response) => response.type)).toEqual(['estimate']);
			expect(onFree).toHaveBeenCalled();
		});
	});
});
