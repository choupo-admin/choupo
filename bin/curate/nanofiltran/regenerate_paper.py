#!/usr/bin/env python3
"""Run NanoFiltran on the two comparisons of its own paper and write what it
gives -- the reference numbers of the C145 case
tutorials/props/membrane/nanofiltran_geraldesAlves2008 (the paper's two
comparisons, its section 4.1 and 4.2; DEV.md 4c C145, merged into one case per
paper by C147).

    bin/curate/nanofiltran/regenerate_paper.py            # run, print, compare
    bin/curate/nanofiltran/regenerate_paper.py --write    # (re)write paper.tsv
                                                          # and fig4_profiles.tsv
    bin/curate/nanofiltran/regenerate_paper.py --check    # REFUSE (exit 2)
                                                          # without gfortran;
                                                          # FAIL (exit 1) if a
                                                          # number moved

THE PAPER.  V. Geraldes, A.M. Brites Alves, "Computer program for simulation
of mass transport in nanofiltration membranes", J. Membr. Sci. 321 (2008)
172-182, doi:10.1016/j.memsci.2008.04.054 -- publisher's copyright, NOT in the
tree.  Two numbers sets are taken from it, cited, as facts: Table 2 (below,
PAPER_TABLE2, transcribed) and Fig. 3 (digitised by
bin/curate/digitise_geraldes_alves2008.py into the case's
constant/experimental/geraldes_alves2008_fig3.csv).

FIG. 4'S WHOLE PROFILE (DEV.md 4c C147).  paper.tsv carries the profile's two
faces; fig4_profiles.tsv carries every node of the two N = 350 profiles the
case's post-processing draws against Choupo's -- the as-received program on
the paper's inputs (what Fig. 4 shows) and the corrected one (daviesBorn,
matched D, TOL 1e-9) -- the potential in CODATA volts (x VOLT_CODATA).

WHAT IT RUNS (NanoFiltran src/ as received, built in a temporary directory;
src/ is never edited), every variant built from the SAME source with the
patches named, each patch a declared line replacement that must match
exactly once:

  ARRAY_PATCH (every build here): NDX 205 -> 351 in the six PARAMETER lines.
    The vendored program caps the grid at 205 nodes; Table 2 runs N = 300 and
    350, so the paper's own build carried a larger array.  An array bound,
    not a model: measured on 2026-10-24, the as-received program built with
    and without it gives the same permeate, potential and iteration count
    to every printed digit at N = 10, 50 and 200.

  asReceived    -- the program as published.  Run on the SHIPPED INPUT.XLS
    and IONS.XLS (the paper's section 4.2 case is the shipped example) with
    the paper's numerical settings (URF 0.2, TOL 1e-4) at Table 2's N.  It
    reproduces Table 2: the iteration counts exactly, Mg2+, Cl- and the
    potential to 2e-6, the trace Na+ to 2.6e-5 (section 13 of
    docs/design/a-stiff-pore-solved-at-once.md).

  daviesPatched -- DAVIES_PATCH (regenerate.py): ln 10 restored in the two
    lines that compute the Davies A.  The as-received program evaluates
    Davies as exp() of the log10 constant (README.md, the Davies finding);
    so does the paper's own Eq. 12-13 (ln gamma with the A of Eq. 13, which
    carries the ln 10 of a log10 constant), and Table 2 carries it.

  daviesBorn    -- DAVIES_PATCH and BORN_PATCH: the Born constant written as
    the CODATA e^2 N_A/(8 pi eps0) over CODATA R (x 8.314/R, because the
    program divides by its own 8.314).  This is the code-to-code reference:
    regenerate.py matches the Born constant through the pore dielectric
    INPUT instead, which would here also move the pore-side Davies A by 2e-4
    (the Davies op of nanofiltran01 runs Born off for that reason); with
    Davies AND Born on, the constant is the one place to match it.  Run with
    the matched IONS (regenerate.py's rule at this T: D divided by the Vogel
    factor, times K_d(double)/K_d(single)).

THE FIG. 3 CASE (section 4.1: Na+/Cl-/Dye3- on CA30, ideal activities,
eps_p = eps_b, stirred cell Sh = 0.23 Re^0.567 Sc^0.33, Re 26 900, L 0.024 m,
c_X from Eq. 43, J_v from Eqs. 44-45) is run by asReceived at each measured
feed, twice: with the paper's settings (ND 20, URF 0.2, TOL 1e-4 -- "the
NanoFiltran prediction" of Fig. 3) and converged on matched inputs (ND 102
and 204, URF 0.1, TOL 1e-9, Richardson-extrapolated) as the code-to-code
reference.  The feed of an experiment is its two markers' mean c_Cl (the Na+
and Cl- symbols of one measurement sit at one feed; their digitised x differ
by reading error only).

Without gfortran this REFUSES (exit 2): a check that cannot run must not
pass.  The cases' gate (bin/curate/check_nanofiltran_paper.py) does not need
it -- it holds Choupo to the committed paper.tsv.
"""
import argparse
import csv
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))
import regenerate as R  # noqa: E402

