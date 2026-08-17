# Modes and views: the top row is doing two jobs

*Status: DECIDED 2026-08-17 (Vítor delegated the decision: "Tu é que és o
arquiteto e peço para tu refletires e decidires a melhor forma").  No
implementation started.*

---

## 1. The two reports, which are one defect

From a phone, on the live site, Vítor reported three things:

* the left panel has no auto-hide — `FILES` and `OUTLINE` sit side by side at
  roughly 195 px each on a 390 px screen;
* the top menu "ficou curto demais" — it reads `File · Case · EduTools · Help`
  and he cannot tell where the rest went;
* and, tentatively, "será que o EduTools podia ficar na landing page?"

The second and third are the same defect seen from two sides, and the code
already contains the evidence.

## 2. The evidence is in `MenuBar.tsx` and predates this record

The workspace lineup is assembled from sets, and two labels behave unlike all
the others:

```
// "Explore" and "EduTools" are in EVERY set: both synthesize their own
// transient cases, so they are independent of the loaded case's type.
```

and, on a blank boot:

```
!hasCaseOpen(tutorialName) ? new Set(["Explore", EDUTOOLS_LABEL])
```

So the engine-side rule is already known and already written down: **Explore
and EduTools need no case; everything else is a view OF a case.**  What the
interface does with that knowledge is nothing — it renders all of them as
peers in one horizontal strip.

## 3. Why that produces exactly the two symptoms

**Length.** Eleven peers is 833 px, in a viewport of 390.  That was measured
and fixed by collapsing the strip into a dropdown, which was the right move
for the width and the wrong one for the meaning.

**Legibility.** The collapsed control is labelled with the CURRENT workspace,
so it renders as a lit tab: `Case`.  A lit tab says *you are here*.  It does
not say *ten more destinations live behind this*.  The reader's own words —
"ficou curto demais" — are the correct observation of a wrong thing: the row
is not short, it is silent about what it swallowed.

**And a mode got filed under a view.**  `Explore` — which needs no case, which
is one of only two things available on a blank boot — is now inside a dropdown
labelled `Case`.  That is a category error the flat strip made invisible and
the dropdown made structural.

## 4. The decision

**Separate the two jobs, because they are two jobs.**

| | what it is | how many | needs a case |
|---|---|---|---|
| **mode** | Explore, EduTools | 2, stable | no |
| **view** | Flowsheet, Props, Streams, Variables, Plots, Log, Case, Pinch, Reports, Control | up to 10, case-dependent | yes |

* **Modes stay visible at every width.**  They are few, they never change with
  the case, and they are the only things a visitor with nothing open can do.
* **Views collapse when they must**, and the collapsed control is labelled for
  what it OPENS, with the current one shown as its value — `Views: Case ▾`,
  not `Case`.  A selector shows its category and its value; a lit tab shows
  only that you have arrived.
* **One home still.**  The split is a rendering of `WORKSPACES` by a property,
  not a second array.  Whether a workspace is a mode is derivable from the
  fact `MenuBar` already encodes — it appears in every set and survives a
  blank boot — and that derivation belongs in one place, not repeated per
  posture.

### 4a. EduTools on the landing page: YES

It follows from the table rather than from taste.  EduTools is a **mode**: it
needs no case, it builds its own, and it is the one part of Choupo a student
can use with zero setup.  That is what a front door is for, and a student
arriving for a class wants the McCabe-Thiele diagram, not a case-opening
ritual first.

Two conditions, and the first is not negotiable:

1. **Generated from `METHOD_TOOLS`, never a hand-written list.**  A second
   list is the arity sin, and its failure mode is specific: the day someone
   adds a thirteenth tool it appears in the app and not on the landing, or the
   reverse, and nothing says so.  A gate should assert the landing carries
   exactly the live registry.
2. **The link is the existing contract**, `?workspace=methods&tool=<id>`.  No
   second route, no landing-only variant of a tool.

Explore is the same kind of thing and is the obvious second candidate, but it
is NOT decided here: its entry point is a compound choice (which components,
which plot) where EduTools' is a single named tool.  Deciding both together
would smuggle the harder one in behind the easier.

### 4b. On a phone, one panel at a time

`FILES` and `OUTLINE` side by side at ~195 px each is not a layout, it is two
unusable panels.  Below the narrow breakpoint the Case workspace shows ONE at
a time.

This is the smaller decision and the more certain one: there is no reading of
the GUI credo under which two 195 px panes teach anything.

## 5. What this does NOT decide

* **Not a navigation redesign.**  The workspace set, the deep-link contract
  (`?workspace=`/`?tool=`), the pop-out model and the case tree all stay.  This
  splits one row by a property the code already has; it does not reorganise
  what the rows contain.
* **Not the landing page's shape.**  Whether the tools appear as a grid, a
  list or a strip is a visual-design question for whoever writes it, bounded
  only by condition 1 above.
* **Not Explore's front door**, per §4a.

## 6. What would falsify it

If a case is ever added whose workspace set makes a "mode" case-dependent —
an Explore that needs the loaded case's components, say — then the two-column
table is wrong and the split has to be re-derived rather than patched.  The
test is the one the code already applies: does it survive a blank boot?
