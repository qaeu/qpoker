/**
 * The hand library: every hand ever loaded, kept so that a report can be made
 * over any of them and a player met again is already known. What is stored and
 * why it is in three tiers is in docs/library.md.
 *
 * `HandStore` is the one seam between the engine and where the hands live: in
 * IndexedDB in the browser, in files for the CLI, in memory for the tests.
 */

import type { HandDetail, HandSummary } from '../coach/report';
import type { SessionTally } from '../coach/session';

export const LIBRARY_SCHEMA = 1;

/** Everything outside a hand's own text that its stored report hangs on. */
export interface GradeKey {
	/** `REPORT_VERSION` when it was graded. */
	version: number;
	/** `FACTS_VERSION` when it was summed up. */
	facts: number;
	hero: string;
	seed: number;
	samples: number | null;
	/** The rake its gradings were priced at, or null when none read it. */
	rake: number | null;
}

/** The light half of a stored hand, which is all a list or a summary loads. */
export interface HandRow {
	summary: HandSummary;
	key: GradeKey;
}

export interface StoredHand extends HandRow {
	detail: HandDetail;
	/** The hand's own lines: the source of truth, from which the rest is rebuilt. */
	raw: string;
}

/** What tells an import whether it has anything to do for a hand. */
export interface KnownHand {
	digest: string;
	stakes: string;
	key: GradeKey;
}

export interface Showdown {
	handId: string;
	timestamp: string;
	cards: string;
}

/** Everything seen of one player, summed as their hands came in. */
export interface PlayerAggregate {
	name: string;
	firstSeen: string;
	lastSeen: string;
	tally: SessionTally;
	/** The hands they showed, oldest first. */
	showdowns: Showdown[];
}

export interface ImportRecord {
	/** When it was imported, as an ISO timestamp: also its key. */
	importedAt: string;
	fileName: string;
	/** Hands in the file, then how many of them were new or replaced a cut-short one. */
	hands: number;
	added: number;
	replaced: number;
	/**
	 * Every hand in the file, which is what forgetting the log goes by. Absent
	 * from an import made before a log could be forgotten.
	 */
	handIds?: string[];
}

/** The pots that saw a flop at one stakes level, and the rake taken, in cents. */
export interface RakeSeen {
	pots: number;
	rake: number;
}

export interface LibraryMeta {
	schema: number;
	/**
	 * The one player to coach, when the user has named one. Empty otherwise, and
	 * each hand is then graded for whoever it was dealt to: a history is one
	 * person's, under however many screen names.
	 */
	hero: string;
	seed: number;
	samples: number | null;
	/** A rake the user fixed, or null to take each stakes level's own from `rakes`. */
	rake: number | null;
	rakes: Record<string, RakeSeen>;
	/** `FACTS_VERSION` the player aggregates were built under. */
	facts: number;
}

/** What a commit takes out: hands by id, players by name, imports by their time. */
export interface Forgotten {
	hands?: string[];
	players?: string[];
	imports?: string[];
}

/** One atomic write: all of it lands or none of it does. */
export interface Commit {
	/** Taken out before anything else is put in. */
	forget?: Forgotten;
	hands?: StoredHand[];
	/** Empties the players first, for a rebuild. */
	resetPlayers?: boolean;
	players?: PlayerAggregate[];
	meta?: LibraryMeta;
	imported?: ImportRecord;
}

export interface HandStore {
	known(): Promise<Map<string, KnownHand>>;
	/** Every hand's light half, oldest first. */
	rows(): Promise<HandRow[]>;
	detail(id: string): Promise<HandDetail | null>;
	raw(ids: readonly string[]): Promise<Map<string, string>>;
	/** The named players that are known, or all of them. */
	players(names?: readonly string[]): Promise<PlayerAggregate[]>;
	imports(): Promise<ImportRecord[]>;
	meta(): Promise<LibraryMeta | null>;
	commit(change: Commit): Promise<void>;
	clear(): Promise<void>;
}
