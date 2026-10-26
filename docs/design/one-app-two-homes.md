# One application, two homes: the Flowsheet and the Workflow

*Decision record, DEV.md 4c C172 (2026-10-26).  Decided by the commander on
Vitor's delegation ("Invoca um forum de generais e decide tu"); the name
"Workflow" is Vitor's ruling.  Reversible; Vitor reviews.*

## The question

Process simulation and properties & data analysis are two different
activities (a flowsheet answers "what leaves this plant?"; a properties case
answers "does this model describe these data, with which parameters?").
The properties screen grew one slice per request (C147, C151-C154, C157b,
C165), each drawing the next engine fact, none starting from what the person
comes to do, and a measured audit (C168) and three users walked on the live
site (forum E) found it confusing.  The question was one GUI or two, whether
a properties case is a sequence, and what replaces "Results".

## The forum (five generals, read only)

* **A, practice.**  The leading commercial sequential-modular simulator keeps
  both activities in ONE application as two strongly signalled
  *environments*; a general multiphysics package keeps them in one model tree
  whose *Study* holds ordered steps (parameter estimation is itself a step)
  and keeps *Results* for outputs only; an equation-oriented process modelling
  tool references one model from a process and from an estimation.  Separate
  property products exist to EMBED the property layer elsewhere, not for
  usability.
  The evidence condemns a *weakly signalled* mode, not two environments.
  Jupyter (out-of-order notebooks: 24 % ran, 4 % reproduced) justifies an
  enforced order -- in the engine, not a new screen.
* **B, one application.**  The bridge runs both ways in the corpus
  (membrane24: fit -> simulate; ctrl17: simulate -> fit a FOPDT model) and
  the round trip lives in ONE in-memory case; every audited defect would ship
  unchanged inside a split.
* **C, two applications.**  The fork already exists, unnamed (two shells in
  AppShell, "Props" meaning three things, a 1606-line PropsView of branches).
  After reading B and the forwarded second opinion, C withdrew the strong form
  (two working copies) and kept: one home per case kind, chrome decided by case
  kind in ONE table, the order as an engine fact, and the traceability
  prerequisites.
* **D, cost.**  Two applications cost everything one costs plus a cross-tab
  synchronisation that does not exist today, and change nothing about the
  properties screen.  choupoProps already runs operations in declared order;
  in 134 propsDicts NO operation reads what an earlier one wrote, so an order
  validator needs zero migrations.  D also produced the concrete list of what
  is removed, merged and kept.
* **E, users.**  On a 1366x768 laptop: the process student passes the second
  opinion's decisive test (5 of 7, 2 partial); the membrane researcher scores
  1 pass, 4 partial, 2 FAIL; the data curator 4, 1, 2.  The failures are
  geometry (results begin at y = 498-743 of 768; 5-7 px map labels) AND
  content the engine already publishes but no screen shows.

A second opinion forwarded by Vitor ("radical simplification": Open -> Run ->
Results -> Inspect, one toolbar, a large centre, a compact explorer, a
contextual inspector, no invented modes) was answered by all five: it is
right about geometry, conventions and the map; it is wrong that two signalled
environments or an ordered list of steps are inventions.

## The decision

1. **One application, one case store, two homes.**  A process case's home is
   the **Flowsheet**; a properties case's home is the **Workflow**.  Each case
   kind owns its home, menu, Run label and vocabulary, decided in ONE table
   (the "one tab, one thing" rule of `tabChrome.ts`, one level down), never by
   filtering one shared menu.  The shared layer is imported, not copied: case
   I/O, the Case and Log workspaces, help and citation, records, Explore,
   plotting, the worker.
2. **A case with both dicts opens on its main question**
   (`controlDict.application`) and crosses by explicit links -- "fitted in
   Workflow step B.2" on the unit, "read by unit X" on the step -- not by a
   segmented switch in the menu row.  The home is in the URL.
