import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@solidjs/testing-library';

import {
	goTo,
	loadLog,
	mountApp,
	resetBrowserState,
	RUN_TIMEOUT_MS,
	settle,
	switchTo,
	TWO_HAND_LOG,
} from './appHarness';
import { handText, TOUGH_FOLD } from '../utils/history/handText';

describe('analysing a log in the app', () => {
	beforeEach(resetBrowserState);

	it('starts on the drop zone', () => {
		mountApp();
		expect(screen.getByRole('heading', { name: 'Drop a hand history' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Choose a file' })).toBeTruthy();
	});

	it(
		'grades a log and shows the session',
		async () => {
			mountApp();
			loadLog(TWO_HAND_LOG);
			await screen.findByText('Frequencies', {}, { timeout: RUN_TIMEOUT_MS });

			expect(screen.getByText(/hero · \$0\.05\/\$0\.10 · Builder/)).toBeTruthy();
			const vpip = screen.getByRole('row', { name: /^VPIP/ });
			expect(within(vpip).getByText('1/2')).toBeTruthy();
			expect(within(vpip).getByText('50%')).toBeTruthy();
			expect(screen.getByRole('row', { name: /Folded a standard open 1/ })).toBeTruthy();
			// The log is named in the header, which is also where the next one loads.
			const header = within(screen.getByRole('banner'));
			expect(header.getByText('hero · $0.05/$0.10 · 2 hands')).toBeTruthy();
			expect(header.getByText('hands.txt')).toBeTruthy();
			expect(header.getByRole('button', { name: 'Load another log' })).toBeTruthy();
			expect(screen.queryByRole('heading', { name: 'Drop a hand history' })).toBeNull();
		},
		RUN_TIMEOUT_MS
	);

	describe('Review', () => {
		const radio = (name: string | RegExp) =>
			within(
				screen.getByRole('radiogroup', { name: 'Show' })
			).getByRole<HTMLInputElement>('radio', { name });

		it(
			'lists the hands with a mistake and reads one',
			async () => {
				mountApp();
				loadLog(TWO_HAND_LOG);
				await screen.findByText('Frequencies', {}, { timeout: RUN_TIMEOUT_MS });

				await switchTo('Review');
				expect(radio(/^Mistakes/).checked).toBe(true);
				expect((await screen.findByRole('status')).textContent).toMatch(
					/^1 hand · −\d+\.\dbb estimated$/
				);
				expect(screen.getByRole('heading', { name: 'Hand 1 of 2' })).toBeTruthy();
				expect(
					screen.getByRole('heading', { name: 'Folded a standard open' })
				).toBeTruthy();
				expect(screen.getByText('hero (UTG) folds')).toBeTruthy();
				// The chart the fold was graded against is there to open.
				expect(screen.getByText('Baseline range: UTG, first in')).toBeTruthy();
				expect(
					screen.getByTitle(/^AA: raises 100%/).classList.contains('is-marked')
				).toBe(true);
			},
			RUN_TIMEOUT_MS
		);

		it(
			'widens the list, opens a row and keeps both in the address',
			async () => {
				mountApp();
				loadLog(TWO_HAND_LOG);
				await screen.findByText('Frequencies', {}, { timeout: RUN_TIMEOUT_MS });
				await switchTo('Review');

				fireEvent.click(radio(/^All/));
				await settle();
				expect(window.location.hash).toBe('#review?show=all');
				expect(screen.queryByRole('radiogroup', { name: 'Severity' })).toBeNull();

				fireEvent.click(screen.getByRole('button', { name: 'Hand 2, Ah Kd' }));
				expect(await screen.findByRole('heading', { name: 'Hand 2 of 2' })).toBeTruthy();
				expect(screen.getByText('hero (UTG) raises to $0.25')).toBeTruthy();
				expect(screen.getByText('on baseline')).toBeTruthy();
				expect(window.location.hash).toBe('#review?show=all&hand=5002');

				// A step is not somewhere to come back to: it rewrites the entry.
				const entries = window.history.length;
				fireEvent.keyDown(window, { key: 'k' });
				expect(await screen.findByRole('heading', { name: 'Hand 1 of 2' })).toBeTruthy();
				expect(window.location.hash).toBe('#review?show=all&hand=5001');
				expect(window.history.length).toBe(entries);
			},
			RUN_TIMEOUT_MS
		);

		it(
			'comes back to the same list and hand after a reload',
			async () => {
				const unmount = mountApp();
				loadLog(TWO_HAND_LOG);
				await screen.findByText('Frequencies', {}, { timeout: RUN_TIMEOUT_MS });
				await goTo('#review?show=all&hand=5002');
				expect(screen.getByRole('heading', { name: 'Hand 2 of 2' })).toBeTruthy();

				unmount();
				mountApp();
				expect(screen.getByRole('heading', { name: 'Hand 2 of 2' })).toBeTruthy();
				expect(radio(/^All/).checked).toBe(true);
			},
			RUN_TIMEOUT_MS
		);

		it(
			'lists the good plays',
			async () => {
				mountApp();
				loadLog(TWO_HAND_LOG);
				await screen.findByText('Frequencies', {}, { timeout: RUN_TIMEOUT_MS });
				await goTo('#review?show=plays');
				expect(await screen.findByText(/No good plays were picked out/)).toBeTruthy();

				loadLog(`${TWO_HAND_LOG}\n${handText(TOUGH_FOLD)}`);
				const title = 'Laid down a strong hand without the price';
				expect(
					await screen.findByRole('heading', { name: title }, { timeout: RUN_TIMEOUT_MS })
				).toBeTruthy();
				expect(screen.getByRole('heading', { name: 'Hand 3 of 3' })).toBeTruthy();
				expect(screen.getByRole('status').textContent).toMatch(/^1 hand · \+/);
				// Once in the row, once on the card.
				expect(screen.getAllByText('great play')).toHaveLength(2);
			},
			RUN_TIMEOUT_MS
		);

		it(
			'sends the old tabs’ addresses to their lists',
			async () => {
				mountApp();
				loadLog(TWO_HAND_LOG);
				await screen.findByText('Frequencies', {}, { timeout: RUN_TIMEOUT_MS });

				await goTo('#hands');
				expect(window.location.hash).toBe('#review?show=all');
				expect(radio(/^All/).checked).toBe(true);

				await goTo('#mistakes');
				expect(window.location.hash).toBe('#review');
				expect(radio(/^Mistakes/).checked).toBe(true);

				await goTo('#plays');
				expect(window.location.hash).toBe('#review?show=plays');
			},
			RUN_TIMEOUT_MS
		);

		it(
			'drops the open hand when another log is loaded',
			async () => {
				mountApp();
				loadLog(TWO_HAND_LOG);
				await screen.findByText('Frequencies', {}, { timeout: RUN_TIMEOUT_MS });
				await goTo('#review?show=all&hand=5002');

				loadLog(handText(TOUGH_FOLD));
				expect(
					await screen.findByRole(
						'heading',
						{ name: 'Hand 1 of 1' },
						{ timeout: RUN_TIMEOUT_MS }
					)
				).toBeTruthy();
				expect(window.location.hash).toBe('#review?show=all');
			},
			RUN_TIMEOUT_MS
		);
	});

	it(
		'shows the opening ranges and opens a hand that strayed',
		async () => {
			mountApp();
			loadLog(TWO_HAND_LOG);
			await screen.findByText('Frequencies', {}, { timeout: RUN_TIMEOUT_MS });

			await switchTo('Openings');
			expect(
				await screen.findByRole('heading', { name: 'Your opening ranges' })
			).toBeTruthy();
			// Aces folded and ace-king opened: one of two, where the chart opens both.
			const seat = screen.getByRole('row', { name: /^UTG/ });
			expect(within(seat).getByText('50%')).toBeTruthy();
			expect(within(seat).getByText('100%')).toBeTruthy();
			expect(
				screen.getByText(/Opened 1 of 2; the chart opens 2\.0 of the same/)
			).toBeTruthy();
			expect(screen.getByTitle(/^AA: held 1, opened 0, limped 0, folded 1/)).toBeTruthy();
			expect(
				screen.getByTitle(/^72o: not held here/).classList.contains('is-empty')
			).toBe(true);

			expect(
				screen.getByRole('heading', { name: 'Folded inside the chart' })
			).toBeTruthy();
			fireEvent.click(screen.getByRole('button', { name: 'AA · hand #5001' }));
			expect(await screen.findByRole('heading', { name: 'Hand 1 of 2' })).toBeTruthy();
			expect(window.location.hash).toBe('#review?show=all&hand=5001');
		},
		RUN_TIMEOUT_MS
	);

	it(
		'keeps the report across a remount',
		async () => {
			const unmount = mountApp();
			loadLog(TWO_HAND_LOG);
			await screen.findByText('Frequencies', {}, { timeout: RUN_TIMEOUT_MS });
			const stored = localStorage.getItem('pokeranalysis:report');
			expect(stored).not.toBeNull();

			unmount();
			mountApp();
			expect(screen.getByText('Frequencies')).toBeTruthy();
		},
		RUN_TIMEOUT_MS
	);

	describe('loading another log', () => {
		it(
			'keeps the report on the page until the next one lands',
			async () => {
				mountApp();
				loadLog(TWO_HAND_LOG);
				await screen.findByText('Frequencies', {}, { timeout: RUN_TIMEOUT_MS });

				loadLog(handText(TOUGH_FOLD), 'second.txt');
				const status = await screen.findByRole('status');
				expect(status.textContent).toMatch(/^Grading hand \d+ of \d+/);
				// The strip is over the view, not in place of it.
				expect(status.closest('.log-status')!.nextElementSibling!.className).toBe(
					'summary-view'
				);
				expect(screen.getByText('hero · $0.05/$0.10 · 2 hands')).toBeTruthy();

				expect(
					await screen.findByText(
						'hero · $0.05/$0.10 · 1 hand',
						{},
						{ timeout: RUN_TIMEOUT_MS }
					)
				).toBeTruthy();
				expect(screen.getByText('second.txt')).toBeTruthy();
				expect(screen.queryByRole('status')).toBeNull();
			},
			RUN_TIMEOUT_MS
		);

		it(
			'leaves the report alone when the run is cancelled',
			async () => {
				mountApp();
				loadLog(TWO_HAND_LOG);
				await screen.findByText('Frequencies', {}, { timeout: RUN_TIMEOUT_MS });

				loadLog(handText(TOUGH_FOLD), 'second.txt');
				fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
				await waitFor(() => expect(screen.queryByRole('status')).toBeNull(), {
					timeout: RUN_TIMEOUT_MS,
				});
				expect(screen.getByText('hero · $0.05/$0.10 · 2 hands')).toBeTruthy();
				expect(screen.getByText('hands.txt')).toBeTruthy();
			},
			RUN_TIMEOUT_MS
		);

		it(
			'reports a file with no hands over the report it could not replace',
			async () => {
				mountApp();
				loadLog(TWO_HAND_LOG);
				await screen.findByText('Frequencies', {}, { timeout: RUN_TIMEOUT_MS });

				loadLog('just some notes');
				const alert = await screen.findByRole('alert', {}, { timeout: RUN_TIMEOUT_MS });
				expect(alert.textContent).toContain('No PokerStars hands found in that file.');
				expect(screen.getByText('Frequencies')).toBeTruthy();
			},
			RUN_TIMEOUT_MS
		);
	});

	it(
		'says so when the file holds no hands',
		async () => {
			mountApp();
			loadLog('just some notes');
			const alert = await screen.findByRole('alert', {}, { timeout: RUN_TIMEOUT_MS });
			expect(alert.textContent).toContain('No PokerStars hands found in that file.');
			expect(screen.getByRole('button', { name: 'Choose a file' })).toBeTruthy();
		},
		RUN_TIMEOUT_MS
	);

	it('shows the range charts without a log', async () => {
		mountApp();
		await switchTo('Ranges');
		expect(await screen.findByRole('grid', { name: 'Starting-hand range' })).toBeTruthy();
		expect(screen.getAllByRole('gridcell')).toHaveLength(169);

		fireEvent.change(screen.getByLabelText('Spot'), { target: { value: 'rfiUtg' } });
		expect(screen.getByTitle(/^72o: raises 0%/).classList.contains('is-empty')).toBe(
			true
		);
		expect(screen.getByTitle(/^ATo: raises 50%/)).toBeTruthy();
		// With no log there is nothing to grade against them, and one way to get one.
		expect(
			screen.getByText(/Load a hand history with the button in the header/)
		).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Load a log' })).toBeTruthy();
	});
});
