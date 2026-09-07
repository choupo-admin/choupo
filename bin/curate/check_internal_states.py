#!/usr/bin/env python3
"""Gate: A STATE DIRECTORY IS A RESTARTABLE SNAPSHOT -- a state view carries
the streams that bound each unit AND, under its own root, ONE file per unit
holding what that unit keeps inside it; the two halves travel in the same
grammar in both directions; a unit and a stream may share a name and never a
path; and the unit that reads its interior back SAYS which route it took.

    bin/curate/check_internal_states.py

WHY THIS EXISTS, and why its claim changed twice on 2026-09-06.  The interiors
were first written (2026-09-05) as a top-level `internalStates/` view, on the
`design/` precedent -- the wrong neighbour, because `design/` is a DERIVATIVE
and a stage profile is STATE.  That morning they moved INSIDE the state views
as a DIRECTORY per unit beside the stream files, one file per kind.  The same
afternoon a three-way reflection (Vitor, ChatGPT, the assistant) measured
that every such directory held ONE file, and that a unit file BESIDE the
stream files would overwrite a homonymous stream in silence (nothing forbids
the two sharing a name) -- so a unit's interior is now ONE file at

    <view>/internalStates/<SECTOR>/<unit>          (one BLOCK per kind)
    <view>/internalStates/<unit>                   (a flat case: no sector level)

with the streams unchanged, flat, as ratified 2026-07-06.  IDENTITY IS
(kind, sector, name), NEVER NAME ALONE; the homonym is ANNOUNCED, not
refused.  The reading, in one line: the view shows the boundary directly; the
interior is namespaced inside the same view.  The record is
docs/design/a-state-directory-is-a-restartable-snapshot.md, section 9.

The substantive half is still the SEED.  `DistillationColumn.H` said "Initial
T-profile (linear between guesses)": the column seeded its own interior in
code, undeclared and unannounced, the one solver aid in Choupo that broke the
2026-05-30 rule.  Both routes speak now, and the declared one is a file the
case owns.

WHAT THIS CHECKS:

  (a) PUBLISHED IS WRITTEN, ONE FILE PER UNIT, AT THE STAMPED ADDRESS.  Every
      unit whose JSON `profiles` entry carries an equipment-state axis has a
      file at `converged/internalStates/<SECTOR>/<leaf>`, where `<SECTOR>` is
      that unit's entry in the JSON's own `unitSectors` map -- the sector as
      DATA, never a split of the dotted name -- and the file carries a BLOCK
      named by the axis through the same table the writer uses (recounted
      here).

  (b) WRITTEN IS PUBLISHED.  No interior record under `converged/` names a
      unit the JSON does not publish a profile for.  Records are found by
      their own `recordType internalState;`, never by file name, so a stream
      file beside them is never mistaken for one.

  (c) EVERY BLOCK REPRODUCES THE JSON, VALUE BY VALUE.  `nPoints` equals the
      axis column's length; every column the JSON names is in the block with
      the same length and the same values to 1e-9 relative (both are written
      at 12 significant digits from the same double); markers agree in count,
      position and label; the header names the unit and its equipment type.

  (d) A SWEPT PARAMETER IS NOT EQUIPMENT STATE.  On the `T_K` witness (the
      cooling tower's Merkel construction) no `internalStates/` exists, no
      record is written anywhere in the view, and the run says so.

  (e) FLAT STAYS FLAT.  The flat witness's file sits DIRECTLY under
      `converged/internalStates/` with no sector level and no `sector` key --
      empty is not a sector called "root".

  (f) A UNIT WITH TWO KINDS GETS TWO BLOCKS -- and this arm has NO LIVE CASE
      on the writer's side, said plainly: `SimulationResult::profiles` is a map
      keyed by unit, so no unit CAN publish two kinds through the engine today;
      the writer's N is 1 on every case.  What IS exercised is the READER: a
      BUILT fixture puts a `stageProfile` and an `axialProfile` block in one
      declared file, and the run must refuse naming `axialProfile` as the kind
      nothing reads -- which is only possible if both blocks were parsed.  A
      second fixture carries a block whose name is not a kind at all, and the
      run must refuse it BY NAME.

  (g) THE ROUND TRIP, WHICH IS WHAT "RESTARTABLE" MEANS.  On the witness
      `column16_declared_interior`, which SHIPS `0/internalStates/column16`
      (the file `converged/` wrote, unchanged): the run announces `[seed]
      interior read from 0/`, its KPIs reproduce its own golden within the
      golden's own tolerances, and the SAME case with the declaration removed
      announces the other route and takes AT LEAST as many outer iterations.

  (h) THE REFUSALS, each on a copy of the witness: a declared profile with
      one stage too few refuses naming the mismatch; a file naming no unit
      refuses as an ORPHAN; the RETIRED shape (`0/<unit>/<kind>`, a record
      outside `internalStates/`) refuses as MISFILED, naming the address --
      never skipped in silence, which is what both readers would otherwise do
      with it; a kind the column does not read refuses (see (f)).

  (i) NO `<view>/<SECTOR>/<unit>/` DIRECTORY SURVIVES.  After the runs, no
      interior record sits anywhere under a `0/` or `converged/` of any case
      under `tutorials/` except under that view's `internalStates/`.

  (j) THE STREAM/UNIT HOMONYM.  A BUILT case gives the column's distillate the
      column's own name: `column16` is then both a stream and a unit.  The
      run succeeds; `0/column16` (a stream body) and `0/internalStates/column16`
      (a record) both exist and the interior was read; `converged/column16`
      and `converged/internalStates/column16` both exist, one a stream and one
      a record, neither overwritten; and the run ANNOUNCES the homonym once.

  (k) THE RETIRED TOP-LEVEL VIEW IS GONE.  No case under `tutorials/` has an
      `internalStates/` directory at its ROOT (only inside `0/`, `converged/`
      or an instant); the GUI's `RUN_OUTPUT_ROOTS` does not list it; the worker
      does not walk `/case/internalStates/`; no non-comment `.gitignore` line
      names it (a top-level rule would take the AUTHORED half with it).  AND,
      since 2026-09-07, no page under `docs/` outside `docs/design/` teaches
      the retired one-directory-per-unit SHAPE: arm (k) swept the retired
      NAME through src/, bin/, gui/ and .gitignore and nothing looked in docs/
      at all, while `bin/llmctx` ships `docs/ai/` to an assistant helping a
      student author a case.

  (l) THE ENGINE'S HALF CANNOT BE COMMITTED, THE AUTHOR'S MUST BE.
      `git check-ignore` rejects `converged/internalStates/<unit>` and does NOT
      reject `0/internalStates/<unit>`; a new file under `docs/design/` stays
      committable; and `gui/src/cases/tutorials.ts` excludes `converged/**`
      from the case glob.

  (m) THE RESOLVERS CARRY THE KIND (the D11 audit, made unforgettable).  The
      one bare-name resolver the audit FIXED -- `StreamStateIO::readStateDir`
      keyed every stream-looking file by its relative path, so a misfiled one
      under `internalStates/` became stream `internalStates.<x>` -- must still
      skip that subtree BY NAME; `InternalStateIO::read` must walk the ROOT
      constant and nothing else; the GUI's `caseTree` must carry no geography
      discriminator (`sectorPaths`, the rule that a directory in a view is a
      unit -- false since the root exists); and `CaseIntro`'s keep-list must
      read the VIEW (`isRunOutput`) and not the kind, because a run output of
      kind "interior" is still a run output.

  (n) SOURCE: the `T_K` exclusion, the boundary sentence, the column's
      declared kind and the base-class surface are where they were.

  (o) THE AXIS A PROFILE DECLARES IS A COLUMN OF IT -- in the source, in every
      interior record in the tree, and in the result JSON, DECLINED profiles
      included.  Arm (c) could never see this: it compares the written block
      against the JSON and the crystalliser was missing its size axis in BOTH,
      equally, so two incomplete projections of one incomplete record agreed
      and the gate passed while a crystal size distribution was published --
      in the JSON, `profile.csv`, the spreadsheet and the GUI plot -- without
      the size it is distributed over.

  (p) THE ROUND TRIP ON A UNIT THAT READS NOTHING (a crystalliser).  Arm (g)
      runs it on the ONE type that reads a kind, so nothing exercised the
      reader against what the writer produces for every other type.  The
      claim available here is exact: the written file PARSES, its axis is
      present, and the refusal that follows a copy into `0/` is `NOTHING reads
      it` and NOT `carries no column of that name`.  The second would be the
      writer emitting a file its own reader rejects.

  (q) THE HEADER SENTENCE IS TRUE OF THE UNIT IT IS ABOUT.  A file for a unit
      that reads its kind carries the COPY instruction and names the kind; a
      file for a unit that reads none carries the reads-nothing sentence and
      NOT the COPY instruction.  Both branches must have a live case.  The
      type -> kinds map is DERIVED from the engine's own source (the
      `readsInteriorKinds()` overrides, joined to `registerBuiltins()`), never
      tabulated here -- a table would be the second home this project spends
      its slices closing.

  (r) THE WRITER REFUSES A PROFILE WHOSE DECLARED AXIS IS ABSENT -- a SOURCE
      arm, and it can only be one: nothing a CASE declares can make a unit
      publish an axis it does not carry, so no fixture reaches the refusal.
      Checked: the guard is at the seam that partitions the profiles, it
      reaches `AdvisoryLog` (not only the console), it writes to stderr rather
      than depending on verbosity, and it does NOT throw -- the call site turns
      a throw into one warning and no interiors at all for the case, the
      partial tree that lies by omission.

  (s) `choupo-init0` MATERIALISES THE INTERIOR HALF, AND WRITES THE UNIT'S OWN
      SEED.  On a copy of the extractor case (which reads a `stageProfile` and
      ships no declaration) the tool writes exactly ONE file, at the address
      the reader looks at, carrying `recordType internalState;` and a block
      whose axis is one of its columns.  What is IN it is held to the case's
      own `0/feed` and `0/solvent`, read independently of the engine: every
      stage's extract is the fresh solvent and every stage's raffinate is the
      feed, which is the guess the unit would have made in silence.  A tool
      that quietly improves a seed hands back a crutch nobody chose
      (2026-05-30).  Then the case RUNS from what was written, announces
      `[seed] interior read from 0/`, and reproduces `extract01`'s own golden
      -- writer -> disk -> reader -> the same answer, on the EXTRACTOR and not
      only on the column.

  (t) A UNIT THAT READS NOTHING GAINS NOTHING.  On a copy of the crystalliser
      case, `choupo-init0` creates no `0/internalStates/` at all and SAYS so.

  (u) A DECLARED INTERIOR TREE MUST BE COMPLETE -- a SEPARATE check from the
      stream completeness contract, which counts STREAMS and skips
      `internalStates/` by name.  A unit that reads one and finds none seeds
      itself and says so (the 2026-05-30 rule working, not a fault).  A case
      that declares one for ONE reader and not the other restarts half the
      plant from the answer and re-invents the rest: on a plant with TWO
      columns and one absorber, declaring only `C1` refuses BY NAME, names
      `C2`, and never names the absorber -- which reads none.  Declaring both
      leaves that refusal behind.

  (v) THE ROUND TRIP ON THE EXTRACTOR, `converged/` -> `0/` -> the answer.
      The witness `extract02_declared_interior` ships the file the run wrote,
      announces the read, reproduces its own golden, and reaches the cascade
      in no more sweeps than the same case with the declaration removed.

WHAT THIS DOES NOT CHECK, said plainly:

  * WHETHER A DECLARED PROFILE IS RIGHT.  It is a SEED, not an answer; nothing
    here or in the engine checks it against the column equations.  Arm (g)
    checks that the ANSWER did not move, which is the only claim available.
  * THAT THE ENGINE'S PARSER ACCEPTS AN ARBITRARY FILE.  Arms (a)-(f) parse
    with a small reader in Python; arm (g) is the real round trip, through
    `Dictionary::fromFile`, on ONE kind (`stageProfile`).  No other kind has a
    reader yet.
  * A UNIT WRITING TWO KINDS.  There is no such unit (see (f)).
  * WHETHER A UNIT THAT READS AN INTERIOR *SHOULD*.  Arms (s)-(v) hold the two
    types that DECLARE a kind; nothing here can say whether a third ought to.
    Measured 2026-09-07 and recorded rather than gated: four unit types publish
    a `stage` axis, and the absorber and the stripper carry an outer loop over
    a temperature profile seeded at the mean of their two feed temperatures --
    analytic in the isothermal case only.  They read no interior by decision;
    an arm here would pin that decision, not check it.
  * WHETHER EVERY READER PUBLISHES A SEED.  `choupo-init0` materialises what a
    unit offers; a type that reads an interior and offers none is ANNOUNCED by
    the tool (the distillation column is in that state today) and no arm
    requires it to offer one -- requiring it would be a schedule, not a check.
  * WHETHER AN AXIS COLUMN HOLDS THE RIGHT NUMBERS.  Arm (o) checks that the
    axis a profile declares is PRESENT; nothing here checks that the values in
    it are the coordinate they claim to be.
  * WHICH FUNCTION AN AXIS ASSIGNMENT BELONGS TO.  Arm (o1) counts per FILE
    and per axis, never per function: it proves a file assigns the axis at
    least as often as it declares it, not that each declaration is paired
    with its own assignment.  (o2) and (o3) read what actually came out,
    which is why all three are needed.
  * WHETHER THE READS-NOTHING SENTENCE IS THE BEST WORDING.  Arm (q) checks
    which of the two sentences a file carries, never how well it reads.
  * A STALE `converged/` LEFT BY AN EARLIER BINARY.  Arms (o2) and (q) read
    only what THIS gate's runs produced and what git tracks, so an interior
    file sitting in a case this gate does not run is outside their domain --
    the source arm (o1) and the JSON arm (o3) are what cover the rest.
  * EVERY AXIS.  Four witnesses cover the size axes, `stage` with a marker,
    `T_K` (the exclusion) and `componentIndex`.  `V`, `z`, `z_m`, `position`
    and the two undeclared axes (`module`, `chainLength`) are exercised by the
    suite's cases running through the same writer, not by an arm here.
  * `iterations/` AND THE DYNAMIC INSTANTS.  Neither carries interiors today
    (the record says why); nothing here would notice if one started to.
  * THE OWNERSHIP SPLIT -- CLOSED 2026-09-06, kept here so the absence is not
    read back as still open.  `StreamOwnership::sectorOf` used to derive a
    stream's sector by splitting the unit name where the interior uses the
    STAMP; the ownership rule now reads the stamp too, through the ONE home
    `topLevelSector`, and `check_sector_hierarchy` arm (g) holds it at the
    source.  Nothing here checks it.
  * THE GUI.  The Case tree is pure and carries its own tests; the harvest is
    one entry in `OUTPUT_ROOTS` and is not exercised outside a browser.

SABOTAGES, all applied BY HAND -- to the GENERATED tree, to a COPY of a case,
or to a text file the gate READS -- between the run and the check.  No engine
source was patched and nothing was rebuilt (the 2026-08-18 tree-poisoning
rule).  Observed, verbatim:

  The engine's own refusals, read by hand on the offending copies (the first
  on the witness ITSELF, before its declaration was migrated):
      "MISFILED declared interior: 0/column16/stageProfile declares
       `recordType internalState;` outside 0/internalStates/.  A unit's
       interior is ONE file at <view>/internalStates/<SECTOR>/<unit>, with one
       block per kind (stageProfile { ... }); the one-directory-per-unit shape
       <view>/<SECTOR>/<unit>/<kind> is retired.  Move the record there as a
       block, or delete it -- it would otherwise be skipped in silence, ..."
      "ORPHAN declared interior: 0/internalStates/columnXX -- the file
       'columnXX' names no unit in the flattened flowsheet.  A unit's interior
       lives at <view>/internalStates/<SECTOR>/<unit>, at the address its
       STAMPED sector dictates.  The units this flowsheet has: column16
       (column16)."
      "Flowsheet: 0/ declares an interior `axialProfile` for unit 'column16'
       (type distillationColumn), and NOTHING reads it. ...  It reads:
       stageProfile."
      "declared interior 0/internalStates/column16: block `bogusBlock` is not
       a kind of internal state.  A block's name is the kind of field it
       carries; the kinds are: stageProfile, axialProfile, sizeDistribution,
       swingTable, profile."
      "DistillationColumn: the stageProfile block declared in
       0/internalStates/<SECTOR>/<unit> does not describe this column -- it
       carries 14 stages and this column declares nStages 15. ..."
      "  [names] stream 'column16' and unit 'column16' share a name; they are
       different objects at different paths (<view>/<name> is the stream,
       <view>/internalStates/<name> the unit's interior)"

  S1  deleted `converged/internalStates/column09` after the run
      -> "unit 'column09' publishes a profile (xAxis stage) and has NO file at
          converged/internalStates/column09."
  S2  changed one value of the flagship's
      `converged/internalStates/CONCENTRATION/Cryst` (block sizeDistribution)
      -> "Cryst sizeDistribution column 'mass_density'[3] = 1.2345; the JSON
          says 0.00343842655981 -- two projections of one record disagreeing."
  S3  copied a written interior to `converged/internalStates/NotAUnit`
      -> "converged/internalStates/NotAUnit is on disk and answers to NO
          published profile."
  S4  wrote the RETIRED shape `converged/column09/stageProfile` (a record) on
      the flat witness -- TWO arms fired:
      -> "converged/column09/stageProfile is on disk and answers to NO
          published profile" AND "(i): an interior record sits OUTSIDE
          internalStates/ in a state view -- the retired
          <view>/<SECTOR>/<unit>/<kind> shape, or a misfiling: ...
          converged/column09/stageProfile"
  S5  wrote `converged/internalStates/coolingTower01` on the T_K witness
      -> "internal state was written for a case whose only profile is a T_K
          construction" AND "internalStates/ exists in converged/".
  S6-S9 attack the REFUSAL arms, which the gate itself sets up: each offending
  copy was REPAIRED just before its run (a one-line hand edit of this gate's
  fixture, reverted), so the arm met a case the engine accepts.  Each said so
  rather than passing:
  S6  the stage count restored -> "(stage count wrong by one): the run
      SUCCEEDED."
  S7  the orphan file renamed back -> "(interior filed under a unit that does
      not exist): the run SUCCEEDED."
  S8  the misfiled record deleted before the run -> "(the retired shape,
      0/column16/stageProfile): the run SUCCEEDED.  A record outside
      internalStates/ was skipped in silence."
  S9  the second block dropped from the two-block fixture -> "(two blocks,
      one unread): the run SUCCEEDED."
  S10 hand-removed the `internalStates` skip from `StreamStateIO::readStateDir`
      (source text only, NOT rebuilt, reverted)
      -> "(m): StreamStateIO::readStateDir no longer skips the internalStates
          subtree by name."
  S11 added `**/0/internalStates/` to `.gitignore`
      -> "(l): a unit interior DECLARED in 0/ is gitignored."
  S12 put "internalStates" into RUN_OUTPUT_ROOTS in caseTree.ts
      -> "(k): gui/src/ui/caseTree.ts lists internalStates as a run-output
          ROOT."
  S13 left the homonym fixture's stream as `distillate` (hand edit of the
      fixture line, reverted) -- THREE arms fired:
      -> "(j) homonym: 0/column16 (stream) and 0/internalStates/column16
          (record) do not BOTH exist as their own kind." / "converged/column16
          is not a stream state file" / "the run did not announce the
          stream/unit homonym.  Identity is (kind, sector, name); a shared
          name is SAID, never refused and never silent."

  ADDED 2026-09-07 with arms (o)-(r) and the docs half of (k).  All by hand,
  between the run and the check; source SABOTAGES edit the TEXT the arm reads
  and NOTHING was rebuilt (the 2026-08-18 rule), each reverted and the tree
  verified clean with `git status` afterwards.

  S14 deleted `prof.columns["L_micron"] = Lcol;` from the crystalliser's MSMPR
      site (source text, not rebuilt) -- **THE FIRST DRAFT OF ARM (o1)
      SURVIVED THIS**, and that is why the arm now COUNTS: the file has a
      SECOND site on the same axis and a mere presence test was satisfied by
      it.  Observed twice, before and after:
      -> (presence test) "check_internal_states: OK ..."   [SURVIVED]
      -> (counting)      "(o1): src/unitOperations/crystallisation/
          Crystalliser.cpp declares `xAxis = \"L_micron\"` at 2 site(s) and
          assigns `columns[\"L_micron\"]` at 1."
  S15 changed the TRACKED witness `0/internalStates/column16` to declare
      `xAxis stageIndex;`
      -> "(o2): .../0/internalStates/column16 block `stageProfile` declares
          `xAxis stageIndex;` and carries no column of that name (it has: T,
          stage, x_benzene, x_toluene, y_benzene, y_toluene).  This file is
          one the engine's own reader refuses -- copied into 0/ it gives
          exit 2."
  S16 replaced the COPY instruction in that same tracked witness with the
      reads-nothing sentence
      -> "(q): .../0/internalStates/column16 is for a 'distillationColumn',
          which READS stageProfile, and does not carry the COPY instruction."
  S17 disarmed the writer's guard (`if (false && prof.columns.empty())`)
      -> "(r): src/io/InternalStateIO.cpp no longer guards a profile whose
          declared axis is not one of its columns.  Without it the writer
          emits `xAxis <name>;` with no such column -- a file its own reader
          refuses."
  S18 made the refusal `throw` instead of writing to stderr -- TWO arms fired:
      -> "(r): the refusal THROWS.  The call site turns a throw into one
          warning and no interiors AT ALL for the case -- the partial tree
          that lies by omission." AND "(r): the refusal is not written to
          stderr, so it depends on how loudly the run was asked to speak.  A
          refusal is not a report."
  S19 re-taught the retired shape in `docs/ai/stream-state.md` ("one DIRECTORY
      per unit, one file per kind")
      -> "(k/docs): the RETIRED one-directory-per-unit shape is still taught
          at docs/ai/stream-state.md:282."
  S20 renamed `readsInteriorKinds` to `readsInteriorKindsXX` in
      `DistillationColumn.H` (source text, not rebuilt), so no class overrides
      it and the derived type -> kinds map is empty
      -> "(q): no registered type was found to read ANY interior kind -- the
          derivation is broken and the arm would wave every COPY instruction
          through."

  ADDED 2026-09-07 with arms (s)-(v) -- `choupo-init0` materialising the
  interior half, and the completeness of a declared tree.  All by hand,
  between the run and the check; the two source sabotages edit the TEXT the
  arm reads and NOTHING was rebuilt, each reverted and the tree verified with
  `git diff --stat` afterwards.

  S21 doubled `F_extract` in the interior `choupo-init0` had just written
      (a hand edit of this gate's fixture, between the tool's run and the
      check -- the shape a tool that "improves" the seed would produce)
      -- BOTH halves of (s) fired, which is what proves they are independent:
      -> "(s) the materialised seed's `F_extract` is [0.0666666666666, ...];
          the unit's OWN seed puts 0.0333333333333 on EVERY stage (the case's
          own 0/ streams).  choupo-init0 must write the seed the unit would
          have used, never a better one." AND
      -> "(s) seeded from the interior choupo-init0 wrote, kpi
          extractor01.recovery_ethanol = 0.442431604179; the case's own golden
          says 0.441759080105 (reltol 0.0001).  The tool wrote the unit's OWN
          seed, so the answer must not move."
  S22 created `0/internalStates/` by hand on the crystalliser copy right after
      the tool ran (what the tool would have done had it written a file for a
      unit that reads nothing)
      -> "(t) choupo-init0 created 0/internalStates on
          tutorials/steady/crystallisation/crystalliser02_msmpr, whose units
          read NO interior.  A declared field nobody reads is a comment
          sitting in the state directory -- and the next run refuses it by
          name."
  S23 COMPLETED the incomplete fixture (wrote C2's stub beside C1's), so the
      snapshot is whole and the completeness refusal cannot fire
      -> "(u) the incomplete interior tree refused, but not as an incomplete
          SNAPSHOT:" followed by the column's own, different refusal -- which
      is the point: the arm can tell the two apart.
  S24 moved the tracked witness's `0/internalStates/extractor01` aside
      -> "(v) tutorials/steady/absorption/extract02_declared_interior does not
          ship 0/internalStates/extractor01 -- the extractor's round-trip
          witness has no declaration."
  S25 renamed `seedInterior` to `seedInteriorXX` in `Extractor.H` (source
      text, not rebuilt) -- **THE FIRST DRAFT OF THE SOURCE ARM SURVIVED
      THIS**, and it is the same lesson S14 taught one arm along: the test
      asked `"seedInterior" not in ext`, and a SUBSTRING is still there after
      a rename that disconnects the override from its base.  All four name
      tests in `check_source` now look for the name as a CALLABLE
      (`<name>\\s*\\(`).  Observed twice, before and after:
      -> (substring) "check_internal_states: OK ..."   [SURVIVED]
      -> (callable)  "check_internal_states: Extractor no longer publishes its
          own SEED, so choupo-init0 has nothing honest to materialise for it
          -- and a seed invented by the tool is the crutch the 2026-05-30 rule
          forbids."
  S26 replaced the solve's `seedCascade(...)` call with the loop it used to
      write inline (source text, not rebuilt), so the seed has two homes again
      -> "check_internal_states: the extractor's seed no longer has ONE home
          (`seedCascade`, called by the solve and by the published seed) --
          the file choupo-init0 writes and the state the run starts from would
          then be two different guesses."

  ARM (p) HAS NO POST-FIX SABOTAGE, said plainly.  It runs the real binary, so
  nothing short of rebuilding a broken engine reaches it -- and rebuilding is
  the tree-poisoning shape only `check_gate_selftest` may take.  Its evidence
  is the DEFECT ITSELF, observed on the shipped binary before the fix: a fresh
  `crystalliser02_msmpr` run wrote `xAxis L_micron;` with columns
  {mass_density, number_density}, and copying that file into
  `0/internalStates/cryst` gave exit 2 with "declares `xAxis L_micron;` and
  carries no column of that name -- the axis is the one column that must be
  there."  That is precisely the state this arm forbids.

  NOT SABOTAGED, and said rather than implied: the two `[seed]` announcements
  and the `[names]` announcement themselves.  Suppressing one needs a source
  patch and a rebuild, which is the shape only `check_gate_selftest` may
  take; what stands instead is that the arms REQUIRE the line and the whole
  gate fails without it.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

FRACTAL = "tutorials/plant/ChemicalPlantTutorial"                   # sectors, sizeDistribution x2
FLAT    = "tutorials/steady/distillation/column09_tray_hydraulics"  # stageProfile + marker
SWEPT   = "tutorials/steady/heat/coolingTower01_merkel"             # T_K: NO file
SWING   = "tutorials/steady/separation/psa01_h2_psa"                # componentIndex -> swingTable
SEEDED  = "tutorials/steady/distillation/column16_declared_interior"  # ships 0/internalStates/column16
CRYST   = "tutorials/steady/crystallisation/crystalliser02_msmpr"   # sizeDistribution, READS none
EXTRACT = "tutorials/steady/absorption/extract01_ethanol_water_benzene"  # READS one, declares none
EXTRACT_SEEDED = "tutorials/steady/absorption/extract02_declared_interior"  # ships its declaration
TWO_READERS = "tutorials/plant/acetonePlant"    # TWO units that read one + one that reads none

#  THE CASES THIS GATE RUNS, and therefore the ONLY cases whose `converged/`
#  it may read.  A `converged/` tree is a gitignored RUN OUTPUT: whatever
#  happens to be on disk was written by whichever binary ran last, so an arm
#  that sweeps every case under tutorials/ is reading a stale artefact and
#  reporting it as today's engine.  The domain is: what these runs just wrote,
#  plus every interior record TRACKED in git (the authored `0/` half, which is
#  what a student opens in the repository).
FRESH = (FRACTAL, FLAT, SWING, SWEPT, CRYST, SEEDED)

VIEW  = "converged"
IROOT = "internalStates"      # InternalStateIO::ROOT, recounted
TOL   = 1.0e-9
KINDS = ("stageProfile", "axialProfile", "sizeDistribution", "swingTable", "profile")

BEGIN, END = "<<<Choupo:result-begin>>>", "<<<Choupo:result-end>>>"


def kind_of(x_axis):
    """The writer's table, recounted.  Empty = declined."""
    if x_axis == "T_K":
        return ""
    if x_axis == "stage":
        return "stageProfile"
    if x_axis in ("V", "z", "z_m", "position"):
        return "axialProfile"
    if x_axis in ("L_micron", "diameter_micron"):
        return "sizeDistribution"
    if x_axis == "componentIndex":
        return "swingTable"
    return "profile"


