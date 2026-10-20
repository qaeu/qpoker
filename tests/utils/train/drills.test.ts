import { describe, expect, it } from 'vitest';

import { classOf } from '#utils/cards/combos';
import { MIX_FLOOR } from '#utils/coach/grade';
import { textureOf } from '#utils/postflop/texture';
import { isPremium } from '#utils/ranges/tiers';
import { frequencyOf } from '#utils/ranges/range';
import { hasOwnTable, tableOf, tableStrategy } from '#utils/ui/rangeTables';
import {
	choicesOf,
	DRILL_IDS,
	DRILL_MODES,
	hasFeedback,
	QUESTIONS,
	questionAt,
	type CbetQuestion,
	type DrillMode,
	type PotOddsQuestion,
	type PreflopQuestion,
	type Question,
} from '#utils/train/drills';

const SEED = 2024;

function run(drill: Question['drill'], mode: DrillMode, seed = SEED): Question[] {
	return Array.from({ length: QUESTIONS[mode] }, (_, i) =>
		questionAt(drill, mode, seed, i)
	);
}

const preflop = (mode: DrillMode, seed = SEED) =>
	run('preflop', mode, seed) as PreflopQuestion[];
const potOdds = (mode: DrillMode, seed = SEED) =>
	run('potOdds', mode, seed) as PotOddsQuestion[];

