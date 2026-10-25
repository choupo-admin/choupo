#!/usr/bin/env python3
# =============================================================================
#        \|/       C hemicals     | Open-source, glass-box chemical process simulator
#       \\|//      H eat-transfer | https://choupo.org
#      \\\|///     O perations    |
#       \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
#        \|/       P roperties    | Licence: GPL-3.0-or-later
#         |        O ptimization  |
#        /|\                      |
# -----------------------------------------------------------------------------
#     SPDX-License-Identifier: GPL-3.0-or-later
#     Credit and attribution: see AUTHORS
#     Required legal notices:  see NOTICE
# =============================================================================
"""nasa_tp2002_to_choupo -- read NASA/TP-2002-211556 and print Choupo blocks.

    bin/curate/nasa_tp2002_to_choupo.py --fetch            # the report -> thirdParty/nasa-tp2002/
    bin/curate/nasa_tp2002_to_choupo.py block CH HCO ...   # print the blocks for these entries
    bin/curate/nasa_tp2002_to_choupo.py verify             # hold every record citing it to the report

THE SOURCE.  McBride, B. J., Zehe, M. J. and Gordon, S. (2002).  NASA Glenn
Coefficients for Calculating Thermodynamic Properties of Individual Species.
NASA/TP-2002-211556.  A work of the United States Government, in the public
domain (17 U.S.C. 105) -- the clean route for ideal-gas formation data and
heat capacities that CLAUDE.md 7 names, and the one DEV.md 4c C164 took when
GRI-Mech 3.0's thermo file was ruled out (it grants no redistribution).

WHAT IS READ, AND WHERE.  The report is born-digital, so `pdftotext -layout`
reproduces its pages exactly (the TM-4513 scan does not: its OCR turns digits
into letters, which is why this tool reads the 2002 report and not the 1993
one).  From it:

  * appendix D (the thermo.inp listing): per entry, the record line's
    H(298.15) [J/mol] -- the report's elements reference makes it the enthalpy
    of formation -- and, per temperature interval, the seven Cp coefficients
    a1..a7 of eq. (1), printed in FORTRAN D-notation, plus the integration
    constants b1, b2 (read, used only to CHECK, never written);
  * Table B1: the printed S(298.15) [J/(mol K)] and dfH(298.15) [kJ/mol].

Every block it prints is CHECKED before it is printed, against the report
itself: H(298.15) recomputed from the interval's a1..a7 and b1 must equal the
record line, and S(298.15) recomputed from a1..a7 and b2 must equal Table B1
to its printed precision.  An entry that fails REFUSES, naming both numbers --
the report disagreeing with itself (it does, for CH2CO,ketene: Table B1 prints
S = 251.442 while appendix D's own coefficients integrate to 241.889) is a
fact for a curator, never a number for this tool to choose.

Only the first two intervals (to 6000 K) are printed; the 6000-20000 K
interval some entries carry is beyond any process or flame temperature in the
corpus, and leaving it out is said in every block.

WHAT IT DOES NOT DO.  It writes no file under data/standards/ or tutorials/:
it PRINTS, and a curator places the blocks (CLAUDE.md 7: new data is a
curation act).  It reads no other database.  `verify` is a TOOL and
deliberately not a gate -- it needs the report on disk, and a check that
cannot run must not pass (the verify_against_poling precedent).
"""
import argparse
import math
import os
import re
import subprocess
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HOME = os.path.join(ROOT, "thirdParty", "nasa-tp2002")
PDF = os.path.join(HOME, "NASA-TP-2002-211556.pdf")
URL = "https://ntrs.nasa.gov/api/citations/20020085330/downloads/20020085330.pdf"

SOURCE_CLASS = "publicDomain"      # the licence word every printed block declares
LICENCE_WORD = SOURCE_CLASS        # check_source_licence cross-checks this constant
REPORT = ("McBride, Zehe & Gordon, NASA Glenn Coefficients for Calculating "
          "Thermodynamic Properties of Individual Species, NASA/TP-2002-211556 (2002)")
R = 8.314510                        # J/(mol K), the report's own constant (Cohen 1987)
T0 = 298.15

