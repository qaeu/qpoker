/**
 * The shape of wasm-bindgen's `--target web` glue for the solver crate, which
 * `npm run build:solver` writes to `wasm/st` and `wasm/mt`. Declared here so the
 * loaders type-check before, and without, a build; a built glue's own
 * declarations are the same shape.
 */

declare module '*/qpoker_solver.js' {
	import type { SolverModule } from '#utils/solver/wasmApi';

	/** Fetches and instantiates the module; resolves once it is ready. */
	export default function init(input?: unknown): Promise<unknown>;
	/** Instantiates from bytes already read, for Node. */
	export function initSync(input: { module: BufferSource | WebAssembly.Module }): unknown;
	/** The threaded build only. */
	export const initThreadPool: ((threads: number) => Promise<void>) | undefined;
	export const createSolver: SolverModule['createSolver'];
}
