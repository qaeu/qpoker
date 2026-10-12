/**
 * The hero's equity at every step of a hand's replay: their share of the pot
 * against the modelled range of each opponent still in, were the board to run
 * out with no more betting. A readout, not a grade -- it reads the same ranges
 * the graders do and judges nothing. See docs/postflop-model.md, "The equity
 * readout".
 */

import type { Card } from '../cards/cards';
import { equityVsRanges, removeDead, sampleEquity } from '../cards/equity';
import type { ComboRange, EquityOptions } from '../cards/equity';
import { STREETS, type Street } from '../history/hand';
import type { Replay } from '../history/replay';
import { rangeAt } from '../postflop/villainRange';
import { preflopRange } from '../ranges/preflopSpot';
import { toComboRange } from '../ranges/range';
import type { Grading } from './grade';

export interface StepEquity {
	/** 0 to 1. */
	equity: number;
	/** The ranges it was taken against: the opponents not folded. */
	opponents: number;
}

export interface HandEquity {
	/** As a street's cards came, by street; `preflop` is the deal itself. */
	deals: Partial<Record<Street, StepEquity>>;
	/** After an action, by its `ActionLine.stepIndex`. */
	actions: Record<number, StepEquity>;
}

/** Deals simulated for a preflop figure, where nothing can be enumerated. */
export const PREFLOP_DEALS = 1000;

const BOARD_AT: Record<Street, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };

/** One state of the table the readout has a figure for. */
interface Moment {
	street: Street;
	/** The next action to come: the ranges are those just before it. */
	beforeIndex: number;
	opponents: string[];
	/** Moments in a row with one key share a figure. */
	key: string;
	record: (figure: StepEquity) => void;
}

export const emptyEquity = (): HandEquity => ({ deals: {}, actions: {} });

/** Every state of the hand the hero is still in, in order, with opponents to beat. */
function momentsOf(replay: Replay, hero: string, out: HandEquity): Moment[] {
	const { hand, layout } = replay;
	const moments: Moment[] = [];
	const folded = new Set<string>();
	const acted = new Map<string, number>();
	let street: Street = 'preflop';

	const add = (beforeIndex: number, record: Moment['record']) => {
		const opponents = (layout?.players ?? []).filter(
			(name) => name !== hero && !folded.has(name)
		);
		if (opponents.length === 0) return;
		const lines = opponents.map((name) => `${name}:${acted.get(name) ?? 0}`);
		moments.push({
			street,
			beforeIndex,
			opponents,
			key: `${street}|${lines.join(',')}`,
			record,
		});
	};
	const deal = (next: Street, beforeIndex: number) => {
		street = next;
		add(beforeIndex, (figure) => (out.deals[next] = figure));
	};
	const later = () => STREETS.slice(STREETS.indexOf(street) + 1);

	const first = hand.actions.findIndex((action) => !action.kind.startsWith('post-'));
	deal('preflop', first < 0 ? hand.actions.length : first);

	for (const [index, action] of hand.actions.entries()) {
		if (action.kind.startsWith('post-')) continue;
		if (later().includes(action.street)) {
			for (const next of later()) {
				deal(next, index);
				if (next === action.street) break;
			}
		}
		if (action.kind === 'fold') {
			// Out of the hand, the hero has no equity to show.
			if (action.player === hero) return moments;
			folded.add(action.player);
		}
		if (action.player !== hero) {
			acted.set(action.player, (acted.get(action.player) ?? 0) + 1);
		}
		add(index + 1, (figure) => (out.actions[index] = figure));
	}

	// All-in before the river: the board still runs out.
	for (const next of later()) {
		if (BOARD_AT[next] > hand.board.length) break;
		deal(next, hand.actions.length);
	}
	return moments;
}

/**
 * The equity readout of one hand. `gradings` are the hero's graded decisions in
 * it: where one was priced in a state the readout also shows, its equity is
 * shown, so the caption and the mistake card never disagree.
 */
export function handEquity(
	replay: Replay,
	hero: string,
	gradings: readonly Grading[],
	options: EquityOptions
): HandEquity {
	const { hand } = replay;
	const out = emptyEquity();
	const hole = hand.heroCards;
	if (hole.length !== 2) return out;
	const moments = momentsOf(replay, hero, out);

	for (let start = 0; start < moments.length;) {
		let end = start + 1;
		while (end < moments.length && moments[end].key === moments[start].key) end++;
		const run = moments.slice(start, end);
		const { street, beforeIndex, opponents } = run[0];
		const board: Card[] = hand.board.slice(0, BOARD_AT[street]);

		// A decision is graded in the state just before it, which is a moment here.
		const graded = gradings.find((grading) =>
			run.some(
				(moment) =>
					moment.beforeIndex === grading.stepIndex && moment.street === grading.street
			)
		);
		const known =
			graded?.postflop ? graded.postflop.equity
			: graded?.preflop?.opponents === opponents.length ? graded.preflop.equity
			: undefined;

		let equity = known;
		if (equity === undefined) {
			// Each run has its own stream, as each graded decision has.
			const seed = (options.seed ?? 0) + beforeIndex;
			if (street === 'preflop') {
				const ranges = opponents.map((name) =>
					removeDead(toComboRange(preflopRange(replay, name, beforeIndex)), hole)
				);
				equity = sampleEquity(hole, board, ranges, PREFLOP_DEALS, seed).equity;
			} else {
				const dead = [...hole, ...board];
				const ranges: ComboRange[] = opponents.map((name) =>
					removeDead(rangeAt(replay, name, beforeIndex, hole), dead)
				);
				equity = equityVsRanges(hole, board, ranges, { ...options, seed }).equity;
			}
		}

		const figure: StepEquity = { equity, opponents: opponents.length };
		for (const moment of run) moment.record(figure);
		start = end;
	}
	return out;
}
