/**
 * The log, hand by hand: a list cut down to the hands worth reading, beside
 * the one being read. Everything that decides what is listed and which hand
 * is open comes in as the query, which the route owns, so the view holds no
 * state of its own and a link or a reload lands back where it was.
 */

import {
	createEffect,
	createMemo,
	For,
	onCleanup,
	onMount,
	Show,
	type Component,
} from 'solid-js';

import { ChevronLeft, X } from 'lucide-solid';

import Segmented, { type SegmentOption } from '#c/common/Segmented';
import Select, { type SelectOption } from '#c/common/Select';
import HandDetail from '#c/hand/HandDetail';
import { MISTAKES } from '#utils/coach/mistakes';
import type { AnalysisReport, HandReport } from '#utils/coach/report';
import type { Position } from '#utils/history/replay';
import { SCENARIO_NAMES, type Scenario } from '#utils/ranges/preflopSpot';
import { signed } from '#utils/ui/format';
import { resolveStep, tableSteps } from '#utils/ui/tableReplay';
import {
	countsOf,
	listHands,
	orderOf,
	positionsOf,
	scenariosOf,
	tallyOf,
	type ReviewFloor,
	type ReviewOrder,
	type ReviewQuery,
	type ReviewShow,
	type ReviewStreet,
} from '#utils/ui/review';

import ReviewRow from './ReviewRow';

import '#styles/review/ReviewView';

interface ReviewViewProps {
	report: AnalysisReport;
	query: ReviewQuery;
	/** `replace` for a step through the list, which is not a place to go back to. */
	onQuery: (change: Partial<ReviewQuery>, options?: { replace?: boolean }) => void;
}

const SHOW_LABELS: Record<ReviewShow, string> = {
	all: 'All',
	played: 'Played',
	mistakes: 'Mistakes',
	plays: 'Good plays',
	ungraded: 'Not graded',
};

const FLOORS: SegmentOption<ReviewFloor>[] = [
	{ id: 'inaccuracy', label: 'Any' },
	{ id: 'mistake', label: 'Mistakes and blunders' },
	{ id: 'blunder', label: 'Blunders' },
];

const STREETS: SegmentOption<ReviewStreet>[] = [
	{ id: 'all', label: 'All' },
	{ id: 'pre', label: 'Preflop' },
	{ id: 'post', label: 'Postflop' },
];

const ORDERS: SegmentOption<ReviewOrder>[] = [
	{ id: 'impact', label: 'Biggest first' },
	{ id: 'time', label: 'As played' },
];

/** `first in` as an option reads: `First in`. */
const sentence = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** Somewhere a J or a K is being typed rather than pressed. */
const TYPING = 'input:not([type="radio"]), textarea, select, [contenteditable]';

/** Ark's segments take the arrow keys for themselves. */
const ARROWED = '[role="radiogroup"]';

