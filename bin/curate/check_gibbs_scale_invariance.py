#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: a Gibbs reactor is homogeneous of degree one in its feed (backlog C497).

    bin/curate/check_gibbs_scale_invariance.py

THE REAL DEFECT THIS WOULD HAVE CAUGHT.  The element-potential Newton of the Gibbs
reactor (GibbsMethod.cpp) stopped on an ABSOLUTE residual of 1e-8 mol/s.  With every feed
multiplied by 1e6, aceticAcid01_gibbsReactor and ammoniaReactor02_equilibrium could not
reach it (no convergence at exit 0 of the chain), and multiplied by 1e-6 the tolerance was
met at once so trace fractions stopped moving (up to 8 %).  Found by the homogeneity probe
(bin/curate/homogeneity_probe.py, DEV.md 4c C491/C497), invisible to every golden, which
pins the feed the case ships with.

WHAT IT CHECKS.  Each case is run as shipped and with its feed streams (and tear seeds)
multiplied by 1e6 and by 1e-6.  Every stream's composition must equal the shipped run's:
relative 1e-5 for fractions above 1e-6, relative 1e-3 for the trace fractions between
1e-9 and 1e-6 (the part the absolute tolerance moved).  A scaled run that does not
converge fails by name.
NOT CHECKED: extensive results (the flows scale by construction of the feed) and any
case with a declared size or duty, which is not homogeneous by design.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gatekit  # noqa: E402
import homogeneity_probe as hp  # noqa: E402

CASES = [
    ("tutorials/steady/reactors/aceticAcid01_gibbsReactor", ["feed"]),
    ("tutorials/steady/reactors/ammoniaReactor02_equilibrium", ["makeup", "recycle", "mixed"]),
]
SCALES = (1.0e6, 1.0e-6)
STRIP = ("expected", "converged", "constant/propertyManifest")


def compositions(case, feeds, k):
    with gatekit.probe_copy(case, strip=STRIP) as c:
        if k != 1.0:
            for f in feeds:
                p = c / "0" / f
                p.write_text(hp.scale_text(p.read_text(), k))
        rc, out = gatekit.run(gatekit.binary("choupoSolve"), c)
    m = re.search(r"<<<Choupo:result-begin>>>\s*(\{.*\})\s*<<<Choupo:result-end>>>", out, re.S)
    if rc != 0 or not m:
        return None, f"{Path(case).name} x{k:g}: did not run to a result (exit {rc})"
    return {s: v["composition"] for s, v in json.loads(m.group(1))["streams"].items()
            if "composition" in v}, None


def main():
    failures = []
    worst = 0.0
    n = 0
    for case, feeds in CASES:
        base, err = compositions(case, feeds, 1.0)
        if err:
            failures.append(err)
            continue
        for k in SCALES:
            got, err = compositions(case, feeds, k)
            if err:
                failures.append(err)
                continue
            for s, comp in base.items():
                for sp, x in comp.items():
                    if x < 1.0e-9:
                        continue
                    y = got.get(s, {}).get(sp, 0.0)
                    d = abs(y - x) / x
                    n += 1
                    tol = 1.0e-5 if x > 1.0e-6 else 1.0e-3
                    if x > 1.0e-6:
                        worst = max(worst, d)
                    if d > tol:
                        failures.append(f"{Path(case).name} x{k:g}: {s}.{sp} = {y:.6g} against {x:.6g} "
                                        f"as shipped ({d:.1e} relative)")
    return gatekit.verdict("check_gibbs_scale_invariance", failures,
        f"{len(CASES)} Gibbs case(s) at feed scale 1e6 and 1e-6 reproduce the shipped composition of "
        f"every stream ({n} fractions compared, worst above 1e-6: {worst:.1e} relative).  "
        "NOT CHECKED: extensive results, and cases with a declared size or duty.")


if __name__ == "__main__":
    sys.exit(main())
