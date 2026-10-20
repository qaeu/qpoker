import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@solidjs/testing-library';

import { mountApp, resetBrowserState, RUN_TIMEOUT_MS, settle } from './appHarness';

describe('App', () => {
	beforeEach(resetBrowserState);

	describe('the Train view', () => {
		it('sits after Ranges in the header', () => {
			mountApp();
			const header = screen.getByRole('banner');
			const tabs = within(header)
				.getAllByRole('tab')
				.map((tab) => tab.textContent);
			expect(tabs.slice(-2)).toEqual(['Ranges', 'Train']);
		});

		it(
			'opens on the drills with an empty library',
			async () => {
				window.location.hash = '#train';
				mountApp();
				await waitFor(() =>
					expect(screen.getAllByRole('button', { name: 'Start' }).length).toBeGreaterThan(
						1
					)
				);
				expect(window.location.hash).toBe('#train');
				// No library to load a log into first: the drop zone is not in the way.
				expect(screen.queryByText(/drop/i)).toBeNull();
			},
			RUN_TIMEOUT_MS
		);

		it(
			'is reached by its tab and left by another once nothing is at stake',
			async () => {
				mountApp();
				fireEvent.click(screen.getByRole('tab', { name: 'Train' }));
				await settle();
				expect(window.location.hash).toBe('#train');
				expect(screen.getAllByRole('button', { name: 'Start' }).length).toBeGreaterThan(
					1
				);

				fireEvent.click(screen.getByRole('tab', { name: 'Ranges' }));
				await settle();
				expect(window.location.hash.startsWith('#ranges')).toBe(true);
			},
			RUN_TIMEOUT_MS
		);

		it(
			'asks twice before a tab switch throws a drill away',
			async () => {
				window.location.hash = '#train';
				mountApp();
				const panel = (await screen.findAllByRole('article'))[0];
				fireEvent.click(within(panel).getByRole('button', { name: 'Start' }));
				fireEvent.keyDown(document, { key: '1' });

				fireEvent.click(screen.getByRole('tab', { name: 'Ranges' }));
				await settle();
				expect(window.location.hash).toBe('#train');
				expect(screen.getByText(/Click Ranges again to leave/)).toBeDefined();

				fireEvent.click(screen.getByRole('tab', { name: 'Ranges' }));
				await settle();
				expect(window.location.hash.startsWith('#ranges')).toBe(true);
			},
			RUN_TIMEOUT_MS
		);
	});
});
