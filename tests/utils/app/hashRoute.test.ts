import { describe, expect, it } from 'vitest';

import {
	formatRoute,
	parseRoute,
	reviewHref,
	type Route,
	playerHref,
} from '#utils/app/hashRoute';
import { DEFAULT_RANGES } from '#utils/ui/rangeTables';
import { DEFAULT_REVIEW } from '#utils/ui/review';

describe('the hash route', () => {
	describe('parseRoute', () => {
		it('reads a bare tab', () => {
			expect(parseRoute('#openings')).toEqual({
				tab: 'openings',
				ranges: DEFAULT_RANGES,
				review: DEFAULT_REVIEW,
			});
			expect(parseRoute('#review')).toEqual({
				tab: 'review',
				ranges: DEFAULT_RANGES,
				review: DEFAULT_REVIEW,
			});
		});

		it('falls back to the summary on an empty or unknown fragment', () => {
			expect(parseRoute('').tab).toBe('summary');
			expect(parseRoute('#').tab).toBe('summary');
			expect(parseRoute('#nowhere?show=all').tab).toBe('summary');
		});

		it('reads every Review parameter', () => {
			expect(
				parseRoute(
					'#review?show=mistakes&floor=mistake&street=post&kind=missed-value&position=BTN&scenario=vsOpen&order=time&hand=5001&step=7'
				)
			).toEqual({
				tab: 'review',
				ranges: DEFAULT_RANGES,
				review: {
					show: 'mistakes',
					floor: 'mistake',
					street: 'post',
					kind: 'missed-value',
					position: 'BTN',
					scenario: 'vsOpen',
					order: 'time',
					hand: '5001',
					step: 7,
				},
			});
		});

		describe('the step', () => {
			const stepOf = (hash: string) => parseRoute(hash).review.step;

			it('is a whole number from zero', () => {
				expect(stepOf('#review?hand=5001&step=0')).toBe(0);
				expect(stepOf('#review?hand=5001&step=12')).toBe(12);
			});

			it.each(['-1', '1.5', 'seven', '', '1e3', ' 2'])('drops %j', (step) => {
				expect(stepOf(`#review?hand=5001&step=${encodeURIComponent(step)}`)).toBeNull();
			});

			it('is dropped without a hand to be a step of', () => {
				expect(stepOf('#review?show=plays&step=4')).toBeNull();
			});
		});

		it('drops values it does not know', () => {
			expect(
				parseRoute(
					'#review?show=everything&floor=ok&street=river&kind=toString&position=MP&scenario=toString&order=&x=1'
				)
			).toEqual({ tab: 'review', ranges: DEFAULT_RANGES, review: DEFAULT_REVIEW });
		});

		describe('the position', () => {
			const positionOf = (hash: string) => parseRoute(hash).review.position;

			it('reads a seat with a plus in it, encoded or typed as it is said', () => {
				expect(positionOf('#review?position=UTG%2B1')).toBe('UTG+1');
				expect(positionOf('#review?position=UTG+2')).toBe('UTG+2');
			});

			it('is case-sensitive, as every other value is', () => {
				expect(positionOf('#review?position=btn')).toBeNull();
			});
		});

		it('ignores a query on a view that takes none', () => {
			expect(parseRoute('#summary?show=all&hand=1')).toEqual({
				tab: 'summary',
				ranges: DEFAULT_RANGES,
				review: DEFAULT_REVIEW,
			});
		});

		describe('the Ranges chart', () => {
			const rangesOf = (hash: string) => parseRoute(hash).ranges;

			it('reads the chart and the depth', () => {
				expect(rangesOf('#ranges?chart=btnVsCo&depth=mid')).toEqual({
					chart: 'btnVsCo',
					depth: 'mid',
				});
				expect(rangesOf('#ranges?chart=bbVsSb')).toEqual({
					chart: 'bbVsSb',
					depth: 'deep',
				});
				expect(rangesOf('#ranges?chart=overLimpCo').chart).toBe('overLimpCo');
			});

			it('falls back to the default on a value it does not know', () => {
				expect(rangesOf('#ranges')).toEqual(DEFAULT_RANGES);
				expect(rangesOf('#ranges?chart=toString&depth=short')).toEqual(DEFAULT_RANGES);
				expect(rangesOf('#ranges?chart=overLimp')).toEqual(DEFAULT_RANGES);
			});

			it('is not read on another view', () => {
				expect(rangesOf('#summary?chart=bbVsSb&depth=mid')).toEqual(DEFAULT_RANGES);
				expect(rangesOf('#review?chart=bbVsSb')).toEqual(DEFAULT_RANGES);
			});
		});

		describe('legacy tabs', () => {
			it.each([
				['#mistakes', 'mistakes'],
				['#plays', 'plays'],
				['#hands', 'all'],
			])('sends %s to Review showing %s', (hash, show) => {
				const route = parseRoute(hash);
				expect(route.tab).toBe('review');
				expect(route.review.show).toBe(show);
			});
		});
	});

	describe('the scope and the player', () => {
		it('reads a scope on any view, and leaves every hand unsaid', () => {
			expect(parseRoute('#summary?scope=latest').scope).toBe('latest');
			expect(parseRoute('#review?scope=week&show=plays')).toMatchObject({
				scope: 'week',
				review: { show: 'plays' },
			});
			expect(parseRoute('#ranges?scope=2026-01-02T10:23:21').scope).toBe(
				'2026-01-02T10:23:21'
			);
			expect('scope' in parseRoute('#summary?scope=all')).toBe(false);
			expect('scope' in parseRoute('#summary?scope=someday')).toBe(false);
		});

		it('writes the scope first, whatever the view', () => {
			const scoped = (hash: string) => formatRoute(parseRoute(hash));
			expect(scoped('#summary?scope=latest')).toBe('#summary?scope=latest');
			expect(scoped('#review?show=plays&scope=month')).toBe(
				'#review?scope=month&show=plays'
			);
			expect(scoped('#trends?scope=all')).toBe('#trends');
			expect(scoped('#summary?scope=2026-01-02T10:23:21')).toBe(
				'#summary?scope=2026-01-02T10%3A23%3A21'
			);
		});

		it('carries the scope into a link to Review', () => {
			expect(reviewHref({ show: 'plays' }, 'latest')).toBe(
				'#review?scope=latest&show=plays'
			);
			expect(reviewHref({ show: 'plays' })).toBe('#review?show=plays');
			expect(reviewHref({}, 'latest')).toBe('#review?scope=latest');
		});

		it('names the player being read, in Players only', () => {
			expect(parseRoute('#players?name=Brakeman1990').player).toBe('Brakeman1990');
			expect('player' in parseRoute('#players')).toBe(false);
			expect('player' in parseRoute('#summary?name=x')).toBe(false);
			expect(playerHref('a b&c')).toBe('#players?name=a+b%26c');
			expect(parseRoute(playerHref('a b&c')).player).toBe('a b&c');
		});
	});

	describe('formatRoute', () => {
		it('leaves the defaults out', () => {
			expect(
				formatRoute({ tab: 'review', ranges: DEFAULT_RANGES, review: DEFAULT_REVIEW })
			).toBe('#review');
			expect(
				formatRoute({ tab: 'ranges', ranges: DEFAULT_RANGES, review: DEFAULT_REVIEW })
			).toBe('#ranges');
		});

		it('writes the parameters in a fixed order', () => {
			expect(
				formatRoute({
					tab: 'review',
					ranges: DEFAULT_RANGES,
					review: { ...DEFAULT_REVIEW, hand: '5001', street: 'pre', show: 'mistakes' },
				})
			).toBe('#review?show=mistakes&street=pre&hand=5001');
			expect(
				formatRoute({
					tab: 'review',
					ranges: DEFAULT_RANGES,
					review: {
						...DEFAULT_REVIEW,
						hand: '5001',
						order: 'time',
						scenario: 'rfi',
						position: 'UTG+1',
						kind: 'open-loose',
					},
				})
			).toBe(
				'#review?kind=open-loose&position=UTG%2B1&scenario=rfi&order=time&hand=5001'
			);
		});

		it('writes the step last, and only with its hand', () => {
			expect(
				formatRoute({
					tab: 'review',
					ranges: DEFAULT_RANGES,
					review: { ...DEFAULT_REVIEW, show: 'plays', hand: '5001', step: 0 },
				})
			).toBe('#review?show=plays&hand=5001&step=0');
			expect(
				formatRoute({
					tab: 'review',
					ranges: DEFAULT_RANGES,
					review: { ...DEFAULT_REVIEW, step: 4 },
				})
			).toBe('#review');
		});

		it('drops Review state on any other view', () => {
			expect(
				formatRoute({
					tab: 'summary',
					ranges: DEFAULT_RANGES,
					review: { ...DEFAULT_REVIEW, hand: '5001' },
				})
			).toBe('#summary');
		});

		it('writes the Ranges chart before its depth, and neither by default', () => {
			const ranges = (change: Partial<Route['ranges']>): Route => ({
				tab: 'ranges',
				review: DEFAULT_REVIEW,
				ranges: { ...DEFAULT_RANGES, ...change },
			});
			expect(formatRoute(ranges({ chart: 'btnVsCo', depth: 'mid' }))).toBe(
				'#ranges?chart=btnVsCo&depth=mid'
			);
			expect(formatRoute(ranges({ depth: 'mid' }))).toBe('#ranges?depth=mid');
			expect(formatRoute(ranges({ chart: 'rfiBtn' }))).toBe('#ranges');
		});

		it('drops the Ranges chart on any other view', () => {
			expect(
				formatRoute({
					tab: 'openings',
					review: DEFAULT_REVIEW,
					ranges: { chart: 'bbVsSb', depth: 'mid' },
				})
			).toBe('#openings');
		});

		it('gives the legacy tabs their new address', () => {
			expect(formatRoute(parseRoute('#mistakes'))).toBe('#review?show=mistakes');
			expect(formatRoute(parseRoute('#plays'))).toBe('#review?show=plays');
			expect(formatRoute(parseRoute('#hands'))).toBe('#review');
		});
	});

	describe('round trip', () => {
		const routes: Route[] = [
			{ tab: 'summary', ranges: DEFAULT_RANGES, review: DEFAULT_REVIEW },
			{ tab: 'review', ranges: DEFAULT_RANGES, review: DEFAULT_REVIEW },
			{
				tab: 'review',
				ranges: DEFAULT_RANGES,
				review: { ...DEFAULT_REVIEW, show: 'ungraded' },
			},
			{
				tab: 'review',
				ranges: DEFAULT_RANGES,
				review: {
					show: 'mistakes',
					floor: 'blunder',
					street: 'post',
					kind: 'call-without-odds',
					position: 'UTG+1',
					scenario: 'limpedVsRaise',
					order: 'time',
					hand: '260012345678',
					step: 14,
				},
			},
			{
				tab: 'review',
				ranges: DEFAULT_RANGES,
				review: { ...DEFAULT_REVIEW, position: 'BB' },
			},
			{
				tab: 'review',
				ranges: DEFAULT_RANGES,
				review: { ...DEFAULT_REVIEW, show: 'plays', order: 'impact' },
			},
			{
				tab: 'ranges',
				ranges: { chart: 'sbVs3bet', depth: 'mid' },
				review: DEFAULT_REVIEW,
			},
		];

		it.each(routes)('survives $tab $review.show', (route) => {
			expect(parseRoute(formatRoute(route))).toEqual(route);
		});
	});

	describe('reviewHref', () => {
		it('addresses a list from the defaults, whatever is on show now', () => {
			expect(reviewHref({})).toBe('#review');
			expect(reviewHref({ show: 'ungraded' })).toBe('#review?show=ungraded');
			expect(reviewHref({ kind: 'missed-value' })).toBe('#review?kind=missed-value');
			expect(reviewHref({ show: 'mistakes' })).toBe('#review?show=mistakes');
			expect(reviewHref({ show: 'all', hand: '5001' })).toBe('#review?hand=5001');
			expect(reviewHref({ show: 'all', position: 'CO', scenario: 'rfi' })).toBe(
				'#review?position=CO&scenario=rfi'
			);
		});
	});
});
