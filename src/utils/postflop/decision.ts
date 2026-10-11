/**
 * Prices a postflop decision: the hero's equity against the ranges the
 * opponent model gives, set against the pot odds when facing a bet, or against
 * what a bet would fold out and get called by when it is the hero's to make.
 *
 * This is a model, not a solve. It answers the questions a solver's answer
 * rests on -- am I getting the right price, does a worse hand call, does a
 * better one fold -- and it is deliberately slow to call something a mistake:
 * a spot inside the indifference band, a bluff with the bottom of a range, or
 * a call the minimum-defence frequency needs are all let through.
 * See docs/postflop-model.md.
 */

import { equityVsRange, equityVsRanges, removeDead } from '../cards/equity';
import type { ComboRange, EquityOptions } from '../cards/equity';
import type { Replay, Step } from '../history/replay';
import type { MistakeType } from '../coach/mistakes';
import type { Confidence } from '../ranges/preflopSpot';
import { describeDraws, describeHand, drawStrength } from './handClass';
import { textureOf } from './texture';
import { rangeAt, responseToBet, standingIn } from './villainRange';

export type PostflopChoice = 'fold' | 'check' | 'call' | 'bet' | 'raise';

export interface PostflopOptions extends EquityOptions {
	/** Share of a pot the house takes once a flop is dealt. */
	rake: number;
}

export interface PostflopFacts {
	handText: string;
	drawText: string;
	texture: string;
	/** Showdown equity against the opponents' ranges. */
	equity: number;
	opponents: number;
	inPosition: boolean;
	potBb: number;
	/** Facing a bet: the equity a call needs, and what calling is worth. */
	potOdds?: number;
	callEvBb?: number;
	/** Where the hand stands in the hero's own range, 0 to 1. */
	standing?: number;
	/** The minimum-defence frequency against the bet faced. */
	defend?: number;
	/** Betting: the bet as a share of the pot, what folds, and equity when called. */
	betSize?: number;
	foldShare?: number;
	calledEquity?: number;
	betEvBb?: number;
	checkEvBb?: number;
	suggestedSize?: number;
}

/** The mistake the other action would have been named, had the hero taken it. */
export interface Avoided {
	choice: PostflopChoice;
	mistake: MistakeType;
	/** What it would have cost, in big blinds: negative. */
	evLostBb: number;
	confidence: Confidence;
	/** The hand looked like the other action: the right one was hard to find. */
	hard: boolean;
}

export interface PostflopVerdict {
	recommended: PostflopChoice;
	/** Chips of EV given up, in big blinds: zero or negative. */
	evLostBb: number;
	mistake: MistakeType | null;
	confidence: Confidence;
	facts: PostflopFacts;
	/** Set only on a decision with no mistake of its own. */
	avoided?: Avoided;
}

/** Differences smaller than this share of the pot are treated as a toss-up. */
const BAND = 0.07;

/** How far inside the defending part of its range a hand must be to owe a call. */
const DEFENCE_MARGIN = 0.1;

/** A call with less equity than this is made clearly behind. */
export const UNDERDOG = 0.45;
/** A fold from this far up the hero's own range gives up a strong hand. */
const STRONG_STANDING = 0.5;

/** How much of its equity a hand gets to realise when it does not close the hand. */
function realisation(inPosition: boolean, cardsToCome: number): number {
	if (cardsToCome === 0) return 1;
	if (inPosition) return cardsToCome === 1 ? 1 : 0.95;
	return cardsToCome === 1 ? 0.9 : 0.8;
}