def run_case(path):
    proc = subprocess.run([str(ROOT / "choupoSolve"), str(path)],
                          capture_output=True, text=True)
    return proc.returncode, proc.stdout, proc.stderr


def result_json(out):
    a = out.find(BEGIN)
    b = out.find(END)
    if a < 0 or b < 0:
        return None
    return json.loads(out[a + len(BEGIN):b])


def strip_comments(t):
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    return re.sub(r'//[^\n]*', '', t)


def is_interior_record(path):
    """The record identifies ITSELF -- the same rule the engine's reader uses.
    Nothing here decides by directory or file NAME."""
    try:
        body = path.read_text(errors="replace")
    except OSError:
        return False
    return "recordType" in body and "internalState" in body


def is_stream_state(path):
    """The stream reader's own marker (StreamStateIO::looksLikeStreamState),
    recounted for the one form the witness writes."""
    try:
        body = path.read_text(errors="replace")
    except OSError:
        return False
    return "componentFlows" in body or "componentMolarFlows" in body


def _brace_body(t, open_at):
    """The text between the brace at `open_at` and its match."""
    depth, j = 0, open_at
    while j < len(t):
        if t[j] == "{":
            depth += 1
        elif t[j] == "}":
            depth -= 1
            if depth == 0:
                return t[open_at + 1:j], j
        j += 1
    return t[open_at + 1:], len(t)


