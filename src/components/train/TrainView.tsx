/**
 * The Train view: short graded drills on the baseline's model, scored onto a top
 * five per board. It holds the screen (picker, drill, results), the modes chosen
 * and the boards; `TrainDrill` plays a drill and the other screens are handed
 * what to show. Works with an empty library and never enters a grade. See
 * docs/train-model.md.
 */

import {
	createSignal,
	Match,
	onCleanup,
	onMount,
	Show,
	Switch,
	untrack,
	type Component,
} from 'solid-js';

import TrainDrill from '#c/train/TrainDrill';
import TrainPicker from '#c/train/TrainPicker';
import TrainResults from '#c/train/TrainResults';
import { escapeIsTaken, hasModifier } from '#c/train/windowKeys';
import {
	loadTrainConfig,
	loadTrainScores,
	saveTrainConfig,
	saveTrainScores,
	type TrainConfig,
} from '#utils/app/storage';
import type { DrillId, DrillMode } from '#utils/train/drills';
import { scoreEntry, type DrillRun, type TrainRecord } from '#utils/train/run';
import {
	bestOn,
	boardKey,
	recordScore,
	type ScoreBoards,
	type ScoreEntry,
} from '#utils/train/scores';

import '#styles/train/TrainView';

interface TrainViewProps {
	/**
	 * Hands the app the check a tab switch goes through, or null on unmount. The
	 * check is given the tab's name and says whether to switch now.
	 */
	onLeaveGuard?: (guard: ((to: string) => boolean) | null) => void;
	/** Fixed by tests; a drill otherwise deals from a seed nobody has seen. */
	seed?: number;
}

type Screen =
	| { kind: 'picker' }
	| { kind: 'drill'; drill: DrillId; mode: DrillMode; seed: number }
	| {
			kind: 'results';
			run: DrillRun;
			entry: ScoreEntry;
			rank: number | null;
			board: readonly ScoreEntry[];
			newBest: boolean;
			previousBest: ScoreEntry | null;
	  };

/** A leave asked for once and waiting on its second ask: where to, and at what cost. */
interface Leaving {
	/** 'quit', or the name of the tab asked for. */
	to: string;
	answers: number;
}

/** How long an armed leave waits for its second ask before standing down. */
const LEAVE_ARM_MS = 4000;

/** A fresh 32-bit seed. */
function newSeed(): number {
	return Math.floor(Math.random() * 2 ** 32);
}

/** What the way out reads, armed or not. */
function quitLabel(leaving: Leaving | null): string {
	if (leaving === null) return 'Quit drill';
	const lost = `${leaving.answers} ${leaving.answers === 1 ? 'answer' : 'answers'} lost`;
	return leaving.to === 'quit' ?
			`Quit anyway · ${lost}`
		:	`Click ${leaving.to} again to leave · ${lost}`;
}

