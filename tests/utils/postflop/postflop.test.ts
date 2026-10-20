import { describe, it, expect } from 'vitest';

import { parseCards } from '#utils/cards/cards';
import { classFromName, COMBOS, comboIndex, combosOfClass } from '#utils/cards/combos';
import { rangeWeight, removeDead } from '#utils/cards/equity';
import {
	describeDraws,
	describeHand,
	drawsOf,
	drawStrength,
} from '#utils/postflop/handClass';
import { priceCall, realisation, type CallSpot } from '#utils/postflop/decision';
import { textureOf } from '#utils/postflop/texture';
import {
	applyAction,
	rankRange,
	responseToBet,
	standingIn,
} from '#utils/postflop/villainRange';
import { chart } from '#utils/ranges/charts';
import { toComboRange } from '#utils/ranges/range';

const cards = parseCards;

describe('describing a hand', () => {
	it('names the made hand', () => {
		expect(describeHand(cards('As Kd'), cards('Ah 7c 2d'))).toBe('top pair');
		expect(describeHand(cards('7s 6s'), cards('Ah 7c 2d'))).toBe('second pair');
		expect(describeHand(cards('Kc Kd'), cards('Qh 7c 2d'))).toBe('an overpair');
		expect(describeHand(cards('3c 3d'), cards('Qh 7c 5d'))).toBe('an underpair');
		expect(describeHand(cards('7s 7d'), cards('Ah 7c 2d'))).toBe('a set');
		expect(describeHand(cards('As 7d'), cards('Ah 7c 2d'))).toBe('two pair');
		expect(describeHand(cards('Kh Qh'), cards('Ah 7h 2h'))).toBe('a flush');
		expect(describeHand(cards('Kc Qd'), cards('Jh 7c 2d'))).toBe('no pair');
		expect(describeHand(cards('Ac Qd'), cards('Jh 7c 2d'))).toBe('ace high');
		expect(describeHand(cards('Kc Qd'), cards('Jh Jc 2d'))).toBe('only the board');
	});

	it('finds the draws that need a hole card', () => {
		expect(drawsOf(cards('Ah Kh'), cards('Qh 7h 2d'))).toMatchObject({ flushDraw: true });
		expect(drawsOf(cards('Jc Td'), cards('9h 8s 2d'))).toMatchObject({ openEnded: true });
		expect(drawsOf(cards('Jc Td'), cards('9h 7s 2d'))).toMatchObject({ gutshot: true });
		expect(describeDraws(cards('Jh Th'), cards('9h 8h 2d'))).toBe(
			'a flush draw and an open-ended straight draw'
		);
		// Four to a flush on the board is not this hand's draw without a card of the suit.
		expect(drawsOf(cards('Ac Kd'), cards('Qh 7h 2h 3h')).flushDraw).toBe(false);
		// Nothing is drawing on the river.
		expect(drawStrength(cards('Ah Kh'), cards('Qh 7h 2d 3c 9s'))).toBe(0);
		expect(drawStrength(cards('Ah Kh'), cards('Qh 7h 2d'))).toBe(2);
	});
});

describe('board texture', () => {
	it('bets small on dry boards and bigger on wet ones', () => {
		const dry = textureOf(cards('Kd 7s 2c'));
		expect(dry).toMatchObject({ wet: false, paired: false, betSize: 0.33 });
		expect(dry.label).toBe('a K-high, rainbow');
		expect(textureOf(cards('Ah 7h 4h')).label).toBe('an A-high, monotone');
		const wet = textureOf(cards('Jh Th 9c'));
		expect(wet).toMatchObject({
			wet: true,
			twoTone: true,
			connected: true,
			betSize: 0.66,
		});
		expect(textureOf(cards('8h 8c 3d')).paired).toBe(true);
		expect(textureOf(cards('Ah 7h 4h')).monotone).toBe(true);
		expect(textureOf(cards('Ad 5s 3c')).connected).toBe(true);
	});

	it('calls a board monotone only when every card shares a suit', () => {
		expect(textureOf(cards('Ah 7h 4h'))).toMatchObject({
			monotone: true,
			flushPossible: true,
		});
		// A two-tone flop whose third heart comes on the river.
		const backdoor = textureOf(cards('Kh 7h 4c 2d 9h'));
		expect(backdoor).toMatchObject({ monotone: false, flushPossible: true, wet: true });
		expect(backdoor.label).toBe('a K-high, three to a flush');
		expect(textureOf(cards('Kh 8h 4h 2h Jc')).label).toBe('a K-high, four to a flush');
	});
});

