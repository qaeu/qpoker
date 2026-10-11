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

/** The URL hash outlives a test, and with it the view the next one opens on. */
export function resetBrowserState(): void {
	window.location.hash = '';
}

export function mountApp(): void {
	render(() => <App />);
}

/** Picks `text` as the hand-history file, as the file dialog would. */
export function loadLog(text: string, name = 'hands.txt'): void {
	const input = screen.getByLabelText('Hand history file');
	const file = new File([text], name, { type: 'text/plain' });
	fireEvent.change(input, { target: { files: [file] } });
}

export async function switchTo(
	tab: 'Summary' | 'Review' | 'Openings' | 'Ranges'
): Promise<void> {
	fireEvent.click(screen.getByRole('tab', { name: tab }));
	await settle();
}

/** Follows a link, or a hash typed into the address bar. */
export async function goTo(hash: string): Promise<void> {
	window.location.hash = hash;
	await settle();
}

/** The route is the URL hash, and jsdom delivers `hashchange` asynchronously. */
export function settle(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}
