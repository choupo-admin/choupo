#!/usr/bin/env python3
"""Species identity gate -- coherence now, no new opacity later.

The ratified aqueous architecture (docs/architecture) says chemical truth lives
in explicit fields and is NEVER inferred from an identifier.  The catalogue is
not there yet: ~40 historical keys carry ASCII phase/charge suffixes (CO2aq,
CaOHp, FeOH3m) and six species declare their charge in two places.  Migrating
them is the F2 campaign, deliberately deferred -- so this gate does NOT fail
retroactively.  It does three things instead:

  1. PROSPECTIVE  -- a NEW opaque identifier is refused.  The historical set is
                     pinned in HISTORICAL_OPAQUE below; anything outside it that
                     looks like a mangled name is a regression.
  2. COHERENCE    -- for the six species whose identity is declared twice
                     (`charge` in species/, `z` inline in the reaction), the two
                     must agree.  This is the whole reason F2 can wait: the
                     duplication is watched, so a silent drift is impossible.
  3. FORMULA      -- the charge parsed from `formula` must equal the declared
                     charge.  Curation-time cross-check only: the formula is
                     never a runtime source of charge.

Exit 1 on any violation.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STD = ROOT / "data" / "standards"

# The historical keys, pinned.  This list may SHRINK (F2 migrates them); it may
# GROW only when the interim aq-disambiguation rule REQUIRES a suffix -- a
# derived neutral species homonymous with a component (check_aq_disambiguation
# enforces that requirement; the two gates must agree).  Any other new opaque
# name is a regression.
HISTORICAL_OPAQUE = {
    # species/ -- redox disambiguation
    "Fep3", "Cup", "Mnp3",
    # chemistry/ -- PHREEQC-derived phase (aq) and charge (p/m) suffixes
    "BaCO3aq", "BaHCO3p", "BaOHp", "CO2aq", "CaCO3aq", "CaHCO3p", "CaHSO4p",
    "CaOHp", "CaSO4aq", "FeCO3aq", "FeClp", "FeFp", "FeHCO3p", "FeHSO4p",
    "FeOH2aq", "FeOH3m", "FeOHp", "FeSO4aq", "H2SiO4m2", "H3SiO4m", "HClaq",
    "HF2m", "HFaq", "KFaq", "KHCO3aq", "KSO4m", "MgCO3aq", "MgFp", "MgHCO3p",
    # 2026-07-26: required by the aq rule (H3PO4 collides with the component)
    "H3PO4aq",
    "MgSO42m2", "MgSO4aq", "MnCO3aq", "MnCl2aq", "MnCl3m", "MnClp", "MnFp",
    "MnHCO3p", "MnOH3m", "MnOHp", "MnSO4aq", "NH3aq", "Na2SO4aq", "NaFaq",
    "NaHCO3aq", "NaSO4m", "SiF6m2", "SrCO3aq", "SrHCO3p", "SrOHp", "SrSO4aq",
    # species/ -- borate/tartrate complexes named after their formula
    "CaBOH4", "MgBOH4", "B3O3OH4", "B4O5OH4", "BOH4", "HTart",
}

# A name is opaque when it ends in a phase/charge mangle: `aq`, or `p`/`m`
# optionally followed by a magnitude, appended to a chemical stem.
OPAQUE = re.compile(r'^(?=.*[A-Z]).+?(aq|[pm]\d?)$')

bad = []


def strip_comments(t):
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    return re.sub(r'//.*$', '', t, flags=re.M)


def charge_from_formula(f):
    """Trailing sign(+magnitude) of a formula string; 0 when unsigned."""
    m = re.search(r'([+-])(\d*)$', f)
    if not m:
        return 0
    mag = int(m.group(2)) if m.group(2) else 1
    return mag if m.group(1) == "+" else -mag


# ---- gather ----------------------------------------------------------------
species = {}                                   # id -> (charge, formula, file)
for p in sorted((STD / "species").glob("*.dat")):
    t = strip_comments(p.read_text())
    n = re.search(r'^name\s+(\S+);', t, re.M)
    c = re.search(r'^charge\s+([+-]?\d+)\s*;', t, re.M)
    f = re.search(r'^formula\s+"([^"]*)"', t, re.M)
    if n and c:
        species[n.group(1)] = (int(c.group(1)),
                               f.group(1) if f else None, p)

inline = {}                                    # id -> (z, ion, file)
for p in sorted((STD / "chemistry").glob("*.dat")):
    t = strip_comments(p.read_text())
    if "recordType aqueousSpeciation" not in t:
        continue
    line = next((l for l in t.splitlines() if l.strip().startswith("species ")), "")
    s = re.search(r'species\s+(\S+);', line)
    z = re.search(r'\bz\s+([+-]?\d+)\s*;', line)
    ion = re.search(r'ion\s+"([^"]*)"', line)
    if s and z:
        inline[s.group(1)] = (int(z.group(1)),
                              ion.group(1) if ion else None, p)

# ---- 1. prospective: no NEW opaque identifiers -----------------------------
for sid in sorted(set(species) | set(inline)):
    if OPAQUE.match(sid) and sid not in HISTORICAL_OPAQUE:
        bad.append(f"NEW opaque identifier '{sid}' -- chemical truth belongs in "
                   f"`formula`/`charge`, never in the key.  Historical keys are "
                   f"pinned in this gate and are not a licence to mint more.")

# ---- 2. coherence of the doubly-declared identities ------------------------
dual = sorted(set(species) & set(inline))
for sid in dual:
    c, _, pc = species[sid]
    z, _, pz = inline[sid]
    if c != z:
        bad.append(f"'{sid}' DIVERGED: charge {c:+d} in {pc.relative_to(ROOT)} "
                   f"but z {z:+d} in {pz.relative_to(ROOT)} -- one fact, two "
                   f"homes, now inconsistent.  This is the F2 trigger.")

# ---- 3. formula vs declared charge -----------------------------------------
for sid, (c, f, p) in sorted(species.items()):
    if f is None:
        bad.append(f"'{sid}' declares no formula ({p.relative_to(ROOT)})")
        continue
    fc = charge_from_formula(f)
    if fc != c:
        bad.append(f"'{sid}': formula \"{f}\" reads charge {fc:+d} but the "
                   f"record declares {c:+d} ({p.relative_to(ROOT)})")

for sid, (z, ion, p) in sorted(inline.items()):
    if ion is None:
        bad.append(f"'{sid}' declares no ion/display formula "
                   f"({p.relative_to(ROOT)}) -- the resolver would fall back to "
                   f"the raw label")
        continue
    fc = charge_from_formula(ion)
    if fc != z:
        bad.append(f"'{sid}': ion \"{ion}\" reads charge {fc:+d} but the record "
                   f"declares z {z:+d} ({p.relative_to(ROOT)})")

# ---- report ----------------------------------------------------------------
if bad:
    print("species identity gate FAILED:")
    for b in bad:
        print("  " + b)
    sys.exit(1)

print(f"species identity gate: {len(species)} species + {len(inline)} inline "
      f"identities; {len(dual)} doubly-declared and coherent; "
      f"{len(HISTORICAL_OPAQUE)} historical keys pinned, 0 new")
sys.exit(0)
