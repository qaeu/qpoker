# Design language

Why the stylesheets look the way they do. `src/styles/_palette.scss` and `_theme.scss`
hold the tokens, and component sheets reach for them rather than re-deriving a colour,
depth or duration. The reasoning lives here so a sheet's comments can stay to a line.

## Conventions

- Each component has its own sheet under `src/styles/<view>/`, starting with
  `@use '../base' as *`.
- Reach for `_theme.scss`'s material and control mixins and its motion and height tokens
  before writing a background, control state or duration of your own.
- BEM-like class names, shallow selectors, no inline `style` attributes.
- Dark mode is `.dark-theme` on `<body>`, which deepens the felt. Nothing sets it yet.

## The table is the ground

The app is a card table seen from above, so the ground is baize and every scale in
`_palette.scss` is a _dark_ scale: step 1 the deepest surface, step 12 the lightest ink.
That inverts Radix's light scales (hence no Radix imports), but the slot names
`_colourset()` maps keep their meaning: `bg` is what a surface is painted, `fg` what text
is set in.

Four materials:

- **Baize** (`baize` scale and mixin): the table. Two repeating gradients are the nap, a
  radial is the pit light. The light is fixed to the viewport and the cloth is not: a
  scrolling light stretched to the content's height and slid off the top of a long
  page, while a nap that holds still under a moving page reads as texture on glass. Pinning
  the radial compresses it into one screen, so its fall-off is widened and stops at
  `$felt-deep` rather than `--baize-1`, roughly halving the lightness spread under the EV
  grid's fills.
- **Rail** (`rail` scale and mixin): the padded mahogany edge, the one surface that is not
  felt, which is what makes the felt read as a table. Surfaces only, no ink.
- **Panel** (`$panel`, used by the `card` mixin): an opaque patch of table a shade deeper
  than the felt, so panels never stack translucency. `card` holds it just short of opaque
  because the felt under it varies down the page and a fully opaque panel would sit at a
  different depth at top and bottom. Panels with something other than felt behind them
  (the select menu, the drawer, the figure bands' tiles) stay opaque.
- **Card stock** (`$stock…`, `card-stock` mixin): warm, bevelled, dropped onto the felt.
  Not a scale; a card is a card.

Nothing in the data views floats. A panel is bounded by a printed hairline (`$rule`,
`$rule-strong`): ink, not a lighter-grey border, because there is no lighter grey here.

### Two grounds, two inks

Cream on baize is the app's voice, in three steps: a figure is `$ink`, the label naming it
`$ink-muted`, and `$ink-faint` is for text qualifying something else (a placeholder, a
house rule, a footnote). They exist because the sheets had each derived their own, at
several alphas for the same job.

The two reduced steps are cream at 0.8 and 0.7 alpha, set by measured contrast rather than
by eye, because both carry text as small as 12px and that needs 4.5:1. Against the grounds
text actually sits on:

| Ink                | Felt (`$felt`) | Panel in a `card` | Opaque `$panel` |
| ------------------ | -------------- | ----------------- | --------------- |
| `$ink` (1.0)       | 6.6            | 7.7 to 8.3        | 10.4            |
| `$ink-muted` (0.8) | 4.8            | 5.5 to 5.9        | 7.2             |
| `$ink-faint` (0.7) | 4.1            | 4.6 to 4.9        | 5.9             |

They were 0.6 and 0.35, which measured 3.4 and 2.1 on felt: a label under a figure failed,
and a footnote was barely there. A `card`'s range is because it is half-transparent over
felt that is lit at the top of the page and not at the foot. Two things follow from the
table. Faint ink clears 4.5:1 only on a panel, so a footnote set on bare felt (under the
Review hand, under the Openings table) takes `$ink-muted` instead. And directly under the
pit light, where the felt is `$felt-lit`, muted ink measures 4.2: that patch is the top of
the first screen, which the header's shadow and the stat band occupy, and raising muted
further would leave it indistinguishable from full ink. Faint keeps one job where contrast
is not the point: the label of a range-grid cell that was never held, which is meant to
recede.

`PlayingCards.scss` is the one inverted ground: a card is card stock, with black and red
ink (`$stock-ink`, `$stock-ink-red`). Mint and ruby go muddy on cream, so nothing on a
card is coloured by sign.

## Depth

`$cut-trace` → `$cut-pressed` is one ramp of black over baize: how far into the table a
surface is sunk. Five cuts plus `$scrim`, which ends the ramp although it is the darkness
_behind_ a lifted object; four steps could not be spaced without a visible jump, and
sixteen ad hoc alphas were in use before.

Radius says what a thing is made of, matching the shadows: 2px cut into the felt, 3px a
panel laid on it, 6px a lifted object catching real light. Left as literals. One object
sits outside the ladder because it is too small and would round into a lozenge: a playing
card at list size, which takes 3px.

Shadows are black and heavier than on white, because on baize an object is told from its
surface by the light it blocks. `shadow()` takes a direction for the one object that doesn't
lie flat: the rail overhanging the felt. Two local `box-shadow`s stay hand-written: a
cut only a few pixels deep (a field) uses `inset 0 1px 2px`, which `shadow-inset`'s 12px
blur would fill solid; and a playing card, too small for the lifted object's full shadow.

## Print

`print()` is lettering stencilled on the felt: the condensed face, tracked out, in cream.
It defaults to uppercase, as a table is lettered; pass `$caps: false` for sentences, since
prose in capitals is hard to read. Headings are the same material as the lettering on a
layout, so are set the same way.

Figures are printed numbers: Archivo Narrow, tracked tight, `tabular-nums` so a figure
does not jitter its width as it recalculates.

## Colour carries meaning

Gold is the one bright object on the table, so it is the accent: whatever is _the one in
play_ is gold (focus rings, the live tab's underline, the selected hand, the hero's own
lines in a replay).

The two ways of continuing have fixed hues, in the range grid and wherever else they are
drawn: **raise gold** (`$primaries`), **call mint** (`$successes`). Folding has no colour;
it is the felt showing through. A mixed hand is a split cell, raise first, so frequency is
read as width rather than as a tint that has to be decoded.

Where a second range is laid over the fill (the Openings view: what was played, over
what the chart opens) it is a hairline printed round its cells, not another fill: two
fills in one cell could not both be read as width. A hand never held there is set faint,
which is what tells "folded it" from "was never dealt it".

Severity has its own three: an inaccuracy sky (`$infos`), a mistake gold (`$warnings`), a
blunder ruby (`$errors`). They mark a card's edge and its label and never fill it: a page
of mistakes filled red would be unreadable, and would say every one of them was the worst.

A good play is marked the same way in mint, with its gain as a signed figure. "Good" and
"great" share the one colour and are told apart by the label: a second green would have to
be decoded.

In the Review list a finding is a line of text with no edge to mark, so its rank is set in
the scale's lighter step (`fg-light`): the `base` step that draws a card's edge is too
dark to read as 10px lettering on felt.

Mint is money the player's way, ruby the other way, on any signed figure.

A link in the page is gold and underlined. Gold alone would not do, since gold also marks
the selected thing, which goes nowhere; the underline is what says "this leads somewhere".

### Cards are card stock

Hole cards and boards are small tiles of the `card-stock` material, the one inverted
ground in the app: black and red ink on cream. Suits are told apart by pip and by the
usual two colours, not four, because that is how the cards in the log's own client look.

### Two inline styles

`RangeGrid` sets two custom properties per cell (`--raise`, `--call`) and the sheet turns
them into the fill. The frequencies are data, 169 of them, and there is no class that
could carry them.

The Summary's "Where the losses went" does the same with one: each row's bar takes
`--share`, that kind's loss as a fraction of the costliest kind's, and the sheet turns it
into a width. The bar is drawn against the worst leak rather than the total so that the
first row is always full and the rest are read against it; against the total, a session
with many small leaks would show a column of slivers.

Everything else stays in the sheets.

## Motion

Three durations, so a control's states are told apart by speed: `$dur-fast` (press,
hover-in), `$dur-base` (hover-out, colour), `$dur-slow` (a recalculated figure settling),
all on `$ease`.

