import { describe, expect, it } from 'vitest';

import { parseCards } from '#utils/cards/cards';
import { CLASS_COUNT, classFromName } from '#utils/cards/combos';
import { MIX_FLOOR } from '#utils/coach/grade';
import { frequencyOf, type PreflopChoice } from '#utils/ranges/range';
import { tableStrategy, type TableId } from '#utils/ui/rangeTables';
import type {
	CbetQuestion,
	Choice,
	EquityQuestion,
	PotOddsQuestion,
	PreflopQuestion,
} from '#utils/train/drills';
import { gradeAnswer, type Response } from '#utils/train/grade';

const choose = (choice: Choice): Response => ({ kind: 'choice', choice });

function preflop(table: TableId, hand: string, free = false): PreflopQuestion {
	return {
		drill: 'preflop',
		hero: [],
		board: [],
		label: '',
		table,
		depth: 'deep',
		cls: classFromName(hand),
		free,
	};
}

const potOdds = (callEvBb: number): PotOddsQuestion => ({
	drill: 'potOdds',
	hero: parseCards('Ah Kd'),
	board: parseCards('Qs 7d 2c 4h'),
	label: '',
	potBb: 10,
	betBb: 5,
	inPosition: false,
	villainLabel: '',
	potOdds: 0.25,
	equity: 0.34,
	callEvBb,
});

const equity = (share: number): EquityQuestion => ({
	drill: 'equity',
	hero: parseCards('Ah Kd'),
	board: parseCards('Qs 7d 2c'),
	label: '',
	villainLabel: '',
	equity: share,
});

const cbet = (size: number): CbetQuestion => ({
	drill: 'cbet',
	hero: parseCards('Ah Kd'),
	board: parseCards('Ks 7d 2c'),
	label: '',
	potBb: 5.5,
	size,
	texture: 'a K-high, rainbow',
});

