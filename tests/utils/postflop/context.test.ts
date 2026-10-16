import { describe, it, expect } from 'vitest';

import { parseCards } from '#utils/cards/cards';
import { COMBOS } from '#utils/cards/combos';
import { rangeWeight, removeDead } from '#utils/cards/equity';
import { parseHistory } from '#utils/history/parse';
import { replayHand, type Replay } from '#utils/history/replay';
import { judgePostflop } from '#utils/postflop/decision';
import { pairOrBetter } from '#utils/postflop/handClass';
import { applyAction, rangeAt, rankRange, sizeOf } from '#utils/postflop/villainRange';

import { handText, type HandSpec } from '../history/handText';

const cards = parseCards;
const OPTIONS = { rake: 0.05, seed: 3, samples: 300 };

function replayOf(spec: HandSpec): Replay {
	const replay = replayHand(parseHistory(handText(spec))[0]);
	expect(replay.reconciled).toBe(true);
	return replay;
}

/** The first step at which `player` took `kind` on `street`. */
const stepOf = (replay: Replay, player: string, kind: string, street: string) =>
	replay.steps.find(
		(step) =>
			step.action.player === player && step.action.kind === kind && step.street === street
	)!;

const same = (a: Float64Array, b: Float64Array): boolean =>
	a.every((value, i) => Math.abs(value - b[i]) < 1e-12);

/** The share of a range in its own top fifth on `board`. */
function strongShare(range: Float64Array, board: number[]): number {
	const view = rankRange(range, board);
	let strong = 0;
	for (let i = 0; i < COMBOS.length; i++) {
		if (view.percentile[i] > 0.8) strong += range[i];
	}
	return strong / rangeWeight(range);
}

/** Hero opens the button and the big blind calls: hero has the initiative. */
const heroOpens = (lines: string[], pot: string): HandSpec => ({
	heroCards: 'Ac Kc',
	button: 1,
	lines: [
		'p2: posts small blind $0.05',
		'p3: posts big blind $0.10',
		'*** HOLE CARDS ***',
		'p4: folds',
		'p5: folds',
		'p6: folds',
		'hero: raises $0.15 to $0.25',
		'p2: folds',
		'p3: calls $0.15',
		...lines,
	],
	pot,
	winner: 'hero',
});

/** p5 opens the button and hero calls in the big blind: p5 has the initiative. */
const heroDefends = (heroCards: string, lines: string[], pot: string): HandSpec => ({
	heroCards,
	button: 5,
	lines: [
		'p6: posts small blind $0.05',
		'hero: posts big blind $0.10',
		'*** HOLE CARDS ***',
		'p2: folds',
		'p3: folds',
		'p4: folds',
		'p5: raises $0.15 to $0.25',
		'p6: folds',
		'hero: calls $0.15',
		...lines,
	],
	pot,
	winner: 'hero',
});

