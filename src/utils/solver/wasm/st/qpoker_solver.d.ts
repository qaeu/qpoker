/* tslint:disable */
/* eslint-disable */

/**
 * One game being solved. `free()` releases its memory.
 */
export class SolverHandle {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Allocates the game's storage, 16-bit when `compressed`.
     */
    allocate(compressed: boolean): void;
    /**
     * `WasmEstimate` JSON: bytes (32-bit and 16-bit storage) and node count.
     */
    estimate(): string;
    /**
     * Finalises the solve and returns the `WasmQuery` JSON for the prefix's node.
     */
    query(): string;
    /**
     * Runs `n` more DCFR iterations; returns the exploitability in cents.
     */
    step(n: number): number;
}

/**
 * Builds the tree and game from a `WasmInput` JSON; throws an `Error` it can't.
 */
export function createSolver(input_json: string): SolverHandle;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_solverhandle_free: (a: number, b: number) => void;
    readonly createSolver: (a: number, b: number) => [number, number, number];
    readonly solverhandle_allocate: (a: number, b: number) => void;
    readonly solverhandle_estimate: (a: number) => [number, number];
    readonly solverhandle_query: (a: number) => [number, number, number, number];
    readonly solverhandle_step: (a: number, b: number) => [number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
