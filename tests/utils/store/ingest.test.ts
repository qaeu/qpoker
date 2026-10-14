import { describe, it, expect } from 'vitest';

import {
	analyzeLog,
	FACTS_VERSION,
	REPORT_VERSION,
	splitReport,
	type ReportSummary,
} from '#utils/coach/report';
import { emptyTally, sessionOf, summariseSession } from '#utils/coach/session';
import { parseHistory } from '#utils/history/parse';
import { replayHand } from '#utils/history/replay';
import { advanceIngest, ingestLog, rateOf, startIngest } from '#utils/store/ingest';
import { libraryReport, loadLibrary } from '#utils/store/library';
import { createMemoryStore } from '#utils/store/memoryStore';
import type { HandStore } from '#utils/store/types';

import emailed from '../../fixtures/emailed.txt?raw';
import { summed } from '../coach/summed';
import { handText, RIVER_HERO_CALL, ringHand } from '../history/handText';

const folded = ringHand(6, 'As Ad', 'fold', 6001);
const opened = ringHand(6, 'Ah Kd', 'raise', 6002);
const called = handText(RIVER_HERO_CALL);
const log = [folded, opened, called].join('\n');

async function reportOf(store: HandStore): Promise<ReportSummary> {
	const library = await loadLibrary(store);
	return libraryReport({ ...library, meta: library.meta! });
}

const ids = async (store: HandStore) =>
	(await store.rows()).map(({ summary }) => summary.id);

