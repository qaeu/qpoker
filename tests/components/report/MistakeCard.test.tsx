import { describe, expect, it } from 'vitest';
import { render, screen } from '@solidjs/testing-library';

import MistakeCard from '#c/report/MistakeCard';
import { analyzeLog } from '#utils/coach/report';

import { TWO_HAND_LOG } from '../../integration/appHarness';
import { handText, TOUGH_FOLD } from '../../utils/history/handText';

describe('MistakeCard', () => {
	const report = analyzeLog(TWO_HAND_LOG);
	const [fold] = report.mistakes;

	it('states the mistake, its cost and the verdict', () => {
		render(() => <MistakeCard grading={fold} />);
		expect(screen.getByRole('heading', { name: 'Folded a standard open' })).toBeTruthy();
		expect(screen.getByText('blunder')).toBeTruthy();
		expect(screen.getByText(/^−\d+\.\d\dbb$/)).toBeTruthy();
		expect(screen.getByText(/the baseline is to/).textContent).toBe(
			'You fold; the baseline is to raise.'
		);
	});

	describe('the footer', () => {
		it('says how far the finding can be trusted, and of which spot', () => {
			const { container } = render(() => <MistakeCard grading={fold} />);
			const foot = container.querySelector('.mistake-card__foot')!;
			expect(foot.textContent).toContain('High confidence');
			expect(foot.textContent).toContain('preflop · UTG, first in');
		});

		it('offers nothing to press: the card is read inside its hand', () => {
			render(() => <MistakeCard grading={fold} />);
			expect(screen.queryByRole('button')).toBeNull();
		});
	});

	it('reads as fine for a decision with no mistake', () => {
		const open = report.hands.find((candidate) => candidate.id === '5002')!.gradings[0];
		render(() => <MistakeCard grading={open} />);
		expect(screen.getByText('fine')).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'No mistake' })).toBeTruthy();
	});

	it('states a good play, what it was worth and the mistake it avoided', () => {
		const [fold] = analyzeLog(handText(TOUGH_FOLD)).goodPlays;
		const { container } = render(() => <MistakeCard grading={fold} />);
		expect(screen.getByText('great play')).toBeTruthy();
		expect(
			screen.getByRole('heading', { name: 'Laid down a strong hand without the price' })
		).toBeTruthy();
		expect(screen.getByText(/^\+\d+\.\d\dbb$/).classList.contains('is-positive')).toBe(
			true
		);
		expect(screen.getByText(/as the baseline does/).textContent).toBe(
			'You fold, as the baseline does; to call was the mistake.'
		);
		expect(container.querySelector('.mistake-card.is-good-play')).toBeTruthy();
	});
});
