/**
 * The hero over time: whether the mistakes are getting rarer, said in a
 * sentence and only when the sample can bear it, then the kinds of mistake
 * that have clearly moved, then every sitting with a link to its own report.
 * Always over the whole library, whatever the other views are scoped to.
 */

import { createMemo, For, Match, Show, Switch, type Component } from 'solid-js';

import { formatRoute } from '#utils/app/hashRoute';
import type { HandSummary } from '#utils/coach/report';
import { sessionsOf } from '#utils/coach/sessions';
import { MIN_TREND_HANDS, trendOf, type Direction } from '#utils/coach/trend';
import { shortTime, signClass, signed } from '#utils/ui/format';
import { DEFAULT_RANGES } from '#utils/ui/rangeTables';
import { DEFAULT_REVIEW } from '#utils/ui/review';

import '#styles/trends/TrendsView';

interface TrendsViewProps {
	/** Every hand in the library, oldest first. */
	hands: readonly HandSummary[];
}

/** Sittings listed: the latest, which are the ones a trend is read from. */
const LISTED = 60;

const WORDS: Record<Direction, string> = {
	better: 'clearly better',
	worse: 'clearly worse',
};

const summaryHref = (scope: string): string =>
	formatRoute({ tab: 'summary', review: DEFAULT_REVIEW, ranges: DEFAULT_RANGES, scope });

const TrendsView: Component<TrendsViewProps> = (props) => {
	const trend = createMemo(() => trendOf(props.hands, sessionsOf(props.hands)));
	const graded = () => props.hands.filter((hand) => hand.gradeable).length;
	const listed = () => trend().points.slice(-LISTED).reverse();

	return (
		<section class="trends-view">
			<div class="trends-view__panels">
				<div class="trends-view__panel">
					<h2 class="trends-view__title">Are the mistakes getting rarer?</h2>
					<Show
						when={trend().halves}
						fallback={
							<p class="trends-view__verdict">
								Too few hands to say: {graded()} graded so far, and a trend is read from{' '}
								{MIN_TREND_HANDS * 2} or more.
							</p>
						}
					>
						{(halves) => (
							<p class="trends-view__verdict" role="status">
								Mistakes cost {signed(halves().earlier.evLostPer100)}bb per 100 hands over
								the earlier {halves().earlier.hands} graded hands and{' '}
								{signed(halves().later.evLostPer100)}bb over the later{' '}
								{halves().later.hands}:{' '}
								<Switch fallback="no change the sample can bear.">
									<Match when={trend().direction} keyed>
										{(direction) => (
											<span class={`is-${direction}`}>{WORDS[direction]}.</span>
										)}
									</Match>
								</Switch>
							</p>
						)}
					</Show>
					<Show when={trend().shifts.length > 0}>
						<table class="trends-view__table">
							<thead>
								<tr>
									<th scope="col">Mistake</th>
									<th scope="col">Earlier</th>
									<th scope="col">Later</th>
									<th scope="col">Reading</th>
								</tr>
							</thead>
							<tbody>
								<For each={trend().shifts}>
									{(shift) => (
										<tr>
											<th scope="row">{shift.title}</th>
											<td>{shift.earlier.toFixed(1)}</td>
											<td>{shift.later.toFixed(1)}</td>
											<td
												class={
													shift.direction === 'better' ? 'is-positive' : 'is-negative'
												}
											>
												{shift.direction === 'better' ? 'rarer' : 'more often'}
											</td>
										</tr>
									)}
								</For>
							</tbody>
						</table>
						<p class="trends-view__note">
							Hands with the mistake per 100 graded. Only a kind that has moved by more
							than the sample explains is listed.
						</p>
					</Show>
					<p class="trends-view__note">
						Costs are estimates against a baseline model. What mistakes cost moves far
						less from one sitting to the next than the result does, which is why the trend
						is read from it and not from the win rate.
					</p>
				</div>

				<div class="trends-view__panel">
					<h2 class="trends-view__title">Sitting by sitting</h2>
					<table class="trends-view__table">
						<thead>
							<tr>
								<th scope="col">Sitting</th>
								<th scope="col">Hands</th>
								<th scope="col">Result</th>
								<th scope="col">Mistakes</th>
								<th scope="col">Lost per 100</th>
							</tr>
						</thead>
						<tbody>
							<For each={listed()}>
								{(point) => (
									<tr>
										<th scope="row">
											<a href={summaryHref(point.session.id)}>
												{shortTime(point.session.first)}
											</a>
										</th>
										<td>{point.hands}</td>
										<td class={signClass(point.netBb)}>{signed(point.netBb)}bb</td>
										<td>{point.mistakes}</td>
										<td class={signClass(point.evLostPer100 ?? 0)}>
											{point.evLostPer100 === null ?
												'—'
											:	`${signed(point.evLostPer100)}bb`}
										</td>
									</tr>
								)}
							</For>
						</tbody>
					</table>
					<p class="trends-view__note">
						A sitting is a run of hands with no gap of more than half an hour. Each opens
						the Summary over its own hands.
						<Show when={trend().points.length > LISTED}>
							{' '}
							The latest {LISTED} of {trend().points.length} are listed.
						</Show>
					</p>
				</div>
			</div>
		</section>
	);
};

export default TrendsView;
