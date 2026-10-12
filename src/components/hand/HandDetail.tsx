/**
 * One hand replayed: the table at the step being read, with the strip that
 * walks it and a caption that says what happened and how it was graded, beside
 * the action street by street. A line of the action jumps the table to it and
 * carries a tag for a graded decision; the grade itself is the caption's.
 */

import { createMemo, For, Show, type Component, type ParentComponent } from 'solid-js';

import PlayingCards from '#c/common/PlayingCards';
import type { Grading } from '#utils/coach/grade';
import type { ActionLine, HandReport } from '#utils/coach/report';
import { STREETS, type Street } from '#utils/history/hand';
import { bbText, shortTime, signClass, signed } from '#utils/ui/format';
import { resolveStep, stepOfLine, tableSteps } from '#utils/ui/tableReplay';

import HandTable from './HandTable';
import StepCaption from './StepCaption';
import StepScrubber from './StepScrubber';

import '#styles/hand/HandDetail';

interface HandDetailProps {
	hand: HandReport;
	/** Where the hand comes in the log, counted from one, and out of how many. */
	number: number;
	total: number;
	/** Steps through whatever list the hand is being read from; absent at its ends. */
	onPrev?: () => void;
	onNext?: () => void;
	/** Where the replay stands; null or absent for where the hand opens by itself. */
	step?: number | null;
	onStep?: (step: number) => void;
	/** The blinds, for the table's print. */
	stakes?: string;
}

interface JumpProps {
	class: string;
	/** The step to jump to; null where there is no table to jump. */
	to: number | null;
	current: boolean;
	hero?: boolean;
}

/** The board cards a street turned over. */
function dealt(board: string, street: Street): string {
	const cards = board.split(' ').filter(Boolean);
	return (
		street === 'flop' ? cards.slice(0, 3)
		: street === 'turn' ? cards.slice(3, 4)
		: street === 'river' ? cards.slice(4, 5)
		: []).join(' ');
}

