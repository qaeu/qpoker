/**
 * What the step on the table was, in words: where in the hand it is, the
 * action in big blinds, what the actor faced, and the grade when the action was
 * one of the hero's decisions. The grade lives here and not in the list of
 * lines: see docs/design-language.md, "The replay table".
 */

import { createMemo, Show, type Component } from 'solid-js';

import MistakeCard from '#c/report/MistakeCard';
import RangeGrid from '#c/ranges/RangeGrid';
import { RangeKey } from '#c/ranges/RangesView';
import type { HandReport } from '#utils/coach/report';
import { chart, CHART_LABELS } from '#utils/ranges/charts';
import { stepFacts, stepStreet, stepText, type TableStep } from '#utils/ui/tableReplay';

import '#styles/hand/StepCaption';

interface StepCaptionProps {
	hand: HandReport;
	/** `tableSteps(hand)`. */
	steps: TableStep[];
	/** Index into `steps`. */
	step: number;
}

const StepCaption: Component<StepCaptionProps> = (props) => {
	const current = () => props.steps[props.step];
	const grading = createMemo(() =>
		props.hand.gradings.find(({ stepIndex }) => stepIndex === current().lineIndex)
	);
	const finding = () => {
		const graded = grading();
		return graded && (graded.mistake || graded.goodPlay) ? graded : undefined;
	};
	const baseline = () => (grading() && !finding() ? grading() : undefined);
	const byHero = () => {
		const { actor } = current();
		return actor !== null && props.hand.seats[actor].hero;
	};

	return (
		<div class="step-caption" aria-live="polite">
			<div class="step-caption__head">
				<div class="step-caption__top">
					<p class="step-caption__where">
						{stepStreet(props.hand, current())} · step {props.step + 1} of{' '}
						{props.steps.length}
					</p>
					<Show when={baseline()}>
						{(graded) => (
							<span class="step-caption__baseline">
								{graded().chosen === graded().recommended ?
									'on baseline'
								:	'near baseline'}
							</span>
						)}
					</Show>
				</div>
				<p class="step-caption__text" classList={{ 'is-hero': byHero() }}>
					{stepText(props.hand, current())}
				</p>
				<p class="step-caption__facts">{stepFacts(props.hand, current())}</p>
				<Show when={baseline()}>
					{(graded) => (
						<Show when={graded().chosen !== graded().recommended}>
							<p class="step-caption__note">
								The baseline leans to {graded().recommended}, but not by enough to matter.
							</p>
						</Show>
					)}
				</Show>
			</div>
			<Show when={finding()}>
				{(graded) => (
					<>
						<MistakeCard grading={graded()} />
						<Show when={graded().preflop?.chart}>
							{(chartId) => (
								<details class="step-caption__chart">
									<summary>Baseline range: {CHART_LABELS[chartId()]}</summary>
									<RangeGrid
										strategy={chart(chartId(), graded().preflop!.depth)}
										marked={graded().preflop!.hand}
									/>
									<RangeKey />
								</details>
							)}
						</Show>
					</>
				)}
			</Show>
		</div>
	);
};

export default StepCaption;
