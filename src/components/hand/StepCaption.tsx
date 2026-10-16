/**
 * What the step on the table was, in words: where in the hand it is, the
 * action in big blinds, what the actor faced, the hero's equity there, and the
 * grade when the action was one of the hero's decisions. The grade lives here and not in the list of
 * lines: see docs/design-language.md, "The replay table".
 */

import {
	createEffect,
	createMemo,
	createSignal,
	on,
	Show,
	type Component,
} from 'solid-js';

import { Calculator } from 'lucide-solid';

import MistakeCard from '#c/report/MistakeCard';
import RangeGrid from '#c/ranges/RangeGrid';
import { RangeKey } from '#c/ranges/RangesView';
import type { HandReport } from '#utils/coach/report';
import { solveEligibility } from '#utils/solver/spot';
import type { SolveStreet } from '#utils/solver/tree';
import {
	baselineTable,
	TABLE_LABELS,
	tableOf,
	tableStrategy,
} from '#utils/ui/rangeTables';
import {
	equityAt,
	equityText,
	stepFacts,
	stepStreet,
	stepText,
	type TableStep,
} from '#utils/ui/tableReplay';

import SolvePanel from './SolvePanel';
import { useSolver } from './solverContext';

import '#styles/hand/StepCaption';

interface StepCaptionProps {
	hand: HandReport;
	/** `tableSteps(hand)`. */
	steps: TableStep[];
	/** Index into `steps`. */
	step: number;
}

const StepCaption: Component<StepCaptionProps> = (props) => {
	const current = () => props.steps[props.step];
	const grading = createMemo(() =>
		props.hand.gradings.find(({ stepIndex }) => stepIndex === current().lineIndex)
	);
	const finding = () => {
		const graded = grading();
		return graded && (graded.mistake || graded.goodPlay) ? graded : undefined;
	};
	const baseline = () => (grading() && !finding() ? grading() : undefined);
	const table = () => {
		const facts = finding()?.preflop;
		const { actor } = current();
		return facts && actor !== null ?
				baselineTable(facts, props.hand.seats[actor].position)
			:	null;
	};
	const solver = useSolver();
	// The decision whose solve is open, by hand and step: stepping away closes it.
	const [solving, setSolving] = createSignal<string | null>(null);
	const solveKey = () => `${props.hand.id}:${current().lineIndex}`;
	createEffect(on(solveKey, () => setSolving(null), { defer: true }));
	/** Set only on a hero's postflop action: the one place a solve is offered. */
	const solvable = createMemo(() => {
		const { actor, lineIndex, street } = current();
		if (!solver || actor === null || lineIndex === null || street === 'preflop') {
			return null;
		}
		if (!props.hand.seats[actor].hero) return null;
		return {
			street: street as SolveStreet,
			stepIndex: lineIndex,
			eligibility: solveEligibility(
				{
					gradeable: props.hand.gradeable,
					reconciled: props.hand.reconciled,
					players: props.hand.seats.map((seat) => seat.name),
					hero: props.hand.seats.find((seat) => seat.hero)?.name ?? null,
					lines: props.hand.lines,
				},
				lineIndex,
				solver.threads()
			),
		};
	});
	const byHero = () => {
		const { actor } = current();
		return actor !== null && props.hand.seats[actor].hero;
	};

	return (
		<div class="step-caption" aria-live="polite">
			<div class="step-caption__head">
				<div class="step-caption__top">
					<p class="step-caption__where">
						{stepStreet(props.hand, current())} · step {props.step + 1} of{' '}
						{props.steps.length}
					</p>
					<Show when={solvable()}>
						{(spot) => (
							<button
								type="button"
								class="step-caption__solve"
								disabled={!spot().eligibility.ok}
								aria-expanded={solving() === solveKey()}
								onClick={() => setSolving(solving() === solveKey() ? null : solveKey())}
							>
								<Calculator aria-hidden="true" />
								Solve
							</button>
						)}
					</Show>
					<Show when={baseline()}>
						{(graded) => (
							<span class="step-caption__baseline">
								{graded().chosen === graded().recommended ?
									'on baseline'
								:	'near baseline'}
							</span>
						)}
					</Show>
				</div>
				<p class="step-caption__text" classList={{ 'is-hero': byHero() }}>
					{stepText(props.hand, current())}
				</p>
				<p class="step-caption__facts">{stepFacts(props.hand, current())}</p>
				<Show when={solvable()}>
					{(spot) => {
						const { eligibility } = spot();
						return (
							<Show when={!eligibility.ok ? eligibility : undefined}>
								{(refusal) => <p class="step-caption__note">{refusal().message}</p>}
							</Show>
						);
					}}
				</Show>
				<Show when={equityAt(props.hand, current())}>
					{(figure) => <p class="step-caption__equity">{equityText(figure())}</p>}
				</Show>
				<Show when={baseline()}>
					{(graded) => (
						<Show when={graded().chosen !== graded().recommended}>
							<p class="step-caption__note">
								The baseline leans to {graded().recommended}, but not by enough to matter.
							</p>
						</Show>
					)}
				</Show>
			</div>
			<Show when={solving() === solveKey() && solvable()}>
				{(spot) => (
					<SolvePanel
						hand={props.hand}
						stepIndex={spot().stepIndex}
						street={spot().street}
					/>
				)}
			</Show>
			<Show when={finding()}>
				{(graded) => (
					<>
						<MistakeCard grading={graded()} />
						<Show when={table()}>
							{(id) => (
								<details class="step-caption__chart">
									<summary>Baseline range: {TABLE_LABELS[id()]}</summary>
									<RangeGrid
										strategy={tableStrategy(id(), graded().preflop!.depth)}
										marked={graded().preflop!.hand}
										rest={tableOf(id()).free ? 'checks' : 'folds'}
									/>
									<RangeKey checks={tableOf(id()).free} />
								</details>
							)}
						</Show>
					</>
				)}
			</Show>
		</div>
	);
};

export default StepCaption;
