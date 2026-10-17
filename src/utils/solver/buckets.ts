/**
 * The rungs of the memory ladder after 16-bit storage: the river's decisions
 * solved per bucket of hands of like strength instead of per hand (the input's
 * `riverBuckets`). Each river board's hands are grouped by showdown strength,
 * adjacent strengths merged into buckets of about equal weight when there are
 * more than the rung allows. The ranges stay whole, and the flop and turn are
 * solved per hand as before. See docs/solver.md.
 */

/** A bucket for every strength: only hands that tie at showdown share a strategy. */
export const BY_STRENGTH = 65534;

/** The bucket counts tried, in order, a player a river board. */
export const BUCKET_LADDER: readonly number[] = [BY_STRENGTH, 50, 25];

/** The coarsest rung: the fewest buckets a solve is given. */
export const MIN_BUCKETS = BUCKET_LADDER[BUCKET_LADDER.length - 1];

/**
 * What the river's buckets were, in words, or null when it was solved per hand;
 * and, when it stopped above its target, that the buckets set that floor.
 */
export function bucketNote(riverBuckets: number | null, levelled = false): string | null {
	if (riverBuckets === null) return null;
	const how =
		riverBuckets >= BY_STRENGTH ?
			'To fit in memory, the river was solved with hands of equal strength grouped: hands that tie at showdown play one strategy there, so their blockers are not told apart.'
		:	`To fit in memory, the river was solved with each board’s hands in at most ${riverBuckets} buckets of like strength: a bucket plays one strategy there, so hands close in strength, and their blockers, are not told apart.`;
	return levelled ?
			`${how} It stopped where that levelled off, above the target dEV: the buckets leave a best response that much.`
		:	how;
}
