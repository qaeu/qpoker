/**
 * The spot a question puts the hero in: where it is, the hero's cards, the board
 * and the pot and the bet in big blinds. It shows what is asked and none of
 * what answers it.
 */

import { Show, type Component } from 'solid-js';

import PlayingCards from '#c/common/PlayingCards';
import { cardsText } from '#utils/cards/cards';
import type { Question } from '#utils/train/drills';

import '#styles/train/TrainSpot';

interface TrainSpotProps {
	question: Question;
}

/** Big blinds to a tenth, with no trailing zero. */
const bb = (value: number): string => `${Number(value.toFixed(1))} bb`;

const TrainSpot: Component<TrainSpotProps> = (props) => {
	const facts = (): string[] => {
		const question = props.question;
		if (question.drill === 'potOdds') {
			return [
				`Pot ${bb(question.potBb)}`,
				`${question.villainLabel}: ${bb(question.betBb)}`,
				question.inPosition ? 'In position' : 'Out of position',
			];
		}
		if (question.drill === 'equity') return [`Against ${question.villainLabel}`];
		if (question.drill === 'cbet')
			return [`Pot ${bb(question.potBb)}`, 'You raised first'];
		return [];
	};

	return (
		<section class="train-spot" aria-label="The spot">
			<h2 class="train-spot__label">{props.question.label}</h2>
			<div class="train-spot__cards">
				<div class="train-spot__group">
					<span class="train-spot__name">You</span>
					<PlayingCards cards={cardsText(props.question.hero)} size="large" />
				</div>
				<Show when={props.question.board.length > 0}>
					<div class="train-spot__group">
						<span class="train-spot__name">Board</span>
						<PlayingCards cards={cardsText(props.question.board)} size="large" />
					</div>
				</Show>
			</div>
			<Show when={facts().length > 0}>
				<p class="train-spot__facts">{facts().join(' · ')}</p>
			</Show>
		</section>
	);
};

export default TrainSpot;
