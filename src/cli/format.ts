/**
 * The terminal rendering of an `AnalysisReport`. Pure: a report and a few
 * display options in, lines of text out, so it is tested like any other util.
 */

import type { AnalysisReport, HandReport } from '#utils/coach/report';
import { GOOD_PLAYS } from '#utils/coach/goodPlays';
import type { Grading } from '#utils/coach/grade';
import { MISTAKES, SEVERITIES, type Severity } from '#utils/coach/mistakes';
import type { OpeningSummary } from '#utils/coach/openings';
import { tableSizesText } from '#utils/ui/format';
import { STREETS } from '#utils/history/hand';
import type { PreflopChoice } from '#utils/ranges/range';
import { trimNote, type SolveResult } from '#utils/solver/result';

export interface FormatOptions {
	/** How many mistakes, and how many good plays, to print in full. */
	top: number;
	minSeverity: Severity;
	color: boolean;
	/** Print only this hand, with every decision's grade. */
	handId?: string;
}

const CODES = { bold: 1, dim: 2, red: 31, green: 32, yellow: 33, cyan: 36 } as const;

type Paint = (code: keyof typeof CODES, text: string) => string;

const painter =
	(color: boolean): Paint =>
	(code, text) =>
		color ? `\x1b[${CODES[code]}m${text}\x1b[0m` : text;

const pct = (value: number | null): string =>
	value === null ? '-' : `${Math.round(value * 100)}%`;

const signed = (value: number, digits = 1): string => {
	const fixed = Math.abs(value).toFixed(digits);
	return (
		Number(fixed) === 0 ? fixed
		: value < 0 ? `-${fixed}`
		: `+${fixed}`
	);
};

const when = (timestamp: string): string => timestamp.replace('T', ' ').slice(0, 16);

const SEVERITY_COLOR: Record<Severity, keyof typeof CODES> = {
	ok: 'green',
	inaccuracy: 'cyan',
	mistake: 'yellow',
	blunder: 'red',
};

/** The hand's action, one line per street, with the graded decision marked. */
function handLines(hand: HandReport, marked: number | null, paint: Paint): string[] {
	const out: string[] = [];
	for (const street of STREETS) {
		const actions = hand.lines.filter(
			(line) => line.street === street && !line.text.includes(' posts ')
		);
		if (actions.length === 0) continue;
		const cards = hand.board.split(' ').filter(Boolean);
		const shown =
			street === 'flop' ? cards.slice(0, 3)
			: street === 'turn' ? cards.slice(3, 4)
			: street === 'river' ? cards.slice(4, 5)
			: [];
		const label = `${street}${shown.length ? ` [${shown.join(' ')}]` : ''}`;
		const text = actions
			.map((line) =>
				line.stepIndex === marked ? paint('bold', `>> ${line.text} <<`) : line.text
			)
			.join(', ');
		out.push(`      ${paint('dim', label.padEnd(18))} ${text}`);
	}
	return out;
}

function wrap(text: string, indent: string, width = 96): string[] {
	const lines: string[] = [];
	let line = '';
	for (const word of text.split(' ')) {
		if (line && indent.length + line.length + word.length + 1 > width) {
			lines.push(indent + line);
			line = word;
		} else {
			line = line ? `${line} ${word}` : word;
		}
	}
	if (line) lines.push(indent + line);
	return lines;
}

function gradingLines(
	report: AnalysisReport,
	grading: Grading,
	rank: number | null,
	paint: Paint
): string[] {
	const hand = report.hands.find((candidate) => candidate.id === grading.handId);
	const play = grading.goodPlay;
	const severity = paint(
		SEVERITY_COLOR[grading.severity],
		(play ? `${play.rank} play` : grading.severity).toUpperCase().padEnd(10)
	);
	const title =
		play ? GOOD_PLAYS[play.type].title
		: grading.mistake ? MISTAKES[grading.mistake].title
		: 'No mistake';
	const cost =
		play ? `${signed(play.evGainedBb, 2)}bb`
		: grading.mistake ? `${signed(grading.evLostBb, 2)}bb`
		: '';
	const head = [
		rank === null ? '   ' : `${String(rank).padStart(2)}.`,
		severity,
		paint('bold', title),
		cost,
		paint('dim', `(${grading.confidence} confidence)`),
	];
	const out = [head.filter(Boolean).join(' ')];
	if (hand) {
		out.push(
			`      Hand #${hand.id} · ${when(hand.timestamp)} · ${hand.heroCards} in the ${hand.position ?? '?'} · ${grading.spot}`
		);
		out.push(
			play ?
				`      You ${paint('bold', grading.chosen)}, as the baseline does; to ${paint('bold', play.alternative)} was the mistake.`
			:	`      You ${paint('bold', grading.chosen)}; the baseline is to ${paint('bold', grading.recommended)}.`
		);
		out.push(...handLines(hand, grading.stepIndex, paint));
	}
	out.push(...wrap(grading.explanation, '      '));
	return out;
}

