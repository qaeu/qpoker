# CLAUDE.md

qpoker reads a PokerStars hand-history file for No-Limit Hold'em cash games and
coaches the player on their mistakes against a GTO baseline. One pure TypeScript engine
with two front ends: a Node CLI and a static SolidJS + Vite app. No backend. Hands are kept
across logs in a library (IndexedDB in the browser, a directory for the CLI), which is what
trends over time and opponent profiles are read from; in the browser a worker grades and
stores, and the page reads.

Stack: TypeScript (strict), Node 22+, `tsx` (the CLI runs unbuilt), SolidJS, SCSS,
`@ark-ui/solid` (headless), `lucide-solid`, Vitest + `@solidjs/testing-library`, ESLint +
Prettier.

## Layout

```
src/
├── cli/                   # main.ts (args, commands), format.ts + libraryFormat.ts (text),
│                          # fileStore.ts (the library on disk)
├── App.tsx, index.tsx     # Shell and bootstrap (index registers the isolation service worker)
├── components/<view>/     # common, upload, report, review, hand, ranges, train, trends,
│                          # players, library
├── styles/                # _palette, _theme, _base; <view>/ mirrors components/
└── utils/
    ├── history/           # decode -> parse -> replay: text to hands to decision points
    ├── cards/             # cards, 7-card evaluator, combos, equity
    ├── ranges/            # notation, charts/ (the preflop baseline, as data), spot classifier
    ├── postflop/          # opponent-range model, texture, the postflop judgement
    ├── train/             # The drills: drills (seeded questions), grade, run, scores
    ├── coach/             # grade, mistakes, goodPlays, explain, session, openings, report,
    │                      # sessions (sittings, scope), trend
    ├── store/             # The hand library: types (HandStore), ingest, library, players,
    │                      # profile, backup; memoryStore and idbStore
    ├── solver/            # The on-demand solve: spot, tree, cards, result; wasm/ is built
    ├── app/ ui/           # Hash route, detail cache, solve client, rng; display helpers, Review list, table replay
    ├── analysis.worker.ts
    ├── analysisWorkerProtocol.ts   # Worker protocol, shared with the test stub
    ├── solver.worker.ts
    └── solverWorkerProtocol.ts     # Likewise, taking the WASM module as a parameter
solver/                    # The Rust crate (vendored postflop-solver) built to src/utils/solver/wasm,
                           # and to solver/bin/<platform> (the CLI's native solver)
scripts/accuracy/          # The accuracy harness (findings, diff, solverCompare): run with
                           # tsx on local logs, outside the bundle and npm test
tests/                     # Mirrors src/ by folder; tests/integration/ drives <App />
docs/                      # Model and design reasoning (see below)
```

- **One log, one call.** `analyzeLog(text, options)` in `utils/coach/report.ts` is what
  the one-shot CLI calls, and its `AnalysisReport` is plain JSON.
- **Many logs, one library.** `store/ingest.ts` loads a log into a `HandStore`
  (`startIngest` / `advanceIngest`), grading only the hands it lacks; the worker and the
  CLI's `import` both drive it. A stored hand is three tiers: its text (the source of
  truth), a light `HandSummary` and a heavy `HandDetail`. **Everything a report says of
  its hands together is summed from summaries** (`summariseHands`), so the app holds
  summaries only and reads one hand's detail when it is opened.
- **A solver, on demand.** A Solve button on a hero's postflop decision, and the CLI's
  `solve`, run a WASM solver (`solver/`) over the model's ranges for that spot. It is a
  readout and never enters a grade; see [docs/solver.md](./docs/solver.md).
- **Three stores, one contract**: `memoryStore` (tests), `idbStore` (browser),
  `cli/fileStore`. A new one joins `tests/utils/store/stores.test.ts`.
- **Only `src/cli/` may import `node:*`.** Everything under `src/utils/` also runs in the
  browser worker.
