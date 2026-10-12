import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';

import StepScrubber from '#c/hand/StepScrubber';
import { analyzeLog, type HandReport } from '#utils/coach/report';
import { decisionSteps, tableSteps } from '#utils/ui/tableReplay';

import { handText, RIVER_HERO_CALL, TOUGH_FOLD } from '../../utils/history/handText';

const called = analyzeLog(handText(RIVER_HERO_CALL)).hands[0];
const laidDown = analyzeLog(handText(TOUGH_FOLD)).hands[0];

function mount(hand: HandReport, step: number) {
	const steps = tableSteps(hand);
	const onStep = vi.fn();
	const view = render(() => (
		<StepScrubber hand={hand} steps={steps} step={step} onStep={onStep} />
	));
	return { steps, onStep, ...view };
}

const ticks = () => screen.getAllByRole('button', { name: /^Step \d+: / });
const key = (name: string) => screen.getByRole<HTMLButtonElement>('button', { name });

describe('StepScrubber', () => {
	describe('the ticks', () => {
		it('has one per step, named for what the step was', () => {
			const { steps } = mount(called, 0);
			expect(ticks()).toHaveLength(steps.length);
			expect(ticks()[0].getAttribute('aria-label')).toBe(
				'Step 1: Blinds posted, cards dealt'
			);
			expect(ticks().at(-1)!.getAttribute('aria-label')).toBe(
				`Step ${steps.length}: p2 wins 100 bb`
			);
		});

		it('groups them by street, the result with the last', () => {
			const { container, steps } = mount(called, 0);
			const streets = [...container.querySelectorAll('.step-scrubber__street')];
			expect(
				streets.map(
					(street) => street.querySelector('.step-scrubber__label')!.textContent
				)
			).toEqual(['preflop', 'flop', 'turn', 'river']);
			const counts = streets.map(
				(street) => street.querySelectorAll('.step-scrubber__tick').length
			);
			expect(counts.reduce((sum, count) => sum + count, 0)).toBe(steps.length);
			// The deal, four folds, the open and the call.
			expect(counts[0]).toBe(7);
			expect(streets[0].classList.contains('step-scrubber__street--7')).toBe(true);
		});

		it('marks the current step, and the ones already played', () => {
			mount(called, 3);
			const current = ticks().filter((tick) => tick.getAttribute('aria-current'));
			expect(current).toHaveLength(1);
			expect(current[0]).toBe(ticks()[3]);
			expect(ticks().map((tick) => tick.classList.contains('is-done'))).toEqual(
				ticks().map((_, index) => index <= 3)
			);
		});

		it('marks the hero’s decisions, and a mistake by its severity', () => {
			const { steps } = mount(called, 0);
			const decisions = decisionSteps(steps, called);
			expect(
				ticks().flatMap((tick, index) =>
					tick.classList.contains('is-decision') ? [index] : []
				)
			).toEqual(decisions);
			const blunder = called.gradings.find((grading) => grading.mistake)!;
			const marked = ticks().filter((tick) =>
				tick.classList.contains(`is-${blunder.severity}`)
			);
			expect(marked).toHaveLength(1);
			expect(steps[ticks().indexOf(marked[0])].lineIndex).toBe(blunder.stepIndex);
		});

		it('marks a good play', () => {
			const { steps } = mount(laidDown, 0);
			const play = laidDown.gradings.find((grading) => grading.goodPlay)!;
			const marked = ticks().filter((tick) => tick.classList.contains('is-good-play'));
			expect(marked).toHaveLength(1);
			expect(steps[ticks().indexOf(marked[0])].lineIndex).toBe(play.stepIndex);
		});

		it('jumps to the step pressed', () => {
			const { onStep } = mount(called, 0);
			fireEvent.click(ticks()[5]);
			expect(onStep).toHaveBeenLastCalledWith(5);
		});
	});

	describe('the street labels', () => {
		it('jump to the street’s first step and light the street being read', () => {
			const { onStep, steps, container } = mount(called, 0);
			fireEvent.click(screen.getByRole('button', { name: 'turn' }));
			const turn = steps.findIndex((step) => step.street === 'turn');
			expect(onStep).toHaveBeenLastCalledWith(turn);
			expect(steps[turn].kind).toBe('deal');
			expect(
				container.querySelector('.step-scrubber__street.is-current')!.textContent
			).toBe('preflop');
		});
	});

	describe('the keys', () => {
		it('step back, forward and to the deal', () => {
			const { onStep } = mount(called, 4);
			fireEvent.click(key('Back a step'));
			expect(onStep).toHaveBeenLastCalledWith(3);
			fireEvent.click(key('Forward a step'));
			expect(onStep).toHaveBeenLastCalledWith(5);
			fireEvent.click(key('Back to the deal'));
			expect(onStep).toHaveBeenLastCalledWith(0);
		});

		it('stop at the deal', () => {
			mount(called, 0);
			expect(key('Back a step').disabled).toBe(true);
			expect(key('Back to the deal').disabled).toBe(true);
			expect(key('Forward a step').disabled).toBe(false);
		});

		it('stop at the result', () => {
			const { steps, unmount } = mount(called, 0);
			unmount();
			mount(called, steps.length - 1);
			expect(key('Forward a step').disabled).toBe(true);
			expect(key('Back a step').disabled).toBe(false);
		});

		it('go to the hero’s next decision, until there is none left', () => {
			const { steps, onStep, unmount } = mount(called, 0);
			const decisions = decisionSteps(steps, called);
			fireEvent.click(key('My next decision'));
			expect(onStep).toHaveBeenLastCalledWith(decisions[0]);
			unmount();

			const second = mount(called, decisions[0]);
			fireEvent.click(key('My next decision'));
			expect(second.onStep).toHaveBeenLastCalledWith(decisions[1]);
			second.unmount();

			mount(called, decisions.at(-1)!);
			expect(key('My next decision').disabled).toBe(true);
		});
	});
});