const HandDetail: Component<HandDetailProps> = (props) => {
	const gradings = createMemo(
		() => new Map(props.hand.gradings.map((grading) => [grading.stepIndex, grading]))
	);
	const steps = createMemo(() => tableSteps(props.hand));
	const step = createMemo(() => resolveStep(steps(), props.hand, props.step ?? null));
	// A street is listed when it was dealt, played or not: an all-in's runout
	// has cards to show and no lines.
	const streets = createMemo(() =>
		STREETS.map((street) => {
			const deal = steps().findIndex(
				(candidate) => candidate.kind === 'deal' && candidate.street === street
			);
			return {
				street,
				deal: deal < 0 ? null : deal,
				cards: dealt(props.hand.board, street),
				lines: props.hand.lines.filter((line) => line.street === street),
			};
		}).filter((group) => group.lines.length > 0 || group.deal !== null)
	);

	/** A place in the action: a button onto the table's step, where there is a table. */
	const Jump: ParentComponent<JumpProps> = (jump) => (
		<Show
			when={jump.to !== null}
			fallback={
				<div class={jump.class} classList={{ 'is-hero': jump.hero }}>
					{jump.children}
				</div>
			}
		>
			<button
				type="button"
				class={jump.class}
				classList={{ 'is-hero': jump.hero, 'is-ahead': (jump.to ?? 0) > step() }}
				aria-current={jump.current ? 'step' : undefined}
				onClick={() => props.onStep?.(jump.to ?? 0)}
			>
				{jump.children}
			</button>
		</Show>
	);

	const Tag: Component<{ grading: Grading }> = (tag) => (
		<Show
			when={tag.grading.mistake || tag.grading.goodPlay}
			fallback={
				<span
					class="hand-detail__tag"
					title={
						tag.grading.chosen === tag.grading.recommended ?
							undefined
						:	`The baseline leans to ${tag.grading.recommended}, but not by enough to matter.`
					}
				>
					{tag.grading.chosen === tag.grading.recommended ?
						'on baseline'
					:	'near baseline'}
				</span>
			}
		>
			<Show
				when={tag.grading.goodPlay}
				fallback={
					<span class={`hand-detail__tag is-${tag.grading.severity}`}>
						{tag.grading.severity} {signed(tag.grading.evLostBb)}bb
					</span>
				}
			>
				{(play) => (
					<span class="hand-detail__tag is-good-play">
						{play().rank} play {signed(play().evGainedBb)}bb
					</span>
				)}
			</Show>
		</Show>
	);

	const Line: Component<{ line: ActionLine }> = (lineProps) => {
		const to = () =>
			steps().length > 0 ? stepOfLine(steps(), lineProps.line.stepIndex) : null;
		return (
			<li>
				<Jump
					class="hand-detail__line"
					to={to()}
					// A blind is part of the deal, which its street's heading stands for.
					current={
						to() === step() && steps()[step()].lineIndex === lineProps.line.stepIndex
					}
					hero={lineProps.line.hero}
				>
					<span class="hand-detail__action">{lineProps.line.text}</span>
					<Show when={gradings().get(lineProps.line.stepIndex)}>
						{(graded) => <Tag grading={graded()} />}
					</Show>
				</Jump>
			</li>
		);
	};

	return (
		<article class="hand-detail">
			<header class="hand-detail__head">
				<PlayingCards cards={props.hand.heroCards} size="large" />
				<div class="hand-detail__facts">
					<h2 class="hand-detail__title">
						Hand {props.number} <span class="hand-detail__of">of {props.total}</span>
					</h2>
					<p class="hand-detail__meta">
						{shortTime(props.hand.timestamp)} · {props.hand.table} · {props.hand.players}
						-handed · {props.hand.position ?? 'not dealt in'} · #{props.hand.id}
					</p>
				</div>
				<span class={`hand-detail__result ${signClass(props.hand.netBb) ?? ''}`}>
					{signed(props.hand.netBb)}
					<span class="hand-detail__unit">bb</span>
				</span>
				<div class="hand-detail__nav">
					<button
						type="button"
						aria-label="Previous hand in the list"
						disabled={!props.onPrev}
						onClick={() => props.onPrev?.()}
					>
						Prev
						<kbd class="hand-detail__key" aria-hidden="true">
							K
						</kbd>
					</button>
					<button
						type="button"
						aria-label="Next hand in the list"
						disabled={!props.onNext}
						onClick={() => props.onNext?.()}
					>
						Next
						<kbd class="hand-detail__key" aria-hidden="true">
							J
						</kbd>
					</button>
				</div>
			</header>

			<Show when={!props.hand.gradeable}>
				<p class="hand-detail__ungraded">This hand could not be graded.</p>
			</Show>

			<div class="hand-detail__body">
				<Show when={steps().length > 0}>
					<div class="hand-detail__stage">
						<HandTable hand={props.hand} step={steps()[step()]} stakes={props.stakes} />
						<StepScrubber
							hand={props.hand}
							steps={steps()}
							step={step()}
							onStep={(to) => props.onStep?.(to)}
						/>
						<StepCaption hand={props.hand} steps={steps()} step={step()} />
					</div>
				</Show>

				<nav class="hand-detail__log" aria-label="Play by play">
					<For each={streets()}>
						{(group) => (
							<section class="hand-detail__street">
								<h3 class="hand-detail__street-name">
									<Jump
										class="hand-detail__street-head"
										to={group.deal}
										current={group.deal === step()}
									>
										{group.street}
										<Show when={group.cards}>
											<PlayingCards cards={group.cards} />
										</Show>
										<Show when={group.deal !== null && steps()[group.deal ?? 0]}>
											{(deal) => (
												<span class="hand-detail__street-pot">
													pot {bbText(deal().pot, props.hand.bigBlind)} bb
												</span>
											)}
										</Show>
									</Jump>
								</h3>
								<ol class="hand-detail__lines">
									<For each={group.lines}>{(line) => <Line line={line} />}</For>
								</ol>
							</section>
						)}
					</For>

					<Show when={Object.keys(props.hand.shown).length > 0}>
						<section class="hand-detail__street">
							<h3 class="hand-detail__street-name">
								<Jump
									class="hand-detail__street-head"
									to={steps().length > 0 ? steps().length - 1 : null}
									current={steps().length > 0 && step() === steps().length - 1}
								>
									Showdown
								</Jump>
							</h3>
							<ul class="hand-detail__lines">
								<For each={Object.entries(props.hand.shown)}>
									{([name, cards]) => (
										<li class="hand-detail__line">
											<span class="hand-detail__action">
												{name} shows <PlayingCards cards={cards} />
											</span>
										</li>
									)}
								</For>
							</ul>
						</section>
					</Show>
				</nav>
			</div>
		</article>
	);
};

export default HandDetail;
