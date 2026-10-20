/**
 * What a Train drill asks: the four drills, their three modes, and the seeded
 * question generators behind them. A question is a pure function of the drill,
 * the mode, the run's seed and its index, and its answer is read off the same
 * engine the coach grades with: the preflop charts, `priceCall`, `equityVsRange`
 * and `textureOf`. See docs/train-model.md.
 */

import { mulberry32, type SeededRandom } from '../app/rng';
import { MIX_FLOOR } from '../coach/grade';
import { deckWithout, type Card } from '../cards/cards';
import {
	CLASS_COUNT,
	classSize,
	COMBO_COUNT,
	COMBOS,
	combosOfClass,
} from '../cards/combos';
import { equityVsRange, rangeWeight, removeDead, type ComboRange } from '../cards/equity';
import { priceCall } from '../postflop/decision';
import { drawStrength } from '../postflop/handClass';
import { textureOf } from '../postflop/texture';
import { applyAction } from '../postflop/villainRange';
import { chart, type ChartId, type ChartSeat, type Depth } from '../ranges/charts';
import { isPremium } from '../ranges/tiers';
import { frequencyOf, toComboRange, type Strategy } from '../ranges/range';
import {
	hasOwnTable,
	RANGE_TABLES,
	TABLE_LABELS,
	tableStrategy,
	type RangeGroup,
	type RangeTable,
	type TableId,
} from '../ui/rangeTables';

export const DRILL_IDS = ['preflop', 'potOdds', 'equity', 'cbet'] as const;
export type DrillId = (typeof DRILL_IDS)[number];
export const DRILL_MODES = ['easy', 'hard', 'test'] as const;
export type DrillMode = (typeof DRILL_MODES)[number];

/** Questions in a run. */
export const QUESTIONS: Record<DrillMode, number> = { easy: 10, hard: 20, test: 40 };

/** A Test answers every question against this clock; running out is a miss. */
export const TEST_LIMIT_MS: Record<DrillId, number> = {
	preflop: 5000,
	potOdds: 10000,
	equity: 10000,
	cbet: 5000,
};

/** Whether each answer gets its verdict as it is given. A Test holds them all back. */
export function hasFeedback(mode: DrillMode): boolean {
	return mode !== 'test';
}

export type Choice = 'fold' | 'check' | 'call' | 'raise' | 'bet33' | 'bet50' | 'bet66';

/** The Easy equity drill's answers, in percent. A figure on an edge is in both. */
export const EQUITY_BANDS: readonly (readonly [number, number])[] = [
	[0, 20],
	[20, 40],
	[40, 60],
	[60, 80],
	[80, 100],
];

interface QuestionBase {
	hero: Card[];
	board: Card[];
	/** The spot in one line: `BTN, first in · 100bb`. */
	label: string;
}

export interface PreflopQuestion extends QuestionBase {
	drill: 'preflop';
	table: TableId;
	depth: Depth;
	cls: number;
	/** Nothing to call: a hand not raised checks. */
	free: boolean;
}

export interface PotOddsQuestion extends QuestionBase {
	drill: 'potOdds';
	/** The pot before the bet faced. */
	potBb: number;
	betBb: number;
	inPosition: boolean;
	villainLabel: string;
	/** The equity a call needs. */
	potOdds: number;
	/** Showdown equity against the betting range. */
	equity: number;
	/** What calling is worth, rake-free: its sign is the answer. */
	callEvBb: number;
}

export interface EquityQuestion extends QuestionBase {
	drill: 'equity';
	villainLabel: string;
	/** 0 to 1. */
	equity: number;
}

export interface CbetQuestion extends QuestionBase {
	drill: 'cbet';
	potBb: number;
	/** The model's size, a share of the pot: 0.33, 0.5 or 0.66. */
	size: number;
	texture: string;
}

export type Question = PreflopQuestion | PotOddsQuestion | EquityQuestion | CbetQuestion;

/** The open both sides of a single-raised pot put in. */
const OPEN_BB = 2.5;
const STACK_BB = 100;

/** Runouts sampled for a flop's equity: about a point either way, well inside ±5. */
const FLOP_SAMPLES = 500;
const EQUITY_SEED = 0x7a11;

/** A pot-odds Hard question sits this far, in pots, past the indifference band. */
const HARD_MARGIN = 0.08;

/** Weights the Hard preflop pool gives a hand, by how it sits in its chart. */
const MIXED_WEIGHT = 4;
const EDGE_WEIGHT = 3;
const INSIDE_WEIGHT = 0.25;

