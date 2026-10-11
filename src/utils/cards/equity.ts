/**
 * Showdown equity: the share of the pot a hand wins against a range, or
 * several, if the rest of the board runs out with no more betting.
 *
 * Against one range the opponent's combos are always enumerated in full, and
 * the board is enumerated too when one card or none is left to come. With more
 * cards to come, or more than one opponent, the runouts are sampled from a
 * seeded stream, so a result is reproducible to the last digit.
 */

import { mulberry32 } from '../app/rng';
import { deckWithout, type Card } from './cards';
import { COMBO_COUNT, COMBOS } from './combos';
import { evaluate } from './evaluate';

/** A weight per combo, indexed as `COMBOS`. Zero means not in the range. */
export type ComboRange = Float64Array;

export interface EquityOptions {
	/** Runouts sampled when the board cannot be enumerated. */
	samples?: number;
	seed?: number;
}

export interface Equity {
	/** Win share plus half the tie share, 0 to 1. */
	equity: number;
	win: number;
	tie: number;
}

const DEFAULT_SAMPLES = 300;
const DEFAULT_SEED = 0x51ed;

export const emptyComboRange = (): ComboRange => new Float64Array(COMBO_COUNT);

/** Zeroes every combo that holds a dead card. Returns a new range. */
export function removeDead(range: ComboRange, dead: readonly Card[]): ComboRange {
	const gone = new Set(dead);
	const live = new Float64Array(range);
	for (let i = 0; i < COMBO_COUNT; i++) {
		if (live[i] > 0 && (gone.has(COMBOS[i].a) || gone.has(COMBOS[i].b))) live[i] = 0;
	}
	return live;
}

export const rangeWeight = (range: ComboRange): number => {
	let total = 0;
	for (let i = 0; i < COMBO_COUNT; i++) total += range[i];
	return total;
};

/** Every completion of `board` to five cards, or `samples` random ones. */
function runouts(
	board: readonly Card[],
	deck: readonly Card[],
	samples: number,
	random: () => number
): Card[][] {
	const missing = 5 - board.length;
	if (missing === 0) return [[]];
	if (missing === 1) return deck.map((card) => [card]);
	const out: Card[][] = [];
	if (missing === 2 && samples >= (deck.length * (deck.length - 1)) / 2) {
		for (let i = 0; i < deck.length; i++) {
			for (let j = i + 1; j < deck.length; j++) out.push([deck[i], deck[j]]);
		}
		return out;
	}
	for (let n = 0; n < samples; n++) {
		const picked: Card[] = [];
		while (picked.length < missing) {
			const card = deck[Math.floor(random() * deck.length)];
			if (!picked.includes(card)) picked.push(card);
		}
		out.push(picked);
	}
	return out;
}

/** Equity of two hole cards against one weighted range. */
export function equityVsRange(
	hero: readonly Card[],
	board: readonly Card[],
	villain: ComboRange,
	options: EquityOptions = {}
): Equity {
	const random = mulberry32(options.seed ?? DEFAULT_SEED);
	const live = removeDead(villain, [...hero, ...board]);
	const active: number[] = [];
	for (let i = 0; i < COMBO_COUNT; i++) if (live[i] > 0) active.push(i);

	const deck = deckWithout([...hero, ...board]);
	const seven: Card[] = new Array(7);
	let win = 0;
	let tie = 0;
	let total = 0;

	for (const runout of runouts(board, deck, options.samples ?? DEFAULT_SAMPLES, random)) {
		const full = [...board, ...runout];
		for (let i = 0; i < 5; i++) seven[i] = full[i];
		seven[5] = hero[0];
		seven[6] = hero[1];
		const mine = evaluate(seven);
		for (const index of active) {
			const { a, b } = COMBOS[index];
			if (runout.includes(a) || runout.includes(b)) continue;
			seven[5] = a;
			seven[6] = b;
			const theirs = evaluate(seven);
			const weight = live[index];
			total += weight;
			if (mine > theirs) win += weight;
			else if (mine === theirs) tie += weight;
		}
	}

	if (total === 0) return { equity: 0.5, win: 0, tie: 0 };
	return { equity: (win + tie / 2) / total, win: win / total, tie: tie / total };
}