const TrainView: Component<TrainViewProps> = (props) => {
	const [config, setConfig] = createSignal<TrainConfig>(loadTrainConfig());
	const [boards, setBoards] = createSignal<ScoreBoards>(loadTrainScores());
	const [screen, showScreen] = createSignal<Screen>({ kind: 'picker' });
	// The drill's answers so far, and a leave waiting to be confirmed.
	const [answered, setAnswered] = createSignal(0);
	const [leaving, setLeaving] = createSignal<Leaving | null>(null);
	let leaveTimer: ReturnType<typeof setTimeout> | undefined;
	onCleanup(() => clearTimeout(leaveTimer));

	const disarm = () => {
		clearTimeout(leaveTimer);
		setLeaving(null);
	};

	const setScreen = (next: Screen) => {
		disarm();
		setAnswered(0);
		showScreen(next);
	};

	const inDrill = () => screen().kind === 'drill';

	/**
	 * Whether leaving for `to` can go ahead now. A drill with nothing answered
	 * goes at once; past that, the first ask only arms the leave, and the same
	 * ask again inside `LEAVE_ARM_MS` confirms it. The drill runs on meanwhile.
	 */
	const mayLeave = (to: string): boolean =>
		untrack(() => {
			if (!inDrill() || answered() === 0 || leaving()?.to === to) {
				disarm();
				return true;
			}
			clearTimeout(leaveTimer);
			setLeaving({ to, answers: answered() });
			leaveTimer = setTimeout(() => setLeaving(null), LEAVE_ARM_MS);
			return false;
		});

	onMount(() => {
		props.onLeaveGuard?.(mayLeave);
		onCleanup(() => props.onLeaveGuard?.(null));
	});

	const updateConfig = (next: TrainConfig) => {
		setConfig(next);
		saveTrainConfig(next);
	};

	const start = (drill: DrillId, mode: DrillMode) => {
		updateConfig({ modes: { ...config().modes, [drill]: mode } });
		setScreen({ kind: 'drill', drill, mode, seed: props.seed ?? newSeed() });
	};

	const toPicker = () => setScreen({ kind: 'picker' });

	const quit = () => {
		if (mayLeave('quit')) toPicker();
	};

	const onKey = (event: KeyboardEvent) => {
		if (hasModifier(event)) return;
		if (event.key !== 'Escape' || !inDrill() || escapeIsTaken(event)) return;
		event.preventDefault();
		quit();
	};
	onMount(() => {
		window.addEventListener('keydown', onKey);
		onCleanup(() => window.removeEventListener('keydown', onKey));
	});

	const finish = (
		drill: DrillId,
		mode: DrillMode,
		seed: number,
		records: TrainRecord[]
	) => {
		const run: DrillRun = { drill, mode, seed, records };
		const entry = scoreEntry(run, new Date());
		const key = boardKey(drill, mode);
		const previousBest = bestOn(boards(), key);
		const recorded = recordScore(boards(), key, entry);
		setBoards(recorded.boards);
		saveTrainScores(recorded.boards);
		setScreen({
			kind: 'results',
			run,
			entry,
			rank: recorded.rank,
			board: recorded.board,
			newBest: recorded.newBest,
			previousBest,
		});
	};

	return (
		<div class="train-view">
			<div
				class="train-view__screen"
				classList={{ 'is-wide': screen().kind !== 'drill' }}
			>
				<Switch>
					<Match when={screen().kind === 'picker'}>
						<TrainPicker
							config={config()}
							boards={boards()}
							onModeChange={(drill, mode) =>
								updateConfig({ modes: { ...config().modes, [drill]: mode } })
							}
							onStart={start}
						/>
					</Match>
					<Match
						when={(() => {
							const current = screen();
							return current.kind === 'drill' ? current : undefined;
						})()}
						keyed
					>
						{(drill) => (
							<TrainDrill
								drill={drill.drill}
								mode={drill.mode}
								seed={drill.seed}
								onFinish={(records) =>
									finish(drill.drill, drill.mode, drill.seed, records)
								}
								onAnswered={setAnswered}
							/>
						)}
					</Match>
					<Match
						when={(() => {
							const current = screen();
							return current.kind === 'results' ? current : undefined;
						})()}
						keyed
					>
						{(results) => (
							<TrainResults
								run={results.run}
								entry={results.entry}
								rank={results.rank}
								board={results.board}
								newBest={results.newBest}
								previousBest={results.previousBest}
								onRetry={() => start(results.run.drill, results.run.mode)}
								onBack={toPicker}
							/>
						)}
					</Match>
				</Switch>
				<Show when={inDrill()}>
					<div class="train-view__quit" aria-live="polite">
						<button
							type="button"
							class="train-view__link"
							classList={{ 'is-armed': leaving() !== null }}
							onClick={quit}
						>
							<span class="train-view__key">Esc</span>
							{quitLabel(leaving())}
						</button>
					</div>
				</Show>
			</div>
		</div>
	);
};

export default TrainView;
