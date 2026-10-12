/**
 * The table of a reviewed hand, step by step: every seat's stack and bet, the
 * board and the pot after each action. Derived from the report alone, since
 * that is all the browser keeps; it mirrors `history/replay.ts`'s arithmetic
 * and is tested against it. See docs/design-language.md, "The replay table".
 */

import type { HandReport } from '../coach/report';
import { STREETS, type ActionKind, type Street } from '../history/hand';
import { bbText } from './format';

export interface TableSeat {
	/** Cents behind, after the step. */
	stack: number;
	/** Cents in front of the seat on this street. */
	bet: number;
	folded: boolean;
	allIn: boolean;
	/** The seat's last action on the street, or that it was paid. */
	last: ActionKind | 'wins' | null;
	/** Face-up cards: the hero's own, and a shown hand at the result. */
	cards: string | null;
}

export interface TableStep {
	kind: 'deal' | 'action' | 'result';
	street: Street;
	/** The action's `ActionLine.stepIndex`; null for a deal or the result. */
	lineIndex: number | null;
	/** Index into `hand.seats`. */
	actor: number | null;
	boardCount: number;
	/** Swept into the middle on earlier streets. */
	collected: number;
	/** `collected` and the bets still in front of the seats. */
	pot: number;
	/** The pot the actor faced, and what they had to add to continue. */
	potBefore: number;
	toCall: number;
	/** One per `hand.seats`, in its order. */
	seats: TableSeat[];
	/** The board cards this step turned, as `[from, to)`. */
	dealt: [number, number];
}

/** Clockwise from the bottom: 0 bottom, 1 and 2 up the left, 3 top, 4 and 5 down the right. */
const SLOTS: Record<number, readonly number[]> = {
	2: [0, 3],
	3: [0, 2, 4],
	4: [0, 1, 3, 5],
	5: [0, 1, 2, 4, 5],
	6: [0, 1, 2, 3, 4, 5],
};

const BOARD_AT: Record<Street, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };

const STREET_NAMES: Record<Street, string> = {
	preflop: 'Preflop',
	flop: 'Flop',
	turn: 'Turn',
	river: 'River',
};

const isPost = (kind: ActionKind): boolean => kind.startsWith('post-');

const cardCount = (cards: string): number => cards.split(' ').filter(Boolean).length;

/** Every state the table passes through, the deal first and the result last. */
export function tableSteps(hand: HandReport): TableStep[] {
	if (hand.seats.length === 0) return [];
	const indexOf = new Map(hand.seats.map((seat, index) => [seat.name, index]));
	const board = cardCount(hand.board);
	const steps: TableStep[] = [];

	let seats: TableSeat[] = hand.seats.map((seat) => ({
		stack: seat.stack,
		bet: 0,
		folded: false,
		allIn: false,
		last: null,
		cards: seat.hero && hand.heroCards ? hand.heroCards : null,
	}));
	let street: Street = 'preflop';
	let collected = 0;
	let boardCount = 0;
	let returned = false;

	const live = () => seats.reduce((sum, seat) => sum + seat.bet, 0);
	const copy = () => {
		seats = seats.map((seat) => ({ ...seat }));
	};
	const push = (step: Pick<TableStep, 'kind' | 'lineIndex' | 'actor' | 'dealt'>) => {
		const pot = collected + live();
		steps.push({
			...step,
			street,
			boardCount,
			collected,
			pot,
			potBefore: pot,
			toCall: 0,
			seats,
		});
		return steps[steps.length - 1];
	};
	const sweep = () => {
		copy();
		for (const seat of seats) {
			collected += seat.bet;
			seat.bet = 0;
			seat.last = null;
		}
	};
	/** Sweeps the bets in, hands back an uncalled one once, and so settles the street. */
	const settle = () => {
		sweep();
		if (returned) return;
		returned = true;
		for (const [name, amount] of Object.entries(hand.returned)) {
			const seat = seats[indexOf.get(name) ?? -1];
			if (!seat) continue;
			collected -= amount;
			seat.stack += amount;
		}
	};
	const deal = (next: Street) => {
		street = next;
		const from = boardCount;
		boardCount = Math.max(from, Math.min(BOARD_AT[next], board));
		push({ kind: 'deal', lineIndex: null, actor: null, dealt: [from, boardCount] });
	};
	const later = () => STREETS.slice(STREETS.indexOf(street) + 1);

	// The deal: the blinds are already out when the first decision is made.
	for (const line of hand.lines) {
		const seat = seats[indexOf.get(line.player) ?? -1];
		if (!seat || !isPost(line.kind)) continue;
		seat.stack -= line.amount;
		// A dead post is the pot's, not a bet anyone has to match.
		if (line.kind === 'post-dead') collected += line.amount;
		else seat.bet += line.amount;
		seat.last = seat.last ?? line.kind;
		seat.allIn = seat.allIn || line.allIn || seat.stack === 0;
	}
	push({ kind: 'deal', lineIndex: null, actor: null, dealt: [0, 0] });

	for (const line of hand.lines) {
		const actor = indexOf.get(line.player);
		if (actor === undefined || isPost(line.kind)) continue;
		if (later().includes(line.street)) {
			for (const next of later()) {
				sweep();
				deal(next);
				if (next === line.street) break;
			}
		}

		const before = seats[actor];
		const potBefore = collected + live();
		const streetBet = Math.max(0, ...seats.map((seat) => seat.bet));
		const toCall = Math.min(Math.max(0, streetBet - before.bet), before.stack);

		copy();
		const seat = seats[actor];
		seat.stack -= line.amount;
		seat.bet += line.amount;
		seat.last = line.kind;
		if (line.kind === 'fold') seat.folded = true;
		if (line.allIn || (line.amount > 0 && seat.stack === 0)) seat.allIn = true;
		const step = push({
			kind: 'action',
			lineIndex: line.stepIndex,
			actor,
			dealt: [0, 0],
		});
		step.potBefore = potBefore;
		step.toCall = toCall;
	}

	// An all-in before the river still has its board run out, the uncalled part
	// of the bet handed back first.
	for (const next of later()) {
		if (BOARD_AT[next] > board) break;
		settle();
		deal(next);
	}

	settle();
	copy();
	for (const [index, { name }] of hand.seats.entries()) {
		const seat = seats[index];
		if (hand.shown[name]) seat.cards = hand.shown[name];
		const paid = hand.paid[name] ?? 0;
		if (paid > 0) {
			seat.stack += paid;
			seat.last = 'wins';
		}
	}
	// The pot shown is the one being paid out, beside stacks that already hold it.
	push({ kind: 'result', lineIndex: null, actor: null, dealt: [0, 0] });
	return steps;
}

