import { describe, expect, it, vi } from 'vitest';

import { registerIsolation, type IsolationEnvironment } from '#utils/app/isolation';

function environment(overrides: Partial<IsolationEnvironment> = {}) {
	let reloaded = false;
	const env: IsolationEnvironment = {
		crossOriginIsolated: false,
		isSecureContext: true,
		serviceWorker: {
			register: vi.fn(async () => ({}) as ServiceWorkerRegistration),
			controller: null,
		},
		reload: vi.fn(),
		reloaded: { get: () => reloaded, set: () => (reloaded = true) },
		...overrides,
	};
	return env;
}

describe('registerIsolation', () => {
	it('does nothing where the page is already isolated', async () => {
		const env = environment({ crossOriginIsolated: true });
		expect(await registerIsolation(env)).toBe('isolated');
		expect(env.serviceWorker!.register).not.toHaveBeenCalled();
	});

	it('does nothing off a secure context or without service workers', async () => {
		expect(await registerIsolation(environment({ isSecureContext: false }))).toBe(
			'unavailable'
		);
		expect(await registerIsolation(environment({ serviceWorker: undefined }))).toBe(
			'unavailable'
		);
	});

	it('registers the worker and reloads once for it to take control', async () => {
		const env = environment();
		expect(await registerIsolation(env)).toBe('reloading');
		expect(env.serviceWorker!.register).toHaveBeenCalledWith('./coi-sw.js');
		expect(env.reload).toHaveBeenCalledOnce();
		// A host that strips the headers again does not make a loop.
		expect(await registerIsolation(env)).toBe('registered');
		expect(env.reload).toHaveBeenCalledOnce();
	});

	it('does not reload when the worker is already in control', async () => {
		const env = environment({
			serviceWorker: {
				register: vi.fn(async () => ({}) as ServiceWorkerRegistration),
				controller: {} as ServiceWorker,
			},
		});
		expect(await registerIsolation(env)).toBe('registered');
		expect(env.reload).not.toHaveBeenCalled();
	});

	it('gives up quietly when registering fails', async () => {
		const env = environment({
			serviceWorker: {
				register: vi.fn(async () => {
					throw new Error('blocked');
				}),
				controller: null,
			},
		});
		expect(await registerIsolation(env)).toBe('unavailable');
		expect(env.reload).not.toHaveBeenCalled();
	});
});
