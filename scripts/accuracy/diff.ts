/**
 * Reads one findings file and summarises it, or two and compares them: the
 * figures side by side, then every finding that appeared, went, or changed
 * kind or cost, at the first seed.
 *
 *   tsx scripts/accuracy/diff.ts before.json [after.json] [--verdicts file.json]
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
	findingLine,
	loadVerdicts,
	summarise,
	verdictOf,
	type FindingRecord,
	type FindingsFile,
	type RunSummary,
} from './shared';

const HERE = dirname(fileURLToPath(import.meta.url));

/** A cost that moves by less than this is not reported as moved. */
const MOVED_BB = 0.1;

const read = (path: string): FindingsFile =>
	JSON.parse(readFileSync(path, 'utf8')) as FindingsFile;

function rows(summary: RunSummary): [string, string][] {
	return [
		['Mistakes, seed 1', String(summary.first.mistakes)],
		['Good plays, seed 1', String(summary.first.goodPlays)],
		['Preflop bb, seed 1', summary.first.preflopBb.toFixed(2)],
		['Postflop bb, seed 1', summary.first.postflopBb.toFixed(2)],
		['Mistakes, mean over seeds', summary.mistakes.toFixed(2)],
		['Postflop bb, mean over seeds', summary.postflopBb.toFixed(2)],
		['Findings, seed 1', String(summary.findings)],
		['Postflop findings, seed 1', String(summary.postflop)],
		['Findings that flip', String(summary.flipping)],
		['Flips (seed x finding)', String(summary.flips)],
		['Wrong findings remaining', String(summary.wrong.length)],
		['Mis-costed remaining', String(summary.miscosted.length)],
		['Postflop wrong or mis-costed, medium', String(summary.wrongMedium.length)],
		['Unreviewed findings', String(summary.unreviewed.length)],
	];
}

function main(): void {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: { verdicts: { type: 'string' } },
	});
	if (positionals.length < 1 || positionals.length > 2) {
		console.error('Usage: diff.ts before.json [after.json] [--verdicts file.json]');
		process.exit(1);
	}
	const verdictsPath = values.verdicts ?? join(HERE, 'verdicts.json');
	const verdicts = existsSync(verdictsPath) ? loadVerdicts(verdictsPath) : null;
	if (!verdicts) console.log(`(no verdicts at ${verdictsPath}: wrong counts are 0)`);

	const files = positionals.map(read);
	const summaries = files.map((file) => summarise(file, verdicts));
	const table = summaries.map(rows);
	const header = files.map((file, i) => `${i ? 'after' : 'before'} v${file.version}`);
	console.log(`${''.padEnd(38)}${header.map((h) => h.padStart(12)).join('')}`);
	table[0].forEach(([label], row) => {
		console.log(
			`${label.padEnd(38)}${table.map((column) => column[row][1].padStart(12)).join('')}`
		);
	});

	console.log(
		'\nBy log, at the first seed: mistakes, good plays, preflop bb, postflop bb'
	);
	files.forEach((file, i) => {
		for (const run of file.totals.filter((total) => total.seed === file.seeds[0])) {
			console.log(
				`  ${header[i].padEnd(12)} ${run.log.padEnd(40)} ${run.mistakes} ${run.goodPlays} ${run.preflopBb.toFixed(2)} ${run.postflopBb.toFixed(2)}`
			);
		}
		console.log(
			`  ${header[i].padEnd(12)} run took ${(file.runtimeMs / 1000).toFixed(1)}s`
		);
	});

	const last = files.at(-1)!;
	const summary = summaries.at(-1)!;
	const seed = last.seeds[0];
	console.log('\nFlipping, in the last file (seeds a finding of any kind / flips):');
	for (const record of last.findings.filter((r) => (r.flips ?? 0) > 0)) {
		console.log(`  ${findingLine(record)} (at ${record.seeds} seeds)`);
	}
	const list = (title: string, records: typeof summary.wrong) => {
		if (records.length === 0) return;
		console.log(`\n${title}`);
		for (const record of records) console.log(`  ${findingLine(record, seed)}`);
	};
	list('Wrong, still made:', summary.wrong);
	list('Mis-costed, still made:', summary.miscosted);
	list('Unreviewed:', summary.unreviewed);

	if (files.length === 2) {
		const [before, after] = files;
		const at = (file: FindingsFile) =>
			new Map(
				file.findings
					.filter((record) => record.bySeed[file.seeds[0]])
					.map((record) => [record.key, record])
			);
		const a = at(before);
		const b = at(after);
		const gone = [...a.values()].filter((record) => !b.has(record.key));
		const added = [...b.values()].filter((record) => !a.has(record.key));
		const changed = [...b.values()].filter((record) => {
			const old = a.get(record.key);
			if (!old) return false;
			const [x, y] = [old.bySeed[before.seeds[0]], record.bySeed[after.seeds[0]]];
			return x.kind !== y.kind || Math.abs(x.bb - y.bb) >= MOVED_BB;
		});
		const tag = (record: FindingRecord) =>
			verdicts ?
				` [${verdictOf(verdicts, record, record.bySeed[before.seeds[0]].kind) ?? '-'}]`
			:	'';
		console.log(`\nGone (${gone.length}):`);
		for (const r of gone) console.log(`  ${findingLine(r, before.seeds[0])}${tag(r)}`);
		console.log(`\nNew (${added.length}):`);
		for (const r of added) console.log(`  ${findingLine(r, after.seeds[0])}`);
		console.log(`\nChanged (${changed.length}):`);
		for (const r of changed) {
			console.log(`  was ${findingLine(a.get(r.key)!, before.seeds[0])}`);
			console.log(`  now ${findingLine(r, after.seeds[0])}`);
		}
	}
}

main();
