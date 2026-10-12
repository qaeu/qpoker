import { describe, expect, it } from 'vitest';

import { analyzeLog, type HandReport } from '#utils/coach/report';
import { parseHistory } from '#utils/history/parse';
import { replayHand, type Replay } from '#utils/history/replay';
import {
	decisionSteps,
	defaultStep,
	resolveStep,
	seatSlots,
	stepFacts,
	stepOfLine,
	stepStreet,
	stepText,
	tableSteps,
	type TableStep,
} from '#utils/ui/tableReplay';

import emailed from '../../fixtures/emailed.txt?raw';
import {
	BLINDS_HERO_BTN,
	BLINDS_HERO_SB,
	handText,
	NINE_SEATS,
	ringHand,
	RIVER_HERO_CALL,
	TOUGH_FOLD,
	type HandSpec,
} from '../history/handText';

const folds = (...names: string[]) => names.map((name) => `${name}: folds`);

/** Hero shoves over a two-dollar stack before the flop: most of it comes back. */
const ALL_IN_RUNOUT: HandSpec = {
	id: 8001,
	heroCards: 'Ah Ad',
	button: 6,
	stacks: { p2: 2 },
	lines: [
		...BLINDS_HERO_SB,
		'*** HOLE CARDS ***',
		...folds('p3', 'p4', 'p5', 'p6'),
		'hero: raises $9.95 to $10 and is all-in',
		'p2: calls $1.90 and is all-in',
		'Uncalled bet ($8) returned to hero',
		'*** FLOP *** [Kd 7s 2c]',
		'*** TURN *** [Kd 7s 2c] [3h]',
		'*** RIVER *** [Kd 7s 2c 3h] [9d]',
		'*** SHOW DOWN ***',
		'p2: shows [Kc Qc] (a pair of Kings)',
		'hero: shows [Ah Ad] (a pair of Aces)',
		'hero collected $4 from pot',
	],
	pot: '4',
	winner: 'hero',
};

/** Three seats in the hand: the hero on the button, and the blinds. */
const THREE_HANDED: HandSpec = {
	id: 8002,
	heroCards: 'Ah Kd',
	button: 1,
	lines: [
		...BLINDS_HERO_BTN,
		'*** HOLE CARDS ***',
		'hero: raises $0.15 to $0.25',
		'p2: folds',
		'p3: calls $0.15',
		'*** FLOP *** [Kd 7s 2c]',
		'p3: checks',
		'hero: bets $0.30',
		'p3: folds',
		'Uncalled bet ($0.30) returned to hero',
		'hero collected $0.55 from pot',
	],
	pot: '0.55',
	winner: 'hero',
};

interface Case {
	hand: HandReport;
	replay: Replay;
	steps: TableStep[];
}

function replayed(text: string, index = 0): Case {
	const report = analyzeLog(text);
	const hand = report.hands[index];
	const parsed = parseHistory(text).find(({ id }) => id === hand.id)!;
	return { hand, replay: replayHand(parsed), steps: tableSteps(hand) };
}

const CASES: [string, Case][] = [
	['a preflop fold to a shove', replayed(handText(TOUGH_FOLD))],
	['a called river', replayed(handText(RIVER_HERO_CALL))],
	['an all-in run out', replayed(handText(ALL_IN_RUNOUT))],
	['a three-handed pot', replayed(handText(THREE_HANDED))],
	['a raked five-handed all-in', replayed(emailed, 3)],
];

const chips = (step: TableStep) =>
	step.pot + step.seats.reduce((sum, seat) => sum + seat.stack, 0);