3. **The Workflow** is the case's declared studies and their numbered steps,
   shown by position in the one outline (never a canvas; the GUI stays a
   runner and viewer).  A study that is a set of points or a grid study is
   ONE step with several runs.  The centre shows the selected study's results
   and plots; the inspector shows the selected step: what it reads (datasets
   marked FIT or HELD OUT, with the band declared before the fit), the model
   with its options inside it, what it writes (with its fingerprint), the
   verdict WITH its identifiability.  The calculation map moves to View >
   Calculation map, closed by default.  "Results" means only what a run
   produced.
4. **The order is an engine fact** (the properties analogue of
   `validateSequentialPlan`): declared order, and nothing may read a record or
   file a LATER step writes; refused by name.  ctrl17, whose properties side
   reads a trajectory only the process run writes, declares that, and the
   refusal names "run the Flowsheet first".  ppr78Kij's schema declares the
   record it writes.
5. **Removed or merged** (D's list): Run's four doors -> ONE Run in the
   toolbar (+Ctrl+Enter); "Props" on process cases with no propsDict
   (readiness moves into the inspector of the thermo node); the "Results" menu
   word; the Audit section and its five pills; the per-sector properties
   route (a sector with a propsDict opens as its own case); the draggable
   split; the version and adapter badges to a status bar; menu entries with
   no content on the case (Pinch, Variables, Literature without a mirror).
6. **Content the engine already publishes reaches the screen** (whatever the
   layout): the held-out AAD (the engine's two key spellings reconciled);
   which datasets were fit and which held out, and the band; held-out curves
   labelled as predictions, never "fitted"; identifiability next to the
   verdict; the promotable record visible and in the downloaded zip; fitted
   parameters as symbols with units (r_p = 0.675 nm); a run that writes a
   record into the case is "updated by run", not "EDITED"; no toast naming a
   view that does not exist.
7. **The Flowsheet side** gets the two findings from its own walk: a unit's
   result above its editable fields; validity notes below the table they
   qualify.

## Acceptance

The second opinion's decisive test, scripted (forum E's Playwright scripts),
for the three users at 1366x768: open, see what will be calculated, run, find
the main results, one operation's results, the model and data details, F1.
Every cell passes before a slice is called done.  Two applications come back
on the table only if, after the Workflow lands, the test still fails on the
pure-properties cases.

## Slices

1. Content gaps (item 6) and the removals that serve any layout (item 5).
   BUILT 2026-10-26 (DEV.md 4c C172, slice 1): one Run in the toolbar
   (`gui/src/ui/RunButton.tsx`); the menu says Workflow, a process case has
   none (its readiness is at the Case tab's thermo dict); the Audit's
   panels rehomed where they qualify; the drag seam, the per-sector props
   route and the empty menu entries gone; version and adapter in a status
   bar (`gui/src/ui/StatusBar.tsx`); a fit's evidence, band, held-out
   statistic, identifiability and parameters (as symbols with units) in its
   details (`gui/src/case/fitEvidence.ts`); held-out lines labelled
   predictions; the promotable record shown and zipped; "updated by run".
   The engine's two held-out keys were NOT merged: they are two statistics
   (a relative % and rejection points), so the engine publishes each one's
   unit and the GUI reads both in one place.
2. The engine order validator, ctrl17, ppr78Kij (item 4).  BUILT 2026-10-26:
   `propsPlan::validate` (src/propertyOps/PropsPlan.{H,cpp}) refuses, before
   operation [0], a read of a later write; the file-traffic table is the one
   engine home of what each op type reads and writes
   (`choupoProps --file-traffic`); ctrl17 declares
   `writtenBy { trajectory process; }`; ppr78Kij's schema declares its
   record; gate `check_props_order`.  Measured: 134 propsDicts, ~470
   operations, ZERO reads of a later write, zero migrations.
3. The Workflow: outline, centre, inspector; the map behind View (item 3).
4. Chrome by case kind in one table; the home in the URL; cross links (1, 2).
5. The Flowsheet findings (item 7).
