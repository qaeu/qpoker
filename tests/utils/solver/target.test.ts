import { describe, expect, it } from 'vitest';

import { LEVEL_WINDOW, levelledOff } from '#utils/solver/target';

describe('levelledOff', () => {
	const chunk = 10;
	const window = LEVEL_WINDOW / chunk;

	it('waits for a whole window before it judges', () => {
		expect(levelledOff(Array<number>(window).fill(1), chunk)).toBe(false);
		expect(levelledOff(Array<number>(window + 1).fill(1), chunk)).toBe(true);
	});

	it('goes on while the dEV still falls', () => {
		const falling = Array.from({ length: 20 }, (_, i) => 10 / (1 + i));
		expect(levelledOff(falling, chunk)).toBe(false);
	});

	it('stops at a floor', () => {
		const floor = Array.from({ length: 30 }, (_, i) => 0.7 + 5 / (1 + i) ** 3);
		expect(levelledOff(floor, chunk)).toBe(true);
	});

	it('judges by the best so far, so a jump up does not reset it', () => {
		expect(levelledOff([5, 1, 1, 1, 1, 1, 1.4], chunk)).toBe(true);
	});
});
