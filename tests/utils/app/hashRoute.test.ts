import { describe, expect, it } from 'vitest';

import { formatRoute, parseRoute, reviewHref, type Route } from '#utils/app/hashRoute';
import { DEFAULT_REVIEW } from '#utils/ui/review';

describe('the hash route', () => {
	describe('parseRoute', () => {
		it('reads a bare tab', () => {
			expect(parseRoute('#openings')).toEqual({
				tab: 'openings',
				review: DEFAULT_REVIEW,
			});
			expect(parseRoute('#review')).toEqual({ tab: 'review', review: DEFAULT_REVIEW });
		});

		it('falls back to the summary on an empty or unknown fragment', () => {
			expect(parseRoute('').tab).toBe('summary');
			expect(parseRoute('#').tab).toBe('summary');
			expect(parseRoute('#nowhere?show=all').tab).toBe('summary');
		});

		it('reads every Review parameter', () => {
			expect(
				parseRoute(
					'#review?show=mistakes&floor=mistake&street=post&kind=missed-value&order=time&hand=5001'
				)
			).toEqual({
				tab: 'review',
				review: {
					show: 'mistakes',
					floor: 'mistake',
					street: 'post',
					kind: 'missed-value',
					order: 'time',
					hand: '5001',
				},
			});
		});

		it('drops values it does not know', () => {
			expect(
				parseRoute(
					'#review?show=everything&floor=ok&street=river&kind=toString&order=&x=1'
				)
			).toEqual({ tab: 'review', review: DEFAULT_REVIEW });
		});

		it('ignores a query on a view that takes none', () => {
			expect(parseRoute('#summary?show=all&hand=1')).toEqual({
				tab: 'summary',
				review: DEFAULT_REVIEW,
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

	describe('formatRoute', () => {
		it('leaves the defaults out', () => {
			expect(formatRoute({ tab: 'review', review: DEFAULT_REVIEW })).toBe('#review');
			expect(formatRoute({ tab: 'ranges', review: DEFAULT_REVIEW })).toBe('#ranges');
		});

		it('writes the parameters in a fixed order', () => {
			expect(
				formatRoute({
					tab: 'review',
					review: { ...DEFAULT_REVIEW, hand: '5001', street: 'pre', show: 'all' },
				})
			).toBe('#review?show=all&street=pre&hand=5001');
		});

		it('drops Review state on any other view', () => {
			expect(
				formatRoute({ tab: 'summary', review: { ...DEFAULT_REVIEW, hand: '5001' } })
			).toBe('#summary');
		});

		it('gives the legacy tabs their new address', () => {
			expect(formatRoute(parseRoute('#mistakes'))).toBe('#review');
			expect(formatRoute(parseRoute('#plays'))).toBe('#review?show=plays');
			expect(formatRoute(parseRoute('#hands'))).toBe('#review?show=all');
		});
	});

	describe('round trip', () => {
		const routes: Route[] = [
			{ tab: 'summary', review: DEFAULT_REVIEW },
			{ tab: 'review', review: DEFAULT_REVIEW },
			{ tab: 'review', review: { ...DEFAULT_REVIEW, show: 'ungraded' } },
			{
				tab: 'review',
				review: {
					show: 'mistakes',
					floor: 'blunder',
					street: 'post',
					kind: 'call-without-odds',
					order: 'time',
					hand: '260012345678',
				},
			},
			{ tab: 'review', review: { ...DEFAULT_REVIEW, show: 'plays', order: 'impact' } },
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
			expect(reviewHref({ show: 'all', hand: '5001' })).toBe(
				'#review?show=all&hand=5001'
			);
		});
	});
});
