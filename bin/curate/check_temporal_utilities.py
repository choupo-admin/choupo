#!/usr/bin/env python3
"""Temporal-utilities gate (ratified 2026-08-03): the demand staircase is
an exact decomposition of the energy ledger, never a second authority.

Canonical grid = the ACCEPTED DRIVER STEPS; row schema
tStart,tEnd,unit,eventType,utility,deltaEnergy,averageRate with
averageRate = deltaEnergy/(tEnd-tStart) (a step MEAN, stated in the
header name).  The engine reconciles every profiled record's window sum
against the exact ledger record (tolerance 1e-6 rel); a non-closing
profile is REFUSED and the record stands; unprofiled records are LISTED
so a partial staircase never reads total; impulses carry no rate and are
excluded from every peak KPI with a warning.

  POSITIVE   recipe01: 2000 rows, 0 refused, 0 unprofiled; every row's
             averageRate == dE/dt; per-(unit,kind) row sums == the exact
             E_<kind>_total KPIs (1e-6 rel); the steamLP staircase peak
             recomputed here == utility_steamLP_peak_kW (and the
             bring-to-boil spike is real: peak > 5x the segment-mean
             rate -- the number a campaign total hides).

  IMPULSE    recipe02: impulse rows present with an EMPTY rate column;
             NO steamLP peak KPI exists (its only demand is impulsive);
             the coolingWater peak recomputed from defined-rate rows ==
             the KPI; the exclusion WARNING is in stdout + meta.

  UNPROFILED batch13 (crystalliser -- no sampler): its valid records are
             LISTED as unprofiled, the CSV carries no rows for it, and
             the ledger KPIs stand untouched.

  SABOTAGE   (mandated) the reconciliation refuses each of: a removed
             interval, a sign-flipped step, an altered deltaEnergy --
             exercised on the reverifier this gate shares with the
             engine's rule (same sum, same tolerance).  The ENGINE-side
             refusal branch was additionally sabotage-verified live:
             the pre-fix hand-off ordering produced 'profile sum
             613.63 kJ vs exact record 607.59 kJ -- profile REFUSED,
             the record stands' through the real path (2026-08-03).

Exit 1 listing failures."""
import csv
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BATCH = ROOT / "build" / "linux64Gcc" / "choupoBatch"
R01 = ROOT / "tutorials" / "batch" / "recipes" / "recipe01_react_then_distill"
R02 = ROOT / "tutorials" / "batch" / "recipes" / "recipe02_setpoint_ramp"
B13 = ROOT / "tutorials" / "batch" / "crystallisation" / "batch13_nacl_pitzer"

HEADER = "tStart_s,tEnd_s,unit,eventType,utility,deltaEnergy_kJ,averageRate_kW"

failures = []


def run_case(tmp: Path, src: Path):
    case = tmp / src.name
    shutil.copytree(src, case, ignore=shutil.ignore_patterns(
        "expected", "log.*", "reports", "resultJson*"))
    env = {"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"}
    p = subprocess.run([str(BATCH), "."], cwd=case, env=env,
                       capture_output=True, text=True, timeout=900)
    return case, p.returncode, p.stdout + p.stderr


def kpi(out: str, unit: str, key: str):
    m = re.search(r'"%s":\s*\{([^}]*)\}' % re.escape(unit), out)
    if not m:
        return None
    m2 = re.search(r'"%s":\s*([0-9.eE+-]+)' % re.escape(key), m.group(1))
    return float(m2.group(1)) if m2 else None


def read_rows(case: Path):
    f = case / "reports" / "utilities" / "utilityDemand.csv"
    if not f.exists():
        failures.append(f"{case.name}: utilityDemand.csv missing")
        return []
    lines = f.read_text().splitlines()
    if not lines or lines[0] != HEADER:
        failures.append(f"{case.name}: CSV header is '{lines[0] if lines else ''}'"
                        f" (ratified schema: '{HEADER}')")
    return list(csv.DictReader(lines))


