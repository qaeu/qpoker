/*
 * Serves the page cross-origin isolated on a host that cannot set headers (GitHub
 * Pages): every same-origin response it passes on gets COOP and COEP, which is
 * what SharedArrayBuffer, and so the solver's threads, needs. Registered by
 * src/utils/app/isolation.ts. See docs/solver.md.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
	const { request } = event;
	// Not ours to answer: another origin's, or a cache probe that cannot be served.
	if (new URL(request.url).origin !== self.location.origin) return;
	if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

	event.respondWith(
		fetch(request).then((response) => {
			if (response.status === 0) return response;
			const headers = new Headers(response.headers);
			headers.set('Cross-Origin-Opener-Policy', 'same-origin');
			headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
			return new Response(response.body, {
				status: response.status,
				statusText: response.statusText,
				headers,
			});
		})
	);
});
