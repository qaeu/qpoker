/**
 * A drill under way: one question at a time, dealt lazily from the seed, answered
 * by key or click and, outside a Test, given its verdict before the next. Hands
 * its records up when the last is answered; the view scores them. In a Test an
 * answer moves on at once and the clock runs out into a miss (a null response).
 */

import {
	createEffect,
	createMemo,
	createSignal,
	on,
	onCleanup,
	onMount,
	Show,
	untrack,
	type Component,
} from 'solid-js';

import TrainChoice from '#c/train/TrainChoice';
import TrainEstimate from '#c/train/TrainEstimate';
import TrainHud, { type StepMark } from '#c/train/TrainHud';
import TrainSpot from '#c/train/TrainSpot';
import { PreflopReveal, TrainVerdict } from '#c/train/TrainVerdict';
import { createAnswerClock } from '#c/train/answerClock';
import { hasModifier, isTyping } from '#c/train/windowKeys';
import {
	choicesOf,
	EQUITY_BANDS,
	hasFeedback,
	QUESTIONS,
	questionAt,
	TEST_LIMIT_MS,
	type DrillId,
	type DrillMode,
} from '#utils/train/drills';
import { gradeAnswer, type Response } from '#utils/train/grade';
import type { TrainRecord } from '#utils/train/run';

import '#styles/train/TrainDrill';

/** How long a Test leaves an answered hand up before dealing the next. */
const TEST_ADVANCE_MS = 220;

interface TrainDrillProps {
	drill: DrillId;
	mode: DrillMode;
	seed: number;
	onFinish: (records: TrainRecord[]) => void;
	/** How many questions have been answered, each time one is. */
	onAnswered: (count: number) => void;
}

const TrainDrill: Component<TrainDrillProps> = (props) => {
	const mode = untrack(() => props.mode);
	const drill = untrack(() => props.drill);
	const total = QUESTIONS[mode];
	const feedback = hasFeedback(mode);
	const [index, setIndex] = createSignal(0);
	const [asking, setAsking] = createSignal(true);
	const [records, setRecords] = createSignal<TrainRecord[]>([]);

	const question = createMemo(() =>
		questionAt(
			drill,
			mode,
			untrack(() => props.seed),
			index()
		)
	);
	const choices = createMemo(() => choicesOf(question()));
	const preflop = createMemo(() => {
		const current = question();
		return current.drill === 'preflop' ? current : null;
	});
	const last = () => records()[records().length - 1];
	const shown = () => (!asking() && feedback ? (last()?.graded ?? null) : null);

	let advanceTimer: ReturnType<typeof setTimeout> | undefined;
	onCleanup(() => clearTimeout(advanceTimer));

	const clock = createAnswerClock(mode === 'test' ? TEST_LIMIT_MS[drill] : null, () =>
		answer(null)
	);

	// Each question starts the clock as it appears.
	createEffect(
		on(index, () => {
			setAsking(true);
			clock.start();
		})
	);

	const next = () => {
		if (index() + 1 >= total) {
			props.onFinish(records());
			return;
		}
		setIndex(index() + 1);
	};

	function answer(response: Response | null) {
		if (!asking()) return;
		const timeMs = clock.stop();
		const graded = gradeAnswer(question(), response, mode);
		setRecords([...records(), { question: question(), graded, timeMs }]);
		props.onAnswered(records().length);
		setAsking(false);
		if (!feedback) advanceTimer = setTimeout(next, TEST_ADVANCE_MS);
	}

	const marks = createMemo<StepMark[]>(() => {
		const done = records().map((record): StepMark => {
			if (!feedback) return 'done';
			return record.graded.correct ? 'right' : 'miss';
		});
		return [...done, ...Array<StepMark>(total - done.length).fill(null)];
	});
	const clockMs = () =>
		records().reduce((sum, record) => sum + record.timeMs, 0) + clock.elapsed();

	const onKey = (event: KeyboardEvent) => {
		if (hasModifier(event)) return;
		if (isTyping(event)) return;
		if (asking()) {
			const digit = Number(event.key);
			if (!Number.isInteger(digit) || digit < 1) return;
			if (drill === 'equity') {
				if (mode !== 'easy' || digit > EQUITY_BANDS.length) return;
				event.preventDefault();
				answer({ kind: 'band', band: digit - 1 });
				return;
			}
			const choice = choices()[digit - 1];
			if (choice === undefined) return;
			event.preventDefault();
			answer({ kind: 'choice', choice });
			return;
		}
		if (event.key === ' ' && feedback) {
			event.preventDefault();
			// Off whatever key was last pressed, so Space's release cannot press it
			// again on the hand this one deals.
			(document.activeElement as HTMLElement | null)?.blur?.();
			next();
		}
	};
	onMount(() => {
		window.addEventListener('keydown', onKey);
		onCleanup(() => window.removeEventListener('keydown', onKey));
	});

	return (
		<div class="train-drill">
			<TrainHud
				drill={drill}
				mode={mode}
				current={index()}
				marks={marks()}
				correct={
					feedback ? records().filter((record) => record.graded.correct).length : null
				}
				clockMs={clockMs()}
				remainingMs={clock.running() ? TEST_LIMIT_MS[drill] - clock.elapsed() : null}
				limitMs={TEST_LIMIT_MS[drill]}
			/>
			<TrainSpot question={question()} />
			<Show
				when={drill === 'equity'}
				fallback={
					<TrainChoice
						choices={choices()}
						asking={asking()}
						graded={shown()}
						onAnswer={(choice) => answer({ kind: 'choice', choice })}
					/>
				}
			>
				<TrainEstimate
					mode={mode}
					question={question()}
					asking={asking()}
					graded={shown()}
					onAnswer={answer}
				/>
			</Show>
			<div class="train-drill__verdict">
				<Show
					when={shown()}
					fallback={
						<Show when={asking()}>
							<p class="train-drill__hint">
								{feedback ? 'Pick the answer' : 'Verdicts are held until the end'}
								<span class="train-drill__keys">
									{' '}
									{drill === 'equity' && mode !== 'easy' ?
										'· type a number, Enter to answer'
									:	`· keys 1 to ${drill === 'equity' ? EQUITY_BANDS.length : choices().length}`
									}
								</span>
							</p>
						</Show>
					}
				>
					{(graded) => (
						<TrainVerdict
							graded={graded()}
							nextLabel={index() + 1 >= total ? 'Results' : 'Next hand'}
							onNext={next}
						/>
					)}
				</Show>
			</div>
			<Show when={shown() ? preflop() : null}>
				{(asked) => <PreflopReveal question={asked()} />}
			</Show>
		</div>
	);
};

export default TrainDrill;
