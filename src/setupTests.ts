// Setup file for tests
import { afterEach } from 'vitest';
import { cleanup } from '@solidjs/testing-library';

import {
	handleAnalysisMessage,
	type AnalysisWorkerMessage,
} from '#utils/analysisWorkerProtocol';

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

// jsdom has no Worker implementation. The analysis is offloaded to a real Worker
// in the browser, so this stub runs the same protocol in-process instead of on
// a thread: its own chunked loop, emitting the progress/complete sequence the
// real worker would.
class WorkerStub {
	onmessage: ((event: MessageEvent) => void) | null = null;
	onerror: ((event: ErrorEvent) => void) | null = null;
	private readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>();

	private emit(data: unknown) {
		const event = new MessageEvent('message', { data });
		this.onmessage?.(event);
		for (const listener of this.listeners.get('message') ?? []) listener(event);
	}

	postMessage(data: AnalysisWorkerMessage) {
		handleAnalysisMessage(data, (response) => this.emit(response));
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
// @ts-expect-error -- test stub, not a full DOM Worker implementation
globalThis.Worker ??= WorkerStub;

// Cleanup after each test
afterEach(() => {
	cleanup();
	localStorage.clear();
});
