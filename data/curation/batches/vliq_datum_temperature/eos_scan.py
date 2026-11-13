#!/usr/bin/env python3
"""Saturated-liquid molar volume of CO2, N2, CH4 and water from the engine's reference equations.

    python3 data/curation/batches/vliq_datum_temperature/eos_scan.py [CHOUPOPROPS] [SCRATCH_DIR]

Copies tutorials/props/thermo/refEoS01_iapws95_verification (which carries the four Helmholtz records) to
SCRATCH_DIR (default: a temporary directory), replaces its propsDict by one `referenceEoS` saturation
operation per (fluid, T), runs choupoProps there and prints V = M / rhoL in cm3/mol.  The tree is only
READ; nothing under the repository is written.  The molar masses are the ones the records use (CO2 44.0098,
N2 28.01348, CH4 16.0428, water 18.015268 g/mol).

Used for evidence.tsv: which temperature reproduces a stored Vliq (CO2 273 K, N2 and CH4 at Tb), and the
CO2 saturated volume at 298.15 K.  Saturation below the triple point is refused by the equation (CH4 91 K
is the lowest point asked; Poling's 90.68 K lies just below 90.694 K).
"""
import csv
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
FLUIDS = {
    "CO2": ("SpanWagner1996", 44.0098, [216.6, 250, 268, 270, 272, 273.15, 274, 276, 280, 298.15, 300]),
    "N2": ("Span2000", 28.01348, [65, 77.35, 78, 80, 85, 90, 100, 120]),
    "CH4": ("SetzmannWagner1991", 16.0428, [91, 95, 100, 105, 108, 111.66, 120, 150, 180]),
    "H2O": ("IAPWS95", 18.015268, [273.16, 298.15, 373.15]),
}


def main():
    exe = sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "choupoProps")
    work = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(tempfile.mkdtemp(prefix="eos_scan_"))
    case = work / "case"
    shutil.rmtree(case, ignore_errors=True)
    shutil.copytree(ROOT / "tutorials/props/thermo/refEoS01_iapws95_verification", case)
    shutil.rmtree(case / "expected", ignore_errors=True)
    p = case / "system/propsDict"
    head = p.read_text().split("\noperations\n(")[0]
    ops = ""
    for k, (eq, _, Ts) in FLUIDS.items():
        for T in Ts:
            n = f"{k}_{str(T).replace('.', 'p')}"
            ops += f"{{ name {n}; type referenceEoS; equation {eq}; saturation {{ T {T} K; }} output {{ file {n}.csv; }} }}\n"
    p.write_text(head + "\noperations\n(\n" + ops + ");\n")
    r = subprocess.run([exe, "."], cwd=case, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout[-800:], r.stderr[-800:])
        sys.exit(r.returncode)
    print("fluid\tT_K\tpsat_bar\trhoL_kg_m3\tV_cm3_mol")
    for k, (_, M, Ts) in FLUIDS.items():
        for T in Ts:
            f = case / f"{k}_{str(T).replace('.', 'p')}.csv"
            row = list(csv.DictReader(open(f)))[0]
            rho = float(row["rhoL"])
            print(f"{k}\t{T}\t{float(row['psat']) / 1e5:.4f}\t{rho:.3f}\t{M / rho * 1000:.3f}")


main()
