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
Those ranges are `postflop/villainRange.ts`'s, so their errors are the starting point's.
Since version 9 a check to the aggressor no longer weakens a range ([accuracy.md](./accuracy.md)
finding 1), but every other check still does, and every weight there is an estimate. What the solve removes is the model's heuristic reweighting _within_ the street
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
goes all-in) and an all-in at every node (`addAllIn`) are shared by the streets. Presets
are below. `withActualSizes` adds every size actually bet on the solved line, so the line is a branch of the tree and the hero's action has a row to be
compared with; the played action is matched to the nearest bet in the tree otherwise
(`matchAction`), an all-in to the all-in.

### The presets

|            | Flop bets | Turn bets | River bets     | Raises             |
| ---------- | --------- | --------- | -------------- | ------------------ |
| `simple`   | 50%       | 66%       | 66%            | one a street, 2.5x |
| `standard` | 50%       | 50%, 100% | 33%, 75%, 125% | one a street, 2.5x |
| `detailed` | 33%, 75%  | 50%, 100% | 33%, 75%, 125% | one a street, 2.5x |

Each holds the one before it, and none adds an all-in at every node; a bet leaving under
15% of the pot behind still goes all-in. They are sized so that every one fits a wide flop
in the page's 1500 MB, on the memory ladder below. Measured on twelve flops of the two
sample logs (the solver's own estimate, 16-bit, median and largest):

|            | Per hand       | A bucket a strength | 25 buckets   |
| ---------- | -------------- | ------------------- | ------------ |
| `simple`   | 773, 3788 MB   | 188, 674 MB         | 130, 299 MB  |
| `standard` | 3303, 14452 MB | 788, 2544 MB        | 534, 1075 MB |
| `detailed` | 4703, 20236 MB | 1219, 3361 MB       | 735, 1422 MB |

So `simple` solves every one of these flops with only hands of equal strength grouped;
`standard` and `detailed` solve the median one that way too, and the widest only at the
coarsest rung, with the floor that leaves. A turn needs at most 46 MB on any of them, per
hand. Fitting is not being quick: `detailed` on the widest of these flops (529/582 combos, 9M nodes) took 15 minutes natively on 16 threads, shared
with other work (an upper bound), under a 1500 MB budget, at 25 buckets, and levelled off
at 1.56% of the pot.

What multiplies a flop is the raise cap and the all-in at every node: each multiplies
every betting round of all three streets, and the flop's rounds are repeated for every
turn and river card. The presets used to allow two raises (three in `detailed`) and an
all-in everywhere; `detailed` also had four or five sizes a street. That `standard` was
up to 36 GB per hand on these flops, and 2.1 GB even with the river in 25 buckets: two of
the twelve did not fit the page. `detailed`'s flop tree, on ten of them, had more nodes
than the solver builds (`MAX_NODES`, 16 million: past it the game is refused before its
node arena is allocated, which asked for 27 GB on one and aborted the process).
A custom tree can still have them, for a turn or a river, or for the CLI's native solver
on a machine with the memory.

`validateTree` refuses a nonsense tree before any WASM is touched. `estimateTree` counts
the betting rounds exactly and takes the ranges at a flat 700 combos a side: a warning for
the page, replaced by the solver's own `estimate()` once the tree is built. It is an upper
bound in spirit: the page blocks a run whose smallest estimate (`bytesSmallest`, the last
rung of the ladder below, the river at 25 buckets a player) is over the budget, and the
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
`--dev`. Iterations grow faster as the target falls: a turn on the then `simple` tree (no raises) took 30
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
3. the river's decisions stored per **bucket of hands** of equal strength;
4. the river in at most 50 buckets a player a board;
5. at most 25 (`BUCKET_LADDER` in `solver/buckets.ts`).

Each bucket rung takes 32-bit storage if that fits, else 16-bit.

Past the last rung the solve is refused. A river root stops at rung 2: there is no later
river to bucket, and a river fits anyway. The rung is reported with the result
(`SolveResult.riverBuckets`) and printed under it, in the panel and the CLI; a tree that
fits at rung 2 solves exactly as it would without the ladder. A looser target dEV is not
a rung: it saves time, not memory.

**Why the river, and why buckets.** Every action node stores a strategy and a regret for
each hand and action, and in a flop or turn tree almost all the nodes are on the river (a
turn card and a river card for each line). The ranges stay whole and the flop and turn
are solved per hand as before; only the river's nodes keep a row per bucket instead. This
replaced trimming the ranges (dropping the lightest hand classes), which saved 13 to 35%
by leaving real hands out of the game.

**How the buckets are made** (`init_buckets` in `solver/src/game/base.rs`). On each river
board, each player's hands are sorted by showdown strength. Hands of equal strength always
share a bucket: they tie against every hand and differ only in what they block. When a
board has more strengths than the rung allows, adjacent strengths are merged into buckets
of about equal range weight, never splitting a strength. Buckets by strength are the same
under a suit swap, so postflop-solver's merging of isomorphic runouts still holds.

**How a bucket is solved** (`solve_bucketed` in `solver/src/solver.rs`). Each hand plays
its bucket's strategy. A bucket's regret is CFR's on the abstracted game: the sum of its
hands' counterfactual regrets, each weighted by its weight in the range (the chance of
holding it). Weighting them by the player's own reach as well was tried and does not
converge: that weight moves with the strategy, and the solve stalled at 2% of the pot on
a turn that reaches 0.1% per hand. The showdowns stay per hand, card removal included. The
exploitability is still a best response in the whole game, hand by hand, so the dEV
printed is the bucketed strategy's true distance from an equilibrium. A bucketed river
keeps no per-hand values, so the interpreter refuses to walk into one (the query never
does: the hero's node is on the root's street).

