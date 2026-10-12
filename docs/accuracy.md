# How accurate the engine is

A measurement of where the engine's findings can be trusted, taken on 2026-10-11 against
`REPORT_VERSION` 3. It records what was checked, what was found wrong, and what each
possible fix would cost. **Nothing in `src/` was changed.** The fixes are a later
decision this page is meant to inform.

Three words are used throughout:

- **Bug**: the code disagrees with its own documented model.
- **Model error**: the documented model disagrees with theory or with sound play.
- **Noise**: a verdict that changes with the seed.

A **documented limitation** is a model error the docs already admit to. It is listed here
when it still produces findings.

## Since the audit

`REPORT_VERSION` 4 fixes the bugs, and only the bugs. Everything below this section
describes version 3 and is left as it was measured.

| Finding | Fix                                                                                      | Measured after                                                    |
| ------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 8       | a call is all-in when no opponent has chips behind                                       | the good play is 26.09bb at medium, as forecast                   |
| 10      | opponents' hands are drawn from the joint distribution, by redrawing a deal that clashes | bias within 0.2 points on the nine multiway spots (was up to 1.3) |
| 14      | "monotone" means every card of one suit; later streets say "three to a flush"            | label only; such boards are still sized as wet                    |
| 14      | a raise's semi-bluffs are the draws below `RAISE_TOP`                                    | one equity 92.1% → 91.5%, as forecast                             |
| 14      | calling a 5-bet is `vs5bet`, "facing a 5-bet"                                            | label; the priced grade is unchanged                              |
| 14      | a raise of 60% of the stack is not flagged as small where the standard raise is a shove  | the one wrong sizing finding is gone                              |
| 14      | a hero bet is priced up to the deepest opponent's stack                                  | no finding changes                                                |

At seed 1 the two logs now give 22 and 34 mistakes and −24.03 and −68.18bb, from 23 and
34 and −24.33 and −68.41. No finding changed kind or direction; one disappeared and four
costs moved, the largest by 0.21bb. The new sampler looks each draw up in a table built
once per call, so a multiway equity takes about 3ms where it took 150ms, and the two logs
run in about 1.0s and 1.2s.

Not fixed, because they are choices of model or of chart data and not code disagreeing
with its doc: the multiway fold share in finding 10, the 12-combo threshold in finding 9,
and the limp chart in the last row of finding 14. Changes A and C to K stand as written.

### Fuller tables, added in version 6

Tables of seven to nine players are graded from version 6. None of it was measured: the
sample logs have no hand above six players, and the figures above describe six-max play
only.

- **The seats before the lojack are graded on a stand-in.** UTG's six-handed chart is a
  third or so too wide for a nine-handed UTG. Those findings are marked medium, not high.
  Expect "opened too loose" to be under-reported there and "folded a standard open" to be
  over-reported at the chart's edge. The same widening applies to an opponent's range
  when they raised from such a seat, which carries into every postflop equity in the
  hand; that is not flagged beyond the preflop decision.
- **The baselines run a little wide at nine players.** The chart-derived session
  frequencies (VPIP, PFR, raise first in) average the stand-in chart over those seats, so
  a sound full-ring player reads slightly tight against them.
- **The typical figures by table size are rules of thumb.** The 5–6 column is the one
  the tool has always used; the others were set by reasoning about direction (fewer
  players, wider ranges, more c-bets and showdowns) and not from data or a solver. A
  leak flagged against a typical figure at a table size other than five or six deserves
  less weight than one at six-max.

### The equity readout, added in version 6

The caption under the replay table shows an equity at every step. It was not audited:

- It is the opponent model's number, so findings 1, 3, 9 and 10 below apply to it at
  every step, and not only where a decision was graded. Where a check sheds too much
  strength (finding 1) the equity shown after it is too high.
- Preflop it treats a player who has not acted as holding any two cards. That is right
  for what the hero knows and makes the figure at the deal low against a full table, as
  it should be; it is not the equity against the ranges those players would continue
  with.
- A preflop figure is a simulation of 1000 deals: about two points either way. A
  postflop figure against one range is as exact as the grader's.
- No confidence is shown beside it. Treat a multiway figure with cards to come as the
  least reliable, as the grader does.

## What was measured and how

The "GTO baseline" is three things of different reliability, and each was tested against
the best ground truth available for it. No solver was used.

| Part                            | Ground truth                                                                |
| ------------------------------- | --------------------------------------------------------------------------- |
| Card maths, parsing, notation   | independent brute force: exact, so any difference is a bug                  |
| Preflop charts and their costs  | published 6-max 100bb ranges (blogs and teaching charts; see below)         |
| Postflop model and its findings | the model's own doc, its own claimed properties, and review of each finding |

**The sample.** Two hand-history logs, 100 and 200 hands, NL5 6-max, one hero. Both parse
with no unreconciled hand and no warning. Seed 1 at the default 300 samples gives:

|                       | 100-hand log | 200-hand log | Both   |
| --------------------- | ------------ | ------------ | ------ |
| Hero decisions graded | 181          | 324          | 505    |
| Mistakes              | 23           | 34           | 57     |
| Good plays            | 1            | 2            | 3      |
| `totalEvLostBb`       | −24.33       | −68.41       | −92.74 |