describe('grading a train answer', () => {
	describe('preflop', () => {
		it('takes every action the chart plays at the mix floor', () => {
			for (const table of ['rfiUtg', 'bbVsUtg', 'btnVsCo'] as const) {
				const strategy = tableStrategy(table, 'deep');
				for (let cls = 0; cls < CLASS_COUNT; cls++) {
					const question = { ...preflop(table, 'AA'), cls };
					for (const choice of ['raise', 'call', 'fold'] as PreflopChoice[]) {
						const played = frequencyOf(strategy, cls, choice) >= MIX_FLOOR;
						expect(gradeAnswer(question, choose(choice), 'easy').correct).toBe(played);
					}
				}
			}
		});

		it('takes either half of a mixed hand', () => {
			// UTG opens ATo half the time.
			const question = preflop('rfiUtg', 'ATo');
			expect(gradeAnswer(question, choose('raise'), 'easy').correct).toBe(true);
			expect(gradeAnswer(question, choose('fold'), 'easy').correct).toBe(true);
			const graded = gradeAnswer(question, choose('call'), 'easy');
			expect(graded.correct).toBe(false);
			expect(graded.right).toEqual(['raise', 'fold']);
			expect(graded.answer).toBe('Raise or fold');
			expect(graded.verdict).toBe('UTG with ATo: raise 50%, fold 50%');
		});

		it('names a pure action alone', () => {
			const graded = gradeAnswer(preflop('rfiBtn', 'AA'), choose('fold'), 'hard');
			expect(graded).toMatchObject({ correct: false, right: ['raise'], answer: 'Raise' });
			expect(graded.verdict).toBe('BTN with AA: raise 100%');
		});

		it('reads a free spot as check or raise', () => {
			const trash = preflop('bbVsLimp', '72o', true);
			expect(gradeAnswer(trash, choose('check'), 'easy').correct).toBe(true);
			expect(gradeAnswer(trash, choose('raise'), 'easy').correct).toBe(false);
			expect(gradeAnswer(trash, null, 'easy').right).toEqual(['check']);
			const aces = preflop('bbVsLimp', 'AA', true);
			expect(gradeAnswer(aces, choose('raise'), 'easy').correct).toBe(true);
		});

		it('counts a timeout as a miss', () => {
			const graded = gradeAnswer(preflop('rfiBtn', 'AA'), null, 'test');
			expect(graded.correct).toBe(false);
			expect(graded.response).toBeNull();
		});
	});

	describe('pot odds', () => {
		it('calls when the call is worth something', () => {
			const graded = gradeAnswer(potOdds(1.24), choose('call'), 'easy');
			expect(graded).toMatchObject({ correct: true, right: ['call'], answer: 'Call' });
			expect(graded.verdict).toBe('Needs 25% · you have 34% · call +1.2 bb');
		});

		it('folds when it is not', () => {
			const graded = gradeAnswer(potOdds(-0.8), choose('call'), 'easy');
			expect(graded).toMatchObject({ correct: false, right: ['fold'], answer: 'Fold' });
			expect(graded.verdict).toContain('call −0.8 bb');
			expect(gradeAnswer(potOdds(-0.8), choose('fold'), 'easy').correct).toBe(true);
		});
	});

	describe('equity', () => {
		describe('on Easy, by band', () => {
			it('is right in the band that holds the figure', () => {
				expect(gradeAnswer(equity(0.33), { kind: 'band', band: 1 }, 'easy').correct).toBe(
					true
				);
				expect(gradeAnswer(equity(0.33), { kind: 'band', band: 2 }, 'easy').correct).toBe(
					false
				);
			});

			it('takes either band on an edge', () => {
				const edge = equity(0.4);
				expect(gradeAnswer(edge, { kind: 'band', band: 1 }, 'easy').correct).toBe(true);
				expect(gradeAnswer(edge, { kind: 'band', band: 2 }, 'easy').correct).toBe(true);
				expect(gradeAnswer(edge, { kind: 'band', band: 0 }, 'easy').correct).toBe(false);
			});

			it('says the figure', () => {
				const graded = gradeAnswer(equity(0.414), { kind: 'band', band: 2 }, 'easy');
				expect(graded.answer).toBe('41%');
				expect(graded.verdict).toBe('You chose 40–60% · it is 41%');
				expect(graded.right).toEqual([]);
			});
		});

		describe('on Hard and Test, by estimate', () => {
			it('is right within five points of the whole percent shown', () => {
				const question = equity(0.414);
				for (const [pct, right] of [
					[36, true],
					[46, true],
					[35, false],
					[47, false],
				] as const) {
					const graded = gradeAnswer(question, { kind: 'estimate', pct }, 'hard');
					expect(graded.correct).toBe(right);
				}
			});

			it('says how far off the estimate was', () => {
				const graded = gradeAnswer(equity(0.41), { kind: 'estimate', pct: 50 }, 'test');
				expect(graded.verdict).toBe('You said 50% · off by 9');
			});

			it('misses a timeout', () => {
				const graded = gradeAnswer(equity(0.41), null, 'test');
				expect(graded.correct).toBe(false);
				expect(graded.verdict).toBe('It is 41%');
			});
		});
	});

	describe('c-bet sizing', () => {
		it('is right only at the model size', () => {
			expect(gradeAnswer(cbet(0.33), choose('bet33'), 'easy').correct).toBe(true);
			expect(gradeAnswer(cbet(0.33), choose('bet50'), 'easy').correct).toBe(false);
			expect(gradeAnswer(cbet(0.66), choose('bet66'), 'easy').right).toEqual(['bet66']);
		});

		it('says why from the texture', () => {
			const graded = gradeAnswer(cbet(0.33), choose('bet66'), 'easy');
			expect(graded.answer).toBe('33%');
			expect(graded.verdict).toBe('A K-high, rainbow flop is dry: the model bets 33%');
		});
	});
});
