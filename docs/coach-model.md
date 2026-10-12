# The coach

How `src/utils/coach/` turns the baseline into grades, costs and words.

## A grading

`gradeDecision` returns one per decision the hero made: what they chose, what the
baseline recommends, the mistake if there is one, its cost in big blinds, a severity, a
confidence and an explanation.

Two rules hold for every grading and are tested across whole logs:

- `evLostBb` is **zero or negative**. Nothing beats the baseline.
- It is **zero exactly when no mistake is named**. A loss too small to matter is dropped,
  not reported as a mistake that costs nothing.

A good play does not break the first rule. Its figure is `goodPlay.evGainedBb`, what the
choice was worth over the _other action_, not over the baseline; `evLostBb` stays zero.

## Preflop: frequencies into costs

A chart says how often a hand takes each action. It does not say what a deviation costs,
so the cost is modelled.

**Mixed hands.** An action the chart takes at least 20% of the time is never a mistake.
The charts are approximations and a solver mixes at the edges; this keeps the coach from
penalising one side of a coin flip.

**Too tight** (folded a hand that continues). The cost is what the hand was worth in the
pot: the gap on the tier scale between the hand and where the range ends
(`TIER_VALUE_BB`), times the spot's weight. Folding aces first in costs 7.1bb. Folding any
hand in the range's own last tier costs nothing, and that is far more than the worst hand:
67% of the combos the UTG chart always opens, 31% of the button's, and 56% of what the
button always continues with against a 3-bet. Folding 99 or AJo under the gun is graded
"ok". A player who folds too much is mostly not told so; see finding 7 in
[accuracy.md](./accuracy.md).

**Too loose** (played a hand that folds). `0.07bb × steps^1.5 × weight`, where steps is
how many tiers outside the range the hand is, capped at 60% of what the action put in.
One tier out is noise. Seven-deuce under the gun is not. For a call the cap is usually
the cost: 6 of the 9 loose calls in the sample logs were priced at exactly 60% of the
call, which by a rough equity estimate is two to eight times too much.

**Right hand, wrong action** (called where the chart raises, or the reverse).
`max(0.2, 0.12 × weight)` bb: small, because the hand was right to play.

**Weight** is how much bigger than a single-raised pot the spot is: 1 first in, 1.6
against an open, 3 against a 3-bet, 6 against a 4-bet or a 5-bet. A mistake in a bigger
pot costs more.

**Size.** A raise under 70% or over 160% of the standard one is an inaccuracy, unless it
is a shove over a raise at under 70bb, which is standard. Where the standard raise is
itself a shove (past a third of the stack there is nothing left to play), a raise of 60%
of the stack or more is one in effect and is not flagged as too small.

These constants are tuned by eye against known magnitudes (aces first in are worth around
8 to 10bb; opening a hand one notch too wide costs hundredths of a blind). They are not
measurements, and no published figure was found to check them against. Of the 37 preflop
mistakes in the sample logs, 22 were judged right, 12 defensible and 3 wrong, so the
direction can be trusted more than the price. The order is not always right either:
calling 54o in the big blind (1.2bb) is priced above opening 94o under the gun (1.03bb),
and folding KQs under the gun (0.7bb) above folding 99 there (nothing).

## Preflop: stacks going in

When the call is for the player's stack, the grade is computed, not looked up:

`callEv = equity × (pot + call) × (1 − rake) − call`

with equity simulated against the range each all-in opponent's line implies. Either
decision within 5% of the pot of break-even is accepted. This is the most reliable grade
in the tool short of a chart's clear cases, and is marked medium confidence only because
the shoving range is assumed.

## Postflop

See [postflop-model.md](./postflop-model.md). The grade is `judgePostflop`'s verdict.

## Severity

| Severity   | Cost           |
| ---------- | -------------- |
| inaccuracy | 0.15bb or more |
| mistake    | 0.5bb or more  |
| blunder    | 1.5bb or more  |

A low-confidence finding is capped at "mistake". The word blunder is kept for findings
the model can stand behind.

## Good plays

