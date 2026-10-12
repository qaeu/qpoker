import { describe, it, expect } from 'vitest';

import { forgetImport, handsOnlyIn } from '#utils/store/forget';
import { ingestLog } from '#utils/store/ingest';
import { createMemoryStore } from '#utils/store/memoryStore';
import type { HandStore, ImportRecord } from '#utils/store/types';

import { handText, RIVER_HERO_CALL, ringHand } from '../history/handText';

const folded = ringHand(6, 'As Ad', 'fold', 6001);
const opened = ringHand(6, 'Ah Kd', 'raise', 6002);
const called = handText(RIVER_HERO_CALL);
const added = ringHand(6, 'Kh Kd', 'raise', 6500);
const first = [folded, opened, called].join('\n');
const second = [opened, added].join('\n');

/** Two logs with a hand in common. */
async function fill(): Promise<HandStore> {
	const store = createMemoryStore();
	await ingestLog(store, first, { seed: 5, fileName: 'a.txt', now: 't1' });
	await ingestLog(store, second, { fileName: 'b.txt', now: 't2' });
	return store;
}

async function only(log: string): Promise<HandStore> {
	const store = createMemoryStore();
	await ingestLog(store, log, { seed: 5, fileName: 'a.txt', now: 't1' });
	return store;
}

/** What is known of each player that a profile is read from, by name. */
const seen = async (store: HandStore) =>
	(await store.players())
		.map(({ name, firstSeen, lastSeen, tally, money, showdowns }) => ({
			name,
			firstSeen,
			lastSeen,
			hands: tally.hands,
			money,
			showdowns,
		}))
		.sort((a, b) => (a.name < b.name ? -1 : 1));

const record = (importedAt: string, handIds?: string[]): ImportRecord => ({
	importedAt,
	fileName: `${importedAt}.txt`,
	hands: handIds?.length ?? 0,
	added: 0,
	replaced: 0,
	handIds,
});

describe('forgetting a log', () => {
	describe('the hands that go with it', () => {
		it('are those in no other log', () => {
			const imports = [record('t1', ['1', '2', '3']), record('t2', ['2', '4'])];
			expect(handsOnlyIn(imports, 't1')).toEqual(['1', '3']);
			expect(handsOnlyIn(imports, 't2')).toEqual(['4']);
		});

		it('are not known for an import that did not record its hands', () => {
			expect(handsOnlyIn([record('t1')], 't1')).toBeNull();
			expect(handsOnlyIn([], 't1')).toBeNull();
		});
	});

	describe('the later of two logs', () => {
		it('leaves the library as the first log alone made it', async () => {
			const store = await fill();
			const reference = await only(first);
			expect(await forgetImport(store, 't2')).toBe(1);
			// A rake that moved back leaves hands to be graded again, as any import would.
			await ingestLog(store, '');

			expect(await store.rows()).toEqual(await reference.rows());
			expect(await store.meta()).toEqual(await reference.meta());
			expect(await store.imports()).toEqual(await reference.imports());
			expect(await seen(store)).toEqual(await seen(reference));
			expect(await store.detail('6500')).toBeNull();
			expect(await store.raw(['6500'])).toEqual(new Map());
		});
	});

	describe('the earlier of two logs', () => {
		it('keeps the hand the other log holds too', async () => {
			const store = await fill();
			const reference = await only(second);
			expect(await forgetImport(store, 't1')).toBe(2);
			await ingestLog(store, '');

			expect(await store.rows()).toEqual(await reference.rows());
			expect(await store.meta()).toEqual(await reference.meta());
			expect((await store.imports()).map(({ fileName }) => fileName)).toEqual(['b.txt']);
		});

		it('knows its players by the hands that are left', async () => {
			const store = await fill();
			await forgetImport(store, 't1');
			expect(await seen(store)).toEqual(await seen(await only(second)));
		});
	});

	describe('the only log', () => {
		it('leaves no hand and no player', async () => {
			const store = await only(first);
			expect(await forgetImport(store, 't1')).toBe(3);
			expect(await store.rows()).toEqual([]);
			expect(await store.players()).toEqual([]);
			expect(await store.imports()).toEqual([]);
			expect((await store.meta())?.rakes).toEqual({});
		});
	});
});
