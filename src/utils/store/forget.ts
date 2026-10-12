/**
 * Forgetting a log: the hands no other log holds are taken out of the library,
 * and out of the players' sums and the rake seen with them. See docs/library.md.
 */

import { addRake, parseOne } from './ingest';
import { playersOf, seeHand } from './players';
import type { HandStore, ImportRecord, PlayerAggregate } from './types';

/** Hands read at a time when looking for where a player is next seen. */
const SCAN_HANDS = 200;

/**
 * The hands that go with a log: those in its file and in no other log's. Null
 * for an import that did not record its hands, which cannot be forgotten.
 */
export function handsOnlyIn(
	imports: readonly ImportRecord[],
	importedAt: string
): string[] | null {
	const record = imports.find((other) => other.importedAt === importedAt);
	if (!record?.handIds) return null;
	const elsewhere = new Set(
		imports.flatMap((other) => (other === record ? [] : (other.handIds ?? [])))
	);
	return record.handIds.filter((id) => !elsewhere.has(id));
}

/** When each of `names` is first dealt in, going through the hands in the order given. */
async function firstSeen(
	store: HandStore,
	ids: readonly string[],
	names: ReadonlySet<string>
): Promise<Map<string, string>> {
	const found = new Map<string, string>();
	for (let from = 0; from < ids.length && found.size < names.size; from += SCAN_HANDS) {
		const chunk = ids.slice(from, from + SCAN_HANDS);
		const raw = await store.raw(chunk);
		for (const id of chunk) {
			const replay = parseOne(raw.get(id)!);
			const dealt = new Map<string, PlayerAggregate>();
			seeHand(dealt, replay);
			for (const name of dealt.keys()) {
				if (names.has(name) && !found.has(name)) found.set(name, replay.hand.timestamp);
			}
		}
	}
	return found;
}

/**
 * Forgets one log, and returns how many hands went with it. Hands graded at a
 * rake this moves are left stale, for the next run to grade again.
 */
export async function forgetImport(
	store: HandStore,
	importedAt: string
): Promise<number> {
	const meta = await store.meta();
	const known = await store.known();
	const ids = (handsOnlyIn(await store.imports(), importedAt) ?? []).filter((id) =>
		known.has(id)
	);
	const gone = new Set(ids);
	const raw = await store.raw(ids);
	const replays = ids.map((id) => parseOne(raw.get(id)!));

	const players = new Map<string, PlayerAggregate>(
		(await store.players([...new Set(replays.flatMap(playersOf))])).map((player) => [
			player.name,
			player,
		])
	);
	const times = new Set(replays.map((replay) => replay.hand.timestamp));
	for (const replay of replays) {
		seeHand(players, replay, -1);
		if (meta) addRake(meta.rakes, replay.hand, -1);
	}
	for (const [stakes, seen] of Object.entries(meta?.rakes ?? {})) {
		if (seen.pots === 0 && seen.rake === 0) delete meta!.rakes[stakes];
	}

	const unseen = [...players.values()].filter((player) => player.tally.hands <= 0);
	for (const { name } of unseen) players.delete(name);

	// A player first or last seen in a forgotten hand is looked for in what is left.
	const kept = (await store.rows())
		.map(({ summary }) => summary.id)
		.filter((id) => !gone.has(id));
	const moved = (edge: 'firstSeen' | 'lastSeen') =>
		new Set(
			[...players.values()]
				.filter((player) => times.has(player[edge]))
				.map((player) => player.name)
		);
	const first = await firstSeen(store, kept, moved('firstSeen'));
	const last = await firstSeen(store, [...kept].reverse(), moved('lastSeen'));
	for (const player of players.values()) {
		player.firstSeen = first.get(player.name) ?? player.firstSeen;
		player.lastSeen = last.get(player.name) ?? player.lastSeen;
	}

	await store.commit({
		forget: {
			hands: ids,
			players: unseen.map((player) => player.name),
			imports: [importedAt],
		},
		players: [...players.values()],
		...(meta ? { meta } : {}),
	});
	return ids.length;
}
