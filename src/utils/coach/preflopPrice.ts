/**
 * Pricing a preflop decision from equity, where a chart says only in or out:
 * what a call is worth against the raiser's range, and how deep inside a range
 * a hand sits. See "Preflop: pricing from equity" in docs/coach-model.md.
 */

import { CLASS_COUNT, classSize, combosOfClass } from '../cards/combos';
import { removeDead, sampleEquity } from '../cards/equity';
import type { EquityOptions } from '../cards/equity';
import type { Replay, Step } from '../history/replay';
import { preflopRange } from '../ranges/preflopSpot';
import type { PreflopSpot } from '../ranges/preflopSpot';
import { toComboRange } from '../ranges/range';
import type { Range } from '../ranges/range';

/**
 * The share of its raw equity a hand is taken to realise, in position and out.
 * Assumed, not measured: the audit's range was 0.7 to 1.0, lower out of position.
 */
export const REALISATION_IN_POSITION = 0.95;
export const REALISATION_OUT_OF_POSITION = 0.8;
/** Added in a 3-bet or bigger pot, where the stacks are shallow against the pot. */
const REALISATION_SHALLOW_POT = 0.1;
/** Each player who has already called behind the raiser takes this much more. */
const MULTIWAY_FACTOR = 0.9;

/** Deals simulated for one price: a standard error of about a point. */
const PRICE_DEALS = 2000;

export interface CallPrice {
	/** Raw equity against the raiser's range. */
	equity: number;
	realisation: number;
	/** What calling is worth, in big blinds: negative when it loses. */
	evBb: number;
}

/** Where the player acts after the flop, from the flop's first to act. */
function postflopOrder(replay: Replay, player: string): number {
	const position = replay.layout?.positions[player];
	if (position === 'SB') return -2;
	if (position === 'BB') return -1;
	return replay.layout?.players.indexOf(player) ?? 0;
}

/**
 * What calling `step` is worth against the last raiser's range, or null when
 * there is no raiser or nothing to call. The raiser's range is the opener's
 * chart range, or what their line has narrowed it to.
 */
export function priceCall(
	replay: Replay,
	step: Step,
	spot: PreflopSpot,
	options: EquityOptions & { rake: number }
): CallPrice | null {
	if (!spot.villain || step.toCall <= 0) return null;
	const hole = replay.hand.heroCards;
	const bb = replay.hand.stakes.bigBlind;
	const range = removeDead(
		toComboRange(preflopRange(replay, spot.villain, step.index)),
		hole
	);
	const { equity } = sampleEquity(hole, [], [range], PRICE_DEALS, options.seed ?? 0);

	const inPosition =
		postflopOrder(replay, step.action.player) > postflopOrder(replay, spot.villain);
	const base = inPosition ? REALISATION_IN_POSITION : REALISATION_OUT_OF_POSITION;
	const realisation =
		Math.min(1, base + (spot.raises >= 2 ? REALISATION_SHALLOW_POT : 0))
		* MULTIWAY_FACTOR ** spot.callers;
	const pot = step.potBefore + step.toCall;
	const ev = realisation * equity * pot * (1 - options.rake) - step.toCall;
	return { equity, realisation, evBb: ev / bb };
}

let strength: Float64Array | null = null;

/** Equity of each of the 169 classes against a random hand, from a fixed seed. */
function classStrength(): Float64Array {
	if (strength) return strength;
	const everyHand = new Float64Array(1326).fill(1);
	const out = new Float64Array(CLASS_COUNT);
	for (let cls = 0; cls < CLASS_COUNT; cls++) {
		const { a, b } = combosOfClass(cls)[0];
		out[cls] = sampleEquity([a, b], [], [removeDead(everyHand, [a, b])], 1000, 7).equity;
	}
	strength = out;
	return out;
}

/**
 * How far above the bottom of a range a hand sits, 0 to 1: the share of the
 * range's combos, weighted by how often they continue, that are weaker than the
 * hand against a random hand. The last hand of a range is 0, its best 1.
 */
export function rangeDepth(range: Range, cls: number): number {
	const power = classStrength();
	let weaker = 0;
	let total = 0;
	for (let other = 0; other < CLASS_COUNT; other++) {
		const weight = range[other] * classSize(other);
		total += weight;
		if (power[other] < power[cls]) weaker += weight;
	}
	return total === 0 ? 0 : weaker / total;
}
