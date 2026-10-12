import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@solidjs/testing-library';

import TrendsView from '#c/trends/TrendsView';
import { analyzeLog } from '#utils/coach/report';
import { MIN_TREND_HANDS } from '#utils/coach/trend';

import { ringHand } from '../../utils/history/handText';

const run = (count: number, firstId: number, action: 'fold' | 'raise') =>
	Array.from({ length: count }, (_, i) => ringHand(6, 'As Ad', action, firstId + i));

const mount = (...logs: string[][]) =>
	render(() => <TrendsView hands={analyzeLog(logs.flat().join('\n')).hands} />);

describe('TrendsView', () => {
	describe('the verdict', () => {
		it('says a short history is too short, and how short', () => {
			mount(run(3, 100, 'fold'));
			expect(
				screen.getByText(
					/Too few hands to say: 3 graded so far, and a trend is read from 200/
				)
			).toBeTruthy();
			expect(screen.queryByRole('status')).toBeNull();
		});

		it('says a clear improvement is one, with the mistake given up', () => {
			mount(run(MIN_TREND_HANDS, 100, 'fold'), run(MIN_TREND_HANDS, 300, 'raise'));
			const verdict = screen.getByRole('status');
			expect(verdict.textContent).toMatch(/over the earlier 100 graded hands/);
			expect(verdict.querySelector('.is-better')!.textContent).toBe('clearly better.');
			const row = screen.getByRole('row', { name: /^Folded a standard open/ });
			expect(within(row).getByText('rarer')).toBeTruthy();
		});

		it('says a clear slip is one', () => {
			mount(run(MIN_TREND_HANDS, 100, 'raise'), run(MIN_TREND_HANDS, 300, 'fold'));
			expect(screen.getByRole('status').querySelector('.is-worse')).toBeTruthy();
			expect(screen.getByText('more often')).toBeTruthy();
		});

		it('names no change the sample cannot bear', () => {
			mount(run(MIN_TREND_HANDS, 100, 'raise'), run(MIN_TREND_HANDS, 300, 'raise'));
			expect(screen.getByRole('status').textContent).toMatch(
				/no change the sample can bear\.$/
			);
		});
	});

	describe('the sittings', () => {
		it('lists each, the latest first, with a link to its own Summary', () => {
			// 1900 ids on is half an hour on: a second sitting.
			mount(run(3, 100, 'fold'), run(2, 2100, 'raise'));
			const table = screen
				.getByRole('columnheader', { name: 'Sitting' })
				.closest('table')!;
			const rows = within(table).getAllByRole('row').slice(1);
			expect(rows).toHaveLength(2);
			expect(within(rows[0]).getAllByRole('cell')[0].textContent).toBe('2');
			expect(within(rows[1]).getAllByRole('cell')[2].textContent).toBe('3');
			const link = within(rows[1]).getByRole<HTMLAnchorElement>('link');
			expect(link.getAttribute('href')).toMatch(
				/^#summary\?scope=2026-01-02T10%3A01%3A40$/
			);
		});
	});
});
