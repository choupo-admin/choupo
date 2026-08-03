#!/usr/bin/env python3
"""Pinch P2 gate: the candidate-match ANALYSIS TABLE (ratified
2026-08-03) is an exhaustive per-region enumeration whose duties equal an
INDEPENDENT recomputation, whose language never claims an optimum, and
whose violation diagnostics satisfy the excess identity.

Programme scope: docs/design/pinch-programme-scope.md (P2 = analysis
table, never a rewiring; P3 stays UNAUTHORISED).  Witness:
tutorials/steady/heat/pinch01_four_stream_classic -- the hand-worked
candidate table lives in its flowsheetDict header.

Probes, through the real choupoSolve binary:

  SCHEMA     reports/pinch/candidateMatches.csv carries the ratified
             columns region,hotStream,coldStream,temperatureFeasible,
             pinchRule,maximumCandidateDuty_kW,limitingReason,
             recommendation -- and exactly the 6 exhaustive pairs of the
             classic (2 above, 4 below).
  DUTY       every row's maximum candidate duty equals THIS SCRIPT'S own
             counter-current bound over the same clipped segments
             (independent reimplementation of
             Q_max = min(Q_hot, Q_cold, min(CP)*(Th_hi - Tc_lo - dTmin))
             from the four published stream specs, not a copy of the C++).
  CP RULE    the two below-pinch H1 rows carry the VIOLATED rule and the
             "away from the pinch only" recommendation; the holding rows
             say so; no row -- and no stdout line -- ever contains the
             word "optimal" (the ratified language boundary).
  VIOLATION  the diagnostics name H1's 120 kW cooler-above and C1/C2's
             125+135 kW heaters-below, the KPIs carry 120/260, and the
             identity holds: violations sum == Q_heat_current - Q_H_min
             (380 kW) -- the excess over target IS the violations.

Sabotage-verified at build time: flipping the below-pinch CP inequality
turns H2's holding rows into VIOLATED ones -> the CP RULE probe fails by
value (recorded in the commit).

Exit 1 listing failures."""
import csv
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
CASE = ROOT / "tutorials" / "steady" / "heat" / "pinch01_four_stream_classic"

failures = []

#  The classic four-stream population (published spec, C; CP in kW/K)
#  and the case's declared approach.
DTMIN = 20.0
PINCH_HOT, PINCH_COLD = 90.0, 70.0
HOT = {"coolerH1": (60.0, 150.0, 2.0), "coolerH2": (60.0, 90.0, 8.0)}
COLD = {"heaterC1": (20.0, 125.0, 2.5), "heaterC2": (25.0, 100.0, 3.0)}


def clip(lo, hi, pinch, above):
    lo2, hi2 = (max(lo, pinch), hi) if above else (lo, min(hi, pinch))
    return (lo2, hi2) if hi2 - lo2 > 1e-9 else None


def qmax(hseg, cseg, cph, cpc):
    qh = cph * (hseg[1] - hseg[0])
    qc = cpc * (cseg[1] - cseg[0])
    qa = min(cph, cpc) * (hseg[1] - cseg[0] - DTMIN)
    return max(0.0, min(qh, qc, qa))


def independent_table():
    rows = {}
    for above in (True, False):
        for hn, (hlo, hhi, cph) in HOT.items():
            h = clip(hlo, hhi, PINCH_HOT, above)
            if not h:
                continue
            for cn, (clo, chi, cpc) in COLD.items():
                c = clip(clo, chi, PINCH_COLD, above)
                if not c:
                    continue
                region = "abovePinch" if above else "belowPinch"
                rows[(region, hn, cn)] = qmax(h, c, cph, cpc)
    return rows


