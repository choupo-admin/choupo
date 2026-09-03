#!/usr/bin/env python3
"""Give a ChemSep-imported component record the `formula` its source carries.

    bin/curate/add_formula_from_chemsep.py            # report only (default)
    bin/curate/add_formula_from_chemsep.py --write    # write the formula lines

WHY.  Measured 2026-09-03, the day the Explore browser first drew its
family tree: 356 of the 603 standard component records declare NO `formula`
-- every one a ChemSep v8.3 import (`bin/curate/chemsep_to_choupo.py` never
wrote the field) -- and a record with no formula is one the element balance
refuses by name ("no molecular formula declared") and the browser cannot
place.  The source the records were imported from,
`thirdParty/chemsep/chemsep1.xml` (Artistic License 2.0), carries a
STRUCTURE formula for each compound ("CHCl2CH2Cl", "(CH3)2CHOH"), from which
the elemental formula follows by counting -- a derivation, not a new datum,
from the same licensed source the rest of the record came from.

WHAT IT DOES, and what it refuses.  For each standards record with a CAS and
no `formula`: find the ChemSep compound by CAS (never by name); parse the
structure into element counts (parentheses with integer multipliers, `-` and
spaces ignored); compute the molar mass with THE ENGINE'S OWN atomic weights
(read at run time from src/thermo/AtomicWeights.cpp -- one table, two
readers, never a second copy) and compare it with the `MW` the record
already declares.  Only a formula that REPRODUCES the record's MW to
MW_TOL is written; a mismatch, a structure with a non-integer multiplier
(air: "(N2)0.781 (O2)0.209 (Ar)0.01"), an element the table lacks, or a CAS
ChemSep does not hold is REFUSED and listed by name.  Idempotent: a record
that already declares `formula` is left alone.  Output is a Hill formula
(C, H, then alphabetical; alphabetical when carbon is absent), written right
after the CAS line with a comment naming the structure it was counted from.

NOT done here: any record without a CAS, any record ChemSep does not hold,
and species/ records (a different kind).  Each refusal is a line in the
report, never a guess.
"""
from __future__ import annotations

import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STD = ROOT / "data" / "standards" / "components"
XML = ROOT / "thirdParty" / "chemsep" / "chemsep1.xml"
WEIGHTS_CPP = ROOT / "src" / "thermo" / "AtomicWeights.cpp"
MW_TOL = 2e-3     # relative; ChemSep's atomic weights differ from IUPAC 2021 in the last digit


def atomic_weights() -> dict[str, float]:
    """The engine's table, parsed from its one home."""
    text = WEIGHTS_CPP.read_text()
    pairs = re.findall(r'\{\s*"([A-Z][a-z]?)"\s*,\s*([0-9.]+)\s*\}', text)
    if len(pairs) < 80:
        sys.exit(f"REFUSED: could not read the atomic-weight table from {WEIGHTS_CPP}")
    return {s: float(v) for s, v in pairs}


def parse_structure(s: str) -> dict[str, int]:
    """Element counts of a ChemSep structure formula.  Raises ValueError on
    anything it cannot count exactly."""
    s = s.replace(" ", "").replace("-", "")
    if not s:
        raise ValueError("empty structure")
    pos = 0

    def parse_group() -> dict[str, int]:
        nonlocal pos
        counts: dict[str, int] = {}
        while pos < len(s):
            c = s[pos]
            if c == ")":
                return counts
            if c == "(":
                pos += 1
                inner = parse_group()
                if pos >= len(s) or s[pos] != ")":
                    raise ValueError("unbalanced parentheses")
                pos += 1
                mult = read_int()
                for k, v in inner.items():
                    counts[k] = counts.get(k, 0) + v * mult
                continue
            m = re.match(r"[A-Z][a-z]?", s[pos:])
            if not m:
                raise ValueError(f"unreadable at '{s[pos:pos+6]}'")
            sym = m.group(0)
            pos += len(sym)
            n = read_int()
            counts[sym] = counts.get(sym, 0) + n
        return counts

    def read_int() -> int:
        nonlocal pos
        m = re.match(r"[0-9]+(\.[0-9]+)?", s[pos:])
        if not m:
            return 1
        if m.group(1):
            raise ValueError(f"non-integer multiplier '{m.group(0)}'")
        pos += len(m.group(0))
        return int(m.group(0))

    out = parse_group()
    if pos != len(s):
        raise ValueError("unbalanced parentheses")
    return out


