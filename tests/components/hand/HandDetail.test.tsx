import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@solidjs/testing-library';

import HandDetail from '#c/hand/HandDetail';
import { analyzeLog } from '#utils/coach/report';
import { stepText, tableSteps } from '#utils/ui/tableReplay';

import { TWO_HAND_LOG } from '../../integration/appHarness';
import { BLINDS_HERO_SB, handText, TOUGH_FOLD } from '../../utils/history/handText';

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

	describe('the table', () => {
		it('is drawn at the step it is given', () => {
			render(() => <HandDetail hand={opened} number={2} total={2} step={0} />);
			const table = screen.getByRole('region', {
				name: 'The table at this point in the hand',
			});
			expect(within(table).getByRole('group', { name: 'UTG hero' })).toBeTruthy();
			expect(within(table).getByText('Pot')).toBeTruthy();
			expect(table.querySelector('.hand-table__seat.is-acting')).toBeNull();
		});

		it('opens on the hand’s first finding when given no step', () => {
			render(() => <HandDetail hand={folded} number={1} total={2} />);
			const hero = screen.getByRole('group', { name: 'UTG hero' });
			expect(hero.classList.contains('is-acting')).toBe(true);
			expect(hero.classList.contains('is-folded')).toBe(true);
		});

		it('is left out of a hand with no seats to draw', () => {
			render(() => <HandDetail hand={{ ...opened, seats: [] }} number={2} total={2} />);
			expect(screen.queryByRole('region')).toBeNull();
			expect(screen.getByText('hero (UTG) raises to $0.25')).toBeTruthy();
		});
	});

	describe('the action', () => {
		const line = (text: string) => screen.getByText(text).closest('button')!;
		// The strip names the streets too.
		const log = () => within(screen.getByRole('navigation', { name: 'Play by play' }));

		it('is a list of places to jump the table to', () => {
			const onStep = vi.fn();
			render(() => (
				<HandDetail hand={opened} number={2} total={2} step={0} onStep={onStep} />
			));
			fireEvent.click(line('p3 (CO) folds'));
			const steps = tableSteps(opened);
			const to = onStep.mock.lastCall![0] as number;
			expect(stepText(opened, steps[to])).toBe('p3 folds');
		});

		it('marks the line the table stands at, and those not yet played', () => {
			const steps = tableSteps(opened);
			const at = steps.findIndex((step) => stepText(opened, step) === 'p3 folds');
			render(() => <HandDetail hand={opened} number={2} total={2} step={at} />);
			expect(line('p3 (CO) folds').getAttribute('aria-current')).toBe('step');
			expect(line('p2 (HJ) folds').getAttribute('aria-current')).toBeNull();
			expect(line('p2 (HJ) folds').classList.contains('is-ahead')).toBe(false);
			expect(line('p4 (BTN) folds').classList.contains('is-ahead')).toBe(true);
		});

		it('stands for the deal with the street’s heading, not with a blind', () => {
			const onStep = vi.fn();
			render(() => (
				<HandDetail hand={opened} number={2} total={2} step={0} onStep={onStep} />
			));
			const heading = log().getByRole('button', { name: /^preflop/ });
			expect(heading.getAttribute('aria-current')).toBe('step');
			expect(heading.textContent).toContain('pot 1.5 bb');
			const blind = line('p6 (BB) posts big blind $0.10');
			expect(blind.getAttribute('aria-current')).toBeNull();
			fireEvent.click(blind);
			expect(onStep).toHaveBeenLastCalledWith(0);
		});

		it('lists a street that was dealt with nobody left to act', () => {
			const runout = analyzeLog(
				handText({
					id: 8001,
					heroCards: 'Ah Ad',
					button: 6,
					stacks: { p2: 2 },
					lines: [
						...BLINDS_HERO_SB,
						'*** HOLE CARDS ***',
						...['p3', 'p4', 'p5', 'p6'].map((name) => `${name}: folds`),
						'hero: raises $9.95 to $10 and is all-in',
						'p2: calls $1.90 and is all-in',
						'Uncalled bet ($8) returned to hero',
						'*** FLOP *** [Kd 7s 2c]',
						'*** TURN *** [Kd 7s 2c] [3h]',
						'*** RIVER *** [Kd 7s 2c 3h] [9d]',
						'*** SHOW DOWN ***',
						'p2: shows [Kc Qc] (a pair of Kings)',
						'hero: shows [Ah Ad] (a pair of Aces)',
						'hero collected $4 from pot',
					],
					pot: '4',
					winner: 'hero',
				})
			).hands[0];
			const onStep = vi.fn();
			render(() => (
				<HandDetail hand={runout} number={1} total={1} step={0} onStep={onStep} />
			));
			const river = log().getByRole('button', { name: /^river/ });
			expect(within(river).getByLabelText('9d')).toBeTruthy();
			expect(river.textContent).toContain('pot 40 bb');
			fireEvent.click(screen.getByRole('button', { name: 'Showdown' }));
			expect(onStep).toHaveBeenLastCalledWith(tableSteps(runout).length - 1);
		});

		it('is plain rows where there is no table to jump', () => {
			render(() => <HandDetail hand={{ ...opened, seats: [] }} number={2} total={2} />);
			expect(screen.getByText('p3 (CO) folds').closest('button')).toBeNull();
			expect(screen.queryByRole('button', { name: /^preflop/ })).toBeNull();
		});
	});

	describe('the hero’s decisions', () => {
		it('tags one the baseline agrees with in its line, without a card', () => {
			const { container } = render(() => (
				<HandDetail hand={opened} number={2} total={2} />
			));
			const line = screen.getByText('hero (UTG) raises to $0.25').closest('li')!;
			expect(line.textContent).toContain('on baseline');
			expect(container.querySelector('.mistake-card')).toBeNull();
		});

		it('tags a mistake in its line with its severity and cost', () => {
			render(() => <HandDetail hand={folded} number={1} total={2} step={0} />);
			const tag = screen
				.getByText('hero (UTG) folds')
				.closest('li')!
				.querySelector('.hand-detail__tag')!;
			const { severity } = folded.gradings[0];
			expect(tag.classList.contains(`is-${severity}`)).toBe(true);
			expect(tag.textContent).toMatch(new RegExp(`^${severity} −\\d+\\.\\dbb$`));
		});

		it('tags a good play in its line with its gain', () => {
			const laidDown = analyzeLog(handText(TOUGH_FOLD)).hands[0];
			const { container } = render(() => (
				<HandDetail hand={laidDown} number={1} total={1} step={0} />
			));
			const tag = container.querySelector('.hand-detail__tag.is-good-play')!;
			expect(tag.textContent).toMatch(/^great play \+\d+\.\dbb$/);
		});

		it('keeps the card out of the list: it is the caption’s, at that step', () => {
			const { container } = render(() => (
				<HandDetail hand={folded} number={1} total={2} step={0} />
			));
			expect(container.querySelector('.mistake-card')).toBeNull();
		});

		it('shows a mistake’s card and chart in the caption when the table is on it', () => {
			const { container } = render(() => (
				<HandDetail hand={folded} number={1} total={2} />
			));
			expect(
				screen.getByRole('heading', { name: 'Folded a standard open' })
			).toBeTruthy();
			expect(screen.getByText('Baseline range: UTG, first in')).toBeTruthy();
			expect(container.querySelector('.hand-detail__log .mistake-card')).toBeNull();
			expect(container.querySelector('.step-caption .mistake-card')).not.toBeNull();
		});
	});

	describe('the strip', () => {
		it('asks for the step its keys name', () => {
			const onStep = vi.fn();
			render(() => (
				<HandDetail hand={opened} number={2} total={2} step={2} onStep={onStep} />
			));
			fireEvent.click(screen.getByRole('button', { name: 'Forward a step' }));
			expect(onStep).toHaveBeenLastCalledWith(3);
		});
	});
});