describe('the opponent model', () => {
	const board = cards('Kd 7s 2c');
	const opener = removeDead(toComboRange(chart('rfiBtn').raise), board);
	const indexOf = (text: string) => comboIndex(...(cards(text) as [number, number]));
	const share = (range: Float64Array, test: (index: number) => boolean) => {
		let hit = 0;
		for (let i = 0; i < COMBOS.length; i++) if (test(i)) hit += range[i];
		return hit / rangeWeight(range);
	};

	it('ranks a range from its worst hand to its best', () => {
		const view = rankRange(opener, board);
		expect(view.percentile[indexOf('Ks Kh')]).toBeGreaterThan(0.98);
		expect(view.percentile[indexOf('As Kh')]).toBeGreaterThan(
			view.percentile[indexOf('Ks 9s')]
		);
		expect(view.percentile[indexOf('5s 4s')]).toBeLessThan(0.2);
		// A hand outside the range has no standing.
		expect(view.percentile[indexOf('7h 2d')]).toBe(0);
	});

	it('keeps strength and some air when a range bets', () => {
		const view = rankRange(opener, board);
		const strong = (i: number) => view.percentile[i] > 0.75;
		const middling = (i: number) => view.percentile[i] > 0.35 && view.percentile[i] < 0.6;
		const bet = applyAction(opener, board, 'bet', 0.75);
		expect(share(bet, strong)).toBeGreaterThan(share(opener, strong) + 0.1);
		// Polarised: the middle of the range mostly checks.
		expect(share(bet, middling)).toBeLessThan(share(opener, middling) / 3);
		// Balanced, not face-up: the bottom of the range still bets sometimes.
		expect(bet[indexOf('5s 4s')]).toBeGreaterThan(0);
		expect(rangeWeight(bet)).toBeLessThan(rangeWeight(opener));
	});

	it('gives a raise the bluffs its size asks for, draws included', () => {
		const turn = cards('Ah Kh 5c 2d');
		const range = removeDead(toComboRange(chart('rfiBtn').raise), turn);
		const view = rankRange(range, turn);
		const raised = applyAction(range, turn, 'raise', 0.75);
		// A bluff is air, or a draw below the top tenth a raise is made of for value.
		const bluff = (i: number) =>
			view.percentile[i] < 0.9 && (view.draws[i] > 0 || view.percentile[i] < 0.3);
		// size / (1 + 2 × size), and 15% more for the card to come.
		expect(share(raised, bluff)).toBeCloseTo((0.75 / 2.5) * 1.15, 2);
	});

	it('sheds strength when a range checks, and the bottom when it calls', () => {
		const view = rankRange(opener, board);
		const strong = (i: number) => view.percentile[i] > 0.75;
		const weak = (i: number) => opener[i] > 0 && view.percentile[i] < 0.3;
		expect(share(applyAction(opener, board, 'check', 0), strong)).toBeLessThan(
			share(opener, strong)
		);
		expect(share(applyAction(opener, board, 'call', 0.75), weak)).toBeLessThan(
			share(opener, weak) / 2
		);
	});

	it('folds more of a range to a bigger bet, about as theory asks', () => {
		const small = responseToBet(opener, board, 0.33).foldShare;
		const pot = responseToBet(opener, board, 1).foldShare;
		expect(pot).toBeGreaterThan(small);
		// Minimum defence against a pot-sized bet is half the range.
		expect(pot).toBeGreaterThan(0.35);
		expect(pot).toBeLessThan(0.6);
	});

	it('places a hand within a range', () => {
		expect(standingIn(opener, cards('Ks Kh'), board)).toBeGreaterThan(0.97);
		expect(standingIn(opener, cards('4s 3s'), board)).toBeLessThan(0.1);
		const kings = combosOfClass(classFromName('KK'));
		expect(kings).toHaveLength(6);
	});
});

describe('pricing a call', () => {
	// A half-pot river bet into 10: 15 in the middle, 5 to call.
	const river: CallSpot = {
		equity: 0.5,
		pot: 15,
		call: 5,
		uncovered: 0,
		inPosition: false,
		cardsToCome: 0,
		allIn: false,
		strongDraw: false,
		behind: 50,
		rake: 0,
	};

	describe('on the river', () => {
		it('sets the equity against the pot it plays for', () => {
			const price = priceCall(river);
			expect(price.stake).toBe(20);
			expect(price.potOdds).toBeCloseTo(0.25);
			expect(price.callEv).toBeCloseTo(5);
			expect(price.band).toBeCloseTo(1.4);
		});

		it('is worth nothing at exactly the pot odds', () => {
			expect(priceCall({ ...river, equity: 0.25 }).callEv).toBeCloseTo(0);
		});

		it('takes the rake out of what is won', () => {
			expect(priceCall({ ...river, rake: 0.05 }).callEv).toBeCloseTo(4.5);
		});

		it('plays only for the part of a bet the hero covers', () => {
			const price = priceCall({ ...river, pot: 20, uncovered: 5 });
			expect(price.stake).toBe(20);
			expect(price.potOdds).toBeCloseTo(0.25);
		});
	});

	describe('with cards to come', () => {
		const turn: CallSpot = { ...river, cardsToCome: 1 };

		it('discounts the equity out of position', () => {
			expect(priceCall(turn).callEv).toBeCloseTo(0.9 * 0.5 * 20 - 5);
			expect(priceCall({ ...turn, inPosition: true }).callEv).toBeCloseTo(5);
		});

		it('realises it all when the call is all-in', () => {
			expect(priceCall({ ...turn, allIn: true }).callEv).toBeCloseTo(5);
		});

		it('pays a strong draw again only with a pot behind', () => {
			const draw = { ...turn, inPosition: true, strongDraw: true };
			expect(priceCall(draw).callEv).toBeCloseTo(1.05 * 0.5 * 20 - 5);
			expect(priceCall({ ...draw, behind: 10 }).callEv).toBeCloseTo(5);
			expect(priceCall({ ...draw, allIn: true }).callEv).toBeCloseTo(5);
		});
	});

	describe('realisation', () => {
		it('is whole on the river, and less out of position', () => {
			expect(realisation(false, 0)).toBe(1);
			expect(realisation(true, 1)).toBe(1);
			expect(realisation(true, 2)).toBe(0.95);
			expect(realisation(false, 1)).toBe(0.9);
			expect(realisation(false, 2)).toBe(0.8);
		});
	});
});
