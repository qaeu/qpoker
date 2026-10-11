/**
 * How a board plays: dry or wet, and the bet size that suits it. Dry boards
 * leave little to draw to, so a range bets them small and often; wet boards
 * want bigger bets from fewer hands.
 */

import { RANK_CHARS, rankOf, suitOf, type Card } from '../cards/cards';

export interface Texture {
	paired: boolean;
	/** Three or more of one suit. */
	monotone: boolean;
	/** Exactly two of one suit: a flush draw is out there. */
	twoTone: boolean;
	/** Three cards within a five-rank span: straights and straight draws abound. */
	connected: boolean;
	wet: boolean;
	label: string;
	/** A sensible bet, as a fraction of the pot. */
	betSize: number;
}

export function textureOf(board: readonly Card[]): Texture {
	const suits = [0, 0, 0, 0];
	for (const card of board) suits[suitOf(card)]++;
	const top = Math.max(...suits);
	const ranks = [...new Set(board.map(rankOf))].sort((a, b) => a - b);
	const paired = ranks.length < board.length;
	const monotone = top >= 3;
	const twoTone = top === 2 && board.length < 5;

	let connected = false;
	const withWheel = ranks.includes(12) ? [-1, ...ranks] : ranks;
	for (let i = 0; i + 2 < withWheel.length; i++) {
		if (withWheel[i + 2] - withWheel[i] <= 4) connected = true;
	}

	const wet =
		monotone || (connected && twoTone) || (connected && !paired && board.length < 5);
	const high = RANK_CHARS[Math.max(...board.map(rankOf))];
	// The label is read after an article: "an A-high", "a K-high".
	const article = high === 'A' || high === '8' ? 'an' : 'a';
	const label = [
		`${article} ${high}-high`,
		paired ? 'paired' : null,
		monotone ? 'monotone'
		: twoTone ? 'two-tone'
		: 'rainbow',
		connected ? 'connected' : null,
	]
		.filter(Boolean)
		.join(', ');

	const betSize =
		board.length === 5 ? 0.66
		: wet ? 0.66
		: paired || (!twoTone && !connected) ? 0.33
		: 0.5;
	return { paired, monotone, twoTone, connected, wet, label, betSize };
}
