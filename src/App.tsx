/**
 * The shell: the header, the view the hash route names, and the one piece of
 * state the views share -- the report, summed from the hand library. It is
 * also what holds Review to the height of the window. Logs are loaded into the
 * library by a worker that this component owns for as long as it is mounted.
 */

import {
	createEffect,
	createMemo,
	createSignal,
	Match,
	onCleanup,
	onMount,
	Show,
	Switch,
	type Component,
} from 'solid-js';

import AppHeader from '#c/common/AppHeader';
import type { SelectOption } from '#c/common/Select';
import LibraryPanel from '#c/library/LibraryPanel';
import PlayersView from '#c/players/PlayersView';
import OpeningsView from '#c/ranges/OpeningsView';
import RangesView from '#c/ranges/RangesView';
import SummaryView from '#c/report/SummaryView';
import ReviewView from '#c/review/ReviewView';
import TrendsView from '#c/trends/TrendsView';
import LogDrop, {
	createFilePicker,
	LogStatus,
	type LoadedFile,
	type Progress,
} from '#c/upload/LogDrop';
import type {
	AnalysisWorkerMessage,
	AnalysisWorkerResponse,
	IngestLog,
} from '#utils/analysisWorkerProtocol';
import { createDetailCache } from '#utils/app/details';
import { createHashRoute, type AppTab } from '#utils/app/hashRoute';
import { clearLegacyReport } from '#utils/app/storage';
import type { HandsReport } from '#utils/coach/report';
import {
	DEFAULT_SCOPE,
	scopeHands,
	sessionsOf,
	type Scope,
	type ScopePreset,
} from '#utils/coach/sessions';
import { backupName, backupOf, logTextOf } from '#utils/store/backup';
import { openIdbStore } from '#utils/store/idbStore';
import { libraryReport, loadLibrary, type Library } from '#utils/store/library';
import type { PlayerAggregate } from '#utils/store/types';
import { shortTime } from '#utils/ui/format';
import { DEFAULT_REVIEW } from '#utils/ui/review';

import '#styles/App';

/** Sittings offered by name in the scope's list: the latest ones. */
const SITTINGS_LISTED = 20;

/** The views that are over the scope's hands, and so offer it. */
const SCOPED_TABS: readonly AppTab[] = ['summary', 'review', 'openings'];

