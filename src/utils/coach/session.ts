/**
 * The session's frequencies -- how often the hero entered pots, raised,
 * 3-bet, continuation-bet and so on -- each beside a baseline. Preflop the
 * baseline is what the charts would have done in the very spots the hero was
 * in; postflop it is a typical figure for a balanced player, and is marked so.
 * A leak is a gap from the baseline too wide to be the sample's doing.
 *
 * The counting is done a hand at a time (`tallyHand`) and summed (`addTally`),
 * so a session is a sum of stored hands and the same sums profile any player.
 */

import { CLASS_COUNT, classSize } from '../cards/combos';
import type { Position, Replay, Step } from '../history/replay';
import { decisionsOf, POSITIONS } from '../history/replay';
import { classifyPreflop, preflopRange } from '../ranges/preflopSpot';
import type { Range } from '../ranges/range';

export type StatId =
	| 'vpip'
	| 'pfr'
	| 'rfi'
	| 'threeBet'
	| 'foldToThreeBet'
	| 'bbDefend'
	| 'cbet'
	| 'foldToCbet'
	| 'wtsd'
	| 'wonAtShowdown';

export interface Stat {
	id: StatId;
	label: string;
	count: number;
	opportunities: number;
	/** `count / opportunities`, or null with no opportunities. */
	value: number | null;
	baseline: number | null;
	/** Where the baseline comes from: the hero's own spots, or a typical figure. */
	baselineSource: 'charts' | 'typical';
	/** Set when the gap is larger than the sample size explains. */
	leak: 'high' | 'low' | null;
}

export interface PositionRow {
	position: Position;
	hands: number;
	vpip: number;
	pfr: number;
	netBb: number;
}

/** How many of the hero's hands were dealt at one table size. */
export interface TableSize {
	players: number;
	hands: number;
}

export interface SessionSummary {
	hands: number;
	netBb: number;
	bbPer100: number;
	stats: Stat[];
	positions: PositionRow[];
	/** The fullest table first. The typical baselines are weighted by this mix. */
	tableSizes: TableSize[];
}

const LABELS: Record<StatId, string> = {
	vpip: 'VPIP',
	pfr: 'PFR',
	rfi: 'Raise first in',
	threeBet: '3-bet',
	foldToThreeBet: 'Fold to 3-bet',
	bbDefend: 'BB defence vs open',
	cbet: 'Flop c-bet',
	foldToCbet: 'Fold to flop c-bet',
	wtsd: 'Went to showdown',
	wonAtShowdown: 'Won at showdown',
};

const STAT_IDS = Object.keys(LABELS) as StatId[];

/** The table sizes a typical figure is kept for, by players dealt in. */
const TABLE_BUCKETS = ['headsUp', 'short', 'sixMax', 'fullRing'] as const;

type TableBucket = (typeof TABLE_BUCKETS)[number];

/**
 * Reference frequencies for a balanced player, where no chart applies, by
 * table size: fewer players means wider ranges, more betting and more
 * showdowns. Rules of thumb, not measurements. See docs/accuracy.md.
 */
const TYPICAL: Partial<Record<StatId, Record<TableBucket, number>>> = {
	cbet: { headsUp: 0.66, short: 0.63, sixMax: 0.6, fullRing: 0.57 },
	foldToCbet: { headsUp: 0.4, short: 0.43, sixMax: 0.45, fullRing: 0.48 },
	wtsd: { headsUp: 0.32, short: 0.3, sixMax: 0.28, fullRing: 0.26 },
	wonAtShowdown: { headsUp: 0.52, short: 0.52, sixMax: 0.52, fullRing: 0.52 },
};

const bucketOf = (players: number): TableBucket =>
	players <= 2 ? 'headsUp'
	: players <= 4 ? 'short'
	: players <= 6 ? 'sixMax'
	: 'fullRing';

/** Opportunities below which a frequency is never called a leak. */
export const MIN_SAMPLE = 10;
const MIN_GAP = 0.08;

/** One stat's sums: over a hand, a session, or everything seen of a player. */
export interface Tally {
	count: number;
	opportunities: number;
	/** The baseline's own count: its frequency summed over the opportunities. */
	expected: number;
}

type Mix = Record<TableBucket, number>;

const emptyMix = (): Mix => ({ headsUp: 0, short: 0, sixMax: 0, fullRing: 0 });

/**
 * A typical figure for a mix of table sizes: each size's figure weighted by
 * the hands at it. One size alone gives its figure exactly.
 */
