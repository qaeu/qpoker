/**
 * The hero's opening ranges as they were actually played: every hand they held
 * when the action folded to them, by seat, and what they did with it, beside
 * the chart for that seat. The cards are known, so the baseline is what the
 * chart would have opened with those very hands. See docs/coach-model.md.
 *
 * Each hand's spot is plain data (`openingOf`) and the summary a fold over
 * them (`summariseSpots`), so it can be made from stored hands.
 */

import { classOf, className } from '../cards/combos';
import type { Position, Replay } from '../history/replay';
import { decisionsOf, POSITIONS } from '../history/replay';
import type { ChartId } from '../ranges/charts';
import { classifyPreflop } from '../ranges/preflopSpot';
import { frequencyOf, rangeFraction, type PreflopChoice } from '../ranges/range';
import { MIX_FLOOR } from './grade';
import { leakOf } from './session';

/** One starting hand as the hero played it first in from one seat. */
export interface OpeningHand {
	/** `AKo`. */
	hand: string;
	/** Times held with the action folded to the hero. */
	dealt: number;
	raised: number;
	limped: number;
	/** How often the chart opens it. */
	chart: number;
}

/** A hand played a way the chart takes less than a fifth of the time. */
export interface OpeningDeviation {
	handId: string;
	hand: string;
	chosen: PreflopChoice;
}

export interface OpeningRow {
	position: Position;
	chart: ChartId;
	/** First-in decisions with known cards. */
	spots: number;
	raised: number;
	limped: number;
	/** The opens the chart would have made with the same cards. */
	expected: number;
	/** The share of all starting hands the chart opens. */
	chartRange: number;
	/** What the hero won or lost over these spots' hands, in big blinds. */
	netBb: number;
	/** Set when the hero opens wider or tighter than the sample explains. */
	leak: 'high' | 'low' | null;
	/** Every hand held, in grid order. */
	hands: OpeningHand[];
	deviations: OpeningDeviation[];
}

export interface OpeningSummary {
	/** Earliest seat first; seats the hero was never first in from are left out. */
	rows: OpeningRow[];
	/** First-in spots under 30bb, which the opening charts do not cover. */
	shortStacked: number;
	/**
	 * First-in spots from a seat earlier than any chart, at seven players or
	 * more. UTG's chart only stands in there, so they are left out as well.
	 */
	earlySeats: number;
}

/** One first-in decision, as a hand stores it for its row. Plain data. */
export interface OpeningSpot {
	position: Position;
	chart: ChartId;
	/** Why the spot is counted and not put in a row, if it is not. */
	leftOut: 'short' | 'early' | null;
	/** The starting hand's class, which is its place in the grid. */
	cls: number;
	chosen: PreflopChoice;
	/** How often the chart opens the hand. */
	opens: number;
	/** The share of all starting hands the chart opens. */
	chartRange: number;
	/** Played a way the chart takes less than a fifth of the time. */
	deviation: boolean;
}

/** A hand's opening spot under the id its deviations are listed by. */
export interface OpeningEntry {
	id: string;
	/** The hero's result in the hand, in big blinds. */
	netBb: number;
	opening: OpeningSpot | null;
}

interface Tally extends Omit<OpeningRow, 'hands' | 'leak'> {
	hands: Map<number, OpeningHand>;
}

/** The hero's first-in decision in a hand, or null when they made none. */
export function openingOf(replay: Replay, hero: string): OpeningSpot | null {
	const { hand } = replay;
	if (!hand.gradeable || hand.hero !== hero || hand.heroCards.length !== 2) return null;
	const first = decisionsOf(replay, hero).find((step) => step.street === 'preflop');
	if (!first) return null;
	const spot = classifyPreflop(replay, first);
	if (spot.scenario !== 'rfi' || spot.chart === null) return null;
	// The big blind is only ever "first in" over a posted blind that checked.
	if (spot.position === 'BB') return null;

	const cls = classOf(hand.heroCards[0], hand.heroCards[1]);
	const chosen: PreflopChoice =
		first.action.kind === 'raise' ? 'raise'
		: first.action.kind === 'call' ? 'call'
		: 'fold';
	return {
		position: spot.position,
		chart: spot.chart,
		leftOut:
			spot.depth === 'short' ? 'short'
			: spot.standIn === 'hero' ? 'early'
			: null,
		cls,
		chosen,
		opens: spot.strategy.raise[cls],
		chartRange: rangeFraction(spot.strategy.raise),
		deviation: frequencyOf(spot.strategy, cls, chosen) < MIX_FLOOR,
	};
}

/** Sets a run of hands' opening spots, seat by seat, against the opening charts. */
export function summariseSpots(entries: Iterable<OpeningEntry>): OpeningSummary {
	const tallies = new Map<Position, Tally>();
	let shortStacked = 0;
	let earlySeats = 0;

	for (const { id, netBb, opening } of entries) {
		if (!opening) continue;
		if (opening.leftOut === 'short') {
			shortStacked++;
			continue;
		}
		if (opening.leftOut === 'early') {
			earlySeats++;
			continue;
		}
		const { cls, chosen, opens } = opening;
		const name = className(cls);

		let tally = tallies.get(opening.position);
		if (!tally) {
			tally = {
				position: opening.position,
				chart: opening.chart,
				spots: 0,
				raised: 0,
				limped: 0,
				expected: 0,
				chartRange: opening.chartRange,
				netBb: 0,
				hands: new Map(),
				deviations: [],
			};
			tallies.set(opening.position, tally);
		}
		const held = tally.hands.get(cls) ?? {
			hand: name,
			dealt: 0,
			raised: 0,
			limped: 0,
			chart: opens,
		};
		tally.hands.set(cls, held);

		tally.spots++;
		tally.expected += opens;
		tally.netBb += netBb;
		held.dealt++;
		if (chosen === 'raise') {
			tally.raised++;
			held.raised++;
		} else if (chosen === 'call') {
			tally.limped++;
			held.limped++;
		}
		if (opening.deviation) tally.deviations.push({ handId: id, hand: name, chosen });
	}

	const rows = POSITIONS.flatMap((position): OpeningRow[] => {
		const tally = tallies.get(position);
		if (!tally) return [];
		return [
			{
				...tally,
				leak: leakOf(
					tally.raised / tally.spots,
					tally.expected / tally.spots,
					tally.spots
				),
				hands: [...tally.hands.entries()]
					.sort((a, b) => a[0] - b[0])
					.map(([, held]) => held),
			},
		];
	});

	return { rows, shortStacked, earlySeats };
}

/** Sets the hero's first-in play, seat by seat, against the opening charts. */
export function summariseOpenings(
	replays: readonly Replay[],
	hero: string
): OpeningSummary {
	return summariseSpots(
		replays.map((replay) => ({
			id: replay.hand.id,
			netBb: (replay.net[hero] ?? 0) / replay.hand.stakes.bigBlind,
			opening: openingOf(replay, hero),
		}))
	);
}