/** Judges one postflop action by the hero. */
export function judgePostflop(
	replay: Replay,
	step: Step,
	options: PostflopOptions
): PostflopVerdict {
	const { hand } = replay;
	const hero = step.action.player;
	const hole = hand.heroCards;
	const { board } = step;
	const bb = hand.stakes.bigBlind;
	const keep = 1 - options.rake;
	const toCome = 5 - board.length;
	const pot = step.potBefore;
	const chosen = step.action.kind as PostflopChoice;

	const opponents = step.live.filter((name) => name !== hero);
	const dead = [...hole, ...board];
	const ranges: ComboRange[] = opponents.map((name) =>
		removeDead(rangeAt(replay, name, step.index, hole), dead)
	);
	const headsUp = opponents.length === 1;
	const inPosition = step.live.at(-1) === hero;
	const equity = equityVsRanges(hole, board, ranges, options).equity;
	const draw = toCome > 0 ? drawStrength(hole, board) : 0;
	const texture = textureOf(board);

	const facts: PostflopFacts = {
		handText: describeHand(hole, board),
		drawText: toCome > 0 ? describeDraws(hole, board) : '',
		texture: texture.label,
		equity,
		opponents: opponents.length,
		inPosition,
		potBb: pot / bb,
	};
	const verdict = (
		recommended: PostflopChoice,
		lost: number,
		mistake: MistakeType | null,
		confidence: Confidence
	): PostflopVerdict => ({
		recommended,
		evLostBb: mistake ? -Math.max(0, lost) / bb : 0,
		mistake,
		confidence,
		facts,
	});
	/** The hero's choice was right, and the other one would have been `mistake`. */
	const spared = (
		choice: PostflopChoice,
		lost: number,
		mistake: MistakeType,
		confidence: Confidence,
		hard: boolean
	): PostflopVerdict => ({
		...verdict(chosen, 0, null, confidence),
		avoided: { choice, mistake, evLostBb: -Math.max(0, lost) / bb, confidence, hard },
	});

	if (step.toCall > 0) {
		const call = step.toCall;
		// A bet bigger than the hero's stack is only in play up to that stack.
		const uncovered = Math.max(0, step.streetBet - step.committedBefore - call);
		const stake = pot - uncovered + call;
		// All-in for the hero, or for everyone else: no betting is left either way.
		const allIn = call >= step.stackBefore || step.canAct.every((name) => name === hero);
		const realised = allIn ? 1 : realisation(inPosition, toCome);
		// A strong draw with money behind is paid again when it gets there.
		const implied =
			!allIn && draw === 2 && step.stackBefore - call >= pot ? 0.05 * toCome : 0;
		const callEv = (realised + implied) * equity * stake * keep - call;
		const band = BAND * stake;
		const confidence: Confidence = headsUp && (allIn || toCome === 0) ? 'medium' : 'low';

		facts.potOdds = call / stake;
		facts.callEvBb = callEv / bb;
		const best: PostflopChoice = callEv > 0 ? 'call' : 'fold';

		// The equity estimate is only as good as the range it is taken against,
		// so it is checked against the other half of the theory: a range facing
		// a bet defends its best `1 / (1 + size)` and lets the rest go.
		const defence = () => {
			const own = removeDead(rangeAt(replay, hero, step.index), board);
			const faced = call / Math.max(1, pot - call);
			facts.standing = standingIn(own, hole, board);
			facts.defend = 1 / (1 + faced);
			return { standing: facts.standing, defend: facts.defend };
		};

		// The two ways to be wrong here. Each needs both arguments to agree.
		const sure = allIn || toCome === 0;
		const callLoses = (standing: number, defend: number) =>
			callEv < -band && !(headsUp && standing >= 1 - defend / 2);
		const foldLoses = (standing: number, defend: number) =>
			callEv > band && !(headsUp && !allIn && standing < 1 - defend + DEFENCE_MARGIN);

		if (chosen === 'fold') {
			if (callEv <= band) {
				if (callEv >= -band) return verdict(best, 0, null, confidence);
				const { standing, defend } = defence();
				if (!callLoses(standing, defend)) return verdict(best, 0, null, confidence);
				const strong = standing >= STRONG_STANDING;
				return spared('call', -callEv, 'call-without-odds', confidence, strong);
			}
			// Folding the bottom of the range is what the bottom of a range is for.
			const { standing, defend } = defence();
			if (!foldLoses(standing, defend)) return verdict('fold', 0, null, 'low');
			// With cards to come the call is not the end of it: the estimate is
			// of a hand that still has to get to showdown, so it is halved.
			return verdict('call', callEv * (sure ? 1 : 0.5), 'fold-with-odds', confidence);
		}

		if (chosen === 'call') {
			if (callEv < -band) {
				// And a call the range has to make somewhere is not a mistake for
				// being a losing one against this particular estimate.
				const { standing, defend } = defence();
				if (!callLoses(standing, defend)) return verdict('call', 0, null, 'low');
				return verdict('fold', -callEv, 'call-without-odds', confidence);
			}
			if (toCome === 0 && headsUp && equity >= 0.9 && step.stackBefore > call) {
				const more = Math.min(step.stackBefore - call, pot + call);
				return verdict('raise', 0.25 * more, 'missed-raise', 'low');
			}
			if (callEv > band) {
				const { standing, defend } = defence();
				if (foldLoses(standing, defend)) {
					const cost = callEv * (sure ? 1 : 0.5);
					// A strong draw's call is arithmetic, not a hard one.
					const behind = equity < UNDERDOG && draw < 2;
					return spared('fold', cost, 'fold-with-odds', confidence, behind);
				}
			}
			return verdict(best, 0, null, confidence);
		}

		// A raise: for value, as a semi-bluff, or with nothing. What it should
		// not be is a hand that beats the bluffs and loses to the value.
		if (equity >= 0.65 || draw > 0 || (equity < 0.3 && headsUp)) {
			return verdict('raise', 0, null, 'low');
		}
		return verdict(best, 0.05 * step.action.amount, 'raise-thin', 'low');
	}

	// Checked to, or first to act.
	const amount = chosen === 'bet' ? step.action.amount : 0;
	// A bet bigger than the deepest opponent's stack is only in play up to that stack.
	const made = step.effectiveStack > 0 ? Math.min(amount, step.effectiveStack) : amount;
	const size = made > 0 ? made / Math.max(1, pot) : texture.betSize;
	const bet = made > 0 ? made : Math.min(step.stackBefore, Math.round(pot * size));
	const realised = realisation(inPosition, toCome);

	let foldShare = 1;
	const continues: ComboRange[] = [];
	for (const range of ranges) {
		const response = responseToBet(range, board, size);
		foldShare *= response.foldShare;
		continues.push(response.continues);
	}
	// Called multiway, the hand is up against whichever caller is strongest;
	// pricing it against one caller's range keeps this from overstating that.
	const calledEquity =
		headsUp ?
			equityVsRange(hole, board, continues[0], options).equity
		:	Math.min(
				...continues.map((range) => equityVsRange(hole, board, range, options).equity)
			);

	const betEv =
		foldShare * pot * keep
		+ (1 - foldShare) * (realised * calledEquity * (pot + 2 * bet) * keep - bet);
	const checkRealised = toCome === 0 && !inPosition ? 0.92 : realised;
	const checkEv = checkRealised * equity * pot * keep;
	const band = BAND * pot;

	facts.betSize = size;
	facts.foldShare = foldShare;
	facts.calledEquity = calledEquity;
	facts.betEvBb = betEv / bb;
	facts.checkEvBb = checkEv / bb;
	facts.suggestedSize = texture.betSize;

	const value = calledEquity > 0.5;
	const confidence: Confidence = headsUp && toCome === 0 ? 'medium' : 'low';

	if (chosen === 'bet') {
		if (!value) {
			const bluff = equity < 0.3 || draw > 0;
			if (bluff && !headsUp && draw === 0 && equity < 0.2) {
				return verdict('check', 0.3 * bet, 'bluff-multiway', 'low');
			}
			if (!bluff && checkEv - betEv > band) {
				return verdict('check', checkEv - betEv, 'bet-thin', confidence);
			}
		}
		const allIn = amount >= step.stackBefore;
		const tiny = size < 0.2;
		const huge = toCome > 0 && size > 2.5 * texture.betSize && !allIn;
		if (tiny || huge) return verdict('bet', 0.04 * pot, 'postflop-sizing', 'low');
		return verdict('bet', 0, null, confidence);
	}

	if (value && equity >= 0.7 && betEv - checkEv > band) {
		// Out of position, or with cards to come, a check can still collect.
		const closes = toCome === 0 && inPosition;
		return verdict(
			'bet',
			(betEv - checkEv) * (closes ? 1 : 0.5),
			'missed-value',
			closes && headsUp ? 'medium' : 'low'
		);
	}
	return verdict(betEv > checkEv && value ? 'bet' : 'check', 0, null, confidence);
}
