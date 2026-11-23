#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Write the C1 carbon chain of Miller & Bowman 1989 into the reaction library
(DEV.md 4c C458, the methane-assembly lesson).

A CURATION TOOL.  Each record under data/standards/kinetics/ it writes is one row of
docs/reviews/2026-11-22-miller-bowman/mb1989_table.tsv (the Appendix A that a review
read from the page images, two readings, every row with its printed page): the numbers
are taken from the row and from nothing else, and the tool REFUSES a row that is not in
the table or whose equation is not the chain it was asked for.

These are the values of ONE published mechanism, not evaluated constants (Baulch et al.,
J. Phys. Chem. Ref. Data 34 (2005) 757 and Tsang & Hampson, JPCRD 15 (1986) 1087 are the
evaluated sources; neither is transcribed in this tree yet).  Each record says so.

The hydrogen-oxygen reactions of Appendix A are NOT written: the library already holds the
O Conaire 2004 set for that chemistry, and one equation has one record (the library cannot
yet hold two rate expressions for one equation).  Only equations the library lacks are added;
a row whose canonical equation already has a record that is not this one stops the run.

Species names are the catalogue's: formaldehyde is HCHO, water is `water`.  The singlet
CH2 (1CH2) and the CH2OH branch are left out of this chain on purpose.

