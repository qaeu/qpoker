/**
 * Loads the single-threaded solver WASM in Node, for the `solve` command and the
 * tests that run the real solver. The browser worker loads the same glue with
 * `fetch` instead; this is the only place that reads the file from disk.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { SolverModule } from '#utils/solver/wasmApi';

// Paths, not `URL`s: under jsdom the global `URL` is not Node's own.
const BUILD = join(dirname(fileURLToPath(import.meta.url)), '../utils/solver/wasm/st');
const GLUE = join(BUILD, 'qpoker_solver.js');
export const SOLVER_WASM = join(BUILD, 'qpoker_solver_bg.wasm');

/** Whether `npm run build:solver` has been run. */
export const solverBuilt = (): boolean => existsSync(GLUE) && existsSync(SOLVER_WASM);

interface Glue extends SolverModule {
	initSync: (input: { module: BufferSource }) => unknown;
}

let loaded: Promise<SolverModule> | undefined;

export function loadNodeSolver(): Promise<SolverModule> {
	loaded ??= (async () => {
		if (!solverBuilt()) {
			throw new Error('The solver is not built. Run: npm run build:solver');
		}
		const glue = (await import(/* @vite-ignore */ pathToFileURL(GLUE).href)) as Glue;
		glue.initSync({ module: readFileSync(SOLVER_WASM) });
		return glue;
	})();
	return loaded;
}
