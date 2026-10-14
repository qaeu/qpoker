/**
 * The preflop charts as the Ranges view sets them out: a row of scenarios and,
 * under it, the charts of the one chosen. Moving between scenarios keeps the
 * hero's seat where the next one has a chart for it.
 */

import type { PreflopFacts } from '../coach/grade';
import type { Position } from '../history/replay';
import {
	chart,
	CHART_IDS,
	CHART_SEAT,
	CHART_LABELS,
	hasOwnChart,
	type ChartId,
	type ChartSeat,
	type Depth,
} from '../ranges/charts';
import { overLimpStrategy } from '../ranges/preflopSpot';
import type { Strategy } from '../ranges/range';

export const RANGE_GROUPS = [
	'rfi',
	'vsOpen',
	'vs3bet',
	'vs4bet',
	'cold4bet',
	'limped',
] as const;

export type RangeGroup = (typeof RANGE_GROUPS)[number];

export const GROUP_LABELS: Record<RangeGroup, string> = {
	rfi: 'First in',
	vsOpen: 'Vs open',
	vs3bet: 'Vs 3-bet',
	vs4bet: 'Vs 4-bet',
	cold4bet: 'Cold 4-bet',
	limped: 'Limped',
};

/** The depths with charts to show: under 30bb the grader reads the mid ones. */
export const RANGE_DEPTHS = ['deep', 'mid'] as const;

export type RangeDepth = (typeof RANGE_DEPTHS)[number];

/**
 * The seats behind a limper, short of the blinds. Their strategy is no one
 * chart: `overLimp` holds only the limping half, and the grader adds the
 * iso-raise, so each seat gets a table of the two together in its place.
 */
const OVER_LIMP = {
	overLimpUtg: 'UTG',
	overLimpHj: 'HJ',
	overLimpCo: 'CO',
	overLimpBtn: 'BTN',
} as const satisfies Record<string, ChartSeat>;

type OverLimpId = keyof typeof OVER_LIMP;

/** A table the Ranges view can show: a chart, or one seat's play behind a limper. */
export type TableId = Exclude<ChartId, 'overLimp'> | OverLimpId;

/** Every table, in the order of the data. */
export const TABLE_IDS: readonly TableId[] = CHART_IDS.flatMap((id) =>
	id === 'overLimp' ? (Object.keys(OVER_LIMP) as OverLimpId[]) : [id]
);

export const TABLE_LABELS: Record<TableId, string> = {
	...CHART_LABELS,
	overLimpUtg: 'LJ or earlier, behind a limper',
	overLimpHj: 'HJ behind a limper',
	overLimpCo: 'CO behind a limper',
	overLimpBtn: 'BTN behind a limper',
};

/** What the Ranges view is showing, as its address carries it. */
export interface RangesQuery {
	chart: TableId;
	depth: RangeDepth;
}

export const DEFAULT_RANGES: RangesQuery = { chart: 'rfiBtn', depth: 'deep' };

export interface RangeTable {
	id: TableId;
	group: RangeGroup;
	/** What its key says: the scenario's own key has said the rest. */
	short: string;
	/** The hero's seat, where the chart is one seat's. */
	seat: ChartSeat | null;
	/** Where its ranges come from, when that is not one chart. */
	note: string | null;
}

interface Placement {
	group: RangeGroup;
	short: string;
	seat?: ChartSeat;
	note?: string;
}

const OVER_LIMP_NOTE =
	'Iso-raises with the first-in range of the seat before, and limps along with the hands that play well multiway.';

