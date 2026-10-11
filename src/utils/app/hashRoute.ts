/**
 * The four top-level views, addressed by a URL fragment (`#summary` /
 * `#review` / `#openings` / `#ranges`) rather than an always-mounted tab-panel
 * set, so switching is a real navigation, the view is linkable, and it
 * survives a reload. Review carries its whole state after a `?`
 * (`#review?show=mistakes&street=post&hand=5001`), so a filtered list and the
 * hand being read survive the same things.
 */

import { createSignal, onCleanup, onMount } from 'solid-js';

import { MISTAKES, type MistakeType } from '../coach/mistakes';
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
}

/** What `navigate` takes: only what is to change. */
export interface RouteChange {
	tab?: AppTab;
	review?: Partial<ReviewQuery>;
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

function oneOf<T extends string>(options: readonly T[], value: string | null): T | null {
	return (options as readonly string[]).includes(value ?? '') ? (value as T) : null;
}

/** Reads a fragment, dropping anything it does not recognise. */
export function parseRoute(hash: string): Route {
	const [name, search = ''] = hash.replace(/^#/, '').split('?');
	const legacy = Object.hasOwn(LEGACY_TABS, name) ? LEGACY_TABS[name] : null;
	const tab = legacy ? 'review' : (oneOf(APP_TABS, name) ?? 'summary');
	if (tab !== 'review') return { tab, review: DEFAULT_REVIEW };

	const params = new URLSearchParams(search);
	const kind = params.get('kind');
	return {
		tab,
		review: {
			show: legacy ?? oneOf(REVIEW_SHOWS, params.get('show')) ?? DEFAULT_REVIEW.show,
			floor: oneOf(REVIEW_FLOORS, params.get('floor')) ?? DEFAULT_REVIEW.floor,
			street: oneOf(REVIEW_STREETS, params.get('street')) ?? DEFAULT_REVIEW.street,
			kind: kind !== null && Object.hasOwn(MISTAKES, kind) ? (kind as MistakeType) : null,
			order: oneOf(REVIEW_ORDERS, params.get('order')),
			hand: params.get('hand') || null,
		},
	};
}

/** The canonical fragment for a route: defaults are left out. */
export function formatRoute(route: Route): string {
	if (route.tab !== 'review') return `#${route.tab}`;
	const params = new URLSearchParams();
	const { review } = route;
	for (const key of ['show', 'floor', 'street', 'kind', 'order', 'hand'] as const) {
		const value = review[key];
		if (value !== null && value !== DEFAULT_REVIEW[key]) params.set(key, value);
	}
	const search = params.toString();
	return search ? `#review?${search}` : '#review';
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
		};
		const hash = formatRoute(next);
		if (options.replace) rewrite(hash);
		else window.location.hash = hash;
		setRoute(parseRoute(hash));
	};

	return [route, navigate];
}
