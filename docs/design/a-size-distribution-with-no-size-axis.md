# A size distribution with no size axis, and a header that told every reader to break the next run

> **STATUS: FINDING + RULE, executed 2026-09-07.**  Level 3 (deep reference
> under the state-directory architecture); the governing documents are
> [`a-state-directory-is-a-restartable-snapshot.md`](a-state-directory-is-a-restartable-snapshot.md)
> and
> [`internal-states-are-a-projection-of-profiles.md`](internal-states-are-a-projection-of-profiles.md).
> Tasks #124 and #126, from the architecture audit of 2026-09-06.

Two defects, one rule: **every surface a student reads must be true of what
the engine does.**  One published a crystal-size distribution without the size
it is distributed over — in the JSON, the CSV, the spreadsheet and the GUI
plot at once.  The other wrote, in every interior file the engine produces, an
instruction that ends the next run at exit 2 for all but one unit type.

---

## 1. What was measured, before anything moved

### 1.1  A distribution with no axis

`Crystalliser.cpp` builds a size grid `Lcol` in micrometres at both of its
profile sites, declares `prof.xAxis = "L_micron"`, and stores
`number_density`, `mass_density` (and, on the population-balance path,
`growth_rate`).  **`Lcol` is never assigned into `prof.columns`** and is
otherwise unused.

A fresh `crystalliser02_msmpr` run, on the shipped binary:

```
sizeDistribution
{
    xAxis       L_micron;
    nPoints     32;
    columns { mass_density ( ... ); number_density ( ... ); }
}
```

and the run's own `profile.csv`, with the `profiles` report enabled:

```
mass_density,number_density
2.6131537e-05,1.7232723e+15
```

Two densities and nothing to plot them against.  The result JSON publishes the
same record — `xAxis L_micron`, columns `{mass_density, number_density}` — and
`ResultEmitter`, `ProfilesReport`, `SpreadsheetReport` and the GUI's
`ProfilePlot` all resolve the axis through `columns[xAxis]`, so all four draw
nothing where the size should be.

The writer tolerates it and the reader does not.  `InternalStateIO`'s
`renderBlock` emits `xAxis <name>;` **unconditionally** while emitting the
axis COLUMN only `if (prof.columns.count(prof.xAxis))`; `parseBlock` refuses
exactly that file.  Copying `converged/internalStates/cryst` into
`0/internalStates/cryst`:

```
ERROR: declared interior 0/internalStates/cryst (sizeDistribution): declares
`xAxis L_micron;` and carries no column of that name -- the axis is the one
column that must be there.
```

exit 2.  **A writer whose output its own reader refuses is a bug in BOTH**
(CLAUDE.md §5) — and the header of `InternalStateIO.H` had said so, in those
words, since the day it was written.

Two sweeps, both taken here rather than assumed:

