#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""lesson_scan -- the one home of "read the lesson sources and probe the tree"
for the three C455 gates (absence phrases, typed numbers, knob ranges).

  lesson_files(root)         the gui/src/ui/methods/**/*.ts(x) files, relative
  strip_comments(text)       the source with // lines and /* */ blocks blanked
                             (line numbers preserved): a comment is for the
                             developer, only STRINGS and JSX reach a student
  probe(root, kind, glob, rx)  ("absent" | "present", glob, regex) against the
                             tree under root; returns (ok, first hit or None)

Python standard library only.
"""
import os
import re
import shutil
from pathlib import Path

METHODS = "gui/src/ui/methods"


def lesson_files(root):
    base = Path(root) / METHODS
    return sorted(str(p.relative_to(root)) for p in base.rglob("*")
                  if p.suffix in (".ts", ".tsx") and p.is_file())


def strip_comments(text):
    out = []
    in_block = False
    for line in text.split("\n"):
        s = line.strip()
        if in_block:
            if "*/" in s:
                in_block = False
            out.append("")
            continue
        if s.startswith("//"):
            out.append("")
            continue
        if s.startswith("/*"):
            if "*/" not in s:
                in_block = True
            out.append("")
            continue
        out.append(line)
    return "\n".join(out)


def probe(root, kind, glob, rx):
    """absent: no file under `glob` matches `rx` (ok=True).  present: some file
    matches.  A glob that selects no file is a refusal (ok=False, hit text says so):
    a probe over nothing proves nothing."""
    rx_c = re.compile(rx, re.M)
    files = [p for p in Path(root).glob(glob) if p.is_file()]
    if not files:
        return False, "probe glob %r selects no file" % glob
    hit = None
    for p in sorted(files):
        try:
            t = p.read_text(errors="replace")
        except OSError:
            continue
        m = rx_c.search(t)
        if m:
            hit = "%s:%d" % (p.relative_to(root), t.count("\n", 0, m.start()) + 1)
            break
    if kind == "absent":
        return hit is None, hit
    return hit is not None, hit


def private_root(root, td, copied=(METHODS,), linked=("src", "data", "bin", "docs", "tutorials")):
    """A private tree for a gate's sabotage arms: `copied` directories are real
    copies (the arm edits them), `linked` ones symlinks to the real tree."""
    for top in linked:
        if os.path.exists(os.path.join(root, top)):
            os.symlink(os.path.join(root, top), os.path.join(td, top))
    for rel in copied:
        for dp, _dn, fns in os.walk(os.path.join(root, rel)):
            out = os.path.join(td, os.path.relpath(dp, root))
            os.makedirs(out, exist_ok=True)
            for fn in fns:
                shutil.copy2(os.path.join(dp, fn), os.path.join(out, fn))
