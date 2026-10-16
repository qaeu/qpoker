/**
 * The solver as a calibration oracle for the postflop model, offline: it never
 * enters a grade. For every heads-up turn and river decision of the hero's in
 * the logs, the spot is solved (the model's ranges at the street's start, the
 * standard tree with the line's own sizes) and set beside the grade:
 *
 * - Verdict agreement: does the solve find the action taken worse than its
 *   best by more than the grader's band, where the grader named a mistake, and
 *   within it where it did not?
 * - Range calibration: at the villain's first decision on the street, how
 *   often the equilibrium bets (or continues against a bet) by strength fifth
 *   and draw class, beside the likelihoods `villainRange.ts` gives.
 *
 *   tsx scripts/accuracy/solverCompare.ts <log...> [--out spots.json]
 *       [--from spots.json] [--dev 0.5] [--seconds 60] [--max n] [--wasm]
 *       [--streets turn,river] [--hands id,id]
 *
 * Needs `npm run build:solver:native` (or `--wasm`, single-threaded and slow).
 * See docs/postflop-model.md, "Checked against the solver".
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { totalmem } from 'node:os';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';

import { nativeSolver, nativeSolverBuilt } from '#cli/solverNative';
import { loadNodeSolver } from '#cli/solverNode';
import { COMBO_COUNT, COMBOS } from '#utils/cards/combos';
import type { Grading } from '#utils/coach/grade';
import { analyzeLog } from '#utils/coach/report';
import { parseHistory } from '#utils/history/parse';
import { replayHand, type Replay } from '#utils/history/replay';
import { applyAction, rankRange, responseToBet } from '#utils/postflop/villainRange';
import { fromSolverOrder, SOLVER_OF } from '#utils/solver/cards';
import { resultOf } from '#utils/solver/result';
import { solverSpot, type SolverSpot } from '#utils/solver/spot';
import { presetOf } from '#utils/solver/tree';
import { TRIM_LADDER, trimInput } from '#utils/solver/trim';
import type {
	SolverHandle,
	SolverModule,
	WasmAction,
	WasmEstimate,
	WasmInput,
	WasmQuery,
} from '#utils/solver/wasmApi';

/** The grader's indifference band, as a share of the pot. */
const BAND = 0.07;
const MB = 1024 * 1024;
const AGGRESSIVE = new Set<WasmAction['kind']>(['bet', 'raise', 'allin']);
/** Strength fifths by percentile, and draw classes 0 none, 1 gutshot, 2 strong. */
const FIFTHS = 5;
const DRAWS = 3;

interface Bucket {
	weight: number;
	solver: number;
	model: number;
}

/** The villain's first node on the street: bets or checks, or answers a bet. */
interface VillainNode {
	facing: boolean;
	/** The villain acts first on the street: out of position, nothing before them. */
	first: boolean;
	/** The villain bet or raised last before the street: they have the initiative. */
	aggressor: boolean;
	/** The bet faced, in pots. */
	size: number;
	/** FIFTHS x DRAWS buckets, weighted by the model's range. */
	buckets: Bucket[];
	/** Of the range that continues against a bet, the share the solver raises. */
	raiseShare: number | null;
}

interface SpotRecord {
	log: string;
	hand: string;
	street: string;
	stepIndex: number;
	chosen: string;
	recommended: string;
	mistake: string | null;
	confidence: string;
	modelBb: number;
	modelEquity: number;
	potBb: number;
	/** The node's pot from the solve, bb; the band is a share of it. */
	solverPotBb: number;
	solverGapBb: number | null;
	solverBest: string;
	solverChosenFrequency: number | null;
	solverEquity: number;
	reached: boolean;
	exploitabilityPct: number;
	iterations: number;
	trim: number;
	ms: number;
	villain: VillainNode | null;
}

interface Solved {
	query: WasmQuery;
	iterations: number;
	exploitability: number;
	nodes: number;
	bytes: number;
	compressed: boolean;
	trim: number;
}

async function solve(
	module: SolverModule,
	input: WasmInput,
	heroClass: number,
	budget: number,
	target: number,
	seconds: number
): Promise<Solved | null> {
	let handle: SolverHandle | null = null;
	let estimate: WasmEstimate | null = null;
	let compressed = false;
	let trimShare = 0;
	for (const share of [0, ...TRIM_LADDER]) {
		const tried = share > 0 ? trimInput(input, share, heroClass).input : input;
		const candidate = await module.createSolver(JSON.stringify(tried));
		const sized = JSON.parse(await candidate.estimate()) as WasmEstimate;
		if (sized.bytes <= budget || sized.bytesCompressed <= budget) {
			handle = candidate;
			estimate = sized;
			compressed = sized.bytes > budget;
			trimShare = share;
			break;
		}
		candidate.free();
	}
	if (!handle || !estimate) return null;
	try {
		await handle.allocate(compressed);
		const started = Date.now();
		let iterations = 0;
		let exploitability = Infinity;
		while (
			iterations < 1000
			&& exploitability > target
			&& Date.now() - started < seconds * 1000
		) {
			exploitability = await handle.step(10);
			iterations += 10;
		}
		const query = JSON.parse(await handle.query()) as WasmQuery;
		return {
			query,
			iterations,
			exploitability,
			nodes: estimate.nodes,
			bytes: compressed ? estimate.bytesCompressed : estimate.bytes,
			compressed,
			trim: trimShare,
		};
	} finally {
		handle.free();
	}
}

