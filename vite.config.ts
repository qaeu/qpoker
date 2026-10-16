import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

// Cross-origin isolation, which the solver's threads need (SharedArrayBuffer).
// Hosts that cannot set headers get the same from `public/coi-sw.js`: see docs/solver.md.
const isolation = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
	plugins: [solidPlugin()],
	server: {
		port: 3000,
		headers: isolation,
	},
	preview: {
		headers: isolation,
	},
	// ES workers, so a worker can import the solver's WASM glue (code-split).
	worker: {
		format: 'es',
	},
	build: {
		target: 'esnext',
	},
	// Relative, so the built app runs from any path or straight off the disk.
	base: './',
});