/**
 * Where each seat sits, as a slot per `hand.seats` entry: the hero at the
 * bottom and the rest clockwise, or the first to act there when the hero was
 * not dealt in.
 */
export function seatSlots(hand: HandReport): number[] {
	const count = hand.seats.length;
	const slots = SLOTS[count] ?? SLOTS[6];
	const hero = Math.max(
		0,
		hand.seats.findIndex((seat) => seat.hero)
	);
	return hand.seats.map((_, index) => slots[(index - hero + count) % count] ?? 0);
}

/** The step a line of the action is shown at. A blind is part of the deal. */
export function stepOfLine(steps: readonly TableStep[], lineIndex: number): number {
	return Math.max(
		0,
		steps.findIndex((step) => step.lineIndex === lineIndex)
	);
}

/** The steps at which the hero chose something. */
export function decisionSteps(steps: readonly TableStep[], hand: HandReport): number[] {
	const found: number[] = [];
	steps.forEach((step, index) => {
		if (step.actor !== null && hand.seats[step.actor]?.hero) found.push(index);
	});
	return found;
}

/**
 * Where a hand opens: on its first mistake or good play, else at the deal. A
 * list of good plays opens a hand on its play, though a mistake came before it.
 */
export function defaultStep(
	steps: readonly TableStep[],
	hand: HandReport,
	prefer?: 'play'
): number {
	const finding =
		(prefer === 'play' ? hand.gradings.find((grading) => grading.goodPlay) : undefined)
		?? hand.gradings.find((grading) => grading.mistake || grading.goodPlay);
	return finding ? stepOfLine(steps, finding.stepIndex) : 0;
}

/** The step a route asks for, held inside the hand. */
export function resolveStep(
	steps: readonly TableStep[],
	hand: HandReport,
	step: number | null,
	prefer?: 'play'
): number {
	if (steps.length === 0) return 0;
	return Math.min(steps.length - 1, step ?? defaultStep(steps, hand, prefer));
}

/** `Showdown` for a result with hands turned over, else the street. */
export function stepStreet(hand: HandReport, step: TableStep): string {
	if (step.kind !== 'result') return STREET_NAMES[step.street];
	return Object.keys(hand.shown).length > 0 ? 'Showdown' : 'Result';
}

/** What a step did, as a sentence in big blinds. */
export function stepText(hand: HandReport, step: TableStep): string {
	const bb = (cents: number) => `${bbText(cents, hand.bigBlind)} bb`;
	if (step.kind === 'deal') {
		return step.street === 'preflop' ?
				'Blinds posted, cards dealt'
			:	`${STREET_NAMES[step.street]} dealt`;
	}
	if (step.kind === 'result') {
		const winners = hand.seats
			.filter(({ name }) => (hand.paid[name] ?? 0) > 0)
			.map(({ name }) => `${name} wins ${bb(hand.paid[name])}`);
		return winners.length > 0 ? winners.join(', ') : 'The hand is over';
	}
	const line = hand.lines.find(({ stepIndex }) => stepIndex === step.lineIndex);
	if (!line) return '';
	const allIn = line.allIn ? ' (all-in)' : '';
	switch (line.kind) {
		case 'fold':
			return `${line.player} folds`;
		case 'check':
			return `${line.player} checks`;
		case 'call':
			return `${line.player} calls ${bb(line.amount)}${allIn}`;
		case 'bet':
			return `${line.player} bets ${bb(line.amount)}${allIn}`;
		case 'raise':
			return `${line.player} raises to ${bb(line.to ?? line.amount)}${allIn}`;
		default:
			return '';
	}
}

/** What the actor faced, when it is the hero facing a bet; else the pot and who is in. */
export function stepFacts(hand: HandReport, step: TableStep): string {
	const bb = (cents: number) => `${bbText(cents, hand.bigBlind)} bb`;
	if (step.actor !== null && hand.seats[step.actor]?.hero && step.toCall > 0) {
		const odds = Math.round((100 * step.toCall) / (step.potBefore + step.toCall));
		return `${bb(step.toCall)} to call into ${bb(step.potBefore)} · pot odds ${odds}%`;
	}
	const inHand = step.seats.filter((seat) => !seat.folded).length;
	return `Pot ${bb(step.pot)} · ${inHand} ${inHand === 1 ? 'player' : 'players'} in`;
}
