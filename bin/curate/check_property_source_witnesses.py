#!/usr/bin/env python3
"""Gate: a few witness cases print the liquid-property source their code takes.

    bin/curate/check_property_source_witnesses.py

WHY THIS EXISTS (DEV.md 4c C378 slice 0; the door review's DR-11).  A unit
that computes a liquid property itself records WHICH tagged source it used
(core/PropertySourceLog.H).  The tag carries its own words, so the words
cannot drift from the number -- but the SITE chooses the tag, and a site
that picks the wrong one (the pump recording "a component without a volume
adds none" for pure water) is seen by no value, no bench and no golden
until the goldens carry `source` rows.  This gate runs one case per source
class, live, and holds the `sourceId` each unit publishes against
bin/curate/property_source_witnesses.tsv.

WHAT IT DOES NOT CHECK.  Cases other than the witnesses (the goldens' `source`
rows will, once recorded); whether a source is the right physics.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TABLE = ROOT / "bin" / "curate" / "property_source_witnesses.tsv"
NAME = "check_property_source_witnesses"
RESULT = re.compile(r"<<<Choupo:result-begin>>>\n(.*?)\n<<<Choupo:result-end>>>", re.S)


def run(case: Path):
    app = "choupoSolve"
    m = re.search(r"^\s*application\s+(\w+)\s*;",
                  (case / "system" / "controlDict").read_text(errors="replace"), re.M)
    if m:
        app = m.group(1)
    exe = ROOT / app
    if not exe.exists():
        return None, f"{exe} missing -- build the tree"
    env = dict(os.environ, CHOUPO_HOME=str(ROOT), LC_ALL="C")
    with tempfile.TemporaryDirectory() as tmp:
        dst = Path(tmp) / case.name
        shutil.copytree(case, dst)
        p = subprocess.run([str(exe), "."], cwd=dst, env=env, capture_output=True,
                           text=True, timeout=900)
    blocks = RESULT.findall(p.stdout)
    if not blocks:
        return None, f"no result block (exit {p.returncode})"
    ps = json.loads(blocks[-1]).get("propertySources") or {}
    used = ps.get("used", [])
    #  A unit may take one property from several sources (a pore-model
    #  module: the case's declared film diffusivity AND the ions' D0), so the
    #  witness holds a SET per (unit, property).
    got = {}
    for u in used:
        got.setdefault((u["unit"], u["property"]), set()).add(u["sourceId"])
    #  What each unit DECLARED at assembly (review DX-06): a witness row whose
    #  fourth column reads `declared:<class>` holds that, so a binary that
    #  stops declaring is seen.
    for d in ps.get("declared", []):
        got.setdefault((d["unit"], d["property"]), set()).add("declared:" + d["class"])
    return got, None


def main() -> int:
    rows = []
    for line in TABLE.read_text().splitlines():
        if line and not line.startswith("#"):
            rows.append(line.split("\t"))
    if len(rows) < 5:
        print(f"{NAME}: FAIL -- {TABLE.relative_to(ROOT)} holds {len(rows)} witness rows")
        return 1
    bad, cases = [], {}
    for case, unit, prop, sid in rows:
        if case not in cases:
            cases[case] = run(ROOT / case)
        got, err = cases[case]
        if err:
            bad.append(f"{case}: {err}")
            continue
        if sid not in got.get((unit, prop), set()):
            bad.append(f"{case}: {unit} {prop} published {sorted(got.get((unit, prop), set()))!r}, "
                       f"the witness says {sid!r}")
    if bad:
        print(f"{NAME}: FAIL -- {len(bad)} witness row(s) disagree")
        for b in bad:
            print("  " + b)
        return 1
    print(f"{NAME}: OK -- {len(rows)} (unit, property) sources in {len(cases)} witness "
          "case(s) are the tags their code takes.  NOT CHECKED: any case outside the "
          "witnesses (the goldens' `source` rows will hold those), or whether a source is "
          "right.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
