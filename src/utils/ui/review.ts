/**
 * What the Review view lists: which hands, cut down how, in what order. The
 * query is plain data so that the hash route can carry all of it.
 */

import type { Grading } from '../coach/grade';
import { SEVERITIES, type MistakeType, type Severity } from '../coach/mistakes';
import type { AnalysisReport, HandReport } from '../coach/report';

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
	/** Where in that hand's replay; null for where the hand opens by itself. */
	step: number | null;
}

export const DEFAULT_REVIEW: ReviewQuery = {
	show: 'mistakes',
	floor: 'inaccuracy',
	street: 'all',
	kind: null,
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
export interface Finding {
	grading: Grading;
	kind: 'mistake' | 'play';
	/** Negative for a mistake, positive for a good play. */
	evBb: number;
}

export interface ReviewCounts {
	all: number;
	played: number;
	mistakes: number;
	plays: number;
	ungraded: number;
}

export interface ReviewTally {
	hands: number;
	/** What the listed findings sum to, when the list is one of findings. */
	evBb: number | null;
}

/** The hero put money in by choice, or bet. */
export const isPlayed = (hand: HandReport): boolean =>
	hand.gradings.some(
		(grading) => grading.chosen !== 'fold' && grading.chosen !== 'check'
	);

/** A hand's mistakes and good plays, in the order they were made. */
export function findingsOf(hand: HandReport): Finding[] {
	const findings: Finding[] = [];
	for (const grading of hand.gradings) {
		if (grading.mistake) {
			findings.push({ grading, kind: 'mistake', evBb: grading.evLostBb });
		} else if (grading.goodPlay) {
			findings.push({ grading, kind: 'play', evBb: grading.goodPlay.evGainedBb });
		}
	}
	return findings;
}

/** The findings that put a hand on the list: those the query is asking for. */
function matching(hand: HandReport, query: ReviewQuery): Finding[] {
	const findings = findingsOf(hand);
	if (query.show === 'plays') return findings.filter(({ kind }) => kind === 'play');
	if (query.show !== 'mistakes') return findings;
	const floor = SEVERITIES.indexOf(query.floor);
	return findings.filter(
		({ grading, kind }) =>
			kind === 'mistake'
			&& SEVERITIES.indexOf(grading.severity) >= floor
			&& (query.street === 'all'
				|| (query.street === 'pre') === (grading.street === 'preflop'))
			&& (query.kind === null || grading.mistake === query.kind)
	);
}

/** The size of a hand's largest finding, among those asked for. */
function impact(hand: HandReport, query: ReviewQuery): number {
	return Math.max(0, ...matching(hand, query).map(({ evBb }) => Math.abs(evBb)));
}

function isListed(hand: HandReport, query: ReviewQuery): boolean {
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
export function listHands(report: AnalysisReport, query: ReviewQuery): HandReport[] {
	const listed = report.hands.filter((hand) => isListed(hand, query));
	if (orderOf(query) === 'time') return listed;
	// Stable, so hands of equal weight (most have none) stay as they were played.
	return listed
		.map((hand) => ({ hand, weight: impact(hand, query) }))
		.sort((a, b) => b.weight - a.weight)
		.map(({ hand }) => hand);
}

/** How many hands each `show` lists, before any narrowing. */
export function countsOf(report: AnalysisReport): ReviewCounts {
	const counts: ReviewCounts = { all: 0, played: 0, mistakes: 0, plays: 0, ungraded: 0 };
	for (const hand of report.hands) {
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
export function tallyOf(listed: readonly HandReport[], query: ReviewQuery): ReviewTally {
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
