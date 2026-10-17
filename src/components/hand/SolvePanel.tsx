/**
 * The solver for one decision, under the caption. It shows either its settings
 * (the betting tree, the target and the memory it would take) or the solve:
 * how far it has got, then what it found for the hero's hand and range. The
 * caption asks it to run or to show its settings; whether it is open is local
 * to the view, not the address: it is a readout, not a place. See docs/solver.md.
 */

import {
	createEffect,
	createMemo,
	createSignal,
	For,
	on,
	onCleanup,
	Show,
	untrack,
	type Component,
} from 'solid-js';

import { ChevronRight, Pencil, X } from 'lucide-solid';

import Segmented, { type SegmentOption } from '#c/common/Segmented';
import RangeGrid from '#c/ranges/RangeGrid';
import { RangeKey } from '#c/ranges/RangesView';
import { SOLVE_BUDGET_MB } from '#utils/app/solveClient';
import type { TreePreference } from '#utils/app/storage';
import type { HandReport } from '#utils/coach/report';
import { bucketNote } from '#utils/solver/buckets';
import { describeClass, type SolveResult } from '#utils/solver/result';
import { DEFAULT_RAKE } from '#utils/solver/spot';
import {
	MAX_ITERATIONS,
	MAX_TARGET_PCT,
	MIN_TARGET_PCT,
	targetProblem,
} from '#utils/solver/target';
import {
	estimateTree,
	presetOf,
	SOLVE_STREETS,
	validateTree,
	type SolveStreet,
	type TreePreset,
	type TreeSettings,
} from '#utils/solver/tree';
import { signed } from '#utils/ui/format';

import { presetName, type SolveSettings } from './solveSettings';
import { useSolver } from './solverContext';

import '#styles/hand/SolvePanel';

/** What the caption last asked of the panel; `n` tells two alike asks apart. */
export interface SolveRequest {
	kind: 'run' | 'settings';
	n: number;
}

interface SolvePanelProps {
	hand: HandReport;
	/** The hero's decision: an index into the hand's actions. */
	stepIndex: number;
	street: SolveStreet;
	settings: SolveSettings;
	request: SolveRequest;
	/** Told whenever the settings show or hide, so the caption can mark its button. */
	onEditing: (editing: boolean) => void;
	onClose: () => void;
}

interface SolvedWith {
	preset: TreePreference['preset'];
	targetPct: number;
}

type Status =
	| { kind: 'idle' }
	| {
			kind: 'running';
			iteration: number;
			exploitabilityPct: number | null;
			bytes?: number;
			with: SolvedWith;
	  }
	| { kind: 'done'; result: SolveResult; with: SolvedWith }
	| { kind: 'error'; message: string };

const PRESET_OPTIONS: SegmentOption<TreePreset | 'custom'>[] = [
	{ id: 'simple', label: 'Simple' },
	{ id: 'standard', label: 'Standard' },
	{ id: 'detailed', label: 'Detailed' },
];

const NAMES: Record<SolveStreet, string> = { flop: 'Flop', turn: 'Turn', river: 'River' };

/** Combos a side typically holds, for the estimate before the ranges are built. */
const TYPICAL_COMBOS = 700;
const MB = 1024 * 1024;
/** Past this share of the budget the meter turns from mint to gold. */
const METER_WARN = 2 / 3;

const percentText = (sizes: readonly number[]): string =>
	sizes.map((size) => Math.round(size * 1000) / 10).join(', ');
const multipleText = (sizes: readonly number[]): string => sizes.join(', ');

/** The numbers typed in a field; anything else in it is dropped. */
const numbersOf = (text: string): number[] =>
	text
		.split(/[\s,]+/)
		.map((part) => part.replace(/[%x×]/g, ''))
		.filter((part) => part !== '')
		.map(Number);

const share = (value: number): string => `${Math.round(value * 100)}%`;
const bb = (value: number): string => (Math.round(value * 100) / 100).toFixed(2);
const megabytes = (bytes: number): string =>
	Math.max(1, Math.round(bytes / MB)).toLocaleString();

