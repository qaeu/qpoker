/**
 * The page's side of the solver: sends one decision to a worker of its own,
 * hears the estimate, the progress and the result, and keeps results it has
 * already got. Cancelling terminates the worker, the only way to stop a solver
 * mid-iteration, and the next solve starts a new one. See docs/solver.md.
 */

import type { SolveResult } from '../solver/result';
import { treeKey, type TreeSettings } from '../solver/tree';
import type { SolverWorkerMessage, SolverWorkerResponse } from '../solverWorkerProtocol';
import type { HandStore } from '../store/types';

/** Memory a solve may take: browsers give a tab well under the 4GB WASM could address. */
export const SOLVE_BUDGET_MB = 1500;

/** Results kept: stepping back through a hand should not solve again. */
const KEPT = 20;

export interface SolveHandlers {
	onEstimate?: (estimate: Extract<SolverWorkerResponse, { type: 'estimate' }>) => void;
	onProgress?: (iteration: number, exploitabilityPct: number) => void;
	onComplete: (result: SolveResult) => void;
	onError: (message: string, reason: string) => void;
}

export interface SolveRequestOptions {
	handId: string;
	stepIndex: number;
	tree: TreeSettings;
	/** A share of the pot. */
	rake: number;
	/** Exploitability to stop at, percent of the pot. */
	targetPct: number;
}

export interface SolveClient {
	/** Whether the page can run the threaded build. */
	threads: () => boolean;
	/** A result already held for this solve, if any. */
	cached: (options: SolveRequestOptions) => SolveResult | undefined;
	/** Starts a solve; the returned function abandons it. */
	solve: (options: SolveRequestOptions, handlers: SolveHandlers) => () => void;
}

/** The real worker; a test swaps in its own. */
export const spawnSolverWorker = (): Worker =>
	new Worker(new URL('../solver.worker.ts', import.meta.url), { type: 'module' });

export function createSolveClient(
	store: HandStore,
	spawn: () => Worker = spawnSolverWorker
): SolveClient {
	const results = new Map<string, SolveResult>();
	let latestRequestId = 0;

	const keyOf = ({ handId, stepIndex, tree, rake, targetPct }: SolveRequestOptions) =>
		`${handId}:${stepIndex}:${rake}:${targetPct}:${treeKey(tree)}`;

	return {
		threads: () =>
			globalThis.crossOriginIsolated === true && typeof SharedArrayBuffer !== 'undefined',
		cached: (options) => results.get(keyOf(options)),
		solve(options, handlers) {
			const requestId = ++latestRequestId;
			let worker: Worker | null = null;
			let done = false;
			const finish = () => {
				done = true;
				worker?.terminate();
				worker = null;
			};

			void (async () => {
				const held = results.get(keyOf(options));
				if (held) {
					done = true;
					handlers.onComplete(held);
					return;
				}
				const raw = (await store.raw([options.handId])).get(options.handId);
				if (done) return;
				if (!raw) {
					done = true;
					handlers.onError('The hand is no longer in the library.', 'solver');
					return;
				}
				try {
					worker = spawn();
				} catch (error) {
					done = true;
					handlers.onError(
						`The solver could not start: ${error instanceof Error ? error.message : String(error)}`,
						'solver'
					);
					return;
				}
				worker.addEventListener(
					'message',
					(event: MessageEvent<SolverWorkerResponse>) => {
						const response = event.data;
						if (done || response.requestId !== requestId) return;
						if (response.type === 'estimate') handlers.onEstimate?.(response);
						else if (response.type === 'progress') {
							handlers.onProgress?.(response.iteration, response.exploitabilityPct);
						} else if (response.type === 'complete') {
							results.set(keyOf(options), response.result);
							for (const key of results.keys()) {
								if (results.size <= KEPT) break;
								results.delete(key);
							}
							finish();
							handlers.onComplete(response.result);
						} else {
							finish();
							handlers.onError(response.message, response.reason);
						}
					}
				);
				worker.addEventListener('error', (event: Event) => {
					if (done) return;
					finish();
					handlers.onError(
						(event as ErrorEvent).message || 'The solver stopped unexpectedly.',
						'solver'
					);
				});
				const message: SolverWorkerMessage = {
					type: 'solve',
					requestId,
					raw,
					stepIndex: options.stepIndex,
					tree: options.tree,
					rake: options.rake,
					budgetMb: SOLVE_BUDGET_MB,
					targetPct: options.targetPct,
				};
				worker.postMessage(message);
			})();

			return finish;
		},
	};
}
