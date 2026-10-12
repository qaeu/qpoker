import { describe, expect, it } from 'vitest';
import { render, screen } from '@solidjs/testing-library';

import StepCaption from '#c/hand/StepCaption';
import { analyzeLog, type HandReport } from '#utils/coach/report';
import { stepOfLine, tableSteps } from '#utils/ui/tableReplay';

import { TWO_HAND_LOG } from '../../integration/appHarness';
import { handText, RIVER_HERO_CALL } from '../../utils/history/handText';

const [folded, opened] = analyzeLog(TWO_HAND_LOG).hands;
const called = analyzeLog(handText(RIVER_HERO_CALL)).hands[0];

function mount(hand: HandReport, step: number) {
	const steps = tableSteps(hand);
	const at = step < 0 ? steps.length + step : step;
	return render(() => <StepCaption hand={hand} steps={steps} step={at} />);
}

/** The step of the line ending in `text`. */
const stepAt = (hand: HandReport, text: string) =>
	stepOfLine(
		tableSteps(hand),
		hand.lines.find((line) => line.text.endsWith(text))!.stepIndex
	);

const part = (container: HTMLElement, name: string) =>
	container.querySelector(`.step-caption__${name}`)?.textContent;

describe('StepCaption', () => {
	describe('where and what', () => {
		it('places the step in the hand and says it in big blinds', () => {
			const { container } = mount(opened, 0);
			expect(part(container, 'where')).toBe('Preflop · step 1 of 8');
			expect(part(container, 'text')).toBe('Blinds posted, cards dealt');
			expect(part(container, 'facts')).toBe('Pot 1.5 bb · 6 players in');
		});

		it('marks an action as the hero’s', () => {
			const { container } = mount(opened, stepAt(opened, 'raises to $0.25'));
			const text = container.querySelector('.step-caption__text')!;
			expect(text.textContent).toBe('hero raises to 2.5 bb');
			expect(text.classList.contains('is-hero')).toBe(true);
		});

		it('gives the price when the hero faces a bet', () => {
			const { container } = mount(called, stepAt(called, 'hero (SB) calls $4.00'));
			expect(part(container, 'facts')).toBe('40 bb to call into 60 bb · pot odds 40%');
		});

		it('does not give a price to someone else’s call', () => {
			const { container } = mount(called, stepAt(called, 'p2 (BB) calls $0.50'));
			expect(part(container, 'facts')).toBe('Pot 20 bb · 2 players in');
		});

		it('ends on who was paid', () => {
			const { container } = mount(called, -1);
			expect(part(container, 'where')).toMatch(/^Showdown · step \d+ of \d+$/);
			expect(part(container, 'text')).toBe('p2 wins 100 bb');
		});

		it('announces itself politely', () => {
			const { container } = mount(opened, 0);
			expect(container.firstElementChild!.getAttribute('aria-live')).toBe('polite');
		});
	});

	describe('the equity', () => {
		it('is given at the deal, against everyone dealt in', () => {
			const { container } = mount(opened, 0);
			expect(part(container, 'equity')).toMatch(
				/^Equity about \d+% · an estimate against 5 modelled ranges$/
			);
		});

		it('is the percent the mistake card gives', () => {
			const { container } = mount(called, stepAt(called, 'hero (SB) calls $4.00'));
			const shown = /about (\d+%)/.exec(part(container, 'equity')!)![1];
			expect(container.querySelector('.mistake-card')!.textContent).toContain(
				`about ${shown} equity`
			);
		});

		it('is gone once the hero has folded, and at the result', () => {
			expect(
				part(mount(folded, stepAt(folded, 'hero (UTG) folds')).container, 'equity')
			).toBeUndefined();
			expect(part(mount(called, -1).container, 'equity')).toBeUndefined();
		});
	});

	describe('the grade', () => {
		it('says nothing at a step that was not the hero’s decision', () => {
			const { container } = mount(opened, 0);
			expect(part(container, 'baseline')).toBeUndefined();
			expect(container.querySelector('.mistake-card')).toBeNull();
		});

		it('tags a decision the baseline agrees with, without a card', () => {
			const { container } = mount(opened, stepAt(opened, 'raises to $0.25'));
			expect(part(container, 'baseline')).toBe('on baseline');
			expect(part(container, 'note')).toBeUndefined();
			expect(container.querySelector('.mistake-card')).toBeNull();
		});

		it('says which way the baseline leaned when it was only near', () => {
			const hand = structuredClone(opened);
			const grading = hand.gradings[0];
			grading.recommended = 'fold';
			const { container } = mount(hand, stepOfLine(tableSteps(hand), grading.stepIndex));
			expect(part(container, 'baseline')).toBe('near baseline');
			expect(part(container, 'note')).toBe(
				'The baseline leans to fold, but not by enough to matter.'
			);
		});

		it('gives a mistake its card and the chart it was graded against', () => {
			mount(folded, stepAt(folded, 'hero (UTG) folds'));
			expect(
				screen.getByRole('heading', { name: 'Folded a standard open' })
			).toBeTruthy();
			expect(screen.getByText('Baseline range: UTG, first in')).toBeTruthy();
			expect(screen.getByTitle(/^AA: raises 100%/).classList.contains('is-marked')).toBe(
				true
			);
			expect(screen.queryByText('on baseline')).toBeNull();
		});

		it('gives a postflop mistake its card, with no chart to show', () => {
			const { container } = mount(called, stepAt(called, 'hero (SB) calls $4.00'));
			expect(
				screen.getByRole('heading', { name: 'Called without the price' })
			).toBeTruthy();
			expect(container.querySelector('.step-caption__chart')).toBeNull();
		});
	});
});
