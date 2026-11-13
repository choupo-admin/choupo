#!/usr/bin/env python3
"""Gate: a unit that holds its inlet's phase gets that phase from a pure fluid, whatever the last bit of P.

    bin/curate/check_pure_fluid_phase_asked.py

WHY THIS EXISTS (DEV.md 4c C378 pilot, defect 3; found 2026-11-13).  The
nightly full job on GitHub's runner (another compiler, another math library)
converged tutorials/steady/power/rankine02_water to a second fixed point:
boiler inlet 571.98 K against the golden's 447.69 K, pump dT 125 K against
1.17 K.  The pump's suction is the condenser's saturated liquid, so its P is
p_sat(T) to the last bit, and the pump asked the pure fluid's enthalpy at
(T, P) without saying it meant the LIQUID: IF97's router (p >= p_sat(T) ?
liquid : vapour) let one bit choose the vapour enthalpy, and the discharge
Newton then heated the "liquid" by 125 K.  Reproduced on the laptop by
moving the suction pressure by -1e-12 of itself.  Since defect 3 the units
that hold their inlet's phase (the pump: liquid; the compressor and the
turbine: vapour, their declared acceptance) ask H_real / S_real WITH the
phase, and pureFluidPhaseState (src/thermo/pureFluid/PureFluidModel.H) puts
a state on or across the line on the saturated branch of the phase asked.

WHAT IT RUNS.  Two scratch cases built in a temporary directory from the
shipped rankine02_water (its IF97 water and its pump), at seven suction
pressures P = p_sat(T) (1 + e), e in (-1e-6, -1e-9, -1e-12, 0, +1e-12,
+1e-9, +1e-6), T = 446.5158944 K (the case's condensate):
  (a) the feed pump alone, inlet declared `phase liquid;`, to 80 bar --
      the seven pump dT must agree to 1e-6 K;
  (b) the mirror: a compressor fed the same water declared `phase gas;`
      (saturated steam), P_out 20 bar, eta 0.8 -- the seven discharge
      temperatures must agree to 1e-6 K.
p_sat(T) is IAPWS-IF97 region 4 (Wagner et al. 2000, Eq. 30), the same
closed form the engine evaluates.  Each run must also announce the pure-fluid
route (`pureFluids override (water)`), so a template that lost its IF97
declaration cannot pass by agreeing on the incompressible pump.

WHAT IT DOES NOT CHECK.  Whether the value is right (rankine02's golden pins
it); the turbine (its inlet in the shipped case is superheated, far from the
line); the energy report's own pricing of a pure stream at vf = 0 or 1,
which is still the formulation's router (H_stream_formation, listed in the
defect-3 commit as not changed); a wet turbine exhaust (the unit does not
hold that phase).

    reads: tutorials/steady/power/rankine02_water
    reads: src/unitOperations/rotating/Pump.cpp
    reads: src/unitOperations/rotating/Compressor.cpp
    reads: src/thermo/pureFluid/PureFluidModel.cpp
"""
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NAME = "check_pure_fluid_phase_asked"
TEMPLATE = ROOT / "tutorials" / "steady" / "power" / "rankine02_water"
T_IN = 446.5158944
EPS = (-1e-6, -1e-9, -1e-12, 0.0, 1e-12, 1e-9, 1e-6)
TOL = 1.0e-6                     # K
RESULT = re.compile(r"<<<Choupo:result-begin>>>\n(.*?)\n<<<Choupo:result-end>>>", re.S)


def psat_if97(T):
    """IAPWS-IF97 region 4, saturation pressure [Pa] (Eq. 30, Table 34)."""
    n = (0.0, 0.11670521452767e4, -0.72421316703206e6, -0.17073846940092e2,
         0.12020824702470e5, -0.32325550322333e7, 0.14915108613530e2,
         -0.48232657361591e4, 0.40511340542057e6, -0.23855557567849,
         0.65017534844798e3)
    th = T + n[9] / (T - n[10])
    A = th * th + n[1] * th + n[2]
    B = n[3] * th * th + n[4] * th + n[5]
    C = n[6] * th * th + n[7] * th + n[8]
    return (2.0 * C / (-B + math.sqrt(B * B - 4.0 * A * C))) ** 4 * 1.0e6


STATE = "componentMolarFlows\n{{\n    water    3.6 kmol/h;\n}}\n\nT               {T!r} K;\nP               {P!r} Pa;\nphase           {ph};\n"

