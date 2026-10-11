import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@solidjs/testing-library';

import {
	goTo,
	loadLog,
	mountApp,
	resetBrowserState,
	RUN_TIMEOUT_MS,
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
			// The zone shrinks to a line once there is a report on the page.
			expect(screen.getByRole('button', { name: 'Load another log' })).toBeTruthy();
		},
		RUN_TIMEOUT_MS
	);

	it(
		'lists the mistake and opens its hand',
		async () => {
			mountApp();
			loadLog(TWO_HAND_LOG);
			await screen.findByText('Frequencies', {}, { timeout: RUN_TIMEOUT_MS });

			await goTo('#mistakes');
			expect(await screen.findByText('1 of 1')).toBeTruthy();
			expect(
				screen.getByRole('heading', { name: 'Folded a standard open' })
			).toBeTruthy();
			expect(screen.getByText(/AA, UTG, first in/)).toBeTruthy();

			fireEvent.click(screen.getByRole('button', { name: 'Open hand #5001' }));
			expect(await screen.findByRole('heading', { name: 'Hand #5001' })).toBeTruthy();
			expect(screen.getByText('hero (UTG) folds')).toBeTruthy();
			// The chart the fold was graded against is there to open.
			expect(screen.getByText('Baseline range: UTG, first in')).toBeTruthy();
			expect(screen.getByTitle(/^AA: raises 100%/).classList.contains('is-marked')).toBe(
				true
			);

			fireEvent.click(screen.getByRole('button', { name: 'Hand 5002' }));
			expect(await screen.findByRole('heading', { name: 'Hand #5002' })).toBeTruthy();
			expect(screen.getByText('hero (UTG) raises to $0.25')).toBeTruthy();
		},
		RUN_TIMEOUT_MS
	);

	it(
		'lists the good plays and opens the hand of one',
		async () => {
			mountApp();
			loadLog(TWO_HAND_LOG);
			await screen.findByText('Frequencies', {}, { timeout: RUN_TIMEOUT_MS });
			await goTo('#plays');
			expect(await screen.findByText(/No good plays were picked out/)).toBeTruthy();

			loadLog(`${TWO_HAND_LOG}\n${handText(TOUGH_FOLD)}`);
			const title = 'Laid down a strong hand without the price';
			expect(
				await screen.findByRole('heading', { name: title }, { timeout: RUN_TIMEOUT_MS })
			).toBeTruthy();
			expect(screen.getByText('great play')).toBeTruthy();

			fireEvent.click(screen.getByRole('button', { name: 'Open hand #6001' }));
			expect(await screen.findByRole('heading', { name: 'Hand #6001' })).toBeTruthy();
			expect(screen.getByRole('heading', { name: title })).toBeTruthy();
		},
		RUN_TIMEOUT_MS
	);

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
			expect(await screen.findByRole('heading', { name: 'Hand #5001' })).toBeTruthy();
		},
		RUN_TIMEOUT_MS
	);

	it(
		'keeps the report across a remount',
		async () => {
			mountApp();
			loadLog(TWO_HAND_LOG);
			await screen.findByText('Frequencies', {}, { timeout: RUN_TIMEOUT_MS });
			const stored = localStorage.getItem('pokeranalysis:report');
			expect(stored).not.toBeNull();

			document.body.innerHTML = '';
			localStorage.setItem('pokeranalysis:report', stored!);
			mountApp();
			expect(screen.getByText('Frequencies')).toBeTruthy();
		},
		RUN_TIMEOUT_MS
	);

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
	});
});
