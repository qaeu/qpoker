/**
 * The whole analysis, start to finish: text in, `AnalysisReport` out. The
 * report is plain JSON-serialisable data -- the one shape the CLI prints, the
 * worker posts and the UI renders.
 *
 * The work is exposed as a run that advances a few hands at a time, so a
 * worker can report progress and be cancelled between chunks; `analyzeLog` is
 * the same run driven to the end in one call.
 *
 * A run can be handed an earlier report, and grades only the hands that one
 * does not already answer for: see docs/coach-model.md, "Reusing a report".
 *
 * A hand's report is two parts: a light `HandSummary`, which is all that the
 * report's own figures are summed from (`summariseHands`), and the heavy
 * `HandDetail` a reader needs once the hand is opened. See docs/library.md.
 */

import { cardsText } from '../cards/cards';
import type { Action, ActionKind, Hand, Street } from '../history/hand';
import { parseHistory } from '../history/parse';
import { decisionsOf, replayHand, type Position, type Replay } from '../history/replay';
import type { Confidence, Scenario } from '../ranges/preflopSpot';
import type { GoodPlayRank, GoodPlayType } from './goodPlays';
import { gradeDecision, type GradeOptions, type Grading } from './grade';
import { MISTAKES, type MistakeType, type Severity } from './mistakes';
import {
	openingOf,
	summariseSpots,
	type OpeningSpot,
	type OpeningSummary,
} from './openings';
import {
	summariseTallies,
	tallyHand,
	type HandTally,
	type SessionSummary,
} from './session';
import { emptyEquity, handEquity, type HandEquity } from './stepEquity';

/** The coach: bump it when a grading could come out differently, or its shape does. */
export const REPORT_VERSION = 9;

/**
 * The summary's own figures: bump it when a tally, an opening spot or another
 * summary field changes and no grading does. A stored hand is then summed
 * again from its text, which costs no simulation.
 */
export const FACTS_VERSION = 3;

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

/** A mistake or a good play, cut down to what a list filters and orders on. */
export interface FindingSummary {
	stepIndex: number;
	street: Street;
	kind: 'mistake' | 'play';
	mistake: MistakeType | null;
	severity: Severity;
	/** The kind of good play and how good, when it is one. */
	play: GoodPlayType | null;
	rank: GoodPlayRank | null;
	confidence: Confidence;
	/** Negative for a mistake, positive for a good play. */
	evBb: number;
}

/** The light half of a hand: what lists, filters and every summed figure read. */
export interface HandSummary {
	id: string;
	timestamp: string;
	table: string;
	/** `$0.02/$0.05`. */
	stakes: string;
	/** Cents. */
	bigBlind: number;
	players: number;
	position: Position | null;
	heroCards: string;
	board: string;
	netBb: number;
	/** Zero or negative: the sum of the hand's graded losses. */
	evLostBb: number;
	gradeable: boolean;
	/** False when the actions did not add up to the stated pot. */
	reconciled: boolean;
	warnings: string[];
	/** `Hand.digest`: what tells a later run this is the hand it has in front of it. */
	digest: string;
	/** The rake the gradings were priced at, or null when none of them read it. */
	rake: number | null;
	/** The hero put money in by choice, or bet. */
	played: boolean;
	/** The preflop spots the hero made a decision in. */
	scenarios: Scenario[];
	/** The hand's mistakes and good plays, in the order they were made. */
	findings: FindingSummary[];
	/** What the hand adds to the hero's frequencies. Null when not dealt in. */
	tally: HandTally | null;
	/** The hero's first-in decision, if they made one. */
	opening: OpeningSpot | null;
}

