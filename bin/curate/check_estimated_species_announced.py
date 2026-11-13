#!/usr/bin/env python3
"""check_estimated_species_announced -- an ESTIMATED species datum is ANNOUNCED
when a run consumes it, and only then.

    bin/curate/check_estimated_species_announced.py

WHY (C376, 2026-11-13).  C373/C376 put formation enthalpies and entropies into
the species records, some with a per-datum `provenance { hfAq { origin
estimated; method ...; } }` block (the paper's own correlation estimates).  The
engine read the number and dropped the word, so an estimate entered an energy
balance in the same silence as a measurement.  The species tier now raises one
`[estimate] species '<name>'` line per species and datum per run through
AdvisoryLog::addAnnouncedOnce (console + result JSON advisories -> caveat
block), at the point where the number ENTERS A RESULT:
  hfAq -- ionAqReference(), the aqueous ion reference of a salt (the enthalpy
          datum of the electrolyte);
  cpAq -- ThermoPackageBuilder, only on the constant ion-Cp tier (no
          Criss-Cobble entry), which is what extends the reference away from
          25 C;
  sAq  -- no consumer exists in the engine today; the helper
          (announceEstimatedSpeciesDatum) is ready for the first one.
Reading a record is not consuming it: a run that never reaches the consumer
says nothing.  Announcing moves no number.

ARMS (a real choupoProps run each, on a COPY of the witness case; a run that
cannot run FAILS, never passes):
  (a) the witness as shipped (OH-minus's hfAq declared estimated): exactly one
      `[estimate] species 'OH'` line naming hfAq, the origin word, the method
      the record states and what depended on it; none for Na; and an advisory
      of category provenance, locus `species 'OH'`, in the result JSON.
  (b) the same case with the provenance block deleted: NO `[estimate] species`
      line -- silence keeps meaning "nothing was estimated".
  (c) the same case with the estimate moved to sAq, which nothing consumes:
      NO line -- a record that is read but not consumed does not speak.
  (d) (a) and (b) publish IDENTICAL diagnostics: the announcement moves no
      number.

NOT CHECKED: that any catalogue estimate is physically right (that is the
curation's claim, with its method sentence); the cpAq route (no shipped or
witness species carries an estimated cpAq).
Sabotage by hand: make announceEstimatedSpeciesDatum return at its top and
rebuild -> arm (a) fails.
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
PROPS = ROOT / "choupoProps"
WITNESS = ROOT / "tutorials/props/electrolyte/estimatedSpecies01_announced"
LINE = "[estimate] species 'OH'"


def run(case):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(PROPS), "."], cwd=str(case), env=env,
                       capture_output=True, text=True, timeout=300)
    return p.returncode, p.stdout + p.stderr


def result(out):
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  out, re.S)
    if not m:
        return None, None
    try:
        js = json.loads(m.group(1))
    except json.JSONDecodeError:
        return None, None
    diag = []
    for op in js.get("operationResults", []):
        for k, v in sorted(op.get("diagnostics", {}).items()):
            diag.append((op.get("name"), k, v))
    return diag, js.get("advisories", [])


def variant(tmp, name, edit):
    dst = tmp / name
    shutil.copytree(WITNESS, dst)
    f = dst / "constant/species/OH.dat"
    f.write_text(edit(f.read_text()))
    return dst


def main():
    fails = []
    if not PROPS.exists():
        print("check_estimated_species_announced: FAIL choupoProps is not built")
        return 1
    if not WITNESS.is_dir():
        print("check_estimated_species_announced: FAIL witness case missing")
        return 1
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        rc, out = run(variant(tmp, "a", lambda s: s))
        if rc != 0:
            fails.append(f"(a) witness exited {rc}: {out[-300:]}")
        else:
            lines = [ln for ln in out.splitlines() if ln.startswith(LINE)]
            if len(lines) != 1:
                fails.append(f"(a) {len(lines)} `{LINE}` line(s); the rule is "
                             "exactly ONE per species and datum per run")
            else:
                for need in ("hfAq", "estimated", "WITNESS ONLY",
                             "aqueous ion reference"):
                    if need not in lines[0]:
                        fails.append(f"(a) the line does not carry `{need}`: "
                                     + lines[0])
            if "[estimate] species 'Na'" in out:
                fails.append("(a) Na carries no estimate yet was announced")
            _, adv = result(out)
            if not adv or not any(a.get("locus") == "species 'OH'"
                                  and a.get("category") == "provenance"
                                  and "hfAq" in a.get("message", "")
                                  for a in adv):
                fails.append("(a) the announcement is not in the result JSON "
                             "advisories -- it would never reach the caveat "
                             "block or the result's provenance")
        diag_a, _ = result(out)

        # (b) no provenance block at all
        def drop(s):
            return re.sub(r"provenance\s*\{\s*hfAq\s*\{[^}]*\}\s*\}\n", "", s)
        rc, outb = run(variant(tmp, "b", drop))
        if rc != 0:
            fails.append(f"(b) probe exited {rc}: {outb[-300:]}")
        else:
            if "[estimate] species" in outb:
                fails.append("(b) a record with no provenance was announced")
            diag_b, _ = result(outb)
            if not diag_a or not diag_b:
                fails.append("(d) could not compare diagnostics")
            elif diag_a != diag_b:
                fails.append("(d) the announcement moved a number")

        # (c) the estimate on sAq, which no consumer reads
        rc, outc = run(variant(tmp, "c",
                               lambda s: s.replace("    hfAq\n    {\n        origin  estimated;",
                                                   "    sAq\n    {\n        origin  estimated;")))
        if rc != 0:
            fails.append(f"(c) probe exited {rc}: {outc[-300:]}")
        elif "[estimate] species" in outc:
            fails.append("(c) an estimated sAq nothing consumes was announced "
                         "-- reading a record is not consuming it")
    print("check_estimated_species_announced: " + ("FAIL" if fails else
          "OK an estimated hfAq consumed by the aqueous ion reference is "
          "announced once per run (console + result advisory), a record "
          "without provenance and an unconsumed estimated sAq stay silent, "
          "diagnostics identical; arms (a)-(d); NOT checked: the cpAq route, "
          "physical correctness of any catalogue estimate"))
    for f in fails:
        print("  - " + f)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