/**
 * How much less likely a preflop hand is to be dealt again for each time it
 * already has been, as in qbcalc. It is never dealt twice running.
 */
const REPEAT_DAMPING = 3;

const POT_ODDS_SIZES = [0.33, 0.5, 0.75, 1, 1.5];
const BET_SIZES = [0.33, 0.5, 0.66];

/** One heads-up preflop line: an opener and a caller, from the charts. */
interface Line {
	opener: ChartSeat;
	caller: ChartSeat;
	open: ChartId;
	call: ChartId;
	/** The caller acts last after the flop. */
	callerInPosition: boolean;
}

const LINES: readonly Line[] = [
	{
		opener: 'BTN',
		caller: 'BB',
		open: 'rfiBtn',
		call: 'bbVsBtn',
		callerInPosition: false,
	},
	{ opener: 'CO', caller: 'BB', open: 'rfiCo', call: 'bbVsCo', callerInPosition: false },
	{
		opener: 'UTG',
		caller: 'BB',
		open: 'rfiUtg',
		call: 'bbVsUtg',
		callerInPosition: false,
	},
	{ opener: 'SB', caller: 'BB', open: 'rfiSb', call: 'bbVsSb', callerInPosition: true },
	{ opener: 'CO', caller: 'BTN', open: 'rfiCo', call: 'btnVsCo', callerInPosition: true },
	{ opener: 'HJ', caller: 'CO', open: 'rfiHj', call: 'coVsHj', callerInPosition: true },
];

const comboRanges = new Map<string, ComboRange>();

/** A line's flop pot: the open and the call, and whichever blinds were left behind. */
function potOf(line: Line): number {
	const seats = [line.opener, line.caller];
	const dead = (seats.includes('SB') ? 0 : 0.5) + (seats.includes('BB') ? 0 : 1);
	return 2 * OPEN_BB + dead;
}

/** The opener's raises or the caller's calls, combo by combo. */
function lineRange(line: Line, side: 'open' | 'call'): ComboRange {
	const id = line[side];
	let range = comboRanges.get(id);
	if (!range) {
		const strategy = chart(id);
		range = toComboRange(side === 'open' ? strategy.raise : strategy.call);
		comboRanges.set(id, range);
	}
	return range;
}

/** A stream of its own for every question: the run's seed, the drill and the index. */
function streamOf(drill: DrillId, seed: number, index: number): SeededRandom {
	let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
	h ^= Math.imul(index + 1, 0xc2b2ae35);
	h ^= Math.imul(DRILL_IDS.indexOf(drill) + 1, 0x27d4eb2f);
	h ^= h >>> 15;
	h = Math.imul(h, 0x2c1b3c6d);
	h ^= h >>> 12;
	return mulberry32(h >>> 0);
}

function pick<T>(items: readonly T[], random: SeededRandom): T {
	return items[Math.floor(random() * items.length)];
}

function pickWeighted<T>(
	items: readonly T[],
	weights: readonly number[],
	random: SeededRandom
): T {
	const total = weights.reduce((sum, weight) => sum + weight, 0);
	let target = random() * total;
	for (let i = 0; i < items.length; i++) {
		target -= weights[i];
		if (target < 0) return items[i];
	}
	return items[items.length - 1];
}

function dealCards(count: number, dead: readonly Card[], random: SeededRandom): Card[] {
	const deck = deckWithout(dead);
	const out: Card[] = [];
	for (let i = 0; i < count; i++) {
		const at = i + Math.floor(random() * (deck.length - i));
		[deck[i], deck[at]] = [deck[at], deck[i]];
		out.push(deck[i]);
	}
	return out;
}

/** One combo of a range, drawn by weight, high card first; null for an empty range. */
function drawCombo(range: ComboRange, random: SeededRandom): Card[] | null {
	const total = rangeWeight(range);
	if (total <= 0) return null;
	let target = random() * total;
	for (let i = 0; i < COMBO_COUNT; i++) {
		target -= range[i];
		if (target < 0 && range[i] > 0) return [COMBOS[i].a, COMBOS[i].b];
	}
	for (let i = COMBO_COUNT - 1; i >= 0; i--) {
		if (range[i] > 0) return [COMBOS[i].a, COMBOS[i].b];
	}
	return null;
}

