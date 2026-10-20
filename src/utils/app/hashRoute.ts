/**
 * The top-level views, addressed by a URL fragment (`#summary` / `#review` /
 * `#openings` / `#trends` / `#players` / `#ranges` / `#train`) rather than an always-mounted tab-panel
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
 *
 * Train is the plain `#train`: its drill is a stored preference, a running
 * drill is not addressable, and it is over no hands, so it carries no scope.
 *
 * Every other view carries the scope -- which of the library's hands the report is
 * over -- as `scope`, written first and left out when it is every hand
 * (`#summary?scope=latest`). Players carries the player being read as `name`.
 */

import { createSignal, onCleanup, onMount } from 'solid-js';

import { MISTAKES, type MistakeType } from '../coach/mistakes';
import { DEFAULT_SCOPE, isTimestamp, SCOPE_PRESETS, type Scope } from '../coach/sessions';
import { POSITIONS } from '../history/replay';
import { SCENARIOS } from '../ranges/preflopSpot';
import {
	DEFAULT_RANGES,
	RANGE_DEPTHS,
	TABLE_IDS,
	type RangesQuery,
} from '../ui/rangeTables';
import {
	DEFAULT_REVIEW,
	REVIEW_FLOORS,
	REVIEW_ORDERS,
	REVIEW_SHOWS,
	REVIEW_STREETS,
	type ReviewQuery,
	type ReviewShow,
} from '../ui/review';

export const APP_TABS = [
	'summary',
	'review',
	'openings',
	'trends',
	'players',
	'ranges',
	'train',
] as const;

export type AppTab = (typeof APP_TABS)[number];

export interface Route {
	tab: AppTab;
	review: ReviewQuery;
	ranges: RangesQuery;
	/** Which hands the report is over. Absent for all of them. */
	scope?: Scope;
	/** The player being read in Players. Absent for none. */
	player?: string;
}

/** What `navigate` takes: only what is to change. */
export interface RouteChange {
	tab?: AppTab;
	review?: Partial<ReviewQuery>;
	ranges?: Partial<RangesQuery>;
	scope?: Scope;
	/** Null to stop reading a player. */
	player?: string | null;
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

/** The scope and the player of a fragment: what it carries whatever the view. */
function sharedOf(tab: AppTab, params: URLSearchParams): Pick<Route, 'scope' | 'player'> {
	const scope = params.get('scope') ?? '';
	if (tab === 'train') return {};
	const player = tab === 'players' ? params.get('name') : null;
	const named = oneOf(SCOPE_PRESETS, scope) ?? (isTimestamp(scope) ? scope : null);
	return {
		...(named !== null && named !== DEFAULT_SCOPE ? { scope: named } : {}),
		...(player ? { player } : {}),
	};
}

/** Reads a fragment, dropping anything it does not recognise. */
export function parseRoute(hash: string): Route {
	const [name, search = ''] = hash.replace(/^#/, '').split('?');
	const legacy = Object.hasOwn(LEGACY_TABS, name) ? LEGACY_TABS[name] : null;
	const tab = legacy ? 'review' : (oneOf(APP_TABS, name) ?? 'summary');
	const params = new URLSearchParams(search);
	const shared = sharedOf(tab, params);
	if (tab === 'ranges') {
		return {
			...shared,
			tab,
			review: DEFAULT_REVIEW,
			ranges: {
				chart: oneOf(TABLE_IDS, params.get('chart')) ?? DEFAULT_RANGES.chart,
				depth: oneOf(RANGE_DEPTHS, params.get('depth')) ?? DEFAULT_RANGES.depth,
			},
		};
	}
	if (tab !== 'review') {
		return { ...shared, tab, review: DEFAULT_REVIEW, ranges: DEFAULT_RANGES };
	}

	const kind = params.get('kind');
	// A `+` typed into the address bar arrives as a space: `UTG+1` is meant.
	const position = params.get('position')?.replace(/ /g, '+') ?? null;
	const hand = params.get('hand') || null;
	const step = params.get('step') ?? '';
	return {
		...shared,
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
	if (route.tab === 'train') return '#train';
	if (route.scope && route.scope !== DEFAULT_SCOPE) params.set('scope', route.scope);
	if (route.tab === 'ranges') {
		const { chart, depth } = route.ranges;
		if (chart !== DEFAULT_RANGES.chart) params.set('chart', chart);
		if (depth !== DEFAULT_RANGES.depth) params.set('depth', depth);
	} else if (route.tab === 'players') {
		if (route.player) params.set('name', route.player);
	} else if (route.tab === 'review') {
		const { review } = route;
		for (const key of ROUTE_KEYS) {
			const value = review[key];
			if (value !== null && value !== DEFAULT_REVIEW[key]) params.set(key, value);
		}
		if (review.hand !== null && review.step !== null) {
			params.set('step', String(review.step));
		}
	}
	const search = params.toString();
	return search ? `#${route.tab}?${search}` : `#${route.tab}`;
}

/** The address of a Review list: what a link to it from another view points at. */
export function reviewHref(change: Partial<ReviewQuery>, scope?: Scope): string {
	return formatRoute({
		tab: 'review',
		review: { ...DEFAULT_REVIEW, ...change },
		ranges: DEFAULT_RANGES,
		scope,
	});
}

/** The address of a player's profile. */
export function playerHref(name: string): string {
	return formatRoute({
		tab: 'players',
		review: DEFAULT_REVIEW,
		ranges: DEFAULT_RANGES,
		player: name,
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
		const player = change.player === undefined ? current.player : change.player;
		const next: Route = {
			tab: change.tab ?? current.tab,
			review: { ...current.review, ...change.review },
			ranges: { ...current.ranges, ...change.ranges },
			scope: change.scope ?? current.scope,
			...(player ? { player } : {}),
		};
		const hash = formatRoute(next);
		if (options.replace) rewrite(hash);
		else window.location.hash = hash;
		setRoute(parseRoute(hash));
	};

	return [route, navigate];
}
