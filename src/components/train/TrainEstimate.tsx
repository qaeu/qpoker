/**
 * The equity drill's answer: one of five bands in Easy, keys 1 to 5, or in Hard
 * and a Test a number typed in and sent with Enter.
 */

import { createEffect, createSignal, For, on, Show, type Component } from 'solid-js';

import { EQUITY_BANDS, type DrillMode, type Question } from '#utils/train/drills';
import type { Graded, Response } from '#utils/train/grade';

import '#styles/train/TrainChoice';
import '#styles/train/TrainEstimate';

interface TrainEstimateProps {
	mode: DrillMode;
	/** Changes with each question, which clears the field. */
	question: Question;
	asking: boolean;
	graded: Graded | null;
	onAnswer: (response: Response) => void;
}

/** A whole percent from 0 to 100, or null for anything else typed. */
function parsePercent(text: string): number | null {
	if (!/^\d{1,3}$/.test(text.trim())) return null;
	const value = Number(text);
	return value <= 100 ? value : null;
}

const TrainEstimate: Component<TrainEstimateProps> = (props) => {
	const [text, setText] = createSignal('');
	let field: HTMLInputElement | undefined;

	createEffect(
		on(
			() => props.question,
			() => {
				setText('');
				field?.focus();
			}
		)
	);

	const picked = () =>
		props.graded?.response?.kind === 'band' ? props.graded.response.band : null;
	const mark = (band: number): 'right' | 'miss' | null => {
		const graded = props.graded;
		if (graded === null || picked() !== band) return null;
		return graded.correct ? 'right' : 'miss';
	};

	const submit = (event: SubmitEvent) => {
		event.preventDefault();
		const pct = parsePercent(text());
		if (!props.asking || pct === null) return;
		props.onAnswer({ kind: 'estimate', pct });
	};

	return (
		<Show
			when={props.mode === 'easy'}
			fallback={
				<form class="train-estimate" onSubmit={submit}>
					<label class="train-estimate__label" for="train-estimate-field">
						Your equity
					</label>
					<input
						id="train-estimate-field"
						ref={field}
						class="train-estimate__field"
						type="text"
						inputmode="numeric"
						autocomplete="off"
						maxlength={3}
						placeholder="0 to 100"
						value={text()}
						disabled={!props.asking}
						onInput={(event) => setText(event.currentTarget.value)}
					/>
					<span class="train-estimate__unit">%</span>
					<button type="submit" class="highlight" disabled={!props.asking}>
						<span class="train-estimate__cap">Enter</span>
						Answer
					</button>
				</form>
			}
		>
			<div class="train-choice" role="group" aria-label="Your equity">
				<For each={EQUITY_BANDS}>
					{([low, high], index) => (
						<button
							type="button"
							class="train-choice__key"
							classList={{
								'is-right': mark(index()) === 'right',
								'is-miss': mark(index()) === 'miss',
							}}
							disabled={!props.asking}
							onClick={() => props.onAnswer({ kind: 'band', band: index() })}
						>
							<span class="train-choice__cap">{index() + 1}</span>
							{low} to {high}%
						</button>
					)}
				</For>
			</div>
		</Show>
	);
};

export default TrainEstimate;
