#!/usr/bin/env python3
"""Export NanoFiltran's numbers into the paper case's constant/reference/ --
the REFERENCE data its post-processing dictionary sets beside Choupo's.

    bin/curate/nanofiltran/export_case.py            # (re)write the case files
    bin/curate/nanofiltran/export_case.py --check    # FAIL (exit 1) if any is stale

WHY (2026-10-24, DEV.md 4c C147).  The case
tutorials/props/membrane/nanofiltran_geraldesAlves2008 generates the NanoFiltran
paper's tables and figures with its propsDict `views`, and a plot of Choupo against
NanoFiltran needs NanoFiltran's numbers IN the case: a case is self-contained,
and a reference a view reads lives under its constant/.  Their ONE home
stays here -- paper.tsv and fig4_profiles.tsv (regenerate_paper.py), reference.tsv
(regenerate.py), and the digitised Fig. 3 CSV the case already carries -- and the
case files are a DECLARED projection of them: re-keyed, never recomputed, except
the one conversion each file names in its header.  Pure Python; no gfortran.
bin/curate/check_postprocessing.py runs --check, so a reference that drifts from
its source fails there.

WHAT IS WRITTEN (constant/reference/ of the case):
  nanofiltran_table2.csv   Table 2 (the paper, transcribed) and NanoFiltran's runs at
                           its N (as received; Davies corrected) -- paper.tsv, table2
  nanofiltran_stiff.csv    the accounting of Table 2 at N = 350, one stage per row --
                           paper.tsv, table2 + stiff; the potential twice: as the
                           program prints it (R 8.314, F 96500) and in CODATA volts
  nanofiltran_fig4.csv     the N = 350 pore profiles, as received and corrected --
                           fig4_profiles.tsv
  nanofiltran_fig3.csv     NanoFiltran on Fig. 3's feeds: the paper's settings, the
                           converged matched run, and the paper's drawn line as read --
                           paper.tsv, fig3 + the digitised CSV's line readings
  bowenMohammad_fig3_byFeed.csv   the MEASURED R_obs of each experiment at its op's feed
                           (the mean of its two markers' c_Cl, regenerate_paper's rule)
                           -- the digitised CSV, re-keyed by op
  nanofiltran_codeToCode.csv      NanoFiltran's Richardson-extrapolated permeates on its
                           own matrix (part A) -- reference.tsv
"""
import argparse
import csv
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import regenerate as R            # noqa: E402  (pure Python readers; never builds here)
import regenerate_paper as rp     # noqa: E402

OUT = rp.CASE / "constant" / "reference"
PAPER = ("V. Geraldes, A.M. Brites Alves, J. Membr. Sci. 321 (2008) 172-182,"
         " doi:10.1016/j.memsci.2008.04.054")


def g(v):
    """A number as the source carries it: 12 significant figures, empty for None."""
    return "" if v is None else "%.12g" % float(v)


LICENCE = ["LICENCE: the paper's numbers here are FACTS, cited above (numbers, never the paper's",
           "  text or figures); the paper and its figures are the publisher's copyright and are not in",
           "  the tree.  NanoFiltran's own numbers are its output (MIT; bin/curate/nanofiltran/README.md)."]


def head(lines):
    return "".join("# " + l.rstrip() + "\n" for l in lines + LICENCE)


def table(rows, cols):
    return ",".join(cols) + "\n" + "".join(",".join(str(r[c]) for c in cols) + "\n" for r in rows)


def paper_rows():
    return {(r["section"], r["variant"], r["key"], r["quantity"]): r for r in rp.read_table()}


def exp_table2(T):
    rows = []
    for N, *_ in rp.PAPER_TABLE2:
        for v in ("paper", "asReceived", "daviesPatched"):
            q = {k: T[("table2", v, str(N), k)] for k in ("Na", "Mg", "Cl", "dPsi_m_V")}
            rows.append(dict(N=N, variant=v, Na_molm3=g(q["Na"]["value"]),
                             Mg_molm3=g(q["Mg"]["value"]), Cl_molm3=g(q["Cl"]["value"]),
                             dPsi_m_V=g(q["dPsi_m_V"]["value"]),
                             iterations=q["Na"]["iterations"]))
    return head([
        "Table 2 of the NanoFiltran paper -- " + PAPER + " (publisher's copyright; the",
        "  numbers are cited facts) -- and NanoFiltran's own runs at its N.  variant paper: the",
        "  table as published, transcribed; asReceived: the program as published, on its shipped",
        "  inputs and the paper's numerics (URF 0.2, TOL 1e-4); daviesPatched: the same with its",
        "  Davies constant corrected (ln 10).  N is NanoFiltran's (it counts the permeate node).",
        "  Concentrations mol/m3 (permeate); dPsi_m_V as the program prints it (R 8.314, F 96500).",
        "WRITTEN by bin/curate/nanofiltran/export_case.py from bin/curate/nanofiltran/paper.tsv",
        "  (section table2) -- DO NOT EDIT; rerun the exporter.",
    ]) + table(rows, ["N", "variant", "Na_molm3", "Mg_molm3", "Cl_molm3", "dPsi_m_V", "iterations"])


