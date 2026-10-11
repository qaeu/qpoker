import { describe, it, expect } from 'vitest';

import { parseHistory } from '#utils/history/parse';
import { decisionsOf, layoutOf, replayHand } from '#utils/history/replay';

import emailed from '../../fixtures/emailed.txt?raw';
import { BLINDS_HERO_BTN, BLINDS_HERO_SB, handText } from './handText';

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
