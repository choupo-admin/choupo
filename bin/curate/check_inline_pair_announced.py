#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_inline_pair_announced -- a binary pair typed in the case is ANNOUNCED.

    bin/curate/check_inline_pair_announced.py

WHY (C224, 2026-11-05).  `activityModel { binaryParameters { A-B { a_ij ...; } } }`
with no `source` copies coefficients "verbatim" -- values AND a citation
nobody at Choupo has read.  A chat assistant can type NRTL numbers from
memory with a plausible reference and the engine ran them in silence: a field
the engine cannot see is a comment.  The engine now raises one
`[unreviewed] pair` line per inline pair per run through
AdvisoryLog::addAnnouncedOnce (stderr + result JSON advisories -> caveat
block).  A pair resolved from the curated catalogue stays silent: silence
means "nothing was assumed".  Announcing moves no number.

ARMS (a real choupoProps run each; a run that cannot run FAILS, never passes):
  (a) ethanol-water typed INLINE (NRTL, the catalogue's own numbers): exactly
      one `[unreviewed] pair ethanol-water` stderr line, and an advisory with
      category provenance and locus `pair ethanol-water` in the result JSON.
  (b) the same two operations asked TWICE of the same inline pair (two
      temperatures): still ONE line (once per pair per run).
  (c) the catalogue pair (no binaryParameters): NO `[unreviewed] pair` line.
  (d) the inline run and the catalogue run publish IDENTICAL gammas.
  (e) the same pair typed INLINE under Wilson and UNIQUAC is announced too
      when the model accepts it inline (skipped arms are reported, not hidden).

NOT CHECKED: whether the typed numbers are right; that is what the line asks
the reader to find out.  Sabotage by hand: delete the addAnnouncedOnce call in
ThermoPackageBuilder.cpp resolveActivity, rebuild -> arms (a),(b) fail.
"""
import importlib.util
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROPS = ROOT / "choupoProps"
sys.path.insert(0, str(Path(__file__).parent))
spec = importlib.util.spec_from_file_location(
    "crp", Path(__file__).parent / "check_regressed_pairs.py")
crp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(crp)

I, J = "ethanol", "water"
LINE = f"[unreviewed] pair {I}-{J}"


def main():
    fails = []
    if not PROPS.exists():
        print("check_inline_pair_announced: FAIL choupoProps is not built")
        return 1
    rec = crp.STD / f"{I}-{J}.dat"
    if not rec.exists():
        print(f"check_inline_pair_announced: FAIL no catalogue record {rec}")
        return 1
    facts = crp.facts(rec.read_text())
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        rc, out = crp.run_span_probe(tmp, I, J, (350.0, 360.0), inline=facts)
        if rc != 0:
            fails.append(f"(a) inline probe exited {rc}: {out[-300:]}")
        else:
            n = sum(1 for ln in out.splitlines() if ln.startswith(LINE))
            if n != 1:
                fails.append(f"(a/b) {n} `{LINE}` line(s) for one inline pair "
                             "asked at two temperatures; the ruling is exactly ONE")
            vals, adv = crp.result_of(out)
            if not adv or not any(a.get("locus") == f"pair {I}-{J}"
                                  and a.get("category") == "provenance"
                                  for a in adv):
                fails.append("(a) the announcement is not in the result JSON "
                             "advisories -- it would never reach the caveat block")
        rc2, out2 = crp.run_span_probe(tmp, I, J, (350.0, 360.0))
        if rc2 != 0:
            fails.append(f"(c) catalogue probe exited {rc2}: {out2[-300:]}")
        else:
            if "[unreviewed] pair" in out2 and LINE in out2:
                fails.append("(c) a pair resolved from the curated catalogue "
                             "was announced as inline -- silence must keep "
                             "meaning 'nothing was assumed'")
            v2, _ = crp.result_of(out2)
            v1, _ = crp.result_of(out) if rc == 0 else (None, None)
            if not v1 or not v2:
                fails.append("(d) could not compare gammas")
            elif v1 != v2:
                fails.append(f"(d) inline vs catalogue gammas differ: {v1} {v2}")
    print("check_inline_pair_announced: " + ("FAIL" if fails else
          "OK inline ethanol-water NRTL announced once per run (stderr + result "
          "JSON), catalogue pair silent, gammas identical; arms (a)-(d); "
          "NOT checked: correctness of typed numbers, Wilson/UNIQUAC inline "
          "(same code path, not exercised)"))
    for f in fails:
        print("  - " + f)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
