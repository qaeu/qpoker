/**
 * Walks a parsed hand action by action, keeping the pot, the stacks and who is
 * still in, and records what each player faced at the moment they acted. The
 * graders work from these steps; none of them re-derives the state of a hand.
 */

import type { Card } from '../cards/cards';
import type { Action, Hand, Street } from './hand';

export type Position = 'UTG' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';

/** Earliest to latest preflop. */
export const POSITIONS: readonly Position[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

/** Postflop the blinds act first and the button last. */
const POSTFLOP_ORDER: readonly Position[] = ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'];

export interface Layout {
	/** Players dealt in, in preflop acting order: first to act first, BB last. */
	players: string[];
	positions: Record<string, Position>;
	/** Stacks at the start of the hand. */
	stacks: Record<string, number>;
}

export interface Step {
	/** Index into `hand.actions`. */
	index: number;
	action: Action;
	street: Street;
	/** The board as it stood when the action was taken. */
	board: Card[];
	/** Everything in the middle before this action, this street's bets included. */
	potBefore: number;
	/** The pot when the street began. */
	streetPot: number;
	/** What the player had to add to continue. */
	toCall: number;
	/** The largest commitment on the street before this action. */
	streetBet: number;
	/** The actor's own commitment on the street before this action. */
	committedBefore: number;
	/** The actor's remaining stack before this action. */
	stackBefore: number;
	/** Bets and raises on this street before this action. Blinds do not count. */
	raisesBefore: number;
	/** Players not yet folded, the actor included, in postflop acting order. */
	live: string[];
	/** Of `live`, those with chips behind. */
	canAct: string[];
	/**
	 * The most the actor can win or lose from here against the deepest live
	 * opponent: stacks as they stood at the start of the street.
	 */
	effectiveStack: number;
}

export interface Replay {
	hand: Hand;
	layout: Layout | null;
	steps: Step[];
	/** Chips each player put in, net of any uncalled bet returned. */
	invested: Record<string, number>;
	/** True when the actions add up to the summary's pot, and the payouts to it. */
	reconciled: boolean;
	/** Each dealt-in player's result in chips. */
	net: Record<string, number>;
}

function boardAt(hand: Hand, street: Street): Card[] {
	const count =
		street === 'preflop' ? 0
		: street === 'flop' ? 3
		: street === 'turn' ? 4
		: 5;
	return hand.board.slice(0, count);
}

/**
 * Seats the hand's players by position. Positions are counted back from the
 * big blind, so a short-handed table loses its earliest seats, not its latest.
 */
export function layoutOf(hand: Hand): Layout | null {
	const acted = new Set(hand.actions.map((action) => action.player));
	const seated = hand.seats
		.filter((seat) => acted.has(seat.name))
		.sort((a, b) => a.seat - b.seat);
	const bigBlind = hand.actions.find((action) => action.kind === 'post-bb')?.player;
	const smallBlind = hand.actions.find((action) => action.kind === 'post-sb')?.player;
	const bbIndex = seated.findIndex((seat) => seat.name === bigBlind);
	if (seated.length < 2 || bbIndex < 0) return null;

	const players = seated.map((_, i) => seated[(bbIndex + 1 + i) % seated.length].name);
	const positions: Record<string, Position> = {};
	const stacks: Record<string, number> = {};
	for (const seat of seated) stacks[seat.name] = seat.stack;

	// Back from the big blind. A dead small blind leaves no SB seat, and heads-up
	// the small blind is the button.
	const hasSmallBlind = players.length > 2 && players.at(-2) === smallBlind;
	const backwards: Position[] =
		hasSmallBlind ? ['BB', 'SB', 'BTN', 'CO', 'HJ'] : ['BB', 'BTN', 'CO', 'HJ'];
	for (let i = 0; i < players.length; i++) {
		positions[players[players.length - 1 - i]] = backwards[i] ?? 'UTG';
	}
	return { players, positions, stacks };
}

/** Replays a hand into the steps its graders read. */
export function replayHand(hand: Hand): Replay {
	const layout = layoutOf(hand);
	const invested: Record<string, number> = {};
	const steps: Step[] = [];

	const stack = new Map<string, number>(
		hand.seats.map((seat) => [seat.name, seat.stack])
	);
	const folded = new Set<string>();
	let committed = new Map<string, number>();
	let streetStart = new Map(stack);
	let street: Street = 'preflop';
	let pot = 0;
	let streetPot = 0;
	let raises = 0;

	const order =
		layout ?
			[...layout.players].sort(
				(a, b) =>
					POSTFLOP_ORDER.indexOf(layout.positions[a])
					- POSTFLOP_ORDER.indexOf(layout.positions[b])
			)
		:	[];

	hand.actions.forEach((action, index) => {
		if (action.street !== street) {
			street = action.street;
			committed = new Map();
			streetStart = new Map(stack);
			streetPot = pot;
			raises = 0;
		}
		const { player } = action;
		const own = committed.get(player) ?? 0;
		const streetBet = Math.max(0, ...committed.values());
		const live = order.filter((name) => !folded.has(name));
		const others = live.filter((name) => name !== player);

		steps.push({
			index,
			action,
			street,
			board: boardAt(hand, street),
			potBefore: pot,
			streetPot,
			toCall: Math.min(Math.max(0, streetBet - own), stack.get(player) ?? 0),
			streetBet,
			committedBefore: own,
			stackBefore: stack.get(player) ?? 0,
			raisesBefore: raises,
			live,
			canAct: live.filter((name) => (stack.get(name) ?? 0) > 0),
			effectiveStack: Math.min(
				streetStart.get(player) ?? 0,
				Math.max(0, ...others.map((name) => streetStart.get(name) ?? 0))
			),
		});

		pot += action.amount;
		stack.set(player, (stack.get(player) ?? 0) - action.amount);
		invested[player] = (invested[player] ?? 0) + action.amount;
		if (action.kind !== 'post-dead') committed.set(player, own + action.amount);
		if (action.kind === 'fold') folded.add(player);
		if (action.kind === 'bet' || action.kind === 'raise') raises++;
	});

	for (const { player, amount } of hand.uncalled) {
		invested[player] = (invested[player] ?? 0) - amount;
	}

	const put = Object.values(invested).reduce((sum, amount) => sum + amount, 0);
	const paid = Object.values(hand.won).reduce((sum, amount) => sum + amount, 0);
	const reconciled = put === hand.totalPot && paid + hand.rake === hand.totalPot;

	const net: Record<string, number> = {};
	for (const name of layout?.players ?? []) {
		// A player who cashed out was paid that, not the pot the summary credits.
		const back = hand.cashedOut[name] ?? hand.won[name] ?? 0;
		net[name] = back - (invested[name] ?? 0);
	}

	return { hand, layout, steps, invested, reconciled, net };
}

/** The steps at which `player` chose something: no blinds, no forced posts. */
export function decisionsOf(replay: Replay, player: string): Step[] {
	return replay.steps.filter(
		(step) => step.action.player === player && !step.action.kind.startsWith('post-')
	);
}