STAGES = [
    ("paper",           ("table2", "paper", "350")),
    ("asReceived",      ("table2", "asReceived", "350")),
    ("daviesCorrected", ("table2", "daviesPatched", "350")),
    ("matchedD",        ("stiff", "daviesPatched_matchedD_tol1e-4", "350")),
    ("bornCodata",      ("stiff", "daviesBorn_tol1e-4", "350")),
    ("converged",       ("stiff", "daviesBorn_tol1e-9", "350")),
    ("corrected",       ("stiff", "daviesBorn_ext", "102/204")),
]


def exp_stiff(T):
    rows = []
    for stage, (sec, var, key) in STAGES:
        q = {k: float(T[(sec, var, key, k)]["value"]) for k in ("Na", "Mg", "Cl", "dPsi_m_V")}
        rows.append(dict(stage=stage, Na_molm3=g(q["Na"]), Mg_molm3=g(q["Mg"]),
                         Cl_molm3=g(q["Cl"]), dPsi_m_V=g(q["dPsi_m_V"]),
                         dPsi_m_Vcodata=g(q["dPsi_m_V"] * rp.VOLT_CODATA)))
    return head([
        "Table 2 of the NanoFiltran paper at N = 350, accounted for ONE CHANGE AT A TIME -- " ,
        "  " + PAPER + ".  Each stage is a NanoFiltran run (paper.tsv) adding one",
        "  change to the one before: paper = the table as published; asReceived = the program as",
        "  published; daviesCorrected = + its Davies constant corrected (ln 10); matchedD = + its",
        "  D input matched (Vogel, K_d literals); bornCodata = + its Born constant in CODATA values;",
        "  converged = + TOL 1e-4 -> 1e-9; corrected = + grid extrapolated (Richardson, ND 102/204)",
        "  -- the code-to-code reference Choupo's anchors carry.  Concentrations mol/m3; dPsi_m_V as",
        "  the program prints it (R 8.314, F 96500), dPsi_m_Vcodata the same x %.16g (CODATA R, F)." % rp.VOLT_CODATA,
        "WRITTEN by bin/curate/nanofiltran/export_case.py from bin/curate/nanofiltran/paper.tsv",
        "  -- DO NOT EDIT; rerun the exporter.",
    ]) + table(rows, ["stage", "Na_molm3", "Mg_molm3", "Cl_molm3", "dPsi_m_V", "dPsi_m_Vcodata"])


def exp_fig4():
    rows = rp.read_profiles()
    for r in rows:
        for c in rp.PROFILE_COLS[2:]:
            r[c] = g(r[c])
    return head([
        "Fig. 4 of the NanoFiltran paper -- " + PAPER + " -- node by node: the",
        "  N = 350 pore profiles NanoFiltran computes on the stiff case (section 4.2), the feed",
        "  face to the permeate face, x across the equivalent thickness dx_e = 2.5 um.  variant",
        "  asReceived: the program as published (what Fig. 4 draws); corrected: its Davies and Born",
        "  constants corrected, its D input matched, converged to TOL 1e-9.  Concentrations mol/m3;",
        "  psi in CODATA volts (the program's x %.16g)." % rp.VOLT_CODATA,
        "WRITTEN by bin/curate/nanofiltran/export_case.py from bin/curate/nanofiltran/fig4_profiles.tsv",
        "  -- DO NOT EDIT; rerun the exporter.",
    ]) + table(rows, rp.PROFILE_COLS)


def _marks():
    """The digitised markers keyed (op, ion), regenerate_paper's pairing rule."""
    rows = [r for r in csv.DictReader(l for l in open(rp.FIG3_CSV) if not l.startswith("#"))]
    marks = {}
    for dye in sorted({float(r["dye_molm3"]) for r in rows}):
        for ion in ("Na", "Cl"):
            rs = sorted((r for r in rows if float(r["dye_molm3"]) == dye and r["ion"] == ion),
                        key=lambda r: float(r["cCl_molm3"]))
            for k, r in enumerate(rs, 1):
                marks[("dye%g_p%d" % (dye, k), ion)] = r
    return marks


