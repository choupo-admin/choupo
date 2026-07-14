#!/usr/bin/env python3
# check_estimates.py -- the DRIFT CHECKER of group-contribution estimates
# (design forum #58/#67/#77: the arity guard of the groups-as-curated-source
# doctrine).  Style precedent: the check_*.py family (check_ion_pins etc.).
#
# THE CONTRACT (forum #67 P1, verbatim rules):
#   same method + same inputs + different value  -> DRIFT/corruption, exit 1
#   methodVersion != current table id            -> STALE, warn (regenerate+review)
#   origin regressed/experimental/literature     -> NEVER compared with Joback
#
# It recomputes ONLY values whose STRUCTURED per-value provenance declares
#   provenance { <field> { origin estimated; method "Joback"; ... } }
# from the component's own `groups { joback (...) }` recipe and the
# data/standards/joback/groups.dat table, using the EXACT formulas of
# src/propertyOps/Joback.cpp (replicated bit-for-bit below -- the same
# python-replica pattern validate_components.py uses for Ambrose-Walton).
#
# Values still carrying only the legacy COMMENT tag `[origin=estimated ...]`
# are counted as "unstructured estimates" -- a migration gap, reported but not
# an error: the checker never parses comments (forum #67 D-a).
#
# Usage:  bin/curate/check_estimates.py [componentsDir]   (default: standards)

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TABLE = ROOT / "data/standards/joback/groups.dat"

REL_TOL = 1.0e-6   # same method + same inputs must reproduce to round-off


def table_id():
    """The table's stable id -- read from the table itself (`tableId` in
    groups.dat), the ONE source Joback.cpp's version() also reads.  A table
    without an id cannot anchor methodVersion comparisons: refuse."""
    m = re.search(r"^tableId\s+(\S+);", TABLE.read_text(), re.M)
    if not m:
        sys.exit(f"check_estimates: {TABLE} carries no `tableId` -- "
                 "methodVersion comparisons have no anchor")
    return m.group(1)


def parse_joback_table():
    txt = TABLE.read_text()
    groups = {}
    for m in re.finditer(r"\{ name (\w+);([^}]*)\}", txt):
        name, body = m.group(1), m.group(2)
        vals = dict(re.findall(r"(\w+) (-?[0-9.eE+-]+);", body))
        groups[name] = {k: float(v) for k, v in vals.items()}
    return groups


def joback_estimate(specs, table):
    """Replica of Joback::estimate (src/propertyOps/Joback.cpp)."""
    s = {k: 0.0 for k in ("dTc", "dPc", "dVc", "dTb", "dHf", "dGf", "dHv")}
    nA = 0
    for g, n in specs:
        if g not in table:
            raise KeyError(f"group '{g}' not in {TABLE.name}")
        row = table[g]
        nA += int(row["nA"]) * n
        for k in s:
            s[k] += row[k] * n
    r = {}
    r["Tb"] = 198.2 + s["dTb"]
    r["Tc"] = r["Tb"] / (0.584 + 0.965 * s["dTc"] - s["dTc"] ** 2)
    r["Pc"] = 1.0 / (0.113 + 0.0032 * nA - s["dPc"]) ** 2       # bar
    r["Vc"] = 17.5 + s["dVc"]                                    # cm3/mol
    r["dHf_298"] = (68.29 + s["dHf"]) * 1000.0                   # J/mol (ig)
    r["dGf_298"] = (53.88 + s["dGf"]) * 1000.0                   # J/mol (ig)
    r["Hvap"] = 15.30 + s["dHv"]                                 # kJ/mol at Tb
    return r


