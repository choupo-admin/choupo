#!/usr/bin/env python3
# unifac_gct_to_choupo.py -- OFFLINE curation importer of the FULL literature
# UNIFAC parameter table from the ChemSep .gct files into Choupo's
# data/standards/unifac/.  Companion to chemsep_to_choupo.py (same ethos:
# deterministic, license-clean, cites the PRIMARY source, never fabricates).
#
# WHY this source is CLEAN: the ChemSep DATABASE (which compiles the published
# UNIFAC parameters) is (c) Harry Kooijman & Ross Taylor under the Artistic
# License 2.0 (FSF-listed, GPL-compatible) -- so aggregating it as DATA next to
# Choupo's GPL code is permitted (it keeps its own licence).  The numbers are
# the original/VLE UNIFAC set of Hansen, Rasmussen, Fredenslund, Schiller &
# Gmehling, Ind. Eng. Chem. Res. 30 (1991) 2352 -- CITE THAT primary, not the
# aggregator.  We use the DATABASE tables only, never the ChemSep simulator code.
#
# WHAT it does:
#   third_party/chemsep/ipd/unifacrq.gct  -> data/standards/unifac/groups.dat
#       (subgroup -> name, mainGroup, R_k, Q_k;  111 subgroups)
#   third_party/chemsep/ipd/unifacvl.gct  -> data/standards/unifac/interactions.dat
#       (main-group interaction matrix a_mn [K];  the full directed pair list)
#
# Subgroup/main names are emitted verbatim EXCEPT a tokenizer-safe sanitisation:
# '=' is kept (the Choupo dict tokenizer accepts it; dicts use no '=' operator),
# but parentheses/commas etc. (e.g. "(C)3N") become '_' so the dict parser does
# not read them as a list.  The mapping is applied consistently to groups.dat and
# interactions.dat so the two stay self-consistent.
#
# >>> REQUIRES the real ChemSep .gct files on disk (see third_party/chemsep/
#     README.md -- drop a ChemSep/DWSIM install's ipd/ there).  It does NOT
#     fabricate: a malformed line is skipped, never guessed.

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC  = ROOT / 'third_party' / 'chemsep' / 'ipd'
DST  = ROOT / 'data' / 'standards' / 'unifac'
RQ   = SRC / 'unifacrq.gct'      # subgroup R/Q table
VL   = SRC / 'unifacvl.gct'      # original-UNIFAC (VLE) interaction matrix


def sanitize(name: str) -> str:
    """Tokenizer-safe group name: keep alnum and = + _ - ; map ( ) , etc. -> _."""
    return re.sub(r'[^A-Za-z0-9=+_-]', '_', name)


HEADER = (
    "/*---------------------------------------------------------------------------*\\\n"
    "  UNIFAC {what} -- FULL original/VLE table ({n}).\n\n"
    "  Source: the ChemSep database (Artistic-2.0, (c) H. Kooijman & R. Taylor),\n"
    "  compiling the original UNIFAC (VLE) parameters of Hansen, Rasmussen,\n"
    "  Fredenslund, Schiller & Gmehling, Ind. Eng. Chem. Res. 30 (1991) 2352.\n"
    "  Imported by bin/curate/unifac_gct_to_choupo.py.  Cite the PRIMARY (Hansen 1991).\n"
    "  Subgroup names are tokenizer-sanitised (parens -> '_'); '=' kept verbatim.\n"
    "\\*---------------------------------------------------------------------------*/\n\n"
)


def import_groups() -> int:
    subs = []
    for ln in RQ.read_text().splitlines()[1:]:          # line 0 = "<N> Total ..."
        t = ln.split()
        if len(t) < 6:
            continue
        try:
            float(t[4]); float(t[5])                     # R, Q must be numeric
        except ValueError:
            continue
        subs.append((sanitize(t[1]), sanitize(t[3]), t[4], t[5]))
    out = [HEADER.format(what="subgroups (R_k, Q_k) + their main group",
                         n=f"{len(subs)} subgroups"),
           "subgroups\n(\n",
           "    // name           mainGroup        R          Q\n"]
    for name, main, R, Q in subs:
        out.append(f"    {{ name {name}; mainGroup {main}; R {R}; Q {Q}; }}\n")
    out.append(");\n")
    (DST / 'groups.dat').write_text(''.join(out))
    return len(subs)


def import_interactions() -> int:
    pairs = []
    for ln in VL.read_text().splitlines()[1:]:          # line 0 = "<N> Total ..."
        t = ln.split()
        if len(t) < 6:                                   # the main-group name lines (2 fields)
            continue
        try:
            a_ij = float(t[4]); a_ji = float(t[5])
        except ValueError:
            continue
        ni, nj = sanitize(t[1]), sanitize(t[3])
        pairs.append((ni, nj, a_ij))
        pairs.append((nj, ni, a_ji))                     # the matrix gives both directions
    out = [HEADER.format(what="main-group interaction parameters a_mn [K]",
                         n=f"{len(pairs)} directed pairs"),
           "interactions\n(\n",
           "    // i              j                a_ij [K]   (absent pair -> 0, athermal)\n"]
    for ni, nj, a in pairs:
        out.append(f"    {{ i {ni}; j {nj}; a {a}; }}\n")
    out.append(");\n")
    (DST / 'interactions.dat').write_text(''.join(out))
    return len(pairs)


def main():
    if not RQ.exists() or not VL.exists():
        print("unifac_gct_to_choupo: ChemSep UNIFAC .gct files not found.\n")
        print(f"  Looked for: {RQ}\n              {VL}")
        print("  Drop a ChemSep/DWSIM install's ipd/ into third_party/chemsep/ipd/")
        print("  (see third_party/chemsep/README.md) and re-run.  No fabrication.")
        sys.exit(2)
    ns = import_groups()
    npair = import_interactions()
    print(f"unifac_gct_to_choupo: groups.dat <- {ns} subgroups; "
          f"interactions.dat <- {npair} directed main-group pairs.")
    print("  Source: Hansen 1991 via ChemSep (Artistic-2.0). Review before relying on it.")


if __name__ == '__main__':
    main()
