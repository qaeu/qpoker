# The hand library

Every hand ever loaded is kept, so that a report can be made over any of them, a trend
can be read across sittings, and a player met again is already known. This page is what
is stored, why it is in the shape it is, and how it is kept right.

## What it has to carry

Measured on a 100-hand log, and again on 10,000 hands made from it:

| Per hand                            | Size / cost | 10,000 hands | 50,000 hands |
| ----------------------------------- | ----------- | ------------ | ------------ |
| Its own text                        | 1.1 KB      | 11 MB        | 53 MB        |
| The light half of its report        | 0.8 KB      | 8 MB         | 40 MB        |
| The heavy half (gradings, equity)   | 3.2 KB      | 32 MB        | 160 MB       |
| Grading it (the equity simulations) | 8.5 ms      | 85 s         | 7 min        |

Three things follow, and they are the design:

- **`localStorage` cannot hold it.** Its five megabytes are a thousand hands. The
  browser's library is IndexedDB.
- **Nothing may load every hand in full.** A list, a summary or a trend reads the light
  halves only; the heavy half of a hand is read when the hand is opened.
- **Grading is the one costly step**, so a hand is graded once, a run commits as it goes,
  and what forces a hand to be graded again is kept as narrow as it can be.

On those 10,000 hands in the file store: loading them all again grades nothing and takes
half a second; reading every light half takes 50ms; the report and the trend over all of
them 20ms; one hand's heavy half 200ms cold.

## Three tiers

| Tier        | What                                               | Rebuilt from | Cost    | Version          |
| ----------- | -------------------------------------------------- | ------------ | ------- | ---------------- |
| **Text**    | The hand's decoded lines                           | —            | —       | —                |
| **Summary** | `HandSummary`: what a list and every sum read      | the text     | ~0.1 ms | `FACTS_VERSION`  |
| **Detail**  | `HandDetail`: gradings in full, equity, the action | the text     | ~9 ms   | `REPORT_VERSION` |

The text is the source of truth and is always kept: `parseHands` hands back each hand's
own lines beside it, and they parse to the same hand, digest included. So no change to
the coach loses anything. A change to how a decision is graded bumps `REPORT_VERSION` and
every hand is graded again from its text. A change only to a summed figure (a tally, an
opening spot, a new summary field) bumps `FACTS_VERSION`, and a hand is **summed up
again** from its text with the gradings it already has (`reportHand`'s `graded`
argument), which costs no simulation.

`HandReport` is the two halves together (`splitReport` parts them), so `analyzeLog`, the
one-shot CLI and the JSON it prints are as they were.

### What is in a summary

Everything a report says of its hands together is summed from their summaries by
`summariseHands`, with no hand's text or replay in memory:

- the hero's **tally** (`HandTally`): the hand's count, opportunities and baseline sum for
  each session stat it gave an opportunity for. `summariseSession` is the fold of these
  (`addTally`, `sessionOf`);
- the hero's **opening spot** (`OpeningSpot`), which `summariseSpots` folds into the
  Openings rows;
- its **findings**, each mistake or good play cut down to what a list filters and orders
  on, and `played` and `scenarios` for the same reason;
- `reconciled`, `stakes`, and what a hand's report already said of itself.

The equality is tested: `summariseHands` over a log's summaries, after a trip through
JSON, equals what `analyzeLog` reports.

## What a stored hand's report hangs on

A hand's report depends on its own text and on a `GradeKey`: the two versions, the hero,
the seed, the sample count, and the rake its gradings were priced at (null when none read
it, which is most hands: see "Reusing a report" in [coach-model.md](./coach-model.md)).
`stalenessOf` compares a stored key with the library's settings and says `regrade`,
`resum` or nothing. **A stale hand is left out of everything shown** until a run brings
it up to date, as a cached report from an older build used to be dropped rather than
rendered wrong.

Two things had to change for a hand's grade not to depend on which file it came in:

- **The rake is each stakes level's own**, over every hand loaded at that level
  (`LibraryMeta.rakes`, `rateOf`), still rounded to half a percent. A one-file analysis
  takes it from that file. An import works out the rates as they will stand once its
  hands are in, grades at those, and grades again only the stored hands priced at a rate
  that has moved.
- **The hero is whoever a hand was dealt to.** A history is one person's under however
  many screen names, and a library tied to the first file's name would leave every hand
  from another account ungraded (which is what the two sample logs in the repo root
  turned out to be). `LibraryMeta.hero` is empty unless the user names one (`--hero`), in
  which case every hand is graded for that player. The name a report is headed with is
  the one most hands are graded for; all of them are left off the Players list.

## Loading a log

`store/ingest.ts`, a run that advances a few hands at a time like an analysis does:

1. Parse the log. A hand the library has, by id and digest, is passed over. One whose
   digest differs (it was half-written the first time) replaces the stored one.
2. Queue behind those any stored hand that is stale.
3. Grade a chunk, and commit it: the hands, the players they add to, and the rake sums,
   in one write. A run cancelled or cut short has lost nothing it committed, and the
   next run finds only what is left.
4. Record the import with the last chunk.

A run with no text is step 2 onwards: it is how the app brings a library up to date after
a new build. In the browser the worker does the writing
(`analysisWorkerProtocol.ts`) and posts progress and a completion, not a report; the page
then reads the library.

