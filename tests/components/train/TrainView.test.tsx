import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@solidjs/testing-library';

import TrainView from '#c/train/TrainView';
import { loadTrainConfig, loadTrainScores } from '#utils/app/storage';
import type { DrillId } from '#utils/train/drills';
import { DRILL_NAMES } from '#utils/train/run';

const SEED = 2024;

interface Harness {
	/** The check the view hands the app for a tab switch, while it has one. */
	leaveGuard: () => ((to: string) => boolean) | null;
}

function renderView(): Harness {
	let leaveGuard: ((to: string) => boolean) | null = null;
	render(() => <TrainView seed={SEED} onLeaveGuard={(guard) => (leaveGuard = guard)} />);
	return { leaveGuard: () => leaveGuard };
}

/** The panel on the picker for one drill. */
function drillPanel(drill: DrillId): HTMLElement {
	const heading = screen.getByRole('heading', { name: DRILL_NAMES[drill] });
	return heading.closest('article') as HTMLElement;
}

async function chooseMode(drill: DrillId, mode: 'Easy' | 'Hard' | 'Test') {
	fireEvent.click(within(drillPanel(drill)).getByRole('radio', { name: mode }));
	// Ark's segments take a pick on the next microtask.
	await Promise.resolve();
}

async function startDrill(drill: DrillId, mode: 'Easy' | 'Hard' | 'Test') {
	await chooseMode(drill, mode);
	fireEvent.click(within(drillPanel(drill)).getByRole('button', { name: 'Start' }));
}

const key = (name: string) => fireEvent.keyDown(document, { key: name });

const hud = () => document.querySelector('.train-hud')!.textContent;
const verdict = () => screen.queryByRole('status');
const drillOnScreen = () => document.querySelector('.train-drill') !== null;

afterEach(() => {
	vi.useRealTimers();
	localStorage.clear();
});