const pct = (size: number): string => `${Math.round(size * 100)}%`;
const roundBb = (bb: number): number => Math.round(bb * 10) / 10;

// Preflop -----------------------------------------------------------------------

interface PreflopItem {
	table: RangeTable;
	depth: Depth;
	cls: number;
	weight: number;
	cell: string;
}

/** The choices a preflop hand may take at `MIX_FLOOR`, as one key. */
function rightKey(strategy: Strategy, cls: number): string {
	return (['raise', 'call', 'fold'] as const)
		.filter((choice) => frequencyOf(strategy, cls, choice) >= MIX_FLOOR)
		.join(',');
}

/** The classes beside `cls` in the 13x13 grid, diagonals included. */
function neighbours(cls: number): number[] {
	const row = Math.floor(cls / 13);
	const col = cls % 13;
	const out: number[] = [];
	for (let dr = -1; dr <= 1; dr++) {
		for (let dc = -1; dc <= 1; dc++) {
			const r = row + dr;
			const c = col + dc;
			if ((dr || dc) && r >= 0 && r < 13 && c >= 0 && c < 13) out.push(r * 13 + c);
		}
	}
	return out;
}

const pools = new Map<string, PreflopItem[]>();

/**
 * The hands a preflop drill deals, weighted by combos. Easy keeps the first-in
 * and vs-open charts at 100bb and drops what anyone knows: a fold no neighbour
 * plays differently, and a premium played one way. Hard and Test take every
 * chart, at 50bb too where it has its own, and lean to the edges and the mixes.
 */
function preflopPool(mode: DrillMode): PreflopItem[] {
	const easy = mode === 'easy';
	const key = easy ? 'easy' : 'hard';
	const cached = pools.get(key);
	if (cached) return cached;
	const groups: readonly RangeGroup[] = easy ? ['rfi', 'vsOpen'] : [];
	const out: PreflopItem[] = [];
	for (const table of RANGE_TABLES) {
		if (easy && !groups.includes(table.group)) continue;
		const depths: Depth[] =
			easy || !hasOwnTable(table.id, 'mid') ? ['deep'] : ['deep', 'mid'];
		for (const depth of depths) {
			const strategy = tableStrategy(table.id, depth);
			for (let cls = 0; cls < CLASS_COUNT; cls++) {
				const own = rightKey(strategy, cls);
				const edge = neighbours(cls).some((other) => rightKey(strategy, other) !== own);
				const top = Math.max(
					frequencyOf(strategy, cls, 'raise'),
					frequencyOf(strategy, cls, 'call'),
					frequencyOf(strategy, cls, 'fold')
				);
				const mixed = top < 0.999;
				let weight = classSize(cls);
				if (easy) {
					const pureFold = own === 'fold' && !mixed;
					if ((pureFold && !edge) || (isPremium(cls) && !mixed)) continue;
				} else {
					weight *=
						mixed ? MIXED_WEIGHT
						: edge ? EDGE_WEIGHT
						: INSIDE_WEIGHT;
				}
				out.push({ table, depth, cls, weight, cell: `${table.id}:${depth}:${cls}` });
			}
		}
	}
	pools.set(key, out);
	return out;
}

/** The latest run's hands: one run is dealt at a time, so only it is kept. */
let dealt: { key: string; sequence: PreflopItem[] } = { key: '', sequence: [] };

/** The run's hands up to `index`, each damped by the times it has been dealt. */
function preflopItem(mode: DrillMode, seed: number, index: number): PreflopItem {
	const key = `${mode}:${seed}`;
	if (dealt.key !== key) dealt = { key, sequence: [] };
	const { sequence } = dealt;
	const pool = preflopPool(mode);
	while (sequence.length <= index) {
		const at = sequence.length;
		const asked = new Map<string, number>();
		for (const item of sequence) asked.set(item.cell, (asked.get(item.cell) ?? 0) + 1);
		const last = sequence.at(-1)?.cell;
		const fresh = pool.filter((item) => item.cell !== last);
		const item = pickWeighted(
			fresh,
			fresh.map((entry) => entry.weight / REPEAT_DAMPING ** (asked.get(entry.cell) ?? 0)),
			streamOf('preflop', seed, at)
		);
		sequence.push(item);
	}
	return sequence[index];
}

