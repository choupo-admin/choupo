#!/usr/bin/env python3
"""Ontological tree migration helper for data/standards.

Usage:  migtree.py OLD_REL NEW_REL [OLD_REL NEW_REL ...]

Each pair is a standards-relative path (file or dir).  For every pair the tool:
  1. git-mv the file/dir under data/standards.
  2. In every case snapshot (constant/propertyData/), git-mv the mirrored
     entry propertyData/<OLD> -> propertyData/<NEW> if present.
  3. Rewrite manifest.dat record keys "<OLD>...  ->  "<NEW>...
  4. Global content replace  data/standards/<OLD>  ->  data/standards/<NEW>
     across tracked text files (data/ src/ bin/ docs/ gui/ tutorials/ *.md).

Path-builder code that concatenates path segments (fs::path / "standards" /
"x") is NOT touched -- edit those readers by hand.  Longest OLD first.
"""
import subprocess, sys, os, re
from pathlib import Path

ROOT = Path("/home/vitor/Choupo")
STD = ROOT / "data" / "standards"

def sh(*a):
    return subprocess.run(a, cwd=ROOT, capture_output=True, text=True)

def gitmv(src: Path, dst: Path):
    dst.parent.mkdir(parents=True, exist_ok=True)
    r = sh("git", "mv", str(src.relative_to(ROOT)), str(dst.relative_to(ROOT)))
    if r.returncode != 0:
        # untracked -> plain move
        src.rename(dst)
        print(f"  mv (untracked) {src.relative_to(ROOT)} -> {dst.relative_to(ROOT)}")
    else:
        print(f"  git mv {src.relative_to(ROOT)} -> {dst.relative_to(ROOT)}")

def main():
    args = sys.argv[1:]
    pairs = list(zip(args[0::2], args[1::2]))
    # longest OLD first to avoid prefix collisions in string replace
    pairs.sort(key=lambda p: len(p[0]), reverse=True)

    # 1. move under data/standards
    for old, new in pairs:
        s, d = STD / old, STD / new
        if s.exists():
            gitmv(s, d)
        else:
            print(f"  SKIP standards (absent): {old}")

    # 2+3. snapshots
    snaps = subprocess.run(["find", "tutorials", "-type", "d", "-name", "propertyData"],
                           cwd=ROOT, capture_output=True, text=True).stdout.split()
    for snap in snaps:
        snapdir = ROOT / snap
        for old, new in pairs:
            s = snapdir / old
            if s.exists():
                gitmv(s, snapdir / new)
        man = snapdir / "manifest.dat"
        if man.exists():
            txt = man.read_text()
            for old, new in pairs:
                txt = txt.replace(f'"{old}', f'"{new}')
            man.write_text(txt)

    # 4. global content replace of data/standards/<old> -> data/standards/<new>
    globs = ["data", "src", "bin", "docs", "gui/src", "gui/public", "tutorials"]
    files = subprocess.run(
        ["grep", "-rlI", "--exclude-dir=.git", "--exclude-dir=build",
         "--exclude-dir=node_modules"] +
        [f"data/standards/{old}" for old, _ in pairs] + globs,
        cwd=ROOT, capture_output=True, text=True).stdout.split()
    # also top-level *.md
    for md in ROOT.glob("*.md"):
        files.append(str(md.relative_to(ROOT)))
    changed = 0
    for f in set(files):
        p = ROOT / f
        if not p.is_file():
            continue
        try:
            t = p.read_text()
        except Exception:
            continue
        o = t
        for old, new in pairs:
            t = t.replace(f"data/standards/{old}", f"data/standards/{new}")
        if t != o:
            p.write_text(t)
            changed += 1
    print(f"  content: {changed} file(s) rewritten")

if __name__ == "__main__":
    main()