const SizesField: Component<{
	label: string;
	value: string;
	onCommit: (text: string) => void;
}> = (props) => (
	<input
		type="text"
		inputMode="decimal"
		class="solve-panel__input"
		aria-label={props.label}
		value={props.value}
		onChange={(event) => props.onCommit(event.currentTarget.value)}
	/>
);

const SolvePanel: Component<SolvePanelProps> = (props) => {
	const client = useSolver();
	const [status, setStatus] = createSignal<Status>({ kind: 'idle' });
	const [editing, setEditing] = createSignal(
		untrack(() => props.request.kind === 'settings')
	);
	const [advanced, setAdvanced] = createSignal(false);
	let abandon: (() => void) | undefined;

	const preference = () => props.settings.preference();
	const targetPct = () => props.settings.targetPct();
	const tree = () => preference().tree;
	const problems = createMemo(() => {
		const off = targetProblem(targetPct());
		return off ? [...validateTree(tree()), off] : validateTree(tree());
	});
	const estimate = createMemo(() =>
		estimateTree(tree(), props.street, { oop: TYPICAL_COMBOS, ip: TYPICAL_COMBOS })
	);
	/** The deepest rung of the ladder: 16-bit, the river in `MIN_BUCKETS` buckets. */
	const smallestMb = () => estimate().bytesSmallest / MB;
	const overBudget = () => smallestMb() > SOLVE_BUDGET_MB;
	const used = () => Math.min(1, smallestMb() / SOLVE_BUDGET_MB);
	const rake = () => props.hand.rake ?? DEFAULT_RAKE;
	const streets = () => SOLVE_STREETS.slice(SOLVE_STREETS.indexOf(props.street));

	const choose = (preset: TreePreset | 'custom') => {
		if (preset !== 'custom')
			props.settings.setPreference({ preset, tree: presetOf(preset) });
	};
	const edit = (update: (settings: TreeSettings) => void) => {
		const next = structuredClone(tree());
		update(next);
		props.settings.setPreference({ preset: 'custom', tree: next });
	};

	const stop = () => {
		abandon?.();
		abandon = undefined;
	};

	const start = () => {
		if (!client || problems().length > 0 || overBudget()) {
			// Show why it cannot run rather than doing nothing.
			setEditing(true);
			return;
		}
		stop();
		setEditing(false);
		const solvedWith = { preset: preference().preset, targetPct: targetPct() };
		setStatus({
			kind: 'running',
			iteration: 0,
			exploitabilityPct: null,
			with: solvedWith,
		});
		abandon = client.solve(
			{
				handId: props.hand.id,
				stepIndex: props.stepIndex,
				tree: tree(),
				rake: rake(),
				targetPct: targetPct(),
			},
			{
				onEstimate: ({ compressed, bytes, bytesCompressed }) =>
					setStatus((now) =>
						now.kind === 'running' ?
							{ ...now, bytes: compressed ? bytesCompressed : bytes }
						:	now
					),
				onProgress: (iteration, exploitabilityPct) =>
					setStatus((now) =>
						now.kind === 'running' ? { ...now, iteration, exploitabilityPct } : now
					),
				onComplete: (result) => setStatus({ kind: 'done', result, with: solvedWith }),
				onError: (message) => setStatus({ kind: 'error', message }),
			}
		);
	};
	const cancel = () => {
		stop();
		setStatus({ kind: 'idle' });
		setEditing(true);
	};
	const settled = () => {
		const kind = status().kind;
		return kind === 'done' || kind === 'error';
	};

	createEffect(
		on(
			() => props.request,
			(request, before) => {
				if (request.kind === 'run') start();
				else if (!before) setEditing(true);
				// Asked again: the settings fold away to the answer, or the panel closes.
				else if (!editing()) setEditing(true);
				else if (settled()) setEditing(false);
				else props.onClose();
			}
		)
	);
	createEffect(() => props.onEditing(editing()));
	onCleanup(stop);

	const running = () => {
		const now = status();
		return now.kind === 'running' ? now : undefined;
	};
	const failed = () => {
		const now = status();
		return now.kind === 'error' ? now : undefined;
	};
	const found = () => {
		const now = status();
		return now.kind === 'done' ? now : undefined;
	};
	/** How near the solve is to stopping: at the target or at the iteration cap. */
	const progress = (now: NonNullable<ReturnType<typeof running>>) => {
		const byTarget =
			now.exploitabilityPct ? now.with.targetPct / now.exploitabilityPct : 0;
		return Math.min(1, Math.max(now.iteration / MAX_ITERATIONS, byTarget));
	};

	return (
		<section class="solve-panel" aria-label="Solver">
			<header class="solve-panel__head">
				<h3 class="solve-panel__title">Solver</h3>
				<p class="solve-panel__where">
					from the start of the {props.street} · {share(rake())} rake
				</p>
				<button
					type="button"
					class="solve-panel__close"
					aria-label="Close the solver"
					onClick={() => props.onClose()}
				>
					<X aria-hidden="true" />
				</button>
			</header>

			<Show
				when={editing()}
				fallback={
					<>
						<Show when={running()}>
							{(now) => (
								<div class="solve-panel__running" role="status">
									<div class="solve-panel__progress">
										<p class="solve-panel__progress-text">
											Solving · iteration {now().iteration}
											<Show when={now().exploitabilityPct !== null}>
												{' '}
												· exploitable by {(now().exploitabilityPct ?? 0).toFixed(2)}% of
												the pot
											</Show>
										</p>
										<button type="button" class="solve-panel__button" onClick={cancel}>
											Cancel
										</button>
									</div>
									<div class="solve-panel__bar" aria-hidden="true">
										<div
											class="solve-panel__bar-fill"
											style={{ width: `${Math.round(progress(now()) * 100)}%` }}
										/>
									</div>
									<p class="solve-panel__facts">
										{presetName(now().with.preset)} tree · stop at {now().with.targetPct}%
										<Show when={now().bytes}>
											{(bytes) => <> · {megabytes(bytes())} MB</>}
										</Show>
									</p>
								</div>
							)}
						</Show>

						<Show when={failed()}>
							{(now) => (
								<p class="solve-panel__error" role="alert">
									{now().message}
								</p>
							)}
						</Show>

						<Show when={found()}>
							{(now) => (
								<>
									<Found result={now().result} />
									<p class="solve-panel__note">
										Solved with the coach’s modelled ranges for both players. The ranges
										are estimates, and what the solver says of the hand holds only as far
										as they do; an earlier street’s checks are still read by the model’s
										rules.
									</p>
								</>
							)}
						</Show>

						<Show when={settled()}>
							<div class="solve-panel__summary">
								<p class="solve-panel__summary-text">
									<Show when={found()} fallback="The solve did not finish.">
										{(now) => (
											<>
												Solved over the {presetName(now().with.preset).toLowerCase()}{' '}
												tree, to {now().with.targetPct}% of the pot
											</>
										)}
									</Show>
								</p>
								<button
									type="button"
									class="solve-panel__button"
									onClick={() => setEditing(true)}
								>
									<Pencil aria-hidden="true" />
									Adjust &amp; re-solve
								</button>
							</div>
						</Show>
					</>
				}
			>
				<div class="solve-panel__settings">
					<div class="solve-panel__group">
						<Segmented
							label="Betting tree"
							options={
								preference().preset === 'custom' ?
									[...PRESET_OPTIONS, { id: 'custom', label: 'Custom' }]
								:	PRESET_OPTIONS
							}
							value={preference().preset}
							onChange={choose}
						/>
						<table class="solve-panel__sizes">
							<thead>
								<tr>
									<th scope="col" class="solve-panel__street-head">
										Street
									</th>
									<th scope="col">
										Bets <span class="solve-panel__unit">% of pot</span>
									</th>
									<th scope="col" class="solve-panel__raise-head">
										Raises <span class="solve-panel__unit">× the bet</span>
									</th>
								</tr>
							</thead>
							<tbody>
								<For each={streets()}>
									{(street) => (
										<tr>
											<th scope="row" class="solve-panel__street">
												{NAMES[street]}
											</th>
											<td>
												<SizesField
													label={`${NAMES[street]} bets, % of pot`}
													value={percentText(tree()[street].bet)}
													onCommit={(text) =>
														edit((settings) => {
															settings[street].bet = numbersOf(text).map(
																(size) => size / 100
															);
														})
													}
												/>
											</td>
											<td>
												<SizesField
													label={`${NAMES[street]} raises, × the bet`}
													value={multipleText(tree()[street].raise)}
													onCommit={(text) =>
														edit((settings) => {
															settings[street].raise = numbersOf(text);
														})
													}
												/>
											</td>
										</tr>
									)}
								</For>
							</tbody>
						</table>

						<button
							type="button"
							class="solve-panel__disclosure"
							aria-expanded={advanced()}
							aria-controls="solve-panel-advanced"
							onClick={() => setAdvanced(!advanced())}
						>
							<ChevronRight aria-hidden="true" />
							Advanced:{' '}
							{tree().raiseCap === 0 ?
								'no raises'
							:	`${tree().raiseCap} raise${tree().raiseCap === 1 ? '' : 's'} a street`}
							{tree().addAllIn ? ' · all-in at every node' : ''} · all-in under{' '}
							{Math.round(tree().allInThreshold * 100)}%
						</button>
						<Show when={advanced()}>
							<div class="solve-panel__advanced" id="solve-panel-advanced">
								<label class="solve-panel__field">
									<span class="solve-panel__field-label">Raises per street</span>
									<input
										type="number"
										min="0"
										max="4"
										class="solve-panel__input"
										value={tree().raiseCap}
										onChange={(event) =>
											edit((settings) => {
												settings.raiseCap = Number(event.currentTarget.value);
											})
										}
									/>
								</label>
								<label class="solve-panel__field">
									<span class="solve-panel__field-label">
										All-in below, % of pot left
									</span>
									<input
										type="number"
										min="0"
										max="100"
										class="solve-panel__input"
										value={Math.round(tree().allInThreshold * 100)}
										onChange={(event) =>
											edit((settings) => {
												settings.allInThreshold = Number(event.currentTarget.value) / 100;
											})
										}
									/>
								</label>
								<label class="solve-panel__check">
									<input
										type="checkbox"
										checked={tree().addAllIn}
										onChange={(event) =>
											edit((settings) => {
												settings.addAllIn = event.currentTarget.checked;
											})
										}
									/>
									An all-in at every node
								</label>
							</div>
						</Show>
					</div>

					<div class="solve-panel__group">
						<h4 class="solve-panel__group-title">Precision</h4>
						<div class="solve-panel__target">
							<label for="solve-panel-target">Stop when exploitable by</label>
							<input
								id="solve-panel-target"
								type="number"
								min={MIN_TARGET_PCT}
								max={MAX_TARGET_PCT}
								step="0.05"
								class="solve-panel__input solve-panel__input--short"
								value={targetPct()}
								onChange={(event) =>
									props.settings.setTargetPct(Number(event.currentTarget.value))
								}
							/>
							<span class="solve-panel__unit">% of the pot</span>
						</div>
						<p class="solve-panel__hint">
							Lower solves deeper and takes longer; {MAX_ITERATIONS.toLocaleString()}{' '}
							iterations stop it either way.
						</p>
					</div>

					<div class="solve-panel__group">
						<div class="solve-panel__memory">
							<h4 class="solve-panel__group-title">Memory</h4>
							<p class="solve-panel__memory-text" classList={{ 'is-over': overBudget() }}>
								≈ {Math.max(1, Math.round(smallestMb())).toLocaleString()} MB of{' '}
								{SOLVE_BUDGET_MB.toLocaleString()} · {estimate().nodes.toLocaleString()}{' '}
								nodes
							</p>
						</div>
						<div class="solve-panel__bar" aria-hidden="true">
							<div
								class="solve-panel__bar-fill"
								classList={{
									'is-ok': used() <= METER_WARN,
									'is-over': overBudget(),
								}}
								style={{ width: `${Math.round(used() * 100)}%` }}
							/>
						</div>
						<p class="solve-panel__hint">
							At the smallest: 16-bit, with the river's hands in buckets of like strength.
						</p>
						<Show when={overBudget()}>
							<p class="solve-panel__error" role="alert">
								That is over the {SOLVE_BUDGET_MB.toLocaleString()} MB the page allows:
								use fewer sizes, or a shorter raise cap.
							</p>
						</Show>
						<Show when={problems().length > 0}>
							<ul class="solve-panel__problems" role="alert">
								<For each={problems()}>{(problem) => <li>{problem}</li>}</For>
							</ul>
						</Show>
					</div>

					<div class="solve-panel__actions">
						<Show when={settled()}>
							<button
								type="button"
								class="solve-panel__button solve-panel__button--quiet"
								onClick={() => setEditing(false)}
							>
								Back to the result
							</button>
						</Show>
						<button
							type="button"
							class="solve-panel__button solve-panel__run highlight"
							disabled={problems().length > 0 || overBudget()}
							onClick={start}
						>
							{found() ? 'Solve again' : 'Solve'}
						</button>
					</div>
				</div>
			</Show>
		</section>
	);
};

