/**
 * The command line: read a hand-history file, analyse it, print the report --
 * or, with a command, keep the hands in a library on disk and report over all
 * of them. With `fileStore.ts`, the only modules that touch Node's own APIs.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';

import { SEVERITIES, type Severity } from '#utils/coach/mistakes';
import { analyzeLog, type AnalysisReport } from '#utils/coach/report';
import { sessionsOf, type PlaySession, type Scope } from '#utils/coach/sessions';
import { trendOf } from '#utils/coach/trend';
import { backupOf, logTextOf } from '#utils/store/backup';
import { advanceIngest, startIngest } from '#utils/store/ingest';
import { libraryAnalysis, loadLibrary } from '#utils/store/library';
import { profileOf } from '#utils/store/profile';
import type { HandStore } from '#utils/store/types';
import { createFileStore } from './fileStore';
import { formatReport } from './format';
import { formatImport, formatPlayers, formatProfile, formatTrend } from './libraryFormat';

const USAGE = `Usage: qpoker <hand-history.txt> [options]
       qpoker <command> [options]

Grades every decision in a PokerStars hand-history file against a GTO baseline.
Given a file, it reports on that file and keeps nothing. The commands keep the
hands in a library, so a report can be made over all of them:

  import <files...>      Load logs into the library; a hand it has is passed over
  report                 The report, over the library's hands
  trend                  Results and mistakes, sitting by sitting
  players [name]         Everyone met, or one player's profile
  library                What the library holds (--export <file>, --clear --yes)

Library options:
  --library <dir>        Where the library is kept (default: ~/.qpoker,
                         or $QPOKER_LIBRARY)
  --scope <s>            all | latest | week | month, or a sitting's start as
                         trend prints it (default: all)

Options:
  --hero <name>          Player to coach (default: the player the log was dealt to)
  --top <n>              Mistakes, and good plays, to print in full (default: 15)
  --min-severity <s>     inaccuracy | mistake | blunder (default: inaccuracy)
  --hand <id>            Show one hand with every decision graded
  --json                 Print the whole report as JSON
  --seed <n>             Seed for the equity simulations (default: 1)
  --samples <n>          Runouts sampled per equity calculation (default: 300)
  --rake <fraction>      Rake as a share of the pot (default: taken from the log)
  --no-color             Plain text
  -h, --help             This message`;

const COMMANDS = ['import', 'report', 'trend', 'players', 'library'] as const;
type Command = (typeof COMMANDS)[number];

/** Hands graded between two commits: what a run cut short has to do again. */
const IMPORT_CHUNK = 200;

const OPTIONS = {
	hero: { type: 'string' },
	top: { type: 'string' },
	'min-severity': { type: 'string' },
	hand: { type: 'string' },
	json: { type: 'boolean' },
	seed: { type: 'string' },
	samples: { type: 'string' },
	rake: { type: 'string' },
	'no-color': { type: 'boolean' },
	library: { type: 'string' },
	scope: { type: 'string' },
	export: { type: 'string' },
	clear: { type: 'boolean' },
	yes: { type: 'boolean' },
	help: { type: 'boolean', short: 'h' },
} as const;

type Values = ReturnType<typeof parseArgs<{ options: typeof OPTIONS }>>['values'];

function fail(message: string): never {
	process.stderr.write(`${message}\n\n${USAGE}\n`);
	process.exit(2);
}

/** A failure that is the input's, not the command's: no usage with it. */
function stop(message: string): never {
	process.stderr.write(`${message}\n`);
	process.exit(1);
}

const print = (text: string): void => void process.stdout.write(`${text}\n`);

function numberOption(name: string, value: string | undefined): number | undefined {
	if (value === undefined) return undefined;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) fail(`--${name} needs a number, got "${value}".`);
	return parsed;
}

function readLog(file: string): string {
	try {
		return readFileSync(file, 'utf8');
	} catch (error) {
		return stop(`Cannot read ${file}: ${(error as Error).message}`);
	}
}

const gradeOptions = (values: Values) => ({
	hero: values.hero,
	seed: numberOption('seed', values.seed),
	samples: numberOption('samples', values.samples),
	rake: numberOption('rake', values.rake),
});

