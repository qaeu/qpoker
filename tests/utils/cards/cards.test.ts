import { describe, it, expect } from 'vitest';

import { cardsText, deckWithout, parseCard, parseCards } from '#utils/cards/cards';
import {
	classFromName,
	className,
	classOf,
	classSize,
	COMBOS,
	comboIndex,
	combosOfClass,
} from '#utils/cards/combos';
import { emptyComboRange, equityVsRange, equityVsRanges } from '#utils/cards/equity';
import { categoryName, evaluate } from '#utils/cards/evaluate';

const score = (text: string) => evaluate(parseCards(text));

describe('cards', () => {
	it('round-trips text', () => {
		expect(cardsText(parseCards('Kd Ks'))).toBe('Kd Ks');
		expect(cardsText(parseCards('2cAh'))).toBe('2c Ah');
	});

	it('rejects what is not a card', () => {
		expect(() => parseCard('1x')).toThrow();
	});

	it('removes dead cards from the deck', () => {
		expect(deckWithout(parseCards('As Kd'))).toHaveLength(50);
	});
});

describe('evaluating a hand', () => {
	it('names each category', () => {
		expect(categoryName(score('As Ks Qs Js Ts 2d 3c'))).toBe('straight flush');
		expect(categoryName(score('As Ad Ah Ac 2d 3c 4s'))).toBe('four of a kind');
		expect(categoryName(score('As Ad Ah 2c 2d 3c 4s'))).toBe('full house');
		expect(categoryName(score('As 2s 9s 7s 3s 3c 4d'))).toBe('flush');
		expect(categoryName(score('5d 4c 3s 2h Ad 9c 9d'))).toBe('straight');
		expect(categoryName(score('As Ad Ah 7c 2d 3c 9s'))).toBe('three of a kind');
		expect(categoryName(score('As Ad 7h 7c 2d 3c 9s'))).toBe('two pair');
		expect(categoryName(score('As Ad 7h Kc 2d 3c 9s'))).toBe('pair');
		expect(categoryName(score('As Qd 7h Kc 2d 3c 9s'))).toBe('high card');
	});

	it('orders the categories', () => {
		const ladder = [
			'As Qd 7h Kc 2d 3c 9s',
			'2s 2d 7h Kc 4d 3c 9s',
			'2s 2d 3h 3c 4d 8c 9s',
			'2s 2d 2h Kc 4d 3c 9s',
			'5d 4c 3s 2h Ad 9c 9d',
			'As 2s 9s 7s 3s 3c 4d',
			'2s 2d 2h 3c 3d 8c 9s',
			'2s 2d 2h 2c 3d 8c 9s',
			'6s 5s 4s 3s 2s 2d 2c',
		].map(score);
		expect(ladder).toEqual([...ladder].sort((a, b) => a - b));
	});

	it('breaks ties on kickers, and only on the best five cards', () => {
		expect(score('As Kd 7h 7c 2d 3c 9s')).toBeGreaterThan(score('As Qd 7h 7c 2d 3c 9s'));
		// The sixth card does not play: both hands are aces up with a king.
		expect(score('As Ad Kh Kc Qd 3c 2s')).toBe(score('Ah Ac Ks Kd Qc 5c 4s'));
		// The wheel is the lowest straight.
		expect(score('5d 4c 3s 2h Ad Kc Qd')).toBeLessThan(score('6d 5c 4s 3h 2d Kc Qd'));
	});

	it('scores five and six cards too', () => {
		expect(categoryName(score('As Ad 7h 7c 2d'))).toBe('two pair');
		expect(categoryName(score('As Ks Qs Js Ts 2d'))).toBe('straight flush');
	});
});

