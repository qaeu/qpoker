/**
 * The hero's opening ranges as they were actually played: every hand they held
 * when the action folded to them, by seat, and what they did with it, beside
 * the chart for that seat. The cards are known, so the baseline is what the
 * chart would have opened with those very hands. See docs/coach-model.md.
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
}

interface Tally extends Omit<OpeningRow, 'hands' | 'leak'> {
	hands: Map<number, OpeningHand>;
}

/** Sets the hero's first-in play, seat by seat, against the opening charts. */
export function summariseOpenings(
	replays: readonly Replay[],
	hero: string
): OpeningSummary {
	const tallies = new Map<Position, Tally>();
	let shortStacked = 0;

	for (const replay of replays) {
		const { hand } = replay;
		if (!hand.gradeable || hand.hero !== hero || hand.heroCards.length !== 2) continue;
		const first = decisionsOf(replay, hero).find((step) => step.street === 'preflop');
		if (!first) continue;
		const spot = classifyPreflop(replay, first);
		if (spot.scenario !== 'rfi' || spot.chart === null) continue;
		// The big blind is only ever "first in" over a posted blind that checked.
		if (spot.position === 'BB') continue;
		if (spot.depth === 'short') {
			shortStacked++;
			continue;
		}

		const cls = classOf(hand.heroCards[0], hand.heroCards[1]);
		const name = className(cls);
		const chosen: PreflopChoice =
			first.action.kind === 'raise' ? 'raise'
			: first.action.kind === 'call' ? 'call'
			: 'fold';
		const opens = spot.strategy.raise[cls];

		let tally = tallies.get(spot.position);
		if (!tally) {
			tally = {
				position: spot.position,
				chart: spot.chart,
				spots: 0,
				raised: 0,
				limped: 0,
				expected: 0,
				chartRange: rangeFraction(spot.strategy.raise),
				hands: new Map(),
				deviations: [],
			};
			tallies.set(spot.position, tally);
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
		held.dealt++;
		if (chosen === 'raise') {
			tally.raised++;
			held.raised++;
		} else if (chosen === 'call') {
			tally.limped++;
			held.limped++;
		}
		if (frequencyOf(spot.strategy, cls, chosen) < MIX_FLOOR) {
			tally.deviations.push({ handId: hand.id, hand: name, chosen });
		}
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

	return { rows, shortStacked };
}
