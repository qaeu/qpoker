import { describe, expect, it, vi } from 'vitest';

import { createSolveClient, type SolveRequestOptions } from '#utils/app/solveClient';
import type { SolveResult } from '#utils/solver/result';
import { presetOf } from '#utils/solver/tree';
import {
	handleSolverMessage,
	type SolverWorkerMessage,
} from '#utils/solverWorkerProtocol';
import { createMemoryStore } from '#utils/store/memoryStore';
import type { HandStore } from '#utils/store/types';

import { handText, RIVER_HERO_CALL } from '../history/handText';
import { createFakeSolver } from '../solver/fakeSolver';

/** A worker that runs the protocol in-process and records being terminated. */
function fakeWorker() {
	const listeners = new Set<(event: MessageEvent) => void>();
	const worker = {
		terminated: false,
		addEventListener: (type: string, listener: (event: MessageEvent) => void) => {
			if (type === 'message') listeners.add(listener);
		},
		postMessage: (message: SolverWorkerMessage) => {
			handleSolverMessage(
				message,
				(data) => {
					if (!worker.terminated)
						listeners.forEach((l) => l(new MessageEvent('message', { data })));
				},
				async () => createFakeSolver()
			);
		},
		terminate: () => (worker.terminated = true),
	};
	return worker;
}

const storeWith = (raw: string | null): HandStore =>
	({
		raw: async (ids: readonly string[]) => new Map(raw ? ids.map((id) => [id, raw]) : []),
	}) as HandStore;

const options: SolveRequestOptions = {
	handId: '7001',
	stepIndex: 14,
	tree: presetOf('standard'),
	rake: 0.04,
	targetPct: 0.5,
};

const solved = (client: ReturnType<typeof createSolveClient>, request = options) =>
	new Promise<SolveResult>((resolve, reject) => {
		client.solve(request, {
			onComplete: resolve,
			onError: (message) => reject(new Error(message)),
		});
	});

describe('createSolveClient', () => {
	describe('a solve', () => {
		it('sends the hand’s text and the settings, and hands back the result', async () => {
			const worker = fakeWorker();
			const sent: SolverWorkerMessage[] = [];
			const post = worker.postMessage;
			worker.postMessage = (message) => {
				sent.push(message);
				post(message);
			};
			const client = createSolveClient(
				storeWith(handText(RIVER_HERO_CALL)),
				() => worker as never
			);
			const result = await solved(client);
			expect(result.hand).toBe('54s');
			expect(sent[0]).toMatchObject({
				type: 'solve',
				stepIndex: 14,
				rake: 0.04,
				targetPct: 0.5,
			});
			expect(sent[0].raw).toContain('PokerStars Hand #7001');
			// A worker is done with when its answer is in.
			expect(worker.terminated).toBe(true);
		});

		it('reports the estimate and progress on the way', async () => {
			const client = createSolveClient(
				storeWith(handText(RIVER_HERO_CALL)),
				() => fakeWorker() as never
			);
			const onEstimate = vi.fn();
			const onProgress = vi.fn();
			await new Promise<void>((resolve) =>
				client.solve(options, {
					onEstimate,
					onProgress,
					onComplete: () => resolve(),
					onError: () => resolve(),
				})
			);
			expect(onEstimate).toHaveBeenCalledOnce();
			expect(onProgress).toHaveBeenCalled();
		});

		it('keeps a result, and gives it back without a worker', async () => {
			const spawn = vi.fn(() => fakeWorker() as never);
			const client = createSolveClient(storeWith(handText(RIVER_HERO_CALL)), spawn);
			expect(client.cached(options)).toBeUndefined();
			const first = await solved(client);
			expect(client.cached(options)).toBe(first);
			expect(await solved(client)).toBe(first);
			expect(spawn).toHaveBeenCalledTimes(1);
			// Another tree is another solve.
			expect(client.cached({ ...options, tree: presetOf('simple') })).toBeUndefined();
			expect(client.cached({ ...options, targetPct: 0.1 })).toBeUndefined();
		});
	});

	describe('a failure', () => {
		it('says when the hand has left the library', async () => {
			const client = createSolveClient(storeWith(null), () => fakeWorker() as never);
			await expect(solved(client)).rejects.toThrow(/no longer in the library/);
		});

		it('says when the worker cannot start', async () => {
			const client = createSolveClient(storeWith(handText(RIVER_HERO_CALL)), () => {
				throw new Error('blocked');
			});
			await expect(solved(client)).rejects.toThrow(/could not start: blocked/);
		});

		it('passes on the protocol’s own error', async () => {
			const client = createSolveClient(
				storeWith(handText(RIVER_HERO_CALL)),
				() => fakeWorker() as never
			);
			await expect(solved(client, { ...options, stepIndex: 13 })).rejects.toThrow(/hero/);
		});
	});

	describe('cancelling', () => {
		it('terminates the worker and answers nothing after', async () => {
			const worker = fakeWorker();
			const client = createSolveClient(
				storeWith(handText(RIVER_HERO_CALL)),
				() => worker as never
			);
			const onComplete = vi.fn();
			let cancel: () => void = () => undefined;
			await new Promise<void>((resolve) => {
				cancel = client.solve(options, {
					onProgress: () => resolve(),
					onComplete,
					onError: onComplete,
				});
			});
			cancel();
			expect(worker.terminated).toBe(true);
			await new Promise((resolve) => setTimeout(resolve, 100));
			expect(onComplete).not.toHaveBeenCalled();
		});

		it('before the hand has been read, never starts one', async () => {
			const spawn = vi.fn(() => fakeWorker() as never);
			const client = createSolveClient(createMemoryStore(), spawn);
			const cancel = client.solve(options, { onComplete: vi.fn(), onError: vi.fn() });
			cancel();
			await new Promise((resolve) => setTimeout(resolve, 20));
			expect(spawn).not.toHaveBeenCalled();
		});
	});

	describe('threads', () => {
		it('are on offer only when the page is cross-origin isolated', () => {
			const client = createSolveClient(createMemoryStore());
			expect(client.threads()).toBe(false);
		});
	});
});
