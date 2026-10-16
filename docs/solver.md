# The solver

An on-demand solve of one decision, behind a **Solve** button in Review and the CLI's
`solve` command. It is a readout, like the equity line (`coach/stepEquity.ts`): it never
enters a grade, and touches neither `Grading`, `REPORT_VERSION` nor `FACTS_VERSION`.

## Why it exists when "Why not a solver" says no

[postflop-model.md](./postflop-model.md) and the verdict in [accuracy.md](./accuracy.md)
rule a solver out of _grading_: a solve takes seconds to minutes a spot, and a log has
hundreds of decisions. Solving the one spot a user picks is a different trade: it is paid
once, when it is asked for. What the user gets, for the hero's actual hand at the node:

- the solver's frequency for each action, and each action's EV;
- how far the action played fell short of the best one, as a difference of two EVs of one
  solve and not an estimate with a fixed cost;
- the strategy of the hero's whole range, on the 13x13 grid.

## What the solve cannot fix

It solves the subgame that starts **with the model's ranges at the start of the street**.
Those ranges are `postflop/villainRange.ts`'s, so [accuracy.md](./accuracy.md) finding 1
(checks compound, so a range that checked twice is too weak) still distorts the starting
point. What the solve removes is the model's heuristic reweighting _within_ the street
being solved, and all of the fixed realisation and cost constants of
`postflop/decision.ts`. The panel and the CLI both say this. The solver is the exact
answer to a question asked of estimated inputs.

Ranges are not fed back: the hero's range at the street's start is `rangeAt` for the
hero, with the board removed; the villain's is `rangeAt` with the hero's cards and the
board removed. If the model gave the hero's own hand no weight, it is given 0.01, because
the hero holds it.

## The spot (`solver/spot.ts`)