Of the 57 mistakes, 37 are preflop (−18.34bb) and 20 are postflop (−74.40bb), the latter
out of 193 postflop decisions. With the three good plays that is 23 postflop findings.

**Method**, in enough detail to rebuild the scripts (they are not committed):

- _Evaluator and equity._ A best-of-21 five-card evaluator written from scratch, and an
  exhaustive equity enumerator on top of it. Compared with `evaluate.ts` on 700,000 pairs
  of random seven-card hands and with `equity.ts` on fixed spots, 200 seeds each.
- _Replay._ Pot, amount to call, chips committed, stack, players live and effective stack
  recomputed from the raw text with regular expressions, for every hero decision.
- _Stability._ Both logs run end to end at seeds 1 to 20 with 300 samples, and at four
  seeds with 5,000. A finding is keyed by hand, street and decision index.
- _Charts._ Every chart expanded through `chart()` and counted in frequency-weighted
  combos out of 1,326. Synthetic hands built with `tests/utils/history/handText.ts` to
  read off the cost of chosen errors.
- _Postflop harness._ Copies of `villainRange.ts` and `decision.ts` with every constant
  made adjustable. Unchanged, the copy reproduces the engine on all 193 postflop decisions
  with no difference. It was then used to perturb each of 40 weights by ±25%, one at a
  time, and to try candidate rule changes.
- _Review._ Every preflop mistake and every postflop finding judged **agree**,
  **defensible** or **wrong**: is the recommended action better than the one taken?

**What the evidence is not.**

- The preflop references are not solver exports and mostly do not state their rake. No
  rake-adjusted solution for NL5 was found, and the sources disagree with one another by
  several points. They are a plausible band.
- No published figure was found for what a preflop error costs. Where this page says a
  cost is overstated, the comparison is an estimate made for this audit: the call's
  equity against the opener's range, times a realisation factor assumed to lie between 0.7
  and 1.0.
- A hand review is an opinion. Close ones are marked.
- 300 hands from one player. The hero here errs loose before the flop in all 37 preflop
  mistakes, so the tight side of the grader was exercised only on synthetic hands.

## What is sound

These were checked and need not be audited again.

| Part                                                  | Check                                                                                                                        | Result                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `cards/evaluate.ts`                                   | 700,000 hand pairs, including 10,603 ties, 386 straight flushes, wheels                                                      | 0 disagreements                          |
| `cards/equity.ts`, exact                              | AA v KK 81.95%, AKs v QQ 46.21%, AKo v 22 46.96%, 76s v AKo 42.25%; heads-up turn and river against a range                  | matches enumeration to three decimals    |
| `cards/equity.ts`, flop                               | heads-up, 5 spots, 200 seeds                                                                                                 | unbiased: mean within 0.21 points        |
| `history/parse.ts`, `replay.ts`                       | 505 hero decisions recomputed; three hands read line by line (a dead small blind, two all-ins with an uncalled bet returned) | all agree; heads-up positions correct    |
| `ranges/notation.ts`                                  | 494 single tokens against an independent expander; `22+` = 78, `ATs+` = 16, `KQo` = 12                                       | 0 differences                            |
| `ranges/range.ts` overlap                             | raise kept whole, call takes the rest, at four frequency pairs                                                               | as documented                            |
| `classifyPreflop`                                     | sampled by hand: limped pots, 11 squeezes, posted blinds, heads-up, 5-handed                                                 | correct, bar one label (finding 14)      |
| Chart sizes                                           | UTG 17.3%, HJ 22.1%, CO 29.3%, BTN 47.2%, SB 43.4%                                                                           | the doc's figures are right              |
| Priced shoves                                         | each `JAM_RANGES` entry widened and tightened by 25% of its combos, over 169 hands × 7 prices                                | call↔fold flips in at most 0.8% of cells |
| `sizeOf`, `callEv`, `betEv`, realisation, the 7% band | read against the doc; the harness copy matches the engine                                                                    | as documented                            |
| `rankRange`                                           | rank correlation with exact equity on dry, three-flush, four-flush, paired and four-straight turn boards                     | 0.96 to 0.99                             |
| River bluff share                                     | a hand that beats only bluffs, by bet size and by line                                                                       | equity within 2 points of pot odds       |
| River `responseToBet`                                 | fold share against `1 / (1 + size)`                                                                                          | within 2 points                          |
| Determinism                                           | same log and seed                                                                                                            | identical report                         |

Two small notes. The notation parser accepts `AAs` as AA and throws on a run that changes
the high card (`87s-65s`); nothing in the chart data uses either. And only one hero
decision in 505 was a priced shove, so that path is sound as far as one decision and a
grid of synthetic ones can show.

## Reliability by finding type

"Flips" is over 20 seeds. "Wrong" means the recommended action is not better than the one
taken; "mis-costed" means the direction is right and the cost is out by five times or
more.

