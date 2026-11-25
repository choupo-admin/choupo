#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Write the seed of the gas-phase reaction library (DEV.md 4c C458, slice 1).

A CURATION TOOL, run once to turn two things into records under
data/standards/kinetics/:

  * docs/reviews/2026-11-21-kinetics-seed/inline_reactions_until_2026-11-22.reactions --
    the constant/reactions that nox01_zeldovich_postflame carried until the library
    existed, VERBATIM: the 21 entries of O Conaire et al. 2004, Table I (Int. J. Chem.
    Kinet. 36, 603, DOI 10.1002/kin.20036, journal p. 607) -- the very text the ten
    ignition cases carried -- and the 8 Zeldovich / N2O entries of Glarborg et al. 2018
    (PECS 67, 31, Tables 2 and 5).  Each record's `stoichiometry`, `kinetics` block
    (numbers and layout as shipped), `reversible` and `limitingReactant` are that text.
  * docs/reviews/2026-11-21-kinetics-seed/oconaire2004_table.tsv -- each printed line of
    Table I as the journal page prints it, read from the page image by a review: this
    tool REFUSES a record whose A, b, Ea differ from its row, and takes from it the page,
    the footnotes and the third-body efficiencies of Ar and He the shipped case omitted
    (the run does not carry those species, and the engine does not apply them).

The Glarborg paper's PAGE was never read in this tree: those records say
`page unrecorded` and stay `interim`.

The identity of a record is its canonical equation (src/thermo/reaction/KineticsLibrary.H);
this tool derives the file name with the same rule and bin/curate/check_kinetics_library.py
holds the two together.

usage:  bin/curate/make_kinetics_seed.py            (writes the records)
"""
import csv
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
KIN = os.path.join(ROOT, "data", "standards", "kinetics")
SEED = os.path.join(ROOT, "docs", "reviews", "2026-11-21-kinetics-seed")
TSV = os.path.join(SEED, "oconaire2004_table.tsv")
SHIPPED = os.path.join(SEED, "inline_reactions_until_2026-11-22.reactions")

NAME = {"H2O": "water"}   # the catalogue's name of a species the paper calls H2O

OC_CITE = ("O Conaire, Curran, Simmie, Pitz and Westbrook, Int. J. Chem. Kinet. "
           "36 (2004) 603-622")
OC_DOI = "10.1002/kin.20036"
GL_CITE = ("Glarborg, Miller, Ruscic and Klippenstein, Prog. Energy Combust. "
           "Sci. 67 (2018) 31-68")
GL_DOI = "10.1016/j.pecs.2018.01.002"

# the shipped entry label -> its row of Table I (a duplicate pair has one row each)
ROW = {
    "R1_H_O2_O_OH": "1", "R2_O_H2_H_OH": "2", "R3_OH_H2_H_H2O": "3", "R4_O_H2O_2OH": "4",
    "R5_H2_M_2H_M": "5", "R6_2O_M_O2_M": "6", "R7_O_H_M_OH_M": "7", "R8_H_OH_M_H2O_M": "8",
    "R9_H_O2_M_HO2": "9", "R10_HO2_H_H2_O2": "10", "R11_HO2_H_2OH": "11",
    "R12_HO2_O_OH_O2": "12", "R13_HO2_OH_H2O_O2": "13", "R14a_2HO2_H2O2_O2": "14a",
    "R14b_2HO2_H2O2_O2": "14b", "R15_H2O2_M_2OH": "15", "R16_H2O2_H_H2O_OH": "16",
    "R17_H2O2_H_H2_HO2": "17", "R18_H2O2_O_OH_HO2": "18", "R19a_H2O2_OH_H2O_HO2": "19a",
    "R19b_H2O2_OH_H2O_HO2": "19b",
}
# Glarborg 2018 entries: label -> (table, the paper's reaction name)
GL = {
    "Z1_N_NO_O_N2": ("Table 2", "Z1"), "Z2_N_OH_NO_H": ("Table 2", "Z2"),
    "Z3_N_O2_NO_O": ("Table 2", "Z3"), "N2O15_N2O_M_O_N2": ("Table 5", "R15"),
    "N2O16_N2O_H_N2_OH": ("Table 5", "R16"), "N2O17_NH_NO_N2O_H": ("Table 5", "R17"),
    "N2O18_N2O_O_2NO": ("Table 5", "R18"), "N2O19_N2O_O_N2_O2": ("Table 5", "R19"),
}
# the page of the journal image each table was read from (docs/reviews/2026-11-25-kinetics-glarborg/)
GLTSV = os.path.join(ROOT, "docs", "reviews", "2026-11-25-kinetics-glarborg", "glarborg2018_table.tsv")


def glarborg_rows():
    with open(GLTSV) as f:
        lines = [l for l in f if not l.startswith("#")]
    return {r["row"]: r for r in csv.DictReader(lines, delimiter="\t")}


# ---- identity: the SAME rule as KineticsLibrary.cpp canonicalStem ----------
def canonical(nu, form, reversible, duplicate=0):
    lhs, rhs = [], []
    for sp, n in nu:
        assert n == int(n) and n != 0
        (lhs if n < 0 else rhs).extend([sp] * abs(int(n)))
    return canonical_sides(lhs, rhs, form, reversible, duplicate)


def canonical_sides(lhs, rhs, form, reversible, duplicate=0):
    """The same, from the two sides' multiplicities (a species may be on both: `spectators true;`)."""
    lhs, rhs = list(lhs), list(rhs)
    lhs.sort()
    rhs.sort()
    suf = {"": "", "+M": "+M", "(+M)": "(+M)"}[form]
    if reversible:
        if rhs < lhs:
            lhs, rhs = rhs, lhs
        s = "+".join(lhs) + suf + "=" + "+".join(rhs) + suf
    else:
        s = "+".join(lhs) + suf + "~" + "+".join(rhs) + suf
    return s + ("@%d" % duplicate if duplicate else "")


