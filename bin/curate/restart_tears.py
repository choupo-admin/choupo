# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""The gates' use of `choupoSolve --restart-tears` (DEV.md: the layout gates).

    Not a gate and not run on its own: imported by check_plant_layout.py and
    check_design_sheet.py.

WHY.  Both gates solve the same recycle plants dozens of times, in arms that
change only `system/layoutDict` or `system/postDict` -- files that act AFTER the
recycle solve.  Their run caches replay an identical input; an arm whose only
edit is the layout is a different input and paid the whole recycle solve again
(PEQ 15 s, acetic plant 54 s).  `choupoSolve --restart-tears` keeps, after a
converged solve, the exact tear values its last pass entered with and, on a run
whose build, inputs (all but layoutDict/postDict) and package are unchanged,
skips the iteration and runs that last pass.

WHAT THIS MODULE DECIDES.  Whether a restart is used for an arm, and it never
takes the engine's word for exactness:

  * the SOLVE KEY of an arm is its input hash EXCLUDING `system/layoutDict` and
    `system/postDict` (and the output folders); two arms with one solve key
    differ only in what acts after the solve;
  * the first arm of a solve key runs in full (with the flag, so the engine
    leaves its record) and its stdout/stderr are what the gate sees, as before;
  * when that full solve took long enough to be worth it, the same directory is
    run AGAIN from the record and every file under converged/ reports/ design/
    postProcessing/ is compared BYTE FOR BYTE with the full run's.  Identical =>
    the solve key is PROVEN exact and later arms of it restart.  Different (a
    unit seeds an inner iteration from an outlet a previous sweep left -- the
    waterCooler of ammonia02_full_plant, the PFR bed of ammoniaReactor04) =>
    the solve key never restarts;
  * an arm that edits flowsheetDict, solverDict, a 0/ stream, the thermo
    dictionary or any file the solve reads has ANOTHER solve key (and the
    engine refuses a record whose input hash differs, by name): it solves in
    full.

The engine's `[restart]` announcement lines are removed from what the gate sees
(they belong to the flag, not to the case); the `Recycle restart:` line of a
restarted run stays.  Run arguments (`--layout-draft`, ...) are never restarted.
"""
import filecmp
import hashlib
import os
import shutil
import tempfile
from pathlib import Path

RECORD = "converged.restart"
COMPARE_DIRS = ("converged", "reports", "design", "postProcessing")
OUTPUT_DIRS = ("reports", "converged", "design", "iterations", "postProcessing")
NOT_SOLVE_INPUTS = ("system/layoutDict", "system/postDict", RECORD)
MIN_SECONDS = 3.0   # a full solve shorter than this is not worth a proof run


def _same_tree(a: Path, b: Path) -> bool:
    """Byte-for-byte equality of two directories (same files, same bytes)."""
    if not a.exists() and not b.exists():
        return True
    if a.exists() != b.exists():
        return False
    cmp = filecmp.dircmp(a, b)
    if cmp.left_only or cmp.right_only or cmp.funny_files:
        return False
    for f in cmp.common_files:
        if not filecmp.cmp(a / f, b / f, shallow=False):
            return False
    return all(_same_tree(a / s, b / s) for s in cmp.common_dirs)


def strip_announcements(text: str) -> str:
    """Drop the engine's `[restart]` lines (they belong to the flag)."""
    if "[restart]" not in text:
        return text
    return "".join(l for l in text.splitlines(keepends=True)
                   if not l.startswith("[restart] "))


class Restarter:
    def __init__(self, ancestor_inputs):
        self._ancestors = ancestor_inputs     # the gate's own _ancestor_inputs(h, d)
        self._known = {}                       # solve key -> record text | None
        self._touched = set()
        self.proofs = 0
        self.restarts = 0
        self.refused = 0

    def solve_key(self, d: Path) -> str:
        h = hashlib.sha256()
        self._ancestors(h, d)
        for p in sorted(d.rglob("*")):
            rel = p.relative_to(d)
            if rel.parts[0] in OUTPUT_DIRS or not p.is_file():
                continue
            if rel.as_posix() in NOT_SOLVE_INPUTS:
                continue
            h.update(str(rel).encode() + b"\0" + p.read_bytes() + b"\0")
        return h.hexdigest()

    # ---- before the run -----------------------------------------------------
    def begin(self, d: Path, extra) -> tuple:
        """-> (flags, ctx).  ctx is None when the run is a plain one."""
        if extra:
            return [], None
        key = self.solve_key(d)
        rec = self._known.get(key, "unseen")
        if rec == "unseen":
            (d / RECORD).unlink(missing_ok=True)
            return ["--restart-tears"], ("learn", key)
        if rec is None:
            return [], None
        (d / RECORD).write_text(rec)
        self._touched.add(d)
        self.restarts += 1
        return ["--restart-tears"], ("restart", key)

    # ---- after the run ------------------------------------------------------
    def end(self, d: Path, ctx, rc: int, seconds: float, rerun) -> None:
        """`rerun()` runs the engine again in `d` with the flag, returns its rc."""
        if ctx is None:
            return
        mode, key = ctx
        rec_path = d / RECORD
        if mode == "restart":
            rec_path.unlink(missing_ok=True)
            return
        # learn
        if rc != 0 or not rec_path.is_file() or seconds < MIN_SECONDS:
            rec_path.unlink(missing_ok=True)
            self._known[key] = None
            return
        text = rec_path.read_text()
        snap = Path(tempfile.mkdtemp(prefix="restart_proof."))
        try:
            for name in COMPARE_DIRS:
                if (d / name).exists():
                    shutil.copytree(d / name, snap / name)
            rc2 = rerun()
            exact = (rc2 == 0) and all(_same_tree(snap / n, d / n)
                                       for n in COMPARE_DIRS)
            self.proofs += 1
            if exact:
                self._known[key] = text
            else:
                self._known[key] = None
                self.refused += 1
                for name in COMPARE_DIRS:
                    shutil.rmtree(d / name, ignore_errors=True)
                    if (snap / name).exists():
                        shutil.copytree(snap / name, d / name)
        finally:
            shutil.rmtree(snap, ignore_errors=True)
            rec_path.unlink(missing_ok=True)

    def cleanup(self) -> None:
        for d in self._touched:
            (d / RECORD).unlink(missing_ok=True)