describe('combos and classes', () => {
	it('indexes all 1326 combos consistently', () => {
		expect(COMBOS).toHaveLength(1326);
		expect(COMBOS.every((combo, i) => comboIndex(combo.a, combo.b) === i)).toBe(true);
		expect(COMBOS.every((combo, i) => comboIndex(combo.b, combo.a) === i)).toBe(true);
	});

	it('names and sizes all 169 classes', () => {
		let total = 0;
		for (let cls = 0; cls < 169; cls++) {
			expect(classFromName(className(cls))).toBe(cls);
			expect(combosOfClass(cls)).toHaveLength(classSize(cls));
			total += classSize(cls);
		}
		expect(total).toBe(1326);
	});

	it('classifies concrete cards', () => {
		const [a, b] = parseCards('Kd As');
		expect(className(classOf(a, b))).toBe('AKo');
		expect(className(classOf(...(parseCards('7h 7c') as [number, number])))).toBe('77');
		expect(className(classOf(...(parseCards('9s Ts') as [number, number])))).toBe('T9s');
		expect(classFromName('AKx')).toBe(-1);
		expect(classFromName('77s')).toBe(-1);
	});
});

describe('equity', () => {
	const rangeOf = (...names: string[]) => {
		const range = emptyComboRange();
		for (const name of names) {
			for (const combo of combosOfClass(classFromName(name))) {
				range[comboIndex(combo.a, combo.b)] = 1;
			}
		}
		return range;
	};
	const options = { samples: 4000, seed: 7 };

	it('matches the well-known preflop match-ups', () => {
		const aces = equityVsRange(parseCards('As Ad'), [], rangeOf('KK'), options);
		expect(aces.equity).toBeCloseTo(0.82, 1);
		const flip = equityVsRange(parseCards('As Ks'), [], rangeOf('QQ'), options);
		expect(flip.equity).toBeCloseTo(0.46, 1);
	});

	it('is exact with one card to come', () => {
		// A flush draw and two overcards against top pair: 9 + 6 outs of 44.
		const draw = equityVsRange(
			parseCards('As Ks'),
			parseCards('Qs 7s 2d 3c'),
			rangeOf('QJo')
		);
		const live = COMBOS.filter(
			(combo) =>
				className(combo.cls) === 'QJo'
				&& ![combo.a, combo.b].some((card) => parseCards('Qs').includes(card))
		);
		expect(live.length).toBe(9);
		expect(draw.equity).toBeGreaterThan(0.3);
		expect(draw.equity).toBeLessThan(0.36);
	});

	it('is exact on the river and splits ties', () => {
		const board = parseCards('Ah Kh Qh Jh Th');
		expect(equityVsRange(parseCards('2c 2d'), board, rangeOf('33'))).toEqual({
			equity: 0.5,
			win: 0,
			tie: 1,
		});
		const nuts = equityVsRange(
			parseCards('As Ad'),
			parseCards('Ah 7c 2d 9s 3c'),
			rangeOf('KK')
		);
		expect(nuts.equity).toBe(1);
	});

	it('is reproducible from its seed', () => {
		const run = () =>
			equityVsRange(
				parseCards('Jh Td'),
				parseCards('9s 8c 2d'),
				rangeOf('AA', 'KK'),
				options
			);
		expect(run()).toEqual(run());
	});

	it('ignores combos that hold a dead card', () => {
		// Hero holds two aces; the remaining pair of aces is the only AA combo.
		const result = equityVsRange(
			parseCards('As Ad'),
			parseCards('Ah Ac 2d 7s 9c'),
			rangeOf('AA')
		);
		expect(result).toEqual({ equity: 0.5, win: 0, tie: 0 });
	});

	it('falls against more opponents', () => {
		const hero = parseCards('As Ad');
		const one = equityVsRanges(hero, [], [rangeOf('KK')], options).equity;
		const two = equityVsRanges(hero, [], [rangeOf('KK'), rangeOf('QQ')], options).equity;
		expect(two).toBeLessThan(one);
		expect(two).toBeGreaterThan(0.6);
		expect(equityVsRanges(hero, [], [], options).equity).toBe(1);
	});
});
