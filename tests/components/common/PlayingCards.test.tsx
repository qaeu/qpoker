import { describe, expect, it } from 'vitest';
import { render, screen } from '@solidjs/testing-library';

import PlayingCards from '#c/common/PlayingCards';

describe('PlayingCards', () => {
	it('names the cards and draws one tile each, a ten in full', () => {
		const { container } = render(() => <PlayingCards cards="Td Ks" />);
		expect(screen.getByLabelText('Td Ks')).toBeTruthy();
		const cards = [...container.querySelectorAll('.playing-cards__card')];
		expect(cards.map((card) => card.textContent)).toEqual(['10♦', 'K♠']);
		expect(cards.map((card) => card.classList.contains('is-red'))).toEqual([true, false]);
	});

	it('draws nothing for no cards', () => {
		const { container } = render(() => <PlayingCards cards="" />);
		expect(container.querySelectorAll('.playing-cards__card')).toHaveLength(0);
	});

	describe('at table size', () => {
		it('adds the centre pip under the corner index', () => {
			const { container } = render(() => <PlayingCards cards="Ah" size="table" />);
			expect(container.querySelector('.playing-cards--table')).not.toBeNull();
			expect(container.querySelector('.playing-cards__index')!.textContent).toBe('A♥');
			expect(container.querySelector('.playing-cards__suit')!.textContent).toBe('♥');
		});

		it('leaves it off a card in a line of text', () => {
			const { container } = render(() => <PlayingCards cards="Ah" />);
			expect(container.querySelector('.playing-cards__suit')).toBeNull();
		});
	});

	describe('face down', () => {
		it('draws backs and says how many, without saying what they are', () => {
			const { container } = render(() => <PlayingCards cards="" down={2} />);
			expect(screen.getByLabelText('2 cards, face down')).toBeTruthy();
			expect(container.querySelectorAll('.playing-cards__back')).toHaveLength(2);
			expect(container.querySelectorAll('.playing-cards__card')).toHaveLength(0);
		});
	});
});