/**
 * The prefix to the villain's first decision on the street, or null if they
 * make none before the street closes: the street's actions before it, which
 * may include the hero's own (in the tree, since its size was added).
 */
function villainPrefix(replay: Replay, spot: SolverSpot): WasmAction[] | null {
	const street = replay.steps.filter((step) => step.street === spot.street);
	const first = street.findIndex((step) => step.action.player === spot.villain);
	const heroAt = street.findIndex((step) => step.index === spot.stepIndex);
	if (first >= 0 && first < heroAt) return spot.input.prefix.slice(0, first);
	const { chosen } = spot;
	// After the hero's action: only if it leaves the villain a decision.
	if (AGGRESSIVE.has(chosen.kind) || (chosen.kind === 'check' && spot.side === 0)) {
		return [...spot.input.prefix, chosen];
	}
	return null;
}

function villainNode(
	spot: SolverSpot,
	query: WasmQuery,
	prefix: WasmAction[]
): VillainNode {
	const villainSide = spot.side === 0 ? 'ipRange' : 'oopRange';
	const range = Float64Array.from(fromSolverOrder(spot.input[villainSide]));
	const board = spot.board;
	const view = rankRange(range, board);
	const bet = prefix.find((action) => AGGRESSIVE.has(action.kind));
	const facing = bet !== undefined;
	const size = facing ? (bet.to ?? 0) / spot.pot : 0.6;
	// The model's likelihood of what the solver measures: continuing, or betting.
	const model = new Float64Array(COMBO_COUNT);
	if (facing) {
		const { continues } = responseToBet(range, board, size);
		for (let i = 0; i < COMBO_COUNT; i++)
			model[i] = range[i] > 0 ? continues[i] / range[i] : 0;
	} else {
		const checks = applyAction(range, board, 'check', 0);
		for (let i = 0; i < COMBO_COUNT; i++)
			model[i] = range[i] > 0 ? 1 - checks[i] / range[i] : 0;
	}
	const buckets: Bucket[] = Array.from({ length: FIFTHS * DRAWS }, () => ({
		weight: 0,
		solver: 0,
		model: 0,
	}));
	const { actions, strategy } = query;
	let continuing = 0;
	let raising = 0;
	for (let i = 0; i < COMBO_COUNT; i++) {
		const weight = range[i];
		if (weight <= 0) continue;
		const j = SOLVER_OF[i];
		let measured = 0;
		actions.forEach((action, a) => {
			const p = strategy[a * COMBO_COUNT + j] ?? 0;
			if (facing ? action.kind !== 'fold' : AGGRESSIVE.has(action.kind)) measured += p;
			if (facing && AGGRESSIVE.has(action.kind)) raising += weight * p;
		});
		if (facing) continuing += weight * measured;
		const fifth = Math.min(FIFTHS - 1, Math.floor(view.percentile[i] * FIFTHS));
		const bucket = buckets[fifth * DRAWS + view.draws[i]];
		bucket.weight += weight;
		bucket.solver += weight * measured;
		bucket.model += weight * model[i];
	}
	return {
		facing,
		first: prefix.length === 0,
		aggressor: false,
		size,
		buckets,
		raiseShare: facing && continuing > 0 ? raising / continuing : null,
	};
}

