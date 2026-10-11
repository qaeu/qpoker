import { describe, it, expect } from 'vitest';

import { cardsText } from '#utils/cards/cards';
import { decodeHistory, isQuotedPrintable } from '#utils/history/decode';
import { parseHistory } from '#utils/history/parse';

import emailed from '../../fixtures/emailed.txt?raw';
import { BLINDS_HERO_UTG, handText } from './handText';

describe('decoding', () => {
	it('recognises a quoted-printable export', () => {
		expect(isQuotedPrintable(emailed)).toBe(true);
		expect(isQuotedPrintable('Seat 1: a ($5 in chips)\nSeat 2: b ($5 in chips)\n')).toBe(
			false
		);
	});

	it('joins soft breaks, restores escapes and normalises line endings', () => {
		const decoded = decodeHistory('one tw=\r\no=20\r\nna=C3=AFve\r\n');
		expect(decoded).toBe('one two \nnaïve\n');
	});

	it('leaves a plain history alone but for its line endings', () => {
		expect(decodeHistory('a = b\r\nc\r\n')).toBe('a = b\nc\n');
	});
});

describe('parsing an emailed history', () => {
	const hands = parseHistory(emailed);

	it('finds every hand and orders them oldest first', () => {
		expect(hands).toHaveLength(4);
		const stamps = hands.map((hand) => hand.timestamp);
		expect(stamps).toEqual([...stamps].sort());
		expect(hands.at(-1)!.id).toBe('900000064774');
	});

	it('understands every line', () => {
		expect(hands.flatMap((hand) => hand.warnings)).toEqual([]);
		expect(hands.every((hand) => hand.gradeable)).toBe(true);
	});

	it('reads the header across a soft break', () => {
		const hand = hands.at(-1)!;
		expect(hand.timestamp).toBe('2026-10-06T03:37:57');
		expect(hand.stakes).toEqual({ smallBlind: 2, bigBlind: 5, currency: 'USD' });
		expect(hand.table).toBe('Fixture I');
		expect(hand.maxSeats).toBe(6);
		expect(hand.buttonSeat).toBe(3);
	});

	it('reads the hero, stacks in cents and names with spaces', () => {
		const hand = hands.at(-1)!;
		expect(hand.hero).toBe('hero77');
		expect(cardsText(hand.heroCards)).toBe('Kd Ks');
		expect(hand.seats.map((seat) => seat.name)).toContain('Olaf Two');
		expect(hand.seats.find((seat) => seat.name === 'Olaf Two')!.stack).toBe(1025);
		expect(hand.actions.some((action) => action.player === 'Olaf Two')).toBe(true);
	});

	it('turns a raise into the chips it added', () => {
		const raises = hands.at(-1)!.actions.filter((action) => action.kind === 'raise');
		// hero77 opens to 15 over a 5 big blind he did not post, then 4-bets to 82.
		expect(raises[0]).toMatchObject({ player: 'hero77', amount: 15, to: 15 });
		expect(raises[2]).toMatchObject({ player: 'hero77', amount: 67, to: 82 });
		expect(raises[3]).toMatchObject({ player: 'Brakeman1990', allIn: true, to: 327 });
	});

	it('records a cash-out and the pot it was paid from', () => {
		const hand = hands.at(-1)!;
		expect(hand.cashedOut).toEqual({ Brakeman1990: 83 });
		expect(hand.won).toEqual({ Brakeman1990: 449 });
		expect(hand.totalPot).toBe(473);
		expect(hand.rake).toBe(24);
		expect(hand.uncalled).toEqual([{ player: 'Brakeman1990', amount: 94 }]);
	});

	it('reads shown cards from a summary line folded mid-phrase', () => {
		const showdown = hands.find((hand) => cardsText(hand.board) === '2c 9d 5s Jd Jc')!;
		expect(cardsText(showdown.shown['Brakeman1990'])).toBe('3s 3h');
		expect(cardsText(showdown.shown['d.quill2021'])).toBe('7h 9h');
		expect(showdown.won).toEqual({ 'd.quill2021': 49 });
	});
});

describe('parsing odd input', () => {
	const base = {
		heroCards: 'As Ah',
		button: 4,
		pot: '0.25',
		winner: 'hero',
	};
	const lines = [
		...BLINDS_HERO_UTG,
		'*** HOLE CARDS ***',
		'hero: raises $0.15 to $0.25',
		'p2: folds',
		'p3: folds',
		'p4: folds',
		'p5: folds',
		'p6: folds',
		'Uncalled bet ($0.15) returned to hero',
		'hero collected $0.25 from pot',
	];

	it('warns about a line it does not know and carries on', () => {
		const [hand] = parseHistory(
			handText({ ...base, lines: [...lines, 'the dealer sneezes'] })
		);
		expect(hand.warnings).toEqual(['Unrecognised line: the dealer sneezes']);
		expect(hand.actions).toHaveLength(8);
		expect(hand.gradeable).toBe(true);
	});

	it('ignores table chatter', () => {
		const [hand] = parseHistory(
			handText({
				...base,
				lines: [
					...lines,
					'p9 joins the table at seat #3',
					'p4 said, "nh"',
					'p3 has timed out',
				],
			})
		);
		expect(hand.warnings).toEqual([]);
	});

	it('marks a hand it cannot model as ungradeable', () => {
		const text = handText({ ...base, lines }).replace(
			"Hold'em No Limit",
			'Omaha Pot Limit'
		);
		const [hand] = parseHistory(text);
		expect(hand.gradeable).toBe(false);
		expect(hand.warnings[0]).toMatch(/Not a No-Limit Hold'em cash hand/);
	});

	it('returns nothing for text with no hands in it', () => {
		expect(parseHistory('hello\nworld\n')).toEqual([]);
	});
});

describe('parsing a network skin', () => {
	const plain = handText({
		id: 4321,
		heroCards: 'As Kd',
		button: 4,
		lines: [...BLINDS_HERO_UTG, '*** HOLE CARDS ***', 'hero: raises $0.15 to $0.25'],
		pot: '0.25',
		winner: 'hero',
	});
	const skinned = plain.replace(/^PokerStars Hand #/, 'Betfair Hand #');

	it('reads a hand headed by another brand like a PokerStars one', () => {
		const [hand] = parseHistory(skinned);
		expect(hand.warnings).toEqual([]);
		expect(hand.gradeable).toBe(true);
		expect(hand).toEqual(parseHistory(plain)[0]);
	});

	it('does not start a hand on a line that only mentions one', () => {
		const chatty = skinned.replace(
			'*** HOLE CARDS ***',
			'*** HOLE CARDS ***\np2 said, "Betfair Hand #12: was mine"'
		);
		expect(parseHistory(chatty)).toHaveLength(1);
	});
});
