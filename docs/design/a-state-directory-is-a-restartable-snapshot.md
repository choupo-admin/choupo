# A state directory is a restartable snapshot

*Record of the 2026-09-06 slice (task #97).  Vítor, reading the case layout:*

> *"em /0 deviam estar as streams e também o internalState... o OpenFOAM em 0/
> tem ficheiros com as streams (condições fronteira) e com os dados internos"*

*and, on the proposal: "Avança".*

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
interiors; `choupo-lint` REPORTS the declared ones per unit.

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
  `<sector>/byUnit/<unit>/`).  Worse, `SolutionWriter::sectorOf` derives the
  instant's sector level by SPLITTING the dotted name while the interior's
  comes from the stamped `FlatUnit::sector`: putting them in one directory
  would place two answers to "which sector" next to each other, agreeing today
  and disagreeing on the first unit whose name carries a dot for another
  reason.  Closing that is a slice about the instant format, not about
  interiors.
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