| Finding type    | Findings | Flip across seeds | Agree | Defensible | Wrong | Mis-costed | Share of claimed bb that is wrong or mis-costed |
| --------------- | -------- | ----------------- | ----- | ---------- | ----- | ---------- | ----------------------------------------------- |
| Preflop chart   | 37       | 0                 | 22    | 12         | 3     | 0          | 0.80 of 18.34 (4%); see below                   |
| Priced shove    | 0        | 0                 | —     | —          | —     | —          | one decision, correctly passed                  |
| Postflop medium | 6        | 0                 | 3     | 1          | 1     | 1          | 33.26 of 47.08 (71%)                            |
| Postflop low    | 17       | 1                 | 8     | 5          | 4     | 0          | 8.54 of 27.32 (31%)                             |

Postflop bb figures here are mistakes' costs only; the three good plays' gains are not in
them.

What the table says:

- **Seed noise is not the problem.** 59 of 61 decisions that are a finding at some seed
  are the same finding at all 20. The two that flip are heads-up flop spots at low
  confidence worth under 0.5bb each.
- **Preflop findings point the right way and overstate the price.** Three of 37 are wrong.
  But 9 loose calls carry 10.1bb of the 18.34, and the audit's estimate of their true
  cost is 3 to 4bb.
- **"Medium" is not earned for missed value.** Both medium missed-value findings fail, and
  they are the two largest errors in either report. The other four medium findings (three
  thin river bets, one river call) hold, one with an inflated cost. Four is a small
  sample.
- **"Low" is humble in wording, not in numbers.** Its error rate (4 of 17) is no better
  than medium's (2 of 6), so the two labels do not currently separate reliability, and a
  low finding still prints a cost of up to 5.45bb.
- **Half of all missed-value findings are wrong** (5 of 10, 6 with the mis-costed one).
  Every other postflop kind had no wrong verdict, on 1 to 4 findings each.

## Findings

Ranked by effect on the two reports. "Reproduced" means a script was run for this audit
and re-run when the finding was accepted; "read" means it rests on the code alone.

### 1. A check sheds strength every time, and checks compound

**Model error.** Reproduced. `applyAction` treats every check as declining a 60% pot bet.
It cannot see position, who has the initiative, or whether the checker is simply checking
to the player who bet the last street. Each check strips most of the top of the range, and
the strips multiply.

Probability of the line, by strength fifth of the original range, weakest first:

| Line                               | Weakest |       |       |       | Strongest | Final range from the original top fifth |
| ---------------------------------- | ------- | ----- | ----- | ----- | --------- | --------------------------------------- |
| check-call, check-call, check      | 0.028   | 0.182 | 0.082 | 0.016 | 0.006     | 2.4%                                    |
| call, call in position (no checks) | 0.144   | 0.180 | 0.650 | 0.830 | 0.595     | 25.3%                                   |

A player who check-calls two streets and checks the river is modelled as 30 times likelier
to hold a hand from the second fifth than from the top one.

Findings it produces: a river missed value bet at −30.62bb (medium, "blunder"), where the
opponent was given a range that was 89% ace-high after calling two streets, and the hero
96.9% equity; and a turn missed value bet at −5.45bb (low) with second pair on an ace-high
board, at 90.8%. The first is right in direction and wrong in size by five to ten times;
the second is wrong. Together **36.07bb, 48% of everything the tool says was lost after
the flop**.

Neither flips under any single ±25% weight change. This is a rule, not a tuning.

### 2. Missed value is found where the hero checks to the aggressor

**Documented limitation that emits findings.** Read; verdicts by review.
`checkEv = realised × equity × pot` assumes the hand is checked down. A strong hand
checked out of position to the player who bet the last street is priced as value given up,
though checking to check-raise or to let them bet is the standard line.

Five findings, 5.12bb: three wrong (two of them close), two defensible.

### 3. A check followed by a raise carries no strength

**Model error.** Reproduced. The raise takes the top tenth of a range the check has just
stripped. A turn check-raise after a check-call is flat across the strength fifths (0.013,
0.028, 0.034, 0.017, 0.020).

One finding: bottom two pair after a turn check-raise, graded a missed value bet at
−2.64bb (medium, "blunder") on 92.1% equity, against a modelled range of 35% third pair
and 28% ace-high. Wrong. It also sets the equity figure behind one of the three good
plays, a river call that is right as an action.

### 4. The loose-call cost is its cap

**Model error.** Reproduced. `grade.ts` caps a loose play's cost at 60% of the chips put
in. For a cold call or a big-blind call the formula exceeds the cap almost at once: 6 of
the 9 such findings cost exactly `0.6 × call`.

Nine findings, 10.1bb reported. The audit's estimate of the true cost is 0.1 to 0.6bb for
the big-blind calls (reported 0.84 to 1.2) and 0.3 to 1.1bb for the button calls (reported
1.2 to 1.44): roughly 3 to 4bb in all. The direction of every one is right.

### 5. Costs that are constants

