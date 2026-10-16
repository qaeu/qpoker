/**
 * Solves one decision off the main thread. The threaded build is used where the
 * page is cross-origin isolated (`SharedArrayBuffer` exists), the single-threaded
 * one otherwise. See `solverWorkerProtocol.ts` for the messages and
 * docs/solver.md for the builds.
 */

import { handleSolverMessage, type SolverWorkerMessage } from './solverWorkerProtocol';
import type { SolverModule } from './solver/wasmApi';

let loaded: Promise<SolverModule> | undefined;

/** The WASM is fetched once per worker, and the thread pool started once. */
function loadSolver(): Promise<SolverModule> {
	loaded ??= (async () => {
		if (self.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined') {
			const glue = await import('./solver/wasm/mt/qpoker_solver.js');
			await glue.default();
			await glue.initThreadPool?.(navigator.hardwareConcurrency || 4);
			return glue;
		}
		const glue = await import('./solver/wasm/st/qpoker_solver.js');
		await glue.default();
		return glue;
	})();
	// A failed load is tried again by the next solve.
	loaded.catch(() => (loaded = undefined));
	return loaded;
}

self.onmessage = (event: MessageEvent<SolverWorkerMessage>) => {
	handleSolverMessage(event.data, (response) => self.postMessage(response), loadSolver);
};
