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

## The opponent's range

`villainRange.ts` starts each opponent with the range of their preflop line and reweights
it by every postflop action, according to where each combo stands in the range on that
board (`rankRange`: its percentile by made hand, plus a draw flag).

| Action      | Kept                                                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| bet / raise | the top of the range for value (a smaller share the bigger the bet, a tenth for a raise), most draws, and enough air to be balanced |
| call        | the share minimum-defence asks for, `1 / (1 + size)`, strongest first, plus draws                                                   |
| check       | the complement of betting 60% pot: strength is shed, not removed                                                                    |

The air in a betting range is not a fixed fraction. It is scaled so that bluffs make up
the share that leaves a caller indifferent: `size / (1 + 2 × size)` on the river, and 15%
more per card to come. This gives the model a property worth having: against a river bet,
a hand that beats only the bluffs has equity within half a point of its pot odds, so the
model does not have an opinion where theory says there is none.

The property is narrower than "any bluff-catcher". Middle hands that bet are counted as
value when the air is sized, so a hand just under the value threshold is given 44.9%
against a pot-size bet that needs 35.1%. There the model does have an opinion, and it is
to call.

**A check is read without its context, and this is the model's largest measured error.**
The reweighting cannot see position, who bet the last street, or whether a raise follows.
Checks compound: after check-call, check-call, check, only 2.4% of the range comes from
its original top fifth, against 25.3% for the same two calls made in position. A
check-raise is flat across strength, because the raise takes the top of a range the check
has just stripped. Hands judged against such a range are given equities over 90% that
they do not have: three findings and 38.71 of the 74.40bb the two sample logs were said to
lose after the flop. See findings 1 and 3 in [accuracy.md](./accuracy.md).

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
  on the flop. The runouts are drawn with replacement, about 262 distinct of 1,081, and
  heads-up flop equity has a standard deviation of 0.7 to 2.9 points. Several opponents
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
who bet the last street, so a missed value bet is found where the hero does that with a
strong hand out of position. On the sample logs 5 of the 10 missed-value findings were
judged wrong: three for this reason, two for the check reweighting above.

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
careful side of the table above.

## Texture and sizing

`textureOf` classes a board as dry or wet (paired, suits, connectedness) and suggests a
bet: a third of the pot on dry boards, half to two-thirds as it gets wetter, two-thirds on
the river. A bet is flagged for size only when it is tiny (under 20% of the pot) or, with
cards to come, more than two and a half times the suggestion and not all-in. Solvers use
several sizes on most boards, so anything nearer than that is not an error.

A board is called monotone only when every card shares a suit, which is a flop. Three or
more of a suit on a later street is "three to a flush" or "four to a flush". Either way a
flush is possible and the board is sized as wet.

## Not modelled

- Raises as a response to the hero's bet: a bet's EV assumes it is called or folded to.
- Range and nut advantage as inputs to whether to bet, beyond what equity captures.
- Bet sizing as a strategic choice across the range, and check-raises as a line.
- Opponent tendencies. Every opponent is the same balanced player.
- Multi-street planning. Each decision is judged where it stands.
