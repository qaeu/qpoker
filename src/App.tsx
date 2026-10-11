/**
 * The shell: the header, the view the hash route names, and the one piece of
 * state the views share -- the report. The analysis itself runs in a worker
 * that this component owns for as long as it is mounted.
 */

import { createSignal, Match, onCleanup, Show, Switch, type Component } from 'solid-js';

import AppHeader from '#c/common/AppHeader';
import HandsView from '#c/hand/HandsView';
import OpeningsView from '#c/ranges/OpeningsView';
import RangesView from '#c/ranges/RangesView';
import GoodPlaysView from '#c/report/GoodPlaysView';
import MistakesView from '#c/report/MistakesView';
import SummaryView from '#c/report/SummaryView';
import LogDrop, { type Progress } from '#c/upload/LogDrop';
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
	const [report, setReport] = createSignal<AnalysisReport | null>(
		loadReport()?.report ?? null
	);
	const [progress, setProgress] = createSignal<Progress | null>(null);
	const [error, setError] = createSignal<string | null>(null);

	// Created on first use, so a visit that only reads a cached report never
	// pays for a second thread.
	let worker: Worker | undefined;
	let latestRequestId = 0;
	let fileName = '';

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
			saveReport(fileName, response.report);
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
		fileName = name;
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

	const drop = (compact: boolean) => (
		<LogDrop
			onLoad={analyse}
			onCancel={cancel}
			progress={progress()}
			error={error()}
			compact={compact}
		/>
	);

	return (
		<>
			<AppHeader tab={tab()} onTabChange={setTab} />
			<main class="app">
				<Switch>
					<Match when={tab() === 'ranges'}>
						<RangesView />
					</Match>
					<Match when={report()} keyed>
						{(loaded) => (
							<>
								<Switch>
									<Match when={tab() === 'summary'}>
										<SummaryView report={loaded} />
									</Match>
									{/* Until Review has a view of its own, the three it replaces. */}
									<Match when={tab() === 'review' && route().review.show === 'mistakes'}>
										<MistakesView report={loaded} onOpenHand={openHand} />
									</Match>
									<Match when={tab() === 'review' && route().review.show === 'plays'}>
										<GoodPlaysView report={loaded} onOpenHand={openHand} />
									</Match>
									<Match when={tab() === 'review'}>
										<HandsView
											report={loaded}
											selected={route().review.hand}
											onSelect={(hand) => navigate({ review: { hand } })}
										/>
									</Match>
									<Match when={tab() === 'openings'}>
										<OpeningsView report={loaded} onOpenHand={openHand} />
									</Match>
								</Switch>
								{drop(true)}
							</>
						)}
					</Match>
					<Match when={!report()}>{drop(false)}</Match>
				</Switch>
				<Show when={tab() === 'ranges' && !report()}>
					<p class="app__empty">
						Load a hand history from the Summary tab to have it graded against these
						ranges.
					</p>
				</Show>
			</main>
		</>
	);
};

export default App;
