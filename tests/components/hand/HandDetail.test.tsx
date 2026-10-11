import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';

import HandDetail from '#c/hand/HandDetail';
import { analyzeLog } from '#utils/coach/report';

import { TWO_HAND_LOG } from '../../integration/appHarness';

describe('HandDetail', () => {
	const [folded, opened] = analyzeLog(TWO_HAND_LOG).hands;

	describe('the header', () => {
		it('numbers the hand within the log and keeps the client’s id in the meta', () => {
			const { container } = render(() => (
				<HandDetail hand={opened} number={2} total={2} />
			));
			expect(screen.getByRole('heading', { name: 'Hand 2 of 2' })).toBeTruthy();
			const meta = container.querySelector('.hand-detail__meta')!.textContent;
			expect(meta).toContain('Builder · 6-handed · UTG · #5002');
		});

		it('steps to the hands either side', () => {
			const onPrev = vi.fn();
			const onNext = vi.fn();
			render(() => (
				<HandDetail hand={opened} number={2} total={3} onPrev={onPrev} onNext={onNext} />
			));
			fireEvent.click(screen.getByRole('button', { name: 'Previous hand in the list' }));
			fireEvent.click(screen.getByRole('button', { name: 'Next hand in the list' }));
			expect(onPrev).toHaveBeenCalledOnce();
			expect(onNext).toHaveBeenCalledOnce();
		});

		it('disables a step with nowhere to go', () => {
			render(() => <HandDetail hand={opened} number={2} total={2} onPrev={() => {}} />);
			expect(
				screen.getByRole<HTMLButtonElement>('button', { name: 'Next hand in the list' })
					.disabled
			).toBe(true);
			expect(
				screen.getByRole<HTMLButtonElement>('button', {
					name: 'Previous hand in the list',
				}).disabled
			).toBe(false);
		});
	});

	describe('the hero’s decisions', () => {
		it('tags one the baseline agrees with, without a card', () => {
			const { container } = render(() => (
				<HandDetail hand={opened} number={2} total={2} />
			));
			const line = screen.getByText('hero (UTG) raises to $0.25').closest('li')!;
			expect(line.textContent).toContain('on baseline');
			expect(container.querySelector('.mistake-card')).toBeNull();
		});

		it('gives a mistake its card and the chart it was graded against', () => {
			render(() => <HandDetail hand={folded} number={1} total={2} />);
			expect(
				screen.getByRole('heading', { name: 'Folded a standard open' })
			).toBeTruthy();
			expect(screen.getByText('Baseline range: UTG, first in')).toBeTruthy();
			expect(screen.getByTitle(/^AA: raises 100%/).classList.contains('is-marked')).toBe(
				true
			);
			expect(screen.queryByText('on baseline')).toBeNull();
		});
	});
});