function handDetail(report: AnalysisReport, hand: HandReport, paint: Paint): string[] {
	const out = [
		paint(
			'bold',
			`Hand #${hand.id} · ${when(hand.timestamp)} · ${hand.table} · ${hand.players}-handed`
		),
		`${hand.heroCards || '(not dealt in)'} in the ${hand.position ?? '?'} · board ${hand.board || '-'} · result ${signed(hand.netBb)}bb`,
		...handLines(hand, null, paint),
	];
	for (const [name, cards] of Object.entries(hand.shown))
		out.push(`      ${name} shows ${cards}`);
	if (!hand.gradeable) out.push('', 'This hand could not be graded.');
	for (const grading of hand.gradings) {
		out.push('', ...gradingLines(report, { ...grading, handId: '' }, null, paint));
		out.push(`      ${paint('dim', `${grading.street}: ${grading.spot}`)}`);
	}
	for (const warning of hand.warnings) out.push(paint('yellow', `warning: ${warning}`));
	return out;
}

const DEVIATIONS: { chosen: PreflopChoice; label: string }[] = [
	{ chosen: 'raise', label: 'Opened outside the chart' },
	{ chosen: 'fold', label: 'Folded inside the chart' },
	{ chosen: 'call', label: 'Limped' },
];

/** First-in play by seat against the opening charts, then the hands that strayed. */
function openingLines(openings: OpeningSummary, paint: Paint): string[] {
	if (openings.rows.length === 0) return [];
	const out = [
		paint('bold', 'OPENING RANGES'),
		`  ${'Seat'.padEnd(6)}${'Spots'.padEnd(7)}${'Opened'.padEnd(8)}${'Chart'.padEnd(7)}Limped`,
	];
	for (const row of openings.rows) {
		const flag =
			row.leak === 'high' ? paint('red', '  too wide')
			: row.leak === 'low' ? paint('red', '  too tight')
			: '';
		out.push(
			`  ${row.position.padEnd(6)}${String(row.spots).padEnd(7)}${pct(row.raised / row.spots).padEnd(8)}${pct(row.expected / row.spots).padEnd(7)}${row.limped}${flag}`
		);
	}
	const short =
		openings.shortStacked > 0 ?
			` ${openings.shortStacked} spots under 30bb left out.`
		:	'';
	const early =
		openings.earlySeats > 0 ?
			` ${openings.earlySeats} spots from seats before the lojack left out: no chart covers them.`
		:	'';
	out.push(
		...wrap(
			`Folded to you. Chart: what the seat's chart opens with the cards you held.${short}${early}`,
			'  '
		).map((line) => paint('dim', line))
	);
	for (const { chosen, label } of DEVIATIONS) {
		const strays = openings.rows.flatMap((row) =>
			row.deviations
				.filter((deviation) => deviation.chosen === chosen)
				.map((deviation) => `${deviation.hand} ${row.position} #${deviation.handId}`)
		);
		if (strays.length > 0) out.push(...wrap(`${label}: ${strays.join(', ')}`, '  '));
	}
	out.push('');
	return out;
}

