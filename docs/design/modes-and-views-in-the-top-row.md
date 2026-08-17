# Modes and views: the top row is doing two jobs

*Status: DECIDED 2026-08-17, IMPLEMENTED, and AMENDED the same day by a
three-lens panel after the owner reopened it (§7).  The amendment stands; the
reasons in §4a do not.*

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


---

## 7. AMENDMENT — the panel, and what it cost me to be right for the wrong reasons

The owner reopened §4a: *"Aquilo torna o menu confuso e lixa as boas práticas.
Afinal de contas uma tool pode ficar sempre aberta num tab e pode se consultar
quando o aluno quiser!"*  Three generals argued it from an interaction-design,
a pedagogy and a contracts lens, each told to attack the commander's position.
**All three concluded KEEP, and all three rejected the reasons §4a gives.**

### 7.1 My two arguments were both wrong

* *"Landing-only forces a student to abandon the case."*  False on the
  mechanics — a link opens a second tab and the case tab survives.  The owner
  was right.
* *"The app must be able to reach every state its URL contract defines."*
  **I invented that rule.**  It is written nowhere, and the tree refutes it
  loudly: `?workspace=` honours only `explore`, `methods`, `control`, so nine
  of the ten case views are URL-unreachable and nobody calls that a breach;
  meanwhile the pop-out states are reachable ONLY by URL, deliberately.  URL
  reachability and menu presence are independent axes.

I also picked, from twelve tools, the single worst example: **McCabe-Thiele is
one of only two that do NOT bind to the open run.**

### 7.2 The two facts that actually decide it

**The entry IS the chooser.**  The 252 px tool rail was deleted on the owner's
own order (2026-08-16, recorded in `methodsChrome.tsx`) because the top-bar
dropdown replaced it; `MethodsWorkspace` renders no tool list — it uses the
registry only to FIND the active tool.  Remove the entry and a student
deep-linked to `?tool=kremser` reaches the other eleven by hand-editing the
address bar.  Removal deletes navigation, not clutter.

**Ten of the twelve tools read the loaded run.**  Every `*Tool.tsx` carries a
`Classroom | Current run` toggle over `useStore(s => s.runResult)` — verified
by counting, 10 files, all of them.  A tool launched with no case has an empty
store and can only ever be *Classroom*: someone else's absorber.  So the
in-app entry is not convenience — **it is the only way to point a tool at the
student's own result**, which is the entire pedagogy (`recovery_KPI` against
`Kremser(A, N)`, with the reason for the gap attached).

### 7.3 The owner's complaint was right about something else

The row IS confusing, and the panel found the sharpest instance: it can offer
**`Pinch`** (a VIEW that recomputes the analysis in the browser from KPIs) and
**`EduTools → Pinch composite curves`** (which reads the engine's own
`reports/pinch/compositeCurves.csv`) as visual peers, with different
provenance and a stated possibility of disagreeing.  A student cannot tell
which one the engine said.

That is not fixed by deleting EduTools.  It is fixed by the mode/view split
this record already decided — which I wrote as tidiness and which is in fact
**honesty**, the same line this project defends when it refuses to call a
comparison a validation, or to blend the computed with the advised.

### 7.4 A defect this record's own §4a shipped

The landing's EduTools cards carried `target="choupo-app"`, the shared named
tab every other link on that page reuses.  A student with a converged case
open who clicked a tool card was navigated in that tab and **lost the run** —
the run the tool exists to be compared against.  Fixed: the cards open a NEW
tab.  The owner's own argument is the fix: a tool is consulted beside the
case, not instead of it.

### 7.5 What the record now says that it did not

* A mode may be case-INDEPENDENT for AVAILABILITY and case-FED for VALUE.  The
  §4 table is binary and cannot express that; the ceiling is where the
  teaching happens.
* §4a's entry point is also the mode's only CHOOSER.  That is why it stays.
* **A third falsifier**, and it is the honest one: *the day `MethodsWorkspace`
  regains an in-body tool chooser, the menu entry becomes a plain duplicate
  and this ruling expires.*  The panel's own strongest objection is that the
  defence rests on an implementation accident — the rail was deleted, so the
  menu inherited chooser duty.  Fix that accident and the case dissolves.  It
  is written down so nobody has to rediscover it.

Recorded also, unfixed: `site/index.html`'s fallback string tells the reader
to "choose EduTools from the top row" and no gate covers that sentence, and
`docs/ai/gui-credo.md` still names `MenuBar.tsx` as the workspace lineup's
authority, which moved to `workspaces.ts` today.
