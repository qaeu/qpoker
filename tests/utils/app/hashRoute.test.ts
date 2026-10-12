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
					'#review?show=mistakes&floor=mistake&street=post&kind=missed-value&position=BTN&scenario=vsOpen&order=time&hand=5001&step=7'
				)
			).toEqual({
				tab: 'review',
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
				expect(stepOf('#review?show=all&step=4')).toBeNull();
			});
		});

		it('drops values it does not know', () => {
			expect(
				parseRoute(
					'#review?show=everything&floor=ok&street=river&kind=toString&position=MP&scenario=toString&order=&x=1'
				)
			).toEqual({ tab: 'review', review: DEFAULT_REVIEW });
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
			expect(
				formatRoute({
					tab: 'review',
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
					review: { ...DEFAULT_REVIEW, show: 'all', hand: '5001', step: 0 },
				})
			).toBe('#review?show=all&hand=5001&step=0');
			expect(formatRoute({ tab: 'review', review: { ...DEFAULT_REVIEW, step: 4 } })).toBe(
				'#review'
			);
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
					position: 'UTG+1',
					scenario: 'limpedVsRaise',
					order: 'time',
					hand: '260012345678',
					step: 14,
				},
			},
			{ tab: 'review', review: { ...DEFAULT_REVIEW, show: 'all', position: 'BB' } },
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
			expect(reviewHref({ show: 'all', position: 'CO', scenario: 'rfi' })).toBe(
				'#review?show=all&position=CO&scenario=rfi'
			);
		});
	});
});
