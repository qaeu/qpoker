import { describe, it, expect } from 'vitest';

import {
	handleAnalysisMessage,
	type AnalysisWorkerMessage,
	type AnalysisWorkerResponse,
} from '#utils/analysisWorkerProtocol';
import { analyzeLog } from '#utils/coach/report';

import emailed from '../fixtures/emailed.txt?raw';
import { BLINDS_HERO_UTG, handText } from './history/handText';

/** Sends messages and resolves with everything posted once the run settles. */
function drive(messages: AnalysisWorkerMessage[]): Promise<AnalysisWorkerResponse[]> {
	return new Promise((resolve) => {
		const responses: AnalysisWorkerResponse[] = [];
		const post = (response: AnalysisWorkerResponse) => {
			responses.push(response);
			if (response.type !== 'progress') resolve(responses);
		};
		for (const message of messages) handleAnalysisMessage(message, post);
	});
}

const longLog = Array.from({ length: 12 }, () =>
	handText({
		heroCards: '7c 2d',
		button: 4,
		lines: [
			...BLINDS_HERO_UTG,
			'*** HOLE CARDS ***',
			...['hero', 'p2', 'p3', 'p4', 'p5'].map((name) => `${name}: folds`),
			'Uncalled bet ($0.05) returned to p6',
			'p6 collected $0.10 from pot',
		],
		pot: '0.10',
		winner: 'p6',
	})
).join('\n');

describe('the analysis worker protocol', () => {
	it('reports progress and then the same report a direct call gives', async () => {
		const responses = await drive([
			{ requestId: 7, text: emailed, options: { seed: 2 } },
		]);
		expect(responses[0]).toEqual({ type: 'progress', requestId: 7, done: 0, total: 4 });
		const last = responses.at(-1)!;
		expect(last.type).toBe('complete');
		if (last.type !== 'complete') return;
		expect(last.requestId).toBe(7);
		expect(last.report).toEqual(analyzeLog(emailed, { seed: 2 }));
	});

	it('grades in chunks, posting progress between them', async () => {
		const responses = await drive([{ requestId: 1, text: longLog }]);
		const progress = responses.filter((response) => response.type === 'progress');
		expect(progress.map((p) => (p.type === 'progress' ? p.done : -1))).toEqual([
			0, 5, 10,
		]);
		expect(responses.at(-1)!.type).toBe('complete');
	});

	it('grades nothing a report it is handed already answers for', async () => {
		const previous = analyzeLog(longLog);
		const responses = await drive([{ requestId: 2, text: longLog, previous }]);
		expect(responses.map((response) => response.type)).toEqual(['progress', 'complete']);
		const last = responses.at(-1)!;
		if (last.type !== 'complete') return;
		expect(last.report).toEqual(previous);
		expect(last.report.hands[0]).toBe(previous.hands[0]);
	});

	it('stops when cancelled', async () => {
		const responses = await drive([
			{ requestId: 3, text: longLog },
			{ type: 'cancel', requestId: 3 },
		]);
		expect(responses.at(-1)).toEqual({ type: 'cancelled', requestId: 3 });
	});

	it('ignores a cancel for a run it is not on', async () => {
		const responses = await drive([
			{ requestId: 4, text: emailed },
			{ type: 'cancel', requestId: 99 },
		]);
		expect(responses.at(-1)!.type).toBe('complete');
	});

	it('answers a file with no hands in it with an error', async () => {
		const responses = await drive([{ requestId: 5, text: 'not a hand history' }]);
		expect(responses).toEqual([
			{ type: 'error', requestId: 5, message: 'No PokerStars hands found in that file.' },
		]);
	});
});
