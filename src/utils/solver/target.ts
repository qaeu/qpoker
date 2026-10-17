/**
 * How deep a solve runs: it stops once its exploitability (dEV, the most a
 * best response gains against it) is under this share of the street's starting
 * pot, or at the iteration cap. See docs/solver.md.
 */

/** A solve stops at this many iterations, or at the target, whichever comes first. */
export const MAX_ITERATIONS = 1000;

/** Percent of the pot. */
export const DEFAULT_TARGET_PCT = 0.5;
export const MIN_TARGET_PCT = 0.05;
export const MAX_TARGET_PCT = 10;

/** Why a target can't be used, or null. */
export function targetProblem(pct: number): string | null {
	return Number.isFinite(pct) && pct >= MIN_TARGET_PCT && pct <= MAX_TARGET_PCT ?
			null
		:	`The target dEV must be from ${MIN_TARGET_PCT}% to ${MAX_TARGET_PCT}% of the pot.`;
}

/** Iterations over which a bucketed solve must still improve to go on. */
export const LEVEL_WINDOW = 50;
/** The share of its best dEV it must have gained over that window. */
export const LEVEL_GAIN = 0.05;

/**
 * Whether a solve has levelled off: its best dEV is less than `LEVEL_GAIN`
 * better than its best `LEVEL_WINDOW` iterations ago. `history` is the dEV
 * after each chunk of `chunk` iterations. A river in buckets has a floor above
 * an exact solve's, often over the target, and this ends it there.
 */
export function levelledOff(history: readonly number[], chunk: number): boolean {
	const back = Math.round(LEVEL_WINDOW / chunk);
	if (history.length <= back) return false;
	const best = Math.min(...history);
	const before = Math.min(...history.slice(0, history.length - back));
	return best > before * (1 - LEVEL_GAIN);
}