Most right decisions are easy, and listing them would bury the few worth reading. A good
play (`goodPlays.ts`) is a decision that passes three tests:

1. **It was right**: no mistake is named, and the hero took the baseline's action.
2. **The other action would have been named a mistake**, by the same rules that name
   one when it is made: outside the indifference band, and for a postflop call or fold
   with both arguments agreeing (see [postflop-model.md](./postflop-model.md)). What that
   mistake would have cost is what the play gained. Nothing new is estimated, so a good
   play is exactly as trustworthy as the mistake it is the other side of, and carries the
   same confidence.
3. **The hand argued for the other action.** This is what "difficult" means here:

   | Play       | The other action  | Hard when                                               |
   | ---------- | ----------------- | ------------------------------------------------------- |
   | Tough call | folding           | under 45% equity, and not on a flush or open-ended draw |
   | Tough fold | calling, postflop | the hand is in the top half of the hero's own range     |
   | Tough fold | calling a shove   | the hand is a premium: the top three rungs of the tiers |

   A call with 45% or more is roughly a coin flip or better and nobody needs telling to
   make it; a strong draw's call is arithmetic. Preflop the fold is measured on the tier
   ladder because a hero who has not acted yet has no range to stand in.

It is ranked on the mistakes' own scale: **good** from 0.5bb (what would have been a
"mistake"), **great** from 1.5bb (a "blunder"), and a low-confidence finding stays "good",
as it would have stayed a "mistake".

Left out, on purpose:

- **Chart decisions.** A chart says in or out, and the cost of a deviation is modelled
  (see above), so "what folding this 3-bet bluff would have cost" is a tuned constant, not
  an estimate of anything. Only the priced spots can praise: a shove faced preflop, and a
  bet faced postflop.
- **Bets and checks.** A thin value bet is the classic hard, right play, but "thin" means
  the equity when called is near 50%, which is where the calling-range model is least
  reliable and raises are not modelled at all. Tried, it praised a pot-sized river bet
  with ace high. A heads-up bluff is never priced as right or wrong, and a check is
  rarely hard.
- **A total.** Costs avoided do not add up to anything: every decision has another
  action that would have been worse.

On the two sample logs (300 hands, 193 postflop decisions) this names three plays. That is
the intended order of magnitude: a highlight, not a second grade for every decision. All
three were judged right as actions. The numbers are weaker: one "tough" call rests on an
equity the opponent model gets wrong. See [accuracy.md](./accuracy.md).

## Rake

Equity calculations take the rake off what is won. The rate is the log's own: total rake
over total pot, across hands that saw a flop. It can be overridden.

## Session frequencies

`summariseSession` counts the usual statistics. What is unusual is the baseline.

For the preflop ones (VPIP, PFR, raise first in, 3-bet, fold to 3-bet, big blind
defence) the baseline is **what the charts would have done in the hero's own spots**: at
each decision, the chart's frequency for that action averaged over the range the hero
could hold there. A player dealt the button twenty times has a higher baseline VPIP than
one dealt under the gun twenty times, which a fixed "24% is normal" cannot say.

For the postflop ones (c-bet, fold to c-bet, showdowns) there is no chart, and the
baseline is a typical figure for a balanced player. The report marks these with an
asterisk.

The typical figure depends on how many players were dealt in, since fewer players means
wider ranges, more pots taken down with a bet and more showdowns reached:

| Stat               | 2    | 3–4  | 5–6  | 7–9  |
| ------------------ | ---- | ---- | ---- | ---- |
| Flop c-bet         | 0.66 | 0.63 | 0.60 | 0.57 |
| Fold to flop c-bet | 0.40 | 0.43 | 0.45 | 0.48 |
| Went to showdown   | 0.32 | 0.30 | 0.28 | 0.26 |
| Won at showdown    | 0.52 | 0.52 | 0.52 | 0.52 |

A session's baseline is these **weighted by the table sizes the stat's own opportunities
came at**, so a c-bet baseline is made of the hands where there was a c-bet to make. A
stat that never came up takes the mix of all hands dealt. There is one set of statistics,
not one per table size: a hundred hands split four ways would say nothing. `tableSizes`
lists the mix, and both front ends print it under the table. The figures are rules of
thumb; see [accuracy.md](./accuracy.md).