usage:  bin/curate/make_kinetics_mb1989.py            (writes the records and the sets)
"""
import csv
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from make_kinetics_seed import canonical, header, stoich_text  # noqa: E402

def header(stem, what, _h=header):
    return _h(stem, what).replace("make_kinetics_seed.py", "make_kinetics_mb1989.py")

ROOT = os.path.dirname(os.path.dirname(HERE))
KIN = os.path.join(ROOT, "data", "standards", "kinetics")
TSV = os.path.join(ROOT, "docs", "reviews", "2026-11-22-miller-bowman", "mb1989_table.tsv")

NAME = {"H2O": "water", "CH2O": "HCHO", "C2H6": "ethane", "C2H4": "ethylene"}
CITE = ("Miller and Bowman, Prog. Energy Combust. Sci. 15 (1989) 287-338")
DOI = "10.1016/0360-1285(89)90017-8"

# the chain, in the order a student meets it: stage set -> the paper's reaction numbers
STAGES = [
    ("MB1989_attack", "CH4 is attacked by O2, H, OH, O and HO2 and gives CH3",
     ["3", "4", "5", "5a", "6"]),
    ("MB1989_methyl", "CH3 is consumed (recombination with H, O2, HO2, O, OH, H) and CH3O decays to CH2O",
     ["2", "7", "8", "9", "12", "13", "11", "14", "16", "18", "20", "22"]),
    ("MB1989_formyl", "CH2O -> HCO -> CO, and the CH2 that the methyl step makes",
     ["26", "42", "44", "46", "47", "48", "49", "50",
      "51", "52", "53", "54", "55", "56", "57", "58", "59", "60"]),
    ("MB1989_carbonMonoxide", "CO -> CO2, where most of the heat is released",
     ["61", "62", "63", "64"]),
    ("MB1989_ethane", "two CH3 recombine to ethane, ethane is attacked, C2H5 returns CH3 or goes to ethylene",
     ["1", "65", "66", "67", "68", "74", "75"]),
]
WHAT = {s: w for s, w, _ in STAGES}
STAGE_OF = {r: s for s, _, rs in STAGES for r in rs}


def nm(s):
    return NAME.get(s, s)


def read_rows():
    with open(TSV) as f:
        rows = list(csv.DictReader(f, delimiter="\t"))
    return {r["rxn"]: r for r in rows if r["table"] == "A"}


def parse_side(side):
    form = ""
    if side.endswith("(+M)"):
        form, side = "(+M)", side[:-4]
    parts = []
    for p in side.split("+"):
        if not p:
            continue
        m = re.match(r"(\d+)([A-Za-z].*)$", p)
        parts += [m.group(2)] * int(m.group(1)) if m else [p]
    if "M" in parts:
        form = "+M"
        parts.remove("M")
    return form, parts


def parse_eq(eq):
    lhs, rhs = eq.split("=")
    form, left = parse_side(lhs)
    _, right = parse_side(rhs)
    nu = {}
    for s in left:
        nu[nm(s)] = nu.get(nm(s), 0) - 1
    for s in right:
        nu[nm(s)] = nu.get(nm(s), 0) + 1
    nu = [(s, n) for s, n in sorted(nu.items()) if n != 0]
    return form, nu, nm(left[0])


def effs(txt):
    out = []
    for it in txt.split():
        k, v = it.split("=")
        out.append("%s %s;" % (nm(k), float(v) if "." in v else v))
    return " ".join(out)


def num(x):
    return "%.10g" % float(x)


def kinetics(r):
    A, n, E = r["A"], r["n"], r["E"]
    u = 'units { A "cm3/mol/s"; Ea "cal/mol"; }'
    base = "A %s;  b %s;  Ea %s;" % (num(A), num(n), num(E.rstrip(".") or "0"))
    if r["type"] == "elementary":
        return "    type modifiedArrhenius;\n    %s\n    %s" % (base, u)
    if r["type"] == "thirdbody":
        return ("    type thirdBody;\n    %s\n    thirdBody { %s }\n    %s"
                % (base, effs(r["eff"]) if r["eff"] else "", u))
    if r["type"] == "falloff":
        low = "low  { A %s;  b %s;  Ea %s;  %s }" % (num(r["lowA"]), num(r["lowN"]), num(r["lowE"]), u)
        m = re.match(r"SRI\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)", r["falloff"])
        t = re.match(r"Troe a=(\S+) T\*=(\S+) T\*\*=(\S+?)\.?\s", r["falloff"] + " ")
        if m:
            sri = "sri ( %s );" % " ".join(num(x.rstrip(".") or "0") for x in list(m.groups()) + ["0"])
        else:
            assert t, r["falloff"]
            sri = "troe ( %s );" % " ".join(num(x) for x in t.groups())
        return ("    type falloff;\n    %s\n    %s\n    %s\n    thirdBody { %s }\n    %s"
                % (base, low, sri, effs(r["eff"]), u))
    sys.exit("unknown type " + r["type"])


def main():
    rows = read_rows()
    written = []
    for rxn, stage in STAGE_OF.items():
        if rxn not in rows:
            sys.exit("reaction %s of the chain is not a row of the table" % rxn)
    for rxn in [x for _, _, rs in STAGES for x in rs]:
        r = rows[rxn]
        form, nu, lim = parse_eq(r["equation"])
        stem = canonical(nu, form, True)
        path = os.path.join(KIN, stem + ".dat")
        if os.path.exists(path) and "Miller and Bowman" not in open(path).read():
            sys.exit("%s: the library already holds a record for %s that is not Miller & Bowman's"
                     " (one equation, one record): stop and report" % (rxn, stem))
        stage = STAGE_OF[rxn]
        src = ("source\n{\n    citation \"%s\";\n    doi \"%s\";\n"
               "    table \"Appendix A (C/H/O/N mechanism)\";\n    page %s;\n    reaction %s;\n"
               "    note \"one mechanism's value, as printed (cm3, mol, s, cal/mol); not an evaluated constant\";\n}"
               % (CITE, DOI, r["page"], rxn if rxn.isdigit() else '"%s"' % rxn))
        prov = ("provenance\n{\n    kinetics\n    {\n        origin        literature;\n"
                "        method        \"%s, Appendix A, reaction %s (journal p. %s), A in cm3 mol-1 s-1, Ea in cal/mol, as printed\";\n"
                "        methodVersion \"Prog. Energy Combust. Sci. 15 (1989) 287\";\n"
                "        uncertainty   \"not given by the source\";\n    }\n}" % (CITE, rxn, r["page"]))
        text = (header(stem, "%s, Appendix A reaction %s (p. %s)" % (CITE, rxn, r["page"])) +
                "recordType        elementaryReaction;\nreversible        true;\n"
                "limitingReactant  %s;\nstoichiometry\n(\n%s\n);\nkinetics\n{\n%s\n}\n"
                "sets { MillerBowman1989 A%s; %s A%s; }\n%s\n"
                "reviewStatus      interim;\n"
                "reviewReason      \"read from the page images of Appendix A in two passes (docs/reviews/2026-11-22-miller-bowman/); "
                "not yet read back by the curator\";\n%s\n"
                % (lim, stoich_text(nu), kinetics(r), rxn, stage, rxn, src, prov))
        with open(path, "w") as f:
            f.write(text)
        written.append(stem)
    d = os.path.join(KIN, "sets")
    all_members = sorted(x for _, _, rs in STAGES for x in rs)
    sets = [("MillerBowman1989", "the whole C1 chain below, %d reactions of Appendix A" % len(all_members))]
    sets += [(s, WHAT[s]) for s, _, _ in STAGES]
    for name, what in sets:
        with open(os.path.join(d, name + ".dat"), "w") as f:
            f.write(
                "/*--------------------------------*- Choupo -*-----------------------*\\\n"
                "  Reaction set %s: %s.\n"
                "  A part of the C/H/O chain of Miller & Bowman 1989, Appendix A; the hydrogen-oxygen\n"
                "  reactions of that appendix are the OConaire2004 set's.  Its members are the\n"
                "  records whose `sets {}` names it.\n"
                "\\*---------------------------------------------------------------------------*/\n"
                "recordType  kineticsSet;\n"
                "citation    \"%s\";\n"
                "doi         \"%s\";\n"
                "thermochemistry\n{\n"
                "    citation \"not printed in the appendices (the CHEMKIN thermodynamic data base of the period); "
                "the run reads the NASA TP-2002-211556 table\";\n}\n" % (name, what, CITE, DOI))
    print("%d records, %d sets" % (len(written), len(sets)))


if __name__ == "__main__":
    main()
