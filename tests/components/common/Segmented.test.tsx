import { describe, expect, it, vi } from 'vitest';
import { createSignal } from 'solid-js';
import { fireEvent, render, screen } from '@solidjs/testing-library';

import Segmented, { type SegmentOption } from '#c/common/Segmented';

type Show = 'all' | 'mistakes' | 'plays';

const OPTIONS: SegmentOption<Show>[] = [
	{ id: 'all', label: 'All', count: 212 },
	{ id: 'mistakes', label: 'Mistakes', count: 14 },
	{ id: 'plays', label: 'Good plays' },
];

describe('Segmented', () => {
	it('is a named radio group with one option per segment', () => {
		render(() => (
			<Segmented label="Show" options={OPTIONS} value="mistakes" onChange={() => {}} />
		));
		expect(screen.getByRole('radiogroup', { name: 'Show' })).toBeTruthy();
		expect(screen.getAllByRole('radio')).toHaveLength(3);
	});

	it('checks and lights the selected option', () => {
		render(() => (
			<Segmented label="Show" options={OPTIONS} value="mistakes" onChange={() => {}} />
		));
		const selected = screen.getByRole<HTMLInputElement>('radio', { name: /^Mistakes/ });
		expect(selected.checked).toBe(true);
		expect(selected.closest('.segmented__item')!.classList.contains('active')).toBe(true);
		expect(screen.getByRole<HTMLInputElement>('radio', { name: /^All/ }).checked).toBe(
			false
		);
	});

	it('prints a count beside the labels that have one', () => {
		render(() => (
			<Segmented label="Show" options={OPTIONS} value="all" onChange={() => {}} />
		));
		expect(screen.getByText('212')).toBeTruthy();
		expect(screen.getByText('14')).toBeTruthy();
		expect(screen.getByText('Good plays').parentElement!.textContent).toBe('Good plays');
	});

	it('reports a pick and follows the value it is handed back', async () => {
		const onChange = vi.fn();
		const [value, setValue] = createSignal<Show>('all');
		render(() => (
			<Segmented
				label="Show"
				options={OPTIONS}
				value={value()}
				onChange={(next) => {
					onChange(next);
					setValue(next);
				}}
			/>
		));
		fireEvent.click(screen.getByRole('radio', { name: 'Good plays' }));
		await Promise.resolve();
		expect(onChange).toHaveBeenCalledWith('plays');
		expect(
			screen.getByRole<HTMLInputElement>('radio', { name: 'Good plays' }).checked
		).toBe(true);
	});
});
