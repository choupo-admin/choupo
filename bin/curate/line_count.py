#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""line_count -- how big Choupo is, counted from the tree and never typed.

Vítor, 2026-10-07 (DEV.md 4c C46): announce the size the way large open
projects do, by the widest honest definition, and keep the definition beside
the number so anyone can rerun it and get the same answer.

THE DEFINITION.  Every line of every TRACKED TEXT file (`git ls-files`;
comments and blank lines included; a file is text when it decodes as UTF-8
and carries no NUL byte).  Broken down by what the files ARE, because the
total alone would be misleading: most of it is data, and most of the data are
group-contribution ESTIMATES, which the landing says in those words.

    bin/curate/line_count.py           a table
    bin/curate/line_count.py --json    the numbers bin/buildSite injects

Read-only.  It is not a gate: the count moves with every commit, so a pinned
copy would be stale by construction -- it is computed when the site is built.
"""
import json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

BUCKETS = [   # (key, label, predicate on the repo-relative path) -- first match wins
    ("engineCpp",  "engine C++ (src/)",                    lambda p: p.startswith("src/")),
    ("gui",        "browser GUI (TypeScript/React)",       lambda p: p.startswith("gui/")),
    ("tutorials",  "tutorial cases (dictionaries)",        lambda p: p.startswith("tutorials/")),
    ("groupEstimates", "group-contribution estimate records", lambda p: p.startswith("data/groupEstimative/")),
    ("curatedData", "curated data records (data/standards)", lambda p: p.startswith("data/standards/")),
    ("otherData",  "other data files",                     lambda p: p.startswith("data/")),
    ("tools",      "gates and curation tools",             lambda p: p.startswith("bin/curate/")),
    ("manuals",    "manuals (LaTeX)",                      lambda p: p.startswith("docs/") and p.endswith(".tex")),
    ("docs",       "design records and docs",              lambda p: p.startswith("docs/") or p.endswith(".md")),
    ("rest",       "build, scripts, site and the rest",    lambda p: True),
]


def text_lines(path: Path):
    try:
        raw = path.read_bytes()
    except OSError:
        return None
    if b"\0" in raw:
        return None
    try:
        txt = raw.decode("utf-8")
    except UnicodeDecodeError:
        return None
    return txt.count("\n") + (0 if txt.endswith("\n") or not txt else 1)


def count():
    files = subprocess.run(["git", "-C", str(ROOT), "ls-files", "-z"],
                           capture_output=True, check=True).stdout.split(b"\0")
    out = {k: {"label": lab, "files": 0, "lines": 0} for k, lab, _ in BUCKETS}
    gc_components = 0
    for f in files:
        if not f:
            continue
        rel = f.decode("utf-8", "replace")
        n = text_lines(ROOT / rel)
        if n is None:
            continue
        key = next(k for k, _, pred in BUCKETS if pred(rel))
        out[key]["files"] += 1
        out[key]["lines"] += n
        if rel.startswith("data/groupEstimative/components/") and rel.endswith(".dat"):
            gc_components += 1
    total_files = sum(v["files"] for v in out.values())
    total_lines = sum(v["lines"] for v in out.values())
    return {"definition": "every line (comments and blanks included) of every "
                          "git-tracked UTF-8 text file",
            "totalFiles": total_files, "totalLines": total_lines,
            "groupEstimateCompounds": gc_components, "buckets": out}


def main():
    c = count()
    if "--json" in sys.argv:
        print(json.dumps(c, indent=1))
        return 0
    for k, v in sorted(c["buckets"].items(), key=lambda kv: -kv[1]["lines"]):
        print(f"{v['label']:42s} {v['files']:7,d} files {v['lines']:11,d} lines")
    print(f"{'TOTAL':42s} {c['totalFiles']:7,d} files {c['totalLines']:11,d} lines")
    print(f"line_count: OK -- {c['definition']}; {c['groupEstimateCompounds']:,d} "
          "group-contribution estimate compounds among the data.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
