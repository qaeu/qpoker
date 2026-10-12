/**
 * The hand store in the browser: IndexedDB, which holds the tens of megabytes
 * a long history comes to and reads one hand's detail without the rest. The
 * page and the worker each open it; a commit is one transaction.
 * See docs/library.md.
 */

import { chronological } from '../history/parse';
import type {
	Commit,
	HandRow,
	HandStore,
	ImportRecord,
	LibraryMeta,
	PlayerAggregate,
} from './types';
import type { HandDetail } from '../coach/report';

export const DATABASE_NAME = 'qpoker';

/** The object stores' own layout, apart from the shape of what is in them. */
const DATABASE_VERSION = 1;

const ROWS = 'rows';
const DETAILS = 'details';
const RAW = 'raw';
const PLAYERS = 'players';
const IMPORTS = 'imports';
const META = 'meta';
const STORES = [ROWS, DETAILS, RAW, PLAYERS, IMPORTS, META] as const;

const META_KEY = 'library';

const settled = <T>(request: IDBRequest<T>): Promise<T> =>
	new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});

const finished = (transaction: IDBTransaction): Promise<void> =>
	new Promise((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
		transaction.onabort = () => reject(transaction.error);
	});

function open(name: string): Promise<IDBDatabase> {
	const request = indexedDB.open(name, DATABASE_VERSION);
	request.onupgradeneeded = () => {
		const database = request.result;
		database.createObjectStore(ROWS, { keyPath: 'summary.id' });
		database.createObjectStore(DETAILS);
		database.createObjectStore(RAW);
		database.createObjectStore(PLAYERS, { keyPath: 'name' });
		database.createObjectStore(IMPORTS, { keyPath: 'importedAt' });
		database.createObjectStore(META);
	};
	return settled(request);
}

/** Opens the library, on first use: a page that never reads it never opens it. */
export function openIdbStore(name = DATABASE_NAME): HandStore {
	let database: Promise<IDBDatabase> | undefined;
	const read = async (...stores: string[]) =>
		(await (database ??= open(name))).transaction(stores, 'readonly');

	const rows = async (): Promise<HandRow[]> => {
		const transaction = await read(ROWS);
		return settled<HandRow[]>(transaction.objectStore(ROWS).getAll());
	};

	return {
		async known() {
			return new Map(
				(await rows()).map(({ summary, key }) => [
					summary.id,
					{ digest: summary.digest, stakes: summary.stakes, key },
				])
			);
		},
		async rows() {
			return (await rows()).sort((a, b) => chronological(a.summary, b.summary));
		},
		async detail(id) {
			const transaction = await read(DETAILS);
			const detail = await settled<HandDetail | undefined>(
				transaction.objectStore(DETAILS).get(id)
			);
			return detail ?? null;
		},
		async raw(ids) {
			if (ids.length === 0) return new Map();
			const store = (await read(RAW)).objectStore(RAW);
			const texts = await Promise.all(
				ids.map((id) => settled<string | undefined>(store.get(id)))
			);
			return new Map(
				ids.flatMap((id, i): [string, string][] => {
					const text = texts[i];
					return text === undefined ? [] : [[id, text]];
				})
			);
		},
		async players(names) {
			const store = (await read(PLAYERS)).objectStore(PLAYERS);
			if (!names) return settled<PlayerAggregate[]>(store.getAll());
			const found = await Promise.all(
				names.map((name) => settled<PlayerAggregate | undefined>(store.get(name)))
			);
			return found.flatMap((player) => player ?? []);
		},
		async imports() {
			const transaction = await read(IMPORTS);
			return settled<ImportRecord[]>(transaction.objectStore(IMPORTS).getAll());
		},
		async meta() {
			const transaction = await read(META);
			const meta = await settled<LibraryMeta | undefined>(
				transaction.objectStore(META).get(META_KEY)
			);
			return meta ?? null;
		},
		async commit(change: Commit) {
			const transaction = (await (database ??= open(name))).transaction(
				[...STORES],
				'readwrite'
			);
			const done = finished(transaction);
			for (const { summary, key, detail, raw } of change.hands ?? []) {
				transaction.objectStore(ROWS).put({ summary, key });
				transaction.objectStore(DETAILS).put(detail, summary.id);
				transaction.objectStore(RAW).put(raw, summary.id);
			}
			if (change.resetPlayers) transaction.objectStore(PLAYERS).clear();
			for (const player of change.players ?? []) {
				transaction.objectStore(PLAYERS).put(player);
			}
			if (change.meta) transaction.objectStore(META).put(change.meta, META_KEY);
			if (change.imported) transaction.objectStore(IMPORTS).put(change.imported);
			await done;
		},
		async clear() {
			const transaction = (await (database ??= open(name))).transaction(
				[...STORES],
				'readwrite'
			);
			const done = finished(transaction);
			for (const store of STORES) transaction.objectStore(store).clear();
			await done;
		},
	};
}