async function solveLogs(
	paths: string[],
	module: SolverModule,
	options: {
		budget: number;
		dev: number;
		seconds: number;
		max: number;
		streets: string[];
		hands: string[] | null;
	}
): Promise<SpotRecord[]> {
	const records: SpotRecord[] = [];
	for (const path of paths) {
		const text = readFileSync(path, 'utf8');
		const report = analyzeLog(text, { seed: 1 });
		const hands = new Map(parseHistory(text).map((hand) => [hand.id, hand]));
		for (const handReport of report.hands) {
			const hand = hands.get(handReport.id);
			if (!hand?.hero) continue;
			const replay = replayHand(hand);
			for (const grading of handReport.gradings as Grading[]) {
				if (!options.streets.includes(grading.street)) continue;
				if (options.hands && !options.hands.includes(hand.id)) continue;
				if (records.length >= options.max) return records;
				const found = solverSpot(
					replay,
					grading.stepIndex,
					presetOf('standard'),
					report.rake
				);
				if (!found.ok) continue;
				const { spot } = found;
				const heroClass = COMBOS[spot.heroCombo].cls;
				const target = (spot.pot * options.dev) / 100;
				const started = Date.now();
				const solved = await solve(
					module,
					spot.input,
					heroClass,
					options.budget,
					target,
					options.seconds
				);
				if (!solved) {
					process.stderr.write(`${hand.id} #${grading.stepIndex}: over budget\n`);
					continue;
				}
				const result = resultOf(spot, solved.query, {
					...solved,
					trim: null,
				});
				let villain: VillainNode | null = null;
				const prefix = villainPrefix(replay, spot);
				if (prefix) {
					const atVillain = await solve(
						module,
						{ ...spot.input, prefix },
						heroClass,
						options.budget,
						target,
						options.seconds
					);
					if (atVillain && atVillain.query.player !== spot.side) {
						villain = villainNode(spot, atVillain.query, prefix);
						const opening = replay.steps.find((step) => step.street === spot.street);
						villain.aggressor = opening?.aggressor === spot.villain;
					}
				}
				const record: SpotRecord = {
					log: basename(path),
					hand: hand.id,
					street: grading.street,
					stepIndex: grading.stepIndex,
					chosen: grading.chosen,
					recommended: grading.recommended,
					mistake: grading.mistake,
					confidence: grading.confidence,
					modelBb: grading.evLostBb,
					modelEquity: grading.postflop?.equity ?? 0,
					potBb: grading.postflop?.potBb ?? 0,
					solverPotBb: result.potBb,
					solverGapBb: result.evGapBb,
					solverBest: result.actions[result.best].label,
					solverChosenFrequency:
						result.chosen === null ? null : result.actions[result.chosen].frequency,
					solverEquity: result.equity,
					reached: result.reached,
					exploitabilityPct: result.exploitabilityPct,
					iterations: solved.iterations,
					trim: solved.trim,
					ms: Date.now() - started,
					villain,
				};
				records.push(record);
				process.stderr.write(
					`${hand.id} ${grading.street} #${grading.stepIndex} ${grading.chosen}: model ${grading.mistake ?? 'ok'} ${grading.evLostBb.toFixed(2)}, solver gap ${result.evGapBb?.toFixed(2)} (${record.ms}ms, ${result.exploitabilityPct.toFixed(2)}%)\n`
				);
			}
		}
	}
	return records;
}

const pct = (value: number): string => `${(value * 100).toFixed(0)}%`;
const pad = (text: string | number, width: number): string =>
	String(text).padStart(width);

function agreementTable(records: SpotRecord[]): void {
	const groups = new Map<string, SpotRecord[]>();
	for (const record of records) {
		const key = `${record.mistake ?? 'no finding'} / ${record.confidence}`;
		groups.set(key, [...(groups.get(key) ?? []), record]);
	}
	console.log(
		'\nVerdict agreement (the solve finds the action taken off by more than the band)'
	);
	console.log(
		`${'model verdict / confidence'.padEnd(32)}${pad('n', 4)}${pad('agree', 7)}${pad('model bb', 10)}${pad('solve bb', 10)}`
	);
	for (const [key, group] of [...groups.entries()].sort()) {
		const finding = group[0].mistake !== null;
		const agree = group.filter((record) => {
			if (record.solverGapBb === null) return false;
			const off = record.solverGapBb < -BAND * record.solverPotBb;
			return finding ? off : !off;
		}).length;
		const model = group.reduce((sum, record) => sum + record.modelBb, 0);
		const solver = group.reduce((sum, record) => sum + (record.solverGapBb ?? 0), 0);
		console.log(
			`${key.padEnd(32)}${pad(group.length, 4)}${pad(agree, 7)}${pad(model.toFixed(2), 10)}${pad(solver.toFixed(2), 10)}`
		);
	}
	const disagreements = records.filter((record) => {
		if (record.solverGapBb === null) return false;
		const off = record.solverGapBb < -BAND * record.solverPotBb;
		return (record.mistake !== null) !== off;
	});
	console.log(`\nDisagreements (${disagreements.length}):`);
	for (const record of disagreements) {
		console.log(
			`  ${record.hand} ${record.street.padEnd(5)} #${pad(record.stepIndex, 2)} ${record.chosen.padEnd(5)} model ${(record.mistake ?? 'ok').padEnd(17)} ${pad(record.modelBb.toFixed(2), 7)}  solver gap ${pad(record.solverGapBb?.toFixed(2) ?? '-', 7)} best ${record.solverBest}, played ${record.solverChosenFrequency === null ? '-' : pct(record.solverChosenFrequency)}  eq ${pct(record.modelEquity)} / ${pct(record.solverEquity)}`
		);
	}
}

