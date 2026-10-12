/**
 * Message protocol shared between `analysis.worker.ts` (the real Worker, used
 * in the browser) and the `Worker` stub tests install in `setupTests.ts`: the
 * types and the driver here, a thin `onmessage` shell there.
 *
 * The worker loads logs into the hand library, one after another, and brings
 * stored hands up to date. It posts no report: the page reads the library once a run completes.
 * A run takes seconds on a long log, so it reports progress as it goes and can
 * be abandoned between chunks, keeping every chunk already committed.
 */

import type { AnalysisOptions } from './coach/report';
import { advanceIngest, startIngest } from './store/ingest';
import type { HandStore, ImportRecord } from './store/types';

/** One log of a request: a file as it was read. */
export interface IngestLog {
	text: string;
	fileName?: string;
	/** The time of the import, as an ISO timestamp: an import's key, so its own. */
	now?: string;
}

export interface IngestRequest {
	type: 'ingest';
	/** Echoed on every response, so a stale answer can be told from a current one. */
	requestId: number;
	/** Loaded one after another, or none: a run that only brings the library up to date. */
	logs: IngestLog[];
	options?: AnalysisOptions;
}

export interface AnalysisCancelRequest {
	type: 'cancel';
	requestId: number;
}

export type AnalysisWorkerMessage = IngestRequest | AnalysisCancelRequest;

export type AnalysisWorkerResponse =
	| {
			type: 'progress';
			requestId: number;
			/** Hands of the log being loaded. */
			done: number;
			total: number;
			/** Which of the request's logs that is, from one, and how many there are. */
			log: number;
			logs: number;
	  }
	| {
			type: 'complete';
			requestId: number;
			/** What each log added, in the order they were given. */
			imported: ImportRecord[];
			/** The names of the files no hand was found in. */
			empty: string[];
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

/** Lets the worker drain its queue, so a cancel sent meanwhile has been heard. */
const yieldToQueue = (): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Drives one message. Works in chunks on zero-delay timeouts, so the worker
 * drains its own queue between them and a cancel arriving mid-run is seen
 * rather than waited out. A file with no hands in it is named in the
 * completion and the rest are loaded all the same.
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
	const logs: IngestLog[] = message.logs.length > 0 ? message.logs : [{ text: '' }];

	const load = async () => {
		const imported: ImportRecord[] = [];
		const empty: string[] = [];
		for (const [index, log] of logs.entries()) {
			const run = await startIngest(store, log.text, {
				...message.options,
				fileName: log.fileName,
				now: log.now,
			});
			// A superseded run stops where it stands: nothing it could post is wanted.
			if (active !== token) return;
			if (log.text !== '' && !run.imported) {
				empty.push(log.fileName ?? '');
				continue;
			}
			const progress = () =>
				post({
					type: 'progress',
					requestId,
					done: run.done,
					total: run.total,
					log: index + 1,
					logs: logs.length,
				});
			progress();
			for (;;) {
				await yieldToQueue();
				if (active !== token) return;
				if (token.cancelled) {
					active = null;
					post({ type: 'cancelled', requestId });
					return;
				}
				if (await advanceIngest(run, CHUNK_HANDS)) break;
				progress();
			}
			if (run.imported) imported.push(run.imported);
		}
		if (active !== token) return;
		active = null;
		post({
			type: 'complete',
			requestId,
			imported,
			empty,
			elapsedMs: Date.now() - started,
		});
	};

	load().catch((error: unknown) => {
		if (active === token) active = null;
		post({ type: 'error', requestId, message: messageOf(error) });
	});
}