def parse_component(path):
    """Tolerant extraction: joback recipe, structured provenance, scalar values."""
    txt = path.read_text()

    m = re.search(r"joback \(((?:\s*\{[^}]*\}\s*)+)\)", txt)
    specs = None
    if m:
        specs = [(g, int(float(c))) for g, c in
                 re.findall(r"group (\w+); count ([0-9.]+);", m.group(1))]

    # structured per-value provenance:  provenance { <field> { origin ...; } }
    prov = {}
    pm = re.search(r"^provenance\s*\{(.*?)^\}", txt, re.S | re.M)
    if pm:
        body = pm.group(1)
        for fm in re.finditer(r"(\w+)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}", body):
            field, fbody = fm.group(1), fm.group(2)
            entry = {
                "origin": _word(fbody, "origin"),
                "method": _quoted_or_word(fbody, "method"),
                "methodVersion": _quoted_or_word(fbody, "methodVersion"),
                "inputFingerprint": _quoted_or_word(fbody, "inputFingerprint"),
            }
            if entry["origin"]:
                prov[field] = entry

    # scalar values we know how to recompute (indent-tolerant: proposals and
    # reference-state block layouts put Tc/Pc/Tb inside critical{}/liquidPure{})
    vals = {}
    for key, pat in (
        ("Tc", r"^\s*Tc\s+(-?[0-9.eE+-]+)"),
        ("Pc", r"^\s*Pc\s+(-?[0-9.eE+-]+)"),
        ("Tb", r"^\s*Tb\s+(-?[0-9.eE+-]+)"),
        ("dHf_298", r"dHf_298\s+(-?[0-9.eE+-]+)"),
        ("dGf_298", r"dGf_298\s+(-?[0-9.eE+-]+)"),
    ):
        vm = re.search(pat, txt, re.M)
        if vm:
            vals[key] = float(vm.group(1))

    n_comment_tags = len(re.findall(r"\[origin=estimated", txt))
    return specs, prov, vals, n_comment_tags


def _word(body, key):
    m = re.search(rf"{key}\s+(\w+);", body)
    return m.group(1) if m else ""


def _quoted_or_word(body, key):
    m = re.search(rf'{key}\s+"([^"]*)";', body) or re.search(rf"{key}\s+(\S+);", body)
    return m.group(1) if m else ""


def main():
    comp_dir = Path(sys.argv[1]) if len(sys.argv) > 1 \
        else ROOT / "data/standards/components"
    table = parse_joback_table()
    METHOD_VERSION = table_id()

    drift, stale, checked, unstructured, norecipe = [], [], 0, 0, []
    for path in sorted(comp_dir.glob("*.dat")):
        specs, prov, vals, n_tags = parse_component(path)
        unstructured += n_tags
        for field, e in prov.items():
            if e["origin"] != "estimated":
                continue                       # measured/regressed: never compared
            if e["method"].lower() != "joback":
                continue                       # only deterministic recognised methods
            if field not in vals:
                continue
            if specs is None:
                norecipe.append(f"{path.name}:{field} (estimated, no joback recipe)")
                continue
            if not e["methodVersion"]:
                # An estimate without its table id cannot be checked against
                # anything -- absence is a VIOLATION, never 'current' (#87-P1).
                drift.append(f"{path.name}:{field}  methodVersion MISSING "
                             f"(an unanchored estimate; declare the table id)")
                continue
            if e["methodVersion"] != METHOD_VERSION:
                stale.append(f"{path.name}:{field} "
                             f"(declared {e['methodVersion']}, table is {METHOD_VERSION})")
                continue                       # stale: regenerate + review, not drift
            expected_fp = ",".join(f"{g}:{n}" for g, n in sorted(specs))
            if not e["inputFingerprint"]:
                drift.append(f"{path.name}:{field}  inputFingerprint MISSING "
                             f"(recipe identity is part of the contract)")
                continue
            if e["inputFingerprint"] != expected_fp:
                drift.append(f"{path.name}:{field}  inputFingerprint MISMATCH: "
                             f"declared '{e['inputFingerprint']}' but the file's "
                             f"own groups give '{expected_fp}'")
                continue
            recomputed = joback_estimate(specs, table).get(field)
            if recomputed is None:
                continue
            stored = vals[field]
            rel = abs(stored - recomputed) / max(1.0, abs(recomputed))
            checked += 1
            if rel > REL_TOL:
                drift.append(f"{path.name}:{field}  stored={stored:.6g}  "
                             f"joback={recomputed:.6g}  rel={rel:.2e}")

    print(f"check_estimates: {checked} structured Joback estimate(s) verified against the recipe")
    if stale:
        print(f"\nSTALE ({len(stale)}) -- method/table moved; regenerate and re-review:")
        for s in stale:
            print(f"  {s}")
    if norecipe:
        print(f"\nNO RECIPE ({len(norecipe)}) -- estimated value with no joback"
              f" groups to check against (the recipe is MANDATORY for a"
              f" structured Joback estimate, #87-P1):")
        for s in norecipe:
            print(f"  {s}")
    if unstructured:
        print(f"\nMIGRATION GAP: {unstructured} value(s) still carry only the legacy "
              f"comment tag [origin=estimated ...] -- not checkable until their "
              f"provenance is structured (the checker never parses comments).")
    if drift:
        print(f"\nDRIFT ({len(drift)}) -- same method, same inputs, DIFFERENT value; "
              f"a stored estimate no longer matches its own recipe:")
        for d in drift:
            print(f"  {d}")
        return 1
    if norecipe:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
