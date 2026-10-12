import { describe, expect, it, vi } from 'vitest';
import { createSignal } from 'solid-js';
import { fireEvent, render, screen, within } from '@solidjs/testing-library';

import RangesView from '#c/ranges/RangesView';
import { DEFAULT_RANGES, type RangesQuery } from '#utils/ui/rangeTables';

/** Mounts the view over a query that takes every change, as the route does. */
function mount(initial: Partial<RangesQuery> = {}) {
	const [query, setQuery] = createSignal<RangesQuery>({ ...DEFAULT_RANGES, ...initial });
	const onQuery = vi.fn(
		(change: Partial<RangesQuery>, options?: { replace?: boolean }) => {
			void options;
			setQuery((current) => ({ ...current, ...change }));
		}
	);
	const view = render(() => <RangesView query={query()} onQuery={onQuery} />);
	return { query, onQuery, ...view };
}

type Group = 'Scenario' | 'Chart' | 'Stack';

const group = (name: Group) => screen.getByRole('radiogroup', { name });

const radio = (name: string, of: Group) =>
	within(group(of)).getByRole<HTMLInputElement>('radio', { name });

const keys = (of: Group) =>
	within(group(of))
		.getAllByRole('radio')
		.map((key) => key.closest('.segmented__item')!.textContent);

/** Ark's machine takes a pick on the next microtask. */
async function pick(name: string, of: Group): Promise<void> {
	fireEvent.click(radio(name, of));
	await Promise.resolve();
}

const heading = () => screen.getByRole('heading', { level: 2 }).textContent;

describe('RangesView', () => {
	describe('the keys', () => {
		it('sets out the scenarios, the charts of the one chosen and the depths', () => {
			mount();
			expect(keys('Scenario')).toEqual([
				'First in',
				'Vs open',
				'Vs 3-bet',
				'Vs 4-bet',
				'Cold 4-bet',
				'Limped',
			]);
			expect(keys('Chart')).toEqual(['UTG', 'HJ', 'CO', 'BTN', 'SB']);
			expect(keys('Stack')).toEqual(['70bb and deeper', '30 to 70bb']);
			expect(radio('First in', 'Scenario').checked).toBe(true);
			expect(radio('BTN', 'Chart').checked).toBe(true);
		});

		it('names the chart in full over its grid', () => {
			mount({ chart: 'bbVsSb' });
			expect(heading()).toBe('BB vs SB open');
			expect(radio('Vs open', 'Scenario').checked).toBe(true);
			expect(keys('Chart')).toHaveLength(12);
			expect(screen.getAllByRole('gridcell')).toHaveLength(169);
		});

		it('picks a chart, adding an entry to the history', async () => {
			const { onQuery } = mount();
			await pick('UTG', 'Chart');
			expect(onQuery).toHaveBeenLastCalledWith({ chart: 'rfiUtg' });
			expect(heading()).toBe('UTG, first in');
		});

		it('picks a scenario, keeping the seat', async () => {
			const { onQuery } = mount();
			await pick('Vs 3-bet', 'Scenario');
			expect(onQuery).toHaveBeenLastCalledWith({ chart: 'btnVs3bet' });
			expect(radio('BTN', 'Chart').checked).toBe(true);
			expect(keys('Chart')).toHaveLength(6);
		});

		it('picks a depth, and says when it has no chart of its own', async () => {
			const { onQuery } = mount();
			await pick('30 to 70bb', 'Stack');
			expect(onQuery).toHaveBeenLastCalledWith({ depth: 'mid' });
			expect(screen.getByText(/Same as the deep chart/)).toBeTruthy();
		});
	});

	describe('the keyboard', () => {
		const press = (key: string, init: KeyboardEventInit = {}) =>
			fireEvent.keyDown(window, { key, ...init });

		it('steps the chart with left and right, rewriting the entry', () => {
			const { onQuery, query } = mount();
			press('ArrowLeft');
			expect(onQuery).toHaveBeenLastCalledWith({ chart: 'rfiCo' }, { replace: true });
			press('ArrowRight');
			press('ArrowRight');
			expect(query().chart).toBe('rfiSb');
			expect(heading()).toBe('SB, first in');
		});

		it('steps the scenario with up and down, keeping the seat', () => {
			const { onQuery, query } = mount();
			press('ArrowDown');
			expect(onQuery).toHaveBeenLastCalledWith({ chart: 'btnVsEp' }, { replace: true });
			press('ArrowDown');
			expect(query().chart).toBe('btnVs3bet');
			press('ArrowUp');
			press('ArrowUp');
			expect(query().chart).toBe('rfiBtn');
		});

		it('stops at the ends', () => {
			const { onQuery } = mount({ chart: 'rfiUtg' });
			press('ArrowLeft');
			press('ArrowUp');
			expect(onQuery).not.toHaveBeenCalled();
		});

		it('flips the depth with D', () => {
			const { onQuery, query } = mount();
			press('d');
			expect(onQuery).toHaveBeenLastCalledWith({ depth: 'mid' }, { replace: true });
			press('D');
			expect(query().depth).toBe('deep');
		});

		it('leaves the keys alone with a modifier', () => {
			const { onQuery } = mount();
			press('ArrowRight', { altKey: true });
			press('ArrowDown', { metaKey: true });
			press('d', { ctrlKey: true });
			expect(onQuery).not.toHaveBeenCalled();
		});

		it('leaves the arrows to a row of keys that has the focus', () => {
			const { onQuery } = mount();
			fireEvent.keyDown(radio('BTN', 'Chart'), { key: 'ArrowRight' });
			fireEvent.keyDown(radio('First in', 'Scenario'), { key: 'ArrowDown' });
			expect(onQuery).not.toHaveBeenCalled();
		});

		it('stops listening once the view is gone', () => {
			const { onQuery, unmount } = mount();
			unmount();
			press('ArrowRight');
			expect(onQuery).not.toHaveBeenCalled();
		});
	});
});
