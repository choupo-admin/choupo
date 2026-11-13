#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Pinch gate: A UTILITY IS NOT A PROCESS STREAM (DEV.md 4c C230).

Witness: tutorials/plant/ammonia02_full_plant, whose water cooler takes
485.64 -> 311.66 K from the hot effluent with COOLING WATER (298.15 ->
303.66 K, the declared circuit CW1).  The pinch pass used to count that
water as a cold PROCESS stream and so manufactured a pinch (Q_H,min 2158 kW,
Q_C,min 39 791 kW, T* 308.15 K).  The right answer is a THRESHOLD problem.

Probes, through the real choupoSolve binary:

  RIGHT      the case as shipped.  The pass's pinch.* KPIs equal THIS
             SCRIPT'S own Linnhoff-Flower cascade over the four process
             segments built from the units' own published temperatures and
             duties (FEHE hot and cold sides, the cooler's hot side, the
             separator, the letdown as a 1 K latent slice): Q_H,min = 0,
             Q_C,min = 95 732.5 kW, NO pinch (pinch_exists 0); the water is a
             `utility` row of population.csv, not a segment; utility_sides 1.
  WRONG      the same case with the `utilities` circuit deleted (so the
             water is nothing declared): the pass cannot know it is a service
             and the result equals this script's cascade WITH the water as a
             cold stream -- the old, wrong numbers.  The gate distinguishes
             the two: if the exclusion stopped working, RIGHT would equal
             WRONG and fail by value.

Sabotage (by hand, restored): (1) in PinchPass.cpp make serviceOf empty
-> RIGHT fails (the pinch returns); (2) skip `continue` after the utility
branch -> RIGHT fails (segments 6); (3) make the utility side the hot one
always -> RIGHT fails by value.