_REC2 = re.compile(r'^\s*(\d+)\s+(\S+(?:\s\S+)?)\s+(.*?)\s+(\d)\s+(\d+\.\d+)\s+(-?\d+\.\d+)\s*$')
_TRNG = re.compile(r'^\s*(\d+\.\d{3})\s+(\d+\.\d{3})\s*7 -2\.0 -1\.0 0\.0 1\.0 2\.0 3\.0 '
                   r'4\.0 0\.0\s+(-?\d+\.\d+)\s*$')
_NUM = re.compile(r'-?\d\.\d{9}D[+-]\d\d')
_B1 = re.compile(r'^\s+(\S+)\s+(\d+\.\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)'
                 r'\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s*$')
_FOOT = (re.compile(r'^\s*NASA/TP.{1,3}2002-211556\s+(\d+)\s*$'),
         re.compile(r'^\s*(\d+)\s+NASA/TP.{1,3}2002-211556\s*$'))


def refuse(msg):
    sys.exit("nasa_tp2002_to_choupo: REFUSED -- " + msg)


def report_lines():
    if not os.path.isfile(PDF):
        refuse(f"{os.path.relpath(PDF, ROOT)} is absent.  It is a public-domain "
               "US government report; fetch it with --fetch (or place your own copy).")
    try:
        txt = subprocess.run(["pdftotext", "-layout", PDF, "-"], check=True,
                             capture_output=True, text=True).stdout
    except (OSError, subprocess.CalledProcessError) as e:
        refuse(f"pdftotext could not read the report ({e}); there is no fallback.")
    #  split on newline ONLY: str.splitlines() also splits on the form feed
    #  pdftotext puts between pages, and every line number then drifts.
    return txt.split("\n")


def page_of(lines):
    feet = []
    for i, l in enumerate(lines):
        for rx in _FOOT:
            m = rx.match(l)
            if m:
                feet.append((i, int(m.group(1))))
                break

    def f(i):
        for li, n in feet:
            if li >= i:
                return n
        return None
    return f


def _nums(l):
    return [float(x.replace("D", "E")) for x in _NUM.findall(l)], _NUM.findall(l)


def parse(lines):
    start = next(i for i, l in enumerate(lines) if l.strip() == "Appendix D")
    ad, i = {}, start
    while i < len(lines) - 1:
        m = _REC2.match(lines[i + 1])
        if m and lines[i].strip() and not _TRNG.match(lines[i]):
            name = lines[i].split()[0]
            nt, j, ivs = int(m.group(1)), i + 2, []
            while len(ivs) < nt and j < len(lines):
                t = _TRNG.match(lines[j])
                if not t:
                    j += 1
                    continue
                rows, k = [], j + 1
                while len(rows) < 2 and k < len(lines):
                    v, s = _nums(lines[k])
                    if v:
                        rows.append((v, s, k))
                    k += 1
                (v1, s1, k1), (v2, s2, k2) = rows
                if len(v1) != 5 or len(v2) not in (4, 5):
                    refuse(f"appendix D entry {name}: an interval line does not "
                           "carry the 9 numbers the FORTRAN format prints")
                ivs.append(dict(Tlo=float(t.group(1)), Thi=float(t.group(2)),
                                a=v1 + v2[:2], a_text=s1 + s2[:2], b=v2[-2:], line=j))
                j = k
            ad.setdefault(name, dict(refs=" ".join(lines[i].split()[1:]),
                                     Hf=float(m.group(6)), Hf_text=m.group(6),
                                     MW=float(m.group(5)), ivs=ivs, line=i))
            i = j
        else:
            i += 1
    b1 = {}
    for i, l in enumerate(lines[:start]):
        m = _B1.match(l)
        if m and m.group(1) not in b1:
            b1[m.group(1)] = dict(dfH=float(m.group(5)), S=float(m.group(8)),
                                  S_text=m.group(8), line=i)
    return ad, b1


