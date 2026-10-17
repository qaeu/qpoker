import { describe, expect, it } from 'vitest';

import {
	BUCKET_LADDER,
	BY_STRENGTH,
	MIN_BUCKETS,
	bucketNote,
} from '#utils/solver/buckets';

describe('the bucket ladder', () => {
	it('starts at a bucket a strength and grows coarser', () => {
		expect(BUCKET_LADDER[0]).toBe(BY_STRENGTH);
		for (let i = 1; i < BUCKET_LADDER.length; i++)
			expect(BUCKET_LADDER[i]).toBeLessThan(BUCKET_LADDER[i - 1]);
		expect(MIN_BUCKETS).toBe(BUCKET_LADDER.at(-1));
	});
});

describe('bucketNote', () => {
	it('says nothing of a river solved per hand', () => {
		expect(bucketNote(null)).toBeNull();
	});

	it('names what the buckets merged', () => {
		expect(bucketNote(BY_STRENGTH)).toMatch(/equal strength/);
		expect(bucketNote(25)).toMatch(/at most 25 buckets/);
	});

	it('says when the buckets set the floor it stopped at', () => {
		expect(bucketNote(25)).not.toMatch(/levelled/);
		expect(bucketNote(25, true)).toMatch(/levelled off, above the target/);
	});
});