Nothing here animates on its own: motion is only ever a control answering the pointer.

## Controls

`button`, `form-control`, `tab`, `icon-button` and `disabled-control` each carry
every state (hover, press, focus, disabled) and the touch floor, so a new control takes one
rather than painting its own. `$control-height` is what a field, button and tab in one row
share; `$control-height-touch` is the 44px target applied under `touch`.

A control is cut into the felt with a lit top edge and sinks under a press, which shows a
click landed before its result arrives. A field's focus lights its own cut edge rather than
floating the global ring 2px off a recess: the border is where the field ends. `.highlight`
marks the one to press with gold hairline and ink but no fill, so `.active`'s gold keeps
meaning "selected".

Anything the pointer or keyboard lands on is marked gold, and a rule the table forbids
looks forbidden the same way everywhere (`disabled-control`).

### The segmented control

`Segmented` (`#c/common/Segmented`) is one choice out of a few with all of them on show: a
row of keys, each the `button` mixin, the chosen one in `.active` gold. It replaced the
`<select>`s on the Review filters because there the options are few, their counts are
worth seeing before choosing, and a menu hid both. A `<select>` is still right where the
options are many (the Ranges spot list). It is Ark's segment group underneath, so it is a
radio group to the keyboard and to a screen reader: arrow keys move the choice, and focus
is shown on the key because the radio itself is hidden. Ark's sliding indicator is not
used, since it positions itself with an inline style and nothing here animates on its own.

The same gold-when-chosen key is the seat toggle in the Openings table, where the row's
name and the control that picks it are one thing; that one is a plain `aria-pressed`
button, because it sits in a table cell rather than in a group of its own.

### The "on baseline" tag

