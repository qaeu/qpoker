/**
 * What a hand adds to what is known of each player dealt into it: their
 * frequencies, when they were seen and what they showed. Display only: no
 * grading reads it. See docs/library.md.
 */

import { cardsText } from '../cards/cards';
import { addTally, emptyTally, tallyHand } from '../coach/session';
import type { Replay } from '../history/replay';
import type { PlayerAggregate } from './types';

/** The players dealt into a hand. */
export const playersOf = (replay: Replay): string[] => replay.layout?.players ?? [];

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
				showdowns: [],
			};
			players.set(name, player);
		}
		addTally(player.tally, tally, sign);
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
