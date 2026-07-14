#!/usr/bin/env python3
"""check_groups.py -- UNIFAC group-enforcement gate (forum F-GRP-1).

Cross-references a component tree against the group-estimation prelist
(data/groupEstimative/compounds.csv) and reports every component that SHOULD
carry a UNIFAC groups block but does not.

"Should" = the prelist classifies the compound (by CAS) as:
    thermo_class == molecular   (neutral, non-radical, UNIFAC-capable)
    stability    == stable
    unifac_vocab_ok == yes      (its subgroups exist in Choupo's groups.dat)

Ions, light gases, and reactiveIntermediate (radical) species are EXEMPT --
groups there would be wrong or impossible.

This is a standalone curation tool.  It is NOT wired into bin/runTests.
Default: report only.  --strict: exit 1 if any enforced compound lacks groups.

Usage:
    bin/curate/check_groups.py [--components DIR] [--strict]
"""
import argparse
import csv
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PRELIST = REPO / "data" / "groupEstimative" / "compounds.csv"


def load_prelist():
    """CAS -> (thermo_class, stability, unifac_vocab_ok) from the estimation lake."""
    by_cas = {}
    with open(PRELIST, newline="") as f:
        for row in csv.DictReader(f):
            cas = (row.get("CAS") or "").strip()
            if cas:
                by_cas[cas] = (row["thermo_class"], row["stability"],
                               row["unifac_vocab_ok"])
    return by_cas


_CAS_RE = re.compile(r"^\s*CAS\s+([0-9-]+)\s*;", re.M)
_UNIFAC_RE = re.compile(r"unifac\s*\(")


def dat_cas_and_groups(path):
    text = path.read_text(errors="replace")
    m = _CAS_RE.search(text)
    cas = m.group(1) if m else None
    has_groups = bool(_UNIFAC_RE.search(text))
    return cas, has_groups


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--components", default=str(REPO / "data" / "standards" / "components"),
                    help="component .dat tree to check (default: data/standards/components)")
    ap.add_argument("--strict", action="store_true",
                    help="exit 1 if any enforced compound is missing its groups block")
    args = ap.parse_args()

    prelist = load_prelist()
    comp_dir = Path(args.components)
    missing, enforced, exempt, unknown = [], 0, 0, 0

    for dat in sorted(comp_dir.glob("*.dat")):
        cas, has_groups = dat_cas_and_groups(dat)
        info = prelist.get(cas) if cas else None
        if info is None:
            unknown += 1
            continue
        tclass, stability, vocab_ok = info
        # F-GRP-1: enforce only where it makes sense
        if tclass == "molecular" and stability == "stable" and vocab_ok == "yes":
            enforced += 1
            if not has_groups:
                missing.append((dat.name, cas))
        else:
            exempt += 1

    print(f"[check_groups] tree: {comp_dir}")
    print(f"[check_groups] enforced={enforced}  exempt={exempt}  "
          f"not-in-prelist={unknown}")
    if missing:
        print(f"[check_groups] MISSING a UNIFAC groups block ({len(missing)}):")
        for name, cas in missing:
            print(f"    - {name}  (CAS {cas})  -> add: groups {{ unifac ( ... ); }}")
    else:
        print("[check_groups] OK -- every enforced compound declares its groups.")

    if args.strict and missing:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
