import { describe, expect, it } from 'vitest';

import { CHART_IDS } from '#utils/ranges/charts';
import {
	chartIn,
	GROUP_LABELS,
	RANGE_GROUPS,
	RANGE_TABLES,
	stepChart,
	stepGroup,
	tableOf,
	tablesIn,
} from '#utils/ui/rangeTables';

describe('the range tables', () => {
	describe('the groups', () => {
		it('place every chart once, in the order of the data', () => {
			expect(RANGE_TABLES.map((table) => table.id)).toEqual(CHART_IDS);
			const grouped = RANGE_GROUPS.flatMap((group) => tablesIn(group));
			expect(grouped.map((table) => table.id).sort()).toEqual([...CHART_IDS].sort());
		});

		it('are none of them empty, and each has a name', () => {
			for (const group of RANGE_GROUPS) {
				expect(tablesIn(group).length).toBeGreaterThan(0);
				expect(GROUP_LABELS[group]).toBeTruthy();
			}
		});

		it('give each chart a key no other in its group has', () => {
			for (const group of RANGE_GROUPS) {
				const keys = tablesIn(group).map((table) => table.short);
				expect(new Set(keys).size).toBe(keys.length);
			}
		});

		it('know the seat of a chart that is one seat’s', () => {
			expect(tableOf('rfiBtn')).toMatchObject({ group: 'rfi', seat: 'BTN' });
			expect(tableOf('bbVsSb')).toMatchObject({ group: 'vsOpen', seat: 'BB' });
			expect(tableOf('cold4bet').seat).toBeNull();
		});
	});

	describe('stepChart', () => {
		it('moves to the chart beside it in the scenario', () => {
			expect(stepChart('rfiBtn', -1)).toBe('rfiCo');
			expect(stepChart('rfiBtn', 1)).toBe('rfiSb');
		});

		it('stops at either end rather than leaving the scenario', () => {
			expect(stepChart('rfiUtg', -1)).toBe('rfiUtg');
			expect(stepChart('rfiSb', 1)).toBe('rfiSb');
			expect(stepChart('cold4bet', 1)).toBe('cold4bet');
		});
	});

	describe('stepGroup', () => {
		it('keeps the seat where the next scenario has a chart for it', () => {
			expect(stepGroup('rfiBtn', 1)).toBe('btnVsEp');
			expect(stepGroup('btnVsEp', 1)).toBe('btnVs3bet');
			expect(stepGroup('btnVs3bet', -1)).toBe('btnVsEp');
			expect(stepGroup('bbVsCo', -1)).toBe('rfiUtg');
		});

		it('takes the first chart when the seat has none there', () => {
			expect(stepGroup('rfiHj', 1)).toBe('ipVsEp');
			expect(stepGroup('btnVs3bet', 1)).toBe('vs4betTight');
		});

		it('takes the first chart from one with no seat', () => {
			expect(stepGroup('vs4betWide', -1)).toBe('epVs3betIp');
			expect(stepGroup('cold4bet', 1)).toBe('overLimp');
		});

		it('stops at the first and last scenario', () => {
			expect(stepGroup('rfiCo', -1)).toBe('rfiCo');
			expect(stepGroup('bbVsLimp', 1)).toBe('bbVsLimp');
		});
	});

	describe('chartIn', () => {
		it('leaves the chart alone in its own scenario', () => {
			expect(chartIn('vsOpen', 'bbVsCo')).toBe('bbVsCo');
		});

		it('jumps scenarios, keeping the seat', () => {
			expect(chartIn('limped', 'rfiSb')).toBe('sbVsLimp');
			expect(chartIn('rfi', 'sbVsLimp')).toBe('rfiSb');
		});
	});
});