def checked(name, ad, b1, page):
    """The entry, with H and S at 298.15 K recomputed from its own printed
    coefficients and held to the printed values -- or a refusal."""
    if name not in ad:
        refuse(f"'{name}' is not an entry of appendix D")
    if name not in b1:
        refuse(f"'{name}' has no Table B1 row")
    e, row = ad[name], b1[name]
    ivs = [v for v in e["ivs"] if v["Thi"] <= 6000.0]
    if len(ivs) != 2 or ivs[0]["Thi"] != ivs[1]["Tlo"]:
        refuse(f"'{name}': expected two intervals meeting below 6000 K, found "
               f"{[(v['Tlo'], v['Thi']) for v in e['ivs']]}")
    v = next(x for x in ivs if x["Tlo"] <= T0 <= x["Thi"])
    a, b = v["a"], v["b"]
    T = T0
    H = R * T * (-a[0] / T**2 + a[1] * math.log(T) / T + a[2] + a[3] * T / 2
                 + a[4] * T**2 / 3 + a[5] * T**3 / 4 + a[6] * T**4 / 5 + b[0] / T)
    S = R * (-a[0] / (2 * T**2) - a[1] / T + a[2] * math.log(T) + a[3] * T
             + a[4] * T**2 / 2 + a[5] * T**3 / 3 + a[6] * T**4 / 4 + b[1])
    if abs(H - e["Hf"]) > 1.0:
        refuse(f"'{name}': H(298.15) from appendix D's own coefficients is "
               f"{H:.3f} J/mol against its record line {e['Hf']:.3f}")
    if abs(S - row["S"]) > 0.0015:
        refuse(f"'{name}': S(298.15) from appendix D's own coefficients is "
               f"{S:.3f} J/(mol K) against Table B1's printed {row['S']:.3f} -- "
               "the report disagrees with itself; a curator decides, not this tool")
    if abs(row["dfH"] * 1000.0 - e["Hf"]) > 1.0:
        refuse(f"'{name}': Table B1 dfH {row['dfH']} kJ/mol against appendix D "
               f"{e['Hf']} J/mol")
    pages = sorted({page(v["line"]) for v in ivs} | {page(e["line"])})
    return dict(e=e, row=row, ivs=ivs, adpages=pages, b1page=page(row["line"]),
                H=H, S=S)


def fmt(x):
    m, ex = x.split("D")
    return f"{m}e{ex}"


def pagestr(p):
    return f"p. {p[0]}" if len(p) == 1 else f"pp. {p[0]}-{p[-1]}"


def block(name, c):
    e, row, lo, hi = c["e"], c["row"], c["ivs"][0], c["ivs"][1]
    ad, b1 = pagestr(c["adpages"]), f"p. {c['b1page']}"
    L = []
    L.append("standardThermochemistry")
    L.append("{")
    L.append(f"    dHf_298    {float(e['Hf_text']):.3f};   // J/mol  -- ideal gas; NASA/TP-2002-211556 appendix D, {ad}, entry {name}")
    L.append(f"    s_298      {row['S_text']};     // J/(mol·K) -- third-law absolute; Table B1, {b1}")
    L.append("}")
    L.append("")
    L.append("idealGasHeatCapacity")
    L.append("{")
    L.append("    //  NASA/TP-2002-211556 eq. (1), Cp/R = a1/T^2 + a2/T + a3 + a4 T + a5 T^2")
    L.append(f"    //  + a6 T^3 + a7 T^4; appendix D, {ad}, entry {name}, a1..a7 as printed.")
    if len(e["ivs"]) > 2:
        L.append("    //  The report's 6000-20000 K interval is not transcribed.")
    L.append("    model    NASA9;")
    L.append(f"    Tlow     {lo['Tlo']:g};")
    L.append(f"    Tcommon  {lo['Thi']:g};")
    L.append(f"    Thigh    {hi['Thi']:g};")
    L.append("    low      ( " + " ".join(fmt(s) for s in lo["a_text"]) + " );")
    L.append("    high     ( " + " ".join(fmt(s) for s in hi["a_text"]) + " );")
    L.append("}")
    prov = []
    prov.append(("dHf_298", f"NASA/TP-2002-211556 appendix D, {ad}, entry {name}, record-line H(298.15) (elements reference, so = dHf)",
                 f"Table B1 {b1} prints {row['dfH']} kJ/mol; the report's own sources: {e['refs']}"))
    prov.append(("s_298", f"NASA/TP-2002-211556 Table B1, {b1}, entry {name}",
                 f"appendix D's coefficients with b2 integrate to {c['S']:.3f}"))
    prov.append(("idealGasHeatCapacity", f"NASA/TP-2002-211556 appendix D, {ad}, entry {name}, "
                 f"a1..a7 of the {lo['Tlo']:g}-{lo['Thi']:g} K and {hi['Tlo']:g}-{hi['Thi']:g} K intervals, as printed",
                 "read by bin/curate/nasa_tp2002_to_choupo.py, which holds H and S at 298.15 K to the printed values"))
    return L, prov


