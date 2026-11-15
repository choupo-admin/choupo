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
