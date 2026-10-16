import { describe, it, expect } from 'vitest';

import { gradeDecision, type Grading } from '#utils/coach/grade';
import { goodPlayOf } from '#utils/coach/goodPlays';
import { priceCall } from '#utils/coach/preflopPrice';
import { severityOf } from '#utils/coach/mistakes';
import { parseHistory } from '#utils/history/parse';
import { decisionsOf, replayHand } from '#utils/history/replay';
import { classifyPreflop } from '#utils/ranges/preflopSpot';

import emailed from '../../fixtures/emailed.txt?raw';
import {
	BLINDS_HERO_BTN,
	BLINDS_HERO_SB,
	BLINDS_HERO_UTG,
	handText,
	ringHand,
	TOUGH_FOLD,
	type HandSpec,
} from '../history/handText';

const OPTIONS = { rake: 0.05, seed: 3, samples: 300 };

/** Grades every decision the hero makes in a built hand. */
function grade(spec: HandSpec): Grading[] {
	const replay = replayHand(parseHistory(handText(spec))[0]);
	expect(replay.reconciled).toBe(true);
	return decisionsOf(replay, 'hero').map((step) => gradeDecision(replay, step, OPTIONS));
}

const folds = (...names: string[]) => names.map((name) => `${name}: folds`);

/** Hero is first to act and does `action`; everyone else folds. */
function firstIn(heroCards: string, action: 'fold' | 'limp' | 'raise' | 'big'): Grading {
	const heroLine = {
		fold: 'hero: folds',
		limp: 'hero: calls $0.10',
		raise: 'hero: raises $0.15 to $0.25',
		big: 'hero: raises $0.90 to $1',
	}[action];
	const walk = [
		...folds('p2', 'p3', 'p4', 'p5'),
		'Uncalled bet ($0.05) returned to p6',
		'p6 collected $0.10 from pot',
	];
	const steal = (returned: string) => [
		...folds('p2', 'p3', 'p4', 'p5', 'p6'),
		`Uncalled bet ($${returned}) returned to hero`,
		'hero collected $0.25 from pot',
	];
	const limped = [
		...folds('p2', 'p3', 'p4', 'p5'),
		'p6: checks',
		'*** FLOP *** [Kd 7s 2c]',
		'p6: bets $0.10',
		'hero: folds',
		'Uncalled bet ($0.10) returned to p6',
		'p6 collected $0.25 from pot',
	];
	const rest = {
		fold: walk,
		limp: limped,
		raise: steal('0.15'),
		big: steal('0.90'),
	}[action];
	return grade({
		heroCards,
		button: 4,
		lines: [...BLINDS_HERO_UTG, '*** HOLE CARDS ***', heroLine, ...rest],
		pot: action === 'fold' ? '0.10' : '0.25',
		winner: action === 'raise' || action === 'big' ? 'hero' : 'p6',
	})[0];
}

describe('severity', () => {
	it('grows with the big blinds lost', () => {
		expect(severityOf(0)).toBe('ok');
		expect(severityOf(-0.1)).toBe('ok');
		expect(severityOf(-0.2)).toBe('inaccuracy');
		expect(severityOf(-0.8)).toBe('mistake');
		expect(severityOf(-2)).toBe('blunder');
	});
});