const Found: Component<{ result: SolveResult }> = (props) => {
	const verdict = () => {
		const { result } = props;
		const unreached =
			result.reached ? '' : (
				`The solver never plays ${result.hand} to this node: it would have bet, or folded, earlier. Had it got here: `
			);
		return unreached + advice(result);
	};
	const advice = (result: SolveResult) => {
		const best = result.actions[result.best];
		if (result.chosen === null) {
			return `No action in the tree matches what was played. The best is ${best.label}.`;
		}
		const chosen = result.actions[result.chosen];
		const gap = result.evGapBb ?? 0;
		return result.chosen === result.best || Math.abs(gap) < 0.005 ?
				`${chosen.label} is as good as any: the solver plays it ${share(chosen.frequency)} of the time with ${result.hand}.`
			:	`${chosen.label} gives up ${bb(-gap)} bb against ${best.label}, which the solver plays ${share(best.frequency)} of the time with ${result.hand}.`;
	};
	return (
		<div class="solve-panel__result">
			<p class="solve-panel__verdict">{verdict()}</p>
			<table class="solve-panel__table">
				<caption class="solve-panel__caption">{captionOf(props.result)}</caption>
				<thead>
					<tr>
						<th scope="col">Action</th>
						<th scope="col">Frequency</th>
						<th scope="col">EV, bb</th>
					</tr>
				</thead>
				<tbody>
					<For each={props.result.actions}>
						{(row, index) => (
							<tr
								classList={{
									'is-chosen': props.result.chosen === index(),
									'is-best': props.result.best === index(),
								}}
							>
								<th scope="row">
									{row.label}
									<Show when={props.result.chosen === index()}>
										<span class="solve-panel__tag">played</span>
									</Show>
									<Show when={props.result.best === index()}>
										<span class="solve-panel__tag solve-panel__tag--best">best</span>
									</Show>
								</th>
								<td>{share(row.frequency)}</td>
								<td
									classList={{
										'is-positive': row.evBb > 0.005,
										'is-negative': row.evBb < -0.005,
									}}
								>
									{signed(row.evBb, 2)}
								</td>
							</tr>
						)}
					</For>
				</tbody>
			</table>
			<p class="solve-panel__facts">
				Equity {share(props.result.equity)}
				<Show when={props.result.eqr !== null}>
					{' '}
					· realises {share(props.result.eqr ?? 0)} of it
				</Show>{' '}
				· pot {bb(props.result.potBb)} bb
			</p>
			<h4 class="solve-panel__range-title">The hero’s range here</h4>
			<RangeGrid
				strategy={props.result.strategy}
				marked={props.result.hand}
				rest={props.result.facing ? 'folds' : 'checks'}
				faint={(cls) => props.result.held[cls] === 0}
				describe={(cls) => describeClass(props.result, cls)}
			/>
			<RangeKey checks={!props.result.facing} />
			<p class="solve-panel__facts">
				{props.result.iterations} iterations · exploitable by{' '}
				{props.result.exploitabilityPct.toFixed(2)}% of the pot ·{' '}
				{props.result.nodes.toLocaleString()} nodes ·{' '}
				{Math.max(1, Math.round(props.result.bytes / MB))} MB
				{props.result.compressed ? ' (16-bit)' : ''}
			</p>
			<Show when={bucketNote(props.result.riverBuckets, props.result.levelled)}>
				{(note) => <p class="solve-panel__buckets">{note()}</p>}
			</Show>
		</div>
	);
};

const captionOf = (result: SolveResult): string =>
	`${result.hand}: what the solver does with it`;

export default SolvePanel;