**Doc and code diverge; the costs themselves are model error.** Read. Four kinds of
postflop finding take a fixed fraction, not an estimate: a thin raise costs 5% of the
raise, a bluff into several players 30% of the bet, a bad size 4% of the pot, a missed
raise 25% of the smaller of stack and pot. None was in the doc before this audit. Out of
position on the river, `checkEv` is also multiplied by 0.92, which the doc's formula did
not show.

Four findings, 5.65bb, plus the cost of a fifth. All four are agreed or defensible as
actions; the numbers mean nothing in particular.

### 6. Open size is ignored

**Documented limitation.** Reproduced. The charts assume a 2.5bb open. Of 180 opens by
opponents in the logs, 53 (29%) were 2.0bb and 61 more were under 2.6bb. A min-raise gives
the callers a better price and a wider correct range.

Seven of the 37 preflop mistakes (4.02bb) are calls or 3-bets against a 2.0bb open.

### 7. Folding most of a range costs nothing

**Model error.** Reproduced. A fold's cost is the tier gap between the hand and the
range's margin tier, which is zero for every hand in the margin tier, not only "the worst
hand in the range". Folding 99, ATs, AJo, KQo or 55 under the gun grades as 0.00 and "ok",
though the chart raises each every time.

Share of a chart's always-continue combos whose fold cannot be reported: UTG 67%, HJ 12%,
CO 17%, BTN 31%, BB against the button 40%, the button facing a 3-bet 56%.

No finding in these logs: this hero does not fold too much. A tight player's report would
be missing most of its preflop content.

### 8. A shove the hero covers is not treated as all-in

**Bug.** Reproduced. `decision.ts` sets `allIn = call >= step.stackBefore`, the hero's
stack only. When the opponent is all-in for less with cards to come, no betting remains,
but equity is still discounted for realisation, confidence is low where the doc says
medium, and the fold's cost is halved.

One occurrence in 193 decisions, a turn fold that is one of the three good plays: gain
31.65bb, where the corrected figure is 26.09bb at medium confidence.

### 9. One in ten opponent lines falls back to the limp range

**Model error, with a threshold artefact.** Reproduced. 24 of 239 opponent lines that
reach the flop multiply to under 12 combos and are replaced by `LIMP_RANGE` (25.5% of
hands) or, once, by the last action's range.

| Line                                   | Count | Fallback is                           |
| -------------------------------------- | ----- | ------------------------------------- |
| Small blind calls an open or a squeeze | 13    | reasonable at NL5                     |
| Calls an open and a 3-bet cold         | 9     | far too wide                          |
| 3-bets, then calls a 4-bet             | 1     | wrong: 11.6 combos charted, 12 needed |
| Other                                  | 1     | —                                     |

Eight of the 23 postflop findings are in hands where an opponent's range is a fallback.
What the fallback does to those verdicts was not measured.

### 10. Multiway equity and fold equity

- **Bug.** Reproduced. `equityVsRanges` draws each opponent's hand in turn from what the
  earlier draws left. That is not the joint distribution. Against exact enumeration the
  bias runs from −1.46 to +0.50 equity points on turn and river spots (−0.80 with two
  narrow identical ranges, −1.46 with three) and is under 0.1 on the flop. The signs are
  mixed.
- **Model error.** Reproduced. Multiway fold equity is the product of each opponent's
  heads-up fold share, so two players both fold to a half-pot bet about 6% of the time.

23 multiway postflop decisions, 5 findings, all low confidence. The effect on those
verdicts was not measured.

### 11. Flop equity is sampled with replacement

**Noise.** Reproduced. The 300 flop runouts are drawn independently, so about 262 are
distinct out of 1,081. Heads-up flop equity has a standard deviation of 0.7 to 2.9 points
per call, and the replacement accounts for about a fifth of it. A preflop all-in against
one opponent uses the same 300 boards: 1.5 to 1.7 points.

Two decisions flip: a flop check that is "missed value" at 17 seeds of 20 (equity 69.1 to
73.9, astride the 70% line) and a flop bet that is "thin" at 4 of 20. At 5,000 samples
both settle, and no finding at seed 1 differs from the 5,000-sample result.

### 12. The big blind's raise over a limp is one chart

**Model error**, by judgement: no published figure was found. `bbVsLimp` raises 9.2% of
hands whether five players limped or only the small blind did. Two findings (K9o and K8o
raised over a lone small-blind limp, 0.56bb) are wrong.

### 13. Latent: properties that hold less well than the doc said

No finding in these logs turns on these, but they bound what the model can be asked.

- **Reproduced.** The river indifference property holds for a hand that beats only bluffs,
  within 0.5 points at every size. A bluff-catcher just under the value threshold gets
  44.9% against a pot-size bet (it needs 35.1% after rake) and 56.8% against one and a
  half times the pot (it needs 39.5%), because middle hands that bet are counted as value
  when the air is sized. The model does have an opinion there.
- **Reproduced.** Raising ranges are bluff-heavy by construction. An in-position turn
  raise is 50% two pair or better and 15% no pair; a river raise 73.5% and 4.8%. A strong
  player at these stakes would assume 85% or more.
