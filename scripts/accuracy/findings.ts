/**
 * The accuracy harness: every finding the coach makes on some logs, at a run
 * of seeds, as JSON keyed by hand, street and step. A finding that is not the
 * same at every seed is counted as a flip. With a verdicts file (the audit's
 * agree / defensible / wrong per finding) it also says how many findings judged
 * wrong are still made. See docs/accuracy.md.
 *
 *   tsx scripts/accuracy/findings.ts <log...> [--seeds 1..20] [--samples n]
 *       [--rake r] [--out file.json] [--verdicts file.json]
 *
 * Not part of the bundle or of `npm test`. The logs carry real screen names:
 * keep them, and the JSON this writes, out of the repository.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { analyzeLog, REPORT_VERSION } from '#utils/coach/report';
import type { Grading } from '#utils/coach/grade';
import {
	loadVerdicts,
	verdictOf,
	type FindingsFile,
	type FindingRecord,
	type RunTotals,
	type Verdict,
} from './shared';

const HERE = dirname(fileURLToPath(import.meta.url));

/** `1..20` or `1,4,7`. */
function seedsOf(text: string): number[] {
	const range = /^(\d+)\.\.(\d+)$/.exec(text);
	if (range) {
		const [low, high] = [Number(range[1]), Number(range[2])];
		return Array.from({ length: high - low + 1 }, (_, i) => low + i);
	}
	return text.split(',').map(Number);
}

const phaseOf = (grading: Grading): 'preflop' | 'postflop' =>
	grading.street === 'preflop' ? 'preflop' : 'postflop';

const kindOf = (grading: Grading): string =>
	grading.mistake ?? `good:${grading.goodPlay?.type ?? '?'}`;

const evOf = (grading: Grading): number =>
	grading.goodPlay ? grading.goodPlay.evGainedBb : grading.evLostBb;

const round = (value: number): number => Math.round(value * 100) / 100;

function main(): void {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: {
			seeds: { type: 'string', default: '1..20' },
			samples: { type: 'string' },
			rake: { type: 'string' },
			out: { type: 'string' },
			verdicts: { type: 'string' },
		},
	});
	if (positionals.length === 0) {
		console.error('Usage: findings.ts <log...> [--seeds 1..20] [--out file.json]');
		process.exit(1);
	}
	const seeds = seedsOf(values.seeds);
	const samples = values.samples ? Number(values.samples) : undefined;
	const rake = values.rake ? Number(values.rake) : undefined;

	const records = new Map<string, FindingRecord>();
	const totals: RunTotals[] = [];
	const decisions = new Map<string, number>();
	const started = Date.now();

	for (const path of positionals) {
		const text = readFileSync(path, 'utf8');
		const log = basename(path);
		for (const seed of seeds) {
			const report = analyzeLog(text, { seed, samples, rake });
			const run: RunTotals = {
				log,
				seed,
				mistakes: 0,
				goodPlays: 0,
				preflopBb: 0,
				postflopBb: 0,
				postflopDecisions: 0,
			};
			for (const hand of report.hands) {
				for (const grading of hand.gradings) {
					const phase = phaseOf(grading);
					if (phase === 'postflop') run.postflopDecisions++;
					if (!grading.mistake && !grading.goodPlay) continue;
					if (grading.mistake) {
						run.mistakes++;
						run[phase === 'preflop' ? 'preflopBb' : 'postflopBb'] += grading.evLostBb;
					} else run.goodPlays++;

					const key = `${hand.id}:${grading.street}:${grading.stepIndex}`;
					const record = (records.get(key) ?? {
						key,
						log,
						hand: hand.id,
						street: grading.street,
						stepIndex: grading.stepIndex,
						phase,
						bySeed: {},
					}) as FindingRecord;
					record.bySeed[seed] = {
						kind: kindOf(grading),
						confidence: grading.confidence,
						severity: grading.severity,
						bb: round(evOf(grading)),
					};
					records.set(key, record);
				}
			}
			run.preflopBb = round(run.preflopBb);
			run.postflopBb = round(run.postflopBb);
			totals.push(run);
			decisions.set(log, run.postflopDecisions);
			process.stderr.write(`${log} seed ${seed}: ${run.mistakes} mistakes\n`);
		}
	}

	const verdictsPath = values.verdicts ?? join(HERE, 'verdicts.json');
	const verdicts = existsSync(verdictsPath) ? loadVerdicts(verdictsPath) : null;

	const findings = [...records.values()].map((record): FindingRecord => {
		const seen = Object.values(record.bySeed);
		const counts = new Map<string, number>();
		for (const { kind } of seen) counts.set(kind, (counts.get(kind) ?? 0) + 1);
		const [kind, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
		const at = seen.filter((entry) => entry.kind === kind);
		const verdict: Verdict | null = verdicts ? verdictOf(verdicts, record, kind) : null;
		return {
			...record,
			kind,
			confidence: at[0].confidence,
			bb: round(at.reduce((sum, entry) => sum + entry.bb, 0) / at.length),
			seeds: seen.length,
			// Seeds at which this decision is not this finding: absent, or another kind.
			flips: seeds.length - count,
			verdict,
		};
	});
	findings.sort((a, b) => (a.bb ?? 0) - (b.bb ?? 0));

	const file: FindingsFile = {
		version: REPORT_VERSION,
		logs: positionals.map((path) => basename(path)),
		seeds,
		samples: samples ?? null,
		postflopDecisions: Object.fromEntries(decisions),
		runtimeMs: Date.now() - started,
		totals,
		findings,
	};
	const json = JSON.stringify(file, null, '\t');
	if (values.out) writeFileSync(values.out, json);
	else console.log(json);
	process.stderr.write(`${findings.length} findings, ${file.runtimeMs}ms\n`);
}

main();
