/**
 * Cards as they are dealt: small tiles of card stock with the rank and a suit
 * pip, red for hearts and diamonds. Takes the text form (`Kd Ks`).
 */

import { For, type Component } from 'solid-js';

import '#styles/common/PlayingCards';

const PIPS: Record<string, string> = { c: '♣', d: '♦', h: '♥', s: '♠' };

interface PlayingCardsProps {
	/** `Kd Ks`, or an empty string for no cards. */
	cards: string;
	size?: 'small' | 'large';
}

const PlayingCards: Component<PlayingCardsProps> = (props) => (
	<span
		class="playing-cards"
		classList={{ 'playing-cards--large': props.size === 'large' }}
		aria-label={props.cards}
	>
		<For each={props.cards.split(' ').filter(Boolean)}>
			{(card) => (
				<span
					class="playing-cards__card"
					classList={{ 'is-red': card[1] === 'h' || card[1] === 'd' }}
					aria-hidden="true"
				>
					{card[0] === 'T' ? '10' : card[0]}
					<span class="playing-cards__pip">{PIPS[card[1]]}</span>
				</span>
			)}
		</For>
	</span>
);

export default PlayingCards;