function preflopQuestion(mode: DrillMode, seed: number, index: number): PreflopQuestion {
	const { table, depth, cls } = preflopItem(mode, seed, index);
	const random = streamOf('preflop', seed, index);
	random();
	const combo = pick(combosOfClass(cls), random);
	const hero = random() < 0.5 ? [combo.a, combo.b] : [combo.b, combo.a];
	return {
		drill: 'preflop',
		hero,
		board: [],
		label: `${TABLE_LABELS[table.id]} · ${depth === 'deep' ? '100bb' : '50bb'}`,
		table: table.id,
		depth,
		cls,
		free: table.free,
	};
}

// Postflop spots ----------------------------------------------------------------

/** The two ranges of a line on a board after a history, and the pot. */
interface Spot {
	line: Line;
	board: Card[];
	hero: ComboRange;
	villain: ComboRange;
	potBb: number;
	/** What the hero has put in, the blinds and open included. */
	investedBb: number;
	history: string;
}

const STREET = ['flop', 'turn', 'river'];

/**
 * A heads-up pot from the preflop caller's seat: the opener bets half the pot
 * on each earlier street and is called, or, on the river, may have checked the
 * turn through. Each action reweights both ranges as `villainRange.ts` does.
 */
function spotOf(line: Line, board: Card[], random: SeededRandom): Spot {
	let hero = removeDead(lineRange(line, 'call'), board);
	let villain = removeDead(lineRange(line, 'open'), board);
	let potBb = potOf(line);
	let investedBb = OPEN_BB;
	const done: string[] = [];
	const checked = board.length === 5 && random() < 0.5;
	for (let street = 3; street < board.length; street++) {
		const seen = board.slice(0, street);
		const name = STREET[street - 3];
		if (street === 4 && checked) {
			// A check to the aggressor says nothing; the aggressor's own check does.
			villain = applyAction(villain, seen, 'check', 0);
			if (line.callerInPosition) hero = applyAction(hero, seen, 'check', 0);
			done.push(`checked the ${name}`);
			continue;
		}
		villain = applyAction(villain, seen, 'bet', 0.5);
		hero = applyAction(hero, seen, 'call', 0.5);
		investedBb += potBb / 2;
		potBb *= 2;
		done.push(`bet the ${name}`);
	}
	const history =
		done.length === 2 && done[1].startsWith('bet') ?
			'opened, bet the flop and turn'
		:	['opened', ...done].join(', ');
	return { line, board, hero, villain, potBb, investedBb, history };
}

/** Too few combos left to be a range worth reasoning about. */
const MIN_COMBOS = 5;

function potOddsQuestion(mode: DrillMode, seed: number, index: number): PotOddsQuestion {
	const random = streamOf('potOdds', seed, index);
	let fallback: PotOddsQuestion | null = null;
	for (let attempt = 0; attempt < 40; attempt++) {
		const line = pick(LINES, random);
		const board = dealCards(random() < 0.5 ? 4 : 5, [], random);
		const spot = spotOf(line, board, random);
		const size = pick(POT_ODDS_SIZES, random);
		const betting = applyAction(spot.villain, board, 'bet', size);
		if (rangeWeight(betting) < MIN_COMBOS) continue;
		const potBb = roundBb(spot.potBb);
		const betBb = roundBb(potBb * size);
		// A few hands per board: the ranges cost more than the equity does.
		for (let deal = 0; deal < 4; deal++) {
			const hero = drawCombo(spot.hero, random);
			if (!hero) break;
			const villain = removeDead(betting, hero);
			if (rangeWeight(villain) < MIN_COMBOS) continue;
			const equity = equityVsRange(hero, board, villain, { seed: EQUITY_SEED }).equity;
			const price = priceCall({
				equity,
				pot: potBb + betBb,
				call: betBb,
				uncovered: 0,
				inPosition: line.callerInPosition,
				cardsToCome: 5 - board.length,
				allIn: false,
				strongDraw: board.length < 5 && drawStrength(hero, board) === 2,
				behind: STACK_BB - spot.investedBb - betBb,
				rake: 0,
			});
			const gap = Math.abs(price.callEv);
			// A toss-up is never asked: the model has no answer to it.
			if (gap < price.band) continue;
			const question: PotOddsQuestion = {
				drill: 'potOdds',
				hero,
				board,
				label: `${line.caller} vs ${line.opener} · ${STREET[board.length - 3]} · ${pct(size)} pot`,
				potBb,
				betBb,
				inPosition: line.callerInPosition,
				villainLabel: `${line.opener} ${spot.history}, now bets ${pct(size)}`,
				potOdds: price.potOdds,
				equity,
				callEvBb: price.callEv,
			};
			if (mode === 'easy' || gap <= price.band + HARD_MARGIN * price.stake) {
				return question;
			}
			fallback ??= question;
		}
	}
	if (fallback) return fallback;
	throw new Error('No pot-odds question could be dealt.');
}

