#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: a component record stores each quantity's PRIMITIVE once, types no DERIVED one, and labels its CHECKs.

    bin/curate/check_record_primitives.py

WHY (DEV.md 4c C398, RULED, ADDENDUM A3, amended by the architect's ruling
(c) of 2026-11-14; the reviewer's docs/reviews/2026-11-14-openfoam-property-
architecture/REPORT.md section 9.4).  What a record may hold, per phase:

  | primitive (stored once)          | derived (never typed)       | a CHECK if also typed     |
  | formation dHf, s in the natural  | h, s, g of every phase; a   | dGf_298 (compared with    |
  |   phase (standardThermochemistry)|   reaction's heat and K     |   dHf - T dSf)            |
  | ideal-gas, liquid, solid Cp laws | the sensible legs           | --                        |
  | the latent heat at Tb (HvapTb)   | the latent heat at T        | --                        |
  | vapour pressure laws             | d ln p / dT                 | --                        |
  | the liquid volume (Vliq, VliqT)  | the liquid enthalpy's P term| --                        |

  A PHASE RUNG in standardThermochemistry (`pureLiquid { dHf_298; s_298; }`
  beside the natural phase's datum; settled 2026-08-07, ice is a phase) is a
  PRIMITIVE where the record's own laws cannot carry the natural phase's
  datum to that phase, and a CHECK where they can (ruling (c): the settled
  contract wins over the new table).

WHAT IT CHECKS, over data/standards/components (the curated tier; a sealed
copy is the case's frozen data):
  1. a DERIVED quantity typed in a record is refused -- a formation datum
     outside standardThermochemistry (the salt-formation contract: a salt's
     solid formation enthalpy is DERIVED from its ions and its dissolution
     enthalpy, never stored), a latent heat at any temperature but Tb, a
     slope of the vapour pressure;
  2. dGf_298 is a CHECK (ruling (a)): accepted, and since the comparison it
     owes is not computed yet in this slice, each is listed as "check not
     yet computed" and pinned in debt_registry.py (the list may only shrink: a new one fails
     until its comparison exists);
  3. a phase rung is ALLOWED and labelled (ruling (c)): PRIMITIVE where the
     record's own laws cannot derive it, CHECK where they can (its deviation
     is the engine's to print; no rung exists in the catalogue today);
  4. the debt of derived quantities that existed when the gate was written is
     pinned in debt_registry.py with its remedy; it may only shrink.

    reads: data/standards/components/ bin/curate/record_reader.py
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from record_reader import Block, parse_file   # noqa: E402
from debt_registry import (RECORD_DERIVED_TYPED, RECORD_DERIVED_TYPED_DEBT,   # noqa: E402
                           DGF_CHECK_UNCOMPUTED, DGF_CHECK_UNCOMPUTED_DEBT)  # ONE home

ROOT = Path(__file__).resolve().parents[2]
NAME = "check_record_primitives"

#  Keys that state a DERIVED quantity when typed at a record's top level.
FORMATION_OUTSIDE = {"Hf_298", "dHf_298", "S_298", "s_298", "Gf_298", "dGf_298", "Hf", "S"}
LATENT = re.compile(r"^(d?Hvap)(?!Tb$)\w*$")
SLOPE = {"dlnPsatdT", "dPsatdT", "dlnPdT"}
RUNGS = ("idealGas", "pureLiquid", "pureSolid")

#  THE DEBT lives in the ONE registry (debt_registry.py), with its why and
#  remedy: RECORD_DERIVED_TYPED (NaOH's solid formation datum, a second home
#  under the salt-formation contract) and DGF_CHECK_UNCOMPUTED (the dGf_298
#  CHECKs whose comparison is not computed yet, ruling (a)).
PINNED_DERIVED = RECORD_DERIVED_TYPED
PINNED_DGF = DGF_CHECK_UNCOMPUTED


def derivable(rec, rung, natural):
    """Can the record's own laws carry the natural phase's datum to `rung`?
    (Component::h_formation: gas <-> liquid by the latent heat at Tb, Watson,
    and the liquid Cp; liquid <-> solid by the fusion enthalpy at the triple
    point.)"""
    has = lambda k: rec.get(k) is not None
    gas_liq = has("HvapTb") and has("Tb") and has("liquidHeatCapacity") and has("idealGasHeatCapacity")
    liq_sol = isinstance(rec.get("sublimation"), Block) and rec.get("sublimation").get("Hfus") is not None \
        and isinstance(rec.get("triplePoint"), Block)
    target = {"idealGas": "gas", "pureLiquid": "liquid", "pureSolid": "solid"}[rung]
    path = {("gas", "liquid"): gas_liq, ("liquid", "gas"): gas_liq,
            ("liquid", "solid"): liq_sol, ("solid", "liquid"): liq_sol,
            ("gas", "solid"): gas_liq and liq_sol, ("solid", "gas"): gas_liq and liq_sol}
    return path.get((natural, target), False)


def main():
    fails, derived_seen, dgf_seen, labels = [], set(), set(), []
    for f in sorted((ROOT / "data/standards/components").glob("*.dat")):
        rec = parse_file(f)
        for k, v, line in rec.entries:
            if isinstance(v, Block):
                continue
            if k in FORMATION_OUTSIDE or LATENT.match(k) or k in SLOPE:
                key = f"{f.name}:{k}"
                if key in PINNED_DERIVED:
                    derived_seen.add(key)
                    continue
                fails.append(f"{f.name}:{line}: `{k}` types a DERIVED quantity -- the record stores"
                             " the primitive once (A3: a formation datum lives in"
                             " standardThermochemistry, in the natural phase; the latent heat at Tb"
                             " only; never a slope of the vapour pressure).  "
                             + RECORD_DERIVED_TYPED_DEBT["remedy"])
        st = rec.get("standardThermochemistry")
        if isinstance(st, Block):
            natural = {"pureLiquid": "liquid", "pureSolid": "solid"}.get(st.word("referenceState"), "gas")
            if st.get("dGf_298") is not None:
                if f.stem in PINNED_DGF:
                    dgf_seen.add(f.stem)
                else:
                    fails.append(f"{f.name}: standardThermochemistry.dGf_298 is a CHECK (dHf - T dSf from"
                                 " this record and its elements) whose comparison is not computed yet;"
                                 " a new one waits for that comparison (the pinned list only shrinks).  "
                                 + DGF_CHECK_UNCOMPUTED_DEBT["remedy"])
            for rung in RUNGS:
                r = st.get(rung)
                if isinstance(r, Block):
                    #  Allowed either way (ruling (c)); labelled.  A CHECK rung's
                    #  deviation from the derived datum is the engine's to print
                    #  (Component::h_formation); no rung exists in the catalogue
                    #  today, so that printout is not built in this slice.
                    kind = ("CHECK (derivable by the record's own laws; deviation not yet printed)"
                            if derivable(rec, rung, natural) else "PRIMITIVE")
                    labels.append(f"{f.stem}.{rung}: {kind}")
    for k in sorted(PINNED_DERIVED - derived_seen):
        fails.append(f"pinned derived `{k}` is gone -- remove it from debt_registry.RECORD_DERIVED_TYPED (only shrinks)")
    for k in sorted(PINNED_DGF - dgf_seen):
        fails.append(f"pinned dGf_298 check of `{k}` is gone -- remove it from debt_registry.DGF_CHECK_UNCOMPUTED (only shrinks)")
    if fails:
        print(f"{NAME}: FAIL ({len(fails)})")
        for x in fails:
            print("  " + x)
        return 1
    print(f"{NAME}: OK -- no record types a derived quantity beyond the pinned"
          f" {len(PINNED_DERIVED)} (NaOH's solid formation datum, a second home under the salt"
          f" contract); dGf_298 CHECKs: {len(dgf_seen)}, comparison not yet computed (pinned);"
          f" phase rungs: {len(labels)}" + (f" ({'; '.join(labels)})" if labels else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