describe('grading first in', () => {
	it('costs nothing to open a hand in range, or fold one out of it', () => {
		const open = firstIn('As Kd', 'raise');
		expect(open).toMatchObject({
			chosen: 'raise',
			recommended: 'raise',
			mistake: null,
			severity: 'ok',
			evLostBb: 0,
			confidence: 'high',
			spot: 'UTG, first in',
		});
		expect(open.preflop).toMatchObject({ hand: 'AKo', raise: 1, fold: 0 });
		expect(open.explanation).toMatch(/In line with it/);
		expect(firstIn('7c 2d', 'fold')).toMatchObject({
			recommended: 'fold',
			mistake: null,
		});
	});

	it('flags folding a premium, and scales the cost with the hand', () => {
		const aces = firstIn('As Ad', 'fold');
		expect(aces).toMatchObject({
			recommended: 'raise',
			mistake: 'open-tight',
			severity: 'blunder',
		});
		expect(aces.evLostBb).toBeLessThan(-5);
		const jacks = firstIn('Js Jd', 'fold');
		expect(jacks.mistake).toBe('open-tight');
		expect(jacks.evLostBb).toBeGreaterThan(aces.evLostBb);
		expect(jacks.evLostBb).toBeLessThan(0);
	});

	it('flags an open-limp whatever the hand', () => {
		expect(firstIn('Qs Qd', 'limp')).toMatchObject({
			recommended: 'raise',
			mistake: 'open-limp',
		});
		const junk = firstIn('9c 4d', 'limp');
		expect(junk).toMatchObject({ recommended: 'fold', mistake: 'open-limp' });
		expect(junk.evLostBb).toBeLessThan(0);
	});

	it('flags opening trash, more the further outside the range', () => {
		const trash = firstIn('7c 2d', 'raise');
		expect(trash).toMatchObject({ recommended: 'fold', mistake: 'open-loose' });
		const near = firstIn('Kc Td', 'raise');
		expect(near.evLostBb).toBeGreaterThan(trash.evLostBb);
	});

	describe('folding a hand the chart opens every time', () => {
		it('is a finding for the middle of the range, not only the top', () => {
			for (const hand of ['9c 9d', 'As Ts', 'Ac Jd', 'Kc Qd']) {
				const fold = firstIn(hand, 'fold');
				expect(fold, hand).toMatchObject({
					mistake: 'open-tight',
					recommended: 'raise',
				});
				expect(fold.evLostBb, hand).toBeLessThanOrEqual(-0.15);
			}
		});

		it('costs more the further the hand is from the bottom of the range', () => {
			const nines = firstIn('9c 9d', 'fold').evLostBb;
			const ajo = firstIn('Ac Jd', 'fold').evLostBb;
			const kqo = firstIn('Kc Qd', 'fold').evLostBb;
			expect(nines).toBeLessThan(ajo);
			expect(ajo).toBeLessThan(kqo);
			expect(firstIn('Qc Qd', 'fold').evLostBb).toBeLessThan(nines);
		});

		it('leaves the last hands of the range alone', () => {
			// Suited connectors are the range's own margin: raised by the chart, but barely.
			const margin = firstIn('6c 5c', 'fold');
			expect(margin.preflop!.raise).toBe(1);
			expect(margin.evLostBb).toBeGreaterThan(-0.15);
			expect(margin.mistake).toBeNull();
		});
	});

	it('lets a mixed hand go either way', () => {
		// ATo opens half the time from under the gun.
		expect(firstIn('Ac Td', 'raise').mistake).toBeNull();
		expect(firstIn('Ac Td', 'fold').mistake).toBeNull();
	});

	it('flags a raise far off the standard size', () => {
		const big = firstIn('As Kd', 'big');
		expect(big).toMatchObject({ mistake: 'preflop-sizing', recommended: 'raise' });
		expect(big.preflop).toMatchObject({ raiseToBb: 10, suggestedRaiseToBb: 2.5 });
		expect(big.explanation).toMatch(/You made it 10bb; about 2.5bb is standard/);
	});
});

describe('grading a raise that commits the stack', () => {
	it('does not flag a 4-bet for most of a 40bb stack as too small', () => {
		const gradings = grade({
			heroCards: 'As Kd',
			button: 1,
			stacks: { hero: 4 },
			lines: [
				...BLINDS_HERO_BTN,
				'*** HOLE CARDS ***',
				...folds('p4', 'p5', 'p6'),
				'hero: raises $0.15 to $0.25',
				'p2: raises $0.55 to $0.80',
				'p3: folds',
				'hero: raises $1.70 to $2.50',
				'p2: folds',
				'Uncalled bet ($1.70) returned to hero',
				'hero collected $1.70 from pot',
			],
			pot: '1.70',
			winner: 'hero',
		});
		const fourBet = gradings[1];
		// The standard raise here is a shove, and 62% of the stack is one in effect.
		expect(fourBet.preflop).toMatchObject({ raiseToBb: 25, suggestedRaiseToBb: 40 });
		expect(fourBet).toMatchObject({ chosen: 'raise', mistake: null });
	});
});

