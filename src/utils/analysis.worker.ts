/**
 * Runs an analysis off the main thread, so the page stays interactive and can
 * show progress while a log is graded. See `analysisWorkerProtocol.ts` for the
 * messages and the chunked loop behind them.
 */

import {
	handleAnalysisMessage,
	type AnalysisWorkerMessage,
} from './analysisWorkerProtocol';

self.onmessage = (event: MessageEvent<AnalysisWorkerMessage>) => {
	handleAnalysisMessage(event.data, (response) => self.postMessage(response));
};
