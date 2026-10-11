import { describe, expect, it, vi } from 'vitest';
import { createSignal } from 'solid-js';
import { fireEvent, render, screen, within } from '@solidjs/testing-library';

import ReviewView from '#c/review/ReviewView';
import { analyzeLog } from '#utils/coach/report';
import { DEFAULT_REVIEW, listHands, type ReviewQuery } from '#utils/ui/review';

import { TWO_HAND_LOG } from '../../integration/appHarness';
import {
	handText,
	RIVER_HERO_CALL,
	TOUGH_FOLD,
	UNRECONCILED,
} from '../../utils/history/handText';

// In the order played: 5001 folds aces, 5002 opens ace-king, 6001 is a good
// play, 7001 a postflop blunder, 7002 does not reconcile.
const report = analyzeLog(
	[TWO_HAND_LOG, ...[TOUGH_FOLD, RIVER_HERO_CALL, UNRECONCILED].map(handText)].join('\n')
);
const numberOf = (id: string) => report.hands.findIndex((hand) => hand.id === id) + 1;

/** Mounts the view over a query that takes every change, as the route does. */
function mount(initial: Partial<ReviewQuery> = {}, log = report) {
	const [query, setQuery] = createSignal<ReviewQuery>({ ...DEFAULT_REVIEW, ...initial });
	const onQuery = vi.fn(
		(change: Partial<ReviewQuery>, options?: { replace?: boolean }) => {
			void options;
			setQuery((current) => ({ ...current, ...change }));
		}
	);
	const view = render(() => (
		<ReviewView report={log} query={query()} onQuery={onQuery} />
	));
	return { query, onQuery, ...view };
}

type Group = 'Show' | 'Severity' | 'Street' | 'Order';

/** Two groups have an "All", so a key is always asked for by its group. */
const radio = (name: string | RegExp, group: Group = 'Show') =>
	within(screen.getByRole('radiogroup', { name: group })).getByRole<HTMLInputElement>(
		'radio',
		{ name }
	);

/** Ark's machine takes a pick on the next microtask. */
async function pick(name: string | RegExp, group: Group = 'Show'): Promise<void> {
	fireEvent.click(radio(name, group));
	await Promise.resolve();
}

const rows = () =>
	within(screen.getByRole('list', { name: 'Hands' }))
		.getAllByRole('button')
		.map((row) => row.getAttribute('aria-label'));

const heading = () => screen.getByRole('heading', { level: 2 }).textContent;

/** The hand's own buttons: the bar above it repeats them for a narrow screen. */
const step = (name: 'Previous' | 'Next') =>
	screen.getByRole<HTMLButtonElement>('button', { name: `${name} hand in the list` });

