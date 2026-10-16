/**
 * What is left in `localStorage` now that the hands live in the library
 * (`store/idbStore.ts`): nothing but the last report an older build cached,
 * which is dropped. It held no hand text, so there is nothing to carry over.
 * And two small per-viewer preferences: the solver's betting tree, and how deep
 * it solves.
 */

import {
	DEFAULT_PRESET,
	presetOf,
	TREE_PRESETS,
	validateTree,
	type TreePreset,
	type TreeSettings,
} from '../solver/tree';
import { DEFAULT_TARGET_PCT, targetProblem } from '../solver/target';

const LEGACY_REPORT_KEY = 'qpoker:report';

export function clearLegacyReport(): void {
	try {
		localStorage.removeItem(LEGACY_REPORT_KEY);
	} catch {
		// Nothing to clear if storage is unavailable.
	}
}

const TREE_KEY = 'qpoker:solverTree';
/** Bump it when `TreeSettings` changes shape: an older value is then ignored. */
const TREE_SCHEMA = 1;

export interface TreePreference {
	/** The preset the tree started from, or `custom` once its sizes were edited. */
	preset: TreePreset | 'custom';
	tree: TreeSettings;
}

const defaultTree = (): TreePreference => ({
	preset: DEFAULT_PRESET,
	tree: presetOf(DEFAULT_PRESET),
});

/** The betting tree the viewer last chose for the solver, or the standard one. */
export function loadTreePreference(): TreePreference {
	try {
		const stored: unknown = JSON.parse(localStorage.getItem(TREE_KEY) ?? 'null');
		if (typeof stored !== 'object' || stored === null) return defaultTree();
		const { version, preset, tree } = stored as Record<string, unknown>;
		if (version !== TREE_SCHEMA) return defaultTree();
		if (preset !== 'custom' && !(typeof preset === 'string' && preset in TREE_PRESETS)) {
			return defaultTree();
		}
		const settings = tree as TreeSettings;
		// A value edited by hand or by an older build may not hold up.
		if (validateTree(settings).length > 0) return defaultTree();
		return { preset: preset as TreePreference['preset'], tree: settings };
	} catch {
		return defaultTree();
	}
}

export function saveTreePreference(preference: TreePreference): void {
	try {
		localStorage.setItem(
			TREE_KEY,
			JSON.stringify({ version: TREE_SCHEMA, ...preference })
		);
	} catch {
		// The choice lasts until the page is closed.
	}
}

const TARGET_KEY = 'qpoker:solverTarget';
const TARGET_SCHEMA = 1;

/** The dEV, percent of the pot, the viewer last asked a solve to reach. */
export function loadSolveTarget(): number {
	try {
		const stored: unknown = JSON.parse(localStorage.getItem(TARGET_KEY) ?? 'null');
		if (typeof stored !== 'object' || stored === null) return DEFAULT_TARGET_PCT;
		const { version, pct } = stored as Record<string, unknown>;
		if (version !== TARGET_SCHEMA || typeof pct !== 'number' || targetProblem(pct)) {
			return DEFAULT_TARGET_PCT;
		}
		return pct;
	} catch {
		return DEFAULT_TARGET_PCT;
	}
}

export function saveSolveTarget(pct: number): void {
	try {
		localStorage.setItem(TARGET_KEY, JSON.stringify({ version: TARGET_SCHEMA, pct }));
	} catch {
		// The choice lasts until the page is closed.
	}
}
