/**
 * Lookup over the chart data: parsed once, on first use, and chosen by stack
 * depth. A depth with no entry of its own for a spot falls back to the deep one.
 */

import { parseRange, parseStrategy } from '../notation';
import type { Range, Strategy } from '../range';
import { DEEP, JAM_RANGES, LIMP_RANGE, MID, type ChartEntry, type ChartId } from './data';

export type { ChartId } from './data';

/** Under 30bb, 30 to 70bb, and deeper. */
export type Depth = 'short' | 'mid' | 'deep';

export type JamId = keyof typeof JAM_RANGES;

export const CHART_IDS = Object.keys(DEEP) as ChartId[];

export function depthOf(effectiveBb: number): Depth {
	return (
		effectiveBb < 30 ? 'short'
		: effectiveBb < 70 ? 'mid'
		: 'deep'
	);
}

const strategies = new Map<string, Strategy>();
const ranges = new Map<string, Range>();

/** True when `depth` has ranges of its own for the spot, not the deep fallback. */
export function hasOwnChart(id: ChartId, depth: Depth): boolean {
	return depth === 'deep' || (depth === 'mid' && id in MID);
}

/** The baseline strategy for a spot at a stack depth. */
export function chart(id: ChartId, depth: Depth = 'deep'): Strategy {
	const shallow = depth !== 'deep' && id in MID;
	const key = `${shallow ? 'mid' : 'deep'}:${id}`;
	let strategy = strategies.get(key);
	if (!strategy) {
		const entry: ChartEntry = (shallow ? MID[id] : undefined) ?? DEEP[id];
		strategy = parseStrategy(entry.raise, entry.call);
		strategies.set(key, strategy);
	}
	return strategy;
}

function cached(key: string, text: string): Range {
	let range = ranges.get(key);
	if (!range) {
		range = parseRange(text);
		ranges.set(key, range);
	}
	return range;
}

export const jamRange = (id: JamId): Range => cached(`jam:${id}`, JAM_RANGES[id]);

export const limpRange = (): Range => cached('limp', LIMP_RANGE);

/** What each chart is called where a person reads it. */
export const CHART_LABELS: Record<ChartId, string> = {
	rfiUtg: 'UTG, first in',
	rfiHj: 'HJ, first in',
	rfiCo: 'CO, first in',
	rfiBtn: 'BTN, first in',
	rfiSb: 'SB, first in',
	ipVsEp: 'HJ or CO vs UTG open',
	btnVsEp: 'BTN vs UTG or HJ open',
	coVsHj: 'CO vs HJ open',
	btnVsCo: 'BTN vs CO open',
	sbVsEp: 'SB vs UTG or HJ open',
	sbVsCo: 'SB vs CO open',
	sbVsBtn: 'SB vs BTN open',
	bbVsUtg: 'BB vs UTG open',
	bbVsHj: 'BB vs HJ open',
	bbVsCo: 'BB vs CO open',
	bbVsBtn: 'BB vs BTN open',
	bbVsSb: 'BB vs SB open',
	epVs3betIp: 'UTG or HJ open vs 3-bet in position',
	epVs3betOop: 'UTG or HJ open vs 3-bet from the blinds',
	coVs3betIp: 'CO open vs BTN 3-bet',
	coVs3betOop: 'CO open vs 3-bet from the blinds',
	btnVs3bet: 'BTN open vs 3-bet',
	sbVs3bet: 'SB open vs BB 3-bet',
	vs4betTight: '3-bet vs 4-bet from an early opener',
	vs4betWide: '3-bet vs 4-bet from a late opener',
	cold4bet: 'Facing an open and a 3-bet',
	overLimp: 'Limping behind a limper',
	sbVsLimp: 'SB vs limpers',
	bbVsLimp: 'BB vs limpers',
	limpedVsRaise: 'Limped, then raised',
};