def provenance_block(prov):
    L = ["provenance", "{"]
    for key, method, notes in prov:
        L += [f"    {key}", "    {", "        origin        literature;",
              f"        method        \"{method}\";",
              "        methodVersion \"NASA/TP-2002-211556\";",
              "        uncertainty   \"not quantified by source\";",
              f"        notes         \"{notes}\";", "    }"]
    L += [f"    source   \"{REPORT}\";",
          f"    licence  {LICENCE_WORD};    // US government work (NASA), 17 U.S.C. 105",
          "}"]
    return L


def cmd_block(names):
    lines = report_lines()
    ad, b1 = parse(lines)
    page = page_of(lines)
    for n in names:
        L, prov = block(n, checked(n, ad, b1, page))
        print(f"// ---- {n} ----")
        print("\n".join(L))
        print()
        print("\n".join(provenance_block(prov)))
        print()


#  An entry name may itself carry a comma ("C2H3,vinyl"), so it ends at a
#  comma FOLLOWED BY A SPACE, a space, or a semicolon -- never at the bare comma.
_ENTRY = re.compile(r'appendix D, pp?\. [\d-]+, entry (\S+?)(?:,\s|\s|;)')


def cmd_verify():
    """Every record naming this report: its NASA9 coefficients, dHf_298 and
    s_298 must be the printed ones."""
    lines = report_lines()
    ad, b1 = parse(lines)
    page = page_of(lines)
    bad, seen = [], 0
    for base in ("data/standards/components", "tutorials"):
        for dp, _, fs in os.walk(os.path.join(ROOT, base)):
            for f in fs:
                if not f.endswith(".dat"):
                    continue
                p = os.path.join(dp, f)
                t = open(p, errors="ignore").read()
                if "TP-2002-211556" not in t or "model    NASA9" not in t:
                    continue
                m = _ENTRY.search(t)
                if not m:
                    bad.append(f"{p}: names the report but no 'entry <name>'")
                    continue
                seen += 1
                c = checked(m.group(1), ad, b1, page)
                L, _ = block(m.group(1), c)
                #  The Cp coefficients always; the formation pair only where the
                #  record says it took them from the report (a case-local
                #  override replaced the heat capacity alone).
                wants = [L[-3].strip(), L[-2].strip()]
                if "Table B1" in t:
                    wants += [L[2].split("//")[0].strip(), L[3].split("//")[0].strip()]
                for want in wants:
                    if " ".join(want.split()) not in " ".join(t.split()):
                        bad.append(f"{os.path.relpath(p, ROOT)}: does not carry `{want[:70]}...`")
    for b in bad:
        print("  MISMATCH " + b)
    print(f"nasa_tp2002_to_choupo verify: {seen} record(s) held to the report, "
          f"{len(bad)} mismatch(es)")
    return 1 if bad else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--fetch", action="store_true", help="download the report into thirdParty/nasa-tp2002/")
    ap.add_argument("cmd", nargs="?", choices=["block", "verify"])
    ap.add_argument("names", nargs="*")
    a = ap.parse_args()
    if a.fetch:
        os.makedirs(HOME, exist_ok=True)
        urllib.request.urlretrieve(URL, PDF)
        print(f"fetched {URL} -> {os.path.relpath(PDF, ROOT)}")
    if a.cmd == "block":
        cmd_block(a.names)
    elif a.cmd == "verify":
        return cmd_verify()
    return 0


if __name__ == "__main__":
    sys.exit(main())
