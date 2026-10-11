/**
 * Every good play, the most valuable first: the right decisions the hand argued
 * against, where the other action would have been a real mistake.
 */

import { createMemo, For, Show, type Component } from 'solid-js';

import type { AnalysisReport } from '#utils/coach/report';

import MistakeCard from './MistakeCard';

import '#styles/report/GoodPlaysView';

interface GoodPlaysViewProps {
	report: AnalysisReport;
	onOpenHand: (handId: string) => void;
}

const GoodPlaysView: Component<GoodPlaysViewProps> = (props) => {
	const hands = createMemo(
		() => new Map(props.report.hands.map((hand) => [hand.id, hand]))
	);

	return (
		<section class="good-plays-view">
			<Show
				when={props.report.goodPlays.length > 0}
				fallback={
					<p class="good-plays-view__empty">
						No good plays were picked out of this log. That is not a verdict on the
						session: most right decisions are easy ones, and only the hard ones are
						listed.
					</p>
				}
			>
				<ol class="good-plays-view__list">
					<For each={props.report.goodPlays}>
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
			<p class="good-plays-view__note">
				A good play is a right decision that was hard to make: a call made as the
				underdog, or a strong hand laid down. Its figure is what the other action would
				have cost, estimated by the same model that prices the mistakes, and is marked
				with how far it can be trusted.
			</p>
		</section>
	);
};

export default GoodPlaysView;
