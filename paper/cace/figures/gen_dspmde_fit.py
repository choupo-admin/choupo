#!/usr/bin/env python3
"""paper/cace/figures/gen_dspmde_fit.py -- the data of the article's DSPM-DE
panel (paper/cace/main.tex, Section "Nanofiltration"): the witness
tutorials/steady/membranes/membrane24_fit_then_simulate run in its
Properties & data mode (choupoProps), in a scratch copy, and the fit
operation's own default view `rejections` (postProcessing/
fit_NF270_FdL2021/rejections.csv: measured markers and model lines, one
series per dataset) rewritten as one CSV per salt.  Nothing is computed
here but 1 - R.

The dataset order is the evidence order of the case's system/propsDict:
1 NaCl, 2 MgCl2 (role fit), 3 Na2SO4, 4 MgSO4 (role validation).

    python3 -I paper/cace/figures/gen_dspmde_fit.py      (needs `make all`)
"""
import csv
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
CASE = ROOT / "tutorials" / "steady" / "membranes" / "membrane24_fit_then_simulate"
SALTS = {"1": ("NaCl", "fit"), "2": ("MgCl2", "fit"), "3": ("Na2SO4", "heldOut"), "4": ("MgSO4", "heldOut")}


def main():
    with tempfile.TemporaryDirectory() as tmp:
        cp = Path(tmp) / CASE.name
        shutil.copytree(CASE, cp, ignore=shutil.ignore_patterns("converged", "reports", "postProcessing"))
        r = subprocess.run([str(ROOT / "choupoProps"), str(cp)], cwd=ROOT, capture_output=True, text=True)
        if r.returncode != 0:
            sys.exit("membrane24 (props mode) did not run:\n" + (r.stdout + r.stderr)[-2000:])
        rows = list(csv.DictReader(open(cp / "postProcessing" / "fit_NF270_FdL2021" / "rejections.csv")))
    pts = {}
    for row in rows:
        kind = "exp" if row["series"].startswith("data") else "mod"
        salt, role = SALTS[row["series"][-1]]
        pts.setdefault(salt, {}).setdefault(row["x"], {})[kind] = float(row["y"])
    out = HERE.parent / "data"
    out.mkdir(exist_ok=True)
    for salt, by_x in pts.items():
        with open(out / ("dspmde_%s.csv" % salt), "w") as f:
            f.write("Jv,Rexp,Rmod,Texp,Tmod\n")
            for x in sorted(by_x, key=float):
                e, m = by_x[x]["exp"], by_x[x]["mod"]
                f.write("%.4f,%.6f,%.6f,%.6g,%.6g\n" % (float(x) * 1e6, e, m, 1 - e, 1 - m))
    print("wrote", ", ".join("dspmde_%s.csv" % s for s in pts))
    return 0


if __name__ == "__main__":
    sys.exit(main())
