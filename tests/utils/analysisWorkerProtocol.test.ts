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
						logs: [{ text: emailed, fileName: 'a.txt', now: 'now' }],
						options: { seed: 2 },
					},
				],
				store
			);
			expect(responses[0]).toEqual({
				type: 'progress',
				requestId: 7,
				done: 0,
				total: 4,
				log: 1,
				logs: 1,
			});
			expect(responses.at(-1)).toMatchObject({
				type: 'complete',
				requestId: 7,
				imported: [{ importedAt: 'now', fileName: 'a.txt', hands: 4, added: 4 }],
				empty: [],
			});
			const library = await loadLibrary(store);
			expect(libraryReport({ ...library, meta: library.meta! })).toEqual(
				summed(analyzeLog(emailed, { seed: 2 }))
			);
		});

		it('works in chunks, posting progress between them', async () => {
			const responses = await drive([
				{ type: 'ingest', requestId: 1, logs: [{ text: longLog }] },
			]);
			expect(progressOf(responses)).toEqual([0, 5, 10]);
			expect(responses.at(-1)!.type).toBe('complete');
		});

		it('grades nothing the library already holds', async () => {
			const store = createMemoryStore();
			await drive([{ type: 'ingest', requestId: 1, logs: [{ text: longLog }] }], store);
			const responses = await drive(
				[{ type: 'ingest', requestId: 2, logs: [{ text: longLog }] }],
				store
			);
			expect(responses.slice(0, -1)).toEqual([
				{ type: 'progress', requestId: 2, done: 0, total: 0, log: 1, logs: 1 },
			]);
			expect(responses.at(-1)).toMatchObject({
				type: 'complete',
				imported: [{ hands: 12, added: 0, replaced: 0 }],
			});
		});

		it('names a file with no hands in it, and imports nothing', async () => {
			const store = createMemoryStore();
			const responses = await drive(
				[
					{
						type: 'ingest',
						requestId: 5,
						logs: [{ text: 'not a hand history', fileName: 'notes.txt' }],
					},
				],
				store
			);
			expect(responses).toEqual([
				{
					type: 'complete',
					requestId: 5,
					imported: [],
					empty: ['notes.txt'],
					elapsedMs: expect.any(Number) as number,
				},
			]);
			expect(await store.imports()).toEqual([]);
		});
	});

	describe('loading several logs at once', () => {
		const logs = [
			{ text: emailed, fileName: 'a.txt', now: 't1' },
			{ text: 'not a hand history', fileName: 'notes.txt', now: 't2' },
			{ text: longLog, fileName: 'c.txt', now: 't3' },
		];

		it('loads each in turn, recording an import for each', async () => {
			const store = createMemoryStore();
			const responses = await drive([{ type: 'ingest', requestId: 1, logs }], store);
			expect(responses.at(-1)).toMatchObject({
				type: 'complete',
				imported: [
					{ importedAt: 't1', fileName: 'a.txt', hands: 4, added: 4 },
					{ importedAt: 't3', fileName: 'c.txt', hands: 12, added: 12 },
				],
				empty: ['notes.txt'],
			});
			expect(await store.rows()).toHaveLength(16);
			expect((await store.imports()).map((record) => record.fileName)).toEqual([
				'a.txt',
				'c.txt',
			]);
		});

		it('says which log its progress is of', async () => {
			const responses = await drive([{ type: 'ingest', requestId: 1, logs }]);
			const progress = responses.flatMap((response) =>
				response.type === 'progress' ?
					[[response.log, response.logs, response.done, response.total]]
				:	[]
			);
			expect(progress).toEqual([
				[1, 3, 0, 4],
				[3, 3, 0, 12],
				[3, 3, 5, 12],
				[3, 3, 10, 12],
			]);
		});

		it('counts a hand that two of them hold once', async () => {
			const store = createMemoryStore();
			const responses = await drive(
				[{ type: 'ingest', requestId: 1, logs: [logs[0], { ...logs[0], now: 't2' }] }],
				store
			);
			expect(responses.at(-1)).toMatchObject({
				imported: [{ added: 4 }, { hands: 4, added: 0 }],
			});
			expect(await store.rows()).toHaveLength(4);
		});

		it('stops at a cancel, keeping the logs it had finished', async () => {
			const store = createMemoryStore();
			const responses: AnalysisWorkerResponse[] = [];
			await new Promise<void>((resolve) => {
				const post = (response: AnalysisWorkerResponse) => {
					responses.push(response);
					// Cancelled as the last log starts.
					if (response.type === 'progress' && response.log === 3 && response.done === 0) {
						handleAnalysisMessage({ type: 'cancel', requestId: 1 }, post, store);
					}
					if (response.type !== 'progress') resolve();
				};
				handleAnalysisMessage({ type: 'ingest', requestId: 1, logs }, post, store);
			});
			expect(responses.at(-1)).toEqual({ type: 'cancelled', requestId: 1 });
			expect(await store.rows()).toHaveLength(4);
			expect((await store.imports()).map((record) => record.fileName)).toEqual(['a.txt']);
		});
	});

	describe('a run with no log', () => {
		it('brings the library up to date and imports nothing', async () => {
			const store = createMemoryStore();
			await drive([{ type: 'ingest', requestId: 1, logs: [{ text: emailed }] }], store);
			const responses = await drive(
				[{ type: 'ingest', requestId: 2, logs: [], options: { seed: 9 } }],
				store
			);
			expect(responses[0]).toMatchObject({ type: 'progress', total: 4 });
			expect(responses.at(-1)).toMatchObject({ type: 'complete', imported: [] });
			expect((await store.meta())!.seed).toBe(9);
			expect((await loadLibrary(store)).stale).toBe(0);
		});
	});

	describe('cancelling', () => {
		it('stops the run, keeping what it had finished', async () => {
			const store = createMemoryStore();
			const responses = await drive(
				[
					{ type: 'ingest', requestId: 3, logs: [{ text: longLog }] },
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
				{ type: 'ingest', requestId: 4, logs: [{ text: emailed }] },
				{ type: 'cancel', requestId: 99 },
			]);
			expect(responses.at(-1)!.type).toBe('complete');
		});
	});
});