/** The heavy half: the actions, the gradings in full and the replay's figures. */
export interface HandDetail {
	lines: ActionLine[];
	gradings: Grading[];
	shown: Record<string, string>;
	/** Players dealt in, in preflop acting order, which is clockwise. Empty with no layout. */
	seats: SeatReport[];
	/** Uncalled bets handed back, in cents by player. */
	returned: Record<string, number>;
	/** What each player took from the pot, or for cashing out, in cents. */
	paid: Record<string, number>;
	/** The hero's equity at each step of the replay. Empty when not graded. */
	equity: HandEquity;
}

export interface HandReport extends HandSummary, HandDetail {}

export interface LeakReport {
	type: MistakeType;
	title: string;
	count: number;
	evLostBb: number;
}

/** What a run of hands was graded under. */
export interface ReportMeta {
	hero: string;
	rake: number;
	seed: number;
	/** Runouts per equity calculation, or null for the engine's own defaults. */
	samples: number | null;
}

/** Everything a report says of its hands together: summed from their summaries. */
export interface ReportSummary extends ReportMeta {
	version: number;
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
	session: SessionSummary;
	/** The hands the hero opened first in, by seat, against the opening charts. */
	openings: OpeningSummary;
	/** Mistakes by kind, costliest first. */
	leaks: LeakReport[];
	totalEvLostBb: number;
	mistakeCount: number;
	goodPlayCount: number;
}

/** A report with its hands in their light half only: what the app renders. */
export interface HandsReport extends ReportSummary {
	/** Every hand, oldest first. */
	hands: HandSummary[];
}

export interface AnalysisReport extends HandsReport {
	/** Every decision graded as a mistake, costliest first. */
	mistakes: Grading[];
	/** Every decision graded as a good play, the most valuable first. */
	goodPlays: Grading[];
	/** Every hand, oldest first. */
	hands: HandReport[];
}

export interface AnalysisRun {
	hero: string;
	replays: Replay[];
	options: GradeOptions;
	/** An earlier report's hands that would grade the same again, by digest. */
	kept: Map<string, HandReport>;
	reports: HandReport[];
	/** Hands reported so far, graded or kept. */
	done: number;
	total: number;
}

const SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' };

