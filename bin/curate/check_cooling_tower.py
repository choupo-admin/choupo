#!/usr/bin/env python3
"""check_cooling_tower -- the Merkel construction closes on its own published
diagram, and the refusals fire by name.

CLAIM.  On the witness (tutorials/steady/heat/coolingTower01_merkel):

  A1  The Merkel number the engine reports is REPRODUCED by an independent
      Simpson quadrature over the unit's own published profile
      (h_saturation - h_operating against T), with cpL derived from the
      operating line's slope and the published L_over_G -- never taken from
      the engine's internals.  Rating mode makes this a real closure: the
      engine bisected its own integral to hit Me = 1.5, so if that integral
      were wrong the published CURVES would disagree with the published Me.
  A2  The published CTI four-point Chebyshev estimate is reproduced from the
      same profile by interpolation at the 0.1/0.4/0.6/0.9 fractions.
  A3  approach_K == T_water_out - T_wb_in and the profile spans exactly
      [T_water_out, T_water_in] (identities, 1e-9 / 1e-6).
  A4  The evaporation is consistent with the published psychrometric pair:
      E == G_dry (Y_out - Y_in), with G_dry chained from Q, cpL, range and
      L_over_G -- all published numbers.
  A5  The operating line lies strictly BELOW the saturation curve at every
      published point (the feasibility the integral needs).

REFUSALS (probe cases built from the witness, each matched on its text):
  R1  both spec keys            -> "specify EXACTLY ONE"
  R2  target below the wet bulb -> "wet bulb"
  R3  L/G cranked to a pinch    -> "PINCHED"
  R4  two liquid inlets         -> "cannot tell the water from the air"
  R5  target above the inlet    -> "must lie BELOW"

SABOTAGE RECORD (both performed 2026-08-15, observed output verbatim):
  S1  CoolingTower.cpp Simpson divisor 3.0 -> 3.1, rebuilt: A1 FAILED with
      "Me from published profile 1.550000 vs KPI 1.500000" -- the damaged
      integral under-measures, the rating bisection compensates by cooling
      further, and the TRUE curves over the published span then integrate
      to 1.55 against the claimed 1.5.
  S2  approach_K published as T_out - T_wb - 0.1, rebuilt: A3 FAILED with
      "approach identity off by 0.1".
  Both reverted; the unmodified witness passes all arms.

NOT COVERED, said plainly: whether Merkel's model agrees with a MEASURED
tower (no published primary anchor is wired yet -- the case is a structural
witness; an anchored sibling is the named next step), the Lewis = 1 and
saturated-exit hypotheses themselves (announced approximations, not checked
facts), and the golden values (runTests' own row comparison carries those).
"""

import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
CASE = ROOT / "tutorials" / "steady" / "heat" / "coolingTower01_merkel"

failures = []


def run(case: Path):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(SOLVE), "."], cwd=case, env=env,
                       capture_output=True, text=True, timeout=900)
    return p.returncode, p.stdout + p.stderr


def copy(tmp: Path, tag: str) -> Path:
    case = tmp / tag
    shutil.copytree(CASE, case,
                    ignore=shutil.ignore_patterns("expected", "log.*",
                                                  "reports", "converged"))
    return case


def kpis(out: str):
    m = re.search(r'"tower01":\s*({[^{}]*})', out)
    if not m:
        return None
    import json
    return json.loads(m.group(1))


def profile_col(out: str, name: str):
    m = re.search(r'"profiles":\s*{\s*"tower01":.*?"' + re.escape(name)
                  + r'":\s*\[([^\]]*)\]', out, re.S)
    if not m:
        return None
    return [float(x) for x in m.group(1).split(",")]


def set_operation(case: Path, body: str):
    fd = case / "system" / "flowsheetDict"
    txt = fd.read_text()
    txt = re.sub(r'operation\s*\{[^}]*\}', "operation\n        {\n"
                 + body + "\n        }", txt, count=1)
    fd.write_text(txt)


