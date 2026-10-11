/**
 * Every graded mistake, costliest first, narrowed by how bad it was and which
 * street it was on.
 */

import { createMemo, createSignal, For, Show, type Component } from 'solid-js';

import type { AnalysisReport } from '#utils/coach/report';
import { SEVERITIES, type Severity } from '#utils/coach/mistakes';

import MistakeCard from './MistakeCard';

import '#styles/report/MistakesView';

interface MistakesViewProps {
	report: AnalysisReport;
	onOpenHand: (handId: string) => void;
}

type StreetFilter = 'all' | 'preflop' | 'postflop';

const SEVERITY_OPTIONS: { id: Severity; label: string }[] = [
	{ id: 'inaccuracy', label: 'Everything' },
	{ id: 'mistake', label: 'Mistakes and blunders' },
	{ id: 'blunder', label: 'Blunders only' },
];

const MistakesView: Component<MistakesViewProps> = (props) => {
	const [floor, setFloor] = createSignal<Severity>('inaccuracy');
	const [street, setStreet] = createSignal<StreetFilter>('all');

	const hands = createMemo(
		() => new Map(props.report.hands.map((hand) => [hand.id, hand]))
	);
	const shown = createMemo(() =>
		props.report.mistakes.filter((grading) => {
			if (SEVERITIES.indexOf(grading.severity) < SEVERITIES.indexOf(floor()))
				return false;
			if (street() === 'preflop') return grading.street === 'preflop';
			if (street() === 'postflop') return grading.street !== 'preflop';
			return true;
		})
	);

	return (
		<section class="mistakes-view">
			<div class="mistakes-view__filters">
				<label class="mistakes-view__field">
					<span class="mistakes-view__label">Show</span>
					<select
						class="mistakes-view__select"
						value={floor()}
						onChange={(event) => setFloor(event.currentTarget.value as Severity)}
					>
						<For each={SEVERITY_OPTIONS}>
							{(option) => <option value={option.id}>{option.label}</option>}
						</For>
					</select>
				</label>
				<label class="mistakes-view__field">
					<span class="mistakes-view__label">Street</span>
					<select
						class="mistakes-view__select"
						value={street()}
						onChange={(event) => setStreet(event.currentTarget.value as StreetFilter)}
					>
						<option value="all">All streets</option>
						<option value="preflop">Preflop</option>
						<option value="postflop">Postflop</option>
					</select>
				</label>
				<span class="mistakes-view__count">
					{shown().length} of {props.report.mistakes.length}
				</span>
			</div>

			<Show
				when={shown().length > 0}
				fallback={<p class="mistakes-view__empty">Nothing to show at this filter.</p>}
			>
				<ol class="mistakes-view__list">
					<For each={shown()}>
						{(grading) => (
							<li>
								<MistakeCard
									grading={grading}
									hand={hands().get(grading.handId)}
									onOpenHand={props.onOpenHand}
								/>
							</li>
						)}
					</For>
				</ol>
			</Show>
			<p class="mistakes-view__note">
				Costs are estimates against a baseline model, not solver output. Preflop findings
				rest on range charts; postflop ones on an opponent-range model and are marked with
				how far they can be trusted.
			</p>
		</section>
	);
};

export default MistakesView;
