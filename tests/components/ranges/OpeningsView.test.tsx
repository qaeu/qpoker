import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@solidjs/testing-library';

import OpeningsView from '#c/ranges/OpeningsView';
import { analyzeLog, type AnalysisReport } from '#utils/coach/report';

import { TWO_HAND_LOG } from '../../integration/appHarness';
import { BUTTON_TRASH_OPEN, handText } from '../../utils/history/handText';

// Under the gun twice (aces folded, ace-king opened), then seven-deuce opened
// on the button: hands 1, 2 and 3 of the log.
const report = analyzeLog(`${TWO_HAND_LOG}\n${handText(BUTTON_TRASH_OPEN)}`);

const mount = (log: AnalysisReport = report, onOpenHand = vi.fn()) => ({
	onOpenHand,
	...render(() => <OpeningsView report={log} onOpenHand={onOpenHand} />),
});

const seat = (name: string) => screen.getByRole<HTMLButtonElement>('button', { name });
const strays = (title: string) =>
	screen.getByRole('row', { name: new RegExp(`^${title}`) });

describe('OpeningsView', () => {
	describe('the seats', () => {
		it('opens on the seat with the most spots', () => {
			mount();
			expect(seat('UTG').getAttribute('aria-pressed')).toBe('true');
			expect(seat('BTN').getAttribute('aria-pressed')).toBe('false');
			expect(screen.getByRole('heading', { name: 'UTG, 2 spots' })).toBeTruthy();
			expect(
				screen.getByText(/^Opened 1 of 2; the chart opens 2\.0 of the same/)
			).toBeTruthy();
		});

		it('has no seat menu: the table is the selector', () => {
			mount();
			expect(screen.queryByRole('combobox')).toBeNull();
		});

		it('switches the grid and the strays to the seat that is picked', () => {
			const { container } = mount();
			expect(screen.getByTitle(/^AA: held 1, opened 0, limped 0, folded 1/)).toBeTruthy();

			fireEvent.click(seat('BTN'));
			expect(seat('BTN').getAttribute('aria-pressed')).toBe('true');
			expect(seat('UTG').getAttribute('aria-pressed')).toBe('false');
			expect(screen.getByRole('heading', { name: 'BTN, 1 spot' })).toBeTruthy();
			expect(
				screen.getByRole('heading', { name: 'BTN hands that strayed' })
			).toBeTruthy();
			expect(screen.getByTitle(/^72o: held 1, opened 1/)).toBeTruthy();
			expect(screen.getByTitle(/^AA: not held here/)).toBeTruthy();
			expect(container.querySelector('tr.is-selected')!.textContent).toMatch(/^BTN/);
		});

		it('reads each seat against its chart in words', () => {
			mount();
			const row = (name: string) =>
				seat(name).closest('tr')!.querySelector('.openings-view__reading')!.textContent;
			expect(row('UTG')).toBe('too few to say');

			const [utg, ...rest] = report.openings.rows;
			const wide: AnalysisReport = {
				...report,
				openings: {
					...report.openings,
					rows: [{ ...utg, spots: 40, raised: 20, expected: 6, leak: 'high' }, ...rest],
				},
			};
			mount(wide);
			expect(
				screen
					.getAllByRole('button', { name: 'UTG' })[1]
					.closest('tr')!
					.querySelector('.openings-view__reading')!.textContent
			).toBe('too wide');
		});
	});

	describe('the hands that strayed', () => {
		it('lists all three ways, with the hands or none', () => {
			mount();
			expect(
				within(strays('Folded inside the chart')).getByRole('link').textContent
			).toBe('AA, hand 1');
			expect(strays('Opened outside the chart').textContent).toBe(
				'Opened outside the chartnone'
			);
			expect(strays('Limped').textContent).toBe('Limpednone');
		});

		it('opens a hand in Review', () => {
			const { onOpenHand } = mount();
			fireEvent.click(seat('BTN'));
			const link = within(strays('Opened outside the chart')).getByRole('link', {
				name: '72o, hand 3',
			});
			expect(link.getAttribute('href')).toBe('#review?show=all&hand=5003');
			fireEvent.click(link);
			expect(onOpenHand).toHaveBeenCalledWith('5003');
		});
	});

	it('says so when the hero was never first in', () => {
		mount({ ...report, openings: { rows: [], shortStacked: 0 } });
		expect(screen.getByText(/there are no opening ranges to show/)).toBeTruthy();
	});
});