def staircase_peak(rows, utility):
    """Sum-of-step-functions peak on |dE|/dt -- the engine's own rule."""
    ev = []
    for r in rows:
        if r["utility"] != utility or r["averageRate_kW"] == "":
            continue
        t0, t1 = float(r["tStart_s"]), float(r["tEnd_s"])
        if t1 <= t0:
            continue
        rate = abs(float(r["deltaEnergy_kJ"])) / (t1 - t0)
        ev.append((t0, +rate))
        ev.append((t1, -rate))
    ev.sort()
    run = peak = 0.0
    for _, dr in ev:
        run += dr
        peak = max(peak, run)
    return peak


def reconcile(rows, records):
    """The reverifier: per-(unit,kind) row sums vs the exact records.
    Same sum, same declared tolerance as the engine.  Returns the list of
    refused (unit, kind) pairs."""
    sums = {}
    for r in rows:
        k = (r["unit"], r["eventType"])
        sums[k] = sums.get(k, 0.0) + float(r["deltaEnergy_kJ"])
    refused = []
    for k, exact in records.items():
        tol = max(1e-6 * abs(exact), 1e-9)
        if abs(sums.get(k, 0.0) - exact) > tol:
            refused.append(k)
    return refused


def main() -> int:
    if not BATCH.exists():
        print(f"check_temporal_utilities: {BATCH} missing -- build first")
        return 1
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        # ---- POSITIVE: recipe01 closes everywhere -----------------------
        case, rc, out = run_case(tmp, R01)
        if rc != 0:
            failures.append(f"recipe01: exit {rc}\n" + out[-1200:])
            print("\n".join(failures))
            return 1
        if "temporal demand: 2000 sample row(s)" not in out:
            failures.append("recipe01: expected 2000 sample rows announced")
        meta = (case / "reports" / "utilities" / "utilityDemand.meta").read_text()
        for needle in ("refusedProfiles 0", "unprofiledRecords 0"):
            if needle not in meta:
                failures.append(f"recipe01 meta lacks '{needle}'")

        rows = read_rows(case)
        for r in rows:
            if r["eventType"] == "impulse":
                failures.append("recipe01: unexpected impulse row")
                break
            t0, t1 = float(r["tStart_s"]), float(r["tEnd_s"])
            want = float(r["deltaEnergy_kJ"]) / (t1 - t0)
            got = float(r["averageRate_kW"])
            if abs(got - want) > 1e-9 * max(abs(want), 1.0):
                failures.append(f"recipe01: averageRate != dE/dt on row {r}")
                break

        records = {
            ("reactor", "reaction"):  kpi(out, "reactor", "E_reaction_total_kJ"),
            ("still",   "reboiler"):  kpi(out, "still", "E_reboiler_total_kJ"),
            ("still",   "condenser"): kpi(out, "still", "E_condenser_total_kJ"),
        }
        if any(v is None for v in records.values()):
            failures.append(f"recipe01: ledger KPIs missing ({records})")
        else:
            bad = reconcile(rows, records)
            if bad:
                failures.append(f"recipe01: reverifier refuses {bad} on the"
                                " engine-accepted profile")
            # The exothermic reactor must be a COOLING duty now (the old
            # +6716 kJ 'reaction' record was the transfer jump, mis-booked).
            if records[("reactor", "reaction")] >= 0.0:
                failures.append("recipe01: reactor reaction duty is not"
                                " exothermic -- the transfer mis-attribution"
                                " is back")

            # Peak: engine KPI == staircase recomputed here; the
            # bring-to-boil spike beats the segment mean by >5x.
            k_peak = kpi(out, "campaign", "utility_steamLP_peak_kW")
            if k_peak is None:
                failures.append("recipe01: utility_steamLP_peak_kW missing")
            else:
                mine = staircase_peak(rows, "steamLP")
                if abs(mine - k_peak) > 1e-9 * max(k_peak, 1.0):
                    failures.append(f"recipe01: steamLP peak KPI {k_peak}"
                                    f" != staircase {mine}")
                reb = records[("still", "reboiler")]
                n_reb = sum(1 for r in rows if r["eventType"] == "reboiler")
                mean = abs(reb) / max(n_reb, 1)   # kJ over 1 s steps -> kW
                if k_peak < 5.0 * mean:
                    failures.append(f"recipe01: steamLP peak {k_peak} kW"
                                    f" does not beat 5x the mean {mean} kW"
                                    " -- the spike the total hides is gone")

            # ---- SABOTAGE (mandated): the reconciliation refuses -------
            #   a removed interval / a flipped sign / an altered dE.
            base = [dict(r) for r in rows]
            sab = [("removed interval", base[1:]),
                   ("flipped sign", [dict(r, deltaEnergy_kJ=str(
                       -float(r["deltaEnergy_kJ"]))) if i == 0 else r
                       for i, r in enumerate(base)]),
                   ("altered deltaEnergy", [dict(r, deltaEnergy_kJ=str(
                       1.01 * float(r["deltaEnergy_kJ"]))) if i == 0 else r
                       for i, r in enumerate(base)])]
            for name, mutant in sab:
                if not reconcile(mutant, records):
                    failures.append(f"SABOTAGE '{name}': reconciliation did"
                                    " NOT refuse")

        # ---- IMPULSE: recipe02 ------------------------------------------
        case2, rc, out2 = run_case(tmp, R02)
        if rc != 0:
            failures.append(f"recipe02: exit {rc}\n" + out2[-1200:])
        else:
            rows2 = read_rows(case2)
            imp = [r for r in rows2 if r["eventType"] == "impulse"]
            if not imp:
                failures.append("recipe02: no impulse rows in the CSV")
            for r in imp:
                if r["averageRate_kW"] != "":
                    failures.append("recipe02: impulse row carries a rate")
                    break
            if "impulsive energy" not in out2:
                failures.append("recipe02: stdout lacks the impulse warning")
            meta2 = (case2 / "reports" / "utilities"
                     / "utilityDemand.meta").read_text()
            if "WARNING impulsive energy" not in meta2:
                failures.append("recipe02: meta lacks the impulse warning")
            # steamLP demand is impulse-only => NO peak KPI may exist.
            if kpi(out2, "campaign", "utility_steamLP_peak_kW") is not None:
                failures.append("recipe02: an impulse-only utility grew a"
                                " peak KPI -- impulses leaked into the peak")
            k_cw = kpi(out2, "campaign", "utility_coolingWater_peak_kW")
            if k_cw is None:
                failures.append("recipe02: coolingWater peak KPI missing")
            else:
                mine = staircase_peak(rows2, "coolingWater")
                if abs(mine - k_cw) > 1e-9 * max(k_cw, 1.0):
                    failures.append(f"recipe02: coolingWater peak {k_cw}"
                                    f" != staircase {mine}")

        # ---- UNPROFILED: a samplerless unit is LISTED, never silent -----
        case3, rc, out3 = run_case(tmp, B13)
        if rc != 0:
            failures.append(f"batch13: exit {rc}\n" + out3[-1200:])
        else:
            metaf = case3 / "reports" / "utilities" / "utilityDemand.meta"
            if "UNPROFILED" not in out3 or not metaf.exists() \
               or "UNPROFILED" not in metaf.read_text():
                failures.append("batch13: crystalliser records not LISTED"
                                " as unprofiled (a partial staircase must"
                                " never read total)")
            rows3 = read_rows(case3)
            if any(r["unit"] == "crystalliser" for r in rows3):
                failures.append("batch13: rows exist for a unit with no"
                                " sampler")

    if failures:
        print("check_temporal_utilities: FAIL")
        for f in failures:
            print("  -", f)
        return 1
    print("check_temporal_utilities: profile==ledger + peaks + impulse"
          " exclusion + 3 sabotages refused + unprofiled listing OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
