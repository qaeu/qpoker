/**
 * The coach's words. One short paragraph per graded decision, built from the
 * numbers the grader kept: nothing here computes anything.
 */

import type { GoodPlay } from './goodPlays';
import type { Grading, PreflopFacts } from './grade';
import type { MistakeType } from './mistakes';
import type { PostflopFacts } from '../postflop/decision';

const pct = (value: number): string => `${Math.round(value * 100)}%`;

const bbText = (value: number): string => {
	const rounded = Math.round(value * 10) / 10;
	return `${Object.is(rounded, -0) ? 0 : rounded}bb`;
};

const ADVICE: Record<MistakeType, string> = {
	'open-loose':
		'This hand is outside the opening range for the seat: too many players are left to act behind who will have it dominated.',
	'open-tight':
		'This is a standard open from this seat. Folding it gives up a profitable steal.',
	'open-limp':
		'Limping wins nothing uncontested and invites a raise behind. Raise the hands worth playing and fold the rest.',
	'iso-loose':
		'Raising limpers builds a pot against ranges that rarely fold. This hand is not strong enough to do it for value.',
	'sb-complete':
		'Out of position against the big blind for the rest of the hand, completing is the worst of both: raise, or fold.',
	'missed-iso':
		'The hand is strong enough to raise the limpers for value and take the lead, rather than see a cheap multiway flop.',
	'cold-call-loose':
		'This hand does not have the equity or the playability to call here, and is often dominated by the raising range.',
	'three-bet-loose':
		'This hand is not in the 3-betting range here, for value or as a bluff: when it is called or 4-bet it is in poor shape.',
	'missed-three-bet':
		'The baseline 3-bets this hand: it is ahead of the opening range and builds a pot with the lead, where a call lets the blinds in cheaply.',
	'fold-vs-open':
		'This hand continues against that open: it has the equity against the opening range to do so.',
	'bb-underdefend':
		'Closing the action with a discount, the big blind defends far wider than any other seat. This hand has the price.',
	'bb-overdefend':
		'Even with the big blind discount this hand does not realise enough equity out of position to defend.',
	'call-three-bet-loose':
		'Against a 3-betting range this hand is dominated too often to continue with.',
	'overfold-three-bet':
		'Folding this to a 3-bet lets the 3-bettor profit with any two cards. It is strong enough to continue.',
	'four-bet-loose':
		'A 4-betting range is very narrow. This hand is behind almost all of it.',
	'overfold-four-bet':
		'This hand is near the top of the range and continues against a 4-bet.',
	'wrong-line':
		'The hand is right to play, but not this way: the baseline takes the other action with it.',
	'preflop-sizing':
		'The raise size is well off the standard one. Too small gives a good price to the whole table; too big risks more than it needs to win the same pot.',
	'stackoff-loose':
		'Against the range that shoves here, the hand does not have the equity the price asks for.',
	'stackoff-tight':
		'Against the range that shoves here, the hand has more equity than the price asks for.',
	'call-without-odds':
		'The hand does not win often enough against the betting range to pay this price, and is too low in your own range to be a call that has to be made.',
	'fold-with-odds':
		'The hand wins often enough against the betting range to make calling profitable at this price, and is well inside the part of your range that has to defend.',
	'missed-value':
		'Worse hands call a bet here more often than better ones do. Checking leaves that money behind.',
	'missed-raise':
		'The hand beats nearly everything that bets here. A raise is called by much of the value in that range.',
	'bet-thin':
		'The hand has showdown value, but a bet folds out what it beats and is called by what beats it. Checking keeps the pot small and the bluffs in.',
	'raise-thin':
		'The hand beats the bluffs and loses to the value: raising folds out the first and is continued against by the second.',
	'bluff-multiway':
		'With several players to get through and no equity when called, a bluff needs far more folds than it will get.',
	'postflop-sizing': 'The bet size is far from what this board calls for.',
};

const ALTERNATIVE: Record<GoodPlay['alternative'], string> = {
	fold: 'folding',
	check: 'checking',
	call: 'calling',
	bet: 'betting',
	raise: 'raising',
};

