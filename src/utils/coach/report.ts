/**
 * The whole analysis, start to finish: text in, `AnalysisReport` out. The
 * report is plain JSON-serialisable data -- the one shape the CLI prints, the
 * worker posts and the UI renders.
 *
 * The work is exposed as a run that advances a few hands at a time, so a
 * worker can report progress and be cancelled between chunks; `analyzeLog` is
 * the same run driven to the end in one call.
 */

import { cardsText } from '../cards/cards';
import type { Action, ActionKind, Hand, Street } from '../history/hand';
import { parseHistory } from '../history/parse';
import { decisionsOf, replayHand, type Position, type Replay } from '../history/replay';
import { gradeDecision, type GradeOptions, type Grading } from './grade';
import { MISTAKES, type MistakeType } from './mistakes';
import { summariseOpenings, type OpeningSummary } from './openings';
import { summariseSession, type SessionSummary } from './session';

export const REPORT_VERSION = 6;

export interface AnalysisOptions {
	/** Defaults to the player the log was dealt to. */
	hero?: string;
	/** Seeds the equity simulations. A report is a pure function of text and seed. */
	seed?: number;
	/** Runouts sampled per equity calculation. */
	samples?: number;
	/** Rake as a share of the pot. Defaults to what the log itself shows. */
	rake?: number;
}

export interface ActionLine {
	street: Street;
	text: string;
	hero: boolean;
	/** Index into the hand's actions, which is what a grading's `stepIndex` is. */
	stepIndex: number;
	/** The action itself, in cents, for replaying the table: see `ui/tableReplay.ts`. */
	player: string;
	kind: ActionKind;
	amount: number;
	to?: number;
	allIn: boolean;
}

export interface SeatReport {
	name: string;
	position: Position;
	/** Cents, at the start of the hand. */
	stack: number;
	hero: boolean;
}

export interface HandReport {
	id: string;
	timestamp: string;
	table: string;
	players: number;
	position: Position | null;
	heroCards: string;
	board: string;
	netBb: number;
	/** Zero or negative: the sum of the hand's graded losses. */
	evLostBb: number;
	gradeable: boolean;
	lines: ActionLine[];
	gradings: Grading[];
	shown: Record<string, string>;
	warnings: string[];
	/** Cents. */
	bigBlind: number;
	/** Players dealt in, in preflop acting order, which is clockwise. Empty with no layout. */
	seats: SeatReport[];
	/** Uncalled bets handed back, in cents by player. */
	returned: Record<string, number>;
	/** What each player took from the pot, or for cashing out, in cents. */
	paid: Record<string, number>;
}

export interface LeakReport {
	type: MistakeType;
	title: string;
	count: number;
	evLostBb: number;
}

export interface AnalysisReport {
	version: number;
	hero: string;
	stakes: string;
	tables: string[];
	firstHand: string;
	lastHand: string;
	handCount: number;
	/** Hands the hero was dealt into and the grader could model. */
	gradedHands: number;
	/** Hands whose actions did not add up to the stated pot. Should be zero. */
	unreconciled: number;
	warnings: string[];
	rake: number;
	seed: number;
	session: SessionSummary;
	/** The hands the hero opened first in, by seat, against the opening charts. */
	openings: OpeningSummary;
	/** Mistakes by kind, costliest first. */
	leaks: LeakReport[];
	/** Every decision graded as a mistake, costliest first. */
	mistakes: Grading[];
	totalEvLostBb: number;
	/** Every decision graded as a good play, the most valuable first. */
	goodPlays: Grading[];
	/** Every hand, oldest first. */
	hands: HandReport[];
}

export interface AnalysisRun {
	hero: string;
	replays: Replay[];
	options: GradeOptions;
	reports: HandReport[];
	/** Hands graded so far. */
	done: number;
	total: number;
}

const SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' };

function moneyText(cents: number, currency: string): string {
	const amount = (cents / 100).toFixed(2);
	return currency in SYMBOLS ? `${SYMBOLS[currency]}${amount}` : amount;
}

function actionText(action: Action, currency: string): string {
	const money = (cents: number) => moneyText(cents, currency);
	const allIn = action.allIn ? ' (all-in)' : '';
	switch (action.kind) {
		case 'post-sb':
			return `posts small blind ${money(action.amount)}`;
		case 'post-bb':
			return `posts big blind ${money(action.amount)}`;
		case 'post-dead':
			return `posts ${money(action.amount)} dead`;
		case 'fold':
			return 'folds';
		case 'check':
			return 'checks';
		case 'call':
			return `calls ${money(action.amount)}${allIn}`;
		case 'bet':
			return `bets ${money(action.amount)}${allIn}`;
		case 'raise':
			return `raises to ${money(action.to ?? action.amount)}${allIn}`;
	}
}