describe('grading against a raise', () => {
	const versusOpen = (heroCards: string, heroLine: string, tail: string[], pot: string) =>
		grade({
			heroCards,
			button: 1,
			lines: [
				...BLINDS_HERO_BTN,
				'*** HOLE CARDS ***',
				...folds('p4', 'p5'),
				'p6: raises $0.15 to $0.25',
				heroLine,
				...tail,
			],
			pot,
			winner: 'p6',
		})[0];
	const takesIt = [
		...folds('p2', 'p3'),
		'Uncalled bet ($0.15) returned to p6',
		'p6 collected $0.25 from pot',
	];
	const seesFlop = [
		...folds('p2', 'p3'),
		'*** FLOP *** [Kd 7s 2c]',
		'p6: bets $0.30',
		'hero: folds',
		'Uncalled bet ($0.30) returned to p6',
		'p6 collected $0.65 from pot',
	];

	it('flags a loose cold call on the button', () => {
		const call = versusOpen('Jc 2c', 'hero: calls $0.25', seesFlop, '0.65');
		expect(call).toMatchObject({
			spot: 'BTN vs CO, facing an open',
			recommended: 'fold',
			mistake: 'cold-call-loose',
		});
		// Priced from equity against the opener: well under the 60% cap of 1.5bb.
		expect(call.evLostBb).toBeLessThan(-0.15);
		expect(call.evLostBb).toBeGreaterThan(-1.5);
	});

	describe('priced from equity', () => {
		it('costs a loose call what it loses against the opener, not a share of the call', () => {
			const call = versusOpen('Jc 2c', 'hero: calls $0.25', seesFlop, '0.65');
			const { priced } = call.preflop!;
			expect(priced!.equity).toBeGreaterThan(0.3);
			expect(priced!.equity).toBeLessThan(0.45);
			expect(priced!.realisation).toBeCloseTo(0.95);
			expect(priced!.evBb).toBeLessThan(0);
			expect(call.evLostBb).toBeCloseTo(priced!.evBb, 5);
			expect(call.explanation).toMatch(
				/Against the raiser's range it has about \d+% equity/
			);
		});

		it('is a price and not a lookup, so confidence is medium at best', () => {
			const call = versusOpen('Jc 2c', 'hero: calls $0.25', seesFlop, '0.65');
			expect(call.confidence).toBe('medium');
		});

		it('drops a loose call the equity says is fine', () => {
			// Suited and connected in position against a late open has the price.
			const call = versusOpen('Ac 8d', 'hero: calls $0.25', seesFlop, '0.65');
			expect(call.preflop).toMatchObject({ call: 0, raise: 0 });
			expect(call.preflop!.priced!.evBb).toBeGreaterThan(0.2);
			expect(call).toMatchObject({ mistake: null, evLostBb: 0 });
		});

		it('costs a fold what the call was worth, and nothing for a hand it was not', () => {
			const fold = versusOpen('9c 9d', 'hero: folds', takesIt, '0.25');
			expect(fold).toMatchObject({ mistake: 'fold-vs-open', confidence: 'medium' });
			expect(fold.preflop!.priced!.evBb).toBeGreaterThan(0.5);
			expect(fold.evLostBb).toBeCloseTo(-fold.preflop!.priced!.evBb, 5);
			expect(versusOpen('Jc 2c', 'hero: folds', takesIt, '0.25').evLostBb).toBe(0);
		});

		it('is low confidence against a min-raise, which the charts do not price', () => {
			const [call] = grade({
				heroCards: 'Jc 2c',
				button: 1,
				lines: [
					...BLINDS_HERO_BTN,
					'*** HOLE CARDS ***',
					...folds('p4', 'p5'),
					'p6: raises $0.10 to $0.20',
					'hero: calls $0.20',
					...folds('p2', 'p3'),
					'*** FLOP *** [Kd 7s 2c]',
					'p6: bets $0.30',
					'hero: folds',
					'Uncalled bet ($0.30) returned to p6',
					'p6 collected $0.55 from pot',
				],
				pot: '0.55',
				winner: 'p6',
			});
			expect(call.confidence).toBe('low');
			expect(call.preflop!.priced).toBeDefined();
		});

		it('is the same every time, for the same seed', () => {
			const again = () =>
				versusOpen('Jc 2c', 'hero: calls $0.25', seesFlop, '0.65').evLostBb;
			expect(again()).toBe(again());
		});
	});

	it('accepts a standard call and a standard fold', () => {
		expect(versusOpen('9c 9d', 'hero: calls $0.25', seesFlop, '0.65').mistake).toBeNull();
		expect(versusOpen('Jc 2c', 'hero: folds', takesIt, '0.25').mistake).toBeNull();
	});

	it('flags calling where the chart only 3-bets, and folding a monster', () => {
		expect(versusOpen('Ac Ad', 'hero: calls $0.25', seesFlop, '0.65')).toMatchObject({
			recommended: 'raise',
			mistake: 'missed-three-bet',
		});
		expect(versusOpen('Ac Ad', 'hero: folds', takesIt, '0.25')).toMatchObject({
			mistake: 'fold-vs-open',
			severity: 'blunder',
		});
	});
});

