#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the aqueous-species and ionisation records of C373 reproduce from their evidence tables.

    bin/curate/check_species_c373.py

data/curation/batches/species_c373/*.tsv holds every reading (source, table, page, whether read from a page
image).  bin/curate/species_c373.py renders from it the species records with status build or update, the
chemistry records of every family whose chem is `build`, and the generated block of
metadata/aqueous-navigation.dat.  Held to:
  1. every governed file exists and is BYTE-IDENTICAL to what the tool renders (the number in a record is the
     number in the table);
  2. a species' charge equals the charge written in its formula; keys are unique;
  3. the hand-written chemistry of an earlier campaign (`chem existing`) carries exactly the pK and dH of
     steps.tsv (logK25 within 0.0006, dH within 0.5 J/mol);
  4. ONE SCALE per family: the difference of the formation enthalpies of two neighbouring ladder species
     (the neutral one being its component's dHf plus the pair file's heat of solution) reproduces the printed
     dH of the step within the tolerance the family declares.
Reads data/ only; writes nothing.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import species_c373 as t373  # noqa: E402


def main():
    t = t373.tables()
    bad, n, rows = t373.check(t)
    if bad:
        print("FAIL: check_species_c373 -- " + str(len(bad)) + " problem(s)")
        for b in bad:
            print("  " + b)
        return 1
    fams = len(t["families"])
    nsp = len(t["species"])
    print(f"check_species_c373: OK -- {n} governed files reproduce byte-identically from the tables ({fams} families, {nsp} species, "
          f"{len(t['steps'])} ionisation steps, {len(t['formation'])} formation readings); {len(rows)} ladder steps held to the family's one-scale tolerance; "
          "NOT CHECKED: that a number equals the page it was read from (the tables name table and page and flag every value read from an image), "
          "and any dCp (the record grammar has no place for it)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
