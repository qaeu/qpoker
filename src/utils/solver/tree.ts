/**
 * The betting tree a solve is run over: the sizes each street may bet and
 * raise, and how far raising goes. A bet is a fraction of the pot; a raise is a
 * multiple of the bet it answers. The tree is checked and sized here, before
 * any WASM is loaded, so the page can say what a setting will cost. See
 * docs/solver.md.
 */

import type { Street } from '../history/hand';
import { MIN_BUCKETS } from './buckets';
import type { WasmAction, WasmStreetSizes } from './wasmApi';

export interface StreetSizes {
	/** Fractions of the pot, e.g. `0.75`. */
	bet: number[];
	/** Multiples of the bet raised, e.g. `2.5`. */
	raise: number[];
}

export type SolveStreet = 'flop' | 'turn' | 'river';

export const SOLVE_STREETS: readonly SolveStreet[] = ['flop', 'turn', 'river'];

export interface TreeSettings {
	flop: StreetSizes;
	turn: StreetSizes;
	river: StreetSizes;
	/** Raises allowed on a street after its first bet. */
	raiseCap: number;
	/** A bet leaving less than this share of the pot behind goes all-in instead. */
	allInThreshold: number;
	/** Every node may also go all-in. */
	addAllIn: boolean;
}

export type TreePreset = 'simple' | 'standard' | 'detailed';

/**
 * Each preset holds the one before it, and each fits a wide flop in the page's
 * budget: one raise a street, and no all-in added at every node, since those are
 * what multiply a flop's nodes (docs/solver.md, "The presets").
 */
export const TREE_PRESETS: Record<TreePreset, TreeSettings> = {
	simple: {
		flop: { bet: [0.5], raise: [2.5] },
		turn: { bet: [0.66], raise: [2.5] },
		river: { bet: [0.66], raise: [2.5] },
		raiseCap: 1,
		allInThreshold: 0.15,
		addAllIn: false,
	},
	standard: {
		flop: { bet: [0.5], raise: [2.5] },
		turn: { bet: [0.5, 1], raise: [2.5] },
		river: { bet: [0.33, 0.75, 1.25], raise: [2.5] },
		raiseCap: 1,
		allInThreshold: 0.15,
		addAllIn: false,
	},
	detailed: {
		flop: { bet: [0.33, 0.75], raise: [2.5] },
		turn: { bet: [0.5, 1], raise: [2.5] },
		river: { bet: [0.33, 0.75, 1.25], raise: [2.5] },
		raiseCap: 1,
		allInThreshold: 0.15,
		addAllIn: false,
	},
};

export const DEFAULT_PRESET: TreePreset = 'standard';

export const presetOf = (preset: TreePreset): TreeSettings =>
	structuredClone(TREE_PRESETS[preset]);

/** Sizes a street may have of each kind. */
export const MAX_SIZES = 6;
const MAX_BET = 5;
const MAX_RAISE = 10;
const MAX_RAISE_CAP = 4;

/** The problems with a tree, in words; empty when it can be solved. */
export function validateTree(tree: TreeSettings): string[] {
	const problems: string[] = [];
	for (const street of SOLVE_STREETS) {
		const { bet, raise } = tree[street];
		if (bet.length > MAX_SIZES || raise.length > MAX_SIZES) {
			problems.push(`The ${street} has more than ${MAX_SIZES} sizes of one kind.`);
		}
		if (bet.some((size) => !Number.isFinite(size) || size <= 0 || size > MAX_BET)) {
			problems.push(`A ${street} bet must be 1% to ${MAX_BET * 100}% of the pot.`);
		}
		if (raise.some((size) => !Number.isFinite(size) || size <= 1 || size > MAX_RAISE)) {
			problems.push(`A ${street} raise must be over 1x and at most ${MAX_RAISE}x.`);
		}
		if (bet.length === 0 && !tree.addAllIn) {
			problems.push(`The ${street} has no bet size and no all-in: nobody could bet.`);
		}
	}
	if (
		!Number.isInteger(tree.raiseCap)
		|| tree.raiseCap < 0
		|| tree.raiseCap > MAX_RAISE_CAP
	) {
		problems.push(`Raises per street must be a whole number from 0 to ${MAX_RAISE_CAP}.`);
	}
	if (
		!Number.isFinite(tree.allInThreshold)
		|| tree.allInThreshold < 0
		|| tree.allInThreshold > 1
	) {
		problems.push('The all-in threshold must be between 0% and 100% of the pot.');
	}
	return problems;
}

const unique = (sizes: readonly number[]): number[] =>
	[...new Set(sizes.map((size) => Math.round(size * 1000) / 1000))].sort((a, b) => a - b);

/** Sizes in the solver's syntax: `33%, 75%` and `2.5x`. */
export function wasmSizes(sizes: StreetSizes): WasmStreetSizes {
	const percent = (size: number) => `${Math.round(size * 1000) / 10}%`;
	return {
		bet: unique(sizes.bet).map(percent).join(', '),
		raise: unique(sizes.raise)
			.map((size) => `${size}x`)
			.join(', '),
	};
}