describe('grading a shove faced preflop', () => {
	const replays = parseHistory(emailed).map(replayHand);
	const stackOff = replays.at(-1)!;
	const gradings = decisionsOf(stackOff, 'hero77').map((step) =>
		gradeDecision(stackOff, step, OPTIONS)
	);

	it('prices kings calling off 47 big blinds as correct', () => {
		const call = gradings[2];
		expect(call).toMatchObject({
			chosen: 'call',
			recommended: 'call',
			mistake: null,
			confidence: 'medium',
		});
		expect(call.spot).toMatch(/all-in$/);
		expect(call.preflop!.equity).toBeGreaterThan(0.6);
		expect(call.preflop!.potOdds).toBeCloseTo(151 / (416 - 94 + 151), 3);
		expect(call.preflop!.callEvBb).toBeGreaterThan(5);
	});

	it('passes the open and the 4-bet with kings', () => {
		expect(gradings[0].mistake).toBeNull();
		expect(gradings[1]).toMatchObject({ recommended: 'raise', evLostBb: 0 });
	});

	it('never reports a gain, and reports zero exactly when no mistake is named', () => {
		const all = replays.flatMap((replay) =>
			decisionsOf(replay, 'hero77').map((step) => gradeDecision(replay, step, OPTIONS))
		);
		expect(all.length).toBeGreaterThan(5);
		for (const grading of all) {
			expect(grading.evLostBb).toBeLessThanOrEqual(0);
			expect(grading.mistake === null).toBe(grading.evLostBb === 0);
			expect(grading.mistake === null).toBe(grading.severity === 'ok');
			expect(grading.explanation.length).toBeGreaterThan(20);
		}
	});

	it('does not call a routine call-off a good play', () => {
		// Kings are a favourite: the call is right, and it is not a hard one.
		expect(gradings[2].preflop!.callEvBb).toBeGreaterThan(5);
		expect(gradings[2].goodPlay).toBeNull();
	});
});