def _parse_columns(body):
    cols = {}
    for cm in re.finditer(r'([A-Za-z_][\w]*)\s*\(([^)]*)\)\s*;', body):
        vals = []
        for tok in cm.group(2).split():
            if tok in ("nan", "-nan", "inf", "-inf"):
                vals.append(None)
            else:
                vals.append(float(tok))
        cols[cm.group(1)] = vals
    return cols


def parse_file(text):
    """The file, as a small reader sees it: header words, then one entry per
    top-level BLOCK -- {xAxis, nPoints, columns, markers}."""
    t = strip_comments(text)
    out = {"header": {}, "blocks": {}}
    for k in ("recordType", "unit", "sector", "equipment"):
        m = re.search(r'^\s*%s\s+"?([^";\n]+)"?\s*;' % k, t, re.M)
        if m:
            out["header"][k] = m.group(1).strip()
    for bm in re.finditer(r'^([A-Za-z_][\w]*)\s*\n\{', t, re.M):
        name = bm.group(1)
        body, _ = _brace_body(t, t.index("{", bm.start()))
        blk = {"xAxis": None, "nPoints": None, "columns": {}, "markers": []}
        m = re.search(r'^\s*xAxis\s+(\S+)\s*;', body, re.M)
        if m:
            blk["xAxis"] = m.group(1)
        m = re.search(r'^\s*nPoints\s+(\d+)\s*;', body, re.M)
        if m:
            blk["nPoints"] = int(m.group(1))
        cm = re.search(r'^\s*columns\s*\n\s*\{', body, re.M)
        if cm:
            cbody, _ = _brace_body(body, body.index("{", cm.start()))
            blk["columns"] = _parse_columns(cbody)
        mm = re.search(r'^\s*markers\s*\n\s*\((.*?)^\s*\);', body, re.M | re.S)
        if mm:
            for k in re.finditer(r'\{\s*x\s+([-\d.eE+]+)\s*;\s*label\s+"((?:[^"\\]|\\.)*)"\s*;\s*\}',
                                 mm.group(1)):
                blk["markers"].append((float(k.group(1)),
                                       k.group(2).replace('\\"', '"').replace("\\\\", "\\")))
        out["blocks"][name] = blk
    return out


def close(a, b, tol=TOL):
    if a is None or b is None:
        return a is None and b is None
    d = max(abs(a), abs(b), 1.0e-300)
    return abs(a - b) / d <= tol


def leaf_of(unit, sector):
    leaf = unit
    if sector and leaf.startswith(sector + "."):
        leaf = leaf[len(sector) + 1:]
    return leaf


def sector_path(sector):
    return sector.replace(".", "/") if sector else ""


def records_under(view):
    """Every interior record on disk under a view, found by what it says."""
    out = set()
    if view.is_dir():
        for p in view.rglob("*"):
            if p.is_file() and is_interior_record(p):
                out.add(p)
    return out


def check_case(rel, expect_sector, problems, notes):
    """Arms (a)(b)(c)(e) on one case.  Returns the number of files checked and
    the set of kinds seen."""
    rc, out, err = run_case(ROOT / rel)
    if rc != 0:
        problems.append("%s: the run failed (rc=%d) -- nothing to check.\n    %s"
                        % (rel, rc, err.strip()[:300]))
        return 0, set()
    j = result_json(out)
    if j is None:
        problems.append("%s: no result JSON between the markers." % rel)
        return 0, set()
    profiles = j.get("profiles", {})
    sectors = j.get("unitSectors", {})
    view = ROOT / rel / VIEW
    root = view / IROOT

    expected = {}     # file path -> (unit, kind, profile)
    declined = []
    for unit, prof in profiles.items():
        kind = kind_of(prof.get("xAxis", ""))
        if kind == "":
            declined.append(unit)
            continue
        sector = sectors.get(unit, "")
        if expect_sector and not sector:
            problems.append("%s: unit '%s' publishes a profile and the JSON's "
                            "unitSectors names no sector for it on a fractal case."
                            % (rel, unit))
        d = root
        if sector:
            d = d / sector_path(sector)
        d = d / leaf_of(unit, sector)
        expected[d] = (unit, kind, prof)

    # ---------------------------------------------------------------- (b)
    on_disk = records_under(view)
    for p in sorted(on_disk - set(expected)):
        problems.append("%s: %s is on disk and answers to NO published profile "
                        "-- a stale file, or one written for a declined axis."
                        % (rel, p.relative_to(ROOT / rel)))

    checked, kinds = 0, set()
    for path, (unit, kind, prof) in expected.items():
        # ------------------------------------------------------------ (a)
        if not path.is_file():
            problems.append("%s: unit '%s' publishes a profile (xAxis %s) and has "
                            "NO file at %s." % (rel, unit, prof.get("xAxis"),
                                                path.relative_to(ROOT / rel)))
            continue
        checked += 1
        # ------------------------------------------------------------ (e)
        if not expect_sector and path.parent != root:
            problems.append("%s: flat case grew a directory level under %s/%s/ "
                            "(%s).  Empty is not a sector called 'root'."
                            % (rel, VIEW, IROOT, path.relative_to(ROOT / rel)))

        raw = path.read_text(errors="replace")
        f = parse_file(raw)
        h = f["header"]
        if h.get("recordType") != "internalState":
            problems.append("%s: %s carries no `recordType internalState;`."
                            % (rel, path.relative_to(ROOT / rel)))
        body = strip_comments(raw)
        if body.count("{") != body.count("}"):
            problems.append("%s: %s has unbalanced braces." % (rel, path.name))
        if body.count("(") != body.count(")"):
            problems.append("%s: %s has unbalanced parentheses." % (rel, path.name))
        if h.get("unit") != unit:
            problems.append("%s: %s names unit '%s', expected '%s'."
                            % (rel, path.relative_to(ROOT / rel), h.get("unit"), unit))
        if expect_sector and h.get("sector") != sectors.get(unit):
            problems.append("%s: %s declares sector '%s'; unitSectors says '%s'."
                            % (rel, path.name, h.get("sector"), sectors.get(unit)))
        if not expect_sector and "sector" in h:
            problems.append("%s: %s declares a sector on a flat case." % (rel, path.name))
        if not h.get("equipment"):
            problems.append("%s: %s names no equipment type." % (rel, path.name))
        for bname in f["blocks"]:
            if bname not in KINDS:
                problems.append("%s: %s carries a block `%s` that is not a kind."
                                % (rel, path.name, bname))
        if kind not in f["blocks"]:
            problems.append("%s: %s has no `%s` block (blocks: %s); the JSON axis "
                            "is %s." % (rel, path.name, kind, sorted(f["blocks"]),
                                        prof.get("xAxis")))
            continue
        kinds.add(kind)
        blk = f["blocks"][kind]
        if blk["xAxis"] != prof.get("xAxis"):
            problems.append("%s: %s block %s declares xAxis '%s'; the JSON says '%s'."
                            % (rel, path.name, kind, blk["xAxis"], prof.get("xAxis")))

        # ------------------------------------------------------------ (c)
        cols = prof.get("columns", {})
        x = prof.get("xAxis")
        n_json = len(cols.get(x, [])) if x in cols else max((len(v) for v in cols.values()), default=0)
        n_file = blk["nPoints"] if blk["nPoints"] is not None else -1
        if n_file != n_json:
            problems.append("%s: %s block %s says nPoints %d; the JSON axis column has %d."
                            % (rel, path.name, kind, n_file, n_json))
        for cname, jvals in cols.items():
            if cname not in blk["columns"]:
                problems.append("%s: %s block %s omits column '%s', which the JSON "
                                "publishes." % (rel, path.name, kind, cname))
                continue
            fvals = blk["columns"][cname]
            if len(fvals) != len(jvals):
                problems.append("%s: %s block %s column '%s' has %d values; the JSON "
                                "has %d." % (rel, path.name, kind, cname, len(fvals), len(jvals)))
                continue
            for i, (a, b) in enumerate(zip(fvals, jvals)):
                if not close(a, b):
                    problems.append("%s: %s %s column '%s'[%d] = %s; the JSON says %s "
                                    "-- two projections of one record disagreeing."
                                    % (rel, path.name, kind, cname, i, a, b))
                    break
        for cname in blk["columns"]:
            if cname not in cols:
                problems.append("%s: %s block %s carries column '%s', which the JSON "
                                "does not publish." % (rel, path.name, kind, cname))
        jm = [(m["x"], m["label"]) for m in prof.get("markers", [])]
        if len(jm) != len(blk["markers"]):
            problems.append("%s: %s block %s has %d marker(s); the JSON has %d."
                            % (rel, path.name, kind, len(blk["markers"]), len(jm)))
        else:
            for (fx, fl), (jx, jl) in zip(blk["markers"], jm):
                if not close(fx, jx) or fl != jl:
                    problems.append("%s: %s marker (%s, '%s') vs JSON (%s, '%s')."
                                    % (rel, path.name, fx, fl, jx, jl))
        notes.append("%s (%s, %d pts)" % (leaf_of(unit, sectors.get(unit, "")),
                                          kind, n_json))
    if declined:
        notes.append("declined on %s: %s" % (rel.split("/")[-1], ", ".join(declined)))
    return checked, kinds


