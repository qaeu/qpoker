# The Train drills

How `src/utils/train/` asks and grades a drill. Train is practice on purpose, beside the
grading of real hands: it reads no stored hand, never enters a grade, and works with an
empty library, so `REPORT_VERSION` and `FACTS_VERSION` do not move for it. Its answers
come from the same engine the coach grades with, so a drill should not disagree with
Review about a spot both of them see.

## Runs and modes

| Mode | Questions | Feedback          | Clock                          |
| ---- | --------- | ----------------- | ------------------------------ |
| Easy | 10        | after each answer | none                           |
| Hard | 20        | after each answer | none                           |
| Test | 40        | at the end only   | per question (`TEST_LIMIT_MS`) |

A Test question unanswered when its clock runs out is a miss (a `null` response). The
limit is 5 s for preflop and c-bet sizing, which is a lookup, and 10 s for pot odds and
equity, which take arithmetic.

`questionAt(drill, mode, seed, index)` is pure. Each question has its own `mulberry32`
stream, mixed from the run's seed, the drill and the index, so a run is dealt again from
its seed, and a question can be dealt when it is reached rather than the whole run up
front. Hard and Test draw from the same pool, and so deal the same questions from the
same seed.

## Preflop charts

A seat, a spot, a depth and a hand: raise, call or fold, or check or raise where nothing
is to be called (the big blind behind limpers).

- **The pool** is every class of every table the Ranges view shows (`RANGE_TABLES`), its
  strategy from `tableStrategy`, weighted by its combos (6, 4 or 12), and dealt as concrete
  cards. Easy takes the first-in and vs-open tables at 100bb only. Hard and Test take every
  table, and 50bb where the table has ranges of its own (`hasOwnTable`).
- **Easy drops the trivial hands**: a pure fold whose eight neighbours in the grid all
  play the same way (a fold far outside the range), and a premium (`isPremium`) played one
  way. What is left is the range and its edge.
- **Hard leans to the edge.** A mixed hand counts four times its combos, a hand beside a
  neighbour that plays differently three times, and one deep inside or outside a quarter.
- **No hand twice running.** As in qbcalc, a hand already dealt in the run is damped by a
  factor of 3 for each time it was, and the hand just dealt is never dealt next. Building
  the run to an index is cheap, so `questionAt` does it, cached per seed.

**Right is any action the chart plays at least `MIX_FLOOR` (20%) of the time.** That is
the coach's own rule: a hand played that often is never called a mistake in Review (see
"Mixed hands" in [coach-model.md](./coach-model.md)), so a drill that wanted the most
frequent action alone would mark wrong what Review calls fine. It also suits what the
charts are: hand-written approximations that round a solver's mixes to 0, 0.3, 0.5 or 1
([preflop-model.md](./preflop-model.md)), so at the edge the split is an opinion. A free
spot folds nothing: its call and fold frequencies are the check's.

## Pot odds

Heads up on the turn or river, facing a bet: call or fold?

- **The ranges.** One of six chart lines (BTN, CO, UTG or SB opening into the big blind,
  CO into the button, HJ into the cutoff); the hero is the caller. The opener bets half
  the pot on every earlier street and is called, or on the river may have bet the flop
  and checked the turn through. Each action reweights both ranges with `applyAction`,
  exactly as `villainRange.ts` does for a real hand, and the opener's range is narrowed
  once more by the bet faced. The hero's hand is drawn from the hero's narrowed range.
- **The flop pot** is a 2.5bb open and its call, plus the blinds left behind: 5bb for SB
  against BB, 5.5bb against the BB from elsewhere, and 6.5bb when neither blind is in.
  The c-bet drill uses the same pot.
- **The sizes** are 33, 50, 75, 100 and 150% of the pot; 100bb stacks, so no call is all-in.
- **The price** is `priceCall` in `postflop/decision.ts`, the function `judgePostflop`
  prices every real call with: equity against the betting range, discounted for position
  with cards to come (`realisation`), a strong draw's implied odds, and **no rake**. The
  drill is about the price, and a rake that depends on stakes and caps would make the
  same spot right at one table and wrong at another. Right is `callEv > 0`.
- **A toss-up is never asked.** A spot with `|callEv|` under the 7% band is redrawn: the
  coach never reports a difference that small, and nobody can be expected to know its
  sign. With the band set on the pot the call plays for, that excludes equity within
  about 7 points of the price.
- **Hard keeps it close**: within 8 points of the pot past the band, so 7 to 15 points of
  realised equity from the price. A window 8 points either side of the price, as first
  planned, would sit almost wholly inside the band. Of 400 Hard questions measured (20
  seeds) none fell back to a spot outside the window.

The verdict prints the pot odds, the showdown equity and what the call is worth. The
equity is the model's estimate against a balanced range, not against a real opponent;
every caveat in [postflop-model.md](./postflop-model.md) applies to it.

## Equity

A hand, a board (flop, turn or river) and a range to beat: what is the hand's equity?

- The lines are the pot-odds ones, the hero on either side, facing the other's preflop
  range (opening or calling). On Hard and Test half the ranges are also narrowed by a bet
  of 33, 50 or 66% on the board shown.
- The answer is `equityVsRange` with a fixed seed. The turn and river are enumerated.
  **The flop samples 500 runouts**, which keeps a question well under 150 ms: against
  enumeration on five spots and 40 seeds that is 0.96 points off on average (standard
  deviation) and 3.1 at worst. The figure shown is that estimate, rounded to a whole
  percent, and it is the figure graded.
- **Easy** picks one of five 20-point bands; a figure on an edge (40%) is right in both
  bands that meet there. **Hard and Test** type a number, right within **5 points** of the
  figure shown. Five points is a fair read for a person at the table, and wide enough
  that the flop's sampling error rarely decides an answer.

## C-bet sizing

A flop as the preflop raiser, in a single-raised pot: bet 33, 50 or 66%?

- The answer is `textureOf(board).betSize`: a third of the pot on a dry board (paired, or
  rainbow and unconnected), two-thirds on a wet one, half between. The verdict quotes the
  texture's label.
- Each size is asked equally often. Hard deals four flops of the size wanted and keeps the
  one with most neighbours (one suit changed) that the rule sizes differently, so its
  boards sit near a boundary.
- **This is the model's rule, not a solve.** Solvers bet most flops at several sizes, and
  `postflop-model.md` only flags a real bet's size when it is far from this suggestion.
  The drill teaches the rule the coach suggests sizes with, and a different answer is not
  necessarily a mistake at the table. The hero's hand is shown for the scene; the rule is
  for the whole range and does not depend on it.

## Scores

A finished run is a `ScoreEntry`: right answers, total, the summed answer time (the
tie-break), the date (handed in, since the engine reads no clock) and the seed.

- A board is one drill at one mode, top five, more right first as a share of the run,
  then faster. A run that only equals one already on the board ranks beneath it.
- **`boardKey` includes the drill's `DRILL_VERSION`.** Bump it when a drill's answers
  could come out differently (a chart, `priceCall`, the texture rule, a tolerance), and
  its runs start a fresh board rather than be ranked against easier or harder ones. An
  older board is kept in storage but never read.
- Stored boards and the mode chosen per drill live in `localStorage`, versioned, read in
  try/catch (`app/storage.ts`). A malformed record is dropped whole; a drill in progress
  is never stored.
