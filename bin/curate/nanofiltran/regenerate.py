#!/usr/bin/env python3
"""Regenerate NanoFiltran's reference numbers for the code-to-code golden
case tutorials/props/membrane/nanofiltran01_dspmde_reference.

    bin/curate/nanofiltran/regenerate.py            # run, print, compare
    bin/curate/nanofiltran/regenerate.py --write    # also (re)write the
                                                    # committed inputs and
                                                    # reference.tsv
    bin/curate/nanofiltran/regenerate.py --check    # REFUSE (exit 2) without
                                                    # gfortran; FAIL (exit 1)
                                                    # if a regenerated number
                                                    # or input differs

WHAT IT DOES.  Builds NanoFiltran (Geraldes & Alves, J. Membr. Sci. 321
(2008) 172-182; src/ here, byte for byte as received) with the authors' own
flags, writes one INPUT.XLS per operating point from the SHIPPED example
(shipped/INPUT.XLS: only the value cells change, every label stays), runs
each point at ND = 102 and 204 (NanoFiltran's limit is 205), and
Richardson-extrapolates the two -- the program's central differences are
second order, which the table's two grids and the case gate's three Choupo
grids both measure.  The result is reference.tsv, whose `*_ext` columns are
the anchors the case's `expected` carries.

THE INPUTS ARE MATCHED, NEVER THE PROGRAM (see README.md, "Matching the
inputs").  Three things in NanoFiltran are constants, not model: (1) it
corrects every diffusivity to T through its Vogel viscosity, which at
298.15 K is 1.000140779 rather than 1; (2) its Born constant is the rounded
6.95e-5/8.314 against the CODATA 6.9468e-5/8.314462618; (3) its hindrance
polynomial is written in single-precision REAL literals, and at lambda =
0.875 (Mg2+ in a 0.4 nm pore) the polynomial is a small number left by the
cancellation of large terms, so the literals' rounding moves K_d by 1.55e-4.
Each is cancelled through an INPUT: the D in IONS.XLS is divided by (1) and
multiplied by K_d(double)/K_d(single) for (3), and the pore dielectric
constant is the value that gives the CODATA Born exponent (2).  The Davies
rows run a COPY of the program built with ONE declared patch (DAVIES_PATCH
below, applied in the build directory; src/ is never edited): NanoFiltran
evaluates Davies with exp() on the log10 constant A = 1.825e6 (eps T)^-1.5,
so ln gamma is ln 10 too small -- a finding, recorded in README.md.  The
patch multiplies A by ln 10 and writes the constant to five figures
(1.82483e6, Choupo's), on the two lines that compute A and nowhere else.
The Davies op runs with the pore dielectric constant at 80 (Born off): with
Born on, the matched pore dielectric input (2) would also move NanoFiltran's
pore-side Davies A by 2e-4, which the trace Na+ of the example amplifies to
5.5e-4 (measured; README.md).  `--report-davies` prints the AS-RECEIVED
program's Davies numbers beside the patched ones.
"""
import argparse
import math
import os
import shutil
import struct
import subprocess
import sys
import tempfile
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "src"
SHIPPED = HERE / "shipped"
CASES_DIR = HERE / "cases"
REFERENCE = HERE / "reference.tsv"
FLAGS = ["-O2", "-std=legacy", "-ffixed-line-length-none", "-Wno-tabs"]
NDS = (102, 204)
T = 298.15
RP = 4.0e-10            # pore radius of every case [m]
DELTA = 2.5e-6          # active layer thickness [m]
X = -30.0               # membrane charge [mol/m3]
TOL = 1.0e-9            # NanoFiltran's convergence criterion (its own residuals)
URF = 0.1
ITMAX = 4000

#  The ion codes of the shipped IONS.XLS, and the salts of the case.
CODES = {"Na": 3, "Mg": 30, "Cl": 102, "SO4": 130}
SALTS = {"NaCl": {"Na": 1, "Cl": 1}, "MgCl2": {"Mg": 1, "Cl": 2},
         "Na2SO4": {"Na": 2, "SO4": 1}}