describe('ReviewView', () => {
	describe('the list', () => {
		it('lists the hands with a mistake, the biggest first, and what they cost', () => {
			mount();
			const expected = listHands(report, DEFAULT_REVIEW);
			expect(rows()).toHaveLength(expected.length);
			expect(rows()[0]).toMatch(new RegExp(`^Hand ${numberOf(expected[0].id)},`));
			expect(screen.getByRole('status').textContent).toMatch(
				new RegExp(`^${expected.length} hands · −\\d+\\.\\dbb estimated$`)
			);
		});

		it('prints a line for each finding in a hand', () => {
			mount({ show: 'all' });
			const row = screen.getByRole('button', { name: /^Hand 1, As Ad/ });
			expect(row.getAttribute('aria-label')).toBe(
				'Hand 1, As Ad, Folded a standard open'
			);
			expect(within(row).getByText('blunder')).toBeTruthy();
			expect(within(row).getByText('Folded a standard open')).toBeTruthy();
			const quiet = screen.getByRole('button', { name: 'Hand 2, Ah Kd' });
			expect(quiet.querySelector('.review-row__finding')).toBeNull();
		});

		it('says so when a hand was not graded', () => {
			mount({ show: 'ungraded' });
			expect(rows()).toEqual(['Hand 5, Kh Kd']);
			expect(screen.getByText('not graded')).toBeTruthy();
			expect(screen.getByRole('status').textContent).toBe('1 hand');
		});

		it('counts each list on its key', () => {
			mount();
			expect(radio(/^All/).closest('label')!.textContent).toBe('All5');
			expect(radio(/^Played/).closest('label')!.textContent).toBe('Played3');
			expect(radio(/^Good plays/).closest('label')!.textContent).toBe('Good plays1');
		});
	});

	describe('the filters', () => {
		it('offers severity and street only for mistakes', async () => {
			mount();
			expect(screen.getByRole('radiogroup', { name: 'Severity' })).toBeTruthy();
			expect(screen.getByRole('radiogroup', { name: 'Street' })).toBeTruthy();

			await pick(/^All/);
			expect(screen.queryByRole('radiogroup', { name: 'Severity' })).toBeNull();
			expect(screen.queryByRole('radiogroup', { name: 'Street' })).toBeNull();
			expect(rows()).toHaveLength(5);
		});

		it('starts a list over when what it shows changes', async () => {
			const { onQuery } = mount({ kind: 'open-tight', order: 'time', hand: '5001' });
			await pick(/^Played/);
			expect(onQuery).toHaveBeenLastCalledWith({
				show: 'played',
				kind: null,
				order: null,
				hand: null,
			});
		});

		it('narrows by street', async () => {
			mount();
			await pick('Postflop', 'Street');
			expect(rows()).toEqual([expect.stringMatching(/^Hand 4, 5h 4h/)]);
			expect(screen.getByRole('status').textContent).toMatch(/^1 hand · −/);
		});

		it('orders findings biggest first until told otherwise', async () => {
			mount();
			expect(radio('Biggest first', 'Order').checked).toBe(true);
			await pick('As played', 'Order');
			const numbers = rows().map((label) => Number(/^Hand (\d+)/.exec(label!)![1]));
			expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
		});

		it('orders a plain list as played', () => {
			mount({ show: 'all' });
			expect(radio('As played', 'Order').checked).toBe(true);
		});

		describe('a kind of mistake', () => {
			it('shows as a chip that takes the filter off', () => {
				const { onQuery } = mount({ kind: 'call-without-odds' });
				expect(rows()).toHaveLength(1);
				fireEvent.click(
					screen.getByRole('button', {
						name: 'Stop filtering by: Called without the price',
					})
				);
				expect(onQuery).toHaveBeenLastCalledWith({ kind: null, hand: null });
				expect(screen.queryByRole('button', { name: /^Stop filtering by/ })).toBeNull();
				expect(rows().length).toBeGreaterThan(1);
			});

			it('has no chip when there is no such filter', () => {
				mount();
				expect(screen.queryByRole('button', { name: /^Stop filtering by/ })).toBeNull();
			});
		});

		describe('hands that were not graded', () => {
			it('are offered when there are any', () => {
				mount();
				expect(radio(/^Not graded/).closest('label')!.textContent).toBe('Not graded1');
			});

			it('are not offered when every hand was graded', () => {
				mount({}, analyzeLog(TWO_HAND_LOG));
				expect(screen.queryByRole('radio', { name: /^Not graded/ })).toBeNull();
			});
		});

		describe('with nothing to list', () => {
			it('says the filter is empty', () => {
				mount({ kind: 'bb-overdefend' });
				expect(screen.getByText('Nothing to show at this filter.')).toBeTruthy();
				expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
				expect(screen.getByRole('status').textContent).toBe('0 hands · 0.0bb estimated');
			});

			it('says what a log without good plays does not mean', () => {
				mount({ show: 'plays' }, analyzeLog(TWO_HAND_LOG));
				expect(screen.getByText(/No good plays were picked out/)).toBeTruthy();
			});
		});
	});

	describe('the hand', () => {
		it('opens on the first hand listed', () => {
			const { container } = mount({ show: 'all' });
			expect(heading()).toBe('Hand 1 of 5');
			expect(
				screen.getByRole('button', { name: /^Hand 1,/ }).getAttribute('aria-current')
			).toBe('true');
			// Nothing in the route yet, so a narrow screen is still on the list.
			expect(container.querySelector('.review-view.has-hand')).toBeNull();
		});

		it('opens the hand the query names', () => {
			const { container } = mount({ show: 'all', hand: '6001' });
			expect(heading()).toBe('Hand 3 of 5');
			expect(container.querySelector('.review-view.has-hand')).toBeTruthy();
			expect(
				screen.getByRole('navigation', { name: 'The list this hand is from' }).textContent
			).toContain('All · 3 of 5');
		});

		it('opens a row that is clicked', () => {
			const { onQuery } = mount({ show: 'all' });
			fireEvent.click(screen.getByRole('button', { name: /^Hand 2,/ }));
			expect(onQuery).toHaveBeenLastCalledWith({ hand: '5002' });
			expect(heading()).toBe('Hand 2 of 5');
		});

		it('goes back to the list', () => {
			const { onQuery } = mount({ show: 'all', hand: '6001' });
			fireEvent.click(screen.getByRole('button', { name: /^All · 3 of 5/ }));
			expect(onQuery).toHaveBeenLastCalledWith({ hand: null });
		});

		it('still opens a hand the list has filtered out', () => {
			mount({ show: 'plays', hand: '5002' });
			expect(heading()).toBe('Hand 2 of 5');
			expect(step('Previous').disabled).toBe(true);
			fireEvent.click(step('Next'));
			expect(heading()).toBe('Hand 3 of 5');
		});

		describe('stepping', () => {
			it('walks the list with Prev and Next, and stops at its ends', () => {
				const { onQuery } = mount({ show: 'all' });
				expect(step('Previous').disabled).toBe(true);

				fireEvent.click(step('Next'));
				expect(onQuery).toHaveBeenLastCalledWith({ hand: '5002' }, { replace: true });
				expect(heading()).toBe('Hand 2 of 5');

				fireEvent.click(step('Previous'));
				expect(heading()).toBe('Hand 1 of 5');
			});

			it('stops at the last hand', () => {
				mount({ show: 'all', hand: '7002' });
				expect(step('Next').disabled).toBe(true);
				expect(step('Previous').disabled).toBe(false);
			});

			it('follows the list as it is ordered, not the log', () => {
				mount();
				const [first, second] = listHands(report, DEFAULT_REVIEW);
				expect(heading()).toBe(`Hand ${numberOf(first.id)} of 5`);
				fireEvent.click(step('Next'));
				expect(heading()).toBe(`Hand ${numberOf(second.id)} of 5`);
			});

			it('takes J and K', () => {
				mount({ show: 'all' });
				fireEvent.keyDown(window, { key: 'j' });
				fireEvent.keyDown(window, { key: 'J' });
				expect(heading()).toBe('Hand 3 of 5');
				fireEvent.keyDown(window, { key: 'k' });
				expect(heading()).toBe('Hand 2 of 5');
			});

			it('leaves the keys alone with a modifier, or at the end of the list', () => {
				const { onQuery } = mount({ show: 'all' });
				fireEvent.keyDown(window, { key: 'j', ctrlKey: true });
				fireEvent.keyDown(window, { key: 'k' });
				expect(onQuery).not.toHaveBeenCalled();
			});

			it('stops listening once it is gone', () => {
				const { onQuery, unmount } = mount({ show: 'all' });
				unmount();
				fireEvent.keyDown(window, { key: 'j' });
				expect(onQuery).not.toHaveBeenCalled();
			});
		});
	});
});
