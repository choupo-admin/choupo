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