/** Renders a report for a terminal. */
export function formatReport(report: AnalysisReport, options: FormatOptions): string {
	const paint = painter(options.color);
	const out: string[] = [];

	if (options.handId) {
		const hand = report.hands.find((candidate) => candidate.id === options.handId);
		return hand ?
				handDetail(report, hand, paint).join('\n')
			:	`No hand #${options.handId} in this log.`;
	}

	const { session } = report;
	out.push(
		paint('bold', `${report.hero} · ${report.stakes} · ${report.handCount} hands`),
		`${when(report.firstHand)} to ${when(report.lastHand)} · ${report.tables.join(', ')}`,
		`Result ${signed(session.netBb)}bb (${signed(session.bbPer100)} bb/100) · `
			+ `estimated ${signed(report.totalEvLostBb)}bb lost to ${report.mistakes.length} mistakes`,
		''
	);
	if (report.unreconciled > 0) {
		out.push(
			paint(
				'yellow',
				`${report.unreconciled} hands did not reconcile and were not graded.`
			)
		);
	}
	if (report.warnings.length > 0) {
		out.push(paint('yellow', `${report.warnings.length} lines were not understood:`));
		for (const warning of report.warnings.slice(0, 5)) out.push(`  ${warning}`);
		out.push('');
	}

	out.push(
		paint('bold', 'SESSION'),
		`  ${'Stat'.padEnd(22)}${'You'.padEnd(8)}${'Baseline'.padEnd(11)}Sample`
	);
	for (const stat of session.stats) {
		const flag =
			stat.leak === 'high' ? paint('red', '  too high')
			: stat.leak === 'low' ? paint('red', '  too low')
			: '';
		const baseline = `${pct(stat.baseline)}${stat.baselineSource === 'typical' ? '*' : ''}`;
		out.push(
			`  ${stat.label.padEnd(22)}${pct(stat.value).padEnd(8)}${baseline.padEnd(11)}${stat.count}/${stat.opportunities}${flag}`
		);
	}
	out.push(
		paint(
			'dim',
			'  Baseline: what the charts do in the spots you were in. * a typical figure.'
		),
		paint('dim', `  Tables: ${tableSizesText(session.tableSizes)}.`),
		''
	);

	out.push(
		paint('bold', 'BY POSITION'),
		`  ${'Seat'.padEnd(6)}${'Hands'.padEnd(7)}${'VPIP'.padEnd(7)}${'PFR'.padEnd(7)}Result`
	);
	for (const row of session.positions) {
		out.push(
			`  ${row.position.padEnd(6)}${String(row.hands).padEnd(7)}${pct(row.vpip / row.hands).padEnd(7)}${pct(row.pfr / row.hands).padEnd(7)}${signed(row.netBb)}bb`
		);
	}
	out.push('', ...openingLines(report.openings, paint));

	if (report.leaks.length > 0) {
		out.push(paint('bold', 'LEAKS BY KIND'));
		for (const leak of report.leaks) {
			out.push(
				`  ${`${signed(leak.evLostBb, 2)}bb`.padEnd(10)}${String(leak.count).padStart(2)} x  ${leak.title}`
			);
		}
		out.push('');
	}

	const floor = SEVERITIES.indexOf(options.minSeverity);
	const listed = report.mistakes.filter(
		(grading) => SEVERITIES.indexOf(grading.severity) >= floor
	);
	const shown = listed.slice(0, options.top);
	out.push(
		paint('bold', `MISTAKES (${shown.length} of ${listed.length}, costliest first)`)
	);
	if (shown.length === 0) out.push('  None at this severity.');
	shown.forEach((grading, index) => {
		out.push('', ...gradingLines(report, grading, index + 1, paint));
	});
	if (report.goodPlays.length > 0) {
		const plays = report.goodPlays.slice(0, options.top);
		out.push(
			'',
			paint(
				'bold',
				`GOOD PLAYS (${plays.length} of ${report.goodPlays.length}, most valuable first)`
			)
		);
		plays.forEach((grading, index) => {
			out.push('', ...gradingLines(report, grading, index + 1, paint));
		});
	}
	out.push(
		'',
		paint(
			'dim',
			'EV figures are estimates against a baseline model, not solver output. See docs/coach-model.md.'
		)
	);
	return out.join('\n');
}

export interface SolveFormatOptions {
	color: boolean;
	/** Where the solve was run: the hand, for the heading. */
	handId: string;
	hero: string;
}

/** Renders one solve for a terminal: the table of actions, the gap, the run. */
export function formatSolve(result: SolveResult, options: SolveFormatOptions): string {
	const paint = painter(options.color);
	const share = (value: number) => `${Math.round(value * 100)}%`;
	const out: string[] = [
		paint(
			'bold',
			`Hand #${options.handId} · ${options.hero} with ${result.hand} · ${result.street} · pot ${result.potBb} bb`
		),
		'',
	];
	out.push(`  ${'Action'.padEnd(24)}${'Freq'.padEnd(8)}EV (bb)`);
	result.actions.forEach((row, index) => {
		const tags = [
			result.chosen === index ? 'played' : '',
			result.best === index ? 'best' : '',
		]
			.filter(Boolean)
			.join(', ');
		out.push(
			`  ${row.label.padEnd(24)}${share(row.frequency).padEnd(8)}${signed(row.evBb, 2).padEnd(8)}${tags ? paint('dim', tags) : ''}`
		);
	});
	out.push('');
	if (!result.reached) {
		out.push(
			paint(
				'yellow',
				`The solver never plays ${result.hand} to this node (it would have bet, or folded, earlier); the rows are what it would do had it got here.`
			)
		);
	}
	if (result.evGapBb === null) {
		out.push('No action in the tree matches the one played.');
	} else if (result.evGapBb > -0.005) {
		out.push(`The play is as good as the best action.`);
	} else {
		out.push(
			paint(
				'yellow',
				`The play gives up ${(-result.evGapBb).toFixed(2)} bb against the best action.`
			)
		);
	}
	{
		out.push(
			`Equity ${share(result.equity)}${
				result.eqr === null ? '' : ` · realises ${share(result.eqr)} of it`
			}`
		);
	}
	out.push(
		paint(
			'dim',
			`${result.iterations} iterations · exploitable by ${result.exploitabilityPct.toFixed(2)}% of the pot · ${result.nodes.toLocaleString()} nodes · ${Math.max(1, Math.round(result.bytes / 1048576))} MB${result.compressed ? ' (16-bit)' : ''}`
		),
		...[trimNote(result.trim)].flatMap((note) => (note ? [paint('yellow', note)] : [])),
		paint(
			'dim',
			'Solved from the start of the street with the coach’s modelled ranges: an estimate of the ranges, not of the solve. See docs/solver.md.'
		)
	);
	return out.join('\n');
}
