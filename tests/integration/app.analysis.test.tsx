import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@solidjs/testing-library';

import {
	findHeld,
	follow,
	goTo,
	loadLog,
	mountApp,
	queryHeld,
	resetBrowserState,
	RUN_TIMEOUT_MS,
	settle,
	switchTo,
	TWO_HAND_LOG,
} from './appHarness';
import { openIdbStore } from '#utils/store/idbStore';

import { handText, RIVER_HERO_CALL, TOUGH_FOLD } from '../utils/history/handText';

describe('analysing a log in the app', () => {
	beforeEach(resetBrowserState);

	it('starts on the drop zone', async () => {
		mountApp();
		expect(
			await screen.findByRole('heading', { name: 'Drop a hand history' })
		).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Choose files' })).toBeTruthy();
	});

	it(
		'grades a log and shows the session',
		async () => {
			mountApp();
			loadLog(TWO_HAND_LOG);
			await screen.findByText('Frequencies', {}, { timeout: RUN_TIMEOUT_MS });

			expect(screen.getByText(/^Builder · 2026-01-02/)).toBeTruthy();
			const vpip = screen.getByRole('row', { name: /^VPIP/ });
			expect(within(vpip).getByText('1/2')).toBeTruthy();
			expect(within(vpip).getByText('50%')).toBeTruthy();
			expect(screen.getByRole('row', { name: /Folded a standard open 1/ })).toBeTruthy();
			// The header counts the hands, and is also where the next log loads. One
			// sitting is no choice, so there is no menu.
			const header = within(screen.getByRole('banner'));
			expect(header.getByText('2 hands')).toBeTruthy();
			expect(header.queryByRole('combobox')).toBeNull();
			expect(header.getByRole('button', { name: 'Load another log' })).toBeTruthy();
			expect(screen.queryByRole('heading', { name: 'Drop a hand history' })).toBeNull();
		},
		RUN_TIMEOUT_MS
	);

	it(
		'follows the Summary’s links into Review',
		async () => {
			mountApp();
			loadLog(`${TWO_HAND_LOG}\n${handText(RIVER_HERO_CALL)}`);
			await screen.findByText('Frequencies', {}, { timeout: RUN_TIMEOUT_MS });

			// One kind of mistake: its hands, with the filter there to take off.
			await follow(screen.getByRole('link', { name: 'Called without the price' }));
			expect(window.location.hash).toBe('#review?show=mistakes&kind=call-without-odds');
			expect(await screen.findByRole('heading', { name: 'Hand 3 of 3' })).toBeTruthy();
			expect(screen.getByRole('status').textContent).toMatch(/^1 hand · −/);

			fireEvent.click(
				screen.getByRole('button', {
					name: 'Stop filtering by: Called without the price',
				})
			);
			await settle();
			expect(window.location.hash).toBe('#review?show=mistakes');
			expect(screen.getByRole('status').textContent).toMatch(/^2 hands · −/);

			// Back is the list as it was filtered, then the Summary.
			window.history.back();
			await waitFor(() =>
				expect(window.location.hash).toBe('#review?show=mistakes&kind=call-without-odds')
			);
			expect(screen.getByRole('status').textContent).toMatch(/^1 hand · −/);
		},
		RUN_TIMEOUT_MS
	);

	it(
		'follows a seat on the Summary to its hands, and narrows them by spot',
		async () => {
			mountApp();
			loadLog(`${TWO_HAND_LOG}\n${handText(RIVER_HERO_CALL)}`);
			await screen.findByText('Frequencies', {}, { timeout: RUN_TIMEOUT_MS });

			await follow(screen.getByRole('link', { name: 'SB' }));
			expect(window.location.hash).toBe('#review?position=SB');
			expect(screen.getByRole('status').textContent).toBe('1 hand');
			expect(await screen.findByRole('heading', { name: 'Hand 3 of 3' })).toBeTruthy();
			const position = screen.getByRole<HTMLSelectElement>('combobox', {
				name: 'Position',
			});
			expect(position.value).toBe('SB');

			// The other seat, then one of its spots: both are in the address.
			fireEvent.change(position, { target: { value: 'UTG' } });
			await settle();
			expect(window.location.hash).toBe('#review?position=UTG');
			expect(screen.getByRole('status').textContent).toBe('2 hands');
			fireEvent.change(screen.getByRole('combobox', { name: 'Preflop spot' }), {
				target: { value: 'rfi' },
			});
			await settle();
			expect(window.location.hash).toBe('#review?position=UTG&scenario=rfi');

			// A typed address with a seat that has a plus in it lists nothing here.
			await goTo('#review?position=UTG+1');
			expect(window.location.hash).toBe('#review?position=UTG%2B1');
			expect(screen.getByText('Nothing to show at this filter.')).toBeTruthy();
		},
		RUN_TIMEOUT_MS
	);

	it(
		'holds Review, and only Review, to the height of the window',
		async () => {
			const fitted = () =>
				document.querySelector('.app-shell')!.classList.contains('app-shell--fitted');
			mountApp();
			// Nothing to fit while there is no report to review.
			await goTo('#review');
			expect(fitted()).toBe(false);

			loadLog(TWO_HAND_LOG);
			await screen.findByRole('list', { name: 'Hands' }, { timeout: RUN_TIMEOUT_MS });
			expect(fitted()).toBe(true);
			for (const tab of ['Summary', 'Openings', 'Ranges'] as const) {
				await switchTo(tab);
				expect(fitted()).toBe(false);
			}
			await switchTo('Review');
			expect(fitted()).toBe(true);
		},
		RUN_TIMEOUT_MS
	);

	describe('Review', () => {
		const radio = (name: string | RegExp) =>
			within(
				screen.getByRole('radiogroup', { name: 'Show' })
			).getByRole<HTMLInputElement>('radio', { name });

		it(
			'opens on every hand, then lists those with a mistake and reads one',
			async () => {
				mountApp();
				loadLog(TWO_HAND_LOG);
				await screen.findByText('Frequencies', {}, { timeout: RUN_TIMEOUT_MS });

				await switchTo('Review');
				expect(radio(/^All/).checked).toBe(true);
				expect((await screen.findByRole('status')).textContent).toBe('2 hands');
				// The latest hand comes first, and is the one open.
				expect(await screen.findByRole('heading', { name: 'Hand 2 of 2' })).toBeTruthy();

				fireEvent.click(radio(/^Mistakes/));
				await settle();
				expect(window.location.hash).toBe('#review?show=mistakes');
				expect((await screen.findByRole('status')).textContent).toMatch(
					/^1 hand · −\d+\.\dbb estimated$/
				);
				expect(await screen.findByRole('heading', { name: 'Hand 1 of 2' })).toBeTruthy();
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
				await goTo('#review?show=mistakes');

				fireEvent.click(radio(/^All/));
				await settle();
				expect(window.location.hash).toBe('#review');
				expect(screen.queryByRole('radiogroup', { name: 'Severity' })).toBeNull();

				fireEvent.click(screen.getByRole('button', { name: 'Hand 2, Ah Kd' }));
				expect(await screen.findByRole('heading', { name: 'Hand 2 of 2' })).toBeTruthy();
				expect(screen.getByText('hero (UTG) raises to $0.25')).toBeTruthy();
				expect(screen.getByText('on baseline')).toBeTruthy();
				expect(window.location.hash).toBe('#review?hand=5002');

				// A step is not somewhere to come back to: it rewrites the entry.
				const entries = window.history.length;
				fireEvent.keyDown(window, { key: 'j' });
				expect(await screen.findByRole('heading', { name: 'Hand 1 of 2' })).toBeTruthy();
				expect(window.location.hash).toBe('#review?hand=5001');
				expect(window.history.length).toBe(entries);
			},
			RUN_TIMEOUT_MS
		);

		it(
			'steps through a hand and keeps the step in the address',
			async () => {
				const unmount = mountApp();
				loadLog(`${TWO_HAND_LOG}\n${handText(RIVER_HERO_CALL)}`);
				await screen.findByText('Frequencies', {}, { timeout: RUN_TIMEOUT_MS });
				await goTo('#review?hand=7001');
				await screen.findByRole('heading', { name: 'Hand 3 of 3' });
				const where = () => document.querySelector('.step-caption__where')!.textContent;
				const stepNow = () => Number(/step (\d+) of/.exec(where()!)![1]);

				// It opens on its mistake, the river call, with the card in the caption.
				expect(where()).toMatch(/^River · step \d+ of \d+$/);
				expect(
					screen.getByRole('heading', { name: 'Called without the price' })
				).toBeTruthy();
				const opensAt = stepNow();

				// A step rewrites the entry, as a step through the list does.
				const entries = window.history.length;
				fireEvent.click(screen.getByRole('button', { name: 'Back a step' }));
				expect(stepNow()).toBe(opensAt - 1);
				expect(window.location.hash).toBe(`#review?hand=7001&step=${opensAt - 2}`);
				expect(
					screen.queryByRole('heading', { name: 'Called without the price' })
				).toBeNull();

				fireEvent.keyDown(window, { key: 'ArrowLeft' });
				fireEvent.keyDown(window, { key: 'ArrowLeft' });
				fireEvent.keyDown(window, { key: 'ArrowRight' });
				expect(stepNow()).toBe(opensAt - 2);
				expect(window.location.hash).toBe(`#review?hand=7001&step=${opensAt - 3}`);
				expect(window.history.length).toBe(entries);

				// A line of the action is a way to the same place.
				fireEvent.click(screen.getByText('hero (SB) raises to $0.30'));
				expect(where()).toMatch(/^Preflop · /);
				expect(
					screen.getByRole('group', { name: 'SB hero' }).classList.contains('is-acting')
				).toBe(true);
				const raised = window.location.hash;
				expect(raised).toMatch(/&step=\d+$/);

				// A reload lands on the same step.
				unmount();
				mountApp();
				expect(window.location.hash).toBe(raised);
				await screen.findByRole('heading', { name: 'Hand 3 of 3' });
				expect(where()).toMatch(/^Preflop · /);
				expect(
					screen.getByRole('group', { name: 'SB hero' }).classList.contains('is-acting')
				).toBe(true);

				// Another hand starts where it opens, not at the step this one was on.
				fireEvent.keyDown(window, { key: 'j' });
				expect(await screen.findByRole('heading', { name: 'Hand 2 of 3' })).toBeTruthy();
				expect(window.location.hash).toBe('#review?hand=5002');
				expect(where()).toMatch(/^Preflop · step 1 of /);
			},
			RUN_TIMEOUT_MS
		);

		it(
			'comes back to the same list and hand after a reload',
			async () => {
				const unmount = mountApp();
				loadLog(TWO_HAND_LOG);
				await screen.findByText('Frequencies', {}, { timeout: RUN_TIMEOUT_MS });
				await goTo('#review?hand=5002');
				expect(await screen.findByRole('heading', { name: 'Hand 2 of 2' })).toBeTruthy();

				unmount();
				mountApp();
				expect(await screen.findByRole('heading', { name: 'Hand 2 of 2' })).toBeTruthy();
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
				expect(await screen.findByRole('heading', { name: 'Hand 3 of 3' })).toBeTruthy();
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
				expect(window.location.hash).toBe('#review');
				expect(radio(/^All/).checked).toBe(true);

				await goTo('#mistakes');
				expect(window.location.hash).toBe('#review?show=mistakes');
				expect(radio(/^Mistakes/).checked).toBe(true);

				await goTo('#plays');
				expect(window.location.hash).toBe('#review?show=plays');
			},
			RUN_TIMEOUT_MS
		);

		it(
			'keeps the open hand when another log adds to the library',
			async () => {
				mountApp();
				loadLog(TWO_HAND_LOG);
				await screen.findByText('Frequencies', {}, { timeout: RUN_TIMEOUT_MS });
				await goTo('#review?hand=5002');
				expect(await screen.findByRole('heading', { name: 'Hand 2 of 2' })).toBeTruthy();

				// A later hand: the one being read is still the second, now of three.
				loadLog(handText(TOUGH_FOLD));
				expect(
					await screen.findByRole(
						'heading',
						{ name: 'Hand 2 of 3' },
						{ timeout: RUN_TIMEOUT_MS }
					)
				).toBeTruthy();
				expect(window.location.hash).toBe('#review?hand=5002');
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
			expect(within(seat).getByRole('button', { name: 'UTG' })).toBeTruthy();
			const cells = within(seat).getAllByRole('cell');
			expect(cells[1].textContent).toBe('50%');
			expect(cells[2].textContent).toBe('100%');
			expect(
				screen.getByText(/Opened 1 of 2; the chart opens 2\.0 of the same/)
			).toBeTruthy();
			expect(screen.getByTitle(/^AA: held 1, opened 0, limped 0, folded 1/)).toBeTruthy();
			expect(
				screen.getByTitle(/^72o: not held here/).classList.contains('is-empty')
			).toBe(true);

			const strayed = screen.getByRole('row', { name: /^Folded inside the chart/ });
			fireEvent.click(within(strayed).getByRole('link', { name: 'AA, hand 1' }));
			expect(await screen.findByRole('heading', { name: 'Hand 1 of 2' })).toBeTruthy();
			expect(window.location.hash).toBe('#review?hand=5001');
		},
		RUN_TIMEOUT_MS
	);

	it(
		'keeps the library across a remount',
		async () => {
			const unmount = mountApp();
			loadLog(TWO_HAND_LOG);
			await screen.findByText('Frequencies', {}, { timeout: RUN_TIMEOUT_MS });
			// The cache an older build left is dropped: the hands are in the library.
			localStorage.setItem('qpoker:report', '{}');

			unmount();
			mountApp();
			expect(await screen.findByText('Frequencies')).toBeTruthy();
			expect(queryHeld(2)).toBeTruthy();
			expect(screen.queryByRole('heading', { name: 'Drop a hand history' })).toBeNull();
			expect(localStorage.getItem('qpoker:report')).toBeNull();
		},
		RUN_TIMEOUT_MS
	);

	describe('loading another log', () => {
		it(
			'keeps the report on the page until the next log’s hands join it',
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
				expect(queryHeld(2)).toBeTruthy();

				expect(await findHeld(3)).toBeTruthy();
				expect(screen.queryByRole('status')).toBeNull();
			},
			RUN_TIMEOUT_MS
		);

		it(
			'takes in the hands a longer copy of the same log adds',
			async () => {
				mountApp();
				loadLog(TWO_HAND_LOG);
				await screen.findByText('Frequencies', {}, { timeout: RUN_TIMEOUT_MS });
				const graded = () => openIdbStore().rows();
				const before = await graded();
				expect(before).toHaveLength(2);

				loadLog(`${TWO_HAND_LOG}\n${handText(RIVER_HERO_CALL)}`);
				expect(await findHeld(3)).toBeTruthy();
				const after = await graded();
				expect(after.map(({ summary }) => summary.id)).toEqual(['5001', '5002', '7001']);
				expect(after.slice(0, 2)).toEqual(before);
				// Still one log, holding the hands of both loads.
				expect(await openIdbStore().imports()).toMatchObject([{ hands: 3, added: 3 }]);
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
				expect(queryHeld(2)).toBeTruthy();
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
				expect(alert.textContent).toContain('No PokerStars hands found in hands.txt.');
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
			expect(alert.textContent).toContain('No PokerStars hands found in hands.txt.');
			// The zone is back once the library has been read again.
			expect(await screen.findByRole('button', { name: 'Choose files' })).toBeTruthy();
		},
		RUN_TIMEOUT_MS
	);

	it('shows the range charts without a log', async () => {
		mountApp();
		await switchTo('Ranges');
		expect(await screen.findByRole('grid', { name: 'Starting-hand range' })).toBeTruthy();
		expect(screen.getAllByRole('gridcell')).toHaveLength(169);

		fireEvent.click(
			within(screen.getByRole('radiogroup', { name: 'Chart' })).getByRole('radio', {
				name: 'UTG',
			})
		);
		await settle();
		expect(window.location.hash).toBe('#ranges?chart=rfiUtg');
		expect(screen.getByTitle(/^72o: raises 0%/).classList.contains('is-empty')).toBe(
			true
		);
		expect(screen.getByTitle(/^ATo: raises 50%/)).toBeTruthy();
		// With no log there is nothing to grade against them, and one way to get one.
		expect(
			screen.getByText(/Load a hand history with the button in the header/)
		).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Load a log' })).toBeTruthy();

		// The arrows move the chart and the scenario, and the address follows.
		fireEvent.keyDown(window, { key: 'ArrowRight' });
		fireEvent.keyDown(window, { key: 'ArrowDown' });
		fireEvent.keyDown(window, { key: 'd' });
		expect(window.location.hash).toBe('#ranges?chart=ipVsEp&depth=mid');
		expect(screen.getByRole('heading', { name: 'HJ or CO vs UTG open' })).toBeTruthy();
	});

	it('opens the chart a link names', async () => {
		mountApp();
		await goTo('#ranges?chart=bbVsSb&depth=mid');
		expect(await screen.findByRole('heading', { name: 'BB vs SB open' })).toBeTruthy();
		expect(
			screen.getByRole<HTMLInputElement>('radio', { name: '30 to 70bb' }).checked
		).toBe(true);
	});
});
