# The postflop model

How `src/utils/postflop/` judges a decision after the flop. **It is a model, not a
solve**, and this page is mostly about where that matters. How well it does on real hands
was measured in [accuracy.md](./accuracy.md); the figures quoted below are from there.

## Why not a solver

A No-Limit Hold'em game tree cannot be solved on the fly, and a postflop solution depends
on both players' exact ranges and the bet sizes allowed. The tool has neither. What it
can do is answer, with stated assumptions, the questions a solver's answer rests on:

1. Am I getting the right price, against the range that bets like this?
2. If I bet, what folds, and what is my equity against what calls?
3. Where is this hand in my own range, and how much of that range has to continue?

The grading therefore never runs a solver: it would cost minutes a spot against two
seconds a log. A solver is offered instead as a readout of one decision the user asks
for, a **Solve** button in Review that runs it from this model's ranges. It does not
touch a grade; see [solver.md](./solver.md).

## The opponent's range

`villainRange.ts` starts each opponent with the range of their preflop line and reweights
it by every postflop action, according to where each combo stands in the range on that
board (`rankRange`: its percentile by made hand, plus a draw flag).

| Action      | Kept                                                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| bet / raise | the top of the range for value (a smaller share the bigger the bet, a tenth for a raise), most draws, and enough air to be balanced |
| call        | the share minimum-defence asks for, `1 / (1 + size)`, strongest first, plus draws                                                   |
| check       | the complement of betting 60% pot: strength is shed, not removed; nothing, when checking to the aggressor (below)                   |

The air in a betting range is not a fixed fraction. It is scaled so that bluffs make up
the share that leaves a caller indifferent: `size / (1 + 2 × size)` on the river, and 15%
more per card to come. This gives the model a property worth having: against a river bet,
a hand that beats only the bluffs has equity within half a point of its pot odds, so the
model does not have an opinion where theory says there is none.

The property is narrower than "any bluff-catcher". Middle hands that bet are counted as
value when the air is sized, so a hand just under the value threshold is given 44.9%
against a pot-size bet that needs 35.1%. There the model does have an opinion, and it is
to call.

**A check is read in its context.** The replay carries the last player to bet or raise
(`Step.aggressor`, the preflop raiser into the flop) and whether that player is still to act on the street (`aggressorToAct`).
Two rules follow:

- **A check to the aggressor, who is still to act, says nothing.** Checking to the raiser
  is what every part of a range does, the sets that mean to check-raise as much as the
  air. The range is left as it was. A check by the aggressor, or with no aggressor (a
  limped pot), or behind an aggressor who has already checked, still sheds strength.
  **The initiative lasts until the aggressor checks.** A raiser who checks back a street
  has given it up, and on the next street nobody holds it: a check there sheds strength
  again, and a strong hand checked there can be missed value. That is where probe and
  delayed bets live, and a range that checks to a player who has just declined to bet is
  not hiding its strength from them.
- **A check-raise is a raise from the range before the check.** When a player raises after
  their own check on a street, with nothing of theirs between, the raise is applied to
  the range as it stood before the check. Without this, the raise took the top tenth of
  a range the check had just stripped, and a check-raise was flat across strength.

This answers findings 1 and 3 in [accuracy.md](./accuracy.md). Before it, checks
compounded: after check-call, check-call, check, only 2.4% of the range came from its
original top fifth, against 25.3% for the same calls made in position, and three findings
worth 38.71 of the 74.40bb the sample logs were said to lose after the flop rested on it.
**The new assumption** is that a check to the aggressor carries no information at all.
That ignores leading ranges: a player who would bet their strong hands into the raiser
(a "donk" bet) and checks the rest does tell something by checking. At these stakes few
players lead with a plan, so the error is the smaller one; it leans the model towards
giving a checker more strength than they have, never less.

A raising range is 15% no pair on the turn and 5% on the river, which is balanced and is
more bluffs than a raise carries at these stakes. With cards to come a range folds a
little less than minimum defence asks (27.8% on the flop against a half-pot bet, not
33.3%), which is the "plus draws" in the table.

**These weights are fixed and written down, not fitted to any player.** They describe a
balanced opponent. A real opponent at the stakes in the sample log is not balanced, and
this is the largest single approximation in the tool. It is the right one for a GTO
baseline; it is the wrong one for an exploitative read, which the tool does not attempt.

## Judging a decision

`judgePostflop` in `decision.ts`.

### Facing a bet

`callEv = realised × equity × (pot + call) × (1 − rake) − call`

