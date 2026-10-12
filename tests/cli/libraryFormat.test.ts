import { describe, it, expect } from 'vitest';

import { formatReport } from '#cli/format';
import {
	formatImport,
	formatPlayers,
	formatProfile,
	formatTrend,
} from '#cli/libraryFormat';
import { analyzeLog } from '#utils/coach/report';
import { sessionsOf } from '#utils/coach/sessions';
import { MIN_TREND_HANDS, trendOf } from '#utils/coach/trend';
import { ingestLog } from '#utils/store/ingest';
import { libraryAnalysis } from '#utils/store/library';
import { createMemoryStore } from '#utils/store/memoryStore';
import { profileOf } from '#utils/store/profile';

import emailed from '../fixtures/emailed.txt?raw';
import { handText, RIVER_HERO_CALL, ringHand } from '../utils/history/handText';

const run = (count: number, firstId: number, action: 'fold' | 'raise') =>
	Array.from({ length: count }, (_, i) => ringHand(6, 'As Ad', action, firstId + i));

const OPTIONS = { top: 15, minSeverity: 'inaccuracy', color: false } as const;

describe('the terminal’s library output', () => {
	describe('an import', () => {
		const record = {
			importedAt: 'now',
			fileName: 'a.txt',
			hands: 120,
			added: 19,
			replaced: 0,
		};

		it('says how many hands the file held and how many were new', () => {
			expect(formatImport(record, 19)).toBe('a.txt: 120 hands, 19 new');
		});

		it('adds the hands replaced, and those only brought up to date', () => {
			expect(formatImport({ ...record, replaced: 1 }, 25)).toBe(
				'a.txt: 120 hands, 19 new, 1 replaced; 5 hands brought up to date'
			);
		});
	});

	describe('the trend', () => {
		const trend = (...logs: string[][]) => {
			const { hands } = analyzeLog(logs.flat().join('\n'));
			return formatTrend(trendOf(hands, sessionsOf(hands)), 20);
		};

		it('says a short history is too short, and still lists its sittings', () => {
			const text = trend(run(3, 100, 'fold'), run(2, 2100, 'raise'));
			expect(text).toContain('Too few graded hands to say');
			expect(text).toContain('SITTINGS (2 of 2, latest first)');
			expect(
				text.split('\n').filter((line) => /^ {2}2026-01-02/.test(line))
			).toHaveLength(2);
		});

		it('gives the verdict and the mistake that moved', () => {
			const text = trend(
				run(MIN_TREND_HANDS, 100, 'fold'),
				run(MIN_TREND_HANDS, 300, 'raise')
			);
			expect(text).toMatch(/over the later 100: clearly better\./);
			expect(text).toMatch(
				/rarer: Folded a standard open \(100\.0 -> 0\.0 per 100 hands\)/
			);
		});
	});

	describe('the players', () => {
		it('lists everyone but the hero by hands seen, and reads one in full', async () => {
			const store = createMemoryStore();
			await ingestLog(store, emailed);
			const players = await store.players();
			const list = formatPlayers(players, ['hero77'], 2);
			expect(list).toContain(`PLAYERS (2 of ${players.length - 1}, by hands seen)`);
			expect(list).not.toContain('hero77');

			const [brakeman] = await store.players(['Brakeman1990']);
			const profile = formatProfile(profileOf(brakeman));
			expect(profile).toMatch(/^Brakeman1990 · 4 hands · /);
			expect(profile).toContain('VPIP');
			expect(profile).toContain('Nothing far enough from the baseline');
		});

		it('prints what a player won and lost, and the hero against them', async () => {
			const store = createMemoryStore();
			await ingestLog(
				store,
				[...run(1, 100, 'raise'), handText(RIVER_HERO_CALL)].join('\n')
			);
			const [p2] = await store.players(['p2']);
			expect(formatProfile(profileOf(p2))).toContain(
				'Their result +$5.00, you against them -$5.00 (2 hands, USD)'
			);
		});

		it('prints the reads a larger sample bears', async () => {
			const store = createMemoryStore();
			await ingestLog(
				store,
				run(30, 100, 'raise').join('\n').replaceAll('As Ad', '7c 2d')
			);
			const [hero] = await store.players(['hero']);
			const profile = formatProfile(profileOf(hero));
			expect(profile).toContain('READS');
			expect(profile).toMatch(/VPIP: Plays too many hands/);
			expect(profile).toMatch(/too high/);
		});
	});
});

describe('a report over the library', () => {
	const first = [...run(2, 100, 'fold'), handText(RIVER_HERO_CALL)].join('\n');

	it('prints as an analysis of the same hands prints', async () => {
		const store = createMemoryStore();
		await ingestLog(store, run(2, 100, 'fold').join('\n'), { seed: 5 });
		await ingestLog(store, handText(RIVER_HERO_CALL));
		const report = (await libraryAnalysis(store))!;
		expect(formatReport(report, OPTIONS)).toBe(
			formatReport(analyzeLog(first, { seed: 5 }), OPTIONS)
		);
	});

	it('reads in full the hand asked for, though it has no finding', async () => {
		const store = createMemoryStore();
		const clean = ringHand(6, 'As Ad', 'raise', 500);
		await ingestLog(store, `${first}\n${clean}`, { seed: 5 });
		const bare = (await libraryAnalysis(store))!;
		expect(bare.hands.find((hand) => hand.id === '500')!.lines).toEqual([]);
		const asked = (await libraryAnalysis(store, 'all', '500'))!;
		expect(asked.hands.find((hand) => hand.id === '500')!.lines.length).toBeGreaterThan(
			0
		);
		expect(formatReport(asked, { ...OPTIONS, handId: '500' })).toContain('raises');
	});

	it('keeps to a scope', async () => {
		const store = createMemoryStore();
		await ingestLog(store, first, { seed: 5 });
		const latest = (await libraryAnalysis(store, 'latest'))!;
		expect(latest.handCount).toBe(1);
		expect(latest.mistakes.every((grading) => grading.handId === '7001')).toBe(true);
	});

	it('is null for an empty library', async () => {
		expect(await libraryAnalysis(createMemoryStore())).toBeNull();
	});
});