- **Subpath imports**: `#c/*` → `src/components/*`, `#styles/*` → `src/styles/*.scss`,
  `#*` → `src/*`. Use them instead of `../../`. In `vitest.config.ts` aliases, list the
  most specific prefix first.
- **The views are Summary, Review, Openings, Trends, Players, Ranges and Train**, addressed by the URL hash
  (`utils/app/hashRoute.ts`). Review keeps its whole state there
  (`#review?show=…&hand=…&step=…`, `step` being where the hand's replay stands): add a
  filter to `ReviewQuery` and the route, not to a signal in the view. Ranges does the
  same with its chart and depth (`#ranges?chart=…&depth=…`, `RangesQuery`). Train is the
  plain `#train`: drills on the model's own ranges, which work with an empty library and
  never enter a grade. Which of the library's hands the views are over is the `scope`, in
  the address on every view but Train.
- Hand-history `.txt` files in the repo root are git-ignored: they carry other players'
  screen names. Tests use `tests/fixtures/` (anonymised) and `tests/utils/history/handText.ts`.

## Commands

`npm run analyze -- <log.txt>` (add `--help`; `import`, `report`, `trend`, `players` and
`library` are the library's commands; `solve <hand id> --step N` runs the solver),
`npm run build:solver` (the WASM, checked in), `npm run build:solver:portable` (the
CLI's native solver for this platform, checked in to `solver/bin/`),
`npm run build:solver:native` (a faster one for this machine only, not checked in), `npm run dev`, `npm test` (or
`npm test -- file.test.ts`), `npm run typecheck`, `npm run lint`, `npm run format`,
`npm run build`. Run lint and format before committing.

## Rules

- Prettier: tabs, single quotes, 90 columns.
- Logic under `src/utils/` stays pure and framework-free, so it can be unit tested.
- Money is integer cents everywhere inside the engine. A hand must reconcile (actions sum
  to the stated pot) or it is not graded.
- The preflop baseline is data (`ranges/charts/data.ts`), never hardcoded in logic.
- Seed every simulation: a report is a pure function of the log text and the seed. In the
  library a hand's grade is a function of its own text, the seed and its stakes' rake, and
  of nothing else that is stored: no grading reads a player's profile or another hand.
- The engine reads no clock: a time it needs (an import's) is handed in.
- Bump `REPORT_VERSION` when a grading could come out differently, and only
  `FACTS_VERSION` when a summed figure does: the first grades every stored hand again,
  the second only sums it up again.
- `Grading.evLostBb` is zero or negative, and zero exactly when no mistake is named. A
  good play's gain is `goodPlay.evGainedBb`, measured against the action not taken.
- The parser never throws on an unknown line: it records a warning on the hand.
- Be honest about confidence. A postflop finding is a model's estimate; do not raise a
  spot's confidence, or the weights in `postflop/villainRange.ts`, without writing the
  reasoning in the doc.
- Add or update tests with every behaviour change, using nested `describe()` sections.
- Put reasoning in the relevant doc below, and keep source comments short.
- Commit messages: one concise sentence that starts with a verb, plus optional short
  bullets.

## Read before working on…

- Any `.ts`/`.tsx`: [docs/code-style.md](./docs/code-style.md)
- Stylesheets: [docs/design-language.md](./docs/design-language.md)
- Tests: [TESTING.md](./TESTING.md)
- `src/utils/history/`: [docs/history-format.md](./docs/history-format.md)
- `src/utils/ranges/`: [docs/preflop-model.md](./docs/preflop-model.md)
- `src/utils/postflop/`: [docs/postflop-model.md](./docs/postflop-model.md)
- `src/utils/coach/`: [docs/coach-model.md](./docs/coach-model.md)
- `src/utils/store/`, `src/cli/fileStore.ts`: [docs/library.md](./docs/library.md)
- `src/utils/train/`: [docs/train-model.md](./docs/train-model.md)
- `src/utils/solver/`, `solver/`: [docs/solver.md](./docs/solver.md)
- Any grade, weight or confidence: [docs/accuracy.md](./docs/accuracy.md)