def check_swept(problems, notes):
    """(d) The T_K witness: a profile is published, no record is written into
    the state view, and the run says why."""
    rc, out, err = run_case(ROOT / SWEPT)
    if rc != 0:
        problems.append("%s: the run failed (rc=%d)." % (SWEPT, rc))
        return
    j = result_json(out)
    profs = (j or {}).get("profiles", {})
    tk = [u for u, p in profs.items() if p.get("xAxis") == "T_K"]
    if not tk:
        problems.append("%s: publishes no T_K profile any more -- the exclusion "
                        "arm has no witness.  Point it at a case that does."
                        % SWEPT)
        return
    view = ROOT / SWEPT / VIEW
    recs = [str(p.relative_to(ROOT / SWEPT)) for p in records_under(view)]
    if recs:
        problems.append("%s: internal state was written for a case whose only "
                        "profile is a T_K construction (%s).  A Merkel diagram "
                        "is an analysis over a swept parameter, not equipment "
                        "state." % (SWEPT, recs))
    if (view / IROOT).exists():
        problems.append("%s: %s/ exists in %s/ for a case whose only profile is "
                        "declined." % (SWEPT, IROOT, VIEW))
    if "T_K" not in out or "NOT written" not in out:
        problems.append("%s: the declined T_K profile was not ANNOUNCED.  A skipped "
                        "profile the reader cannot see is a silent drop." % SWEPT)
    notes.append("T_K declined and announced on %s (%s)" % (SWEPT.split("/")[-1], ", ".join(tk)))


# ---------------------------------------------------------------------------
#  The round trip, the refusals, the two-block fixture and the homonym.  Each
#  works on a COPY of the witness under a temp directory: the sabotage is a
#  file operation, never a source patch and a rebuild.
# ---------------------------------------------------------------------------
def copy_case(dst):
    shutil.copytree(ROOT / SEEDED, dst,
                    ignore=shutil.ignore_patterns("converged", "reports",
                                                  "iterations", "design",
                                                  "log.*"))
    return dst


def golden_rows(case):
    """The `expected` rows this gate can compare from the result JSON: the
    per-unit KPIs and the per-stream F/T, with each row's own tolerance."""
    rows = []
    for line in (case / "expected").read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) < 5 or parts[0] not in ("kpi", "stream"):
            continue
        rows.append((parts[0], parts[1], parts[2], float(parts[3]), float(parts[4])))
    return rows


def check_round_trip(problems, notes):
    """(f)(g)(h)(j).  What `converged/` writes, `0/` accepts -- and every
    declaration that does not describe the column, or sits where nothing
    reads it, refuses by name."""
    tmp = Path(tempfile.mkdtemp(prefix="choupo_interior_"))
    decl = Path("0") / IROOT / "column16"
    try:
        # ---- (g) the shipped witness: seeded ---------------------------
        rc, out, err = run_case(ROOT / SEEDED)
        if rc != 0:
            problems.append("%s: the seeded run failed (rc=%d).\n    %s"
                            % (SEEDED, rc, err.strip()[:300]))
            return
        if not (ROOT / SEEDED / decl).is_file():
            problems.append("%s: does not ship %s -- the round-trip witness has "
                            "no declaration." % (SEEDED, decl))
        if "[seed] interior read from 0/" not in out:
            problems.append("%s: ships %s and did NOT announce `[seed] interior "
                            "read from 0/`.  A solver aid that binds without "
                            "saying so is the silence this slice exists to end."
                            % (SEEDED, decl))
        j = result_json(out) or {}
        it_seeded = (j.get("kpis", {}).get("column16", {}) or {}).get("iterations")

        for kind, name, key, want, reltol in golden_rows(ROOT / SEEDED):
            if kind == "kpi":
                got = (j.get("kpis", {}).get(name, {}) or {}).get(key)
            else:
                got = (j.get("streams", {}).get(name, {}) or {}).get(key)
            if got is None:
                problems.append("%s: the golden pins %s %s.%s and the run publishes "
                                "no such value." % (SEEDED, kind, name, key))
                continue
            if abs(got - want) > reltol * max(abs(want), 1.0e-300):
                problems.append("%s: seeded run gives %s %s.%s = %.12g; its own "
                                "golden says %.12g (reltol %g).  A declared "
                                "interior is a SEED and must not move the answer."
                                % (SEEDED, kind, name, key, got, want, reltol))

        # ---- (g) the same case with the declaration removed -------------
        bare = copy_case(tmp / "bare")
        shutil.rmtree(bare / "0" / IROOT)
        rc, out2, err2 = run_case(bare)
        if rc != 0:
            problems.append("%s (declaration removed): the run failed (rc=%d).\n    %s"
                            % (SEEDED, rc, err2.strip()[:300]))
        else:
            if "[seed] interior seeded by the unit" not in out2:
                problems.append("%s (declaration removed): the unit did not announce "
                                "that it seeded its OWN interior.  Silence must mean "
                                "'nothing to say', never 'the block did not run'."
                                % SEEDED)
            j2 = result_json(out2) or {}
            it_bare = (j2.get("kpis", {}).get("column16", {}) or {}).get("iterations")
            if it_seeded is None or it_bare is None:
                problems.append("%s: the column publishes no `iterations` KPI, so "
                                "the round trip cannot be measured." % SEEDED)
            elif it_seeded > it_bare:
                problems.append("%s: the run seeded from 0/ took %g outer iterations "
                                "and the unseeded one took %g.  A declared interior "
                                "that costs iterations is not a restart."
                                % (SEEDED, it_seeded, it_bare))
            else:
                notes.append("round trip: %g outer iterations seeded from 0/, %g "
                             "unseeded" % (it_seeded, it_bare))

        # ---- (h) a declaration that does not describe this column -------
        wrong = copy_case(tmp / "wrong")
        f = wrong / decl
        txt = f.read_text()
        #  Drop the LAST stage from the axis column: fifteen stages declared,
        #  fourteen offered.  A file edit, between the copy and the run.
        txt = txt.replace("            9 10 11 12 13 14 15\n", "            9 10 11 12 13 14\n", 1)
        f.write_text(txt)
        rc, out3, err3 = run_case(wrong)
        blob = out3 + err3
        if rc == 0:
            problems.append("%s (stage count wrong by one): the run SUCCEEDED.  A "
                            "declaration that does not describe the column must "
                            "refuse, never be seeded from and never be ignored."
                            % SEEDED)
        elif "does not describe this column" not in blob:
            problems.append("%s (stage count wrong by one): refused, but the message "
                            "does not name the mismatch:\n    %s"
                            % (SEEDED, blob.strip()[-300:]))

        # ---- (h) an orphan interior --------------------------------------
        orphan = copy_case(tmp / "orphan")
        (orphan / decl).rename(orphan / "0" / IROOT / "columnXX")
        rc, out4, err4 = run_case(orphan)
        blob = out4 + err4
        if rc == 0:
            problems.append("%s (interior filed under a unit that does not exist): "
                            "the run SUCCEEDED.  An orphan interior is a claim about "
                            "nothing, and the case keeps believing it was read."
                            % SEEDED)
        elif "ORPHAN declared interior" not in blob:
            problems.append("%s (orphan interior): refused, but not by name:\n    %s"
                            % (SEEDED, blob.strip()[-300:]))

        # ---- (h) the RETIRED shape: a record outside internalStates/ ------
        misfiled = copy_case(tmp / "misfiled")
        (misfiled / "0" / "column16").mkdir()
        (misfiled / decl).rename(misfiled / "0" / "column16" / "stageProfile")
        shutil.rmtree(misfiled / "0" / IROOT)
        rc, out5, err5 = run_case(misfiled)
        blob = out5 + err5
        if rc == 0:
            problems.append("%s (the retired shape, 0/column16/stageProfile): the run "
                            "SUCCEEDED.  A record outside %s/ was skipped in "
                            "silence -- the case believes it was seeded and it was "
                            "not." % (SEEDED, IROOT))
        elif "MISFILED declared interior" not in blob:
            problems.append("%s (retired shape): refused, but not by name:\n    %s"
                            % (SEEDED, blob.strip()[-300:]))

        # ---- (f) two blocks in one file, the second unread ----------------
        two = copy_case(tmp / "two")
        f = two / decl
        txt = f.read_text()
        i = txt.index("stageProfile\n{")
        txt = txt + "\n" + txt[i:].replace("stageProfile\n{", "axialProfile\n{", 1)
        f.write_text(txt)
        rc, out6, err6 = run_case(two)
        blob = out6 + err6
        if rc == 0:
            problems.append("%s (two blocks, one unread): the run SUCCEEDED.  A "
                            "declared field nobody reads is a comment sitting in "
                            "the state directory -- or the reader parsed only the "
                            "first block." % SEEDED)
        elif "NOTHING reads it" not in blob or "axialProfile" not in blob:
            problems.append("%s (two blocks, one unread): refused, but not naming "
                            "the second block:\n    %s" % (SEEDED, blob.strip()[-300:]))
        else:
            notes.append("two blocks parsed from one file (the second refused by name)")

        # ---- (f) a block whose name is not a kind -------------------------
        bogus = copy_case(tmp / "bogus")
        f = bogus / decl
        txt = f.read_text()
        i = txt.index("stageProfile\n{")
        txt = txt + "\n" + txt[i:].replace("stageProfile\n{", "bogusBlock\n{", 1)
        f.write_text(txt)
        rc, out7, err7 = run_case(bogus)
        blob = out7 + err7
        if rc == 0:
            problems.append("%s (a block named bogusBlock): the run SUCCEEDED.  An "
                            "unknown block name must refuse by name." % SEEDED)
        elif "bogusBlock" not in blob or "not a kind" not in blob:
            problems.append("%s (unknown block): refused, but not by name:\n    %s"
                            % (SEEDED, blob.strip()[-300:]))

        # ---- (j) the stream/unit homonym ----------------------------------
        #  The column's distillate takes the column's own name.  Identity is
        #  (kind, sector, name): the stream `column16` and the unit `column16`
        #  live at different paths and the run must say so once.
        hom = copy_case(tmp / "homonym")
        fd = hom / "system" / "flowsheetDict"
        fdt = fd.read_text()
        if "distillate" not in fdt:
            problems.append("%s: its flowsheetDict names no `distillate` stream; the "
                            "homonym fixture cannot be built." % SEEDED)
        else:
            fd.write_text(re.sub(r'\bdistillate\b', "column16", fdt))
            (hom / "0" / "distillate").rename(hom / "0" / "column16")
            rc, out8, err8 = run_case(hom)
            blob = out8 + err8
            if rc != 0:
                problems.append("%s (homonym: stream and unit both named column16): the "
                                "run FAILED (rc=%d).  Two objects of different kinds "
                                "may share a name.\n    %s"
                                % (SEEDED, rc, blob.strip()[-300:]))
            else:
                s0, i0 = hom / "0" / "column16", hom / decl
                sc, ic = hom / VIEW / "column16", hom / VIEW / IROOT / "column16"
                if not (s0.is_file() and is_stream_state(s0) and i0.is_file()
                        and is_interior_record(i0)):
                    problems.append("(j) homonym: 0/column16 (stream) and %s (record) "
                                    "do not BOTH exist as their own kind." % decl)
                if "[seed] interior read from 0/" not in out8:
                    problems.append("(j) homonym: the interior was not read from 0/ "
                                    "beside the homonymous stream.")
                if not (sc.is_file() and is_stream_state(sc)):
                    problems.append("(j) homonym: converged/column16 is not a stream "
                                    "state file -- the interior overwrote it, or the "
                                    "stream was not written.")
                if not (ic.is_file() and is_interior_record(ic)):
                    problems.append("(j) homonym: converged/%s/column16 is not an "
                                    "interior record -- the stream overwrote it, or "
                                    "the interior was not written." % IROOT)
                if "[names] stream 'column16' and unit 'column16' share a name" not in out8:
                    problems.append("(j) homonym: the run did not announce the "
                                    "stream/unit homonym.  Identity is (kind, sector, "
                                    "name); a shared name is SAID, never refused and "
                                    "never silent.")
                else:
                    notes.append("homonym: stream column16 and unit column16 at two "
                                 "paths, announced")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def check_no_retired_shape(problems, notes):
    """(i) No interior record sits outside internalStates/ in any state view
    under tutorials/.  The sweep that retired the shape removed 85 such
    directories; this keeps them from coming back."""
    bad = []
    for view in list((ROOT / "tutorials").rglob("converged")) + \
                list((ROOT / "tutorials").rglob("0")):
        if not view.is_dir():
            continue
        for p in view.rglob("*"):
            if not p.is_file():
                continue
            rel = p.relative_to(view)
            if rel.parts and rel.parts[0] == IROOT:
                continue
            if is_interior_record(p):
                bad.append(str(p.relative_to(ROOT)))
    if bad:
        problems.append("check_internal_states(i): an interior record sits OUTSIDE "
                        "%s/ in a state view -- the retired <view>/<SECTOR>/<unit>/"
                        "<kind> shape, or a misfiling: %s%s"
                        % (IROOT, ", ".join(bad[:5]),
                           " (+%d more)" % (len(bad) - 5) if len(bad) > 5 else ""))
    else:
        notes.append("no record outside %s/ in any state view under tutorials/" % IROOT)