#  The polarised op: NanoFiltran's Sh = a Re^b Sc^c with k = Sh D/L, which
#  is Choupo's StirredCell with radius = L, density 997 and viscosity =
#  NanoFiltran's Vogel value at T (it prices Sc = VISCOS/997/D).
SH = (0.23, 0.567, 0.33)
RE = 2000.0
LCHAR = 0.024

#  THE MATRIX.  op name = the op of the case's system/propsDict.
CASES = [
    dict(op="example_ideal", salts=[("NaCl", 10.0), ("MgCl2", 20.0)], epsp=60.0,
         iact=0, jv=[1e-6, 5e-6, 1e-5, 2e-5, 5e-5]),
    dict(op="example_noBorn", salts=[("NaCl", 10.0), ("MgCl2", 20.0)], epsp=80.0,
         iact=0, jv=[5e-5]),
    dict(op="example_davies", salts=[("NaCl", 10.0), ("MgCl2", 20.0)], epsp=80.0,
         iact=1, jv=[5e-5]),
    dict(op="NaCl_ideal", salts=[("NaCl", 10.0)], epsp=60.0, iact=0,
         jv=[1e-5, 5e-5]),
    dict(op="Na2SO4_ideal", salts=[("Na2SO4", 10.0)], epsp=60.0, iact=0,
         jv=[1e-5, 5e-5]),
    dict(op="mixed_polarised", salts=[("NaCl", 10.0), ("Na2SO4", 10.0)],
         epsp=60.0, iact=0, jv=[1e-5, 3e-5], polarised=True),
]

#  The ONE patch, for the Davies rows only (README.md, "The Davies constant").
DAVIES_PATCH = [
    ("        ABULK=1.825E6*(1./EWATER**3/T**3)**0.5",
     "        ABULK=DLOG(10.D0)*1.82483D6*(1./EWATER**3/T**3)**0.5"),
    ("\t  AMEMB=1.825E6*(1./EMEMB**3/T**3)**0.5",
     "\t  AMEMB=DLOG(10.D0)*1.82483D6*(1./EMEMB**3/T**3)**0.5"),
]


# ---------------------------------------------------------------- matching
def f32(x):
    return struct.unpack("f", struct.pack("f", x))[0]


def kd_dd2006(lam, lit=lambda v: v):
    """K_d of Dechadilok & Deen (2006), as NANOFILTRAN.F writes it; `lit`
    rounds each literal (identity: double; f32: NanoFiltran's REAL)."""
    if lam > 0.95:
        return lit(0.984) * ((1 - lam) / lam) ** (lit(5.) / lit(2.))
    H = (1 + lit(9.) / lit(8.) * lam * math.log(lam) - lit(1.56034) * lam
         + lit(0.528155) * lam ** 2 + lit(1.91521) * lam ** 3
         - lit(2.81903) * lam ** 4 + lit(0.270788) * lam ** 5
         + lit(1.10115) * lam ** 6 - lit(0.435933) * lam ** 7)
    return H / (1 - lam) ** 2


def vogel_factor(t):
    """NanoFiltran's D(T)/D(25 C): 0.897e-3/298.15 T / exp(-10.5 + 530/(T-146))."""
    return 0.897e-3 / 298.15 * t / math.exp(-10.5 + 530.0 / (t - 146.0))


def viscosity(t):
    return math.exp(-10.5 + 530.0 / (t - 146.0))


CODATA_BORN = ((96485.33212 / 6.02214076e23) ** 2 * 6.02214076e23
               / (8 * math.pi * 8.8541878128e-12))   # e^2 N_A/(8 pi eps0) [J m/mol]


def matched_epsp(epsp, epsw=80.0):
    if epsp == epsw:
        return epsp
    ratio = (CODATA_BORN / 8.314462618) / (6.95e-5 / 8.314)
    return 1.0 / (1.0 / epsw + ratio * (1.0 / epsp - 1.0 / epsw))


def fmt(v):
    return repr(float(v)).replace("e", "E").encode()


