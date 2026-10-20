/**
 * What is left in `localStorage` now that the hands live in the library
 * (`store/idbStore.ts`): nothing but the last report an older build cached,
 * which is dropped. It held no hand text, so there is nothing to carry over.
 * And small per-viewer preferences: the solver's betting tree, how deep it
 * solves, and the Train view's modes and score boards.
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
import { DRILL_IDS, DRILL_MODES, type DrillId, type DrillMode } from '../train/drills';
import { isScoreBoards, type ScoreBoards } from '../train/scores';

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
		// A named preset is the preset as it is now, not as it was when saved.
		if (preset !== 'custom') {
			return { preset: preset as TreePreset, tree: presetOf(preset as TreePreset) };
		}
		const settings = tree as TreeSettings;
		// A value edited by hand or by an older build may not hold up.
		if (validateTree(settings).length > 0) return defaultTree();
		return { preset, tree: settings };
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

const TRAIN_CONFIG_KEY = 'qpoker:trainConfig';
const TRAIN_CONFIG_SCHEMA = 1;

/** The mode each drill was last played in. */
export interface TrainConfig {
	modes: Readonly<Record<DrillId, DrillMode>>;
}

export const DEFAULT_TRAIN_CONFIG: TrainConfig = {
	modes: Object.fromEntries(DRILL_IDS.map((id) => [id, 'easy'])) as Record<
		DrillId,
		DrillMode
	>,
};

export function loadTrainConfig(): TrainConfig {
	try {
		const stored: unknown = JSON.parse(localStorage.getItem(TRAIN_CONFIG_KEY) ?? 'null');
		if (typeof stored !== 'object' || stored === null) return DEFAULT_TRAIN_CONFIG;
		const { version, modes } = stored as Record<string, unknown>;
		if (version !== TRAIN_CONFIG_SCHEMA || typeof modes !== 'object' || modes === null) {
			return DEFAULT_TRAIN_CONFIG;
		}
		const saved = modes as Record<string, unknown>;
		// A drill missing or unknown keeps its default; the others are kept.
		const read = (id: DrillId): DrillMode => {
			const mode = saved[id];
			return (
					typeof mode === 'string' && (DRILL_MODES as readonly string[]).includes(mode)
				) ?
					(mode as DrillMode)
				:	DEFAULT_TRAIN_CONFIG.modes[id];
		};
		return {
			modes: Object.fromEntries(DRILL_IDS.map((id) => [id, read(id)])) as Record<
				DrillId,
				DrillMode
			>,
		};
	} catch {
		return DEFAULT_TRAIN_CONFIG;
	}
}

export function saveTrainConfig(config: TrainConfig): void {
	try {
		localStorage.setItem(
			TRAIN_CONFIG_KEY,
			JSON.stringify({ version: TRAIN_CONFIG_SCHEMA, modes: config.modes })
		);
	} catch {
		// The choice lasts until the page is closed.
	}
}

const TRAIN_SCORES_KEY = 'qpoker:trainScores';
const TRAIN_SCORES_SCHEMA = 1;

/** The viewer's score boards, keyed by `boardKey`; a key of an older drill is kept but unread. */
export function loadTrainScores(): ScoreBoards {
	try {
		const stored: unknown = JSON.parse(localStorage.getItem(TRAIN_SCORES_KEY) ?? 'null');
		if (typeof stored !== 'object' || stored === null) return {};
		const { version, boards } = stored as Record<string, unknown>;
		if (version !== TRAIN_SCORES_SCHEMA || !isScoreBoards(boards)) return {};
		return boards;
	} catch {
		return {};
	}
}

export function saveTrainScores(boards: ScoreBoards): void {
	try {
		localStorage.setItem(
			TRAIN_SCORES_KEY,
			JSON.stringify({ version: TRAIN_SCORES_SCHEMA, boards })
		);
	} catch {
		// The scores last until the page is closed.
	}
}