function typicalOf(figures: Record<TableBucket, number>, mix: Mix): number | null {
	const present = TABLE_BUCKETS.filter((bucket) => mix[bucket] > 0);
	if (present.length === 0) return null;
	if (present.length === 1) return figures[present[0]];
	const total = present.reduce((sum, bucket) => sum + mix[bucket], 0);
	return present.reduce((sum, bucket) => sum + figures[bucket] * mix[bucket], 0) / total;
}

/** The chance a range takes an action, given per-hand frequencies for it. */
function expectedFrequency(prior: Range, frequency: (cls: number) => number): number {
	let total = 0;
	let acting = 0;
	for (let cls = 0; cls < CLASS_COUNT; cls++) {
		const weight = prior[cls] * classSize(cls);
		total += weight;
		acting += weight * frequency(cls);
	}
	return total > 0 ? acting / total : 0;
}

const isVoluntary = (step: Step): boolean =>
	step.action.kind === 'call'
	|| step.action.kind === 'raise'
	|| step.action.kind === 'bet';

/**
 * Whether a frequency sits further from its baseline than a sample this size
 * explains: over `MIN_GAP`, and over two standard errors.
 */
export function leakOf(
	value: number | null,
	baseline: number | null,
	opportunities: number
): 'high' | 'low' | null {
	if (value === null || baseline === null || opportunities < MIN_SAMPLE) return null;
	const error = Math.sqrt((baseline * (1 - baseline)) / opportunities);
	const gap = value - baseline;
	if (Math.abs(gap) <= Math.max(MIN_GAP, 2 * error)) return null;
	return gap > 0 ? 'high' : 'low';
}

/** What one hand adds to a player's frequencies. Plain data: it is stored. */
export interface HandTally {
	position: Position;
	/** Players dealt in. */
	players: number;
	netBb: number;
	/** Only the stats the hand gave an opportunity for. */
	stats: Partial<Record<StatId, Tally>>;
}

/** Hand tallies summed. Plain data too, so a player's can be kept and added to. */
export interface SessionTally {
	hands: number;
	netBb: number;
	stats: Partial<Record<StatId, Tally>>;
	positions: Partial<Record<Position, PositionRow>>;
	/** Hands by players dealt in. */
	sizes: Record<number, number>;
	/** The table sizes behind each typical stat's own opportunities. */
	mixes: Partial<Record<StatId, Mix>>;
}

export const emptyTally = (): SessionTally => ({
	hands: 0,
	netBb: 0,
	stats: {},
	positions: {},
	sizes: {},
	mixes: {},
});

/** One player's frequencies in one hand, or null when they were not dealt in. */
export function tallyHand(replay: Replay, player: string): HandTally | null {
	const { hand, layout } = replay;
	if (!layout || !(player in layout.positions)) return null;

	const stats: HandTally['stats'] = {};
	const add = (id: StatId, hit: boolean, expected = 0) => {
		const tally = (stats[id] ??= { count: 0, opportunities: 0, expected: 0 });
		tally.opportunities++;
		tally.expected += expected;
		if (hit) tally.count++;
	};
	const tally: HandTally = {
		position: layout.positions[player],
		players: layout.players.length,
		netBb: (replay.net[player] ?? 0) / hand.stakes.bigBlind,
		stats,
	};

	const decisions = decisionsOf(replay, player);
	const preflop = decisions.filter((step) => step.street === 'preflop');
	const vpip = preflop.some(isVoluntary);
	const pfr = preflop.some((step) => step.action.kind === 'raise');

	// The first decision carries the VPIP and PFR baselines: the whole range
	// is still in play there, and a walk has no decision at all.
	const first = preflop[0];
	if (first) {
		const { strategy } = classifyPreflop(replay, first);
		const full = preflopRange(replay, player, first.index);
		const raises = expectedFrequency(full, (cls) => strategy.raise[cls]);
		const calls =
			first.toCall > 0 ? expectedFrequency(full, (cls) => strategy.call[cls]) : 0;
		add('vpip', vpip, raises + calls);
		add('pfr', pfr, raises);
	} else {
		add('vpip', false);
		add('pfr', false);
	}

	for (const step of preflop) {
		const spot = classifyPreflop(replay, step);
		const prior = preflopRange(replay, player, step.index);
		const { strategy } = spot;
		const raises = expectedFrequency(prior, (cls) => strategy.raise[cls]);
		const calls = expectedFrequency(prior, (cls) => strategy.call[cls]);
		const raised = step.action.kind === 'raise';
		const folded = step.action.kind === 'fold';
		if (spot.scenario === 'rfi') add('rfi', raised, raises);
		if (spot.scenario === 'vsOpen' || spot.scenario === 'squeeze') {
			add('threeBet', raised, raises);
			if (spot.position === 'BB') add('bbDefend', !folded, raises + calls);
		}
		if (spot.scenario === 'vs3bet') add('foldToThreeBet', folded, 1 - raises - calls);
	}

	const sawFlop =
		hand.board.length >= 3 && !preflop.some((s) => s.action.kind === 'fold');
	if (!sawFlop) return tally;

	const aggressor = replay.steps.findLast(
		(step) => step.street === 'preflop' && step.action.kind === 'raise'
	)?.action.player;
	const flop = decisions.find((step) => step.street === 'flop');
	if (flop && aggressor === player && flop.raisesBefore === 0) {
		add('cbet', flop.action.kind === 'bet');
	}
	if (flop && aggressor && aggressor !== player && flop.raisesBefore === 1) {
		const bettor = replay.steps.find(
			(step) => step.street === 'flop' && step.action.kind === 'bet'
		)?.action.player;
		if (bettor === aggressor) add('foldToCbet', flop.action.kind === 'fold');
	}

	const folded = decisions.some((step) => step.action.kind === 'fold');
	const showdown = !folded && Object.keys(hand.shown).length > 0;
	add('wtsd', showdown);
	if (showdown) add('wonAtShowdown', (hand.won[player] ?? 0) > 0);

	return tally;
}