PUMP = """units
(
    {
        name        feedPump;
        type        pump;
        in          condensate;
        outputs     ( feedwater );
        operation   { P_out 80.0 bar; eta 0.80; }
    }
);
"""

COMPRESSOR = """units
(
    {
        name        steamCompressor;
        type        compressor;
        in          steam;
        outputs     ( hot );
        operation   { P_out 20.0 bar; eta 0.80; }
    }
);
"""


def build(tmp: Path, kind: str, P: float) -> Path:
    d = tmp / f"{kind}_{P!r}"
    (d / "system").mkdir(parents=True)
    (d / "0").mkdir()
    shutil.copytree(TEMPLATE / "constant", d / "constant")
    shutil.copy(TEMPLATE / "system" / "controlDict", d / "system" / "controlDict")
    if kind == "pump":
        (d / "system" / "flowsheetDict").write_text(PUMP)
        (d / "0" / "condensate").write_text(STATE.format(T=T_IN, P=P, ph="liquid"))
        (d / "0" / "feedwater").write_text(STATE.format(T=T_IN + 1.0, P=8.0e6, ph="liquid"))
    else:
        (d / "system" / "flowsheetDict").write_text(COMPRESSOR)
        (d / "0" / "steam").write_text(STATE.format(T=T_IN, P=P, ph="gas"))
        (d / "0" / "hot").write_text(STATE.format(T=600.0, P=2.0e6, ph="gas"))
    return d


def run(case: Path, unit: str, key: str):
    exe = ROOT / "choupoSolve"
    env = dict(os.environ, CHOUPO_HOME=str(ROOT), LC_ALL="C")
    p = subprocess.run([str(exe), "."], cwd=case, env=env, capture_output=True,
                       text=True, timeout=600)
    out = p.stdout + p.stderr
    if "pureFluids override (water)" not in out:
        return None, "the run did not take the pure-fluid route (no `pureFluids override (water)`)"
    blocks = RESULT.findall(p.stdout)
    if p.returncode != 0 or not blocks:
        return None, f"exit {p.returncode}, no result block: " + out[-400:].replace("\n", " | ")
    k = json.loads(blocks[-1]).get("kpis", {}).get(unit, {})
    if key not in k:
        return None, f"kpi {unit}.{key} not published"
    return float(k[key]), None


def main() -> int:
    if not (ROOT / "choupoSolve").exists():
        print(f"{NAME}: FAIL -- {ROOT / 'choupoSolve'} does not exist; build the tree")
        return 1
    if not (TEMPLATE / "constant" / "thermoPhysPropDict").exists():
        print(f"{NAME}: FAIL -- the template {TEMPLATE.relative_to(ROOT)} is missing")
        return 1
    ps = psat_if97(T_IN)
    fail, got = [], {}
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        for kind, unit, key in (("pump", "feedPump", "dT"),
                                ("compressor", "steamCompressor", "T_out")):
            vals = []
            for e in EPS:
                v, err = run(build(tmp, kind, ps * (1.0 + e)), unit, key)
                if err:
                    fail.append(f"{kind} at P = p_sat (1 {e:+.0e}): {err}")
                else:
                    vals.append((e, v))
            got[kind] = vals
            if len(vals) == len(EPS):
                lo = min(v for _, v in vals)
                hi = max(v for _, v in vals)
                if hi - lo > TOL:
                    fail.append(f"{kind}: {unit}.{key} depends on the last bits of the "
                                f"inlet pressure -- " + ", ".join(
                                    f"{e:+.0e}: {v:.9g}" for e, v in vals)
                                + f" (spread {hi - lo:.3g} K > {TOL:g} K): the unit's "
                                  "inlet phase is decided by the formulation's router, "
                                  "not by the phase the unit holds")
    if fail:
        print(f"{NAME}: FAIL")
        for f in fail:
            print("  " + f)
        return 1
    pd = got["pump"][0][1]
    ct = got["compressor"][0][1]
    print(f"{NAME}: OK -- at seven suction pressures p_sat(T)(1+e), e from -1e-6 to "
          f"+1e-6 including 0 and +-1e-12, T = {T_IN} K on IF97 water: the feed pump "
          f"(liquid, to 80 bar) gives dT = {pd:.9g} K and the compressor fed saturated "
          f"steam (vapour, to 20 bar) T_out = {ct:.9g} K, each the same to {TOL:g} K, "
          "every run on the pure-fluid route.  NOT CHECKED: whether those values are "
          "right, the turbine, the energy report's pricing of a pure stream at vf = 0 or 1, "
          "a wet turbine exhaust.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
