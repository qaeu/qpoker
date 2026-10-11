/**
 * How far a finding can be trusted, as three pips and the word: the pips for
 * scanning a page of findings, the word because pips alone are a code.
 */

import { For, type Component } from 'solid-js';

import type { Confidence as ConfidenceLevel } from '#utils/ranges/preflopSpot';

import '#styles/common/Confidence';

interface ConfidenceProps {
	level: ConfidenceLevel;
}

const LEVELS: readonly ConfidenceLevel[] = ['low', 'medium', 'high'];

const LABELS: Record<ConfidenceLevel, string> = {
	low: 'Low confidence',
	medium: 'Medium confidence',
	high: 'High confidence',
};

const Confidence: Component<ConfidenceProps> = (props) => (
	<span class="confidence">
		<span class="confidence__pips" aria-hidden="true">
			<For each={LEVELS}>
				{(_, index) => (
					<span
						class="confidence__pip"
						classList={{ 'is-lit': index() <= LEVELS.indexOf(props.level) }}
					/>
				)}
			</For>
		</span>
		{LABELS[props.level]}
	</span>
);

export default Confidence;
