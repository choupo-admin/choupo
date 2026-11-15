# Cloud validation, second batch (2026-11-15)

Four tasks from the laptop session, authorised by Vitor.  Each task is on its
own branch off `origin/main` (0cddb183cb), pushed; nothing was merged into
main and no golden was re-recorded unless a section says so with its rows.

## Task 1 -- `bin/runCase` prefers this tree's own build

Branch `cloud/fix-runcase-own-tree`.

**Defect.**  `bin/runCase` resolved the binary with `command -v $APP` first
and fell back to the repo-root symlink only when nothing was on PATH.  On a
machine with two checkouts, the other tree's `bin/` first on PATH made a gate
that drives `bin/runCase` judge a different engine.

**Fix.**  The repo-root symlink next to the script's parent (this tree's own
build) is taken first; PATH is the fallback, and when it is used the run says
so on one line.

**Reproduced, then fixed** (a foreign `choupoProps` that exits 3, placed
first on PATH):

| runCase | check_fit_then_simulate |
|---|---|
| origin/main | FAIL: `(e) runCase <case> props exited 3 or wrote no log.choupoProps` |
| this branch | OK (all six arms) |

**Validation.**  Every gate whose source names `runCase` (11 besides the one
above): check_bashrc_path, check_doc_references, check_duty_inversion,
check_guide_paths, check_inlet_resolution, check_lithium_routes,
check_reaction_curve, check_runcase_reports_failure, check_solid_service,
check_stream_transport_closure, check_vlle_fallback -- all exit 0.
`bin/runTests --fast`: PASS 86 / FAIL 0 / EXPECTED-FAIL 5.  Commit 4212742346.

## Task 2 -- check_gate_selftest asks for rsync before cloning its workers

Branch `cloud/fix-selftest-rsync-first`, commit ccbb0b339d.

**Defect.**  The worker pool syncs each worker's build and `data/local` with
rsync, but that sync failed only after the workers were cloned.  On a
machine without rsync, each worker left about 2 GB under
`~/.cache/choupo/gate-selftest/`, and the next run filled the disk.  This
session measured that in this container earlier on 2026-11-15.

**Fix.**  `shutil.which("rsync")` is checked right after the platform-build
precondition and before any worker is created.  If rsync is missing, the
gate refuses by name and gives the remedy.

**Shown here** (this container has no rsync): `FAILED` in 0 s, with the
message naming rsync and the install command.  The pool home holds only its
lock.

**Validation.**  `bin/integrate --plan` reaches no case, and neither `--gui`
nor `--fast` is triggered.  All 23 gates the plan lists exit 0 (apart from
the self-test itself, which refuses by design on this machine):
check_brain_fresh, check_cost_provenance, check_debt_registry,
check_design_sheet, check_doctrine, check_duplicate_keys,
check_evidence_records, check_gibbs_duhem, check_git_visibility,
check_glossary_bans, check_internal_states, check_models_catalogue,
check_origin_vocabulary, check_packing_record, check_problem_divergence,
check_ratebased_segment, check_registry_scan, check_retired_names,
check_scan_roots, check_source_headers, check_source_licence,
check_unifac_key, check_variant_same_values.  `gate_manifest.py --check`
exits 0.

**Observation, not fixed (outside the task).**  `debt_registry.py:978` pins
`check_gate_selftest.py:623 bdir.iterdir()`.  On origin/main, line 623 is
`raw = os.environ.get(var, "")`, so the citation was stale before this edit.
This edit adds lines only below it.

## Task 3 -- T_bubble on a cubic vapour (EX-04)

In validation; this section is replaced when it lands.

## Task 4 -- the liquid-stability probe refuses on a one-liquid package

Branch `cloud/fix-gammaphi-stability-probe`, off origin/main c8819a5257, commit 2e8ee42653.

**Defect, and why it is a package limitation and not a probe bug.**
`liquid_stable` (src/propertyOps/PropertyEvaluator.cpp) decides by a
liquid-liquid flash (`IsothermalFlash::solveCore`, `PhaseSet::LL`), and that
flash needs two liquid phases in the package.  A gammaPhi package carries one
liquid by design, so on one the flash throws "LL flash needs >= 2 liquid
phases".  The probe's `catch (...) { ...; return 1.0; }` turned that throw
into "one stable liquid".

Reproduced: envelope04's own probe point (equimolar water + benzene, 1 bar,
UNIFAC + PR) on a gammaPhi package printed `"liquid_stable": 1` with exit 0.
On envelope04's gammaGamma package the same model answers 0.

**Fix.**  The probe now counts the package's liquid phases
(`thermo.phasesOfType("liquid")`, the same rule the flash uses) before doing
anything else.  With fewer than two it refuses by name and names the remedy:
`formulation gammaGamma;` with the same activity model on both
`liquidPhases`, which is exactly the package the Explorer builds for this
probe.  The other exits of the catch are unchanged; see the open item below.

**Who could be affected, measured.**
- One corpus case asks for `liquid_stable`: envelope04, which is gammaGamma
  and unchanged (`--scope` PASS).
- The GUI never sends the probe a one-liquid package:
  - `methodFeeds.ts` sets `vleTwoLiquid` with `liquid_stable`;
  - `exploreSynth.ts` builds gammaGamma for `vleTwoLiquid`;
  - `phaseEnvelopeLens.ts` builds gammaGamma.

**New gate arm** `check_phase_envelope` (m) holds both halves.  The gammaPhi
package must refuse and name both the probe and gammaGamma; the gammaGamma
package must answer 0.

**Validation.**  `bin/integrate --plan` reaches 0 cases and no `--gui` or
`--fast`.  It does report a FULL SWEEP REACHED, because PropertyEvaluator.cpp
is a shared path of choupoProps.  That sweep was NOT launched: it is Vítor's
decision, and the edit enters only the `liquid_stable` branch, whose only
corpus caller is envelope04.  Run instead:
- `--scope` envelope04: PASS 2 / FAIL 0;
- `--fast`: PASS 86 / FAIL 0 / EXPECTED-FAIL 5;
- `code_map --check` and `gate_manifest --check`: exit 0;
- the 52 gates the plan lists: 51 exit 0.  check_gate_selftest exits 1,
  because this container has no rsync, which is task 2's refusal working,
  not this edit.

**Open, not done (outside the task).**  The probe's catch still turns any
other exception from the LL flash into "stable", and a solve that returns
`converged = false` is read as "no split".  Whether a non-converged LL search
should refuse too is a separate decision.