describe('tableSteps', () => {
	describe.each(CASES)('%s', (_, { hand, replay, steps }) => {
		const start = hand.seats.reduce((sum, seat) => sum + seat.stack, 0);

		it('keeps every chip on the table until the pot is paid', () => {
			for (const step of steps.slice(0, -1)) expect(chips(step)).toBe(start);
		});

		it('faces each actor with what the engine says they faced', () => {
			const actions = steps.filter((step) => step.kind === 'action');
			const engine = replay.steps.filter((step) => !step.action.kind.startsWith('post-'));
			expect(actions.map((step) => step.lineIndex)).toEqual(
				engine.map((step) => step.index)
			);
			for (const [i, step] of actions.entries()) {
				expect(step.potBefore).toBe(engine[i].potBefore);
				expect(step.toCall).toBe(engine[i].toCall);
				expect(hand.seats[step.actor!].name).toBe(engine[i].action.player);
			}
		});

		it('ends with each stack moved by the hand’s result', () => {
			const last = steps.at(-1)!;
			expect(last.kind).toBe('result');
			for (const [i, seat] of hand.seats.entries()) {
				expect(last.seats[i].stack).toBe(seat.stack + replay.net[seat.name]);
				expect(last.seats[i].bet).toBe(0);
			}
		});

		it('starts at the deal and never takes a card back', () => {
			expect(steps[0]).toMatchObject({ kind: 'deal', street: 'preflop', boardCount: 0 });
			const counts = steps.map((step) => step.boardCount);
			expect(counts).toEqual([...counts].sort((a, b) => a - b));
			expect(counts.at(-1)).toBe(hand.board.split(' ').filter(Boolean).length);
		});
	});

	describe('the deal', () => {
		const { hand, steps } = replayed(handText(TOUGH_FOLD));

		it('has the blinds out before the first decision', () => {
			const bets = Object.fromEntries(
				hand.seats.map((seat, i) => [seat.name, steps[0].seats[i]])
			);
			expect(bets.p5).toMatchObject({ bet: 5, stack: 995, last: 'post-sb' });
			expect(bets.p6).toMatchObject({ bet: 10, stack: 990, last: 'post-bb' });
			expect(steps[0].pot).toBe(15);
			expect(steps[1]).toMatchObject({ kind: 'action', lineIndex: 2, toCall: 10 });
		});

		it('shows the hero’s cards and nobody else’s', () => {
			const faces = steps[0].seats.map((seat) => seat.cards);
			expect(faces.filter(Boolean)).toEqual(['Ac Qd']);
			expect(hand.seats[faces.findIndex(Boolean)].hero).toBe(true);
		});
	});

	describe('a new street', () => {
		const { steps } = replayed(handText(RIVER_HERO_CALL));
		const flop = steps.find((step) => step.kind === 'deal' && step.street === 'flop')!;

		it('sweeps the bets into the pot and clears what the seats last did', () => {
			expect(flop).toMatchObject({
				boardCount: 3,
				dealt: [0, 3],
				collected: 60,
				pot: 60,
			});
			expect(flop.seats.every((seat) => seat.bet === 0)).toBe(true);
			expect(flop.seats.filter((seat) => !seat.folded).map((seat) => seat.last)).toEqual([
				null,
				null,
			]);
		});

		it('turns one card on the turn and the river', () => {
			const dealt = steps
				.filter((step) => step.kind === 'deal')
				.map((step) => step.dealt);
			expect(dealt).toEqual([
				[0, 0],
				[0, 3],
				[3, 4],
				[4, 5],
			]);
		});
	});

	describe('an uncalled bet', () => {
		it('goes back at the result when the hand ends there', () => {
			const { hand, steps } = replayed(handText(TOUGH_FOLD));
			const shover = hand.seats.findIndex((seat) => seat.name === 'p6');
			expect(steps.at(-2)!.seats[shover]).toMatchObject({ bet: 1000, stack: 0 });
			// 760 uncalled and the 485 pot.
			expect(steps.at(-1)!.seats[shover]).toMatchObject({ stack: 1245, last: 'wins' });
			expect(steps.at(-1)!.pot).toBe(485);
		});

		it('goes back before the board is run out', () => {
			const { hand, steps } = replayed(handText(ALL_IN_RUNOUT));
			const hero = hand.seats.findIndex((seat) => seat.hero);
			const flop = steps.find((step) => step.street === 'flop')!;
			expect(flop).toMatchObject({ kind: 'deal', pot: 400 });
			expect(flop.seats[hero]).toMatchObject({ stack: 800, allIn: true });
			expect(steps.slice(-4).map((step) => [step.kind, step.street])).toEqual([
				['deal', 'flop'],
				['deal', 'turn'],
				['deal', 'river'],
				['result', 'river'],
			]);
		});
	});

	describe('the result', () => {
		it('turns over the hands that were shown and marks who was paid', () => {
			const { hand, steps } = replayed(handText(RIVER_HERO_CALL));
			const winner = hand.seats.findIndex((seat) => seat.name === 'p2');
			expect(steps.at(-2)!.seats[winner].cards).toBeNull();
			expect(steps.at(-1)!.seats[winner]).toMatchObject({ cards: 'Kc Qc', last: 'wins' });
			expect(steps.at(-1)!.pot).toBe(1000);
		});
	});

	it('has nothing to replay without a layout', () => {
		const { hand } = replayed(handText(TOUGH_FOLD));
		expect(tableSteps({ ...hand, seats: [] })).toEqual([]);
	});
});