* **The corpus.**  87 interior records in the tree; **5 unreadable, all
  crystallisers** (`crystalliser02`, `03`, `04`, `08`, and the flagship
  plant's `CONCENTRATION/Cryst`).
* **The source.**  21 `xAxis = "..."` assignment sites under
  `src/unitOperations/`.  The crystalliser is the ONLY offender.  Two others
  look like offenders and are not: `SpiralWoundModule` and `PSA` subscript
  `columns` through a reference bound to it (`auto& cols = profile_->columns;`),
  which is the same act.

### 1.2  A header that told every reader to break the next run

Every interior file the engine wrote carried, verbatim:

> COPY it into the case's `0/internalStates/` at the same address to DECLARE
> it as the interior the next run starts from

`distillationColumn` is the ONLY type that declares `readsInteriorKinds()`.
For every other type the instruction is fatal — measured on the flagship
plant's spray dryer, whose file is otherwise perfectly well formed:

```
ERROR: Flowsheet: 0/ declares an interior `sizeDistribution` for unit
'DRYING.SD' (type sprayDryer), and NOTHING reads it.  A declared field nobody
reads is a comment sitting in the state directory.  This unit type reads no
declared interior at all -- it seeds its own, and says so on every run.
Remove the file, or declare the kind the unit reads.
```

exit 2.  **Both** units that publish an interior in the flagship plant are in
that group.  The refusal is right; the instruction that provokes it is not.

This is the same defect shape as commit **d4e173fb0** — a GUI pop-out telling
every reader to edit a file the run rewrites — and it has the same remedy:
condition the sentence on a fact the writer already holds.  The engine's own
record already knew the state of play: §7 of
[`a-state-directory-is-a-restartable-snapshot.md`](a-state-directory-is-a-restartable-snapshot.md)
says *"Every unit but the column seeds itself … a declared file for them
REFUSES rather than being silently ignored"*.  The file's header said the
opposite of its own architecture document.

---

## 2. The rules adopted

**R1 — the axis a profile declares is a column of it.**  The crystalliser
stores `L_micron` at both sites.  Nothing else in the tree needed changing.

**R2 — the writer REFUSES a profile whose declared axis is absent, and does
NOT throw.**  Both halves are decisions and both are stated:

* It **refuses** because a file `0/` cannot accept must not be written.  The
  guard sits at the seam that already partitions the profiles (beside the
  `T_K` decline and the undeclared-kind note), so no directory is created and
  no partial file exists.  It goes to `std::cerr` (a refusal is not a report,
  and must not depend on how loudly the run was asked to speak) and to
  `AdvisoryLog` under `refusal`, so it is replayed in the end-of-run caveat
  block and reaches the result JSON.
* It **does not throw** because the call site
  (`src/applications/choupoSolve/main.cpp`) has already ruled that a failure
  here is *said and never fatal* — the answer is computed — and because a
  throw in that loop would take every OTHER unit's interior with it: the
  partial tree that lies by omission, the 2026-09-04 design-sheet lesson.

**Why the refusal costs a student nothing, which is what settled it:** nothing
a CASE declares can reach it.  Only a unit's own C++ can publish an axis it
does not carry, so this is a contract on unit AUTHORS, held by a gate, and no
case file anywhere can trip it.

**R3 — the header sentence is conditioned on the unit.**  A unit that READS
the kind this file carries is told to copy it and told which kind it reads; a
unit that reads none is told what the file IS, and that the copy would be
refused.  A file carrying blocks of both sorts says which seeds and which
refuses.

**R4 — the fact is asked of the CLASS and travels as DATA.**
`UnitOperation::interiorKindsRead(type)` is the one door to
`readsInteriorKinds()`; `Flowsheet` was already asking through a hand-rolled
`New`-in-try/catch and now calls it too.  `choupoSolve/main.cpp` builds the
per-type map and hands it to `InternalStateIO::write`.  **`io` must not
include `unitOperations`** — the reverse edge exists and a cycle would close —
and `applications/` is where the two sides may legitimately meet.  Naming a
type inside the writer was rejected: it would be a second home for the
engine's own vocabulary, and it would go stale the day a second unit learns to
read one.

---

## 3. The decision this slice was asked to take, and the sweep behind it

The brief asked whether the writer should refuse, and to sweep the corpus
first and report what else a refusal would catch.

**It would catch nothing else, today.**  After R1: all 87 interior records in
the tree declare an axis they carry, all 21 source sites assign theirs, and
every profile the fractal plant, the crystalliser and the cooling tower
publish carries its own axis in the JSON — the DECLINED `T_K` ones included.
The refusal is added for the day a unit is written, not for a backlog.

That is an argument FOR it rather than against: a guard whose corpus is
already clean is a guard that costs nothing and can only fire on new work.

---

## 4. The docs half — and one item the brief expected to be stale was not

* **`docs/ai/stream-state.md`** described `0/` as carrying *"one DIRECTORY per
  unit"* — the shape retired on the morning of 2026-09-06 and REFUSED by name
  since — while carrying the CORRECT description sixteen lines below.  The kit
  contradicted itself, and `bin/llmctx` ships it to an assistant helping a
  student author a case.  Corrected.
* **`docs/ai/patterns.md`** carried the retired slogan *"a FILE is a stream, a
  DIRECTORY a unit's interior"* AND, in the same three lines, the retired
  **producer** ownership rule (*"inlet: owned by its consuming sector"*,
  *"internal: owned by its producer"*).  That file was not in commit
  8816c47c3's list and so kept a rule replaced the day before.  Both
  corrected, against the real `esterification2sector` layout rather than an
  invented one.
* **CHECKED RATHER THAN ASSUMED, as the brief instructed:
  `docs/ai/stream-state.md` was NOT stale on ownership.**  8816c47c3 updated
  it: it already carries the lowest-common-ancestor rule, the `MAIN/`
  amendment, the `--manifest` pointer, the RELOCATED refusal and the
  `sector`/`crossing` columns of `streamTable.csv`.  Only the interior shape
  needed fixing.  *A brief's expectation is a hypothesis; the tree is the
  measurement.*
* **Three more homes of the retired producer rule** were found on the way and
  fixed: `docs/architecture/CHOUPO-CONSTITUTION.md` (a level-1 document still
  teaching it), `src/result/SimulationResult.H` and
  `src/applications/choupoSolve/main.cpp`.  The last now says, in place of the
  restatement, *do not restate the rule — the answer comes from
  `StreamOwnership::canonicalManifest`*, which is the 2026-09-07 record's own
  durable lesson applied to itself.  The GUI's copies are deliberately NOT in
  this slice.

### 4.1  Every view repeats the geography — measured false

`docs/ai/case-layout.md`, `CLAUDE.md` §3 and the case header that generates
`docs/tutorialsGuide-plant.tex` all claimed every view repeats one geography.
A fresh flagship run:

| view | levels |
|---|---|
| `0/` | MAIN CONCENTRATION DRYING FERMENTATION |
| `converged/` | the same four (plus `internalStates/`, the view's own root) |
| `design/` | CONCENTRATION DRYING FERMENTATION — **no MAIN** |
| `iterations/` | the INSTANTS; the geography is inside each one |

`design/` has no `MAIN/` because MAIN's only unit is a splitter and a splitter
realises no sized item.  **The claim is corrected rather than the tree:** the
STATE views repeat the whole geography; a DERIVATIVE view carries only the
levels it has something to say about, and that absence is a fact, not a gap to
fill.  No `design/MAIN/` was invented.

The brief's own reading of `iterations/` — *"carries no level at all"* — is
imprecise and is corrected here from measurement: the levels are inside each
instant (`iterations/000000/MAIN/`), not at the view root, where the levels
are the instants.

---

## 5. Rejected

* **Throwing from the writer.**  §2, R2: it would surrender every other unit's
  interior to one unit's defect, and the call site has already ruled a writer
  failure non-fatal.
* **Making the JSON, the CSV, the spreadsheet and the GUI each refuse.**  Four
  homes for one rule.  The writer runs on every converged steady run and sees
  every published profile, so one guard there protects all four — with one
  stated limit: a run that does not converge writes no `converged/`, and so is
  not checked.
* **Naming `distillationColumn` in the writer.**  A second home for
  `readsInteriorKinds()`, and a sentence that goes stale silently.
* **A table of type → kinds in the gate.**  Same objection; the gate DERIVES
  it from the `readsInteriorKinds()` overrides joined to `registerBuiltins()`.
* **Regenerating the round-trip witness's `0/internalStates/column16` whole.**
  Its numbers are the UNSEEDED run's, and re-recording them from a seeded run
  would move the seed for no reason.  Only its banner was spliced, so the
  file's own claim (*a byte copy of what `converged/` wrote*) is true of its
  prose again and its numbers did not move.
* **Renaming the guide's `(SECTOR -- COMPOSITE)` label on MAIN.**  It is a
  generic label the generator applies to every composite node; changing it is
  a separate decision about every plant.  Recorded, not taken.

---

## 6. The gate

`check_internal_states` — EXTENDED, not multiplied.  Its manifest claim read
*THE ROUND TRIP HOLDS* while the round trip ran on `column16` alone, and its
value-by-value arm (c) compared the written block against the JSON — **both
missing the axis EQUALLY**, which is exactly why the defect passed it every
day of its life.  *Two incomplete projections of one incomplete record agree
perfectly.*

Four new arms and a docs half:

* **(o)** the axis a profile declares is a column of it — **(o1)** SOURCE, and
  it COUNTS; **(o2)** every interior record this run produced plus every one
  git tracks; **(o3)** the result JSON, DECLINED profiles included.
* **(p)** the round trip on a unit that READS NOTHING (a crystalliser): the
  written file parses, its axis is present, and the refusal that follows a
  copy is `NOTHING reads it` and never `carries no column of that name`.
* **(q)** the header sentence is true of the unit it is about, both branches
  with live cases.
* **(r)** the writer refuses without throwing, to stderr and to `AdvisoryLog`
  — a SOURCE arm, and only a source arm can serve, because nothing a case
  declares can reach the refusal.
* **(k), docs half**: arm (k) swept the retired NAME through `src/`, `bin/`,
  `gui/` and `.gitignore`, and nothing looked in `docs/` for the retired
  SHAPE.  It does now, exempting the record homes (`docs/design/`,
  `decision-records.md`, the archive) which quote it as history.

### 6.1  What the sabotages found — one survived

Seven by-hand sabotages (S14–S20 in the gate's docstring), all between the run
and the check, none rebuilding anything.

**S14 SURVIVED its first run.**  Deleting the crystalliser's MSMPR axis
assignment left the first draft of arm (o1) green, because the file has a
SECOND site on the same axis and a mere presence test was satisfied by it.
*A guard whose subject appears twice is satisfied by the copy you did not
break.*  So (o1) now COUNTS: a file declaring an axis at N sites must assign
that axis column at least N times.  Re-run, it fires:

```
(o1): src/unitOperations/crystallisation/Crystalliser.cpp declares
`xAxis = "L_micron"` at 2 site(s) and assigns `columns["L_micron"]` at 1.
```

Every pair in the corpus has margin (stage 3:2, V 4:2, T_K 2:1), so nothing
sits on the edge of the new rule.

A second thing the sabotages found, in the gate rather than the engine: arms
(o2) and (q) first swept every case under `tutorials/` and immediately
accused fifty-odd files. They were right about the files and wrong about the
domain — **a `converged/` tree is a gitignored RUN OUTPUT**, so sweeping all
of them reads whatever binary happened to run last and reports it as today's
engine. Both arms now read only what this run produced plus what git tracks,
and the claim says so.

### 6.2  What the gate still does not check, said plainly

* Whether an axis column holds the RIGHT numbers — only that it is present.
* Which FUNCTION an axis assignment belongs to: (o1) counts per file and per
  axis, so it proves a file assigns the axis at least as often as it declares
  it, not that each declaration is paired with its own.
* How well the conditional header sentence READS; only which of the two a file
  carries.
* An interior file in a case this gate does not run — outside (o2) and (q)'s
  domain by construction; (o1) and (o3) are what cover the rest.
* Arm (p) has no post-fix sabotage: it runs the real binary, and reaching it
  would mean rebuilding a broken engine, which only `check_gate_selftest` may
  do.  Its evidence is the DEFECT ITSELF, observed on the shipped binary
  before the fix.

---

## 7. Not done, said plainly

* **No golden moved, and that was measured rather than expected.**  The brief
  anticipated movement because a published profile gains a column; the golden
  row kinds are `kpi · stream · diag · aad · closure · utility · verdict ·
  equipment · boundary` and **none of them reads a profile column**, so
  nothing to re-record.  The published-implies-pinned rule
  (`docs/design/which-result-blocks-a-golden-can-read.md`) therefore has a
  quiet gap here: a profile column is published and pinned by no golden row.
  Closing it would be a new row kind and is NOT taken.
* **The `T_K` profiles are outside the writer's guard**, because the writer
  declines them before it reaches it.  Arm (o3) checks them in the JSON; the
  engine does not.
* **The GUI comments naming the retired ownership rule** (`toGraph.ts`,
  `TopBar.tsx`) are untouched, per the brief.
* **Nothing was done about `bin/runTests` reading this gate's claim with
  `tail -1`** rather than through `bin/curate/gate_claim.py`.  The gate marks
  its claim correctly and the OK line is last, so the two agree today; the
  conversion is part of the measured campaign that record names, and is not
  taken here.
