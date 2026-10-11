import { describe, expect, it } from 'vitest';
import { render, screen } from '@solidjs/testing-library';

import RangeGrid from '#c/ranges/RangeGrid';
import { parseStrategy } from '#utils/ranges/notation';

describe('RangeGrid', () => {
	const strategy = parseStrategy('AA,AKs:0.5', 'AKs,KK');

	it('lays out all 169 hands with aces first', () => {
		render(() => <RangeGrid strategy={strategy} />);
		const cells = screen.getAllByRole('gridcell');
		expect(cells).toHaveLength(169);
		expect(cells[0].textContent).toContain('AA');
		expect(cells[1].textContent).toContain('AKs');
		expect(cells[13].textContent).toContain('AKo');
		expect(cells[168].textContent).toContain('22');
	});

	it('describes each hand and marks the one asked for', () => {
		render(() => <RangeGrid strategy={strategy} marked="AKs" rest="checks" />);
		const mixed = screen.getByTitle('AKs: raises 50%, calls 50%, checks 0%');
		expect(mixed.classList.contains('is-marked')).toBe(true);
		expect(mixed.classList.contains('is-empty')).toBe(false);
		expect(
			screen
				.getByTitle('72o: raises 0%, calls 0%, checks 100%')
				.classList.contains('is-empty')
		).toBe(true);
	});

	it('outlines a second range and takes its faint cells and tooltips from the caller', () => {
		render(() => (
			<RangeGrid
				strategy={strategy}
				outline={strategy.call}
				faint={(cls) => cls === 0}
				describe={(cls) => `cell ${cls}`}
			/>
		));
		const cells = screen.getAllByRole('gridcell');
		// Aces are raised, but the caller says faint; kings are in the outlined range.
		expect(cells[0].classList.contains('is-empty')).toBe(true);
		expect(cells[0].classList.contains('is-outlined')).toBe(false);
		expect(cells[14].classList.contains('is-outlined')).toBe(true);
		expect(cells[14].classList.contains('is-empty')).toBe(false);
		expect(cells[14].title).toBe('cell 14');
	});
});