/**
 * Adds a hand to a running total, in place, and returns the total. A `sign` of
 * -1 takes the hand back out, for when its text has been replaced.
 */
export function addTally(
	total: SessionTally,
	hand: HandTally,
	sign: 1 | -1 = 1
): SessionTally {
	total.hands += sign;
	total.netBb += sign * hand.netBb;
	total.sizes[hand.players] = (total.sizes[hand.players] ?? 0) + sign;

	const row = (total.positions[hand.position] ??= {
		position: hand.position,
		hands: 0,
		vpip: 0,
		pfr: 0,
		netBb: 0,
	});
	row.hands += sign;
	row.netBb += sign * hand.netBb;
	row.vpip += sign * (hand.stats.vpip?.count ?? 0);
	row.pfr += sign * (hand.stats.pfr?.count ?? 0);

	for (const id of STAT_IDS) {
		const added = hand.stats[id];
		if (!added) continue;
		const tally = (total.stats[id] ??= { count: 0, opportunities: 0, expected: 0 });
		tally.count += sign * added.count;
		tally.opportunities += sign * added.opportunities;
		tally.expected += sign * added.expected;
		if (id in TYPICAL) {
			const mix = (total.mixes[id] ??= emptyMix());
			mix[bucketOf(hand.players)] += sign * added.opportunities;
		}
	}
	return total;
}

/** A total's frequencies, each beside its baseline. */
export function sessionOf(total: SessionTally): SessionSummary {
	const sizes = Object.entries(total.sizes)
		.map(([players, hands]): TableSize => ({ players: Number(players), hands }))
		.filter(({ hands }) => hands > 0)
		.sort((a, b) => b.players - a.players);
	// Every hand dealt stands in for a typical stat that never came up.
	const dealt = emptyMix();
	for (const { players, hands } of sizes) dealt[bucketOf(players)] += hands;

	const stats = STAT_IDS.map((id): Stat => {
		const { count, opportunities, expected } = total.stats[id] ?? {
			count: 0,
			opportunities: 0,
			expected: 0,
		};
		const typical = TYPICAL[id];
		const value = opportunities > 0 ? count / opportunities : null;
		const baseline =
			typical !== undefined ?
				(typicalOf(typical, total.mixes[id] ?? dealt) ?? typical.sixMax)
			: opportunities > 0 ? expected / opportunities
			: null;
		return {
			id,
			label: LABELS[id],
			count,
			opportunities,
			value,
			baseline,
			baselineSource: typical !== undefined ? 'typical' : 'charts',
			leak: leakOf(value, baseline, opportunities),
		};
	});

	return {
		hands: total.hands,
		netBb: total.netBb,
		bbPer100: total.hands > 0 ? (total.netBb / total.hands) * 100 : 0,
		stats,
		positions: POSITIONS.flatMap((position) => total.positions[position] ?? []).filter(
			(row) => row.hands > 0
		),
		tableSizes: sizes,
	};
}

/** The frequencies of a run of hand tallies, a hand not dealt into passed over. */
export function summariseTallies(tallies: Iterable<HandTally | null>): SessionSummary {
	const total = emptyTally();
	for (const tally of tallies) {
		if (tally) addTally(total, tally);
	}
	return sessionOf(total);
}

/** Sums the session's frequencies over every hand the hero was dealt into. */
export function summariseSession(
	replays: readonly Replay[],
	hero: string
): SessionSummary {
	return summariseTallies(replays.map((replay) => tallyHand(replay, hero)));
}
