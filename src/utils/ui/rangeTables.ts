/**
 * The preflop charts as the Ranges view sets them out: a row of scenarios and,
 * under it, the charts of the one chosen. Moving between scenarios keeps the
 * hero's seat where the next one has a chart for it.
 */

import { CHART_IDS, type ChartId, type ChartSeat } from '../ranges/charts';

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

/** What the Ranges view is showing, as its address carries it. */
export interface RangesQuery {
	chart: ChartId;
	depth: RangeDepth;
}

export const DEFAULT_RANGES: RangesQuery = { chart: 'rfiBtn', depth: 'deep' };

export interface RangeTable {
	id: ChartId;
	group: RangeGroup;
	/** What its key says: the scenario's own key has said the rest. */
	short: string;
	/** The hero's seat, where the chart is one seat's. */
	seat: ChartSeat | null;
}

interface Placement {
	group: RangeGroup;
	short: string;
	seat?: ChartSeat;
}

/** A record, so a chart added to the data is not placed until it is named here. */
const PLACES: Record<ChartId, Placement> = {
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
	overLimp: { group: 'limped', short: 'Behind a limper' },
	sbVsLimp: { group: 'limped', short: 'SB', seat: 'SB' },
	bbVsLimp: { group: 'limped', short: 'BB', seat: 'BB' },
	limpedVsRaise: { group: 'limped', short: 'Limped, raised' },
};

/** Every chart, in the order of the data. */
export const RANGE_TABLES: readonly RangeTable[] = CHART_IDS.map((id) => ({
	id,
	group: PLACES[id].group,
	short: PLACES[id].short,
	seat: PLACES[id].seat ?? null,
}));

export function tableOf(id: ChartId): RangeTable {
	return RANGE_TABLES.find((table) => table.id === id)!;
}

export function tablesIn(group: RangeGroup): RangeTable[] {
	return RANGE_TABLES.filter((table) => table.group === group);
}

/**
 * The chart to show in `group`, coming from `id`: the same seat's if the group
 * has one, and its first otherwise.
 */
export function chartIn(group: RangeGroup, id: ChartId): ChartId {
	const from = tableOf(id);
	if (from.group === group) return id;
	const tables = tablesIn(group);
	const seated = from.seat ? tables.find((table) => table.seat === from.seat) : undefined;
	return (seated ?? tables[0]).id;
}

/** The chart beside `id` in its scenario; `id` itself at either end. */
export function stepChart(id: ChartId, by: 1 | -1): ChartId {
	const tables = tablesIn(tableOf(id).group);
	const at = tables.findIndex((table) => table.id === id);
	return (tables[at + by] ?? tables[at]).id;
}

/** The chart in the scenario before or after `id`'s; `id` itself at either end. */
export function stepGroup(id: ChartId, by: 1 | -1): ChartId {
	const group = RANGE_GROUPS[RANGE_GROUPS.indexOf(tableOf(id).group) + by];
	return group ? chartIn(group, id) : id;
}