- **Equity** is against the ranges above: exact on the turn and river, 300 seeded runouts
  on the flop. The runouts are drawn without replacement (a partial shuffle), so the 300
  are distinct of 1,081; with replacement about 262 were, and the audit measured the
  change as a sixth off the standard deviation of a heads-up flop equity, which was 0.7
  to 2.9 points. Several opponents
  are simulated together: each hand is drawn from its own range, and a deal in which two
  hands share a card is thrown away and drawn again. That is the joint distribution.
  Drawing one hand after another from what the last left is not, and was off by up to 1.5
  points.
- **Realised** is 1 on the river or when the call is all-in, for the hero or for every
  opponent: either way no betting is left. With cards to come it is discounted for
  position (0.95 / 1.0 in position on flop / turn, 0.8 / 0.9 out), and a strong draw with
  money behind gets a little back for implied odds.
- A bet for more than the hero's stack is priced on the part they can win.

Then the other half of the theory checks the first. The hero's own range is built the
same way as an opponent's, and the hand placed in it:

- A **fold** is a mistake only if the call is profitable **and** the hand is at least ten
  points inside the part of the range that has to defend. Folding the bottom of a range
  is what the bottom of a range is for.
- A **call** is a mistake only if it loses **and** the hand is not in the top half of the
  defending range. A call the range has to make somewhere is not wrong for losing to
  this particular estimate of the opponent.

Without that check the model called reasonable folds blunders, because its estimate of a
betting range can be too weak. With it, a finding needs both arguments to agree. The
check is made heads-up only, and not for a fold when the call is all-in.

### The action not taken

