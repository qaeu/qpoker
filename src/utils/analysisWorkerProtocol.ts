/**
 * Message protocol shared between `analysis.worker.ts` (the real Worker, used
 * in the browser) and the `Worker` stub tests install in `setupTests.ts`: the
 * types and the driver here, a thin `onmessage` shell there.
 *
 * An analysis runs for seconds on a long log, so it reports progress as it
 * goes and can be abandoned between chunks.
 */

import {
	advanceAnalysis,
	finishAnalysis,
	startAnalysis,
	type AnalysisOptions,
	type AnalysisReport,
	type AnalysisRun,
} from './coach/report';

export interface AnalysisRequest {
	type?: 'run';
	/** Echoed on every response, so a stale answer can be told from a current one. */
	requestId: number;
	text: string;
	options?: AnalysisOptions;
	/** The report on the page: its hands are kept where they would grade the same. */
	previous?: AnalysisReport;
}

export interface AnalysisCancelRequest {
	type: 'cancel';
	requestId: number;
}

export type AnalysisWorkerMessage = AnalysisRequest | AnalysisCancelRequest;

export type AnalysisWorkerResponse =
	| { type: 'progress'; requestId: number; done: number; total: number }
	| { type: 'complete'; requestId: number; report: AnalysisReport; elapsedMs: number }
	| { type: 'cancelled'; requestId: number }
	| { type: 'error'; requestId: number; message: string };

/** Hands graded before yielding: a cancel lands within a frame or two. */
const CHUNK_HANDS = 5;

/** The run this worker is on, if any. A second request supersedes the first. */
let active: { requestId: number; cancelled: boolean } | null = null;

const messageOf = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * Drives one message. Grades in chunks on zero-delay timeouts, so the worker
 * drains its own queue between them and a cancel arriving mid-run is seen
 * rather than waited out.
 */
export function handleAnalysisMessage(
	message: AnalysisWorkerMessage,
	post: (response: AnalysisWorkerResponse) => void
): void {
	if (message.type === 'cancel') {
		if (active?.requestId === message.requestId) active.cancelled = true;
		return;
	}

	const token = { requestId: message.requestId, cancelled: false };
	active = token;
	const started = Date.now();

	let run: AnalysisRun;
	try {
		run = startAnalysis(message.text, message.options, message.previous);
		if (run.total === 0) throw new Error('No PokerStars hands found in that file.');
	} catch (error) {
		active = null;
		post({ type: 'error', requestId: token.requestId, message: messageOf(error) });
		return;
	}

	post({ type: 'progress', requestId: token.requestId, done: 0, total: run.total });

	const step = () => {
		// A superseded run stops where it stands: nothing it could post is wanted.
		if (active !== token) return;
		if (token.cancelled) {
			active = null;
			post({ type: 'cancelled', requestId: token.requestId });
			return;
		}

		try {
			if (advanceAnalysis(run, CHUNK_HANDS)) {
				active = null;
				post({
					type: 'complete',
					requestId: token.requestId,
					report: finishAnalysis(run),
					elapsedMs: Date.now() - started,
				});
				return;
			}
		} catch (error) {
			active = null;
			post({ type: 'error', requestId: token.requestId, message: messageOf(error) });
			return;
		}

		post({
			type: 'progress',
			requestId: token.requestId,
			done: run.done,
			total: run.total,
		});
		setTimeout(step, 0);
	};

	setTimeout(step, 0);
}