def main() -> int:
    if not SOLVE.exists():
        print(f"check_cooling_tower: {SOLVE} missing -- build first")
        return 1

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        # ---- WITNESS: run once, close every published claim ----------------
        case = copy(tmp, "witness")
        rc, out = run(case)
        if rc != 0:
            failures.append(f"witness did not converge (exit {rc})")
        k = kpis(out)
        T = profile_col(out, "T_K")
        hop = profile_col(out, "h_operating_kJ_kg")
        heq = profile_col(out, "h_saturation_kJ_kg")
        if not k or not T or not hop or not heq:
            failures.append("witness KPIs or profile columns missing from the"
                            " result JSON")
        else:
            t_out, t_in = T[0], T[-1]
            lg = k["L_over_G"]
            # cpL off the operating line's own slope (h in kJ/kg -> J/kg).
            slope = (hop[-1] - hop[0]) * 1000.0 / (t_in - t_out)
            cpl = slope / lg

            # A5 feasibility + A1 Simpson over the published grid (even count).
            df = [(heq[i] - hop[i]) * 1000.0 for i in range(len(T))]
            if min(df) <= 0.0:
                failures.append("A5: operating line touches/crosses saturation"
                                " in the PUBLISHED profile")
            npts = len(T)
            h = (t_in - t_out) / (npts - 1)
            simpson = df and min(df) > 0.0
            if simpson:
                s = 0.0
                for i in range(npts):
                    w = 1.0 if i in (0, npts - 1) else (4.0 if i % 2 else 2.0)
                    s += w / df[i]
                me = cpl * s * h / 3.0
                if abs(me - k["merkelNumber"]) / k["merkelNumber"] > 5.0e-3:
                    failures.append(f"A1: Me from published profile {me:.6f}"
                                    f" vs KPI {k['merkelNumber']:.6f}")

            # A2 Chebyshev-4 by interpolation on the published grid.
            def interp(cols, Tq):
                for i in range(npts - 1):
                    if T[i] <= Tq <= T[i + 1]:
                        f = (Tq - T[i]) / (T[i + 1] - T[i])
                        return cols[i] + f * (cols[i + 1] - cols[i])
                return cols[-1]
            s4 = sum(1.0 / ((interp(heq, t_out + f * (t_in - t_out))
                             - interp(hop, t_out + f * (t_in - t_out))) * 1000.0)
                     for f in (0.1, 0.4, 0.6, 0.9))
            cheb = cpl * (t_in - t_out) * s4 / 4.0
            if abs(cheb - k["merkelNumber_chebyshev4"]) \
                    / k["merkelNumber_chebyshev4"] > 2.0e-3:
                failures.append(f"A2: Chebyshev-4 from profile {cheb:.6f} vs"
                                f" KPI {k['merkelNumber_chebyshev4']:.6f}")

            # A3 identities.
            if abs(k["approach_K"] - (k["T_water_out"] - k["T_wb_in"])) > 1e-9:
                failures.append("A3: approach identity off by "
                                f"{abs(k['approach_K'] - (k['T_water_out'] - k['T_wb_in'])):.6g}")
            if abs(t_out - k["T_water_out"]) > 1e-6 \
                    or abs(k["range_K"] - (t_in - t_out)) > 1e-6:
                failures.append("A3: profile span disagrees with"
                                " T_water_out/range_K")

            # A4 evaporation chained from published numbers only.
            L = k["Q_kW"] * 1000.0 / (cpl * k["range_K"])
            G = L / lg
            e = G * (k["Y_out"] - k["Y_in"])
            if abs(e - k["evaporation_kg_s"]) / k["evaporation_kg_s"] > 1e-6:
                failures.append(f"A4: evaporation chain {e:.6g} vs KPI"
                                f" {k['evaporation_kg_s']:.6g}")

        # ---- REFUSALS ------------------------------------------------------
        def probe(tag, mutate, expect):
            c = copy(tmp, tag)
            mutate(c)
            rc2, out2 = run(c)
            if rc2 == 0 or expect not in out2:
                failures.append(f"{tag}: expected refusal containing"
                                f" '{expect}' (exit {rc2})")

        probe("R1_both", lambda c: set_operation(
            c, "            merkelNumber 1.5;\n            T_water_out 303 K;"),
            "specify EXACTLY ONE")
        probe("R2_floor", lambda c: set_operation(
            c, "            T_water_out 292 K;"), "wet bulb")
        probe("R3_pinch", lambda c: (set_operation(
            c, "            T_water_out 303 K;"),
            (c / "0" / "hotWater").write_text(
                (c / "0" / "hotWater").read_text()
                .replace("water    100 kmol/h", "water    500 kmol/h"))),
            "PINCHED")
        probe("R4_twoliquids", lambda c: (c / "0" / "air").write_text(
            (c / "0" / "air").read_text()
            .replace("N2       65   kmol/h", "N2       0.1  kmol/h")
            .replace("water    1.3  kmol/h", "water    65   kmol/h")),
            "cannot tell the water from the air")
        probe("R5_above", lambda c: set_operation(
            c, "            T_water_out 320 K;"), "must lie BELOW")

    if failures:
        print("check_cooling_tower: FAILED")
        for f in failures:
            print("  - " + f)
        return 1

    print("check_cooling_tower: OK -- the published Merkel number and its"
          " Chebyshev-4 companion are reproduced from the unit's own published"
          " diagram (cpL taken off the operating line, never the engine's"
          " internals), the approach/range/evaporation identities hold, the"
          " operating line stays strictly below saturation, and five refusals"
          " (double spec, wet-bulb floor, pinched L/G, two liquids, target"
          " above inlet) fire by name.  NOT COVERED: agreement with a MEASURED"
          " tower (no primary anchor wired yet -- structural witness only),"
          " the Lewis = 1 and saturated-exit hypotheses themselves, and the"
          " golden values (runTests' own rows).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
