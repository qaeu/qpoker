/**
 * The hand as a strip: one tick per step, grouped by street, with the hero's
 * decisions and what was found at them marked, and the keys that walk it. It
 * moves nothing itself: every press asks for a step.
 */

import { createMemo, For, type Component } from 'solid-js';

import { SkipBack } from 'lucide-solid';

import type { Grading } from '#utils/coach/grade';
import type { HandReport } from '#utils/coach/report';
import { STREETS } from '#utils/history/hand';
import { decisionSteps, stepText, type TableStep } from '#utils/ui/tableReplay';

import '#styles/hand/StepScrubber';

interface StepScrubberProps {
	hand: HandReport;
	/** `tableSteps(hand)`. */
	steps: TableStep[];
	/** Index into `steps`. */
	step: number;
	onStep: (step: number) => void;
}

/** The sheet has a width class for a street of up to this many steps. */
const MAX_SPAN = 30;

/** The class a tick takes from what was found at its step. */
function findingClass(grading: Grading | undefined): string {
	if (grading?.mistake) return `is-${grading.severity}`;
	return grading?.goodPlay ? 'is-good-play' : '';
}

const StepScrubber: Component<StepScrubberProps> = (props) => {
	const gradings = createMemo(
		() => new Map(props.hand.gradings.map((grading) => [grading.stepIndex, grading]))
	);
	const decisions = createMemo(() => decisionSteps(props.steps, props.hand));
	const groups = createMemo(() =>
		STREETS.map((street) => ({
			street,
			indexes: props.steps.flatMap((step, index) =>
				step.street === street ? [index] : []
			),
		})).filter((group) => group.indexes.length > 0)
	);
	const nextDecision = () => decisions().find((index) => index > props.step);
	const atEnd = () => props.step >= props.steps.length - 1;

	return (
		<div class="step-scrubber">
			<div class="step-scrubber__track">
				<For each={groups()}>
					{(group) => (
						<div
							class={`step-scrubber__street step-scrubber__street--${Math.min(group.indexes.length, MAX_SPAN)}`}
							classList={{ 'is-current': group.indexes.includes(props.step) }}
						>
							<div class="step-scrubber__ticks">
								<For each={group.indexes}>
									{(index) => (
										<button
											type="button"
											class={`step-scrubber__tick ${findingClass(
												gradings().get(props.steps[index].lineIndex ?? -1)
											)}`}
											classList={{
												'is-done': index <= props.step,
												'is-decision': decisions().includes(index),
											}}
											aria-label={`Step ${index + 1}: ${stepText(props.hand, props.steps[index])}`}
											aria-current={index === props.step ? 'step' : undefined}
											onClick={() => props.onStep(index)}
										>
											<span class="step-scrubber__bar" />
										</button>
									)}
								</For>
							</div>
							<button
								type="button"
								class="step-scrubber__label"
								onClick={() => props.onStep(group.indexes[0])}
							>
								{group.street}
							</button>
						</div>
					)}
				</For>
			</div>
			<div class="step-scrubber__keys">
				<button
					type="button"
					class="step-scrubber__start"
					aria-label="Back to the deal"
					disabled={props.step === 0}
					onClick={() => props.onStep(0)}
				>
					<SkipBack aria-hidden="true" />
				</button>
				<button
					type="button"
					class="step-scrubber__key"
					aria-label="Back a step"
					disabled={props.step === 0}
					onClick={() => props.onStep(props.step - 1)}
				>
					Back
					<kbd class="step-scrubber__cap" aria-hidden="true">
						←
					</kbd>
				</button>
				<button
					type="button"
					class="step-scrubber__key"
					aria-label="Forward a step"
					disabled={atEnd()}
					onClick={() => props.onStep(props.step + 1)}
				>
					Step
					<kbd class="step-scrubber__cap" aria-hidden="true">
						→
					</kbd>
				</button>
				<button
					type="button"
					class="step-scrubber__key highlight"
					disabled={nextDecision() === undefined}
					onClick={() => props.onStep(nextDecision() ?? props.step)}
				>
					My next decision
				</button>
			</div>
		</div>
	);
};

export default StepScrubber;
