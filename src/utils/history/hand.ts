/**
 * The shape a parsed hand takes. All money is integer cents (or chips, for a
 * play-money table): a hand's arithmetic has to reconcile exactly, and floats
 * of dollars would not. See docs/history-format.md.
 */

import type { Card } from '../cards/cards';

export type Street = 'preflop' | 'flop' | 'turn' | 'river';

export const STREETS: readonly Street[] = ['preflop', 'flop', 'turn', 'river'];

/** A full ring: the largest table a hand is seated and graded at. */
export const MAX_PLAYERS = 9;

export type ActionKind =
	'post-sb' | 'post-bb' | 'post-dead' | 'fold' | 'check' | 'call' | 'bet' | 'raise';

export interface Action {
	player: string;
	street: Street;
	kind: ActionKind;
	/** Chips this action moved into the pot. Zero for a fold or a check. */
	amount: number;
	/** For a raise: the player's total commitment on the street afterwards. */
	to?: number;
	allIn: boolean;
}

export interface Seat {
	seat: number;
	name: string;
	stack: number;
	sittingOut: boolean;
}

export interface Stakes {
	smallBlind: number;
	bigBlind: number;
	/** `USD`, `EUR`, ... or empty when the header names none. */
	currency: string;
}

export interface Hand {
	id: string;
	/** `2026-10-06T03:37:57`, the site's first-listed local time, zone-less. */
	timestamp: string;
	game: string;
	stakes: Stakes;
	table: string;
	maxSeats: number;
	buttonSeat: number;
	seats: Seat[];
	hero: string | null;
	heroCards: Card[];
	actions: Action[];
	board: Card[];
	/** Hole cards revealed at showdown or in the summary, by player. */
	shown: Record<string, Card[]>;
	uncalled: { player: string; amount: number }[];
	/** What each player was paid, from the summary. */
	won: Record<string, number>;
	/** What a player took for cashing out their equity early, fee already taken. */
	cashedOut: Record<string, number>;
	totalPot: number;
	rake: number;
	/** Lines the parser did not understand. Never fatal. */
	warnings: string[];
	/**
	 * False when the hand has a structure the grader does not model (not NLHE,
	 * antes, run-it-twice, ...). It is still parsed and counted.
	 */
	gradeable: boolean;
}