In a replayed hand, each of the hero's decisions carries a small outlined tag at the end
of its line. One the baseline has no quarrel with is tagged in muted ink: most decisions
in most hands are right, and a card for each buried the one or two that were not. The tag
is deliberately not mint: mint is a good play, which is a hard decision got right, and an
easy fold is not that. Where the baseline leaned the other way but not by enough to name a
mistake, the tag reads "near baseline", so the page does not claim agreement it does not
have.

A mistake's tag is its severity and its cost, a good play's its rank and its gain, in the
finding's own colour: outline and lettering, never a fill, as on a card's edge. That is all
the line says. The card is in the caption under the table (see below), so the list stays a
list: twenty lines that can be read down, not a column broken open wherever something
went wrong.

## The replay table

A reviewed hand is drawn on a table of its own (`#c/hand/HandTable`): the app's ground
made literal. Its edge is the `rail` material, here doing the job it was named for, round
an oval of felt with its own pit light. That light is fixed to this cloth, not to the
viewport as the page's is, because this table is an object on the page and scrolls with
it.

- **Seats** are plates of opaque `$panel` at the rail, by position, the hero always at the
  bottom and the rest clockwise in acting order. A short-handed table keeps the six
  places and leaves some empty, so a seat is in the same place from hand to hand.
- **Seven to nine players sit at nine places** round the same oval (`hand-table--full`):
  three up each side, two along the top, one each side of the hero. The plates give up
  width and the cards a little size, and nothing else changes. Seven leave the two
  places beside the hero empty, so the hero is alone at the bottom as at six. There is
  no top-centre place: two plates share the top, where one would sit over the pot.
- **A seat's state** is said three ways at once. The plate's edge is gold for the seat
  that just acted and mint for one that was paid. A printed tag names its last action. A
  folded seat loses its cards and is dimmed to half: still at the table, no longer in the
  picture. The dimming takes its text under 4.5:1 on purpose, as a never-held cell in the
  range grid is faint on purpose.
- **Chips** take the fixed hues: a bet or a raise gold, a call mint, a blind sand, since a
  blind is nobody's choice. An all-in is tagged as one and not drawn differently. Side
  pots are not drawn; there is one pot figure.
- **Cards** are card stock at a third size, with a corner index over a centre pip. Other
  players' are face down, in the one place the app shows a card's back, until the result
  turns over the hands that were shown.
- **Figures are big blinds** on the table and in the caption, because that is the unit a
  grade is in. The list of lines keeps the log's own currency, as the CLI prints it.

### One step, after the action

A step is the table _after_ something happened: the deal with the blinds out, each
voluntary action, each street's cards, and the result. After, not before, because the
seat that acted is then the one lit and its bet is on the felt, which is what the line
being read describes. What the actor faced (the pot before, the price) is said in the
caption.

An uncalled bet goes back when the betting ends, before any runout, so the pot shown
while the board runs out is the pot being played for.

### The caption owns the grade

Under the table sit the strip and then the caption: where in the hand the step is, the
action as a sentence, the pot (or the price, when the hero faced a bet), and the grade if
the action was one of the hero's decisions. The mistake card and the baseline chart moved
here from under their line in the list. Beside the table is where the eye is when the
decision is on it, and the card is then read against the stacks and the board it is about.

Under the pot line the caption gives the hero's equity at the step, in the same muted,
tabular line: `Equity about 62% · an estimate against 2 modelled ranges`. It is whole
percent and worded as an estimate because it is the model's, and it names how many ranges
because that is what makes a preflop 30% and a heads-up 65% the same hand. It is a line
of the caption and not a figure on the felt: the table shows what happened, and this did
not happen. The line is absent, not dashed, where there is no figure, so a folded hand's
caption is shorter rather than marked.

The strip comes before the caption, though the caption describes the table, because the
caption's height changes with every step (a line of text, or a card and a chart) and keys
that moved under the pointer could not be pressed twice.

The strip has a tick per step, grouped by street and as wide as the street was long. The
hero's decisions are gold, a mistake takes its severity colour and a good play mint, dim
ahead of the step and lit behind it, so the hand's shape and where it went wrong are seen
before it is walked.

### It does not animate

Chips do not slide and cards do not flip: nothing here animates on its own (see Motion),
and a step is a state to read, not an event to watch. Stepping back is as instant as
stepping forward, and holding an arrow key runs the hand at the keyboard's repeat rate.

The step is in the address (`step=`), like the rest of Review's state, so a reload or a
shared link lands on the same moment. Stepping rewrites the history entry; it is not
somewhere to come back to.

### Laid out by the pane, not the window

The detail pane's width depends on the window, the list beside it and the page's maximum,
so the hand lays itself out by container query on its own width:

- **Wide** (860px and up): the table, strip and caption beside the action.
- **Narrower**: the same, stacked, the table first.
- **Under 480px of table**: the oval is stood on end, the mockup's phone board, because
  six plates do not fit round a landscape table that narrow.

The stage has a fixed aspect ratio and everything on it is placed by percentage, in a
class per place (`--slot-0` to `--slot-5`, and `--slot-10` to `--slot-18` for the nine
places of a fuller table), so it scales without a script and without an
inline style.
