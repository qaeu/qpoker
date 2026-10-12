/**
 * One hand in the Review list: when, where, the cards and the result, and
 * under them a line for each mistake and good play in it.
 */

import { For, Show, type Component } from 'solid-js';

import PlayingCards from '#c/common/PlayingCards';
import { GOOD_PLAYS } from '#utils/coach/goodPlays';
import { MISTAKES } from '#utils/coach/mistakes';
import type { HandSummary } from '#utils/coach/report';
import { signClass, signed } from '#utils/ui/format';
import { findingsOf, type Finding } from '#utils/ui/review';

import '#styles/review/ReviewRow';

interface ReviewRowProps {
	hand: HandSummary;
	/** Where the hand comes in the log, counted from one. */
	number: number;
	current: boolean;
	onSelect: (handId: string) => void;
}

const titleOf = ({ mistake, play }: Finding): string =>
	mistake ? MISTAKES[mistake].title
	: play ? GOOD_PLAYS[play].title
	: '';

/** `blunder`, or `great play`: the sheet sets it in capitals. */
const rankOf = ({ rank, severity }: Finding): string =>
	rank ? `${rank} play` : severity;

const ReviewRow: Component<ReviewRowProps> = (props) => {
	const findings = () => findingsOf(props.hand);
	const label = () =>
		[
			`Hand ${props.number}`,
			props.hand.heroCards || 'not dealt in',
			...findings().map(titleOf),
		].join(', ');

	return (
		<button
			type="button"
			class="review-row"
			classList={{ active: props.current }}
			aria-current={props.current ? 'true' : undefined}
			aria-label={label()}
			onClick={() => props.onSelect(props.hand.id)}
		>
			<span class="review-row__time">{props.hand.timestamp.slice(11, 16)}</span>
			<span class="review-row__seat">{props.hand.position ?? '—'}</span>
			<PlayingCards cards={props.hand.heroCards} />
			<span class={`review-row__net ${signClass(props.hand.netBb) ?? ''}`}>
				{signed(props.hand.netBb)}
			</span>
			<For each={findings()}>
				{(finding) => (
					<span
						class={`review-row__finding is-${finding.severity}`}
						classList={{ 'is-good-play': finding.kind === 'play' }}
					>
						<span class="review-row__rank">{rankOf(finding)}</span>
						<span class="review-row__title">{titleOf(finding)}</span>
						<span class={`review-row__cost ${signClass(finding.evBb) ?? ''}`}>
							{signed(finding.evBb)}
						</span>
					</span>
				)}
			</For>
			<Show when={!props.hand.gradeable}>
				<span class="review-row__finding">
					<span class="review-row__rank">not graded</span>
				</span>
			</Show>
		</button>
	);
};

export default ReviewRow;