PAPER_TSV = HERE / "paper.tsv"
PROFILES_TSV = HERE / "fig4_profiles.tsv"
CASE = ROOT / "tutorials" / "props" / "membrane" / "nanofiltran_geraldesAlves2008"
FIG3_CSV = CASE / "constant" / "experimental" / "geraldes_alves2008_fig3.csv"
#  NanoFiltran's volts (R 8.314, F 96500) -> CODATA volts.
VOLT_CODATA = (8.314462618 / 96485.33212) / (8.314 / 96500.0)

#  TABLE 2 of the paper ("Grid-independence study"), transcribed: N, permeate
#  Na+, Mg2+, Cl- [mol/m3], Delta Psi_m [V], iterations.
PAPER_TABLE2 = [
    (10,  0.0367468, 8.634545, 17.305819, 0.149227, 71),
    (20,  0.0460774, 8.605800, 17.257671, 0.149651, 75),
    (50,  0.0480736, 8.599753, 17.247577, 0.149740, 79),
    (100, 0.0483219, 8.599001, 17.246324, 0.149751, 82),
    (200, 0.0483809, 8.598822, 17.246025, 0.149753, 85),
    (300, 0.0483915, 8.598790, 17.245971, 0.149754, 87),
    (350, 0.0483937, 8.598782, 17.245959, 0.149754, 88),
]
T_STIFF = 298.0
RP_STIFF = 4.0e-10
RP_CA30 = 6.3e-10
NDX_NEW = 351

ARRAY_PATCH = ("NDX=205", "NDX=%d" % NDX_NEW, 6)
BORN_OLD = "         DH= 6.95E-5*Z(IC)**2/RS(IC)*(1./EMEMB-1./EWATER)"
BORN_NEW = ("         DH= %s*Z(IC)**2/RS(IC)*(1./EMEMB-1./EWATER)"
            % ("%.12E" % (R.CODATA_BORN * 8.314 / 8.314462618)).replace("E", "D"))

#  The Fig. 3 inputs: the paper's Eqs. 43-45 and section 4.1.
def cx_eq43(dye, cl):
    return -9.03 - 3.29 * (3.0 * dye + cl)


def jv_eq44_45(dye, cl):
    if dye == 4.0:
        return 9.91e-6 * (1.0 - 0.0011 * cl)
    if dye == 37.0:
        return 4.13e-6 * (1.0 + 0.00981 * cl - 0.0000746 * cl * cl)
    raise ValueError("Eqs. 44-45 are given for 4 and 37 mol/m3 of dye only")


SH = (0.23, 0.567, 0.33)
RE_CELL = 26900.0
L_CELL = 0.024


