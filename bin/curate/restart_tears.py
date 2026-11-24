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
  * EVERY solve key is proven (no duration threshold: whether a gate sees a
    restart or a full run must not depend on how fast the machine was).  The
    four output folders are snapshotted and then DELETED, the same directory is
    run AGAIN from the record, and the rerun must (1) print the engine's
    `Recycle restart:` line -- a refused record makes the rerun a second full
    solve, which would compare equal and prove nothing -- and (2) reproduce
    every file under converged/ reports/ design/ postProcessing/ BYTE FOR BYTE
    (a folder the full run did not write must stay absent; a file only a full
    solve writes cannot survive from the first run).  Identical =>
    the solve key is PROVEN exact and later arms of it restart.  Different (a
    unit seeds an inner iteration from an outlet a previous sweep left -- the
    waterCooler of ammonia02_full_plant, the PFR bed of ammoniaReactor04) =>
    the solve key never restarts;
  * an arm that edits flowsheetDict, solverDict, a 0/ stream, the thermo
    dictionary or any file the solve reads has ANOTHER solve key (and the
    engine refuses a record whose input hash differs, by name): it solves in
    full.

THREADS.  The gates run arms side by side (CHOUPO_GATE_JOBS).  Two arms of one
solve key must not both learn: the second waits until the first has run and
proven (or refused) the record, then restarts from it.  A refusal is final: no
later proof can turn a solve key that was once inexact into a restarting one.

The engine's `[restart]` announcement lines are removed from what the gate sees
(they belong to the flag, not to the case); the `Recycle restart:` line of a
restarted run stays.  Run arguments (`--layout-draft`, ...) are never restarted.
"""
import filecmp
import hashlib
import os
import shutil
import tempfile
import threading
import time
from pathlib import Path

RECORD = "converged.restart"
COMPARE_DIRS = ("converged", "reports", "design", "postProcessing")
OUTPUT_DIRS = ("reports", "converged", "design", "iterations", "postProcessing")
NOT_SOLVE_INPUTS = ("system/layoutDict", "system/postDict", RECORD)
RESTART_LINE = "Recycle restart:"   # what the engine prints when it APPLIED the record


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
        self._learning = {}                    # solve key -> Event (in flight)
        self._lock = threading.Lock()
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

    # ---- one engine run, with or without the record -------------------------
    def run(self, d: Path, extra, engine):
        """`engine(flags)` runs choupoSolve in `d` with `flags` prepended and
        returns (stdout, stderr, rc).  Returns the same triple, the `[restart]`
        lines removed.  CHOUPO_GATE_NO_RESTART=1 runs it plain."""
        if os.environ.get("CHOUPO_GATE_NO_RESTART"):
            return engine([])
        flags, ctx = self.begin(d, extra)
        t0 = time.time()
        try:
            out, err, rc = engine(flags)
            self.end(d, ctx, rc, time.time() - t0,
                     lambda: (lambda o: (o[2], o[0]))(engine(["--restart-tears"])))
        except BaseException:
            self._release(ctx, None)
            raise
        return strip_announcements(out), strip_announcements(err), rc

    # ---- before the run -----------------------------------------------------
    def begin(self, d: Path, extra) -> tuple:
        """-> (flags, ctx).  ctx is None when the run is a plain one."""
        if extra:
            return [], None
        key = self.solve_key(d)
        while True:
            with self._lock:
                rec = self._known.get(key, "unseen")
                if rec != "unseen":
                    break
                ev = self._learning.get(key)
                if ev is None:
                    self._learning[key] = threading.Event()
                    (d / RECORD).unlink(missing_ok=True)
                    return ["--restart-tears"], ("learn", key)
            ev.wait()           # another arm is learning this solve key
        if rec is None:
            return [], None
        (d / RECORD).write_text(rec)
        with self._lock:
            self._touched.add(d)
            self.restarts += 1
        return ["--restart-tears"], ("restart", key)

    def _release(self, ctx, text) -> None:
        """Settle a learning solve key (text None = never restart) and wake
        the arms waiting on it.  Idempotent."""
        if ctx is None or ctx[0] != "learn":
            return
        key = ctx[1]
        with self._lock:
            if key not in self._known:
                self._known[key] = text
            ev = self._learning.pop(key, None)
        if ev is not None:
            ev.set()

    # ---- after the run ------------------------------------------------------
    def end(self, d: Path, ctx, rc: int, seconds: float, rerun) -> None:
        #  Called OUTSIDE any caller's slot semaphore: the rerun takes its own.
        """`rerun()` runs the engine again in `d` with the flag, returns (rc, stdout)."""
        if ctx is None:
            return
        mode, key = ctx
        rec_path = d / RECORD
        if mode == "restart":
            rec_path.unlink(missing_ok=True)
            return
        # learn
        if rc != 0 or not rec_path.is_file():
            rec_path.unlink(missing_ok=True)
            self._release(ctx, None)
            return
        text = rec_path.read_text()
        snap = Path(tempfile.mkdtemp(prefix="restart_proof."))
        verdict = None
        try:
            for name in COMPARE_DIRS:
                if (d / name).exists():
                    shutil.copytree(d / name, snap / name)
            #  Nothing of the full run may survive into the comparison: the engine
            #  does not wipe reports/, design/ or postProcessing/.
            for name in COMPARE_DIRS:
                shutil.rmtree(d / name, ignore_errors=True)
            rc2, out2 = rerun()
            exact = (rc2 == 0) and (RESTART_LINE in out2) \
                and all(_same_tree(snap / n, d / n) for n in COMPARE_DIRS)
            with self._lock:
                self.proofs += 1
                if not exact:
                    self.refused += 1
            if exact:
                verdict = text
        finally:
            if verdict is None:     # refused (or the rerun raised): the full run's outputs stand
                for name in COMPARE_DIRS:
                    shutil.rmtree(d / name, ignore_errors=True)
                    if (snap / name).exists():
                        shutil.copytree(snap / name, d / name)
            shutil.rmtree(snap, ignore_errors=True)
            rec_path.unlink(missing_ok=True)
            self._release(ctx, verdict)

    def cleanup(self) -> None:
        for d in self._touched:
            (d / RECORD).unlink(missing_ok=True)
