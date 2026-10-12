import { describe, it, expect } from 'vitest';

import { parseHistory } from '#utils/history/parse';
import { replayHand, type Replay } from '#utils/history/replay';
import { seeHand, wonFrom } from '#utils/store/players';
import type { PlayerAggregate } from '#utils/store/types';

import { handText, RIVER_HERO_CALL, ringHand } from '../history/handText';

const replayOf = (text: string): Replay => replayHand(parseHistory(text)[0]);

const folded = replayOf(ringHand(6, 'As Ad', 'fold', 6001));
const opened = replayOf(ringHand(6, 'Ah Kd', 'raise', 6002));
const called = replayOf(handText(RIVER_HERO_CALL));

/** A hand cut down to who won what, for a pot no written hand makes simply. */
const settled = (net: Record<string, number>, reconciled = true): Replay => ({
	...opened,
	net,
	reconciled,
});

describe('what the hero won from each player', () => {
	it('is each blind the hero took', () => {
		expect(wonFrom(opened)).toEqual({ p5: 5, p6: 10 });
	});

	it('is negative for what the hero lost to them', () => {
		expect(wonFrom(called)).toEqual({ p2: -500 });
	});

	it('is nothing in a hand the hero broke even in', () => {
		expect(wonFrom(folded)).toEqual({});
	});

	describe('a pot with several winners or losers', () => {
		it('splits the hero’s loss by what each winner won', () => {
			// 100 raked from 400 lost: the winners took 225 and 75.
			const won = wonFrom(settled({ hero: -300, p2: 225, p3: 75, p4: -100 }));
			expect(won).toEqual({ p2: -169, p3: -56 });
		});

		it('takes the hero’s win from each loser by what they lost', () => {
			expect(wonFrom(settled({ hero: 300, p2: -300, p3: -100, p4: 100 }))).toEqual({
				p2: 225,
				p3: 75,
			});
		});
	});

	it('is nothing in a hand that does not reconcile', () => {
		expect(wonFrom(settled({ hero: -300, p2: 300 }, false))).toEqual({});
	});
});

describe('the money seen of a player', () => {
	const seen = (...replays: Replay[]) => {
		const players = new Map<string, PlayerAggregate>();
		for (const replay of replays) seeHand(players, replay);
		return players;
	};

	it('sums their result and the hero’s against them, by currency', () => {
		const players = seen(folded, opened, called);
		expect(players.get('p2')!.money).toEqual({
			USD: { hands: 3, net: 500, heroNet: -500 },
		});
		expect(players.get('p5')!.money).toEqual({
			USD: { hands: 3, net: -10, heroNet: 5 },
		});
		expect(players.get('p6')!.money).toEqual({
			USD: { hands: 3, net: -5, heroNet: 10 },
		});
		expect(players.get('hero')!.money).toEqual({
			USD: { hands: 3, net: -485, heroNet: 0 },
		});
	});

	it('is taken back out with the hand', () => {
		const players = seen(folded, opened, called);
		seeHand(players, called, -1);
		expect(players.get('p2')!.money).toEqual({ USD: { hands: 2, net: 0, heroNet: 0 } });
		seeHand(players, folded, -1);
		seeHand(players, opened, -1);
		expect(players.get('p2')!.money).toEqual({});
	});

	it('leaves out a hand that does not reconcile', () => {
		const players = seen(settled(called.net, false));
		expect(players.get('p5')).toMatchObject({ tally: { hands: 1 }, money: {} });
	});
});
