# The postflop model

How `src/utils/postflop/` judges a decision after the flop. **It is a model, not a
solve**, and this page is mostly about where that matters.

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

| Action      | Kept                                                                                                           |
| ----------- | -------------------------------------------------------------------------------------------------------------- |
| bet / raise | the top of the range for value (a smaller share the bigger the bet), most draws, and enough air to be balanced |
| call        | the share minimum-defence asks for, `1 / (1 + size)`, strongest first, plus draws                              |
| check       | the complement of betting 60% pot: strength is shed, not removed                                               |

The air in a betting range is not a fixed fraction. It is scaled so that bluffs make up
the share that leaves a caller indifferent: `size / (1 + 2 × size)` on the river, and 15%
more per card to come. This gives the model a property worth having: against a river bet,
a pure bluff-catcher's equity comes out near its pot odds, so the model does not have an
opinion where theory says there is none.

**These weights are fixed and written down, not fitted to any player.** They describe a
balanced opponent. A real opponent at the stakes in the sample log is not balanced, and
this is the largest single approximation in the tool. It is the right one for a GTO
baseline; it is the wrong one for an exploitative read, which the tool does not attempt.

## Judging a decision

`judgePostflop` in `decision.ts`.

### Facing a bet

`callEv = realised × equity × (pot + call) × (1 − rake) − call`

- **Equity** is against the ranges above: exact on the turn and river, 300 seeded runouts
  on the flop. Several opponents are simulated together.
- **Realised** is 1 on the river or when the call is all-in. With cards to come it is
  discounted for position (0.95 / 1.0 in position on flop / turn, 0.8 / 0.9 out), and a
  strong draw with money behind gets a little back for implied odds.
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
betting range can be too weak. With it, a finding needs both arguments to agree.

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

- **Missed value**: the hand has over 70% equity, is ahead of what calls, and betting is
  worth clearly more. Out of position or with cards to come the cost is halved, because a
  check can still collect.
- **Thin bet**: the hand has showdown value but is behind what calls, and checking is
  worth clearly more.
- **A bluff is never a mistake heads-up.** With under 30% equity, or with a draw, betting
  and checking are both in a balanced strategy, and the model cannot tell which combos
  should do which. The one exception is a bluff with no equity into several players.

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

## Texture and sizing

`textureOf` classes a board as dry or wet (paired, suits, connectedness) and suggests a
bet: a third of the pot on dry boards, half to two-thirds as it gets wetter, two-thirds on
the river. A bet is flagged for size only when it is tiny (under 20% of the pot) or, with
cards to come, more than two and a half times the suggestion and not all-in. Solvers use
several sizes on most boards, so anything nearer than that is not an error.

## Not modelled

- Raises as a response to the hero's bet: a bet's EV assumes it is called or folded to.
- Range and nut advantage as inputs to whether to bet, beyond what equity captures.
- Bet sizing as a strategic choice across the range, and check-raises as a line.
- Opponent tendencies. Every opponent is the same balanced player.
- Multi-street planning. Each decision is judged where it stands.
