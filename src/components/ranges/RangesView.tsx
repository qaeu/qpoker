/**
 * The preflop baseline itself, browsable: every chart the grader uses, at each
 * stack depth, with how much of the deck it raises and calls. The chart is
 * chosen by scenario and then within it, on keys or with the arrows, and the
 * choice is the view's address.
 */

import { createMemo, onCleanup, onMount, Show, type Component } from 'solid-js';

import Segmented, { type SegmentOption } from '#c/common/Segmented';

import type { NavigateOptions } from '#utils/app/hashRoute';
import { rangeFraction } from '#utils/ranges/range';
import { percent } from '#utils/ui/format';
import { ARROWED, TYPING } from '#utils/ui/keys';
import {
	chartIn,
	GROUP_LABELS,
	hasDepths,
	hasOwnTable,
	RANGE_GROUPS,
	stepChart,
	stepGroup,
	TABLE_LABELS,
	tableOf,
	tablesIn,
	tableStrategy,
	type RangeDepth,
	type RangeGroup,
	type RangesQuery,
	type TableId,
} from '#utils/ui/rangeTables';

import RangeGrid from './RangeGrid';

import '#styles/ranges/RangesView';

interface RangesViewProps {
	query: RangesQuery;
	onQuery: (change: Partial<RangesQuery>, options?: NavigateOptions) => void;
}

const GROUPS: SegmentOption<RangeGroup>[] = RANGE_GROUPS.map((id) => ({
	id,
	label: GROUP_LABELS[id],
}));

const DEPTHS: SegmentOption<RangeDepth>[] = [
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

const RangesView: Component<RangesViewProps> = (props) => {
	const id = () => props.query.chart;
	const group = createMemo(() => tableOf(id()).group);
	// A scenario whose charts are the same at every depth has no stack to pick; the
	// address keeps its depth for the next scenario that does.
	const stacked = createMemo(() => hasDepths(group()));
	const depth = (): RangeDepth => (stacked() ? props.query.depth : 'deep');
	const charts = createMemo<SegmentOption<TableId>[]>(() =>
		tablesIn(group()).map((table) => ({ id: table.id, label: table.short }))
	);
	const strategy = createMemo(() => tableStrategy(id(), depth()));

	// A step with the keys rewrites the entry: holding one is not twenty pages back.
	const step = (to: TableId) => {
		if (to !== id()) props.onQuery({ chart: to }, { replace: true });
	};

	const onKey = (event: KeyboardEvent) => {
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		if (event.target instanceof Element && event.target.closest(TYPING)) return;
		if (event.key.toLowerCase() === 'd') {
			if (!stacked()) return;
			event.preventDefault();
			props.onQuery({ depth: depth() === 'deep' ? 'mid' : 'deep' }, { replace: true });
			return;
		}
		const to =
			event.key === 'ArrowLeft' ? stepChart(id(), -1)
			: event.key === 'ArrowRight' ? stepChart(id(), 1)
			: event.key === 'ArrowUp' ? stepGroup(id(), -1)
			: event.key === 'ArrowDown' ? stepGroup(id(), 1)
			: undefined;
		if (to === undefined) return;
		if (event.target instanceof Element && event.target.closest(ARROWED)) return;
		event.preventDefault();
		step(to);
	};
	onMount(() => {
		window.addEventListener('keydown', onKey);
		onCleanup(() => window.removeEventListener('keydown', onKey));
	});

	return (
		<section class="ranges-view">
			<aside class="ranges-view__aside">
				<Segmented
					label="Scenario"
					orientation="vertical"
					options={GROUPS}
					value={group()}
					onChange={(next) => props.onQuery({ chart: chartIn(next, id()) })}
				/>
			</aside>

			<div class="ranges-view__chart">
				<div class="ranges-view__controls">
					<Segmented
						label="Chart"
						options={charts()}
						value={id()}
						onChange={(next) => props.onQuery({ chart: next })}
					/>
					<Show when={stacked()}>
						<Segmented
							label="Stack"
							options={DEPTHS}
							value={depth()}
							onChange={(next) => props.onQuery({ depth: next })}
						/>
					</Show>
					<p class="ranges-view__keys">
						<kbd>←</kbd>
						<kbd>→</kbd> chart
						<kbd>↑</kbd>
						<kbd>↓</kbd> scenario
						<Show when={stacked()}>
							<kbd>D</kbd> stack
						</Show>
					</p>
				</div>

				<h2 class="ranges-view__title">{TABLE_LABELS[id()]}</h2>
				<p class="ranges-view__figures">
					Raises {percent(rangeFraction(strategy().raise))} of hands,{' '}
					{tableOf(id()).free ?
						'checks the rest.'
					:	`calls ${percent(rangeFraction(strategy().call))}.`}
					{hasOwnTable(id(), depth()) ?
						''
					:	' Same as the deep chart: this spot has none of its own at this depth.'}
					{tableOf(id()).note ? ` ${tableOf(id()).note}` : ''}
				</p>
				<RangeGrid strategy={strategy()} rest={tableOf(id()).free ? 'checks' : 'folds'} />
				<RangeKey rest={tableOf(id()).free ? 'Check' : 'Fold'} />
				<p class="ranges-view__note">
					These charts are hand-written approximations of published rake-adjusted 6-max
					solver ranges for 2.5bb opens, not solver exports. Under 30bb the grader uses
					the 30 to 70bb charts and marks its findings low confidence.
				</p>
			</div>
		</section>
	);
};

export default RangesView;
