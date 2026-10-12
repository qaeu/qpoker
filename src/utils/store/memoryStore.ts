/**
 * A hand store that lives in memory: what the tests run the library on, and
 * the reference the other adapters are held to. Everything is copied on the
 * way in and out, as a real store would.
 */

import { chronological } from '../history/parse';
import type {
	Commit,
	HandStore,
	ImportRecord,
	LibraryMeta,
	PlayerAggregate,
	StoredHand,
} from './types';

export function createMemoryStore(): HandStore {
	const hands = new Map<string, StoredHand>();
	const players = new Map<string, PlayerAggregate>();
	let imports: ImportRecord[] = [];
	let meta: LibraryMeta | null = null;

	return {
		async known() {
			return new Map(
				[...hands].map(([id, { summary, key }]) => [
					id,
					{ digest: summary.digest, stakes: summary.stakes, key: { ...key } },
				])
			);
		},
		async rows() {
			return structuredClone(
				[...hands.values()]
					.map(({ summary, key }) => ({ summary, key }))
					.sort((a, b) => chronological(a.summary, b.summary))
			);
		},
		async detail(id) {
			const hand = hands.get(id);
			return hand ? structuredClone(hand.detail) : null;
		},
		async raw(ids) {
			return new Map(
				ids.flatMap((id): [string, string][] => {
					const hand = hands.get(id);
					return hand ? [[id, hand.raw]] : [];
				})
			);
		},
		async players(names) {
			const found =
				names ? names.flatMap((name) => players.get(name) ?? []) : [...players.values()];
			return structuredClone(found);
		},
		async imports() {
			return structuredClone(imports);
		},
		async meta() {
			return structuredClone(meta);
		},
		async commit(change: Commit) {
			const copy = structuredClone(change);
			for (const hand of copy.hands ?? []) hands.set(hand.summary.id, hand);
			if (copy.resetPlayers) players.clear();
			for (const player of copy.players ?? []) players.set(player.name, player);
			if (copy.meta) meta = copy.meta;
			if (copy.imported) imports = [...imports, copy.imported];
		},
		async clear() {
			hands.clear();
			players.clear();
			imports = [];
			meta = null;
		},
	};
}
