import { describe, it, expect } from 'vitest';

import { parseHistory } from '#utils/history/parse';
import { decisionsOf, layoutOf, replayHand } from '#utils/history/replay';

import emailed from '../../fixtures/emailed.txt?raw';
import {
	BLINDS_HERO_BTN,
	BLINDS_HERO_SB,
	handText,
	NINE_SEATS,
	ringHand,
} from './handText';

describe('replaying the emailed fixture', () => {
	const replays = parseHistory(emailed).map(replayHand);

	it('reconciles every hand with its stated pot', () => {
		expect(replays.map((replay) => replay.reconciled)).toEqual([true, true, true, true]);
	});

	it('seats a five-handed table from the big blind back', () => {
		const { layout } = replays.at(-1)!;
		expect(layout!.players).toEqual([
			'hero77',
			'N1K0-ARG',
			'Brakeman1990',
			'Olaf Two',
			'd.quill2021',
		]);
		expect(layout!.positions).toEqual({
			hero77: 'HJ',
			'N1K0-ARG': 'CO',
			Brakeman1990: 'BTN',
			'Olaf Two': 'SB',
			'd.quill2021': 'BB',
		});
	});

	it('charges an all-in loss in full, even when the winner cashed out', () => {
		expect(replays.at(-1)!.net.hero77).toBe(-233);
		expect(replays.at(-1)!.net.Brakeman1990).toBe(83 - 233);
	});

	it('records what the hero faced at each decision', () => {
		const steps = decisionsOf(replays.at(-1)!, 'hero77');
		expect(steps.map((step) => step.action.kind)).toEqual(['raise', 'raise', 'call']);
		expect(steps[0]).toMatchObject({ potBefore: 7, toCall: 5, raisesBefore: 0 });
		expect(steps[1]).toMatchObject({ potBefore: 47, toCall: 10, raisesBefore: 2 });
		// The shove is for more than the hero has: the call is capped at the stack.
		expect(steps[2]).toMatchObject({
			toCall: 151,
			stackBefore: 151,
			effectiveStack: 233,
		});
		expect(steps[2].live).toEqual(['hero77', 'Brakeman1990']);
	});
});