- **Reproduced.** With cards to come a range folds less than `1 − 1 / (1 + size)`: 27.8%
  on the flop and 27.0% on the turn against a half-pot bet, where minimum defence gives
  33.3%. This is the documented "plus draws". It leans every bet-or-check verdict toward
  betting.
- **Read.** The tier ladder gives one value to everything in a seat's range below the
  premiums, so 66 calling a 4-bet for 15.6bb is one step out and costs 0.42bb.

### 14. Small bugs

All read from the code; the first two also reproduced through the harness or the report.

| Where             | What                                                                                                                                                                           | Effect in the logs                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| `texture.ts`      | `monotone` is "three or more of a suit" on any street, so a two-tone flop whose third suit card arrives on the river is described as monotone, and such turns are sized as wet | one explanation's wording            |
| `villainRange.ts` | a raise's draws are split into semi-bluff and value by the bet's value share, not `RAISE_TOP`                                                                                  | one equity moves 92.1% → 91.5%       |
| `preflopSpot.ts`  | calling a 5-bet shove is labelled `cold4bet`, "facing an open and a 3-bet"                                                                                                     | one label; the priced grade is right |
| `grade.ts`        | a 4-bet to 63% of the stack is flagged for size because the suggestion is a shove                                                                                              | one finding, 0.24bb, wrong           |
| `decision.ts`     | a hero bet larger than the opponent's stack is priced on the whole bet                                                                                                         | one decision, no finding             |
| `preflopSpot.ts`  | `vsLimp` from a non-blind seat uses the seat-before's opening range, narrower than the seat's own                                                                              | one finding, 0.2bb                   |

### Chart sizes against published ranges

Engine figures reproduced. References as found on 2026-10-11; none is a rake-adjusted
solver export.

| Spot                    | Engine        | Published                                   | Reading                            |
| ----------------------- | ------------- | ------------------------------------------- | ---------------------------------- |
| Open UTG                | 17.3%         | 14 to 18.7% (six sources)                   | in the band                        |
| Open HJ                 | 22.1%         | 19 to 24%                                   | in the band                        |
| Open CO                 | 29.3%         | 25 to 32%                                   | in the band                        |
| Open BTN                | 47.2%         | 40 to 52%; three sources near 43%           | top of the band                    |
| Open SB (raise only)    | 43.4%         | 30 to 47%; one source raises 33%, limps 20% | upper half; the engine has no limp |
| BB continues v UTG / HJ | 20.4% / 24.1% | 28 to 35% (one source)                      | 8 to 14 points under               |
| BB continues v CO       | 32.9%         | 38 to 42%                                   | 5 to 9 under                       |
| BB continues v BTN      | 54.0%         | 45 to 58%                                   | in the band                        |
| BB continues v SB       | 59.7%         | 65 to 70%                                   | 5 to 10 under                      |
| BB 3-bets v BTN / SB    | 8.9% / 9.2%   | about 12% / 17%                             | 3 and 8 under                      |
| BTN v UTG, 3-bet / call | 4.0% / 6.5%   | 7.5% / 8.2% (NL500)                         | under                              |
| SB v BTN, 3-bet or fold | 14.0%         | 9 to 10%                                    | 4 over                             |
| Fold to a 3-bet         | 66 to 70%     | 65% target; 50 to 55% in one source         | in the band                        |

High rake narrows a big blind's defence, so the gaps against early seats are not errors on
this evidence. One hand-level difference stands out: a source that publishes frequencies
opens 33 at 97% and 22 at 79% under the gun, and the engine folds both.

Sources: thinkgto.com/blog/preflop-ranges-building-your-opening-strategy,
gtogecko.com/blog/preflop-charts-opening-ranges,
preflopwizard.app/blog/6-max-preflop-charts, pokerskill.com/poker-glossary/opening-range,
deepfold.co/en/blog/three-bet-strategy-guide,
blog.gtowizard.com/playing-calls-from-the-button-in-cash-games,
blackrain79.com/2017/10/what-are-the-best-poker-hud-stats.html.

Session baselines sit inside the same sources' bands: VPIP 26.0% and 20.1% on the two
logs, PFR 21.9% and 16.1%, 3-bet 7.2% and 6.4%. No source was found for the starred
postflop constants (c-bet 0.60, fold to c-bet 0.45, went to showdown 0.28, won at showdown
0.52).

### Every postflop finding

Hand ids are the logs' own. "Rule" is the finding above that the verdict traces to.

