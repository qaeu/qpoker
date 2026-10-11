/**
 * The kinds of good play the coach names: a decision that was right, that the
 * hand argued against, and whose other action would have been a real mistake.
 * See docs/coach-model.md.
 */

import type { Avoided, PostflopChoice } from '../postflop/decision';
import { severityOf, type MistakeType } from './mistakes';

export type GoodPlayRank = 'good' | 'great';

export const GOOD_PLAYS = {
	'tough-call': { title: 'Called as the underdog, with the price' },
	'tough-fold': { title: 'Laid down a strong hand without the price' },
} as const satisfies Record<string, { title: string }>;

export type GoodPlayType = keyof typeof GOOD_PLAYS;

export interface GoodPlay {
	type: GoodPlayType;
	rank: GoodPlayRank;
	/** What the choice was worth over the other one, in big blinds: positive. */
	evGainedBb: number;
	/** The action not taken, and the mistake it would have been. */
	alternative: PostflopChoice;
	avoided: MistakeType;
}

/** The good play each avoided mistake is the other side of. */
const SPARED: Partial<Record<MistakeType, GoodPlayType>> = {
	'fold-with-odds': 'tough-call',
	'stackoff-tight': 'tough-call',
	'call-without-odds': 'tough-fold',
	'stackoff-loose': 'tough-fold',
};

/**
 * A good play is a mistake avoided, so it is measured on the mistakes' own
 * scale: the other action had to cost a "mistake" at least, and "great" is
 * kept, as "blunder" is, for findings the model can stand behind.
 */
export function goodPlayOf(avoided: Avoided | undefined): GoodPlay | null {
	const type = avoided?.hard ? SPARED[avoided.mistake] : undefined;
	if (!avoided || !type) return null;
	const severity = severityOf(avoided.evLostBb);
	if (severity !== 'mistake' && severity !== 'blunder') return null;
	return {
		type,
		rank: severity === 'blunder' && avoided.confidence !== 'low' ? 'great' : 'good',
		evGainedBb: -avoided.evLostBb,
		alternative: avoided.choice,
		avoided: avoided.mistake,
	};
}
