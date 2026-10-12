/**
 * Cards as they are dealt: small tiles of card stock with the rank and a suit
 * pip, red for hearts and diamonds. Takes the text form (`Kd Ks`). At table
 * size a card has a corner index over a centre pip, and can lie face down.
 */

import { For, Show, type Component } from 'solid-js';

import '#styles/common/PlayingCards';

const PIPS: Record<string, string> = { c: '♣', d: '♦', h: '♥', s: '♠' };

interface PlayingCardsProps {
	/** `Kd Ks`, or an empty string for no cards. */
	cards: string;
	size?: 'small' | 'large' | 'table';
	/** This many backs instead of faces. */
	down?: number;
}

const PlayingCards: Component<PlayingCardsProps> = (props) => (
	<Show
		when={!props.down}
		fallback={
			<span
				class="playing-cards playing-cards--down"
				aria-label={`${props.down} ${props.down === 1 ? 'card' : 'cards'}, face down`}
			>
				<For each={Array.from({ length: props.down ?? 0 })}>
					{() => <span class="playing-cards__back" aria-hidden="true" />}
				</For>
			</span>
		}
	>
		<span
			class="playing-cards"
			classList={{
				'playing-cards--large': props.size === 'large',
				'playing-cards--table': props.size === 'table',
			}}
			aria-label={props.cards}
		>
			<For each={props.cards.split(' ').filter(Boolean)}>
				{(card) => (
					<span
						class="playing-cards__card"
						classList={{ 'is-red': card[1] === 'h' || card[1] === 'd' }}
						aria-hidden="true"
					>
						<span class="playing-cards__index">
							{card[0] === 'T' ? '10' : card[0]}
							<span class="playing-cards__pip">{PIPS[card[1]]}</span>
						</span>
						<Show when={props.size === 'table'}>
							<span class="playing-cards__suit">{PIPS[card[1]]}</span>
						</Show>
					</span>
				)}
			</For>
		</span>
	</Show>
);

export default PlayingCards;