def ions_xls():
    """shipped/IONS.XLS with each D cell matched (module docstring)."""
    out = []
    for line in (SHIPPED / "IONS.XLS").read_bytes().split(b"\r\n"):
        f = line.split(b"\t")
        if len(f) > 4 and f[0].strip().isdigit() and float(f[4]) > 0:
            lam = float(f[3]) / RP
            k = kd_dd2006(lam) / kd_dd2006(lam, f32) if lam < 1 else 1.0
            f[4] = fmt(float(f[4]) / vogel_factor(T) * k)
        out.append(b"\t".join(f))
    return b"\r\n".join(out)


# ---------------------------------------------------------------- inputs
def ions_of(salts):
    order, conc = [], {}
    for s, c in salts:
        for ion, nu in SALTS[s].items():
            if ion not in conc:
                order.append(ion)
                conc[ion] = 0.0
            conc[ion] += nu * c
    return order, conc


def setvals(lines, i, vals, width=0):
    f = lines[i].split(b"\t")
    vals = [v if isinstance(v, bytes) else fmt(v) for v in vals]
    f = [f[0]] + vals + f[1 + len(vals):] if width == 0 else \
        [f[0]] + vals + [b""] * max(0, width - len(vals))
    lines[i] = b"\t".join(f)


def input_xls(case, jv, nd):
    L = (SHIPPED / "INPUT.XLS").read_bytes().split(b"\r\n")
    order, conc = ions_of(case["salts"])
    setvals(L, 5, [str(nd).encode()])
    setvals(L, 6, [1.0])
    setvals(L, 7, [URF])
    setvals(L, 8, [str(ITMAX).encode()])
    setvals(L, 9, [b"0"])
    setvals(L, 10, [TOL])
    setvals(L, 13, [X])
    setvals(L, 14, [RP])
    setvals(L, 15, [DELTA])
    setvals(L, 16, [matched_epsp(case["epsp"])])
    setvals(L, 19, [T])
    setvals(L, 20, [jv])
    setvals(L, 21, [str(len(order)).encode()])
    setvals(L, 22, [str(CODES[i]).encode() for i in order], width=8)
    setvals(L, 23, [conc[i] for i in order], width=8)
    setvals(L, 24, [str(case["iact"]).encode()])
    if case.get("polarised"):
        setvals(L, 27, [SH[0], SH[1], SH[2]])
        setvals(L, 28, [RE])
        setvals(L, 29, [LCHAR])
    return b"\r\n".join(L)


