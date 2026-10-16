/**
 * Grading one decision the hero made: what they did, what the baseline does,
 * and what the difference costs. Preflop the baseline is a chart frequency, or
 * a pot-odds calculation once stacks are going in; postflop it is the model in
 * `postflop/decision.ts`. See docs/coach-model.md.
 */

import { classOf, className } from '../cards/combos';
import { equityVsRanges, removeDead } from '../cards/equity';
import type { EquityOptions } from '../cards/equity';
import type { Street } from '../history/hand';
import type { Replay, Step } from '../history/replay';
import {
	judgePostflop,
	UNDERDOG,
	type Avoided,
	type PostflopFacts,
} from '../postflop/decision';
import type { ChartId, Depth } from '../ranges/charts';
import { classifyPreflop, preflopRange } from '../ranges/preflopSpot';
import type { Confidence, PreflopSpot, Scenario } from '../ranges/preflopSpot';
import { continueRange, frequencyOf, toComboRange } from '../ranges/range';
import type { PreflopChoice } from '../ranges/range';
import { handTier, isPremium, marginTier, TIER_VALUE_BB } from '../ranges/tiers';
import { explain } from './explain';
import { priceCall, rangeDepth, type CallPrice } from './preflopPrice';
import { goodPlayOf, type GoodPlay } from './goodPlays';
import { severityOf, type MistakeType, type Severity } from './mistakes';

export type Choice = 'fold' | 'check' | 'call' | 'bet' | 'raise';

export interface GradeOptions extends EquityOptions {
	/** Share of a pot the house takes once a flop is dealt. */
	rake: number;
}

export interface PreflopFacts {
	/** `AKo`. */
	hand: string;
	spot: string;
	/** The kind of spot, which the Review list filters on. */
	scenario: Scenario;
	/** Set when UTG's chart stood in for a seat earlier than any chart. */
	standIn?: 'hero' | 'villain';
	effectiveBb: number;
	/** The chart the spot was graded against, for showing the whole range. */
	chart: ChartId | null;
	depth: Depth;
	/** The chart's frequencies for this hand. */
	raise: number;
	call: number;
	fold: number;
	/** The raise made and the standard one, as totals in big blinds. */
	raiseToBb?: number;
	suggestedRaiseToBb?: number;
	/** Facing a shove: equity, the equity needed, and what a call is worth. */
	equity?: number;
	/** The ranges that equity was taken against. */
	opponents?: number;
	potOdds?: number;
	callEvBb?: number;
	/**
	 * A fold or a loose call priced from equity against the raiser's range, in
	 * place of the chart's tier gap: the raw equity, the share of it realised,
	 * and what calling is worth in big blinds.
	 */
	priced?: CallPrice;
}

export interface Grading {
	handId: string;
	stepIndex: number;
	street: Street;
	/** A one-line name for the situation. */
	spot: string;
	chosen: Choice;
	recommended: Choice;
	/**
	 * What the choice cost, in big blinds: **zero or negative**, never positive,
	 * and exactly zero when no mistake is named.
	 */
	evLostBb: number;
	confidence: Confidence;
	mistake: MistakeType | null;
	severity: Severity;
	/** A right decision that was hard to make and clearly beat the other one. */
	goodPlay: GoodPlay | null;
	explanation: string;
	preflop?: PreflopFacts;
	postflop?: PostflopFacts;
}

/** A hand played at least this often by the chart is never called a mistake. */
export const MIX_FLOOR = 0.2;

/** How much bigger than a single-raised pot each spot's mistakes are. */
const SCENARIO_WEIGHT: Record<Scenario, number> = {
	rfi: 1,
	vsLimp: 1,
	vsOpen: 1.6,
	squeeze: 1.8,
	limpedVsRaise: 1.5,
	vs3bet: 3,
	cold4bet: 4,
	vs4bet: 6,
	vs5bet: 6,
};

/** A raise of this share of the stack is a shove in all but name. */
const COMMITTED = 0.6;

const LOOSE_BB_PER_STEP = 0.07;
/** The right hand played the wrong way costs a little, and more in bigger pots. */
const wrongLineBb = (weight: number): number => Math.max(0.2, 0.12 * weight);

function tightMistake(spot: PreflopSpot): MistakeType {
	switch (spot.scenario) {
		case 'rfi':
		case 'vsLimp':
			return 'open-tight';
		case 'vsOpen':
		case 'squeeze':
		case 'limpedVsRaise':
			return spot.position === 'BB' ? 'bb-underdefend' : 'fold-vs-open';
		case 'vs3bet':
			return 'overfold-three-bet';
		default:
			return 'overfold-four-bet';
	}
}