describe('a check in its context', () => {
	describe('the last aggressor, through the replay', () => {
		const replay = replayOf(
			heroOpens(
				[
					'*** FLOP *** [Kd 7s 2c]',
					'p3: checks',
					'hero: checks',
					'*** TURN *** [Kd 7s 2c] [3h]',
					'p3: bets $0.30',
					'hero: raises $0.60 to $0.90',
					'p3: folds',
					'Uncalled bet ($0.60) returned to hero',
					'hero collected $1.15 from pot',
				],
				'1.15'
			)
		);

		it('carries the preflop raiser into the flop', () => {
			expect(stepOf(replay, 'p3', 'check', 'flop')).toMatchObject({
				aggressor: 'hero',
				aggressorToAct: true,
			});
			// The aggressor's own check is in front of nobody.
			expect(stepOf(replay, 'hero', 'check', 'flop')).toMatchObject({
				aggressor: 'hero',
				aggressorToAct: false,
			});
		});

		it('loses the aggressor once they check back a street', () => {
			expect(stepOf(replay, 'p3', 'bet', 'turn')).toMatchObject({
				aggressor: null,
				aggressorToAct: false,
			});
		});

		it('hands it to whoever bets or raises next', () => {
			expect(stepOf(replay, 'hero', 'raise', 'turn').aggressor).toBe('p3');
			expect(stepOf(replay, 'p3', 'fold', 'turn')).toMatchObject({
				aggressor: 'hero',
				aggressorToAct: false,
			});
		});

		it('has none before anyone raises, and passes to a re-raiser', () => {
			expect(replay.steps[2]).toMatchObject({ aggressor: null, aggressorToAct: false });
			const folded = replayOf({
				heroCards: 'Ac Kc',
				button: 1,
				lines: [
					'p2: posts small blind $0.05',
					'p3: posts big blind $0.10',
					'*** HOLE CARDS ***',
					'p4: raises $0.15 to $0.25',
					'p5: folds',
					'p6: folds',
					'hero: raises $0.55 to $0.80',
					'p2: folds',
					'p3: folds',
					'p4: folds',
					'Uncalled bet ($0.55) returned to hero',
					'hero collected $0.65 from pot',
				],
				pot: '0.65',
				winner: 'hero',
			});
			expect(folded.steps.at(-1)!.aggressor).toBe('hero');
			expect(stepOf(folded, 'hero', 'raise', 'preflop').aggressor).toBe('p4');
		});

		it('is not to act when all-in', () => {
			// p5 shoves short over the open; the two who call it play on beside them.
			const replay = replayOf({
				heroCards: 'Ac Kc',
				button: 1,
				stacks: { p5: 1 },
				lines: [
					'p2: posts small blind $0.05',
					'p3: posts big blind $0.10',
					'*** HOLE CARDS ***',
					'p4: raises $0.15 to $0.25',
					'p5: raises $0.75 to $1 and is all-in',
					'p6: folds',
					'hero: folds',
					'p2: folds',
					'p3: calls $0.90',
					'p4: calls $0.75',
					'*** FLOP *** [Kd 7s 2c]',
					'p3: checks',
					'p4: checks',
					'*** TURN *** [Kd 7s 2c] [3h]',
					'p3: checks',
					'p4: checks',
					'*** RIVER *** [Kd 7s 2c 3h] [9d]',
					'p3: checks',
					'p4: checks',
					'*** SHOW DOWN ***',
					'p5 collected $3.05 from pot',
				],
				pot: '3.05',
				winner: 'p5',
			});
			expect(stepOf(replay, 'p3', 'check', 'flop')).toMatchObject({
				aggressor: 'p5',
				aggressorToAct: false,
			});
		});
	});

	describe('a check to the aggressor', () => {
		const replay = replayOf(
			heroOpens(
				[
					'*** FLOP *** [Kd 7s 2c]',
					'p3: checks',
					'hero: bets $0.30',
					'p3: calls $0.30',
					'*** TURN *** [Kd 7s 2c] [3h]',
					'p3: checks',
					'hero: checks',
					'*** RIVER *** [Kd 7s 2c 3h] [9d]',
					'p3: checks',
					'hero: checks',
					'*** SHOW DOWN ***',
					'hero: shows [Ac Kc] (a pair of Kings)',
					'p3: mucks hand',
					'hero collected $1.15 from pot',
				],
				'1.15'
			)
		);
		const hole = cards('Ac Kc');

		it('leaves the checker’s range as it was', () => {
			const check = stepOf(replay, 'p3', 'check', 'turn');
			const before = rangeAt(replay, 'p3', check.index, hole);
			const after = rangeAt(replay, 'p3', check.index + 1, hole);
			expect(same(before, after)).toBe(true);
		});

		it('still reads the aggressor’s own check as giving up strength', () => {
			const check = stepOf(replay, 'hero', 'check', 'turn');
			const before = rangeAt(replay, 'hero', check.index);
			const after = rangeAt(replay, 'hero', check.index + 1);
			expect(strongShare(after, check.board)).toBeLessThan(
				strongShare(before, check.board)
			);
		});
	});

	describe('a check-raise', () => {
		// A limped pot: nobody has the initiative, so the small blind's check counts.
		const replay = replayOf({
			heroCards: 'Ac Kc',
			button: 1,
			lines: [
				'p2: posts small blind $0.05',
				'p3: posts big blind $0.10',
				'*** HOLE CARDS ***',
				'p4: folds',
				'p5: folds',
				'p6: folds',
				'hero: folds',
				'p2: calls $0.05',
				'p3: checks',
				'*** FLOP *** [Kd 7s 2c]',
				'p2: checks',
				'p3: bets $0.10',
				'p2: raises $0.30 to $0.40',
				'p3: folds',
				'Uncalled bet ($0.30) returned to p2',
				'p2 collected $0.40 from pot',
			],
			pot: '0.40',
			winner: 'p2',
		});
		const check = stepOf(replay, 'p2', 'check', 'flop');
		const raise = stepOf(replay, 'p2', 'raise', 'flop');
		const { board } = raise;

		it('is read from the range before the check', () => {
			expect(check.aggressor).toBeNull();
			const preCheck = removeDead(rangeAt(replay, 'p2', check.index), board);
			const raised = rangeAt(replay, 'p2', raise.index + 1);
			expect(same(raised, applyAction(preCheck, board, 'raise', sizeOf(raise)))).toBe(
				true
			);
		});

		it('keeps its strength', () => {
			const checked = rangeAt(replay, 'p2', raise.index);
			const raised = rangeAt(replay, 'p2', raise.index + 1);
			const afterStrip = applyAction(checked, board, 'raise', sizeOf(raise));
			expect(strongShare(raised, board)).toBeGreaterThan(strongShare(afterStrip, board));
		});
		it('is read from the range before the check when others act between', () => {
			const multiway = replayOf({
				heroCards: 'Ac Kc',
				button: 1,
				lines: [
					'p2: posts small blind $0.05',
					'p3: posts big blind $0.10',
					'*** HOLE CARDS ***',
					'p4: folds',
					'p5: folds',
					'p6: calls $0.10',
					'hero: folds',
					'p2: calls $0.05',
					'p3: checks',
					'*** FLOP *** [Kd 7s 2c]',
					'p2: checks',
					'p3: checks',
					'p6: bets $0.20',
					'p3: calls $0.20',
					'p2: raises $0.80 to $1',
					'p3: folds',
					'p6: folds',
					'Uncalled bet ($0.80) returned to p2',
					'p2 collected $0.90 from pot',
				],
				pot: '0.90',
				winner: 'p2',
			});
			const checked = stepOf(multiway, 'p2', 'check', 'flop');
			const raised = stepOf(multiway, 'p2', 'raise', 'flop');
			const preCheck = removeDead(rangeAt(multiway, 'p2', checked.index), raised.board);
			expect(
				same(
					rangeAt(multiway, 'p2', raised.index + 1),
					applyAction(preCheck, raised.board, 'raise', sizeOf(raised))
				)
			).toBe(true);
		});
	});

	describe('missed value when checking to the aggressor', () => {
		const showdown = (pot: string) => [
			'*** SHOW DOWN ***',
			'hero: shows [7h 7d] (three of a kind, Sevens)',
			'p5: mucks hand',
			`hero collected $${pot} from pot`,
		];
		const flop = [
			'*** FLOP *** [Kd 7s 2c]',
			'hero: checks',
			'p5: bets $0.25',
			'hero: calls $0.25',
		];

		const checkedDown = () =>
			replayOf(
				heroDefends(
					'7h 7d',
					[
						...flop,
						'*** TURN *** [Kd 7s 2c] [3h]',
						'hero: checks',
						'p5: checks',
						'*** RIVER *** [Kd 7s 2c 3h] [9d]',
						'hero: checks',
						'p5: checks',
						...showdown('1.05'),
					],
					'1.05'
				)
			);

		it('is not named when the aggressor is still to act', () => {
			const replay = checkedDown();
			const step = stepOf(replay, 'hero', 'check', 'turn');
			expect(step).toMatchObject({ aggressor: 'p5', aggressorToAct: true });
			const verdict = judgePostflop(replay, step, OPTIONS);
			expect(verdict.mistake).toBeNull();
			expect(verdict.evLostBb).toBe(0);
			// What would otherwise have been named: a strong hand, priced to bet.
			expect(verdict.facts.equity).toBeGreaterThan(0.7);
			expect(verdict.facts.betEvBb! - verdict.facts.checkEvBb!).toBeGreaterThan(
				0.07 * verdict.facts.potBb
			);
		});

		it('is named again once the aggressor has checked back a street', () => {
			const replay = checkedDown();
			const step = stepOf(replay, 'hero', 'check', 'river');
			expect(step).toMatchObject({ aggressor: null, aggressorToAct: false });
			expect(judgePostflop(replay, step, OPTIONS).mistake).toBe('missed-value');
		});

		it('is still named on the aggressor’s own check', () => {
			const replay = replayOf(
				heroDefends(
					'7h 7d',
					[
						...flop,
						'*** TURN *** [Kd 7s 2c] [3h]',
						'hero: bets $0.50',
						'p5: calls $0.50',
						'*** RIVER *** [Kd 7s 2c 3h] [9d]',
						'hero: checks',
						'p5: checks',
						...showdown('2.05'),
					],
					'2.05'
				)
			);
			// Hero bet the turn, so the river check is in front of nobody.
			const step = stepOf(replay, 'hero', 'check', 'river');
			expect(step).toMatchObject({ aggressor: 'hero', aggressorToAct: false });
			expect(judgePostflop(replay, step, OPTIONS).mistake).toBe('missed-value');
		});
	});

	describe('the pair guard on a thin bet', () => {
		it('knows a pair the hole cards make from the board’s own', () => {
			expect(pairOrBetter(cards('Ad 6s'), cards('Kh 9d Js'))).toBe(false);
			expect(pairOrBetter(cards('Ad 6s'), cards('Kh 9d 9s'))).toBe(false);
			expect(pairOrBetter(cards('5d 5s'), cards('Kh 9d Js'))).toBe(true);
			expect(pairOrBetter(cards('Kd 6s'), cards('Kh 9d Js'))).toBe(true);
			expect(pairOrBetter(cards('Qh 2h'), cards('Kh 9h 3h 5d'))).toBe(true);
			// The board's own straight is not the hero's.
			expect(pairOrBetter(cards('Ac 2c'), cards('5h 6d 7s 8h 9d'))).toBe(false);
		});

		it('does not call a bet with no pair thin', () => {
			const replay = replayOf({
				...heroOpens(
					[
						'*** FLOP *** [Kh 9d Js]',
						'p3: checks',
						'hero: bets $0.25',
						'p3: folds',
						'Uncalled bet ($0.25) returned to hero',
						'hero collected $0.55 from pot',
					],
					'0.55'
				),
				heroCards: 'Ad 6s',
			});
			const verdict = judgePostflop(
				replay,
				stepOf(replay, 'hero', 'bet', 'flop'),
				OPTIONS
			);
			expect(verdict.facts.handText).toBe('ace high');
			expect(verdict.facts.equity).toBeGreaterThanOrEqual(0.3);
			// Checking is worth clearly more, which would have named a thin bet.
			expect(verdict.facts.checkEvBb! - verdict.facts.betEvBb!).toBeGreaterThan(
				0.07 * verdict.facts.potBb
			);
			expect(verdict.mistake).toBeNull();
		});
	});
});
