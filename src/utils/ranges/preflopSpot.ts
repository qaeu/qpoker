/**
 * Names the preflop situation a player was in when they acted -- first in,
 * facing an open, facing a 3-bet and so on -- and picks the chart that answers
 * it. The same classification serves the hero's grade and every opponent's
 * range, so the two can never disagree about what a spot was.
 */

import { isExtraSeat } from '../history/replay';
import type { Replay, Position, Step } from '../history/replay';
import { CLASS_COUNT } from '../cards/combos';
import { chart, CHART_SEAT, depthOf, hasOwnChart, jamRange, limpRange } from './charts';
import type { ChartId, ChartSeat, Depth, JamId } from './charts';
import { emptyRange, fullRange, multiplyRanges, rangeCombos } from './range';
import type { Range, Strategy } from './range';

export const SCENARIOS = [
	'rfi',
	'vsLimp',
	'vsOpen',
	'squeeze',
	'vs3bet',
	'cold4bet',
	'vs4bet',
	'vs5bet',
	'limpedVsRaise',
] as const;

export type Scenario = (typeof SCENARIOS)[number];

export type Confidence = 'high' | 'medium' | 'low';

export interface PreflopSpot {
	scenario: Scenario;
	position: Position;
	/** The last player to raise, if anyone has. */
	villain: string | null;
	villainPosition: Position | null;
	effectiveBb: number;
	depth: Depth;
	chart: ChartId | null;
	strategy: Strategy;
	confidence: Confidence;
	/**
	 * Whose seat is earlier than any chart, so that UTG's stood in for it: the
	 * player's own, or a raiser's. Null at six players or fewer.
	 */
	standIn: 'hero' | 'villain' | null;
	/** Calling puts the player all-in, or the raiser already is: call or fold. */
	facingAllIn: boolean;
	/** Raises, limps, and calls of the last raise, before this action. */
	raises: number;
	limpers: number;
	callers: number;
	/** `BTN vs CO open`, for the report. */
	label: string;
	/** A standard raise size here, as a total in big blinds, when raising is an option. */
	raiseToBb: number | null;
}

export const SCENARIO_NAMES: Record<Scenario, string> = {
	rfi: 'first in',
	vsLimp: 'facing a limp',
	vsOpen: 'facing an open',
	squeeze: 'facing an open and a call',
	vs3bet: 'facing a 3-bet',
	cold4bet: 'facing an open and a 3-bet',
	vs4bet: 'facing a 4-bet',
	vs5bet: 'facing a 5-bet',
	limpedVsRaise: 'raised after limping',
};

const EARLIER: Record<ChartSeat, ChartSeat> = {
	UTG: 'UTG',
	HJ: 'UTG',
	CO: 'HJ',
	BTN: 'CO',
	SB: 'CO',
	BB: 'CO',
};

const RFI_CHART: Record<ChartSeat, ChartId> = {
	UTG: 'rfiUtg',
	HJ: 'rfiHj',
	CO: 'rfiCo',
	BTN: 'rfiBtn',
	SB: 'rfiSb',
	BB: 'rfiSb',
};

/** The chart for a seat facing a single open from another. */
function vsOpenChart(heroSeat: Position, openerSeat: Position): ChartId {
	const hero = CHART_SEAT[heroSeat];
	const opener = CHART_SEAT[openerSeat];
	if (hero === 'BB') {
		return (
			opener === 'UTG' ? 'bbVsUtg'
			: opener === 'HJ' ? 'bbVsHj'
			: opener === 'CO' ? 'bbVsCo'
			: opener === 'BTN' ? 'bbVsBtn'
			: 'bbVsSb'
		);
	}
	if (hero === 'SB') {
		return (
			opener === 'BTN' ? 'sbVsBtn'
			: opener === 'CO' ? 'sbVsCo'
			: 'sbVsEp'
		);
	}
	if (hero === 'BTN') return opener === 'CO' ? 'btnVsCo' : 'btnVsEp';
	if (hero === 'CO' && opener === 'HJ') return 'coVsHj';
	return 'ipVsEp';
}