describe('train drills', () => {
	describe('every drill', () => {
		for (const drill of DRILL_IDS) {
			describe(drill, () => {
				for (const mode of DRILL_MODES) {
					it(`deals a whole ${mode} run of distinct cards`, () => {
						const questions = run(drill, mode);
						expect(questions).toHaveLength(QUESTIONS[mode]);
						for (const question of questions) {
							expect(question.drill).toBe(drill);
							const cards = [...question.hero, ...question.board];
							expect(question.hero).toHaveLength(2);
							expect(new Set(cards).size).toBe(cards.length);
							expect(cards.every((card) => card >= 0 && card < 52)).toBe(true);
							expect(question.label).not.toBe('');
						}
					});
				}

				it('deals the same question from the same seed and index', () => {
					expect(questionAt(drill, 'hard', SEED, 7)).toEqual(
						questionAt(drill, 'hard', SEED, 7)
					);
				});

				it('deals a different run from another seed', () => {
					expect(run(drill, 'easy', 1)).not.toEqual(run(drill, 'easy', 2));
				});
			});
		}

		it('gives feedback in every mode but a Test', () => {
			expect(DRILL_MODES.filter(hasFeedback)).toEqual(['easy', 'hard']);
		});
	});

	describe('preflop', () => {
		it('deals hands of the class it names, from a real table', () => {
			for (const question of preflop('test')) {
				expect(classOf(question.hero[0], question.hero[1])).toBe(question.cls);
				expect(tableOf(question.table).free).toBe(question.free);
				expect(hasOwnTable(question.table, question.depth)).toBe(true);
			}
		});

		it('keeps Easy to first-in and vs-open spots at 100bb', () => {
			for (const question of preflop('easy', 7)) {
				expect(['rfi', 'vsOpen']).toContain(tableOf(question.table).group);
				expect(question.depth).toBe('deep');
			}
		});

		it('deals no trivial hand on Easy', () => {
			for (let seed = 1; seed <= 20; seed++) {
				for (const { table, depth, cls } of preflop('easy', seed)) {
					const strategy = tableStrategy(table, depth);
					const fold = frequencyOf(strategy, cls, 'fold');
					const top = Math.max(
						fold,
						frequencyOf(strategy, cls, 'raise'),
						frequencyOf(strategy, cls, 'call')
					);
					// A premium played one way is no question.
					expect(isPremium(cls) && top === 1).toBe(false);
					if (fold < 1) continue;
					// A pure fold has a neighbour in the grid that plays.
					const row = Math.floor(cls / 13);
					const col = cls % 13;
					const near = [-1, 0, 1].flatMap((dr) =>
						[-1, 0, 1]
							.map((dc) => [row + dr, col + dc])
							.filter(([r, c]) => r >= 0 && r < 13 && c >= 0 && c < 13)
							.map(([r, c]) => r * 13 + c)
					);
					expect(
						near.some((other) => frequencyOf(strategy, other, 'fold') <= 1 - MIX_FLOOR)
					).toBe(true);
				}
			}
		});

		it('reaches the deeper scenarios and 50bb on Hard', () => {
			const questions = [1, 2, 3].flatMap((seed) => preflop('hard', seed));
			const groups = new Set(questions.map((question) => tableOf(question.table).group));
			expect(groups.size).toBeGreaterThan(2);
			expect(questions.some((question) => question.depth === 'mid')).toBe(true);
		});

		it('deals a run again after another run has been dealt', () => {
			const first = questionAt('preflop', 'hard', 1, 6);
			questionAt('preflop', 'hard', 2, 6);
			expect(questionAt('preflop', 'hard', 1, 6)).toEqual(first);
		});

		it('never deals the same hand in the same spot twice running', () => {
			for (const mode of DRILL_MODES) {
				const questions = preflop(mode);
				for (let i = 1; i < questions.length; i++) {
					const [a, b] = [questions[i - 1], questions[i]];
					expect(a.table === b.table && a.depth === b.depth && a.cls === b.cls).toBe(
						false
					);
				}
			}
		});

		it('offers a check rather than a call and a fold where it is free', () => {
			const free = { ...preflop('easy')[0], free: true };
			expect(choicesOf(free)).toEqual(['check', 'raise']);
			expect(choicesOf({ ...free, free: false })).toEqual(['fold', 'call', 'raise']);
		});
	});

	describe('pot odds', () => {
		const all = DRILL_MODES.flatMap((mode) =>
			[1, 2].flatMap((seed) => potOdds(mode, seed))
		);

		it('is heads up on the turn or river', () => {
			for (const question of all) expect([4, 5]).toContain(question.board.length);
		});

		it('prices the call on the pot the bet makes', () => {
			for (const { potBb, betBb, potOdds: odds } of all) {
				expect(odds).toBeCloseTo(betBb / (potBb + 2 * betBb));
			}
		});

		it('never asks a toss-up', () => {
			for (const { potBb, betBb, callEvBb } of all) {
				expect(Math.abs(callEvBb)).toBeGreaterThanOrEqual(0.07 * (potBb + 2 * betBb));
			}
		});

		it('asks both calls and folds', () => {
			expect(all.some((question) => question.callEvBb > 0)).toBe(true);
			expect(all.some((question) => question.callEvBb < 0)).toBe(true);
		});

		it('keeps Hard close to the price', () => {
			const hard = potOdds('hard');
			const close = hard.filter(({ potBb, betBb, callEvBb }) => {
				const stake = potBb + 2 * betBb;
				return Math.abs(callEvBb) <= 0.15 * stake;
			});
			expect(close.length).toBeGreaterThanOrEqual(hard.length - 1);
		});

		it('offers a fold and a call', () => {
			expect(choicesOf(all[0])).toEqual(['fold', 'call']);
		});
	});

	describe('equity', () => {
		it('deals flops, turns and rivers, with equity a share', () => {
			const questions = [1, 2, 3].flatMap((seed) => run('equity', 'hard', seed));
			const streets = new Set(questions.map((question) => question.board.length));
			expect([...streets].sort()).toEqual([3, 4, 5]);
			for (const question of questions) {
				if (question.drill !== 'equity') throw new Error('not equity');
				expect(question.equity).toBeGreaterThanOrEqual(0);
				expect(question.equity).toBeLessThanOrEqual(1);
				expect(choicesOf(question)).toEqual([]);
			}
		});

		it('faces a preflop range alone on Easy', () => {
			for (const question of run('equity', 'easy')) {
				if (question.drill !== 'equity') throw new Error('not equity');
				expect(question.villainLabel).toMatch(/range$/);
			}
		});
	});

	describe('c-bet sizing', () => {
		const questions = [1, 2, 3].flatMap((seed) =>
			run('cbet', 'hard', seed)
		) as CbetQuestion[];

		it('asks for the size the texture rule gives the flop', () => {
			for (const question of questions) {
				expect(question.board).toHaveLength(3);
				expect(question.size).toBe(textureOf(question.board).betSize);
				expect(question.texture).toBe(textureOf(question.board).label);
			}
		});

		it('puts the blinds left behind in the pot', () => {
			const pots = new Map<string, number>();
			for (const question of questions)
				pots.set(question.label.split(' · ')[0], question.potBb);
			expect(Object.fromEntries(pots)).toMatchObject({
				'SB vs BB': 5,
				'BTN vs BB': 5.5,
				'CO vs BTN': 6.5,
				'HJ vs CO': 6.5,
			});
		});

		it('asks every size', () => {
			expect(new Set(questions.map((question) => question.size))).toEqual(
				new Set([0.33, 0.5, 0.66])
			);
			expect(choicesOf(questions[0])).toEqual(['bet33', 'bet50', 'bet66']);
		});
	});
});