# ---------------------------------------------------------------- build/run
def build(workdir, patched):
    d = Path(workdir) / ("davies_ln10" if patched else "asReceived")
    d.mkdir(parents=True, exist_ok=True)
    for f in ("NANOFILTRAN.F", "LINEAR.F", "SIMPLEX.F"):
        shutil.copyfile(SRC / f, d / f)
    if patched:
        text = (d / "NANOFILTRAN.F").read_bytes().decode("latin-1")
        for old, new in DAVIES_PATCH:
            if text.count(old) != 1:
                raise SystemExit("regenerate: the Davies patch line not found"
                                 " exactly once: " + old.strip())
            text = text.replace(old, new)
        (d / "NANOFILTRAN.F").write_bytes(text.encode("latin-1"))
    subprocess.run(["gfortran", *FLAGS, "NANOFILTRAN.F", "-o", "nanofiltran"],
                   cwd=d, check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    return d / "nanofiltran"


def numbers(line):
    import re
    return [float(x) for x in re.findall(r"[-+]?\d\.\d+E[-+]\d+", line)]


def run_one(args):
    exe, inp, ions = args
    d = tempfile.mkdtemp(prefix="nfrun_")
    try:
        Path(d, "INPUT.XLS").write_bytes(inp)
        Path(d, "IONS.XLS").write_bytes(ions)
        subprocess.run([str(exe)], cwd=d, input=b"\n", stdout=subprocess.PIPE,
                       stderr=subprocess.STDOUT, timeout=3600, check=False)
        out = Path(d, "OUTPUT.XLW").read_bytes().decode("latin-1").splitlines()
    finally:
        shutil.rmtree(d, ignore_errors=True)
    r = {}
    for i, l in enumerate(out):
        if "NUMBER OF ITERATIONS" in l:
            r["iter"] = int(l.split()[-1])
        if l.strip().startswith("RESIDUES:"):
            r["res"] = max(numbers(out[i + 2]))
        if l.startswith("PERMEATE SOLUTION"):
            r["cp"] = numbers(l)[:-1]
        if l.startswith("SOLUTION AT MEMBRANE INTERFACE"):
            r["c0"] = numbers(l)[:-1]
    return r


def richardson(a, b, ratio):
    return b + (b - a) / (ratio * ratio - 1.0)


def regenerate(workdir):
    exe = {False: build(workdir, False), True: build(workdir, True)}
    ions = ions_xls()
    jobs, keys = [], []
    for case in CASES:
        for p, jv in enumerate(case["jv"], 1):
            for nd in NDS:
                jobs.append((exe[case["iact"] == 1], input_xls(case, jv, nd), ions))
                keys.append((case["op"], p, nd))
    with ProcessPoolExecutor(max(1, min(4, os.cpu_count() or 1))) as ex:
        results = dict(zip(keys, ex.map(run_one, jobs)))
    rows = []
    ratio = (NDS[1] - 2) / (NDS[0] - 2)          # intervals: ND - 2
    for case in CASES:
        order, conc = ions_of(case["salts"])
        for p, jv in enumerate(case["jv"], 1):
            lo, hi = results[(case["op"], p, NDS[0])], results[(case["op"], p, NDS[1])]
            for k, ion in enumerate(order):
                cp_ext = richardson(lo["cp"][k], hi["cp"][k], ratio)
                c0_ext = richardson(lo["c0"][k], hi["c0"][k], ratio)
                rows.append(dict(
                    op=case["op"], point=p, Jv=jv, ion=ion, cb=conc[ion],
                    cp102=lo["cp"][k], cp204=hi["cp"][k], cp_ext=cp_ext,
                    c0_ext=c0_ext, Rreal_ext=1.0 - cp_ext / c0_ext,
                    Robs_ext=1.0 - cp_ext / conc[ion],
                    iter102=lo.get("iter", -1), iter204=hi.get("iter", -1),
                    res204=hi.get("res", float("nan")),
                    converged=int(lo.get("iter", ITMAX + 1) <= ITMAX
                                  and hi.get("iter", ITMAX + 1) <= ITMAX)))
    return rows, ions


COLUMNS = ["op", "point", "Jv", "ion", "cb", "cp102", "cp204", "cp_ext",
           "c0_ext", "Rreal_ext", "Robs_ext", "iter102", "iter204", "res204",
           "converged"]
HEADER = """# NanoFiltran reference numbers -- written by bin/curate/nanofiltran/regenerate.py
# Program: NanoFiltran (Geraldes & Alves, J. Membr. Sci. 321 (2008) 172-182),
#   src/ as received, gfortran -O2 -std=legacy -ffixed-line-length-none -Wno-tabs;
#   op example_davies run on the copy with DAVIES_PATCH (README.md).
# Inputs: cases/<op>_p<point>/INPUT.XLS (ND 204; ND 102 differs only in that cell)
#   and cases/IONS.XLS (matched D).  Uniform mesh (EPSX 1), URF 0.1, TOL 1e-9.
# cp/c0 in mol/m3; *_ext = Richardson extrapolation of ND 102 and 204
#   (100 and 202 intervals; the central differences are second order).
"""


def fmtrow(r):
    out = []
    for c in COLUMNS:
        v = r[c]
        out.append(v if isinstance(v, str) else (str(v) if isinstance(v, int) else "%.12e" % v))
    return "\t".join(out)


def read_reference():
    rows = []
    for line in REFERENCE.read_text().splitlines():
        if not line or line.startswith("#") or line.startswith("op\t"):
            continue
        f = line.split("\t")
        r = dict(zip(COLUMNS, f))
        for c in COLUMNS:
            if c in ("op", "ion"):
                continue
            r[c] = int(r[c]) if c in ("point", "iter102", "iter204", "converged") else float(r[c])
        rows.append(r)
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--report-davies", action="store_true",
                    help="print the as-received program's Davies rows beside the patched")
    a = ap.parse_args()
    if shutil.which("gfortran") is None:
        print("regenerate.py: REFUSED -- gfortran is not on PATH, so NanoFiltran"
              " cannot be built and nothing here can be regenerated or checked."
              "  The committed reference.tsv stands as committed; install"
              " gfortran to reproduce it.")
        return 2
    if a.report_davies:
        with tempfile.TemporaryDirectory(prefix="nanofiltran_build_") as w:
            exe = {False: build(w, False), True: build(w, True)}
            case = next(c for c in CASES if c["op"] == "example_davies")
            order, _ = ions_of(case["salts"])
            ratio = (NDS[1] - 2) / (NDS[0] - 2)
            ions = ions_xls()
            for patched in (False, True):
                r = [run_one((exe[patched], input_xls(case, case["jv"][0], nd), ions))
                     for nd in NDS]
                ext = [richardson(x, y, ratio) for x, y in zip(r[0]["cp"], r[1]["cp"])]
                print(("patched    " if patched else "as received")
                      + "  " + "  ".join(f"{i} {v:.10g}" for i, v in zip(order, ext)))
        return 0
    with tempfile.TemporaryDirectory(prefix="nanofiltran_build_") as w:
        rows, ions = regenerate(w)
    for r in rows:
        print("%-16s p%d Jv=%-7g %-4s cp_ext=%.10g  (ND102 %.10g, ND204 %.10g)"
              "  it %d/%d  res %.1e%s"
              % (r["op"], r["point"], r["Jv"], r["ion"], r["cp_ext"], r["cp102"],
                 r["cp204"], r["iter102"], r["iter204"], r["res204"],
                 "" if r["converged"] else "  (TOL not reached: ITMAX)"))
    if a.write:
        CASES_DIR.mkdir(exist_ok=True)
        (CASES_DIR / "IONS.XLS").write_bytes(ions)
        for case in CASES:
            for p, jv in enumerate(case["jv"], 1):
                d = CASES_DIR / f"{case['op']}_p{p}"
                d.mkdir(exist_ok=True)
                (d / "INPUT.XLS").write_bytes(input_xls(case, jv, NDS[1]))
        REFERENCE.write_text(HEADER + "\t".join(COLUMNS) + "\n"
                             + "\n".join(fmtrow(r) for r in rows) + "\n")
        print("regenerate.py: wrote", REFERENCE.relative_to(HERE.parents[2]))
        return 0
    bad = []
    if REFERENCE.is_file():
        ref = {(r["op"], r["point"], r["ion"]): r for r in read_reference()}
        for r in rows:
            q = ref.get((r["op"], r["point"], r["ion"]))
            if q is None:
                bad.append(f"{r['op']} p{r['point']} {r['ion']}: not in reference.tsv")
                continue
            for c in ("cp102", "cp204", "cp_ext", "c0_ext"):
                if abs(r[c] - q[c]) > 1e-8 * max(abs(q[c]), 1e-300):
                    bad.append(f"{r['op']} p{r['point']} {r['ion']} {c}: "
                               f"regenerated {r[c]:.12e} vs committed {q[c]:.12e}")
        if len(ref) != len(rows):
            bad.append(f"reference.tsv holds {len(ref)} rows, regeneration {len(rows)}")
    else:
        bad.append("reference.tsv is missing (run with --write)")
    if a.check:
        if (CASES_DIR / "IONS.XLS").read_bytes() != ions:
            bad.append("cases/IONS.XLS differs from what the matching rule writes")
        for case in CASES:
            for p, jv in enumerate(case["jv"], 1):
                f = CASES_DIR / f"{case['op']}_p{p}" / "INPUT.XLS"
                if not f.is_file() or f.read_bytes() != input_xls(case, jv, NDS[1]):
                    bad.append(f"{f.relative_to(HERE)} missing or differs")
    if bad:
        print("regenerate.py: FAILED --\n  " + "\n  ".join(bad))
        return 1
    print(f"regenerate.py: OK -- {len(rows)} NanoFiltran rows regenerated and"
          " equal to reference.tsv to 1e-8 relative")
    return 0


if __name__ == "__main__":
    sys.exit(main())