describe('grading postflop', () => {
	/** Hero opens the small blind, the big blind calls, and they see `streets`. */
	const blindBattle = (
		heroCards: string,
		streets: string[],
		pot: string,
		winner: string
	) =>
		grade({
			heroCards,
			button: 6,
			lines: [
				...BLINDS_HERO_SB,
				'*** HOLE CARDS ***',
				...folds('p3', 'p4', 'p5', 'p6'),
				'hero: raises $0.20 to $0.30',
				'p2: calls $0.20',
				...streets,
			],
			pot,
			winner,
		});

	const checkedDown = (river: string) => [
		'*** FLOP *** [Kd 7s 2c]',
		'hero: bets $0.20',
		'p2: calls $0.20',
		'*** TURN *** [Kd 7s 2c] [3h]',
		'hero: bets $0.50',
		'p2: calls $0.50',
		'*** RIVER *** [Kd 7s 2c 3h] [9d]',
		river,
	];

	it('flags checking the river with a hand that gets called by worse', () => {
		const gradings = blindBattle(
			'Ks Kh',
			[
				...checkedDown('hero: checks'),
				'p2: checks',
				'*** SHOW DOWN ***',
				'hero: shows [Ks Kh] (three of a kind, Kings)',
				'p2: mucks hand',
				'hero collected $2 from pot',
			],
			'2',
			'hero'
		);
		const river = gradings.at(-1)!;
		expect(river).toMatchObject({
			street: 'river',
			chosen: 'check',
			recommended: 'bet',
			mistake: 'missed-value',
		});
		expect(river.postflop).toMatchObject({
			handText: 'a set',
			opponents: 1,
			inPosition: false,
		});
		expect(river.postflop!.equity).toBeGreaterThan(0.9);
		expect(river.postflop!.calledEquity).toBeGreaterThan(0.8);
		expect(river.explanation).toMatch(/Worse hands call/);
		// The flop and turn value bets are fine.
		expect(gradings[1].mistake).toBeNull();
		expect(gradings[2].mistake).toBeNull();
	});

	describe('against a short stack', () => {
		/** The big blind has 20bb; hero opens top pair's worth and they see a flop. */
		const shortStacked = (streets: string[], pot: string) =>
			grade({
				heroCards: 'As Kc',
				button: 6,
				stacks: { p2: 2 },
				lines: [
					...BLINDS_HERO_SB,
					'*** HOLE CARDS ***',
					...folds('p3', 'p4', 'p5', 'p6'),
					'hero: raises $0.20 to $0.30',
					'p2: calls $0.20',
					'*** FLOP *** [Kd 7s 2c]',
					...streets,
				],
				pot,
				winner: 'hero',
			});

		it('treats a shove the hero covers as all-in, cards to come or not', () => {
			const call = shortStacked(
				[
					'hero: bets $0.20',
					'p2: raises $1.50 to $1.70 and is all-in',
					'hero: calls $1.50',
					'*** TURN *** [Kd 7s 2c] [3h]',
					'*** RIVER *** [Kd 7s 2c 3h] [9d]',
					'*** SHOW DOWN ***',
					'hero: shows [As Kc] (a pair of Kings)',
					'p2: mucks hand',
					'hero collected $4 from pot',
				],
				'4'
			).at(-1)!;
			// No betting is left, so the equity is all realised and the price is exact.
			expect(call).toMatchObject({ chosen: 'call', mistake: null, confidence: 'medium' });
			const { equity, potOdds, callEvBb } = call.postflop!;
			expect(callEvBb).toBeCloseTo((equity * 0.95 * 4 - 1.5) * 10, 5);
			expect(potOdds).toBeCloseTo(1.5 / 4, 5);
		});

		it('prices a bet over the stack on the part that can be called', () => {
			const bet = shortStacked(
				[
					'hero: bets $3',
					'p2: folds',
					'Uncalled bet ($3) returned to hero',
					'hero collected $0.60 from pot',
				],
				'0.60'
			).at(-1)!;
			expect(bet.chosen).toBe('bet');
			expect(bet.postflop!.betSize).toBeCloseTo(1.7 / 0.6, 5);
		});
	});

	it('flags calling a river shove with nothing', () => {
		const gradings = blindBattle(
			'5h 4h',
			[
				...checkedDown('hero: checks'),
				'p2: bets $4',
				'hero: calls $4',
				'*** SHOW DOWN ***',
				'p2: shows [Kc Qc] (a pair of Kings)',
				'hero: mucks hand',
				'p2 collected $10 from pot',
			],
			'10',
			'p2'
		);
		const call = gradings.at(-1)!;
		expect(call).toMatchObject({
			chosen: 'call',
			recommended: 'fold',
			mistake: 'call-without-odds',
		});
		expect(call.postflop!.equity).toBeLessThan(call.postflop!.potOdds!);
		expect(call.postflop!.callEvBb).toBeLessThan(-5);
		expect(call.severity).toBe('blunder');
	});

	it('accepts folding that same hand', () => {
		const gradings = blindBattle(
			'5h 4h',
			[
				...checkedDown('hero: checks'),
				'p2: bets $4',
				'hero: folds',
				'Uncalled bet ($4) returned to p2',
				'p2 collected $2 from pot',
			],
			'2',
			'p2'
		);
		expect(gradings.at(-1)).toMatchObject({ chosen: 'fold', mistake: null, evLostBb: 0 });
	});

	it('flags folding the nuts to a bet', () => {
		const gradings = blindBattle(
			'Ks Kh',
			[
				...checkedDown('hero: checks'),
				'p2: bets $1',
				'hero: folds',
				'Uncalled bet ($1) returned to p2',
				'p2 collected $2 from pot',
			],
			'2',
			'p2'
		);
		const fold = gradings.at(-1)!;
		expect(fold).toMatchObject({ recommended: 'call', mistake: 'fold-with-odds' });
		expect(fold.postflop!.standing).toBeGreaterThan(0.9);
	});
});