/** Cents as money: `125` -> `$1.25`, or the bare amount for a currency with no symbol. */
export function moneyText(cents: number, currency: string): string {
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
export function detectHero(hands: readonly Hand[]): string {
	const counts = new Map<string, number>();
	for (const hand of hands) {
		if (hand.hero) counts.set(hand.hero, (counts.get(hand.hero) ?? 0) + 1);
	}
	return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

/** Steps to a unit of rake: the observed rate is rounded to half a percent. */
const RAKE_STEPS = 200;

/**
 * The rake the log shows, as a share of the pots that saw a flop, rounded so
 * that a log a few hands longer is graded at the same rate.
 */
function observedRake(hands: readonly Hand[]): number {
	let pots = 0;
	let rake = 0;
	for (const hand of hands) {
		if (hand.board.length < 3) continue;
		pots += hand.totalPot;
		rake += hand.rake;
	}
	return rakeRate(pots, rake);
}

/** A rake rate from the pots that saw a flop and what was taken from them, in cents. */
export function rakeRate(pots: number, rake: number): number {
	return pots > 0 ? Math.round((rake / pots) * RAKE_STEPS) / RAKE_STEPS : 0.05;
}

function findingOf(grading: Grading): FindingSummary | null {
	const kind =
		grading.mistake ? 'mistake'
		: grading.goodPlay ? 'play'
		: null;
	if (!kind) return null;
	return {
		stepIndex: grading.stepIndex,
		street: grading.street,
		kind,
		mistake: grading.mistake,
		severity: grading.severity,
		play: grading.goodPlay?.type ?? null,
		rank: grading.goodPlay?.rank ?? null,
		confidence: grading.confidence,
		// A grading is never both: a mistake has no good play.
		evBb: grading.goodPlay ? grading.goodPlay.evGainedBb : grading.evLostBb,
	};
}

export function stakesText(hand: Hand): string {
	const { smallBlind, bigBlind, currency } = hand.stakes;
	return `${moneyText(smallBlind, currency)}/${moneyText(bigBlind, currency)}`;
}

/** The costly part of a hand's report, which a re-summing keeps. */
export type Graded = Pick<HandReport, 'gradings' | 'equity' | 'rake'>;

/**
 * One hand's report. Handed what an earlier grading of the same hand came to,
 * it grades nothing and only sums the hand up again.
 */
export function reportHand(
	replay: Replay,
	hero: string,
	options: GradeOptions,
	graded?: Graded
): HandReport {
	const { hand, layout } = replay;
	const { currency } = hand.stakes;
	const bb = hand.stakes.bigBlind || 1;
	const dealtIn = layout !== null && hero in layout.positions;
	const gradeable = hand.gradeable && dealtIn && hand.hero === hero && replay.reconciled;

	const equityOptions = { seed: options.seed, samples: options.samples };
	// Read through a getter, so the hand knows whether its gradings hang on the rate.
	let rakeRead = false;
	const gradings =
		graded ? graded.gradings
		: gradeable ?
			decisionsOf(replay, hero).map((step) =>
				// Each decision gets its own stream, so one hand's grade does not
				// depend on how many came before it.
				gradeDecision(replay, step, {
					samples: options.samples,
					seed: (options.seed ?? 0) + step.index,
					get rake() {
						rakeRead = true;
						return options.rake;
					},
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
		stakes: stakesText(hand),
		players: layout?.players.length ?? 0,
		position: layout?.positions[hero] ?? null,
		heroCards: hand.hero === hero ? cardsText(hand.heroCards) : '',
		board: cardsText(hand.board),
		netBb: (replay.net[hero] ?? 0) / bb,
		evLostBb: gradings.reduce((sum, grading) => sum + grading.evLostBb, 0),
		gradeable,
		reconciled: replay.reconciled,
		played: gradings.some(({ chosen }) => chosen !== 'fold' && chosen !== 'check'),
		scenarios: [
			...new Set(gradings.flatMap(({ preflop }) => (preflop ? [preflop.scenario] : []))),
		],
		findings: gradings.flatMap((grading) => findingOf(grading) ?? []),
		tally: tallyHand(replay, hero),
		opening: openingOf(replay, hero),
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
		equity:
			graded ? graded.equity
			: gradeable ? handEquity(replay, hero, gradings, equityOptions)
			: emptyEquity(),
		digest: hand.digest,
		rake:
			graded ? graded.rake
			: rakeRead ? options.rake
			: null,
	};
}

/**
 * The hands of an earlier report that this run would grade to the same thing:
 * the same coach, seed and sample count, and a rake that either has not moved
 * or was never read.
 */
function keptHands(
	previous: AnalysisReport | undefined,
	hero: string,
	options: GradeOptions
): Map<string, HandReport> {
	const kept = new Map<string, HandReport>();
	if (
		!previous
		|| previous.version !== REPORT_VERSION
		|| previous.hero !== hero
		|| previous.seed !== options.seed
		|| previous.samples !== (options.samples ?? null)
	) {
		return kept;
	}
	for (const report of previous.hands) {
		if (report.rake === null || report.rake === options.rake) {
			kept.set(report.digest, report);
		}
	}
	return kept;
}

/**
 * Parses the log and sets up a run. Nothing is graded yet. `previous` is a
 * report to take hands from where it can: it changes how long the run takes,
 * never what it reports.
 */
export function startAnalysis(
	text: string,
	options: AnalysisOptions = {},
	previous?: AnalysisReport
): AnalysisRun {
	const hands = parseHistory(text);
	const replays = hands.map(replayHand);
	const hero = options.hero ?? detectHero(hands);
	const gradeOptions: GradeOptions = {
		rake: options.rake ?? observedRake(hands),
		seed: options.seed ?? 1,
		samples: options.samples,
	};
	return {
		hero,
		replays,
		options: gradeOptions,
		kept: keptHands(previous, hero, gradeOptions),
		reports: [],
		done: 0,
		total: replays.length,
	};
}

/**
 * Grades up to `count` more hands, passing over any kept from an earlier report
 * on the way: they cost nothing. Returns true once the run is complete.
 */
export function advanceAnalysis(run: AnalysisRun, count = Infinity): boolean {
	for (let graded = 0; run.done < run.total; run.done++) {
		const replay = run.replays[run.done];
		const kept = run.kept.get(replay.hand.digest);
		if (!kept) {
			if (graded >= count) break;
			graded++;
		}
		run.reports.push(kept ?? reportHand(replay, run.hero, run.options));
	}
	return run.done >= run.total;
}

/** Parts a hand's report into the half that is listed and the half that is opened. */
export function splitReport(report: HandReport): {
	summary: HandSummary;
	detail: HandDetail;
} {
	const { lines, gradings, shown, seats, returned, paid, equity, ...summary } = report;
	return { summary, detail: { lines, gradings, shown, seats, returned, paid, equity } };
}

/**
 * What a run of hands says together, oldest first. It reads nothing but their
 * summaries, so it is the same sum over one log or over any stored hands.
 */
export function summariseHands(
	hands: readonly HandSummary[],
	meta: ReportMeta
): ReportSummary {
	const byType = new Map<MistakeType, LeakReport>();
	let totalEvLostBb = 0;
	let goodPlayCount = 0;
	for (const { findings } of hands) {
		for (const { mistake, evBb } of findings) {
			if (!mistake) {
				goodPlayCount++;
				continue;
			}
			const leak = byType.get(mistake) ?? {
				type: mistake,
				title: MISTAKES[mistake].title,
				count: 0,
				evLostBb: 0,
			};
			leak.count++;
			leak.evLostBb += evBb;
			totalEvLostBb += evBb;
			byType.set(mistake, leak);
		}
	}

	return {
		version: REPORT_VERSION,
		...meta,
		stakes: hands[0]?.stakes ?? '',
		tables: [...new Set(hands.map((hand) => hand.table))].sort(),
		firstHand: hands[0]?.timestamp ?? '',
		lastHand: hands.at(-1)?.timestamp ?? '',
		handCount: hands.length,
		gradedHands: hands.filter((hand) => hand.gradeable).length,
		unreconciled: hands.filter((hand) => !hand.reconciled).length,
		warnings: hands.flatMap((hand) =>
			hand.warnings.map((warning) => `Hand #${hand.id}: ${warning}`)
		),
		session: summariseTallies(hands.map((hand) => hand.tally)),
		openings: summariseSpots(hands),
		leaks: [...byType.values()].sort((a, b) => a.evLostBb - b.evLostBb),
		totalEvLostBb,
		mistakeCount: [...byType.values()].reduce((sum, leak) => sum + leak.count, 0),
		goodPlayCount,
	};
}

/** Assembles the report of a completed run. */
export function finishAnalysis(run: AnalysisRun): AnalysisReport {
	const gradings = run.reports.flatMap((report) => report.gradings);
	return {
		...summariseHands(run.reports, {
			hero: run.hero,
			rake: run.options.rake,
			seed: run.options.seed ?? 1,
			samples: run.options.samples ?? null,
		}),
		mistakes: gradings
			.filter((grading) => grading.mistake !== null)
			.sort((a, b) => a.evLostBb - b.evLostBb),
		goodPlays: gradings
			.filter((grading) => grading.goodPlay !== null)
			.sort((a, b) => b.goodPlay!.evGainedBb - a.goodPlay!.evGainedBb),
		hands: run.reports,
	};
}

/** Analyses a whole hand-history file in one call. */
export function analyzeLog(
	text: string,
	options: AnalysisOptions = {},
	previous?: AnalysisReport
): AnalysisReport {
	const run = startAnalysis(text, options, previous);
	advanceAnalysis(run);
	return finishAnalysis(run);
}
