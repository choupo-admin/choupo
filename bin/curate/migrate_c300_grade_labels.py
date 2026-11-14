#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""migrate_c300_grade_labels -- DEV.md 4c C300 rules 1 and 2 on the records
already in the catalogue (2026-11-11).  A one-off migration, kept so the
change it made can be re-read and re-run (it is idempotent).

    python3 -I bin/curate/migrate_c300_grade_labels.py [--write]

Without `--write` it prints what it would change and the grade counts before
and after; with `--write` it writes the records.

WHAT IT CHANGES, and nothing else:
  * every provenance entry carrying `fitGrade` gains, on the line after it,
    `fitGradeBasis inSample;` (rule 1) -- pairs AND component values
    (vapour pressure, Vliq, liquid Cp);
  * a regressed PAIR (data/standards/parameters/NRTL/, a `curation {}` block
    whose rule names C283 or C291) whose in-sample grade is `clean` and whose
    kept evidence holds fewer than two temperatures or fewer than two
    laboratories is RE-GRADED, not refitted: its `fitGrade` word becomes
    `warning` and the next line names the cap, `fitGradeCap ( ... );`
    (rule 2).  The rule is bin/curate/pairs_c283.py cap_grade -- the one the
    tools and check_regressed_pairs apply -- and the counts are the case's
    own: a C291 record's curation `temperatures` / `laboratories`, a C283
    record's kept bubble-temperature rows (bin/choupo-curate fetch first).
No parameter, no curation-block line, no header and no `humanReviewed` line
is touched (rule 4 leaves the legacy field in the records that have it).
"""
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import pairs_c283 as pc   # noqa: E402

ROOT = pc.ROOT
crp = pc.crp
NRTL = ROOT / "data" / "standards" / "parameters" / "NRTL"
COMP = ROOT / "data" / "standards" / "components"
GRADE_RE = re.compile(r"^( +)fitGrade( +)(clean|warning|severe)(;[^\n]*)\n", re.M)


def basis_line(indent):
    return pc.BASIS_LINE.replace("    ", indent, 1)


def label_text(text, applied=None, caps=()):
    """`text` with the basis line after each fitGrade (and, for a pair, the
    grade word replaced by `applied` and the cap line after the basis)."""
    out, pos = [], 0
    for m in GRADE_RE.finditer(text):
        out.append(text[pos:m.start()])
        indent, gap, grade, rest = m.groups()
        new_grade = applied or grade   # the gap is kept: the tools write the same column
        out.append(f"{indent}fitGrade{gap}{new_grade}{rest}\n")
        tail = text[m.end():]
        if not re.match(r" +fitGradeBasis\s", tail):
            out.append(basis_line(indent))
        if caps and not re.search(r"^ +fitGradeCap\s", text, re.M):
            out.append(pc.cap_line(list(caps)).replace("    ", indent, 1))
        pos = m.end()
    out.append(text[pos:])
    return "".join(out)


def pair_plan(p):
    text = p.read_text()
    t = crp.strip_comments(text)
    prov = crp.block(t, "provenance") or ""
    cur = crp.block(t, "curation") or ""
    rule = crp.word(cur, "rule") or ""
    grade = crp.word(prov, "fitGrade")
    if not grade:
        return None
    case = ROOT / crp.word(prov, "fittedInCase")
    in_sample = crp.word(cur, "grade")
    if "C291" in rule:
        nT, nL = int(crp.num(cur, "temperatures")), int(crp.num(cur, "laboratories"))
        kind = "Px"
    elif "C283" in rule:
        rc = subprocess.run([sys.executable, "-I", str(ROOT / "bin" / "choupo-curate"),
                             "fetch", str(case)], capture_output=True, text=True)
        if rc.returncode != 0:
            sys.exit(f"{p.name}: fetch of {case} returned {rc.returncode}: {rc.stdout}{rc.stderr}")
        nT, nL = pc.tx_evidence_counts(case)
        kind = "Tx"
    else:
        sys.exit(f"{p.name}: graded but its curation rule names neither C283 nor C291")
    if in_sample != grade and crp.word(prov, "fitGradeCap") is None:
        sys.exit(f"{p.name}: provenance fitGrade {grade} differs from the curation grade "
                 f"{in_sample} with no cap -- not a record this migration understands")
    applied, caps = pc.cap_grade(in_sample, nT, nL)
    return {"path": p, "kind": kind, "before": grade, "after": applied, "caps": caps,
            "nT": nT, "nL": nL, "new": label_text(text, applied, caps), "old": text}


def main(argv):
    write = "--write" in argv
    plans = [x for x in (pair_plan(p) for p in sorted(NRTL.glob("*.dat"))) if x]
    comps = []
    for p in sorted(COMP.glob("*.dat")):
        text = p.read_text()
        if GRADE_RE.search(text):
            comps.append({"path": p, "old": text, "new": label_text(text)})
    from collections import Counter
    before = Counter(x["before"] for x in plans)
    after = Counter(x["after"] for x in plans)
    caps = Counter(" ".join(x["caps"]) for x in plans if x["caps"])
    print(f"pairs graded: {len(plans)} (Px {sum(x['kind'] == 'Px' for x in plans)}, "
          f"Tx {sum(x['kind'] == 'Tx' for x in plans)})")
    print("  before: " + ", ".join(f"{before[g]} {g}" for g in ("clean", "warning", "severe")))
    print("  after:  " + ", ".join(f"{after[g]} {g}" for g in ("clean", "warning", "severe")))
    print("  caps:   " + ", ".join(f"{n} ({k})" for k, n in sorted(caps.items())))
    for x in plans:
        if x["before"] != x["after"]:
            print(f"    {x['path'].name}: {x['before']} -> {x['after']} "
                  f"({x['kind']}, {x['nT']} T, {x['nL']} lab; {' '.join(x['caps'])})")
    vpc = Counter()
    for c in comps:
        for m in GRADE_RE.finditer(c["old"]):
            vpc[m.group(3)] += 1
    print(f"component records with graded values: {len(comps)} "
          f"({', '.join(f'{vpc[g]} {g}' for g in ('clean', 'warning', 'severe'))} entries; "
          "basis line only, no grade changes)")
    changed = [x for x in plans + comps if x["new"] != x["old"]]
    print(f"files to change: {len(changed)}")
    if write:
        for x in changed:
            x["path"].write_text(x["new"])
        print("written")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