When the hero's call or fold is right by more than the band, the same two tests are put to
the other action. If it would have been named a mistake, the verdict carries it as
`avoided`, with the cost it would have had (halved for a fold with cards to come, as a
fold's cost always is) and whether the hand made the right action a hard one. The coach
turns that into a good play; see [coach-model.md](./coach-model.md). Nothing is added for
a bet, a check or a raise: the model does not price those well enough to praise one.

### Checked to

For the bet made (or, after a check, a bet of the size the board suits):

`betEv = folds × pot + (1 − folds) × (realised × calledEquity × (pot + 2 × bet) − bet)`
`checkEv = realised × equity × pot`

A bet for more than the deepest opponent's stack is priced on the part that can be called.
Out of position on the river `checkEv` is multiplied by 0.92, for the bets a check will
face. Against several opponents `folds` is the product of each one's heads-up fold share,
which makes everyone folding rarer than it is.

- **Missed value**: the hand has over 70% equity, is ahead of what calls, and betting is
  worth clearly more. Out of position or with cards to come the cost is halved, because a
  check can still collect.
- **Thin bet**: the hand has showdown value but is behind what calls, and checking is
  worth clearly more.
- **A bluff is never a mistake heads-up.** With under 30% equity, or with a draw, betting
  and checking are both in a balanced strategy, and the model cannot tell which combos
  should do which. The one exception is a bluff with no equity into several players.

`checkEv` assumes the hand is checked down. It gives no credit for checking to the player
who bet the last street, so **missed value is not named when the hero checks to the
aggressor, who is still to act** (audit change C). Checking a strong hand out of
position to the raiser, to check-raise or to let them bet, is the standard line, and the
model cannot price what it collects. This silences the real case too: a hand that
should lead because the aggressor would check behind. It does not reach the aggressor's
own check, which is still judged.

**A thin bet needs a pair or better** that the hole cards make. Under it, a hand with
30% equity or more and no draw (king high, ace high) is a bluff whose showdown value the
model counts as made. Without the guard, two flop continuation bets with king high and
ace high in the sample logs were named thin bets.

Four costs are fixed fractions, not estimates: a thin raise costs 5% of the raise, a
bluff into several players 30% of the bet, a flagged size 4% of the pot, and a raise not
made with over 90% equity 25% of the smaller of stack and pot. They rank a finding. They
do not measure it.

### The indifference band

A difference under 7% of the pot is a toss-up and is never reported. This is what stops
the tool from narrating noise.

## Confidence

| Confidence | When                                                      |
| ---------- | --------------------------------------------------------- |
| medium     | heads-up on the river, or heads-up all-in on any street   |
| low        | everything else: cards to come, or more than one opponent |

No postflop finding is high confidence. A low-confidence finding is never called a
blunder, whatever its estimated cost, and with cards to come the cost of a fold is halved:
the estimate is of a hand that still has to get to showdown.

Measured on the sample logs, the two labels do not yet separate reliability: 2 of 6
medium findings and 4 of 17 low ones were judged wrong or mis-costed by five times or
more. **Medium is not earned for missed value.** Both medium missed-value findings failed,
and they were the two largest costs in either report. The other four medium findings
held. A missed value bet out of position on the river is marked low, which is the more
careful side of the table above. Since version 9 (the check rules above) neither failed
medium finding is made, and no medium finding the audit judged wrong is left; the four
that held are still made, except that one, a river call, is no longer a good play. Both
labels are as they were: nothing re-measured earns a raise.

## The equity readout

`coach/stepEquity.ts` gives the hero's equity at every step of a hand's replay: at each
deal and after each action, their share of the pot against the range of **every opponent
not folded**, were the board to run out with no more betting. It is a readout of the
ranges this page describes, not a grade, and nothing is decided from it.

- **Which ranges.** Preflop, `preflopRange` up to the step: a player who has only posted
  holds anything, one who opened holds their seat's opening range. Postflop, `rangeAt` at
  the step. An opponent's range is read as it stood then, not with what they did later.
- **It is not the equity against the cards that were shown.** The table turns the hands
  over at the result; the figure stops before that. Mixing the two would put a number
  the hero could not have known beside ones they could.
- **The hero's own action does not move it.** A figure belongs to a state: the board, who
  is in, and what each of them has done. Steps in a row that share those share one
  figure, so betting does not change the hero's equity, and being called does.
- **It agrees with the mistake card.** A graded decision was priced in one of those
  states, and the readout shows the grade's own equity there. For a postflop decision
  that is the number it would have computed anyway (same ranges, same samples, same
  seed); for a shove priced preflop it is taken over only when the grade priced the same
  number of opponents, since a stack-off is priced against those in for the price, not
  against everyone still holding cards.
- **Nothing is shown** once the hero has folded, when nobody is left to beat, at the
  result, or in a hand that was not graded.
- **How it is computed.** Postflop as the grader does: one range enumerated, several
  simulated, at the report's samples. Preflop five cards are to come and nothing can be
  enumerated at a useful cost, so every figure is `sampleEquity` over 1000 deals, which
  is two points either way at 95%. Each state has its own stream, the seed plus the
  index of the next action, so a figure does not depend on what was computed before it.
- **What it costs.** Analysis takes about 0.4s longer per hundred hands, most of it the
  preflop simulations. `PREFLOP_DEALS` is the lever.

Read it as the model's estimate. Every weakness of the opponent model listed in
[accuracy.md](./accuracy.md) is in this number too, and it is shown at every step, graded
or not, without a confidence beside it. The caption words it "about" and "an estimate"
for that reason.

## Texture and sizing

`textureOf` classes a board as dry or wet (paired, suits, connectedness) and suggests a
bet: a third of the pot on dry boards, half to two-thirds as it gets wetter, two-thirds on
the river. A bet is flagged for size only when it is tiny (under 20% of the pot) or, with
cards to come, more than two and a half times the suggestion and not all-in. Solvers use
several sizes on most boards, so anything nearer than that is not an error.

A board is called monotone only when every card shares a suit, which is a flop. Three or
more of a suit on a later street is "three to a flush" or "four to a flush". Either way a
flush is possible and the board is sized as wet.

## Checked against the solver

`scripts/accuracy/solverCompare.ts` solves, offline, every heads-up turn and river
decision of the hero's in the two sample logs (87 spots), from the model's ranges at the
street's start, on the `standard` tree with the line's own sizes, natively, to 0.5% of the
pot; and solves again to the villain's first decision on the street, to read the
equilibrium's strategy there. Every spot reached its target untrimmed; the run took 289s
on 16 threads. It was measured on version 9 and **changed nothing**: no weight and no
cost. The solve is never part of a grade.

**What it is a target of.** An equilibrium is a balanced player, and the solve's inputs
are this model's own ranges, so it measures the model against the best play given its own
assumptions, not against the players in the logs. Opponents at NL5 raise tighter and
bluff less than any equilibrium; a weight moved towards the solve is a move towards
balance, which is a reason to keep it apart from a read on a real opponent.

**Verdicts.** A model's finding agrees when the solve finds the action taken worse than
its best by more than the band (7% of the pot); no finding agrees when it does not.

| Model verdict  | Confidence | Spots | Solve agrees | Model bb | Solve gap bb |
| -------------- | ---------- | ----- | ------------ | -------- | ------------ |
| bet-thin       | medium     | 3     | 3            | −13.80   | −9.52        |
| fold-with-odds | low        | 1     | 0            | −3.52    | −0.37        |
| missed-value   | low        | 1     | 0            | −1.41    | −0.04        |
| no finding     | low        | 55    | 52           | 0        | −42.92       |
| no finding     | medium     | 27    | 24           | 0        | −32.55       |

79 of 87 agree. The three thin river bets hold, at about two thirds of the model's cost.
The turn fold the audit called close and over-costed is within the band of a call; the
turn missed value bet is a toss-up in the solve (0.04bb). Of the six decisions the model
passed and the solve does not, four are what the model does not set out to price: two
river checks where the solve bluffs (−19.52 and −10.72bb, at 4% and 27% equity), a turn
fold where it bluff-raises, and a turn call where it shoves over a check-raise. One is a
river bet size (0.97bb). The sixth, a turn call the solve rates −27bb with no equity, is
on a line the equilibrium hardly takes (a lead into the flop raiser, a second lead on the
turn): the solve's answer rests on the few combos it leads with there. A gap on such a
line is not evidence.

**Ranges.** At the villain's first decision, the equilibrium's frequency beside the
model's likelihood, weighted by the model's range, by strength fifth on the board:

| Strength fifth, no draw | Bets, checked to or with the initiative (53) | Leads without the initiative (16) | Continues against a bet (18) |
| ----------------------- | -------------------------------------------- | --------------------------------- | ---------------------------- |
| top                     | 69% / 85%                                    | 53% / 85%                         | 100% / 95%                   |
| second                  | 40% / 80%                                    | 36% / 85%                         | 81% / 95%                    |
| middle                  | 15% / 10%                                    | 27% / 10%                         | 48% / 87%                    |
| fourth                  | 28% / 24%                                    | 35% / 18%                         | 21% / 20%                    |
| bottom                  | 47% / 36%                                    | 34% / 36%                         | 9% / 6%                      |
| whole range             | 45% / 53%                                    | 43% / 53%                         | 57% / 65%                    |

Read the model's numbers as the likelihood it reads a check by (one minus it is what a
check keeps). Three differences stand out:

