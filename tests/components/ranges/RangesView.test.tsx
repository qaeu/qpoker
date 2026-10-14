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

const part = (container: HTMLElement, name: string) =>
	container.querySelector(`.ranges-view__${name}`)?.textContent?.trim();

const heading = () => screen.getByRole('heading', { level: 2 }).textContent;

describe('RangesView', () => {
	describe('the keys', () => {
		it('sets out the scenarios, the charts of the one chosen and the depths', () => {
			mount({ chart: 'btnVs3bet' });
			expect(keys('Scenario')).toEqual([
				'First in',
				'Vs open',
				'Vs 3-bet',
				'Vs 4-bet',
				'Cold 4-bet',
				'Limped',
			]);
			expect(keys('Chart')).toEqual([
				'UTG/HJ, 3-bet IP',
				'UTG/HJ, blinds',
				'CO vs BTN',
				'CO, blinds',
				'BTN',
				'SB',
			]);
			expect(keys('Stack')).toEqual(['70bb and deeper', '30 to 70bb']);
			expect(radio('Vs 3-bet', 'Scenario').checked).toBe(true);
			expect(radio('BTN', 'Chart').checked).toBe(true);
		});

		it('shows each seat behind a limper its iso-raise as well as its limp', () => {
			mount({ chart: 'overLimpBtn' });
			expect(keys('Chart')).toEqual(['HJ', 'CO', 'BTN', 'SB', 'BB', 'Limped, raised']);
			expect(heading()).toBe('BTN behind a limper');
			expect(screen.getByText(/Iso-raises with the first-in range/)).toBeTruthy();
			expect(screen.getByText(/Raises/).textContent).not.toMatch(/Raises 0(\.0)?%/);
		});

		it('checks, not folds, what the big blind does not raise over limpers', () => {
			const { container } = mount({ chart: 'bbVsLimp' });
			expect(part(container, 'figures')).toMatch(
				/^Raises \S+ of hands, checks the rest\.$/
			);
			expect(container.querySelector('.range-key')!.textContent).toBe('RaiseCheck');
			expect(container.querySelector('.range-key__swatch--fold')).toBeNull();
			expect(screen.getByTitle(/^72o:/).title).toBe(
				'72o: raises 0%, calls 0%, checks 100%'
			);
		});

		it('folds what an opener does not raise or call', () => {
			const { container } = mount({ chart: 'rfiBtn' });
			expect(part(container, 'figures')).toMatch(/calls \S+\.$/);
			expect(container.querySelector('.range-key')!.textContent).toBe('RaiseCallFold');
		});

		it('has no stack to pick where the charts are the same at every depth', () => {
			const { container } = mount({ depth: 'mid' });
			expect(keys('Chart')).toEqual(['UTG', 'HJ', 'CO', 'BTN', 'SB']);
			expect(screen.queryByRole('radiogroup', { name: 'Stack' })).toBeNull();
			expect(screen.queryByText(/Same as the deep chart/)).toBeNull();
			expect(container.querySelector('.ranges-view__keys')!.textContent).not.toContain(
				'stack'
			);
		});

		it('keeps the depth for the next scenario that has one', async () => {
			const { query } = mount({ depth: 'mid' });
			await pick('Vs 3-bet', 'Scenario');
			expect(query().depth).toBe('mid');
			expect(radio('30 to 70bb', 'Stack').checked).toBe(true);
		});

		it('puts the scenarios down a sidebar, apart from the chart', () => {
			mount();
			const aside = screen.getByRole('complementary');
			expect(group('Scenario').closest('aside')).toBe(aside);
			expect(group('Scenario').getAttribute('data-orientation')).toBe('vertical');
			expect(group('Chart').closest('aside')).toBeNull();
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

		it('picks a depth', async () => {
			const { onQuery } = mount({ chart: 'btnVs3bet' });
			await pick('30 to 70bb', 'Stack');
			expect(onQuery).toHaveBeenLastCalledWith({ depth: 'mid' });
			expect(screen.queryByText(/Same as the deep chart/)).toBeNull();
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

		it('goes round past the ends', () => {
			const { query } = mount({ chart: 'rfiUtg' });
			press('ArrowLeft');
			expect(query().chart).toBe('rfiSb');
			press('ArrowRight');
			expect(query().chart).toBe('rfiUtg');
			press('ArrowUp');
			expect(query().chart).toBe('overLimpHj');
			press('ArrowDown');
			expect(query().chart).toBe('rfiHj');
		});

		it('has nowhere to step in a scenario of one chart', () => {
			const { onQuery } = mount({ chart: 'cold4bet' });
			press('ArrowRight');
			press('ArrowLeft');
			expect(onQuery).not.toHaveBeenCalled();
		});

		it('flips the depth with D', () => {
			const { onQuery, query } = mount({ chart: 'btnVs3bet' });
			press('d');
			expect(onQuery).toHaveBeenLastCalledWith({ depth: 'mid' }, { replace: true });
			press('D');
			expect(query().depth).toBe('deep');
		});

		it('leaves D alone where there is no stack to pick', () => {
			const { onQuery } = mount();
			press('d');
			expect(onQuery).not.toHaveBeenCalled();
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
