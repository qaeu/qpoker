/**
 * Loading a log into the library: the hands it does not have are graded and
 * stored, and the hands it does have are passed over. A run also brings up to
 * date any stored hand graded under other settings, an older coach or a rake
 * that has since moved, from its own text. See docs/library.md.
 *
 * Like an analysis it advances a few hands at a time, and each step is
 * committed, so a run cut short has lost nothing it finished.
 */

import {
	detectHero,
	FACTS_VERSION,
	rakeRate,
	REPORT_VERSION,
	reportHand,
	splitReport,
	stakesText,
	type AnalysisOptions,
	type Graded,
} from '../coach/report';
import type { Hand } from '../history/hand';
import { parseHands } from '../history/parse';
import { replayHand, type Replay } from '../history/replay';
import { playersOf, seeHand } from './players';
import {
	LIBRARY_SCHEMA,
	type GradeKey,
	type HandStore,
	type ImportRecord,
	type KnownHand,
	type LibraryMeta,
	type PlayerAggregate,
	type RakeSeen,
	type StoredHand,
} from './types';

export interface IngestOptions extends AnalysisOptions {
	fileName?: string;
	/** The time of the import, as an ISO timestamp. The engine reads no clock. */
	now?: string;
}

/**
 * What a run does with a hand: store one it has not seen, replace one whose
 * text has changed, grade a stored one again, or only sum it up again.
 */
type JobKind = 'new' | 'replace' | 'regrade' | 'resum';

interface Job {
	id: string;
	kind: JobKind;
	/** The hand as the log has it. A stored hand is read back from its text. */
	replay?: Replay;
	text?: string;
	/** Who the hand is graded for. */
	hero: string;
	/** Not yet in the players' sums as they stand, so not to be taken out of them. */
	unsummed: boolean;
}

export interface IngestRun {
	store: HandStore;
	/** The library's settings and sums as committed so far. */
	meta: LibraryMeta;
	/** The rake each stakes level is graded at, once the whole log is in. */
	rates: Record<string, number>;
	jobs: Job[];
	known: Map<string, KnownHand>;
	done: number;
	total: number;
	/** Null for a run with no log: one that only brings the library up to date. */
	imported: ImportRecord | null;
	/**
	 * The library's row for the log once the run is done: `imported`, or, for a
	 * reload, it folded into the rows of the file's earlier loads.
	 */
	record: ImportRecord | null;
	/** The earlier loads `record` takes the place of, by their time. */
	reloads: string[];
}

const seesFlop = (hand: Hand): boolean => hand.board.length >= 3;

export function addRake(rakes: Record<string, RakeSeen>, hand: Hand, sign: 1 | -1): void {
	if (!seesFlop(hand)) return;
	const seen = (rakes[stakesText(hand)] ??= { pots: 0, rake: 0 });
	seen.pots += sign * hand.totalPot;
	seen.rake += sign * hand.rake;
}

/** The rake a stakes level's hands are graded at. */
export function rateOf(meta: LibraryMeta, stakes: string): number {
	const seen = meta.rakes[stakes];
	return meta.rake ?? rakeRate(seen?.pots ?? 0, seen?.rake ?? 0);
}

/**
 * What a stored hand needs before it can be shown under the library's
 * settings: grading again, summing up again, or nothing.
 */
export function stalenessOf(
	{ key, stakes }: Pick<KnownHand, 'key' | 'stakes'>,
	meta: LibraryMeta
): 'regrade' | 'resum' | null {
	if (
		key.version !== REPORT_VERSION
		|| (meta.hero !== '' && key.hero !== meta.hero)
		|| key.seed !== meta.seed
		|| key.samples !== meta.samples
		|| (key.rake !== null && key.rake !== rateOf(meta, stakes))
	) {
		return 'regrade';
	}
	return key.facts === FACTS_VERSION ? null : 'resum';
}

export const parseOne = (text: string): Replay => replayHand(parseHands(text)[0].hand);

/**
 * The earlier loads of the same file: by its name, each holding no hand the
 * file does not, so a log grown since it was last loaded is still a reload.
 */
export function earlierLoads(
	imports: readonly ImportRecord[],
	{ fileName, handIds = [] }: ImportRecord
): ImportRecord[] {
	if (fileName === '') return [];
	const held = new Set(handIds);
	return imports.filter(
		(other) =>
			other.fileName === fileName && other.handIds?.every((id) => held.has(id)) === true
	);
}

/** One row for a file loaded again: what it now holds, and what all its loads added. */
export function foldReload(
	imported: ImportRecord,
	replacedIds: readonly string[],
	earlier: readonly ImportRecord[]
): ImportRecord {
	const before = new Set(earlier.flatMap((other) => other.handIds ?? []));
	return {
		...imported,
		added: earlier.reduce((sum, other) => sum + other.added, imported.added),
		// A hand the file brought in and has now finished is not one more.
		replaced: earlier.reduce(
			(sum, other) => sum + other.replaced,
			imported.replaced - replacedIds.filter((id) => before.has(id)).length
		),
	};
}