/** A range's live combos with their running weight, for drawing one by weight. */
interface Sampler {
	combos: number[];
	cumulative: number[];
	total: number;
}

function samplerOf(range: ComboRange, dead: Set<Card>): Sampler {
	const combos: number[] = [];
	const cumulative: number[] = [];
	let total = 0;
	for (let i = 0; i < COMBO_COUNT; i++) {
		if (range[i] > 0 && !dead.has(COMBOS[i].a) && !dead.has(COMBOS[i].b)) {
			total += range[i];
			combos.push(i);
			cumulative.push(total);
		}
	}
	return { combos, cumulative, total };
}

function sampleCombo(sampler: Sampler, random: () => number): number {
	const target = random() * sampler.total;
	let low = 0;
	let high = sampler.combos.length - 1;
	while (low < high) {
		const mid = (low + high) >> 1;
		if (sampler.cumulative[mid] > target) high = mid;
		else low = mid + 1;
	}
	return sampler.combos[low];
}

/** Deals that clash are redrawn, this many times over before giving up. */
const MAX_REDRAWS = 20;

/**
 * Equity against any number of ranges at once, by simulation. Every opponent's
 * hand is drawn from their own range and a deal where two hands share a card
 * is thrown away, which is the joint distribution; drawing them one after
 * another is not. A tie counts for the share of the pot it wins.
 */
export function equityVsRanges(
	hero: readonly Card[],
	board: readonly Card[],
	villains: readonly ComboRange[],
	options: EquityOptions = {}
): Equity {
	if (villains.length === 0) return { equity: 1, win: 1, tie: 0 };
	if (villains.length === 1) return equityVsRange(hero, board, villains[0], options);

	const random = mulberry32(options.seed ?? DEFAULT_SEED);
	const samples = (options.samples ?? DEFAULT_SAMPLES) * 10;
	const seven: Card[] = new Array(7);
	let win = 0;
	let tie = 0;
	let share = 0;
	let total = 0;

	const known = new Set<Card>([...hero, ...board]);
	const samplers = villains.map((range) => samplerOf(range, known));
	if (samplers.some((sampler) => sampler.total === 0)) {
		return { equity: 0.5, win: 0, tie: 0 };
	}
	const hands: number[] = new Array(villains.length);

	for (let n = 0; n < samples * MAX_REDRAWS && total < samples; n++) {
		const dead = new Set<Card>(known);
		let clash = false;
		for (let v = 0; v < samplers.length && !clash; v++) {
			const index = sampleCombo(samplers[v], random);
			const { a, b } = COMBOS[index];
			clash = dead.has(a) || dead.has(b);
			hands[v] = index;
			dead.add(a);
			dead.add(b);
		}
		if (clash) continue;

		const full = [...board];
		while (full.length < 5) {
			const card = Math.floor(random() * 52);
			if (!dead.has(card)) {
				dead.add(card);
				full.push(card);
			}
		}
		for (let i = 0; i < 5; i++) seven[i] = full[i];
		seven[5] = hero[0];
		seven[6] = hero[1];
		const mine = evaluate(seven);
		let best = 0;
		let equal = 0;
		for (const index of hands) {
			seven[5] = COMBOS[index].a;
			seven[6] = COMBOS[index].b;
			const theirs = evaluate(seven);
			if (theirs > best) best = theirs;
			if (theirs === mine) equal++;
		}
		total++;
		if (mine > best) {
			win++;
			share++;
		} else if (mine === best) {
			tie++;
			share += 1 / (equal + 1);
		}
	}

	if (total === 0) return { equity: 0.5, win: 0, tie: 0 };
	return { equity: share / total, win: win / total, tie: tie / total };
}