const App: Component = () => {
	const [route, navigate] = createHashRoute();
	const tab = () => route().tab;
	const setTab = (next: AppTab) => navigate({ tab: next });
	const store = openIdbStore();
	const details = createDetailCache(store);
	// Null until the library has been read: an empty page is not yet an empty library.
	const [library, setLibrary] = createSignal<Library | null>(null);
	const [progress, setProgress] = createSignal<Progress | null>(null);
	const [error, setError] = createSignal<string | null>(null);

	const [players, setPlayers] = createSignal<PlayerAggregate[]>([]);
	const [usage, setUsage] = createSignal<number | null>(null);

	const scope = () => route().scope ?? DEFAULT_SCOPE;
	const sessions = createMemo(() => sessionsOf(library()?.hands ?? []));
	const report = createMemo((): HandsReport | null => {
		const loaded = library();
		const meta = loaded?.meta;
		if (!loaded || !meta || loaded.hands.length === 0) return null;
		const hands = [...scopeHands(loaded.hands, scope(), sessions())];
		return { ...libraryReport({ ...loaded, meta }, hands), hands };
	});
	const scopes = createMemo((): SelectOption<Scope>[] => {
		const count = (hands: number) => `${hands} ${hands === 1 ? 'hand' : 'hands'}`;
		const all = library()?.hands ?? [];
		const sittings = sessions();
		// Each says how many hands it would leave.
		const presets: [ScopePreset, string][] = [
			['all', 'All time'],
			['latest', 'Latest sitting'],
			['week', 'Last 7 days'],
			['month', 'Last 30 days'],
		];
		return [
			...presets.map(([id, label]) => ({
				id,
				label: `${label} · ${count(scopeHands(all, id, sittings).length)}`,
			})),
			...sessions()
				.slice(-SITTINGS_LISTED)
				.reverse()
				.map((session) => ({
					id: session.id,
					label: `${shortTime(session.first)} · ${count(session.hands)}`,
				})),
		];
	});

	// Created on first use, so a visit that only reads the library never pays
	// for a second thread.
	let worker: Worker | undefined;
	let latestRequestId = 0;
	let mounted = true;
	let reads = 0;

	const refresh = async (): Promise<Library | null> => {
		// Only the latest read is taken: an earlier one may land after it.
		const read = ++reads;
		try {
			const loaded = await loadLibrary(store);
			if (!mounted || read !== reads) return null;
			details.clear();
			setLibrary(loaded);
			void navigator.storage
				?.estimate?.()
				.then((estimate) => mounted && setUsage(estimate.usage ?? null))
				.catch(() => undefined);
			return loaded;
		} catch (cause) {
			if (!mounted) return null;
			setLibrary({ meta: null, hero: '', heroes: [], hands: [], stale: 0, imports: [] });
			setError(
				`The hand library could not be read: ${cause instanceof Error ? cause.message : String(cause)}`
			);
			return null;
		}
	};

	const onMessage = (event: MessageEvent<AnalysisWorkerResponse>) => {
		const response = event.data;
		// A superseded run's answers are not wanted.
		if (response.requestId !== latestRequestId) return;
		if (response.type === 'progress') {
			const { done, total, log, logs } = response;
			setProgress({ done, total, log, logs });
			return;
		}
		if (response.type === 'error') setError(response.message);
		if (response.type === 'complete' && response.empty.length > 0) {
			setError(`No PokerStars hands found in ${response.empty.join(', ')}.`);
		}
		// The strip stays until the hands a finished run added are on the page.
		if (response.type !== 'complete') setProgress(null);
		// A cancelled run has kept what it finished, so the library is read either way.
		void refresh().then(() => {
			if (response.requestId === latestRequestId) setProgress(null);
		});
	};

	const send = (message: AnalysisWorkerMessage) => {
		if (!worker) {
			worker = new Worker(new URL('./utils/analysis.worker.ts', import.meta.url), {
				type: 'module',
			});
			worker.addEventListener('message', onMessage);
		}
		worker.postMessage(message);
	};

	/** Loads logs into the library, or with none brings the library up to date. */
	const ingest = (logs: IngestLog[]) => {
		latestRequestId++;
		setError(null);
		setProgress({ done: 0, total: 0 });
		send({ type: 'ingest', requestId: latestRequestId, logs });
	};

	const analyse = (files: LoadedFile[]) => {
		// Ask the browser not to evict the library under storage pressure.
		void navigator.storage?.persist?.().catch(() => false);
		// An import is keyed by its time, so each file is given a millisecond of its own.
		const now = Date.now();
		ingest(
			files.map(({ name, text }, index) => ({
				text: logTextOf(text),
				fileName: name,
				now: new Date(now + index).toISOString(),
			}))
		);
	};

	// Read when the view that shows them is opened, and again when the library moves.
	createEffect(() => {
		if (tab() !== 'players' || !library()) return;
		void store.players().then((found) => mounted && setPlayers(found));
	});

	const exportLibrary = async () => {
		const loaded = library();
		if (!loaded?.meta) return;
		const raw = await store.raw(loaded.hands.map((hand) => hand.id));
		const backup = backupOf(loaded.hero, [...raw.values()], new Date().toISOString());
		const url = URL.createObjectURL(
			new Blob([JSON.stringify(backup)], { type: 'application/json' })
		);
		const link = document.createElement('a');
		link.href = url;
		link.download = backupName(backup);
		link.click();
		URL.revokeObjectURL(url);
	};

	const clearLibrary = async () => {
		const hands = library()?.hands.length ?? 0;
		if (!window.confirm(`Empty the library? All ${hands} hands will be forgotten.`))
			return;
		await store.clear();
		setPlayers([]);
		await refresh();
	};

	const cancel = () => send({ type: 'cancel', requestId: latestRequestId });

	onMount(() => {
		clearLegacyReport();
		void refresh().then((loaded) => {
			// Hands graded by an older build, or under other settings: grade them again.
			if (loaded && loaded.stale > 0 && latestRequestId === 0) ingest([]);
		});
	});

	onCleanup(() => {
		mounted = false;
		worker?.terminate();
	});

	// The hand may be none of the default list's, so the whole log is listed.
	const openHand = (handId: string) =>
		navigate({ tab: 'review', review: { ...DEFAULT_REVIEW, show: 'all', hand: handId } });

	const picker = createFilePicker(analyse);

	// Offered on the views that are over a scope, once there is a choice of sitting.
	const scopeChoice = () =>
		report() && SCOPED_TABS.includes(tab()) && sessions().length > 1 ?
			{
				options: scopes(),
				value: scope(),
				onChange: (next: Scope) =>
					navigate({ scope: next, review: { hand: null, step: null } }),
			}
		:	null;

	// Review with a report is one window high: see "Review fits the window".
	const fitted = () => tab() === 'review' && report() !== null;

	return (
		<div class="app-shell" classList={{ 'app-shell--fitted': fitted() }}>
			<AppHeader
				tab={tab()}
				onTabChange={setTab}
				hands={report() ? (library()?.hands.length ?? 0) : null}
				scope={scopeChoice()}
				onLoad={picker.open}
			/>
			<main class="app" classList={{ 'is-dragging': picker.dragging() }}>
				<picker.Input />
				<Show when={report() && (progress() || error())}>
					<div class="log-status">
						<LogStatus progress={progress()} error={error()} onCancel={cancel} />
					</div>
				</Show>
				<Switch>
					<Match when={tab() === 'ranges'}>
						<RangesView
							query={route().ranges}
							onQuery={(change, options) => navigate({ ranges: change }, options)}
						/>
						<Show when={!report()}>
							<p class="app__empty">
								Load a hand history with the button in the header to have it graded
								against these ranges.
							</p>
						</Show>
					</Match>
					<Match when={report()} keyed>
						{(loaded) => (
							<Switch>
								<Match when={tab() === 'summary'}>
									<SummaryView report={loaded} scope={scope()} />
								</Match>
								<Match when={tab() === 'trends'}>
									<TrendsView hands={library()?.hands ?? []} />
									<LibraryPanel
										imports={library()?.imports ?? []}
										hands={library()?.hands.length ?? 0}
										usage={usage()}
										onExport={() => void exportLibrary()}
										onClear={() => void clearLibrary()}
									/>
								</Match>
								<Match when={tab() === 'players'}>
									<PlayersView
										players={players()}
										heroes={library()?.heroes ?? []}
										name={route().player ?? null}
									/>
								</Match>
								<Match when={tab() === 'review'}>
									<ReviewView
										report={loaded}
										detailOf={details.detailOf}
										query={route().review}
										onQuery={(change, options) => navigate({ review: change }, options)}
									/>
								</Match>
								<Match when={tab() === 'openings'}>
									<OpeningsView report={loaded} onOpenHand={openHand} />
								</Match>
							</Switch>
						)}
					</Match>
					<Match when={library() !== null && !report()}>
						<LogDrop
							picker={picker}
							onCancel={cancel}
							progress={progress()}
							error={error()}
						/>
					</Match>
				</Switch>
			</main>
		</div>
	);
};

export default App;
