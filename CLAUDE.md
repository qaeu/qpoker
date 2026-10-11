# CLAUDE.md

pokeranalysis reads a PokerStars hand-history file for No-Limit Hold'em cash games and
coaches the player on their mistakes against a GTO baseline. One pure TypeScript engine
with two front ends: a Node CLI and a static SolidJS + Vite app. No backend; in the browser
the log is graded in a worker and the report lives in `localStorage`.

Stack: TypeScript (strict), Node 22+, `tsx` (the CLI runs unbuilt), SolidJS, SCSS,
`@ark-ui/solid` (headless), `lucide-solid`, Vitest + `@solidjs/testing-library`, ESLint +
Prettier.

## Layout

```
src/
├── cli/                   # main.ts (args, file, stdout) and format.ts (the text report)
├── App.tsx, index.tsx     # Shell and bootstrap
├── components/<view>/     # common, upload, report, review, hand, ranges
├── styles/                # _palette, _theme, _base; <view>/ mirrors components/
└── utils/
    ├── history/           # decode -> parse -> replay: text to hands to decision points
    ├── cards/             # cards, 7-card evaluator, combos, equity
    ├── ranges/            # notation, charts/ (the preflop baseline, as data), spot classifier
    ├── postflop/          # opponent-range model, texture, the postflop judgement
    ├── coach/             # grade, mistakes, goodPlays, explain, session, openings, report
    ├── app/ ui/           # Hash route, storage, rng; display helpers, the Review list
    ├── analysis.worker.ts
    └── analysisWorkerProtocol.ts   # Worker protocol, shared with the test stub
tests/                     # Mirrors src/ by folder; tests/integration/ drives <App />
docs/                      # Model and design reasoning (see below)
```

- **One entry point.** `analyzeLog(text, options)` in `utils/coach/report.ts` is what the
  CLI calls; the worker drives the same run in chunks (`startAnalysis` /
  `advanceAnalysis` / `finishAnalysis`). The `AnalysisReport` it returns is plain JSON and
  is the only thing either front end renders.
- **Only `src/cli/` may import `node:*`.** Everything under `src/utils/` also runs in the
  browser worker.
- **Subpath imports**: `#c/*` → `src/components/*`, `#styles/*` → `src/styles/*.scss`,
  `#*` → `src/*`. Use them instead of `../../`. In `vitest.config.ts` aliases, list the
  most specific prefix first.
- **The views are Summary, Review, Openings and Ranges**, addressed by the URL hash
  (`utils/app/hashRoute.ts`). Review keeps its whole state there
  (`#review?show=…&hand=…&step=…`, `step` being where the hand's replay stands): add a
  filter to `ReviewQuery` and the route, not to a signal in the view.
- Hand-history `.txt` files in the repo root are git-ignored: they carry other players'
  screen names. Tests use `tests/fixtures/` (anonymised) and `tests/utils/history/handText.ts`.

## Commands

`npm run analyze -- <log.txt>` (add `--help`), `npm run dev`, `npm test` (or
`npm test -- file.test.ts`), `npm run typecheck`, `npm run lint`, `npm run format`,
`npm run build`. Run lint and format before committing.

## Rules

- Prettier: tabs, single quotes, 90 columns.
- Logic under `src/utils/` stays pure and framework-free, so it can be unit tested.
- Money is integer cents everywhere inside the engine. A hand must reconcile (actions sum
  to the stated pot) or it is not graded.
- The preflop baseline is data (`ranges/charts/data.ts`), never hardcoded in logic.
- Seed every simulation: a report is a pure function of the log text and the seed.
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
- Any grade, weight or confidence: [docs/accuracy.md](./docs/accuracy.md)
