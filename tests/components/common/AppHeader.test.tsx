import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@solidjs/testing-library';

import AppHeader, { type ScopeChoice } from '#c/common/AppHeader';

const SCOPE: ScopeChoice = {
	options: [
		{ id: 'all', label: 'All time · 212 hands' },
		{ id: 'latest', label: 'Latest sitting · 40 hands' },
	],
	value: 'all',
	onChange: () => {},
};

const mount = (
	hands: number | null,
	scope: ScopeChoice | null = null,
	onLoad = () => {}
) =>
	render(() => (
		<AppHeader
			tab="summary"
			onTabChange={() => {}}
			hands={hands}
			scope={scope}
			onLoad={onLoad}
		/>
	));

describe('AppHeader', () => {
	describe('the views', () => {
		it('offers all of them, Ranges and Train last', () => {
			mount(null);
			expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
				'Summary',
				'Review',
				'Openings',
				'Trends',
				'Players',
				'Ranges',
				'Train',
			]);
		});

		it('rules Ranges and Train off from the views that read the log', () => {
			const { container } = mount(null);
			const rule = container.querySelector('.app-header__rule')!;
			expect(rule.previousElementSibling!.textContent).toBe('Players');
			expect(rule.nextElementSibling!.textContent).toBe('Ranges');
		});

		it('reports the one that is picked', async () => {
			const onTabChange = vi.fn();
			render(() => (
				<AppHeader
					tab="summary"
					onTabChange={onTabChange}
					hands={null}
					scope={null}
					onLoad={() => {}}
				/>
			));
			fireEvent.click(screen.getByRole('tab', { name: 'Review' }));
			// Ark's machine takes the pick on the next microtask.
			await Promise.resolve();
			expect(onTabChange).toHaveBeenCalledWith('review');
		});
	});

	describe('the hands', () => {
		it('offers the scopes in a menu, on the one chosen', () => {
			mount(212, { ...SCOPE, value: 'latest' });
			const menu = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Hands' });
			expect(menu.value).toBe('latest');
			expect(within(menu).getAllByRole('option')).toHaveLength(2);
		});

		it('reports the scope that is picked', () => {
			const onChange = vi.fn();
			mount(212, { ...SCOPE, onChange });
			fireEvent.change(screen.getByRole('combobox', { name: 'Hands' }), {
				target: { value: 'latest' },
			});
			expect(onChange).toHaveBeenCalledWith('latest');
		});

		it('prints their number alone where there is no scope to choose', () => {
			mount(212);
			expect(screen.getByText('212 hands')).toBeTruthy();
			expect(screen.queryByRole('combobox')).toBeNull();
		});

		it('counts one hand as one hand', () => {
			mount(1);
			expect(screen.getByText('1 hand')).toBeTruthy();
		});

		it('says nothing of them before a log is loaded', () => {
			const { container } = mount(null, SCOPE);
			expect(container.querySelector('.app-header__hands')).toBeNull();
			expect(screen.getByText('· hand-history coach')).toBeTruthy();
		});
	});

	describe('the load button', () => {
		it('opens the file dialog', () => {
			const onLoad = vi.fn();
			mount(212, null, onLoad);
			fireEvent.click(screen.getByRole('button', { name: 'Load another log' }));
			expect(onLoad).toHaveBeenCalledOnce();
		});

		it('offers a first log when there is none', () => {
			mount(null);
			expect(screen.getByRole('button', { name: 'Load a log' })).toBeTruthy();
		});
	});
});