export interface LineAction {
	kind: WasmAction['kind'] | 'fold';
	/** For bets and raises: the actor's total on the street after it. */
	to?: number;
	/** Cents already in front of the actor before it, for a bet or raise. */
	before?: number;
	/** The largest commitment on the street before it. */
	facing?: number;
	/** The pot before it, bets of the street included. */
	pot?: number;
}

/**
 * The tree with every size actually taken on the line added to its street, as
 * a fraction of the pot or a multiple of the bet answered, so the solved
 * line is a branch of it and the played action has a row to be compared with.
 */
export function withActualSizes(
	tree: TreeSettings,
	street: Street,
	line: readonly LineAction[]
): TreeSettings {
	if (street === 'preflop') return tree;
	const next = structuredClone(tree);
	const sizes = next[street];
	for (const action of line) {
		if (action.to === undefined || action.pot === undefined) continue;
		const before = action.before ?? 0;
		const facing = action.facing ?? 0;
		if (action.kind === 'bet' && facing === 0) {
			if (action.pot > 0) sizes.bet.push((action.to - before) / action.pot);
		} else if (action.kind === 'raise' && facing > 0) {
			sizes.raise.push(action.to / facing);
		}
	}
	sizes.bet = unique(sizes.bet).slice(0, MAX_SIZES + 2);
	sizes.raise = unique(sizes.raise).slice(0, MAX_SIZES + 2);
	return next;
}

/** A stable text of the tree, for a cache key. */
export const treeKey = (tree: TreeSettings): string =>
	JSON.stringify([
		...SOLVE_STREETS.map((street) => [
			unique(tree[street].bet),
			unique(tree[street].raise),
		]),
		tree.raiseCap,
		tree.allInThreshold,
		tree.addAllIn,
	]);

export interface TreeEstimate {
	/** Nodes in one street's betting tree, and in all the streets from the root. */
	nodes: number;
	/** Bytes the solve would take, 32-bit and with 16-bit compression. */
	bytes: number;
	bytesCompressed: number;
	/** At the ladder's last rung: 16-bit, the river in `MIN_BUCKETS` buckets a player. */
	bytesSmallest: number;
}

/** Cards that can still come: after a flop, a turn and then a river. */
const DEALS: Record<SolveStreet, number> = { flop: 47, turn: 46, river: 1 };
const AFTER: Record<SolveStreet, SolveStreet | null> = {
	flop: 'turn',
	turn: 'river',
	river: null,
};

/**
 * A rough size of the solve before any WASM: the betting rounds counted
 * exactly, the hands as a flat share of the range. The solver's own estimate
 * replaces it once the tree is built; this is for the page to warn by.
 */
export function estimateTree(
	tree: TreeSettings,
	street: SolveStreet,
	ranges: { oop: number; ip: number }
): TreeEstimate {
	const hands = ranges.oop + ranges.ip;
	/** Nodes of a betting round, and the nodes a call or a check leads on from. */
	const round = (at: SolveStreet) => {
		const { bet, raise } = tree[at];
		const bets = unique(bet).length + (tree.addAllIn ? 1 : 0);
		const raises = unique(raise).length + (tree.addAllIn ? 1 : 0);
		// A node facing a bet: fold, call, and raises while any remain.
		const facing = (left: number): { nodes: number; ends: number } =>
			left <= 0 || raises === 0 ?
				{ nodes: 1, ends: 1 }
			:	(() => {
					const inner = facing(left - 1);
					return {
						nodes: 1 + raises * inner.nodes,
						ends: 1 + raises * inner.ends,
					};
				})();
		const answer = facing(tree.raiseCap);
		// Root checks (then a second node that checks or bets), or bets.
		const afterCheck = 1 + bets * answer.nodes;
		return {
			nodes: 1 + afterCheck + bets * answer.nodes,
			ends: 1 + 2 * bets * answer.ends,
		};
	};

	let nodes = 0;
	let bytes = 0;
	let smallest = 0;
	let reach = 1;
	for (let at: SolveStreet | null = street; at; at = AFTER[at]) {
		const { nodes: inRound, ends } = round(at);
		nodes += reach * inRound;
		// An action's regret and strategy slot per hand: two 4-byte floats.
		bytes += reach * inRound * 3 * hands * 8;
		// A river after the root's street is stored per bucket at the last rung.
		const rows =
			at === 'river' && street !== 'river' ? Math.min(hands, 2 * MIN_BUCKETS) : hands;
		smallest += reach * inRound * 3 * rows * 4;
		const next = AFTER[at];
		reach *= next ? ends * DEALS[at] : 1;
	}
	return {
		nodes: Math.round(nodes),
		bytes,
		bytesCompressed: bytes / 2,
		bytesSmallest: smallest,
	};
}