/** The most common "Dealt to" name: the player the log belongs to. */
function detectHero(hands: readonly Hand[]): string {
	const counts = new Map<string, number>();
	for (const hand of hands) {
		if (hand.hero) counts.set(hand.hero, (counts.get(hand.hero) ?? 0) + 1);
	}
	return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

/** The rake the log shows, as a share of the pots that saw a flop. */
function observedRake(hands: readonly Hand[]): number {
	let pots = 0;
	let rake = 0;
	for (const hand of hands) {
		if (hand.board.length < 3) continue;
		pots += hand.totalPot;
		rake += hand.rake;
	}
	return pots > 0 ? rake / pots : 0.05;
}

function reportHand(replay: Replay, hero: string, options: GradeOptions): HandReport {
	const { hand, layout } = replay;
	const { currency } = hand.stakes;
	const bb = hand.stakes.bigBlind || 1;
	const dealtIn = layout !== null && hero in layout.positions;
	const gradeable = hand.gradeable && dealtIn && hand.hero === hero && replay.reconciled;

	const gradings =
		gradeable ?
			decisionsOf(replay, hero).map((step) =>
				// Each decision gets its own stream, so one hand's grade does not
				// depend on how many came before it.
				gradeDecision(replay, step, {
					...options,
					seed: (options.seed ?? 0) + step.index,
				})
			)
		:	[];

	const lines = hand.actions.map((action, stepIndex): ActionLine => {
		const seat = layout?.positions[action.player];
		return {
			street: action.street,
			text: `${action.player}${seat ? ` (${seat})` : ''} ${actionText(action, currency)}`,
			hero: action.player === hero,
			stepIndex,
			player: action.player,
			kind: action.kind,
			amount: action.amount,
			...(action.to === undefined ? {} : { to: action.to }),
			allIn: action.allIn,
		};
	});

	const returned: Record<string, number> = {};
	for (const { player, amount } of hand.uncalled) {
		returned[player] = (returned[player] ?? 0) + amount;
	}

	return {
		id: hand.id,
		timestamp: hand.timestamp,
		table: hand.table,
		players: layout?.players.length ?? 0,
		position: layout?.positions[hero] ?? null,
		heroCards: hand.hero === hero ? cardsText(hand.heroCards) : '',
		board: cardsText(hand.board),
		netBb: (replay.net[hero] ?? 0) / bb,
		evLostBb: gradings.reduce((sum, grading) => sum + grading.evLostBb, 0),
		gradeable,
		lines,
		gradings,
		shown: Object.fromEntries(
			Object.entries(hand.shown).map(([name, cards]) => [name, cardsText(cards)])
		),
		warnings: hand.warnings,
		bigBlind: hand.stakes.bigBlind,
		seats: (layout?.players ?? []).map((name) => ({
			name,
			position: layout!.positions[name],
			stack: layout!.stacks[name],
			hero: name === hero,
		})),
		returned,
		// As `replayHand` settles `net`: a cash-out replaces the pot's credit.
		paid: { ...hand.won, ...hand.cashedOut },
	};
}

/** Parses the log and sets up a run. Nothing is graded yet. */
export function startAnalysis(text: string, options: AnalysisOptions = {}): AnalysisRun {
	const hands = parseHistory(text);
	const replays = hands.map(replayHand);
	return {
		hero: options.hero ?? detectHero(hands),
		replays,
		options: {
			rake: options.rake ?? observedRake(hands),
			seed: options.seed ?? 1,
			samples: options.samples,
		},
		reports: [],
		done: 0,
		total: replays.length,
	};
}

/** Grades up to `count` more hands. Returns true once the run is complete. */
export function advanceAnalysis(run: AnalysisRun, count = Infinity): boolean {
	const end = Math.min(run.total, run.done + count);
	for (; run.done < end; run.done++) {
		run.reports.push(reportHand(run.replays[run.done], run.hero, run.options));
	}
	return run.done >= run.total;
}

/** Assembles the report of a completed run. */
export function finishAnalysis(run: AnalysisRun): AnalysisReport {
	const hands = run.replays.map((replay) => replay.hand);
	const mistakes = run.reports
		.flatMap((report) => report.gradings)
		.filter((grading) => grading.mistake !== null)
		.sort((a, b) => a.evLostBb - b.evLostBb);

	const goodPlays = run.reports
		.flatMap((report) => report.gradings)
		.filter((grading) => grading.goodPlay !== null)
		.sort((a, b) => b.goodPlay!.evGainedBb - a.goodPlay!.evGainedBb);

	const byType = new Map<MistakeType, LeakReport>();
	for (const { mistake, evLostBb } of mistakes) {
		if (!mistake) continue;
		const leak = byType.get(mistake) ?? {
			type: mistake,
			title: MISTAKES[mistake].title,
			count: 0,
			evLostBb: 0,
		};
		leak.count++;
		leak.evLostBb += evLostBb;
		byType.set(mistake, leak);
	}

	const first = hands[0];
	const stakes =
		first ?
			`${moneyText(first.stakes.smallBlind, first.stakes.currency)}/${moneyText(first.stakes.bigBlind, first.stakes.currency)}`
		:	'';

	return {
		version: REPORT_VERSION,
		hero: run.hero,
		stakes,
		tables: [...new Set(hands.map((hand) => hand.table))].sort(),
		firstHand: first?.timestamp ?? '',
		lastHand: hands.at(-1)?.timestamp ?? '',
		handCount: hands.length,
		gradedHands: run.reports.filter((report) => report.gradeable).length,
		unreconciled: run.replays.filter((replay) => !replay.reconciled).length,
		warnings: hands.flatMap((hand) =>
			hand.warnings.map((warning) => `Hand #${hand.id}: ${warning}`)
		),
		rake: run.options.rake,
		seed: run.options.seed ?? 1,
		session: summariseSession(run.replays, run.hero),
		openings: summariseOpenings(run.replays, run.hero),
		leaks: [...byType.values()].sort((a, b) => a.evLostBb - b.evLostBb),
		mistakes,
		totalEvLostBb: mistakes.reduce((sum, grading) => sum + grading.evLostBb, 0),
		goodPlays,
		hands: run.reports,
	};
}

/** Analyses a whole hand-history file in one call. */
export function analyzeLog(text: string, options: AnalysisOptions = {}): AnalysisReport {
	const run = startAnalysis(text, options);
	advanceAnalysis(run);
	return finishAnalysis(run);
}
