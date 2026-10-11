/**
 * Hand strength for five to seven cards, as one integer that orders hands the
 * way poker does: a higher score beats a lower one and equal scores chop. The
 * category sits in the top bits and up to five tie-breaking ranks below it.
 */

import { rankOf, suitOf, type Card } from './cards';

export const CATEGORIES = [
	'high card',
	'pair',
	'two pair',
	'three of a kind',
	'straight',
	'flush',
	'full house',
	'four of a kind',
	'straight flush',
] as const;

export type Category = (typeof CATEGORIES)[number];

const CATEGORY_SHIFT = 20;

const rankCount = new Int8Array(13);
const suitMask = new Int32Array(4);
const suitCount = new Int8Array(4);

/** Highest rank of a straight in a 13-bit rank mask, or -1. The wheel is 3. */
function straightHigh(mask: number): number {
	// Shift up one and copy the ace to bit 0, so A-5 reads as a run like any other.
	const wheel = (mask << 1) | ((mask >> 12) & 1);
	for (let high = 13; high >= 4; high--) {
		if (((wheel >> (high - 4)) & 0x1f) === 0x1f) return high - 1;
	}
	return -1;
}

/** Packs the `count` highest ranks set in `mask`, highest first, four bits each. */
function topRanks(mask: number, count: number): number {
	let packed = 0;
	let taken = 0;
	for (let rank = 12; rank >= 0 && taken < count; rank--) {
		if (mask & (1 << rank)) {
			packed = (packed << 4) | rank;
			taken++;
		}
	}
	return packed << (4 * (5 - count));
}

const score = (category: number, kickers: number): number =>
	(category << CATEGORY_SHIFT) | kickers;

/** Scores the best five-card hand among `cards` (five to seven of them). */
export function evaluate(cards: readonly Card[]): number {
	rankCount.fill(0);
	suitMask.fill(0);
	suitCount.fill(0);
	let ranks = 0;
	for (let i = 0; i < cards.length; i++) {
		const rank = rankOf(cards[i]);
		const suit = suitOf(cards[i]);
		rankCount[rank]++;
		suitMask[suit] |= 1 << rank;
		suitCount[suit]++;
		ranks |= 1 << rank;
	}

	for (let suit = 0; suit < 4; suit++) {
		if (suitCount[suit] >= 5) {
			const high = straightHigh(suitMask[suit]);
			if (high >= 0) return score(8, high << 16);
			// Seven cards cannot hold both a flush and quads or a full house.
			return score(5, topRanks(suitMask[suit], 5));
		}
	}

	let quad = -1;
	let trip = -1;
	let trip2 = -1;
	let pair = -1;
	let pair2 = -1;
	for (let rank = 12; rank >= 0; rank--) {
		const count = rankCount[rank];
		if (count === 4) quad = rank;
		else if (count === 3) {
			if (trip < 0) trip = rank;
			else if (trip2 < 0) trip2 = rank;
		} else if (count === 2) {
			if (pair < 0) pair = rank;
			else if (pair2 < 0) pair2 = rank;
		}
	}

	if (quad >= 0) {
		return score(7, (quad << 16) | (topRanks(ranks & ~(1 << quad), 1) >> 4));
	}
	if (trip >= 0 && (pair >= 0 || trip2 >= 0)) {
		return score(6, (trip << 16) | (Math.max(pair, trip2) << 12));
	}
	const high = straightHigh(ranks);
	if (high >= 0) return score(4, high << 16);
	if (trip >= 0) {
		return score(3, (trip << 16) | (topRanks(ranks & ~(1 << trip), 2) >> 4));
	}
	if (pair >= 0 && pair2 >= 0) {
		const rest = ranks & ~(1 << pair) & ~(1 << pair2);
		return score(2, (pair << 16) | (pair2 << 12) | (topRanks(rest, 1) >> 8));
	}
	if (pair >= 0) {
		return score(1, (pair << 16) | (topRanks(ranks & ~(1 << pair), 3) >> 4));
	}
	return score(0, topRanks(ranks, 5));
}

/** The category index (0 high card ... 8 straight flush) of a score. */
export const categoryOf = (value: number): number => value >> CATEGORY_SHIFT;

export const categoryName = (value: number): Category => CATEGORIES[categoryOf(value)];