/** The chart for an opener facing a 3-bet. */
function vs3betChart(heroSeat: Position, threeBettor: Position): ChartId {
	const hero = CHART_SEAT[heroSeat];
	const blinds = threeBettor === 'SB' || threeBettor === 'BB';
	if (hero === 'BTN') return 'btnVs3bet';
	if (hero === 'SB') return 'sbVs3bet';
	if (hero === 'CO') return blinds ? 'coVs3betOop' : 'coVs3betIp';
	return blinds ? 'epVs3betOop' : 'epVs3betIp';
}

/**
 * Behind limpers, short of the blinds: iso-raise like the seat before, or limp
 * along with hands that play well multiway.
 */
export function overLimpStrategy(seat: ChartSeat): Strategy {
	const raise = chart(RFI_CHART[EARLIER[seat]]).raise;
	const call = emptyRange();
	const along = chart('overLimp').call;
	for (let cls = 0; cls < CLASS_COUNT; cls++)
		call[cls] = Math.min(along[cls], 1 - raise[cls]);
	return { raise, call };
}

/** Classifies the spot `step` (a preflop action) was taken in. */
export function classifyPreflop(replay: Replay, step: Step): PreflopSpot {
	const { hand, layout } = replay;
	const bb = hand.stakes.bigBlind;
	const player = step.action.player;
	const position = layout?.positions[player] ?? 'UTG';
	const before = replay.steps.filter(
		(other) => other.index < step.index && other.street === 'preflop'
	);

	const raisers: string[] = [];
	let limpers = 0;
	let callers = 0;
	let ownLimp = false;
	for (const { action } of before) {
		if (action.kind === 'raise') {
			raisers.push(action.player);
			callers = 0;
		} else if (action.kind === 'call') {
			if (raisers.length === 0) {
				limpers++;
				if (action.player === player) ownLimp = true;
			} else callers++;
		}
	}
	const raises = raisers.length;
	const villain = raisers.at(-1) ?? null;
	const villainPosition = villain ? (layout?.positions[villain] ?? null) : null;
	const ownRaises = raisers.filter((name) => name === player).length;
	const madeLastButOne = raises >= 2 && raisers[raises - 2] === player;

	const effectiveBb = step.effectiveStack / bb;
	const depth = depthOf(effectiveBb);
	let confidence: Confidence = depth === 'short' ? 'low' : 'high';
	const soften = (to: Confidence) => {
		if (to === 'low' || confidence === 'high') confidence = to;
	};

	let scenario: Scenario;
	let chartId: ChartId | null = null;
	let strategy: Strategy;

	if (raises === 0 && limpers === 0) {
		scenario = 'rfi';
		chartId = RFI_CHART[CHART_SEAT[position]];
		strategy = chart(chartId, depth);
	} else if (raises === 0) {
		scenario = 'vsLimp';
		soften('medium');
		if (position === 'SB' || position === 'BB') {
			chartId = position === 'SB' ? 'sbVsLimp' : 'bbVsLimp';
			strategy = chart(chartId, depth);
		} else {
			strategy = overLimpStrategy(CHART_SEAT[position]);
		}
	} else if (raises === 1 && ownRaises === 0) {
		if (ownLimp) {
			scenario = 'limpedVsRaise';
			chartId = 'limpedVsRaise';
			soften('low');
		} else {
			scenario = callers > 0 ? 'squeeze' : 'vsOpen';
			chartId = vsOpenChart(position, villainPosition ?? 'UTG');
			if (callers > 0 || limpers > 0) soften('medium');
		}
		strategy = chart(chartId, depth);
	} else if (raises === 2 && ownRaises === 1) {
		scenario = 'vs3bet';
		chartId = vs3betChart(position, villainPosition ?? 'BB');
		if (limpers > 0 || callers > 0) soften('medium');
		strategy = chart(chartId, depth);
	} else if (raises === 3 && madeLastButOne) {
		scenario = 'vs4bet';
		const opener = CHART_SEAT[layout?.positions[raisers[0]] ?? 'UTG'];
		chartId = opener === 'UTG' || opener === 'HJ' ? 'vs4betTight' : 'vs4betWide';
		strategy = chart(chartId, depth);
	} else if (raises === 4 && madeLastButOne) {
		// No chart goes this deep: the tightest one stands in, and says so.
		scenario = 'vs5bet';
		chartId = 'vs4betTight';
		soften('low');
		strategy = chart(chartId, depth);
	} else {
		scenario = 'cold4bet';
		chartId = 'cold4bet';
		if (raises > 2 || ownRaises > 0 || ownLimp) soften('low');
		else soften('medium');
		strategy = chart(chartId, depth);
	}
	if (chartId && !hasOwnChart(chartId, depth) && depth === 'mid' && raises >= 2) {
		soften('medium');
	}
	const standIn =
		isExtraSeat(layout, player) ? 'hero'
		: raisers.some((name) => name !== player && isExtraSeat(layout, name)) ? 'villain'
		: null;
	if (standIn) soften('medium');

	const villainStep =
		villain ? before.findLast((s) => s.action.player === villain) : null;
	const othersCanRaise = step.canAct.some((name) => name !== player && name !== villain);
	const facingAllIn =
		raises > 0
		&& (step.toCall >= step.stackBefore
			|| (villainStep?.action.allIn === true && !othersCanRaise));

	let raiseToBb: number | null;
	if (raises === 0) {
		raiseToBb = (position === 'SB' ? 3 : 2.5) + limpers;
	} else {
		const inPosition = position !== 'SB' && position !== 'BB';
		const factor =
			raises === 1 ?
				inPosition ? 3
				:	4
			:	2.3;
		raiseToBb = (step.streetBet / bb) * factor + callers * (step.streetBet / bb);
		// Past a third of the stack there is nothing left to play: shove.
		if (raiseToBb > effectiveBb / 3) raiseToBb = effectiveBb;
	}

	const versus =
		villainPosition && scenario !== 'limpedVsRaise' ?
			`${position} vs ${villainPosition}, ${SCENARIO_NAMES[scenario]}`
		:	`${position}, ${SCENARIO_NAMES[scenario]}`;

	return {
		scenario,
		position,
		villain,
		villainPosition,
		effectiveBb,
		depth,
		chart: chartId,
		strategy,
		confidence,
		standIn,
		facingAllIn,
		raises,
		limpers,
		callers,
		label: versus,
		raiseToBb,
	};
}

