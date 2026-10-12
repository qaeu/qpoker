/**
 * What is known of a player, read for the next time they are at the table:
 * their frequencies against the same baselines as the hero's, and for each
 * one clearly off its baseline, what that usually invites. Display only, and
 * a read, not a grade: see docs/accuracy.md, "Opponent profiles".
 */

import { sessionOf, type SessionSummary, type Stat, type StatId } from '../coach/session';
import type { MoneySeen, PlayerAggregate, Showdown } from './types';

export interface ProfileRead {
	stat: Stat;
	/** What a frequency off its baseline that way usually invites. */
	note: string;
}

export interface MoneyRow extends MoneySeen {
	/** `USD`, `EUR`, ... or empty for a table that names none. */
	currency: string;
}

export interface PlayerProfile {
	name: string;
	hands: number;
	firstSeen: string;
	lastSeen: string;
	session: SessionSummary;
	/** The frequencies the sample can bear a read on: a leak by the session's rule. */
	reads: ProfileRead[];
	/** What they won and lost, and the hero against them: the currency seen most first. */
	money: MoneyRow[];
	/** The most recent first. */
	showdowns: Showdown[];
}

/** The usual adjustment to a frequency that is too high or too low. Data, not logic. */
const EXPLOITS: Partial<Record<StatId, { high: string; low: string }>> = {
	vpip: {
		high: 'Plays too many hands: bet thinner for value, and bluff less.',
		low: 'Plays few hands: give a raise credit, and take the blinds.',
	},
	pfr: {
		high: 'Raises too often before the flop: 3-bet and call wider against it.',
		low: 'Rarely raises before the flop: a raise is a strong hand.',
	},
	rfi: {
		high: 'Opens too wide: 3-bet more, and defend the blinds wider.',
		low: 'Opens tight: fold more to an open.',
	},
	threeBet: {
		high: '3-bets a lot: 4-bet and call the 3-bet wider.',
		low: 'Rarely 3-bets: a 3-bet is the top of the range, so open wider into them.',
	},
	foldToThreeBet: {
		high: 'Folds too often to a 3-bet: 3-bet more as a bluff.',
		low: 'Rarely folds to a 3-bet: 3-bet for value, not as a bluff.',
	},
	bbDefend: {
		high: 'Defends the big blind too wide: open for value, and keep betting.',
		low: 'Gives the big blind up: open wider when they are in it.',
	},
	cbet: {
		high: 'Bets the flop too often as the raiser: raise or float it more.',
		low: 'Checks the flop often as the raiser: a bet means a hand.',
	},
	foldToCbet: {
		high: 'Folds too often to a flop bet: bet the flop as the raiser with anything.',
		low: 'Rarely folds to a flop bet: bet for value, and give up the bluffs.',
	},
	wtsd: {
		high: 'Goes to showdown too often: bet for value, and do not bluff.',
		low: 'Rarely reaches showdown: bluff the later streets more.',
	},
};

export function profileOf(player: PlayerAggregate): PlayerProfile {
	const session = sessionOf(player.tally);
	return {
		name: player.name,
		hands: session.hands,
		firstSeen: player.firstSeen,
		lastSeen: player.lastSeen,
		session,
		reads: session.stats.flatMap((stat): ProfileRead[] => {
			const note = stat.leak && EXPLOITS[stat.id]?.[stat.leak];
			return note ? [{ stat, note }] : [];
		}),
		// An aggregate summed by an older build has none until it is summed again.
		money: Object.entries(player.money ?? {})
			.map(([currency, seen]) => ({ currency, ...seen }))
			.sort((a, b) => b.hands - a.hands),
		showdowns: [...player.showdowns].reverse(),
	};
}
