/** Hands for the solver's tests, and a way to replay one. */

import { parseHistory } from '#utils/history/parse';
import { replayHand } from '#utils/history/replay';

import { BLINDS_HERO_SB, handText, type HandSpec } from '../history/handText';

export const replayOf = (spec: HandSpec) => replayHand(parseHistory(handText(spec))[0]);

/** The index of the hero's action on `street` that reads `text`. */
export function stepOf(spec: HandSpec, street: string, text: string): number {
	const replay = replayOf(spec);
	const found = replay.steps.find(
		(step) =>
			step.street === street
			&& step.action.player === 'hero'
			&& (step.action.kind === text
				|| `${step.action.kind} ${step.action.amount}` === text)
	);
	if (!found) throw new Error(`No hero ${text} on the ${street}`);
	return found.index;
}

/** Hero raises from the small blind and two call: a flop bet into two players. */
export const THREE_WAY_CBET: HandSpec = {
	id: 7101,
	heroCards: 'Ah Qh',
	button: 6,
	lines: [
		...BLINDS_HERO_SB,
		'*** HOLE CARDS ***',
		'p3: calls $0.10',
		'p4: folds',
		'p5: folds',
		'p6: folds',
		'hero: raises $0.20 to $0.30',
		'p2: calls $0.20',
		'p3: calls $0.20',
		'*** FLOP *** [Kd 7s 2c]',
		'hero: bets $0.40',
		'p2: folds',
		'p3: folds',
		'Uncalled bet ($0.40) returned to hero',
		'hero collected $0.90 from pot',
	],
	pot: '0.90',
	winner: 'hero',
};
