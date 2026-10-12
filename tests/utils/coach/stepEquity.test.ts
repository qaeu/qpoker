import { describe, it, expect } from 'vitest';

import { analyzeLog } from '#utils/coach/report';
import { handEquity } from '#utils/coach/stepEquity';
import { parseHistory } from '#utils/history/parse';
import { replayHand } from '#utils/history/replay';

import { TWO_HAND_LOG } from '../../integration/appHarness';
import {
	BLINDS_HERO_SB,
	handText,
	RIVER_HERO_CALL,
	TOUGH_FOLD,
	UNRECONCILED,
	type HandSpec,
} from '../history/handText';

const folds = (...names: string[]) => names.map((name) => `${name}: folds`);

/** Hero shoves aces from the small blind and is called: the board runs out. */
const ALL_IN_PREFLOP: HandSpec = {
	id: 8101,
	heroCards: 'Ah Ad',
	button: 6,
	lines: [
		...BLINDS_HERO_SB,
		'*** HOLE CARDS ***',
		...folds('p3', 'p4', 'p5', 'p6'),
		'hero: raises $9.90 to $10 and is all-in',
		'p2: calls $9.90 and is all-in',
		'*** FLOP *** [Kd 7s 2c]',
		'*** TURN *** [Kd 7s 2c] [3h]',
		'*** RIVER *** [Kd 7s 2c 3h] [9d]',
		'*** SHOW DOWN ***',
		'hero: shows [Ah Ad] (a pair of Aces)',
		'p2: shows [Kc Qc] (a pair of Kings)',
		'hero collected $20 from pot',
	],
	pot: '20',
	winner: 'hero',
};

const SEED = 3;
const reported = (text: string, index = 0) =>
	analyzeLog(text, { seed: SEED }).hands[index];

/** The index of the line ending in `text`. */
const lineOf = (hand: ReturnType<typeof reported>, text: string) =>
	hand.lines.find((line) => line.text.endsWith(text))!.stepIndex;

describe('the equity readout', () => {
	const called = reported(handText(RIVER_HERO_CALL));
	const opened = reported(TWO_HAND_LOG, 1);

	describe('which steps have a figure', () => {
		it('has one at every deal and after every action of a hand played out', () => {
			expect(Object.keys(called.equity.deals)).toEqual([
				'preflop',
				'flop',
				'turn',
				'river',
			]);
			const actions = called.lines.filter((line) => !line.kind.startsWith('post-'));
			expect(Object.keys(called.equity.actions).map(Number)).toEqual(
				actions.map((line) => line.stepIndex)
			);
		});

		it('has none once the hero has folded', () => {
			const fold = reported(handText(TOUGH_FOLD));
			const last = fold.lines.findLast((line) => line.hero)!;
			expect(last.kind).toBe('fold');
			expect(fold.equity.actions[last.stepIndex]).toBeUndefined();
			expect(fold.equity.actions[last.stepIndex - 1]).toBeDefined();
			// Folded first to act: the deal is all there is.
			const first = reported(TWO_HAND_LOG, 0);
			expect(first.equity.deals.preflop).toBeDefined();
			expect(first.equity.actions).toEqual({});
		});

		it('has none once there is nobody left to beat', () => {
			expect(opened.equity.actions[lineOf(opened, 'p5 (SB) folds')]).toBeDefined();
			expect(opened.equity.actions[lineOf(opened, 'p6 (BB) folds')]).toBeUndefined();
		});

		it('has none in a hand that was not graded', () => {
			expect(reported(handText(UNRECONCILED)).equity).toEqual({ deals: {}, actions: {} });
		});
	});

	describe('what it is taken against', () => {
		it('counts every opponent not folded', () => {
			expect(opened.equity.deals.preflop!.opponents).toBe(5);
			expect(opened.equity.actions[lineOf(opened, 'p2 (HJ) folds')].opponents).toBe(4);
			expect(opened.equity.actions[lineOf(opened, 'p5 (SB) folds')].opponents).toBe(1);
		});

		it('falls with the field and rises as it thins', () => {
			// Ace-king against five unknown hands, then against one.
			const five = opened.equity.deals.preflop!.equity;
			const one = opened.equity.actions[lineOf(opened, 'p5 (SB) folds')].equity;
			expect(five).toBeGreaterThan(0.25);
			expect(five).toBeLessThan(0.4);
			expect(one).toBeGreaterThan(0.6);
			expect(one).toBeLessThan(0.7);
		});

		it('reads an opponent’s range as it stood at the step, not at the end', () => {
			// Five high against a big blind who has only posted, then one who called.
			const before = called.equity.actions[lineOf(called, 'raises to $0.30')];
			const after = called.equity.actions[lineOf(called, 'p2 (BB) calls $0.20')];
			expect(before.opponents).toBe(1);
			expect(after.equity).not.toBe(before.equity);
		});

		it('does not move for the hero’s own action', () => {
			const { deals, actions } = called.equity;
			expect(actions[lineOf(called, 'hero (SB) bets $0.20')]).toBe(deals.flop);
			expect(actions[lineOf(called, 'hero (SB) checks')]).toBe(deals.river);
			expect(actions[lineOf(called, 'p2 (BB) calls $0.20')]).not.toEqual(deals.flop);
		});
	});

	describe('agreeing with the grade', () => {
		it('shows a postflop decision the equity it was graded on', () => {
			const graded = called.gradings.filter((grading) => grading.postflop);
			expect(graded.length).toBeGreaterThan(2);
			for (const grading of graded) {
				expect(called.equity.actions[grading.stepIndex]).toEqual({
					equity: grading.postflop!.equity,
					opponents: grading.postflop!.opponents,
				});
			}
		});

		it('would reach the same figure without the grade to copy', () => {
			const replay = replayHand(parseHistory(handText(RIVER_HERO_CALL))[0]);
			const alone = handEquity(replay, 'hero', [], { seed: SEED });
			for (const grading of called.gradings.filter((item) => item.postflop)) {
				expect(alone.actions[grading.stepIndex].equity).toBe(grading.postflop!.equity);
			}
		});

		it('shows a priced shove the equity it was priced at', () => {
			const fold = reported(handText(TOUGH_FOLD));
			const priced = fold.gradings.at(-1)!;
			expect(priced.preflop).toMatchObject({ opponents: 1 });
			expect(fold.equity.actions[priced.stepIndex - 1]).toEqual({
				equity: priced.preflop!.equity,
				opponents: 1,
			});
		});
	});

	describe('a board that runs out', () => {
		const allIn = reported(handText(ALL_IN_PREFLOP));

		it('has a figure for each street dealt after the betting ended', () => {
			const { deals } = allIn.equity;
			expect(Object.keys(deals)).toEqual(['preflop', 'flop', 'turn', 'river']);
			expect(deals.flop!.opponents).toBe(1);
			// Aces on a king-high board against a range that called a shove.
			expect(deals.river!.equity).toBeGreaterThan(0.5);
			expect(deals.river!.equity).toBeLessThanOrEqual(1);
		});
	});

	describe('seeding', () => {
		it('is the same for the same seed', () => {
			expect(reported(handText(RIVER_HERO_CALL)).equity).toEqual(called.equity);
		});

		it('moves a simulated figure with the seed, and not an enumerated one', () => {
			const other = analyzeLog(handText(RIVER_HERO_CALL), { seed: SEED + 1 }).hands[0];
			expect(other.equity.deals.preflop!.equity).not.toBe(
				called.equity.deals.preflop!.equity
			);
			expect(other.equity.deals.river).toEqual(called.equity.deals.river);
		});
	});
});
