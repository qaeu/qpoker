/**
 * Whether the hero is getting better: each sitting's result and graded losses,
 * and the earlier half of the graded hands set against the later half. A
 * change is only called one when the sample can bear it, by the same standard
 * the session's leaks are held to. See docs/coach-model.md, "Trends".
 */

import { MISTAKES, type MistakeType } from './mistakes';
import type { HandSummary } from './report';
import type { PlaySession } from './sessions';

/** Graded hands each half needs before a change between them is named. */
export const MIN_TREND_HANDS = 100;

/** Standard errors a gap has to clear, as a frequency's does in `leakOf`. */
const Z = 2;

export interface TrendPoint {
	session: PlaySession;
	hands: number;
	graded: number;
	netBb: number;
	/** Zero or negative. */
	evLostBb: number;
	/** Per 100 graded hands, or null with none graded. */
	evLostPer100: number | null;
	mistakes: number;
}

export interface TrendHalf {
	/** Graded hands. */
	hands: number;
	evLostPer100: number;
	mistakesPer100: number;
}

export type Direction = 'better' | 'worse';

/** One kind of mistake made clearly more or less often than before. */
export interface Shift {
	type: MistakeType;
	title: string;
	/** Hands with the mistake per 100 graded, in each half. */
	earlier: number;
	later: number;
	direction: Direction;
}

export interface Trend {
	points: TrendPoint[];
	/** Null when there are too few graded hands to halve. */
	halves: { earlier: TrendHalf; later: TrendHalf } | null;
	/** Whether the cost of mistakes per hand has clearly moved. Null if not. */
	direction: Direction | null;
	/** The biggest change first. */
	shifts: Shift[];
}

const mistakesIn = (hand: HandSummary): number =>
	hand.findings.filter(({ kind }) => kind === 'mistake').length;

function halfOf(hands: readonly HandSummary[]): TrendHalf {
	const lost = hands.reduce((sum, hand) => sum + hand.evLostBb, 0);
	const mistakes = hands.reduce((sum, hand) => sum + mistakesIn(hand), 0);
	return {
		hands: hands.length,
		evLostPer100: (lost / hands.length) * 100,
		mistakesPer100: (mistakes / hands.length) * 100,
	};
}

/** The mean of the hands' graded losses, and the variance of that mean. */
function meanLoss(hands: readonly HandSummary[]): { mean: number; error2: number } {
	const mean = hands.reduce((sum, hand) => sum + hand.evLostBb, 0) / hands.length;
	const spread = hands.reduce((sum, hand) => sum + (hand.evLostBb - mean) ** 2, 0);
	return { mean, error2: spread / (hands.length - 1) / hands.length };
}

function shiftsOf(
	earlier: readonly HandSummary[],
	later: readonly HandSummary[]
): Shift[] {
	const count = (hands: readonly HandSummary[], type: MistakeType) =>
		hands.filter((hand) => hand.findings.some(({ mistake }) => mistake === type)).length;
	const types = new Set(
		[...earlier, ...later].flatMap((hand) =>
			hand.findings.flatMap(({ mistake }) => mistake ?? [])
		)
	);
	const shifts: Shift[] = [];
	for (const type of types) {
		const before = count(earlier, type) / earlier.length;
		const after = count(later, type) / later.length;
		// Two proportions, tested on the rate the halves share.
		const pooled =
			(count(earlier, type) + count(later, type)) / (earlier.length + later.length);
		const error = Math.sqrt(
			pooled * (1 - pooled) * (1 / earlier.length + 1 / later.length)
		);
		if (error === 0 || Math.abs(after - before) <= Z * error) continue;
		shifts.push({
			type,
			title: MISTAKES[type].title,
			earlier: before * 100,
			later: after * 100,
			direction: after < before ? 'better' : 'worse',
		});
	}
	return shifts.sort(
		(a, b) => Math.abs(b.later - b.earlier) - Math.abs(a.later - a.earlier)
	);
}

/** The hero's results over time, for hands oldest first and their sittings. */
export function trendOf(
	hands: readonly HandSummary[],
	sessions: readonly PlaySession[]
): Trend {
	const points = sessions.map((session): TrendPoint => {
		const dealt = hands.slice(session.start, session.start + session.hands);
		const graded = dealt.filter((hand) => hand.gradeable);
		const evLostBb = graded.reduce((sum, hand) => sum + hand.evLostBb, 0);
		return {
			session,
			hands: dealt.length,
			graded: graded.length,
			netBb: dealt.reduce((sum, hand) => sum + hand.netBb, 0),
			evLostBb,
			evLostPer100: graded.length > 0 ? (evLostBb / graded.length) * 100 : null,
			mistakes: graded.reduce((sum, hand) => sum + mistakesIn(hand), 0),
		};
	});

	const graded = hands.filter((hand) => hand.gradeable);
	const middle = Math.floor(graded.length / 2);
	const earlier = graded.slice(0, middle);
	const later = graded.slice(middle);
	if (earlier.length < MIN_TREND_HANDS) {
		return { points, halves: null, direction: null, shifts: [] };
	}

	const before = meanLoss(earlier);
	const after = meanLoss(later);
	const error = Math.sqrt(before.error2 + after.error2);
	const gap = after.mean - before.mean;
	return {
		points,
		halves: { earlier: halfOf(earlier), later: halfOf(later) },
		// Losses are negative: a mean nearer zero is the better one.
		direction:
			error === 0 || Math.abs(gap) <= Z * error ? null
			: gap > 0 ? 'better'
			: 'worse',
		shifts: shiftsOf(earlier, later),
	};
}
