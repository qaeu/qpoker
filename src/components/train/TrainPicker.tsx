/**
 * The Train view's front page: the drills side by side, each with its mode, its
 * length and the best run on its board.
 */

import { For, Show, type Component } from 'solid-js';

import Segmented, { type SegmentOption } from '#c/common/Segmented';
import type { TrainConfig } from '#utils/app/storage';
import {
	DRILL_IDS,
	DRILL_MODES,
	QUESTIONS,
	TEST_LIMIT_MS,
	type DrillId,
	type DrillMode,
} from '#utils/train/drills';
import { DRILL_BLURBS, DRILL_NAMES, formatClock, MODE_NAMES } from '#utils/train/run';
import { bestOn, boardKey, type ScoreBoards } from '#utils/train/scores';

import '#styles/train/TrainPicker';

const MODES: SegmentOption<DrillMode>[] = DRILL_MODES.map((id) => ({
	id,
	label: MODE_NAMES[id],
}));

/** What each mode means for a drill, in a line. */
function modeNote(drill: DrillId, mode: DrillMode): string {
	if (mode === 'test') {
		return `The hard spots against the clock: ${TEST_LIMIT_MS[drill] / 1000} s a hand. Verdicts held until the end.`;
	}
	return mode === 'easy' ?
			'The common spots. A verdict after every answer.'
		:	'The borderline spots. A verdict after every answer.';
}

interface TrainPickerProps {
	config: TrainConfig;
	boards: ScoreBoards;
	onModeChange: (drill: DrillId, mode: DrillMode) => void;
	onStart: (drill: DrillId, mode: DrillMode) => void;
}

const TrainPicker: Component<TrainPickerProps> = (props) => (
	<section class="train-picker">
		<div class="train-picker__head">
			<h2 class="train-picker__title">Train</h2>
			<p class="train-picker__rules">
				Drills on the baseline&rsquo;s own model, not on your hands. They never touch a
				grade.
			</p>
		</div>

		<div class="train-picker__drills">
			<For each={DRILL_IDS}>
				{(drill) => {
					const mode = () => props.config.modes[drill];
					const best = () => bestOn(props.boards, boardKey(drill, mode()));
					return (
						<article class="train-picker__drill">
							<div class="train-picker__intro">
								<h3 class="train-picker__name">{DRILL_NAMES[drill]}</h3>
								<p class="train-picker__desc">{DRILL_BLURBS[drill]}</p>
							</div>
							<Segmented
								label="Mode"
								options={MODES}
								value={mode()}
								onChange={(next) => props.onModeChange(drill, next)}
							/>
							<p class="train-picker__note">{modeNote(drill, mode())}</p>
							<dl class="train-picker__meta">
								<div>
									<dt>Length</dt>
									<dd>
										{QUESTIONS[mode()]}
										<small>hands</small>
									</dd>
								</div>
								<div>
									<dt>Best</dt>
									<dd>
										<Show
											when={best()}
											fallback={
												<>
													&mdash;<small>No run yet</small>
												</>
											}
										>
											{(entry) => (
												<>
													{entry().correct}/{entry().total}
													<small>{formatClock(entry().timeMs)}</small>
												</>
											)}
										</Show>
									</dd>
								</div>
							</dl>
							<button
								type="button"
								class="highlight train-picker__start"
								onClick={() => props.onStart(drill, mode())}
							>
								Start
							</button>
						</article>
					);
				}}
			</For>
		</div>
	</section>
);

export default TrainPicker;
