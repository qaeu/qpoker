/**
 * The solver as a native process (`solver/src/bin/qpoker-solver.rs`), for the
 * `solve` command: the same crate as the WASM, without wasm32's 4 GB cap and on
 * every core. One process a game, spoken to a JSON line at a time; built by
 * `npm run build:solver:native`, and the CLI falls back to the WASM without it.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import type { SolverHandle, SolverModule } from '#utils/solver/wasmApi';

export const NATIVE_SOLVER = join(
	dirname(fileURLToPath(import.meta.url)),
	'../../solver/target/native/release',
	process.platform === 'win32' ? 'qpoker-solver.exe' : 'qpoker-solver'
);

/** Whether `npm run build:solver:native` has been run. */
export const nativeSolverBuilt = (path = NATIVE_SOLVER): boolean => existsSync(path);

interface Reply {
	ok?: unknown;
	error?: string;
}

/** Starts the process; `ask` sends one request and waits for its answer. */
function connect(path: string) {
	const child = spawn(path, [], { stdio: ['pipe', 'pipe', 'pipe'] });
	const waiting: { resolve: (value: unknown) => void; reject: (error: Error) => void }[] =
		[];
	let stderr = '';
	let ended: Error | null = null;

	const end = (error: Error) => {
		ended ??= error;
		for (const pending of waiting.splice(0)) pending.reject(ended);
	};
	child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
	child.on('error', end);
	child.on('exit', (code, signal) =>
		end(
			new Error(
				`The native solver stopped (${signal ?? `exit ${code}`})${stderr ? `: ${stderr.trim()}` : ''}`
			)
		)
	);
	createInterface({ input: child.stdout }).on('line', (line) => {
		const pending = waiting.shift();
		if (!pending) return;
		const reply = JSON.parse(line) as Reply;
		if (reply.error !== undefined) pending.reject(new Error(reply.error));
		else pending.resolve(reply.ok);
	});

	return {
		ask(request: Record<string, unknown>): Promise<unknown> {
			if (ended) return Promise.reject(ended);
			return new Promise((resolve, reject) => {
				waiting.push({ resolve, reject });
				child.stdin.write(`${JSON.stringify(request)}\n`);
			});
		},
		close() {
			child.stdin.end();
		},
	};
}

export function nativeSolver(path = NATIVE_SOLVER): SolverModule {
	return {
		async createSolver(inputJson: string): Promise<SolverHandle> {
			const game = connect(path);
			try {
				await game.ask({ op: 'create', input: JSON.parse(inputJson) as unknown });
			} catch (error) {
				game.close();
				throw error;
			}
			return {
				estimate: async () => JSON.stringify(await game.ask({ op: 'estimate' })),
				allocate: async (compressed) =>
					void (await game.ask({ op: 'allocate', compressed })),
				step: async (n) => (await game.ask({ op: 'step', n })) as number,
				query: async () => JSON.stringify(await game.ask({ op: 'query' })),
				free: () => game.close(),
			};
		},
	};
}
