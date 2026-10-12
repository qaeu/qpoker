/**
 * The shell: the header, the view the hash route names, and the one piece of
 * state the views share -- the report. It is also what holds Review to the
 * height of the window. The analysis itself runs in a worker
 * that this component owns for as long as it is mounted.
 */

import { createSignal, Match, onCleanup, Show, Switch, type Component } from 'solid-js';

import AppHeader from '#c/common/AppHeader';
import OpeningsView from '#c/ranges/OpeningsView';
import RangesView from '#c/ranges/RangesView';
import SummaryView from '#c/report/SummaryView';
import ReviewView from '#c/review/ReviewView';
import LogDrop, { createFilePicker, LogStatus, type Progress } from '#c/upload/LogDrop';
import type { AnalysisWorkerResponse } from '#utils/analysisWorkerProtocol';
import { createHashRoute, type AppTab } from '#utils/app/hashRoute';
import { loadReport, saveReport } from '#utils/app/storage';
import type { AnalysisReport } from '#utils/coach/report';
import { DEFAULT_REVIEW } from '#utils/ui/review';

import '#styles/App';

const App: Component = () => {
	const [route, navigate] = createHashRoute();
	const tab = () => route().tab;
	const setTab = (next: AppTab) => navigate({ tab: next });
	const stored = loadReport();
	const [report, setReport] = createSignal<AnalysisReport | null>(stored?.report ?? null);
	// The file the report on the page came from, not the one being graded.
	const [fileName, setFileName] = createSignal(stored?.fileName ?? '');
	const [progress, setProgress] = createSignal<Progress | null>(null);
	const [error, setError] = createSignal<string | null>(null);

	// Created on first use, so a visit that only reads a cached report never
	// pays for a second thread.
	let worker: Worker | undefined;
	let latestRequestId = 0;
	let pendingName = '';

	const onMessage = (event: MessageEvent<AnalysisWorkerResponse>) => {
		const response = event.data;
		// A superseded run's answers are not wanted.
		if (response.requestId !== latestRequestId) return;
		if (response.type === 'progress') {
			setProgress({ done: response.done, total: response.total });
			return;
		}
		setProgress(null);
		if (response.type === 'complete') {
			setReport(response.report);
			// A hand id means nothing in another log.
			if (route().review.hand) navigate({ review: { hand: null } }, { replace: true });
			setFileName(pendingName);
			saveReport(pendingName, response.report);
		} else if (response.type === 'error') {
			setError(response.message);
		}
	};

	const analyse = (name: string, text: string) => {
		if (!worker) {
			worker = new Worker(new URL('./utils/analysis.worker.ts', import.meta.url), {
				type: 'module',
			});
			worker.addEventListener('message', onMessage);
		}
		pendingName = name;
		latestRequestId++;
		setError(null);
		setProgress({ done: 0, total: 0 });
		worker.postMessage({ requestId: latestRequestId, text });
	};

	const cancel = () =>
		worker?.postMessage({ type: 'cancel', requestId: latestRequestId });

	onCleanup(() => worker?.terminate());

	// The hand may be none of the default list's, so the whole log is listed.
	const openHand = (handId: string) =>
		navigate({ tab: 'review', review: { ...DEFAULT_REVIEW, show: 'all', hand: handId } });

	const picker = createFilePicker(analyse);

	const session = () => {
		const loaded = report();
		return loaded ?
				{
					hero: loaded.hero,
					stakes: loaded.stakes,
					hands: loaded.handCount,
					fileName: fileName(),
				}
			:	null;
	};

	// Review with a report is one window high: see "Review fits the window".
	const fitted = () => tab() === 'review' && report() !== null;

	return (
		<div class="app-shell" classList={{ 'app-shell--fitted': fitted() }}>
			<AppHeader
				tab={tab()}
				onTabChange={setTab}
				session={session()}
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
						<RangesView />
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
									<SummaryView report={loaded} />
								</Match>
								<Match when={tab() === 'review'}>
									<ReviewView
										report={loaded}
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
					<Match when={!report()}>
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