function printReport(report: AnalysisReport, values: Values): void {
	const minSeverity = (values['min-severity'] ?? 'inaccuracy') as Severity;
	if (!SEVERITIES.includes(minSeverity) || minSeverity === 'ok') {
		fail(`--min-severity must be inaccuracy, mistake or blunder.`);
	}
	if (values.json) return print(JSON.stringify(report, null, '\t'));
	print(
		formatReport(report, {
			top: numberOption('top', values.top) ?? 15,
			minSeverity,
			color: !values['no-color'] && process.stdout.isTTY === true,
			handId: values.hand?.replace(/^#/, ''),
		})
	);
}

/** `2026-10-06 03:37`, as `trend` prints a sitting, is its id less the seconds. */
function scopeOf(sessions: readonly PlaySession[], scope: string | undefined): Scope {
	if (!scope) return 'all';
	const typed = scope.replace(' ', 'T');
	return sessions.find(({ id }) => id.startsWith(typed))?.id ?? scope;
}

async function importLogs(store: HandStore, files: string[], values: Values) {
	if (files.length === 0) fail('Give at least one hand-history file to import.');
	const live = process.stderr.isTTY === true;
	for (const file of files) {
		const run = await startIngest(store, logTextOf(readLog(file)), {
			...gradeOptions(values),
			fileName: basename(file),
			now: new Date().toISOString(),
		});
		if (!run.imported) stop(`No PokerStars hands found in ${file}.`);
		while (!(await advanceIngest(run, IMPORT_CHUNK))) {
			if (live) process.stderr.write(`\r${file}: graded ${run.done} of ${run.total}`);
		}
		if (live) process.stderr.write('\r\x1b[K');
		print(formatImport(run.imported, run.total));
	}
}

async function runCommand(command: Command, rest: string[], values: Values) {
	const directory =
		values.library ?? process.env.QPOKER_LIBRARY ?? join(homedir(), '.qpoker');
	const store = createFileStore(directory);
	if (command === 'import') return importLogs(store, rest, values);

	const library = await loadLibrary(store);
	const held = library.hands.length + library.stale;
	if (command === 'library' && values.clear) {
		if (!values.yes) {
			fail(`This forgets all ${held} hands in ${directory}. Add --yes to go ahead.`);
		}
		await store.clear();
		return print(`Emptied the library in ${directory}.`);
	}
	if (!library.meta || held === 0) {
		stop(`The library in ${directory} is empty. Load a log with: qpoker import <file>`);
	}
	if (library.stale > 0) {
		process.stderr.write(
			`${library.stale} hands were graded under other settings or an older version `
				+ `and are left out. Importing any log brings them up to date.\n`
		);
	}
	const sessions = sessionsOf(library.hands);
	const top = numberOption('top', values.top);

	switch (command) {
		case 'report': {
			const report = await libraryAnalysis(
				store,
				scopeOf(sessions, values.scope),
				values.hand?.replace(/^#/, '')
			);
			if (report) printReport(report, values);
			return;
		}
		case 'trend':
			return print(formatTrend(trendOf(library.hands, sessions), top ?? 20));
		case 'players': {
			if (rest.length === 0) {
				return print(formatPlayers(await store.players(), library.heroes, top ?? 30));
			}
			const name = rest.join(' ');
			const [player] = await store.players([name]);
			if (!player) stop(`No player named "${name}" in the library.`);
			return print(formatProfile(profileOf(player)));
		}
		case 'library': {
			if (values.export) {
				const raw = await store.raw(library.hands.map((hand) => hand.id));
				const backup = backupOf(
					library.hero,
					[...raw.values()],
					new Date().toISOString()
				);
				writeFileSync(values.export, JSON.stringify(backup));
				return print(`Saved ${backup.hands.length} hands to ${values.export}.`);
			}
			print(
				`${library.heroes.join(', ')} · ${library.hands.length} hands in ${sessions.length} sittings · ${directory}`
			);
			for (const record of library.imports) {
				print(
					`  ${record.importedAt.slice(0, 16).replace('T', ' ')}  ${formatImport(record, 0)}`
				);
			}
		}
	}
}

async function main(): Promise<void> {
	const { values, positionals } = (() => {
		try {
			return parseArgs({ allowPositionals: true, options: OPTIONS });
		} catch (error) {
			return fail(error instanceof Error ? error.message : String(error));
		}
	})();

	if (values.help) return print(USAGE);

	const [first, ...rest] = positionals;
	if ((COMMANDS as readonly string[]).includes(first)) {
		return runCommand(first as Command, rest, values);
	}
	if (positionals.length !== 1) fail('Give one hand-history file, or a command.');

	const report = analyzeLog(readLog(first), gradeOptions(values));
	if (report.handCount === 0) stop(`No PokerStars hands found in ${first}.`);
	printReport(report, values);
}

main().catch((error: unknown) => {
	stop(error instanceof Error ? error.message : String(error));
});
