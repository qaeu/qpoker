import { describe, it, expect } from 'vitest';

import {
	advanceAnalysis,
	analyzeLog,
	finishAnalysis,
	REPORT_VERSION,
	startAnalysis,
} from '#utils/coach/report';
import { summariseSession } from '#utils/coach/session';
import { parseHistory } from '#utils/history/parse';
import { replayHand } from '#utils/history/replay';

import emailed from '../../fixtures/emailed.txt?raw';
import { BLINDS_HERO_UTG, handText, ringHand, TOUGH_FOLD } from '../history/handText';

const folds = (...names: string[]) => names.map((name) => `${name}: folds`);

/** Hero under the gun: `count` hands, each opened or folded. */
function session(count: number, heroCards: string, opens: boolean): string {
	const hands: string[] = [];
	for (let i = 0; i < count; i++) {
		hands.push(
			handText({
				heroCards,
				button: 4,
				lines: [
					...BLINDS_HERO_UTG,
					'*** HOLE CARDS ***',
					opens ? 'hero: raises $0.15 to $0.25' : 'hero: folds',
					...folds('p2', 'p3', 'p4', 'p5'),
					...(opens ? ['p6: folds', 'Uncalled bet ($0.15) returned to hero'] : []),
					...(opens ?
						['hero collected $0.25 from pot']
					:	['Uncalled bet ($0.05) returned to p6', 'p6 collected $0.10 from pot']),
				],
				pot: opens ? '0.25' : '0.10',
				winner: opens ? 'hero' : 'p6',
			})
		);
	}
	return hands.join('\n');
}

