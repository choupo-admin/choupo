#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Dynamic-tank gate (DEV.md 4c C205, slice 1): the `dynamicTank` unit with a
LEVEL -- its ledger closes, its valve law reaches its closed form, its level
loop behaves as the textbook says, and a vessel that cannot exist is REFUSED.

Arms (every one re-runs the engine; nothing is read from a stored result):

  (a) LEDGER, both witnesses.  unsteady05_tank_valve_drain (choupoSemiContinuous)
      and ctrl21_tank_level_control (choupoCtrl) publish a balance block that
      CLAIMS mass AND energy (functional H) and closes: mass_closure_rel and
      energy_closure_rel <= 1e-6.  A tank that only claimed mass, or whose
      face enthalpies lived on another surface than its stored H, fails here.
  (b) VALVE STEADY LEVEL.  The run's final level (trajectory.csv, last row)
      equals the closed form  h* = (Q/(Cv x))^2/g - (P - P_down)/(rho g),
      Q = F_in MW/rho, recomputed HERE from the declared numbers and the run's
      own density column -- not from the engine's startup print.  Tolerance
      1e-3 relative (the response is first order with tau ~ 2600 s and the
      case runs 9 tau).  Also: the level rises monotonically from its start
      (a self-regulating response has no overshoot).
  (c) LEVEL LOOP.  ctrl21 with the shipped PI gains returns the level to the
      setpoint (|h - SP| < 1e-3 m at the end); the SAME case with Ki = 0
      (P-only, built as a temporary variant) settles at the offset
      (F_in,new - bias)/|Kp| = 0.050 m to 1e-3 m.  Recomputed from the
      declared gains, not typed.
  (d) REFUSALS, by name, at exit != 0: a tank drained by a manipulated flow
      larger than the inflow RAN DRY; one with F_out = 0 OVERFLOWED; a valve
      whose downstream pressure exceeds the head REVERSES.  Each message must
      carry its word; an exit 0 or another message fails.
  (e) SOURCE.  The valve flow of VariableVolumeHoldup.cpp adds the static head
      (rho * gravity * level) to the vessel pressure -- the one sentence that,
      dropped, moves the closed form of arm (b).

SABOTAGE RECORD (performed by hand 2026-11-02, restored, rebuilt):
  replacing the static head rho*gravity*level by a negligible term in
  VariableVolumeHoldup::valveVolumetricFlow (dP = P_vessel - P_downstream,
  i.e. a valve that does not feel the liquid above it) made the gate FAIL
  twice: arm (b)/(a) because the valve witness no longer reaches a steady
  level (the outflow stops growing with the level and the tank OVERFLOWED at
  t = 1750 s, refused by name), and arm (e) on the source sentence.  The
  behavioural arm is the one that matters; the source arm names the cause.

