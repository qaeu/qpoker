// Setup file for tests
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach } from 'vitest';
import { cleanup } from '@solidjs/testing-library';

import {
	handleAnalysisMessage,
	type AnalysisWorkerMessage,
} from '#utils/analysisWorkerProtocol';
import type { SolverModule } from '#utils/solver/wasmApi';
import {
	handleSolverMessage,
	type SolverWorkerMessage,
} from '#utils/solverWorkerProtocol';
import { openIdbStore } from '#utils/store/idbStore';

// jsdom has no ResizeObserver; Ark UI's floating-ui positioning needs one to
// observe anchor/content elements.
class ResizeObserverStub {
	observe() {}
	unobserve() {}
	disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;

// jsdom implements no scrolling, so Element.scrollTo is missing.
Element.prototype.scrollTo ??= () => {};

// jsdom has no Worker implementation. Loading a log is offloaded to a real Worker
// in the browser, so this stub runs the same protocol in-process instead of on
// a thread: its own chunked loop, emitting the progress/complete sequence the
// real worker would, over the same (fake) IndexedDB the page reads. The solver's
// worker is told apart by its URL and runs its protocol over a WASM module a
// test sets in `solverStub.load`.
class WorkerStub {
	onmessage: ((event: MessageEvent) => void) | null = null;
	onerror: ((event: ErrorEvent) => void) | null = null;
	private readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>();

	protected emit(data: unknown) {
		const event = new MessageEvent('message', { data });
		this.onmessage?.(event);
		for (const listener of this.listeners.get('message') ?? []) listener(event);
	}

	private readonly store = openIdbStore();

	postMessage(data: AnalysisWorkerMessage) {
		handleAnalysisMessage(data, (response) => this.emit(response), this.store);
	}

	addEventListener(type: string, listener: (event: MessageEvent) => void) {
		if (!this.listeners.has(type)) this.listeners.set(type, new Set());
		this.listeners.get(type)!.add(listener);
	}

	removeEventListener(type: string, listener: (event: MessageEvent) => void) {
		this.listeners.get(type)?.delete(listener);
	}

	terminate() {}
}

/** The WASM module a stubbed solver worker runs; a test that solves sets it. */
export const solverStub: { load: () => Promise<SolverModule> } = {
	load: () => Promise.reject(new Error('No solver module is set for this test.')),
};

class SolverWorkerStub extends WorkerStub {
	private abandon: (() => void) | null = null;

	// @ts-expect-error -- the solver's messages, not the analysis worker's
	override postMessage(data: SolverWorkerMessage) {
		this.abandon = handleSolverMessage(
			data,
			(response) => this.emit(response),
			() => solverStub.load()
		);
	}

	override terminate() {
		this.abandon?.();
	}
}

// @ts-expect-error -- test stub, not a full DOM Worker implementation
globalThis.Worker ??= class {
	constructor(url: string | URL) {
		return String(url).includes('solver.worker') ?
				new SolverWorkerStub()
			:	new WorkerStub();
	}
};

// Cleanup after each test
afterEach(() => {
	cleanup();
	localStorage.clear();
	// A fresh factory is an empty library: jsdom has no IndexedDB of its own.
	globalThis.indexedDB = new IDBFactory();
});