# ---- the shipped text -------------------------------------------------------
def shipped_entries():
    text = open(SHIPPED).read()
    out = []
    for m in re.finditer(r"^(\w+)\n\{\n(.*?)^\}(?:\n|\Z)", text, re.S | re.M):
        label, body = m.group(1), m.group(2)
        if label == "provenance":
            continue
        rev = re.search(r"^\s*reversible\s+(\w+);", body, re.M).group(1)
        lim = re.search(r"^\s*limitingReactant\s+(\w+);", body, re.M).group(1)
        nu = [(c, int(n)) for c, n in
              re.findall(r"component\s+(\w+);\s+nu\s+(-?\d+);", body)]
        k = re.search(r"^    kinetics\n    \{\n(.*?)^    \}\n", body, re.S | re.M)
        inner = "\n".join(l[4:] if l.startswith("    ") else l for l in k.group(1).rstrip("\n").split("\n"))
        out.append(dict(label=label, reversible=rev, limiting=lim, nu=nu, kin=inner))
    return out


def tsv_rows():
    with open(TSV) as f:
        lines = [l for l in f if not l.startswith("#")]
    return {r["row"]: r for r in csv.DictReader(lines, delimiter="\t")}


def numbers(kin_text, key="A"):
    m = re.search(r"A\s+(\S+);\s+b\s+(\S+);\s+Ea\s+(\S+);", kin_text)
    return tuple(float(x) for x in m.groups())


def kin_type(kin_text):
    return re.search(r"type\s+(\w+);", kin_text).group(1)


def add_collider(kin_text, raw):
    """Ar and He of the paper's footnote, appended to the shipped thirdBody list."""
    raw = raw.split("(fn")[0].strip()
    extra = []
    for it in raw.split(";"):
        it = it.strip()
        if it and it.split()[0] in ("Ar", "He"):
            sp, v = it.split()
            extra.append("%s %s;" % (sp, v))
    if not extra:
        return kin_text
    return re.sub(r"thirdBody\s*\{([^}]*)\}",
                  lambda m: "thirdBody {%s %s }" % (m.group(1).rstrip(), " ".join(extra)),
                  kin_text, count=1)


def header(stem, what):
    return ("/*--------------------------------*- Choupo -*-----------------------*\\\n"
            "  Elementary reaction %s\n  %s\n"
            "  Written by bin/curate/make_kinetics_seed.py; the FOLDER name is the\n"
            "  canonical equation, the file its source (src/thermo/reaction/KineticsLibrary.H).\n"
            "\\*---------------------------------------------------------------------------*/\n"
            % (stem, what))