- **The model bets too much of the second fifth.** `valueShare` at 60% of the pot puts
  the top 39% of the range at 0.85; the solve bets the second fifth about 40%, so a check
  is read as weaker than it is. With a gutshot or a strong draw the solve bets the bottom
  of the range more (56 to 76%) than the model's 35 to 60%.
- **A balanced player leads.** Without the initiative the solve leads 43% of the range,
  the top fifth 53%. By that measure version 9's rule, a check to the aggressor says
  nothing, is wrong for a balanced player, whose check would be weaker. It stays: it is
  what removed the wrong findings above, and players at these stakes lead far less than an
  equilibrium does.
- **The middle of a range folds more to a bet than minimum defence asks.** The solve
  continues 48% with the middle fifth, the model 87%; gutshots continue far more in the
  solve (65 to 100%) than the model's 25 to 40%, and 25% of what continues raises.

**A candidate, not adopted.** The value share's intercept was lowered from 0.6 to 0.45,
which brings the second fifth to the solve's figure. Verdict agreement did not rise (79
of 87 again): a fold-with-odds fell to 1.47bb, a new turn thin bet appeared that the solve
calls a toss-up, and it lost a good play the audit agreed with (a flop call) while naming
as a good play the turn call the solve rates −27bb. The rule for adopting a weight is
that agreement rises and no agreed finding is lost, so the weights are unchanged. The
continuing likelihoods were not tried: 18 nodes are too few, and the defence the model
gives is minimum defence, a property, not a guess.

**The fixed costs** (a thin raise 5% of the raise, a bluff into several players 30% of the
bet, a flagged size 4% of the pot, a missed raise 25% of stack or pot) could not be
measured: no such finding falls on a heads-up turn or river in the logs. Of the three on
the flop, one is multiway, one (the thin raise) needs more memory than the machine has,
and the size finding, solved for 4 minutes to 4.6% of the pot, gives a gap of 0.04bb
against the model's 0.26bb. One unconverged spot is no relationship to replace a
constant with, so the four stay as they are, and stay a ranking rather than a measure.

## Not modelled

- Raises as a response to the hero's bet: a bet's EV assumes it is called or folded to.
- Range and nut advantage as inputs to whether to bet, beyond what equity captures.
- Bet sizing as a strategic choice across the range. A check-raise keeps the strength
  of the range it was made from, but is not planned as a line.
- Opponent tendencies. Every opponent is the same balanced player.
- Multi-street planning. Each decision is judged where it stands.
