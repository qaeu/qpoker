import { describe, it, expect } from 'vitest';

import { backupName, backupOf, logTextOf } from '#utils/store/backup';
import { ingestLog } from '#utils/store/ingest';
import { createMemoryStore } from '#utils/store/memoryStore';

import emailed from '../../fixtures/emailed.txt?raw';

describe('a copy of the library', () => {
	it('is named for when it was made', () => {
		expect(backupName(backupOf('hero', [], '2026-10-12T10:00:00.123Z'))).toBe(
			'qpoker-library-2026-10-12T10-00-00Z.json'
		);
	});

	it('loads back into an empty library as the same hands', async () => {
		const store = createMemoryStore();
		await ingestLog(store, emailed, { seed: 5 });
		const rows = await store.rows();
		const raw = await store.raw(rows.map(({ summary }) => summary.id));
		const file = JSON.stringify(
			backupOf('hero77', [...raw.values()], '2026-10-12T10:00:00Z')
		);

		const restored = createMemoryStore();
		await ingestLog(restored, logTextOf(file), { seed: 5 });
		expect(await restored.rows()).toEqual(rows);
		expect(await restored.players()).toEqual(await store.players());
	});

	describe('any other file', () => {
		it.each([
			['a hand history', emailed],
			['JSON that is not a copy', '{"hands": 3}'],
			['a copy of another version', '{"version": 99, "hands": []}'],
			['something cut short', '{"version": 1, "hands": ['],
		])('is read as it is: %s', (_, file) => {
			expect(logTextOf(file)).toBe(file);
		});
	});
});