describe('positions', () => {
	const fold = (names: string[]) => names.map((name) => `${name}: folds`);

	it('makes the small blind the button heads-up', () => {
		const text = handText({
			heroCards: '7c 2d',
			button: 1,
			lines: [
				'hero: posts small blind $0.05',
				'p2: posts big blind $0.10',
				'*** HOLE CARDS ***',
				'hero: folds',
				'Uncalled bet ($0.05) returned to p2',
				'p2 collected $0.10 from pot',
			],
			pot: '0.10',
			winner: 'p2',
		})
			.split('\n')
			.filter((line) => !/^Seat [3-6]: p\d \(/.test(line))
			.join('\n');
		const layout = layoutOf(parseHistory(text)[0])!;
		expect(layout.positions).toEqual({ hero: 'BTN', p2: 'BB' });
		expect(layout.players).toEqual(['hero', 'p2']);
	});

	it('names all six seats', () => {
		const text = handText({
			heroCards: '7c 2d',
			button: 1,
			lines: [
				...BLINDS_HERO_BTN,
				'*** HOLE CARDS ***',
				...fold(['p4', 'p5', 'p6', 'hero', 'p2']),
				'Uncalled bet ($0.05) returned to p3',
				'p3 collected $0.10 from pot',
			],
			pot: '0.10',
			winner: 'p3',
		});
		const replay = replayHand(parseHistory(text)[0]);
		expect(replay.layout!.positions).toEqual({
			p4: 'UTG',
			p5: 'HJ',
			p6: 'CO',
			hero: 'BTN',
			p2: 'SB',
			p3: 'BB',
		});
		expect(replay.reconciled).toBe(true);
		expect(replay.net).toMatchObject({ hero: 0, p2: -5, p3: 5 });
	});

	it('tracks the pot and the price across streets', () => {
		const text = handText({
			heroCards: 'Ah Kh',
			button: 6,
			lines: [
				...BLINDS_HERO_SB,
				'*** HOLE CARDS ***',
				...fold(['p3', 'p4', 'p5', 'p6']),
				'hero: raises $0.20 to $0.30',
				'p2: calls $0.20',
				'*** FLOP *** [Kd 7s 2c]',
				'hero: bets $0.20',
				'p2: raises $0.40 to $0.60',
				'hero: calls $0.40',
				'*** TURN *** [Kd 7s 2c] [3h]',
				'hero: checks',
				'p2: checks',
				'*** RIVER *** [Kd 7s 2c 3h] [9d]',
				'hero: checks',
				'p2: checks',
				'*** SHOW DOWN ***',
				'hero: shows [Ah Kh] (a pair of Kings)',
				'p2: mucks hand',
				'hero collected $1.80 from pot',
			],
			pot: '1.80',
			winner: 'hero',
		});
		const replay = replayHand(parseHistory(text)[0]);
		expect(replay.reconciled).toBe(true);
		expect(replay.net).toMatchObject({ hero: 90, p2: -90, p3: 0 });
		const steps = decisionsOf(replay, 'hero');
		// Facing the flop raise: 60 from the flop, 20 + 60 bet into it, 40 to call.
		expect(steps[2]).toMatchObject({
			street: 'flop',
			potBefore: 140,
			streetPot: 60,
			toCall: 40,
			raisesBefore: 2,
		});
		expect(steps[2].board).toHaveLength(3);
		expect(steps[3]).toMatchObject({ street: 'turn', potBefore: 180, toCall: 0 });
		// The big blind acts last heads-up postflop.
		expect(steps[3].live).toEqual(['hero', 'p2']);
	});
});

describe('a fuller table', () => {
	const seated = (text: string) => {
		const layout = layoutOf(parseHistory(text)[0])!;
		return layout.players.map((name) => layout.positions[name]);
	};

	describe('the names', () => {
		it('adds a lojack at seven, then the seats after UTG', () => {
			expect(seated(ringHand(7))).toEqual(['UTG', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
			expect(seated(ringHand(8))).toEqual([
				'UTG',
				'UTG+1',
				'LJ',
				'HJ',
				'CO',
				'BTN',
				'SB',
				'BB',
			]);
			expect(seated(ringHand(9))).toEqual([
				'UTG',
				'UTG+1',
				'UTG+2',
				'LJ',
				'HJ',
				'CO',
				'BTN',
				'SB',
				'BB',
			]);
		});

		it('leaves six and fewer as they were', () => {
			expect(seated(ringHand(6))).toEqual(['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
			expect(seated(ringHand(4))).toEqual(['CO', 'BTN', 'SB', 'BB']);
		});

		it('counts the seats earlier than any chart', () => {
			const extra = (players: number) =>
				layoutOf(parseHistory(ringHand(players))[0])!.extra;
			expect([6, 7, 8, 9].map(extra)).toEqual([0, 1, 2, 3]);
		});

		it('names no seat twice when the small blind is dead', () => {
			const text = handText({
				heroCards: '7c 2d',
				button: 5,
				lines: [
					'p6: posts big blind $0.10',
					'*** HOLE CARDS ***',
					...['hero', 'p2', 'p3', 'p4', 'p5'].map((name) => `${name}: folds`),
					'p6 collected $0.10 from pot',
				],
				pot: '0.10',
				winner: 'p6',
			});
			expect(seated(text)).toEqual(['UTG', 'LJ', 'HJ', 'CO', 'BTN', 'BB']);
		});
	});

	describe('who is dealt in', () => {
		it('leaves out a seat that is sitting out', () => {
			const text = ringHand(9)
				.replace('Seat 4: p4 ($10 in chips)', 'Seat 4: p4 ($10 in chips) is sitting out')
				.replace('p4: folds\n', '');
			const layout = layoutOf(parseHistory(text)[0])!;
			expect(layout.players).not.toContain('p4');
			expect(layout.players).toHaveLength(8);
			expect(layout.positions).toMatchObject({ hero: 'UTG', p2: 'UTG+1', p3: 'LJ' });
		});

		it('seats nobody past a full ring', () => {
			const seats = [...NINE_SEATS, 'p10'];
			const text = handText({
				heroCards: '7c 2d',
				button: 8,
				seats,
				max: 10,
				lines: [
					'p9: posts small blind $0.05',
					'p10: posts big blind $0.10',
					'*** HOLE CARDS ***',
					...seats.slice(0, 9).map((name) => `${name}: folds`),
					'Uncalled bet ($0.05) returned to p10',
					'p10 collected $0.10 from pot',
				],
				pot: '0.10',
				winner: 'p10',
			});
			expect(layoutOf(parseHistory(text)[0])).toBeNull();
		});
	});

	describe('the order after the flop', () => {
		it('puts the blinds first and the rest as they acted preflop', () => {
			const text = handText({
				heroCards: 'Ah Kh',
				button: 7,
				seats: NINE_SEATS,
				max: 9,
				lines: [
					'p8: posts small blind $0.05',
					'p9: posts big blind $0.10',
					'*** HOLE CARDS ***',
					'hero: raises $0.15 to $0.25',
					'p2: folds',
					'p3: folds',
					'p4: calls $0.25',
					'p5: folds',
					'p6: folds',
					'p7: calls $0.25',
					'p8: calls $0.20',
					'p9: calls $0.15',
					'*** FLOP *** [Kd 7s 2c]',
					'p8: checks',
					'p9: checks',
					'hero: bets $1',
					'p4: folds',
					'p7: folds',
					'p8: folds',
					'p9: folds',
					'Uncalled bet ($1) returned to hero',
					'hero collected $1.25 from pot',
				],
				pot: '1.25',
				winner: 'hero',
			});
			const replay = replayHand(parseHistory(text)[0]);
			expect(replay.reconciled).toBe(true);
			const flop = replay.steps.find((step) => step.street === 'flop')!;
			expect(flop.live).toEqual(['p8', 'p9', 'hero', 'p4', 'p7']);
		});
	});
});