`solverSpot(replay, stepIndex, tree, rake)` builds the input, or says why not:
`preflop`, `multiway` (not two live players at the street's start), `unreconciled`,
`ungradeable`, `not-hero`, `no-action`, `no-cards`, `all-in`. `solveEligibility` applies
the same rules to the facts a `HandReport` holds, so the page can disable the button
without fetching the hand's text; it also refuses a **flop** where the page has no threads
(`threads`): a flop takes minutes on one thread.

- The root is the **start of the decision's street**, heads-up. Pot and effective stack
  are the street's (`streetPot`, `effectiveStack`), in cents.
- The **prefix** is the street's actual actions up to the decision. The solver walks to
  the real node, so the hero's range there is the equilibrium's, not the model's: a hand
  the equilibrium would never have played that way has weight 0 there. Its strategy, EV
  and equity are still defined, since all three depend only on the opponent's reach, and
  the solver reports them (qpoker's change to upstream, which zeroes them). The result
  marks the hand (`reached: false`) and the panel says the rows are what the solver would
  do had it got there.
- Rake is the hand's stored rate (`HandSummary.rake`), else the grader's default 5%, with
  no cap.
- Position: the first of `live` is out of position.

## The tree (`solver/tree.ts`)

Bet sizes are fractions of the pot; raise sizes are multiples of the bet answered (`2.5x`);
a raise cap, an all-in threshold (a bet leaving less than that share of the pot behind
goes all-in) and an all-in at every node (`addAllIn`) are shared by the streets. Presets:
`simple` (one size a street and no raises), `standard`, `detailed`. `withActualSizes` adds every size actually bet on the
solved line, so the line is a branch of the tree and the hero's action has a row to be
compared with; the played action is matched to the nearest bet in the tree otherwise
(`matchAction`), an all-in to the all-in.

`validateTree` refuses a nonsense tree before any WASM is touched. `estimateTree` counts
the betting rounds exactly and takes the ranges at a flat 700 combos a side: a warning for
the page, replaced by the solver's own `estimate()` once the tree is built. It is an upper
bound in spirit: the page blocks a run whose smallest estimate is over the budget, and the
worker blocks on the exact one.

## The result (`solver/result.ts`)

`SolveResult` holds, for the hero's combo: a frequency and an EV (bb) per action, the
`chosen` and `best` rows, `evGapBb` (zero or negative, null if the tree has no action like
the one played), the hand's equity, `eqr`, whether the equilibrium reaches the hand, and
the range folded into 169 classes as a `Strategy` for `RangeGrid` (aggressive actions are
the raise, call is the call, check or fold is the rest, weighted by reach).

- EVs are the solver's, from the acting player's side at the node: what the hero wins
  from the pot at the end less what they put in from this node on, after rake. Fold is 0.
- `eqr` is the strategy's EV over the EV of calling to the end at the raw equity at this
  price (`equity x (pot + toCall) - toCall`). It is null when that is not positive, where
  the ratio means nothing. It is a readout of how well the hand realises its equity, not
  the textbook EQR of a whole range.
- Exploitability is the solver's own, in percent of the street's starting pot.

## Running it

`solverWorkerProtocol.ts` is the driver, shared by the browser worker
(`solver.worker.ts`), the `Worker` stub tests install (`setupTests.ts` routes by URL; a
test sets `solverStub.load`) and the CLI. It takes the WASM module as a parameter.

A request is one solve: it reads the hand's text, builds the spot, creates the solver,
posts the **estimate** once a rung of the **memory ladder** fits the budget (below), then runs DCFR in chunks of 10 iterations, posting
**progress**, until exploitability is under the **target dEV** or 1000 iterations have
run. A solve is a pure function of the hand, the tree, the rake and the target: full
traversal, no sampling, no clock.

The target dEV (`solver/target.ts`) is the exploitability to stop at, as a percent of the
street's starting pot: how much a best response would win against the strategy found.
It defaults to 0.5%, and may be set from 0.05% to 10%: in the panel's settings (kept in
`localStorage` beside the tree, and part of the result cache's key) or with the CLI's
`--dev`. Iterations grow faster as the target falls: a turn on the `simple` tree took 30
iterations to 2%, 50 to 0.5% and 110 to 0.1%. A shallow solve has the EVs nearly right
sooner than the mixes: between two actions of near-equal EV the split keeps moving well
below 0.5% (54s's two turn bets went from 39/61 at 2% to 0/100 at 0.1%, 0.02 bb apart),
so read a mix between close actions as "either". The iteration cap still stops a solve
that cannot reach its target, and the result shows the dEV reached.

### The memory ladder

The budget is 1500 MB in the page; in the CLI it is three quarters of the machine's
memory on the native solver and 3000 MB on the WASM (`--budget`). The driver
(`fit` in `solverWorkerProtocol.ts`) builds the game and takes the first rung that fits:

1. 32-bit storage;
2. 16-bit storage (postflop-solver's compression: 16-bit integers a node, one float scale);
3. 16-bit, with each range trimmed by 10% of its weight;
4. 16-bit, trimmed by 25% (`TRIM_LADDER` in `solver/trim.ts`).

Past the last rung the solve is refused. A trim is reported with the result
(`SolveResult.trim`, the share and the combos each side lost) and printed under it, in
the panel and the CLI; a tree that fits at rung 2 solves exactly as it would without the
ladder. A looser target dEV is not a rung: it saves time, not memory.

**Why the trim is what it is.** The model's flop ranges are the preflop charts' weights:
across 60 flop spots of a real log, 25.1k of 31.2k combos weigh 1.0 and 4.5k weigh 0.5,
so cutting combos under a small weight (the usual pruning) would remove almost nothing.
Saving memory means leaving out real hands, so the trim is a stated cut, not a free one:

- **Whole classes.** postflop-solver merges suit-isomorphic turns and rivers only when
  both ranges are symmetric under the suit swap; taking single combos could break that
  and cost memory instead of saving it. A class's combos go together.
- **Lightest first.** Classes are taken by mean weight a combo, lowest first: the most
  combos (memory) for the least weight (accuracy).
- **An even spread of strength within a weight.** Among classes of one weight, sorted by
  their combos' hand-strength rank on the board, the taken ones are spread evenly
  (a golden-ratio sequence), so the range keeps its shape rather than losing its air or
  its value. Taking the weakest first would make the range look stronger than the model
  has it.
- **Never the hero's class**, in either range: the hero's own hand must stay in the game.
- It stops at the first class that reaches the share, so a range loses the share plus at
  most one class.

What it buys, measured on eight flops of a real log (`simple` tree with one raise,
16-bit): the 10% rung saved 13 to 19% of the memory, the 25% rung 26 to 35% (a 343/268
combo flop went from 1753 to 1418 to 1211 MB). The memory scales with the combos left,
not the weight, so the light classes going first is why the saving runs ahead of the
share. A trimmed solve is a solve of a slightly different, narrower game: its answer for
the hero's hand is good as far as the classes left out would not have changed the
opponent's strategy, which is why the trim is printed and not hidden.

**Cancelling terminates the worker** (a solver cannot be interrupted mid-iteration) and
the next solve starts a new one. The page (`utils/app/solveClient.ts`) reads the hand
with `store.raw`, keeps the last 20 results by hand, step, rake and tree, and gives one
back without a worker. Whether the panel is open is local to `StepCaption`, not route
state; the tree settings are a per-viewer preference in `localStorage`
(`qpoker:solverTree`, schema version 1, in `utils/app/storage.ts`).

The caption's control is two keys joined. **Solve** runs at once and names the tree it
would run over (`Solve · Standard`), so a solve is never over a tree the viewer has not
seen named; the **sliders** open the settings without solving, so the tree can be set
before the first run rather than only after it. The settings show the memory estimate
against the budget as they are edited, and a tree over it, or with a problem, cannot be
run: pressing Solve then shows the settings with the reason. Once a solve has finished,
the settings and the answer take turns in the panel (Adjust & re-solve, Back to the
result), so the answer stays one press away while a tree is changed.

### The WASM

`solver/` is a Rust crate, a vendored and trimmed copy of
[b-inary/postflop-solver](https://github.com/b-inary/postflop-solver) (AGPL-3.0, like
qpoker; its licence and attribution are kept), with a thin wasm-bindgen face. The
contract is `src/utils/solver/wasmApi.ts`: JSON strings cross it, cards are qpoker's ids,
and `solver/cards.ts` maps `COMBOS` order to the solver's pair index
(`c1 * (101 - c1) / 2 + c2 - 1`). The handle's methods may answer at once (the WASM) or
with a promise (the native process); the driver awaits both. `npm run build:solver` writes a single-threaded build
to `src/utils/solver/wasm/st` and a threaded one (`wasm-bindgen-rayon`, nightly) to
`wasm/mt`; both are checked in, so `npm test` and `npm run dev` need no Rust. The worker
loads `mt` when `self.crossOriginIsolated`, else `st`. Node loads `st` with `initSync`
(`cli/solverNode.ts`), for the tests and for a CLI without the native build.

### The native solver (CLI)

The CLI's `solve` runs the same crate as a native process when it is built
(`npm run build:solver:native`, to `solver/target/native`; not checked in, since it is
the machine's own: `-C target-cpu=native`). `solver/src/bin/qpoker-solver.rs` holds one
game a process and speaks a JSON line at a time on stdin and stdout, the same calls as
the WASM handle; `cli/solverNative.ts` spawns it and is a `SolverModule` like the WASM.
`--wasm` forces the WASM.

Why: wasm32 cannot address more than 4 GB, and Node runs the single-threaded build. The
native process has no cap but the machine's memory, uses rayon on every core, and gets
the CPU's full SIMD width. On a 255/254 combo flop (`simple`, 16-bit, 16 threads) an
iteration took 36 ms natively against 517 ms on the single-threaded WASM, at the same
exploitability. The two engines agree to rounding, and `tests/utils/solver/wasm.test.ts`
checks it; a floating-point library function may differ in its last bit between them,
so a solve is a pure function of its input on one engine.

Tests of the real WASM (`tests/utils/solver/wasm.test.ts`, the CLI's end-to-end cases)
skip until the build is there, and run again on the native process once it is built. They include the toy river game: a polar range against
bluff-catchers must bluff `s / (1 + 2s)` of its bets and be called `1 / (1 + s)`, within
1%.

### Threads and cross-origin isolation

Threads need `SharedArrayBuffer`, so the page must be isolated: COOP `same-origin` and
COEP `require-corp`. `vite.config.ts` sets them on the dev and preview servers and
`public/_headers` for Netlify and Cloudflare. A host that cannot (GitHub Pages) gets them
from `public/coi-sw.js`, a service worker that re-serves same-origin responses with the
headers; `utils/app/isolation.ts` registers it only when the page is a secure context and
not yet isolated, and reloads once so it takes control. From `file://` there is neither
isolation nor a service worker: one thread, and a flop is refused.

`require-corp` blocks cross-origin subresources, so the two fonts are self-hosted under
`public/fonts` (Archivo and Archivo Narrow, Latin, SIL OFL) and the Google Fonts links are
gone. `worker.format` is `es` so a worker can import the WASM glue.

Rough single-thread cost: a river well under a second, a turn and river five to thirty
seconds, a flop minutes. The flop needs threads. Measured in Chromium on 16 threads, a
single-raised SB-vs-BB flop (557 and 607 combos) on the `simple` tree: 320k nodes, 1.37 GB,
28 seconds to 0.5% of the pot. The same flop with one raise allowed is 1.5M nodes and
3.3 GB even at 16-bit: over the page's budget even trimmed, which is why `simple` has no
raises; the native CLI solves it on a machine with the memory.

## CLI

```
npm run analyze -- solve <hand id>                       # lists the decisions that can be solved
npm run analyze -- solve <hand id> --step 14 --preset simple
npm run analyze -- solve <hand id> --step 14 --sizes 33,75/2.5   # this street: bets % / raises x
```

`--step` is an index into the hand's actions. The hand comes from the library. `--dev`,
`--rake`, `--budget`, `--wasm` and `--json` apply.

## Honesty

A solve is a number to two places for a spot that was built from estimates. The panel
prints the tree, the rake and the exploitability it stopped at next to the answer, and
the note that the ranges are the model's. Do not use a solve to raise a finding's
confidence or to tune `villainRange.ts` without writing the reasoning in
[postflop-model.md](./postflop-model.md).
