/**
 * The hero's own opening ranges: for each seat, the hands they held when the
 * action folded to them and what they did with each, drawn over the chart for
 * that seat, with the hands that strayed from it listed underneath.
 */

import { createMemo, createSignal, For, Show, type Component } from 'solid-js';

import type { OpeningDeviation, OpeningHand, OpeningRow } from '#utils/coach/openings';
import type { AnalysisReport } from '#utils/coach/report';
import { classFromName, className } from '#utils/cards/combos';
import type { Position } from '#utils/history/replay';
import { chart } from '#utils/ranges/charts';
import { emptyRange, type PreflopChoice, type Strategy } from '#utils/ranges/range';
import { percent } from '#utils/ui/format';

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
						<h2 class="openings-view__title">Your opening ranges</h2>
						<table class="openings-view__table">
							<thead>
								<tr>
									<th scope="col">Seat</th>
									<th scope="col">Spots</th>
									<th scope="col">Opened</th>
									<th scope="col">Chart</th>
									<th scope="col">Limped</th>
								</tr>
							</thead>
							<tbody>
								<For each={rows()}>
									{(item) => (
										<tr classList={{ 'is-leak': item.leak !== null }}>
											<th scope="row">{item.position}</th>
											<td>{item.spots}</td>
											<td>
												{percent(item.raised / item.spots)}
												<Show when={item.leak}>
													<span class="openings-view__flag">
														{item.leak === 'high' ? 'too wide' : 'too tight'}
													</span>
												</Show>
											</td>
											<td>{percent(item.expected / item.spots)}</td>
											<td>{item.limped}</td>
										</tr>
									)}
								</For>
							</tbody>
						</table>
						<p class="openings-view__note">
							Every hand where the action folded to you. Chart is what the seat's chart
							opens with the very cards you held, so a run of good or bad cards does not
							read as a leak. A seat is flagged only when the sample is large enough to
							bear it.
							<Show when={props.report.openings.shortStacked > 0}>
								{' '}
								{props.report.openings.shortStacked} spots under 30bb are left out: the
								opening charts do not cover them.
							</Show>
						</p>

						<label class="openings-view__field">
							<span class="openings-view__label">Seat</span>
							<select
								class="openings-view__select"
								value={current().position}
								onChange={(event) => setSeat(event.currentTarget.value as Position)}
							>
								<For each={rows()}>
									{(item) => (
										<option value={item.position}>
											{item.position}, {item.spots} spots
										</option>
									)}
								</For>
							</select>
						</label>
						<p class="openings-view__figures">
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

						<For each={DEVIATIONS}>
							{(group) => (
								<Show when={strays(group.chosen).length > 0}>
									<h3 class="openings-view__subtitle">{group.title}</h3>
									<ul class="openings-view__strays">
										<For each={strays(group.chosen)}>
											{(deviation) => (
												<li>
													<button
														type="button"
														onClick={() => props.onOpenHand(deviation.handId)}
													>
														{deviation.hand} · hand #{deviation.handId}
													</button>
												</li>
											)}
										</For>
									</ul>
								</Show>
							)}
						</For>
					</>
				)}
			</Show>
		</section>
	);
};

export default OpeningsView;
