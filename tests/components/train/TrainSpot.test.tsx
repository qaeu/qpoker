import { describe, expect, it } from 'vitest';
import { render, screen } from '@solidjs/testing-library';

import TrainSpot from '#c/train/TrainSpot';
import { questionAt, type PotOddsQuestion } from '#utils/train/drills';

describe('TrainSpot', () => {
	describe('a pot-odds spot', () => {
		const question = questionAt('potOdds', 'easy', 2024, 0) as PotOddsQuestion;

		it('names the bet faced once, with its size', () => {
			render(() => <TrainSpot question={question} />);
			const text = screen.getByRole('region', { name: 'The spot' }).textContent ?? '';
			expect(text.match(/bets/g)).toHaveLength(1);
			expect(text).toContain(`${Number(question.betBb.toFixed(1))} bb`);
		});

		it('gives away neither the price nor the equity', () => {
			render(() => <TrainSpot question={question} />);
			const text = screen.getByRole('region', { name: 'The spot' }).textContent ?? '';
			expect(text).not.toContain(`${Math.round(question.potOdds * 100)}%`);
			expect(text).not.toContain(`${Math.round(question.equity * 100)}%`);
		});
	});
});
