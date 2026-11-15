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
