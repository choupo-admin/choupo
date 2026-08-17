# The GUI on a 390 px phone: measured, not yet fixed

*Status: FINDING, MEASURED 2026-08-17.  No fix attempted.  This is the brief
for whoever takes the fix, and the record that the defect was known before it
was closed.*

---

## 1. Where it came from

Vítor reported it from an iPhone, twice, in plain terms: the left rail ate the
viewport and nothing else could be selected.  The rail was fixed (`9e5ff796`
moved it into a top-bar menu) and **that fix was for the desktop**.  The phone
defect underneath it was never measured — it was inferred from a screenshot,
and a screenshot cannot say which controls are unreachable or why.

`bin/checkGui`'s phone pass (390×844, mobile + touch emulation) measures it.

## 2. What is actually wrong

**The app has a hard minimum width of about 480 px and clips the excess with
`overflow: hidden`, providing no scroller.**  Measured:

| box | size | contains |
|---|---|---|
| app root div | 390×844, `overflow:hidden` | 480 px of content |
| workspace container | 480×812, `overflow:hidden` | psychro's setup bar reaching x=1495 |

So the excess is not merely off-screen — **there is no gesture that reaches
it.**  A user cannot scroll to a control behind a hidden edge.

**All twelve EduTools pages lay controls out past the right edge.**  Extent
per page: psychro x=1495, mccabe x=995, the other ten x=468 — in a 390 px
viewport.

### Lost on every one of the twelve pages

| control | box at rest | clipped by |
|---|---|---|
| `button "Colour scheme"` | 22×22 @ (414,5) | app root, 390×844 |
| `button "Clipboard bridge to claude.ai"` | 22×22 @ (446,5) | app root |
| `a "open the Theory Guide"` | 22×22 @ (446,36); (446,83) on mccabe/psychro | app root |

The third is worth pausing on: the Theory-Guide link — the control the whole
Help slice of 2026-08-17 exists to make work — **is unreachable on a phone.**
Opening at the right section is worth nothing to a reader who cannot press the
button.

### Lost on the two heavy tools

* mccabe (13 controls): `pop out McCabe analyzer` 28×28 @ (921,41);
  `hide setup controls` 34×34 @ (961,38); 3 inputs at x=527/679/817 and 4
  stepper buttons at x=751/871.
* psychro (29 controls): 8 inputs from x=444 to x=1349, 16 stepper buttons
  from x=510 to x=1411, `hide setup controls` 34×34 @ (1461,38).

### And the desk is not innocent

`psychro` clips three controls past x=1411 **at 1400×900**, including
`hide setup controls` at (1461,39).  The tool is wider than the viewport it
was designed for.

## 2a. CORRECTION, 2026-08-17 — §2's headline number is the BLANK-BOOT number

The owner reported from the device what this record had described from an
emulator, and his screenshot showed something §2 does not: **the workspace tab
row itself is clipped**, `File · Flowsheet · Props · Explore · EduTools ·
Stream…`, cut mid-word.

Measured twice, independently (a general's probe and mine, agreeing to the
pixel), on a real case (`?case=steady/flash/flash01_benzene_toluene`):

| viewport | controls in the top row | beyond the edge | rightmost edge |
|---|---|---|---|
| 390×844 | 18 | **13** | x=1035 |
| 1400×900 | 18 | 0 | x=1388 |

The 13 unreachable are `Streams` (346–416, the owner's cut word), `Variables`,
`Plots`, `Log`, `Case`, `Pinch`, `Reports`, `Help`, then the icon cluster
(display settings, stream colours, colour scheme, clipboard bridge, assistant
console).  **Seven whole workspaces cannot be reached on a phone**, which is a
different order of defect from three lost affordances.

So §2's "three controls on twelve pages" is **true of the state it was measured
in and misleading as a summary**: it is the BLANK-BOOT app, no case open, where
`MenuBar`'s lineup is gated on `hasCaseOpen()` and the row is 480 px wide.  With
a case open the same row is 833 px.  The 480 px figure in §2 is that gated
state, not a layout constant.  *A number measured in one state and reported as
the defect is the same error as a number measured once and then remembered.*

### The constraint on any fix

At 1400×900 the row already spends 833 of 1400 px and has **12 px of
headroom**.  Phone room cannot be bought by shrinking tabs; the row has to
change SHAPE.

### And the harness structurally cannot see this

`bin/checkGui` walks the EduTools deep link **with no case loaded**, so the
lineup it measures is the 4-tab blank-boot one.  The 13-control loss is
invisible to it at both viewports.

Two consequences, and the second is the one that matters:

* the harness's own docstring already states the limit — "ONE workspace
  (EduTools) in its DEFAULT state".  This is what that limit COSTS, in a real
  defect, and the cost was not visible until someone opened a case;
* **arming `--gate-phone` would therefore give FALSE ASSURANCE.**  A green
  phone gate would mean "the blank app fits", while seven workspaces stay
  unreachable with a case open.  §4's instruction to arm the gate in the
  commit that fixes the defects still stands, but the gate must first walk a
  state that can see them.



`document.scrollWidth` reports **no overflow at all**.  Every overflowing edge
is hidden, so the page measures as if it fits.  A boolean overflow check —
the first thing anyone would reach for — calls this clean.

The occlusion harness nearly missed it too, in a way worth recording: at the
phone viewport **0 controls are covered at rest**, and twelve pages of "clean"
was the honest-looking answer.  What was actually true is that the reachability
question **could not be asked** of 81 controls, because `elementFromPoint` is
undefined outside the viewport.  Reporting twelve clean pages over that would
have been the harness's own coverage collapse wearing the word "clean".  So
off-viewport controls are now resolved by scrolling to them and asking again —
and only where every clipping ancestor is user-scrollable, because a probe that
scrolls an `overflow:hidden` box manufactures the state it then reports.

Observed counts differ slightly between runs (78 and 80 clipped in two runs of
the same tree).  Both are recorded rather than one being chosen; the discrepancy
is not diagnosed and the shape of the finding does not depend on it.

## 4. What a fix has to decide, and what it must not do

This record deliberately does not prescribe the fix, because the choice is a
GUI-credo question and belongs to whoever owns `docs/ai/gui-credo.md`:

* a horizontal scroller on the workspace container is the smallest change and
  the worst teaching outcome — a student swiping sideways to find a field;
* reflowing the setup bars to wrap under 480 px is the real answer for the two
  heavy tools, and is per-tool work;
* the top-bar chrome (three controls, lost on every page) is a separate and
  much smaller problem than the setup bars, and could be fixed first.

**What it must not do is make the phone pass green by lowering what is asked.**
The phone findings are currently REPORTED and not gated (`--gate-phone`
promotes them), for a stated reason: the desk baseline was agreed and the
phone's never has been, and turning a first measurement into a gate hands the
next person a red tree full of untriaged findings, which is how gates get
switched off instead of obeyed.  The gate should be armed by the commit that
fixes the defects, not before and not instead.
