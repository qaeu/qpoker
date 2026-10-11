/**
 * One hand replayed: the cards, the action street by street, and each of the
 * hero's decisions with its grade. A preflop decision graded off a chart shows
 * that chart, with the hand marked on it.
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

import '#styles/hand/HandDetail';

interface HandDetailProps {
	hand: HandReport;
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
					<h2 class="hand-detail__title">Hand #{props.hand.id}</h2>
					<p class="hand-detail__meta">
						{shortTime(props.hand.timestamp)} · {props.hand.table} · {props.hand.players}
						-handed · {props.hand.position ?? 'not dealt in'}
					</p>
				</div>
				<span class={`hand-detail__result ${signClass(props.hand.netBb) ?? ''}`}>
					{signed(props.hand.netBb)}bb
				</span>
			</header>

			<Show when={!props.hand.gradeable}>
				<p class="hand-detail__ungraded">This hand could not be graded.</p>
			</Show>

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
		</article>
	);
};

export default HandDetail;
