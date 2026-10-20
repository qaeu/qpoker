/**
 * A Train drill's high scores: a top five per board, where a board is one drill
 * at one mode under one version of the drill's model. See docs/train-model.md.
 */

import { DRILL_IDS, DRILL_MODES, type DrillId, type DrillMode } from './drills';

/** How many runs a board keeps. */
export const BOARD_SIZE = 5;

/**
 * Bump a drill's version when its answers could come out differently (a chart,
 * the call pricing, the texture rule): its runs then start a fresh board.
 */
export const DRILL_VERSION: Record<DrillId, number> = {
	preflop: 1,
	potOdds: 1,
	equity: 1,
	cbet: 1,
};

/** One finished run, as a board keeps it. */
export interface ScoreEntry {
	correct: number;
	total: number;
	/** The sum of the answer times: the tie-break. */
	timeMs: number;
	/** When the run finished, as an ISO string. */
	date: string;
	/** What the run was dealt from. */
	seed: number;
}

/** Every board, by `boardKey`, best run first. */
export type ScoreBoards = Readonly<Record<string, readonly ScoreEntry[]>>;

export interface RecordedScore {
	boards: ScoreBoards;
	/** The run's place on its board, from 1, or null where it did not make it. */
	rank: number | null;
	/** The board after the run, best first. */
	board: readonly ScoreEntry[];
	/** The run is the board's best: it displaced the old one or filled an empty board. */
	newBest: boolean;
}

const KEY = /^([a-zA-Z]+):([a-z]+):v(\d+)$/;

function isScoreEntry(value: unknown): value is ScoreEntry {
	if (typeof value !== 'object' || value === null) return false;
	const entry = value as Record<string, unknown>;
	return (
		Number.isInteger(entry.correct)
		&& Number.isInteger(entry.total)
		&& (entry.total as number) > 0
		&& (entry.correct as number) >= 0
		&& (entry.correct as number) <= (entry.total as number)
		&& Number.isFinite(entry.timeMs)
		&& (entry.timeMs as number) >= 0
		&& typeof entry.date === 'string'
		&& Number.isFinite(entry.seed)
	);
}

export function boardKey(drill: DrillId, mode: DrillMode): string {
	return `${drill}:${mode}:v${DRILL_VERSION[drill]}`;
}

/** More right first, then quicker. Negative where `a` ranks above `b`. */
export function compareEntries(a: ScoreEntry, b: ScoreEntry): number {
	return b.correct / b.total - a.correct / a.total || a.timeMs - b.timeMs;
}

/**
 * Enters a run on its board. A run that only equals one already there ranks
 * beneath it: the older run got there first.
 */
export function recordScore(
	boards: ScoreBoards,
	key: string,
	entry: ScoreEntry
): RecordedScore {
	const existing = boards[key] ?? [];
	const place = existing.findIndex((other) => compareEntries(entry, other) < 0);
	const at = place === -1 ? existing.length : place;
	const board = [...existing.slice(0, at), entry, ...existing.slice(at)].slice(
		0,
		BOARD_SIZE
	);
	const rank = at < BOARD_SIZE ? at + 1 : null;
	return { boards: { ...boards, [key]: board }, rank, board, newBest: rank === 1 };
}

/** The best run on a board, if it has one. */
export function bestOn(boards: ScoreBoards, key: string): ScoreEntry | null {
	return boards[key]?.[0] ?? null;
}

/**
 * Whether a stored value is a set of boards. A key that is not a drill and mode
 * this build knows, or a malformed run, fails the whole record: storage drops
 * what it cannot trust rather than half of it. An older version's board passes,
 * and is simply never read.
 */
export function isScoreBoards(value: unknown): value is ScoreBoards {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
	return Object.entries(value).every(([key, board]) => {
		const match = KEY.exec(key);
		return (
			match !== null
			&& (DRILL_IDS as readonly string[]).includes(match[1])
			&& (DRILL_MODES as readonly string[]).includes(match[2])
			&& Array.isArray(board)
			&& board.length <= BOARD_SIZE
			&& board.every(isScoreEntry)
		);
	});
}
