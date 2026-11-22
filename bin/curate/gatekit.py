#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""gatekit -- the one home of the plumbing every gate re-implemented (DEV.md 4c C420).

A gate that probes the engine does the same five things: find the repository,
find a binary, copy a shipped case somewhere private, change one file of the
copy, run the binary and read what it said, then print its claim and return an
exit code.  Before this module each of 287 gates carried its own copy of that
plumbing, so one change of layout (a case that references the catalogue instead
of holding copies, a binary that moved) broke every copy at once.  This is the
SINGLE PLACE a layout change is repaired.

  repo                   the repository root, resolved from THIS file, so a
                         worktree uses its own binaries and its own data -- never
                         PATH, never another checkout.
  binary(name)           the engine binary `name` of this tree; raises
                         GateRefusal naming the remedy when it is missing: a
                         check that cannot run must not pass.
  probe_copy(base, strip=())
                         context manager: a private temporary copy of the shipped
                         case `base` (a path relative to the repo or absolute).
                         The copy is materialised through case_records, so a case
                         that references the catalogue by pins still holds every
                         record it resolves; `strip` names files of the copy to
                         delete (e.g. its propertyManifest, its expected/).
  run(binary, case, timeout=600, env=None, inside=False)
                         -> (exit code, stdout+stderr).  CHOUPO_HOME is this repo;
                         `env` (a full environment) replaces that for a probe whose
                         scenario depends on the environment being PINNED, and
                         `inside=True` runs `binary .` with the case as the working
                         directory instead of `binary <case>` (batch 2:
                         check_volatility_declaration runs with CHOUPO_HOME absent,
                         and the engine then finds its catalogue from the working
                         directory: a probe must not stand inside the repository).
  edit(path, old, new, count=1, regex=False)
                         change one file; raises EditNotApplied when `old` is
                         absent: a probe whose edit did not apply must not pass.
  verdict(label, failures, ok_text, ...)
                         print the gate's claim (or its FAILED block) and return
                         the exit code.

Python standard library only.
"""
import contextlib
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import case_records  # noqa: E402

repo = Path(__file__).resolve().parents[2]


class GateRefusal(Exception):
    """The gate cannot run (a binary or a base case is missing)."""


class EditNotApplied(Exception):
    """A probe's edit found nothing to change."""


def binary(name):
    """This tree's engine binary `name`: the root symlink, else build/<platform>/<name>."""
    cands = [repo / name] + sorted((repo / "build").glob("*/" + name))
    for c in cands:
        if c.exists():
            return c
    raise GateRefusal(f"no {name} binary in {repo} -- build first (make all).  "
                      "A check that cannot run must not pass.")


def base_case(base):
    p = Path(base)
    p = p if p.is_absolute() else repo / p
    if not p.is_dir():
        raise GateRefusal(f"probe base case {base} is gone -- re-point the gate.")
    return p


@contextlib.contextmanager
def probe_copy(base, strip=(), keep_library=False):
    """A private, materialised temporary copy of the shipped case `base`.  A case that asks the
    reaction library (`reactionSet`) is written INLINE in the copy (the form every probe that edits
    a reaction's text was written against); `keep_library=True` keeps the library form."""
    src = base_case(base)
    with tempfile.TemporaryDirectory(prefix="gatekit_") as td:
        dst = Path(td) / src.name
        case_records.copytree(src, dst, inline_kinetics=not keep_library)
        for rel in strip:
            p = dst / rel
            if p.is_dir():
                shutil.rmtree(p)
            elif p.exists():
                p.unlink()
        yield dst


def run(bin_path, case, timeout=600, env=None, inside=False):
    """Run `bin_path` on `case`: (exit code, stdout + stderr).  `env`, when given,
    is the WHOLE environment (default: this process's, with CHOUPO_HOME = this repo).
    `inside`: the case is the working directory and the argument is `.`."""
    if env is None:
        env = dict(os.environ, CHOUPO_HOME=str(repo))
    r = subprocess.run([str(bin_path), "." if inside else str(case)],
                       cwd=str(case) if inside else None, capture_output=True,
                       text=True, timeout=timeout, env=env)
    return r.returncode, r.stdout + r.stderr


def edit(path, old, new, count=1, regex=False):
    """Replace `old` by `new` in file `path` (`count` times, 0 = all).  Raises
    EditNotApplied when `old` is absent.  With regex=True `old` is a pattern
    (multi-line mode) and `new` is literal text."""
    p = Path(path)
    text = p.read_text()
    if regex:
        out, n = re.subn(old, lambda m: new, text, count=count, flags=re.M)
    else:
        n = text.count(old)
        out = text.replace(old, new, count) if count else text.replace(old, new)
    if n == 0:
        raise EditNotApplied(f"{p.name}: the text to change is absent ({old!r}) "
                             "-- the probe is stale, not the engine")
    p.write_text(out)


def verdict(label, failures, ok_text, ok_head=None, fail_head=None, fail_bullet="  - "):
    """Print the claim line or the FAILED block; return the exit code."""
    if failures:
        print(fail_head if fail_head is not None else f"{label}: FAILED")
        for f in failures:
            print(fail_bullet + f)
        return 1
    print((ok_head if ok_head is not None else f"{label}: OK -- ") + ok_text)
    return 0
