#!/usr/bin/env node
// Runs the TypeScript CLI through tsx, so the package needs no build step.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const tsx = createRequire(import.meta.url).resolve('tsx/cli');
const main = fileURLToPath(new URL('../src/cli/main.ts', import.meta.url));
const result = spawnSync(process.execPath, [tsx, main, ...process.argv.slice(2)], {
	stdio: 'inherit',
});
process.exit(result.status ?? 1);