def check_retired(problems, notes):
    """(k) The TOP-LEVEL view existed for one day.  It must be gone from the
    tree and from every line that could route output to it -- while the NAME
    lives on inside each state view as the interiors' own root."""
    stale = []
    for p in (ROOT / "tutorials").rglob(IROOT):
        if not p.is_dir():
            continue
        parent = p.parent.name
        if parent in ("0", VIEW) or re.fullmatch(r"\d+(\.\d+)?", parent):
            continue
        stale.append(str(p.relative_to(ROOT)))
    if stale:
        problems.append("check_internal_states(k): a top-level `%s/` directory still "
                        "exists at a case ROOT under tutorials/ (%s).  The view is "
                        "retired; the interiors live INSIDE 0/ and converged/."
                        % (IROOT, ", ".join(stale[:5])))
    tree = (ROOT / "gui/src/ui/caseTree.ts").read_text(errors="replace")
    m = re.search(r'RUN_OUTPUT_ROOTS[^=]*=\s*\[([^\]]*)\]', tree)
    roots = [x.strip().strip('"') for x in (m.group(1).split(",") if m else [])]
    if IROOT in roots:
        problems.append("check_internal_states(k): gui/src/ui/caseTree.ts lists %s as "
                        "a run-output ROOT.  It is not a root; it lives inside a "
                        "view, and a root would be a folder no writer produces."
                        % IROOT)
    worker = (ROOT / "gui/public/workers/solverWorker.js").read_text(errors="replace")
    if '"/case/%s/"' % IROOT in worker:
        problems.append("check_internal_states(k): the worker still walks a top-level "
                        "/case/%s/." % IROOT)
    gi = (ROOT / ".gitignore").read_text()
    hits = [n for n, line in enumerate(gi.splitlines(), 1)
            if IROOT in line and not line.lstrip().startswith("#")]
    if hits:
        problems.append("check_internal_states(k): .gitignore line(s) %s name `%s`.  "
                        "No rule may: converged/ already covers the engine's half, "
                        "and a rule on the name takes the AUTHORED 0/ half with it."
                        % (hits, IROOT))
    #  THE RETIRED SHAPE IN docs/, which no arm looked for.  Arm (k) swept
    #  src/, bin/, gui/ and .gitignore for the retired NAME; nothing looked in
    #  docs/ for the retired SHAPE, and `bin/llmctx` ships docs/ai/ to an
    #  assistant helping a student author a case -- so a stale sentence there
    #  is a wrong case authored tomorrow.  The phrases below described the
    #  2026-09-06 MORNING layout (a DIRECTORY per unit, one file per kind),
    #  which the engine now REFUSES BY NAME as MISFILED.  A design record may
    #  quote them as history; nothing else may state them.
    retired_shape = [
        "DIRECTORY per unit",
        "a DIRECTORY a unit's interior",
        "a DIRECTORY is a unit",
    ]
    doc_hits = []
    #  The RECORD homes are exempt, and only they: a design record and the
    #  decision index exist to state what was decided AND what amended it, so
    #  they quote the retired shape with its amendment in the same sentence.
    #  Every TEACHING page is held.
    for f in sorted((ROOT / "docs").rglob("*.md")) + sorted((ROOT / "docs").rglob("*.tex")):
        rel = str(f.relative_to(ROOT))
        if (rel.startswith("docs/design/") or "/archive/" in rel
                or rel == "docs/architecture/decision-records.md"):
            continue
        body = f.read_text(errors="replace")
        for n, line in enumerate(body.splitlines(), 1):
            for phrase in retired_shape:
                if phrase in line:
                    doc_hits.append("%s:%d" % (f.relative_to(ROOT), n))
    if doc_hits:
        problems.append("check_internal_states(k/docs): the RETIRED "
                        "one-directory-per-unit shape is still taught at %s.  A "
                        "unit's interior is ONE file at "
                        "<view>/internalStates/<SECTOR>/<unit> with one block per "
                        "kind; the engine refuses the old shape as MISFILED, and "
                        "bin/llmctx ships docs/ai/ to an assistant authoring cases."
                        % ", ".join(doc_hits[:6]))
    if not stale and IROOT not in roots and not hits and not doc_hits:
        notes.append("no top-level %s/ view in the tree, the GUI roots, .gitignore "
                     "or the docs, and no docs/ page teaches the retired "
                     "one-directory-per-unit shape" % IROOT)


# ---------------------------------------------------------------------------
#  (o) THE AXIS A PROFILE DECLARES IS A COLUMN OF IT.
# ---------------------------------------------------------------------------
def check_axis_present(problems, notes):
    """(o) A profile publishes `xAxis <name>` AND a column called <name>, on
    every surface that carries it.

    WHY THIS ARM EXISTS.  It did not, and that is exactly why the defect it
    now catches survived: arm (c) compares the written block against the JSON
    `profiles` block, and the crystalliser was missing its size axis in BOTH
    -- equally -- so two wrong projections of one incomplete record agreed
    perfectly and the gate passed.  The writer emitted `xAxis L_micron;` and
    no `L_micron` column; the reader refuses exactly that file; and the JSON,
    `profile.csv`, the spreadsheet and the GUI plot all look the axis up in
    `columns` and silently draw nothing.  A crystal size distribution was
    published everywhere without the size it is distributed over.

    Three halves, because one alone would miss it:

      (o1) SOURCE, and it COUNTS.  A file under `src/unitOperations/` that
           assigns a literal `xAxis` at N sites must assign that axis column
           at least N times (through `columns` or a reference bound to it).
           The count is not decoration: a presence test alone was written
           first and SURVIVED its own sabotage -- the crystalliser has TWO
           profile sites on `L_micron`, and the second satisfied the test
           after the first was removed.  Its LIMIT: a helper legitimately
           filling two profiles from one assignment would be accused; none
           does, and every pair in the corpus has margin.
      (o2) CORPUS.  Every interior RECORD this gate's own runs produced, plus
           every one TRACKED in git, declares an axis it carries -- the
           reader's own precondition, swept.  The domain is deliberately NOT
           "every case under tutorials/": a `converged/` tree is a gitignored
           run output, so sweeping all of them reads whatever the last binary
           to run left behind and reports it as today's engine.
      (o3) JSON.  In the cases this gate runs, every published profile carries
           its declared axis, INCLUDING the ones the writer declines (`T_K`):
           a declined profile writes no file and still reaches the JSON, the
           CSV, the spreadsheet and the plot.
    """
    # ---------------------------------------------------------------- (o1)
    src = ROOT / "src" / "unitOperations"
    sites = 0
    for f in sorted(src.rglob("*.cpp")):
        body = f.read_text(errors="replace")
        #  A unit may subscript `columns` DIRECTLY or through a reference
        #  bound to it (`auto& cols = profile_->columns;` -- SpiralWoundModule
        #  and PSA both do).  Both are the same act, so the arm resolves the
        #  aliases the file itself declares rather than reading only the long
        #  form and accusing correct code.
        holders = ["columns"] + re.findall(
            r'auto\s*&\s*(\w+)\s*=\s*[\w>.\-]*\bcolumns\s*;', body)
        axes = set(re.findall(r'xAxis\s*=\s*"([^"]+)"', body))
        for ax in sorted(axes):
            #  COUNT, do not merely look.  A file with TWO profile sites on one
            #  axis satisfies a mere presence test with ONE of them -- measured:
            #  removing the crystalliser's MSMPR axis assignment and leaving the
            #  population-balance one left the first draft of this arm GREEN.
            #  So a file declaring an axis at N sites must assign that axis
            #  column at least N times.  Its LIMIT, stated: a helper that
            #  legitimately filled two profiles from one assignment would be
            #  accused.  None does -- every pair in the corpus has margin
            #  (stage 3:2, V 4:2, T_K 2:1) -- and the day one appears the remedy
            #  is to say so here, not to drop the count.
            n_ax = len(re.findall(r'xAxis\s*=\s*"%s"' % re.escape(ax), body))
            n_col = sum(len(re.findall(r'%s\["%s"\]' % (re.escape(h), re.escape(ax)),
                                       body)) for h in holders)
            sites += n_ax
            if n_col < n_ax:
                problems.append(
                    "check_internal_states(o1): %s declares `xAxis = \"%s\"` at %d "
                    "site(s) and assigns `columns[\"%s\"]` at %d.  The axis is the "
                    "one column that must be there: the interior writer REFUSES "
                    "the profile, and the JSON, profile.csv, the spreadsheet and "
                    "the GUI plot each draw nothing where the axis should be."
                    % (f.relative_to(ROOT), ax, n_ax, ax, n_col))
    if sites == 0:
        problems.append("check_internal_states(o1): no `xAxis = \"...\"` site found "
                        "under src/unitOperations/ -- the arm cannot fire.")

    # ---------------------------------------------------------------- (o2)
    records = 0
    for f in live_records():
        records += 1
        parsed = parse_file(f.read_text(errors="replace"))
        for bname, blk in parsed["blocks"].items():
            ax = blk["xAxis"]
            if ax and ax not in blk["columns"]:
                problems.append(
                    "check_internal_states(o2): %s block `%s` declares `xAxis %s;` "
                    "and carries no column of that name (it has: %s).  This file "
                    "is one the engine's own reader refuses -- copied into 0/ it "
                    "gives exit 2."
                    % (f.relative_to(ROOT), bname, ax,
                       ", ".join(sorted(blk["columns"])) or "nothing"))
    notes.append("axis present in %d source site(s) and %d interior record(s)"
                 % (sites, records))
    if records == 0:
        problems.append("check_internal_states(o2): no interior record was in "
                        "reach -- the arm cannot fire.")


def live_records():
    """Every interior record this gate is entitled to read: the ones its own
    runs just produced, plus every one tracked in git."""
    out = []
    for rel in FRESH:
        view = ROOT / rel / VIEW / IROOT
        if view.is_dir():
            out += [f for f in sorted(view.rglob("*")) if f.is_file()]
    try:
        tracked = subprocess.run(["git", "ls-files", "tutorials"], cwd=str(ROOT),
                                 capture_output=True, text=True, check=True).stdout
    except Exception:
        tracked = ""
    for line in tracked.splitlines():
        f = ROOT / line
        if f.is_file() and is_interior_record(f):
            out.append(f)
    seen, uniq = set(), []
    for f in out:
        if f in seen or not is_interior_record(f):
            continue
        seen.add(f)
        uniq.append(f)
    return uniq


def check_axis_in_json(rel, problems):
    """(o3) on one case: every published profile carries its own axis."""
    rc, out, err = run_case(ROOT / rel)
    if rc != 0:
        problems.append("check_internal_states(o3): %s failed (rc=%d)." % (rel, rc))
        return
    j = result_json(out) or {}
    for unit, prof in (j.get("profiles", {}) or {}).items():
        ax = prof.get("xAxis", "")
        cols = prof.get("columns", {}) or {}
        if ax and ax not in cols:
            problems.append(
                "check_internal_states(o3): %s publishes a profile for unit '%s' "
                "declaring xAxis '%s' with no column of that name (it has: %s).  "
                "The JSON, profile.csv, the spreadsheet and the GUI plot all read "
                "the axis out of `columns`; a DECLINED profile (T_K) writes no "
                "file and still reaches all four."
                % (rel, unit, ax, ", ".join(sorted(cols)) or "nothing"))


