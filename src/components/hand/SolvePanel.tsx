/**
 * The solver's answer for one decision, under the caption: the betting tree it
 * ran over (editable), how far it has got, and what it found for the hero's
 * hand and range. It starts when it is opened. Whether it is open is local to
 * the view, not the address: it is a readout, not a place. See docs/solver.md.
 */

import {
	createMemo,
	createSignal,
	For,
	onCleanup,
	onMount,
	Show,
	type Component,
} from 'solid-js';

import Segmented, { type SegmentOption } from '#c/common/Segmented';
import RangeGrid from '#c/ranges/RangeGrid';
import { RangeKey } from '#c/ranges/RangesView';
import { SOLVE_BUDGET_MB } from '#utils/app/solveClient';
import {
	loadSolveTarget,
	loadTreePreference,
	saveSolveTarget,
	saveTreePreference,
	type TreePreference,
} from '#utils/app/storage';
import type { HandReport } from '#utils/coach/report';
import { describeClass, trimNote, type SolveResult } from '#utils/solver/result';
import { DEFAULT_RAKE } from '#utils/solver/spot';
import { MAX_TRIM } from '#utils/solver/trim';
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

import { useSolver } from './solverContext';

import '#styles/hand/SolvePanel';

interface SolvePanelProps {
	hand: HandReport;
	/** The hero's decision: an index into the hand's actions. */
	stepIndex: number;
	street: SolveStreet;
}

type Status =
	| { kind: 'idle' }
	| {
			kind: 'running';
			iteration: number;
			exploitabilityPct: number | null;
			bytes?: number;
	  }
	| { kind: 'done'; result: SolveResult }
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

const SizesField: Component<{
	label: string;
	value: string;
	onCommit: (text: string) => void;
}> = (props) => (
	<label class="solve-panel__field">
		<span class="solve-panel__field-label">{props.label}</span>
		<input
			type="text"
			inputMode="decimal"
			class="solve-panel__input"
			value={props.value}
			onChange={(event) => props.onCommit(event.currentTarget.value)}
		/>
	</label>
);

