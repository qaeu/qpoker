import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { formatSolve } from '../../src/cli/format';
import { nativeSolverBuilt } from '../../src/cli/solverNative';
import { solverBuilt } from '../../src/cli/solverNode';
import { presetOf } from '#utils/solver/tree';
import { handleSolverMessage } from '#utils/solverWorkerProtocol';
import type { SolveResult } from '#utils/solver/result';

import { handText, RIVER_HERO_CALL } from '../utils/history/handText';
import { createFakeSolver } from '../utils/solver/fakeSolver';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let directory = '';
const run = (...args: string[]) =>
	spawnSync(
		'npx',
		['tsx', 'src/cli/main.ts', ...args, '--library', join(directory, 'lib')],
		{
			cwd: ROOT,
			encoding: 'utf8',
			timeout: 120_000,
		}
	);

beforeAll(() => {
	directory = mkdtempSync(join(tmpdir(), 'qpoker-solve-'));
	writeFileSync(join(directory, 'river.txt'), handText(RIVER_HERO_CALL));
	const imported = run('import', join(directory, 'river.txt'));
	if (imported.status !== 0) throw new Error(imported.stderr);
}, 120_000);

afterAll(() => rmSync(directory, { recursive: true, force: true }));

function fakeResult(): Promise<SolveResult> {
	return new Promise((resolve, reject) => {
		handleSolverMessage(
			{
				type: 'solve',
				requestId: 1,
				raw: handText(RIVER_HERO_CALL),
				stepIndex: 14,
				tree: presetOf('standard'),
				rake: 0.04,
				budgetMb: 1500,
			},
			(response) => {
				if (response.type === 'complete') resolve(response.result);
				if (response.type === 'error') reject(new Error(response.message));
			},
			async () => createFakeSolver()
		);
	});
}

describe('qpoker solve', () => {
	describe('the printout', () => {
		it('sets out the actions, the gap and the run, and says what it assumed', async () => {
			const text = formatSolve(await fakeResult(), {
				color: false,
				handId: '7001',
				hero: 'hero',
			});
			expect(text).toMatch(/Hand #7001 · hero with 54s · river/);
			expect(text).toMatch(/Fold\s+30%\s+\+?0\.00/);
			expect(text).toMatch(/Call\s+35%.*played/);
			expect(text).toMatch(/Raise to .*best/);
			expect(text).toMatch(/gives up 5\.00 bb against the best action/);
			expect(text).toMatch(/modelled ranges/);
		});
	});

	describe('a hand the equilibrium never plays here', () => {
		it('says the hand is unreached, and still sets out its rows', async () => {
			const result = { ...(await fakeResult()), reached: false };
			const text = formatSolve(result, { color: false, handId: '7001', hero: 'hero' });
			expect(text).toMatch(/never plays 54s to this node/);
			expect(text).toMatch(/Action\s+Freq/);
			expect(text).toMatch(/Equity/);
		});
	});

	describe('the command', () => {
		it('lists the decisions that can be solved when given no step', () => {
			const out = run('solve', '7001');
			expect(out.status).toBe(1);
			expect(out.stderr).toMatch(/--step 12\s+river: check/);
			expect(out.stderr).toMatch(/--step 14\s+river: call/);
			expect(out.stderr).not.toMatch(/--step 13/);
		}, 60_000);

		it('refuses a step that is not the hero’s', () => {
			const out = run('solve', '7001', '--step', '13');
			expect(out.status).toBe(1);
			expect(out.stderr).toMatch(/hero/);
		}, 60_000);

		it('refuses a hand it does not hold', () => {
			const out = run('solve', '9999', '--step', '14');
			expect(out.status).toBe(1);
			expect(out.stderr).toMatch(/No hand #9999/);
		}, 60_000);

		it('refuses a bad tree', () => {
			const out = run('solve', '7001', '--step', '14', '--sizes', '0/2');
			expect(out.status).toBe(2);
			expect(out.stderr).toMatch(/river bet/);
		}, 60_000);

		it.skipIf(solverBuilt())(
			'says the solver is not built when it is not',
			() => {
				const out = run('solve', '7001', '--step', '14');
				expect(out.status).toBe(1);
				expect(out.stderr).toMatch(/build:solver/);
			},
			60_000
		);

		describe.skipIf(!solverBuilt())('with the solver built', () => {
			it('solves a river check end to end', () => {
				const out = run(
					'solve',
					'7001',
					'--step',
					'12',
					'--preset',
					'simple',
					'--no-color'
				);
				expect(out.stderr).toBe('');
				expect(out.status).toBe(0);
				expect(out.stdout).toMatch(/hero with 54s · river/);
				expect(out.stdout).toMatch(/Check/);
				expect(out.stdout).toMatch(/Check.*played/);
				expect(out.stdout).toMatch(/exploitable by/);
			}, 120_000);

			it('solves deeper with a lower --dev', () => {
				const iterations = (dev: string) => {
					const out = run('solve', '7001', '--step', '12', '--dev', dev, '--json');
					expect(out.status).toBe(0);
					const result = JSON.parse(out.stdout) as {
						iterations: number;
						exploitabilityPct: number;
					};
					expect(result.exploitabilityPct).toBeLessThanOrEqual(Number(dev));
					return result.iterations;
				};
				expect(iterations('0.1')).toBeGreaterThan(iterations('2'));
			}, 120_000);

			it('solves on the WASM with --wasm, and points to the native build when over budget', () => {
				const solved = run('solve', '7001', '--step', '12', '--wasm', '--json');
				expect(solved.status).toBe(0);
				const tiny = run('solve', '7001', '--step', '12', '--wasm', '--budget', '0.001');
				expect(tiny.status).toBe(1);
				expect(tiny.stderr).toMatch(/trimmed by 25%/);
				expect(tiny.stderr).toMatch(/build:solver:native/);
			}, 120_000);

			it.skipIf(!nativeSolverBuilt())(
				'solves natively when built, as the WASM does',
				() => {
					const solve = (...extra: string[]) => {
						const out = run('solve', '7001', '--step', '12', '--json', ...extra);
						expect(out.status).toBe(0);
						return JSON.parse(out.stdout) as SolveResult;
					};
					const native = solve();
					const wasm = solve('--wasm');
					expect(native.iterations).toBe(wasm.iterations);
					expect(native.evGapBb).toBeCloseTo(wasm.evGapBb!, 2);
				},
				120_000
			);

			it('refuses a --dev out of bounds', () => {
				const out = run('solve', '7001', '--step', '12', '--dev', '50');
				expect(out.status).toBe(1);
				expect(out.stderr).toMatch(/target dEV/);
			}, 60_000);
		});
	});
});
