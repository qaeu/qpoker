/**
 * Reading the library: the hands it can show as they stand, and a report's
 * summed figures over any run of them. A hand waiting to be graded again is
 * left out rather than shown wrong. See docs/library.md.
 */

import {
	summariseHands,
	type AnalysisReport,
	type HandDetail,
	type HandReport,
	type HandSummary,
	type ReportSummary,
} from '../coach/report';
import { scopeHands, type Scope } from '../coach/sessions';
import { emptyEquity } from '../coach/stepEquity';
import { rateOf, stalenessOf } from './ingest';
import type { HandStore, ImportRecord, LibraryMeta } from './types';

export interface Library {
	/** Null for a library nothing has been loaded into. */
	meta: LibraryMeta | null;
	/** Who most of the hands are graded for, and everyone any of them is. */
	hero: string;
	heroes: string[];
	/** The hands graded under the library's settings, oldest first. */
	hands: HandSummary[];
	/** Hands held back until a run brings them up to date. */
	stale: number;
	/** Every log loaded, oldest first. */
	imports: ImportRecord[];
}

export async function loadLibrary(store: HandStore): Promise<Library> {
	const meta = await store.meta();
	if (!meta)
		return { meta: null, hero: '', heroes: [], hands: [], stale: 0, imports: [] };
	const rows = (await store.rows()).filter(
		({ summary, key }) => stalenessOf({ key, stakes: summary.stakes }, meta) === null
	);
	const total = (await store.known()).size;
	const hands = rows.map(({ summary }) => summary);
	const graded = new Map<string, number>();
	for (const { key } of rows) {
		if (key.hero) graded.set(key.hero, (graded.get(key.hero) ?? 0) + 1);
	}
	const heroes = [...graded].sort((a, b) => b[1] - a[1]).map(([name]) => name);
	const imports = (await store.imports()).sort((a, b) =>
		a.importedAt < b.importedAt ? -1 : 1
	);
	return {
		meta,
		hero: heroes[0] ?? meta.hero,
		heroes,
		hands,
		stale: total - hands.length,
		imports,
	};
}

/**
 * What a run of the library's hands says together. The rake reported is that
 * of the stakes most of them were played at.
 */
export function libraryReport(
	library: Library & { meta: LibraryMeta },
	hands: readonly HandSummary[] = library.hands
): ReportSummary {
	const { meta } = library;
	const counts = new Map<string, number>();
	for (const { stakes } of hands) counts.set(stakes, (counts.get(stakes) ?? 0) + 1);
	const [stakes = ''] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [];
	return {
		...summariseHands(hands, {
			hero: library.hero,
			rake: rateOf(meta, stakes),
			seed: meta.seed,
			samples: meta.samples,
		}),
		stakes,
	};
}

const noDetail = (): HandDetail => ({
	lines: [],
	gradings: [],
	shown: {},
	seats: [],
	returned: {},
	paid: {},
	equity: emptyEquity(),
});

/**
 * A full report over a scope of the library, as an analysis of those hands
 * would give it, for a reader that prints the gradings. Only the hands with a
 * finding, and the one asked for, are read in full: the rest are left bare.
 * Null for a library with nothing to report.
 */
export async function libraryAnalysis(
	store: HandStore,
	scope: Scope = 'all',
	handId?: string
): Promise<AnalysisReport | null> {
	const library = await loadLibrary(store);
	const { meta } = library;
	if (!meta || library.hands.length === 0) return null;
	const summaries = scopeHands(library.hands, scope);
	const hands: HandReport[] = [];
	for (const summary of summaries) {
		const wanted = summary.findings.length > 0 || summary.id === handId;
		const detail = wanted ? await store.detail(summary.id) : null;
		hands.push({ ...summary, ...(detail ?? noDetail()) });
	}
	const gradings = hands.flatMap((hand) => hand.gradings);
	return {
		...libraryReport({ ...library, meta }, summaries),
		mistakes: gradings
			.filter((grading) => grading.mistake !== null)
			.sort((a, b) => a.evLostBb - b.evLostBb),
		goodPlays: gradings
			.filter((grading) => grading.goodPlay !== null)
			.sort((a, b) => b.goodPlay!.evGainedBb - a.goodPlay!.evGainedBb),
		hands,
	};
}
