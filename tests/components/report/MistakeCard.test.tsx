import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';

import MistakeCard from '#c/report/MistakeCard';
import { analyzeLog } from '#utils/coach/report';

import { TWO_HAND_LOG } from '../../integration/appHarness';
import { handText, TOUGH_FOLD } from '../../utils/history/handText';

describe('MistakeCard', () => {
	const report = analyzeLog(TWO_HAND_LOG);
	const [fold] = report.mistakes;
	const hand = report.hands.find((candidate) => candidate.id === fold.handId)!;

	it('states the mistake, its cost and the verdict', () => {
		render(() => <MistakeCard grading={fold} hand={hand} onOpenHand={() => {}} />);
		expect(screen.getByRole('heading', { name: 'Folded a standard open' })).toBeTruthy();
		expect(screen.getByText('blunder')).toBeTruthy();
		expect(screen.getByText(/^−\d+\.\d\dbb$/)).toBeTruthy();
		expect(screen.getByText(/the baseline is to/).textContent).toBe(
			'You fold; the baseline is to raise.'
		);
		expect(screen.getByLabelText('As Ad')).toBeTruthy();
	});

	it('opens its hand', () => {
		const onOpenHand = vi.fn();
		render(() => <MistakeCard grading={fold} hand={hand} onOpenHand={onOpenHand} />);
		fireEvent.click(screen.getByRole('button', { name: 'Open hand #5001' }));
		expect(onOpenHand).toHaveBeenCalledWith('5001');
	});

	it('reads as fine for a decision with no mistake, and offers nothing to open', () => {
		const open = report.hands.find((candidate) => candidate.id === '5002')!.gradings[0];
		render(() => <MistakeCard grading={open} />);
		expect(screen.getByText('fine')).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'No mistake' })).toBeTruthy();
		expect(screen.queryByRole('button')).toBeNull();
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
