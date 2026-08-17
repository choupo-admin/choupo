# The GUI on a 390 px phone: measured, then fixed and gated

*Status: FIXED and GATED 2026-08-17.  §5 records what shipped and what it
cost; §1-§3 are kept as written, because the record of how a defect was found
and mis-summarised is worth more than a tidy retelling.*

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

## 3. Why nothing caught it, and why the obvious check would not have

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

---

## 5. What shipped, 2026-08-17

**One CSS default was the root cause.**  A grid item defaults to
`min-width: auto`, so the shell's single `1fr` column was sized by the widest
item's min-content -- the header row.  The whole app, workspace included, was
laid out at 480 px on a 390 px phone and clipped.  `minWidth: 0` on the header
item took **ten of the twelve tool pages to zero clipped without a single tool
being touched**: their setup strips already carried `overflow-x: auto`, and
that scroller was useless while an ancestor was wider than the screen.  §2 and
§3 had filed those as two problems; they were one.

Then, in order: the header takes two 32 px lines below `sm` and the eleven
workspace tabs collapse into ONE dropdown (not a scroller -- the strip is
833 px, so a scroller leaves ~55 % of it, Reports and Pinch included, behind a
gesture with no affordance saying they exist); mccabe's and psychro's setup
bars reflow from ONE home (`setupBarLayout`); and psychro's desk overflow is
decided by whether the bar FITS, not by a phone breakpoint -- Stage 2 did not
fix it for free, which was verified rather than assumed.

Measured, both viewports:

```
X-axis clipped   81 -> 0
clipped total    85 -> 6   (all Y: the pre-existing collapsed "Copy propsDict" fold)
owner's state    13 of 18 top-bar controls unreachable -> 0; rightmost 1035 -> 378
```

**One desk count moved and it is the fix landing, not a number anyone edited.**
`desk/psychro` 34 -> 37 checked, with off-viewport 4 -> 1: the population is 38
in both readings, and the three that crossed are exactly the Stage 3 trio (two
steppers at x=1411 and `hide setup controls` at x=1461).

### The gate is armed, and only because both conditions were met

§4 said the gate must be armed by the commit that fixes the defects, and §2a
added a second condition: the walk had to reach a state where the worst of them
lives.  Both hold now.  `checkGui` gained a THIRTEENTH page -- the same
workspace with a real sealed case open -- so the case-open shell, which is
where 13 of 18 controls were being lost, is inside the gated walk instead of
outside it.  `phone` is `gated: true`.

```
DESK  1400x900 (gated): 406 controls over 13 pages
PHONE  390x844  (gated): 397 controls over 13 pages
CLIPPED: 6 (0 on the X axis)          exit 0
```

### Not closed, and named

* **A single run is not gospel.**  `vanheerden` was observed reporting
  `9 checked` on two consecutive runs and `35` on a third, on a tool nobody had
  touched -- intermittent page-render timing, not a defect in the app.  A gate
  that flakes will eventually be ignored; this one now has a phone arm to flake
  in too.
* Chromium emulating an iPhone is not Safari.  Every number here comes from
  emulation; the defect that started it was found by a human on the real
  device, and the correction in §2a came from his screenshot, not from the
  harness.
