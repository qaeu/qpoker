/**
 * What the integration tests share: mounting the whole app, feeding it a log
 * the way a user would, and putting the browser state back afterwards.
 */

import { fireEvent, render, screen } from '@solidjs/testing-library';

import App from '#App';

import { BLINDS_HERO_UTG, handText } from '../utils/history/handText';

/** Long enough for a run through the stubbed worker's chunked loop. */
export const RUN_TIMEOUT_MS = 20_000;

const folds = (...names: string[]) => names.map((name) => `${name}: folds`);

/** Two hands: the hero folds aces under the gun, then opens ace-king. */
export const TWO_HAND_LOG = [
	handText({
		id: 5001,
		heroCards: 'As Ad',
		button: 4,
		lines: [
			...BLINDS_HERO_UTG,
			'*** HOLE CARDS ***',
			...folds('hero', 'p2', 'p3', 'p4', 'p5'),
			'Uncalled bet ($0.05) returned to p6',
			'p6 collected $0.10 from pot',
		],
		pot: '0.10',
		winner: 'p6',
	}),
	handText({
		id: 5002,
		heroCards: 'Ah Kd',
		button: 4,
		lines: [
			...BLINDS_HERO_UTG,
			'*** HOLE CARDS ***',
			'hero: raises $0.15 to $0.25',
			...folds('p2', 'p3', 'p4', 'p5', 'p6'),
			'Uncalled bet ($0.15) returned to hero',
			'hero collected $0.25 from pot',
		],
		pot: '0.25',
		winner: 'hero',
	}),
].join('\n');

/** Returns the way to take the app down again, as closing the tab would. */
export function mountApp(): () => void {
	return render(() => <App />).unmount;
}

/** Picks several files together, as the file dialog or a drop would. */
export function loadLogs(...logs: { text: string; name: string }[]): void {
	const input = screen.getByLabelText('Hand history files');
	const files = logs.map(
		({ text, name }) => new File([text], name, { type: 'text/plain' })
	);
	fireEvent.change(input, { target: { files } });
}

/** Picks `text` as the hand-history file, as the file dialog would. */
export function loadLog(text: string, name = 'hands.txt'): void {
	loadLogs({ text, name });
}

export async function switchTo(
	tab: 'Summary' | 'Review' | 'Openings' | 'Trends' | 'Players' | 'Ranges'
): Promise<void> {
	fireEvent.click(screen.getByRole('tab', { name: tab }));
	await settle();
}

/**
 * Resolves once the app has heard of the hash `change` sets. jsdom both follows
 * a link and delivers `hashchange` on later tasks, so there is nothing to poll:
 * `change` must really move the hash, or this never resolves.
 */
function hashChange(change: () => void): Promise<void> {
	// Added after the app's own listener, so it runs after the route has moved.
	const heard = new Promise<void>((resolve) =>
		window.addEventListener('hashchange', () => resolve(), { once: true })
	);
	change();
	return heard;
}

/**
 * The URL hash outlives a test, and with it the view the next one opens on.
 * Waits for the `hashchange` of clearing it, which the next test's first
 * navigation would otherwise take for its own.
 */
export function resetBrowserState(): Promise<void> {
	if (window.location.hash === '') return Promise.resolve();
	return hashChange(() => {
		window.location.hash = '';
	});
}

/** A hash typed into the address bar: one other than the current one. */
export function goTo(hash: string): Promise<void> {
	return hashChange(() => {
		window.location.hash = hash;
	});
}

/** Clicks a link in the page and waits for the view it leads to. */
export function follow(link: HTMLElement): Promise<void> {
	return hashChange(() => fireEvent.click(link));
}

/** A tick, for a control that takes a click on the next one. */
export function settle(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}