# ---------------------------------------------------------------------------
#  (p) THE ROUND TRIP ON A UNIT THAT READS NOTHING.
# ---------------------------------------------------------------------------
def check_round_trip_crystalliser(problems, notes):
    """(p) The round trip, taken on a CRYSTALLISER rather than on the column.

    WHAT THE CLAIM IS, and what it is NOT.  Arm (g) runs the round trip on the
    ONE unit type that reads a declared interior, so for eleven months of unit
    types nothing exercised the reader against what the writer produced.  A
    crystalliser reads NO kind, so its round trip cannot end in a seed -- what
    it can and must show is that the file the writer produced is one the
    reader ACCEPTS, and that the refusal which then follows is the RIGHT one:
    `NOTHING reads it`, never `carries no column of that name`.  Those two
    refusals are one keystroke apart in the output and a world apart in
    meaning: the first is a correct statement about this unit type, the second
    is the writer having emitted a file its own reader rejects.
    """
    tmp = Path(tempfile.mkdtemp(prefix="choupo_cryst_"))
    try:
        case = tmp / "cryst"
        shutil.copytree(ROOT / CRYST, case)
        shutil.rmtree(case / VIEW, ignore_errors=True)
        rc, out, err = run_case(case)
        if rc != 0:
            problems.append("check_internal_states(p): %s failed (rc=%d)." % (CRYST, rc))
            return
        written = list((case / VIEW / IROOT).rglob("*"))
        written = [w for w in written if w.is_file()]
        if len(written) != 1:
            problems.append("check_internal_states(p): %s wrote %d interior file(s), "
                            "expected exactly one." % (CRYST, len(written)))
            return
        src = written[0]
        blk = parse_file(src.read_text(errors="replace"))["blocks"]
        if "sizeDistribution" not in blk:
            problems.append("check_internal_states(p): %s wrote no sizeDistribution "
                            "block (%s)." % (CRYST, sorted(blk)))
            return
        if blk["sizeDistribution"]["xAxis"] not in blk["sizeDistribution"]["columns"]:
            problems.append("check_internal_states(p): %s wrote a sizeDistribution "
                            "declaring `xAxis %s;` with no such column."
                            % (CRYST, blk["sizeDistribution"]["xAxis"]))
            return

        dest = case / "0" / IROOT / src.relative_to(case / VIEW / IROOT)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dest)
        rc2, out2, err2 = run_case(case)
        blob = out2 + err2
        if rc2 == 0:
            problems.append("check_internal_states(p): %s declared its OWN interior "
                            "in 0/ and the run SUCCEEDED.  A crystalliser reads no "
                            "kind; a declared field nobody reads must refuse."
                            % CRYST)
        elif "carries no column of that name" in blob:
            problems.append("check_internal_states(p): %s refused its own written "
                            "interior for the MISSING AXIS -- the writer emitted a "
                            "file its own reader rejects:\n    %s"
                            % (CRYST, blob.strip()[-300:]))
        elif "NOTHING reads it" not in blob:
            problems.append("check_internal_states(p): %s refused its own interior, "
                            "but not as the kind nobody reads:\n    %s"
                            % (CRYST, blob.strip()[-300:]))
        else:
            notes.append("round trip on a crystalliser: the written file PARSES "
                         "(axis present) and refuses only as the kind nothing reads")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ---------------------------------------------------------------------------
#  (q) THE HEADER SENTENCE IS CONDITIONED ON THE UNIT.
# ---------------------------------------------------------------------------
COPY_SENTENCE = "COPY it into the case's `0/internalStates/`"
NOREAD_SENTENCE = "THIS UNIT READS NO DECLARED INTERIOR"


def interior_readers():
    """type key -> the kinds a unit of that type READS -- DERIVED from the
    engine's own source, never tabulated here.  A table would be a second home
    for `readsInteriorKinds()`, which is the defect this project spends its
    slices closing; so: find every class that OVERRIDES it and the literals it
    returns, then map each class to the type key `registerBuiltins()` gives it.
    A type absent from the result reads nothing, which is exactly what
    `UnitOperation::interiorKindsRead` returns for it."""
    by_class = {}
    for f in sorted((ROOT / "src/unitOperations").rglob("*.H")):
        body = f.read_text(errors="replace")
        m = re.search(r'readsInteriorKinds\(\)\s*const\s*override\s*\{?\s*'
                      r'return\s*\{([^}]*)\}', body, re.S)
        if not m:
            continue
        kinds = re.findall(r'"([^"]+)"', m.group(1))
        for cm in re.finditer(r'^class\s+(\w+)', body, re.M):
            by_class[cm.group(1)] = kinds
    reg = (ROOT / "src/unitOperations/UnitOperation.cpp").read_text(errors="replace")
    out = {}
    for key, cls in re.findall(r'reg\("([^"]+)"\s*,\s*\[\]\{\s*return\s+'
                               r'std::make_unique<(\w+)>', reg):
        out[key] = by_class.get(cls, [])
    return out


def check_header_sentence(problems, notes):
    """(q) The instruction a file carries must be TRUE OF THE UNIT it is about.

    Every interior file used to carry `COPY it into the case's
    0/internalStates/ ... to DECLARE it as the interior the next run starts
    from`.  That is correct for `distillationColumn` and FATAL for every other
    type: the copy is refused by name, exit 2, and both units that publish an
    interior in the flagship plant are in the second group.  Same defect shape
    as commit d4e173fb0 -- a pop-out telling every reader to edit a file the
    run rewrites.

    The writer holds the fact (`UnitOperation::interiorKindsRead`, handed in
    as data), so: a file for a unit that READS its kind carries the COPY
    instruction and names the kind; a file for a unit that reads NONE carries
    the "reads no declared interior" sentence and NOT the COPY instruction.
    """
    readers = interior_readers()
    if not any(readers.values()):
        problems.append("check_internal_states(q): no registered type was found to "
                        "read ANY interior kind -- the derivation is broken and the "
                        "arm would wave every COPY instruction through.")
        return
    seen_copy = seen_noread = 0
    for f in live_records():
        txt = f.read_text(errors="replace")
        has_copy = COPY_SENTENCE in txt
        has_noread = NOREAD_SENTENCE in txt
        if has_copy and has_noread:
            problems.append("check_internal_states(q): %s carries BOTH the COPY "
                            "instruction and the reads-nothing sentence."
                            % f.relative_to(ROOT))
            continue
        if not has_copy and not has_noread:
            problems.append("check_internal_states(q): %s carries NEITHER sentence "
                            "-- a reader is told nothing about what the file is for."
                            % f.relative_to(ROOT))
            continue
        m = re.search(r'^equipment\s+(\S+?);', strip_comments(txt), re.M)
        etype = m.group(1) if m else ""
        reads = readers.get(etype)
        if reads is None:
            problems.append("check_internal_states(q): %s names equipment '%s', which "
                            "`registerBuiltins()` does not register -- the gate "
                            "cannot say what that type reads."
                            % (f.relative_to(ROOT), etype))
            continue
        blocks = set(parse_file(txt)["blocks"])
        should_copy = bool(blocks & set(reads))
        if should_copy and not has_copy:
            problems.append("check_internal_states(q): %s is for a '%s', which READS "
                            "%s, and does not carry the COPY instruction."
                            % (f.relative_to(ROOT), etype, ", ".join(reads)))
        if not should_copy and has_copy:
            problems.append("check_internal_states(q): %s is for a '%s', which reads "
                            "NOTHING this file carries, and tells its reader to COPY "
                            "it into 0/ -- an instruction that ends the next run at "
                            "exit 2." % (f.relative_to(ROOT), etype))
        seen_copy += 1 if has_copy else 0
        seen_noread += 1 if has_noread else 0
    if seen_copy == 0 or seen_noread == 0:
        problems.append("check_internal_states(q): the corpus shows %d file(s) with "
                        "the COPY instruction and %d with the reads-nothing sentence "
                        "-- both branches must have a live case or the arm proves "
                        "only one of them." % (seen_copy, seen_noread))
    else:
        notes.append("header sentence: %d file(s) say COPY, %d say the unit reads "
                     "none" % (seen_copy, seen_noread))


# ---------------------------------------------------------------------------
#  (r) THE WRITER REFUSES A PROFILE WHOSE DECLARED AXIS IS ABSENT.
# ---------------------------------------------------------------------------
def check_writer_refusal(problems, notes):
    """(r) SOURCE, and it can only be a source arm: NOTHING a case declares can
    make a unit publish an axis it does not carry -- only a unit's own C++ can
    -- so no fixture reaches this refusal and there is nothing to run.  What is
    checked is that the guard is at the seam that partitions the profiles, that
    it does not throw (the call site has already ruled a writer failure said and
    never fatal, and a throw in that loop would take every OTHER unit's interior
    with it -- the 2026-09-04 partial-tree lesson), and that it reaches the
    caveat surface rather than only the console."""
    w = (ROOT / "src/io/InternalStateIO.cpp").read_text(errors="replace")
    if "if (!prof.columns.count(prof.xAxis))" not in w:
        problems.append("check_internal_states(r): src/io/InternalStateIO.cpp no "
                        "longer guards a profile whose declared axis is not one of "
                        "its columns.  Without it the writer emits `xAxis <name>;` "
                        "with no such column -- a file its own reader refuses.")
        return
    guard = w.split("if (!prof.columns.count(prof.xAxis))", 1)[1][:2500]
    if "AdvisoryLog::instance().add(" not in guard:
        problems.append("check_internal_states(r): the refusal does not reach "
                        "AdvisoryLog, so it is absent from the end-of-run caveat "
                        "block and from the result JSON -- a slightly louder form "
                        "of silence.")
    if "throw" in guard:
        problems.append("check_internal_states(r): the refusal THROWS.  The call "
                        "site turns a throw into one warning and no interiors AT "
                        "ALL for the case -- the partial tree that lies by "
                        "omission.  Refuse the profile, keep the others.")
    if "std::cerr" not in guard:
        problems.append("check_internal_states(r): the refusal is not written to "
                        "stderr, so it depends on how loudly the run was asked to "
                        "speak.  A refusal is not a report.")
    notes.append("the writer refuses an axis-less profile at the partition seam, "
                 "without throwing")


def check_ignored(problems):
    """(l) Both halves of the snapshot, each on the right side of the line."""
    case = ROOT / FLAT
    written = case / VIEW / IROOT / "X"
    written.parent.mkdir(parents=True, exist_ok=True)
    written.write_text("")
    authored = case / "0" / IROOT / "X"
    authored.parent.mkdir(parents=True, exist_ok=True)
    authored.write_text("")
    rec = ROOT / "docs" / "design" / "__gate_probe_internal.md"
    rec.write_text("")
    try:
        r1 = subprocess.run(["git", "check-ignore", "-q", str(written)],
                            cwd=ROOT, capture_output=True)
        if r1.returncode != 0:
            problems.append(
                "check_internal_states(l): a unit interior the RUN wrote into "
                "converged/%s/ is NOT gitignored.  The GUI bundle is a Vite glob "
                "over tutorials/*/*/**/* that inlines every match as a raw "
                "string: one machine's stale stage profile would ship." % IROOT)
        r2 = subprocess.run(["git", "check-ignore", "-q", str(authored)],
                            cwd=ROOT, capture_output=True)
        if r2.returncode == 0:
            problems.append(
                "check_internal_states(l): a unit interior DECLARED in 0/ is "
                "gitignored.  A case that declares the state it starts from must "
                "be able to commit it -- that is the whole point of the slice.")
        r3 = subprocess.run(["git", "check-ignore", "-q", str(rec)],
                            cwd=ROOT, capture_output=True)
        if r3.returncode == 0:
            problems.append(
                "check_internal_states(l): a NEW file under docs/design/ is "
                "ignored -- a rule swallowed this project's design records.")
    finally:
        written.unlink(missing_ok=True)
        authored.unlink(missing_ok=True)
        for d in (case / VIEW / IROOT, case / "0" / IROOT):
            try:
                d.rmdir()
            except OSError:
                pass
        rec.unlink(missing_ok=True)
    tl = (ROOT / "gui/src/cases/tutorials.ts").read_text(errors="replace")
    if 'tutorials/**/converged/**' not in tl:
        problems.append(
            "check_internal_states(l): gui/src/cases/tutorials.ts does not exclude "
            "converged/ from the case glob -- the second lock on the tree that now "
            "carries the unit interiors.")


def check_resolvers(problems, notes):
    """(m) The D11 audit's fixes, as source arms: a bare-name resolver that
    could hit either class must not come back.  A source arm because the
    alternative -- patching a source and rebuilding the engine -- is the
    2026-08-18 tree-poisoning shape."""
    ss = (ROOT / "src/streams/StreamStateIO.cpp").read_text(errors="replace")
    m = re.search(r'readStateDir\([^)]*\)\s*\{(.*?)\n\}', ss, re.S)
    body = m.group(1) if m else ""
    if '"%s"' % IROOT not in body:
        problems.append("check_internal_states(m): StreamStateIO::readStateDir no "
                        "longer skips the %s subtree by name.  It keys every "
                        "stream-looking file by its relative path, so a misfiled one "
                        "there becomes stream `%s.<x>` and the completeness "
                        "contract counts it." % (IROOT, IROOT))
    io = (ROOT / "src/io/InternalStateIO.cpp").read_text(errors="replace")
    hdr = (ROOT / "src/io/InternalStateIO.H").read_text(errors="replace")
    if 'ROOT = "%s"' % IROOT not in hdr:
        problems.append("check_internal_states(m): InternalStateIO.H no longer names "
                        "the root `%s` as its ONE constant." % IROOT)
    if "view / ROOT" not in io or "MISFILED declared interior" not in io:
        problems.append("check_internal_states(m): InternalStateIO::read no longer "
                        "walks the ROOT constant, or no longer refuses a record "
                        "found outside it (the retired shape would be skipped in "
                        "silence).")
    tree = (ROOT / "gui/src/ui/caseTree.ts").read_text(errors="replace")
    if "sectorPaths" in tree or "sectors?" in tree:
        problems.append("check_internal_states(m): gui/src/ui/caseTree.ts carries a "
                        "geography discriminator again.  A directory in a state "
                        "view is never a unit now; a rule that says it may be is "
                        "false, and false rules get read.")
    if 'INTERIOR_ROOT = "%s"' % IROOT not in tree:
        problems.append("check_internal_states(m): caseTree.ts no longer names "
                        "INTERIOR_ROOT = \"%s\"." % IROOT)
    intro = (ROOT / "gui/src/ui/CaseIntro.tsx").read_text(errors="replace")
    if "isRunOutput(" not in intro or re.search(r'kindOf\([^)]*\)\s*!==\s*"output"', intro):
        problems.append("check_internal_states(m): CaseIntro's keep-list reads the "
                        "KIND, not the VIEW -- a run output of kind \"interior\" "
                        "(converged/%s/<unit>) would be listed as a file the "
                        "student wrote." % IROOT)
    notes.append("resolvers carry the kind: readStateDir skips %s/, the reader walks "
                 "it alone, the GUI keeps no geography discriminator" % IROOT)