def main() -> int:
    if not SOLVE.exists():
        print(f"check_pinch_p2: {SOLVE} missing -- build first")
        return 1
    with tempfile.TemporaryDirectory() as td:
        case = Path(td) / CASE.name
        shutil.copytree(CASE, case, ignore=shutil.ignore_patterns(
            "expected", "log.*", "reports", "converged", "resultJson*"))
        p = subprocess.run([str(SOLVE), "."], cwd=case,
                           capture_output=True, text=True, timeout=600)
        out = p.stdout + p.stderr
        if p.returncode != 0:
            print("check_pinch_p2: witness run failed\n" + out[-1200:])
            return 1

        # ---- the ratified language boundary ----------------------------
        f = case / "reports" / "pinch" / "candidateMatches.csv"
        if not f.exists():
            print("check_pinch_p2: candidateMatches.csv missing")
            return 1
        blob = out + f.read_text()
        if "optimal" in blob.lower():
            failures.append("the word 'optimal' appears -- the table may"
                            " only ever claim thermodynamic admissibility")

        # ---- SCHEMA + exhaustive enumeration ---------------------------
        want_hdr = ("region,hotStream,coldStream,temperatureFeasible,"
                    "pinchRule,maximumCandidateDuty_kW,limitingReason,"
                    "recommendation")
        lines = f.read_text().splitlines()
        if lines[0] != want_hdr:
            failures.append(f"CSV header '{lines[0]}' != ratified schema")
        rows = list(csv.DictReader(lines))
        mine = independent_table()
        if len(rows) != len(mine):
            failures.append(f"{len(rows)} rows vs {len(mine)} exhaustive"
                            " pairs")

        # ---- DUTY: independent recomputation ---------------------------
        for r in rows:
            key = (r["region"], r["hotStream"], r["coldStream"])
            if key not in mine:
                failures.append(f"unexpected row {key}")
                continue
            got = float(r["maximumCandidateDuty_kW"])
            if abs(got - mine[key]) > 1e-6 * max(mine[key], 1.0):
                failures.append(f"{key}: duty {got} != independent"
                                f" {mine[key]}")
            if r["recommendation"].startswith("thermodynamically"
                                              " admissible") \
               != (mine[key] > 1e-9):
                failures.append(f"{key}: admissibility wording does not"
                                " match the duty")

        # ---- CP RULE wording -------------------------------------------
        def row(region, h, c):
            for r in rows:
                if (r["region"], r["hotStream"], r["coldStream"]) \
                   == (region, h, c):
                    return r
            return None

        for cn in ("heaterC1", "heaterC2"):
            r = row("belowPinch", "coolerH1", cn)
            if not r or "VIOLATED" not in r["pinchRule"] \
               or "away from the pinch only" not in r["recommendation"]:
                failures.append(f"belowPinch H1 x {cn}: the CP violation"
                                " and its away-from-pinch wording are"
                                " required")
            r2 = row("belowPinch", "coolerH2", cn)
            if not r2 or "holds" not in r2["pinchRule"]:
                failures.append(f"belowPinch H2 x {cn}: CP_hot >= CP_cold"
                                " holds and must say so")

        # ---- VIOLATION diagnostics + the excess identity ----------------
        for needle in (
            "VIOLATION cooler above the pinch: unit 'coolerH1' rejects 120",
            "VIOLATION heater below the pinch: unit 'heaterC1' draws 125",
            "VIOLATION heater below the pinch: unit 'heaterC2' draws 135",
        ):
            if needle not in out:
                failures.append(f"stdout lacks '{needle}'")

        def kpi(name):
            m = re.search(r'"%s":\s*([0-9.eE+-]+)' % re.escape(name), out)
            return float(m.group(1)) if m else None

        cool = kpi("violation_cool_above_pinch_kW")
        heat = kpi("violation_heat_below_pinch_kW")
        qcur = kpi("Q_heat_current_kW")
        qmin_ = kpi("Q_H_min_kW")
        if None in (cool, heat, qcur, qmin_):
            failures.append("violation / target KPIs missing")
        else:
            if abs(cool - 120.0) > 1e-6 or abs(heat - 260.0) > 1e-6:
                failures.append(f"violation KPIs {cool}/{heat} != 120/260")
            if abs((cool + heat) - (qcur - qmin_)) > 1e-6:
                failures.append("identity broken: violations sum"
                                f" {cool + heat} != excess {qcur - qmin_}")

    if failures:
        print("check_pinch_p2: FAIL")
        for m in failures:
            print("  -", m)
        return 1
    print("check_pinch_p2: OK -- 6 exhaustive pairs equal the independent"
          " duty bound, CP-rule wording exact, no 'optimal' anywhere,"
          " violations 120+260 == the 380 kW excess over target")
    return 0


if __name__ == "__main__":
    sys.exit(main())
