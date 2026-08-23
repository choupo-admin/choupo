#!/usr/bin/env python3
"""PER-TRAY CHEMISTRY on a reacting column -- the physics-direction gate
(2026-08-04; sour-water programme S2, docs/design/sour-water-stripper-scope.md §4).

Witnesses: tutorials/steady/distillation/column13_sour_water_stage_identity
(4 trays, the identity rig) and, since 2026-08-23,
tutorials/steady/distillation/stripper01_sour_water (8 trays -- T3 across an
order of magnitude of carbonate loading, plus T5: the stripper pins the
free-ammonia SURGE just below its feed, where deprotonation outruns
stripping -- m_NH3aq rises 1.316 -> 1.424 and then falls strictly to the
reboiler.  On the stripper T4 therefore covers the carbonate species and
NH4 and hands m_NH3aq to T5: pinned, never silently exempted).

A reacting column's profile is incomplete without its chemistry.  The whole
reason the separation and the speciation are the same problem is that
ammonia's volatility follows the pH -- so a profile printing x, y and T and
NOT the pH shows the consequence while hiding the cause.  The column now
speciates each tray liquid once after convergence and writes pH, ionic
strength and every species molality into profile.csv.

WHAT THIS GATE ASSERTS

  T1  THE COLUMNS EXIST.  pH, ionicStrength and the species molalities are
      in the profile, one value per stage, none of them NaN on a case that
      converged.

  T2  THE SPECIATION CLOSES PER TRAY.  Charge balance over the reported
      species, |sum z*m| / sum |z|*m, at solver tolerance on every stage --
      recomputed here from an INDEPENDENT charge table, not read back from
      the engine.

  T3  THE MECHANISM, and this is the one worth having.  Order the trays by
      CARBONATE LOADING (total carbonate / total ammonia, both from the
      species inventory) and the FREE-AMMONIA FRACTION
      m_NH3aq / (m_NH3aq + m_NH4) must order STRICTLY the other way.  That
      is the sour-water mechanism itself: the CO2 a liquid still carries is
      what holds ammonia as ammonium, and stripping it sets the ammonia
      free.  A column that separated while this correlation broke would be
      wrong in a way no residual would show.

  T4  THE SOLUTE INVENTORIES FALL DOWN THE COLUMN.  Every CARBONATE and
      AMMONIA species is being stripped, so its molality decreases strictly
      from tray 1 to tray N.

      H+ and OH- are DELIBERATELY excluded, and the first draft of this
      check included them and failed: they are not solutes being stripped,
      they are the water's own dissociation products, pinned by the pH --
      and the pH is not monotone here (see below).  m_OH rises from
      1.09e-4 to 1.41e-4 between trays 1 and 2 for exactly that reason.
      Asserting that water's own ions get stripped out of water would have
      been a gate encoding a misunderstanding.

WHAT THIS GATE DELIBERATELY DOES *NOT* ASSERT, because it is not true:
pH is NOT monotone down this column (8.485, 8.361, 8.328, 8.532).  The
first draft of this check assumed it was, and the measurement said
otherwise.  The reason is worth keeping: ionic strength varies 22-fold
between the top tray and the reboiler (0.636 -> 0.029 mol/kg), and a pH is
an ACTIVITY -- it moves with the activity coefficients as well as with the
inventory.  The carbonate loading is an INVENTORY, and only an inventory
gives a clean ordering variable.  Gating the monotone pH would have been
gating a coincidence, and it would have failed the first time somebody
changed the feed.

Exit 1 listing failures."""
import csv
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
#  TWO witnesses since 2026-08-23 (S2): the four-tray identity rig and the
#  eight-tray stripper.  The second is what widens T3 from four points to a
#  full order of magnitude of carbonate loading (0.52 -> 0.024 mol/kg).
CASE = (ROOT / "tutorials" / "steady" / "distillation"
        / "column13_sour_water_stage_identity")
CASE2 = (ROOT / "tutorials" / "steady" / "distillation"
         / "stripper01_sour_water")
PROFILE = Path("reports") / "unitOperations" / "tower" / "profile.csv"

#  INDEPENDENT charge table -- hand-written here on purpose.  A gate that
#  imports the engine's own charges tests that the engine agrees with
#  itself.
CHARGE = {"CO2aq": 0, "CO3": -2, "H": +1, "HCO3": -1,
          "NH3aq": 0, "NH4": +1, "OH": -1}

CARBONATE = ("CO2aq", "HCO3", "CO3")
AMMONIA = ("NH3aq", "NH4")

failures = []


