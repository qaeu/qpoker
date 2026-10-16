import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@solidjs/testing-library';

import { solverStub } from '#setupTests';
import type { WasmInput } from '#utils/solver/wasmApi';

import {
	goTo,
	loadLog,
	mountApp,
	resetBrowserState,
	RUN_TIMEOUT_MS,
	settle,
} from './appHarness';
import { handText, RIVER_HERO_CALL } from '../utils/history/handText';
import { createFakeSolver } from '../utils/solver/fakeSolver';
import { THREE_WAY_CBET } from '../utils/solver/spots';

/** Opens a hand in Review, on the line of its action that reads `line`. */
async function openAt(id: number, line: string | RegExp): Promise<void> {
	await screen.findByText('Frequencies', {}, { timeout: RUN_TIMEOUT_MS });
	await goTo(`#review?show=all&hand=${id}`);
	const log = await screen.findByRole('navigation', { name: 'Play by play' });
	fireEvent.click(within(log).getByRole('button', { name: line }));
	await settle();
}

/** The caption's Solve, named with the tree it would run. */
const solveButton = () =>
	screen.findByRole<HTMLButtonElement>('button', { name: /^Solve ·/ });
const settingsButton = () =>
	screen.getByRole<HTMLButtonElement>('button', { name: 'Solver settings' });
const panel = () => screen.queryByRole('region', { name: 'Solver' });