def stoich_text(nu):
    return "\n".join("        { component %s nu %2d; }" % ((sp + ";").ljust(8), n) for sp, n in nu)


def build(e, setname, source_block, prov, what, dup, reviewReason, printed=""):
    stem_form = {"thirdBody": "+M", "falloff": "(+M)"}.get(kin_type(e["kin"]), "")
    stem = canonical(e["nu"], stem_form, e["reversible"] == "true", dup)
    text = (header(stem, what) +
            "recordType        elementaryReaction;\n"
            "reversible        %s;\n%s%s"
            "limitingReactant  %s;\n"
            "stoichiometry\n(\n%s\n);\n"
            "kinetics\n{\n%s\n}\n"
            "sets { %s %s; }\n"
            "%s\n"
            "reviewStatus      interim;\n"
            "reviewReason      \"%s\";\n"
            "%s\n"
            % (e["reversible"], ("duplicate         %d;\n" % dup) if dup else "",
               ('printedEquation  "%s";\n' % printed) if printed else "",
               e["limiting"], stoich_text(e["nu"]), e["kin"], setname, e["label"],
               source_block, reviewReason, prov))
    #  A reaction is a folder named by its canonical equation, a source a file in it (C339).
    os.makedirs(os.path.join(KIN, stem), exist_ok=True)
    with open(os.path.join(KIN, stem, setname + ".dat"), "w") as f:
        f.write(text)
    return stem


def main():
    rows = tsv_rows()
    entries = shipped_entries()
    seen_oc = seen_gl = 0
    for e in entries:
        lab = e["label"]
        if lab in ROW:
            tag = ROW[lab]
            r = rows[tag] if tag in rows else rows[tag + "H"]
            # the shipped numbers are held to the page's, digit for digit
            if kin_type(e["kin"]) == "falloff":
                lo, hi = rows[tag.rstrip("ab") + "L"], rows[tag.rstrip("ab") + "H"]
                low_m = re.search(r"low\s+\{\s*A\s+(\S+);\s+b\s+(\S+);\s+Ea\s+(\S+);", e["kin"])
                got = [numbers(e["kin"]), tuple(float(x) for x in low_m.groups())]
                want = [tuple(float(hi[k]) for k in ("A_as_printed", "n_as_printed", "Ea_kcal_mol_as_printed")),
                        tuple(float(lo[k]) for k in ("A_as_printed", "n_as_printed", "Ea_kcal_mol_as_printed"))]
                r = lo
            else:
                got = [numbers(e["kin"])]
                want = [tuple(float(r[k]) for k in ("A_as_printed", "n_as_printed", "Ea_kcal_mol_as_printed"))]
            if got != want:
                sys.exit("%s: the shipped numbers %s are not the page's %s" % (lab, got, want))
            rx = r["paper_reaction_no"]
            dup = 1 if tag.endswith("a") else 2 if tag.endswith("b") else 0
            fnote = r["footnote_notes"]
            kin = e["kin"]
            if r["third_body_efficiencies"]:
                kin = add_collider(kin, r["third_body_efficiencies"])
            e = dict(e, kin=kin)
            src = ("source\n{\n    citation \"%s\";\n    doi \"%s\";\n"
                   "    table \"Table I (Revised H2/O2 Reaction Mechanism)\";\n"
                   "    page %s;\n    reaction %s;\n%s%s}"
                   % (OC_CITE, OC_DOI, r["page"].replace("p. ", ""), rx,
                      ("    footnotes \"%s\";\n" % fnote.replace('"', "'")) if fnote else "",
                      ("    duplicate \"term %d of a summed pair (footnote h): the two entries' rates add\";\n" % dup) if dup else ""))
            prov = ("provenance\n{\n    kinetics\n    {\n        origin        literature;\n"
                    "        method        \"%s, Table I, reaction %s (journal p. 607), A in cm3 mol-1 s-1, Ea in kcal/mol, as printed\";\n"
                    "        methodVersion \"Int. J. Chem. Kinet. 36 (2004) 603\";\n"
                    "        uncertainty   \"not given by the source\";\n    }\n}" % (OC_CITE, rx))
            build(e, "OConaire2004", src, prov, "%s, reaction %s of Table I" % (OC_CITE, rx), dup,
                  "transcribed by hand from journal page 607 and re-read against the page image by a reviewer "
                  "(docs/reviews/2026-11-21-kinetics-seed/); not yet read back by the curator",
                  printed=re.sub(r"\s*\(.*\)$", "", r["equation_as_printed"]))
            seen_oc += 1
        elif lab in GL:
            table, rx = GL[lab]
            grow = glarborg_rows()
            hi = grow["R15H" if rx == "R15" else rx]
            got = [numbers(e["kin"])]
            want = [(float(hi["A"]), float(hi["beta"]), float(hi["E_cal_mol"]))]
            if kin_type(e["kin"]) == "falloff":
                lo = grow[rx + "L"]
                low_m = re.search(r"low\s+\{\s*A\s+(\S+);\s+b\s+(\S+);\s+Ea\s+(\S+);", e["kin"])
                got.append(tuple(float(x) for x in low_m.groups()))
                want.append((float(lo["A"]), float(lo["beta"]), float(lo["E_cal_mol"])))
            if got != want:
                sys.exit("%s: the shipped numbers %s are not the journal page's %s" % (lab, got, want))
            page = hi["page"]
            src = ("source\n{\n    citation \"%s\";\n    doi \"%s\";\n"
                   "    table \"%s\";\n    page %s;\n    reaction \"%s\";\n"
                   "    note \"as printed (mol, cm, s, cal); the values nox01_zeldovich_postflame carried, held to the journal page image (read twice 2026-11-25, no digit differs)\";\n}"
                   % (GL_CITE, GL_DOI, table, page, rx))
            prov = ("provenance\n{\n    kinetics\n    {\n        origin        literature;\n"
                    "        method        \"%s, %s, reaction %s (journal p. %s), A in cm3 mol-1 s-1, Ea in cal/mol, as printed\";\n"
                    "        methodVersion \"Prog. Energy Combust. Sci. 67 (2018) 31\";\n"
                    "        uncertainty   \"not given by the source\";\n    }\n}" % (GL_CITE, table, rx, page))
            build(e, "Glarborg2018", src, prov, "%s, %s, reaction %s (p. %s)" % (GL_CITE, table, rx, page), 0,
                  "typed from the case that carried it (nox01_zeldovich_postflame) and read back against the journal page image "
                  "(docs/reviews/2026-11-25-kinetics-glarborg/), twice; not yet read back by the curator",
                  printed=hi["equation_as_printed"])
            seen_gl += 1
        else:
            sys.exit("entry %s is in neither set" % lab)
    assert seen_oc == 21 and seen_gl == 8, (seen_oc, seen_gl)
    sets()
    print("O Conaire 2004: %d records; Glarborg 2018: %d records" % (seen_oc, seen_gl))


