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

**Too tight** (folded a hand that continues). Against a raiser the cost is what calling
was worth: `realised equity × (pot + call) × (1 − rake) − call`, from the equity against
the raiser's range (see "Pricing from equity" below), or nothing when that is not
positive. With no raiser to price against (first in, or over limpers) it is the hand's
value on the tier scale (`TIER_VALUE_BB`) times how far inside the range it sits, times
the spot's weight. "How far inside" is the share of the range's combos, weighted by how
often they continue, that are weaker against a random hand: 0 for the last hand of the
range, 1 for its best. Folding aces first in costs about 7.8bb, 99 under the gun 0.8bb,
AJo 0.4bb, and the suited connectors that end the range nothing. A hand is only a
mistake to fold when the chart folds it less than 20% of the time ("Mixed hands"), and a
loss under 0.15bb is dropped, so margin hands make no noise. This replaced a tier gap
that was zero for every hand in the range's own last tier, and so for most of it; see
finding 7 in [accuracy.md](./accuracy.md).

**Too loose** (played a hand that folds). A loose call against a raiser is priced from
equity, as above: what it loses against the raiser's range, capped at 60% of what the
call put in. A call the equity says is fine is not named. Every other loose play (an
open, a 3-bet) costs `0.07bb × steps^1.5 × weight`, where steps is how many tiers outside
the range the hand is, capped at 60% of what the action put in. One tier out is noise.
Seven-deuce under the gun is not.

**Right hand, wrong action** (called where the chart raises, or the reverse).
`max(0.2, 0.12 × weight)` bb: small, because the hand was right to play.

**Weight** is how much bigger than a single-raised pot the spot is: 1 first in, 1.6
against an open, 3 against a 3-bet, 6 against a 4-bet or a 5-bet. A mistake in a bigger
pot costs more.

**Size.** A raise under 70% or over 160% of the standard one is an inaccuracy, unless it
is a shove over a raise at under 70bb, which is standard. Where the standard raise is
itself a shove (past a third of the stack there is nothing left to play), a raise of 60%
of the stack or more is one in effect and is not flagged as too small.

The tier constants are tuned by eye against known magnitudes (aces first in are worth
around 8 to 10bb; opening a hand one notch too wide costs hundredths of a blind). They are
not measurements, and no published figure was found to check them against. Of the 37
preflop mistakes in the sample logs at version 3, 22 were judged right, 12 defensible and
3 wrong, so the direction can be trusted more than the price. The priced costs below rest
on equity, which is measured, and on a realisation factor, which is not.

## Preflop: pricing from equity

A cold call, a big-blind call, a call of a 3-bet or a 4-bet, and a fold of any of them,
are priced as `priceCall` in `coach/preflopPrice.ts` does it: the hero's equity against
the last raiser's range (`preflopRange`, the chart range their line implies), from 2,000
seeded deals, and then

`callEv = realisation × equity × (pot + call) × (1 − rake) − call`

where `pot` includes the hero's own chips already in, which are sunk. Folding is worth
nothing, so `callEv` is the cost of a loose call when negative and of a fold when
positive. It is about 2ms a spot.

**The realisation factor is an assumption, not a measurement.** Raw equity is more than a
hand gets: the player out of position folds to bets it could have called, and a weak
hand is outplayed. The audit (finding 4) suggested 0.7 to 1.0, lower out of position. The
values used, with the reasoning:

| Situation                                 | Realisation |
| ----------------------------------------- | ----------- |
| In position against the raiser            | 0.95        |
| Out of position (the blinds, or earlier)  | 0.80        |
| A 3-bet or bigger pot, added to the above | +0.10       |
| Each player who has already called        | × 0.9       |

In position a hand loses a little to being bluffed off the pot and gains the last
decision; 0.95 says the two nearly cancel. Out of position it is the audit's lower end.
A 3-bet pot is played at a stack-to-pot ratio under 6 and a 4-bet pot under 2, so there
is less room to be outplayed and the shortfall shrinks. A caller behind makes the pot
multiway, where equity against one range is overstated and each player has less to win
from the rest. Two hands of the same equity do not realise it equally either, a suited
connector more than an offsuit one; no hand-by-hand factor is used.

A change of 0.1 in the factor moves the price by roughly 4% of the pot: 0.3bb in a
single-raised pot and 1bb in a 4-bet pot. That is the uncertainty in these costs, and why
a priced finding is **medium confidence at best**, and a low-confidence spot stays low.

The price takes the raiser alone, so a squeeze behind or a 3-bet from the blinds that
the call exposes the hero to is not counted: a priced call is a little kinder than the
truth for the button and cutoff, which have the blinds behind them. The 60% cap stays as
the upper bound of a loose call's cost. What cannot be priced this way, a raise (a 3-bet
or an open), keeps the tier formula.

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

