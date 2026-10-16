/**
 * The viewer's solver settings, the betting tree and the target dEV, as signals
 * kept in localStorage: the caption names the tree before anything is solved,
 * and the panel edits it.
 */

import { createSignal, type Accessor } from 'solid-js';

import {
	loadSolveTarget,
	loadTreePreference,
	saveSolveTarget,
	saveTreePreference,
	type TreePreference,
} from '#utils/app/storage';
import { targetProblem } from '#utils/solver/target';

export interface SolveSettings {
	preference: Accessor<TreePreference>;
	/** Percent of the pot; may be out of range while it is being typed. */
	targetPct: Accessor<number>;
	setPreference: (next: TreePreference) => void;
	setTargetPct: (pct: number) => void;
}

const PRESET_NAMES: Record<TreePreference['preset'], string> = {
	simple: 'Simple',
	standard: 'Standard',
	detailed: 'Detailed',
	custom: 'Custom',
};

export const presetName = (preset: TreePreference['preset']): string =>
	PRESET_NAMES[preset];

export function createSolveSettings(): SolveSettings {
	const [preference, setPreference] = createSignal<TreePreference>(loadTreePreference());
	const [targetPct, setTargetPct] = createSignal(loadSolveTarget());
	return {
		preference,
		targetPct,
		setPreference: (next) => {
			setPreference(next);
			saveTreePreference(next);
		},
		setTargetPct: (pct) => {
			setTargetPct(pct);
			if (!targetProblem(pct)) saveSolveTarget(pct);
		},
	};
}
