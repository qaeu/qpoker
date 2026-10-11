/** Display formatting shared by the views. */

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