describe('good plays', () => {
	describe('the scale', () => {
		const avoided = {
			choice: 'call',
			mistake: 'call-without-odds',
			evLostBb: -2,
			confidence: 'medium',
			hard: true,
		} as const;

		it('ranks a play by what the other action would have cost', () => {
			expect(goodPlayOf(avoided)).toEqual({
				type: 'tough-fold',
				rank: 'great',
				evGainedBb: 2,
				alternative: 'call',
				avoided: 'call-without-odds',
			});
			expect(goodPlayOf({ ...avoided, evLostBb: -0.8 })?.rank).toBe('good');
		});

		it('keeps "great" for findings the model can stand behind', () => {
			expect(goodPlayOf({ ...avoided, confidence: 'low' })?.rank).toBe('good');
		});

		it('names nothing that was easy, small, or not an avoided mistake', () => {
			expect(goodPlayOf(undefined)).toBeNull();
			expect(goodPlayOf({ ...avoided, hard: false })).toBeNull();
			expect(goodPlayOf({ ...avoided, evLostBb: -0.3 })).toBeNull();
			expect(goodPlayOf({ ...avoided, mistake: 'bet-thin' })).toBeNull();
		});
	});

	describe('a shove faced preflop', () => {
		const shortShove = (
			heroCards: string,
			heroLine: string,
			tail: string[],
			pot: string
		) =>
			grade({
				heroCards,
				button: 1,
				stacks: { p2: 0.6 },
				lines: [
					...BLINDS_HERO_BTN,
					'*** HOLE CARDS ***',
					...folds('p4', 'p5', 'p6'),
					'hero: raises $0.15 to $0.25',
					'p2: raises $0.35 to $0.60 and is all-in',
					'p3: folds',
					heroLine,
					...tail,
				],
				pot,
				winner: 'p2',
			}).at(-1)!;
		const runout = [
			'*** FLOP *** [Kd 7s 2c]',
			'*** TURN *** [Kd 7s 2c] [3h]',
			'*** RIVER *** [Kd 7s 2c 3h] [9d]',
			'*** SHOW DOWN ***',
			'p2: shows [Ad Ah] (a pair of Aces)',
			'hero: mucks hand',
			'p2 collected $1.30 from pot',
		];

		it('praises laying down a premium that does not have the price', () => {
			const fold = grade(TOUGH_FOLD).at(-1)!;
			expect(fold).toMatchObject({
				chosen: 'fold',
				recommended: 'fold',
				mistake: null,
				evLostBb: 0,
				severity: 'ok',
				goodPlay: {
					type: 'tough-fold',
					rank: 'great',
					alternative: 'call',
					avoided: 'stackoff-loose',
				},
			});
			expect(fold.goodPlay!.evGainedBb).toBeCloseTo(-fold.preflop!.callEvBb!);
			expect(fold.goodPlay!.evGainedBb).toBeGreaterThan(5);
			expect(fold.explanation).toMatch(/hard to let go.*calling would have given up/);
		});

		it('praises calling a short stack as the underdog', () => {
			const call = shortShove('Qs Js', 'hero: calls $0.35', runout, '1.30');
			expect(call).toMatchObject({
				chosen: 'call',
				mistake: null,
				goodPlay: { type: 'tough-call', alternative: 'fold', avoided: 'stackoff-tight' },
			});
			expect(call.preflop!.equity).toBeLessThan(0.45);
			expect(call.preflop!.equity).toBeGreaterThan(call.preflop!.potOdds!);
			expect(call.explanation).toMatch(/behind more often than not/);
		});

		it('does not praise folding a hand that was never strong', () => {
			const fold = grade({
				...TOUGH_FOLD,
				id: undefined,
				heroCards: '7c 2d',
			}).at(-1)!;
			expect(fold).toMatchObject({ chosen: 'fold', mistake: null, goodPlay: null });
		});
	});

	describe('postflop', () => {
		const river = (heroLine: string, tail: string[], pot: string) =>
			grade({
				heroCards: 'Ah 7h',
				button: 6,
				lines: [
					...BLINDS_HERO_SB,
					'*** HOLE CARDS ***',
					...folds('p3', 'p4', 'p5', 'p6'),
					'hero: raises $0.20 to $0.30',
					'p2: calls $0.20',
					'*** FLOP *** [Kd 7s 2c]',
					'hero: bets $0.20',
					'p2: calls $0.20',
					'*** TURN *** [Kd 7s 2c] [3h]',
					'hero: bets $0.50',
					'p2: calls $0.50',
					'*** RIVER *** [Kd 7s 2c 3h] [9d]',
					'hero: checks',
					heroLine,
					...tail,
				],
				pot,
				winner: 'p2',
			}).at(-1)!;

		it('praises a river call made behind, where folding gives up the price', () => {
			const call = river(
				'p2: bets $0.50',
				[
					'hero: calls $0.50',
					'*** SHOW DOWN ***',
					'p2: shows [Kc Qc] (a pair of Kings)',
					'hero: mucks hand',
					'p2 collected $3 from pot',
				],
				'3'
			);
			expect(call).toMatchObject({
				street: 'river',
				chosen: 'call',
				recommended: 'call',
				mistake: null,
				confidence: 'medium',
				goodPlay: { type: 'tough-call', rank: 'great', avoided: 'fold-with-odds' },
			});
			expect(call.postflop!.equity).toBeLessThan(0.45);
			expect(call.goodPlay!.evGainedBb).toBeCloseTo(call.postflop!.callEvBb!);
		});

		it('praises laying down queens under a king to a bet and a raise', () => {
			const fold = grade({
				heroCards: 'Qs Qh',
				button: 4,
				lines: [
					...BLINDS_HERO_UTG,
					'*** HOLE CARDS ***',
					'hero: raises $0.15 to $0.25',
					...folds('p2', 'p3', 'p4'),
					'p5: calls $0.20',
					'p6: calls $0.15',
					'*** FLOP *** [Kd 7s 2c]',
					'p5: bets $0.75',
					'p6: raises $1.75 to $2.50',
					'hero: folds',
					'p5: folds',
					'Uncalled bet ($1.75) returned to p6',
					'p6 collected $2.25 from pot',
				],
				pot: '2.25',
				winner: 'p6',
			}).at(-1)!;
			expect(fold).toMatchObject({
				chosen: 'fold',
				mistake: null,
				confidence: 'low',
				// Several bb, but with cards to come and two opponents it stays "good".
				goodPlay: { type: 'tough-fold', rank: 'good', avoided: 'call-without-odds' },
			});
			expect(fold.goodPlay!.evGainedBb).toBeGreaterThan(1.5);
			expect(fold.postflop!.standing).toBeGreaterThan(0.5);
		});

		it('does not praise folding nothing to a shove', () => {
			const fold = grade({
				heroCards: '5h 4h',
				button: 6,
				lines: [
					...BLINDS_HERO_SB,
					'*** HOLE CARDS ***',
					...folds('p3', 'p4', 'p5', 'p6'),
					'hero: raises $0.20 to $0.30',
					'p2: calls $0.20',
					'*** FLOP *** [Kd 7s 2c]',
					'hero: checks',
					'p2: bets $4',
					'hero: folds',
					'Uncalled bet ($4) returned to p2',
					'p2 collected $0.60 from pot',
				],
				pot: '0.60',
				winner: 'p2',
			}).at(-1)!;
			expect(fold).toMatchObject({ chosen: 'fold', mistake: null, goodPlay: null });
		});
	});
});

