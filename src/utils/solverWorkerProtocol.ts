/**
 * Message protocol shared between `solver.worker.ts` (the real Worker, in the
 * browser) and the `Worker` stub tests install in `setupTests.ts`: the types and
 * the driver here, a thin `onmessage` shell there. The driver takes the WASM
 * module as a parameter, so a test hands it a fake.
 *
 * One request is one solve of one decision. It reports the size of the tree
 * before it allocates, then its progress, and ends in a result or an error. There
 * is no cancel message: the page terminates the worker, which is the only way to
 * stop a solver in the middle of an iteration. See docs/solver.md.
 */

import { COMBOS } from './cards/combos';
import { parseHistory } from './history/parse';
import { replayHand } from './history/replay';
import { resultOf, type SolveResult } from './solver/result';
import { solverSpot, type SolveRefusal, type SolverSpot } from './solver/spot';
import { DEFAULT_TARGET_PCT, MAX_ITERATIONS, targetProblem } from './solver/target';
import { validateTree, type TreeSettings } from './solver/tree';
import { MAX_TRIM, TRIM_LADDER, trimInput, type SolveTrim } from './solver/trim';
import type {
	SolverHandle,
	SolverModule,
	WasmEstimate,
	WasmQuery,
} from './solver/wasmApi';

export interface SolveRequest {
	type: 'solve';
	/** Echoed on every response, so a stale answer can be told from a current one. */
	requestId: number;
	/** The hand's own text, from the library. */
	raw: string;
	/** Index into the hand's actions: the hero's decision to solve. */
	stepIndex: number;
	tree: TreeSettings;
	/** A share of the pot. */
	rake: number;
	/** Memory the solve may take, in megabytes. */
	budgetMb: number;
	/** Exploitability to stop at, percent of the starting pot; `DEFAULT_TARGET_PCT` if absent. */
	targetPct?: number;
}

export type SolverWorkerMessage = SolveRequest;

export type SolverWorkerResponse =
	| {
			type: 'estimate';
			requestId: number;
			bytes: number;
			bytesCompressed: number;
			nodes: number;
			/** Whether 16-bit storage was chosen to fit the budget. */
			compressed: boolean;
			/** The ranges' trim, when 16-bit alone did not fit; null if none. */
			trim: SolveTrim | null;
	  }
	| {
			type: 'progress';
			requestId: number;
			iteration: number;
			/** Percent of the street's starting pot. */
			exploitabilityPct: number;
	  }
	| { type: 'complete'; requestId: number; result: SolveResult; elapsedMs: number }
	| {
			type: 'error';
			requestId: number;
			message: string;
			reason: SolveRefusal | 'tree' | 'budget' | 'solver';
	  };

export { MAX_ITERATIONS };
/** Iterations run between a report and a look at whether to go on. */
const CHUNK = 10;
const MB = 1024 * 1024;

export type LoadSolver = () => Promise<SolverModule>;

const messageOf = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

const yieldToQueue = (): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, 0));

class Stop extends Error {
	constructor(
		message: string,
		readonly reason: Extract<SolverWorkerResponse, { type: 'error' }>['reason']
	) {
		super(message);
	}
}

interface Fitted {
	handle: SolverHandle;
	estimate: WasmEstimate;
	compressed: boolean;
	trim: SolveTrim | null;
}

/**
 * Builds the game on the first rung of the ladder that fits `budget` bytes:
 * 32-bit, 16-bit, then 16-bit over ranges trimmed by each of `TRIM_LADDER`.
 */
async function fit(
	module: SolverModule,
	spot: SolverSpot,
	budget: number
): Promise<Fitted> {
	const heroClass = COMBOS[spot.heroCombo].cls;
	let smallest = Infinity;
	for (const share of [0, ...TRIM_LADDER]) {
		const trimmed = share > 0 ? trimInput(spot.input, share, heroClass) : null;
		let handle: SolverHandle;
		try {
			handle = await module.createSolver(JSON.stringify(trimmed?.input ?? spot.input));
		} catch (error) {
			throw new Stop(`The solver could not build this tree: ${messageOf(error)}`, 'tree');
		}
		let estimate: WasmEstimate;
		try {
			estimate = JSON.parse(await handle.estimate()) as WasmEstimate;
		} catch (error) {
			handle.free();
			throw error;
		}
		const trim = trimmed?.trim ?? null;
		if (estimate.bytes <= budget) return { handle, estimate, compressed: false, trim };
		if (estimate.bytesCompressed <= budget)
			return { handle, estimate, compressed: true, trim };
		smallest = estimate.bytesCompressed;
		handle.free();
	}
	throw new Stop(
		`This tree needs about ${Math.ceil(smallest / MB)} MB even compressed and with the ranges trimmed by ${MAX_TRIM * 100}%, over the ${budget / MB} MB budget. Use fewer sizes, or no raises (the Simple tree).`,
		'budget'
	);
}

/**
 * Drives one solve. Returns a function that abandons it where it stands, for
 * a stub that cannot be terminated: nothing more is posted after it.
 */
export function handleSolverMessage(
	message: SolverWorkerMessage,
	post: (response: SolverWorkerResponse) => void,
	load: LoadSolver
): () => void {
	let abandoned = false;
	const { requestId } = message;
	const started = Date.now();
	const send = (response: SolverWorkerResponse) => {
		if (!abandoned) post(response);
	};

	const run = async () => {
		const targetPct = message.targetPct ?? DEFAULT_TARGET_PCT;
		const problems = validateTree(message.tree);
		const off = targetProblem(targetPct);
		if (off) problems.push(off);
		if (problems.length > 0) throw new Stop(problems.join(' '), 'tree');

		const hand = parseHistory(message.raw).find((candidate) => candidate.hero);
		if (!hand) throw new Stop('The hand could not be read.', 'not-hero');
		const found = solverSpot(
			replayHand(hand),
			message.stepIndex,
			message.tree,
			message.rake
		);
		if (!found.ok) throw new Stop(found.message, found.reason);
		const { spot } = found;

		const module = await load();
		const fitted = await fit(module, spot, message.budgetMb * MB);
		const { handle, estimate, compressed, trim } = fitted;
		try {
			send({
				type: 'estimate',
				requestId,
				bytes: estimate.bytes,
				bytesCompressed: estimate.bytesCompressed,
				nodes: estimate.nodes,
				compressed,
				trim,
			});
			await handle.allocate(compressed);

			let iteration = 0;
			let exploitability = Infinity;
			const target = (spot.pot * targetPct) / 100;
			while (iteration < MAX_ITERATIONS && exploitability > target) {
				await yieldToQueue();
				if (abandoned) return;
				const n = Math.min(CHUNK, MAX_ITERATIONS - iteration);
				exploitability = await handle.step(n);
				iteration += n;
				send({
					type: 'progress',
					requestId,
					iteration,
					exploitabilityPct: (exploitability / spot.pot) * 100,
				});
			}
			const query = JSON.parse(await handle.query()) as WasmQuery;
			const result = resultOf(spot, query, {
				iterations: iteration,
				exploitability,
				nodes: estimate.nodes,
				bytes: compressed ? estimate.bytesCompressed : estimate.bytes,
				compressed,
				trim,
			});
			send({ type: 'complete', requestId, result, elapsedMs: Date.now() - started });
		} finally {
			handle.free();
		}
	};

	run().catch((error: unknown) =>
		send({
			type: 'error',
			requestId,
			message: messageOf(error),
			reason: error instanceof Stop ? error.reason : 'solver',
		})
	);
	return () => {
		abandoned = true;
	};
}
