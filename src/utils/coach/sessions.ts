/**
 * Sittings: runs of hands with no long gap between them, read off the hands'
 * own times. They are what a history is looked at by -- the latest one, one
 * from last week, each against the others -- whatever files it arrived in.
 * See docs/library.md.
 */

import type { HandSummary } from './report';

/** A gap longer than this between two hands starts a new sitting. */
export const SESSION_GAP_MINUTES = 30;

export interface PlaySession {
	/** The time of its first hand, which also names it in an address. */
	id: string;
	first: string;
	last: string;
	/** Where its hands start among all of them, and how many there are. */
	start: number;
	hands: number;
}

/** The presets a scope can name; any other scope is one sitting's id. */
export const SCOPE_PRESETS = ['all', 'latest', 'week', 'month'] as const;
export type ScopePreset = (typeof SCOPE_PRESETS)[number];

/** Which of the library's hands a report is over. */
export type Scope = ScopePreset | (string & {});

export const DEFAULT_SCOPE: Scope = 'all';

const SCOPE_DAYS: Partial<Record<Scope, number>> = { week: 7, month: 30 };

const TIMESTAMP = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)$/;

export const isTimestamp = (text: string): boolean => TIMESTAMP.test(text);

/** A hand's zone-less time as minutes on one clock, so two can be compared. */
export function minutesOf(timestamp: string): number {
	const parts = TIMESTAMP.exec(timestamp);
	if (!parts) return NaN;
	const [year, month, day, hour, minute, second] = parts.slice(1).map(Number);
	return Date.UTC(year, month - 1, day, hour, minute, second) / 60_000;
}

/** The sittings a run of hands, oldest first, falls into. */
export function sessionsOf(
	hands: readonly Pick<HandSummary, 'timestamp'>[]
): PlaySession[] {
	const sessions: PlaySession[] = [];
	let current: PlaySession | undefined;
	hands.forEach(({ timestamp }, index) => {
		// A hand with no readable time stays with the hands around it.
		const gap = current ? minutesOf(timestamp) - minutesOf(current.last) : Infinity;
		if (!current || gap > SESSION_GAP_MINUTES) {
			current = {
				id: timestamp,
				first: timestamp,
				last: timestamp,
				start: index,
				hands: 0,
			};
			sessions.push(current);
		}
		current.last = timestamp;
		current.hands++;
	});
	return sessions;
}

/**
 * The hands a scope names. The days of `week` and `month` are counted back
 * from the last hand, not from today: a report is a function of its hands. A
 * sitting that is not there is every hand, rather than none.
 */
export function scopeHands<T extends Pick<HandSummary, 'timestamp'>>(
	hands: readonly T[],
	scope: Scope,
	sessions: readonly PlaySession[] = sessionsOf(hands)
): readonly T[] {
	const days = SCOPE_DAYS[scope];
	if (days !== undefined) {
		const from = minutesOf(hands.at(-1)?.timestamp ?? '') - days * 24 * 60;
		return hands.filter(({ timestamp }) => !(minutesOf(timestamp) < from));
	}
	const session =
		scope === 'latest' ? sessions.at(-1) : sessions.find(({ id }) => id === scope);
	if (scope === 'all' || !session) return hands;
	return hands.slice(session.start, session.start + session.hands);
}
