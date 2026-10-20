/**
 * Grading a Train answer against the engine's own answer to the question: the
 * chart at `MIX_FLOOR` (as the coach grades a preflop decision), the sign of a
 * rake-free `priceCall`, an equity within a tolerance, and the texture rule's
 * size. See docs/train-model.md.
 */

import { MIX_FLOOR } from '../coach/grade';
import { className } from '../cards/combos';
import { frequencyOf, type PreflopChoice } from '../ranges/range';
import { tableOf, tableStrategy } from '../ui/rangeTables';
import {
	EQUITY_BANDS,
	type CbetQuestion,
	type Choice,
	type DrillMode,
	type EquityQuestion,
	type PotOddsQuestion,
	type PreflopQuestion,
	type Question,
} from './drills';

export type Response =
	| { kind: 'choice'; choice: Choice }
	| { kind: 'band'; band: number }
	| { kind: 'estimate'; pct: number };

export interface Graded {
	correct: boolean;
	/** Null when the clock ran out first. */
	response: Response | null;
	/** Every choice that counts as right; empty for equity. */
	right: readonly Choice[];
	/** The right answer as text: `Raise`, `Call`, `33%`, `41%`. */
	answer: string;
	/** One line of why. */
	verdict: string;
}

/** How far, in points, a typed equity may be from the true one and still be right. */
export const EQUITY_TOLERANCE = 5;

const NAMES: Record<Choice, string> = {
	fold: 'Fold',
	check: 'Check',
	call: 'Call',
	raise: 'Raise',
	bet33: '33%',
	bet50: '50%',
	bet66: '66%',
};

const PREFLOP_ORDER: readonly PreflopChoice[] = ['raise', 'call', 'fold'];

const percent = (share: number): string => `${Math.round(share * 100)}%`;
const signedBb = (bb: number): string =>
	`${bb >= 0 ? '+' : '−'}${Math.abs(bb).toFixed(1)} bb`;

function chosen(response: Response | null): Choice | null {
	return response?.kind === 'choice' ? response.choice : null;
}

function joinAnswers(right: readonly Choice[]): string {
	return right
		.map((choice, at) => (at === 0 ? NAMES[choice] : NAMES[choice].toLowerCase()))
		.join(' or ');
}

function gradePreflop(question: PreflopQuestion, response: Response | null): Graded {
	const strategy = tableStrategy(question.table, question.depth);
	const named = (choice: PreflopChoice): Choice =>
		question.free && choice !== 'raise' ? 'check' : choice;
	// With nothing to call a call and a fold are both the check.
	const frequencies = new Map<Choice, number>();
	for (const choice of PREFLOP_ORDER) {
		const key = named(choice);
		const share = frequencyOf(strategy, question.cls, choice);
		frequencies.set(key, (frequencies.get(key) ?? 0) + share);
	}
	const right = [...frequencies]
		.filter(([, share]) => share >= MIX_FLOOR)
		.map(([choice]) => choice);
	const played = [...frequencies]
		.filter(([, share]) => share > 0.005)
		.sort((a, b) => b[1] - a[1])
		.map(([choice, share]) => `${NAMES[choice].toLowerCase()} ${percent(share)}`);
	const choice = chosen(response);
	return {
		correct: choice !== null && right.includes(choice),
		response,
		right,
		answer: joinAnswers(right),
		verdict: `${tableOf(question.table).short} with ${className(question.cls)}: ${played.join(', ')}`,
	};
}

function gradePotOdds(question: PotOddsQuestion, response: Response | null): Graded {
	const best: Choice = question.callEvBb > 0 ? 'call' : 'fold';
	const choice = chosen(response);
	const ev = `call ${signedBb(question.callEvBb)}`;
	return {
		correct: choice === best,
		response,
		right: [best],
		answer: NAMES[best],
		verdict: `Needs ${percent(question.potOdds)} · you have ${percent(question.equity)} · ${ev}`,
	};
}

/** The equity as the drill shows and grades it: whole percent. */
export const equityPercent = (question: EquityQuestion): number =>
	Math.round(question.equity * 100);

const bandText = (band: number): string => {
	const [low, high] = EQUITY_BANDS[band] ?? [0, 0];
	return `${low}–${high}%`;
};

function gradeEquity(
	question: EquityQuestion,
	response: Response | null,
	mode: DrillMode
): Graded {
	const truth = equityPercent(question);
	const answer = `${truth}%`;
	const graded = (correct: boolean, verdict: string): Graded => ({
		correct,
		response,
		right: [],
		answer,
		verdict,
	});
	if (mode === 'easy') {
		if (response?.kind !== 'band') return graded(false, `It is ${answer}`);
		const [low, high] = EQUITY_BANDS[response.band] ?? [Infinity, -Infinity];
		return graded(
			truth >= low && truth <= high,
			`You chose ${bandText(response.band)} · it is ${answer}`
		);
	}
	if (response?.kind !== 'estimate') return graded(false, `It is ${answer}`);
	const off = Math.abs(Math.round(response.pct) - truth);
	return graded(
		off <= EQUITY_TOLERANCE,
		`You said ${Math.round(response.pct)}% · off by ${off}`
	);
}

const SIZE_CHOICE: Record<number, Choice> = {
	0.33: 'bet33',
	0.5: 'bet50',
	0.66: 'bet66',
};

function gradeCbet(question: CbetQuestion, response: Response | null): Graded {
	const best = SIZE_CHOICE[question.size];
	const reading =
		question.size === 0.66 ? 'wet'
		: question.size === 0.33 ? 'dry'
		: 'in between';
	const board = question.texture.charAt(0).toUpperCase() + question.texture.slice(1);
	return {
		correct: chosen(response) === best,
		response,
		right: [best],
		answer: NAMES[best],
		verdict: `${board} flop is ${reading}: the model bets ${NAMES[best]}`,
	};
}

/** Grades one answer; a null response is a timeout, and always a miss. */
export function gradeAnswer(
	question: Question,
	response: Response | null,
	mode: DrillMode
): Graded {
	switch (question.drill) {
		case 'preflop':
			return gradePreflop(question, response);
		case 'potOdds':
			return gradePotOdds(question, response);
		case 'equity':
			return gradeEquity(question, response, mode);
		case 'cbet':
			return gradeCbet(question, response);
	}
}
