/**
 * What the drill says after an answer: right in mint or missed in ruby, on the
 * edge and the label only, the grader's sentence, and the way on. A preflop
 * answer is also set against the whole chart it came from.
 */

import type { Component } from 'solid-js';

import RangeGrid from '#c/ranges/RangeGrid';
import { RangeKey } from '#c/ranges/RangesView';
import { className } from '#utils/cards/combos';
import type { PreflopQuestion } from '#utils/train/drills';
import type { Graded } from '#utils/train/grade';
import { tableStrategy } from '#utils/ui/rangeTables';

import '#styles/train/TrainVerdict';

interface TrainVerdictProps {
	graded: Graded;
	/** Space's label: the next hand, or the results after the last. */
	nextLabel: string;
	onNext: () => void;
}

export const TrainVerdict: Component<TrainVerdictProps> = (props) => (
	<div
		class="train-verdict"
		classList={{ 'is-right': props.graded.correct, 'is-miss': !props.graded.correct }}
		role="status"
	>
		<span class="train-verdict__label">{props.graded.correct ? 'Right' : 'Missed'}</span>
		<span class="train-verdict__text">{props.graded.verdict}</span>
		<button
			type="button"
			class="highlight train-verdict__next"
			onClick={() => props.onNext()}
		>
			<span class="train-verdict__cap">Space</span>
			{props.nextLabel}
		</button>
	</div>
);

/** The chart a preflop question was drawn from, with its hand marked. */
export const PreflopReveal: Component<{ question: PreflopQuestion }> = (props) => (
	<div class="train-reveal">
		<RangeGrid
			strategy={tableStrategy(props.question.table, props.question.depth)}
			marked={className(props.question.cls)}
			rest={props.question.free ? 'checks' : 'folds'}
		/>
		<RangeKey checks={props.question.free} />
	</div>
);