describe('what a preflop grade records', () => {
	const first = (text: string) => {
		const replay = replayHand(parseHistory(text)[0]);
		return gradeDecision(replay, decisionsOf(replay, 'hero')[0], OPTIONS);
	};

	it('keeps the kind of spot, for the Review filter', () => {
		expect(firstIn('As Kd', 'raise').preflop!.scenario).toBe('rfi');
		const [open, facing] = grade(TOUGH_FOLD);
		expect(open.preflop!.scenario).toBe('rfi');
		expect(facing.preflop!.scenario).toBe('vs3bet');
	});

	describe('from a seat earlier than any chart', () => {
		const early = first(ringHand(9, '7c 2d', 'raise'));

		it('grades against UTG’s chart at medium confidence, and says so', () => {
			expect(early).toMatchObject({
				spot: 'UTG, first in',
				confidence: 'medium',
				mistake: 'open-loose',
			});
			expect(early.preflop).toMatchObject({ chart: 'rfiUtg', standIn: 'hero' });
			expect(early.explanation).toContain('the UTG chart stands in');
		});

		it('says nothing of it at six players', () => {
			const six = first(ringHand(6, '7c 2d', 'raise'));
			expect(six.confidence).toBe('high');
			expect(six.preflop!.standIn).toBeUndefined();
			expect(six.explanation).not.toContain('stands in');
		});
	});
});