function calibrationTable(
	records: SpotRecord[],
	title: string,
	which: (node: VillainNode) => boolean
): void {
	const nodes = records
		.map((record) => record.villain)
		.filter((node): node is VillainNode => node !== null && which(node));
	if (nodes.length === 0) return;
	const facing = nodes[0].facing;
	const total: Bucket[] = Array.from({ length: FIFTHS * DRAWS }, () => ({
		weight: 0,
		solver: 0,
		model: 0,
	}));
	for (const node of nodes) {
		node.buckets.forEach((bucket, i) => {
			total[i].weight += bucket.weight;
			total[i].solver += bucket.solver;
			total[i].model += bucket.model;
		});
	}
	console.log(
		`\n${title}: ${nodes.length} nodes; solver / model ${facing ? 'continuing' : 'betting'} by strength fifth (rows) and draw (columns), weight in combos`
	);
	console.log(
		`${'fifth'.padEnd(10)}${['no draw', 'gutshot', 'strong'].map((d) => pad(d, 16)).join('')}`
	);
	for (let fifth = FIFTHS - 1; fifth >= 0; fifth--) {
		const cells = [0, 1, 2].map((draw) => {
			const bucket = total[fifth * DRAWS + draw];
			if (bucket.weight < 1) return pad('-', 16);
			return pad(
				`${pct(bucket.solver / bucket.weight)} / ${pct(bucket.model / bucket.weight)} (${Math.round(bucket.weight)})`,
				16
			);
		});
		console.log(`${`${fifth * 20}-${fifth * 20 + 20}%`.padEnd(10)}${cells.join('')}`);
	}
	const all = total.reduce(
		(sum, bucket) => ({
			weight: sum.weight + bucket.weight,
			solver: sum.solver + bucket.solver,
			model: sum.model + bucket.model,
		}),
		{ weight: 0, solver: 0, model: 0 }
	);
	if (all.weight > 0) {
		console.log(
			`${'all'.padEnd(10)}${pad(`${pct(all.solver / all.weight)} / ${pct(all.model / all.weight)}`, 16)}`
		);
	}
	if (facing) {
		const shares = nodes.flatMap((node) =>
			node.raiseShare === null ? [] : [node.raiseShare]
		);
		if (shares.length > 0) {
			const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
			console.log(`Of what continues, the solver raises ${pct(mean)} on average`);
		}
	}
}

async function main(): Promise<void> {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: {
			out: { type: 'string' },
			from: { type: 'string' },
			dev: { type: 'string', default: '0.5' },
			seconds: { type: 'string', default: '60' },
			max: { type: 'string', default: '1000' },
			budget: { type: 'string' },
			wasm: { type: 'boolean', default: false },
			streets: { type: 'string', default: 'turn,river' },
			hands: { type: 'string' },
		},
	});
	const started = Date.now();
	let records: SpotRecord[];
	if (values.from) {
		records = JSON.parse(readFileSync(values.from, 'utf8')) as SpotRecord[];
	} else {
		if (positionals.length === 0) {
			console.error(
				'Usage: solverCompare.ts <log...> [--out spots.json] [--from spots.json]'
			);
			process.exit(1);
		}
		const native = !values.wasm && nativeSolverBuilt();
		const module = native ? nativeSolver() : await loadNodeSolver();
		const budget =
			(values.budget ? Number(values.budget)
			: native ? Math.floor((totalmem() * 0.6) / MB)
			: 3000) * MB;
		records = await solveLogs(positionals, module, {
			budget,
			dev: Number(values.dev),
			seconds: Number(values.seconds),
			max: Number(values.max),
			streets: values.streets.split(','),
			hands: values.hands?.split(',') ?? null,
		});
		if (values.out) writeFileSync(values.out, JSON.stringify(records));
		console.log(
			`${records.length} spots solved (${native ? 'native' : 'WASM'}) in ${((Date.now() - started) / 1000).toFixed(0)}s`
		);
	}
	agreementTable(records);
	const betting = (node: VillainNode) => !node.facing;
	calibrationTable(records, 'Villain bets or checks, all', betting);
	calibrationTable(
		records,
		'Villain first to act, without the initiative (its check is now read as nothing)',
		(node) => betting(node) && node.first && !node.aggressor
	);
	calibrationTable(
		records,
		'Villain first to act with the initiative, or checked to (its check sheds strength)',
		(node) => betting(node) && (!node.first || node.aggressor)
	);
	calibrationTable(records, 'Villain continues against a bet', (node) => node.facing);
}

void main();
