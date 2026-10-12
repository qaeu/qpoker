import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@solidjs/testing-library';

import PlayersView from '#c/players/PlayersView';
import { ingestLog } from '#utils/store/ingest';
import { createMemoryStore } from '#utils/store/memoryStore';

import emailed from '../../fixtures/emailed.txt?raw';
import { ringHand } from '../../utils/history/handText';

async function playersOf(log: string) {
	const store = createMemoryStore();
	await ingestLog(store, log);
	return store.players();
}

const opens = Array.from({ length: 30 }, (_, i) =>
	ringHand(6, '7c 2d', 'raise', 100 + i)
);

describe('PlayersView', () => {
	describe('the list', () => {
		it('lists everyone but the hero, by hands seen', async () => {
			const players = await playersOf(emailed);
			render(() => <PlayersView players={players} heroes={['hero77']} name={null} />);
			const names = screen
				.getAllByRole('link')
				.map((link) => link.textContent)
				.filter((name) => players.some((player) => player.name === name));
			expect(names).not.toContain('hero77');
			expect(names).toHaveLength(players.length - 1);
		});

		it('finds a player by part of their name', async () => {
			const players = await playersOf(emailed);
			render(() => <PlayersView players={players} heroes={['hero77']} name={null} />);
			const search = screen.getByRole('searchbox', { name: 'Find a player' });
			fireEvent.input(search, { target: { value: 'brakeman' } });
			expect(screen.getAllByRole('link', { name: 'Brakeman1990' })).toHaveLength(1);
			fireEvent.input(search, { target: { value: 'nobody at all' } });
			expect(screen.getByText('No player by that name.')).toBeTruthy();
		});
	});

	describe('the player being read', () => {
		it('is the one the route names, with their frequencies and sample', async () => {
			const players = await playersOf(emailed);
			render(() => (
				<PlayersView players={players} heroes={['hero77']} name="Brakeman1990" />
			));
			expect(screen.getByRole('heading', { name: 'Brakeman1990' })).toBeTruthy();
			expect(
				screen.getByRole('link', { name: 'Brakeman1990' }).getAttribute('aria-current')
			).toBe('true');
			const vpip = screen.getByRole('row', { name: /^VPIP/ });
			expect(within(vpip).getByText(/\/4$/)).toBeTruthy();
		});

		it('is the one seen most when the route names none', async () => {
			const players = await playersOf(opens.join('\n'));
			render(() => <PlayersView players={players} heroes={['hero']} name={null} />);
			expect(screen.getAllByRole('heading')[1].textContent).toMatch(/^p\d$/);
		});

		it('reads nothing into a small sample', async () => {
			const players = await playersOf(emailed);
			render(() => (
				<PlayersView players={players} heroes={['hero77']} name="Brakeman1990" />
			));
			expect(screen.getByText(/Nothing in their play is far enough/)).toBeTruthy();
			expect(screen.queryByRole('list', { name: 'Reads' })).toBeNull();
		});

		it('says what a frequency clearly off its baseline invites', async () => {
			// The hero's own aggregate, read as an opponent's would be.
			const players = await playersOf(opens.join('\n'));
			render(() => <PlayersView players={players} heroes={['nobody']} name="hero" />);
			const reads = within(screen.getByRole('list', { name: 'Reads' }));
			expect(reads.getByText(/Plays too many hands/)).toBeTruthy();
			expect(reads.getByText(/^VPIP 100% against \d+%$/)).toBeTruthy();
		});

		it('links each hand they showed to its replay', async () => {
			const players = await playersOf(emailed);
			const shower = players.find((player) => player.showdowns.length > 0)!;
			render(() => (
				<PlayersView players={players} heroes={['hero77']} name={shower.name} />
			));
			expect(screen.getByRole('heading', { name: 'Shown down' })).toBeTruthy();
			const link = screen
				.getAllByRole<HTMLAnchorElement>('link')
				.find((candidate) => candidate.getAttribute('href')!.startsWith('#review'))!;
			expect(link.getAttribute('href')).toBe(
				`#review?show=all&hand=${shower.showdowns.at(-1)!.handId}`
			);
		});
	});
});
