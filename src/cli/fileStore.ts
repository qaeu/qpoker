/**
 * The hand store on disk, for the command line: a directory of JSON-lines
 * files that are only ever added to, so a commit costs what it adds and not
 * what the library holds. A later line for the same hand wins. The light rows
 * are one file, read on every run; the heavy halves are a file a month, read
 * only for the months asked of. See docs/library.md.
 */

import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import type { HandDetail } from '#utils/coach/report';
import { chronological } from '#utils/history/parse';
import type {
	Commit,
	HandRow,
	HandStore,
	ImportRecord,
	LibraryMeta,
	PlayerAggregate,
} from '#utils/store/types';

const ROWS = 'rows.jsonl';
const PLAYERS = 'players.json';
const META = 'meta.json';
const IMPORTS = 'imports.jsonl';
/** A commit is written here whole before it is applied, and applied again if cut short. */
const JOURNAL = 'journal.json';
const DETAILS = 'details';
const RAW = 'raw';

interface DetailLine {
	id: string;
	detail: HandDetail;
}

interface RawLine {
	id: string;
	text: string;
}

/** `2026-10`: the file a hand's heavy halves are in. */
const monthOf = (timestamp: string): string =>
	/^\d{4}-\d\d/.exec(timestamp)?.[0] ?? 'undated';

function readLines<T>(path: string): T[] {
	if (!existsSync(path)) return [];
	return readFileSync(path, 'utf8')
		.split('\n')
		.filter((line) => line !== '')
		.map((line) => JSON.parse(line) as T);
}

const linesOf = (items: readonly unknown[]): string =>
	items.map((item) => `${JSON.stringify(item)}\n`).join('');

function readJson<T>(path: string): T | null {
	return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : null;
}

/** Replaces a file in one step, so a reader never sees half of it. */
function writeWhole(path: string, text: string): void {
	writeFileSync(`${path}.tmp`, text);
	renameSync(`${path}.tmp`, path);
}

export function createFileStore(directory: string): HandStore {
	const at = (...parts: string[]) => join(directory, ...parts);
	let rows: Map<string, HandRow> | undefined;
	const months = new Map<
		string,
		{ details: Map<string, HandDetail>; raw: Map<string, string> }
	>();

	const apply = (change: Commit) => {
		mkdirSync(at(DETAILS), { recursive: true });
		mkdirSync(at(RAW), { recursive: true });
		const hands = change.hands ?? [];
		for (const month of new Set(hands.map(({ summary }) => monthOf(summary.timestamp)))) {
			const mine = hands.filter(({ summary }) => monthOf(summary.timestamp) === month);
			appendFileSync(
				at(DETAILS, `${month}.jsonl`),
				linesOf(
					mine.map(({ summary, detail }): DetailLine => ({ id: summary.id, detail }))
				)
			);
			appendFileSync(
				at(RAW, `${month}.jsonl`),
				linesOf(mine.map(({ summary, raw }): RawLine => ({ id: summary.id, text: raw })))
			);
			months.delete(month);
		}
		appendFileSync(
			at(ROWS),
			linesOf(hands.map(({ summary, key }) => ({ summary, key })))
		);
		if (change.resetPlayers || change.players) {
			const players = new Map(
				change.resetPlayers ?
					[]
				:	(readJson<PlayerAggregate[]>(at(PLAYERS)) ?? []).map((player) => [
						player.name,
						player,
					])
			);
			for (const player of change.players ?? []) players.set(player.name, player);
			writeWhole(at(PLAYERS), JSON.stringify([...players.values()]));
		}
		if (change.meta) writeWhole(at(META), JSON.stringify(change.meta));
		if (change.imported) appendFileSync(at(IMPORTS), linesOf([change.imported]));
		rows = undefined;
	};

	/** Finishes a commit an earlier run was cut short in. Every write is safe to repeat. */
	const recover = () => {
		const journal = existsSync(at(JOURNAL)) ? readFileSync(at(JOURNAL), 'utf8') : '';
		if (journal === '') return;
		try {
			apply(JSON.parse(journal) as Commit);
		} catch {
			// The journal itself was cut short: nothing of that commit was applied.
		}
		rmSync(at(JOURNAL));
	};

	const loadRows = (): Map<string, HandRow> => {
		recover();
		rows ??= new Map(readLines<HandRow>(at(ROWS)).map((row) => [row.summary.id, row]));
		return rows;
	};

	const loadMonth = (month: string) => {
		let loaded = months.get(month);
		if (!loaded) {
			loaded = {
				details: new Map(
					readLines<DetailLine>(at(DETAILS, `${month}.jsonl`)).map((line) => [
						line.id,
						line.detail,
					])
				),
				raw: new Map(
					readLines<RawLine>(at(RAW, `${month}.jsonl`)).map((line) => [
						line.id,
						line.text,
					])
				),
			};
			months.set(month, loaded);
		}
		return loaded;
	};

	const monthFor = (id: string) => {
		const row = loadRows().get(id);
		return row ? loadMonth(monthOf(row.summary.timestamp)) : null;
	};

	return {
		async known() {
			return new Map(
				[...loadRows()].map(([id, { summary, key }]) => [
					id,
					{ digest: summary.digest, stakes: summary.stakes, key },
				])
			);
		},
		async rows() {
			return [...loadRows().values()].sort((a, b) => chronological(a.summary, b.summary));
		},
		async detail(id) {
			return monthFor(id)?.details.get(id) ?? null;
		},
		async raw(ids) {
			return new Map(
				ids.flatMap((id): [string, string][] => {
					const text = monthFor(id)?.raw.get(id);
					return text === undefined ? [] : [[id, text]];
				})
			);
		},
		async players(names) {
			recover();
			const players = readJson<PlayerAggregate[]>(at(PLAYERS)) ?? [];
			return names ? players.filter((player) => names.includes(player.name)) : players;
		},
		async imports() {
			recover();
			// Keyed by when it was made, so a commit applied twice is one import.
			return [
				...new Map(
					readLines<ImportRecord>(at(IMPORTS)).map((record) => [
						record.importedAt,
						record,
					])
				).values(),
			];
		},
		async meta() {
			recover();
			return readJson<LibraryMeta>(at(META));
		},
		async commit(change) {
			recover();
			mkdirSync(directory, { recursive: true });
			writeWhole(at(JOURNAL), JSON.stringify(change));
			apply(change);
			rmSync(at(JOURNAL));
		},
		async clear() {
			for (const name of existsSync(directory) ? readdirSync(directory) : []) {
				if ([ROWS, PLAYERS, META, IMPORTS, JOURNAL, DETAILS, RAW].includes(name)) {
					rmSync(at(name), { recursive: true, force: true });
				}
			}
			rows = undefined;
			months.clear();
		},
	};
}
