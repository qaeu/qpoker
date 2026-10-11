/**
 * The six top-level views, addressed by a URL fragment (`#summary` /
 * `#mistakes` / `#plays` / `#hands` / `#openings` / `#ranges`) rather than an
 * always-mounted tab-panel set, so switching is a real navigation, the view is linkable, and it
 * survives a reload.
 */

import { createSignal, onCleanup, onMount } from 'solid-js';

export const APP_TABS = [
	'summary',
	'mistakes',
	'plays',
	'hands',
	'openings',
	'ranges',
] as const;

export type AppTab = (typeof APP_TABS)[number];

function tabFromHash(hash: string): AppTab {
	const name = hash.replace(/^#/, '');
	return (APP_TABS as readonly string[]).includes(name) ? (name as AppTab) : 'summary';
}

/**
 * A signal wired to `window.location.hash`. Listens for `hashchange` (covers
 * back/forward navigation) and exposes a setter that writes the hash directly
 * -- a plain assignment, not `pushState` -- so back/forward keeps working.
 */
export function createHashRoute(): [() => AppTab, (tab: AppTab) => void] {
	const [tab, setTabSignal] = createSignal<AppTab>(tabFromHash(window.location.hash));

	const onHashChange = () => setTabSignal(tabFromHash(window.location.hash));

	onMount(() => {
		window.addEventListener('hashchange', onHashChange);
		onCleanup(() => window.removeEventListener('hashchange', onHashChange));
	});

	const setTab = (next: AppTab) => {
		window.location.hash = `#${next}`;
	};

	return [tab, setTab];
}
