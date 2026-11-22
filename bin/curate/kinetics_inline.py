# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""The reaction library's records written as the INLINE entries a case would carry
(DEV.md 4c C458 slice 1).

One implementation, two readers: bin/curate/check_kinetics_library.py builds the inline form of a
case and holds it equal to the library form, and the gate probes (bin/curate/case_records.py
`materialise`) write it into every probe copy of a case that asks a `reactionSet`, so a probe that
EDITS a reaction's text (a Troe list, an A, a stoichiometry line) edits what the case once carried.
KNOWN LIMIT: it models only what the shipped cases use -- `reactionSet(s)` of records whose
colliders are canonical names.  It does not model `reactionRecords`, the order in which a case lists
its sets, an efficiency written by an alias, or a mixture-expanded species; where it disagrees with
the engine on those, the engine is right and arm (c) of check_kinetics_library says nothing.
This module is a second implementation of `kineticsLibrary::materialise` ON PURPOSE: the gate
compares the two by running both.
"""
import re
from pathlib import Path

import record_reader as rr

REPO = Path(__file__).resolve().parent.parent.parent
KIN = REPO / "data" / "standards" / "kinetics"


def words(v):
    return [t.strip('"') for t in v] if isinstance(v, list) else []


def stoich(blk):
    toks = words(blk.get("stoichiometry"))
    out, i = [], 0
    while i < len(toks):
        if toks[i] == "component":
            sp = toks[i + 1]
            nu = None
            order = None
            j = i + 2
            while j < len(toks) and toks[j] != "}":
                if toks[j] == "nu":
                    nu = float(toks[j + 1])
                if toks[j] == "order":
                    order = float(toks[j + 1])
                j += 1
            out.append((sp, nu, order))
            i = j
        i += 1
    return out


def block_text(text, key):
    m = re.search(r"^%s\s*\{" % key, text, re.M)
    i = m.end()
    depth = 1
    while depth:
        c = text[i]
        depth += (c == "{") - (c == "}")
        i += 1
    return text[m.start():i]


def inline_text(sets_asked, present):
    out = []
    for f in sorted(KIN.glob("*.dat")):
        t = f.read_text()
        b = rr.parse_file(str(f))
        sb = b.get("sets")
        for s in sets_asked:
            if sb is None or s not in sb.keys():
                continue
            label = words(sb.get(s))[0]
            st = stoich(b)
            lines = []
            for sp, nu, order in st:
                o = order if order is not None else (-nu if nu < 0 else 0)
                lines.append("        { component %snu %2d;  order %g; }" % ((sp + ";").ljust(8), nu, o))
            kin = block_text(t, "kinetics")

            def keep(m):
                kept = []
                for it in m.group(1).split(";"):
                    it = it.strip()
                    if it and it.split()[0] in present:
                        kept.append(it + ";")
                return "thirdBody { %s }" % " ".join(kept)

            kin = re.sub(r"thirdBody\s*\{([^}]*)\}", keep, kin)
            lim = words(b.get("limitingReactant"))
            out.append("%s\n{\n    reversible        %s;\n%s    stoichiometry\n    (\n%s\n    );\n    %s\n}\n" % (
                label, words(b.get("reversible"))[0],
                ("    limitingReactant  %s;\n" % lim[0]) if lim else "",
                "\n".join(lines), kin.replace("\n", "\n    ")))
    return "\n".join(out)


def present_species(case):
    t = (case / "constant" / "thermoPhysPropDict").read_text()
    m = re.search(r"^components\s*\(([^)]*)\)", t, re.M)
    return set(m.group(1).split())


def asked_sets(text):
    t = rr.strip_comments(text)
    s = []
    m = re.search(r"reactionSet\s+(\S+);", t)
    if m:
        s.append(m.group(1))
    m = re.search(r"reactionSets\s*\(([^)]*)\)", t)
    if m:
        s += m.group(1).split()
    return s



def inline_reactions(case):
    """Replace a case's `reactionSet` constant/reactions by the inline entries (no-op for a case
    that asks none).  `case` is the case directory (a probe copy)."""
    p = Path(case) / "constant" / "reactions"
    if not p.is_file():
        return False
    text = p.read_text()
    sets = asked_sets(text)
    if not sets:
        return False
    keep = re.sub(r"(?m)^\s*reactionSets?\b[^;]*;\s*$", "", text)
    p.write_text(keep.rstrip("\n") + "\n\n" + inline_text(sets, present_species(Path(case))) + "\n")
    return True


def entries_of(text):
    """{label: whitespace-collapsed body} of a reactions text, comments and `provenance` left out."""
    t = rr.strip_comments(text)
    out = {}
    for m in re.finditer(r"(?m)^(\w+)\s*\n\{\n(.*?)^\}", t, re.S):
        if m.group(1) != "provenance":
            out[m.group(1)] = re.sub(r"\s+", " ", m.group(2)).strip()
    return out
