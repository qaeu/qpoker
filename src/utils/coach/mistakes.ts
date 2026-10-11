/**
 * The kinds of mistake the coach names, and how bad a given loss is.
 */

export type Severity = 'ok' | 'inaccuracy' | 'mistake' | 'blunder';

export const SEVERITIES: readonly Severity[] = ['ok', 'inaccuracy', 'mistake', 'blunder'];

/** EV lost, in big blinds, at which each severity starts. */
export const SEVERITY_FROM_BB: Record<Exclude<Severity, 'ok'>, number> = {
	inaccuracy: 0.15,
	mistake: 0.5,
	blunder: 1.5,
};

export const MISTAKES = {
	'open-loose': { title: 'Opened too loose', street: 'preflop' },
	'open-tight': { title: 'Folded a standard open', street: 'preflop' },
	'open-limp': { title: 'Limped in', street: 'preflop' },
	'iso-loose': { title: 'Raised the limpers too loose', street: 'preflop' },
	'sb-complete': { title: 'Completed the small blind', street: 'preflop' },
	'missed-iso': { title: 'Did not raise the limpers', street: 'preflop' },
	'cold-call-loose': { title: 'Called an open too loose', street: 'preflop' },
	'three-bet-loose': { title: '3-bet too loose', street: 'preflop' },
	'missed-three-bet': { title: 'Called where a 3-bet is standard', street: 'preflop' },
	'fold-vs-open': {
		title: 'Folded a hand that plays against the open',
		street: 'preflop',
	},
	'bb-underdefend': { title: 'Under-defended the big blind', street: 'preflop' },
	'bb-overdefend': { title: 'Over-defended the big blind', street: 'preflop' },
	'call-three-bet-loose': {
		title: 'Continued too loose against a 3-bet',
		street: 'preflop',
	},
	'overfold-three-bet': { title: 'Over-folded to a 3-bet', street: 'preflop' },
	'four-bet-loose': { title: 'Continued too loose against a 4-bet', street: 'preflop' },
	'overfold-four-bet': { title: 'Over-folded to a 4-bet', street: 'preflop' },
	'wrong-line': { title: 'Right hand, wrong action', street: 'preflop' },
	'preflop-sizing': { title: 'Preflop raise size', street: 'preflop' },
	'stackoff-loose': { title: 'Called off too light', street: 'preflop' },
	'stackoff-tight': { title: 'Folded with the price to call off', street: 'preflop' },
	'call-without-odds': { title: 'Called without the price', street: 'postflop' },
	'fold-with-odds': { title: 'Folded with the price to call', street: 'postflop' },
	'missed-value': { title: 'Missed a value bet', street: 'postflop' },
	'missed-raise': { title: 'Called where a raise gets paid', street: 'postflop' },
	'bet-thin': { title: 'Bet a hand that only better hands call', street: 'postflop' },
	'raise-thin': {
		title: 'Raised a hand that only better hands continue against',
		street: 'postflop',
	},
	'bluff-multiway': { title: 'Bluffed into several players', street: 'postflop' },
	'postflop-sizing': { title: 'Postflop bet size', street: 'postflop' },
} as const satisfies Record<string, { title: string; street: 'preflop' | 'postflop' }>;

export type MistakeType = keyof typeof MISTAKES;

/** `evLostBb` is zero or negative; the more negative, the worse. */
export function severityOf(evLostBb: number): Severity {
	const lost = -evLostBb;
	return (
		lost >= SEVERITY_FROM_BB.blunder ? 'blunder'
		: lost >= SEVERITY_FROM_BB.mistake ? 'mistake'
		: lost >= SEVERITY_FROM_BB.inaccuracy ? 'inaccuracy'
		: 'ok'
	);
}
