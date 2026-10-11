/**
 * The hero's own opening ranges: a row per seat, which is also what picks the
 * seat, beside that seat's grid -- the hands they held when the action folded
 * to them and what they did with each, drawn over the chart -- and under the
 * table the hands that strayed from it, each a way into Review.
 */

import { createMemo, createSignal, For, Show, type Component } from 'solid-js';

import type { OpeningDeviation, OpeningHand, OpeningRow } from '#utils/coach/openings';
import { reviewHref } from '#utils/app/hashRoute';
import type { AnalysisReport } from '#utils/coach/report';
import { classFromName, className } from '#utils/cards/combos';
import type { Position } from '#utils/history/replay';
import { chart } from '#utils/ranges/charts';
import { emptyRange, type PreflopChoice, type Strategy } from '#utils/ranges/range';
import { percent, readingOf, type LeakWords } from '#utils/ui/format';

import RangeGrid from './RangeGrid';

import '#styles/ranges/OpeningsView';

interface OpeningsViewProps {
	report: AnalysisReport;
	onOpenHand: (handId: string) => void;
}

const DEVIATIONS: { chosen: PreflopChoice; title: string }[] = [
	{ chosen: 'raise', title: 'Opened outside the chart' },
	{ chosen: 'fold', title: 'Folded inside the chart' },
	{ chosen: 'call', title: 'Limped' },
];

/** A range is wide or tight where a frequency is high or low. */
const WIDTH: LeakWords = { high: 'too wide', low: 'too tight' };

const OpeningsView: Component<OpeningsViewProps> = (props) => {
	const rows = () => props.report.openings.rows;
	const [seat, setSeat] = createSignal<Position | null>(null);
	// Until a seat is picked, the one with the most to show.
	const row = createMemo(
		() =>
			rows().find((candidate) => candidate.position === seat())
			?? rows().reduce<OpeningRow | undefined>(
				(most, candidate) => (most && most.spots >= candidate.spots ? most : candidate),
				undefined
			)
	);

	const held = createMemo(
		() =>
			new Map<number, OpeningHand>(
				(row()?.hands ?? []).map((hand) => [classFromName(hand.hand), hand])
			)
	);
	const played = createMemo((): Strategy => {
		const strategy = { raise: emptyRange(), call: emptyRange() };
		for (const [cls, hand] of held()) {
			strategy.raise[cls] = hand.raised / hand.dealt;
			strategy.call[cls] = hand.limped / hand.dealt;
		}
		return strategy;
	});
	const baseline = createMemo(() => {
		const current = row();
		return current ? chart(current.chart).raise : emptyRange();
	});
	const describe = (cls: number): string => {
		const opens = `the chart opens it ${percent(baseline()[cls])}`;
		const hand = held().get(cls);
		if (!hand) return `${className(cls)}: not held here; ${opens}`;
		const folded = hand.dealt - hand.raised - hand.limped;
		return `${hand.hand}: held ${hand.dealt}, opened ${hand.raised}, limped ${hand.limped}, folded ${folded}; ${opens}`;
	};
	const strays = (chosen: PreflopChoice): OpeningDeviation[] =>
		(row()?.deviations ?? []).filter((deviation) => deviation.chosen === chosen);
	// A hand is called by where it comes in the log, as Review calls it.
	const numbers = createMemo(
		() => new Map(props.report.hands.map((hand, index) => [hand.id, index + 1]))
	);

	return (
		<section class="openings-view">
			<Show
				when={row()}
				fallback={
					<p class="openings-view__empty">
						The action never folded to you with a stack of 30bb or more in this log, so
						there are no opening ranges to show.
					</p>
				}
			>
				{(current) => (
					<>
						<div class="openings-view__seats">
							<h2 class="openings-view__title">Your opening ranges</h2>
							<p class="openings-view__lead">
								Every hand where the action folded to you. Pick a seat to see its grid.
							</p>
							<table class="openings-view__table">
								<thead>
									<tr>
										<th scope="col">Seat</th>
										<th scope="col">Spots</th>
										<th scope="col">Opened</th>
										<th scope="col">Chart</th>
										<th scope="col" class="openings-view__reading">
											Reading
										</th>
										<th scope="col">Limped</th>
									</tr>
								</thead>
								<tbody>
									<For each={rows()}>
										{(item) => (
											<tr
												classList={{
													'is-leak': item.leak !== null,
													'is-selected': item.position === current().position,
												}}
											>
												<th scope="row">
													<button
														type="button"
														class="openings-view__seat"
														classList={{ active: item.position === current().position }}
														aria-pressed={item.position === current().position}
														onClick={() => setSeat(item.position)}
													>
														{item.position}
													</button>
												</th>
												<td>{item.spots}</td>
												<td>{percent(item.raised / item.spots)}</td>
												<td>{percent(item.expected / item.spots)}</td>
												<td class="openings-view__reading">
													{readingOf(item.leak, item.spots, WIDTH)}
												</td>
												<td>{item.limped}</td>
											</tr>
										)}
									</For>
								</tbody>
							</table>
							<p class="openings-view__note">
								Chart is what the seat's chart opens with the very cards you held, so a
								run of good or bad cards does not read as a leak. A seat is flagged only
								when the sample is large enough to bear it; a small one reads "too few to
								say".
								<Show when={props.report.openings.shortStacked > 0}>
									{' '}
									{props.report.openings.shortStacked} spots under 30bb are left out: the
									opening charts do not cover them.
								</Show>
							</p>

							<h3 class="openings-view__subtitle">
								{current().position} hands that strayed
							</h3>
							<table class="openings-view__strays">
								<tbody>
									<For each={DEVIATIONS}>
										{(group) => (
											<tr>
												<th scope="row">{group.title}</th>
												<td>
													<For each={strays(group.chosen)} fallback="none">
														{(deviation, index) => (
															<>
																{index() > 0 ? ' · ' : ''}
																<a
																	href={reviewHref({
																		show: 'all',
																		hand: deviation.handId,
																	})}
																	onClick={(event) => {
																		event.preventDefault();
																		props.onOpenHand(deviation.handId);
																	}}
																>
																	{deviation.hand}, hand {numbers().get(deviation.handId)}
																</a>
															</>
														)}
													</For>
												</td>
											</tr>
										)}
									</For>
								</tbody>
							</table>
						</div>

						<div class="openings-view__grid">
							<h2 class="openings-view__title">
								{current().position}, {current().spots}{' '}
								{current().spots === 1 ? 'spot' : 'spots'}
							</h2>
							<p class="openings-view__lead">
								Opened {current().raised} of {current().spots}; the chart opens{' '}
								{current().expected.toFixed(1)} of the same hands, and{' '}
								{percent(current().chartRange)} of all hands.
							</p>
							<RangeGrid
								strategy={played()}
								outline={baseline()}
								faint={(cls) => !held().has(cls)}
								describe={describe}
							/>
							<ul class="range-key">
								<li>
									<span class="range-key__swatch range-key__swatch--raise" />
									Opened
								</li>
								<li>
									<span class="range-key__swatch range-key__swatch--call" />
									Limped
								</li>
								<li>
									<span class="range-key__swatch range-key__swatch--fold" />
									Folded
								</li>
								<li>
									<span class="range-key__swatch range-key__swatch--outline" />
									The chart opens
								</li>
								<li>Faint: not held</li>
							</ul>
						</div>
					</>
				)}
			</Show>
		</section>
	);
};

export default OpeningsView;
