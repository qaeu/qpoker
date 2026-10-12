import { describe, expect, it, vi } from 'vitest';
import { createSignal } from 'solid-js';
import { fireEvent, render, screen } from '@solidjs/testing-library';

import Select, { type SelectOption } from '#c/common/Select';

type Seat = '' | 'BTN' | 'UTG+1';

const OPTIONS: SelectOption<Seat>[] = [
	{ id: '', label: 'All' },
	{ id: 'UTG+1', label: 'UTG+1 · 3' },
	{ id: 'BTN', label: 'BTN · 12' },
];

const control = () =>
	screen.getByRole<HTMLSelectElement>('combobox', { name: 'Position' });

describe('Select', () => {
	it('is a native select named by its label, an option per choice', () => {
		render(() => (
			<Select label="Position" options={OPTIONS} value="" onChange={() => {}} />
		));
		expect(control().tagName).toBe('SELECT');
		expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
			'All',
			'UTG+1 · 3',
			'BTN · 12',
		]);
	});

	it('shows the value it is given', () => {
		render(() => (
			<Select label="Position" options={OPTIONS} value="BTN" onChange={() => {}} />
		));
		expect(control().value).toBe('BTN');
	});

	it('reports a choice by its id', () => {
		const onChange = vi.fn();
		render(() => (
			<Select label="Position" options={OPTIONS} value="" onChange={onChange} />
		));
		fireEvent.change(control(), { target: { value: 'UTG+1' } });
		expect(onChange).toHaveBeenCalledWith('UTG+1');
	});

	it('follows the value when its owner changes it', () => {
		const [value, setValue] = createSignal<Seat>('');
		render(() => (
			<Select label="Position" options={OPTIONS} value={value()} onChange={setValue} />
		));
		setValue('BTN');
		expect(control().value).toBe('BTN');
	});

	describe('the label', () => {
		it('goes over the control unless asked to sit beside it', () => {
			const { container, unmount } = render(() => (
				<Select label="Position" options={OPTIONS} value="" onChange={() => {}} />
			));
			expect(container.querySelector('.select--inline')).toBeNull();
			unmount();
			const inline = render(() => (
				<Select inline label="Position" options={OPTIONS} value="" onChange={() => {}} />
			));
			expect(inline.container.querySelector('.select--inline')).not.toBeNull();
		});
	});
});
