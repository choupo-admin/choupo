#!/usr/bin/env python3
"""P-swing gate (P1 outlet-pressure switch + P2 feed-valve closure over the
section-9 expansion-work widening; ratified battery, second-opinion review
2026-08-03).  Separate witnesses so no single case proves two things:

  WITNESS A    batch24_blowdown_inert (inert, ISOTHERMAL): the ideal-gas
               inventory ratio n_end/n_0 == P_end/P_0 == 0.5, both ends
               recomputed ANALYTICALLY here (n = eps A L P / (R T)); the
               end pressure field must sit uniform on the new boundary and
               the campaign mass residual at machine zero (the vented gas
               closed through the ledger).
  WITNESS B    batch25_blowdown_thermal (inert, ADIABATIC, declared LOW
               cp_s): the bed must COOL -- T_min_final well below the
               declared 298.15 K -- and the campaign energy residual must
               stay at integration order (the rigid-vessel U-basis: the
               old enthalpy basis mis-booked exactly V dP = 0.100 kJ).
               Sabotage (verified at build time): restoring the cp
               accumulation / dropping the expansion source leaves the bed
               warm and THIS probe fails by value.
  REFUSALS     P_out <= 0; a THROTTLED feed (u != 0); the FEED-pressure
               key P (the boundary this unit carries is downstream).

Exit 1 listing failures."""
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BATCH = ROOT / "build" / "linux64Gcc" / "choupoBatch"
A = ROOT / "tutorials" / "batch" / "adsorber" / "batch24_blowdown_inert"
B = ROOT / "tutorials" / "batch" / "adsorber" / "batch25_blowdown_thermal"

failures = []

#  Witness-A geometry, repeated here ON PURPOSE (the gate must not read it
#  through the engine): eps 0.4, A 0.01 m2, L 0.5 m, T 298.15 K.
EPS, AREA, LBED, T0 = 0.4, 0.01, 0.5, 298.15
RGAS = 8.31446261815324
P0, PEND = 1.0e5, 5.0e4


def run(case: Path):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(BATCH), "."], cwd=case, env=env,
                       capture_output=True, text=True, timeout=900)
    return p.returncode, p.stdout + p.stderr


def kpi(out: str, name: str):
    m = re.search(r'"' + re.escape(name) + r'": ([0-9.eE+-]+)', out)
    return float(m.group(1)) if m else None


def main() -> int:
    if not BATCH.exists():
        print(f"check_pswing: {BATCH} missing -- build first")
        return 1

    # ---- WITNESS A --------------------------------------------------------
    rc, out = run(A)
    if rc != 0:
        failures.append(f"witness A: exit {rc}")
    else:
        n0 = EPS * AREA * LBED * P0 / (RGAS * T0)
        nend = EPS * AREA * LBED * PEND / (RGAS * T0)
        got = kpi(out, "gasInventory_mol")
        if got is None or abs(got - nend) > 1e-3 * nend:
            failures.append(f"A: gasInventory {got} vs analytic {nend:.6f}")
        if got is not None and abs(got / n0 - PEND / P0) > 1e-3:
            failures.append(f"A: inventory ratio {got/n0:.6f} != P ratio 0.5")
        for key in ("P_first_cell_Pa", "P_last_cell_Pa"):
            p = kpi(out, key)
            if p is None or abs(p - PEND) > 1.0:
                failures.append(f"A: {key} = {p}, expected uniform {PEND}")
        mres = kpi(out, "mass_residual_kg")
        if mres is None or abs(mres) > 1e-12:
            failures.append(f"A: campaign mass residual {mres} (vented gas"
                            " must close through the ledger)")
        if "P2 FEED-VALVE CLOSURE" not in out or \
           "P1 OUTLET-PRESSURE SWITCH" not in out:
            failures.append("A: the switch announcements are missing")

    # ---- WITNESS B --------------------------------------------------------
    rc, out = run(B)
    if rc != 0:
        failures.append(f"witness B: exit {rc}")
    else:
        tmin = kpi(out, "T_min_final_K")
        if tmin is None or tmin > T0 - 2.5:
            failures.append(f"B: T_min_final {tmin} K -- the blowdown must"
                            f" COOL well below {T0} (the cp-form cannot)")
        eres = kpi(out, "energy_residual_kJ")
        if eres is None or abs(eres) > 1.0e-3:
            failures.append(f"B: energy residual {eres} kJ above integration"
                            " order (the rigid-vessel U-basis must close)")

    # ---- REFUSALS ---------------------------------------------------------
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        def probe(tag, old, new, needles):
            case = tmp / tag
            shutil.copytree(A, case,
                            ignore=shutil.ignore_patterns("expected", "log.*",
                                                          "[0-9]*",
                                                          "trajectory.csv"))
            f = case / "system" / "flowsheetDict"
            t = f.read_text()
            if old not in t:
                failures.append(f"{tag}: probe setup -- '{old}' not found")
                return
            f.write_text(t.replace(old, new))
            rc, out = run(case)
            if rc == 0:
                failures.append(f"{tag}: expected refusal, got exit 0")
                return
            for nd in needles:
                if nd not in out:
                    failures.append(f"{tag}: message lacks '{nd}'")

        probe("negPout", "value    50000;", "value    -1;",
              ["P_out must be a positive absolute pressure"])
        probe("throttle", "key      u;\n        value    0.0;",
              "key      u;\n        value    0.01;",
              ["only FULL feed-valve closure"])
        probe("feedP", "key      P_out;", "key      P;",
              ["FEED pressure", "setParameter P_out"])

    if failures:
        print("check_pswing: FAIL")
        for f in failures:
            print("  -", f)
        return 1
    print("check_pswing: OK -- inventory ratio 0.5 analytic (A), blowdown"
          " cooling shown with the energy residual at integration order (B),"
          " throttle/negative-P/feed-P refuse by name")
    return 0


if __name__ == "__main__":
    sys.exit(main())
