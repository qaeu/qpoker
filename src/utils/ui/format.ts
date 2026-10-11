/** Display formatting shared by the views. */

import { MIN_SAMPLE } from '../coach/session';

/** `0.42` -> `42%`; null -> an em dash. */
export function percent(value: number | null): string {
	return value === null ? '—' : `${Math.round(value * 100)}%`;
}

/** A signed figure with a real minus sign, and no sign on a zero. */
export function signed(value: number, digits = 1): string {
	const fixed = Math.abs(value).toFixed(digits);
	if (Number(fixed) === 0) return fixed;
	return `${value < 0 ? '−' : '+'}${fixed}`;
}

/** Cents as big blinds, to a decimal place where one is needed: `25` at 10 -> `2.5`. */
export function bbText(cents: number, bigBlind: number): string {
	const bb = cents / (bigBlind || 1);
	return Number.isInteger(bb) ? String(bb) : bb.toFixed(1);
}

/** `2026-10-06T03:37:57` -> `2026-10-06 03:37`. */
export function shortTime(timestamp: string): string {
	return timestamp.replace('T', ' ').slice(0, 16);
}

/**
 * Colours a signed figure by its direction. A bare state class rather than a
 * BEM one, so every block can scope the colours itself.
 */
export function signClass(value: number): string | undefined {
	if (value > 0) return 'is-positive';
	if (value < 0) return 'is-negative';
	return undefined;
}

/** What each direction of a leak is called: a frequency is high, a range is wide. */
export interface LeakWords {
	high: string;
	low: string;
}

/**
 * How a frequency reads against its baseline. A sample too small to flag is
 * said to be so, which is not the same as reading clean: display only, the
 * engine's `leak` is what decides.
 */
export function readingOf(
	leak: 'high' | 'low' | null,
	opportunities: number,
	words: LeakWords = { high: 'too high', low: 'too low' }
): string {
	if (leak) return words[leak];
	return opportunities < MIN_SAMPLE ? 'too few to say' : '';
}