describe('the report', () => {
	const report = analyzeLog(emailed, { seed: 5 });

	it('describes the log', () => {
		expect(report).toMatchObject({
			version: REPORT_VERSION,
			hero: 'hero77',
			stakes: '$0.02/$0.05',
			tables: ['Fixture I'],
			handCount: 4,
			gradedHands: 4,
			unreconciled: 0,
			warnings: [],
			seed: 5,
		});
		expect(report.firstHand < report.lastHand).toBe(true);
		// Only the all-in pot saw a flop, and it paid 24 in rake on 473.
		expect(report.rake).toBeCloseTo((24 + 3) / (473 + 52), 4);
	});

	it('reports every hand with its action and its grades', () => {
		const stackOff = report.hands.at(-1)!;
		expect(stackOff).toMatchObject({
			heroCards: 'Kd Ks',
			position: 'HJ',
			players: 5,
			board: '6s Qs 4c Jd 5h',
			gradeable: true,
		});
		expect(stackOff.netBb).toBeCloseTo(-46.6);
		expect(stackOff.gradings).toHaveLength(3);
		expect(stackOff.shown).toEqual({ hero77: 'Kd Ks', Brakeman1990: 'Jc Jh' });
		const open = stackOff.lines.find(
			(line) => line.hero && line.text.includes('raises')
		)!;
		expect(open.text).toBe('hero77 (HJ) raises to $0.15');
		expect(stackOff.gradings[0].stepIndex).toBe(open.stepIndex);
	});

	describe('what a hand carries for replaying its table', () => {
		const stackOff = report.hands.at(-1)!;

		it('is at the version that added it', () => {
			expect(REPORT_VERSION).toBe(6);
		});

		it('seats the players in acting order with their stacks in cents', () => {
			expect(stackOff.bigBlind).toBe(5);
			expect(stackOff.seats.map((seat) => [seat.name, seat.position])).toEqual([
				['hero77', 'HJ'],
				['N1K0-ARG', 'CO'],
				['Brakeman1990', 'BTN'],
				['Olaf Two', 'SB'],
				['d.quill2021', 'BB'],
			]);
			expect(stackOff.seats.filter((seat) => seat.hero).map((seat) => seat.name)).toEqual(
				['hero77']
			);
			expect(stackOff.seats.every((seat) => Number.isInteger(seat.stack))).toBe(true);
		});

		it('keeps each action as data beside its text', () => {
			const open = stackOff.lines.find(
				(line) => line.hero && line.text.includes('raises')
			)!;
			expect(open).toMatchObject({
				player: 'hero77',
				kind: 'raise',
				to: 15,
				allIn: false,
			});
			expect(stackOff.lines[0]).toMatchObject({ kind: 'post-sb', amount: 2 });
			expect('to' in stackOff.lines[0]).toBe(false);
		});

		it('pays a cash-out what it took, not the pot', () => {
			expect(stackOff.paid.Brakeman1990).toBe(83);
		});

		it('records an uncalled bet handed back', () => {
			const fold = analyzeLog(handText(TOUGH_FOLD)).hands[0];
			expect(fold.returned).toEqual({ p6: 760 });
			expect(fold.paid).toEqual({ p6: 485 });
		});
	});

	it('lists the mistakes costliest first and sums them', () => {
		const costs = report.mistakes.map((grading) => grading.evLostBb);
		expect(costs).toEqual([...costs].sort((a, b) => a - b));
		expect(report.totalEvLostBb).toBeCloseTo(costs.reduce((sum, cost) => sum + cost, 0));
		const leakTotal = report.leaks.reduce((sum, leak) => sum + leak.evLostBb, 0);
		expect(leakTotal).toBeCloseTo(report.totalEvLostBb);
		expect(report.leaks.reduce((sum, leak) => sum + leak.count, 0)).toBe(
			report.mistakes.length
		);
	});

	it('lists the good plays, the most valuable first', () => {
		// Nothing in the fixture was both right and hard.
		expect(report.goodPlays).toEqual([]);
		const log = [
			handText(TOUGH_FOLD),
			handText({ ...TOUGH_FOLD, id: 6002, heroCards: 'Ts Td' }),
		].join('\n');
		const plays = analyzeLog(log).goodPlays;
		expect(plays.map((grading) => grading.handId)).toEqual(['6001', '6002']);
		const gains = plays.map((grading) => grading.goodPlay!.evGainedBb);
		expect(gains[0]).toBeGreaterThan(gains[1]);
		for (const grading of plays) {
			expect(grading).toMatchObject({ mistake: null, evLostBb: 0 });
			expect(grading.chosen).toBe(grading.recommended);
		}
	});

	it('is a pure function of the text and the seed', () => {
		expect(analyzeLog(emailed, { seed: 5 })).toEqual(report);
	});

	it('survives a trip through JSON', () => {
		expect(JSON.parse(JSON.stringify(report))).toEqual(report);
	});

	it('can be run a few hands at a time', () => {
		const run = startAnalysis(emailed, { seed: 5 });
		expect(run).toMatchObject({ done: 0, total: 4 });
		expect(advanceAnalysis(run, 3)).toBe(false);
		expect(run.done).toBe(3);
		expect(advanceAnalysis(run, 3)).toBe(true);
		expect(finishAnalysis(run)).toEqual(report);
	});

	it('coaches whoever it is told to, without hole cards to grade', () => {
		const other = analyzeLog(emailed, { hero: 'Brakeman1990' });
		expect(other.hero).toBe('Brakeman1990');
		expect(other.gradedHands).toBe(0);
		expect(other.mistakes).toEqual([]);
		expect(other.session.hands).toBe(4);
		// Cashed out for 83 after putting in 233.
		expect(other.hands.at(-1)!.netBb).toBeCloseTo(-30);
	});

	it('is empty for an empty log', () => {
		const empty = analyzeLog('nothing here');
		expect(empty).toMatchObject({ handCount: 0, hero: '', mistakes: [], hands: [] });
	});
});

