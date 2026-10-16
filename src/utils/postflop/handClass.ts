/**
 * What a two-card hand is on a board, in the words a player would use: the
 * made hand ("top pair", "overpair", "a set") and what it is drawing to. Used
 * for the opponent model's draw buckets and for the coach's explanations.
 */

import { rankOf, suitOf, type Card } from '../cards/cards';
import { categoryOf, evaluate } from '../cards/evaluate';

export interface Draws {
	flushDraw: boolean;
	/** Eight outs to a straight: open-ended or a double gutshot. */
	openEnded: boolean;
	gutshot: boolean;
}

/** 0 no draw, 1 a gutshot, 2 a flush draw or open-ender. */
export type DrawStrength = 0 | 1 | 2;

function rankMask(cards: readonly Card[]): number {
	let mask = 0;
	for (const card of cards) mask |= 1 << rankOf(card);
	return mask;
}

function hasStraight(mask: number): boolean {
	const wheel = (mask << 1) | ((mask >> 12) & 1);
	for (let low = 0; low <= 9; low++) {
		if (((wheel >> low) & 0x1f) === 0x1f) return true;
	}
	return false;
}

/** How many ranks would complete a straight that is not there yet. */
function straightOuts(mask: number): number {
	if (hasStraight(mask)) return 0;
	let outs = 0;
	for (let rank = 0; rank < 13; rank++) {
		if (!(mask & (1 << rank)) && hasStraight(mask | (1 << rank))) outs++;
	}
	return outs;
}

/** Draws that need a hole card. Empty on the river, where nothing is to come. */
export function drawsOf(hole: readonly Card[], board: readonly Card[]): Draws {
	const none = { flushDraw: false, openEnded: false, gutshot: false };
	if (board.length < 3 || board.length > 4) return none;

	let flushDraw = false;
	for (let suit = 0; suit < 4; suit++) {
		const mine = hole.filter((card) => suitOf(card) === suit).length;
		const theirs = board.filter((card) => suitOf(card) === suit).length;
		if (mine > 0 && mine + theirs === 4) flushDraw = true;
	}

	const all = rankMask([...hole, ...board]);
	const outs = straightOuts(all);
	// A straight draw the board holds on its own is everybody's, not this hand's.
	const own = outs > straightOuts(rankMask(board));
	return {
		flushDraw,
		openEnded: own && outs >= 2,
		gutshot: own && outs === 1,
	};
}

export function drawStrength(
	hole: readonly Card[],
	board: readonly Card[]
): DrawStrength {
	const draws = drawsOf(hole, board);
	return (
		draws.flushDraw || draws.openEnded ? 2
		: draws.gutshot ? 1
		: 0
	);
}

/** `top pair`, `an overpair`, `a set`, `ace high` ... for a hand on a board. */
export function describeHand(hole: readonly Card[], board: readonly Card[]): string {
	if (board.length < 3) return 'no made hand';
	const category = categoryOf(evaluate([...hole, ...board]));
	const boardCategory = board.length >= 5 ? categoryOf(evaluate(board)) : -1;
	const boardRanks = [...new Set(board.map(rankOf))].sort((a, b) => b - a);
	const [a, b] = hole.map(rankOf);
	const pocket = a === b;
	const pairsBoard = (rank: number) => board.some((card) => rankOf(card) === rank);

	if (category === boardCategory && category >= 4) return 'the board';
	switch (category) {
		case 8:
			return 'a straight flush';
		case 7:
			return 'four of a kind';
		case 6:
			return 'a full house';
		case 5:
			return 'a flush';
		case 4:
			return 'a straight';
		case 3:
			if (pocket && pairsBoard(a)) return 'a set';
			return pairsBoard(a) || pairsBoard(b) ? 'trips' : 'three of a kind on the board';
		case 2: {
			if (pairsBoard(a) && pairsBoard(b) && !pocket) return 'two pair';
			// One of the pairs is the board's own.
			if (pocket) return a > boardRanks[0] ? 'an overpair' : 'a pocket pair';
			if (pairsBoard(a) || pairsBoard(b)) {
				const mine = pairsBoard(a) ? a : b;
				return mine === boardRanks[0] ? 'top pair' : 'a pair';
			}
			return 'only the board';
		}
		case 1: {
			if (pocket) {
				return (
					a > boardRanks[0] ? 'an overpair'
					: a < boardRanks[boardRanks.length - 1] ? 'an underpair'
					: 'a middle pocket pair'
				);
			}
			const mine =
				pairsBoard(a) ? a
				: pairsBoard(b) ? b
				: -1;
			if (mine < 0) return 'only the board';
			return (
				mine === boardRanks[0] ? 'top pair'
				: mine === boardRanks[1] ? 'second pair'
				: 'a weak pair'
			);
		}
		default:
			return Math.max(a, b) === 12 ? 'ace high' : 'no pair';
	}
}

/** A pair or better that the hole cards make, not the board's own. */
export function pairOrBetter(hole: readonly Card[], board: readonly Card[]): boolean {
	const [a, b] = hole.map(rankOf);
	if (a === b || board.some((card) => rankOf(card) === a || rankOf(card) === b))
		return true;
	// A straight or a flush that uses a hole card.
	const score = evaluate([...hole, ...board]);
	if (categoryOf(score) < 4) return false;
	return board.length < 5 || score > evaluate(board);
}

/** `a flush draw`, `an open-ended straight draw`, ... or an empty string. */
export function describeDraws(hole: readonly Card[], board: readonly Card[]): string {
	const draws = drawsOf(hole, board);
	const parts: string[] = [];
	if (draws.flushDraw) parts.push('a flush draw');
	if (draws.openEnded) parts.push('an open-ended straight draw');
	else if (draws.gutshot) parts.push('a gutshot');
	return parts.join(' and ');
}
