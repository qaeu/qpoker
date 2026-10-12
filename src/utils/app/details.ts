/**
 * The heavy halves of the hands being read, fetched from the library one at a
 * time and kept while they are likely to be read again. Reading one that is
 * not here yet returns null and sends for it; the read is tracked, so whatever
 * asked is run again when it arrives.
 */

import { createSignal } from 'solid-js';

import type { HandDetail } from '../coach/report';
import type { HandStore } from '../store/types';

/** Hands kept: a step back through the list should not fetch again. */
const KEPT = 50;

export interface DetailCache {
	detailOf: (handId: string) => HandDetail | null;
	/** Drops everything, for when the library has changed under it. */
	clear: () => void;
}

export function createDetailCache(store: HandStore): DetailCache {
	const [details, setDetails] = createSignal<ReadonlyMap<string, HandDetail>>(new Map());
	const wanted = new Set<string>();
	// Bumped by a clear, so a fetch sent before it does not land after it.
	let generation = 0;

	const fetch = async (handId: string) => {
		const sent = generation;
		wanted.add(handId);
		try {
			const detail = await store.detail(handId);
			if (!detail || sent !== generation) return;
			setDetails((current) => {
				const next = new Map(current).set(handId, detail);
				// A map keeps the order things were put in: the oldest goes first.
				for (const id of next.keys()) {
					if (next.size <= KEPT) break;
					next.delete(id);
				}
				return next;
			});
		} finally {
			wanted.delete(handId);
		}
	};

	return {
		detailOf(handId) {
			const detail = details().get(handId);
			if (!detail && !wanted.has(handId)) void fetch(handId);
			return detail ?? null;
		},
		clear() {
			generation++;
			wanted.clear();
			setDetails(new Map());
		},
	};
}