describe('seatSlots', () => {
	const slotOf = ({ hand }: Case) =>
		Object.fromEntries(hand.seats.map((seat, i) => [seat.name, seatSlots(hand)[i]]));

	it('puts the hero at the bottom and the rest clockwise in acting order', () => {
		// Under the gun: the hero acts first, the big blind last.
		expect(slotOf(replayed(handText(TOUGH_FOLD)))).toEqual({
			hero: 0,
			p2: 1,
			p3: 2,
			p4: 3,
			p5: 4,
			p6: 5,
		});
		expect(slotOf(replayed(handText(RIVER_HERO_CALL))).hero).toBe(0);
	});

	it('spreads a short table over the six places', () => {
		expect(slotOf(replayed(handText(THREE_HANDED)))).toEqual({ hero: 0, p2: 2, p3: 4 });
		expect(new Set(seatSlots(replayed(emailed, 3).hand))).toEqual(
			new Set([0, 1, 2, 4, 5])
		);
	});

	it('seats the first to act at the bottom when the hero was not dealt in', () => {
		const { hand } = replayed(handText(TOUGH_FOLD));
		const without = {
			...hand,
			seats: hand.seats.slice(1).map((seat) => ({ ...seat, hero: false })),
		};
		expect(seatSlots(without)[0]).toBe(0);
	});

	describe('past six players', () => {
		const slots = (players: number) => seatSlots(replayed(ringHand(players)).hand);

		it('seats nine round a ring of nine places of its own', () => {
			expect(slots(9)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
		});

		it('leaves places empty at seven and eight, the hero still at the bottom', () => {
			expect(slots(7)).toEqual([10, 12, 13, 14, 15, 16, 17]);
			expect(slots(8)).toEqual([10, 11, 12, 13, 14, 15, 16, 17]);
		});

		it('replays the table as it does a smaller one', () => {
			const { hand, steps } = replayed(ringHand(9, 'As Kd', 'cbet'));
			expect(steps[0].seats).toHaveLength(9);
			expect(steps.at(-1)).toMatchObject({ kind: 'result', pot: 55 });
			expect(hand.seats.map((seat) => seat.position)).toContain('UTG+2');
		});

		it('draws nothing for a table past nine', () => {
			const { hand } = replayed(ringHand(9));
			const tenth = { ...hand.seats[1], name: 'p10' };
			expect(tableSteps({ ...hand, seats: [...hand.seats, tenth] })).toEqual([]);
			expect(NINE_SEATS).toHaveLength(9);
		});
	});
});

describe('finding a step', () => {
	const { hand, steps } = replayed(handText(RIVER_HERO_CALL));

	it('maps a line to its step, and a blind to the deal', () => {
		const call = hand.lines.findLast((line) => line.hero)!;
		expect(steps[stepOfLine(steps, call.stepIndex)].lineIndex).toBe(call.stepIndex);
		expect(stepOfLine(steps, 0)).toBe(0);
	});

	it('lists the hero’s decisions, blinds left out', () => {
		const decisions = decisionSteps(steps, hand);
		expect(decisions.map((index) => steps[index].lineIndex)).toEqual(
			hand.gradings.map((grading) => grading.stepIndex)
		);
	});

	it('opens a hand on its first finding, or at the deal', () => {
		const finding = hand.gradings.find((grading) => grading.mistake)!;
		expect(steps[defaultStep(steps, hand)].lineIndex).toBe(finding.stepIndex);
		expect(defaultStep(steps, { ...hand, gradings: [] })).toBe(0);
	});

	it('opens on the good play when that is what is being listed', () => {
		const fold = replayed(handText(TOUGH_FOLD));
		const play = fold.hand.gradings.find((grading) => grading.goodPlay)!;
		const mistake = fold.hand.gradings.find((grading) => grading.mistake)!;
		expect(mistake.stepIndex).toBeLessThan(play.stepIndex);
		const at = (prefer?: 'play') =>
			fold.steps[defaultStep(fold.steps, fold.hand, prefer)].lineIndex;
		expect(at()).toBe(mistake.stepIndex);
		expect(at('play')).toBe(play.stepIndex);
		expect(resolveStep(fold.steps, fold.hand, null, 'play')).toBe(
			defaultStep(fold.steps, fold.hand, 'play')
		);
		// With no play to prefer, a hand opens as it would anyway.
		expect(defaultStep(steps, hand, 'play')).toBe(defaultStep(steps, hand));
	});

	it('holds a step from the route inside the hand', () => {
		expect(resolveStep(steps, hand, 3)).toBe(3);
		expect(resolveStep(steps, hand, 999)).toBe(steps.length - 1);
		expect(resolveStep(steps, hand, null)).toBe(defaultStep(steps, hand));
		expect(resolveStep([], hand, 4)).toBe(0);
	});
});

describe('stepText', () => {
	const { hand, steps } = replayed(handText(RIVER_HERO_CALL));
	const texts = steps.map((step) => stepText(hand, step));

	it('says each step in big blinds', () => {
		expect(texts[0]).toBe('Blinds posted, cards dealt');
		expect(texts).toContain('hero raises to 3 bb');
		expect(texts).toContain('p2 calls 2 bb');
		expect(texts).toContain('Flop dealt');
		expect(texts).toContain('hero checks');
		expect(texts).toContain('p2 bets 40 bb');
		expect(texts.at(-1)).toBe('p2 wins 100 bb');
	});

	it('marks an all-in', () => {
		const shove = replayed(handText(TOUGH_FOLD));
		expect(shove.steps.map((step) => stepText(shove.hand, step))).toContain(
			'p6 raises to 100 bb (all-in)'
		);
	});

	it('names the street, and the showdown when hands were turned over', () => {
		expect(stepStreet(hand, steps[0])).toBe('Preflop');
		expect(stepStreet(hand, steps.at(-1)!)).toBe('Showdown');
		const fold = replayed(handText(TOUGH_FOLD));
		expect(stepStreet(fold.hand, fold.steps.at(-1)!)).toBe('Result');
	});
});

describe('stepFacts', () => {
	const { hand, steps } = replayed(handText(RIVER_HERO_CALL));
	const facts = (text: string) =>
		stepFacts(
			hand,
			steps.find((step) => stepText(hand, step) === text)!
		);

	it('gives the pot and who is still in', () => {
		expect(stepFacts(hand, steps[0])).toBe('Pot 1.5 bb · 6 players in');
		expect(facts('Flop dealt')).toBe('Pot 6 bb · 2 players in');
	});

	it('gives the hero the price of a bet they faced', () => {
		expect(facts('hero calls 40 bb')).toBe('40 bb to call into 60 bb · pot odds 40%');
		// Completing from the small blind is a price too.
		expect(facts('hero raises to 3 bb')).toBe(
			'0.5 bb to call into 1.5 bb · pot odds 25%'
		);
	});

	it('gives nobody else one, nor the hero when checked to', () => {
		expect(facts('p2 calls 5 bb')).toBe('Pot 20 bb · 2 players in');
		expect(facts('hero checks')).toBe('Pot 20 bb · 2 players in');
	});

	it('counts one player in the singular', () => {
		const fold = replayed(handText(TOUGH_FOLD));
		expect(stepFacts(fold.hand, fold.steps.at(-1)!)).toBe('Pot 48.5 bb · 1 player in');
	});
});