# ---------------------------------------------------------------- build
def build(workdir, variant):
    d = Path(workdir) / variant
    d.mkdir(parents=True, exist_ok=True)
    for f in ("NANOFILTRAN.F", "LINEAR.F", "SIMPLEX.F"):
        shutil.copyfile(R.SRC / f, d / f)
    text = (d / "NANOFILTRAN.F").read_bytes().decode("latin-1")
    patches = [ARRAY_PATCH]
    if variant in ("daviesPatched", "daviesBorn"):
        patches += [(o, n, 1) for o, n in R.DAVIES_PATCH]
    if variant == "daviesBorn":
        patches.append((BORN_OLD, BORN_NEW, 1))
    for old, new, n in patches:
        if text.count(old) != n:
            raise SystemExit("regenerate_paper: patch line found %d times, not %d: %s"
                             % (text.count(old), n, old.strip()))
        text = text.replace(old, new)
    (d / "NANOFILTRAN.F").write_bytes(text.encode("latin-1"))
    subprocess.run(["gfortran", *R.FLAGS, "NANOFILTRAN.F", "-o", "nanofiltran"],
                   cwd=d, check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    return d / "nanofiltran"


# ---------------------------------------------------------------- inputs
def ions_matched(T, rp):
    """shipped/IONS.XLS with each D matched (regenerate.py's rule at T, rp)."""
    out = []
    for line in (R.SHIPPED / "IONS.XLS").read_bytes().split(b"\r\n"):
        f = line.split(b"\t")
        if len(f) > 4 and f[0].strip().isdigit() and float(f[4]) > 0:
            lam = float(f[3]) / rp
            k = R.kd_dd2006(lam) / R.kd_dd2006(lam, R.f32) if lam < 1 else 1.0
            f[4] = R.fmt(float(f[4]) / R.vogel_factor(T) * k)
        out.append(b"\t".join(f))
    return b"\r\n".join(out)


def stiff_input(nd, urf, tol, itmax):
    """The SHIPPED example (the paper's section 4.2 case), numerics only changed."""
    L = (R.SHIPPED / "INPUT.XLS").read_bytes().split(b"\r\n")
    R.setvals(L, 5, [str(nd).encode()])
    R.setvals(L, 7, [urf])
    R.setvals(L, 8, [str(itmax).encode()])
    R.setvals(L, 9, [b"0"])
    R.setvals(L, 10, [tol])
    return b"\r\n".join(L)


def bm_input(dye, cl, nd, urf, tol, itmax):
    """The shipped example with section 4.1's case written into its value cells."""
    L = (R.SHIPPED / "INPUT.XLS").read_bytes().split(b"\r\n")
    R.setvals(L, 5, [str(nd).encode()])
    R.setvals(L, 6, [1.0])
    R.setvals(L, 7, [urf])
    R.setvals(L, 8, [str(itmax).encode()])
    R.setvals(L, 9, [b"0"])
    R.setvals(L, 10, [tol])
    R.setvals(L, 13, [cx_eq43(dye, cl)])
    R.setvals(L, 14, [RP_CA30])
    R.setvals(L, 15, [6.2e-6])
    R.setvals(L, 16, [80.0])                       # eps_p = eps_b: no Born term
    R.setvals(L, 19, [T_STIFF])
    R.setvals(L, 20, [jv_eq44_45(dye, cl)])
    R.setvals(L, 21, [b"3"])
    R.setvals(L, 22, [b"3", b"102", b"190"], width=8)   # Na+, Cl-, DYE3-
    R.setvals(L, 23, [cl + 3.0 * dye, cl, dye], width=8)
    R.setvals(L, 24, [b"0"])                       # ideal activities
    R.setvals(L, 27, [SH[0], SH[1], SH[2]])
    R.setvals(L, 28, [RE_CELL])
    R.setvals(L, 29, [L_CELL])
    return b"\r\n".join(L)


# ---------------------------------------------------------------- run
def num(line):
    return [float(x) for x in re.findall(r"[-+]?\d\.\d+E[-+]\d+", line)]


def run_one(args):
    exe, inp, ions = args
    d = tempfile.mkdtemp(prefix="nfpaper_")
    try:
        Path(d, "INPUT.XLS").write_bytes(inp)
        Path(d, "IONS.XLS").write_bytes(ions)
        subprocess.run([str(exe)], cwd=d, input=b"\n", stdout=subprocess.PIPE,
                       stderr=subprocess.STDOUT, timeout=3600, check=False)
        out = Path(d, "OUTPUT.XLW").read_bytes().decode("latin-1").splitlines()
    finally:
        shutil.rmtree(d, ignore_errors=True)
    r, prof, inprof = {}, [], False
    for i, l in enumerate(out):
        if "NUMBER OF ITERATIONS" in l:
            r["iter"] = int(l.split()[-1])
        if l.strip().startswith("RESIDUES:"):
            r["res"] = max(num(out[i + 2]))
        if l.startswith("SOLUTION AT MEMBRANE INTERFACE"):
            r["c0"] = num(l)[:-1]
            inprof = True
            continue
        if l.startswith("PERMEATE SOLUTION"):
            v = num(l)
            r["cp"], r["psi_p"] = v[:-1], v[-1]
            inprof = False
        elif inprof:
            v = num(l)
            if v:
                prof.append(v)
    r["profile"] = prof                             # every node: x [m], c..., psi
    r["face0"] = prof[0][1:] if prof else []        # node 1: c..., psi
    r["face1"] = prof[-1][1:] if prof else []       # node ND-1
    return r


def richardson(a, b, ratio):
    return b + (b - a) / (ratio * ratio - 1.0)


def fig3_experiments():
    """(dye, c_Cl) of every measurement: the mean of its Na+ and Cl- markers."""
    rows = [r for r in csv.DictReader(l for l in open(FIG3_CSV) if not l.startswith("#"))]
    out = []
    for dye in sorted({float(r["dye_molm3"]) for r in rows}):
        na = sorted(float(r["cCl_molm3"]) for r in rows
                    if float(r["dye_molm3"]) == dye and r["ion"] == "Na")
        cl = sorted(float(r["cCl_molm3"]) for r in rows
                    if float(r["dye_molm3"]) == dye and r["ion"] == "Cl")
        if len(na) != len(cl):
            raise SystemExit("regenerate_paper: Fig. 3 has %d Na+ and %d Cl- markers"
                             " at %g mol/m3 of dye" % (len(na), len(cl), dye))
        for k, (a, b) in enumerate(zip(na, cl), 1):
            out.append((dye, k, round(0.5 * (a + b), 4)))
    return out


def regenerate(workdir):
    exe = {v: build(workdir, v) for v in ("asReceived", "daviesPatched", "daviesBorn")}
    shipped_ions = (R.SHIPPED / "IONS.XLS").read_bytes()
    stiff_ions = ions_matched(T_STIFF, RP_STIFF)
    bm_ions = ions_matched(T_STIFF, RP_CA30)
    jobs, keys = [], []
    for N, *_ in PAPER_TABLE2:
        for v in ("asReceived", "daviesPatched"):
            jobs.append((exe[v], stiff_input(N, 0.2, 1e-4, 5000), shipped_ions))
            keys.append(("table2", v, N))
    #  the decomposition at N = 350 (each step one change, the paper's
    #  numerics) and the converged code-to-code reference
    jobs.append((exe["daviesPatched"], stiff_input(350, 0.2, 1e-4, 5000), stiff_ions))
    keys.append(("stiff", "daviesPatched_matchedD_tol1e-4", 350))
    jobs.append((exe["daviesBorn"], stiff_input(350, 0.2, 1e-4, 5000), stiff_ions))
    keys.append(("stiff", "daviesBorn_tol1e-4", 350))
    for nd in (102, 204, 350):
        jobs.append((exe["daviesBorn"], stiff_input(nd, 0.1, 1e-9, 4000), stiff_ions))
        keys.append(("stiff", "daviesBorn_tol1e-9", nd))
    for dye, k, cl in fig3_experiments():
        jobs.append((exe["asReceived"], bm_input(dye, cl, 20, 0.2, 1e-4, 5000), shipped_ions))
        keys.append(("fig3", "paperSettings", (dye, k, cl)))
        for nd in (102, 204):
            jobs.append((exe["asReceived"], bm_input(dye, cl, nd, 0.1, 1e-9, 4000), bm_ions))
            keys.append(("fig3", "matched_%d" % nd, (dye, k, cl)))
    with ProcessPoolExecutor(max(1, min(4, os.cpu_count() or 1))) as ex:
        res = dict(zip(keys, ex.map(run_one, jobs)))
    return res


# ---------------------------------------------------------------- the table
COLS = ["section", "variant", "key", "quantity", "value", "iterations", "note"]
IONS3 = ("Na", "Mg", "Cl")           # the shipped example's order: codes 3, 30, 102


def tabulate(res):
    rows = []

    def add(section, variant, key, q, v, it="", note=""):
        rows.append(dict(section=section, variant=variant, key=str(key), quantity=q,
                         value="%.12e" % v, iterations=str(it), note=note))

    for N, na, mg, cl, dpsi, it in PAPER_TABLE2:
        for q, v in zip(("Na", "Mg", "Cl", "dPsi_m_V"), (na, mg, cl, dpsi)):
            add("table2", "paper", N, q, v, it, "Table 2, transcribed")
        for v in ("asReceived", "daviesPatched"):
            r = res[("table2", v, N)]
            for q, val in zip(IONS3, r["cp"]):
                add("table2", v, N, q, val, r["iter"])
            add("table2", v, N, "dPsi_m_V", r["psi_p"], r["iter"],
                "psi_p of the permeate node; psi_m = 0")
    for v in ("daviesPatched_matchedD_tol1e-4", "daviesBorn_tol1e-4"):
        r = res[("stiff", v, 350)]
        for q, val in zip(IONS3, r["cp"]):
            add("stiff", v, 350, q, val, r["iter"])
        add("stiff", v, 350, "dPsi_m_V", r["psi_p"], r["iter"])
    for nd in (102, 204, 350):
        r = res[("stiff", "daviesBorn_tol1e-9", nd)]
        conv = ("converged" if r["iter"] <= 4000 and r.get("res", 1) < 1e-9
                else "stopped at ITMAX, residual %.1e" % r.get("res", float("nan")))
        for q, val in zip(IONS3, r["cp"]):
            add("stiff", "daviesBorn_tol1e-9", nd, q, val, r["iter"], conv)
        add("stiff", "daviesBorn_tol1e-9", nd, "dPsi_m_V", r["psi_p"], r["iter"], conv)
        for q, val in zip(IONS3 + ("psi_V",), r["face0"]):
            add("stiff", "daviesBorn_tol1e-9", nd, "face0_" + q, val, r["iter"], conv)
        for q, val in zip(IONS3 + ("psi_V",), r["face1"]):
            add("stiff", "daviesBorn_tol1e-9", nd, "face1_" + q, val, r["iter"], conv)
    lo, hi = res[("stiff", "daviesBorn_tol1e-9", 102)], res[("stiff", "daviesBorn_tol1e-9", 204)]
    ratio = (204 - 2) / (102 - 2)
    for k, q in enumerate(IONS3):
        add("stiff", "daviesBorn_ext", "102/204", q, richardson(lo["cp"][k], hi["cp"][k], ratio))
    add("stiff", "daviesBorn_ext", "102/204", "dPsi_m_V", richardson(lo["psi_p"], hi["psi_p"], ratio))
    for f in ("face0", "face1"):
        for k, q in enumerate(IONS3 + ("psi_V",)):
            add("stiff", "daviesBorn_ext", "102/204", f + "_" + q,
                richardson(lo[f][k], hi[f][k], ratio))
    r = res[("table2", "asReceived", 350)]
    for f in ("face0", "face1"):
        for q, val in zip(IONS3 + ("psi_V",), r[f]):
            add("fig4", "asReceived", 350, f + "_" + q, val, r["iter"],
                "the profile Fig. 4 draws (N = 350, the paper's run)")
    for (sec, var, key), r in sorted(res.items(), key=lambda kv: str(kv[0])):
        if sec != "fig3":
            continue
        dye, k, cl = key
        tag = "dye%g_p%d" % (dye, k)
        cb = {"Na": cl + 3 * dye, "Cl": cl}
        if var == "paperSettings":
            for q, val in zip(("Na", "Cl"), r["cp"][:2]):
                add("fig3", "paperSettings", tag, "Robs_" + q, 1.0 - val / cb[q], r["iter"],
                    "c_Cl %g" % cl)
    for dye, k, cl in fig3_experiments():
        tag = "dye%g_p%d" % (dye, k)
        a, b = res[("fig3", "matched_102", (dye, k, cl))], res[("fig3", "matched_204", (dye, k, cl))]
        conv = ("converged" if max(a["iter"], b["iter"]) <= 4000 and b.get("res", 1) < 1e-9
                else "stopped at ITMAX, residual %.1e / %.1e" % (a.get("res", float("nan")), b.get("res", float("nan"))))
        for j, q in enumerate(("Na", "Cl")):
            add("fig3", "matched_ext", tag, "cperm_" + q,
                richardson(a["cp"][j], b["cp"][j], ratio), max(a["iter"], b["iter"]),
                "c_Cl %g; %s" % (cl, conv))
    return rows


HEADER = """# NanoFiltran on its own paper -- written by bin/curate/nanofiltran/regenerate_paper.py
# Paper: V. Geraldes, A.M. Brites Alves, J. Membr. Sci. 321 (2008) 172-182,
#   doi:10.1016/j.memsci.2008.04.054 (publisher's copyright; not in the tree).  The `paper`
#   rows are its Table 2, transcribed (facts, cited); every other row is a NanoFiltran run.
# Program: bin/curate/nanofiltran/src as received, built with ARRAY_PATCH (NDX 351) and,
#   per variant, DAVIES_PATCH and BORN_PATCH (regenerate_paper.py's docstring).
# section table2: the paper's inputs (shipped INPUT.XLS / IONS.XLS), URF 0.2, TOL 1e-4.
# section stiff:  on matched IONS (T 298 K): daviesPatched_matchedD (the Born constant as
#   published) and daviesBorn (both constants CODATA); tol1e-4 = the paper's numerics,
#   tol1e-9 = URF 0.1 / ITMAX 4000; ext = Richardson of ND 102 and 204 (100, 202 intervals).
#   face0/face1 = the pore nodes 1 and ND-1 (the feed and permeate faces, inside).
# section fig4:   the as-received ND 350 run's face values (Fig. 4's profile ends).
# section fig3:   Bowen & Mohammad's CA30 case; paperSettings = ND 20, URF 0.2, TOL 1e-4 on
#   the shipped IONS (Fig. 3's solid line); matched_ext = matched IONS, ND 102/204, TOL 1e-9.
# concentrations mol/m3, potentials V (NanoFiltran's F = 96500, R = 8.314).
"""


PROFILE_COLS = ["variant", "node", "x_um", "c_Na_molm3", "c_Mg_molm3", "c_Cl_molm3",
                "psi_V"]
PROFILE_HEADER = """# Fig. 4 of the NanoFiltran paper, node by node -- written by
#   bin/curate/nanofiltran/regenerate_paper.py (--write).  N = 350, the pore nodes 1 .. ND-1
#   (the feed face to the permeate face, inside), x across the equivalent thickness dx_e.
# variant asReceived: the program as published, on its shipped inputs and the paper's numerics
#   (URF 0.2, TOL 1e-4) -- the profile Fig. 4 draws.  variant corrected: DAVIES_PATCH +
#   BORN_PATCH, the D input matched, URF 0.1, TOL 1e-9 (paper.tsv's daviesBorn_tol1e-9 350).
# concentrations mol/m3; psi in CODATA volts (NanoFiltran's x %.16g).
""" % VOLT_CODATA


def tabulate_profiles(res):
    rows = []
    for variant, key in (("asReceived", ("table2", "asReceived", 350)),
                         ("corrected", ("stiff", "daviesBorn_tol1e-9", 350))):
        for k, v in enumerate(res[key]["profile"]):
            x, na, mg, cl, psi = v[:5]
            rows.append(dict(variant=variant, node=str(k), x_um="%.12e" % (x * 1e6),
                             c_Na_molm3="%.12e" % na, c_Mg_molm3="%.12e" % mg,
                             c_Cl_molm3="%.12e" % cl, psi_V="%.12e" % (psi * VOLT_CODATA)))
    return rows


def read_profiles():
    rows = []
    for line in PROFILES_TSV.read_text().splitlines():
        if not line or line.startswith("#") or line.startswith("variant\t"):
            continue
        rows.append(dict(zip(PROFILE_COLS, line.split("\t"))))
    return rows


def read_table():
    rows = []
    for line in PAPER_TSV.read_text().splitlines():
        if not line or line.startswith("#") or line.startswith("section\t"):
            continue
        rows.append(dict(zip(COLS, line.split("\t"))))
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    if shutil.which("gfortran") is None:
        print("regenerate_paper.py: REFUSED -- gfortran is not on PATH, so NanoFiltran"
              " cannot be built and nothing here can be regenerated or checked."
              "  The committed paper.tsv stands as committed.")
        return 2
    with tempfile.TemporaryDirectory(prefix="nanofiltran_paper_") as w:
        res = regenerate(w)
    rows = tabulate(res)
    prof = tabulate_profiles(res)
    for r in rows:
        if r["section"] in ("table2", "stiff") and r["quantity"] in IONS3 + ("dPsi_m_V",):
            print("%-7s %-20s %-8s %-9s %s  it %s %s" % (r["section"], r["variant"], r["key"],
                  r["quantity"], r["value"], r["iterations"], r["note"]))
    if a.write:
        with open(PAPER_TSV, "w") as f:
            f.write(HEADER + "\t".join(COLS) + "\n")
            for r in rows:
                f.write("\t".join(r[c] for c in COLS) + "\n")
        print("regenerate_paper.py: wrote", PAPER_TSV.relative_to(ROOT), "(%d rows)" % len(rows))
        with open(PROFILES_TSV, "w") as f:
            f.write(PROFILE_HEADER + "\t".join(PROFILE_COLS) + "\n")
            for r in prof:
                f.write("\t".join(r[c] for c in PROFILE_COLS) + "\n")
        print("regenerate_paper.py: wrote", PROFILES_TSV.relative_to(ROOT), "(%d rows)" % len(prof))
        return 0
    bad = []
    if PAPER_TSV.is_file():
        ref = {(r["section"], r["variant"], r["key"], r["quantity"]): r for r in read_table()}
        for r in rows:
            q = ref.get((r["section"], r["variant"], r["key"], r["quantity"]))
            if q is None:
                bad.append("%s/%s/%s/%s: not in paper.tsv" % (r["section"], r["variant"],
                                                              r["key"], r["quantity"]))
                continue
            x, y = float(r["value"]), float(q["value"])
            if abs(x - y) > 1e-8 * max(abs(y), 1e-300):
                bad.append("%s/%s/%s/%s: regenerated %s vs committed %s" % (
                    r["section"], r["variant"], r["key"], r["quantity"], r["value"], q["value"]))
        if len(ref) != len(rows):
            bad.append("paper.tsv holds %d rows, regeneration %d" % (len(ref), len(rows)))
    else:
        bad.append("paper.tsv is missing (run with --write)")
    if PROFILES_TSV.is_file():
        old = read_profiles()
        if len(old) != len(prof):
            bad.append("fig4_profiles.tsv holds %d rows, regeneration %d" % (len(old), len(prof)))
        for a, b in zip(prof, old):
            for c in PROFILE_COLS[2:]:
                x, y = float(a[c]), float(b[c])
                if abs(x - y) > 1e-8 * max(abs(y), 1e-300):
                    bad.append("fig4_profiles %s node %s %s: regenerated %s vs committed %s"
                               % (a["variant"], a["node"], c, a[c], b[c]))
    else:
        bad.append("fig4_profiles.tsv is missing (run with --write)")
    if bad:
        print("regenerate_paper.py: FAILED --\n  " + "\n  ".join(bad))
        return 1
    print("regenerate_paper.py: OK -- %d rows regenerated and equal to paper.tsv, %d profile"
          " nodes equal to fig4_profiles.tsv, to 1e-8 relative" % (len(rows), len(prof)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
