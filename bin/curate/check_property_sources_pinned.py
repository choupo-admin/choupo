#!/usr/bin/env python3
"""Gate: every liquid-property source a case publishes is pinned by its golden.

    bin/curate/check_property_sources_pinned.py

WHY THIS EXISTS (DEV.md 4c C378 slice 0; the settled contract "A RESULT
BLOCK THE GOLDEN FORMAT CANNOT READ ARRIVES UNPINNED", 2026-08-12).  The
result block `propertySources` says, per unit, where its liquid density,
viscosity, surface tension or diffusivity came from -- the property
kernel, a 25 C molar volume the unit reads itself, a constant 1000 kg/m3,
the case's declared value.  A unit that silently switches source changes
its numbers through a door nobody pins, so each published (unit,
property) carries a golden row of kind `source`, a WORD compared `exact`
(the `verdict` precedent):

    source  methanolPump  liquidDensity  bypass.recordVliq25C  exact

A unit name with blanks is written with `_` for each blank.  This gate
fails while a case publishes a source its `expected` file does not pin, and
prints the command that adds the rows (append-only: no existing row moves).

WHERE IT READS.  The suite's own cached outputs (bin/curate/suite_cache.py)
under bin/runTests; standalone, it runs the --fast set live and says so.

WHAT IT DOES NOT CHECK.  Whether the source is the right one (that is the
pilot's), or the value (the goldens' numbers pin the consequences).
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "bin" / "curate"))
from suite_cache import DIR, SCOPED, no_subject, scope_sentence, stdout_of   # noqa: E402

NAME = "check_property_sources_pinned"
RESULT = re.compile(r"<<<Choupo:result-begin>>>\n(.*?)\n<<<Choupo:result-end>>>", re.S)


def published(text):
    """{(unit_, property): 'id1,id2'} from the LAST result block of a run."""
    blocks = RESULT.findall(text or "")
    if not blocks:
        return {}
    try:
        j = json.loads(blocks[-1])
    except ValueError:
        return {}
    srcs = {}
    for u in (j.get("propertySources") or {}).get("used", []):
        key = (u["unit"].replace(" ", "_"), u["property"])
        srcs.setdefault(key, set()).add(u["sourceId"])
    return {k: ",".join(sorted(v)) for k, v in srcs.items()}


def pinned(exp: Path):
    rows = {}
    for line in exp.read_text(errors="replace").splitlines():
        f = line.split()
        if len(f) >= 5 and f[0] == "source":
            rows[(f[1], f[2])] = f[3]
    return rows


def live(case: Path):
    app = "choupoSolve"
    cd = case / "system" / "controlDict"
    if cd.exists():
        m = re.search(r"^\s*application\s+(\w+)\s*;", cd.read_text(errors="replace"), re.M)
        if m:
            app = m.group(1)
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    import shutil, tempfile
    with tempfile.TemporaryDirectory() as tmp:
        dst = Path(tmp) / case.name
        shutil.copytree(case, dst)
        p = subprocess.run([str(ROOT / app), "."], cwd=dst, env=env,
                           capture_output=True, text=True, timeout=900)
    return p.stdout


def main() -> int:
    if DIR is None:
        cases = []
        for line in (ROOT / "tutorials" / "FASTSET").read_text().splitlines():
            line = line.split("#")[0].strip()
            if line:
                cases.append(ROOT / line.split()[0])
        where = "the --fast set, run live (no suite cache)"
    else:
        cases = sorted(p.parent for p in (ROOT / "tutorials").rglob("expected") if p.is_file())
        where = "the suite's cached outputs"
    judged = skipped = 0
    missing, wrong = [], []
    for case in cases:
        exp = case / "expected"
        if not exp.is_file():
            continue
        text = stdout_of(case) if DIR is not None else live(case)
        if text is None:
            skipped += 1
            continue
        pub = published(text)
        if not pub:
            continue
        judged += 1
        pins = pinned(exp)
        rel = case.relative_to(ROOT).as_posix()
        for k, v in sorted(pub.items()):
            if k not in pins:
                missing.append((rel, k, v))
            elif pins[k] != v:
                wrong.append((rel, k, pins[k], v))
    if judged == 0:
        ns = no_subject(NAME, "no case in scope published a liquid-property source")
        if ns is not None:
            return ns
    if missing or wrong:
        cases_missing = sorted({m[0] for m in missing})
        print(f"{NAME}: FAIL -- {len(missing)} published source row(s) unpinned in "
              f"{len(cases_missing)} case(s), {len(wrong)} pinned row(s) disagree ({where}).")
        for rel, k, v in missing[:15]:
            print(f"  UNPINNED  {rel}: source {k[0]} {k[1]} {v} exact")
        for rel, k, a, b in wrong[:15]:
            print(f"  MOVED     {rel}: {k[0]} {k[1]} pinned {a}, published {b}")
        print("  Remedy (append-only, no existing row moves): "
              "bin/runTests --record-append " + " ".join(cases_missing[:5])
              + (" ..." if len(cases_missing) > 5 else ""))
        return 1
    print(f"{NAME}: OK -- {judged} case(s) publishing liquid-property sources, every "
          f"(unit, property) pinned by a `source` row ({where})."
          + scope_sentence(judged, skipped))
    return 0


if __name__ == "__main__":
    sys.exit(main())