**A leak is called only when the sample can bear it**: at least ten opportunities, and a
gap of more than eight points and more than two standard errors of a sample that size.
Three opens out of three says nothing; twenty out of twenty does. Even so, a hundred
hands is a small sample, and the session table is a prompt to look, not a diagnosis.

## Opening ranges

`summariseOpenings` sets the hero's first-in play beside the opening charts, seat by seat:
every hand they held when the action folded to them, and whether they raised, limped or
folded it.

The session table's "raise first in" baseline averages the chart over every hand the hero
could have held. Here the cards are known, so the baseline is sharper: **the opens the
chart would have made with the very hands that were dealt** (the sum of its raise
frequencies over them). A run of good cards raises the baseline with the opens, and does
not read as playing too loose.

- **A deviation** is a hand played a way the chart takes less than 20% of the time, the
  same floor as "Mixed hands" above: an open the chart folds, a fold the chart opens, and
  any limp, since no opening chart limps.
- **A seat is flagged** too wide or too tight by the session's rule: ten spots, and a gap
  of more than eight points and two standard errors. Knowing the cards removes the luck
  of the deal but not the smallness of the sample, so the bar is not lowered.
- **Spots under 30bb are left out** and counted. There are no short-stack charts (see
  [preflop-model.md](./preflop-model.md)), and a 20bb stack measured against a 100bb
  opening range would be a wrong answer rather than a low-confidence one.
- **Seats earlier than any chart are left out** and counted (`earlySeats`), for the same
  reason: at seven to nine players UTG's chart only stands in for the seats before the
  lojack, and a row measured against a stand-in would flag a correct, tighter range as
  too tight. The lojack has its own row, on UTG's chart, which is its chart.
- **The big blind has no row.** It is only "first in" over a posted blind that checked,
  which is not an opening spot.

It reads the same classifier and charts as the grader, so a hand listed here as outside
the chart is the hand the mistakes list calls "Opened too loose", unless its cost was too
small to report.

## The report

`mistakes` is every decision with a mistake, costliest first; `goodPlays` every decision
with a good play, most valuable first. No decision is in both, though a hand can be.

`analyzeLog` returns an `AnalysisReport`: plain JSON, the one shape the CLI prints, the
worker posts and the UI renders. It is a pure function of the log text and the seed, and
is versioned (`REPORT_VERSION`) so a cached report from an older build is dropped rather
than rendered wrong. Bump the version when its shape changes.

### What a hand carries for the equity readout

`HandReport.equity` holds the hero's equity at each step: `deals` by street, for the
state as that street's cards came, and `actions` by `ActionLine.stepIndex`, for the state
after that action. A step with no figure has no entry, and a hand that was not graded
has none at all. How the figure is defined is in
[postflop-model.md](./postflop-model.md), "The equity readout". The CLI does not print
it: a figure per step is a thing to scrub through, not to read down.

### What a hand carries for the replay table

The browser keeps the report and nothing else, so a `HandReport` has to be enough to put
the hand back on a table (`utils/ui/tableReplay.ts`). It carries the raw facts, in integer
cents like the rest of the engine, and the view derives every table state from them:

- `bigBlind`, and `seats`: who was dealt in, in preflop acting order (which is clockwise),
  each with its position, its starting stack and whether it is the hero.
- On each `ActionLine`, the action as data (`player`, `kind`, `amount`, `to`, `allIn`)
  beside the `text` the CLI prints.
- `returned`, the uncalled bets handed back, and `paid`, what each player took: a cash-out
  where there was one, else the pot's credit, as `replayHand` settles `net`.

Facts rather than a snapshot per step, because a snapshot of six seats for each of twenty
actions in each of a few hundred hands would multiply what goes into `localStorage`. The
price is a second walk through the hand, outside the engine; it is held to the engine's by
test (the pot and the amount to call at every action, and every final stack).
