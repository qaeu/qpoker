import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@solidjs/testing-library';

import HandTable from '#c/hand/HandTable';
import { analyzeLog } from '#utils/coach/report';
import { tableSteps } from '#utils/ui/tableReplay';

import {
	handText,
	ringHand,
	RIVER_HERO_CALL,
	TOUGH_FOLD,
} from '../../utils/history/handText';

// Hero in the small blind against p2: an open, two barrels, and a called river.
const hand = analyzeLog(handText(RIVER_HERO_CALL)).hands[0];
const steps = tableSteps(hand);
const at = (text: string) => {
	const line = hand.lines.find((candidate) => candidate.text.endsWith(text))!;
	return steps.find((step) => step.lineIndex === line.stepIndex)!;
};
const seat = (name: string) => screen.getByRole('group', { name });
const text = (element: Element | null) => element?.textContent ?? '';

describe('HandTable', () => {
	describe('the seats', () => {
		it('sits everyone dealt in by position, the hero at the bottom', () => {
			render(() => <HandTable hand={hand} step={steps[0]} />);
			expect(seat('SB hero').classList.contains('hand-table__seat--slot-0')).toBe(true);
			expect(seat('SB hero').classList.contains('is-hero')).toBe(true);
			expect(seat('BB p2').classList.contains('hand-table__seat--slot-1')).toBe(true);
			expect(
				screen.getAllByRole('group', { name: /^(UTG|HJ|CO|BTN|SB|BB) / })
			).toHaveLength(6);
		});

		it('shows each stack in big blinds after the step', () => {
			render(() => <HandTable hand={hand} step={steps[0]} />);
			expect(text(seat('SB hero').querySelector('.hand-table__stack'))).toBe('99.5bb');
			expect(text(seat('BB p2').querySelector('.hand-table__stack'))).toBe('99bb');
			expect(text(seat('UTG p3').querySelector('.hand-table__stack'))).toBe('100bb');
		});

		it('turns the hero’s cards up and leaves the others face down', () => {
			render(() => <HandTable hand={hand} step={steps[0]} />);
			expect(within(seat('SB hero')).getByLabelText('5h 4h')).toBeTruthy();
			expect(within(seat('BB p2')).getByLabelText('2 cards, face down')).toBeTruthy();
		});

		it('tags what a seat last did and marks the one that acted', () => {
			render(() => <HandTable hand={hand} step={at('raises to $0.30')} />);
			const hero = seat('SB hero');
			expect(hero.classList.contains('is-acting')).toBe(true);
			expect(text(hero.querySelector('.hand-table__tag'))).toBe('Raise');
			expect(text(seat('BB p2').querySelector('.hand-table__tag'))).toBe('Blind');
			expect(seat('BB p2').classList.contains('is-acting')).toBe(false);
		});

		it('takes a folded seat’s cards away and dims it', () => {
			render(() => <HandTable hand={hand} step={at('raises to $0.30')} />);
			const folded = seat('BTN p6');
			expect(folded.classList.contains('is-folded')).toBe(true);
			expect(text(folded.querySelector('.hand-table__tag'))).toBe('Fold');
			expect(folded.querySelector('.playing-cards')).toBeNull();
		});

		it('tags a seat with nothing behind as all-in', () => {
			const shove = analyzeLog(handText(TOUGH_FOLD)).hands[0];
			const shoved = tableSteps(shove).find(
				(step) => step.actor !== null && step.seats[step.actor].allIn
			)!;
			render(() => <HandTable hand={shove} step={shoved} />);
			expect(text(seat('BB p6').querySelector('.hand-table__tag'))).toBe('All-in');
		});
	});

	describe('a full ring', () => {
		const full = analyzeLog(ringHand(9, 'As Kd', 'raise')).hands[0];
		const fullSteps = tableSteps(full);

		it('seats nine in places of their own, on a table marked full', () => {
			const { container } = render(() => <HandTable hand={full} step={fullSteps[0]} />);
			expect(
				container.querySelector('.hand-table')!.classList.contains('hand-table--full')
			).toBe(true);
			expect(seat('UTG hero').classList.contains('hand-table__seat--slot-10')).toBe(true);
			expect(seat('UTG+2 p3').classList.contains('hand-table__seat--slot-12')).toBe(true);
			expect(seat('BB p9').classList.contains('hand-table__seat--slot-18')).toBe(true);
			expect(
				screen
					.getByRole('img', { name: 'Dealer button' })
					.classList.contains('hand-table__dealer--slot-16')
			).toBe(true);
		});

		it('is not marked full at six', () => {
			const { container } = render(() => <HandTable hand={hand} step={steps[0]} />);
			expect(
				container.querySelector('.hand-table')!.classList.contains('hand-table--full')
			).toBe(false);
		});
	});

	describe('the bets', () => {
		it('puts a chip in front of each seat with money out, coloured by how', () => {
			const { container } = render(() => (
				<HandTable hand={hand} step={at('p2 (BB) calls $0.20')} />
			));
			const bets = [...container.querySelectorAll('.hand-table__bet')];
			expect(bets.map(text)).toEqual(['3', '3']);
			expect(bets.map((bet) => bet.className)).toEqual([
				'hand-table__bet hand-table__bet--slot-0 is-raise',
				'hand-table__bet hand-table__bet--slot-1 is-call',
			]);
		});

		it('marks a blind as one', () => {
			const { container } = render(() => <HandTable hand={hand} step={steps[0]} />);
			const bets = [...container.querySelectorAll('.hand-table__bet')];
			expect(bets.map(text)).toEqual(['0.5', '1']);
			expect(bets.every((bet) => bet.classList.contains('is-blind'))).toBe(true);
		});

		it('sweeps them into the pot when the next street is dealt', () => {
			const flop = steps.find((step) => step.kind === 'deal' && step.street === 'flop')!;
			const { container } = render(() => <HandTable hand={hand} step={flop} />);
			expect(container.querySelectorAll('.hand-table__bet')).toHaveLength(0);
			expect(text(container.querySelector('.hand-table__pot'))).toBe('Pot6bb');
		});
	});

	describe('the board', () => {
		it('is five empty places before the flop', () => {
			const { container } = render(() => <HandTable hand={hand} step={steps[0]} />);
			expect(screen.getByRole('group', { name: 'Board: no cards yet' })).toBeTruthy();
			expect(container.querySelectorAll('.hand-table__slot')).toHaveLength(5);
		});

		it('shows what has been dealt and marks the cards this step turned', () => {
			const turn = steps.find((step) => step.kind === 'deal' && step.street === 'turn')!;
			const { container } = render(() => <HandTable hand={hand} step={turn} />);
			const board = screen.getByRole('group', { name: 'Board: Kd 7s 2c 3h' });
			expect(container.querySelectorAll('.hand-table__slot')).toHaveLength(1);
			const dealt = board.querySelectorAll('.hand-table__card.is-dealt');
			expect(dealt).toHaveLength(1);
			expect(within(dealt[0] as HTMLElement).getByLabelText('3h')).toBeTruthy();
		});
	});

	describe('the result', () => {
		it('turns over a shown hand and marks who was paid', () => {
			render(() => <HandTable hand={hand} step={steps.at(-1)!} />);
			const winner = seat('BB p2');
			expect(winner.classList.contains('is-winner')).toBe(true);
			expect(text(winner.querySelector('.hand-table__tag'))).toBe('Wins');
			expect(within(winner).getByLabelText('Kc Qc')).toBeTruthy();
			expect(text(winner.querySelector('.hand-table__stack'))).toBe('150bb');
		});
	});

	describe('the furniture', () => {
		it('puts the dealer button by the button’s seat', () => {
			render(() => <HandTable hand={hand} step={steps[0]} />);
			const slot = [...seat('BTN p6').classList]
				.find((name) => name.includes('--slot-'))!
				.split('--')[1];
			expect(
				screen
					.getByRole('img', { name: 'Dealer button' })
					.classList.contains(`hand-table__dealer--${slot}`)
			).toBe(true);
		});

		it('prints the blinds on the felt when told them', () => {
			render(() => <HandTable hand={hand} step={steps[0]} stakes="$0.05/$0.10" />);
			expect(screen.getByText('Blinds $0.05/$0.10')).toBeTruthy();
		});
	});
});