def copy_any(rel, dst):
    """A case, minus every run output, at `dst`."""
    shutil.copytree(ROOT / rel, dst,
                    ignore=shutil.ignore_patterns("converged", "reports",
                                                  "iterations", "design",
                                                  "log.*"))
    return dst


def run_init0(path, *args):
    proc = subprocess.run([str(ROOT / "choupoSolve"), "-init0", str(path)] + list(args),
                          capture_output=True, text=True)
    return proc.returncode, proc.stdout, proc.stderr


def stream_state(path):
    """`F` and the component molar flows out of a `0/<stream>` file -- read
    INDEPENDENTLY of the engine, so arm (s) can hold the materialised seed to
    the streams the case declares rather than to the engine's own arithmetic."""
    t = strip_comments(path.read_text(errors="replace"))
    m = re.search(r'componentMolarFlows\s*\{([^}]*)\}', t) \
        or re.search(r'componentFlows\s*\{([^}]*)\}', t)
    if not m:
        return None
    flows = {}
    for em in re.finditer(r'([A-Za-z_][\w]*)\s+([-\d.eE+]+)\s*([A-Za-z/]*)\s*;', m.group(1)):
        v = float(em.group(2))
        unit = em.group(3)
        if unit == "kmol/h":
            v /= 3600.0
        elif unit not in ("", "kmol/s"):
            return None                       # a unit this reader will not guess
        flows[em.group(1)] = v
    return flows


def check_init0_interiors(problems, notes):
    """(s)(t)  `choupo-init0` MATERIALISES the interior half -- for the units
    that read one, and for nobody else.

    (s) On a copy of the extractor case (which READS a stageProfile and ships
        no declaration): the tool writes exactly one interior file, at the
        address the reader looks at; what it writes is THE UNIT'S OWN SEED,
        verified against the case's own `0/feed` and `0/solvent` files rather
        than against the engine's arithmetic (a tool that quietly improves a
        seed hands back a crutch nobody chose -- the 2026-05-30 rule); and the
        same case then RUNS from it, announcing `[seed] interior read from 0/`
        and reproducing extract01's own golden.  That last step is the round
        trip the brief asks for on the EXTRACTOR and not only on the column:
        writer -> disk -> reader -> the same answer.

    (t) On a copy of the crystalliser case (whose units read NOTHING): no
        `0/internalStates/` is created at all, and the tool SAYS so.  A unit
        that reads none must gain no file, no count and no refusal.
    """
    tmp = Path(tempfile.mkdtemp(prefix="choupo_init0_"))
    try:
        # ---- (s) the extractor ------------------------------------------
        case = copy_any(EXTRACT, tmp / "extract")
        rc, out, err = run_init0(case)
        if rc != 0:
            problems.append("(s) choupo-init0 failed on %s (rc=%d).\n    %s"
                            % (EXTRACT, rc, err.strip()[:300]))
            return
        made = sorted(p for p in (case / "0" / IROOT).rglob("*") if p.is_file()) \
            if (case / "0" / IROOT).is_dir() else []
        if [p.name for p in made] != ["extractor01"]:
            problems.append("(s) choupo-init0 on %s materialised %s under 0/%s -- "
                            "the case has exactly ONE unit that reads an interior "
                            "and it must get exactly one file."
                            % (EXTRACT, [p.name for p in made] or "nothing", IROOT))
            return
        if "[init0] interiors:" not in out:
            problems.append("(s) choupo-init0 wrote an interior and did not COUNT it "
                            "in its own summary -- a reader cannot tell a case whose "
                            "units seed themselves from one this tool skipped.")

        seed = parse_file(made[0].read_text(errors="replace"))
        if seed["header"].get("recordType") != "internalState":
            problems.append("(s) the materialised seed does not declare `recordType "
                            "internalState;` -- the reader finds records by what they "
                            "say about themselves, so this one would be skipped.")
        blk = seed["blocks"].get("stageProfile")
        if not blk:
            problems.append("(s) the materialised seed carries no `stageProfile` "
                            "block (it has: %s)." % sorted(seed["blocks"]))
            return
        if blk["xAxis"] not in blk["columns"]:
            problems.append("(s) the materialised seed declares `xAxis %s;` and "
                            "carries no column of that name -- a file this module's "
                            "own reader refuses." % blk["xAxis"])

        #  THE SEED IS THE UNIT'S OWN, and this is the arm that says so.  The
        #  extractor's seed is every stage's extract = the fresh solvent and
        #  every stage's raffinate = the feed; both are read here out of the
        #  case's own 0/ stream files, so an "improved" seed (a converged
        #  profile, a scaled guess, anything cleverer) fails.
        feed = stream_state(case / "0" / "feed")
        solv = stream_state(case / "0" / "solvent")
        if feed is None or solv is None:
            problems.append("(s) could not read 0/feed or 0/solvent independently, "
                            "so the seed cannot be held to the case's own streams.")
        else:
            want = {"F_extract": sum(solv.values()), "F_raffinate": sum(feed.values())}
            for col, w in want.items():
                got = blk["columns"].get(col)
                if not got:
                    problems.append("(s) the materialised seed carries no `%s` "
                                    "column." % col)
                elif not all(close(v, w, 1.0e-9) for v in got):
                    problems.append("(s) the materialised seed's `%s` is %s; the "
                                    "unit's OWN seed puts %.12g on EVERY stage (the "
                                    "case's own 0/ streams).  choupo-init0 must write "
                                    "the seed the unit would have used, never a "
                                    "better one." % (col, got, w))
            for comp, v in solv.items():
                got = blk["columns"].get("xE_" + comp)
                w = v / sum(solv.values())
                if not got or not all(close(x, w, 1.0e-9) for x in got):
                    problems.append("(s) the materialised seed's `xE_%s` is %s; the "
                                    "fresh solvent this case declares is %.12g."
                                    % (comp, got, w))

        #  The round trip: the unit reads back what the tool wrote, and the
        #  answer is the case's own answer.
        rc, out2, err2 = run_case(case)
        if rc != 0:
            problems.append("(s) the case failed to run from the interior "
                            "choupo-init0 materialised (rc=%d).\n    %s"
                            % (rc, err2.strip()[:300]))
        else:
            if "[seed] interior read from 0/" not in out2:
                problems.append("(s) the case ran from a materialised interior and "
                                "did NOT announce `[seed] interior read from 0/` -- "
                                "a solver aid that binds without saying so is the "
                                "silence this slice exists to end.")
            j = result_json(out2) or {}
            for kind, name, key, want, reltol in golden_rows(ROOT / EXTRACT):
                got = (j.get("kpis", {}).get(name, {}) or {}).get(key) if kind == "kpi" \
                    else (j.get("streams", {}).get(name, {}) or {}).get(key)
                if got is None:
                    continue
                if abs(got - want) > reltol * max(abs(want), 1.0e-300):
                    problems.append("(s) seeded from the interior choupo-init0 wrote, "
                                    "%s %s.%s = %.12g; the case's own golden says "
                                    "%.12g (reltol %g).  The tool wrote the unit's "
                                    "OWN seed, so the answer must not move."
                                    % (kind, name, key, got, want, reltol))
            notes.append("init0 round trip: the extractor reads back the seed the "
                         "tool wrote and reproduces its own golden")

        # ---- (t) a case whose units read nothing -------------------------
        none = copy_any(CRYST, tmp / "none")
        rc, out3, err3 = run_init0(none)
        if rc != 0:
            problems.append("(t) choupo-init0 failed on %s (rc=%d).\n    %s"
                            % (CRYST, rc, err3.strip()[:300]))
        elif (none / "0" / IROOT).exists():
            problems.append("(t) choupo-init0 created 0/%s on %s, whose units read "
                            "NO interior.  A declared field nobody reads is a comment "
                            "sitting in the state directory -- and the next run "
                            "refuses it by name." % (IROOT, CRYST))
        elif "[init0] interiors: 0" not in out3:
            problems.append("(t) choupo-init0 wrote no interior on %s and did not say "
                            "so.  Silence must mean 'nothing to write', never 'the "
                            "step did not run'." % CRYST)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def check_interior_completeness(problems, notes):
    """(u)  A DECLARED INTERIOR TREE MUST BE COMPLETE for the units that read
    one -- a SEPARATE check from the stream completeness contract, which counts
    streams and skips `internalStates/` by name.

    A unit that reads an interior and finds NONE seeds itself and says so:
    that is the 2026-05-30 rule working, and it is not refused.  But a case
    that declares an interior for one reader and not for another restarts half
    the plant from the answer and re-invents the other half in silence, which
    is the defect the state view exists to end.

    The fixture is a plant with TWO units that read one and a third that reads
    none: declaring one refuses BY NAME, names the missing one, and never names
    the unit that reads none.  Declaring both leaves that refusal behind (the
    run then fails on the fixture's own deliberately wrong stage count, which
    is a DIFFERENT message -- the pair is what proves the arm can tell them
    apart).
    """
    tmp = Path(tempfile.mkdtemp(prefix="choupo_complete_"))
    #  A minimal interior a unit READS: it parses, it is a kind the column
    #  reads, and it deliberately does NOT describe the column -- the
    #  completeness check must fire BEFORE the column ever looks at it.
    def stub(unit):
        return ('recordType  internalState;\n\nunit        "%s";\n'
                'equipment   distillationColumn;\n\n'
                'stageProfile\n{\n    xAxis       stage;\n    nPoints     2;\n\n'
                '    columns\n    {\n        stage\n        (\n            1 2\n'
                '        );\n    }\n}\n' % unit)
    try:
        half = copy_any(TWO_READERS, tmp / "half")
        (half / "0" / IROOT).mkdir(parents=True, exist_ok=True)
        (half / "0" / IROOT / "C1").write_text(stub("C1"))
        rc, out, err = run_case(half)
        blob = out + err
        if rc == 0:
            problems.append("(u) %s declares an interior for C1 and none for C2, "
                            "which also reads one, and the run SUCCEEDED.  Half a "
                            "snapshot restores half a plant and re-invents the rest."
                            % TWO_READERS)
        elif "and not for every unit that READS one" not in blob:
            problems.append("(u) the incomplete interior tree refused, but not as an "
                            "incomplete SNAPSHOT:\n    %s" % blob.strip()[-400:])
        elif "C2" not in blob:
            problems.append("(u) the refusal does not NAME the unit whose interior is "
                            "missing:\n    %s" % blob.strip()[-400:])
        elif "absorber" in blob.split("Materialise the missing")[0]:
            problems.append("(u) the refusal names `absorber`, a unit that reads NO "
                            "interior.  A unit that reads none must gain no entry, no "
                            "count and no refusal:\n    %s" % blob.strip()[-400:])
        else:
            notes.append("interior completeness: an interior declared for one of two "
                         "readers refuses by name")

        both = copy_any(TWO_READERS, tmp / "both")
        (both / "0" / IROOT).mkdir(parents=True, exist_ok=True)
        (both / "0" / IROOT / "C1").write_text(stub("C1"))
        (both / "0" / IROOT / "C2").write_text(stub("C2"))
        rc, out2, err2 = run_case(both)
        blob2 = out2 + err2
        if "and not for every unit that READS one" in blob2:
            problems.append("(u) with BOTH readers declared the run still refuses the "
                            "tree as incomplete -- the check counts something other "
                            "than the units that read one:\n    %s"
                            % blob2.strip()[-400:])
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def check_extractor_round_trip(problems, notes):
    """(v)  THE ROUND TRIP ON THE EXTRACTOR, converged -> 0/ -> the answer.

    The shipped witness declares the file `converged/` wrote.  It must
    announce the read, reproduce its OWN golden, and reach the answer in no
    more sweeps than the same case with the declaration removed.  A cascade
    restarted from its own answer that has to search again is not a restart.
    """
    tmp = Path(tempfile.mkdtemp(prefix="choupo_extract_"))
    decl = Path("0") / IROOT / "extractor01"
    try:
        if not (ROOT / EXTRACT_SEEDED / decl).is_file():
            problems.append("(v) %s does not ship %s -- the extractor's round-trip "
                            "witness has no declaration." % (EXTRACT_SEEDED, decl))
            return
        rc, out, err = run_case(ROOT / EXTRACT_SEEDED)
        if rc != 0:
            problems.append("(v) %s failed (rc=%d).\n    %s"
                            % (EXTRACT_SEEDED, rc, err.strip()[:300]))
            return
        if "[seed] interior read from 0/" not in out:
            problems.append("(v) %s ships a declared interior and did not announce "
                            "reading it." % EXTRACT_SEEDED)
        j = result_json(out) or {}
        it_seeded = (j.get("kpis", {}).get("extractor01", {}) or {}).get("iterations")
        for kind, name, key, want, reltol in golden_rows(ROOT / EXTRACT_SEEDED):
            got = (j.get("kpis", {}).get(name, {}) or {}).get(key) if kind == "kpi" \
                else (j.get("streams", {}).get(name, {}) or {}).get(key)
            if got is None:
                problems.append("(v) the golden pins %s %s.%s and the run publishes "
                                "no such value." % (kind, name, key))
            elif abs(got - want) > reltol * max(abs(want), 1.0e-300):
                problems.append("(v) %s gives %s %s.%s = %.12g; its own golden says "
                                "%.12g (reltol %g)."
                                % (EXTRACT_SEEDED, kind, name, key, got, want, reltol))

        bare = copy_any(EXTRACT_SEEDED, tmp / "bare")
        shutil.rmtree(bare / "0" / IROOT)
        rc, out2, err2 = run_case(bare)
        if rc != 0:
            problems.append("(v) %s (declaration removed) failed (rc=%d).\n    %s"
                            % (EXTRACT_SEEDED, rc, err2.strip()[:300]))
            return
        if "[seed] interior seeded by the unit" not in out2:
            problems.append("(v) %s (declaration removed): the extractor did not "
                            "announce that it seeded its OWN cascade."
                            % EXTRACT_SEEDED)
        j2 = result_json(out2) or {}
        it_bare = (j2.get("kpis", {}).get("extractor01", {}) or {}).get("iterations")
        if it_seeded is None or it_bare is None:
            problems.append("(v) the extractor publishes no `iterations` KPI, so the "
                            "round trip cannot be measured.")
        elif it_seeded > it_bare:
            problems.append("(v) the cascade seeded from its own answer took %g "
                            "sweeps and the unseeded one took %g.  A declared "
                            "interior that costs sweeps is not a restart."
                            % (it_seeded, it_bare))
        else:
            notes.append("extractor round trip: %g sweeps seeded from 0/, %g unseeded"
                         % (it_seeded, it_bare))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def check_source(problems):
    """(n) The exclusion, the boundary sentence and the two-way contract, at
    their source."""
    cpp = (ROOT / "src/io/InternalStateIO.cpp").read_text(errors="replace")
    hdr = (ROOT / "src/io/InternalStateIO.H").read_text(errors="replace")
    if 'xAxis == "T_K"' not in cpp:
        problems.append("check_internal_states: InternalStateIO::kindOf no longer "
                        "excludes the T_K axis by name.")
    if "construction over a parameter sweep" not in hdr:
        problems.append("check_internal_states: the module's header no longer states "
                        "the boundary (a field over a coordinate of the equipment or "
                        "its inventory vs a construction over a parameter sweep).")
    col = (ROOT / "src/unitOperations/distillation/DistillationColumn.H").read_text(errors="replace")
    if "stageProfile" not in col or not re.search(r'readsInteriorKinds\s*\(', col):
        problems.append("check_internal_states: DistillationColumn no longer DECLARES "
                        "the interior kind it reads, so the flowsheet would refuse "
                        "every file the writer produces for it.")
    ext = (ROOT / "src/unitOperations/separation/Extractor.H").read_text(errors="replace")
    #  A NAME IS CHECKED AS A CALLABLE, NOT AS A SUBSTRING.  The first draft of
    #  these three tests asked `"seedInterior" not in ext`, and the sabotage
    #  that renamed the method to `seedInteriorXX` SURVIVED it: a rename that
    #  disconnects an override from its base is invisible to a substring, which
    #  is precisely the change these arms exist to catch.
    if "stageProfile" not in ext or not re.search(r'readsInteriorKinds\s*\(', ext):
        problems.append("check_internal_states: Extractor no longer DECLARES the "
                        "interior kind it reads, so its cascade is back to inventing "
                        "a seed the case cannot own.")
    if not re.search(r'seedInterior\s*\(', ext):
        problems.append("check_internal_states: Extractor no longer publishes its own "
                        "SEED, so choupo-init0 has nothing honest to materialise for "
                        "it -- and a seed invented by the tool is the crutch the "
                        "2026-05-30 rule forbids.")
    extc = (ROOT / "src/unitOperations/separation/Extractor.cpp").read_text(errors="replace")
    if extc.count("seedCascade") < 3:
        problems.append("check_internal_states: the extractor's seed no longer has ONE "
                        "home (`seedCascade`, called by the solve and by the published "
                        "seed) -- the file choupo-init0 writes and the state the run "
                        "starts from would then be two different guesses.")
    base = (ROOT / "src/unitOperations/UnitOperation.H").read_text(errors="replace")
    if not re.search(r'readsInteriorKinds\s*\(', base) \
            or not re.search(r'setDeclaredInterior\s*\(', base):
        problems.append("check_internal_states: the declared-interior surface is gone "
                        "from UnitOperation -- nothing can read a state view back.")
    if not re.search(r'seedInterior\s*\(', base):
        problems.append("check_internal_states: the SEED surface is gone from "
                        "UnitOperation -- choupo-init0 can no longer ask a unit what "
                        "it would start from, and `0/` loses its interior half.")