const PRAISE: Record<GoodPlay['type'], string> = {
	'tough-call':
		'You are behind more often than not here, and the price makes the call anyway.',
	'tough-fold':
		'A hand this strong is hard to let go, and it still does not have the price.',
};

/** What a good play was worth, against the mistake the other action would have been. */
function praise(play: GoodPlay): string {
	const other = ALTERNATIVE[play.alternative];
	return `${PRAISE[play.type]} A good play: ${other} would have given up about ${bbText(play.evGainedBb)}.`;
}

/** `free` is a big blind with nothing to call: what is not raised is checked. */
function frequencies(facts: PreflopFacts, free: boolean): string {
	const parts: string[] = [];
	if (facts.raise > 0.005) parts.push(`raises ${pct(facts.raise)}`);
	if (!free && facts.call > 0.005) parts.push(`calls ${pct(facts.call)}`);
	const rest = Math.max(0, 1 - facts.raise - (free ? 0 : facts.call));
	if (rest > 0.005) parts.push(`${free ? 'checks' : 'folds'} ${pct(rest)}`);
	return parts.join(', ');
}

function preflopText(grading: Grading, facts: PreflopFacts): string {
	const lead = `${facts.hand}, ${grading.spot} (${Math.round(facts.effectiveBb)}bb effective).`;
	if (facts.equity !== undefined && facts.potOdds !== undefined) {
		const price = `You have about ${pct(facts.equity)} equity against the shoving range and need ${pct(facts.potOdds)}: calling is worth ${bbText(facts.callEvBb ?? 0)}.`;
		return [
			lead,
			price,
			grading.mistake ? ADVICE[grading.mistake]
			: grading.goodPlay ? praise(grading.goodPlay)
			: 'The right decision.',
		].join(' ');
	}
	const free = grading.chosen === 'check' || grading.recommended === 'check';
	const chart = `The baseline ${frequencies(facts, free)} with this hand.`;
	if (!grading.mistake) return `${lead} ${chart} In line with it.`;
	const size =
		grading.mistake === 'preflop-sizing' && facts.raiseToBb && facts.suggestedRaiseToBb ?
			` You made it ${bbText(facts.raiseToBb)}; about ${bbText(facts.suggestedRaiseToBb)} is standard.`
		:	'';
	return `${lead} ${chart} ${ADVICE[grading.mistake]}${size}`;
}

function postflopText(grading: Grading, facts: PostflopFacts): string {
	const holding =
		facts.drawText ? `${facts.handText} with ${facts.drawText}` : facts.handText;
	const lead = `You hold ${holding} on ${facts.texture} board, ${bbText(facts.potBb)} in the pot.`;
	const parts = [lead];

	if (facts.potOdds !== undefined) {
		parts.push(
			`Against the betting range you have about ${pct(facts.equity)} equity and need ${pct(facts.potOdds)}: a call is worth ${bbText(facts.callEvBb ?? 0)}.`
		);
		if (facts.standing !== undefined && facts.defend !== undefined) {
			parts.push(
				`The hand beats ${pct(facts.standing)} of your own range here, which has to defend about ${pct(facts.defend)} of the time.`
			);
		}
	} else if (facts.foldShare !== undefined && facts.calledEquity !== undefined) {
		const size = pct(facts.betSize ?? 0);
		parts.push(
			`You have about ${pct(facts.equity)} equity against the range. A ${size}-pot bet folds out ${pct(facts.foldShare)} of it and has ${pct(facts.calledEquity)} equity when called: betting is worth ${bbText(facts.betEvBb ?? 0)}, checking ${bbText(facts.checkEvBb ?? 0)}.`
		);
	}

	if (grading.mistake) {
		parts.push(ADVICE[grading.mistake]);
		if (grading.mistake === 'postflop-sizing' && facts.suggestedSize) {
			parts.push(`Around ${pct(facts.suggestedSize)} of the pot suits this texture.`);
		}
	} else {
		parts.push(grading.goodPlay ? praise(grading.goodPlay) : 'No clear error.');
	}
	return parts.join(' ');
}

/** The explanation for a graded decision. */
export function explain(grading: Grading): string {
	if (grading.preflop) return preflopText(grading, grading.preflop);
	if (grading.postflop) return postflopText(grading, grading.postflop);
	return '';
}
