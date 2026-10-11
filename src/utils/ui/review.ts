/**
 * What the Review view lists: which hands, cut down how, in what order. The
 * query is plain data so that the hash route can carry all of it.
 */

import type { MistakeType, Severity } from '../coach/mistakes';

export const REVIEW_SHOWS = ['all', 'played', 'mistakes', 'plays', 'ungraded'] as const;
export type ReviewShow = (typeof REVIEW_SHOWS)[number];

/** The least severe mistake still listed. */
export const REVIEW_FLOORS = ['inaccuracy', 'mistake', 'blunder'] as const;
export type ReviewFloor = (typeof REVIEW_FLOORS)[number] & Severity;

export const REVIEW_STREETS = ['all', 'pre', 'post'] as const;
export type ReviewStreet = (typeof REVIEW_STREETS)[number];

export const REVIEW_ORDERS = ['impact', 'time'] as const;
export type ReviewOrder = (typeof REVIEW_ORDERS)[number];

export interface ReviewQuery {
	show: ReviewShow;
	/** Applies to mistakes only, as `street` and `kind` do. */
	floor: ReviewFloor;
	street: ReviewStreet;
	kind: MistakeType | null;
	/** Null for the order that suits `show`: see `orderOf`. */
	order: ReviewOrder | null;
	/** The id of the hand being read. */
	hand: string | null;
}

export const DEFAULT_REVIEW: ReviewQuery = {
	show: 'mistakes',
	floor: 'inaccuracy',
	street: 'all',
	kind: null,
	order: null,
	hand: null,
};

/** Findings are read biggest first; a plain list of hands, as it was played. */
export function orderOf(query: ReviewQuery): ReviewOrder {
	return (
		query.order
		?? (query.show === 'mistakes' || query.show === 'plays' ? 'impact' : 'time')
	);
}
