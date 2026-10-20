import { describe, expect, it, vi } from 'vitest';

import {
	DEFAULT_TRAIN_CONFIG,
	loadTrainConfig,
	loadTrainScores,
	saveTrainConfig,
	saveTrainScores,
} from '#utils/app/storage';
import { boardKey } from '#utils/train/scores';

const CONFIG_KEY = 'qpoker:trainConfig';
const SCORES_KEY = 'qpoker:trainScores';

const run = {
	correct: 8,
	total: 10,
	timeMs: 30_000,
	date: '2026-10-21T12:00:00.000Z',
	seed: 4,
};

describe('the stored train settings', () => {
	describe('the modes', () => {
		it('are all Easy until chosen', () => {
			expect(loadTrainConfig()).toEqual(DEFAULT_TRAIN_CONFIG);
			expect(Object.values(DEFAULT_TRAIN_CONFIG.modes)).toEqual([
				'easy',
				'easy',
				'easy',
				'easy',
			]);
		});

		it('come back as saved', () => {
			const config = {
				modes: { preflop: 'hard', potOdds: 'test', equity: 'easy', cbet: 'hard' },
			} as const;
			saveTrainConfig(config);
			expect(loadTrainConfig()).toEqual(config);
			expect(JSON.parse(localStorage.getItem(CONFIG_KEY)!).version).toBe(1);
		});

		it('keep a drill default where its stored mode is unknown', () => {
			localStorage.setItem(
				CONFIG_KEY,
				JSON.stringify({ version: 1, modes: { preflop: 'hard', cbet: 'insane' } })
			);
			expect(loadTrainConfig().modes).toEqual({
				preflop: 'hard',
				potOdds: 'easy',
				equity: 'easy',
				cbet: 'easy',
			});
		});

		it('drop bad JSON and other versions', () => {
			localStorage.setItem(CONFIG_KEY, '{nope');
			expect(loadTrainConfig()).toEqual(DEFAULT_TRAIN_CONFIG);
			localStorage.setItem(CONFIG_KEY, JSON.stringify({ version: 2, modes: {} }));
			expect(loadTrainConfig()).toEqual(DEFAULT_TRAIN_CONFIG);
		});
	});

	describe('the score boards', () => {
		it('are empty until a run is saved, and come back as saved', () => {
			expect(loadTrainScores()).toEqual({});
			const boards = { [boardKey('equity', 'hard')]: [run] };
			saveTrainScores(boards);
			expect(loadTrainScores()).toEqual(boards);
		});

		it('drop a malformed record whole', () => {
			localStorage.setItem(
				SCORES_KEY,
				JSON.stringify({
					version: 1,
					boards: {
						[boardKey('equity', 'hard')]: [run],
						[boardKey('cbet', 'easy')]: [{}],
					},
				})
			);
			expect(loadTrainScores()).toEqual({});
			localStorage.setItem(SCORES_KEY, 'not json');
			expect(loadTrainScores()).toEqual({});
		});
	});

	describe('without storage', () => {
		it('reads the defaults and saves nothing, without throwing', () => {
			const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
				throw new Error('denied');
			});
			const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
				throw new Error('denied');
			});
			expect(loadTrainConfig()).toEqual(DEFAULT_TRAIN_CONFIG);
			expect(loadTrainScores()).toEqual({});
			expect(() => saveTrainConfig(DEFAULT_TRAIN_CONFIG)).not.toThrow();
			expect(() => saveTrainScores({})).not.toThrow();
			get.mockRestore();
			set.mockRestore();
		});
	});
});