const ReviewView: Component<ReviewViewProps> = (props) => {
	const counts = createMemo(() => countsOf(props.report, props.query));
	// `''` is "All": a select's value is a string, and null is not one.
	const positions = createMemo((): SelectOption<Position | ''>[] => [
		{ id: '', label: 'All' },
		...positionsOf(props.report, props.query).map(({ id, hands }) => ({
			id,
			label: `${id} · ${hands}`,
		})),
	]);
	const scenarios = createMemo((): SelectOption<Scenario | ''>[] => [
		{ id: '', label: 'All' },
		...scenariosOf(props.report, props.query).map(({ id, hands }) => ({
			id,
			label: `${sentence(SCENARIO_NAMES[id])} · ${hands}`,
		})),
	]);
	const listed = createMemo(() => listHands(props.report, props.query));
	const tally = createMemo(() => tallyOf(listed(), props.query));
	const numbers = createMemo(
		() => new Map(props.report.hands.map((hand, index) => [hand.id, index + 1]))
	);

	const shows = (): SegmentOption<ReviewShow>[] => {
		const ids: ReviewShow[] = ['all', 'played', 'mistakes', 'plays'];
		// Offered only when there is something behind it, or it is where we are.
		if (counts().ungraded > 0 || props.query.show === 'ungraded') ids.push('ungraded');
		return ids.map((id) => ({ id, label: SHOW_LABELS[id], count: counts()[id] }));
	};

	// The hand the route names, or the first on the list: beside the list there
	// is always a hand to read. On a narrow screen the route decides instead.
	const current = createMemo(
		() =>
			props.report.hands.find((hand) => hand.id === props.query.hand)
			?? listed()[0]
			?? null
	);
	const position = createMemo(() => {
		const hand = current();
		return hand ? listed().indexOf(hand) : -1;
	});
	// A hand that is not on the list has the list's first as its next.
	const prev = createMemo(() => (position() > 0 ? listed()[position() - 1] : undefined));
	const next = createMemo(() => listed()[position() + 1]);
	const open = (hand: HandReport | undefined) => {
		if (hand) props.onQuery({ hand: hand.id, step: null }, { replace: true });
	};

	const steps = createMemo(() => {
		const hand = current();
		return hand ? tableSteps(hand) : [];
	});
	const step = createMemo(() => {
		const hand = current();
		if (!hand) return 0;
		const prefer = props.query.show === 'plays' ? 'play' : undefined;
		return resolveStep(steps(), hand, props.query.step, prefer);
	});
	// Names the hand as well: a step is of a hand, and the one being read may be
	// the list's first rather than one the route has named.
	const goStep = (to: number) => {
		const hand = current();
		if (!hand || to < 0 || to >= steps().length || to === step()) return;
		props.onQuery({ hand: hand.id, step: to }, { replace: true });
	};

	const onKey = (event: KeyboardEvent) => {
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		if (event.target instanceof Element && event.target.closest(TYPING)) return;
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			if (event.target instanceof Element && event.target.closest(ARROWED)) return;
			if (steps().length === 0) return;
			event.preventDefault();
			goStep(step() + (event.key === 'ArrowRight' ? 1 : -1));
			return;
		}
		const key = event.key.toLowerCase();
		const target =
			key === 'j' ? next()
			: key === 'k' ? prev()
			: undefined;
		if (!target) return;
		event.preventDefault();
		open(target);
	};
	onMount(() => {
		window.addEventListener('keydown', onKey);
		onCleanup(() => window.removeEventListener('keydown', onKey));
	});

	// A step with the keys can leave the list's window; the row follows it.
	let list: HTMLOListElement | undefined;
	createEffect(() => {
		if (!current()) return;
		list?.querySelector('[aria-current="true"]')?.scrollIntoView?.({ block: 'nearest' });
	});

	const narrow = (change: Partial<ReviewQuery>) =>
		props.onQuery({ ...change, hand: null, step: null });

	return (
		<section class="review-view" classList={{ 'has-hand': props.query.hand !== null }}>
			<div class="review-view__toolbar">
				<Segmented
					label="Show"
					options={shows()}
					value={props.query.show}
					onChange={(show) => narrow({ show, kind: null, order: null })}
				/>
				<Select
					inline
					label="Position"
					options={positions()}
					value={props.query.position ?? ''}
					onChange={(position) => narrow({ position: position || null })}
				/>
				<Select
					inline
					label="Preflop spot"
					options={scenarios()}
					value={props.query.scenario ?? ''}
					onChange={(scenario) => narrow({ scenario: scenario || null })}
				/>
				<Show when={props.query.show === 'mistakes'}>
					<Segmented
						label="Severity"
						options={FLOORS}
						value={props.query.floor}
						onChange={(floor) => narrow({ floor })}
					/>
					<Segmented
						label="Street"
						options={STREETS}
						value={props.query.street}
						onChange={(street) => narrow({ street })}
					/>
					<Show when={props.query.kind}>
						{(kind) => (
							<button
								type="button"
								class="review-view__chip"
								aria-label={`Stop filtering by: ${MISTAKES[kind()].title}`}
								onClick={() => narrow({ kind: null })}
							>
								{MISTAKES[kind()].title}
								<X aria-hidden="true" />
							</button>
						)}
					</Show>
				</Show>
				<Segmented
					label="Order"
					options={ORDERS}
					value={orderOf(props.query)}
					onChange={(order) => narrow({ order })}
				/>
				<p class="review-view__tally" role="status">
					{tally().hands} {tally().hands === 1 ? 'hand' : 'hands'}
					<Show when={tally().evBb !== null}>
						{' '}
						· {signed(tally().evBb ?? 0)}bb estimated
					</Show>
				</p>
			</div>

			<div class="review-view__panes">
				<div class="review-view__list-panel">
					<Show
						when={listed().length > 0}
						fallback={
							<p class="review-view__empty">
								<Show
									when={props.query.show === 'plays' && counts().plays === 0}
									fallback="Nothing to show at this filter."
								>
									No good plays were picked out of this log. That is not a verdict on the
									session: most right decisions are easy ones, and only the hard ones are
									listed.
								</Show>
							</p>
						}
					>
						<ol class="review-view__list" aria-label="Hands" ref={list}>
							<For each={listed()}>
								{(hand) => (
									<li>
										<ReviewRow
											hand={hand}
											number={numbers().get(hand.id) ?? 0}
											current={hand === current()}
											onSelect={(id) => props.onQuery({ hand: id, step: null })}
										/>
									</li>
								)}
							</For>
						</ol>
					</Show>
				</div>

				<div class="review-view__detail">
					<Show when={current()} keyed>
						{(hand) => (
							<>
								<nav class="review-view__back" aria-label="The list this hand is from">
									<button
										type="button"
										class="review-view__back-link"
										onClick={() => props.onQuery({ hand: null, step: null })}
									>
										<ChevronLeft aria-hidden="true" />
										{SHOW_LABELS[props.query.show]}
										<Show when={position() >= 0}>
											{' '}
											· {position() + 1} of {listed().length}
										</Show>
									</button>
									<button
										type="button"
										aria-label="Previous hand"
										disabled={!prev()}
										onClick={() => open(prev())}
									>
										Prev
									</button>
									<button
										type="button"
										aria-label="Next hand"
										disabled={!next()}
										onClick={() => open(next())}
									>
										Next
									</button>
								</nav>
								<HandDetail
									hand={hand}
									number={numbers().get(hand.id) ?? 0}
									total={props.report.hands.length}
									step={step()}
									stakes={props.report.stakes}
									onStep={goStep}
									onPrev={prev() ? () => open(prev()) : undefined}
									onNext={next() ? () => open(next()) : undefined}
								/>
								<p class="review-view__note">
									Costs and gains are estimates against a baseline model, not solver
									output. Preflop findings rest on range charts; postflop ones on an
									opponent-range model, and each is marked with how far it can be trusted.
								</p>
							</>
						)}
					</Show>
				</div>
			</div>
		</section>
	);
};

export default ReviewView;
