/**
 * What the Review view lists: which hands, cut down how, in what order. The
 * query is plain data so that the hash route can carry all of it.
 */

import { SEVERITIES, type MistakeType, type Severity } from '../coach/mistakes';
import type { FindingSummary, HandSummary } from '../coach/report';
import { POSITIONS, type Position } from '../history/replay';
import { SCENARIOS, type Scenario } from '../ranges/preflopSpot';

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
	/** The hero's seat. With `scenario`, the scope: it cuts every `show` down. */
	position: Position | null;
	/** A preflop spot the hero made a decision in. */
	scenario: Scenario | null;
	/** Null for the order that suits `show`: see `orderOf`. */
	order: ReviewOrder | null;
	/** The id of the hand being read. */
	hand: string | null;
	/** Where in that hand's replay; null for where the hand opens by itself. */
	step: number | null;
}

export const DEFAULT_REVIEW: ReviewQuery = {
	show: 'mistakes',
	floor: 'inaccuracy',
	street: 'all',
	kind: null,
	position: null,
	scenario: null,
	order: null,
	hand: null,
	step: null,
};

/** Findings are read biggest first; a plain list of hands, as it was played. */
export function orderOf(query: ReviewQuery): ReviewOrder {
	return (
		query.order
		?? (query.show === 'mistakes' || query.show === 'plays' ? 'impact' : 'time')
	);
}

/** A mistake or a good play, with what it cost or earned as one signed figure. */
export type Finding = FindingSummary;

/** Hands in their light half: all that listing them reads. */
export interface Listing<T extends HandSummary = HandSummary> {
	hands: readonly T[];
}

export interface ReviewCounts {
	all: number;
	played: number;
	mistakes: number;
	plays: number;
	ungraded: number;
}

/** The hands a query is about, whatever it shows of them. */
export type ReviewScope = Pick<ReviewQuery, 'position' | 'scenario'>;

/** One value a scope filter can take, and the hands it would leave. */
export interface ScopeOption<T extends string> {
	id: T;
	hands: number;
}

export interface ReviewTally {
	hands: number;
	/** What the listed findings sum to, when the list is one of findings. */
	evBb: number | null;
}

/** The hero put money in by choice, or bet. */
export const isPlayed = (hand: HandSummary): boolean => hand.played;

/** A hand's mistakes and good plays, in the order they were made. */
export const findingsOf = (hand: HandSummary): Finding[] => hand.findings;

/** The findings that put a hand on the list: those the query is asking for. */
function matching(hand: HandSummary, query: ReviewQuery): Finding[] {
	const findings = findingsOf(hand);
	if (query.show === 'plays') return findings.filter(({ kind }) => kind === 'play');
	if (query.show !== 'mistakes') return findings;
	const floor = SEVERITIES.indexOf(query.floor);
	return findings.filter(
		({ kind, severity, street, mistake }) =>
			kind === 'mistake'
			&& SEVERITIES.indexOf(severity) >= floor
			&& (query.street === 'all' || (query.street === 'pre') === (street === 'preflop'))
			&& (query.kind === null || mistake === query.kind)
	);
}

/** The size of a hand's largest finding, among those asked for. */
function impact(hand: HandSummary, query: ReviewQuery): number {
	return Math.max(0, ...matching(hand, query).map(({ evBb }) => Math.abs(evBb)));
}

const inScenario = (hand: HandSummary, scenario: Scenario): boolean =>
	hand.scenarios.includes(scenario);

/** Whether a hand is one the query is about: the seat, and the preflop spot. */
function inScope(hand: HandSummary, scope: ReviewScope): boolean {
	return (
		(scope.position === null || hand.position === scope.position)
		&& (scope.scenario === null || inScenario(hand, scope.scenario))
	);
}

function isListed(hand: HandSummary, query: ReviewQuery): boolean {
	if (!inScope(hand, query)) return false;
	switch (query.show) {
		case 'all':
			return true;
		case 'played':
			return isPlayed(hand);
		case 'ungraded':
			return !hand.gradeable;
		default:
			return matching(hand, query).length > 0;
	}
}

/** The hands the query asks for, in the order it asks for them. */
export function listHands<T extends HandSummary>(
	report: Listing<T>,
	query: ReviewQuery
): T[] {
	const listed = report.hands.filter((hand) => isListed(hand, query));
	if (orderOf(query) === 'time') return listed;
	// Stable, so hands of equal weight (most have none) stay as they were played.
	return listed
		.map((hand) => ({ hand, weight: impact(hand, query) }))
		.sort((a, b) => b.weight - a.weight)
		.map(({ hand }) => hand);
}

/** How many of the scope's hands each `show` lists, before any other narrowing. */
export function countsOf(
	report: Listing,
	scope: ReviewScope = DEFAULT_REVIEW
): ReviewCounts {
	const counts: ReviewCounts = { all: 0, played: 0, mistakes: 0, plays: 0, ungraded: 0 };
	for (const hand of report.hands) {
		if (!inScope(hand, scope)) continue;
		const findings = findingsOf(hand);
		counts.all++;
		if (isPlayed(hand)) counts.played++;
		if (findings.some(({ kind }) => kind === 'mistake')) counts.mistakes++;
		if (findings.some(({ kind }) => kind === 'play')) counts.plays++;
		if (!hand.gradeable) counts.ungraded++;
	}
	return counts;
}

/** The line under the filters: how many hands, and what their findings sum to. */
export function tallyOf(listed: readonly HandSummary[], query: ReviewQuery): ReviewTally {
	const summed = query.show === 'mistakes' || query.show === 'plays';
	return {
		hands: listed.length,
		evBb:
			summed ?
				listed
					.flatMap((hand) => matching(hand, query))
					.reduce((sum, { evBb }) => sum + evBb, 0)
			:	null,
	};
}

/**
 * The seats the hero held, earliest first, with the hands each would leave
 * given the spot already chosen. The seat in the query is always listed.
 */
export function positionsOf(
	report: Listing,
	scope: ReviewScope = DEFAULT_REVIEW
): ScopeOption<Position>[] {
	const within = report.hands.filter((hand) =>
		inScope(hand, { position: null, scenario: scope.scenario })
	);
	return POSITIONS.map((id) => ({
		id,
		hands: within.filter((hand) => hand.position === id).length,
	})).filter(({ id, hands }) => hands > 0 || id === scope.position);
}

/** The preflop spots the hero was in, likewise, given the seat already chosen. */
export function scenariosOf(
	report: Listing,
	scope: ReviewScope = DEFAULT_REVIEW
): ScopeOption<Scenario>[] {
	const within = report.hands.filter((hand) =>
		inScope(hand, { position: scope.position, scenario: null })
	);
	return SCENARIOS.map((id) => ({
		id,
		hands: within.filter((hand) => inScenario(hand, id)).length,
	})).filter(({ id, hands }) => hands > 0 || id === scope.scenario);
}
