/**
 * The session at a glance: the result, where the graded losses went, the same
 * result by seat, and the frequencies against their baselines. Whatever counts
 * hands links to Review with those hands listed.
 */

import { For, Show, type Component } from 'solid-js';

import StatBand, { type StatFigure } from '#c/common/StatBand';
import { reviewHref } from '#utils/app/hashRoute';
import type { AnalysisReport } from '#utils/coach/report';
import { percent, readingOf, shortTime, signClass, signed } from '#utils/ui/format';

import '#styles/report/SummaryView';

interface SummaryViewProps {
	report: AnalysisReport;
}

const SummaryView: Component<SummaryViewProps> = (props) => {
	const session = () => props.report.session;
	const figures = (): StatFigure[] => [
		{ label: 'Hands', value: String(props.report.handCount) },
		{
			label: 'Result',
			value: signed(session().netBb),
			unit: 'bb',
			sign: session().netBb,
		},
		{
			label: 'Win rate',
			value: signed(session().bbPer100),
			unit: 'bb/100',
			sign: session().bbPer100,
		},
		{
			label: 'Lost to mistakes',
			value: signed(props.report.totalEvLostBb),
			unit: 'bb',
			sign: props.report.totalEvLostBb,
			note: 'an estimate',
		},
		{
			label: 'Mistakes',
			value: String(props.report.mistakes.length),
			href: reviewHref({ show: 'mistakes' }),
			linkLabel: 'Review them',
		},
		{
			label: 'Good plays',
			value: String(props.report.goodPlays.length),
			href: reviewHref({ show: 'plays' }),
			linkLabel: 'Review them',
		},
	];
	// The costliest kind fills its bar; the rest are drawn against it.
	const share = (evLostBb: number): number => {
		const most = props.report.leaks[0]?.evLostBb ?? 0;
		return most < 0 ? evLostBb / most : 0;
	};

	return (
		<section class="summary-view">
			<p class="summary-view__meta">
				{props.report.tables.join(', ')} · {shortTime(props.report.firstHand)} to{' '}
				{shortTime(props.report.lastHand)}
			</p>
			<StatBand figures={figures()} />

			<Show when={props.report.unreconciled > 0 || props.report.warnings.length > 0}>
				<p class="summary-view__warning" role="alert">
					<Show when={props.report.unreconciled > 0}>
						{props.report.unreconciled}{' '}
						{props.report.unreconciled === 1 ? 'hand' : 'hands'} did not add up to the
						stated pot and {props.report.unreconciled === 1 ? 'was' : 'were'} not graded.{' '}
						<a href={reviewHref({ show: 'ungraded' })}>Show the hands not graded</a>{' '}
					</Show>
					<Show when={props.report.warnings.length > 0}>
						{props.report.warnings.length} lines were not understood, the first being:{' '}
						{props.report.warnings[0]}
					</Show>
				</p>
			</Show>

			<div class="summary-view__panels">
				<div class="summary-view__panel">
					<h2 class="summary-view__title">Where the losses went</h2>
					<Show
						when={props.report.leaks.length > 0}
						fallback={
							<p class="summary-view__note">No mistakes were graded in this log.</p>
						}
					>
						<p class="summary-view__lead">
							Each kind opens Review with those hands listed.
						</p>
						<table class="summary-view__table">
							<thead>
								<tr>
									<th scope="col">Mistake</th>
									<th scope="col">Times</th>
									<th scope="col">Cost</th>
								</tr>
							</thead>
							<tbody>
								<For each={props.report.leaks}>
									{(leak) => (
										<tr>
											<th scope="row">
												<a
													class="summary-view__leak"
													href={reviewHref({ show: 'mistakes', kind: leak.type })}
												>
													{leak.title}
													<span
														class="summary-view__share"
														aria-hidden="true"
														// The share is data, not styling: the bar's width.
														style={{ '--share': share(leak.evLostBb) }}
													/>
												</a>
											</th>
											<td>{leak.count}</td>
											<td class="is-negative">{signed(leak.evLostBb, 2)}bb</td>
										</tr>
									)}
								</For>
							</tbody>
						</table>
					</Show>

					<h2 class="summary-view__title summary-view__title--spaced">By position</h2>
					<table class="summary-view__table">
						<thead>
							<tr>
								<th scope="col">Seat</th>
								<th scope="col">Hands</th>
								<th scope="col">VPIP</th>
								<th scope="col">PFR</th>
								<th scope="col">Result</th>
							</tr>
						</thead>
						<tbody>
							<For each={session().positions}>
								{(row) => (
									<tr>
										<th scope="row">{row.position}</th>
										<td>{row.hands}</td>
										<td>{percent(row.vpip / row.hands)}</td>
										<td>{percent(row.pfr / row.hands)}</td>
										<td class={signClass(row.netBb)}>{signed(row.netBb)}bb</td>
									</tr>
								)}
							</For>
						</tbody>
					</table>
				</div>

				<div class="summary-view__panel">
					<h2 class="summary-view__title">Frequencies</h2>
					<table class="summary-view__table">
						<thead>
							<tr>
								<th scope="col">Stat</th>
								<th scope="col">You</th>
								<th scope="col">Baseline</th>
								<th scope="col" class="summary-view__reading">
									Reading
								</th>
								<th scope="col">Sample</th>
							</tr>
						</thead>
						<tbody>
							<For each={session().stats}>
								{(stat) => (
									<tr classList={{ 'is-leak': stat.leak !== null }}>
										<th scope="row">{stat.label}</th>
										<td>{percent(stat.value)}</td>
										<td>
											{percent(stat.baseline)}
											{stat.baselineSource === 'typical' ? '*' : ''}
										</td>
										<td class="summary-view__reading">
											{readingOf(stat.leak, stat.opportunities)}
										</td>
										<td>
											{stat.count}/{stat.opportunities}
										</td>
									</tr>
								)}
							</For>
						</tbody>
					</table>
					<p class="summary-view__note">
						The baseline is what the charts do in the very spots you were in. * marks a
						typical figure for a balanced player instead. A frequency is flagged only when
						the sample is large enough to bear it; a small one reads "too few to say"
						rather than nothing.
					</p>
				</div>
			</div>
		</section>
	);
};

export default SummaryView;
