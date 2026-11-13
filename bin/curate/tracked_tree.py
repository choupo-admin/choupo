#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""ONE HOME for "the files this gate is allowed to judge": the TRACKED tree.

    from tracked_tree import tracked_files
    for rel in tracked_files(ROOT, "data/standards", "tutorials",
                             suffixes=(".dat",), gate="check_foo"):
        ...

WHY (DEV.md 4c C170 item 4, 2026-10-26; gate `check_gates_judge_tracked`).
Vitor's laptop swept 752 PASS / 15 FAIL on main, and part of the fifteen was
not the corpus at all but his environment: `data/local/` (private data, the
gitignored working tier) and untracked files.  A gate that walks a directory
(`os.walk`, `rglob`) judges whatever is on THAT disk, so the same commit gives
a different verdict on a machine that holds private or untracked files --
`check_duplicate_keys` failed on a private `data/local/components/NH3.dat`
that no clone of the repository contains, and `check_glossary_bans` and
`check_gibbs_duhem` changed their claims (files scanned, pairs checked) with
the presence of that directory.  The repository's contract is what `git
ls-files` lists; private data is not the corpus.

THE RULES THIS HELPER ENFORCES.

  * It lists TRACKED files only (`git ls-files -z`), so an untracked or
    ignored file -- `data/local/`, a run output, a scratch probe, a half-
    written draft -- cannot change a verdict.
  * A CHECK THAT CANNOT RUN MUST NOT PASS.  If `git ls-files` fails, or lists
    fewer than FLOOR files (a shallow export, a tarball with no `.git`, a
    cwd that is not the repository), the helper EXITS 1 naming the gate and
    the reason; it never returns an empty list, because a scan over nothing
    is a green gate over an unseen tree (the `check_true_ions` shape).
  * A gate whose SUBJECT is the private tier (it exists to say something
    about `data/local`) must not use this helper to look there; it states in
    its own claim line that the tier was NOT judged here, or reports that it
    was not run.

    Copyright (C) 2026 Vítor Geraldes
    Licence: GPL-3.0-or-later
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
"""
import contextlib
import os
import shutil
import subprocess
import sys
import tempfile

#  A repository listing shorter than this is a blind pass, not a clean one.
FLOOR = 500


def _refuse(gate, why):
    sys.stdout.write(
        f"{gate}: FAILED -- CANNOT RUN: {why}  This gate judges the files "
        "`git ls-files` lists, and a verdict over a tree it cannot enumerate "
        "would be a PASS that proves nothing.\n")
    sys.exit(1)


def all_tracked(root, gate="gate"):
    """Every tracked path (posix, relative to root), or exit 1 by name."""
    try:
        p = subprocess.run(["git", "ls-files", "-z"], cwd=str(root),
                           capture_output=True, text=True, timeout=120)
    except (OSError, subprocess.SubprocessError) as e:
        _refuse(gate, f"`git ls-files` did not run ({e}).")
    rels = [r for r in p.stdout.split("\0") if r]
    if p.returncode != 0 or len(rels) < FLOOR:
        _refuse(gate, f"`git ls-files` returned rc={p.returncode} and "
                      f"{len(rels)} path(s) (floor {FLOOR}).")
    return rels


def tracked_files(root, *prefixes, suffixes=None, gate="gate"):
    """Tracked files under any of `prefixes` (a prefix is a directory or a
    file path), optionally limited to `suffixes`; sorted, relative posix paths
    that exist on disk (a tracked-but-deleted path is skipped, which is the
    working tree's own business)."""
    out = []
    pre = tuple(p.rstrip("/") for p in prefixes)
    for rel in all_tracked(root, gate):
        if pre and not any(rel == p or rel.startswith(p + "/") for p in pre):
            continue
        if suffixes and not rel.endswith(tuple(suffixes)):
            continue
        if os.path.isfile(os.path.join(str(root), rel)):
            out.append(rel)
    return sorted(out)


@contextlib.contextmanager
def public_data_root(root, gate="gate"):
    """A throw-away `CHOUPO_HOME` whose `data/` is the PUBLIC tier only.

    The engine resolves `$CHOUPO_HOME/data` and reads `data/local/` beneath it
    as a fall-back tier ("standards beats local; local fills gaps": a private
    pair file turns an `idealDefault` pair into a curated one, and a gate that
    asserts the refusal of an ideal pair then reports on the machine rather
    than the commit).  There is no engine switch to hide it, so a gate that
    DRIVES the engine builds the root it wants: `data/standards` as a COPY of
    its tracked files (6-7 MB), every other entry of `data/` except `local`
    and `tmp` symlinked, and no `local` at all.  Yields the root path; export
    it as `CHOUPO_HOME` to the engine process.
    """
    src = os.path.join(str(root), "data")
    tmp = tempfile.mkdtemp(prefix="choupo-public-")
    try:
        dst = os.path.join(tmp, "data")
        os.makedirs(dst)
        for rel in tracked_files(root, "data/standards", gate=gate):
            out = os.path.join(tmp, rel)
            os.makedirs(os.path.dirname(out), exist_ok=True)
            shutil.copy2(os.path.join(str(root), rel), out)
        for name in sorted(os.listdir(src)):
            if name in ("local", "tmp", "standards"):
                continue
            os.symlink(os.path.join(src, name), os.path.join(dst, name))
        yield tmp
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def public_env(tmp):
    """The environment of an engine process confined to `public_data_root`."""
    return dict(os.environ, CHOUPO_HOME=tmp)
