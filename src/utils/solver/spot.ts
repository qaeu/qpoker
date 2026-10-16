/**
 * Turns one decision of a replayed hand into a solver input: the start of the
 * decision's street, heads-up, with the model's ranges for both players, and
 * the street's actual actions up to the decision as the prefix the solver walks.
 * Or says why it can't: the solve is for heads-up postflop spots only.
 * See docs/solver.md.
 */

import type { Card } from '../cards/cards';
import { comboIndex } from '../cards/combos';
import { removeDead, type ComboRange } from '../cards/equity';
import type { Street } from '../history/hand';
import type { Replay, Step } from '../history/replay';
import { rangeAt } from '../postflop/villainRange';
import { solverIndex, toSolverOrder } from './cards';
import {
	withActualSizes,
	wasmSizes,
	type LineAction,
	type SolveStreet,
	type TreeSettings,
} from './tree';
import type { WasmAction, WasmInput } from './wasmApi';

export type SolveRefusal =
	| 'preflop'
	| 'multiway'
	| 'unreconciled'
	| 'ungradeable'
	| 'not-hero'
	| 'no-action'
	| 'no-cards'
	| 'all-in'
	| 'threads';

export interface Refusal {
	ok: false;
	reason: SolveRefusal;
	/** In words, for the button's tooltip. */
	message: string;
}

const MESSAGES: Record<SolveRefusal, string> = {
	preflop: 'Only postflop decisions can be solved.',
	multiway: 'Only heads-up spots can be solved: more than two players saw this street.',
	unreconciled: 'The hand’s actions do not add up to its pot, so it cannot be solved.',
	ungradeable: 'This hand has a structure the coach does not model.',
	'not-hero': 'Only the hero’s own decisions can be solved.',
	'no-action': 'There is no decision to solve at this step.',
	'no-cards': 'The hero’s cards are not known.',
	'all-in': 'Nobody has chips behind on this street: there is nothing to decide.',
	threads:
		'A flop would take several minutes on one thread. Open a hosted copy, which runs the solver on every core.',
};

export const refuse = (reason: SolveRefusal): Refusal => ({
	ok: false,
	reason,
	message: MESSAGES[reason],
});

export interface SolverSpot {
	input: WasmInput;
	/** The tree as solved: the settings with this line's actual sizes added. */
	tree: TreeSettings;
	street: SolveStreet;
	stepIndex: number;
	hero: string;
	villain: string;
	/** The hero's seat in the solver: 0 out of position, 1 in position. */
	side: 0 | 1;
	heroCards: [Card, Card];
	/** The hero's hand in `COMBOS` and in the solver's pair order. */
	heroCombo: number;
	heroPair: number;
	board: Card[];
	/** Cents, at the street's start. */
	pot: number;
	stack: number;
	/** Cents; the hand's big blind, which the result is in. */
	bigBlind: number;
	rake: number;
	/** What the hero did, as the solver names it. */
	chosen: WasmAction;
	/** Cents the hero had to add to continue. */
	toCall: number;
	/** Combos in each range, for sizing the tree before any solve. */
	ranges: { oop: number; ip: number };
}

/** The rake when a hand carries none: the same default the grader falls back on. */
export const DEFAULT_RAKE = 0.05;

/** A hero combo a range gave no weight is still in it: the hero holds it. */
const HERO_FLOOR = 0.01;

const isStreet = (street: Street): street is SolveStreet => street !== 'preflop';

/** What the actor's action is, as the solver names it. */
function wasmAction(step: Step): WasmAction | null {
	const { action } = step;
	switch (action.kind) {
		case 'fold':
		case 'check':
		case 'call':
			return { kind: action.kind };
		case 'bet':
			return {
				kind: action.allIn ? 'allin' : 'bet',
				to: step.committedBefore + action.amount,
			};
		case 'raise':
			return {
				kind: action.allIn ? 'allin' : 'raise',
				to: action.to ?? step.committedBefore + action.amount,
			};
		default:
			return null;
	}
}

/** How a step sized itself, for the tree to hold the size. */
const lineOf = (step: Step): LineAction => ({
	kind:
		step.action.kind === 'bet' || step.action.kind === 'raise' ?
			step.action.kind
		:	'check',
	to: wasmAction(step)?.to,
	before: step.committedBefore,
	facing: step.streetBet,
	pot: step.potBefore,
});

const comboCount = (range: ComboRange): number =>
	range.reduce((sum, weight) => sum + (weight > 0 ? 1 : 0), 0);

/**
 * The solver input for the hero's decision at `stepIndex` (an index into the
 * hand's actions), or the reason there is none. `rake` is a share of the pot.
 */
