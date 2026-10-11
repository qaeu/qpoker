import { describe, expect, it } from 'vitest';

import { MIN_SAMPLE } from '#utils/coach/session';
import { readingOf } from '#utils/ui/format';

describe('readingOf', () => {
	it('names the direction of a leak', () => {
		expect(readingOf('high', 40)).toBe('too high');
		expect(readingOf('low', 40)).toBe('too low');
	});

	it('takes the words a view has for the two directions', () => {
		const words = { high: 'too wide', low: 'too tight' };
		expect(readingOf('high', 40, words)).toBe('too wide');
		expect(readingOf('low', 40, words)).toBe('too tight');
	});

	it('says a small sample is one, rather than reading it clean', () => {
		expect(readingOf(null, MIN_SAMPLE - 1)).toBe('too few to say');
		expect(readingOf(null, 0)).toBe('too few to say');
	});

	it('says nothing of a frequency that is where it should be', () => {
		expect(readingOf(null, MIN_SAMPLE)).toBe('');
		expect(readingOf(null, 400)).toBe('');
	});
});