describe('loading a log into the library', () => {
	describe('one log', () => {
		it('reports what an analysis of the log reports', async () => {
			const store = createMemoryStore();
			await ingestLog(store, emailed, { seed: 5 });
			expect(await reportOf(store)).toEqual(summed(analyzeLog(emailed, { seed: 5 })));
		});

		it('stores each hand in its two halves, and the text it came from', async () => {
			const store = createMemoryStore();
			await ingestLog(store, log, { seed: 5 });
			const report = analyzeLog(log, { seed: 5 });
			const [row] = await store.rows();
			const { summary, detail } = splitReport(report.hands[0]);
			expect(row.summary).toEqual(summary);
			expect(row.key).toEqual({
				version: REPORT_VERSION,
				facts: FACTS_VERSION,
				hero: 'hero',
				seed: 5,
				samples: null,
				rake: null,
			});
			expect(await store.detail('6001')).toEqual(detail);
			const raw = (await store.raw(['6001'])).get('6001')!;
			expect(parseHistory(raw)[0].digest).toBe(summary.digest);
		});

		it('records the import', async () => {
			const store = createMemoryStore();
			await ingestLog(store, log, { fileName: 'a.txt', now: '2026-10-12T10:00:00Z' });
			expect(await store.imports()).toEqual([
				{
					importedAt: '2026-10-12T10:00:00Z',
					fileName: 'a.txt',
					hands: 3,
					added: 3,
					replaced: 0,
					handIds: ['6001', '6002', '7001'],
				},
			]);
		});

		it('can be run a few hands at a time, keeping what it has done', async () => {
			const store = createMemoryStore();
			const run = await startIngest(store, log, { seed: 5 });
			expect(run).toMatchObject({ done: 0, total: 3 });
			expect(await advanceIngest(run, 2)).toBe(false);
			expect(await ids(store)).toEqual(['6001', '6002']);
			expect(await store.imports()).toEqual([]);

			// Abandoned there, another run picks up only what is left.
			const again = await startIngest(store, log, { seed: 5 });
			expect(again.total).toBe(1);
			expect(await advanceIngest(again)).toBe(true);
			expect(await reportOf(store)).toEqual(summed(analyzeLog(log, { seed: 5 })));
		});
	});

	describe('a second log', () => {
		const added = ringHand(6, 'Kh Kd', 'raise', 6500);

		it('adds its hands to the first, in the order they were played', async () => {
			const store = createMemoryStore();
			await ingestLog(store, log, { seed: 5 });
			const run = await ingestLog(store, added);
			expect(run.total).toBe(1);
			expect(await ids(store)).toEqual(['6001', '6002', '6500', '7001']);
			expect(await reportOf(store)).toEqual(
				summed(analyzeLog(`${log}\n${added}`, { seed: 5 }))
			);
		});

		it('grades nothing for hands it already has', async () => {
			const store = createMemoryStore();
			await ingestLog(store, log, { seed: 5 });
			const run = await ingestLog(store, `${opened}\n${added}`, { now: 'later' });
			expect(run.total).toBe(1);
			expect(run.imported).toMatchObject({ hands: 2, added: 1, replaced: 0 });
		});

		it('replaces a hand that was cut short the first time', async () => {
			const store = createMemoryStore();
			const cut = log.slice(0, log.lastIndexOf('*** SUMMARY ***'));
			await ingestLog(store, cut, { seed: 5 });
			const run = await ingestLog(store, log);
			expect(run.imported).toMatchObject({ added: 0, replaced: 1 });
			expect(await reportOf(store)).toEqual(summed(analyzeLog(log, { seed: 5 })));
		});

		it('takes the same hand twice in a file as one', async () => {
			const store = createMemoryStore();
			await ingestLog(store, `${log}\n${log}`);
			expect(await ids(store)).toHaveLength(3);
		});
	});

	describe('the same file again', () => {
		const added = ringHand(6, 'Kh Kd', 'raise', 6500);
		const load = (store: HandStore, text: string, fileName: string, now: string) =>
			ingestLog(store, text, { fileName, now });

		it('takes the place of the earlier load in the list of imports', async () => {
			const store = createMemoryStore();
			await load(store, log, 'a.txt', 't1');
			await load(store, log, 'a.txt', 't2');
			expect(await store.imports()).toEqual([
				{
					importedAt: 't2',
					fileName: 'a.txt',
					hands: 3,
					added: 3,
					replaced: 0,
					handIds: ['6001', '6002', '7001'],
				},
			]);
		});

		it('counts the hands a grown log has gained with the ones it brought before', async () => {
			const store = createMemoryStore();
			await load(store, log, 'a.txt', 't1');
			const run = await load(store, `${log}\n${added}`, 'a.txt', 't2');
			expect(run.imported).toMatchObject({ hands: 4, added: 1 });
			expect(await store.imports()).toEqual([
				expect.objectContaining({ importedAt: 't2', hands: 4, added: 4, replaced: 0 }),
			]);
		});

		it('does not count a hand it finishes as one more', async () => {
			const store = createMemoryStore();
			const cut = log.slice(0, log.lastIndexOf('*** SUMMARY ***'));
			await load(store, cut, 'a.txt', 't1');
			await load(store, log, 'a.txt', 't2');
			expect(await store.imports()).toEqual([
				expect.objectContaining({ hands: 3, added: 3, replaced: 0 }),
			]);
		});

		it('keeps apart a file of the same name that lacks hands the earlier one had', async () => {
			const store = createMemoryStore();
			await load(store, log, 'a.txt', 't1');
			await load(store, added, 'a.txt', 't2');
			expect((await store.imports()).map(({ importedAt }) => importedAt)).toEqual([
				't1',
				't2',
			]);
		});

		it('keeps apart another file, and a log with no name', async () => {
			const store = createMemoryStore();
			await load(store, log, 'a.txt', 't1');
			await load(store, log, 'b.txt', 't2');
			await load(store, log, '', 't3');
			await load(store, log, '', 't4');
			expect(await store.imports()).toHaveLength(4);
		});

		it('records nothing until the run is done', async () => {
			const store = createMemoryStore();
			await load(store, log, 'a.txt', 't1');
			const run = await startIngest(store, `${log}\n${added}`, {
				fileName: 'a.txt',
				now: 't2',
			});
			expect(run.reloads).toEqual(['t1']);
			expect(await advanceIngest(run, 0)).toBe(false);
			expect((await store.imports()).map(({ importedAt }) => importedAt)).toEqual(['t1']);
		});
	});

	describe('settings', () => {
		it('keeps the seed of the first import, and names no hero unless told one', async () => {
			const store = createMemoryStore();
			await ingestLog(store, log, { seed: 5 });
			await ingestLog(store, ringHand(6, 'Kh Kd', 'raise', 6500));
			expect(await store.meta()).toMatchObject({ hero: '', seed: 5, samples: null });
			expect(await loadLibrary(store)).toMatchObject({ hero: 'hero', heroes: ['hero'] });
		});

		it('grades every hand again under another seed', async () => {
			const store = createMemoryStore();
			await ingestLog(store, log, { seed: 5 });
			const run = await startIngest(store, '', { seed: 6 });
			expect(run.total).toBe(3);
			expect(run.imported).toBeNull();
			await advanceIngest(run);
			expect(await reportOf(store)).toEqual(summed(analyzeLog(log, { seed: 6 })));
		});

		it('holds back the hands a run has not yet brought up to date', async () => {
			const store = createMemoryStore();
			await ingestLog(store, log, { seed: 5 });
			const run = await startIngest(store, '', { hero: 'p2' });
			await advanceIngest(run, 1);
			expect(await loadLibrary(store)).toMatchObject({
				meta: { hero: 'p2' },
				hero: 'p2',
				stale: 2,
				hands: [{ id: '6001' }],
			});
		});

		it('grades again only the hands priced with a rake that has moved', async () => {
			const store = createMemoryStore();
			await ingestLog(store, log, { seed: 5 });
			const run = await startIngest(store, '', { rake: 0.1 });
			expect(run.jobs.map((job) => [job.id, job.kind])).toEqual([['7001', 'regrade']]);
			await advanceIngest(run);
			expect(await reportOf(store)).toEqual(
				summed(analyzeLog(log, { seed: 5, rake: 0.1 }))
			);
		});

		it('sums a hand up again, without grading it, when only the facts are older', async () => {
			const store = createMemoryStore();
			await ingestLog(store, log, { seed: 5 });
			const meta = (await store.meta())!;
			const before = await store.players();
			const rows = await store.rows();
			const raw = await store.raw(rows.map(({ summary }) => summary.id));
			// As an older build would have left it: nothing summed, the players stale.
			await store.commit({
				meta: { ...meta, facts: FACTS_VERSION - 1 },
				hands: await Promise.all(
					rows.map(async ({ summary, key }) => ({
						summary: { ...summary, tally: null },
						key: { ...key, facts: FACTS_VERSION - 1 },
						detail: (await store.detail(summary.id))!,
						raw: raw.get(summary.id)!,
					}))
				),
				players: before.map((player) => ({ ...player, tally: emptyTally() })),
			});

			const run = await startIngest(store, '');
			expect(run.jobs.map((job) => job.kind)).toEqual(['resum', 'resum', 'resum']);
			await advanceIngest(run);
			expect(await reportOf(store)).toEqual(summed(analyzeLog(log, { seed: 5 })));
			expect(await store.players()).toEqual(before);
		});
	});

	describe('the rake', () => {
		it('is each stakes level’s own, over everything loaded at it', async () => {
			const store = createMemoryStore();
			await ingestLog(store, emailed);
			await ingestLog(store, log);
			const { rakes } = (await store.meta())!;
			// The recorded hands paid rake on their flops; the built ones pay none.
			expect(rakes['$0.02/$0.05']).toEqual({ pots: 473 + 52, rake: 24 + 3 });
			expect(rakes['$0.05/$0.10'].rake).toBe(0);
			const meta = (await store.meta())!;
			expect(rateOf(meta, '$0.02/$0.05')).toBe(0.05);
			expect(rateOf(meta, '$0.05/$0.10')).toBe(0);
			// A level nothing has been seen at takes the usual rate.
			expect(rateOf(meta, '$1.00/$2.00')).toBe(0.05);
		});
	});

	describe('the hero', () => {
		const builtOf = async (store: HandStore) =>
			(await store.rows()).filter(({ summary }) => summary.table === 'Builder');

		it('is whoever each hand was dealt to: one history, any number of names', async () => {
			const store = createMemoryStore();
			await ingestLog(store, emailed);
			await ingestLog(store, log);
			const built = await builtOf(store);
			expect(built).toHaveLength(3);
			expect(
				built.every(({ summary, key }) => summary.gradeable && key.hero === 'hero')
			).toBe(true);
			// Most of the hands are the first name's, so the report is headed with it.
			expect(await loadLibrary(store)).toMatchObject({
				hero: 'hero77',
				heroes: ['hero77', 'hero'],
				stale: 0,
			});
		});

		it('is one player for every hand once the user names one', async () => {
			const store = createMemoryStore();
			await ingestLog(store, emailed);
			await ingestLog(store, log, { hero: 'hero77' });
			expect((await builtOf(store)).every(({ summary }) => !summary.gradeable)).toBe(
				true
			);
			expect((await loadLibrary(store)).heroes).toEqual(['hero77']);
		});
	});

	describe('the players', () => {
		const sessionFor = (text: string, name: string) =>
			summariseSession(parseHistory(text).map(replayHand), name);

		it('sums every player dealt in, as a session would for each', async () => {
			const store = createMemoryStore();
			await ingestLog(store, emailed);
			const players = await store.players();
			expect(players.length).toBeGreaterThan(2);
			for (const player of players) {
				expect(sessionOf(player.tally)).toEqual(sessionFor(emailed, player.name));
			}
		});

		it('adds a later log to what is known of a player', async () => {
			const store = createMemoryStore();
			await ingestLog(store, `${folded}\n${opened}`);
			await ingestLog(store, called);
			const [p2] = await store.players(['p2']);
			expect(p2.tally.hands).toBe(3);
			expect(sessionOf(p2.tally)).toEqual(sessionFor(log, 'p2'));
			expect(p2.firstSeen < p2.lastSeen).toBe(true);
		});

		it('counts a hand once however often it is loaded or replaced', async () => {
			const store = createMemoryStore();
			const cut = log.slice(0, log.lastIndexOf('*** SUMMARY ***'));
			await ingestLog(store, cut);
			await ingestLog(store, log);
			await ingestLog(store, log);
			for (const player of await store.players()) {
				const session = sessionOf(player.tally);
				const expected = sessionFor(log, player.name);
				expect(session.hands).toBe(expected.hands);
				expect(player.money.USD.hands).toBe(expected.hands);
				expect(session.netBb).toBeCloseTo(expected.netBb);
				expect(
					session.stats.map((stat) => [stat.id, stat.count, stat.opportunities])
				).toEqual(
					expected.stats.map((stat) => [stat.id, stat.count, stat.opportunities])
				);
			}
		});

		it('keeps what each won and lost, and the hero against them', async () => {
			const store = createMemoryStore();
			await ingestLog(store, `${folded}\n${opened}`);
			await ingestLog(store, called);
			const [p2] = await store.players(['p2']);
			expect(p2.money).toEqual({ USD: { hands: 3, net: 500, heroNet: -500 } });
		});

		it('keeps what a player showed', async () => {
			const store = createMemoryStore();
			await ingestLog(store, emailed);
			const shown = (await store.players()).flatMap((player) => player.showdowns);
			const report = analyzeLog(emailed);
			expect(shown.length).toBe(
				report.hands.reduce((sum, hand) => sum + Object.keys(hand.shown).length, 0)
			);
		});
	});

	describe('a library nothing was loaded into', () => {
		it('is empty', async () => {
			expect(await loadLibrary(createMemoryStore())).toEqual({
				meta: null,
				hero: '',
				heroes: [],
				hands: [],
				stale: 0,
				imports: [],
			});
		});
	});
});
