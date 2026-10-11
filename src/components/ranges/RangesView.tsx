/**
 * The preflop baseline itself, browsable: every chart the grader uses, at each
 * stack depth, with how much of the deck it raises and calls.
 */

import { createMemo, createSignal, For, type Component } from 'solid-js';

import { chart, CHART_IDS, CHART_LABELS, hasOwnChart } from '#utils/ranges/charts';
import type { ChartId, Depth } from '#utils/ranges/charts';
import { rangeFraction } from '#utils/ranges/range';
import { percent } from '#utils/ui/format';

import RangeGrid from './RangeGrid';

import '#styles/ranges/RangesView';

const DEPTHS: { id: Depth; label: string }[] = [
	{ id: 'deep', label: '70bb and deeper' },
	{ id: 'mid', label: '30 to 70bb' },
];

export const RangeKey: Component<{ rest?: string }> = (props) => (
	<ul class="range-key">
		<li>
			<span class="range-key__swatch range-key__swatch--raise" />
			Raise
		</li>
		<li>
			<span class="range-key__swatch range-key__swatch--call" />
			Call
		</li>
		<li>
			<span class="range-key__swatch range-key__swatch--fold" />
			{props.rest ?? 'Fold'}
		</li>
	</ul>
);

const RangesView: Component = () => {
	const [id, setId] = createSignal<ChartId>('rfiBtn');
	const [depth, setDepth] = createSignal<Depth>('deep');
	const strategy = createMemo(() => chart(id(), depth()));

	return (
		<section class="ranges-view">
			<div class="ranges-view__controls">
				<label class="ranges-view__field">
					<span class="ranges-view__label">Spot</span>
					<select
						class="ranges-view__select"
						value={id()}
						onChange={(event) => setId(event.currentTarget.value as ChartId)}
					>
						<For each={CHART_IDS}>
							{(chartId) => <option value={chartId}>{CHART_LABELS[chartId]}</option>}
						</For>
					</select>
				</label>
				<label class="ranges-view__field">
					<span class="ranges-view__label">Effective stack</span>
					<select
						class="ranges-view__select"
						value={depth()}
						onChange={(event) => setDepth(event.currentTarget.value as Depth)}
					>
						<For each={DEPTHS}>
							{(item) => <option value={item.id}>{item.label}</option>}
						</For>
					</select>
				</label>
			</div>

			<p class="ranges-view__figures">
				Raises {percent(rangeFraction(strategy().raise))} of hands, calls{' '}
				{percent(rangeFraction(strategy().call))}.
				{hasOwnChart(id(), depth()) ?
					''
				:	' Same as the deep chart: this spot has none of its own at this depth.'}
			</p>
			<RangeGrid strategy={strategy()} />
			<RangeKey />
			<p class="ranges-view__note">
				These charts are hand-written approximations of published rake-adjusted 6-max
				solver ranges for 2.5bb opens, not solver exports. Under 30bb the grader uses the
				30 to 70bb charts and marks its findings low confidence.
			</p>
		</section>
	);
};

export default RangesView;
