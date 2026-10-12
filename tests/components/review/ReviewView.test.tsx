import { describe, expect, it, vi } from 'vitest';
import { createSignal } from 'solid-js';
import { cleanup, fireEvent, render, screen, within } from '@solidjs/testing-library';

import ReviewView from '#c/review/ReviewView';
import { analyzeLog } from '#utils/coach/report';
import { DEFAULT_REVIEW, listHands, type ReviewQuery } from '#utils/ui/review';
import { defaultStep, tableSteps } from '#utils/ui/tableReplay';

import { TWO_HAND_LOG } from '../../integration/appHarness';
import {
	handText,
	RIVER_HERO_CALL,
	TOUGH_FOLD,
	UNRECONCILED,
} from '../../utils/history/handText';

// Oldest first: 5001 folds aces, 5002 opens ace-king, 6001 is a good
// play, 7001 a postflop blunder, 7002 does not reconcile.
const report = analyzeLog(
	[TWO_HAND_LOG, ...[TOUGH_FOLD, RIVER_HERO_CALL, UNRECONCILED].map(handText)].join('\n')
);
const MISTAKES: ReviewQuery = { ...DEFAULT_REVIEW, show: 'mistakes' };
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
		<ReviewView
			report={log}
			detailOf={(id) => log.hands.find((hand) => hand.id === id) ?? null}
			query={query()}
			onQuery={onQuery}
		/>
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
		it('lists every hand by default, the latest first', () => {
			mount();
			expect(radio(/^All/).checked).toBe(true);
			expect(rows().map((label) => /^Hand \d+/.exec(label!)![0])).toEqual([
				'Hand 5',
				'Hand 4',
				'Hand 3',
				'Hand 2',
				'Hand 1',
			]);
			expect(screen.getByRole('status').textContent).toBe('5 hands');
		});

		it('lists the hands with a mistake, the biggest first, and what they cost', () => {
			mount(MISTAKES);
			const expected = listHands(report, MISTAKES);
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
			mount(MISTAKES);
			expect(screen.getByRole('radiogroup', { name: 'Severity' })).toBeTruthy();
			expect(screen.getByRole('radiogroup', { name: 'Street' })).toBeTruthy();

			await pick(/^All/);
			expect(screen.queryByRole('radiogroup', { name: 'Severity' })).toBeNull();
			expect(screen.queryByRole('radiogroup', { name: 'Street' })).toBeNull();
			expect(rows()).toHaveLength(5);
		});

		it('starts a list over when what it shows changes', async () => {
			const { onQuery } = mount({
				...MISTAKES,
				kind: 'open-tight',
				order: 'time',
				hand: '5001',
			});
			await pick(/^Played/);
			expect(onQuery).toHaveBeenLastCalledWith({
				show: 'played',
				kind: null,
				order: null,
				hand: null,
				step: null,
			});
		});

		it('narrows by street', async () => {
			mount(MISTAKES);
			await pick('Postflop', 'Street');
			expect(rows()).toEqual([expect.stringMatching(/^Hand 4, 5h 4h/)]);
			expect(screen.getByRole('status').textContent).toMatch(/^1 hand · −/);
		});

		it('orders findings biggest first until told otherwise', async () => {
			mount(MISTAKES);
			expect(radio('Biggest first', 'Order').checked).toBe(true);
			await pick('As played', 'Order');
			const numbers = rows().map((label) => Number(/^Hand (\d+)/.exec(label!)![1]));
			expect(numbers).toEqual([...numbers].sort((a, b) => b - a));
		});

		it('orders a plain list as played', () => {
			mount();
			expect(radio('As played', 'Order').checked).toBe(true);
		});

		describe('a kind of mistake', () => {
			it('shows as a chip that takes the filter off', () => {
				const { onQuery } = mount({ ...MISTAKES, kind: 'call-without-odds' });
				expect(rows()).toHaveLength(1);
				fireEvent.click(
					screen.getByRole('button', {
						name: 'Stop filtering by: Called without the price',
					})
				);
				expect(onQuery).toHaveBeenLastCalledWith({ kind: null, hand: null, step: null });
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
				mount({ ...MISTAKES, kind: 'bb-overdefend' });
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

	describe('position and spot', () => {
		const select = (name: 'Position' | 'Preflop spot') =>
			screen.getByRole<HTMLSelectElement>('combobox', { name });
		const choices = (name: 'Position' | 'Preflop spot') =>
			[...select(name).options].map((option) => option.textContent);
		const choose = (name: 'Position' | 'Preflop spot', value: string) =>
			fireEvent.change(select(name), { target: { value } });

		it('offers the seats and spots in the log, with their hands', () => {
			mount({ show: 'all' });
			expect(choices('Position')).toEqual(['All', 'UTG · 4', 'SB · 1']);
			expect(choices('Preflop spot')).toEqual([
				'All',
				'First in · 4',
				'Facing a 3-bet · 1',
				'Facing a 5-bet · 1',
			]);
			expect(select('Position').value).toBe('');
		});

		it('cuts the list to a seat, and says so in the query', () => {
			const { onQuery, query } = mount({ show: 'all', hand: '5001' });
			choose('Position', 'SB');
			expect(onQuery).toHaveBeenLastCalledWith({
				position: 'SB',
				hand: null,
				step: null,
			});
			expect(query().position).toBe('SB');
			expect(rows()).toHaveLength(1);
			expect(rows()[0]).toMatch(new RegExp(`^Hand ${numberOf('7001')},`));
			expect(screen.getByRole('status').textContent).toBe('1 hand');
		});

		it('cuts it to a preflop spot, and back with All', () => {
			const { query } = mount({ show: 'all' });
			choose('Preflop spot', 'vs3bet');
			expect(query().scenario).toBe('vs3bet');
			expect(rows()).toHaveLength(1);
			choose('Preflop spot', '');
			expect(query().scenario).toBeNull();
			expect(rows()).toHaveLength(report.hands.length);
		});

		it('counts each Show key within the seat chosen', () => {
			mount({ show: 'all', position: 'SB' });
			expect(radio(/^All/).closest('.segmented__item')!.textContent).toBe('All1');
			expect(radio(/^Good plays/).closest('.segmented__item')!.textContent).toBe(
				'Good plays0'
			);
		});

		it('counts each menu within the other', () => {
			mount({ show: 'all', position: 'SB' });
			expect(choices('Preflop spot')).toEqual(['All', 'First in · 1']);
		});

		it('is kept when what is on show changes', async () => {
			const { query } = mount({ show: 'all', position: 'UTG', scenario: 'rfi' });
			await pick(/^Mistakes/);
			expect(query()).toMatchObject({
				show: 'mistakes',
				position: 'UTG',
				scenario: 'rfi',
			});
			expect(select('Position').value).toBe('UTG');
		});

		it('leaves the J and K keys alone while a menu has the focus', () => {
			const { onQuery } = mount({ show: 'all' });
			onQuery.mockClear();
			fireEvent.keyDown(select('Position'), { key: 'j' });
			expect(onQuery).not.toHaveBeenCalled();
		});
	});

	describe('the hand', () => {
		it('opens on the first hand listed', () => {
			const { container } = mount();
			expect(heading()).toBe('Hand 5 of 5');
			expect(
				screen.getByRole('button', { name: /^Hand 5,/ }).getAttribute('aria-current')
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
			expect(onQuery).toHaveBeenLastCalledWith({ hand: '5002', step: null });
			expect(heading()).toBe('Hand 2 of 5');
		});

		it('goes back to the list', () => {
			const { onQuery } = mount({ show: 'all', hand: '6001' });
			fireEvent.click(screen.getByRole('button', { name: /^All · 3 of 5/ }));
			expect(onQuery).toHaveBeenLastCalledWith({ hand: null, step: null });
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
				expect(onQuery).toHaveBeenLastCalledWith(
					{ hand: '7001', step: null },
					{ replace: true }
				);
				expect(heading()).toBe('Hand 4 of 5');

				fireEvent.click(step('Previous'));
				expect(heading()).toBe('Hand 5 of 5');
			});

			it('stops at the last hand', () => {
				mount({ show: 'all', hand: '5001' });
				expect(step('Next').disabled).toBe(true);
				expect(step('Previous').disabled).toBe(false);
			});

			it('follows the list as it is ordered, not the log', () => {
				mount(MISTAKES);
				const [first, second] = listHands(report, MISTAKES);
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
				expect(heading()).toBe('Hand 4 of 5');
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

		describe('stepping through the hand', () => {
			// 7001 opens on its river call, the hand's one mistake.
			const opensAt = () => {
				const hand = report.hands.find(({ id }) => id === '7001')!;
				const steps = tableSteps(hand);
				return { at: defaultStep(steps, hand), last: steps.length - 1 };
			};

			it('takes the arrow keys, rewriting the entry and naming the hand', () => {
				const { onQuery, query } = mount({ show: 'all', hand: '7001' });
				const { at } = opensAt();
				fireEvent.keyDown(window, { key: 'ArrowLeft' });
				expect(onQuery).toHaveBeenLastCalledWith(
					{ hand: '7001', step: at - 1 },
					{ replace: true }
				);
				fireEvent.keyDown(window, { key: 'ArrowRight' });
				fireEvent.keyDown(window, { key: 'ArrowRight' });
				expect(query().step).toBe(at + 1);
			});

			it('names the list’s first hand when the route has named none', () => {
				const { onQuery } = mount({ show: 'all' });
				fireEvent.keyDown(window, { key: 'ArrowRight' });
				expect(onQuery).toHaveBeenLastCalledWith(
					{ hand: '7002', step: expect.any(Number) },
					{ replace: true }
				);
			});

			it('stops at the deal and at the result', () => {
				const { last } = opensAt();
				const { onQuery } = mount({ show: 'all', hand: '7001', step: 0 });
				fireEvent.keyDown(window, { key: 'ArrowLeft' });
				expect(onQuery).not.toHaveBeenCalled();
				cleanup();
				const end = mount({ show: 'all', hand: '7001', step: last + 40 });
				fireEvent.keyDown(window, { key: 'ArrowRight' });
				expect(end.onQuery).not.toHaveBeenCalled();
			});

			it('leaves the arrows to a filter that has the focus', () => {
				const { onQuery } = mount({ show: 'all', hand: '7001' });
				fireEvent.keyDown(radio(/^All/), { key: 'ArrowRight' });
				expect(onQuery).not.toHaveBeenCalled();
			});

			it('moves the table, the strip and the caption together', () => {
				mount({ show: 'all', hand: '7001', step: 0 });
				const caption = () => document.querySelector('.step-caption__where')!.textContent;
				expect(caption()).toMatch(/^Preflop · step 1 of /);
				fireEvent.click(screen.getByRole('button', { name: 'Forward a step' }));
				expect(caption()).toMatch(/^Preflop · step 2 of /);
				expect(
					screen.getByRole('group', { name: 'UTG p3' }).classList.contains('is-acting')
				).toBe(true);
			});

			it('opens a hand on its good play in the list of them', () => {
				// 6001 has a mistake before its play.
				mount({ show: 'plays', hand: '6001' });
				expect(
					screen.getByRole('heading', {
						name: 'Laid down a strong hand without the price',
					})
				).toBeTruthy();
				cleanup();
				mount({ show: 'all', hand: '6001' });
				expect(
					screen.queryByRole('heading', {
						name: 'Laid down a strong hand without the price',
					})
				).toBeNull();
			});

			it('starts the next hand where that hand opens', () => {
				const { onQuery } = mount({ show: 'all', hand: '6001', step: 3 });
				fireEvent.keyDown(window, { key: 'j' });
				expect(onQuery).toHaveBeenLastCalledWith(
					{ hand: '5002', step: null },
					{ replace: true }
				);
			});
		});
	});
});
