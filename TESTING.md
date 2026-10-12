# Testing

Tests use [Vitest](https://vitest.dev/) with
[@solidjs/testing-library](https://github.com/solidjs/solid-testing-library), in jsdom
with global test APIs. Assertions are Vitest's own; there is no jest-dom.

```bash
npm test                  # both projects, once
npm test -- grade.test.ts
npm run test:unit         # one project
npm run test:integration
npm run test:ui           # Vitest UI
npm run test:coverage
```

## Layout

Tests live in `tests/`, mirroring the `src/` folders; the end-to-end tests sit in
`tests/integration/` instead. The mirror is of folders, not filenames: a test is named
for what it covers, so `tests/utils/cards/cards.test.ts` covers cards, the evaluator,
combos and equity, and `tests/utils/ranges/ranges.test.ts` the notation, the charts and
the spot classifier.

## Fixtures

- `tests/fixtures/emailed.txt` — four real hands, anonymised, in the quoted-printable
  form an emailed history arrives in: CRLF line endings, `=20`, soft breaks mid-word,
  newest hand first. It covers a cash-out, a multi-way showdown and a name with a space.
  Imported with `?raw`. **Do not reformat it**: the line endings and the folds are the
  test.
- `tests/utils/history/handText.ts` — writes a hand in the client's plain format, for
  tests that need a particular spot. The caller supplies the action lines and the pot;
  the grader refuses a hand whose pot does not reconcile, so get the arithmetic right
  (`grade()` in `grade.test.ts` asserts it). It also exports whole hands the view tests
  share: a good play (`TOUGH_FOLD`), a postflop blunder (`RIVER_HERO_CALL`), an open
  outside the chart (`BUTTON_TRASH_OPEN`) and a hand that does not reconcile
  (`UNRECONCILED`). The parser orders hands by time and `handText` derives the time from
  the id, so pick ids in the order the hands should be listed.

Real hand histories are git-ignored and never used by a test.

## Projects

`vitest.config.ts` defines two projects, split by what a test drives rather than what it
asserts. Both inherit the plugin, aliases and setup file.

- **unit** — everything outside `tests/integration/`: a utility, the CLI's formatter, or
  a component rendered on its own with the props it is handed.
- **integration** — renders the whole `<App />` over the real worker protocol and the
  real engine, and drives it as a user would: pick a file, read the summary, switch
  tabs, filter the Review list, open a hand. `appHarness.tsx` holds the mount (which
  returns the unmount, for a reload), `loadLog`, `switchTo`, `goTo` for a typed hash and
  `follow` for a link in the page (both wait for the `hashchange` jsdom delivers late),
  `settle` for the tick an Ark control takes, and
  `resetBrowserState`, which a `beforeEach` must call because the URL hash outlives a
  test (it waits for the `hashchange` of clearing it, so the next test's first
  navigation does not hear it). Each case carries `RUN_TIMEOUT_MS`.

## `src/setupTests.ts`

After each test it runs `cleanup()` and clears `localStorage`. It stubs jsdom's missing
`ResizeObserver` and `Element.scrollTo` (both needed by Ark UI), and `Worker`: the stub
runs `analysisWorkerProtocol.ts`'s `handleAnalysisMessage` in-process, with its own
chunked loop across timeouts, so it emits the real worker's `progress` / `complete` /
`cancelled` / `error` sequence.

The protocol can also be tested without a Worker at all, as
`tests/utils/analysisWorkerProtocol.test.ts` does.

## What to assert

- Equity and EV with `toBeCloseTo`, or as a range; always with a fixed seed.
- A grading's direction and kind (`mistake`, `recommended`, the sign of `evLostBb`)
  rather than its exact cost, unless the cost is the point: the costs are estimates and
  the constants behind them are tuned.
- Chart properties that must hold whatever the ranges are tuned to: frequencies sum to
  at most one, later seats open wider, aces are always played.

## Driving the controls

- An Ark control (a tab, a segment) takes a click on the next microtask: `await
Promise.resolve()` (or the harness's `settle`) before asserting what it changed.
- Two Review groups have an "All" key, so ask for a radio within its `radiogroup`.

## CI

`.github/workflows/test.yml` runs `npm test` on pull requests targeting `main`,
`master` or `dev`, and on manual dispatch.