function equityQuestion(mode: DrillMode, seed: number, index: number): EquityQuestion {
	const random = streamOf('equity', seed, index);
	for (;;) {
		const line = pick(LINES, random);
		const board = dealCards(3 + Math.floor(random() * 3), [], random);
		const fromSeat = random() < 0.5;
		// Either side of the line may be the hero; the other's preflop range is faced.
		const heroRange = removeDead(lineRange(line, fromSeat ? 'call' : 'open'), board);
		let villain = removeDead(lineRange(line, fromSeat ? 'open' : 'call'), board);
		const seat = fromSeat ? line.opener : line.caller;
		let villainLabel = `${seat}'s ${fromSeat ? 'opening' : 'calling'} range`;
		if (mode !== 'easy' && random() < 0.5) {
			const size = pick(BET_SIZES, random);
			villain = applyAction(villain, board, 'bet', size);
			villainLabel = `${seat}'s ${fromSeat ? 'open' : 'call'}, betting ${pct(size)} here`;
		}
		const hero = drawCombo(heroRange, random);
		if (!hero) continue;
		const live = removeDead(villain, hero);
		if (rangeWeight(live) < MIN_COMBOS) continue;
		const { equity } = equityVsRange(hero, board, live, {
			samples: FLOP_SAMPLES,
			seed: EQUITY_SEED,
		});
		return {
			drill: 'equity',
			hero,
			board,
			label: `${fromSeat ? line.caller : line.opener} vs ${seat} · ${STREET[board.length - 3]}`,
			villainLabel,
			equity,
		};
	}
}

/** Of the nine flops one suit change away, how many the model sizes differently. */
function boundaryScore(board: readonly Card[], size: number): number {
	let score = 0;
	for (let i = 0; i < board.length; i++) {
		for (let suit = 0; suit < 4; suit++) {
			const card = (board[i] & ~3) | suit;
			if (card === board[i] || board.includes(card)) continue;
			const next = board.map((other, at) => (at === i ? card : other));
			if (textureOf(next).betSize !== size) score++;
		}
	}
	return score;
}

/**
 * A flop for the opener, each size equally often. Hard deals a few flops of the
 * size and keeps the one nearest to a different size.
 */
function cbetQuestion(mode: DrillMode, seed: number, index: number): CbetQuestion {
	const random = streamOf('cbet', seed, index);
	const line = pick(LINES, random);
	const size = pick(BET_SIZES, random);
	const candidates: Card[][] = [];
	const wanted = mode === 'easy' ? 1 : 4;
	for (let tries = 0; candidates.length < wanted && tries < 2000; tries++) {
		const board = dealCards(3, [], random);
		if (textureOf(board).betSize === size) candidates.push(board);
	}
	const board = candidates.reduce((best, next) =>
		boundaryScore(next, size) > boundaryScore(best, size) ? next : best
	);
	const hero = drawCombo(removeDead(lineRange(line, 'open'), board), random)!;
	const texture = textureOf(board);
	return {
		drill: 'cbet',
		hero,
		board,
		label: `${line.opener} vs ${line.caller} · flop · single raised`,
		potBb: potOf(line),
		size: texture.betSize,
		texture: texture.label,
	};
}

/** The question at `index` of a run: pure, so a run is dealt again from its seed. */
export function questionAt(
	drill: DrillId,
	mode: DrillMode,
	seed: number,
	index: number
): Question {
	switch (drill) {
		case 'preflop':
			return preflopQuestion(mode, seed, index);
		case 'potOdds':
			return potOddsQuestion(mode, seed, index);
		case 'equity':
			return equityQuestion(mode, seed, index);
		case 'cbet':
			return cbetQuestion(mode, seed, index);
	}
}

/** The answers a question offers, in the order its keys number them. */
export function choicesOf(question: Question): readonly Choice[] {
	switch (question.drill) {
		case 'preflop':
			return question.free ? ['check', 'raise'] : ['fold', 'call', 'raise'];
		case 'potOdds':
			return ['fold', 'call'];
		case 'equity':
			return [];
		case 'cbet':
			return ['bet33', 'bet50', 'bet66'];
	}
}
