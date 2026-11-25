#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: a catalogue record's MW equals the sum of its formula's atomic weights (C517).

    bin/curate/check_mw_formula.py [--root DIR]

THE REAL DEFECT (2026-11-25 proofs audit, DEV.md 4c C517).  claus01 and
ammonia01 closed in ATOMS to 100.0000 % and in MASS to 99.9947 % and 99.9974 %,
because a record's `MW` field was typed from some other table of atomic
weights than the engine's (src/thermo/AtomicWeights.cpp: S = 32.06, the NASA
report's records use 32.065; H2S 34.082 against 34.076 on 82 kmol/h).  The
mass ledger sums net flow x MW, so the reaction's atoms balanced and its kilograms
did not.  Forty-seven records differed from their own formula by more than
1e-4; no gate looked.

THE RULE.  Over data/standards/{components,species,thermoTables/*}: where a
record carries a parseable `formula` and an `MW`, |MW - sum(n_i * aw_i)| / MW,
with aw_i the engine's OWN atomic weights (read from the one home, never
copied here), must not exceed 1e-4.  Charge marks (`Li+`, `SO4-2`) and
state tags are dropped from the formula.  Out of scope, by construction and
counted in the verdict: a record with no `formula` or no `MW`, a formula that
is not a molecular formula (`N/A`, a polymer repeat unit, a mixture), and a
synthetic pseudo-component whose header says `NOT A REAL SUBSTANCE`.

THE RATCHET.  Records between 1e-5 and 1e-4 (the rounding of 3-4 digit
molar masses; the 1e-5 rule of C517 is the aim) are counted per home against
PINNED_ABOVE_1E5; the count may only shrink (a lower count fails with the new
number so the pin is lowered).

Seconds; reads the tracked data only.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from add_formula_from_chemsep import atomic_weights, parse_structure  # noqa: E402

TOL = 1e-4
TOL_AIM = 1e-5
# Records in (1e-5, 1e-4], per home, measured 2026-11-25 on the tree this gate
# landed with.  May only shrink.
PINNED_ABOVE_1E5 = {
    "components": 381,
    "species": 16,
    "thermoTables/NASA-TP-2002-211556": 421,
    "thermoTables/RRHO-computed": 5,
}
HOMES = list(PINNED_ABOVE_1E5)

root = Path(__file__).resolve().parents[2]
if "--root" in sys.argv:
    root = Path(sys.argv[sys.argv.index("--root") + 1])

W = atomic_weights()


def formula_sum(f):
    f = f.strip().strip('"').strip("'")
    f = re.sub(r"[+-]+\d*$", "", f)
    f = re.sub(r"\(\s*[a-z]+\s*\)", "", f)
    c = parse_structure(f)
    return sum(n * W[s] for s, n in c.items())


fails, above, measured, excluded = [], {h: 0 for h in HOMES}, 0, 0
for home in HOMES:
    d = root / "data" / "standards" / home
    if not d.is_dir():
        fails.append(f"{home}: directory missing")
        continue
    for p in sorted(d.glob("*.dat")):
        t = p.read_text(encoding="utf-8", errors="replace")
        m = re.search(r"^formula\s+(.+?);", t, re.M)
        mw = (re.search(r"^MW\s+([0-9.eE+-]+)\s*;", t, re.M)
              or re.search(r"^MW\s*\{\s*value\s+([0-9.eE+-]+)\s*;", t, re.M))
        if not (m and mw) or "NOT A REAL SUBSTANCE" in t:
            excluded += 1
            continue
        try:
            s = formula_sum(m.group(1))
        except (ValueError, KeyError):
            excluded += 1
            continue
        v = float(mw.group(1))
        rel = abs(v - s) / v
        measured += 1
        if rel > TOL:
            fails.append(f"{home}/{p.name}: MW {v:g} but formula {m.group(1)} sums to "
                         f"{s:.4f} with the engine's weights ({rel:.1e} > {TOL:g})")
        elif rel > TOL_AIM:
            above[home] += 1

for h in HOMES:
    if above[h] > PINNED_ABOVE_1E5[h]:
        fails.append(f"{h}: {above[h]} records in (1e-5, 1e-4] against a pin of "
                     f"{PINNED_ABOVE_1E5[h]} -- a NEW rounded MW; type the formula sum")
    elif above[h] < PINNED_ABOVE_1E5[h]:
        fails.append(f"{h}: {above[h]} records in (1e-5, 1e-4], the pin says "
                     f"{PINNED_ABOVE_1E5[h]} -- the debt shrank; lower PINNED_ABOVE_1E5")

if measured < 1000:
    fails.append(f"only {measured} records measured -- the reader lost its subject")
if fails:
    print("check_mw_formula: FAIL")
    for f in fails:
        print("  " + f)
    sys.exit(1)
print(f"check_mw_formula: OK -- {measured} records hold MW to their formula's sum within "
      f"{TOL:g} (engine atomic weights); {sum(above.values())} between {TOL_AIM:g} and {TOL:g} "
      f"(ratchet); {excluded} out of scope (no formula/MW, non-molecular formula, pseudo-component)")
