/**
 * Message protocol shared between `analysis.worker.ts` (the real Worker, used
 * in the browser) and the `Worker` stub tests install in `setupTests.ts`: the
 * types and the driver here, a thin `onmessage` shell there.
 *
 * The worker loads a log into the hand library and brings stored hands up to
 * date. It posts no report: the page reads the library once a run completes.
 * A run takes seconds on a long log, so it reports progress as it goes and can
 * be abandoned between chunks, keeping every chunk already committed.
 */

import type { AnalysisOptions } from './coach/report';
import { advanceIngest, startIngest, type IngestRun } from './store/ingest';
import type { HandStore, ImportRecord } from './store/types';

export interface IngestRequest {
	type: 'ingest';
	/** Echoed on every response, so a stale answer can be told from a current one. */
	requestId: number;
	/** The log, or nothing: a run that only brings the library up to date. */
	text: string;
	fileName?: string;
	/** The time of the import, as an ISO timestamp. */
	now?: string;
	options?: AnalysisOptions;
}

export interface AnalysisCancelRequest {
	type: 'cancel';
	requestId: number;
}

export type AnalysisWorkerMessage = IngestRequest | AnalysisCancelRequest;

export type AnalysisWorkerResponse =
	| { type: 'progress'; requestId: number; done: number; total: number }
	| {
			type: 'complete';
			requestId: number;
			/** What the log added, or null for a run without one. */
			imported: ImportRecord | null;
			elapsedMs: number;
	  }
	| { type: 'cancelled'; requestId: number }
	| { type: 'error'; requestId: number; message: string };

/** Hands graded before yielding: a cancel lands within a frame or two. */
const CHUNK_HANDS = 5;

/** The run this worker is on, if any. A second request supersedes the first. */
let active: { requestId: number; cancelled: boolean } | null = null;

const messageOf = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * Drives one message. Works in chunks on zero-delay timeouts, so the worker
 * drains its own queue between them and a cancel arriving mid-run is seen
 * rather than waited out.
 */
export function handleAnalysisMessage(
	message: AnalysisWorkerMessage,
	post: (response: AnalysisWorkerResponse) => void,
	store: HandStore
): void {
	if (message.type === 'cancel') {
		if (active?.requestId === message.requestId) active.cancelled = true;
		return;
	}

	const token = { requestId: message.requestId, cancelled: false };
	active = token;
	const started = Date.now();
	const { requestId } = token;
	const fail = (error: unknown) => {
		if (active === token) active = null;
		post({ type: 'error', requestId, message: messageOf(error) });
	};

	const step = async (run: IngestRun) => {
		// A superseded run stops where it stands: nothing it could post is wanted.
		if (active !== token) return;
		if (token.cancelled) {
			active = null;
			post({ type: 'cancelled', requestId });
			return;
		}
		if (await advanceIngest(run, CHUNK_HANDS)) {
			if (active === token) active = null;
			post({
				type: 'complete',
				requestId,
				imported: run.imported,
				elapsedMs: Date.now() - started,
			});
			return;
		}
		post({ type: 'progress', requestId, done: run.done, total: run.total });
		setTimeout(() => void step(run).catch(fail), 0);
	};

	startIngest(store, message.text, {
		...message.options,
		fileName: message.fileName,
		now: message.now,
	})
		.then((run) => {
			if (active !== token) return;
			if (message.text !== '' && !run.imported) {
				throw new Error('No PokerStars hands found in that file.');
			}
			post({ type: 'progress', requestId, done: 0, total: run.total });
			setTimeout(() => void step(run).catch(fail), 0);
		})
		.catch(fail);
}
