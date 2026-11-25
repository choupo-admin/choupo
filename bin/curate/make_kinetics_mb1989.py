#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Write the whole of Miller & Bowman 1989 into the reaction library (DEV.md 4c C339, C458).

A CURATION TOOL.  Appendix A (235 reactions, 51 species, pp. 331-336) and Appendix B (73 reactions,
pp. 337-338) of J.A. Miller and C.T. Bowman, Prog. Energy Combust. Sci. 15 (1989) 287-338, as the review
docs/reviews/2026-11-22-miller-bowman/mb1989_table.tsv read them from the page images (two readings, every
row with its printed page).  Nothing is read anew here: every number of a record is taken from its row and
from nothing else, and the tool REFUSES a row it cannot place.

WHERE A RECORD GOES.  A reaction is a FOLDER named by its canonical equation, a source a FILE in it
(src/thermo/reaction/KineticsLibrary.H):

    kinetics/H+O2=O+OH/MillerBowman1989.dat       (O Conaire's constant for the same equation sits beside it)

  * A reaction that Appendix B repeats with the SAME numbers is one record, a member of both appendices' sets
    (`MillerBowman1989_AppA` label A<n>, `MillerBowman1989_AppB` label B<m>); B-only reactions are records of
    the same source.
  * Where Appendix B prints DIFFERENT numbers for an equation Appendix A also has (the third-body efficiencies
    of H + O2 + M and 2H + M, A of N2O + M), Appendix B's value is a second file of that folder,
    `MillerBowman1989_B.dat`, and the set `MillerBowman1989_AppB` draws it: one paper, two printed values.
  * The 46 reactions of the C1 chain keep their stage sets (MB1989_attack ... MB1989_ethane) and the set
    `MillerBowman1989` of the cases that read it.
  * A species on both sides (2H + H2 = 2H2; HCCOH + H = CH2CO + H) is a `spectators true;` record: the
    equation is read from its multiplicities, not its net coefficients.

SPECIES.  The records carry the catalogue's names; the paper's own symbols are kept in `printedEquation`.
The map is printed by every run:  1CH2 (the paper's singlet CH2)  C2H2 acetylene  C2H3 C2H3_vinyl
C2H4 ethylene  C2H6 ethane  C3H3 C3H3_1propynl  CH2O HCHO  H2O water; every other symbol is the catalogue's.
The tool lists the species no record of components/ or thermoTables/ holds (it writes the record all the same:
the library is the paper's reaction list, the run refuses a species it cannot price).

usage:  bin/curate/make_kinetics_mb1989.py            (writes the records and the sets)
"""
import csv
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from make_kinetics_seed import canonical, canonical_sides, header, stoich_text  # noqa: E402


def header(stem, what, _h=header):
    return _h(stem, what).replace("make_kinetics_seed.py", "make_kinetics_mb1989.py")


ROOT = os.path.dirname(os.path.dirname(HERE))
KIN = os.path.join(ROOT, "data", "standards", "kinetics")
TSV = os.path.join(ROOT, "docs", "reviews", "2026-11-22-miller-bowman", "mb1989_table.tsv")

NAME = {"C2H2": "acetylene", "C2H3": "C2H3_vinyl", "C2H4": "ethylene", "C2H6": "ethane",
        "C3H3": "C3H3_1propynl", "CH2O": "HCHO", "H2O": "water"}
CITE = "Miller and Bowman, Prog. Energy Combust. Sci. 15 (1989) 287-338"
DOI = "10.1016/0360-1285(89)90017-8"
SRC = "MillerBowman1989"
SRC_B = "MillerBowman1989_B"
SET_A, SET_B = "MillerBowman1989_AppA", "MillerBowman1989_AppB"
TABLE = {"A": "Appendix A (C/H/O/N mechanism)", "B": "Appendix B (ammonia mechanism)"}

# the C1 chain of the methane-assembly lesson: stage set -> the paper's reaction numbers (Appendix A)
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
CHAIN = sorted(STAGE_OF)


def nm(s):
    return NAME.get(s, s)


def read_rows():
    with open(TSV) as f:
        return [r for r in csv.DictReader(f, delimiter="\t") if r["table"] in ("A", "B")]


def parse_side(side):
    """('(+M)' | '+M' | '', [species with multiplicity]); `1CH2` is a species, 2H is two H."""
    form = ""
    if side.endswith("(+M)"):
        form, side = "(+M)", side[:-4]
    parts = []
    for p in side.split("+"):
        if not p:
            continue
        m = re.match(r"([2-9])([A-Za-z].*)$", p)
        parts += [m.group(2)] * int(m.group(1)) if m else [p]
    if "M" in parts:
        form = "+M"
        parts.remove("M")
    return form, parts


def parse_eq(eq):
    """form, nu pairs (net), left species as printed, the two sides' multiplicities (catalogue names)."""
    lhs, rhs = eq.split("=")
    form, left = parse_side(lhs)
    _, right = parse_side(rhs)
    left, right = [nm(s) for s in left], [nm(s) for s in right]
    nu = {}
    for s in left:
        nu[s] = nu.get(s, 0) - 1
    for s in right:
        nu[s] = nu.get(s, 0) + 1
    return form, nu, left, right


def spaced(eq):
    """The equation as printed, spaced: `2CH3(+M)=C2H6(+M)` -> `2CH3 (+M) = C2H6 (+M)`."""
    out = []
    for side in eq.split("="):
        side = side.replace("(+M)", "\x00")
        out.append(" + ".join(side.split("+")).replace("\x00", " (+M)").replace("  ", " ").strip())
    return " = ".join(out)


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
        low = "low  { A %s;  b %s;  Ea %s;  %s }" % (num(r["lowA"]), num(r["lowN"]), num(r["lowE"].rstrip(".") or "0"), u)
        m = re.match(r"SRI\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)", r["falloff"])
        t = re.match(r"Troe a=(\S+) T\*=(\S+) T\*\*=(\S+?)\.?\s", r["falloff"] + " ")
        if m:
            shape = "    sri ( %s );\n" % " ".join(num(x.rstrip(".") or "0") for x in list(m.groups()) + ["0"])
        elif t:
            shape = "    troe ( %s );\n" % " ".join(num(x) for x in t.groups())
        else:
            assert r["falloff"].startswith("Lindemann"), r["falloff"]
            shape = ""                       # a Lindemann fall-off: the low-pressure limit alone
        return ("    type falloff;\n    %s\n    %s\n%s    thirdBody { %s }\n    %s"
                % (base, low, shape, effs(r["eff"]), u))
    sys.exit("unknown type " + r["type"])


def sig(r):
    return (r["type"], r["A"], r["n"], r["E"], r["lowA"], r["lowN"], r["lowE"], r["falloff"], r["eff"])


def label(r):
    return "%s%s" % (r["table"], r["rxn"])


def reaction_field(r):
    return r["rxn"] if r["rxn"].isdigit() else '"%s"' % r["rxn"]


def main():
    rows = read_rows()
    # ---- identity of every row ------------------------------------------------------------------
    info = {}
    for r in rows:
        form, nu, left, right = parse_eq(r["equation"])
        spectators = any(nu.get(s, 0) == 0 or (s in left and s in right) for s in set(left) | set(right))
        spectators = bool(set(left) & set(right))
        if spectators:
            stem = canonical_sides(left, right, form, True)
        else:
            stem = canonical([(s, n) for s, n in sorted(nu.items()) if n], form, True)
        info[label(r)] = (stem, form, nu, left, right, spectators)
    by = {}
    for r in rows:
        by.setdefault(info[label(r)][0], []).append(r)
    # one equation twice in one appendix would be a summed duplicate: not in this paper, refused if it appears
    for stem, rs in by.items():
        for t in "AB":
            if sum(1 for r in rs if r["table"] == t) > 1:
                sys.exit("%s is printed twice in Appendix %s: number the terms @1, @2 and say so" % (stem, t))
    # ---- the files -----------------------------------------------------------------------------
    unknown = set()
    written = []
    members = {SET_A: [], SET_B: []}
    for stem, rs in sorted(by.items()):
        a = next((r for r in rs if r["table"] == "A"), None)
        b = next((r for r in rs if r["table"] == "B"), None)
        files = []                       # (source name, the row that fixes the numbers, [labels], other)
        if a and b and sig(a) == sig(b):
            files.append((SRC, a, [a, b]))
        elif a and b:
            files.append((SRC, a, [a]))
            files.append((SRC_B, b, [b]))
        else:
            files.append((SRC, a or b, [a or b]))
        for source, r, rlist in files:
            _, form, nu, left, right, spectators = info[label(r)]
            sets = []
            for x in rlist:
                sets.append((SET_A if x["table"] == "A" else SET_B, label(x)))
                members[sets[-1][0]].append(label(x))
            if "A" in [x["table"] for x in rlist] and r["rxn"] in STAGE_OF and r["table"] == "A":
                sets = [("MillerBowman1989", "A" + r["rxn"]), (STAGE_OF[r["rxn"]], "A" + r["rxn"])] + sets
            for s in nu:
                unknown.add(s)
            others = [x for x in rlist if x is not r]
            if len(rlist) == 2:
                other = rlist[1]
                also = ("    alsoPrinted \"Appendix %s reaction %s, p. %s: the same numbers\";\n"
                        % (other["table"], other["rxn"], other["page"]))
            else:
                also = ""
            note = "one mechanism's value, as printed (cm3, mol, s, cal/mol); not an evaluated constant"
            if r["notes"]:
                note += "; the review's note: " + r["notes"].replace('"', "'")
            if source == SRC_B:
                note += "; Appendix B prints other numbers than Appendix A for this equation, this is B's"
            src = ("source\n{\n    citation \"%s\";\n    doi \"%s\";\n"
                   "    table \"%s\";\n    page %s;\n    reaction %s;\n%s"
                   "    note \"%s\";\n}"
                   % (CITE, DOI, TABLE[r["table"]], r["page"], reaction_field(r), also, note))
            prov = ("provenance\n{\n    kinetics\n    {\n        origin        literature;\n"
                    "        method        \"%s, Appendix %s, reaction %s (journal p. %s), A in cm3 mol-1 s-1, Ea in cal/mol, as printed\";\n"
                    "        methodVersion \"Prog. Energy Combust. Sci. 15 (1989) 287\";\n"
                    "        uncertainty   \"not given by the source\";\n    }\n}" % (CITE, r["table"], r["rxn"], r["page"]))
            if spectators:
                species = sorted(set(left) | set(right))
                st = "\n".join("        { component %s nu %2d;  order %d;  orderRev %d; }"
                               % ((s + ";").ljust(8), right.count(s) - left.count(s), left.count(s), right.count(s))
                               for s in species)
                flag = "spectators       true;\n"
            else:
                st = stoich_text([(s, n) for s, n in sorted(nu.items()) if n])
                flag = ""
            lim = left[0]
            text = (header(stem, "%s, Appendix %s reaction %s (p. %s)" % (CITE, r["table"], r["rxn"], r["page"])) +
                    "recordType        elementaryReaction;\nreversible        true;\n%s"
                    "printedEquation  \"%s\";\n"
                    "limitingReactant  %s;\nstoichiometry\n(\n%s\n);\nkinetics\n{\n%s\n}\n"
                    "sets { %s }\n%s\n"
                    "reviewStatus      interim;\n"
                    "reviewReason      \"read from the page images of Appendix %s in two passes (docs/reviews/2026-11-22-miller-bowman/); "
                    "not yet read back by the curator\";\n%s\n"
                    % (flag, spaced(r["equation"]), lim, st, kinetics(r),
                       " ".join("%s %s;" % s for s in sets), src, r["table"], prov))
            d = os.path.join(KIN, stem)
            os.makedirs(d, exist_ok=True)
            with open(os.path.join(d, source + ".dat"), "w") as f:
                f.write(text)
            written.append((stem, source))
    # ---- the sets --------------------------------------------------------------------------------
    d = os.path.join(KIN, "sets")
    chain = "the C/H/O chain below, %d reactions of Appendix A" % len(CHAIN)
    sets = [("MillerBowman1989", "the C1 chain below, %d reactions of Appendix A" % len(CHAIN)),
            (SET_A, "the whole of Appendix A (%d reactions of the C/H/O/N mechanism, 51 species)" % len(members[SET_A])),
            (SET_B, "the whole of Appendix B (%d reactions of the ammonia mechanism); where B prints other numbers"
                    " than A the set draws B's" % len(members[SET_B]))]
    sets += [(s, WHAT[s]) for s, _, _ in STAGES]
    for name, what in sets:
        with open(os.path.join(d, name + ".dat"), "w") as f:
            f.write(
                "/*--------------------------------*- Choupo -*-----------------------*\\\n"
                "  Reaction set %s: %s.\n"
                "  Miller & Bowman 1989; the hydrogen-oxygen reactions of Appendix A are also the\n"
                "  OConaire2004 set's (a second source of the same equations).  Its members are the\n"
                "  records whose `sets {}` names it.\n"
                "\\*---------------------------------------------------------------------------*/\n"
                "recordType  kineticsSet;\n"
                "citation    \"%s\";\n"
                "doi         \"%s\";\n"
                "thermochemistry\n{\n"
                "    citation \"not printed in the appendices (the CHEMKIN thermodynamic data base of the period); "
                "the run reads the NASA TP-2002-211556 table\";\n}\n" % (name, what, CITE, DOI))
    print("species map (the paper's symbol -> the catalogue's): 1CH2 = singlet CH2; "
          + "; ".join("%s -> %s" % kv for kv in sorted(NAME.items())))
    print("%d records in %d folders; sets: %s" % (
        len(written), len({w[0] for w in written}),
        ", ".join("%s %d" % (k, len(v)) for k, v in sorted(members.items()))))
    nA = sum(1 for r in rows if r["table"] == "A")
    nB = sum(1 for r in rows if r["table"] == "B")
    assert (nA, nB) == (235, 73), (nA, nB)
    uncat = []
    sys.path.insert(0, HERE)
    import check_kinetics_library as g
    for s in sorted(unknown):
        if g.formula_of(s) is None:
            uncat.append(s)
    print("species neither in components/ nor in a thermoTables/ home: %s" % (", ".join(uncat) or "none"))


if __name__ == "__main__":
    main()
