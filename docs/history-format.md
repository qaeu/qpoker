# The hand-history format

What `src/utils/history/` reads, and the quirks that shaped it. Three stages, each a pure
function: `decode` (bytes of a mail export to clean text), `parse` (text to `Hand[]`),
`replay` (a hand to the state at every action).

## Decoding

A history saved by the PokerStars client is plain text. One requested by email is
**quoted-printable**: every trailing space is `=20`, and any line past 76 columns is
folded with a `=` soft break, wherever that falls:

```
PokerStars Hand #262311564774:  Hold'em No Limit ($0.02/$0.05 USD) - 20=
26/10/06 3:37:57 WET [2026/10/05 22:37:57 ET]
Seat 3: Parazitu1988 (button) showed [Jc Jh] and won ($4.49) with three=
 of a kind, Jacks (pot not awarded as player cashed out)
```

`decodeHistory` detects this by the soft breaks, joins them, decodes `=XX` runs as UTF-8
(a non-ASCII screen name is several bytes) and normalises CRLF. A plain file passes
through untouched but for its line endings, so a stray `=` in one is safe.

The email form also puts a `*********** # N **************` divider before each hand and
lists the hands **newest first**. The parser drops the dividers and sorts by timestamp,
then hand id.

## Parsing

One hand runs from a `PokerStars Hand #` (or `Zoom Hand #`, `Game #`) line to the next.
Sites on the PokerStars network write the same format under their own name
(`Betfair Hand #262360359534:`), so the header accepts any brand words before
`Hand #<digits>:` rather than a list of them. The file may still be named `PokerStars_…`.
The parser never throws on a line it does not know. It adds to `hand.warnings` and
carries on, so one odd line costs a note in the report rather than the file.

- **Money is integer cents.** A hand has to reconcile exactly, and floats of dollars do
  not.
- **Players are matched by name, longest first.** Names hold spaces, dots and dashes
  (`Omar Hrn`, `Mr.KOAAALA`), so a line is not split on its first colon.
- **A raise's amount is what it added.** `raises $0.57 to $0.82` after having put in
  $0.15 is an action of 67 with `to: 82`. The parser tracks each player's commitment on
  the street to work that out.
- **Posts.** The first small blind and every big blind are live. A second small blind,
  and whatever a `posts small & big blinds` exceeds one big blind by, are dead money:
  in the pot, not in the poster's street commitment.
- **Winnings come from the summary**, not the `collected` lines. A player who cashes out
  their equity is not sent a `collected` line; the summary still credits the pot, and
  `cashedOut` records what they were actually paid.
- **Shown cards** are read from showdown lines and from the summary's `showed` /
  `mucked`.
- **Not graded:** anything that is not No-Limit Hold'em, tournaments, antes and
  straddles, run-it-twice, a table of more than nine. Those hands are parsed and counted, marked
  `gradeable: false`, and say why in `warnings`.

Table chatter (`joins the table`, `has timed out`, `said, "..."`, `will be allowed to
play after the button`) is recognised and ignored.

## Replaying

`replayHand` walks the actions keeping the pot, each stack and who has folded, and
records a `Step` per action: the pot before it, the price to call, the actor's stack, the
bets and raises so far on the street, who is still live, and the effective stack.

- **Positions are counted back from the big blind**: BB, SB, BTN, CO, HJ. A
  short-handed table loses its earliest seats. Heads-up the small blind is the button. A
  dead small blind leaves no SB seat.
- **The seats before the hijack are named by how many there are**: one is UTG, two are
  UTG and LJ, three UTG, UTG+1 and LJ, four UTG, UTG+1, UTG+2 and LJ. So a six-handed
  table is UTG, HJ, CO, BTN, SB, BB as it always was, and no seat is ever named twice.
  More than nine players dealt in have no layout and the hand is not graded.
- **`Layout.extra`** counts the seats with more than five players left to act, which is
  more than any chart was written for: none at six players, one at seven, three at nine.
  See "Fuller tables" in [preflop-model.md](./preflop-model.md).
- **The dealt-in players are those who posted or acted**, which excludes a seat that is
  sitting out or waiting for the button. The table's size is that count, hand by hand,
  not the `N-max` in the header: a nine-max table with three seats away is a six-handed
  hand. `Seat.sittingOut` records the flag and decides nothing.
- **`toCall` is capped at the actor's stack**, so a shove for more than they have is
  priced at what they can lose.
- **`effectiveStack`** is the smaller of the actor's stack and the deepest live
  opponent's, as they stood at the start of the street.
- **`live` is in postflop acting order**, so the last name is the player in position:
  the blinds first, then everyone else in the order they acted preflop. The order is
  taken from the seating, not from the seats' names.

### Reconciliation

`reconciled` is true when the chips the actions put in, less uncalled bets returned,
equal the summary's total pot, **and** the payouts plus the rake equal it too. It is the
parser's self-check: every one of the hundred hands in the log this was built against
reconciles. A hand that does not is reported and left ungraded rather than graded on
numbers that are wrong.

`net` is each player's result: what they were paid (or cashed out for) less what they put
in.
