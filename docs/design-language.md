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

In a replayed hand, a decision the baseline has no quarrel with is a small outlined tag at
the end of its line, in muted ink, and not a card. Most decisions in most hands are right,
and a card for each buried the one or two that were not. The tag is deliberately not mint:
mint is a good play, which is a hard decision got right, and an easy fold is not that.
Where the baseline leaned the other way but not by enough to name a mistake, the tag reads
"near baseline", so the page does not claim agreement it does not have.
