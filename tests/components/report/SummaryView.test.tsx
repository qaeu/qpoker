import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@solidjs/testing-library';

import SummaryView from '#c/report/SummaryView';
import { analyzeLog, type AnalysisReport } from '#utils/coach/report';

import { TWO_HAND_LOG } from '../../integration/appHarness';
import {
	handText,
	ringHand,
	RIVER_HERO_CALL,
	TOUGH_FOLD,
	UNRECONCILED,
} from '../../utils/history/handText';

const report = analyzeLog(
	[TWO_HAND_LOG, ...[TOUGH_FOLD, RIVER_HERO_CALL, UNRECONCILED].map(handText)].join('\n')
);

const link = (name: string | RegExp, within_: HTMLElement = document.body) =>
	within(within_).getByRole<HTMLAnchorElement>('link', { name });

describe('SummaryView', () => {
	it('says where and when, and leaves who and what stakes to the header', () => {
		const { container } = render(() => <SummaryView report={report} />);
		const meta = container.querySelector('.summary-view__meta')!.textContent!;
		expect(meta).toMatch(/^Builder · 2026-01-02 \d\d:\d\d to 2026-01-02 \d\d:\d\d$/);
		expect(meta).not.toContain('hero');
	});

	describe('the figures', () => {
		it('link the counts of mistakes and good plays to their lists', () => {
			const { container } = render(() => <SummaryView report={report} />);
			const cards = [...container.querySelectorAll<HTMLElement>('.stat-band__card')];
			const card = (label: string) =>
				cards.find((item) => item.textContent!.startsWith(label))!;
			expect(link('Review them', card('Mistakes')).getAttribute('href')).toBe('#review');
			expect(link('Review them', card('Good plays')).getAttribute('href')).toBe(
				'#review?show=plays'
			);
			expect(within(card('Hands')).queryByRole('link')).toBeNull();
		});

		it('keeps the note on a figure that has no list behind it', () => {
			render(() => <SummaryView report={report} />);
			expect(screen.getByText('an estimate')).toBeTruthy();
		});
	});

	describe('where the losses went', () => {
		it('comes first, a row per kind, each a link to those hands', () => {
			const { container } = render(() => <SummaryView report={report} />);
			const titles = [...container.querySelectorAll('.summary-view__title')];
			expect(titles.map((title) => title.textContent)).toEqual([
				'Where the losses went',
				'By position',
				'Frequencies',
			]);
			for (const leak of report.leaks) {
				expect(link(leak.title).getAttribute('href')).toBe(`#review?kind=${leak.type}`);
			}
		});

		it('draws each kind’s share of the costliest', () => {
			const { container } = render(() => <SummaryView report={report} />);
			const shares = [
				...container.querySelectorAll<HTMLElement>('.summary-view__share'),
			].map((bar) => Number(bar.style.getPropertyValue('--share')));
			expect(shares).toHaveLength(report.leaks.length);
			expect(shares[0]).toBe(1);
			for (const share of shares) {
				expect(share).toBeGreaterThan(0);
				expect(share).toBeLessThanOrEqual(1);
			}
			expect(shares).toEqual([...shares].sort((a, b) => b - a));
		});

		it('says so when no mistake was graded', () => {
			const clean: AnalysisReport = { ...report, leaks: [] };
			const { container } = render(() => <SummaryView report={clean} />);
			expect(screen.getByText('No mistakes were graded in this log.')).toBeTruthy();
			expect(container.querySelector('.summary-view__leak')).toBeNull();
		});
	});

	describe('the frequencies', () => {
		const withStat = (change: Partial<AnalysisReport['session']['stats'][number]>) => {
			const [vpip, ...rest] = report.session.stats;
			return {
				...report,
				session: { ...report.session, stats: [{ ...vpip, ...change }, ...rest] },
			};
		};
		const reading = () =>
			screen.getByRole('row', { name: /^VPIP/ }).querySelector('.summary-view__reading')!
				.textContent;

		it('have a Reading column between the baseline and the sample', () => {
			render(() => <SummaryView report={report} />);
			const table = screen
				.getByRole('columnheader', { name: 'Reading' })
				.closest('table')!;
			expect(
				within(table)
					.getAllByRole('columnheader')
					.map((header) => header.textContent)
			).toEqual(['Stat', 'You', 'Baseline', 'Reading', 'Sample']);
		});

		it('say a sample is too small to read', () => {
			render(() => <SummaryView report={report} />);
			expect(reading()).toBe('too few to say');
		});

		it('say which way a leak runs', () => {
			render(() => (
				<SummaryView report={withStat({ leak: 'high', opportunities: 40 })} />
			));
			expect(reading()).toBe('too high');
			expect(
				screen.getByRole('row', { name: /^VPIP/ }).classList.contains('is-leak')
			).toBe(true);
		});

		it('say nothing of a frequency that is in line', () => {
			render(() => <SummaryView report={withStat({ leak: null, opportunities: 40 })} />);
			expect(reading()).toBe('');
		});
	});

	describe('the table sizes', () => {
		it('are listed under the frequencies, the fullest first', () => {
			const mixed = analyzeLog([ringHand(9), ringHand(6), ringHand(6)].join('\n'));
			render(() => <SummaryView report={mixed} />);
			expect(
				screen.getByText(
					'Typical figures are weighted by table size: 9-handed 1 hand, 6-handed 2.'
				)
			).toBeTruthy();
		});
	});

	describe('the warning', () => {
		it('links the hands that did not reconcile to their list', () => {
			render(() => <SummaryView report={report} />);
			const alert = screen.getByRole('alert');
			expect(alert.textContent).toContain(
				'1 hand did not add up to the stated pot and was not graded.'
			);
			expect(link('Show the hands not graded', alert).getAttribute('href')).toBe(
				'#review?show=ungraded'
			);
		});

		it('is not there when every hand reconciled', () => {
			render(() => <SummaryView report={analyzeLog(TWO_HAND_LOG)} />);
			expect(screen.queryByRole('alert')).toBeNull();
		});
	});
});
