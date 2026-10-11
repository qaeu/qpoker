# pokeranalysis — GTO hand-history coach

Reads a PokerStars hand-history file for No-Limit Hold'em cash games and tells the player
where they went wrong: every decision is graded against a GTO baseline, the mistakes are
ranked by what they cost, and the session's frequencies are set beside what the baseline
would have done in the same spots.

It runs entirely on your machine, as a command-line tool or as a page in the browser.
Nothing is uploaded.

## Installation

```bash
npm install
```

Needs Node 22 or newer.

## Command line

```bash
npm run analyze -- path/to/HandHistory.txt
```

Prints the session summary, your opening ranges by seat beside the charts, the leaks by
kind, the costliest mistakes with the hand replayed and an explanation, and then the good
plays: the right decisions that were hard to make. Options:

| Option               | Meaning                                                     |
| -------------------- | ----------------------------------------------------------- |
| `--hero <name>`      | Player to coach. Default: the player the log was dealt to.  |
| `--top <n>`          | Mistakes, and good plays, to print in full. Default 15.     |
| `--min-severity <s>` | `inaccuracy`, `mistake` or `blunder`. Default `inaccuracy`. |
| `--hand <id>`        | One hand, with every decision graded.                       |
| `--json`             | The whole report as JSON.                                   |
| `--seed <n>`         | Seed for the equity simulations. Default 1.                 |
| `--samples <n>`      | Runouts sampled per equity calculation. Default 300.        |
| `--rake <fraction>`  | Rake as a share of the pot. Default: taken from the log.    |
| `--no-color`         | Plain text.                                                 |

`npx pokeranalysis <file>` does the same once the package is linked or installed.

## In the browser

```bash
npm run dev      # http://localhost:3000
npm run build    # static site in dist/
```

Drop a log on the page. **Summary** has the result and the frequencies, **Mistakes** the
ranked list, **Good plays** the right decisions that were hard to make, **Hands** every hand replayed with its grades and the chart each preflop
decision was judged against, **Openings** the hands you opened from each seat drawn over
the chart for it, and **Ranges** the preflop charts themselves.

## What it reads

PokerStars text histories, either saved by the client or requested by email (those arrive
quoted-printable, which is decoded). No-Limit Hold'em cash games at tables of two to six
players; a fuller table is graded with the earliest seat's charts. Other games are parsed
and counted but not graded.

## How far to trust it

- **Preflop** decisions are checked against range charts for each position and spot, at
  two stack depths. The charts are hand-written approximations of published solver
  ranges, not solver output; they are plain data and can be replaced.
- **Stacks going in** preflop are priced exactly: equity against the shoving range,
  against the pot odds.
- **Postflop** decisions are judged by a model of the opponent's range, not by a solver.
  It asks the questions a solver's answer rests on (is the price right, does worse call,
  must this part of my range defend) and marks each finding with a confidence.
- EV figures are estimates in big blinds. They rank mistakes well; they are not a
  measurement.

The reasoning is in [docs/](./docs): [preflop](./docs/preflop-model.md),
[postflop](./docs/postflop-model.md), [the coach](./docs/coach-model.md), and
[the log format](./docs/history-format.md).

## Development

`npm test`, `npm run typecheck`, `npm run lint`, `npm run format`. See
[CLAUDE.md](./CLAUDE.md) for the architecture and [TESTING.md](./TESTING.md) for the tests.

## License

[AGPL-3.0](./LICENSE)
