import { describe, it, expect } from 'vitest';

import { ingestLog } from '#utils/store/ingest';
import { createMemoryStore } from '#utils/store/memoryStore';
import { profileOf } from '#utils/store/profile';

import emailed from '../../fixtures/emailed.txt?raw';
import { ringHand } from '../history/handText';

async function profile(log: string, name: string) {
	const store = createMemoryStore();
	await ingestLog(store, log);
	const [player] = await store.players([name]);
	return profileOf(player);
}

const hands = (count: number, action: 'fold' | 'raise') =>
	Array.from({ length: count }, (_, i) => ringHand(6, '7c 2d', action, 100 + i)).join(
		'\n'
	);

describe('a player’s profile', () => {
	it('sets their frequencies against the charts for their own spots', async () => {
		const read = await profile(emailed, 'Brakeman1990');
		expect(read).toMatchObject({ name: 'Brakeman1990', hands: 4 });
		expect(read.firstSeen <= read.lastSeen).toBe(true);
		const vpip = read.session.stats.find((stat) => stat.id === 'vpip')!;
		expect(vpip).toMatchObject({ opportunities: 4, baselineSource: 'charts' });
	});

	describe('reads', () => {
		it('are made of nothing while the sample is small', async () => {
			expect((await profile(hands(5, 'raise'), 'hero')).reads).toEqual([]);
		});

		it('say what a frequency clearly off its baseline invites', async () => {
			// Under the gun every hand and opening all of them.
			const { reads } = await profile(hands(30, 'raise'), 'hero');
			const ids = reads.map(({ stat }) => stat.id);
			expect(ids).toEqual(expect.arrayContaining(['vpip', 'rfi']));
			for (const { stat, note } of reads) {
				expect(stat.leak).toBe('high');
				expect(note.length).toBeGreaterThan(10);
			}
		});

		it('read the other way for a player who never plays', async () => {
			const { reads } = await profile(hands(60, 'fold'), 'hero');
			expect(reads.find(({ stat }) => stat.id === 'vpip')).toMatchObject({
				stat: { leak: 'low' },
				note: expect.stringMatching(/few hands/),
			});
		});
	});

	it('lists what they showed, the latest first', async () => {
		const store = createMemoryStore();
		await ingestLog(store, emailed);
		const shown = (await store.players())
			.map(profileOf)
			.filter((player) => player.showdowns.length > 0);
		expect(shown.length).toBeGreaterThan(0);
		for (const { showdowns } of shown) {
			expect(showdowns[0].cards).toMatch(/^\w\w \w\w$/);
			const times = showdowns.map(({ timestamp }) => timestamp);
			expect(times).toEqual([...times].sort().reverse());
		}
	});
});