On the two sample logs (300 hands, 193 postflop decisions) this named three plays. That is
the intended order of magnitude: a highlight, not a second grade for every decision. All
three were judged right as actions. The numbers were weaker: one "tough" call rested on
an equity the opponent model got wrong, and since version 9, which reads a check-raise as
strong, the model finds that call close (22% equity against 21% needed), not a play to
name; two plays are named. See
[accuracy.md](./accuracy.md).

## Rake

Equity calculations take the rake off what is won. The rate is the log's own: total rake
over total pot, across hands that saw a flop, rounded to the nearest half percent. It can
be overridden, and an override is taken as given.

The rounding is there because the rate is the one input to a hand's grade that comes from
the other hands in the log. Unrounded, it moves in the fourth decimal place with every
flop that is added, and every hand priced with it would have to be graded again for a
difference far below what the model can resolve (see "Reusing a report"). Half a percent
of the pot is at most 0.25% of a call's stake.

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

Each row ends with the seat's **result**: the hero's net over the hands of its spots,
whatever came of them after the first decision, so an open that was 3-bet off its hand
counts against the seat. It is a narrower figure than Summary's "By position" result,
which is over every hand dealt in the seat, and the two differ by the hands where someone
entered the pot first. Spots left out of a row are left out of its result. It is summed
from each hand's own `netBb`, which a summary already holds, so no stored hand changes.

It reads the same classifier and charts as the grader, so a hand listed here as outside
the chart is the hand the mistakes list calls "Opened too loose", unless its cost was too
small to report.

## The report

`mistakes` is every decision with a mistake, costliest first; `goodPlays` every decision
with a good play, most valuable first. No decision is in both, though a hand can be.

`analyzeLog` returns an `AnalysisReport`: plain JSON, a pure function of the log text and
the seed, and versioned (`REPORT_VERSION`) so a hand graded by an older build is graded
again rather than rendered wrong. Bump the version when a grading could come out
differently or its shape changes.

A hand's report is two halves, a light `HandSummary` and a heavy `HandDetail`, and
everything the report says of its hands together (`ReportSummary`: the session, the
openings, the leaks, the totals) is summed from the summaries alone by `summariseHands`.
That is what lets the same report be made over any hands the library holds without their
text or their gradings in memory: see [library.md](./library.md). The app renders a
`HandsReport` (the sums and the summaries); `analyzeLog` and the CLI's `report` add the
gradings in full.

### Trends

`trendOf` answers whether the hero is getting better. It reads **what mistakes cost per
hand**, not the win rate: the result of a hundred hands is mostly the cards, and the
graded loss moves far less from one sitting to the next.

- Each sitting gets its hands, its result, and its graded loss per 100 graded hands.
- The graded hands are halved by count, earlier against later, and the mean loss per hand
  compared. The change is called better or worse only when it is more than two standard
  errors of the difference, the errors taken from the hands' own spread. Losses are heavy
  in the tail (most hands lose nothing, a few lose a stack), which is why nothing is said
  under `MIN_TREND_HANDS` (100) graded hands a half.
- A kind of mistake is listed as rarer or more frequent when the share of hands with it
  has moved by more than two standard errors, on the two halves' pooled rate. It is the
  same standard a session frequency is held to in `leakOf`.

It is a comparison of two halves, not a fitted line: with a few hundred hands there is no
more in the data than that. It is also only as good as the gradings: a model error that
overcosts one kind of spot (see [accuracy.md](./accuracy.md)) will show a player who
stops reaching that spot as improving. Stakes are not told apart; a player who moved up
is compared with themselves a level down.

### Reusing a report

A log is loaded again as the session goes on, a few hands longer each time. `startAnalysis`
takes the earlier report as `previous` and the run grades only the hands it does not
answer for. (The app no longer does this itself: it loads logs into the hand library,
which keeps the same rule per stored hand. See [library.md](./library.md).) It changes how long a run takes and
never what it reports: the result equals a run without it, which the tests assert.

A hand's report depends on the hand's own text and on four things from outside it: the
hero, the seed, the sample count and the rake. So an earlier `HandReport` is kept when

- the two reports share a version, hero, seed and `samples`;
- the hand's `digest` is in the new log: a hash of the hand's decoded lines
  (`Hand.digest`), so a hand the file held half-written the first time is graded again;
- its `rake` is the run's rake, or null. `HandReport.rake` is the rate the hand's gradings
  were priced at, and null when none of them read it, which is most hands: a preflop
  grade reads the rake only to price a stack-off. It is recorded by handing the grader a
  rake it reads through a getter, so it cannot fall out of step with the graders.

Hands are matched by digest and not by place in the file, so new hands may land anywhere
among the old, and the file's name does not matter. The session and opening summaries are
summed again from every hand's summary each time; they are cheap.

On the 100-hand sample log, loading the same file again takes about 10ms where a full run
takes 900ms. Hands priced with the rake are a third of the hands and three quarters of the
time, which is why the rate is rounded: see "Rake".

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
