#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the engine's COSMO-SAC LVPP-HFTZVP-2018 reproduces the SELECTION.

DEV.md 4c C310; record docs/design/cosmo-sac-lvpp-hftzvp-2018.md.

WHAT IT HOLDS.  Ferrarini, Flores, Muniz & Soares (AIChE J. 64 (2018) 3443)
give the HF/TZVP constants of the variant but leave two choices open (the
decay of the charge averaging; the area inside alpha').  The four readings
were run OUTSIDE the engine, in an independent Python implementation of the
2002 equations over the LVPP 18.07 profiles, against the measured activity
coefficients at infinite dilution of Lin & Sandler, Ind. Eng. Chem. Res. 41
(2002) 899, Table 2 ("expt" columns: 32 solutes in water and 18 in n-hexane,
298.15 K).  One reading was plausible and was SELECTED; its mean absolute
deviations in ln gamma-inf are recorded below.  This gate runs the witness
tutorials/props/molecular/cosmoSAC02_lvpp_selection_lin2002 through
choupoProps and holds the ENGINE's deviations equal to those, within 1e-3.

So it proves two things and only two: that the engine implements the reading
that was selected (constants, equations, profile protocol), and that the
shipped profiles are the ones the selection used.  It does NOT prove the
variant predicts anything -- the data chose the reading.  The held-out test is
bin/curate/cosmo_lvpp_vs_nrtl.py, on the catalogue NRTL pairs' own bubble
points, which this table never touched.

THE NUMBERS QUOTED BELOW are measured values from Lin & Sandler 2002 Table 2,
cited; they are test data for this gate, not catalogue values.

SABOTAGES (2026-11-11, by hand on the witness, restored by copy):
  S1  the witness's water.dat LVPP set: its largest sigmaProfile bin * 1.1
      -> FAILED "water: engine 1.102664 vs selection 0.992776" (numbers of the
      first draft, before the area became the profile's own sum)
  S2  (negative) the tree as shipped -> OK, the engine within 6e-7 of the
      outside computation.
  The engine's own refusals were sabotaged the same day on a scratch copy:
  protocol "f_decay 1.0" -> "declares protocol ...; these constants were
  fitted to profiles built as ..."; the LVPP set relabelled "2002" -> "is
  labelled variant 2002 but its profile declares a foreign protocol".
  NOT sabotaged: an engine constant (needs a rebuild of src/; the S1 profile
  arm exercises the same comparison).
"""
import csv
import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from gate_prereq import require_solver  # noqa: E402

CASE = ROOT / "tutorials/props/molecular/cosmoSAC02_lvpp_selection_lin2002"
PROPS = ROOT / "choupoProps"
TOL = 1.0e-3

#  Lin & Sandler 2002 Table 2, expt ln gamma-inf at 298.15 K (Choupo names).
WATER = {"nButane": 9.99, "nPentane": 11.55, "nHexane": 13.13, "nHeptane": 14.46,
         "nOctane": 16.08, "cyclohexane": 11.31, "1Hexene": 11.38,
         "diethylEther": 4.70, "tetrahydrofuran": 2.83, "14Dioxane": 1.69,
         "ethylamine": -0.99, "triethylamine": 4.21, "acetone": 1.95,
         "methylEthylKetone": 3.24, "butanal": 3.88, "methylAcetate": 3.12,
         "ethylAcetate": 4.18, "nitromethane": 3.45, "nitroethane": 4.48,
         "1Nitropropane": 5.70, "acetonitrile": 2.41, "propionitrile": 3.63,
         "ethanol": 1.34, "1Propanol": 2.65, "nButanol": 3.98, "aceticAcid": 1.06,
         "benzene": 7.82, "pyridine": 2.99, "aniline": 4.99, "chloroform": 6.81,
         "carbonTetrachloride": 9.24, "Dichloroethane": 6.46}
HEXANE = {"nHeptane": -0.03, "nOctane": 0.08, "cyclohexane": 0.13, "14Dioxane": 1.39,
          "acetone": 1.90, "methylEthylKetone": 1.51, "ethylAcetate": 1.23,
          "nitromethane": 3.68, "nitroethane": 2.99, "1Nitropropane": 2.65,
          "acetonitrile": 3.32, "propionitrile": 2.92, "ethanol": 4.01,
          "1Propanol": 3.76, "nButanol": 3.59, "chloroform": 0.48,
          "carbonTetrachloride": 0.17, "Dichloroethane": 1.15}

#  The SELECTION, computed outside the engine by bin/curate/cosmo_lvpp_readings.py
#  --subset (numpy only, f_decay 3.57 with d in A, alpha' on pi r_eff^2, on the
#  same 18.07 files, the area taken as the profile's own sum), 2026-11-11.
SELECTED = {"water": 0.993786, "hexane": 0.403765, "all": 0.781379}


def first_row(csvfile):
    rows = list(csv.DictReader(l for l in csvfile.open() if not l.startswith("#")))
    r = rows[0]
    T = float(r.get("T") or r.get("T_K") or next(iter(r.values())))
    if abs(T - 298.15) > 1e-6:
        raise ValueError(f"{csvfile.name}: first row is T = {T}, expected 298.15 K")
    return r


def lngamma(row, comp):
    for k in (f"gamma_{comp}", f"gamma_{comp} [-]"):
        if k in row:
            return math.log(float(row[k]))
    hit = [k for k in row if k.split(" ")[0] == f"gamma_{comp}"]
    if hit:
        return math.log(float(row[hit[0]]))
    raise KeyError(f"no gamma_{comp} column")


def main() -> int:
    require_solver(PROPS, "choupoProps")
    with tempfile.TemporaryDirectory(prefix="cosmo-lvpp-sel-") as tmp:
        case = Path(tmp) / CASE.name
        shutil.copytree(CASE, case)
        p = subprocess.run([str(PROPS), "."], cwd=case, capture_output=True,
                           text=True, timeout=600)
        if p.returncode != 0:
            print("check_cosmo_lvpp_selection: FAILED\n  the witness did not run "
                  f"(exit {p.returncode})\n" + (p.stdout + p.stderr)[-1500:])
            return 1
        if "selected among the four" not in (p.stdout + p.stderr).replace("SELECTED", "selected"):
            print("check_cosmo_lvpp_selection: FAILED\n  the run did not ANNOUNCE "
                  "that its reading was selected on Lin & Sandler Table 2 -- the "
                  "honesty condition of C310 is that every run says so")
            return 1
        rw = first_row(case / "in_water.csv")
        rh = first_row(case / "in_hexane.csv")
        ew = [lngamma(rw, c) - v for c, v in WATER.items()]
        eh = [lngamma(rh, c) - v for c, v in HEXANE.items()]
    got = {"water": sum(map(abs, ew)) / len(ew), "hexane": sum(map(abs, eh)) / len(eh),
           "all": sum(map(abs, ew + eh)) / len(ew + eh)}
    bad = [f"{k}: engine {got[k]:.6f} vs selection {SELECTED[k]:.6f}"
           for k in SELECTED if abs(got[k] - SELECTED[k]) > TOL]
    if bad:
        print("check_cosmo_lvpp_selection: FAILED\n  the engine does not reproduce "
              "the selected reading (tolerance 1e-3 in mean |d ln gamma-inf|):\n    "
              + "\n    ".join(bad))
        return 1
    print(f"check_cosmo_lvpp_selection: OK -- the engine's COSMO-SAC "
          f"LVPP-HFTZVP-2018 reproduces the selected reading: mean |d ln gamma-inf| "
          f"vs Lin & Sandler 2002 Table 2 = {got['water']:.4f} in water ({len(ew)}), "
          f"{got['hexane']:.4f} in n-hexane ({len(eh)}), {got['all']:.4f} overall "
          f"(the outside computation: {SELECTED['water']:.4f} / {SELECTED['hexane']:.4f}"
          f" / {SELECTED['all']:.4f}).  SELECTION DATA, NOT VALIDATION: this table "
          "chose the reading; the held-out test is bin/curate/cosmo_lvpp_vs_nrtl.py.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
