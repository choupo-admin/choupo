# Review: the suite's economy (C394), `origin/c394/suite-economy` at e740faaa5

Date 2026-11-14.  Rows SE-01..SE-12 in docs/reviews/LEDGER.tsv.

Verdict: the engine half of the key and the store discipline hold, but the
curation-fit key misses the ancestor `constant/` directories the engine
reads, so a REUSED verdict over a real FAIL is reproducible today (SE-01, S1),
and the exec-bit check prints OK over 15 scripts it never looks at (SE-06).

## What was run

`make -j4 all` in the review worktree; named-case runs with
`CHOUPO_REUSE_NAMED=1` (the branch's own opt-in), each against a
`--no-reuse` control; `suite_reuse.py key`, `case-plan` and `tree-key` before
and after each change; `strace` of curation cases and of eleven static gates;
one full `check_gate_selftest.py` in a pool (`CHOUPO_GATE_JOBS=2`, pool and
lock directory in scratch); `bin/integrate --plan` on a scratch clone on a
branch adding one tutorial case.  No full `bin/runTests` (another sweep was
running).  Every probe file removed afterwards; `git status` clean apart from
the ledger.

## What holds (measured)

* The engine half of the key is strong: it hashes object contents and the
  flag stamps; inline headers and templates land in the object code, so they
  are caught.
* Only a complete PASS is ever stored: the gate stores only on exit 0 and
  exits 2 if any record was NOT RUN; a curation case is stored only when every
  run passed (SKIP, FAIL, KNOWN-BROKEN, EXPECTED-FAIL never stored).
* The store is per tree and keyed by content (the tree's own ignored
  `build/reuse/`), so a verdict cannot come from another branch or worktree;
  after `git checkout` of an older commit the inputs differ and the item runs
  again; a stale build is refused first by `check_build_fresh`.
* Keys are taken before the run; the golden mode is in the curation key;
  archive extracts are re-fetched and sha256-checked before each run (one
  tampered with was overwritten); `check_case_body` and its helpers read no
  global apart from ROOT, the output cache and the case keys.
* CI and releases run everything (`ci.yml` sets `CHOUPO_NO_REUSE=1`;
  RELEASING.md uses `--no-reuse`).
* The pool left the tree untouched: 32 arms in 2 workers, 1019 s; afterwards
  all 932 files under `build/linux64Gcc` sha256-identical, the tree clean,
  worker w0 clean.

## Findings

**SE-01 (S1): a reuse that hides a changed verdict.**  The engine's record
resolver walks up from the case and reads every ancestor `constant/`
(`data/curation/<kind>/constant/`, `data/curation/constant/`,
`data/constant/` and the repository root's `constant/`, seen with strace);
the curation key covers only the case's own files plus the loose files
directly in its ancestor directories (`suite_reuse.py:541-590`).
Reproduction: run Na-F with reuse on (PASS stored); copy curate04's
`propertyManifest` into `data/curation/electrolytes/constant/` or `./constant/`;
with reuse on: `REUSED Na-F (... its inputs are unchanged)`; with
`--no-reuse`: `FAIL Na-F`, exit 1, the engine refusing it as a SEALED case.  A
`water.dat` placed there is applied too (announced as `[overlay]`) and is not
keyed either; tracked or not makes no difference.  The regressed-pairs key
avoids `./constant/` only by accident: `referenced_paths` treats a literal as a
repository path only when its first directory exists, so when `constant/`
exists the gate shows as NOT KEYED.

**SE-02 (S2): the hash cache trusts size and mtime**
(`suite_reuse.py:183-190`).  Change a digit in Na-F's `expected` (same size)
and `touch -r` it back: reuse on gives REUSED; `--no-reuse` gives FAIL (KPI
mismatch).  Any copy that keeps the mtime triggers it (`cp -p`, `rsync -a`,
`tar`, `touch -r`).

**SE-03 (S3):** the gate key's platform half is `uname -m` plus the Python
minor version; it does not cover libm, libstdc++, libc, the CPU or
`LD_PRELOAD` (`golden_bands.py` already fingerprints CPU, libc and compiler).
Not demonstrated (no second platform).

**SE-04 (S3):** the gate runs `ROOT / fittedInCase` with no restriction to its
keyed trees (`check_regressed_pairs.py:1127`, `1824`, `2051-2060`); the bare
literals "data" and "tutorials" pass the honesty arm as parents of keyed
trees.  Latent today: all 2371 values point into `data/curation` or
`tutorials/props`.

**SE-05 (S3):** `data/local` is walked with `rglob`, which on Python 3.12 does
not follow symlinked directories; the engine follows them.

**SE-06 (S2): the exec-bit check misses 15 directly run scripts.**  It prints
"OK -- 356 ..." while the quoted-pair loop at `runTests:2927-2939` (11
scripts, among them `code_map`, `case_manifest`, `generated_artefacts`,
`check_models_catalogue`) and the derived name `$_c150g.py` at `:3621-3626` (4
gates) are invisible to it.  On a scratch clone with `code_map.py` and
`check_models_catalogue.py` at 100644 in git and on disk, the check still
exits 0.

**SE-07 (S3):** the exec-bit check covers only `bin/curate/*.py` that runTests
names; not `bin/buildCode`, `bin/regen-llm-docs`, `bin/checkHeaderSelfContained`
(run directly by runTests) nor `bin/choupo-thermoml`, `bin/choupo-layout` (run
directly by gates); a tracked file is judged by its index mode, not its mode on
disk.

**SE-08 (S3):** `--plan` cannot see `check_brain_fresh` (it runs
`gen_brain_facts.py` as a subprocess; the scan-root reader follows imports
only).  On a scratch branch adding one case the plan listed 40 gates and not
this one; after `release_inventory.py` regenerates the inventory (integrate's
own pre-phase step) the gate FAILS (598 -> 599 cases).

**SE-09 (S3):** `--plan` cannot see `check_regressed_pairs` for an edit to a
`tutorials/props/curation` case a record names as `fittedInCase` (e.g.
`curate04/constant/experiments/*.dat`); the plan only ever considers
`check_*.py`, so non-check gates (`release_inventory --check`, `gen_*.py
--check`) are never planned (integrate's regeneration step plus
`generated_artefacts --check` cover most of them).

**SE-10 (S3):** the fast stamp's tree key is HEAD + diff + untracked files;
adding a component to `data/local` and a file under `build/` left it
byte-identical.  By design; it only weakens the ordering rule, the sweep
re-running everything anyway.

**SE-11 (S3), by code reading (the `kill -9` of the parent was refused by the
permission classifier and not worked around):** the lock fd belongs to the
parent alone (`Popen` closes fds in children), so a killed run frees the lock
while its `make` and gate children keep writing into the worker, and the next
run can sync that worker while an orphaned `make` still links a sabotaged
object; the end-of-run hash check covers the tree, not the workers.  The
worker's `data/local` is synced without `--delete` (`:736`); `clean -fdq`
(`:703`) never removes ignored outputs a killed arm left; the lock sits under
`XDG_RUNTIME_DIR` or `/tmp` (`:573`), so two sessions with different values
both run (seen incidentally).

**SE-12 (S4):** the `suite_reuse.py` docstring says `sanitize.yml` sets
`CHOUPO_NO_REUSE`; it does not (harmless: that tier runs `--fast`, which never
reuses); the REUSED line's "its inputs are unchanged" claims more than the key
covers (SE-01).

## What could not be reached

`kill -9` of the pool; a second platform or a system-library update; a full
run of the regressed-pairs gate (554 s; not needed: its key is shown unchanged
where its inputs change); `bin/integrate` beyond `--plan`.

(Written into the tree by the coordinator from the reviewer's hand-back: the
harness refuses report files written by a subagent.)

## Round 2 (2026-11-14): `origin/c394/suite-economy` at c62bee2de and 677f2efb7

Verdict: all twelve rows fixed (SE-01..10 and SE-12 reproduced on the merged
tree; SE-11 verified by reading only, `kill -9` being refused by the
permission system).  SE-01 no longer reproduces: every probe that was REUSED
over a FAIL now re-runs and fails.  New: SE-13 (S3), SE-14 (S4), SE-15 (S4),
none of which hides a verdict today.

SE-01: a PASS stored for Na-F, then curate04's `propertyManifest` added in
`data/curation/electrolytes/constant/` (re-run, FAIL) and in `./constant/`
(re-run, FAIL); a `water.dat` overlay instead re-runs and PASSES (that field
does not move Na-F); REUSED in none.  The key covers the case directory plus
7 parents, up to the primary checkout's root `constant`, each missing
directory recorded as `ABSENT`; `resolver_depth()` returns 8 and cites the 8
places it read it (`RecordResolver.H:99`, `:125`, `:409`, `SealCheck.cpp:81`,
`ThermoPackageBuilder.cpp:62`, `BatchAdsorber.cpp:72`, `FixedBedAdsorber.cpp:78`,
`Flowsheet.cpp:826`); all five binaries change into the case directory before
resolving, so the walk is the same from any working directory; a symlinked
`constant/` is followed (empty: re-run PASS; a manifest through the target:
re-run FAIL); every `constant/` level is hashed in full for every case; the
two other upward walks (`resolveUp`, `MemberFolder.H:143`) run only when a case
lacks its own file, and every keyed case has `system/controlDict`.  The gate
key also covers the cascade of its two scratch homes.

SE-02 fixed (the `touch -r` probe re-runs and FAILS; ctime, inode, device
keyed).  SE-03 fixed (golden_bands' fingerprint; residual SE-15).  SE-04 fixed
(an untracked record naming `fittedInCase "docs/design/zzprobe"` makes the gate
NOT KEYED).  SE-05 fixed (symlinked directories followed; a loop ends at the
OS limit).  SE-06/07 fixed (`code_map.py`, `check_models_catalogue.py`,
`bin/buildCode` at 100644 in git: refused; `chmod -x` on disk only: refused;
the 37 scripts set executable all parse as Python; the five scripts outside
bin/curate covered).  SE-08 fixed (`check_brain_fresh` and `release_inventory.py
--check` planned on a branch adding a case).  SE-09 fixed (an edit to curate04's
experiments file plans `check_regressed_pairs`).  SE-10 fixed (`data/local`
moves the tree key; `build/` does not, by design).  SE-11 fixed by reading
(children lead their own process groups; live groups recorded beside a fixed
per-user lock in `~/.cache/choupo/gate-selftest/`; the next self-test ends a
dead run's groups inside the pool before syncing; workers reset with
`clean -fdxq`; `data/local` and the build copied with `--delete`).  SE-12 fixed.

**SE-13 (S3):** `check_scan_roots` pins the 69 gates with a walk the plan
cannot see by NAME only, so a new unresolved walk added to one of them passes
(a `Path(base).rglob` appended to the pinned `check_asset_homes.py`:
`gate_scan_roots.py` lists it, `check_scan_roots` prints OK); a brand-new gate
with such a walk does FAIL.

**SE-14 (S4):** an untracked symlink to a directory in the keyed trees makes
`suite_reuse.py` crash with IsADirectoryError; the sweep then says "curation
fits: NOT keyed this run" and the gate runs.  Fails safe (no false REUSED),
but one stray link silently disables reuse for the whole sweep.

**SE-15 (S4):** (a) the depth parser recognises only `for (int up = 0; up < N`
loops and `constexpr int` names; (b) the exec-bit check judges only files
starting with a shebang (none of the four bin/curate modules without one is
run directly today); (c) the fast stamp excludes `build/` and any `constant/`
above the repository root; (d) `libc_ver()` does not change on a glibc patch
release, and `LD_PRELOAD` / `LD_LIBRARY_PATH` are not keyed.

Not done: `kill -9` of the self-test parent; a second platform.