def main() -> int:
    if not SOLVE.exists():
        print(f"check_tray_chemistry: {SOLVE} missing -- build first")
        return 1

    cur_tag = [""]

    def fail(m):
        failures.append(f"[{cur_tag[0]}] " + m)

    def run_witness(src, tag):
        with tempfile.TemporaryDirectory() as td:
            case = Path(td) / "c"
            shutil.copytree(src, case, ignore=shutil.ignore_patterns(
                "converged", "reports", "log.*", "resultJson*"))
            p = subprocess.run([str(SOLVE), "."], cwd=case,
                               capture_output=True, text=True, timeout=900)
            if p.returncode != 0:
                print(f"check_tray_chemistry: witness {tag} did not run\n"
                      + (p.stdout + p.stderr)[-2500:])
                return None
            f = case / PROFILE
            if not f.exists():
                print(f"check_tray_chemistry: {tag} wrote no profile.csv")
                return None
            return list(csv.DictReader(f.open()))

    n_trays = {}
    for src, tag in ((CASE, "column13"), (CASE2, "stripper01")):
        cur_tag[0] = tag
        rows = run_witness(src, tag)
        if rows is None:
            return 1
        n_trays[tag] = len(rows)

        # ---- T1: the columns exist and carry numbers --------------------
        need = ["pH", "ionicStrength"] + ["m_" + s for s in CHARGE]
        missing = [c for c in need if c not in (rows[0] if rows else {})]
        if missing:
            fail("T1: profile.csv lacks " + ", ".join(sorted(missing)))
            print("check_tray_chemistry: FAIL")
            for x in failures:
                print("  - " + x)
            return 1
        vals = []
        for i, r in enumerate(rows, 1):
            try:
                v = {c: float(r[c]) for c in need}
            except ValueError:
                fail(f"T1: stage {i} has a non-numeric chemistry entry")
                continue
            if any(x != x for x in v.values()):          # NaN
                fail(f"T1: stage {i} reports NaN chemistry on a converged run")
            vals.append(v)
        if len(vals) < 2:
            fail("T1: fewer than two stages carry chemistry -- nothing to "
                 "order, so T3 would pass vacuously")

        # ---- T2: charge closes per tray, recomputed here ----------------
        for i, v in enumerate(vals, 1):
            num = sum(CHARGE[s] * v["m_" + s] for s in CHARGE)
            den = sum(abs(CHARGE[s]) * v["m_" + s] for s in CHARGE)
            if den <= 0:
                fail(f"T2: stage {i} has no charged species at all")
            elif abs(num) / den > 1.0e-6:
                #  1e-6, not 1e-8: measured worst residual across the four
                #  trays is 2.3e-8, which is the speciation Newton's own
                #  acceptance and not slack.  A gate set AT a solver's
                #  tolerance fails on rounding; two decades of headroom
                #  still catches a real charge error by many orders.
                fail(f"T2: stage {i} charge balance {num/den:.3e} "
                     "exceeds solver tolerance")

        # ---- T3: the mechanism ------------------------------------------
        pts = []
        for i, v in enumerate(vals, 1):
            carb = sum(v["m_" + s] for s in CARBONATE)
            amm = sum(v["m_" + s] for s in AMMONIA)
            if amm <= 0:
                fail(f"T3: stage {i} carries no ammonia -- the mechanism "
                     "cannot be read there")
                continue
            free = v["m_NH3aq"] / amm
            pts.append((carb / amm, free, i))
        pts.sort()
        for (l0, f0, i0), (l1, f1, i1) in zip(pts, pts[1:]):
            if not f1 < f0:
                fail(f"T3: loading {l0:.4f} (stage {i0}) -> {l1:.4f} "
                     f"(stage {i1}) but the free-ammonia fraction went "
                     f"{f0:.4f} -> {f1:.4f}; more carbonate must hold MORE "
                     "ammonia as ammonium, not less")

        # ---- T4: the SOLUTES are being stripped -------------------------
        #  On the stripper, m_NH3aq is DELIBERATELY excluded and asserted
        #  separately below: free ammonia is not merely stripped, it is also
        #  PRODUCED by the deprotonation the falling carbonate allows, and
        #  just below the feed the production outruns the stripping.  That
        #  non-monotonicity is the mechanism's own signature, not a defect
        #  -- so it is PINNED (T5), never exempted in silence.  column13's
        #  four trays never showed it (all its solutes fall), so its
        #  original all-species claim stands there unchanged.
        t4_species = (CARBONATE + AMMONIA) if tag == "column13" \
                     else (CARBONATE + ("NH4",))
        for s in t4_species:
            col = [v["m_" + s] for v in vals]
            for j in range(len(col) - 1):
                if not col[j + 1] < col[j]:
                    fail(f"T4: m_{s} did not fall from stage {j+1} "
                         f"({col[j]:.6g}) to {j+2} ({col[j+1]:.6g}) -- every "
                         "carbonate and ammonia species is being stripped "
                         "down this column")
                    break

        # ---- T5 (stripper only): the free-ammonia SURGE below the feed --
        #  m_NH3aq must RISE from tray 2 (the feed tray) to tray 3 -- the
        #  deprotonation surge -- and then fall strictly to the reboiler.
        #  Measured on the recorded profile: 1.316 -> 1.424, then
        #  monotonically down to 0.464.
        if tag == "stripper01" and len(vals) >= 4:
            col = [v["m_NH3aq"] for v in vals]
            if not col[2] > col[1]:
                fail(f"T5: m_NH3aq did not rise below the feed "
                     f"({col[1]:.6g} -> {col[2]:.6g}) -- the deprotonation "
                     "surge, the mechanism's own signature, is gone")
            for j in range(2, len(col) - 1):
                if not col[j + 1] < col[j]:
                    fail(f"T5: m_NH3aq did not fall from stage {j+1} "
                         f"({col[j]:.6g}) to {j+2} ({col[j+1]:.6g}) below "
                         "the surge")
                    break

    if failures:
        print("check_tray_chemistry: FAIL")
        for x in failures:
            print("  - " + x)
        return 1
    print("check_tray_chemistry: OK -- two witnesses "
          f"(column13: {n_trays.get('column13', 0)} trays, stripper01: "
          f"{n_trays.get('stripper01', 0)} trays): every tray reports its own "
          "pH, ionic strength and species; charge closes per tray on an "
          "independent table; ordering the trays by carbonate loading orders "
          "the free-ammonia fraction strictly the other way on BOTH (the "
          "sour-water mechanism across an order of magnitude of loading); "
          "and the stripper pins the free-ammonia SURGE below its feed "
          "(deprotonation outrunning stripping) before the strict fall to "
          "the reboiler")
    return 0


if __name__ == "__main__":
    sys.exit(main())
