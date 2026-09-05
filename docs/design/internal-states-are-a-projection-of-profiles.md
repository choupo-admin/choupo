# Internal states are a projection of profiles

*Record of the 2026-09-05 slice (task #90).  The `internalStates/` view had
been named in the stream-state architecture, listed in the GUI's
`RUN_OUTPUT_ROOTS`, drawn in the nine-line student language as "what
happens inside it" — and written by nothing.  Every document that named it
carried the parenthesis "(named; not written yet)".  This is the slice that
removed the parenthesis, and the decisions it rests on.*

## 1.  What already existed, measured

The record was already there, four times over.  A unit with something to
say about its own inside says it through ONE virtual:

```
UnitOperation::profile()  ->  std::optional<UnitProfile>     src/unitOperations/UnitOperation.H
UnitProfile { xAxis; columns; markers; }                     src/result/UnitProfile.H
Flowsheet::unitProfiles() -> SimulationResult::profiles      src/applications/choupoSolve/main.cpp (r.profiles = …)
```

and that one map is then published on three surfaces: the result JSON's
`profiles` block (`ResultEmitter`), the Plot tab that reads it, and
`reports/unitOperations/<unit>/profile.csv` (`ProfilesReport`).  The unit
operations that publish one (`grep -rn 'xAxis *=' src/unitOperations/` is the
count; it is not repeated here) use a small number of axes:

| xAxis | units | what it is |
|---|---|---|
| `stage` | distillationColumn, absorber, stripper, extractor | a field over the stages |
| `V`, `z`, `z_m`, `position` | pfr, spiralWoundModule, sprayDryer (`model distributed`), heatExchanger | a field over the length |
| `L_micron`, `diameter_micron` | crystalliser, sprayDryer, cyclone, bagFilter | a distribution over particle size |
| `componentIndex` | psa, tsaTwinBed | loadings per component — an INVENTORY of the bed |
| `T_K` | cstr (van Heerden), coolingTower (Merkel) | a construction over a SWEPT temperature |
| `module`, `chainLength` | spiralWoundModule (scaling audit), polymer KPIs | a coordinate nobody has named a kind for yet |

The `design/` sheets (2026-09-04) had just established the shape a per-unit
run-output tree takes: `<SECTOR>/<unit>/<file>`, the sector as DATA from
`FlatUnit::sector`, removed and rewritten whole every run, only when
converged, gitignored under `tutorials/**/`, harvested by the worker from
one `OUTPUT_ROOTS` list, ridden into the Case tab on its own channel.

## 2.  The decisions

**It is a PROJECTION, not a new result.**  `src/io/InternalStateWriter.cpp`
reads `SimulationResult::profiles` and `result.topology` and writes.  No new
physics, no new JSON block, no new field on `UnitProfile`, no change to
`profile.csv` or `ProfilesReport` — add, do not move.  A fifth surface of
one record is exactly where one drifts, so the gate holds the new surface to
the machine channel value by value (both are written at 12 significant
digits from the same double; the tolerance is round-off).

**The address is `internalStates/<SECTOR>/<unit>/<kind>`**, on the `design/`
precedent line for line: the sector is the stamped `FlatUnit::sector`, the
leaf is the qualified name with its own sector's prefix removed only when it
IS the prefix, and a flat case grows no level at all — empty is not a sector
called "root".

**The file's name is the KIND of field, derived mechanically from the axis:**
`stage → stageProfile`; `V, z, z_m, position → axialProfile`;
`L_micron, diameter_micron → sizeDistribution`; `componentIndex → swingTable`;
anything else → `profile`, ANNOUNCED ("axis <x> has no declared kind"), so a
new axis reaches the tree under an honest generic name instead of being lost.
The table has one home (`InternalStateWriter::kindOf`); the gate recounts it
rather than reading it.

**The boundary, ruled 2026-09-05 (Vítor), written into the writer's header
and here:** *internal state is a field over a coordinate of the equipment
(position, stage, particle size) or its inventory (loadings per component);
a construction over a parameter sweep (van Heerden, Merkel) is an analysis
and stays in the reports.*  Two consequences, one each way:

* **`T_K` profiles are EXCLUDED.**  The CSTR's van Heerden diagram and the
  cooling tower's Merkel lines are pictures of how the unit would behave
  across temperatures, not of what it holds at the one it converged to.
  They are skipped and announced once per run, never silently dropped; a
  case whose only profile is one of these gets no directory.
* **The PSA/TSA swing table IS internal state** (`swingTable`).  Its axis is
  a component index, not a coordinate, which is why it needed a ruling
  rather than a rule.  Loadings per component are the bed's inventory —
  what it holds — and inventory is the second half of the boundary
  sentence.

**The grammar is a plain dictionary, no keyword-prefixed blocks** (the
2026-09-03 dossier lesson): `recordType internalState;`, `unit`, `sector`
(fractal only), `equipment`, `xAxis`, `nPoints`, a `columns { <name> ( v1 v2
… ); }` block with the axis column first, and `markers ( { x <v>; label
"<text>"; } … );` when the unit declared any.  Nothing reads it back; it is
written in the grammar so that the day something does, the reader is cheap.

**Harvest and locks.**  `OUTPUT_ROOTS` gains `internalStates`; the adapter
carries it as its own `RunResult.internalStateFiles` field (folding it into
`convergedFiles` would make "no unit publishes a profile" read as "did not
solve"); `CaseWorkspace` merges it read-only; `caseTree.ts` already listed
the root.  `.gitignore` gains `tutorials/**/internalStates/` — scoped, on the
`**/design/` lesson, though this name has no `docs/` twin to swallow — and
`gui/src/cases/tutorials.ts` gains the glob exclusion as the second lock.
`bin/cleanCase` removes it.

## 3.  Rejected

* **Extending `check_design_sheet`** instead of a new gate.  The two trees
  share a shape and nothing else — one is held to `sizing.csv` and a mass
  balance, this one to the JSON's `profiles` — and one gate with two
  unrelated subjects fails with two unrelated messages.  `check_internal_states`
  is its own gate, wired beside it.
* **A `**/internalStates/` ignore rule.**  There is no `docs/internalStates/`
  today, so the bare rule would swallow nothing — but the scoped form costs
  nothing and the `**/design/` precedent is one commit old.
* **Filing `T_K` under `profile`** with a comment.  A file under a directory
  called "what happens inside it" is read as equipment state whatever its
  comment says.
* **Writing from inside `ProfilesReport`.**  The report chain is opt-in and
  layout-dependent (`reports/` vs `postProcessing/`); the view must exist on
  every converged run, beside `converged/` and `design/`, so it rides the
  orchestrator.

## 4.  Gate

`check_internal_states` (`bin/curate/check_internal_states.py`), four
witnesses: `ChemicalPlantTutorial` (two `sizeDistribution` files under
`CONCENTRATION/Cryst` and `DRYING/SD`), `column09_tray_hydraulics`
(`stageProfile` with the feed marker, no sector level),
`coolingTower01_merkel` (a `T_K` profile → no file, no directory, announced)
and `psa01_h2_psa` (`swingTable`).  Arms: published ⇒ written at the stamped
address; written ⇒ published (no orphan); value-by-value agreement with the
JSON incl. `nPoints` and markers; the exclusion; flat stays flat; git
check-ignore both directions + the glob lock; structural dict check; the
exclusion and the boundary sentence at their source.  Five by-hand sabotages
of the GENERATED tree fired it — a deleted file, a corrupted value, an
orphan file, a file where the exclusion forbids one, a lying `nPoints` —
each applied between the run and the check, with no source patched and
nothing rebuilt.

## 5.  Not done, said plainly

* **Tray hydraulics as its own item.**  `column09`'s profile carries
  `dP_Pa`, `floodApproach` and `h_backup_mm` beside the compositions; the
  1:N shape of `design/` says a column may one day realise several items,
  and a hydraulics file per tray section would be one.  Today it is one
  `stageProfile`, because that is what the unit publishes.
* **Batch adsorber transients.**  `choupoBatch` and `choupoCtrl` write
  instant directories (`0.01/ 0.02/ …`) and nothing per-unit inside them;
  an adsorber's loading profile over time is internal state over a
  coordinate AND time, and this writer is steady-state only.
* **A declared kind for `module` and `chainLength`.**  Both reach the tree
  as `profile`, announced.  Naming them is a decision about what they are,
  not a mechanical rule.
* **Reading the files back.**  Nothing does; the structural arm in the gate
  is Python, and the day the engine reads one, that reader replaces it.
