/**
 * What a hand adds to what is known of each player dealt into it: their
 * frequencies, what they won and lost, when they were seen and what they
 * showed. Display only: no
 * grading reads it. See docs/library.md.
 */

import { cardsText } from '../cards/cards';
import { addTally, emptyTally, tallyHand } from '../coach/session';
import type { Replay } from '../history/replay';
import type { PlayerAggregate } from './types';

/** The players dealt into a hand. */
export const playersOf = (replay: Replay): string[] => replay.layout?.players ?? [];

/**
 * What the player a hand was dealt to won from each of the others, in cents,
 * and negative for what they lost to them. A loser's loss is split among the
 * winners by what each won, the rake taking its share: exact where one player
 * won or one lost, an estimate where a side pot went another way.
 */
export function wonFrom(replay: Replay): Record<string, number> {
	const { hero } = replay.hand;
	const heroNet = hero === null ? 0 : (replay.net[hero] ?? 0);
	const lost = Object.values(replay.net).reduce((sum, net) => sum + Math.max(0, -net), 0);
	const won: Record<string, number> = {};
	if (!replay.reconciled || heroNet === 0 || lost === 0) return won;
	for (const [name, net] of Object.entries(replay.net)) {
		if (name === hero || net === 0 || net > 0 === heroNet > 0) continue;
		const passed = Math.round(Math.abs(net * heroNet) / lost);
		if (passed > 0) won[name] = Math.sign(heroNet) * passed;
	}
	return won;
}

/**
 * Adds a hand to its players' aggregates, in place, making any that are new.
 * A `sign` of -1 takes it back out, for when the hand's text has been replaced.
 */
export function seeHand(
	players: Map<string, PlayerAggregate>,
	replay: Replay,
	sign: 1 | -1 = 1
): void {
	const { hand } = replay;
	const { currency } = hand.stakes;
	const won = wonFrom(replay);
	for (const name of playersOf(replay)) {
		const tally = tallyHand(replay, name);
		if (!tally) continue;
		let player = players.get(name);
		if (!player) {
			player = {
				name,
				firstSeen: hand.timestamp,
				lastSeen: hand.timestamp,
				tally: emptyTally(),
				money: {},
				showdowns: [],
			};
			players.set(name, player);
		}
		addTally(player.tally, tally, sign);
		// A hand that does not reconcile says nothing sound of who won what.
		if (replay.reconciled) {
			const money = (player.money[currency] ??= { hands: 0, net: 0, heroNet: 0 });
			money.hands += sign;
			money.net += sign * (replay.net[name] ?? 0);
			money.heroNet += sign * (won[name] ?? 0);
			if (money.hands <= 0) delete player.money[currency];
		}
		player.showdowns = player.showdowns.filter(({ handId }) => handId !== hand.id);
		if (sign < 0) continue;

		if (hand.timestamp < player.firstSeen) player.firstSeen = hand.timestamp;
		if (hand.timestamp > player.lastSeen) player.lastSeen = hand.timestamp;
		const shown = hand.shown[name];
		if (shown) {
			player.showdowns.push({
				handId: hand.id,
				timestamp: hand.timestamp,
				cards: cardsText(shown),
			});
			player.showdowns.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
		}
	}
}
