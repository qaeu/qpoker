/**
 * Makes the page cross-origin isolated where the host cannot say so, so the
 * solver can use threads. A service worker (`public/coi-sw.js`) adds the
 * headers to the page, which takes one reload the first time. Where the page is
 * already isolated (a dev server, a host with `_headers`), or the browser has no
 * service workers or the page is not a secure context (`file://`), it does
 * nothing and the solver stays on one thread. See docs/solver.md.
 */

export interface IsolationEnvironment {
	crossOriginIsolated: boolean;
	isSecureContext: boolean;
	serviceWorker?: Pick<ServiceWorkerContainer, 'register' | 'controller'>;
	reload: () => void;
	/** Remembers that the one reload was made, so a host that strips headers cannot loop. */
	reloaded: { get: () => boolean; set: () => void };
}

export async function registerIsolation(
	env: IsolationEnvironment,
	script = './coi-sw.js'
): Promise<'isolated' | 'unavailable' | 'reloading' | 'registered'> {
	if (env.crossOriginIsolated) return 'isolated';
	if (!env.isSecureContext || !env.serviceWorker) return 'unavailable';
	try {
		await env.serviceWorker.register(script);
	} catch {
		return 'unavailable';
	}
	// Registered but not yet in control: the next load is served with the headers.
	if (!env.serviceWorker.controller && !env.reloaded.get()) {
		env.reloaded.set();
		env.reload();
		return 'reloading';
	}
	return 'registered';
}

/** The browser's own environment, with the one-reload flag kept in `sessionStorage`. */
export function browserIsolation(): IsolationEnvironment {
	const KEY = 'qpoker:isolationReload';
	return {
		crossOriginIsolated: window.crossOriginIsolated === true,
		isSecureContext: window.isSecureContext,
		serviceWorker: navigator.serviceWorker,
		reload: () => window.location.reload(),
		reloaded: {
			get: () => {
				try {
					return sessionStorage.getItem(KEY) === '1';
				} catch {
					return true;
				}
			},
			set: () => {
				try {
					sessionStorage.setItem(KEY, '1');
				} catch {
					// Without storage there is no telling whether it was done: do not reload.
				}
			},
		},
	};
}
