#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""unifac_gamma_infdil -- vapour-liquid sanity of freshly derived UNIFAC groups.

    bin/curate/unifac_gamma_infdil.py NAME [NAME ...]    (default: every record carrying the
                                                          `unifacGroups` derived-from-structure provenance)

For each component the engine's own UNIFAC gamma at (practically) infinite dilution is read in two
solvents, hexane and water, at 298.15 K (x = 1e-6 of the solute).  A decomposition that came out wrong
(a group that does not belong, a count off by one) shows as a gamma outside the physical window
(1e-3, 1e9) or as no number at all.  The engine is run through the native choupoProps; this is a
sanity net, not a validation against measured gamma-infinity.
Exit 1 if any value is missing or outside the window.
"""
import csv
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMP = ROOT / "data" / "standards" / "components"
LO, HI = 1e-3, 1e9


def case(c, solvent):
    return {
        "system/controlDict": "application choupoProps;\nverbosity 0;\n",
        "constant/thermoPhysPropDict": (
            "recordType thermophysicalPropertySystem;\nschemaVersion 1;\n"
            f"components ( {c} {solvent} );\n"
            "equilibrium { formulation gammaPhi; liquid { activityModel { model UNIFAC; } standardState pureLiquid; }"
            " vapour { fugacityModel idealGas; } }\n"),
        "system/propsDict": (
            "operations ( { name g; type propertyScan1D; vary { variable T; from 298.15; to 300; n 2; }"
            f" state {{ P 101325; composition {{ {c} 1e-6; {solvent} 0.999999; }} }}"
            f" properties ( gamma_{c} ); output {{ file g.csv; }} }} );\n"),
    }


def gamma(binary, c, solvent):
    d = tempfile.mkdtemp(prefix="gam_", dir=os.environ.get("TMPDIR", "/tmp"))
    for p, t in case(c, solvent).items():
        fp = Path(d) / p
        fp.parent.mkdir(parents=True, exist_ok=True)
        fp.write_text(t)
    r = subprocess.run([binary, d], capture_output=True, text=True, cwd=d, timeout=120)
    f = Path(d) / "g.csv"
    if r.returncode != 0 or not f.exists():
        why = [l for l in r.stderr.splitlines() if "error" in l.lower()][-1:] or ["no result"]
        return None, why[0].strip()[:120]
    rows = list(csv.DictReader(f.open()))
    try:
        return float(rows[0][f"gamma_{c}"]), ""
    except (KeyError, ValueError):
        return None, "no gamma column"


def main(argv):
    binary = os.environ.get("CHOUPO_PROPS", str(ROOT / "choupoProps"))
    if not Path(binary).exists():
        binary = "/home/vitor/Choupo/build/linux64Gcc/choupoProps"
    names = argv or [p.stem for p in sorted(COMP.glob("*.dat"))
                     if re.search(r"(?m)^    unifacGroups\s*$", p.read_text())]
    bad = 0
    print(f"{'component':34s} {'gamma_inf in hexane':>20s} {'gamma_inf in water':>20s}")
    for c in names:
        out = []
        for solvent in ("nHexane", "water"):
            if c == solvent:
                out.append("--")
                continue
            g, why = gamma(binary, c, solvent)
            if g is None or not (LO < g < HI) or g != g:
                bad += 1
                out.append(f"BAD({why or g})")
            else:
                out.append(f"{g:.4g}")
        print(f"{c:34s} {out[0]:>20s} {out[1]:>20s}")
    print(f"{len(names)} components, {bad} value(s) outside ({LO:g}, {HI:g}) or missing")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