function looseMistake(spot: PreflopSpot, choice: PreflopChoice): MistakeType {
	switch (spot.scenario) {
		case 'rfi':
			return (
				choice === 'raise' ? 'open-loose'
				: spot.position === 'SB' ? 'sb-complete'
				: 'open-limp'
			);
		case 'vsLimp':
			return choice === 'raise' ? 'iso-loose' : 'open-limp';
		case 'vsOpen':
		case 'squeeze':
		case 'limpedVsRaise':
			return (
				choice === 'raise' ? 'three-bet-loose'
				: spot.position === 'BB' ? 'bb-overdefend'
				: 'cold-call-loose'
			);
		case 'vs3bet':
			return 'call-three-bet-loose';
		default:
			return 'four-bet-loose';
	}
}

function lineMistake(spot: PreflopSpot, choice: PreflopChoice): MistakeType {
	if (spot.scenario === 'rfi' && choice === 'call') {
		return spot.position === 'SB' ? 'sb-complete' : 'open-limp';
	}
	if (spot.scenario === 'vsLimp' && choice !== 'raise') return 'missed-iso';
	if ((spot.scenario === 'vsOpen' || spot.scenario === 'squeeze') && choice === 'call') {
		return 'missed-three-bet';
	}
	return 'wrong-line';
}

function finish(
	base: Omit<Grading, 'severity' | 'goodPlay' | 'explanation' | 'evLostBb' | 'mistake'>,
	mistake: MistakeType | null,
	lostBb: number,
	avoided?: Avoided
): Grading {
	const evLostBb = mistake ? -Math.max(0, lostBb) : 0;
	let severity = severityOf(evLostBb);
	// The word is kept for findings the model can stand behind.
	if (severity === 'blunder' && base.confidence === 'low') severity = 'mistake';
	// A named mistake too small to matter is not reported as one.
	const named = severity === 'ok' ? null : mistake;
	const grading: Grading = {
		...base,
		evLostBb: named ? evLostBb : 0,
		mistake: named,
		severity,
		goodPlay: mistake ? null : goodPlayOf(avoided),
		explanation: '',
	};
	grading.explanation = explain(grading);
	return grading;
}

/** A shove faced preflop is priced, not looked up. */
function gradeStackOff(
	replay: Replay,
	step: Step,
	spot: PreflopSpot,
	facts: PreflopFacts,
	options: GradeOptions
): Grading {
	const { hand } = replay;
	const bb = hand.stakes.bigBlind;
	const hero = step.action.player;
	const hole = hand.heroCards;

	// Everyone who has put in at least the price of the call is in for it.
	const committed = new Map<string, number>();
	for (const other of replay.steps) {
		if (other.index >= step.index || other.street !== 'preflop') continue;
		if (other.action.kind === 'post-dead') continue;
		committed.set(
			other.action.player,
			(committed.get(other.action.player) ?? 0) + other.action.amount
		);
	}
	const price = step.committedBefore + step.toCall;
	const against = step.live.filter(
		(name) => name !== hero && (committed.get(name) ?? 0) >= price
	);
	const ranges = (against.length > 0 ? against : [spot.villain ?? '']).map((name) =>
		removeDead(toComboRange(preflopRange(replay, name, step.index)), hole)
	);

	const equity = equityVsRanges(hole, [], ranges, options).equity;
	const uncovered = Math.max(0, step.streetBet - step.committedBefore - step.toCall);
	const stake = step.potBefore - uncovered + step.toCall;
	const callEv = equity * stake * (1 - options.rake) - step.toCall;
	facts.equity = equity;
	facts.opponents = ranges.length;
	facts.potOdds = step.toCall / stake;
	facts.callEvBb = callEv / bb;

	const chosen = step.action.kind as Choice;
	const called = chosen !== 'fold';
	const band = 0.05 * stake;
	const base = {
		handId: hand.id,
		stepIndex: step.index,
		street: step.street,
		spot: `${spot.label}, all-in`,
		chosen,
		recommended: (callEv > 0 ? 'call' : 'fold') as Choice,
		confidence: (against.length > 1 ? 'low' : 'medium') as Confidence,
		preflop: facts,
	};
	if (called && callEv < -band) return finish(base, 'stackoff-loose', -callEv / bb);
	if (!called && callEv > band) return finish(base, 'stackoff-tight', callEv / bb);
	if (Math.abs(callEv) <= band) return finish(base, null, 0);
	// Right, and by more than the band: the other action was the mistake.
	const { confidence } = base;
	const evLostBb = -Math.abs(callEv) / bb;
	return finish(
		base,
		null,
		0,
		called ?
			{
				choice: 'fold',
				mistake: 'stackoff-tight',
				evLostBb,
				confidence,
				hard: equity < UNDERDOG,
			}
		:	{
				choice: 'call',
				mistake: 'stackoff-loose',
				evLostBb,
				confidence,
				hard: isPremium(classOf(hole[0], hole[1])),
			}
	);
}

