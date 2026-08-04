# solverDict consolidation — scoping note and proposal (roadmap #6)

Status: **PROPOSAL — awaiting Vítor's decision.  No code changed.**
Written 2026-08-01.  Companion roadmap line: DEV.md §4 item 6
("solverDict consolidation · speciation aliases"), inherited unspecified
from the 2608 handoff (§10 "Deferred").  This note turns the line into a
decidable question: it maps where solver options actually live today
(file:line evidence), states the tension, and puts three options with a
recommendation.  Per the project rule — architecture changes are
proposed, confirmed, then coded — nothing here is implemented.

## 1. The fragmentation, measured

Numerical options live in FOUR different grammars today:

1. **Steady (`choupoSolve`)** — `system/solverDict`:
   * per-unit-TYPE subdicts merged into each unit's dict at build time
     (`Flowsheet.cpp:913` — `solverDict->subDict(utype)`);
   * `tearStreams ( … );` (the declared-tear contract,
     `Flowsheet.cpp:2374`);
   * loose scalars read by the recycle driver (`Flowsheet.cpp:2686-2690`).
   Corpus: 21 steady cases carry a `solverDict`.

2. **Batch vessel units** — a per-unit `solver {}` block INSIDE the
   unit's `flowsheetDict` entry (`BatchReactor.cpp:115`,
   `BatchAdsorber.cpp:111`, `FixedBedAdsorber.cpp:110`): `integrator`,
   `rtol`, per-unit `verbosity`.  Corpus: 4 cases.

3. **Batch/Ctrl adaptive drivers** — `controlDict`:
   `timeStepping adaptive;` plus an optional `timeSteppingControl {}`
   subdict (`rtol/atol/deltaT0/deltaTmax/maxGrowth` —
   `choupoBatch/main.cpp:241`, `choupoCtrl/main.cpp:285`).  Corpus: 7
   adaptive cases, 2 with `timeSteppingControl`.

4. **`fixedBedAdsorber`** — owns its sub-stepping: reads BOTH its unit
   `solver{rtol}` AND controlDict's `timeStepping`/`samplingInterval`.

The same physical knob (`rtol`) therefore has two homes depending on the
binary, and `solverDict` — the file NAMED for the job — is read only by
the steady binary.

## 2. The tension

The no-silent-crutch credo says every solver aid is first-class,
explicit in the dict, and the student's to own.  Fragmentation does not
break that (each home is explicit and announced), but it taxes the
student: which file owns `rtol` depends on which binary they are
running.  Against consolidation stands the case-format stability
promise (318 runnable cases; backwards-compat is mandatory) and the
fact that `controlDict` timing options (`deltaT`, `writeInterval`,
`timeStepping`) are genuinely TIME-CONTROL, not solver internals — the
OpenFOAM ancestry puts them exactly where they are.

## 3. Options

* **A — document, don't move.**  Declare the four homes intentional:
  solverDict = steady flowsheet numerics; unit `solver{}` = per-unit
  integrator choice; controlDict = time control including adaptive
  error tolerances.  One authoritative docs/ai section + a lint check
  that flags a `solverDict` in a batch/ctrl case.  **The lint half
  SHIPPED 2026-08-01** (it was a real bug regardless of the A/B/C
  choice): choupoBatch and choupoCtrl announce a present-but-unread
  `system/solverDict` by name with the cost stated, run continuing —
  the unread-keys posture; gate `check_solverdict_lint`
  (positive + negative per binary, sabotage-verified).  The docs/ai
  section and the A/B/C choice itself remain with Vítor.
* **B — one home.**  `system/solverDict` becomes the numerics home for
  all four binaries (per-unit and per-driver subdicts); controlDict
  keeps only time SEMANTICS (start/end/write).  Honest but touches the
  grammar of ~11 transient cases + three unit readers; legacy reads
  stay as announced adapters for one release.
* **C — minimal move.**  Only the adaptive ERROR tolerances
  (`timeSteppingControl`) move to solverDict (they are solver
  internals, not time semantics); unit `solver{}` and controlDict
  timing stay.  Two cases migrate; adapters announced.

Recommendation: **A now** (documentation + the ignored-solverDict lint
is pure gain), and decide B vs C only if the docs pass proves the
four-home story unteachable.  The lint half of A needs no grammar
change and could ship as a normal slice.

## 4. "Speciation aliases" (the other half of the roadmap line)

The per-ion gamma engine is selected by bare name — `davies` (default)
/ `pitzerHMW` (`SpeciationSolver.cpp:189`, factory keys in
`AqueousActivity.cpp:133` / `PitzerHMW.cpp:328`) — while the case-level
composite grammar spells `activityModel { ionic davies; … }`.  The
handoff line presumably wanted friendly aliases (e.g. `HMW`) and/or one
spelling across the props bench and the case grammar.  CLAUDE.md's
selector-key contract (`pitzer` ≠ `pitzerHMW`, settled 2026-06-29) is a
hard constraint: any alias set must not blur that pair.  Scope: small,
but it TOUCHES a settled naming contract — so it is Vítor's call, not
an autonomous slice; proposed alias table to be drafted only if he
wants it at all.

## 5. DECIDED 2026-08-04 (Vítor)

**Option A, and no further review round.**  His words: option A is
"conservative, reversible, and non-blocking"; proceed and revisit only if
implementation uncovers a genuine architectural conflict.

Both halves are now shipped:

* the **lint** half shipped 2026-08-01 (it was a real bug regardless of
  the A/B/C choice) — `choupoBatch` / `choupoCtrl` announce a
  present-but-unread `system/solverDict` by name with the cost stated,
  the steady binary does the same for a transient `timeStepping` key,
  gate `check_solverdict_lint`, sabotage-verified;
* the **documentation** half shipped 2026-08-04 —
  [`docs/ai/case-layout.md`](../ai/case-layout.md), section *"Where a
  numerical option lives"*: the four homes as a table, the organising
  idea (*whose* number it is), the trap and what the engine does about
  it, and why B and C were not taken.

**The speciation-alias half of the roadmap line is NOT approved and was
not built.**  It touches the settled `pitzer` ≠ `pitzerHMW` selector
contract (2026-06-29), so §4 above says it is Vítor's call and not an
autonomous slice; nothing was asked and nothing was done.  It stays open
by default rather than being quietly closed alongside the half that was
decided — approving A is not approving §4.

## 6. Decision requested (superseded by §5)

1. Option A / B / C for the solver-option homes (recommendation: A).
2. Whether speciation aliases are wanted at all, given the
   `pitzer`/`pitzerHMW` contract.
