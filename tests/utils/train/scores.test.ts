import { describe, expect, it } from 'vitest';

import {
	BOARD_SIZE,
	bestOn,
	boardKey,
	compareEntries,
	DRILL_VERSION,
	isScoreBoards,
	recordScore,
	type ScoreEntry,
} from '#utils/train/scores';

const entry = (correct: number, timeMs: number, total = 10): ScoreEntry => ({
	correct,
	total,
	timeMs,
	date: '2026-10-21T12:00:00.000Z',
	seed: 1,
});

describe('train score boards', () => {
	describe('the key', () => {
		it('names the drill, the mode and the drill version', () => {
			expect(boardKey('potOdds', 'hard')).toBe(`potOdds:hard:v${DRILL_VERSION.potOdds}`);
			expect(boardKey('potOdds', 'hard')).not.toBe(boardKey('potOdds', 'test'));
		});
	});

	describe('ordering', () => {
		it('puts more right first, as a share of the run', () => {
			expect(compareEntries(entry(9, 50_000), entry(8, 10_000))).toBeLessThan(0);
			expect(compareEntries(entry(18, 1, 20), entry(9, 1))).toBe(0);
		});

		it('breaks a tie by time', () => {
			expect(compareEntries(entry(8, 10_000), entry(8, 12_000))).toBeLessThan(0);
			expect(compareEntries(entry(8, 12_000), entry(8, 10_000))).toBeGreaterThan(0);
		});
	});

	describe('recording a run', () => {
		it('fills an empty board as its best', () => {
			const result = recordScore({}, 'k', entry(5, 1000));
			expect(result).toMatchObject({ rank: 1, newBest: true });
			expect(bestOn(result.boards, 'k')).toEqual(entry(5, 1000));
		});

		it('ranks an equal run beneath the older one', () => {
			const first = recordScore({}, 'k', { ...entry(5, 1000), seed: 1 });
			const second = recordScore(first.boards, 'k', { ...entry(5, 1000), seed: 2 });
			expect(second.rank).toBe(2);
			expect(second.newBest).toBe(false);
			expect(second.board.map((run) => run.seed)).toEqual([1, 2]);
		});

		it('keeps the top five, and gives a run that misses them no rank', () => {
			let boards = {};
			for (let correct = 10; correct > 10 - BOARD_SIZE; correct--) {
				boards = recordScore(boards, 'k', entry(correct, 1000)).boards;
			}
			const missed = recordScore(boards, 'k', entry(1, 1000));
			expect(missed.rank).toBeNull();
			expect(missed.board).toHaveLength(BOARD_SIZE);
			const best = recordScore(boards, 'k', entry(10, 500));
			expect(best).toMatchObject({ rank: 1, newBest: true });
			expect(best.board.at(-1)?.correct).toBe(7);
		});

		it('leaves the other boards alone', () => {
			const boards = recordScore({}, 'a', entry(5, 1000)).boards;
			const next = recordScore(boards, 'b', entry(6, 1000)).boards;
			expect(next.a).toBe(boards.a);
			expect(bestOn(next, 'c')).toBeNull();
		});
	});

	describe('reading stored boards', () => {
		const key = boardKey('preflop', 'easy');

		it('accepts boards of known drills, an older version among them', () => {
			expect(isScoreBoards({})).toBe(true);
			expect(isScoreBoards({ [key]: [entry(5, 1000)], 'cbet:test:v0': [] })).toBe(true);
		});

		it('refuses anything malformed whole', () => {
			expect(isScoreBoards(null)).toBe(false);
			expect(isScoreBoards([])).toBe(false);
			expect(isScoreBoards({ 'blackjack:easy:v1': [] })).toBe(false);
			expect(isScoreBoards({ 'preflop:medium:v1': [] })).toBe(false);
			expect(isScoreBoards({ [key]: [{ ...entry(5, 1000), correct: 11 }] })).toBe(false);
			expect(
				isScoreBoards({ [key]: [{ ...entry(5, 1000), total: 0, correct: 0 }] })
			).toBe(false);
			expect(isScoreBoards({ [key]: Array(BOARD_SIZE + 1).fill(entry(5, 1)) })).toBe(
				false
			);
			expect(isScoreBoards({ [key]: [{ ...entry(5, 1000), date: 3 }] })).toBe(false);
		});
	});
});
