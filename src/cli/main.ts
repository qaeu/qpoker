/**
 * The command line: read a hand-history file, analyse it, print the report.
 * The only module in the project that touches Node's own APIs.
 */

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { analyzeLog } from '#utils/coach/report';
import { SEVERITIES, type Severity } from '#utils/coach/mistakes';
import { formatReport } from './format';

const USAGE = `Usage: pokeranalysis <hand-history.txt> [options]

Grades every decision in a PokerStars hand-history file against a GTO baseline.

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

function fail(message: string): never {
	process.stderr.write(`${message}\n\n${USAGE}\n`);
	process.exit(2);
}

function numberOption(name: string, value: string | undefined): number | undefined {
	if (value === undefined) return undefined;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) fail(`--${name} needs a number, got "${value}".`);
	return parsed;
}

function main(): void {
	const { values, positionals } = (() => {
		try {
			return parseArgs({
				allowPositionals: true,
				options: {
					hero: { type: 'string' },
					top: { type: 'string' },
					'min-severity': { type: 'string' },
					hand: { type: 'string' },
					json: { type: 'boolean' },
					seed: { type: 'string' },
					samples: { type: 'string' },
					rake: { type: 'string' },
					'no-color': { type: 'boolean' },
					help: { type: 'boolean', short: 'h' },
				},
			});
		} catch (error) {
			return fail(error instanceof Error ? error.message : String(error));
		}
	})();

	if (values.help) {
		process.stdout.write(`${USAGE}\n`);
		return;
	}
	if (positionals.length !== 1) fail('Give one hand-history file.');

	const minSeverity = (values['min-severity'] ?? 'inaccuracy') as Severity;
	if (!SEVERITIES.includes(minSeverity) || minSeverity === 'ok') {
		fail(`--min-severity must be inaccuracy, mistake or blunder.`);
	}

	let text: string;
	try {
		text = readFileSync(positionals[0], 'utf8');
	} catch (error) {
		process.stderr.write(`Cannot read ${positionals[0]}: ${(error as Error).message}\n`);
		process.exit(1);
	}

	const report = analyzeLog(text, {
		hero: values.hero,
		seed: numberOption('seed', values.seed),
		samples: numberOption('samples', values.samples),
		rake: numberOption('rake', values.rake),
	});
	if (report.handCount === 0) {
		process.stderr.write(`No PokerStars hands found in ${positionals[0]}.\n`);
		process.exit(1);
	}

	if (values.json) {
		process.stdout.write(`${JSON.stringify(report, null, '\t')}\n`);
		return;
	}
	process.stdout.write(
		`${formatReport(report, {
			top: numberOption('top', values.top) ?? 15,
			minSeverity,
			color: !values['no-color'] && process.stdout.isTTY === true,
			handId: values.hand?.replace(/^#/, ''),
		})}\n`
	);
}

main();
