/**
 * A finished Train drill, and the words the views print it in. The results
 * screen reads the records, and the board keeps `scoreEntry`.
 */

import {
	EQUITY_BANDS,
	type Choice,
	type DrillId,
	type DrillMode,
	type Question,
} from './drills';
import type { Graded, Response } from './grade';
import type { ScoreEntry } from './scores';

/** One answered question. */
export interface TrainRecord {
	question: Question;
	graded: Graded;
	/** From the question showing to the answer. */
	timeMs: number;
}

/** A drill played to its end. */
export interface DrillRun {
	drill: DrillId;
	mode: DrillMode;
	seed: number;
	records: TrainRecord[];
}

export const DRILL_NAMES: Record<DrillId, string> = {
	preflop: 'Preflop charts',
	potOdds: 'Pot odds',
	equity: 'Equity',
	cbet: 'C-bet sizing',
};

export const DRILL_BLURBS: Record<DrillId, string> = {
	preflop: 'A seat, a spot and a hand: raise, call or fold, as the charts play it.',
	potOdds: 'Heads up on the turn or river, facing a bet: is the call worth its price?',
	equity: 'A hand, a board and a range to beat: how often does the hand win?',
	cbet: 'A flop as the preflop raiser: which size does the model bet it at?',
};

export const MODE_NAMES: Record<DrillMode, string> = {
	easy: 'Easy',
	hard: 'Hard',
	test: 'Test',
};

export const CHOICE_LABELS: Record<Choice, string> = {
	fold: 'Fold',
	check: 'Check',
	call: 'Call',
	raise: 'Raise',
	bet33: 'Bet 33%',
	bet50: 'Bet 50%',
	bet66: 'Bet 66%',
};

/** Minutes and seconds, as a stopwatch reads: `1:07`. */
export function formatClock(ms: number): string {
	const seconds = Math.floor(Math.max(0, ms) / 1000);
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** An answer as the review list prints it; a timeout is `Time`. */
export function responseText(response: Response | null): string {
	if (response === null) return 'Time';
	switch (response.kind) {
		case 'choice':
			return CHOICE_LABELS[response.choice];
		case 'band': {
			const [low, high] = EQUITY_BANDS[response.band] ?? [0, 0];
			return `${low}–${high}%`;
		}
		case 'estimate':
			return `${Math.round(response.pct)}%`;
	}
}

/** The run as a board keeps it. The date is handed in: the engine reads no clock. */
export function scoreEntry(run: DrillRun, date: Date): ScoreEntry {
	return {
		correct: run.records.filter((record) => record.graded.correct).length,
		total: run.records.length,
		timeMs: Math.round(run.records.reduce((sum, record) => sum + record.timeMs, 0)),
		date: date.toISOString(),
		seed: run.seed,
	};
}