def exp_fig3(T):
    marks = _marks()
    rows = []
    for dye, k, cl in rp.fig3_experiments():
        op = "dye%g_p%d" % (dye, k)
        cb = {"Na": cl + 3.0 * dye, "Cl": cl}
        r = dict(op=op, dye_molm3=g(dye), cCl_molm3=g(cl))
        for ion in ("Na", "Cl"):
            r["Robs_" + ion] = g(T[("fig3", "paperSettings", op, "Robs_" + ion)]["value"])
            cp = float(T[("fig3", "matched_ext", op, "cperm_" + ion)]["value"])
            r["Robs_converged_" + ion] = g(1.0 - cp / cb[ion])
            line = marks[(op, ion)]["Robs_NanoFiltran_line"]
            r["Robs_line_" + ion] = g(line) if line else ""
        rows.append(r)
    return head([
        "NanoFiltran on Fig. 3 of its paper -- " + PAPER + ", section 4.1 (Bowen & Mohammad's",
        "  CA30 case) -- at the feed of each measurement (the mean of its two markers' c_Cl).",
        "  Robs_<ion>: the program with the paper's settings (ND 20, URF 0.2, TOL 1e-4; Fig. 3's",
        "  solid line); Robs_converged_<ion>: matched inputs, ND 102/204 extrapolated, TOL 1e-9,",
        "  as 1 - c_p/c_b; Robs_line_<ion>: the paper's drawn line as digitised under the marker",
        "  (empty where the line does not reach it).  c in mol/m3, R_obs dimensionless.",
        "WRITTEN by bin/curate/nanofiltran/export_case.py from bin/curate/nanofiltran/paper.tsv",
        "  (section fig3) and constant/experimental/geraldes_alves2008_fig3.csv -- DO NOT EDIT.",
    ]) + table(rows, ["op", "dye_molm3", "cCl_molm3", "Robs_Na", "Robs_Cl", "Robs_converged_Na",
                      "Robs_converged_Cl", "Robs_line_Na", "Robs_line_Cl"])


def exp_fig3_by_feed():
    marks = _marks()
    rows = []
    for dye, k, cl in rp.fig3_experiments():
        op = "dye%g_p%d" % (dye, k)
        r = dict(op=op, dye_molm3=g(dye), cCl_molm3=g(cl))
        for ion in ("Na", "Cl"):
            r["Robs_" + ion] = g(marks[(op, ion)]["Robs_exp"])
            r["dRobs_" + ion] = g(marks[(op, ion)]["dRobs"])
        rows.append(r)
    return head([
        "Bowen & Mohammad's MEASURED observed rejections on CA30 (AIChE J. 44 (1998) 1799), as",
        "  Fig. 3 of " + PAPER + " plots them --",
        "  constant/experimental/geraldes_alves2008_fig3.csv RE-KEYED by experiment: one row per",
        "  measurement at its op's feed c_Cl (the mean of its Na+ and Cl- markers' readings), the",
        "  values and reading errors unchanged.  R_obs dimensionless, c in mol/m3.",
        "WRITTEN by bin/curate/nanofiltran/export_case.py -- DO NOT EDIT; rerun the exporter.",
    ]) + table(rows, ["op", "dye_molm3", "cCl_molm3", "Robs_Na", "dRobs_Na", "Robs_Cl", "dRobs_Cl"])


def exp_code_to_code():
    ions = ("Na", "Mg", "Cl", "SO4")
    by = {}
    for r in R.read_reference():
        key = (r["op"], r["point"])
        row = by.setdefault(key, dict(op=r["op"], point=r["point"], Jv_mps=g(r["Jv"]),
                                      **{"cperm_%s_molm3" % i: "" for i in ions},
                                      **{"Robs_%s" % i: "" for i in ions}))
        row["cperm_%s_molm3" % r["ion"]] = g(r["cp_ext"])
        row["Robs_%s" % r["ion"]] = g(r["Robs_ext"])
    rows = [by[k] for k in by]
    return head([
        "NanoFiltran on its own matrix (" + PAPER + "): the permeate of every ion,",
        "  Richardson-extrapolated from ND 102 and 204 -- the code-to-code reference of part A,",
        "  the SAME numbers the case's anchor rows carry.  One row per op and J_v point; an ion",
        "  the op's feed does not carry is empty.  c mol/m3, J_v m/s, R_obs = 1 - c_p/c_b.",
        "WRITTEN by bin/curate/nanofiltran/export_case.py from bin/curate/nanofiltran/reference.tsv",
        "  -- DO NOT EDIT; rerun the exporter.",
    ]) + table(rows, ["op", "point", "Jv_mps"] + ["cperm_%s_molm3" % i for i in ions]
               + ["Robs_%s" % i for i in ions])


def files():
    T = paper_rows()
    return {
        "nanofiltran_table2.csv": exp_table2(T),
        "nanofiltran_stiff.csv": exp_stiff(T),
        "nanofiltran_fig4.csv": exp_fig4(),
        "nanofiltran_fig3.csv": exp_fig3(T),
        "bowenMohammad_fig3_byFeed.csv": exp_fig3_by_feed(),
        "nanofiltran_codeToCode.csv": exp_code_to_code(),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    want = files()
    if a.check:
        bad = [n for n, text in want.items()
               if not (OUT / n).is_file() or (OUT / n).read_text() != text]
        extra = sorted(p.name for p in OUT.glob("*") if p.name not in want) if OUT.is_dir() else []
        if bad or extra:
            print("export_case.py: FAILED -- stale or missing: %s; not the exporter's: %s"
                  % (", ".join(bad) or "none", ", ".join(extra) or "none"))
            return 1
        print("export_case.py: OK -- %d reference files of the case equal their export" % len(want))
        return 0
    OUT.mkdir(parents=True, exist_ok=True)
    for n, text in want.items():
        (OUT / n).write_text(text)
    print("export_case.py: wrote %d files into %s" % (len(want), OUT.relative_to(rp.ROOT)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
