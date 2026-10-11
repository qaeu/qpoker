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
import { BLINDS_HERO_UTG, handText, TOUGH_FOLD } from '../history/handText';

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