| Hand         | Street | Kind              | Conf.  | bb     | Verdict                              | Rule  |
| ------------ | ------ | ----------------- | ------ | ------ | ------------------------------------ | ----- |
| 262359573123 | river  | missed-value      | medium | −30.62 | right way, cost 5–10× high           | 1     |
| 262359664112 | turn   | missed-value      | low    | −5.45  | **wrong**                            | 1     |
| 262359435958 | river  | bet-thin          | medium | −5.29  | defensible; not a blunder            | 5     |
| 262311396019 | river  | bet-thin          | medium | −4.58  | agree                                | —     |
| 262359818317 | flop   | bluff-multiway    | low    | −4.02  | defensible                           | 5, 10 |
| 262360151016 | river  | bet-thin          | medium | −3.95  | agree                                | —     |
| 262311422919 | turn   | fold-with-odds    | low    | −3.52  | defensible, close; cost 2–5× high    | 13    |
| 262360131440 | flop   | bet-thin          | low    | −3.14  | agree; cost inflated                 | 10    |
| 262300173917 | river  | missed-value      | medium | −2.64  | **wrong**                            | 3     |
| 262311506050 | turn   | missed-value      | low    | −2.46  | **wrong**, close                     | 2     |
| 262359879551 | flop   | call-without-odds | low    | −2.20  | agree                                | —     |
| 262360190759 | turn   | missed-value      | low    | −1.46  | agree                                | —     |
| 262359902564 | turn   | missed-value      | low    | −1.26  | defensible, close                    | 2     |
| 262360070756 | flop   | missed-value      | low    | −0.78  | agree                                | —     |
| 262311506050 | flop   | missed-value      | low    | −0.77  | defensible                           | 2     |
| 262305553044 | flop   | raise-thin        | low    | −0.75  | agree                                | 5     |
| 262359343822 | flop   | postflop-sizing   | low    | −0.62  | defensible                           | 5     |
| 262359435958 | turn   | missed-value      | low    | −0.42  | **wrong**                            | 2     |
| 262311465373 | flop   | postflop-sizing   | low    | −0.26  | agree, mild                          | 5     |
| 262360308100 | flop   | missed-value      | low    | −0.21  | **wrong**; flips at 3 seeds of 20    | 2, 11 |
| 262360131440 | turn   | good: tough fold  | low    | +31.65 | agree; should be +26.09, medium      | 8     |
| 262300192860 | river  | good: tough call  | medium | +16.41 | agree; "tough" rests on a 31% equity | 3     |
| 262359456481 | flop   | good: tough call  | low    | +0.83  | agree; easy, not tough               | —     |

### Sensitivity to the weights

Each of 40 constants moved ±25% alone, 80 runs, counting findings that appear, disappear
or change kind among the 193 decisions.

| Weight (base)                         | −25% | +25% |
| ------------------------------------- | ---- | ---- |
| Value share of a bet, intercept (0.6) | 6    | 5    |
| Value hands' bet frequency (0.85)     | 5    | 4    |
| Minimum-defence share, scale (1)      | 4    | 5    |
| Top of range continues (0.95)         | 4    | 3    |
| Value share, slope (0.35)             | 2    | 2    |
| `BAND` (0.07)                         | 2    | 2    |
| Missed-value equity threshold (0.7)   | 0    | 3    |
| Strong draws' bet frequency (0.6)     | 1    | 2    |
| The bet a check declines (0.6)        | 1    | 2    |
| `RAISE_TOP` (0.1)                     | 1    | 1    |
| Every other weight                    | ≤ 2  | ≤ 2  |

78 flips in all, on 24 decisions. The model is most sensitive to where the value and
calling thresholds sit, and one river check with 74.8% equity in a 71bb pot becomes a
missed value bet under 16 of the 80 changes. **The largest wrong verdicts are not among
the sensitive ones**: of the five, the three that cost most never flip, and neither does
the mis-costed one. The other two (−0.42 and −0.21bb) flip under 7 and 2 of the 80
changes.

## Potential changes: cost-benefit

Every change to a grade wants a `REPORT_VERSION` bump, so that a stored report is not read
as the new model's; it is not repeated below. None of these changes the bundle size or,
unless stated, the run time (about 1.9s and 2.4s for the two logs).

### A. Make a check to the aggressor neutral, and a check-raise a raise

| Field       | Content                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change      | In `rangeAt`, skip the check reweighting when the checker is not the last aggressor and that player is still to act; when a raise follows the same player's check on a street, apply it to the range before the check. Answers findings 1 and 3.                                                                                                                                              |
| Benefit     | Measured in the harness: removes the −30.62, −5.45 and −2.64 findings, **38.71 of 74.40bb**, including both failed medium findings. Anyone reading a report: these are its headline.                                                                                                                                                                                                          |
| Cost        | About 15 lines in `villainRange.ts`; the last aggressor must be carried through the replay, preflop included. New tests for both rules. A doc paragraph for a new assumption: a check to the aggressor says nothing, which ignores leading ranges.                                                                                                                                            |
| Risk        | Measured: two new thin-bet findings appear on flop continuation bets with king-high and ace-high. Requiring a pair or better for a thin bet (one line in `decision.ts`) removes both and changes nothing else. One of the three good plays (the river call) is no longer named. The −30.62 hand becomes silent, though a river bet there is probably right. It does not raise any confidence. |
| Alternative | Mark missed value low whenever the opponent's range has passed through a check to the aggressor or a check-raise, and cap its cost. No model change; both failed medium findings lose "blunder" and keep their wrong numbers.                                                                                                                                                                 |
| Verdict     | **Do now**, with the pair guard. It is the only change that moves the headline, and silence is better than a 30bb claim.                                                                                                                                                                                                                                                                      |

### B. Fix the small bugs

