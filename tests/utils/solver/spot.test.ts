import { describe, expect, it } from 'vitest';

import { COMBO_COUNT, comboIndex } from '#utils/cards/combos';
import { parseCards } from '#utils/cards/cards';
import { analyzeLog } from '#utils/coach/report';
import { solveEligibility, solverSpot, type HandFacts } from '#utils/solver/spot';
import { presetOf } from '#utils/solver/tree';
import { solverIndex } from '#utils/solver/cards';

import { handText, RIVER_HERO_CALL } from '../history/handText';
import { replayOf, stepOf, THREE_WAY_CBET } from './spots';

const tree = presetOf('standard');
const RIVER_CHECK = 12;
const RIVER_CALL = 14;

function spotAt(step: number, rake?: number) {
	const found = solverSpot(replayOf(RIVER_HERO_CALL), step, tree, rake);
	if (!found.ok) throw new Error(found.message);
	return found.spot;
}

const factsOf = (text: string): HandFacts => {
	const hand = analyzeLog(text).hands[0];
	return {
		gradeable: hand.gradeable,
		reconciled: hand.reconciled,
		players: hand.seats.map((seat) => seat.name),
		hero: hand.seats.find((seat) => seat.hero)?.name ?? null,
		lines: hand.lines,
	};
};

describe('solverSpot', () => {
	describe('a river call', () => {
		const spot = spotAt(RIVER_CALL, 0.04);

		it('roots the solve at the start of the street, heads-up', () => {
			expect(spot.street).toBe('river');
			expect(spot.input.board).toEqual(parseCards('Kd 7s 2c 3h 9d'));
			expect(spot.input.pot).toBe(200);
			expect(spot.input.stack).toBe(900);
			expect(spot.bigBlind).toBe(10);
		});

		it('carries the street’s actions up to the decision as the prefix', () => {
			expect(spot.input.prefix).toEqual([{ kind: 'check' }, { kind: 'bet', to: 400 }]);
			expect(spot.chosen).toEqual({ kind: 'call' });
			expect(spot.toCall).toBe(400);
		});

		it('seats the small blind out of position', () => {
			expect(spot.hero).toBe('hero');
			expect(spot.villain).toBe('p2');
			expect(spot.side).toBe(0);
		});

		it('hands over the rake as stated', () => {
			expect(spot.input.rakeRate).toBe(0.04);
			expect(spot.input.rakeCap).toBe(0);
			expect(spotAt(RIVER_CALL).rake).toBeGreaterThan(0);
		});

		it('hands over both ranges in the solver’s order, with the dead cards out', () => {
			const { oopRange, ipRange } = spot.input;
			expect(oopRange).toHaveLength(COMBO_COUNT);
			expect(ipRange).toHaveLength(COMBO_COUNT);
			const [five, four] = spot.heroCards;
			expect(oopRange[solverIndex(five, four)]).toBeGreaterThan(0);
			// The villain cannot hold the hero’s cards, and neither can hold the board.
			expect(ipRange[solverIndex(five, four)]).toBe(0);
			const [king] = spot.board;
			for (let other = 0; other < 52; other++) {
				if (other === king) continue;
				expect(oopRange[solverIndex(king, other)]).toBe(0);
				expect(ipRange[solverIndex(king, other)]).toBe(0);
			}
			expect(spot.ranges.ip).toBeGreaterThan(0);
		});

		it('finds the hero’s hand in the solver’s numbering', () => {
			const [five, four] = spot.heroCards;
			expect(spot.heroCombo).toBe(comboIndex(five, four));
			expect(spot.heroPair).toBe(solverIndex(five, four));
		});

		it('puts the sizes actually bet in the tree', () => {
			expect(spot.input.river?.bet.split(', ')).toContain('200%');
			expect(spot.tree.river.bet).toContain(2);
			expect(tree.river.bet).not.toContain(2);
		});
	});

	describe('a river check', () => {
		it('has no prefix and checks', () => {
			const spot = spotAt(RIVER_CHECK);
			expect(spot.input.prefix).toEqual([]);
			expect(spot.chosen).toEqual({ kind: 'check' });
		});
	});

	describe('a bet', () => {
		it('is a bet to its size, and sized in the tree', () => {
			const flop = stepOf(RIVER_HERO_CALL, 'flop', 'bet 20');
			const found = solverSpot(replayOf(RIVER_HERO_CALL), flop, tree);
			expect(found.ok && found.spot.chosen).toEqual({ kind: 'bet', to: 20 });
			// 20 into 60.
			expect(found.ok && found.spot.tree.flop.bet).toContain(0.333);
		});
	});

	describe('what it refuses', () => {
		const reason = (step: number) => {
			const found = solverSpot(replayOf(RIVER_HERO_CALL), step, tree);
			return found.ok ? 'ok' : found.reason;
		};

		it('a preflop decision', () => {
			expect(reason(6)).toBe('preflop');
		});

		it('another player’s action', () => {
			expect(reason(13)).toBe('not-hero');
		});

		it('a blind, or a step that is not there', () => {
			expect(reason(0)).toBe('no-action');
			expect(reason(99)).toBe('no-action');
		});

		it('a street three players saw', () => {
			const found = solverSpot(
				replayOf(THREE_WAY_CBET),
				stepOf(THREE_WAY_CBET, 'flop', 'bet 40'),
				tree
			);
			expect(found.ok).toBe(false);
			expect(!found.ok && found.reason).toBe('multiway');
		});

		it('a hand whose pot does not add up', () => {
			const found = solverSpot(
				replayOf({ ...RIVER_HERO_CALL, pot: '11' }),
				RIVER_CALL,
				tree
			);
			expect(!found.ok && found.reason).toBe('unreconciled');
		});
	});
});

describe('solveEligibility', () => {
	const river = factsOf(handText(RIVER_HERO_CALL));
	const three = factsOf(handText(THREE_WAY_CBET));

	it('allows a heads-up river decision', () => {
		expect(solveEligibility(river, RIVER_CALL, false)).toEqual({ ok: true });
		expect(solveEligibility(river, RIVER_CHECK, false)).toEqual({ ok: true });
	});

	it('refuses what solverSpot refuses', () => {
		const refused = (facts: HandFacts, step: number) => {
			const found = solveEligibility(facts, step, true);
			return found.ok ? 'ok' : found.reason;
		};
		expect(refused(river, 6)).toBe('preflop');
		expect(refused(river, 13)).toBe('not-hero');
		expect(refused(river, 99)).toBe('no-action');
		expect(refused(three, stepOf(THREE_WAY_CBET, 'flop', 'bet 40'))).toBe('multiway');
		expect(refused({ ...river, reconciled: false }, RIVER_CALL)).toBe('unreconciled');
		expect(refused({ ...river, gradeable: false }, RIVER_CALL)).toBe('ungradeable');
	});

	it('asks for threads on a flop and not on a turn', () => {
		const flop = stepOf(RIVER_HERO_CALL, 'flop', 'bet 20');
		const turn = stepOf(RIVER_HERO_CALL, 'turn', 'bet 50');
		const alone = solveEligibility(river, flop, false);
		expect(!alone.ok && alone.reason).toBe('threads');
		expect(!alone.ok && alone.message).toMatch(/several minutes/);
		expect(solveEligibility(river, flop, true)).toEqual({ ok: true });
		expect(solveEligibility(river, turn, false)).toEqual({ ok: true });
	});
});