Files dropped or picked together are one request, loaded one after another in the order
they came, each a run and an import of its own: one cancel stops the lot, keeping the logs
already finished. They are not set end to end into one log, so that the library still
says which file a hand count came from. The cost is that a later file can move a stakes
level's rake under hands an earlier one has just graded, and those are graded again by
the run that moves it. A file with no hands in it does not stop the rest: the completion
names it and the page says so. An import's key is its time, so the page hands each file
of a request a millisecond of its own.

## Forgetting a log

`store/forget.ts`, and the `x` that ends each row of the library's table on Trends. An
import records the id of every hand in its file (`ImportRecord.handIds`), not only the
ones it added, because a hand is the library's and not a file's: **forgetting a log
takes out the hands no other log holds**, so a hand loaded in two files outlives either
one of them. The page says how many will go before it is done.

The hands are taken out of what was summed from them in the same commit
(`Commit.forget`): each out of its players' tallies with a `sign` of -1, from its own
text, and out of its stakes' rake. A player left with no hands is dropped. One whose
first or last sighting was a forgotten hand is looked for in what is left, from that end
of the library, reading text only until they are found. A rake the forgetting moves
leaves hands stale, and the page runs an import of nothing to grade them again, as
loading a log that moved it would.

An import made before the ids were recorded cannot say which hands were its own: its
`x` is disabled, and such a log goes only with the whole library. Its hands are not
counted as held either, so a hand it shared with a later log goes when the later one is
forgotten. The page does not forget while a run is writing.

## Players

Everything seen of a player (`PlayerAggregate`) is a running sum of `tallyHand` over the
hands they were dealt into, kept by name, with when they were seen and what they showed.
`tallyHand` reads no hole cards, so it is the hero's own session arithmetic run for
another seat. The sums are updated in the same commit as the hands, so a profile is one
read and not a scan. A replaced hand is taken back out with a `sign` of -1 before the new
one goes in, from the old text. When `FACTS_VERSION` moves, the players are emptied and
summed again as each hand is.

Beside the frequencies an aggregate keeps **money** (`MoneySeen`), in cents and by
currency, since a dollar and a euro do not add up: the player's own result over the hands
they were dealt into, and the hero's result against them. The second is `wonFrom`: in each
hand, what a loser lost is split among the winners by what each won, the rake taking its
share. So what the hero won is taken from each loser by what they lost, and what the hero
lost goes to each winner by what they won, rounded to the cent. It is exact where a pot
had one winner or one loser, which is nearly every pot; where a side pot went another way
it is a fair split and not what the chips did. "The hero" here is whoever the hand was
dealt to, read off the text, so the sum does not move when `--hero` names someone else; a
hand that names no one adds to no one's. A hand that does not reconcile adds no money at
all, and a currency's entry is dropped when its last hand is taken back out. An aggregate
summed before the money was kept has none (`FACTS_VERSION` 2 sums it again).

`store/profile.ts` reads an aggregate: see "Opponent profiles" in
[accuracy.md](./accuracy.md) for what a read claims. **It is display only.** No grading
reads a profile, so a hand's grade is still a function of its text, the seed and its
stakes' rake.

## Sittings and scope

`coach/sessions.ts`. A **sitting** is a run of hands with no gap of more than thirty
minutes, read off the hands' own times: files are how hands arrive, not how they were
played. A **scope** is which hands a report is over: `all`, `latest` (the last sitting),
`week`, `month`, or one sitting by the time of its first hand. The days are counted back
from the last hand and not from the clock, so a report stays a function of its hands.
Every hand is the default. The scope is in the address (`?scope=`), like the rest of what
decides a view.

## The stores

`HandStore` (`store/types.ts`) is the one seam. A commit is atomic. There are three:

- **`memoryStore`**: the reference, and what the tests run on. It copies on the way in
  and out, as a real store would.
- **`idbStore`**: IndexedDB. Object stores `rows` (the summary and key), `details`,
  `raw`, `players`, `imports` and `meta`; a commit is one transaction. The page and the
  worker each open it.
- **`cli/fileStore`**: a directory (`~/.qpoker`, `--library`, `$QPOKER_LIBRARY`) of
  JSON-lines files that are only added to, a later line for a hand winning: `rows.jsonl`
  read on every run, and `details/` and `raw/` a file a month, read for the months asked
  of. A commit is written whole to `journal.json` first and applied again if a run died
  in it; every write is safe to repeat. Forgetting is the one write that is not an
  addition: the files a forgotten hand is in are written again without it, the heavy
  halves before the rows that say which month they are in, so the text is gone too.

All three are held to one contract (`tests/utils/store/stores.test.ts`).

A copy for safekeeping (`store/backup.ts`) is a `.json` of the hands' text. Loaded back
in, it is read as the log it amounts to. **It carries other players' screen names**, as
the library itself does; the library never leaves the machine.

## Not done

- **The command line forgets no single log.** The file store can (it is held to the
  contract), but `library` only offers `--clear`.
- **The file store is never compacted.** A hand graded again adds a line and the old one
  stays. It costs disk, not correctness.
- **No statistics beyond the session's ten.** A profile could use a limp rate, a fold to
  a steal and an aggression figure; each is a `StatId` and a `FACTS_VERSION` bump.
- **A known opponent is not noted on the replay table.** The profile is one click away
  in Players.
- **The Review list is drawn 200 rows at a time**, not windowed.