| Field       | Content                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change      | Treat a call as all-in when no opponent can act behind (finding 8). `monotone` only for a flop of one suit, or a separate three-flush label. `RAISE_TOP` in the semi-bluff split. A label for calling a 5-bet. No size flag for a raise of 60% of the stack or more. Cap a hero bet at the effective stack. Lift the `vs4betTight` call range clear of the 12-combo threshold. Answers findings 8, 9 (in part) and 14. |
| Benefit     | One good play corrected by 5.56bb and raised to medium, as the doc already promises; one wrong sizing finding removed; one explanation and one label corrected; one opponent range no longer replaced by a quarter of all hands.                                                                                                                                                                                       |
| Cost        | One to six lines each across `decision.ts`, `texture.ts`, `villainRange.ts`, `preflopSpot.ts`, `grade.ts`, `charts/data.ts`. A test each. A new scenario label touches `explain.ts`.                                                                                                                                                                                                                                   |
| Risk        | The texture change moves turn sizing suggestions on three-flush boards, so a sizing finding may appear or go: not measured. The all-in fix raises one confidence to medium, which the doc's own table already claims.                                                                                                                                                                                                  |
| Alternative | Fix the all-in test alone: one line, the only one with a bb effect.                                                                                                                                                                                                                                                                                                                                                    |
| Verdict     | **Done** in version 4, except the `vs4betTight` range, which is chart data. See "Since the audit".                                                                                                                                                                                                                                                                                                                     |

### C. No missed value when the hero checks to the aggressor

| Field       | Content                                                                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change      | Suppress missed value when the hero is out of position, is not the last aggressor, and that player is still to act. Answers finding 2.                      |
| Benefit     | Not run in the harness. By review it removes four findings (three wrong, one defensible), 4.35bb, and with them most of the wrong low-confidence verdicts.  |
| Cost        | About 3 lines in `decision.ts`, using the same last-aggressor fact as A. Tests.                                                                             |
| Risk        | Silences the real case of failing to lead when the aggressor would check back. Does not catch the preflop raiser checking a set out of position.            |
| Alternative | Keep the finding, reword it as something to consider, and give it no cost. That breaks "zero exactly when no mistake is named", so it is the dearer option. |
| Verdict     | **Do with A**, after running it through the harness.                                                                                                        |

### D. Say in the docs what was measured

| Field       | Content                                                                                                        |
| ----------- | -------------------------------------------------------------------------------------------------------------- |
| Change      | Correct the claims this audit contradicts or sharpens. Answers findings 5, 7, 11, 13 and the confidence table. |
| Benefit     | The docs stop promising an indifference property, a fold cost and a medium label the model does not deliver.   |
| Cost        | Doc only.                                                                                                      |
| Risk        | None.                                                                                                          |
| Alternative | —                                                                                                              |
| Verdict     | **Done** with this page; see the links back from the three model docs.                                         |

### E. Price a loose call from its equity

| Field       | Content                                                                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Change      | Replace the 60% cap with `(break-even − realised equity) × pot` for cold calls and big-blind calls, or lower the cap to about 35%. Answers finding 4.                                                  |
| Benefit     | Nine findings re-priced, 10.1bb to roughly 3 or 4; several drop from "mistake" to "inaccuracy". No verdict changes direction.                                                                          |
| Cost        | About 15 lines in `grade.ts`, and an equity call per loose call if computed (a few tens of milliseconds a log). Tests. A realisation factor preflop is a new assumption needing its reasoning written. |
| Risk        | The replacement number is this audit's estimate, not a published one. A lower cap is as arbitrary as the present one.                                                                                  |
| Alternative | Leave the cost and say in the doc that it is a cap. Done under D.                                                                                                                                      |
| Verdict     | **Do later**, when there is a reference to tune it against.                                                                                                                                            |

### F. Take the open's size into account

| Field       | Content                                                                                                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change      | Widen the calling and defending ranges, or discount the cost, against an open under 2.5bb. Answers finding 6.                                                                     |
| Benefit     | Seven of 37 preflop findings re-priced (4.02bb); perhaps five drop to an inaccuracy or to nothing. Matters most at stakes where min-raises are common: 29% of opens here.         |
| Cost        | A size input to the chart lookup in `preflopSpot.ts` and `grade.ts`, about 25 lines, or a second set of charts. If applied to opponents' ranges too, every postflop equity moves. |
| Risk        | A scaling rule invented without a source is one more unmeasured constant.                                                                                                         |
| Alternative | Soften confidence to low for a call or 3-bet against an open of 2.2bb or less. A few lines.                                                                                       |
| Verdict     | **Do later**; take the alternative first.                                                                                                                                         |

### G. Cost a fold by how often the chart continues

| Field       | Content                                                                                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change      | Give a fold a cost wherever the chart always continues, scaled by the spot's value, and keep the tier gap for size. Answers finding 7.                                  |
| Benefit     | None in these logs. For a tight player it restores the preflop findings the grader cannot currently make: two thirds of UTG's range, half the button's against a 3-bet. |
| Cost        | 20 to 30 lines in `grade.ts` and `tiers.ts`; the fold tests rewritten; new doc reasoning.                                                                               |
| Risk        | Margin hands are close by nature. A cost above the 0.15bb floor for folding 55 under the gun would be a new kind of noise.                                              |
| Alternative | A flat inaccuracy, with no claim to a size, for folding a hand the chart plays every time.                                                                              |
| Verdict     | **Do later**, and test it on a tight player's log first: this sample cannot show the gain.                                                                              |