Exit 1 listing failures."""
import csv
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
CASE = ROOT / "tutorials" / "plant" / "ammonia02_full_plant"
DTMIN = 20.0
LATENT = 1.0

failures = []


def problem_table(streams, dtmin):
    """Linnhoff-Flower cascade. streams: (hot, Tlo, Thi, CP[W/K]).
    Returns (QH, QC, has_pinch) in kW."""
    hs, cs = -dtmin / 2.0, +dtmin / 2.0
    bounds = set()
    for hot, lo, hi, _ in streams:
        sh = hs if hot else cs
        bounds.update((lo + sh, hi + sh))
    T = sorted(bounds, reverse=True)
    cascade, lowest = 0.0, 0.0
    for i in range(len(T) - 1):
        mid = 0.5 * (T[i] + T[i + 1])
        net = 0.0
        for hot, lo, hi, cp in streams:
            sh = hs if hot else cs
            if lo + sh <= mid <= hi + sh:
                net += cp if hot else -cp
        cascade += net * (T[i] - T[i + 1])
        lowest = min(lowest, cascade)
    qh = -lowest
    return qh / 1e3, (cascade + qh) / 1e3, qh > 1e-6


def kpis_of(out, unit):
    m = re.search(r'"%s":\s*(\{[^{}]*\})' % re.escape(unit), out)
    return json.loads(m.group(1)) if m else None


def run(case):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(SOLVE), "."], cwd=case, env=env,
                       capture_output=True, text=True, timeout=1500)
    return p.returncode, p.stdout + p.stderr


def segments(out, with_water):
    fe, wc = kpis_of(out, "FEHE"), kpis_of(out, "waterCooler")
    sp, ld = kpis_of(out, "separator"), kpis_of(out, "letdown")
    if not all((fe, wc, sp, ld)):
        return None
    qfe, qwc = fe["Q_kW"] * 1e3, wc["Q_kW"] * 1e3
    qsp, qld = abs(sp["Q_kW"]) * 1e3, ld["Q_kW"] * 1e3
    s = [
        (True, fe["T_hot_out"], fe["T_hot_in"],
         qfe / (fe["T_hot_in"] - fe["T_hot_out"])),
        (False, fe["T_cold_in"], fe["T_cold_out"],
         qfe / (fe["T_cold_out"] - fe["T_cold_in"])),
        (True, wc["T_hot_out"], wc["T_hot_in"],
         qwc / (wc["T_hot_in"] - wc["T_hot_out"])),
        (True, sp["T"], wc["T_hot_out"], qsp / (wc["T_hot_out"] - sp["T"])),
        (False, ld["T"] - LATENT / 2, ld["T"] + LATENT / 2, qld / LATENT),
    ]
    if with_water:
        s.append((False, wc["T_cold_in"], wc["T_cold_out"],
                  qwc / (wc["T_cold_out"] - wc["T_cold_in"])))
    return s


def close(a, b, rel=1e-6):
    return abs(a - b) <= rel * max(1.0, abs(a), abs(b))


def main():
    if not SOLVE.exists():
        print(f"check_pinch_utility: {SOLVE} missing -- build first")
        return 1
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        ig = shutil.ignore_patterns("expected", "log.*", "reports", "converged")
        results = {}
        for tag in ("right", "wrong"):
            c = tmp / tag
            shutil.copytree(CASE, c, ignore=ig)
            if tag == "wrong":
                fd = c / "system" / "flowsheetDict"
                txt = fd.read_text()
                new = re.sub(r"\nutilities\s*\(.*?\n\);", "\n", txt, flags=re.S)
                if new == txt:
                    failures.append("WRONG: could not delete the utilities"
                                    " circuit from the case copy")
                fd.write_text(new)
                #  without the circuit the economics pass would refuse an
                #  unpriced cooling-water stream; this probe is about the
                #  pinch only, so its postDict carries the pinch pass alone
                (c / "system" / "postDict").write_text(
                    "pinchPass\n{\n    dTmin   20 K;\n}\n")
                (c / "system" / "layoutDict").unlink()   # it places sized items
            rc, out = run(c)
            m = re.search(r'"pinch":\s*(\{[^{}]*\})', out)
            if rc != 0 or not m:
                failures.append(f"{tag.upper()}: exit {rc} or no pinch KPIs")
                continue
            results[tag] = (json.loads(m.group(1)), out, c)

        for tag, with_water in (("right", False), ("wrong", True)):
            if tag not in results:
                continue
            k, out, c = results[tag]
            segs = segments(out, with_water)
            if segs is None:
                failures.append(f"{tag.upper()}: unit KPIs not found")
                continue
            qh, qc, pin = problem_table(segs, DTMIN)
            if not close(k["Q_H_min_kW"] or 0.0, qh, 1e-6) or \
                    not close(k["Q_C_min_kW"], qc, 1e-6):
                failures.append(
                    f"{tag.upper()}: engine Q_H,min {k['Q_H_min_kW']},"
                    f" Q_C,min {k['Q_C_min_kW']} vs independent cascade"
                    f" {qh}, {qc}")
            if bool(k.get("pinch_exists", -1)) != pin:
                failures.append(f"{tag.upper()}: pinch_exists"
                                f" {k.get('pinch_exists')} vs independent {pin}")
            pop = c / "reports" / "pinch" / "population.csv"
            rows = list(csv.DictReader(open(pop))) if pop.exists() else []
            nutil = sum(1 for r in rows if r["role"] == "utility")
            nseg = sum(1 for r in rows if r["role"] in ("segment", "recovered"))
            if tag == "right":
                if nutil != 1 or k.get("utility_sides") != 1.0:
                    failures.append(f"RIGHT: utility rows {nutil}, KPI"
                                    f" utility_sides {k.get('utility_sides')}"
                                    " (expected 1)")
                if nseg != 5 or k.get("segments") != 5.0:
                    failures.append(f"RIGHT: {nseg} stream rows (expected 5:"
                                    " the water is not one)")
                if not close(k["Q_C_min_kW"], 95732.5, 1e-5) or \
                        abs(k["Q_H_min_kW"] or 0.0) > 1e-3:
                    failures.append("RIGHT: targets are not the hand-computed"
                                    " 0 / 95732.5 kW (engine %r / %r)"
                                    % (k["Q_H_min_kW"], k["Q_C_min_kW"]))
                if pin:
                    failures.append("RIGHT: a pinch was found; the problem is"
                                    " a threshold problem")
                if "THRESHOLD problem" not in out:
                    failures.append("RIGHT: the console does not announce the"
                                    " threshold problem")
                if "utility   waterCooler [cold side]" not in out:
                    failures.append("RIGHT: the utility side is not announced")
            else:
                if nutil != 0 or k.get("segments") != 6.0:
                    failures.append("WRONG: with no declared circuit the"
                                    " water must be a stream (segments 6)")
        if "right" in results and "wrong" in results:
            a, b = results["right"][0], results["wrong"][0]
            if close(a["Q_C_min_kW"], b["Q_C_min_kW"], 1e-3) or \
                    close(a["Q_H_min_kW"] or 0.0, b["Q_H_min_kW"], 1e-3):
                failures.append("the declared and undeclared water give the"
                                " same targets: the exclusion does nothing")
    if failures:
        print("check_pinch_utility: FAIL")
        for f in failures:
            print("  -", f)
        return 1
    print("check_pinch_utility: OK -- ammonia02's cooling water (declared"
          " circuit CW1) is a utility row, not a stream: targets equal the"
          " independent cascade over the 5 process segments (Q_H,min 0,"
          " Q_C,min 95732.5 kW, no pinch); the same case with the circuit"
          " deleted counts the water and gives the old pinch, so the gate"
          " tells them apart (the exclusion reads the declared circuit and"
          " category, never a stream name)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