describe('session frequencies', () => {
	const stat = (text: string, id: string) =>
		summariseSession(parseHistory(text).map(replayHand), 'hero').stats.find(
			(candidate) => candidate.id === id
		)!;

	it('counts hands, results and the standard frequencies', () => {
		const summary = analyzeLog(emailed).session;
		expect(summary.hands).toBe(4);
		// Stacked, a 4-bet that took it down, a button fold, and a blind defence let go.
		expect(summary.netBb).toBeCloseTo(-46.6 + 9.4 + 0 - 2);
		const byId = Object.fromEntries(summary.stats.map((s) => [s.id, s]));
		expect(byId.vpip).toMatchObject({ count: 3, opportunities: 4, value: 0.75 });
		expect(byId.pfr).toMatchObject({ count: 2, opportunities: 4 });
		expect(byId.foldToThreeBet).toMatchObject({ count: 0, opportunities: 2 });
		expect(byId.wtsd).toMatchObject({ count: 1, opportunities: 2 });
		expect(byId.wonAtShowdown).toMatchObject({ count: 0, opportunities: 1 });
		expect(summary.positions.map((row) => row.position)).toEqual([
			'HJ',
			'CO',
			'BTN',
			'BB',
		]);
	});

	it('takes its preflop baseline from the charts for the spots played', () => {
		const rfi = stat(session(3, 'As Kd', true), 'rfi');
		expect(rfi).toMatchObject({ count: 3, opportunities: 3, baselineSource: 'charts' });
		// Under the gun the chart opens about 17% of hands.
		expect(rfi.baseline).toBeGreaterThan(0.12);
		expect(rfi.baseline).toBeLessThan(0.2);
		expect(stat(session(3, 'As Kd', true), 'cbet').baselineSource).toBe('typical');
	});

	it('calls a leak only when the sample can bear it', () => {
		// Three opens out of three says nothing; twenty out of twenty does.
		expect(stat(session(3, 'As Kd', true), 'rfi').leak).toBeNull();
		expect(stat(session(20, 'As Kd', true), 'rfi').leak).toBe('high');
		expect(stat(session(40, '7c 2d', false), 'rfi').leak).toBe('low');
	});
});

describe('typical figures by table size', () => {
	const summary = (...players: number[]) =>
		summariseSession(
			parseHistory(
				players.map((count) => ringHand(count, 'As Kd', 'cbet')).join('\n')
			).map(replayHand),
			'hero'
		);
	const baseline = (session: ReturnType<typeof summary>, id: string) =>
		session.stats.find((stat) => stat.id === id)!.baseline;

	it('are the six-max ones at a table of five or six', () => {
		const session = summary(6, 6, 5);
		expect(baseline(session, 'cbet')).toBe(0.6);
		expect(baseline(session, 'foldToCbet')).toBe(0.45);
		expect(baseline(session, 'wtsd')).toBe(0.28);
		expect(baseline(session, 'wonAtShowdown')).toBe(0.52);
	});

	it('shift with the table: more betting short-handed, less at a full ring', () => {
		expect(baseline(summary(3), 'cbet')).toBe(0.63);
		expect(baseline(summary(9), 'cbet')).toBe(0.57);
		expect(baseline(summary(9), 'wtsd')).toBe(0.26);
	});

	it('are weighted by the tables the stat came up at', () => {
		// Three c-bet spots six-handed and one nine-handed.
		const session = summary(6, 6, 6, 9);
		expect(baseline(session, 'cbet')).toBeCloseTo((3 * 0.6 + 0.57) / 4);
		expect(baseline(session, 'wtsd')).toBeCloseTo((3 * 0.28 + 0.26) / 4);
	});

	it('fall back to the hands dealt for a stat that never came up', () => {
		const session = summary(6, 9);
		expect(session.stats.find((stat) => stat.id === 'foldToCbet')!.opportunities).toBe(0);
		expect(baseline(session, 'foldToCbet')).toBeCloseTo((0.45 + 0.48) / 2);
	});

	it('list the table sizes, the fullest first', () => {
		expect(summary(6, 9, 6, 3).tableSizes).toEqual([
			{ players: 9, hands: 1 },
			{ players: 6, hands: 2 },
			{ players: 3, hands: 1 },
		]);
		expect(analyzeLog(emailed).session.tableSizes).toEqual([
			{ players: 6, hands: 2 },
			{ players: 5, hands: 2 },
		]);
	});
});
