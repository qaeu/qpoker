/**
 * Every hand in the log beside the one being read. The list can be cut down to
 * the hands that were played, or those with a mistake or a good play in them.
 */

import { createMemo, createSignal, For, Show, type Component } from 'solid-js';

import PlayingCards from '#c/common/PlayingCards';
import type { AnalysisReport, HandReport } from '#utils/coach/report';
import { signClass, signed } from '#utils/ui/format';

import HandDetail from './HandDetail';

import '#styles/hand/HandsView';

interface HandsViewProps {
	report: AnalysisReport;
	selected: string | null;
	onSelect: (handId: string) => void;
}

type HandFilter = 'all' | 'played' | 'mistakes' | 'plays';

const isPlayed = (hand: HandReport): boolean =>
	hand.gradings.some(
		(grading) => grading.chosen !== 'fold' && grading.chosen !== 'check'
	);

const HandsView: Component<HandsViewProps> = (props) => {
	const [filter, setFilter] = createSignal<HandFilter>('all');

	const listed = createMemo(() =>
		props.report.hands.filter((hand) =>
			filter() === 'mistakes' ? hand.evLostBb < 0
			: filter() === 'plays' ? hand.gradings.some((grading) => grading.goodPlay)
			: filter() === 'played' ? isPlayed(hand)
			: true
		)
	);
	const current = createMemo(
		() =>
			props.report.hands.find((hand) => hand.id === props.selected)
			?? listed()[0]
			?? props.report.hands[0]
	);

	return (
		<section class="hands-view">
			<div class="hands-view__list-panel">
				<label class="hands-view__field">
					<span class="hands-view__label">Hands</span>
					<select
						class="hands-view__select"
						value={filter()}
						onChange={(event) => setFilter(event.currentTarget.value as HandFilter)}
					>
						<option value="all">All {props.report.hands.length}</option>
						<option value="played">Played</option>
						<option value="mistakes">With a mistake</option>
						<option value="plays">With a good play</option>
					</select>
				</label>
				<ol class="hands-view__list">
					<For each={listed()}>
						{(hand) => (
							<li>
								<button
									type="button"
									class="hands-view__row"
									classList={{ active: hand.id === current()?.id }}
									aria-label={`Hand ${hand.id}`}
									onClick={() => props.onSelect(hand.id)}
								>
									<span class="hands-view__time">{hand.timestamp.slice(11, 16)}</span>
									<span class="hands-view__seat">{hand.position ?? '—'}</span>
									<PlayingCards cards={hand.heroCards} />
									<span class={`hands-view__net ${signClass(hand.netBb) ?? ''}`}>
										{signed(hand.netBb)}
									</span>
									<Show when={hand.evLostBb < 0}>
										<span class="hands-view__lost" title="Estimated EV lost to mistakes">
											{signed(hand.evLostBb, 1)}
										</span>
									</Show>
								</button>
							</li>
						)}
					</For>
				</ol>
			</div>
			<div class="hands-view__detail">
				<Show when={current()} keyed>
					{(hand) => <HandDetail hand={hand} />}
				</Show>
			</div>
		</section>
	);
};

export default HandsView;
