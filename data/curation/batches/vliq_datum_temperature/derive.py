#!/usr/bin/env python3
"""Reproduces the derived columns of evidence.tsv from Poling, Prausnitz & O'Connell (2001), Appendix A.

    python3 data/curation/batches/vliq_datum_temperature/derive.py [PDF]

For each record named in evidence.tsv that Poling's Appendix A carries (matched by CAS number) it reads
  Section A:  Tc, Pc, Vc, Zc   (columns taken from the END of the row; accepted only when Pc*Vc/(R*Tc)
                                reproduces Zc within 2 %, so a row with a blank column cannot be misread)
  Section B:  V liq at T liq   (the row's two numbers before the optional dipole; the rows used in evidence.tsv were
                                checked against the page image, column `page_read` there)
and applies Poling's own Eq. (4-11.4b), the Rackett equation anchored on one experimental volume,
        Vs = V_R * Zc ** phi,   phi = (1 - T/Tc)**(2/7) - (1 - T_R/Tc)**(2/7),
to give (a) the volume at the record's Tb and (b) the volume at 298.15 K when T/Tc <= 0.95 (nearer the
critical point the equation is not trusted and no number is printed).  Origin of these two columns:
`derived` (a stated method applied to a named measurement); they are cross-checks, not proposed data.
Writes nothing.
"""
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve()
COMP = HERE.parents[3] / "standards" / "components"
DEF = Path.home() / "Choupo-Literature/Handbooks-DataCompilations/poling2001-appendix-a-property-data-bank.pdf"
CAS = re.compile(r"\b(\d{2,7}-\d\d-\d)\b")
NUM = re.compile(r"^[-−⁻]?\d+(\.\d+)?$")
R = 83.145  # cm3 bar / (mol K)
# the records the census flags (census.py) plus the records that state no temperature at all and whose Tc is
# above 330 K but whose stored value could still belong to the boiling point (see README.md, class UNSTATED)
NAMES = ["CH4", "CO", "H2", "N2", "NO", "O2", "CO2", "hitecSalt", "Ar", "He", "O3", "ethylene", "ethane",
         "acetylene", "N2O", "HCl", "sucrose", "SF6", "glucose", "Cl2", "H2S", "SO2", "H2O2", "HCHO", "HCN", "NO2",
         "nButane", "nOctane", "propane", "propylene", "water"]


def num(t):
    return float(t.replace("−", "-").replace("⁻", "-"))


def read(pdf):
    txt = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True).stdout
    sec, A, B = None, {}, {}
    for line in txt.splitlines():
        if "Section A" in line:
            sec = "A"
        elif "Section B" in line:
            sec = "B"
        elif "Section C" in line:
            sec = None
        m = CAS.search(line)
        if not m or sec is None:
            continue
        toks = [t for t in line[m.end():].split() if NUM.match(t)]
        if sec == "A" and len(toks) >= 7:
            v = [num(t) for t in toks]
            for k in (0, 1):  # with and without a trailing omega
                if len(v) - k < 6:
                    continue
                zc, vc, pc, tc = v[-1 - k], v[-2 - k], v[-3 - k], v[-4 - k]
                if 0.15 < zc < 0.4 and abs(pc * vc / (R * tc) - zc) < 0.02 * zc:
                    A[m.group(1)] = dict(Tc=tc, Pc=pc, Vc=vc, Zc=zc)
                    break
        if sec == "B":
            # V liq and T liq: the pair of two-decimal numbers ending the row, optional one-decimal dipole last
            t2 = [t for t in toks if re.search(r"\.\d\d$", t)]
            # a row with no V liq (propene) would otherwise yield its DelHb, DelHm: T liq below 4 K is refused
            if len(t2) >= 2 and num(t2[-1]) >= 4.0:
                B.setdefault(m.group(1), []).append((num(t2[-2]), num(t2[-1])))
    return A, B


def rackett(vr, tr_, T, tc, zc):
    phi = (1 - T / tc) ** (2 / 7) - (1 - tr_ / tc) ** (2 / 7)
    return vr * zc ** phi


def main():
    pdf = Path(sys.argv[1]) if len(sys.argv) > 1 else DEF
    A, B = read(pdf)
    names = NAMES
    print("record\tCAS\tTc_poling\tZc_poling\tV_liq_poling\tT_liq_poling\tTb_record\tstored\tRackett_at_Tb\tstored_over_it\tRackett_at_298.15")
    for n in names:
        t = (COMP / (n + ".dat")).read_text(errors="replace")
        cas = re.search(r"^\s*CAS\s+([0-9-]+)\s*;", t, re.M)
        vl = float(re.search(r"^\s*Vliq\s+([0-9.eE+-]+)\s*;", t, re.M).group(1)) * 1e6
        tb = re.search(r"^\s*Tb\s+([0-9.eE+-]+)\s*;", t, re.M)
        tb = float(tb.group(1)) if tb else None
        c = cas.group(1) if cas else None
        if c not in A or c not in B:
            print(f"{n}\t{c}\t-\t-\t-\t-\t{tb}\t{vl:.2f}\t-\t-\t-")
            continue
        a = A[c]
        v, T = B[c][-1]
        at_tb = rackett(v, T, tb, a["Tc"], a["Zc"]) if tb and tb < a["Tc"] else None
        at_298 = rackett(v, T, 298.15, a["Tc"], a["Zc"]) if 298.15 / a["Tc"] <= 0.95 else None
        f = lambda x: "-" if x is None else f"{x:.2f}"
        print(f"{n}\t{c}\t{a['Tc']}\t{a['Zc']}\t{v}\t{T}\t{tb}\t{vl:.2f}\t{f(at_tb)}\t"
              f"{'-' if at_tb is None else format(vl / at_tb - 1, '+.3f')}\t{f(at_298)}")


main()
