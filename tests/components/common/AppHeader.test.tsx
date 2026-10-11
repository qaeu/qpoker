import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';

import AppHeader, { type Session } from '#c/common/AppHeader';

const SESSION: Session = {
	hero: 'hero77',
	stakes: '$0.05/$0.10',
	hands: 212,
	fileName: 'stars-2026-10-06.txt',
};

const mount = (session: Session | null, onLoad = () => {}) =>
	render(() => (
		<AppHeader tab="summary" onTabChange={() => {}} session={session} onLoad={onLoad} />
	));

describe('AppHeader', () => {
	describe('the views', () => {
		it('offers the four of them, Ranges last', () => {
			mount(null);
			expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
				'Summary',
				'Review',
				'Openings',
				'Ranges',
			]);
		});

		it('rules Ranges off from the views that read the log', () => {
			const { container } = mount(null);
			const rule = container.querySelector('.app-header__rule')!;
			expect(rule.previousElementSibling!.textContent).toBe('Openings');
			expect(rule.nextElementSibling!.textContent).toBe('Ranges');
		});

		it('reports the one that is picked', async () => {
			const onTabChange = vi.fn();
			render(() => (
				<AppHeader
					tab="summary"
					onTabChange={onTabChange}
					session={null}
					onLoad={() => {}}
				/>
			));
			fireEvent.click(screen.getByRole('tab', { name: 'Review' }));
			// Ark's machine takes the pick on the next microtask.
			await Promise.resolve();
			expect(onTabChange).toHaveBeenCalledWith('review');
		});
	});

	describe('the session', () => {
		it('names the log on the table and the file it came from', () => {
			mount(SESSION);
			expect(screen.getByText('hero77 · $0.05/$0.10 · 212 hands')).toBeTruthy();
			expect(screen.getByText('stars-2026-10-06.txt')).toBeTruthy();
		});

		it('counts one hand as one hand, and leaves out a file it has no name for', () => {
			const { container } = mount({ ...SESSION, hands: 1, fileName: '' });
			expect(screen.getByText('hero77 · $0.05/$0.10 · 1 hand')).toBeTruthy();
			expect(container.querySelector('.app-header__session-file')).toBeNull();
		});

		it('is not there before a log is', () => {
			const { container } = mount(null);
			expect(container.querySelector('.app-header__session')).toBeNull();
		});
	});

	describe('the load button', () => {
		it('opens the file dialog', () => {
			const onLoad = vi.fn();
			mount(SESSION, onLoad);
			fireEvent.click(screen.getByRole('button', { name: 'Load another log' }));
			expect(onLoad).toHaveBeenCalledOnce();
		});

		it('offers a first log when there is none', () => {
			mount(null);
			expect(screen.getByRole('button', { name: 'Load a log' })).toBeTruthy();
		});
	});
});