**What it costs.** Measured on eight flops of the two sample logs (`simple` with a 3x raise,
16-bit, native, against the exact solve of each):

|                     | Memory                                            | dEV it levels off at | Hero's EV, from exact        |
| ------------------- | ------------------------------------------------- | -------------------- | ---------------------------- |
| Exact               | 182 to 3542 MB                                    | under 0.5% (target)  | —                            |
| A bucket a strength | 3.6 to 9.2 times less (3542 → 631, 2413 → 263 MB) | 0.63 to 1.00%        | 0.01 to 0.20 bb, median 0.03 |
| 50 buckets          | 0 to 33% less again                               | 0.63 to 1.06%        | about the same               |
| 25 buckets          | 2 to 33% less again                               | 0.64 to 1.42%        | about the same               |

The action the hero's hand should take was the same as the exact solve's in all eight, at
every rung. Mixes between two actions of near-equal EV moved more (0.40/0.60 to 0.51/0.49):
read those as "either", as below. The two large EV differences (0.16 bb on a 122/126
flop, 0.20 bb on the 529/582 one) did not change which action was best, but they are the
size of an error the readout can carry; nothing here says when to expect one.

**A floor above the target.** Merging hands leaves a best response an edge the solve
cannot remove, so a bucketed solve levels off, usually above the 0.5% default. It would
otherwise run the full 1000 iterations for nothing: on one flop it was at 0.82% after 100
iterations and 0.69% after 250. So a bucketed solve also stops once its best dEV has
improved by less than 5% over the last 50 iterations (`levelledOff` in
`solver/target.ts`), and the result says it stopped there (`SolveResult.levelled`). An
iteration costs 10 to 15% more than an exact solve's (the spreading and summing of buckets).

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

The CLI's `solve` runs the same crate as a native process. Two builds are looked for, in
order:

- **This machine's own**, `npm run build:solver:native`, to `solver/target/native`. Not
  checked in: `-C target-cpu=native` uses every instruction the CPU has, so it may not
  run on another.
- **The portable one**, `npm run build:solver:portable`, to
  `solver/bin/<platform>-<arch>` (named as Node names them), and checked in, so the CLI
  has a native solver with no Rust. It targets a baseline CPU (`x86-64-v2` on x86, SSE4.2
  from 2009 on), is stripped and has its paths remapped as the WASM's are. Only
  `linux-x64` is checked in; it needs glibc 2.34 or later. Rebuild it when `solver/`
  changes, as the WASM is.

`solver/src/bin/qpoker-solver.rs` holds one
game a process and speaks a JSON line at a time on stdin and stdout, the same calls as
the WASM handle; `cli/solverNative.ts` spawns it and is a `SolverModule` like the WASM.
`--wasm` forces the WASM.

Why: wasm32 cannot address more than 4 GB, and Node runs the single-threaded build. The
native process has no cap but the machine's memory, uses rayon on every core, and gets
the CPU's full SIMD width. On a 255/254 combo flop (`simple` with no raises, 16-bit, 16 threads) an
iteration took 36 ms natively against 517 ms on the single-threaded WASM, at the same
exploitability. The two engines agree to rounding, and `tests/utils/solver/wasm.test.ts`
checks it; a floating-point library function may differ in its last bit between them,
so a solve is a pure function of its input on one engine.

Tests of the real WASM (`tests/utils/solver/wasm.test.ts`, the CLI's end-to-end cases)
skip until the build is there, and run again on the native process when there is one
(either build above). They include the toy river game: a polar range against
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
single-raised SB-vs-BB flop (557 and 607 combos) with one size a street and no raises:
320k nodes, 1.37 GB, 28 seconds to 0.5% of the pot. The same flop with one raise allowed
is 1.5M nodes and 3.3 GB at 16-bit; with the river in buckets a flop that size fits the
page (the 529/582-combo flop above took 631 MB), at the cost of the floor the buckets
leave, which is how `simple` came to have a raise.

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