describe('TrainView', () => {
	describe('the picker', () => {
		it('offers every drill with no run on its board yet', () => {
			renderView();
			for (const drill of Object.keys(DRILL_NAMES) as DrillId[]) {
				expect(drillPanel(drill)).toBeDefined();
			}
			expect(screen.getAllByText('No run yet')).toHaveLength(
				Object.keys(DRILL_NAMES).length
			);
		});

		it('remembers the mode each drill was left on', async () => {
			renderView();
			await chooseMode('potOdds', 'Hard');
			const hard = within(drillPanel('potOdds')).getByRole<HTMLInputElement>('radio', {
				name: 'Hard',
			});
			expect(hard.checked).toBe(true);
			expect(loadTrainConfig().modes.potOdds).toBe('hard');
			expect(loadTrainConfig().modes.preflop).toBe('easy');
		});
	});

	describe('a drill with feedback', () => {
		it('gives a verdict on each answer made by key, and Space deals the next', async () => {
			renderView();
			await startDrill('preflop', 'Easy');
			expect(hud()).toMatch(/Hand\s*1\s*\/\s*10/);
			expect(verdict()).toBeNull();

			key('1');
			expect(verdict()).not.toBeNull();
			// A preflop answer is set against the chart it came from.
			expect(document.querySelector('.range-grid')).not.toBeNull();
			expect(document.querySelector('.range-grid__cell.is-marked')).not.toBeNull();

			key(' ');
			expect(verdict()).toBeNull();
			expect(hud()).toMatch(/Hand\s*2\s*\/\s*10/);
		});

		it('answers only once a hand', async () => {
			renderView();
			await startDrill('preflop', 'Easy');
			key('1');
			key('1');
			expect(hud()).toMatch(/✓\s*[01]/);
			expect(hud()).toMatch(/Hand\s*1\s*\/\s*10/);
		});

		it('scores a finished drill onto its board', async () => {
			renderView();
			await startDrill('preflop', 'Easy');
			for (let hand = 0; hand < 10; hand += 1) {
				key('1');
				key(' ');
			}
			expect(screen.getByRole('heading', { name: 'Drill complete' })).toBeDefined();
			const [entry] = Object.values(loadTrainScores())[0];
			expect(entry).toMatchObject({ total: 10, seed: SEED });
			expect(document.querySelector('.train-results__board tr.is-you')).not.toBeNull();

			// Back on the picker, the run is the board's best.
			key('Escape');
			expect(
				within(drillPanel('preflop')).getByText(`${entry.correct}/10`)
			).toBeDefined();
		});

		it('takes a typed estimate in Hard, sent with Enter', async () => {
			renderView();
			await startDrill('equity', 'Hard');
			const field = screen.getByRole<HTMLInputElement>('textbox');
			fireEvent.input(field, { target: { value: '50' } });
			fireEvent.submit(field.closest('form')!);
			expect(verdict()).not.toBeNull();
		});

		it('ignores an estimate that is not a percent', async () => {
			renderView();
			await startDrill('equity', 'Hard');
			const field = screen.getByRole<HTMLInputElement>('textbox');
			fireEvent.input(field, { target: { value: '140' } });
			fireEvent.submit(field.closest('form')!);
			expect(verdict()).toBeNull();
		});
	});

	describe('a Test', () => {
		it('holds its verdicts back and counts the clock running out as a miss', async () => {
			renderView();
			await chooseMode('preflop', 'Test');
			vi.useFakeTimers();
			fireEvent.click(
				within(drillPanel('preflop')).getByRole('button', { name: 'Start' })
			);
			expect(screen.getByRole('timer')).toBeDefined();

			key('1');
			expect(verdict()).toBeNull();
			vi.advanceTimersByTime(300);
			expect(hud()).toMatch(/Hand\s*2\s*\/\s*40/);

			// Nothing pressed: the clock answers for the player.
			vi.advanceTimersByTime(5_000 + 300);
			expect(hud()).toMatch(/Hand\s*3\s*\/\s*40/);
		});

		it('lists every unanswered hand among the misses at the end', async () => {
			renderView();
			await chooseMode('cbet', 'Test');
			vi.useFakeTimers();
			fireEvent.click(within(drillPanel('cbet')).getByRole('button', { name: 'Start' }));
			vi.advanceTimersByTime(40 * 5_300);

			expect(screen.getByRole('heading', { name: 'Drill complete' })).toBeDefined();
			expect(screen.getByText('40 missed')).toBeDefined();
			expect(document.querySelectorAll('.train-results__miss')).toHaveLength(40);
			const [entry] = Object.values(loadTrainScores())[0];
			expect(entry).toMatchObject({ correct: 0, total: 40 });
		});

		it('retries on R and goes back on Escape', async () => {
			renderView();
			await chooseMode('cbet', 'Test');
			vi.useFakeTimers();
			fireEvent.click(within(drillPanel('cbet')).getByRole('button', { name: 'Start' }));
			vi.advanceTimersByTime(40 * 5_300);

			key('r');
			expect(drillOnScreen()).toBe(true);
			expect(hud()).toMatch(/Hand\s*1\s*\/\s*40/);

			vi.advanceTimersByTime(40 * 5_300);
			key('Escape');
			expect(screen.getAllByRole('button', { name: 'Start' }).length).toBeGreaterThan(1);
		});
	});

	describe('leaving', () => {
		it('quits on Escape before anything is answered', async () => {
			renderView();
			await startDrill('preflop', 'Easy');
			key('Escape');
			expect(drillOnScreen()).toBe(false);
		});

		it('asks twice once an answer is in', async () => {
			renderView();
			await startDrill('preflop', 'Easy');
			key('1');
			key('Escape');
			expect(drillOnScreen()).toBe(true);
			expect(
				screen.getByRole('button', { name: /Quit anyway · 1 answer lost/ })
			).toBeDefined();
			key('Escape');
			expect(drillOnScreen()).toBe(false);
		});

		it('stands an armed quit down after a few seconds', async () => {
			renderView();
			await startDrill('preflop', 'Easy');
			key('1');
			vi.useFakeTimers();
			fireEvent.click(screen.getByRole('button', { name: /Quit drill/ }));
			expect(screen.getByRole('button', { name: /Quit anyway/ })).toBeDefined();
			vi.advanceTimersByTime(4000);
			expect(screen.getByRole('button', { name: /Quit drill/ })).toBeDefined();
			key('Escape');
			expect(drillOnScreen()).toBe(true);
		});

		it('asks for a tab twice, the same way', async () => {
			const harness = renderView();
			await startDrill('preflop', 'Easy');
			expect(harness.leaveGuard()!('Summary')).toBe(true);
			await Promise.resolve();
			key('1');
			expect(harness.leaveGuard()!('Summary')).toBe(false);
			expect(screen.getByText(/Click Summary again to leave/)).toBeDefined();
			expect(harness.leaveGuard()!('Summary')).toBe(true);
		});
	});
});
