import { describe, it, expect } from 'vitest';

import {
	handleAnalysisMessage,
	type AnalysisWorkerMessage,
	type AnalysisWorkerResponse,
} from '#utils/analysisWorkerProtocol';
import { analyzeLog } from '#utils/coach/report';
import { libraryReport, loadLibrary } from '#utils/store/library';
import { createMemoryStore } from '#utils/store/memoryStore';
import type { HandStore } from '#utils/store/types';

import emailed from '../fixtures/emailed.txt?raw';
import { summed } from './coach/summed';
import { BLINDS_HERO_UTG, handText } from './history/handText';

/** Sends messages and resolves with everything posted once the run settles. */
function drive(
	messages: AnalysisWorkerMessage[],
	store: HandStore = createMemoryStore()
): Promise<AnalysisWorkerResponse[]> {
	return new Promise((resolve) => {
		const responses: AnalysisWorkerResponse[] = [];
		const post = (response: AnalysisWorkerResponse) => {
			responses.push(response);
			if (response.type !== 'progress') resolve(responses);
		};
		for (const message of messages) handleAnalysisMessage(message, post, store);
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

const progressOf = (responses: AnalysisWorkerResponse[]) =>
	responses.flatMap((response) => (response.type === 'progress' ? [response.done] : []));

describe('the analysis worker protocol', () => {
	describe('loading a log', () => {
		it('reports progress, then leaves the library holding what a direct call reports', async () => {
			const store = createMemoryStore();
			const responses = await drive(
				[
					{
						type: 'ingest',
						requestId: 7,
						text: emailed,
						fileName: 'a.txt',
						now: 'now',
						options: { seed: 2 },
					},
				],
				store
			);
			expect(responses[0]).toEqual({ type: 'progress', requestId: 7, done: 0, total: 4 });
			expect(responses.at(-1)).toMatchObject({
				type: 'complete',
				requestId: 7,
				imported: { importedAt: 'now', fileName: 'a.txt', hands: 4, added: 4 },
			});
			const library = await loadLibrary(store);
			expect(libraryReport({ ...library, meta: library.meta! })).toEqual(
				summed(analyzeLog(emailed, { seed: 2 }))
			);
		});

		it('works in chunks, posting progress between them', async () => {
			const responses = await drive([{ type: 'ingest', requestId: 1, text: longLog }]);
			expect(progressOf(responses)).toEqual([0, 5, 10]);
			expect(responses.at(-1)!.type).toBe('complete');
		});

		it('grades nothing the library already holds', async () => {
			const store = createMemoryStore();
			await drive([{ type: 'ingest', requestId: 1, text: longLog }], store);
			const responses = await drive(
				[{ type: 'ingest', requestId: 2, text: longLog }],
				store
			);
			expect(responses.slice(0, -1)).toEqual([
				{ type: 'progress', requestId: 2, done: 0, total: 0 },
			]);
			expect(responses.at(-1)).toMatchObject({
				type: 'complete',
				imported: { hands: 12, added: 0, replaced: 0 },
			});
		});

		it('answers a file with no hands in it with an error', async () => {
			const responses = await drive([
				{ type: 'ingest', requestId: 5, text: 'not a hand history' },
			]);
			expect(responses).toEqual([
				{
					type: 'error',
					requestId: 5,
					message: 'No PokerStars hands found in that file.',
				},
			]);
		});
	});

	describe('a run with no log', () => {
		it('brings the library up to date and imports nothing', async () => {
			const store = createMemoryStore();
			await drive([{ type: 'ingest', requestId: 1, text: emailed }], store);
			const responses = await drive(
				[{ type: 'ingest', requestId: 2, text: '', options: { seed: 9 } }],
				store
			);
			expect(responses[0]).toMatchObject({ type: 'progress', total: 4 });
			expect(responses.at(-1)).toMatchObject({ type: 'complete', imported: null });
			expect((await store.meta())!.seed).toBe(9);
			expect((await loadLibrary(store)).stale).toBe(0);
		});
	});

	describe('cancelling', () => {
		it('stops the run, keeping what it had finished', async () => {
			const store = createMemoryStore();
			const responses = await drive(
				[
					{ type: 'ingest', requestId: 3, text: longLog },
					{ type: 'cancel', requestId: 3 },
				],
				store
			);
			expect(responses.at(-1)).toEqual({ type: 'cancelled', requestId: 3 });
			expect((await store.rows()).length).toBeLessThan(12);
			expect(await store.imports()).toEqual([]);
		});

		it('ignores a cancel for a run it is not on', async () => {
			const responses = await drive([
				{ type: 'ingest', requestId: 4, text: emailed },
				{ type: 'cancel', requestId: 99 },
			]);
			expect(responses.at(-1)!.type).toBe('complete');
		});
	});
});
