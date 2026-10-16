# The preflop baseline

How `src/utils/ranges/` decides what the baseline does before the flop.

## What the charts are, and are not

`charts/data.ts` holds a raise range and a call range for each preflop spot, in a
shorthand (`22+,A2s+,KTo+,T9s:0.5`). Folding is the rest.

**They are hand-written approximations of published rake-adjusted 6-max solver output
for 2.5bb opens. They are not solver exports.** That has consequences worth stating
plainly:

- The opening ranges are about right in size (UTG opens 17.3% of hands, the hijack 22.1%,
  the cutoff 29.3%, the button 47.2%). Against the published ranges compared in
  [accuracy.md](./accuracy.md), the first three sit inside the band and the button at the
  top of it. The big blind's defence is 8 to 14 points under one reference against the
  early seats and level against the button. None of those references is a rake-adjusted
  solve for small stakes, and they disagree with one another by several points, so "about
  right" is as much as can be said.
- The 2.5bb open is an assumption that often fails: 29% of the opponents' opens in the
  sample logs were 2.0bb. A min-raise is handled by a rule that is not sourced (see
  "Min-raises" below), and 7 of the 37 preflop mistakes found at version 3 were calls or
  3-bets against one.
- At the edge of a range they are an opinion. A solver mixes many borderline hands at
  frequencies these charts round to 0, 0.5 or 1.
- So the grader is forgiving at the edge (see "Mixed hands" in
  [coach-model.md](./coach-model.md)) and its preflop findings are most reliable when a
  hand is well inside or well outside a range.

The file is the only place to change. Replacing its strings with real solver ranges
needs no code change; the tests in `tests/utils/ranges/` check properties any sane set
of ranges has (frequencies sum to at most one, later seats open wider, aces always play)
rather than these particular hands.

## Notation

| Token     | Means                                                  |
| --------- | ------------------------------------------------------ |
| `77`      | one class; `AK` is both `AKs` and `AKo`                |
| `77+`     | that pair and every higher one                         |
| `ATs+`    | the kicker climbs to just under the high card: ATs–AKs |
| `99-66`   | a run of pairs                                         |
| `K9s-K7s` | a run of kickers under one high card                   |
| `T9s:0.5` | any token, at a frequency                              |

Later tokens overwrite earlier ones. In a strategy the raise is kept whole where the two
ranges overlap and the call takes what is left, so a chart can list a broad calling range
and carve the raises out of it.

## Spots

`classifyPreflop` names the situation from the action so far:

| Scenario        | When                                            | Chart                                    |
| --------------- | ----------------------------------------------- | ---------------------------------------- |
| `rfi`           | folded to the player                            | by seat                                  |
| `vsLimp`        | limpers, no raise                               | the seat-before's open, or the blinds'   |
| `vsOpen`        | one raise                                       | by the two seats                         |
| `squeeze`       | one raise and a caller                          | the `vsOpen` chart, medium confidence    |
| `vs3bet`        | the player opened and was re-raised             | by seat and where the 3-bettor sits      |
| `vs4bet`        | the player 3-bet and was re-raised              | by how early the opener was              |
| `vs5bet`        | the player 4-bet and was re-raised              | the tight `vs4bet` chart, low confidence |
| `cold4bet`      | an open and a 3-bet before the player has acted | one chart, with a call range of 9%       |
| `limpedVsRaise` | the player limped and was raised                | one chart, low confidence                |

No chart is written for a 5-bet. At 100bb it is nearly always a shove, which is priced
(see below); when it is not, the tightest chart there is stands in and the finding is
marked low.

The same classifier serves the hero's grade and every opponent's range, so the two can
never disagree about what a spot was.

Behind a limper, short of the blinds, the strategy is no single chart: the iso-raise is
the seat before's first-in range, and `overLimp` holds only the hands that limp along
where that range does not raise. The Ranges view shows the two together, one table per
seat (`overLimpStrategy`), never `overLimp` on its own, which would fold every premium.
UTG and the hijack both iso-raise with UTG's opens, so the hijack's table covers both.

`bbVsLimp` is one chart for the big blind over any number of limpers. It is written
for several, and the big blind's raise over a lone small blind is made with a wider
range, so a raise there (one limper, the small blind) is graded at low confidence. No chart was
written for it: no published range was found.

## Min-raises

The charts price a 2.5bb open. An open of **2.2bb or less** (`MIN_RAISE_BB`) is a
min-raise, and two things change:

1. **Confidence is low** for a call or a 3-bet against it. A fold is not lowered for the
   min-raise, but like any fold against a raiser it is priced from equity, and so is
   medium at best (see "Preflop: pricing from equity" in
   [coach-model.md](./coach-model.md)).
   The charts do not say what the better price is worth, and the finding is a guess.
