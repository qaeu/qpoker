/**
 * The four top-level views, addressed by a URL fragment (`#summary` /
 * `#review` / `#openings` / `#ranges`) rather than an always-mounted tab-panel
 * set, so switching is a real navigation, the view is linkable, and it
 * survives a reload. Review carries its whole state after a `?`
 * (`#review?show=mistakes&street=post&hand=5001&step=7`), so a filtered list,
 * the hand being read and the step it is replayed to survive the same things.
 *
 * The keys are written in a fixed order -- `show`, `floor`, `street`, `kind`,
 * `position`, `scenario`, `order`, `hand`, then `step` -- and a default is left
 * out, so one list has one address. `position` and `scenario` scope the list
 * to a seat and a preflop spot whatever `show` is.
 *
 * Ranges carries the chart on show and its stack depth the same way
 * (`#ranges?chart=btnVsCo&depth=mid`), `chart` before `depth`.
 */

import { createSignal, onCleanup, onMount } from 'solid-js';

import { MISTAKES, type MistakeType } from '../coach/mistakes';
import { POSITIONS } from '../history/replay';
import { CHART_IDS } from '../ranges/charts';
import { SCENARIOS } from '../ranges/preflopSpot';
import { DEFAULT_RANGES, RANGE_DEPTHS, type RangesQuery } from '../ui/rangeTables';
import {
	DEFAULT_REVIEW,
	REVIEW_FLOORS,
	REVIEW_ORDERS,
	REVIEW_SHOWS,
	REVIEW_STREETS,
	type ReviewQuery,
	type ReviewShow,
} from '../ui/review';

export const APP_TABS = ['summary', 'review', 'openings', 'ranges'] as const;

export type AppTab = (typeof APP_TABS)[number];

export interface Route {
	tab: AppTab;
	review: ReviewQuery;
	ranges: RangesQuery;
}

/** What `navigate` takes: only what is to change. */
export interface RouteChange {
	tab?: AppTab;
	review?: Partial<ReviewQuery>;
	ranges?: Partial<RangesQuery>;
}

export interface NavigateOptions {
	/** Rewrite the current history entry instead of adding one. */
	replace?: boolean;
}

/** The three views Review replaced, so an old link still lands somewhere. */
const LEGACY_TABS: Record<string, ReviewShow> = {
	mistakes: 'mistakes',
	plays: 'plays',
	hands: 'all',
};

/** The order Review's keys are written in; `step` follows them. */
const ROUTE_KEYS = [
	'show',
	'floor',
	'street',
	'kind',
	'position',
	'scenario',
	'order',
	'hand',
] as const;

function oneOf<T extends string>(options: readonly T[], value: string | null): T | null {
	return (options as readonly string[]).includes(value ?? '') ? (value as T) : null;
}

/** Reads a fragment, dropping anything it does not recognise. */
export function parseRoute(hash: string): Route {
	const [name, search = ''] = hash.replace(/^#/, '').split('?');
	const legacy = Object.hasOwn(LEGACY_TABS, name) ? LEGACY_TABS[name] : null;
	const tab = legacy ? 'review' : (oneOf(APP_TABS, name) ?? 'summary');
	const params = new URLSearchParams(search);
	if (tab === 'ranges') {
		return {
			tab,
			review: DEFAULT_REVIEW,
			ranges: {
				chart: oneOf(CHART_IDS, params.get('chart')) ?? DEFAULT_RANGES.chart,
				depth: oneOf(RANGE_DEPTHS, params.get('depth')) ?? DEFAULT_RANGES.depth,
			},
		};
	}
	if (tab !== 'review') return { tab, review: DEFAULT_REVIEW, ranges: DEFAULT_RANGES };

	const kind = params.get('kind');
	// A `+` typed into the address bar arrives as a space: `UTG+1` is meant.
	const position = params.get('position')?.replace(/ /g, '+') ?? null;
	const hand = params.get('hand') || null;
	const step = params.get('step') ?? '';
	return {
		tab,
		ranges: DEFAULT_RANGES,
		review: {
			show: legacy ?? oneOf(REVIEW_SHOWS, params.get('show')) ?? DEFAULT_REVIEW.show,
			floor: oneOf(REVIEW_FLOORS, params.get('floor')) ?? DEFAULT_REVIEW.floor,
			street: oneOf(REVIEW_STREETS, params.get('street')) ?? DEFAULT_REVIEW.street,
			kind: kind !== null && Object.hasOwn(MISTAKES, kind) ? (kind as MistakeType) : null,
			position: oneOf(POSITIONS, position),
			scenario: oneOf(SCENARIOS, params.get('scenario')),
			order: oneOf(REVIEW_ORDERS, params.get('order')),
			hand,
			// A step belongs to a hand: without one there is nothing to be a step of.
			step: hand !== null && /^\d+$/.test(step) ? Number(step) : null,
		},
	};
}

/** The canonical fragment for a route: defaults are left out. */
export function formatRoute(route: Route): string {
	const params = new URLSearchParams();
	if (route.tab === 'ranges') {
		const { chart, depth } = route.ranges;
		if (chart !== DEFAULT_RANGES.chart) params.set('chart', chart);
		if (depth !== DEFAULT_RANGES.depth) params.set('depth', depth);
		const search = params.toString();
		return search ? `#ranges?${search}` : '#ranges';
	}
	if (route.tab !== 'review') return `#${route.tab}`;
	const { review } = route;
	for (const key of ROUTE_KEYS) {
		const value = review[key];
		if (value !== null && value !== DEFAULT_REVIEW[key]) params.set(key, value);
	}
	if (review.hand !== null && review.step !== null) {
		params.set('step', String(review.step));
	}
	const search = params.toString();
	return search ? `#review?${search}` : '#review';
}

/** The address of a Review list: what a link to it from another view points at. */
export function reviewHref(change: Partial<ReviewQuery>): string {
	return formatRoute({
		tab: 'review',
		review: { ...DEFAULT_REVIEW, ...change },
		ranges: DEFAULT_RANGES,
	});
}

/**
 * A signal wired to `window.location.hash`. Listens for `hashchange` (covers
 * back/forward navigation) and exposes `navigate`, which merges a change into
 * the current route and writes the hash -- a plain assignment, not
 * `pushState`, so back/forward keeps working.
 */
export function createHashRoute(): [
	() => Route,
	(change: RouteChange, options?: NavigateOptions) => void,
] {
	const [route, setRoute] = createSignal<Route>(parseRoute(window.location.hash), {
		equals: (a, b) => formatRoute(a) === formatRoute(b),
	});

	const rewrite = (hash: string) => window.history.replaceState(null, '', hash);

	/** Takes the route from the address bar, and tidies an old or sloppy fragment. */
	const sync = () => {
		const parsed = parseRoute(window.location.hash);
		const canonical = formatRoute(parsed);
		if (window.location.hash && window.location.hash !== canonical) rewrite(canonical);
		setRoute(parsed);
	};

	onMount(() => {
		sync();
		window.addEventListener('hashchange', sync);
		onCleanup(() => window.removeEventListener('hashchange', sync));
	});

	const navigate = (change: RouteChange, options: NavigateOptions = {}) => {
		const current = route();
		const next: Route = {
			tab: change.tab ?? current.tab,
			review: { ...current.review, ...change.review },
			ranges: { ...current.ranges, ...change.ranges },
		};
		const hash = formatRoute(next);
		if (options.replace) rewrite(hash);
		else window.location.hash = hash;
		setRoute(parseRoute(hash));
	};

	return [route, navigate];
}
