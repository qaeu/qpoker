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