describe('the share of equity a priced call realises', () => {
	/** Hero's last decision in a hand that stops once it is made. */
	const realisedAt = (button: number, lines: string[]): number => {
		const replay = replayHand(
			parseHistory(
				handText({ heroCards: 'Ah Qd', button, lines, pot: '1.00', winner: 'hero' })
			)[0]
		);
		const step = decisionsOf(replay, 'hero').at(-1)!;
		const spot = classifyPreflop(replay, step);
		return priceCall(replay, step, spot, { rake: 0.05, seed: 1 })!.realisation;
	};

	describe('heads-up', () => {
		it('is fuller in position: the button against the cutoff', () => {
			expect(
				realisedAt(1, [
					...BLINDS_HERO_BTN,
					'*** HOLE CARDS ***',
					'p4: folds',
					'p5: folds',
					'p6: raises $0.15 to $0.25',
					'hero: calls $0.25',
				])
			).toBeCloseTo(0.95);
		});

		it('is smaller out of position: the big blind against the cutoff', () => {
			expect(
				realisedAt(5, [
					'p6: posts small blind $0.05',
					'hero: posts big blind $0.10',
					'*** HOLE CARDS ***',
					'p2: folds',
					'p3: folds',
					'p4: raises $0.15 to $0.25',
					'p5: folds',
					'p6: folds',
					'hero: calls $0.15',
				])
			).toBeCloseTo(0.8);
		});

		it('puts the big blind in position against the small blind', () => {
			expect(
				realisedAt(5, [
					'p6: posts small blind $0.05',
					'hero: posts big blind $0.10',
					'*** HOLE CARDS ***',
					'p2: folds',
					'p3: folds',
					'p4: folds',
					'p5: folds',
					'p6: raises $0.20 to $0.30',
					'hero: calls $0.20',
				])
			).toBeCloseTo(0.95);
		});

		it('is fuller in a 3-bet pot, where the stacks are short against it', () => {
			// Hero opens under the gun and calls the button's 3-bet out of position.
			expect(
				realisedAt(4, [
					...BLINDS_HERO_UTG,
					'*** HOLE CARDS ***',
					'hero: raises $0.15 to $0.25',
					'p2: folds',
					'p3: folds',
					'p4: raises $0.55 to $0.80',
					'p5: folds',
					'p6: folds',
					'hero: calls $0.55',
				])
			).toBeCloseTo(0.9);
		});
	});

	it('shrinks for each player who has called already', () => {
		expect(
			realisedAt(1, [
				...BLINDS_HERO_BTN,
				'*** HOLE CARDS ***',
				'p4: raises $0.15 to $0.25',
				'p5: calls $0.25',
				'p6: folds',
				'hero: calls $0.25',
			])
		).toBeCloseTo(0.95 * 0.9);
	});
});
