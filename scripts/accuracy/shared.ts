/**
 * What the accuracy scripts share: the findings file's shape, the verdicts
 * file and how a finding is matched to its verdict, and the summary of a run.
 */

import { readFileSync } from 'node:fs';

/** The audit's word on a finding: is the recommended action better than the one taken? */
export type Verdict = 'agree' | 'defensible' | 'wrong' | 'mis-costed';

/**
 * One reviewed finding. Matched by hand, street and kind (a mistake type, or
 * `good:<play>`), since the audit did not record the step.
 */
export interface VerdictEntry {
	hand: string;
	street: string;
	kind: string;
	verdict: Verdict;
	note?: string;
}

export interface VerdictsFile {
	/** Where the verdicts come from, e.g. the audit's date and version. */
	source: string;
	verdicts: VerdictEntry[];
}

export interface SeedFinding {
	kind: string;
	confidence: string;
	severity: string;
	bb: number;
}

export interface FindingRecord {
	/** `<hand>:<street>:<stepIndex>`. */
	key: string;
	log: string;
	hand: string;
	street: string;
	stepIndex: number;
	phase: 'preflop' | 'postflop';
	bySeed: Record<number, SeedFinding>;
	/** The kind most seeds gave, its confidence and its mean bb. */
	kind?: string;
	confidence?: string;
	bb?: number;
	/** Seeds at which the decision was a finding of any kind. */
	seeds?: number;
	/** Seeds at which it was not the modal finding. */
	flips?: number;
	verdict?: Verdict | null;
}

export interface RunTotals {
	log: string;
	seed: number;
	mistakes: number;
	goodPlays: number;
	preflopBb: number;
	postflopBb: number;
	postflopDecisions: number;
}

export interface FindingsFile {
	version: number;
	logs: string[];
	seeds: number[];
	samples: number | null;
	postflopDecisions: Record<string, number>;
	runtimeMs: number;
	totals: RunTotals[];
	findings: FindingRecord[];
}

export function loadVerdicts(path: string): VerdictsFile {
	return JSON.parse(readFileSync(path, 'utf8')) as VerdictsFile;
}

export function verdictOf(
	file: VerdictsFile,
	record: Pick<FindingRecord, 'hand' | 'street'>,
	kind: string
): Verdict | null {
	return (
		file.verdicts.find(
			(entry) =>
				entry.hand === record.hand
				&& entry.street === record.street
				&& entry.kind === kind
		)?.verdict ?? null
	);
}

export interface RunSummary {
	/** Over every seed, per log summed. */
	mistakes: number;
	goodPlays: number;
	preflopBb: number;
	postflopBb: number;
	/** At the first seed. */
	first: { mistakes: number; goodPlays: number; preflopBb: number; postflopBb: number };
	findings: number;
	postflop: number;
	flipping: number;
	flips: number;
	/** Findings judged wrong (or mis-costed) that are still made at the first seed. */
	wrong: FindingRecord[];
	miscosted: FindingRecord[];
	wrongMedium: FindingRecord[];
	/** Postflop findings at the first seed with no verdict: new since the review. */
	unreviewed: FindingRecord[];
}

const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);
const round = (value: number): number => Math.round(value * 100) / 100;

/** The figures that compare two runs, means over the seeds. */
export function summarise(file: FindingsFile, verdicts: VerdictsFile | null): RunSummary {
	const seeds = file.seeds.length;
	const first = file.seeds[0];
	const atFirst = file.totals.filter((run) => run.seed === first);
	const mean = (pick: (run: RunTotals) => number) =>
		round(sum(file.totals.map(pick)) / seeds);
	const present = file.findings.filter((record) => record.bySeed[first] !== undefined);
	const judged = (record: FindingRecord) =>
		verdicts ? verdictOf(verdicts, record, record.bySeed[first].kind) : null;
	return {
		mistakes: mean((run) => run.mistakes),
		goodPlays: mean((run) => run.goodPlays),
		preflopBb: mean((run) => run.preflopBb),
		postflopBb: mean((run) => run.postflopBb),
		first: {
			mistakes: sum(atFirst.map((run) => run.mistakes)),
			goodPlays: sum(atFirst.map((run) => run.goodPlays)),
			preflopBb: round(sum(atFirst.map((run) => run.preflopBb))),
			postflopBb: round(sum(atFirst.map((run) => run.postflopBb))),
		},
		findings: present.length,
		postflop: present.filter((record) => record.phase === 'postflop').length,
		flipping: file.findings.filter((record) => (record.flips ?? 0) > 0).length,
		flips: sum(file.findings.map((record) => record.flips ?? 0)),
		wrong: present.filter((record) => judged(record) === 'wrong'),
		miscosted: present.filter((record) => judged(record) === 'mis-costed'),
		wrongMedium: present.filter(
			(record) =>
				record.phase === 'postflop'
				&& (judged(record) === 'wrong' || judged(record) === 'mis-costed')
				&& record.bySeed[first].confidence === 'medium'
		),
		// The review covered every postflop finding and only the wrong preflop ones.
		unreviewed:
			verdicts ?
				present.filter((record) => record.phase === 'postflop' && judged(record) === null)
			:	[],
	};
}

export function findingLine(record: FindingRecord, seed?: number): string {
	const at = seed !== undefined ? record.bySeed[seed] : undefined;
	const kind = at?.kind ?? record.kind;
	const bb = at?.bb ?? record.bb;
	const confidence = at?.confidence ?? record.confidence;
	return `${record.hand} ${record.street.padEnd(7)} #${String(record.stepIndex).padEnd(3)} ${String(kind).padEnd(20)} ${String(confidence).padEnd(6)} ${String(bb?.toFixed(2)).padStart(7)}bb  flips ${record.flips ?? 0}`;
}
