import { describe, expect, it } from 'vitest';

import { analyzeLog } from '#utils/coach/report';
import { handNotation } from '#utils/ui/handNotation';

import { TWO_HAND_LOG } from '../../integration/appHarness';
import { handText, RIVER_HERO_CALL, TOUGH_FOLD } from '../history/handText';

describe('handNotation', () => {
	const [called] = analyzeLog(handText(RIVER_HERO_CALL)).hands;
	const [folded, opened] = analyzeLog(TWO_HAND_LOG).hands;

	describe('a hand played to showdown', () => {
		it('is written street by street in big blinds, with seats for names', () => {
			expect(handNotation(called)).toBe(
				[
					'NLHE $0.05/$0.10 · 6-handed · #7001',
					'Hero (SB): 5h 4h',
					'Stacks: SB 100 bb (Hero), BB 100 bb',
					'',
					'Preflop: Hero opens 3 bb, BB calls',
					'Flop (6 bb) [Kd 7s 2c]: Hero bets 2 bb, BB calls',
					'Turn (10 bb) [3h]: Hero bets 5 bb, BB calls',
					'River (20 bb) [9d]: Hero checks, BB bets 40 bb, Hero calls',
					'Showdown: BB shows Kc Qc',
					'Result: BB wins 100 bb · Hero −50 bb',
				].join('\n')
			);
		});

		it('names no opponent', () => {
			for (const seat of called.seats.filter(({ hero }) => !hero))
				expect(handNotation(called)).not.toContain(seat.name);
		});
	});

	describe('a hand over before the flop', () => {
		it('stops at the preflop line and the result', () => {
			const lines = handNotation(opened).split('\n');
			expect(lines.slice(-2)).toEqual([
				'Preflop: Hero opens 2.5 bb',
				'Result: Hero wins 2.5 bb · Hero +1.5 bb',
			]);
		});

		it('gives a hand that cost nothing an unsigned zero', () => {
			expect(handNotation(folded)).toContain('Result: BB wins 1 bb · Hero 0 bb');
		});

		it('keeps the hero’s own fold, and the stack of whoever was left', () => {
			const text = handNotation(folded);
			expect(text).toContain('Stacks: UTG 100 bb (Hero), BB 100 bb');
			expect(text).toContain('Preflop: Hero folds\n');
		});
	});

	describe('a raised pot', () => {
		it('calls only the first raise an open, and keeps a fold by someone who was in', () => {
			const [hand] = analyzeLog(handText(TOUGH_FOLD)).hands;
			const text = handNotation(hand);
			expect(text).toContain('Stacks: UTG 100 bb (Hero), BB 100 bb');
			expect(text).toContain(
				'Preflop: Hero opens 2.5 bb, BB raises to 10 bb, Hero raises to 24 bb, BB raises to 100 bb (all-in), Hero folds'
			);
		});
	});

	describe('a hand with no seats to go by', () => {
		it('leaves out the stacks and the pots, and falls back on the names', () => {
			const text = handNotation({ ...called, seats: [] });
			expect(text).not.toContain('Stacks:');
			expect(text).toContain('Flop [Kd 7s 2c]: Hero bets 2 bb, p2 calls');
		});
	});
});
