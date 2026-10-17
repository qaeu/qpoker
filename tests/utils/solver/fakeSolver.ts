/**
 * A stand-in for the WASM module, for tests of everything around it: the
 * protocol driver, the worker stub, the page. It walks the prefix to find who
 * acts, offers the actions a heads-up river node would, and answers with a fixed
 * mixed strategy that improves with iterations. It solves nothing.
 */

import { COMBO_COUNT } from '#utils/cards/combos';
import { BUCKET_LADDER } from '#utils/solver/buckets';
import type {
	SolverHandle,
	SolverModule,
	WasmAction,
	WasmInput,
	WasmQuery,
} from '#utils/solver/wasmApi';

export interface FakeOptions {
	/** Make `createSolver` throw this. */
	failWith?: string;
	/** Bytes the estimate reports. */
	bytes?: number;
	/** Bytes the estimate reports for each combo in the two ranges, instead of `bytes`. */
	bytesPerCombo?: number;
	/** With `bytesPerCombo`: the share the first bucketed rung keeps (0.5); each later one halves it. */
	bucketedShare?: number;
	/** With river buckets: the dEV, a share of the pot, it levels off at. */
	bucketedFloor?: number;
	/** Called as each handle is made, for a test to look at the input. */
	onCreate?: (input: WasmInput) => void;
	/** Called when a handle is freed. */
	onFree?: () => void;
}

const AGGRESSIVE = new Set(['bet', 'raise', 'allin']);

/** The fake answers at once, as the WASM does. */
interface FakeModule extends SolverModule {
	createSolver(json: string): SolverHandle;
}

export function createFakeSolver(options: FakeOptions = {}): FakeModule {
	return {
		createSolver(json: string): SolverHandle {
			if (options.failWith) throw new Error(options.failWith);
			const input = JSON.parse(json) as WasmInput;
			options.onCreate?.(input);
			let iterations = 0;

			// Heads-up: every action hands the turn over.
			const player = (input.prefix.length % 2) as 0 | 1;
			const last: WasmAction | undefined = input.prefix.at(-1);
			const facing = last !== undefined && AGGRESSIVE.has(last.kind);
			const pot = input.pot + (last?.to ?? 0) * (facing ? 1 : 0);
			const actions: WasmAction[] =
				facing ?
					[
						{ kind: 'fold' },
						{ kind: 'call' },
						{ kind: 'raise', to: Math.round((last?.to ?? 0) * 2.5) },
					]
				:	[{ kind: 'check' }, { kind: 'bet', to: Math.round(input.pot / 2) }];

			const combos = [...input.oopRange, ...input.ipRange].filter((w) => w > 0).length;
			const rung = input.riverBuckets ? BUCKET_LADDER.indexOf(input.riverBuckets) : -1;
			const bucketed = rung < 0 ? 1 : (options.bucketedShare ?? 0.5) * 0.5 ** rung;
			const bytes =
				options.bytesPerCombo ?
					options.bytesPerCombo * combos * bucketed
				:	(options.bytes ?? 4_000_000);
			return {
				estimate: () => JSON.stringify({ bytes, bytesCompressed: bytes / 2, nodes: 42 }),
				allocate: () => undefined,
				step(n) {
					iterations += n;
					const floor = input.riverBuckets ? (options.bucketedFloor ?? 0) : 0;
					return input.pot * (floor + 0.02 / (1 + iterations / 10));
				},
				query() {
					const range = player === 0 ? input.oopRange : input.ipRange;
					const share = actions.map((_, a) =>
						a === 0 ? 0.3 : 0.7 / (actions.length - 1)
					);
					const query: WasmQuery = {
						player,
						actions,
						pot,
						strategy: actions.flatMap((_, a) =>
							range.map((weight) => (weight > 0 ? share[a] : 0))
						),
						ev: actions.flatMap((action, a) =>
							range.map((weight) =>
								weight > 0 ?
									action.kind === 'fold' ?
										0
									:	50 * a
								:	0
							)
						),
						equity: range.map((weight) => (weight > 0 ? 0.4 : 0)),
						weights: range.map((weight) => Math.min(1, weight)),
					};
					if (query.strategy.length !== actions.length * COMBO_COUNT) {
						throw new Error('The fake was handed a range of the wrong size.');
					}
					return JSON.stringify(query);
				},
				free: () => options.onFree?.(),
			};
		},
	};
}
