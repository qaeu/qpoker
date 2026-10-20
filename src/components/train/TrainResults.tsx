/**
 * The end of a drill: the score, where it landed on its board, the board itself,
 * and every miss laid out again beside what was right.
 */

import { For, onCleanup, onMount, Show, type Component } from 'solid-js';

import PlayingCards from '#c/common/PlayingCards';
import StatBand, { type StatFigure } from '#c/common/StatBand';
import { escapeIsTaken, hasModifier, isTyping } from '#c/train/windowKeys';
import { cardsText } from '#utils/cards/cards';
import {
	DRILL_NAMES,
	formatClock,
	MODE_NAMES,
	responseText,
	type DrillRun,
} from '#utils/train/run';
import type { ScoreEntry } from '#utils/train/scores';

import '#styles/train/TrainResults';

interface TrainResultsProps {
	run: DrillRun;
	/** The run as its board took it. */
	entry: ScoreEntry;
	/** Its place on the board (1 first), or null when it did not make the top five. */
	rank: number | null;
	/** The board as it now stands. */
	board: readonly ScoreEntry[];
	newBest: boolean;
	/** The board's best before this run, if it had one. */
	previousBest: ScoreEntry | null;
	onRetry: () => void;
	onBack: () => void;
}

/** A board entry's date, short: `Sep 9`. */
function shortDate(iso: string): string {
	return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const sameRun = (a: ScoreEntry, b: ScoreEntry): boolean =>
	a.seed === b.seed
	&& a.date === b.date
	&& a.timeMs === b.timeMs
	&& a.correct === b.correct;

const TrainResults: Component<TrainResultsProps> = (props) => {
	const misses = () => props.run.records.filter((record) => !record.graded.correct);
	const accuracy = () =>
		Math.round((props.entry.correct / Math.max(1, props.entry.total)) * 100);

	const figures = (): StatFigure[] => {
		const best = props.previousBest;
		return [
			{
				label: 'Score',
				value: `${props.entry.correct}`,
				unit: `/ ${props.entry.total}`,
				note: 'hands right',
			},
			{ label: 'Accuracy', value: `${accuracy()}`, unit: '%' },
			{ label: 'Time', value: formatClock(props.entry.timeMs), note: 'answering only' },
			{
				label: 'Board',
				value: props.rank === null ? '—' : `#${props.rank}`,
				note:
					best ?
						`best was ${best.correct}/${best.total} · ${formatClock(best.timeMs)}`
					:	'first run on this board',
			},
		];
	};

	const onKey = (event: KeyboardEvent) => {
		if (hasModifier(event)) return;
		if (event.key === 'Escape') {
			if (escapeIsTaken(event)) return;
			event.preventDefault();
			props.onBack();
			return;
		}
		if (isTyping(event)) return;
		if (event.key === 'r' || event.key === 'R') {
			event.preventDefault();
			props.onRetry();
		}
	};
	onMount(() => {
		window.addEventListener('keydown', onKey);
		onCleanup(() => window.removeEventListener('keydown', onKey));
	});

	return (
		<section class="train-results">
			<div class="train-results__head">
				<div>
					<p class="train-results__eyebrow">
						{DRILL_NAMES[props.run.drill]} · {MODE_NAMES[props.run.mode]}
					</p>
					<h2 class="train-results__title">Drill complete</h2>
				</div>
				<Show when={props.newBest}>
					<span class="train-results__best">New best</span>
				</Show>
			</div>

			<StatBand figures={figures()} />

			<div class="train-results__cols">
				<div class="train-results__panel">
					<h3 class="train-results__panel-title">Highscores</h3>
					<p class="train-results__sub">
						{DRILL_NAMES[props.run.drill]} · {MODE_NAMES[props.run.mode]} · ties go to the
						faster run
					</p>
					<table class="train-results__board">
						<tbody>
							<For each={props.board}>
								{(entry, index) => (
									<tr classList={{ 'is-you': sameRun(entry, props.entry) }}>
										<td>{index() + 1}</td>
										<td>
											{entry.correct}/{entry.total}
										</td>
										<td>{formatClock(entry.timeMs)}</td>
										<td class="train-results__dim">
											{sameRun(entry, props.entry) ? 'This run' : shortDate(entry.date)}
										</td>
									</tr>
								)}
							</For>
						</tbody>
					</table>
					<Show when={props.rank === null}>
						<p class="train-results__sub">This run didn&rsquo;t make the top five.</p>
					</Show>
				</div>

				<div class="train-results__panel">
					<h3 class="train-results__panel-title">Review</h3>
					<p class="train-results__sub">{misses().length} missed</p>
					<Show
						when={misses().length > 0}
						fallback={<p class="train-results__empty">Nothing missed. Clean run.</p>}
					>
						<ul class="train-results__misses">
							<For each={misses()}>
								{(record) => (
									<li class="train-results__miss">
										<span class="train-results__lead">
											<PlayingCards cards={cardsText(record.question.hero)} />
											<Show when={record.question.board.length > 0}>
												<PlayingCards cards={cardsText(record.question.board)} />
											</Show>
										</span>
										<span class="train-results__calls">
											<span class="train-results__spot">{record.question.label}</span>
											<span>
												You · <s>{responseText(record.graded.response)}</s>
											</span>
											<span>
												Right · <b>{record.graded.answer}</b>
											</span>
											<small class="train-results__why">{record.graded.verdict}</small>
										</span>
									</li>
								)}
							</For>
						</ul>
					</Show>
				</div>
			</div>

			<div class="train-results__actions">
				<button type="button" class="highlight" onClick={() => props.onRetry()}>
					<span class="train-results__key">R</span>Retry
				</button>
				<button type="button" onClick={() => props.onBack()}>
					<span class="train-results__key">Esc</span>Back to drills
				</button>
			</div>
		</section>
	);
};

export default TrainResults;