Exit 1 listing failures."""
import csv
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BIN = ROOT / "build" / "linux64Gcc"
SEMI = BIN / "choupoSemiContinuous"
CTRL = BIN / "choupoCtrl"
UNS = ROOT / "tutorials" / "unsteady" / "unsteady05_tank_valve_drain"
CTL = ROOT / "tutorials" / "ctrl" / "ctrl21_tank_level_control"
HOLDUP_SRC = ROOT / "src" / "unitOperations" / "dynamic" / "VariableVolumeHoldup.cpp"
G = 9.80665


def make_case(tmp, name, src):
    case = Path(tmp) / name

    def ignore(_d, names):
        out = []
        for nm in names:
            if nm.startswith("log.choupo") or nm in ("reports", "latest", "expected"):
                out.append(nm)
            elif nm.endswith(".csv") or nm.endswith(".meta"):
                out.append(nm)
            elif nm != "0" and nm.replace(".", "", 1).isdigit():
                out.append(nm)
        return out

    shutil.copytree(src, case, ignore=ignore)
    return case


def run(binary, case):
    r = subprocess.run([str(binary), str(case)], capture_output=True, text=True,
                       cwd=ROOT)
    return r, r.stdout + r.stderr


def kpis(out):
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>", out, re.S)
    return json.loads(m.group(1))["kpis"] if m else None


def trajectory(case):
    with open(case / "trajectory.csv") as f:
        rows = list(csv.DictReader(f))
    return rows


def col(rows, name):
    # tolerate a "tank." prefix on the column names
    key = next((k for k in rows[0] if k == name or k.endswith("." + name)
                or k.endswith("_" + name)), None)
    if key is None:
        raise KeyError(f"trajectory.csv has no column '{name}' (columns: {list(rows[0])})")
    return [float(r[key]) for r in rows]


def scalar(text, key, unit_ok=True):
    m = re.search(rf"(?m)^\s*{key}\s+([-+0-9.eE]+)", text)
    if not m:
        raise KeyError(key)
    return float(m.group(1))


def ledger_ok(tag, out, bad):
    bk = (kpis(out) or {}).get("balance")
    if bk is None:
        bad.append(f"{tag}: no balance block in the result")
        return None
    if bk.get("material_available") != 1:
        bad.append(f"{tag}: material ledger not claimed")
    if bk.get("energy_balance_available") != 1 or bk.get("energy_functional_H") != 1:
        bad.append(f"{tag}: the tank must CLAIM the energy ledger (functional H):"
                   f" energy_balance_available={bk.get('energy_balance_available')}")
    mc, ec = bk.get("mass_closure_rel", 1), bk.get("energy_closure_rel", 1)
    if not mc <= 1e-6:
        bad.append(f"{tag}: mass closure {mc} (> 1e-6)")
    if not ec <= 1e-6:
        bad.append(f"{tag}: energy closure {ec} (> 1e-6)")
    return mc, ec


def main():
    bad, notes = [], []
    for b in (SEMI, CTRL):
        if not b.exists():
            print(f"check_dynamic_tank: cannot run -- {b} missing (make all)")
            return 1

    with tempfile.TemporaryDirectory(prefix="choupo-tank-") as tmp:
        # ---- (a)+(b) the valve witness ------------------------------------
        case = make_case(tmp, "valve", UNS)
        r, out = run(SEMI, case)
        if r.returncode != 0:
            bad.append("unsteady05: failed to run:\n" + out[-600:])
        else:
            mc, ec = ledger_ok("unsteady05", out, bad) or (None, None)
            fl = open(case / "system" / "flowsheetDict").read()
            fd = open(case / "0" / "feed").read()
            cv = scalar(fl, "Cv"); x = scalar(fl, "opening")
            Pd = scalar(fl, "downstreamPressure")
            F_in = scalar(fd, "water")
            Pv = scalar(open(case / "0" / "internalStates" / "tank").read(), "P")
            MW = scalar(open(ROOT / "data" / "standards" / "components" / "water.dat").read(), "MW")
            rows = trajectory(case)
            rho = col(rows, "density")[-1]
            Q = F_in * MW / rho
            hstar = (Q / (cv * x)) ** 2 / G - (Pv - Pd) / (rho * G)
            lv = col(rows, "level")
            rel = abs(lv[-1] - hstar) / hstar
            if rel > 1e-3:
                bad.append(f"unsteady05: final level {lv[-1]:.5f} m vs closed form"
                           f" h* = {hstar:.5f} m (rel {rel:.2e} > 1e-3)")
            if any(b < a - 1e-9 for a, b in zip(lv, lv[1:])):
                bad.append("unsteady05: the self-regulating level is not monotone"
                           " (a first-order response has no overshoot)")
            notes.append(f"valve h*={hstar:.4f} m run={lv[-1]:.4f} m (rel {rel:.1e})")

        # ---- (a)+(c) the level loop ----------------------------------------
        case = make_case(tmp, "pi", CTL)
        r, out = run(CTRL, case)
        sp = bias = kp = None
        if r.returncode != 0:
            bad.append("ctrl21: failed to run:\n" + out[-600:])
        else:
            ledger_ok("ctrl21", out, bad)
            fl = (case / "system" / "flowsheetDict").read_text()
            sp = scalar(fl, "setpoint"); kp = scalar(fl, "Kp"); bias = scalar(fl, "bias")
            step = scalar(fl, "step"); mean = scalar(fl, "mean")
            lv = col(trajectory(case), "level")
            if abs(lv[-1] - sp) > 1e-3:
                bad.append(f"ctrl21 PI: final level {lv[-1]:.5f} m is not at the"
                           f" setpoint {sp} m")
            pk = max(abs(v - sp) for v in lv)
            notes.append(f"PI end offset {lv[-1]-sp:+.1e} m, peak |h-SP| {pk:.3f} m")
            # P-only variant
            case2 = make_case(tmp, "ponly", CTL)
            f2 = case2 / "system" / "flowsheetDict"
            txt = f2.read_text()
            txt2 = re.sub(r"(?m)^(\s*Ki\s+)[^;]+;", r"\g<1>0.0;", txt)
            if txt2 == txt:
                bad.append("ctrl21: could not build the P-only variant (no Ki line)")
            f2.write_text(txt2)
            r2, out2 = run(CTRL, case2)
            if r2.returncode != 0:
                bad.append("ctrl21 P-only: failed to run:\n" + out2[-600:])
            else:
                off = col(trajectory(case2), "level")[-1] - sp
                want = ((mean + step) - bias) / abs(kp)
                if abs(off - want) > 1e-3:
                    bad.append(f"ctrl21 P-only: offset {off:.5f} m vs"
                               f" (F_in,new - bias)/|Kp| = {want:.5f} m")
                notes.append(f"P-only offset {off:+.4f} m (predicted {want:+.4f})")

        # ---- (d) refusals ----------------------------------------------------
        def probe(tag, word, edit, binary=SEMI, src=UNS):
            c = make_case(tmp, tag, src)
            edit(c)
            rr, oo = run(binary, c)
            if rr.returncode == 0:
                bad.append(f"refusal {tag}: ran to exit 0 -- must be refused")
            elif word not in oo:
                bad.append(f"refusal {tag}: refused, but not by name ('{word}'"
                           f" absent): {oo[-300:]}")

        def sub_flow(F):
            def e(c):
                p = c / "system" / "flowsheetDict"
                t = p.read_text()
                t2 = re.sub(r"outflow\s*\{.*?\n            \}\n",
                            "outflow { mode flow; F %s kmol/s; }\n" % F, t, flags=re.S)
                assert t2 != t
                p.write_text(t2)
            return e

        def sub_down(Pa):
            def e(c):
                p = c / "system" / "flowsheetDict"
                p.write_text(re.sub(r"downstreamPressure\s+[^;]+;",
                                    f"downstreamPressure {Pa} Pa;", p.read_text()))
            return e

        probe("dry", "RAN DRY", sub_flow(0.8))
        probe("overflow", "OVERFLOWED", sub_flow(0.0))
        probe("reverse", "REVERSE", sub_down(400000.0))

    # ---- (e) source arm -------------------------------------------------------
    src = HOLDUP_SRC.read_text()
    src = re.sub(r"//.*", "", src)
    if not re.search(r"P_vessel_Pa\s*\+\s*rho\s*\*\s*gravity", src):
        bad.append("source: valveVolumetricFlow no longer adds the static head"
                   " rho*gravity*level to the vessel pressure")

    if bad:
        print("check_dynamic_tank: FAILED")
        for b in bad:
            print("  - " + b)
        return 1
    print("check_dynamic_tank: OK -- dynamicTank: mass AND energy ledgers claimed and closed"
          " on both witnesses; valve steady level equals its closed form; PI holds the"
          " setpoint and P-only settles at (F_in,new-bias)/|Kp|; dry, overflow and reverse"
          " flow refused by name; static head present in the shared holdup home"
          f" [{'; '.join(notes)}]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
