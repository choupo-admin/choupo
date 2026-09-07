# A state directory is a restartable snapshot

*Record of the 2026-09-06 slice (task #97).  Vítor, reading the case layout:*

> *"em /0 deviam estar as streams e também o internalState... o OpenFOAM em 0/
> tem ficheiros com as streams (condições fronteira) e com os dados internos"*

*and, on the proposal: "Avança".*

**AMENDED THE SAME DAY (task #105) — read §9 before quoting any address in
§§1–8.**  The shape those sections describe, a DIRECTORY per unit beside the
stream files, lasted the morning: a unit's interior is now ONE file at
`<view>/internalStates/<SECTOR>/<unit>`, with one block per kind.  The
sentence *"a FILE is a stream, a DIRECTORY is a unit's interior"* is FALSE
from §9 on.  Everything else — what is state, the seed, the two-way object,
the refusals — stands.  The sections are kept as written because they are the
record of a decision that was taken and then corrected, and a corrected
decision is worth more to the next reader than a clean one.

---

## 1.  The observation, stated precisely

In OpenFOAM a time directory holds **one file per FIELD**, and that file
carries two blocks:

```
0/T
    internalField   uniform 300;          <- what the domain HOLDS
    boundaryField { inlet { … } … }       <- the conditions at its EDGES
```

The two live together because they are the same snapshot.  That is what makes
a time directory *restartable*: `startFrom latestTime` reads one directory and
the solver resumes — it does not go looking for the interior somewhere else.

Choupo's state directories carried only the boundary half.  `0/` and
`converged/` held one file per STREAM — and a stream is precisely a boundary
condition of a unit — while what each unit held INSIDE it lived in a separate
top-level view, `internalStates/`, added the day before
([`internal-states-are-a-projection-of-profiles.md`](internal-states-are-a-projection-of-profiles.md)).

## 2.  Why `internalStates/` was the wrong neighbour

It was built on the `design/` precedent, explicitly: *"the shape a per-unit
run-output tree takes"*.  The shape was right and the neighbour was wrong.

**`design/` is a DERIVATIVE.**  An equipment specification sheet is computed
FROM the answer, on a design basis, by a post-processing pass that a case may
or may not declare.  Delete `design/` and nothing about the solved state is
lost; re-run and it comes back from the same state plus the same basis.

**A stage profile is STATE.**  It is not derived from the answer; it is part
of the answer, the part that lives inside the equipment rather than between
two pieces of it.  It is exactly what a restart needs and exactly what a
stream table cannot show.

Filed beside `design/`, it read as a report about the units.  Filed inside the
state view, it reads as what it is.  So:

```
    internalStates/<SECTOR>/<unit>/<kind>     2026-09-05, retired one day old
    converged/<SECTOR>/<unit>/<kind>          the engine's snapshot
    0/<SECTOR>/<unit>/<kind>                  the AUTHOR's — a declared seed
```

**In a state view a FILE is a stream and a DIRECTORY is a unit's interior.**
That is the whole shape.  The sector levels a view repeats from the plant's
own geography are unchanged
([`main-is-a-sector-and-the-views-repeat-the-plant.md`](main-is-a-sector-and-the-views-repeat-the-plant.md)),
and a flat case grows no level at all.

## 3.  The substantive half: a seed nobody declared and nobody heard

Moving files is not the point of the slice.  This line is:

```cpp
//  src/unitOperations/distillation/DistillationColumn.H, until today
    Algorithm:
        1. Initial T-profile (linear between guesses) and x-profile
           (heuristic Σ-z-rich at top, Σ-z-poor at bottom).
```

The column invented its own starting interior, in code, and said nothing about
it — on the unit whose interior a student is most likely to have an opinion
about, and where a good guess is worth a hundred outer iterations.

Choupo has a rule about exactly this, settled 2026-05-30 and quoted in
`CLAUDE.md` §10: *every solver aid (initial guess, tear estimate, bound) is
first-class, explicit in the dict, and the student's to own; the solver
announces what it does to converge.*  A recycle tear with no guess is seeded
from the feed aggregate and **says so**.  A bound that binds **says so**.  The
column's interior did neither, because there was nowhere for a case to declare
one — and once a state view carries interiors, there is.

So the column now reads `0/<SECTOR>/<unit>/stageProfile` when the case
declares one, and both routes speak:

```
  [seed] interior read from 0/ (stageProfile): 15 stages, T 354.21 .. 382.89 K
         (WangHenke) -- a declared profile is a SEED, not an answer: the
         balances still decide
  [seed] interior seeded by the unit: linear T between the guesses, feed
         composition on every stage (WangHenke) -- declare
         0/<SECTOR>/<unit>/stageProfile to own it
```

**A DECLARED PROFILE THAT DOES NOT SATISFY THE BALANCES IS A SEED, NOT AN
ANSWER.**  Nothing checks the file against the column equations; the iteration
does that, and it moves off any profile that is wrong.  Saying so is not a
disclaimer — it is the difference between a starting point and a result, and a
student who copies `converged/` into `0/`, edits a temperature and gets the
same answer has learned it by doing.

## 4.  The decisions (D1–D10, taken before the code)

**D1 — the shape.**  `<view>/<SECTOR>/<unit>/<kind>` beside the sector's
stream files; `<view>/<unit>/<kind>` on a flat case.  Views: `0/` (authored)
and `converged/` (engine).  `design/` is not a state view and is untouched.
The top-level `internalStates/` view is retired: writer, GUI channel, tree
root, `cleanCase` pattern, `.gitignore` rule, Vite glob exclusion, docs.

**D2 — what is state.**  The 2026-09-05 boundary STANDS: a field over a
coordinate of the equipment (stage, position, particle size) or its inventory
(loadings per component); a construction over a swept parameter (van Heerden,
Merkel) is an analysis, gets no file, and is announced.  The kind derivation
(`stageProfile` · `axialProfile` · `sizeDistribution` · `swingTable` ·
`profile`) is unchanged.  Only the LOCATION moved.

**D3 — restartability, proved by the first reader.**  `DistillationColumn`
declares `readsInteriorKinds() == { "stageProfile" }` and reads the file the
writer emits, unchanged.  It validates that the declaration describes THIS
column — stage count against `nStages`, one `x_<component>` column per
component of the case and no column for a component the case does not have,
every value finite, every stage's fractions summing to something positive
(normalised on read, and said when the sum was not 1) — and REFUSES by name
with the remedy otherwise.  Both the Wang-Henke and the simultaneous-MESH
paths take the seed; with none declared, both build exactly the vectors they
always built, so every existing golden is untouched.

**D4 — `0/` is AUTHORED, never engine-written.**  The completeness contract
counts STREAMS (`N streams == N stream FILES`) and ignores directories: it
reads bodies, not names.  A unit directory naming no unit of the flattened
flowsheet is an ORPHAN and refuses, the same posture as an orphan stream file.
A kind file no unit declares it READS refuses too — *a declared field nobody
reads is a comment sitting in the state directory*.  `choupo-init0` writes no
interiors; `choupo-lint` REPORTS the declared ones per unit.  (**The
`choupo-init0` half was REVERSED on 2026-09-07 — see §10.**  `0/` is still
authored and never *engine*-written: what changed is that the AUTHOR'S OWN
TOOL may now materialise the interior half of it, exactly as it has always
materialised the stream half.)

**D5 — the GUI.**  The interiors ride `convergedFiles`; the
`internalStateFiles` channel is removed.  They ARE the converged snapshot, so
the argument that earned `design/` its own channel ("no sizing pass" must not
read as "did not solve") does not apply — an interior only ever exists where a
stream table does.  `caseTree.ts` gains a fifth kind, `interior`, with its own
glyph and tooltip, sorted after the streams of its own sector.

**D6 — the ignore rules.**  `converged/` stays ignored (and now carries the
interiors, so `gui/src/cases/tutorials.ts` gained the second lock the sizing
sheets already had).  **`0/` stays TRACKED** — a case that declares the state
it starts from must be able to commit it; that is the point.

**D7 — the witness.**  `tutorials/steady/distillation/column16_declared_interior`:
`column01` physically, with `0/column16/stageProfile` declared — a byte copy of
what `converged/` wrote.  Measured: **108 outer iterations unseeded, 1
seeded**, same answer to nine significant figures.  `column01` itself is left
alone; a student should meet both.

**D8 — the gate.**  `check_internal_states` keeps its name and changes its
claim; twelve arms and ten by-hand sabotages, listed in its docstring.

**D9 — the docs**, record first.  **D10 — validation**: the full suite, the
GUI half, `check_std_includes`, `check_wasm_dialect`.

## 5.  How it is wired, and the one seam that matters

The reader is `InternalStateIO::read(view, topology, verbosity)` — the module
that used to be `InternalStateWriter` and is renamed because it now reads too,
mirroring `StreamStateIO`.  It is called ONCE, at the flatten seam in
`Flowsheet::solve`, the moment the topology is final and every sector is
stamped, so it looks at exactly the addresses the writer produces.  The
profiles it finds are handed to each unit before `solve()`
(`UnitOperation::setDeclaredInterior`).

**A record identifies ITSELF.**  A directory is recognised as a unit's
interior because the files in it declare `recordType internalState;`, never
because of what the directory is called — the same posture
`looksLikeStreamState` takes on the other half, and the reason a stream file
sitting beside an interior is never confused for one.

**The layering held without a new rule.**  `io` and `unitOperations` are the
same band, so `Flowsheet` may include `InternalStateIO`; the reverse edge does
not exist and must not.  Which is why the reader does NOT judge whether a kind
is read: that needs `UnitOperation::New`, which lives above it, so the
flowsheet asks each unit and refuses.

## 6.  Rejected

* **Leaving the interiors in `internalStates/` and adding a reader there.**
  It would work.  It would also teach that state lives in two places, which is
  the arity sin wearing a directory name.
* **A new `UnitProfile` field, or a second grammar for the declared half.**
  The same object travels both ways or the round trip is not a round trip.
  What `converged/` writes, `0/` accepts, unchanged — the gate holds it.
* **Validating a declared profile against the balances.**  It is a SEED.
  Checking it would be a second, weaker solver; refusing on it would make a
  legitimate rough guess fatal.  What IS checked is that it describes this
  column.
* **Seeding silently when the declaration does not match.**  Both silences
  were on the table — ignore the file, or seed from what fits — and both are
  the defect this slice exists to remove.
* **A GUI rule that names the kind files.**  `caseTree` cannot tell a sector
  from a unit inside a view from the path alone (`converged/CONCENTRATION` is
  a sector, `converged/column01` is a unit).  Listing the kind vocabulary in
  TypeScript would be a fourth home for the engine's words; the case's own
  geography is passed in instead, and without it the tree classifies exactly
  as it did before.

## 7.  Not done, said plainly

* **`iterations/` carries no interiors.**  D1 listed it as a state view and it
  is one, but its instant is a DIFFERENT payload: one `streamFaces` file per
  branch plus a `byUnit/` projection, not one file per stream — so "a file is
  a stream, a directory is a unit" does not describe it, and a unit would end
  up with two directories in one instant (`<sector>/<unit>/` beside
  `<sector>/byUnit/<unit>/`).  A second objection stood here on the day this
  was written — that `SolutionWriter::sectorOf` derived the instant's sector
  level by SPLITTING the dotted name while the interior's came from the
  stamped `FlatUnit::sector`, so one directory would hold two answers to
  "which sector" — and it is **GONE since the same day**: task #106 made that
  function read the stamp too.  The payload objection is what still stands.
  Closing it is a slice about the instant format, not about interiors.
* **choupoCtrl and choupoBatch instants carry none either — and CHECKED, not
  assumed:** no unit under `src/unitOperations/dynamic/` or
  `src/unitOperations/batch/` publishes a `UnitProfile` at all, so there is
  nothing to write there today.  (The dynamic instants already carry a file
  called `internalState` — `SolutionWriter::writeDynamicInstant`, the holdup
  inventory — which is a different record with an unfortunately similar name.)
* **Every unit but the column seeds itself.**  The PFR, the crystalliser, the
  spiral-wound module, the PSA bed and the rest publish interiors and read
  none; each declares no kind, so a declared file for them REFUSES rather than
  being silently ignored.  The next slices are named by that refusal.
  (**The EXTRACTOR was the one that had to move, and it did on 2026-09-07 —
  §10.**  The rest of this bullet stands, and §10.1 says why: for most
  publishers the interior is an OUTPUT, and seeding a derivative is the one
  thing this tree never does.)
* **No interior is written for a non-converged run**, so a case that fails has
  nothing to restart from.  Deliberate — `converged/` is a name with a
  contract — but it is the obvious thing a user will ask for next.
* **The seed's effect is not pinned as a number.**  `iterations` is excluded
  from goldens by construction (volatile); the gate compares the two runs to
  each other instead, and requires only that the seeded one is not worse.

## 8.  Gate

`check_internal_states` — same name, changed claim.  Arms (a)–(f) are the
2026-09-05 projection arms re-aimed at `converged/`; (g) is the round trip
(the witness announces `[seed] interior read from 0/`, reproduces its own
golden at the golden's own tolerances, and the same case with the declaration
removed announces the other route and takes at least as many iterations);
(h)(i)(j) are the three refusals, each built as a temp copy of the witness;
(k) is the retired name, as a QUOTED path, in `src/`, `bin/`, `gui/src`,
`gui/public` and `.gitignore` — prose may say `internalStates`, a string may
not; (l) is git-check-ignore in BOTH directions plus the glob's second lock.

Ten sabotages, every one applied by hand between the run and the check, none
by patching a source and rebuilding.  Three of them (S5–S7) attack the gate's
own refusal arms by REPAIRING the offending copy just before its run, so the
arm meets a case the engine accepts; all three said "the run SUCCEEDED"
instead of passing.  The verbatim messages are in the gate's docstring.

Deliberately not sabotaged, and said rather than implied: the two `[seed]`
announcements themselves, because suppressing one needs a source patch and a
rebuild — the shape only `check_gate_selftest` may take.

---

## 9.  AMENDED 2026-09-06 — one FILE per unit, under its own root (task #105)

*Decided after a three-way reflection — Vítor, ChatGPT and the assistant —
on the shape §2 ratified that morning; the second reading concurred with the
asymmetric form, and the third reading struck everything beyond it: "convém
parar de arquitectar e deixar a estrutura provar-se com uso real."*

### 9.1  What was measured, and what it means

**D1 — a directory that always holds one file is a file.**  §2's shape was
`<view>/<SECTOR>/<unit>/<kind>`: a directory per unit, one file per kind of
field.  Measured on the corpus: every unit that publishes a profile publishes
exactly ONE kind, so every such directory held one file (the sweep that
retired them removed 85 directories under `tutorials/`, not one of which held
two).  A stream is ONE file carrying all its quantities; a unit's interior
should be ONE file carrying all its kinds as blocks.  The rule, stated so the
next object is filed right: *kinds of field on the same object live in one
file; distinct physical objects get their own files.*  `design/` keeps its
directory because its N are distinct PIECES of equipment, not kinds of one.

**D2 — but a unit file beside the stream files is unsafe.**  Once the
interior is a file, the only cue that told the two apart (file vs directory)
is gone, and the engine does not forbid a unit and a stream sharing a name
(0 collisions in the 299 cases today; nothing prevents the next).  Two files
at one path overwrite each other in silence — name identity, the defect
class this project hunts.  So the interior needs its own class in the path.

**D3 — the shape, the ASYMMETRIC form:**

```
<view>/<SECTOR>/<stream>                  streams: UNCHANGED, flat, as ratified 2026-07-06
<view>/internalStates/<SECTOR>/<unit>     interiors: ONE file per unit, blocks inside
<view>/internalStates/<unit>              a flat case: no sector level
```

`internalStates/` in lower case is visibly not a CAPS sector — the
case-of-name convention already in force.  `MAIN/` stays: a plant-level
unit's interior is `<view>/internalStates/MAIN/<unit>`.  The asymmetry has a
reading, and three readings converged on it; in one line: **the view shows
the boundary directly; the interior is namespaced inside the same view.**
The boundary IS the view (it is what the flowsheet connects); the interior is
filed inside it.  Chosen over the SYMMETRIC form (`streams/` too) because that
is a migration of 299 authored `0/` trees and reopens the 2026-07-06 spine.

**D4 — the file.**  `recordType internalState; unit "<name>"; sector <S>;
equipment <type>;` then one block per kind — `stageProfile { xAxis stage;
nPoints N; columns { … } markers ( … ) }`, `axialProfile { … }`,
`sizeDistribution { … }`, `swingTable { … }` — the same column grammar as
before, the kind name becoming the block name.  A unit with two kinds gets
two blocks.  The column reads its `stageProfile` block from
`0/internalStates/…` exactly as it read the file the day before: same
validation, same announcements, same refusals.

**D5 — `0/` stays authored**, the completeness contract keeps counting
STREAMS and now ignores the `internalStates/` subtree entirely, BY NAME and
not only by grammar (`StreamStateIO::readStateDir` skips it at the one place
the class of a file in a view is decided).  An orphan unit file under
`0/internalStates/` refuses; an unknown block name refuses by name; and — a
refusal §2 did not need — an interior record found ANYWHERE ELSE in the view
refuses as MISFILED, naming the address it must move to.  Without that third
one the retired shape would have been skipped in silence: an old
`0/<unit>/<kind>` file is neither a stream body nor under the new root, so
both readers would step over it and the case would go on believing it was
seeded.  That is exactly the silence §3 exists to end, one day later.

### 9.2  Identity, and the audit it ordered

**D10 — IDENTITY IS (kind, sector, name), NEVER name alone.**  Two objects of
different kinds MAY share a name: a stream `Flash` and a unit `Flash` in one
sector live at different paths and are different objects.  The homonym is
NOT refused — refusing it would make a name carry a meaning it does not have
— but it is ANNOUNCED once, at verbosity ≥ 2, at the flatten seam:

```
  [names] stream 'column16' and unit 'column16' share a name; they are
          different objects at different paths (<view>/<name> is the stream,
          <view>/internalStates/<name> the unit's interior)
```

**D11 — the resolvers were audited.**  The real hazard is code that resolves
a bare name without knowing the kind.  Every function that takes a name and
returns a stream OR a unit was read:

| Resolver | Carries the kind? | Finding |
|---|---|---|
| `StreamStateIO::readStateDir` | by grammar only, before this slice | **FIXED**: a stream-looking file misfiled under `internalStates/` would have become stream `internalStates.<x>` and been counted by the completeness contract.  It now skips the subtree by name.  Gate arm (m) greps for the skip so it cannot come back. |
| `InternalStateIO::read` | yes — walks `internalStates/` only, and sweeps the rest of the view for MISFILED records | built this slice |
| `StreamOwnership::canonicalManifest` / `ownershipPath` | yes — streams only, by id | `sectorOf(unitName)` derived the OWNING SECTOR by splitting the unit name at its first dot, while the interior used the STAMPED `FlatUnit::sector` — two answers to "which sector", agreeing on today's one-level corpus.  It was NOT fixed here (it is the ownership rule the writer, the validator and the reader share, forum #83) and was **CLOSED the same day by task #106**: the rule takes the stamped chain's head through `topLevelSector`, the one home, and `check_sector_hierarchy` arm (g) holds it.  The same split in `SolutionWriter::sectorOf` (§7, the instants) went with it. |
| `Flowsheet::validateSequentialPlan` | yes — unit names and stream producers as two sets | a DUPLICATE unit name refuses; a unit/stream homonym is announced (D10), not refused |
| `Flowsheet` init0 `pathOf` | yes — graph streams only | clean |
| `DesignSheetWriter` | yes — units only, own root `design/` | clean |
| GUI `caseTree.kindOf` | yes — by the path's second segment under a view | the geography discriminator (`sectorPaths`) is REMOVED: a unit is never a directory in a view now, and a rule that encodes a falsehood is worse than a small diff |
| GUI `caseTree.isRunOutput` | new | CaseIntro's keep-list read the KIND and would have listed `converged/internalStates/<unit>` as a file the student wrote — a run output of kind "interior".  The keep-list now reads the VIEW. |
| GUI worker harvest | by root only (`converged`, `design`), recursive | clean; the new subtree rides `converged/` with no entry of its own |
| GUI `resultSlice` / `pinch` `byName` maps | yes — built over `run.streams` alone; units come from `kpis`/`unitSectors` | clean: the result JSON keys the two classes separately |
| `bin/choupo-lint`, `bin/choupo-init0` | thin `exec choupoSolve` wrappers | audited through the Flowsheet rows above |

**D12 — NOT in this slice, struck after the third reading.**  No virtual
"Streams / Internal states" grouping in the GUI, no further shaping.
`caseTree.kindOf` classifies the new root as "interior" and that is ALL the
GUI does here.  **The layout is CLOSED; what changes it next is a student,
not a reflection.**

### 9.3  What it cost, and what was not done

* **The witness moved with the writer's own output.**  `column16`'s
  declaration was regenerated by running the case unseeded and copying
  `converged/internalStates/column16` into `0/internalStates/column16` — the
  file the writer produced, unchanged.  1 outer iteration seeded against 108
  unseeded, as the day before; the golden reproduces.
* **`bin/cleanCase` knows the retired shape** and removes it inside
  `converged/` only, by what a file DECLARES (`recordType internalState`
  outside `internalStates/`), never by a directory's name; `0/` is never
  entered.  Its `--help` range had to grow with its header — the second time
  that tool's usage text has been one edit behind its own comment.
* **Arm (f) has no live case, said plainly.**  `SimulationResult::profiles`
  is a map keyed by unit, so no unit CAN publish two kinds through the engine
  today; the writer's N is 1 everywhere.  The READER's multi-block parsing is
  exercised instead by a built two-block fixture (a `stageProfile` and an
  `axialProfile` block in one file, refusing on the second by name — which
  is only possible if both were parsed) and by a bogus block name.
* **NOT done: the symmetric form** (`<view>/streams/…`).  It is a separate
  299-case migration and reopens the 2026-07-06 spine; if Vítor orders it,
  it is its own slice.
* **`StreamOwnership::sectorOf`** (the split-vs-stamp finding above) was NOT
  done here and was **CLOSED the same day** by task #106: the ownership rule
  reads the stamp through the one home `topLevelSector`, and
  `check_sector_hierarchy` arm (g) holds it at the source.  Record:
  [`a-sector-recovered-by-splitting-a-name.md`](a-sector-recovered-by-splitting-a-name.md).
  Kept here rather than deleted so the sentence above is not read back as a
  standing gap.
* **NOT done: `iterations/`, the dynamic instants, every unit but the
  column** — §7 stands.

Gate: `check_internal_states`, rewritten for the address and the block form
(arms (a)–(m), sabotages by hand, verbatim lines in its docstring).

---

## 10.  AMENDED 2026-09-07 — the title is now TRUE (task #133)

*Vítor, reading §1 back against what the engine does:*

> the interior of a unit that seeds itself is re-invented on every restart,
> so a state directory carrying only the streams is not the snapshot this
> record's own title claims.

*The rule he proposed, and the architect decided: **every unit that starts
from an interior declares it, and `0/` can be MATERIALISED with it.***

### 10.1  The scope, measured again before building

§7 said *"every unit but the column seeds itself"* and named the next slices
by that sentence.  Measured on 2026-09-07, the sentence is right and the list
it implies is much shorter than it sounds — because the test is not *does the
unit publish an interior* but ***does its solve READ one to START***:

* **16 unit types assign an `xAxis`**; two of those axes (`T_K`, on the CSTR's
  van Heerden diagram and the cooling tower's Merkel construction) are
  excluded by D2 as analyses, and **4 carry a `stage` axis**:
  `DistillationColumn`, `Extractor`, `Absorber`, `Stripper`.
* For most publishers the interior is an **OUTPUT**: a crystalliser's size
  distribution falls out of the population balance, a PFR's axial profile out
  of the integration.  Seeding one would be seeding a DERIVATIVE, and *the
  tree never stores derivatives*.
* **`DistillationColumn` was done** (§3, §9).
* **`Extractor` was the one left.**  `Extractor.cpp` opened its cascade with
  *"Initial guess: every stage's extract = the fresh solvent, every stage's
  raffinate = the feed.  Honest, topology-propagated seed."*  The seed is
  honest and the comment is true; what was missing is that a case could not
  DECLARE it and the run did not ANNOUNCE which route it took — the same
  half-kept 2026-05-30 rule the column was fixed for one day earlier.

**One measurement disagreed with the brief that ordered this slice, and it is
recorded rather than quietly absorbed.**  The brief called `Absorber` and
`Stripper` *"KREMSER — analytic, closed form, no iteration, NO SEED"*.  Their
MASS balance is indeed a direct tridiagonal solve that needs no seed.  But
both carry an **outer loop over a temperature profile** when the energy
balance is active (`maxIt = nonIso ? 200 : 1`), started at
`Tprof(N, T0)` with `T0` the mean of the two feed temperatures — an in-code
seed of exactly the class this slice is about.  It is not hypothetical: all
three corpus cases that use them (`absorber01_NH3_water`,
`stripper01_NH3_water`, `acetone05_luyben_absorber`) pin
`nonIsothermal = 1`.  **They were still left alone**, which is the architect's
decision and a defensible one — the seed is one temperature column, built from
the two feeds, and the relaxed loop reaches its profile in a few sweeps — but
the reason is now the real one (*small, and not worth a file*) instead of a
false one (*there is no seed*).  Named here so the next slice starts from the
measurement.

### 10.2  What was built

**D13 — the Extractor reads its interior.**  `readsInteriorKinds() ==
{ "stageProfile" }`, and the cascade starts from the `stageProfile` block of
`0/internalStates/<SECTOR>/<unit>` when the case declares one.  The
declaration is reconstructed into the cascade's own unknowns — `F_extract[j]`
and `F_raffinate[j]` distributed over the components by the `xE_*` / `xR_*`
columns — and it REFUSES by name a declaration that does not describe THIS
cascade: a wrong axis, a missing column, a stage count that is not `stages`, a
column for a component the case does not carry, a non-finite value, a negative
flow.  Both routes announce.  **A declared profile that does not satisfy the
balances is a SEED, not an answer**, and the announcement says so.

*One thing is deliberately NOT refused, and it is the same lesson the day
before:* a stage whose extract composition is all zeros.  That is exactly what
the writer emits for a stage where the LL flash found no split, so refusing it
would refuse this module's own output — *a writer whose output its own reader
refuses is a bug in both*.  The phase starts empty there and the run **counts
and says** how many stages that was.

**D14 — `choupo-init0` materialises the interior half.**  A unit that reads an
interior gets one written at its own address; a unit that reads none gets
nothing.  What is written is **the unit's OWN seed** — published by
`UnitOperation::seedInterior`, which the Extractor builds through the very
function its `solve()` starts from (`seedCascade`), so the file and the run
can never describe two different guesses.  The tool's posture is unchanged: it
never overwrites without `--force`.

*Measured, and it is the proof that the rule was kept:* a case seeded from the
file the tool wrote reproduces the unseeded answer **to the twelve significant
digits the file carries** (34 sweeps either way; KPIs agreeing to ~1e-11
relative, the round-trip precision of the format).  A tool that had "improved"
the seed would move the answer, and the gate's arm (s) fires on exactly that.

**D15 — the completeness of a DECLARED tree, as a SEPARATE check.**  The
stream contract counts STREAMS and skips `internalStates/` by name (§9.1 D5);
this counts UNITS, and folding the two together would mean one refusal message
for two different faults.

**What it refuses is exactly this much, and the boundary was argued before it
was coded.**  A unit that reads an interior and finds none **seeds itself and
says so** — that is the 2026-05-30 rule working (an auto-init is allowed when
it is honest and announced), so it is *not* a fault and is *not* refused.  But
once a case DECLARES an interior tree it has taken ownership of the interior
half of its own snapshot, and a second unit in that case that reads one and is
missing from the tree is a restart that silently re-invents half of what it
claims to restore.  So: **a declared interior tree must be COMPLETE for the
units that read one.**  A unit that reads none gains no entry, no count and no
refusal.

**The unconditional form was REJECTED, and this is the substantive
disagreement of the slice.**  The brief specified *missing ⇒ refuse* outright:
any unit that reads an interior and has none is fatal.  Measured, that is 30
distillation cases and one extraction case in the corpus today, every one of
which would have to ship a materialised interior — and then every one of them
would start from a file written at 12 significant digits instead of from the
double its own code produces, moving iteration counts and last digits across
thirty goldens.  It also contradicts the 2026-05-30 rule directly: it bans an
auto-init that is honest and announced, which is the case the rule exists to
permit.  And the brief's own hard rule — *the undeclared path must be
byte-identical* — presupposes that path still exists.  **Making it
unconditional is a decision for Vítor, and it costs a 31-case migration and a
golden re-record; it is not a thing to take by accident inside a slice about
declaring a seed.**

**D16 — the accounting is SAID even when nothing is wrong.**  Every run with
at least one reader prints `[state] interiors: N of M unit(s) that read one
are declared in 0/`, and `choupo-init0` prints what it wrote and what it
kept — including the zero, because a case whose units all seed themselves is a
FACT about the case and not an omission by the tool.

**D17 — a reader that publishes no seed is NAMED, not skipped.**  The
`DistillationColumn` reads an interior and does not publish a `seedInterior`
yet, so `choupo-init0` writes nothing for it — and says so, by name, rather
than letting the tool's own claim ("the interiors of the units that read one")
go quietly false.  Building the column's seed is a slice of its own: its
starting profile is assembled inside two different method paths from a `feed`
dict the flatten seam composes, so publishing it means moving that seam, and a
transcription of the formula into a second place would be the exact defect
`seedCascade` exists to prevent.

### 10.3  What it cost, what moved, and what did not

* **Nothing moved on the undeclared path**, and it was proved per case rather
  than asserted: `extract01`, `column01`, `column16` and `absorber01` were run
  before and after and diffed whole.  The only differences in any of them are
  the new announcement lines; `extract01`'s `converged/` tree is byte-identical
  except for the one header sentence that flips because the extractor now
  reads an interior — which is the 2026-09-06 conditional header doing exactly
  what it was built to do.
* **The witness**: `tutorials/steady/absorption/extract02_declared_interior` —
  `extract01` physically, declaring `0/internalStates/extractor01` as a byte
  copy of what `converged/` wrote.  **1 sweep against 34**, and the answer it
  reaches is legitimately its own: both runs stop inside the same 1e-4 mass
  closure target at slightly different points (recovery 0.44157 against
  0.44176), so the witness carries its own golden.  That is the feature, not a
  drift — a restart from an answer is not obliged to take the same path back
  to it.
* **A weakness in this project's own gate idiom, found by sabotage.**  The
  first source arm asked `"seedInterior" not in ext`; renaming the method to
  `seedInteriorXX` — which disconnects the override from its base and breaks
  the whole feature — leaves that substring in place, and the sabotage
  SURVIVED.  All four name tests in `check_source` now look for the name as a
  CALLABLE.  *A name checked as a substring is not checked.*
* **NOT done, said plainly**: the column's `seedInterior` (D17); the absorber
  and the stripper (§10.1); the unconditional completeness refusal (D15,
  reserved for Vítor); `iterations/` and the dynamic instants (§7 stands).

Gate: `check_internal_states`, arms (s)–(v) — the init0 round trip **on the
extractor**, the seed held to the case's own `0/` stream files rather than to
the engine's arithmetic, a case whose units read nothing gaining nothing, and
an incomplete declared tree refusing by name while never naming the unit that
reads none.  Six by-hand sabotages (S21–S26), one of which survived its first
form.
