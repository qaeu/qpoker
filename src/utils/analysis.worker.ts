/**
 * Loads logs into the hand library off the main thread, so the page stays
 * interactive and can show progress while hands are graded. See
 * `analysisWorkerProtocol.ts` for the messages and the chunked loop behind them.
 */

import {
	handleAnalysisMessage,
	type AnalysisWorkerMessage,
} from './analysisWorkerProtocol';
import { openIdbStore } from './store/idbStore';

const store = openIdbStore();

self.onmessage = (event: MessageEvent<AnalysisWorkerMessage>) => {
	handleAnalysisMessage(event.data, (response) => self.postMessage(response), store);
};