def sets():
    d = os.path.join(KIN, "sets")
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "OConaire2004.dat"), "w") as f:
        f.write(
            "/*--------------------------------*- Choupo -*-----------------------*\\\n"
            "  Reaction set OConaire2004: the H2/O2 mechanism of Table I.  Its members\n"
            "  are the records whose `sets {}` names it.\n"
            "\\*---------------------------------------------------------------------------*/\n"
            "recordType  kineticsSet;\n"
            "citation    \"%s\";\n"
            "doi         \"%s\";\n"
            "thermochemistry\n{\n"
            "    citation \"the paper's own thermochemistry, its Table II (journal p. 607); not transcribed into the catalogue\";\n"
            "}\n" % (OC_CITE, OC_DOI))
    with open(os.path.join(d, "Glarborg2018.dat"), "w") as f:
        f.write(
            "/*--------------------------------*- Choupo -*-----------------------*\\\n"
            "  Reaction set Glarborg2018: the extended Zeldovich reactions (Table 2) and\n"
            "  the N2O route R15-R19 (Table 5) of the nitrogen mechanism.\n"
            "\\*---------------------------------------------------------------------------*/\n"
            "recordType  kineticsSet;\n"
            "citation    \"%s\";\n"
            "doi         \"%s\";\n"
            "thermochemistry\n{\n"
            "    citation \"the thermochemistry distributed with the mechanism; not in the catalogue\";\n"
            "}\n" % (GL_CITE, GL_DOI))


if __name__ == "__main__":
    main()