def main() -> int:
    problems, notes = [], []
    n1, k1 = check_case(FRACTAL, True, problems, notes)
    n2, k2 = check_case(FLAT, False, problems, notes)
    n3, k3 = check_case(SWING, False, problems, notes)
    if n1 == 0:
        problems.append("%s: no file was checked -- the arms cannot fire." % FRACTAL)
    if n2 == 0:
        problems.append("%s: no file was checked." % FLAT)
    if "stageProfile" not in k2:
        problems.append("%s: no stageProfile block was written." % FLAT)
    if "sizeDistribution" not in k1:
        problems.append("%s: no sizeDistribution block was written." % FRACTAL)
    if "swingTable" not in k3:
        problems.append("%s: the PSA profile is not filed as a swingTable block (%s)."
                        % (SWING, sorted(k3)))
    check_swept(problems, notes)
    #  (o3) FIRST, because it RUNS its cases: (o2) reads what is on disk, and
    #  the crystalliser's `converged/` is only this run's if this run wrote it.
    for rel in (FRACTAL, CRYST, SWEPT):
        check_axis_in_json(rel, problems)
    check_axis_present(problems, notes)
    check_round_trip(problems, notes)
    check_round_trip_crystalliser(problems, notes)
    check_extractor_round_trip(problems, notes)
    check_init0_interiors(problems, notes)
    check_interior_completeness(problems, notes)
    check_header_sentence(problems, notes)
    check_writer_refusal(problems, notes)
    check_no_retired_shape(problems, notes)
    check_retired(problems, notes)
    check_ignored(problems)
    check_resolvers(problems, notes)
    check_source(problems)

    if problems:
        print("check_internal_states: FAILED")
        for p in problems:
            print("  " + p)
        return 1

    print("check_internal_states: OK -- a state view carries the streams AND, under "
          "internalStates/, ONE file per unit: %d file(s) on the fractal witness, "
          "%d on the flat column and %d on the PSA bed, each at "
          "converged/internalStates/<SECTOR>/<unit> where the unit's STAMPED "
          "sector puts it (unitSectors from the JSON, never a split name; no "
          "level at all on a flat case), each block reproducing its unit's "
          "published profile value by value at 1e-9 (%s); no record answers to "
          "an unpublished profile; the T_K construction on the cooling tower "
          "produced no record and no internalStates/ and was announced; the swing "
          "table is filed as internal state.  THE AXIS A PROFILE DECLARES IS A "
          "COLUMN OF IT: every `xAxis` literal in src/unitOperations/ is assigned "
          "as a column in its own file, every interior record under tutorials/ "
          "carries the axis it declares (the records THIS run produced "
          "plus every one git tracks -- a converged/ tree this gate did not "
          "write is a stale artefact and is not read), and every profile the "
          "fractal plant, the "
          "crystalliser and the cooling tower publish carries its own axis in the "
          "JSON -- the DECLINED T_K one included, because a declined profile "
          "writes no file and still reaches profile.csv, the spreadsheet and the "
          "GUI plot.  THE ROUND TRIP HOLDS: the witness "
          "ships the file converged/ wrote, announces `[seed] interior read from "
          "0/`, reproduces its own golden, and the same case with the declaration "
          "removed announces the other route (%s); a stage count wrong by one, an "
          "orphan file, the RETIRED one-directory-per-unit shape, a second block "
          "nobody reads and a block that is not a kind each REFUSE by name (a unit "
          "WRITING two kinds has no live case: the result record holds one profile "
          "per unit).  IT HOLDS ON THE EXTRACTOR TOO -- its witness ships the "
          "file converged/ wrote, announces the read, reproduces its own golden "
          "and reaches the cascade in no more sweeps than the unseeded twin (%s).  "
          "AND IT HOLDS ON A UNIT THAT READS NOTHING: the "
          "crystalliser's own written interior PARSES, its axis is present, and "
          "copied into 0/ it refuses ONLY as the kind nothing reads -- never for "
          "a missing axis.  EVERY FILE'S HEADER SENTENCE IS TRUE OF ITS UNIT: a "
          "unit that reads its kind is told to COPY the file and which kind it "
          "reads; a unit that reads none is told the copy would be refused, and "
          "both branches have live cases (the type -> kinds map is derived from "
          "the readsInteriorKinds() overrides joined to registerBuiltins(), not "
          "tabulated).  THE WRITER REFUSES an axis-less profile at the partition "
          "seam, to stderr and to AdvisoryLog, without throwing.  THE HOMONYM: a "
          "stream and a unit both named column16 live "
          "at two paths, neither overwritten, and the run says so once.  No record "
          "sits outside internalStates/ in any state view under tutorials/; the "
          "retired top-level view is gone from the tree, the GUI roots and "
          ".gitignore, and no page under docs/ outside docs/design/ teaches the "
          "retired one-directory-per-unit shape; what the run writes is "
          "gitignored, what the case declares "
          "is not, docs/design/ stays committable, and the glob's second lock is "
          "on converged/.  THE RESOLVERS CARRY THE KIND: readStateDir skips "
          "internalStates/ by name, the interior reader walks it alone and "
          "refuses a record found elsewhere, the GUI keeps no geography "
          "discriminator and its keep-list reads the view.  `choupo-init0` "
          "MATERIALISES THE INTERIOR HALF: on the extractor case it writes ONE "
          "file, at the address the reader looks at, holding the unit's OWN seed "
          "(the fresh solvent and the raw feed on every stage, checked against the "
          "case's own 0/ stream files rather than the engine's arithmetic), which "
          "the same case then READS BACK, announces, and reproduces its golden "
          "from (%s); on a case whose units read nothing it creates no "
          "internalStates/ and says so.  A DECLARED INTERIOR TREE IS COMPLETE OR "
          "IT REFUSES: on a plant with two columns and an absorber, declaring one "
          "column's interior refuses by name, names the other column and never "
          "names the absorber, which reads none.  NOT CHECKED: whether "
          "a declared profile is RIGHT (it is a SEED, not an answer), the engine's "
          "parser on any kind but stageProfile, a unit writing two kinds (none "
          "exists), whether an axis column holds the RIGHT numbers or how well "
          "the header sentence READS, WHICH FUNCTION an axis assignment belongs "
          "to (arm (o1) counts per file and per axis, so it proves a file "
          "assigns the axis at least as often as it declares it, not that each "
          "declaration is paired with its own), the V/z/z_m/position axes and the two "
          "undeclared ones beyond "
          "the suite running them, iterations/ and the dynamic instants (neither "
          "carries interiors), the ownership rule's sector (it reads the same "
          "STAMP since 2026-09-06 and check_sector_hierarchy arm (g) holds "
          "it), the browser harvest, whether a unit that reads no interior SHOULD "
          "(the absorber and the stripper carry a seeded T loop and read none, by "
          "decision), and whether every reader publishes a seed (a type that reads "
          "one and offers none is announced by the tool, not required to)."
          % (n1, n2, n3, "; ".join(notes[:3]),
             next((n for n in notes if n.startswith("round trip")), "not measured"),
             next((n for n in notes if n.startswith("extractor round trip")),
                  "not measured"),
             next((n for n in notes if n.startswith("init0 round trip")),
                  "not measured")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
