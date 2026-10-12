import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@solidjs/testing-library';

import {
	follow,
	loadLog,
	mountApp,
	resetBrowserState,
	RUN_TIMEOUT_MS,
	settle,
	switchTo,
	TWO_HAND_LOG,
} from './appHarness';
import { handText, RIVER_HERO_CALL } from '../utils/history/handText';

/** Two logs, half an hour apart: the second a sitting of its own. */
async function loadTwoLogs(): Promise<void> {
	loadLog(TWO_HAND_LOG, 'first.txt');
	await screen.findByText(
		'hero · $0.05/$0.10 · 2 hands',
		{},
		{ timeout: RUN_TIMEOUT_MS }
	);
	loadLog(handText(RIVER_HERO_CALL), 'second.txt');
	await screen.findByText(
		'hero · $0.05/$0.10 · 3 hands',
		{},
		{ timeout: RUN_TIMEOUT_MS }
	);
}

describe('a library built from more than one log', () => {
	beforeEach(resetBrowserState);

	it(
		'reports over every hand, and narrows to a sitting from the address',
		async () => {
			mountApp();
			await loadTwoLogs();
			const scope = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Hands' });
			expect(scope.value).toBe('all');
			expect(
				within(scope).getByRole('option', { name: 'All time · 3 hands' })
			).toBeTruthy();

			fireEvent.change(scope, { target: { value: 'latest' } });
			await settle();
			expect(window.location.hash).toBe('#summary?scope=latest');
			expect(await screen.findByText('hero · $0.05/$0.10 · 1 hand')).toBeTruthy();

			// A link into Review keeps to the sitting.
			await follow(screen.getByRole('link', { name: 'Called without the price' }));
			expect(window.location.hash).toBe('#review?scope=latest&kind=call-without-odds');
			expect(await screen.findByRole('heading', { name: 'Hand 1 of 1' })).toBeTruthy();
		},
		RUN_TIMEOUT_MS
	);

	it(
		'sets the sittings out over time, each a way to its own report',
		async () => {
			mountApp();
			await loadTwoLogs();
			await switchTo('Trends');
			expect(screen.getByText(/Too few hands to say: 3 graded so far/)).toBeTruthy();
			const sittings = screen
				.getByRole('columnheader', { name: 'Sitting' })
				.closest('table')!;
			expect(within(sittings).getAllByRole('row')).toHaveLength(3);
			// No scope is offered here: a trend is over everything.
			expect(screen.queryByRole('combobox', { name: 'Hands' })).toBeNull();

			const library = within(screen.getByRole('region', { name: 'Hand library' }));
			expect(library.getByText('first.txt')).toBeTruthy();
			expect(library.getByText('second.txt')).toBeTruthy();
			expect(library.getByText(/3 hands from 2 logs/)).toBeTruthy();

			fireEvent.click(within(sittings).getAllByRole('link')[1]);
			await waitFor(() =>
				expect(window.location.hash).toMatch(/^#summary\?scope=2026-01-02T10/)
			);
			expect(await screen.findByText('hero · $0.05/$0.10 · 2 hands')).toBeTruthy();
		},
		RUN_TIMEOUT_MS
	);

	it(
		'knows a player met in both logs by all of their hands',
		async () => {
			mountApp();
			await loadTwoLogs();
			await switchTo('Players');
			const row = (await screen.findByRole('link', { name: 'p2' })).closest('tr')!;
			expect(within(row).getAllByRole('cell')[0].textContent).toBe('3');
			expect(screen.queryByRole('link', { name: 'hero' })).toBeNull();

			fireEvent.click(screen.getByRole('link', { name: 'p6' }));
			await waitFor(() => expect(window.location.hash).toBe('#players?name=p6'));
			expect(await screen.findByRole('heading', { name: 'p6' })).toBeTruthy();
		},
		RUN_TIMEOUT_MS
	);

	it(
		'forgets everything when emptied, once that is confirmed',
		async () => {
			mountApp();
			await loadTwoLogs();
			await switchTo('Trends');
			const empty = screen.getByRole('button', { name: 'Empty the library' });

			window.confirm = () => false;
			fireEvent.click(empty);
			await settle();
			expect(screen.getByText('hero · $0.05/$0.10 · 3 hands')).toBeTruthy();

			window.confirm = () => true;
			fireEvent.click(empty);
			await waitFor(() =>
				expect(screen.queryByText('hero · $0.05/$0.10 · 3 hands')).toBeNull()
			);
			await switchTo('Summary');
			expect(
				await screen.findByRole('heading', { name: 'Drop a hand history' })
			).toBeTruthy();
		},
		RUN_TIMEOUT_MS
	);
});