/** A record, so a chart added to the data is not placed until it is named here. */
const PLACES: Record<TableId, Placement> = {
	rfiUtg: { group: 'rfi', short: 'UTG', seat: 'UTG' },
	rfiHj: { group: 'rfi', short: 'HJ', seat: 'HJ' },
	rfiCo: { group: 'rfi', short: 'CO', seat: 'CO' },
	rfiBtn: { group: 'rfi', short: 'BTN', seat: 'BTN' },
	rfiSb: { group: 'rfi', short: 'SB', seat: 'SB' },
	ipVsEp: { group: 'vsOpen', short: 'HJ/CO vs UTG', seat: 'CO' },
	btnVsEp: { group: 'vsOpen', short: 'BTN vs UTG/HJ', seat: 'BTN' },
	coVsHj: { group: 'vsOpen', short: 'CO vs HJ', seat: 'CO' },
	btnVsCo: { group: 'vsOpen', short: 'BTN vs CO', seat: 'BTN' },
	sbVsEp: { group: 'vsOpen', short: 'SB vs UTG/HJ', seat: 'SB' },
	sbVsCo: { group: 'vsOpen', short: 'SB vs CO', seat: 'SB' },
	sbVsBtn: { group: 'vsOpen', short: 'SB vs BTN', seat: 'SB' },
	bbVsUtg: { group: 'vsOpen', short: 'BB vs UTG', seat: 'BB' },
	bbVsHj: { group: 'vsOpen', short: 'BB vs HJ', seat: 'BB' },
	bbVsCo: { group: 'vsOpen', short: 'BB vs CO', seat: 'BB' },
	bbVsBtn: { group: 'vsOpen', short: 'BB vs BTN', seat: 'BB' },
	bbVsSb: { group: 'vsOpen', short: 'BB vs SB', seat: 'BB' },
	epVs3betIp: { group: 'vs3bet', short: 'UTG/HJ, 3-bet IP', seat: 'UTG' },
	epVs3betOop: { group: 'vs3bet', short: 'UTG/HJ, blinds', seat: 'UTG' },
	coVs3betIp: { group: 'vs3bet', short: 'CO vs BTN', seat: 'CO' },
	coVs3betOop: { group: 'vs3bet', short: 'CO, blinds', seat: 'CO' },
	btnVs3bet: { group: 'vs3bet', short: 'BTN', seat: 'BTN' },
	sbVs3bet: { group: 'vs3bet', short: 'SB', seat: 'SB' },
	vs4betTight: { group: 'vs4bet', short: 'Early opener' },
	vs4betWide: { group: 'vs4bet', short: 'Late opener' },
	cold4bet: { group: 'cold4bet', short: 'Open + 3-bet' },
	overLimpUtg: { group: 'limped', short: 'UTG', seat: 'UTG', note: OVER_LIMP_NOTE },
	overLimpHj: { group: 'limped', short: 'HJ', seat: 'HJ', note: OVER_LIMP_NOTE },
	overLimpCo: { group: 'limped', short: 'CO', seat: 'CO', note: OVER_LIMP_NOTE },
	overLimpBtn: { group: 'limped', short: 'BTN', seat: 'BTN', note: OVER_LIMP_NOTE },
	sbVsLimp: { group: 'limped', short: 'SB', seat: 'SB' },
	bbVsLimp: { group: 'limped', short: 'BB', seat: 'BB' },
	limpedVsRaise: { group: 'limped', short: 'Limped, raised' },
};

/** Every table, in the order of the data. */
export const RANGE_TABLES: readonly RangeTable[] = TABLE_IDS.map((id) => ({
	id,
	group: PLACES[id].group,
	short: PLACES[id].short,
	seat: PLACES[id].seat ?? null,
	note: PLACES[id].note ?? null,
}));

const isOverLimp = (id: TableId): id is OverLimpId => Object.hasOwn(OVER_LIMP, id);

/** The strategy a table shows: the one the grader plays at `depth`. */
export function tableStrategy(id: TableId, depth: Depth): Strategy {
	return isOverLimp(id) ? overLimpStrategy(OVER_LIMP[id]) : chart(id, depth);
}

/** True when `depth` has ranges of its own for the table, not the deep ones. */
export function hasOwnTable(id: TableId, depth: Depth): boolean {
	return isOverLimp(id) ? depth === 'deep' : hasOwnChart(id, depth);
}

/**
 * The table a preflop decision was graded against: its chart, or, behind a
 * limper short of the blinds, the seat's table, which no one chart is.
 */
export function baselineTable(facts: PreflopFacts, position: Position): TableId | null {
	if (facts.chart) return facts.chart === 'overLimp' ? null : facts.chart;
	if (facts.scenario !== 'vsLimp') return null;
	const seat = CHART_SEAT[position];
	const id = (Object.keys(OVER_LIMP) as OverLimpId[]).find(
		(key) => OVER_LIMP[key] === seat
	);
	return id ?? null;
}

export function tableOf(id: TableId): RangeTable {
	return RANGE_TABLES.find((table) => table.id === id)!;
}

export function tablesIn(group: RangeGroup): RangeTable[] {
	return RANGE_TABLES.filter((table) => table.group === group);
}

/** Whether any chart in `group` has one of its own for the shorter stack. */
export function hasDepths(group: RangeGroup): boolean {
	return tablesIn(group).some((table) => hasOwnTable(table.id, 'mid'));
}

/**
 * The chart to show in `group`, coming from `id`: the same seat's if the group
 * has one, and its first otherwise.
 */
export function chartIn(group: RangeGroup, id: TableId): TableId {
	const from = tableOf(id);
	if (from.group === group) return id;
	const tables = tablesIn(group);
	const seated = from.seat ? tables.find((table) => table.seat === from.seat) : undefined;
	return (seated ?? tables[0]).id;
}

/** The item `by` along from `at`, going round from either end to the other. */
function around<T>(items: readonly T[], at: number, by: 1 | -1): T {
	return items[(at + by + items.length) % items.length];
}

/** The chart beside `id` in its scenario, the last one's next being the first. */
export function stepChart(id: TableId, by: 1 | -1): TableId {
	const tables = tablesIn(tableOf(id).group);
	return around(
		tables,
		tables.findIndex((table) => table.id === id),
		by
	).id;
}

/** The chart in the scenario before or after `id`'s, going round the same way. */
export function stepGroup(id: TableId, by: 1 | -1): TableId {
	const group = around(RANGE_GROUPS, RANGE_GROUPS.indexOf(tableOf(id).group), by);
	return chartIn(group, id);
}
