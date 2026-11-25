#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the engine publishes the INACTIVE properties of records as a structured fact (C154).

    bin/curate/check_inactive_properties.py

THE REAL DEFECT THIS WOULD HAVE CAUGHT.  A user's walk through the NanoFiltran case
(DEV.md 4c C154, 2026-10-25) read the membrane record's `A_w` and could not tell that, with
the bench imposing J_v, it does nothing: the unread-key audit sees only the operation's own
dictionary, and a value read from a RECORD is not in it, so the screen showed a number the
run never used.  The engine now publishes it, per operation, as `inactiveProperties`
{source, key, reason} in `operationResults`; the GUI marks the key's line in the record.

WHAT IT CHECKS (choupoProps on dspmde01_water_treatment_salts, poreTransport at imposed J_v):
  (a) the poreTransport operation carries an inactive A_w, source `membrane <name>`, with a
      reason that says the flux is imposed;
  (b) every fact is TRUE TO THE TREE: the named record exists in the case and declares the key;
  (c) an operation that imposes no flux publishes none (polarisation01: no field at all).
NOT CHECKED: that A_w is really unread by the numerics (held by the pore-solver gates), and the
GUI mark (gui/tests/inactiveKeys.test.ts).
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gatekit  # noqa: E402

BENCH = "tutorials/props/membrane/dspmde01_water_treatment_salts"
NONE = "tutorials/props/membrane/polarisation01_geraldes_afonso_table1"


def results(case):
    with gatekit.probe_copy(case, strip=("expected", "converged")) as c:
        rc, out = gatekit.run(gatekit.binary("choupoProps"), c)
        m = re.search(r"<<<Choupo:result-begin>>>\s*(\{.*\})\s*<<<Choupo:result-end>>>", out, re.S)
        if rc != 0 or not m:
            return None, f"{case}: did not run (exit {rc})", {}
        recs = {p.stem: p.read_text() for p in c.rglob("*.dat")}
        return json.loads(m.group(1)), None, recs


def main():
    failures = []
    j, err, recs = results(BENCH)
    n = 0
    if err:
        failures.append(err)
    else:
        for op in j.get("operationResults", []):
            facts = op.get("inactiveProperties", [])
            if op.get("type") == "poreTransport" and not any(f["key"] == "A_w" for f in facts):
                failures.append(f"{op['name']}: a poreTransport op imposes J_v and publishes no inactive A_w")
            for f in facts:
                n += 1
                name = f["source"].split()[-1]
                if "imposes J_v" not in f["reason"]:
                    failures.append(f"{op['name']}: the reason does not name the imposed flux: {f['reason']!r}")
                if name not in recs or not re.search(rf"^\s*{re.escape(f['key'])}\s", recs[name], re.M):
                    failures.append(f"{op['name']}: record {name!r} does not declare {f['key']!r}")
    j2, err2, _ = results(NONE)
    if err2:
        failures.append(err2)
    elif any("inactiveProperties" in op for op in j2.get("operationResults", [])):
        failures.append("polarisation01 imposes no flux and must publish no inactiveProperties")
    return gatekit.verdict("check_inactive_properties", failures,
        f"{n} inactive record propert(ies) published by poreTransport at imposed J_v, each in a record "
        "that declares the key; an op that imposes nothing publishes none.  NOT CHECKED: that the "
        "numerics never read A_w, and the GUI mark.")


if __name__ == "__main__":
    sys.exit(main())
