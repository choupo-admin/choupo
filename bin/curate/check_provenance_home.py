#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: a property's provenance entry lives in the record's provenance block, nowhere else.

    bin/curate/check_provenance_home.py

WHY (DEV.md 4c C398 slice (b), review row SL-09, design record section 1.2
finding 3).  A curation tool inserted each new provenance entry before the
LAST closing brace of the file, assuming `provenance {}` was the last block.
Where `cosmo {}` or `pcsaft {}` followed it, the entry landed inside a
sigma-profile set: 74 entries in the catalogue and 35 in sealed copies.  The
provenance reader never saw them (Component.cpp reads the top-level block),
and the COSMO reader took each as a phantom parameter SET.  Nothing numeric
depended on them, which is why nothing caught them.  The tool is fixed
(bin/curate/transport_fit.py insert_into_provenance) and the entries are
moved; this gate keeps both true.

WHAT IT CHECKS, over every component record of data/standards/components and
every copy under tutorials/**/constant/components and
data/curation/**/constant/components:
  * a sub-block NAMED after one of the record's property blocks and carrying
    `origin` is a provenance entry; its only home is directly under the
    record's top-level `provenance {}` (or, for a block of several named
    laws, under `provenance { <property> { <law> {...} } }`).  Found
    anywhere else -- inside `cosmo`, `pcsaft`, another block, or as the
    property block itself carrying `origin` beside its coefficients -- it is
    refused by name, with the line.
  * ANY provenance-shaped entry -- a sub-block carrying `origin`, whatever
    its name (`Tc { origin literature; }` filed inside `cosmo {}` passed
    while only the seven property names were looked for: review row CV-10)
    -- found outside the top-level `provenance {}` is refused the same way.
  * the debt that existed when the gate was written (a law block that carries
    its own `origin` beside its coefficients) is pinned in debt_registry.py; it
    may only shrink, and a pinned entry that is gone must leave the list.

    reads: data/standards/components/ tutorials/ data/curation/
    reads: bin/curate/record_reader.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from record_reader import Block, PROPERTY_BLOCKS, parse_file   # noqa: E402
from debt_registry import (PROVENANCE_OUTSIDE_BLOCK,         # noqa: E402
                           PROVENANCE_OUTSIDE_BLOCK_DEBT)    # waivers have ONE home

ROOT = Path(__file__).resolve().parents[2]
NAME = "check_provenance_home"

#  THE DEBT lives in the ONE registry (debt_registry.PROVENANCE_OUTSIDE_BLOCK,
#  with its why and remedy): law blocks that carry their own `origin`.
PINNED = PROVENANCE_OUTSIDE_BLOCK


def files():
    yield from sorted((ROOT / "data/standards/components").glob("*.dat"))
    for base in ("tutorials", "data/curation"):
        yield from sorted((ROOT / base).glob("**/constant/components/*.dat"))


#  The keys a provenance entry carries, and nothing else (CV-10).
PROVENANCE_KEYS = {"origin", "method", "methodVersion", "notes", "note", "source", "sources",
                   "reviewStatus", "review", "humanReviewed", "uncertainty", "fittedInCase",
                   "archiveExtract", "evidence", "reference", "references", "citation", "doi",
                   "licence", "license", "status", "reason", "validity", "fitGrade", "grade",
                   "date", "by", "curator", "tool", "datasets", "points", "aad", "maxDev"}


def walk(b, path, found, prov_ok):
    """Collect (path, key, line) of every property-named block with `origin`."""
    for k, v, l in b.entries:
        if not isinstance(v, Block):
            continue
        here = path + [k]
        if v.get("origin") is not None and not prov_ok(here):
            #  A property block carrying `origin` beside its coefficients (the
            #  pinned debt), or an entry that carries NOTHING but provenance
            #  keys -- the misfiled shape, whatever its name (CV-10).  A datum
            #  with its own origin beside its value (`solubility { value ...;
            #  origin ...; }`) is a reader's grammar, not a misfiled entry.
            only_prov = all(kk in PROVENANCE_KEYS for kk in v.keys())
            if k in PROPERTY_BLOCKS or only_prov:
                found.append(("/".join(here), l))
        walk(v, here, found, prov_ok)


def main():
    failures, pinned_seen, n = [], set(), 0

    def prov_ok(here):
        #  the record's top-level provenance block itself (its record-level
        #  origin) and anything under it; or under a sub-model's OWN
        #  provenance block (`lennardJones { provenance { sigma {...} } }`,
        #  `polymer { provenance { ... } }`), which that sub-model's reader reads
        return here[0] == "provenance" or "provenance" in here[:-1]

    for f in files():
        n += 1
        rel = str(f.relative_to(ROOT))
        found = []
        walk(parse_file(f), [], found, prov_ok)
        for where, line in found:
            key = rel + ":" + where
            if key in PINNED:
                pinned_seen.add(key)
                continue
            failures.append(f"{rel}:{line}: a provenance entry `{where.split('/')[-1]}` filed in"
                            f" `{where}` -- its home is the record's top-level `provenance {{}}`"
                            " block (move it there; a tool that writes one uses"
                            " transport_fit.insert_into_provenance).  "
                            + PROVENANCE_OUTSIDE_BLOCK_DEBT["remedy"])
    stale = sorted(PINNED - pinned_seen)
    for s in stale:
        failures.append(f"pinned debt `{s}` is gone -- remove it from debt_registry.PROVENANCE_OUTSIDE_BLOCK (the list may only shrink)")
    if failures:
        print(f"{NAME}: FAIL ({len(failures)})")
        for x in failures:
            print("  " + x)
        return 1
    print(f"{NAME}: OK -- {n} records read; every provenance-shaped entry (a block carrying"
          f" `origin`, any name, any depth) is in its record's provenance block ({len(PINNED)}"
          " pinned blocks carry their own `origin`, the debt)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