### H. A range for calling a 3-bet cold

| Field       | Content                                                                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Change      | Give `cold4bet` a real call range of 8 to 12% of hands, so the 9 such lines stop falling back to `LIMP_RANGE`. Answers finding 9.      |
| Benefit     | 9 of 239 opponent lines get a range a third the width. Eight postflop findings sit in hands with a fallback; how many move is unknown. |
| Cost        | Two or three lines in `charts/data.ts`. The work is measuring the postflop verdicts before and after.                                  |
| Risk        | At NL5 the players who call a 3-bet cold really are wide. A tighter range may be less true of them, not more.                          |
| Alternative | Leave it; the doc already says the fallback is where real opponents depart furthest.                                                   |
| Verdict     | **Do later**, after measuring.                                                                                                         |

### I. Draw flop runouts without replacement

| Field       | Content                                                                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Change      | A partial shuffle in `runouts()`. Answers finding 11.                                                                                          |
| Benefit     | Measured: standard deviation down about 16% at no run-time cost. It narrows the noise; it does not promise to settle either flipping decision. |
| Cost        | About 8 lines in `cards/equity.ts`. Every seeded number changes, so tests with fixed equities are rewritten.                                   |
| Risk        | None to correctness.                                                                                                                           |
| Alternative | Enumerate all 1,081 runouts heads-up: no noise at all, at 3.5 times the cost of each flop equity call (measured: about 20ms to 70ms).          |
| Verdict     | **Do later**, with the next change that already bumps the version. Do not enumerate: two findings under 0.5bb do not buy a slower worker.      |

### J. Sample multiway hands from the joint distribution

| Field       | Content                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| Change      | Draw every opponent's hand independently and reject the draw on a shared card. Answers finding 10.                       |
| Benefit     | Removes a bias of up to 1.5 points, 2 to 4% of the pot against a 7% band, on 23 decisions. Verdicts moved: not measured. |
| Cost        | About 15 lines in `equityVsRanges`; an estimated 1.1 to 1.5 times the cost of a multiway call. Tests rewritten.          |
| Risk        | With narrow, overlapping ranges rejection is slow; it needs a bound on retries.                                          |
| Alternative | Leave it. Every multiway finding is already low confidence.                                                              |
| Verdict     | **Do later**, with I.                                                                                                    |

### K. A heads-up chart for the big blind against a limp

| Field       | Content                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------- |
| Change      | A wider raising range when only the small blind limped. Answers finding 12.                     |
| Benefit     | Two wrong findings removed, 0.56bb.                                                             |
| Cost        | One chart and about 8 lines in `preflopSpot.ts`. No published range was found to write it from. |
| Risk        | An unsourced chart.                                                                             |
| Alternative | Low confidence for an iso-raise against one limper.                                             |
| Verdict     | **Do later**; small.                                                                            |

### Not worth doing

- **Retuning the opponent weights** (bluff share of raises, flop and turn defence, middle
  hands' bet frequency; finding 13). The largest wrong verdicts do not move under ±25%,
  the most sensitive weights flip four to six verdicts each way, and there is no target to
  tune to. Changing them would be opinion presented as calibration.
- **Raising any confidence.** Nothing measured here earns it. The evidence points the
  other way for missed value.
- **5,000 samples by default.** About ten times the run time, and no finding at seed 1
  differs from the result.
- **A table of preflop all-in equities.** 28,000 numbers in the bundle for a path that
  never flipped in 20 seeds.
- **Bundling a solver.** A postflop solve needs both ranges and a bet-size tree the tool
  does not have, takes minutes a spot against two seconds a log, and would not run in the
  worker. The errors found here are in the inputs a solver would also need.
- **Replacing the charts with these published ranges.** The sources disagree by more than
  the engine differs from them. It becomes worth doing when a rake-adjusted solution for
  the stake is in hand; `charts/data.ts` is built for that swap.
- **Joint minimum defence multiway** (finding 10, second part). A new assumption to fix
  the cost of one finding that is already low confidence.

### Recommended order

Cheapest per verdict corrected first.

1. **B**, the all-in line first: one line, one finding corrected.
2. **A with its pair guard, then C**: about 20 lines, six or seven findings removed, 43bb
   of the 74 claimed after the flop, and both failed "blunders".
3. **F's alternative and K's alternative**: a few lines each, nine preflop findings marked
   low.
4. **I and J** together, in a release that already changes the numbers.
5. **E, F, G, H**, each when there is a reference or a second player's log to measure it
   against.

After 1 and 2 the postflop report on these logs would claim about 31bb lost, not 74, with
no wrong verdict at medium confidence. That is a forecast from the harness, and the audit
should be re-run on the changed code before any doc says so.