function gradePreflop(replay: Replay, step: Step, options: GradeOptions): Grading {
	const { hand } = replay;
	const bb = hand.stakes.bigBlind;
	const spot = classifyPreflop(replay, step);
	const cls = classOf(hand.heroCards[0], hand.heroCards[1]);
	const chosen = step.action.kind as Choice;
	const { strategy } = spot;

	const facts: PreflopFacts = {
		hand: className(cls),
		spot: spot.label,
		scenario: spot.scenario,
		...(spot.standIn ? { standIn: spot.standIn } : {}),
		effectiveBb: spot.effectiveBb,
		chart: spot.chart,
		depth: spot.depth,
		raise: strategy.raise[cls],
		call: strategy.call[cls],
		fold: frequencyOf(strategy, cls, 'fold'),
	};

	if (spot.facingAllIn && chosen !== 'check') {
		return gradeStackOff(replay, step, spot, facts, options);
	}

	// With nothing to call, checking is the chart's "not raising".
	const free = step.toCall === 0;
	const choice: PreflopChoice =
		chosen === 'raise' || chosen === 'bet' ? 'raise'
		: chosen === 'fold' ? 'fold'
		: 'call';
	const passive = free ? 1 - facts.raise : facts.call;
	const frequency =
		choice === 'raise' ? facts.raise
		: choice === 'call' ? passive
		: facts.fold;
	const continues = Math.min(1, facts.raise + facts.call);

	const best: Choice =
		facts.raise >= Math.max(passive, free ? 0 : facts.fold) ? 'raise'
		: free ? 'check'
		: facts.call >= facts.fold ? 'call'
		: 'fold';
	const base = {
		handId: hand.id,
		stepIndex: step.index,
		street: step.street,
		spot: spot.label,
		chosen,
		recommended: best,
		confidence: spot.confidence,
		preflop: facts,
	};

	const weight = SCENARIO_WEIGHT[spot.scenario];
	const tier = handTier(cls);
	const margin = marginTier(continueRange(strategy));
	const cap = spot.effectiveBb / 2;

	if (frequency >= MIX_FLOOR) {
		if (choice === 'raise' && step.action.to !== undefined && spot.raiseToBb !== null) {
			const to = step.action.to / bb;
			facts.raiseToBb = to;
			facts.suggestedRaiseToBb = spot.raiseToBb;
			const ratio = to / spot.raiseToBb;
			const shove = step.action.allIn && spot.raises >= 1 && spot.effectiveBb < 70;
			const committed =
				spot.raiseToBb >= spot.effectiveBb && to >= COMMITTED * spot.effectiveBb;
			if ((ratio < 0.7 || ratio > 1.6) && !shove && !committed) {
				return finish(base, 'preflop-sizing', wrongLineBb(Math.min(2, weight)));
			}
		}
		return finish(base, null, 0);
	}

	// Against a raiser, a call is priced from its equity; elsewhere from the chart.
	const priced = priceCall(replay, step, spot, options);
	// The realised share of equity is assumed, so a price is never a certainty.
	const unsure = () => {
		if (base.confidence === 'high') base.confidence = 'medium';
	};

	if (choice === 'fold') {
		// The hand belonged in the pot: folding gives up what it was worth there,
		// which is what the call was worth against the raiser's range, or, with
		// none, the hand's value scaled by how far inside the range it sits.
		if (priced) {
			facts.priced = priced;
			unsure();
		}
		const worth =
			priced ?
				Math.max(0, priced.evBb)
			:	TIER_VALUE_BB[tier] * rangeDepth(continueRange(strategy), cls) * weight;
		return finish(base, tightMistake(spot), Math.min(cap, worth));
	}
	if (free && choice === 'call') {
		return finish(base, 'missed-iso', wrongLineBb(weight));
	}
	if (continues < MIX_FLOOR) {
		const steps = Math.max(1, tier - margin);
		const put = step.action.amount / bb;
		if (priced && choice === 'call') {
			facts.priced = priced;
			unsure();
		}
		const lost = Math.min(
			put * 0.6,
			priced && choice === 'call' ?
				Math.max(0, -priced.evBb)
			:	LOOSE_BB_PER_STEP * steps ** 1.5 * weight
		);
		return finish(base, looseMistake(spot, choice), lost);
	}
	return finish(base, lineMistake(spot, choice), wrongLineBb(weight));
}

function gradePostflop(replay: Replay, step: Step, options: GradeOptions): Grading {
	const verdict = judgePostflop(replay, step, options);
	const { facts } = verdict;
	const others = facts.opponents === 1 ? 'heads-up' : `${facts.opponents + 1}-way`;
	const seat = facts.inPosition ? 'in position' : 'out of position';
	return finish(
		{
			handId: replay.hand.id,
			stepIndex: step.index,
			street: step.street,
			spot: `${step.street}, ${others}, ${seat}, ${step.toCall > 0 ? 'facing a bet' : 'checked to'}`,
			chosen: step.action.kind as Choice,
			recommended: verdict.recommended,
			confidence: verdict.confidence,
			postflop: facts,
		},
		verdict.mistake,
		-verdict.evLostBb,
		verdict.avoided
	);
}

/** Grades one decision of the hero's. `step` must be one of their actions. */
export function gradeDecision(
	replay: Replay,
	step: Step,
	options: GradeOptions
): Grading {
	return step.street === 'preflop' ?
			gradePreflop(replay, step, options)
		:	gradePostflop(replay, step, options);
}
