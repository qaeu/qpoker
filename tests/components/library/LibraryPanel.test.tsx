import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@solidjs/testing-library';

import LibraryPanel from '#c/library/LibraryPanel';
import type { ImportRecord } from '#utils/store/types';

const imports: ImportRecord[] = [
	{
		importedAt: '2026-10-11T09:00:00.000Z',
		fileName: 'a.txt',
		hands: 100,
		added: 100,
		replaced: 0,
	},
	{
		importedAt: '2026-10-12T09:30:00.000Z',
		fileName: 'b.txt',
		hands: 120,
		added: 19,
		replaced: 1,
	},
];

function mount(usage: number | null = 3 * 1_048_576) {
	const onExport = vi.fn();
	const onClear = vi.fn();
	render(() => (
		<LibraryPanel
			imports={imports}
			hands={120}
			usage={usage}
			onExport={onExport}
			onClear={onClear}
		/>
	));
	return { onExport, onClear };
}

describe('LibraryPanel', () => {
	it('lists the logs loaded, the latest first, with what each one added', () => {
		mount();
		const rows = screen.getAllByRole('row').slice(1);
		expect(rows.map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual([
			'b.txt',
			'a.txt',
		]);
		expect(within(rows[0]).getByRole('rowheader').textContent).toBe('2026-10-12 09:30');
		expect(within(rows[0]).getAllByRole('cell')[2].textContent).toBe('20');
	});

	it('says how much there is, and how much room it takes when the browser will say', () => {
		mount();
		expect(
			screen.getByText(/120 hands from 2 logs · 3\.0 MB in this browser/)
		).toBeTruthy();
	});

	it('leaves the room unsaid when the browser will not say', () => {
		mount(null);
		expect(screen.getByText(/120 hands from 2 logs\./)).toBeTruthy();
	});

	it('offers a copy and an emptying, and warns whose names a copy holds', () => {
		const { onExport, onClear } = mount();
		fireEvent.click(screen.getByRole('button', { name: 'Save a copy' }));
		fireEvent.click(screen.getByRole('button', { name: 'Empty the library' }));
		expect(onExport).toHaveBeenCalledOnce();
		expect(onClear).toHaveBeenCalledOnce();
		expect(screen.getByText(/other players' screen names included/)).toBeTruthy();
	});
});