export function solverSpot(
	replay: Replay,
	stepIndex: number,
	tree: TreeSettings,
	rake: number = DEFAULT_RAKE
): { ok: true; spot: SolverSpot } | Refusal {
	const { hand } = replay;
	const step = replay.steps.find((candidate) => candidate.index === stepIndex);
	if (!step || !wasmAction(step)) return refuse('no-action');
	if (!isStreet(step.street)) return refuse('preflop');
	if (!hand.gradeable || !replay.layout) return refuse('ungradeable');
	if (!replay.reconciled) return refuse('unreconciled');
	if (!hand.hero || step.action.player !== hand.hero) return refuse('not-hero');
	if (hand.heroCards.length !== 2) return refuse('no-cards');

	const streetSteps = replay.steps.filter(
		(candidate) => candidate.street === step.street
	);
	const first = streetSteps[0];
	if (first.live.length !== 2) return refuse('multiway');
	if (first.canAct.length < 2 || first.effectiveStack <= 0) return refuse('all-in');

	const before = streetSteps.filter((candidate) => candidate.index < stepIndex);
	const prefix: WasmAction[] = [];
	for (const earlier of before) {
		const action = wasmAction(earlier);
		if (!action || action.kind === 'fold') return refuse('no-action');
		prefix.push(action);
	}
	const chosen = wasmAction(step)!;

	const [oop, ip] = first.live;
	const hero = hand.hero;
	const villain = hero === oop ? ip : oop;
	const side = hero === oop ? 0 : 1;
	const holes = hand.heroCards as [Card, Card];
	const board = first.board;

	// Ranges as the model has them when the street opens; the hero's own hand is in theirs.
	const heroCombo = comboIndex(holes[0], holes[1]);
	const heroRange = removeDead(rangeAt(replay, hero, first.index), board);
	if (heroRange[heroCombo] <= 0) heroRange[heroCombo] = HERO_FLOOR;
	const villainRange = removeDead(rangeAt(replay, villain, first.index, holes), [
		...board,
		...holes,
	]);
	const [oopRange, ipRange] =
		side === 0 ? [heroRange, villainRange] : [villainRange, heroRange];

	const line = [...before, step].map(lineOf);
	const effective = withActualSizes(tree, step.street, line);
	const input: WasmInput = {
		board: [...board],
		oopRange: toSolverOrder(oopRange),
		ipRange: toSolverOrder(ipRange),
		pot: first.streetPot,
		stack: first.effectiveStack,
		rakeRate: rake,
		rakeCap: 0,
		[step.street]: wasmSizes(effective[step.street]),
		raiseCap: effective.raiseCap,
		allInThreshold: effective.allInThreshold,
		addAllIn: effective.addAllIn,
		prefix,
	};
	// The streets after this one are sized too, so the solve can run on.
	for (const later of ['flop', 'turn', 'river'] as const) {
		input[later] ??= wasmSizes(effective[later]);
	}

	return {
		ok: true,
		spot: {
			input,
			tree: effective,
			street: step.street,
			stepIndex,
			hero,
			villain,
			side,
			heroCards: holes,
			heroCombo,
			heroPair: solverIndex(holes[0], holes[1]),
			board,
			pot: first.streetPot,
			stack: first.effectiveStack,
			bigBlind: hand.stakes.bigBlind,
			rake,
			chosen,
			toCall: step.toCall,
			ranges: { oop: comboCount(oopRange), ip: comboCount(ipRange) },
		},
	};
}

/** What the page can tell from a reported hand alone, before it sends for the hand. */
export interface HandFacts {
	gradeable: boolean;
	reconciled: boolean;
	/** The players dealt in, in preflop order. */
	players: string[];
	hero: string | null;
	lines: { stepIndex: number; street: Street; player: string; kind: string }[];
}

/**
 * Whether the decision at `stepIndex` can be solved, by the same rules as
 * `solverSpot` on the facts a report holds. `threads` is whether the page can
 * run the threaded build; a flop without it is refused.
 */
export function solveEligibility(
	facts: HandFacts,
	stepIndex: number,
	threads: boolean
): { ok: true } | Refusal {
	const line = facts.lines.find((candidate) => candidate.stepIndex === stepIndex);
	if (!line || !['fold', 'check', 'call', 'bet', 'raise'].includes(line.kind)) {
		return refuse('no-action');
	}
	if (line.street === 'preflop') return refuse('preflop');
	if (!facts.gradeable) return refuse('ungradeable');
	if (!facts.reconciled) return refuse('unreconciled');
	if (line.player !== facts.hero) return refuse('not-hero');
	const opening = Math.min(
		...facts.lines
			.filter((candidate) => candidate.street === line.street)
			.map((candidate) => candidate.stepIndex)
	);
	const folded = new Set(
		facts.lines
			.filter((candidate) => candidate.kind === 'fold' && candidate.stepIndex < opening)
			.map((candidate) => candidate.player)
	);
	if (facts.players.filter((name) => !folded.has(name)).length !== 2) {
		return refuse('multiway');
	}
	if (line.street === 'flop' && !threads) return refuse('threads');
	return { ok: true };
}
