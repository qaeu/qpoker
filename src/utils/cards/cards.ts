/**
 * Cards as small integers: `rank * 4 + suit`, rank 0 (deuce) to 12 (ace). The
 * evaluator and the equity loops run on these; the text form (`Kd`) exists only
 * at the edges, in the parser and in whatever prints a hand.
 */

export type Card = number;

export const RANK_CHARS = '23456789TJQKA';
export const SUIT_CHARS = 'cdhs';
export const DECK_SIZE = 52;

export const rankOf = (card: Card): number => card >> 2;
export const suitOf = (card: Card): number => card & 3;
export const makeCard = (rank: number, suit: number): Card => rank * 4 + suit;

/** `Kd` -> card. Throws on anything that is not a card: callers validate first. */
export function parseCard(text: string): Card {
	const rank = RANK_CHARS.indexOf(text[0]?.toUpperCase() ?? '');
	const suit = SUIT_CHARS.indexOf(text[1]?.toLowerCase() ?? '');
	if (text.length !== 2 || rank < 0 || suit < 0) throw new Error(`Not a card: "${text}"`);
	return makeCard(rank, suit);
}

/** `Kd Ks` or `KdKs` -> cards. */
export function parseCards(text: string): Card[] {
	const compact = text.replace(/[\s,]+/g, '');
	const cards: Card[] = [];
	for (let i = 0; i < compact.length; i += 2)
		cards.push(parseCard(compact.slice(i, i + 2)));
	return cards;
}

export const cardText = (card: Card): string =>
	RANK_CHARS[rankOf(card)] + SUIT_CHARS[suitOf(card)];

export const cardsText = (cards: readonly Card[]): string =>
	cards.map(cardText).join(' ');

/** The full deck, less any dead cards. */
export function deckWithout(dead: readonly Card[]): Card[] {
	const gone = new Set(dead);
	const deck: Card[] = [];
	for (let card = 0; card < DECK_SIZE; card++) if (!gone.has(card)) deck.push(card);
	return deck;
}
