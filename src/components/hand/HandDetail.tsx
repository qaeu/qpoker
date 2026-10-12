/**
 * One hand replayed: the table at the step being read, beside the action
 * street by street and each of the hero's decisions with its grade. A decision
 * the baseline has no quarrel with is tagged in its line; a mistake or a good
 * play gets a card, and with it the chart a preflop one was graded off, the
 * hand marked on it.
 */

import { createMemo, For, Show, type Component } from 'solid-js';

import PlayingCards from '#c/common/PlayingCards';
import MistakeCard from '#c/report/MistakeCard';
import RangeGrid from '#c/ranges/RangeGrid';
import { RangeKey } from '#c/ranges/RangesView';
import type { Grading } from '#utils/coach/grade';
import type { ActionLine, HandReport } from '#utils/coach/report';
import { STREETS, type Street } from '#utils/history/hand';
import { chart, CHART_LABELS } from '#utils/ranges/charts';
import { shortTime, signClass, signed } from '#utils/ui/format';
import { resolveStep, tableSteps } from '#utils/ui/tableReplay';

import HandTable from './HandTable';

import '#styles/hand/HandDetail';

interface HandDetailProps {
	hand: HandReport;
	/** Where the hand comes in the log, counted from one, and out of how many. */
	number: number;
	total: number;
	/** Steps through whatever list the hand is being read from; absent at its ends. */
	onPrev?: () => void;
	onNext?: () => void;
	/** Where the replay stands; null or absent for where the hand opens by itself. */
	step?: number | null;
	/** The blinds, for the table's print. */
	stakes?: string;
}

/** The board cards a street turned over. */
function dealt(board: string, street: Street): string {
	const cards = board.split(' ').filter(Boolean);
	return (
		street === 'flop' ? cards.slice(0, 3)
		: street === 'turn' ? cards.slice(3, 4)
		: street === 'river' ? cards.slice(4, 5)
		: []).join(' ');
}

const HandDetail: Component<HandDetailProps> = (props) => {
	const gradings = createMemo(
		() => new Map(props.hand.gradings.map((grading) => [grading.stepIndex, grading]))
	);
	const steps = createMemo(() => tableSteps(props.hand));
	const step = createMemo(() => resolveStep(steps(), props.hand, props.step ?? null));
	const streets = createMemo(() =>
		STREETS.map((street) => ({
			street,
			cards: dealt(props.hand.board, street),
			lines: props.hand.lines.filter((line) => line.street === street),
		})).filter((group) => group.lines.length > 0)
	);

	const Line: Component<{ line: ActionLine }> = (lineProps) => {
		const grading = (): Grading | undefined => gradings().get(lineProps.line.stepIndex);
		return (
			<li class="hand-detail__line" classList={{ 'is-hero': lineProps.line.hero }}>
				<span class="hand-detail__action">{lineProps.line.text}</span>
				<Show when={grading()}>
					{(graded) => (
						<Show
							when={graded().mistake || graded().goodPlay}
							fallback={
								<span
									class="hand-detail__baseline"
									title={
										graded().chosen === graded().recommended ?
											undefined
										:	`The baseline leans to ${graded().recommended}, but not by enough to matter.`
									}
								>
									{graded().chosen === graded().recommended ?
										'on baseline'
									:	'near baseline'}
								</span>
							}
						>
							<div class="hand-detail__grade">
								<MistakeCard grading={graded()} />
								<Show when={graded().preflop?.chart}>
									{(chartId) => (
										<details class="hand-detail__chart">
											<summary>Baseline range: {CHART_LABELS[chartId()]}</summary>
											<RangeGrid
												strategy={chart(chartId(), graded().preflop!.depth)}
												marked={graded().preflop!.hand}
											/>
											<RangeKey />
										</details>
									)}
								</Show>
							</div>
						</Show>
					)}
				</Show>
			</li>
		);
	};

	return (
		<article class="hand-detail">
			<header class="hand-detail__head">
				<PlayingCards cards={props.hand.heroCards} size="large" />
				<div class="hand-detail__facts">
					<h2 class="hand-detail__title">
						Hand {props.number} <span class="hand-detail__of">of {props.total}</span>
					</h2>
					<p class="hand-detail__meta">
						{shortTime(props.hand.timestamp)} · {props.hand.table} · {props.hand.players}
						-handed · {props.hand.position ?? 'not dealt in'} · #{props.hand.id}
					</p>
				</div>
				<span class={`hand-detail__result ${signClass(props.hand.netBb) ?? ''}`}>
					{signed(props.hand.netBb)}
					<span class="hand-detail__unit">bb</span>
				</span>
				<div class="hand-detail__nav">
					<button
						type="button"
						aria-label="Previous hand in the list"
						disabled={!props.onPrev}
						onClick={() => props.onPrev?.()}
					>
						Prev
						<kbd class="hand-detail__key" aria-hidden="true">
							K
						</kbd>
					</button>
					<button
						type="button"
						aria-label="Next hand in the list"
						disabled={!props.onNext}
						onClick={() => props.onNext?.()}
					>
						Next
						<kbd class="hand-detail__key" aria-hidden="true">
							J
						</kbd>
					</button>
				</div>
			</header>

			<Show when={!props.hand.gradeable}>
				<p class="hand-detail__ungraded">This hand could not be graded.</p>
			</Show>

			<div class="hand-detail__body">
				<Show when={steps()[step()]}>
					{(shown) => (
						<div class="hand-detail__stage">
							<HandTable hand={props.hand} step={shown()} stakes={props.stakes} />
						</div>
					)}
				</Show>
				<div class="hand-detail__log">
					<For each={streets()}>
						{(group) => (
							<section class="hand-detail__street">
								<h3 class="hand-detail__street-name">
									{group.street}
									<Show when={group.cards}>
										<PlayingCards cards={group.cards} />
									</Show>
								</h3>
								<ol class="hand-detail__lines">
									<For each={group.lines}>{(line) => <Line line={line} />}</For>
								</ol>
							</section>
						)}
					</For>

					<Show when={Object.keys(props.hand.shown).length > 0}>
						<section class="hand-detail__street">
							<h3 class="hand-detail__street-name">Showdown</h3>
							<ul class="hand-detail__lines">
								<For each={Object.entries(props.hand.shown)}>
									{([name, cards]) => (
										<li class="hand-detail__line">
											<span class="hand-detail__action">
												{name} shows <PlayingCards cards={cards} />
											</span>
										</li>
									)}
								</For>
							</ul>
						</section>
					</Show>
				</div>
			</div>
		</article>
	);
};

export default HandDetail;
