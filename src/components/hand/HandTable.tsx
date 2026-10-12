/**
 * The table at one step of a hand, seen from above: the seats by position with
 * their stacks, cards and bets, the board, the pot and the dealer button. It
 * draws the step it is handed and holds nothing itself. The hero sits at the
 * bottom. See docs/design-language.md, "The replay table".
 */

import { createMemo, For, Show, type Component } from 'solid-js';

import PlayingCards from '#c/common/PlayingCards';
import type { HandReport } from '#utils/coach/report';
import { bbText } from '#utils/ui/format';
import {
	seatSlots,
	SIX_MAX,
	type TableSeat,
	type TableStep,
} from '#utils/ui/tableReplay';

import '#styles/hand/HandTable';

interface HandTableProps {
	hand: HandReport;
	/** One of `tableSteps(hand)`. */
	step: TableStep;
	/** The blinds, as the log names them: printed on the felt. */
	stakes?: string;
}

/** What a tag and a chip are coloured by. */
type Mark = 'blind' | 'fold' | 'check' | 'call' | 'raise' | 'wins';

interface Tag {
	text: string;
	mark: Mark;
}

const BOARD_SLOTS = [0, 1, 2, 3, 4];

/** How a bet in front of a seat got there. */
function markOf(seat: TableSeat): Mark {
	switch (seat.last) {
		case 'call':
		case 'check':
		case 'fold':
		case 'wins':
			return seat.last;
		case 'bet':
		case 'raise':
			return 'raise';
		default:
			return 'blind';
	}
}

/** The one thing to say about a seat: paid, out, all-in, or what it last did. */
function tagOf(seat: TableSeat): Tag | null {
	if (seat.last === 'wins') return { text: 'Wins', mark: 'wins' };
	if (seat.folded) return { text: 'Fold', mark: 'fold' };
	if (seat.allIn) return { text: 'All-in', mark: 'raise' };
	switch (seat.last) {
		case null:
			return null;
		case 'check':
			return { text: 'Check', mark: 'check' };
		case 'call':
			return { text: 'Call', mark: 'call' };
		case 'bet':
			return { text: 'Bet', mark: 'raise' };
		case 'raise':
			return { text: 'Raise', mark: 'raise' };
		default:
			return { text: 'Blind', mark: 'blind' };
	}
}

const HandTable: Component<HandTableProps> = (props) => {
	const slots = createMemo(() => seatSlots(props.hand));
	const board = createMemo(() => props.hand.board.split(' ').filter(Boolean));
	const bb = (cents: number) => bbText(cents, props.hand.bigBlind);
	const button = () => {
		const index = props.hand.seats.findIndex((seat) => seat.position === 'BTN');
		return index < 0 ? null : slots()[index];
	};
	const shown = () => board().slice(0, props.step.boardCount);

	return (
		<section
			class="hand-table"
			classList={{ 'hand-table--full': props.hand.seats.length > SIX_MAX }}
			aria-label="The table at this point in the hand"
		>
			<div class="hand-table__stage">
				<div class="hand-table__rail" aria-hidden="true">
					<div class="hand-table__felt" />
				</div>

				<Show when={props.stakes}>
					<p class="hand-table__print">Blinds {props.stakes}</p>
				</Show>

				<p class="hand-table__pot">
					<span class="hand-table__pot-label">Pot</span>
					<span class="hand-table__pot-figure">{bb(props.step.pot)}</span>
					<span class="hand-table__unit">bb</span>
				</p>

				<div
					class="hand-table__board"
					role="group"
					aria-label={
						shown().length > 0 ? `Board: ${shown().join(' ')}` : 'Board: no cards yet'
					}
				>
					<For each={BOARD_SLOTS}>
						{(slot) => (
							<Show
								when={slot < props.step.boardCount && board()[slot]}
								fallback={<span class="hand-table__slot" aria-hidden="true" />}
							>
								{(card) => (
									<span
										class="hand-table__card"
										classList={{
											'is-dealt':
												slot >= props.step.dealt[0] && slot < props.step.dealt[1],
										}}
									>
										<PlayingCards cards={card()} size="table" />
									</span>
								)}
							</Show>
						)}
					</For>
				</div>

				<Show when={button() !== null}>
					<span
						class={`hand-table__dealer hand-table__dealer--slot-${button()}`}
						role="img"
						aria-label="Dealer button"
					>
						D
					</span>
				</Show>

				<For each={props.hand.seats}>
					{(seat, index) => {
						const state = () => props.step.seats[index()];
						const tag = () => tagOf(state());
						return (
							<>
								<div
									class={`hand-table__seat hand-table__seat--slot-${slots()[index()]}`}
									classList={{
										'is-hero': seat.hero,
										'is-folded': state().folded,
										'is-acting': props.step.actor === index(),
										'is-winner': state().last === 'wins',
									}}
									role="group"
									aria-label={`${seat.position} ${seat.name}`}
								>
									<div class="hand-table__hole">
										<Show when={!state().folded}>
											<Show
												when={state().cards}
												fallback={<PlayingCards cards="" down={2} />}
											>
												{(cards) => <PlayingCards cards={cards()} size="table" />}
											</Show>
										</Show>
									</div>
									<div class="hand-table__plate">
										<div class="hand-table__who">
											<span class="hand-table__position">{seat.position}</span>
											<span class="hand-table__name">{seat.name}</span>
										</div>
										<div class="hand-table__chips">
											<span class="hand-table__stack">
												{bb(state().stack)}
												<span class="hand-table__unit">bb</span>
											</span>
											<Show when={tag()}>
												{(shownTag) => (
													<span class={`hand-table__tag is-${shownTag().mark}`}>
														{shownTag().text}
													</span>
												)}
											</Show>
										</div>
									</div>
								</div>
								<Show when={state().bet > 0}>
									<p
										class={`hand-table__bet hand-table__bet--slot-${slots()[index()]} is-${markOf(state())}`}
									>
										<span class="hand-table__chip" aria-hidden="true" />
										{bb(state().bet)}
									</p>
								</Show>
							</>
						);
					}}
				</For>
			</div>
		</section>
	);
};

export default HandTable;
