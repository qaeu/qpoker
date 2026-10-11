/**
 * One graded decision: a mistake and how bad, a good play and what it was
 * worth, or neither; the hand it was in, and why.
 */

import { Match, Show, Switch, type Component } from 'solid-js';

import PlayingCards from '#c/common/PlayingCards';
import { GOOD_PLAYS } from '#utils/coach/goodPlays';
import type { Grading } from '#utils/coach/grade';
import { MISTAKES } from '#utils/coach/mistakes';
import type { HandReport } from '#utils/coach/report';
import { signed } from '#utils/ui/format';

import '#styles/report/MistakeCard';

interface MistakeCardProps {
	grading: Grading;
	/** The hand the decision was made in, when the card is shown outside it. */
	hand?: HandReport;
	onOpenHand?: (handId: string) => void;
}

const MistakeCard: Component<MistakeCardProps> = (props) => (
	<article
		class={`mistake-card is-${props.grading.severity}`}
		classList={{ 'is-good-play': props.grading.goodPlay !== null }}
	>
		<header class="mistake-card__head">
			<span class="mistake-card__severity">
				<Show
					when={props.grading.goodPlay}
					fallback={props.grading.severity === 'ok' ? 'fine' : props.grading.severity}
				>
					{(play) => `${play().rank} play`}
				</Show>
			</span>
			<h3 class="mistake-card__title">
				<Show
					when={props.grading.goodPlay}
					fallback={
						props.grading.mistake ? MISTAKES[props.grading.mistake].title : 'No mistake'
					}
				>
					{(play) => GOOD_PLAYS[play().type].title}
				</Show>
			</h3>
			<Show when={props.grading.mistake}>
				<span class="mistake-card__cost">{signed(props.grading.evLostBb, 2)}bb</span>
			</Show>
			<Show when={props.grading.goodPlay}>
				{(play) => (
					<span class="mistake-card__cost is-positive">
						{signed(play().evGainedBb, 2)}bb
					</span>
				)}
			</Show>
		</header>
		<p class="mistake-card__spot">
			<Show when={props.hand}>
				{(hand) => (
					<>
						<PlayingCards cards={hand().heroCards} /> <span>{hand().position}</span>{' '}
						·{' '}
					</>
				)}
			</Show>
			{props.grading.street} · {props.grading.spot} · {props.grading.confidence}{' '}
			confidence
		</p>
		<p class="mistake-card__verdict">
			<Switch
				fallback={
					<>
						You <strong>{props.grading.chosen}</strong>; the baseline leans to{' '}
						<strong>{props.grading.recommended}</strong>, but not by enough to matter.
					</>
				}
			>
				<Match when={props.grading.goodPlay}>
					{(play) => (
						<>
							You <strong>{props.grading.chosen}</strong>, as the baseline does; to{' '}
							<strong>{play().alternative}</strong> was the mistake.
						</>
					)}
				</Match>
				<Match
					when={
						props.grading.mistake || props.grading.chosen === props.grading.recommended
					}
				>
					You <strong>{props.grading.chosen}</strong>; the baseline is to{' '}
					<strong>{props.grading.recommended}</strong>.
				</Match>
			</Switch>
		</p>
		<p class="mistake-card__text">{props.grading.explanation}</p>
		<Show when={props.hand && props.onOpenHand}>
			<button
				type="button"
				class="mistake-card__open"
				onClick={() => props.onOpenHand?.(props.grading.handId)}
			>
				Open hand #{props.grading.handId}
			</button>
		</Show>
	</article>
);

export default MistakeCard;