/** Reads the log and works out what there is to do. Nothing is graded or written yet. */
export async function startIngest(
	store: HandStore,
	text: string,
	options: IngestOptions = {}
): Promise<IngestRun> {
	// The same hand twice in a file is the later one.
	const parsed = new Map(parseHands(text).map((entry) => [entry.hand.id, entry]));
	const known = await store.known();
	const old = await store.meta();

	const meta: LibraryMeta = {
		schema: LIBRARY_SCHEMA,
		hero: options.hero ?? old?.hero ?? '',
		seed: options.seed ?? old?.seed ?? 1,
		samples: options.samples ?? old?.samples ?? null,
		rake: options.rake ?? old?.rake ?? null,
		rakes: structuredClone(old?.rakes ?? {}),
		facts: FACTS_VERSION,
	};
	// Summed under other rules, the players are summed again from nothing.
	const rebuild = old !== null && old.facts !== FACTS_VERSION;

	// A hand that names no one is taken to be whose the rest of the log is.
	const owner = detectHero([...parsed.values()].map(({ hand }) => hand));

	const jobs: Job[] = [];
	let added = 0;
	let replaced = 0;
	for (const { hand, text: raw } of parsed.values()) {
		const stored = known.get(hand.id);
		if (stored?.digest === hand.digest) continue;
		if (stored) replaced++;
		else added++;
		jobs.push({
			id: hand.id,
			kind: stored ? 'replace' : 'new',
			replay: replayHand(hand),
			text: raw,
			hero: meta.hero || hand.hero || owner,
			unsummed: !stored || rebuild,
		});
	}

	// The rates as they will stand, so nothing is graded at one about to move.
	const final: LibraryMeta = { ...meta, rakes: structuredClone(meta.rakes) };
	const replacing = jobs.filter((job) => job.kind === 'replace').map((job) => job.id);
	const before = await store.raw(replacing);
	for (const job of jobs) {
		const earlier = before.get(job.id);
		if (earlier) addRake(final.rakes, parseOne(earlier).hand, -1);
		addRake(final.rakes, job.replay!.hand, 1);
	}
	const stakes = new Set([
		...Object.keys(final.rakes),
		...[...known.values()].map((hand) => hand.stakes),
		...jobs.map((job) => stakesText(job.replay!.hand)),
	]);
	const rates = Object.fromEntries(
		[...stakes].map((level) => [level, rateOf(final, level)])
	);

	const fresh = new Set(jobs.map((job) => job.id));
	for (const [id, stored] of known) {
		if (fresh.has(id)) continue;
		const kind = stalenessOf(stored, final) ?? (rebuild ? 'resum' : null);
		if (kind) {
			jobs.push({ id, kind, hero: meta.hero || stored.key.hero, unsummed: rebuild });
		}
	}

	if (rebuild) await store.commit({ resetPlayers: true, meta });

	const imported: ImportRecord | null =
		parsed.size > 0 ?
			{
				importedAt: options.now ?? '',
				fileName: options.fileName ?? '',
				hands: parsed.size,
				added,
				replaced,
				handIds: [...parsed.keys()],
			}
		:	null;
	const earlier = imported ? earlierLoads(await store.imports(), imported) : [];

	return {
		store,
		meta,
		rates,
		jobs,
		known,
		done: 0,
		total: jobs.length,
		imported,
		record: imported && foldReload(imported, replacing, earlier),
		reloads: earlier.map((other) => other.importedAt),
	};
}

/**
 * Does up to `count` more hands and commits them. Returns true once the run is
 * complete, which is also when the import is recorded.
 */
export async function advanceIngest(run: IngestRun, count = Infinity): Promise<boolean> {
	const { store, meta } = run;
	const jobs = run.jobs.slice(run.done, run.done + count);

	const stored = await store.raw(
		jobs.filter((job) => job.kind !== 'new').map((job) => job.id)
	);
	const replays = jobs.map((job) => job.replay ?? parseOne(stored.get(job.id)!));
	const earlier = jobs.map((job) =>
		job.kind === 'replace' ? parseOne(stored.get(job.id)!) : null
	);
	const names = new Set(
		[...replays, ...earlier].flatMap((replay) => (replay ? playersOf(replay) : []))
	);
	const players = new Map<string, PlayerAggregate>(
		(await store.players([...names])).map((player) => [player.name, player])
	);

	const hands: StoredHand[] = [];
	for (const [i, job] of jobs.entries()) {
		const replay = replays[i];
		const before = earlier[i];
		let graded: Graded | undefined;
		if (job.kind === 'resum') {
			const detail = await store.detail(job.id);
			if (detail) graded = { ...detail, rake: run.known.get(job.id)!.key.rake };
		}
		const report = reportHand(
			replay,
			job.hero,
			{
				rake: run.rates[stakesText(replay.hand)],
				seed: meta.seed,
				samples: meta.samples ?? undefined,
			},
			graded
		);
		const key: GradeKey = {
			version: REPORT_VERSION,
			facts: FACTS_VERSION,
			hero: job.hero,
			seed: meta.seed,
			samples: meta.samples,
			rake: report.rake,
		};
		hands.push({
			...splitReport(report),
			key,
			raw: job.text ?? stored.get(job.id)!,
		});

		if (before) {
			addRake(meta.rakes, before.hand, -1);
			if (!job.unsummed) seeHand(players, before, -1);
		}
		if (job.kind === 'new' || job.kind === 'replace') addRake(meta.rakes, replay.hand, 1);
		if (job.kind === 'new' || job.kind === 'replace' || job.unsummed) {
			seeHand(players, replay);
		}
	}

	run.done += jobs.length;
	const complete = run.done >= run.total;
	const recorded = complete ? run.record : null;
	await store.commit({
		...(recorded && run.reloads.length > 0 ? { forget: { imports: run.reloads } } : {}),
		hands,
		players: [...players.values()],
		meta,
		...(recorded ? { imported: recorded } : {}),
	});
	return complete;
}

/** Loads a whole log into the library in one call. */
export async function ingestLog(
	store: HandStore,
	text: string,
	options: IngestOptions = {}
): Promise<IngestRun> {
	const run = await startIngest(store, text, options);
	await advanceIngest(run);
	return run;
}