2. **The opener is read as one seat looser.** The hero's chart is the one for an opener a
   seat later (UTG as the hijack, the hijack as the cutoff, the cutoff as the button), so
   the big blind defends wider against a min-raise from UTG and a cold caller has the
   cutoff's range to beat. The same widening gives an opponent who min-raised first in the
   range of the looser seat's opens in `preflopRange`. It stops short of the hero's own
   seat (the button against a cutoff min-raise reads the cutoff's chart) and does not apply
   to a min-raise over limpers or to the button's and the blinds' own opens. That limit is
   the chart lookup's alone: an opener's range in `preflopRange` does not depend on who
   faces it, so the button above is graded on the cutoff's chart while a call is priced
   against the button's opens. The two halves disagree there by design; the price is the
   wider guess.

**This rule is unsourced.** No published range for a min-raise was found; "one seat
looser" is a judgement. The reasoning is that a min-raise is chosen by players who open
more hands and size them smaller, and that it gives the callers a better price: the big
blind needs 22% equity to call 2bb and 27% to call 2.5bb, a fifth less, which is of the
order of what an opener one seat later is worth to its defence. The match is not
measured. It is a guess at the direction and the order of magnitude, nothing more, which
is why confidence is low rather than medium. The `LOOSER` table and `MIN_RAISE_BB` in
`preflopSpot.ts` retune it.

## Fuller tables

The charts are six-handed, and what a chart is really written for is the number of
players left to act. `CHART_SEAT` in `charts/data.ts` maps each table position to the
chart seat it reads, so the mapping is data like the ranges.

- **The lojack is UTG's chart exactly.** At seven to nine players the lojack has five
  players behind, which is the six-handed UTG seat under another name. Its findings keep
  full confidence.
- **UTG, UTG+1 and UTG+2 at seven to nine players have no chart.** UTG's stands in, and
  is too wide for them: a nine-handed UTG opens perhaps 10 to 12% of hands where this
  chart opens 17%. The spot is marked `standIn: 'hero'`, its confidence is lowered to
  medium, and the explanation says a stand-in was used. The same is done, as
  `standIn: 'villain'`, when a raise the player faces came from such a seat: the range
  assumed for it is too wide, so a fold looks worse and a call better than it is.
- **Why medium and not low:** the direction of the error is known and it is small against
  the size of most findings. A hand well outside UTG's chart is outside a tighter one
  too, so "opened too loose" holds; a hand at the chart's edge is where the stand-in
  misleads, and "Mixed hands" already lets the edge through. What it cannot do is call an
  open too tight with any authority, which is what medium says.
- **Labels keep the true seat** (`UTG+1, first in`), so the reader sees where they sat.
- Six players and fewer are untouched: a short-handed table already loses its earliest
  seats, and the seat left first to act has the right number of players behind.

The proper fix is nine-handed charts in `data.ts`, at which point `CHART_SEAT` becomes
the identity for those seats and `standIn` goes away.

## Stack depth

Three buckets by effective stack: **deep** (70bb and up), **mid** (30 to 70bb), **short**
(under 30bb).

`MID` holds charts only for the spots where a shorter stack changes the answer: facing a
3-bet or 4-bet, where a re-raise is now a shove, made for value and called less. Opening
ranges and ranges against an open change little between 40bb and 100bb and use the deep
charts at both.

There are no short-stack charts. Under 30bb the mid charts are used and every finding is
marked low confidence. This was a deliberate cut: push-fold play is a different game, and
a guess dressed as a chart would be worse than an honest "low".

## Shoves are priced, not looked up

When calling would put the player all-in, or the raiser already is, a chart frequency is
the wrong tool. `JAM_RANGES` gives the range a shove is taken to represent (by how many
raises were already in, and how deep), and the grader computes the call's equity against
it and compares with the pot odds. See [coach-model.md](./coach-model.md).

## Opponents' ranges

`preflopRange(replay, player)` multiplies the ranges of each action the player took:
opening from the cutoff and then calling a 3-bet is the cutoff's opening range times the
call range against that 3-bet.

A line the charts do not contain, such as an open-limp, would multiply to nothing. A
range under 12 combos is treated as off the charts and falls back, first to the last
action's range alone, then to `LIMP_RANGE`, a deliberately wide, capped range. This is
where a real opponent at small stakes departs furthest from the baseline, and the
fallback keeps the postflop model from reasoning about a range of three hands.

On the sample logs, of 239 opponent lines that reached a flop, 24 fell back at version 3
(32 by a stricter count that includes every line ending on the limp range). Thirteen were
a small blind calling an open, where a wide range is fair. Nine were a cold call of an
open and a 3-bet, where a quarter of all hands was far too wide. One was a 3-bettor calling
a 4-bet, whose charted range of 11.6 combos missed the threshold by 0.4. See finding 9 in
[accuracy.md](./accuracy.md).

Two charts have since been given a call range so that those lines stay on the charts.
`cold4bet` calls 8.9% of hands (117 combos: pairs down to 55, the suited and offsuit
broadways and ace-x suited), against 3.6 combos before. `vs4betTight` calls 19.6 combos
(`QQ`, `JJ`, some `TT`, `AKo`, `AQs`) where it called 11.6. Both are guesses at what a
small-stakes player calls with; at NL5 the real range may be wider, as finding 9 warned.
On the sample logs 10 of the 32 lines stop falling back (6 big blinds and 3 other callers
of an open and a 3-bet, and the 3-bettor calling a 4-bet), leaving 22: the small blind
calling an open, and the open-limp.

## Tiers

`tiers.ts` reads a strength ladder off the charts: a hand's tier is the earliest seat
that opens it, with three rungs of premiums above and the big blind's defence below.
The coach uses it to size a mistake, since a chart alone says only in or out.
