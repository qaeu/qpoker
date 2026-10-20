/**
 * The answers to a multiple-choice question as keys, 1 to N. A key is printed in
 * the hue of what it does (a raise or a bet gold, a call or a check mint, a fold
 * none); once a verdict is up the right ones take a mint edge and a missed pick a
 * ruby one, with the word on the key as well.
 */

import { For, Show, type Component } from 'solid-js';

import type { Choice } from '#utils/train/drills';
import type { Graded } from '#utils/train/grade';
import { CHOICE_LABELS } from '#utils/train/run';

import '#styles/train/TrainChoice';

interface TrainChoiceProps {
	choices: readonly Choice[];
	/** Whether a question is waiting on an answer. */
	asking: boolean;
	/** The graded answer to show, once it is shown at all. */
	graded: Graded | null;
	onAnswer: (choice: Choice) => void;
}

const HUES: Record<Choice, 'raise' | 'call' | 'fold'> = {
	fold: 'fold',
	check: 'call',
	call: 'call',
	raise: 'raise',
	bet33: 'raise',
	bet50: 'raise',
	bet66: 'raise',
};

const TrainChoice: Component<TrainChoiceProps> = (props) => {
	const picked = () =>
		props.graded?.response?.kind === 'choice' ? props.graded.response.choice : null;
	const mark = (choice: Choice): 'right' | 'miss' | null => {
		const graded = props.graded;
		if (graded === null) return null;
		if (graded.right.includes(choice)) return 'right';
		return picked() === choice ? 'miss' : null;
	};

	return (
		<div class="train-choice" role="group" aria-label="Your answer">
			<For each={props.choices}>
				{(choice, index) => (
					<button
						type="button"
						class={`train-choice__key is-${HUES[choice]}`}
						classList={{
							'is-right': mark(choice) === 'right',
							'is-miss': mark(choice) === 'miss',
						}}
						disabled={!props.asking}
						onClick={() => props.onAnswer(choice)}
					>
						<span class="train-choice__cap">{index() + 1}</span>
						{CHOICE_LABELS[choice]}
						<Show when={mark(choice)}>
							{(state) => (
								<small class="train-choice__tag">
									{state() === 'right' ? 'right' : 'your pick'}
								</small>
							)}
						</Show>
					</button>
				)}
			</For>
		</div>
	);
};

export default TrainChoice;