describe('the solver in Review', () => {
	beforeEach(async () => {
		await resetBrowserState();
	});

	it(
		'solves the river decision and shows the table of actions',
		async () => {
			const inputs: WasmInput[] = [];
			solverStub.load = async () =>
				createFakeSolver({ onCreate: (input) => inputs.push(input) });
			mountApp();
			loadLog(handText(RIVER_HERO_CALL));
			await openAt(7001, /calls \$4/);

			expect(document.querySelector('.step-caption__where')!.textContent).toMatch(
				/^River/
			);
			fireEvent.click(await solveButton());

			const table = await screen.findByRole('table', {}, { timeout: RUN_TIMEOUT_MS });
			const rows = within(table).getAllByRole('row').slice(1);
			expect(
				rows.map((row) => within(row).getAllByRole('rowheader')[0].textContent)
			).toEqual([
				expect.stringMatching(/^Fold/),
				expect.stringMatching(/^Call/),
				expect.stringMatching(/^Raise to/),
			]);
			// What was played and what was best are marked.
			expect(within(rows[1]).getByText('played')).toBeTruthy();
			expect(within(rows[2]).getByText('best')).toBeTruthy();
			expect(screen.getByText(/gives up .* bb against Raise/)).toBeTruthy();
			// The hero’s range, with the hand marked.
			expect(
				document.querySelector('.solve-panel .range-grid .is-marked')!.textContent
			).toBe('54s');

			expect(inputs).toHaveLength(1);
			expect(inputs[0].prefix).toEqual([{ kind: 'check' }, { kind: 'bet', to: 400 }]);
			// The panel is not route state.
			expect(window.location.hash).not.toMatch(/solve/);
		},
		RUN_TIMEOUT_MS
	);

	it(
		'says why when the solver fails',
		async () => {
			solverStub.load = async () => createFakeSolver({ failWith: 'no such tree' });
			mountApp();
			loadLog(handText(RIVER_HERO_CALL));
			await openAt(7001, /calls \$4/);
			fireEvent.click(await solveButton());
			expect((await screen.findByRole('alert')).textContent).toMatch(/no such tree/);
		},
		RUN_TIMEOUT_MS
	);

	it(
		'closes the panel on another step, and a second look is from the cache',
		async () => {
			let solves = 0;
			solverStub.load = async () => createFakeSolver({ onCreate: () => solves++ });
			mountApp();
			loadLog(handText(RIVER_HERO_CALL));
			await openAt(7001, /calls \$4/);
			fireEvent.click(await solveButton());
			await screen.findByRole('table', {}, { timeout: RUN_TIMEOUT_MS });

			fireEvent.click(screen.getByRole('button', { name: 'Back a step' }));
			await settle();
			expect(panel()).toBeNull();

			fireEvent.click(screen.getByRole('button', { name: 'Forward a step' }));
			await settle();
			fireEvent.click(await solveButton());
			await screen.findByRole('table');
			expect(solves).toBe(1);
		},
		RUN_TIMEOUT_MS
	);

	it(
		'keeps the tree settings for the next visit',
		async () => {
			solverStub.load = async () => createFakeSolver();
			mountApp();
			loadLog(handText(RIVER_HERO_CALL));
			await openAt(7001, /calls \$4/);
			fireEvent.click(await solveButton());
			await screen.findByRole('table', {}, { timeout: RUN_TIMEOUT_MS });

			fireEvent.click(screen.getByRole('button', { name: /Adjust/ }));
			fireEvent.click(screen.getByRole('radio', { name: 'Simple' }));
			await settle();
			expect(JSON.parse(localStorage.getItem('qpoker:solverTree')!)).toMatchObject({
				version: 1,
				preset: 'simple',
			});
		},
		RUN_TIMEOUT_MS
	);

	describe('the settings', () => {
		it(
			'open without solving, and the solve runs over what was chosen',
			async () => {
				const inputs: WasmInput[] = [];
				solverStub.load = async () =>
					createFakeSolver({ onCreate: (input) => inputs.push(input) });
				mountApp();
				loadLog(handText(RIVER_HERO_CALL));
				await openAt(7001, /calls \$4/);

				expect((await solveButton()).textContent).toMatch(/Standard/);
				fireEvent.click(settingsButton());
				await settle();
				expect(panel()).toBeTruthy();
				expect(settingsButton().getAttribute('aria-expanded')).toBe('true');
				expect(screen.queryByRole('table', { name: /what the solver does/ })).toBeNull();
				expect(
					screen.getByRole('textbox', { name: 'River bets, % of pot' })
				).toBeTruthy();
				expect(inputs).toHaveLength(0);

				fireEvent.click(screen.getByRole('radio', { name: 'Simple' }));
				await settle();
				expect((await solveButton()).textContent).toMatch(/Simple/);
				fireEvent.click(within(panel()!).getByRole('button', { name: 'Solve' }));
				await screen.findByRole(
					'table',
					{ name: /what the solver does/ },
					{
						timeout: RUN_TIMEOUT_MS,
					}
				);
				expect(inputs).toHaveLength(1);
				expect(inputs[0].raiseCap).toBe(0);
				expect(settingsButton().getAttribute('aria-expanded')).toBe('false');
			},
			RUN_TIMEOUT_MS
		);

		it(
			'come back over a result, and fold away to it again',
			async () => {
				solverStub.load = async () => createFakeSolver();
				mountApp();
				loadLog(handText(RIVER_HERO_CALL));
				await openAt(7001, /calls \$4/);
				fireEvent.click(await solveButton());
				await screen.findByRole('table', {}, { timeout: RUN_TIMEOUT_MS });
				expect(screen.getByText(/Solved over the standard tree/)).toBeTruthy();

				fireEvent.click(screen.getByRole('button', { name: /Adjust/ }));
				expect(screen.queryByText(/gives up/)).toBeNull();
				expect(
					within(panel()!).getByRole('button', { name: 'Solve again' })
				).toBeTruthy();

				fireEvent.click(screen.getByRole('button', { name: 'Back to the result' }));
				expect(screen.getByText(/gives up/)).toBeTruthy();

				// The sliders show the settings, and a second press folds them away.
				fireEvent.click(settingsButton());
				expect(screen.queryByText(/gives up/)).toBeNull();
				fireEvent.click(settingsButton());
				expect(screen.getByText(/gives up/)).toBeTruthy();
			},
			RUN_TIMEOUT_MS
		);

		it(
			'close the panel on a second press when nothing was solved',
			async () => {
				solverStub.load = async () => createFakeSolver();
				mountApp();
				loadLog(handText(RIVER_HERO_CALL));
				await openAt(7001, /calls \$4/);
				await solveButton();
				fireEvent.click(settingsButton());
				await settle();
				expect(panel()).toBeTruthy();
				fireEvent.click(settingsButton());
				await settle();
				expect(panel()).toBeNull();
			},
			RUN_TIMEOUT_MS
		);

		it(
			'name what is wrong with a tree, and will not solve it',
			async () => {
				let solves = 0;
				solverStub.load = async () => createFakeSolver({ onCreate: () => solves++ });
				mountApp();
				loadLog(handText(RIVER_HERO_CALL));
				await openAt(7001, /calls \$4/);
				await solveButton();
				fireEvent.click(settingsButton());
				await settle();

				const bets = screen.getByRole('textbox', { name: 'River bets, % of pot' });
				fireEvent.change(bets, { target: { value: '50, 900' } });
				await settle();
				expect(screen.getByRole('radio', { name: 'Custom' })).toBeTruthy();
				expect(screen.getByRole('alert').textContent).toMatch(/A river bet must be/);
				const run = within(panel()!).getByRole<HTMLButtonElement>('button', {
					name: 'Solve',
				});
				expect(run.disabled).toBe(true);

				// The caption's Solve shows the settings rather than running.
				fireEvent.click(await solveButton());
				await settle();
				expect(screen.getByRole('alert')).toBeTruthy();
				expect(solves).toBe(0);
			},
			RUN_TIMEOUT_MS
		);
	});

	it(
		'disables the button on a multiway spot, and says so',
		async () => {
			solverStub.load = async () => createFakeSolver();
			mountApp();
			loadLog(handText(THREE_WAY_CBET));
			await openAt(7101, /bets \$0\.40/);

			const button = await solveButton();
			expect(button.disabled).toBe(true);
			expect(settingsButton().disabled).toBe(true);
			expect(screen.getByText(/Only heads-up spots can be solved/)).toBeTruthy();
			fireEvent.click(button);
			await settle();
			expect(panel()).toBeNull();
		},
		RUN_TIMEOUT_MS
	);

	it(
		'offers nothing on a preflop step',
		async () => {
			mountApp();
			loadLog(handText(RIVER_HERO_CALL));
			await openAt(7001, /raises to \$0\.30/);
			await waitFor(() =>
				expect(document.querySelector('.step-caption__where')!.textContent).toMatch(
					/^Preflop/
				)
			);
			expect(screen.queryByRole('button', { name: /^Solve ·/ })).toBeNull();
			expect(screen.queryByRole('button', { name: 'Solver settings' })).toBeNull();
		},
		RUN_TIMEOUT_MS
	);
});
