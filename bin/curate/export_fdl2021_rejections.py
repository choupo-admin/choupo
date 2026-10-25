#!/usr/bin/env python3
"""Write the dominant-salt rejections of Fernandez de Labastida & Yaroshchuk
(2021) as the four datasets membrane24_fit_then_simulate fits and holds out.

    bin/curate/export_fdl2021_rejections.py [--check]

SOURCE.  M. Fernandez de Labastida, A. Yaroshchuk, "Nanofiltration of
Multi-Ion Solutions: Quantitative Control of Concentration Polarization and
Interpretation by Solution-Diffusion-Electro-Migration Model", Membranes 11
(2021) 272, doi:10.3390/membranes11040272 -- CC BY 4.0.  NF270 flat disc in a
rotating-disk cell, 20 C, dominant salt 0.01 mol/L (NaCl, MgCl2, Na2SO4,
MgSO4) with 2e-4 mol/L traces of NaNO3 and NH4Cl; the rejections are
INTRINSIC (corrected by the authors for concentration polarisation).

THE NUMBERS ARE NOT READ HERE.  They are the (a) panels of the paper's
Figures 1-4 as bin/curate/digitise_fdl2021.py read them into
membrane12_sdem_nf270_nacl_traces/constant/experimental/fdl2021_figures.csv
(the one committed home of that reading); this script only RE-EXPRESSES the
dominant-salt symbols in the dataset grammar a fit reads:
    R  = 1 - 1/f              (f = 1/(1 - R), the reciprocal transmission
                               the figures plot)
    Jv = J_v[um/s] x 1e-6     (m/s)
The reading error of f (`df`) is a READING error, not a measurement
uncertainty -- the authors publish none -- so it is written into each file's
header as a comment and NOT as a sigma column: a fit weighted by it would
weight a reading, not an experiment.

WHAT IS LEFT OUT, said plainly: the 2e-4 mol/L trace salts.  They are 2 % of
the dominant salt's concentration; each dataset declares the dominant salt
alone as its feed, and a reader comparing with the paper must know it.

--check re-derives the four files and exits 1 when any differs from the
committed one.
"""
import argparse
import csv
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "tutorials", "steady", "membranes",
                   "membrane12_sdem_nf270_nacl_traces", "constant", "experimental",
                   "fdl2021_figures.csv")
DEST = os.path.join(ROOT, "tutorials", "steady", "membranes",
                    "membrane24_fit_then_simulate", "constant", "experimental")
PANELS = {"NaCl": "g001a", "MgCl2": "g002a", "Na2SO4": "g003a", "MgSO4": "g004a"}
FIGURE = {"NaCl": "1a", "MgCl2": "2a", "Na2SO4": "3a", "MgSO4": "4a"}


def render(salt, pts):
    out = []
    out.append("/*--------------------------------------------------------------------------*\\")
    out.append(f"  NF270 INTRINSIC REJECTION OF {salt} AGAINST THE PERMEATE FLUX -- a dataset")
    out.append("  a membrane fit reads (fitParameters, residual kind membrane).")
    out.append("")
    out.append("  Fernandez de Labastida & Yaroshchuk, Membranes 11 (2021) 272,")
    out.append(f"  doi:10.3390/membranes11040272 (CC BY 4.0), Figure {FIGURE[salt]}: the measured")
    out.append(f"  symbols, {salt} 0.01 mol/L, 20 C, flat NF270 in a rotating-disk cell, CP-")
    out.append("  corrected by the authors.  Digitised by bin/curate/digitise_fdl2021.py;")
    out.append("  written in this grammar by bin/curate/export_fdl2021_rejections.py")
    out.append("  (R = 1 - 1/f, Jv = J_v[um/s] x 1e-6).")
    out.append("")
    out.append("  READING ERROR (not a measurement uncertainty -- none is published):")
    for p in pts:
        out.append(f"    J_v {p['jv']:>7} um/s +- {p['djv']}   f {p['f']} +- {p['df']}")
    out.append("")
    out.append("  NOT IN THE FEED BELOW: the 2e-4 mol/L NaNO3 + NH4Cl traces the authors")
    out.append("  added (2 % of the dominant salt).  The role this dataset plays -- fit or")
    out.append("  held out -- is declared by the operation that reads it, never here.")
    out.append("\\*--------------------------------------------------------------------------*/")
    out.append("")
    out.append("property     membrane.rejection;")
    out.append("membrane     NF270;")
    out.append("")
    out.append("provenance")
    out.append("{")
    out.append("    source       measured;")
    out.append("    reviewStatus digitisedFromFigure;")
    out.append("    citation     \"M. Fernandez de Labastida, A. Yaroshchuk, Nanofiltration of Multi-Ion"
               f" Solutions: Quantitative Control of Concentration Polarization and Interpretation by"
               f" Solution-Diffusion-Electro-Migration Model, Membranes 11 (2021) 272, Figure"
               f" {FIGURE[salt]}\";")
    out.append("    doi          \"10.3390/membranes11040272\";")
    out.append("    licence      CC-BY-4.0;")
    out.append("}")
    out.append("")
    out.append("T            293.15 K;")
    out.append(f"feed         {{ {salt} 10 mol/m3; }}")
    out.append("")
    out.append("columns")
    out.append("(")
    out.append("    { name Jv;  unit m/s; }")
    out.append(f"    {{ name R_{salt};  unit -; }}")
    out.append(");")
    out.append("")
    out.append("data")
    out.append("(")
    for p in pts:
        jv = float(p["jv"]) * 1e-6
        r = 1.0 - 1.0 / float(p["f"])
        out.append(f"    {jv:.6e}  {r:.6f}")
    out.append(");")
    return "\n".join(out) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    rows = []
    with open(SRC) as fh:
        lines = [l for l in fh if not l.startswith("#")]
    hdr = ["figure", "salt", "series", "axis", "Jv_umps", "dJv_umps", "f_exp", "df",
           "f_line", "quality", "px_x", "px_y", "bbox"]
    for rec in csv.reader(lines):
        if rec:
            rows.append(dict(zip(hdr, rec)))
    bad = 0
    os.makedirs(DEST, exist_ok=True)
    for salt, panel in PANELS.items():
        pts = [dict(jv=r["Jv_umps"], djv=r["dJv_umps"], f=r["f_exp"], df=r["df"])
               for r in rows if r["figure"] == panel and r["series"] == salt]
        if not pts:
            print(f"export_fdl2021_rejections: no {salt} symbols in {SRC}", file=sys.stderr)
            return 1
        text = render(salt, pts)
        path = os.path.join(DEST, f"fdl2021_{salt}.dat")
        if a.check:
            if not os.path.exists(path) or open(path).read() != text:
                print(f"export_fdl2021_rejections: {path} differs from its derivation")
                bad += 1
        else:
            with open(path, "w") as fh:
                fh.write(text)
            print(f"wrote {os.path.relpath(path, ROOT)} ({len(pts)} points)")
    if a.check:
        print("export_fdl2021_rejections: OK -- the four datasets re-derive from the digitised"
              " figures" if not bad else "export_fdl2021_rejections: STALE")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