def hill(counts: dict[str, int]) -> str:
    keys = list(counts)
    if "C" in keys:
        order = ["C"] + (["H"] if "H" in keys else []) + sorted(k for k in keys if k not in ("C", "H"))
    else:
        order = sorted(keys)
    return "".join(f"{k}{counts[k] if counts[k] != 1 else ''}" for k in order)


def chemsep_by_cas() -> dict[str, tuple[str, str, float | None]]:
    if not XML.exists():
        sys.exit(f"REFUSED: {XML} is absent -- the ChemSep source is the user's own copy (thirdParty/, gitignored)")
    out = {}
    for c in ET.parse(XML).getroot().iter("compound"):
        cas = c.find("CAS")
        sf = c.find("StructureFormula")
        nm = c.find("CompoundID")
        mw = c.find("MolecularWeight")
        if cas is None or sf is None:
            continue
        try:
            mwv = float(mw.get("value")) if mw is not None else None
        except ValueError:
            mwv = None
        out[cas.get("value", "")] = (nm.get("value", "") if nm is not None else "", sf.get("value", ""), mwv)
    return out


def main() -> int:
    write = "--write" in sys.argv
    weights = atomic_weights()
    cs = chemsep_by_cas()
    written, refused, skipped = [], [], 0
    for p in sorted(STD.glob("*.dat")):
        text = p.read_text(errors="ignore")
        if re.search(r"^\s*formula\s", text, re.M):
            skipped += 1
            continue
        cm = re.search(r"^(\s*CAS\s+([0-9-]+)\s*;[^\n]*)$", text, re.M)
        if not cm:
            refused.append((p.name, "no CAS in the record"))
            continue
        cas = cm.group(2)
        mm = re.search(r"^\s*MW\s+([0-9.eE+-]+)", text, re.M)
        if not mm:
            refused.append((p.name, "no MW in the record to check against"))
            continue
        mw_rec = float(mm.group(1))
        if cas not in cs:
            refused.append((p.name, f"CAS {cas} not in chemsep1.xml"))
            continue
        _name, structure, _mw_cs = cs[cas]
        try:
            counts = parse_structure(structure)
        except ValueError as e:
            refused.append((p.name, f'structure "{structure}": {e}'))
            continue
        missing = [k for k in counts if k not in weights]
        if missing:
            refused.append((p.name, f"element(s) {missing} not in the engine's table"))
            continue
        mw = sum(weights[k] * n for k, n in counts.items())
        if abs(mw - mw_rec) > MW_TOL * mw_rec:
            refused.append((p.name, f'structure "{structure}" gives MW {mw:.4f}, record declares {mw_rec:.4f}'))
            continue
        f = hill(counts)
        line = (f"formula     {f};      // counted from the ChemSep v8.3 structure formula"
                f' "{structure}" (derived 2026-09-03; reproduces MW to {abs(mw - mw_rec) / mw_rec * 100:.3f} %)')
        if write:
            new = text.replace(cm.group(1), cm.group(1) + "\n" + line, 1)
            p.write_text(new)
        written.append((p.name, f, structure))

    print(f"add_formula_from_chemsep: {'WROTE' if write else 'would write'} {len(written)} formula line(s);"
          f" {skipped} record(s) already declare one; {len(refused)} REFUSED")
    for n, f, st in written[:8]:
        print(f"    {n:40s} {f:14s} <- {st}")
    if len(written) > 8:
        print(f"    ... and {len(written) - 8} more")
    for n, why in refused:
        print(f"    REFUSED {n}: {why}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
