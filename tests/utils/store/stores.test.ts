import { describe, it, expect } from 'vitest';

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createFileStore } from '#cli/fileStore';
import { ingestLog } from '#utils/store/ingest';
import { openIdbStore } from '#utils/store/idbStore';
import { loadLibrary } from '#utils/store/library';
import { createMemoryStore } from '#utils/store/memoryStore';
import type { HandStore } from '#utils/store/types';

import emailed from '../../fixtures/emailed.txt?raw';
import { handText, RIVER_HERO_CALL, ringHand } from '../history/handText';

const second = [ringHand(6, 'Ah Kd', 'raise', 6002), handText(RIVER_HERO_CALL)].join(
	'\n'
);

/** Two logs, the second in two steps: everything a store is asked to hold. */
async function fill(store: HandStore): Promise<void> {
	await ingestLog(store, emailed, { fileName: 'a.txt', now: '2026-10-12T10:00:00Z' });
	await ingestLog(store, second, { fileName: 'b.txt', now: '2026-10-12T11:00:00Z' });
}

const byName = <T extends { name: string }>(players: T[]): T[] =>
	[...players].sort((a, b) => (a.name < b.name ? -1 : 1));

/** Every adapter is held to what the memory store does. */
describe.each([
	['in memory', () => createMemoryStore()],
	['in IndexedDB', () => openIdbStore('contract')],
	['in files', () => createFileStore(mkdtempSync(join(tmpdir(), 'qpoker-')))],
])('a hand store %s', (_, create) => {
	it('is empty until something is loaded', async () => {
		const store = create();
		expect(await store.meta()).toBeNull();
		expect(await store.rows()).toEqual([]);
		expect(await store.known()).toEqual(new Map());
		expect(await store.players()).toEqual([]);
		expect(await store.imports()).toEqual([]);
		expect(await store.detail('1')).toBeNull();
		expect(await store.raw(['1'])).toEqual(new Map());
	});

	it('holds what the reference store holds', async () => {
		const store = create();
		const reference = createMemoryStore();
		await fill(store);
		await fill(reference);

		const rows = await store.rows();
		expect(rows).toEqual(await reference.rows());
		expect(rows.map(({ summary }) => summary.timestamp)).toEqual(
			rows.map(({ summary }) => summary.timestamp).sort()
		);
		expect(await store.known()).toEqual(await reference.known());
		expect(await store.meta()).toEqual(await reference.meta());
		expect(await store.imports()).toEqual(await reference.imports());
		expect(byName(await store.players())).toEqual(byName(await reference.players()));

		const ids = rows.map(({ summary }) => summary.id);
		expect(await store.raw(ids)).toEqual(await reference.raw(ids));
		for (const id of ids)
			expect(await store.detail(id)).toEqual(await reference.detail(id));
		expect(await loadLibrary(store)).toEqual(await loadLibrary(reference));
	});

	it('finds only the players asked for', async () => {
		const store = create();
		await fill(store);
		expect((await store.players(['p2', 'nobody'])).map((player) => player.name)).toEqual([
			'p2',
		]);
	});

	it('forgets everything when cleared', async () => {
		const store = create();
		await fill(store);
		await store.clear();
		expect(await store.meta()).toBeNull();
		expect(await store.rows()).toEqual([]);
		expect(await store.players()).toEqual([]);
		expect(await store.imports()).toEqual([]);
	});
});

describe('the IndexedDB store', () => {
	it('is still there for whoever opens it next, as the page and the worker each do', async () => {
		const store = openIdbStore('shared');
		await fill(store);
		const again = openIdbStore('shared');
		expect(await again.rows()).toEqual(await store.rows());
		expect(await again.meta()).toEqual(await store.meta());
	});

	it('keeps libraries of different names apart', async () => {
		await fill(openIdbStore('one'));
		expect(await openIdbStore('other').rows()).toEqual([]);
	});
});

describe('the file store', () => {
	const directory = () => mkdtempSync(join(tmpdir(), 'qpoker-'));

	it('is still there for the next run', async () => {
		const at = directory();
		await fill(createFileStore(at));
		const reference = createMemoryStore();
		await fill(reference);
		const again = createFileStore(at);
		expect(await again.rows()).toEqual(await reference.rows());
		expect(await again.detail('7001')).toEqual(await reference.detail('7001'));
		expect(await again.imports()).toEqual(await reference.imports());
	});

	it('only adds to its files, and reads the later line for a hand', async () => {
		const at = directory();
		const store = createFileStore(at);
		await ingestLog(store, emailed, { seed: 1 });
		const before = readFileSync(join(at, 'rows.jsonl'), 'utf8');
		await ingestLog(store, '', { seed: 2 });
		const after = readFileSync(join(at, 'rows.jsonl'), 'utf8');
		expect(after.startsWith(before)).toBe(true);
		expect(after.split('\n').length).toBeGreaterThan(before.split('\n').length);
		const rows = await createFileStore(at).rows();
		expect(rows).toHaveLength(4);
		expect(rows.every(({ key }) => key.seed === 2)).toBe(true);
	});

	it('finishes a commit that an earlier run was cut short in', async () => {
		const at = directory();
		const reference = createMemoryStore();
		await fill(reference);
		const rows = await reference.rows();
		const raw = await reference.raw(rows.map(({ summary }) => summary.id));
		// As a run that died after writing its journal and before applying it.
		writeFileSync(
			join(at, 'journal.json'),
			JSON.stringify({
				hands: await Promise.all(
					rows.map(async (row) => ({
						...row,
						detail: await reference.detail(row.summary.id),
						raw: raw.get(row.summary.id),
					}))
				),
				players: await reference.players(),
				meta: await reference.meta(),
			})
		);
		const store = createFileStore(at);
		expect(await store.rows()).toEqual(rows);
		expect(byName(await store.players())).toEqual(byName(await reference.players()));
		expect(await store.meta()).toEqual(await reference.meta());
	});

	it('ignores a journal that was itself cut short', async () => {
		const at = directory();
		writeFileSync(join(at, 'journal.json'), '{"hands": [');
		expect(await createFileStore(at).rows()).toEqual([]);
	});
});
