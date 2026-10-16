/**
 * The boundary between the TypeScript engine and the Rust solver (`solver/`,
 * built to `wasm/st` and `wasm/mt`). Both sides hold to these shapes; JSON crosses
 * it as strings. See docs/solver.md.
 *
 * Cards are qpoker's ids (`rank * 4 + suit`, suits `cdhs`), which are the
 * solver's too. A pair of cards `c1 < c2` is the solver's pair index
 * `c1 * (101 - c1) / 2 + c2 - 1`, 0..1325; `cards.ts` maps it to `COMBOS`.
 * Money is integer cents.
 */

/** One action on the line from the street's start, as taken. */
export interface WasmAction {
	kind: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';
	/** For bet, raise and allin: the actor's total put in on this street after it. */
	to?: number;
}

export interface WasmStreetSizes {
	/** Bet sizes in postflop-solver's syntax, e.g. `33%, 75%, a`. */
	bet: string;
	/** Raise sizes, e.g. `2.5x, a`. */
	raise: string;
}

export interface WasmInput {
	/** 3, 4 or 5 cards: the root is the start of that street. */
	board: number[];
	/** 1326 weights in the solver's pair order, 0..1, dead combos zero. */
	oopRange: number[];
	ipRange: number[];
	/** The pot at the street's start, cents. */
	pot: number;
	/** Effective stack behind at the street's start, cents. */
	stack: number;
	/** 0..1, and the cap in cents (0 for none). */
	rakeRate: number;
	rakeCap: number;
	/** Per street from the root's: flop, turn, river. Unused streets may be omitted. */
	flop?: WasmStreetSizes;
	turn?: WasmStreetSizes;
	river?: WasmStreetSizes;
	/** Raises allowed per street after the first bet (postflop-solver has none; enforced by the tree). */
	raiseCap: number;
	/** Go all-in instead of a bet leaving less than this share of the pot behind. */
	allInThreshold: number;
	/** Add an all-in to every node. */
	addAllIn: boolean;
	/** The street's actual actions up to the hero's decision; added to the tree (`add_line`). */
	prefix: WasmAction[];
}

export interface WasmEstimate {
	/** Bytes the solve would take, 32-bit and with 16-bit compression. */
	bytes: number;
	bytesCompressed: number;
	/** Nodes in the action tree, a proxy for time. */
	nodes: number;
}

export interface WasmQuery {
	/** Who acts at the node the prefix leads to: 0 OOP, 1 IP. */
	player: 0 | 1;
	actions: WasmAction[];
	/** Pot at the node, cents. */
	pot: number;
	/**
	 * actions.length × 1326, action-major, solver pair order; zero outside the range.
	 * A hand in the range but not reached here still has its strategy, EV and equity.
	 */
	strategy: number[];
	/**
	 * actions.length × 1326 EV in cents, from the acting player's side at this node:
	 * what they win from the pot at the end less what they put in from this node on,
	 * after rake. Folding is 0.
	 */
	ev: number[];
	/** 1326 equity 0..1 of the acting player's hands against the opponent's range here. */
	equity: number[];
	/**
	 * 1326 reach weights of the acting player's hands at this node, times the
	 * opponent's combos compatible with each: a count, not 0..1. Zero if unreached.
	 */
	weights: number[];
}

/** The WASM answers at once; the CLI's native process (`cli/solverNative.ts`) later. */
type Answer<T> = T | Promise<T>;

/** What both builds export (the threaded one adds `initThreadPool`). */
export interface SolverHandle {
	/** Bytes and nodes before anything is allocated. */
	estimate(): Answer<string>;
	/** Allocates the game; `compressed` for 16-bit storage. */
	allocate(compressed: boolean): Answer<void>;
	/** Runs `n` DCFR iterations; returns the exploitability in cents. */
	step(n: number): Answer<number>;
	/** Finalises and walks the prefix; returns a `WasmQuery` as JSON. */
	query(): Answer<string>;
	free(): void;
}

export interface SolverModule {
	/** Throws or rejects (a string or Error) on a tree it can't build or an illegal prefix. */
	createSolver(inputJson: string): Answer<SolverHandle>;
}
