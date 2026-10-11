/**
 * Writes a PokerStars hand in the client's own plain format, for tests that
 * need a particular spot rather than a recorded one. Six seats, `hero` in seat
 * 1, $0.05/$0.10: the caller supplies the action and what the pot came to.
 */

export interface HandSpec {
	id?: number;
	heroCards: string;
	/** Seat that holds the button, 1 to 6. */
	button: number;
	/** Every line from the blinds to the last action, street markers included. */
	lines: string[];
	/** The pot as the summary states it, e.g. `0.25`. */
	pot: string;
	winner: string;
	/** Dollars per seat; 10 by default. */
	stacks?: Record<string, number>;
}

export const SEATS = ['hero', 'p2', 'p3', 'p4', 'p5', 'p6'];

let nextId = 1000;

export function handText(spec: HandSpec): string {
	const id = spec.id ?? nextId++;
	const second = String(id % 60).padStart(2, '0');
	const holeCards = spec.lines.indexOf('*** HOLE CARDS ***');
	const lines = [...spec.lines];
	lines.splice(holeCards + 1, 0, `Dealt to hero [${spec.heroCards}]`);
	return [
		`PokerStars Hand #${id}:  Hold'em No Limit ($0.05/$0.10 USD) - 2026/01/02 10:${String(Math.floor(id / 60) % 60).padStart(2, '0')}:${second} ET`,
		`Table 'Builder' 6-max Seat #${spec.button} is the button`,
		...SEATS.map(
			(name, i) => `Seat ${i + 1}: ${name} ($${spec.stacks?.[name] ?? 10} in chips)`
		),
		...lines,
		'*** SUMMARY ***',
		`Total pot $${spec.pot} | Rake $0`,
		`Seat ${SEATS.indexOf(spec.winner) + 1}: ${spec.winner} collected ($${spec.pot})`,
		'',
		'',
	].join('\n');
}

/** Button in seat 6, so `hero` in seat 1 is the small blind and p2 the big. */
export const BLINDS_HERO_SB = [
	'hero: posts small blind $0.05',
	'p2: posts big blind $0.10',
];

/** Button in seat 4: p5 and p6 post, `hero` is first to act (UTG). */
export const BLINDS_HERO_UTG = [
	'p5: posts small blind $0.05',
	'p6: posts big blind $0.10',
];

/** Button in seat 1: `hero` is on the button, p2 and p3 post. */
export const BLINDS_HERO_BTN = [
	'p2: posts small blind $0.05',
	'p3: posts big blind $0.10',
];

/**
 * Hero 4-bets ace-queen under the gun and folds it to a shove for stacks: a
 * premium laid down without the price, which the coach calls a good play.
 */
export const TOUGH_FOLD: HandSpec = {
	id: 6001,
	heroCards: 'Ac Qd',
	button: 4,
	lines: [
		'p5: posts small blind $0.05',
		'p6: posts big blind $0.10',
		'*** HOLE CARDS ***',
		'hero: raises $0.15 to $0.25',
		'p2: folds',
		'p3: folds',
		'p4: folds',
		'p5: folds',
		'p6: raises $0.75 to $1',
		'hero: raises $1.40 to $2.40',
		'p6: raises $7.60 to $10 and is all-in',
		'hero: folds',
		'Uncalled bet ($7.60) returned to p6',
		'p6 collected $4.85 from pot',
	],
	pot: '4.85',
	winner: 'p6',
};

/**
 * Hero opens five-four from the small blind, barrels twice, checks the river
 * and calls a shove with five high: a postflop blunder.
 */
export const RIVER_HERO_CALL: HandSpec = {
	id: 7001,
	heroCards: '5h 4h',
	button: 6,
	lines: [
		...BLINDS_HERO_SB,
		'*** HOLE CARDS ***',
		'p3: folds',
		'p4: folds',
		'p5: folds',
		'p6: folds',
		'hero: raises $0.20 to $0.30',
		'p2: calls $0.20',
		'*** FLOP *** [Kd 7s 2c]',
		'hero: bets $0.20',
		'p2: calls $0.20',
		'*** TURN *** [Kd 7s 2c] [3h]',
		'hero: bets $0.50',
		'p2: calls $0.50',
		'*** RIVER *** [Kd 7s 2c 3h] [9d]',
		'hero: checks',
		'p2: bets $4',
		'hero: calls $4',
		'*** SHOW DOWN ***',
		'p2: shows [Kc Qc] (a pair of Kings)',
		'hero: mucks hand',
		'p2 collected $10 from pot',
	],
	pot: '10',
	winner: 'p2',
};

/** A steal whose stated pot is a dollar out, so the hand is not graded. */
export const UNRECONCILED: HandSpec = {
	id: 7002,
	heroCards: 'Kh Kd',
	button: 4,
	lines: [
		...BLINDS_HERO_UTG,
		'*** HOLE CARDS ***',
		'hero: raises $0.15 to $0.25',
		'p2: folds',
		'p3: folds',
		'p4: folds',
		'p5: folds',
		'p6: folds',
		'Uncalled bet ($0.15) returned to hero',
		'hero collected $0.25 from pot',
	],
	pot: '1.25',
	winner: 'hero',
};

/** Seven-deuce opened on the button: an open the chart never makes. */
export const BUTTON_TRASH_OPEN: HandSpec = {
	id: 5003,
	heroCards: '7h 2c',
	button: 1,
	lines: [
		...BLINDS_HERO_BTN,
		'*** HOLE CARDS ***',
		'p4: folds',
		'p5: folds',
		'p6: folds',
		'hero: raises $0.15 to $0.25',
		'p2: folds',
		'p3: folds',
		'Uncalled bet ($0.15) returned to hero',
		'hero collected $0.25 from pot',
	],
	pot: '0.25',
	winner: 'hero',
};