/** The shoving range assumed for a jam made with `raises` raises already in. */
export function jamRangeId(raises: number, effectiveBb: number): JamId {
	if (raises === 0) return 'open';
	if (raises === 1) return effectiveBb <= 30 ? 'overOpenShort' : 'overOpen';
	return effectiveBb <= 60 ? 'overThreeBet' : 'overThreeBetDeep';
}

/** A raise is a shove when it commits the stack, or most of it. */
function isJam(step: Step): boolean {
	return (
		step.action.kind === 'raise'
		&& (step.action.allIn || step.action.amount >= step.stackBefore * 0.6)
	);
}

/** The range one preflop action implies on its own, before any earlier ones. */
function rangeOfAction(replay: Replay, step: Step): Range | null {
	const spot = classifyPreflop(replay, step);
	const { kind } = step.action;
	if (kind === 'raise') {
		if (isJam(step) && (spot.raises > 0 || spot.effectiveBb <= 25)) {
			return jamRange(jamRangeId(spot.raises, spot.effectiveBb));
		}
		return spot.strategy.raise;
	}
	if (kind === 'call') {
		if (spot.scenario === 'rfi') return limpRange();
		return spot.strategy.call;
	}
	if (kind === 'check') {
		const out = fullRange();
		for (let cls = 0; cls < CLASS_COUNT; cls++) out[cls] = 1 - spot.strategy.raise[cls];
		return out;
	}
	return null;
}

/** Fewer combos than this and a range is treated as off the charts. */
const MIN_COMBOS = 12;

/**
 * The range a player's whole preflop line implies, up to (not including) the
 * action at `beforeIndex`. Each action narrows the last. A line the charts do
 * not contain -- a limp-call, a cold call they never make -- would narrow to
 * nothing, so it falls back to the limping range rather than an empty one.
 */
export function preflopRange(
	replay: Replay,
	player: string,
	beforeIndex = Infinity
): Range {
	let range = fullRange();
	let acted = false;
	for (const step of replay.steps) {
		if (step.street !== 'preflop' || step.index >= beforeIndex) continue;
		if (step.action.player !== player) continue;
		const implied = rangeOfAction(replay, step);
		if (!implied) continue;
		acted = true;
		const narrowed = multiplyRanges(range, implied);
		range =
			rangeCombos(narrowed) >= MIN_COMBOS ? narrowed
			: rangeCombos(implied) >= MIN_COMBOS ? implied
			: limpRange();
	}
	return acted ? range : fullRange();
}
