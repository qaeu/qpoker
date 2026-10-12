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
import {
	BLINDS_HERO_UTG,
	handText,
	RIVER_HERO_CALL,
	ringHand,
	TOUGH_FOLD,
} from '../history/handText';

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
		// 5.14%, held to the half percent so a longer log is graded at the same rate.
		expect((24 + 3) / (473 + 52)).toBeCloseTo(0.0514, 4);
		expect(report.rake).toBe(0.05);
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

	it('carries the hero’s equity at each step of a graded hand', () => {
		const stackOff = report.hands.at(-1)!;
		expect(stackOff.equity.deals.preflop).toMatchObject({ opponents: 4 });
		const open = stackOff.lines.find((line) => line.hero && line.kind === 'raise')!;
		expect(stackOff.equity.actions[open.stepIndex]).toBe(stackOff.equity.deals.preflop);
		const other = analyzeLog(emailed, { hero: 'Brakeman1990' });
		expect(other.hands.at(-1)!.equity).toEqual({ deals: {}, actions: {} });
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

describe('reusing an earlier report', () => {
	const folded = ringHand(6, 'As Ad', 'fold', 6001);
	const opened = ringHand(6, 'Ah Kd', 'raise', 6002);
	const called = handText(RIVER_HERO_CALL);
	const log = [folded, opened, called].join('\n');
	const earlier = analyzeLog(log, { seed: 5 });

	it('is at the version that added it', () => {
		expect(REPORT_VERSION).toBe(7);
	});

	it('records what a hand was graded from', () => {
		expect(earlier.samples).toBeNull();
		expect(earlier.hands.map((hand) => hand.digest)).toEqual(
			parseHistory(log).map((hand) => hand.digest)
		);
		// Only the hand that went postflop was priced with the rake.
		expect(earlier.hands.map((hand) => hand.rake)).toEqual([null, null, earlier.rake]);
	});

	describe('the same log', () => {
		it('grades nothing again and reports the same', () => {
			const run = startAnalysis(log, { seed: 5 }, earlier);
			expect(advanceAnalysis(run, 0)).toBe(true);
			const again = finishAnalysis(run);
			expect(again).toEqual(earlier);
			again.hands.forEach((hand, i) => expect(hand).toBe(earlier.hands[i]));
		});
	});

	describe('a longer log', () => {
		const added = ringHand(6, 'Kh Kd', 'raise', 7100);
		const longer = `${log}\n${added}`;

		it('grades only the hands the report lacks', () => {
			const run = startAnalysis(longer, { seed: 5 }, earlier);
			expect(run.total).toBe(4);
			expect(advanceAnalysis(run, 1)).toBe(true);
			const grown = finishAnalysis(run);
			expect(grown).toEqual(analyzeLog(longer, { seed: 5 }));
			earlier.hands.forEach((hand, i) => expect(grown.hands[i]).toBe(hand));
		});

		it('takes a new hand wherever it falls among the old', () => {
			const between = ringHand(6, 'Qh Qd', 'raise', 6500);
			const grown = analyzeLog(`${between}\n${log}`, { seed: 5 }, earlier);
			expect(grown.hands.map((hand) => hand.id)).toEqual([
				'6001',
				'6002',
				'6500',
				'7001',
			]);
			expect(grown).toEqual(analyzeLog(`${log}\n${between}`, { seed: 5 }));
			expect(grown.hands[3]).toBe(earlier.hands[2]);
		});

		it('grades again a hand that was cut short the first time', () => {
			const cut = longer.slice(0, longer.lastIndexOf('*** SUMMARY ***'));
			const partial = analyzeLog(cut, { seed: 5 });
			const grown = analyzeLog(longer, { seed: 5 }, partial);
			expect(grown).toEqual(analyzeLog(longer, { seed: 5 }));
			expect(grown.hands[2]).toBe(partial.hands[2]);
			expect(grown.hands[3]).not.toBe(partial.hands[3]);
		});
	});

	describe('a run it does not answer for', () => {
		it.each([
			['another seed', { seed: 6 }],
			['another sample count', { seed: 5, samples: 200 }],
			['another hero', { seed: 5, hero: 'p2' }],
		])('keeps nothing under %s', (_, options) => {
			const run = startAnalysis(log, options, earlier);
			expect(run.kept.size).toBe(0);
			advanceAnalysis(run);
			expect(finishAnalysis(run)).toEqual(analyzeLog(log, options));
		});

		it('keeps nothing from another version of the report', () => {
			const old = { ...earlier, version: REPORT_VERSION - 1 };
			expect(startAnalysis(log, { seed: 5 }, old).kept.size).toBe(0);
		});

		it('grades again, at another rake, only the hands priced with it', () => {
			const options = { seed: 5, rake: earlier.rake + 0.01 };
			const moved = analyzeLog(log, options, earlier);
			expect(moved).toEqual(analyzeLog(log, options));
			expect(moved.hands[0]).toBe(earlier.hands[0]);
			expect(moved.hands[1]).toBe(earlier.hands[1]);
			expect(moved.hands[2]).not.toBe(earlier.hands[2]);
		});

		it('holds for recorded hands too', () => {
			const recorded = analyzeLog(emailed, { seed: 5 });
			const options = { seed: 5, rake: 0.1 };
			expect(recorded.hands.some((hand) => hand.rake === null)).toBe(true);
			expect(recorded.hands.some((hand) => hand.rake === 0.05)).toBe(true);
			expect(analyzeLog(emailed, options, recorded)).toEqual(
				analyzeLog(emailed, options)
			);
		});
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
