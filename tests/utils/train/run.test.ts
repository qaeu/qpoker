import { describe, expect, it } from 'vitest';

import { DRILL_IDS, DRILL_MODES, questionAt } from '#utils/train/drills';
import { gradeAnswer } from '#utils/train/grade';
import {
	CHOICE_LABELS,
	DRILL_BLURBS,
	DRILL_NAMES,
	formatClock,
	MODE_NAMES,
	responseText,
	scoreEntry,
	type DrillRun,
} from '#utils/train/run';

describe('a train run', () => {
	describe('wording', () => {
		it('names every drill and mode', () => {
			for (const drill of DRILL_IDS) {
				expect(DRILL_NAMES[drill]).not.toBe('');
				expect(DRILL_BLURBS[drill]).toMatch(/\.$|\?$/);
			}
			expect(DRILL_MODES.map((mode) => MODE_NAMES[mode])).toEqual([
				'Easy',
				'Hard',
				'Test',
			]);
		});

		it('reads a clock as minutes and seconds', () => {
			expect(formatClock(0)).toBe('0:00');
			expect(formatClock(9_999)).toBe('0:09');
			expect(formatClock(67_000)).toBe('1:07');
			expect(formatClock(600_000)).toBe('10:00');
		});

		it('prints each kind of answer, and a timeout', () => {
			expect(responseText(null)).toBe('Time');
			expect(responseText({ kind: 'choice', choice: 'bet33' })).toBe('Bet 33%');
			expect(responseText({ kind: 'choice', choice: 'fold' })).toBe(CHOICE_LABELS.fold);
			expect(responseText({ kind: 'band', band: 1 })).toBe('20–40%');
			expect(responseText({ kind: 'estimate', pct: 41.4 })).toBe('41%');
		});
	});

	describe('its score', () => {
		it('counts the right answers and sums the time', () => {
			const records = [0, 1, 2].map((index) => {
				const question = questionAt('cbet', 'easy', 9, index);
				const right = gradeAnswer(question, null, 'easy').right[0];
				const response = {
					kind: 'choice' as const,
					choice: index === 1 ? ('fold' as const) : right,
				};
				return {
					question,
					graded: gradeAnswer(question, response, 'easy'),
					timeMs: 1000.4,
				};
			});
			const run: DrillRun = { drill: 'cbet', mode: 'easy', seed: 9, records };
			const date = new Date(Date.UTC(2026, 9, 21, 12));
			expect(scoreEntry(run, date)).toEqual({
				correct: 2,
				total: 3,
				timeMs: 3001,
				date: '2026-10-21T12:00:00.000Z',
				seed: 9,
			});
		});
	});
});