const SolvePanel: Component<SolvePanelProps> = (props) => {
	const client = useSolver();
	const [preference, setPreference] = createSignal<TreePreference>(loadTreePreference());
	const [targetPct, setTargetPct] = createSignal(loadSolveTarget());
	const [status, setStatus] = createSignal<Status>({ kind: 'idle' });
	let abandon: (() => void) | undefined;

	const tree = () => preference().tree;
	const problems = createMemo(() => {
		const off = targetProblem(targetPct());
		return off ? [...validateTree(tree()), off] : validateTree(tree());
	});
	const estimate = createMemo(() =>
		estimateTree(tree(), props.street, { oop: TYPICAL_COMBOS, ip: TYPICAL_COMBOS })
	);
	/** The deepest rung of the ladder: 16-bit over ranges trimmed by `MAX_TRIM`. */
	const smallestMb = () => (estimate().bytesCompressed * (1 - MAX_TRIM)) / MB;
	const overBudget = () => smallestMb() > SOLVE_BUDGET_MB;
	const rake = () => props.hand.rake ?? DEFAULT_RAKE;
	const streets = () => SOLVE_STREETS.slice(SOLVE_STREETS.indexOf(props.street));

	const change = (next: TreePreference) => {
		setPreference(next);
		saveTreePreference(next);
	};
	const choose = (preset: TreePreset | 'custom') => {
		if (preset !== 'custom') change({ preset, tree: presetOf(preset) });
	};
	const edit = (update: (settings: TreeSettings) => void) => {
		const next = structuredClone(tree());
		update(next);
		change({ preset: 'custom', tree: next });
	};

	const stop = () => {
		abandon?.();
		abandon = undefined;
	};

	const start = () => {
		if (!client || problems().length > 0 || overBudget()) return;
		stop();
		setStatus({ kind: 'running', iteration: 0, exploitabilityPct: null });
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
				onComplete: (result) => setStatus({ kind: 'done', result }),
				onError: (message) => setStatus({ kind: 'error', message }),
			}
		);
	};
	const cancel = () => {
		stop();
		setStatus({ kind: 'idle' });
	};

	onMount(start);
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

	return (
		<section class="solve-panel" aria-label="Solver">
			<header class="solve-panel__head">
				<h3 class="solve-panel__title">Solver</h3>
				<Show when={running()}>
					{(now) => (
						<p class="solve-panel__progress" role="status">
							Solving · iteration {now().iteration}
							<Show when={now().exploitabilityPct !== null}>
								{' '}
								· exploitable by {(now().exploitabilityPct ?? 0).toFixed(2)}% of the pot
							</Show>
						</p>
					)}
				</Show>
				<Show when={running()}>
					<button type="button" class="solve-panel__cancel" onClick={cancel}>
						Cancel
					</button>
				</Show>
			</header>

			<Show when={failed()}>
				{(now) => (
					<p class="solve-panel__error" role="alert">
						{now().message}
					</p>
				)}
			</Show>

			<Show when={found()}>{(now) => <Found result={now().result} />}</Show>

			<details class="solve-panel__tree">
				<summary>
					Betting tree:{' '}
					{preference().preset === 'custom' ? 'custom' : preference().preset} · dEV{' '}
					{targetPct()}%
				</summary>
				<Segmented
					label="Tree"
					options={
						preference().preset === 'custom' ?
							[...PRESET_OPTIONS, { id: 'custom', label: 'Custom' }]
						:	PRESET_OPTIONS
					}
					value={preference().preset}
					onChange={choose}
				/>
				<For each={streets()}>
					{(street) => (
						<div class="solve-panel__sizes">
							<span class="solve-panel__street">{NAMES[street]}</span>
							<SizesField
								label="Bets, % of pot"
								value={percentText(tree()[street].bet)}
								onCommit={(text) =>
									edit((settings) => {
										settings[street].bet = numbersOf(text).map((size) => size / 100);
									})
								}
							/>
							<SizesField
								label="Raises, × the bet"
								value={multipleText(tree()[street].raise)}
								onCommit={(text) =>
									edit((settings) => {
										settings[street].raise = numbersOf(text);
									})
								}
							/>
						</div>
					)}
				</For>
				<details class="solve-panel__more">
					<summary>More</summary>
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
						<span class="solve-panel__field-label">All-in below, % of pot left</span>
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
				</details>
				<label class="solve-panel__field">
					<span class="solve-panel__field-label">Stop at dEV, % of pot</span>
					<input
						type="number"
						min={MIN_TARGET_PCT}
						max={MAX_TARGET_PCT}
						step="0.05"
						class="solve-panel__input"
						value={targetPct()}
						onChange={(event) => {
							const pct = Number(event.currentTarget.value);
							setTargetPct(pct);
							if (!targetProblem(pct)) saveSolveTarget(pct);
						}}
					/>
				</label>
				<p class="solve-panel__hint">
					Lower solves deeper and takes longer; {MAX_ITERATIONS.toLocaleString()}{' '}
					iterations stop it either way.
				</p>
				<Show when={problems().length > 0}>
					<ul class="solve-panel__problems" role="alert">
						<For each={problems()}>{(problem) => <li>{problem}</li>}</For>
					</ul>
				</Show>
				<p class="solve-panel__estimate">
					About {Math.max(1, Math.round(smallestMb()))} MB at the smallest (16-bit, the
					ranges trimmed), over a tree of roughly {estimate().nodes.toLocaleString()}{' '}
					nodes.
					<Show when={overBudget()}>
						{' '}
						That is over the {SOLVE_BUDGET_MB} MB the page allows: use fewer sizes, or a
						shorter raise cap.
					</Show>
				</p>
				<button
					type="button"
					class="solve-panel__run highlight"
					disabled={running() !== undefined || problems().length > 0 || overBudget()}
					onClick={start}
				>
					Solve again
				</button>
			</details>

			<p class="solve-panel__note">
				Solved from the start of the {props.street}, with the coach’s modelled ranges for
				both players and the betting tree above, at {share(rake())} rake. The ranges are
				estimates, and what the solver says of the hand holds only as far as they do; an
				earlier street’s checks are still read by the model’s rules.
			</p>
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
			<Show when={trimNote(props.result.trim)}>
				{(note) => <p class="solve-panel__trim">{note()}</p>}
			</Show>
		</div>
	);
};

const captionOf = (result: SolveResult): string =>
	`${result.hand}: what the solver does with it`;

export default SolvePanel;
