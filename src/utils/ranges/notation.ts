/**
 * The range shorthand the charts are written in, and back again.
 *
 *   `77`         one class            `AKs` `AKo` `AK` (both)
 *   `77+`        that pair and up     `ATs+` kicker up to just under the ace
 *   `99-66`      a run of pairs       `KJs-K7s` a run of kickers
 *   `T9s:0.5`    any token, at a frequency
 *
 * Later tokens overwrite earlier ones, so `A2s+,A5s:0.5` reads as written.
 */

import { RANK_CHARS } from '../cards/cards';
import { CLASS_COUNT, classIndex, className } from '../cards/combos';
import { emptyRange, type Range, type Strategy } from './range';

const rank = (char: string): number => RANK_CHARS.indexOf(char.toUpperCase());

/** The classes one token (without its weight) names. Throws on a bad token. */
function expand(token: string): number[] {
	const fail = (): never => {
		throw new Error(`Bad range token: "${token}"`);
	};
	const hand = /^([2-9TJQKA])([2-9TJQKA])([so]?)$/i;
	const classesOf = (hi: number, lo: number, suit: string): number[] =>
		hi === lo ? [classIndex(hi, lo, false)]
		: suit === '' ? [classIndex(hi, lo, true), classIndex(hi, lo, false)]
		: [classIndex(hi, lo, suit.toLowerCase() === 's')];

	const span = token.split('-');
	if (span.length === 2) {
		const from = hand.exec(span[0]);
		const to = hand.exec(span[1]);
		if (!from || !to || from[3].toLowerCase() !== to[3].toLowerCase()) return fail();
		const [a1, a2, b1, b2] = [rank(from[1]), rank(from[2]), rank(to[1]), rank(to[2])];
		const out: number[] = [];
		if (a1 === a2 && b1 === b2) {
			for (let r = Math.min(a1, b1); r <= Math.max(a1, b1); r++) {
				out.push(...classesOf(r, r, ''));
			}
			return out;
		}
		if (a1 !== b1 || a1 === a2 || b1 === b2) return fail();
		for (let r = Math.min(a2, b2); r <= Math.max(a2, b2); r++) {
			out.push(...classesOf(a1, r, from[3]));
		}
		return out;
	}

	const plus = token.endsWith('+');
	const match = hand.exec(plus ? token.slice(0, -1) : token);
	if (!match) return fail();
	const hi = rank(match[1]);
	const lo = rank(match[2]);
	if (hi < lo) return fail();
	if (!plus) return classesOf(hi, lo, match[3]);
	const out: number[] = [];
	if (hi === lo) {
		for (let r = hi; r <= 12; r++) out.push(...classesOf(r, r, ''));
	} else {
		for (let r = lo; r < hi; r++) out.push(...classesOf(hi, r, match[3]));
	}
	return out;
}

/** `"22+,A2s+,KTo+,T9s:0.5"` -> a weighted range. */
export function parseRange(text: string): Range {
	const range = emptyRange();
	for (const part of text.split(',')) {
		const item = part.trim();
		if (item === '') continue;
		const [token, weightText] = item.split(':');
		const weight = weightText === undefined ? 1 : Number(weightText);
		if (!(weight >= 0 && weight <= 1)) throw new Error(`Bad range weight: "${item}"`);
		for (const cls of expand(token.trim())) range[cls] = weight;
	}
	return range;
}

/**
 * Builds a strategy from its two ranges. Where they overlap the raise is kept
 * whole and the call takes what is left, so a chart can list a broad calling
 * range and carve the raises out of it.
 */
export function parseStrategy(raise: string, call: string): Strategy {
	const raises = parseRange(raise);
	const calls = parseRange(call);
	for (let cls = 0; cls < CLASS_COUNT; cls++) {
		calls[cls] = Math.min(calls[cls], 1 - raises[cls]);
	}
	return { raise: raises, call: calls };
}

/** A range as a flat list, one token per class. Parses back to the same range. */
export function formatRange(range: Range): string {
	const parts: string[] = [];
	for (let cls = 0; cls < CLASS_COUNT; cls++) {
		if (range[cls] <= 0) continue;
		const weight = Math.round(range[cls] * 100) / 100;
		parts.push(weight === 1 ? className(cls) : `${className(cls)}:${weight}`);
	}
	return parts.join(',');
}
