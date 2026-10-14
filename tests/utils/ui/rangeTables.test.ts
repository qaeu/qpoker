import { describe, expect, it } from 'vitest';

import { CLASS_COUNT, classFromName } from '#utils/cards/combos';
import { chart, CHART_IDS } from '#utils/ranges/charts';
import {
	chartIn,
	GROUP_LABELS,
	hasDepths,
	hasOwnTable,
	RANGE_GROUPS,
	RANGE_TABLES,
	stepChart,
	stepGroup,
	TABLE_IDS,
	TABLE_LABELS,
	tableOf,
	tablesIn,
	tableStrategy,
} from '#utils/ui/rangeTables';

describe('the range tables', () => {
	describe('the groups', () => {
		it('place every table once, in the order of the data', () => {
			expect(RANGE_TABLES.map((table) => table.id)).toEqual(TABLE_IDS);
			const grouped = RANGE_GROUPS.flatMap((group) => tablesIn(group));
			expect(grouped.map((table) => table.id).sort()).toEqual([...TABLE_IDS].sort());
		});

		it('hold every chart but the limping half of the play behind a limper', () => {
			const charts = TABLE_IDS.filter((id) => (CHART_IDS as string[]).includes(id));
			expect(charts).toEqual(CHART_IDS.filter((id) => id !== 'overLimp'));
			for (const id of TABLE_IDS) expect(TABLE_LABELS[id]).toBeTruthy();
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

		it('goes round from either end to the other, inside the scenario', () => {
			expect(stepChart('rfiUtg', -1)).toBe('rfiSb');
			expect(stepChart('rfiSb', 1)).toBe('rfiUtg');
			expect(stepChart('bbVsSb', 1)).toBe('ipVsEp');
		});

		it('stays put in a scenario of one chart', () => {
			expect(stepChart('cold4bet', 1)).toBe('cold4bet');
			expect(stepChart('cold4bet', -1)).toBe('cold4bet');
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
			expect(stepGroup('cold4bet', 1)).toBe('overLimpUtg');
		});

		it('goes round from the first scenario to the last and back', () => {
			expect(stepGroup('rfiCo', -1)).toBe('overLimpCo');
			expect(stepGroup('rfiSb', -1)).toBe('sbVsLimp');
			expect(stepGroup('bbVsLimp', 1)).toBe('rfiUtg');
			expect(stepGroup('sbVsLimp', 1)).toBe('rfiSb');
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

	describe('behind a limper', () => {
		const at = (name: string) => classFromName(name);

		it('has a table for each seat short of the blinds', () => {
			expect(tablesIn('limped').map((table) => table.short)).toEqual([
				'UTG',
				'HJ',
				'CO',
				'BTN',
				'SB',
				'BB',
				'Limped, raised',
			]);
			expect(tableOf('overLimpCo')).toMatchObject({ seat: 'CO' });
			expect(tableOf('overLimpCo').note).toMatch(/Iso-raises/);
			expect(tableOf('sbVsLimp').note).toBeNull();
		});

		it('iso-raises with the first-in range of the seat before', () => {
			expect(tableStrategy('overLimpBtn', 'deep').raise).toEqual(chart('rfiCo').raise);
			expect(tableStrategy('overLimpHj', 'deep').raise).toEqual(chart('rfiUtg').raise);
			for (const hand of ['AA', 'KK', 'AKs', 'AKo'])
				expect(tableStrategy('overLimpCo', 'deep').raise[at(hand)]).toBe(1);
		});

		it('limps along only with hands it does not raise', () => {
			const { raise, call } = tableStrategy('overLimpUtg', 'deep');
			expect(call[at('54s')]).toBeGreaterThan(0);
			for (let cls = 0; cls < CLASS_COUNT; cls++)
				expect(raise[cls] + call[cls]).toBeLessThanOrEqual(1 + 1e-9);
		});

		it('is the same at every depth', () => {
			expect(hasOwnTable('overLimpBtn', 'mid')).toBe(false);
			expect(tableStrategy('overLimpBtn', 'mid')).toEqual(
				tableStrategy('overLimpBtn', 'deep')
			);
		});
	});

	describe('hasDepths', () => {
		it('holds for a scenario with a chart of its own for the shorter stack', () => {
			expect(RANGE_GROUPS.filter(hasDepths)).toEqual(['vs3bet', 'vs4bet', 'cold4bet']);
		});
	});
});
