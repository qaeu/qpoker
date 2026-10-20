/**
 * The strip across the top of a drill: which drill, how far through it, how each
 * answer went, and the clock. In a Test the clock is the time left on the hand,
 * as text: nothing here animates on its own.
 */

import { For, Show, type Component } from 'solid-js';

import { DRILL_NAMES, formatClock, MODE_NAMES } from '#utils/train/run';
import type { DrillId, DrillMode } from '#utils/train/drills';

import '#styles/train/TrainHud';

/** How one step of the progress strip reads. */
export type StepMark = 'right' | 'miss' | 'done' | null;

/** Under the last `LOW_TIME_MS` of a Test's clock the countdown turns ruby. */
const LOW_TIME_MS = 1500;

interface TrainHudProps {
	drill: DrillId;
	mode: DrillMode;
	/** From 0: the question in front of the player. */
	current: number;
	/** One per question: how it went, or null while unanswered. */
	marks: readonly StepMark[];
	/** Right so far; null where verdicts are held back. */
	correct: number | null;
	/** The answering time so far. Unread in a Test, whose countdown replaces it. */
	clockMs: number;
	/** A Test's time left on this question, or null while none is being asked. */
	remainingMs: number | null;
	/** What a Test allows for a hand. */
	limitMs: number;
}

const TrainHud: Component<TrainHudProps> = (props) => {
	const remaining = () => props.remainingMs ?? props.limitMs;

	return (
		<div class="train-hud">
			<span class="train-hud__drill">
				{DRILL_NAMES[props.drill]} <em>· {MODE_NAMES[props.mode]}</em>
			</span>
			<span class="train-hud__read">
				Hand <b>{Math.min(props.current + 1, props.marks.length)}</b> /{' '}
				{props.marks.length}
			</span>
			<div
				class="train-hud__steps"
				classList={{ 'is-dense': props.marks.length > 20 }}
				aria-hidden="true"
			>
				<For each={props.marks}>
					{(mark, index) => (
						<span
							class="train-hud__step"
							classList={{
								'is-right': mark === 'right',
								'is-miss': mark === 'miss',
								'is-done': mark === 'done',
								'is-current': index() === props.current,
							}}
						/>
					)}
				</For>
			</div>
			<div class="train-hud__end">
				<Show when={props.correct !== null}>
					<span class="train-hud__read">
						✓ <b>{props.correct}</b>
					</span>
				</Show>
				<Show
					when={props.mode === 'test'}
					fallback={
						<span class="train-hud__read">
							Time <b>{formatClock(props.clockMs)}</b>
						</span>
					}
				>
					<span
						class="train-hud__read train-hud__countdown"
						classList={{ 'is-low': remaining() < LOW_TIME_MS }}
						role="timer"
					>
						<b>{(remaining() / 1000).toFixed(1)}</b> s left
					</span>
				</Show>
			</div>
		</div>
	);
};

export default TrainHud;
