/**
 * A hand as a few lines of plain text, for pasting into a discussion: stakes,
 * stacks and the action street by street, in big blinds, for the players the
 * hand was between. Opponents go by their seats, not their screen names. See docs/design-language.md, "The copied hand".
 */

import type { ActionLine, HandReport } from '../coach/report';
import { STREETS, type ActionKind, type Street } from '../history/hand';
import { bbText } from './format';
import { tableSteps } from './tableReplay';

const STREET_NAMES: Record<Street, string> = {
	preflop: 'Preflop',
	flop: 'Flop',
	turn: 'Turn',
	river: 'River',
};

const BOARD_SPAN: Record<Street, [number, number]> = {
	preflop: [0, 0],
	flop: [0, 3],
	turn: [3, 4],
	river: [4, 5],
};

/** Money put in by choice, which a blind is not. */
const VOLUNTARY: readonly ActionKind[] = ['call', 'bet', 'raise'];

/** A net result with its sign, and no decimal place a whole figure does not need. */
function netText(bb: number): string {
	const rounded = Number(bb.toFixed(1));
	return `${rounded > 0 ? '+' : ''}${rounded}`.replace('-', '−');
}

function actionText(
	line: ActionLine,
	who: string,
	bb: (cents: number) => string,
	opens: boolean
): string {
	const allIn = line.allIn ? ' (all-in)' : '';
	switch (line.kind) {
		case 'fold':
			return `${who} folds`;
		case 'check':
			return `${who} checks`;
		case 'call':
			return `${who} calls${allIn}`;
		case 'bet':
			return `${who} bets ${bb(line.amount)}${allIn}`;
		case 'raise':
			return `${who} ${opens ? 'opens' : 'raises to'} ${bb(line.to ?? line.amount)}${allIn}`;
		default:
			return '';
	}
}

/**
 * Who the hand was between: the hero, and whoever put money in by choice or
 * was never made to fold before the flop. The rest only folded.
 */
function playersIn(hand: HandReport): Set<string> {
	const entered = new Set<string>();
	const folded = new Set<string>();
	for (const line of hand.lines) {
		if (line.hero || VOLUNTARY.includes(line.kind)) entered.add(line.player);
		else if (line.kind === 'fold' && line.street === 'preflop') folded.add(line.player);
	}
	const names = [
		...hand.seats.map((seat) => seat.name),
		...hand.lines.map((line) => line.player),
	];
	return new Set(names.filter((name) => entered.has(name) || !folded.has(name)));
}

/** The hand in text, one line per street, ending in what the hero won or lost. */
export function handNotation(hand: HandReport): string {
	const bb = (cents: number) => `${bbText(cents, hand.bigBlind)} bb`;
	const seats = new Map(hand.seats.map((seat) => [seat.name, seat]));
	// A name stands only where the hand has no seats to call the player by.
	const who = (name: string) => {
		const seat = seats.get(name);
		return seat?.hero ? 'Hero' : (seat?.position ?? name);
	};
	const inHand = playersIn(hand);
	// The first money put in by choice: a raise there is an open.
	const first = hand.lines.find(({ kind }) => VOLUNTARY.includes(kind));
	const steps = tableSteps(hand);
	const board = hand.board.split(' ').filter(Boolean);

	const out = [`NLHE ${hand.stakes} · ${hand.players}-handed · #${hand.id}`];
	if (hand.heroCards) {
		out.push(`Hero${hand.position ? ` (${hand.position})` : ''}: ${hand.heroCards}`);
	}
	if (hand.seats.length > 0) {
		const stacks = hand.seats
			.filter((seat) => seat.hero || inHand.has(seat.name))
			.map((seat) => `${seat.position} ${bb(seat.stack)}${seat.hero ? ' (Hero)' : ''}`);
		out.push(`Stacks: ${stacks.join(', ')}`);
	}
	out.push('');

	for (const street of STREETS) {
		const actions = hand.lines
			.filter((line) => line.street === street && inHand.has(line.player))
			.map((line) =>
				actionText(line, line.hero ? 'Hero' : who(line.player), bb, line === first)
			)
			.filter(Boolean);
		const cards = board.slice(...BOARD_SPAN[street]);
		// A street dealt with nobody left to act is still part of the hand.
		if (actions.length === 0 && cards.length === 0) continue;
		const deal = steps.find((step) => step.kind === 'deal' && step.street === street);
		const head = [
			STREET_NAMES[street],
			street !== 'preflop' && deal ? `(${bb(deal.pot)})` : '',
			cards.length > 0 ? `[${cards.join(' ')}]` : '',
		].filter(Boolean);
		out.push(
			actions.length > 0 ? `${head.join(' ')}: ${actions.join(', ')}` : head.join(' ')
		);
	}

	const shown = Object.entries(hand.shown).map(
		([name, cards]) => `${who(name)} shows ${cards}`
	);
	if (shown.length > 0) out.push(`Showdown: ${shown.join(', ')}`);

	const result = Object.entries(hand.paid)
		.filter(([, cents]) => cents > 0)
		.map(([name, cents]) => `${who(name)} wins ${bb(cents)}`);
	if (hand.heroCards) result.push(`Hero ${netText(hand.netBb)} bb`);
	if (result.length > 0) out.push(`Result: ${result.join(' · ')}`);

	return out.join('\n');
}
