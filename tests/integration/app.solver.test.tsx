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
			fireEvent.click(await screen.findByRole('button', { name: 'Solve' }));

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
			fireEvent.click(await screen.findByRole('button', { name: 'Solve' }));
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
			const solve = await screen.findByRole('button', { name: 'Solve' });
			fireEvent.click(solve);
			await screen.findByRole('table', {}, { timeout: RUN_TIMEOUT_MS });

			fireEvent.click(screen.getByRole('button', { name: 'Back a step' }));
			await settle();
			expect(screen.queryByRole('region', { name: 'Solver' })).toBeNull();

			fireEvent.click(screen.getByRole('button', { name: 'Forward a step' }));
			await settle();
			fireEvent.click(screen.getByRole('button', { name: 'Solve' }));
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
			fireEvent.click(await screen.findByRole('button', { name: 'Solve' }));
			await screen.findByRole('table', {}, { timeout: RUN_TIMEOUT_MS });

			fireEvent.click(screen.getByText(/^Betting tree/));
			fireEvent.click(screen.getByRole('radio', { name: 'Simple' }));
			await settle();
			expect(JSON.parse(localStorage.getItem('qpoker:solverTree')!)).toMatchObject({
				version: 1,
				preset: 'simple',
			});
		},
		RUN_TIMEOUT_MS
	);

	it(
		'disables the button on a multiway spot, and says so',
		async () => {
			solverStub.load = async () => createFakeSolver();
			mountApp();
			loadLog(handText(THREE_WAY_CBET));
			await openAt(7101, /bets \$0\.40/);

			const button = await screen.findByRole<HTMLButtonElement>('button', {
				name: 'Solve',
			});
			expect(button.disabled).toBe(true);
			expect(screen.getByText(/Only heads-up spots can be solved/)).toBeTruthy();
			fireEvent.click(button);
			await settle();
			expect(screen.queryByRole('region', { name: 'Solver' })).toBeNull();
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
			expect(screen.queryByRole('button', { name: 'Solve' })).toBeNull();
		},
		RUN_TIMEOUT_MS
	);
});
