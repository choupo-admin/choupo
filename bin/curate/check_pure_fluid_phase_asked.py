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
      temperatures must agree to 1e-6 K;
  (c) the energy REPORT of the pump case: its plant-boundary terms
      (globalEnergyBoundary H_feeds_kW and H_products_kW) must agree across
      the FIVE runs strictly inside the band (|e| <= 1e-9) to 1e-6
      relative (tighter than the goldens' 1e-4).  e = +-1e-6 is the band's
      own edge, where by the rule the carried fraction stops naming the
      branch and the stream is priced at (T, P): a witness there would test
      the last bit of the edge, the very coin toss this gate exists to
      remove.
      The report prices the suction through H_stream_formation at the
      stream's carried vf = 0; since the fourth item of C378's pilot a pure
      stream inside the band is priced on the branch its vf names
      (pureFluidStreamPressure), so the report cannot price as vapour the
      liquid the pump priced as liquid.
  (d) the BRANCH, held against numbers computed outside the engine (review
      TD-05: arms (a)-(c) only ask that runs AGREE, and a sabotage putting
      the saturated vapour on the liquid side passed them while the
      compressor reported 446.74 K for saturated steam taken to 20 bar):
      the compressor's T_out must lie above T_sat(20 bar) + 1 K, T_sat
      found by inverting the IF97 Eq. 30 below in Python (485.53 K; the
      branch value is about 561 K and the liquid-side value 446.7 K, so
      1 K is a margin for nothing but rounding and cannot be met by a
      compressed liquid); the pump's dT must lie in
      (0, v_max dP / (eta cp_min)] with v_max = 1.2e-3 m3/kg and
      cp_min = 4.18 kJ/(kg K), bounds of liquid water from 273 to 450 K
      (saturated-liquid v is 1.11e-3 m3/kg and cp 4.40 kJ/(kg K) at
      446.5 K): about 2.6 K here, where the vapour root gives 125 K.
  (e) the turbine, by its SOURCE (review TD-06).  No turbine fed a pure
      saturated vapour can run on this template: water is a WET fluid --
      the saturated-vapour entropy falls with T --
      so the isentropic discharge of a saturated vapour lies inside the
      dome, and the turbine's unphased T(S) search at the discharge
      pressure has no root across the latent jump ("inner Newton on T(S)
      did not converge", measured 2026-11-13 at W_shaft -1 W, -10 W,
      -100 W and -1 kW, 373.15 / 446.52 / 550 K, e = 0, -5e-7, -2e-6).
      The turbine takes no discharge-pressure specification.  So the arm
      reads Turbine.cpp: both inlet calls (H_real and S_real at T_in,
      P_in) must carry DensityPhase::Vapour.
  (f) phaseChanger, heatExchanger and pipe, which price or classify an
      AUTHORED inlet (review TD-01/02/03): at five pressures inside the
      band, e in (-5e-7, -1e-9, 0, +1e-9, +5e-7), each declared inlet is
      run and must give the SAME answer, on the branch it declares, with
      the plant residual closed:
        phaseChanger, Q = -1 kW: `phase gas;` at 446.5158944 K must stay
        on the plateau (|T_out - T_in| <= 1e-3 K) with vf_out in
        [1 - 1/34.2, 1] -- 1 kW out of 1 mol/s of saturated steam whose
        latent heat is at least 1900 kJ/kg, i.e. 34.2 kJ/mol (2034 kJ/kg
        in the steam tables at 173.4 C); `phase liquid;` at 550 K must
        leave liquid (vf_out <= 1e-9) cooled by 1 kW / (F cp) with cp in
        (4.0, 6.0) kJ/(kg K), i.e. 9.3 to 13.9 K;
        heatExchanger, `phase liquid;` at 550 K against 300 K water at
        2 p_sat: |H_closure_gap_kW| <= 1e-6 kW at every e;
        pipe, `phase liquid;` at 550 K with a declared viscosity: it must
        run at every e, on the liquid path, with a density above ten
        times the ideal-gas density P M / (R T) (24.1 kg/m3 there; the
        saturated liquid is 755.8 kg/m3, the vapour 31.9).
      Each must also close the plant boundary to 1e-6 kW, so a unit that
      prices its inlet on one branch while the report prices the other is
      named.
p_sat(T) is IAPWS-IF97 region 4 (Wagner et al. 2000, Eq. 30), the same
closed form the engine evaluates.  Each run must also announce the pure-fluid
route (`pureFluids override (water)`), so a template that lost its IF97
declaration cannot pass by agreeing on the incompressible pump.

WHAT IT DOES NOT CHECK.  The values to more than the bounds of arm (d)
and (f) (rankine02's golden pins them); the turbine's BEHAVIOUR (arm (e)
reads its source: no run can reach it); a pure stream BEYOND the band whose
vapour fraction contradicts its T and P (priced at (T, P), not this gate's
subject); a wet turbine exhaust (the unit does not hold that phase); a
heatExchanger fed a declared saturated VAPOUR (its outlet search falls back,
announced, to the sensible eps-NTU temperature at every e, and its first
law is open by that fallback, not by the inlet).

    reads: tutorials/steady/power/rankine02_water
    reads: src/unitOperations/rotating/Pump.cpp
    reads: src/unitOperations/rotating/Compressor.cpp
    reads: src/unitOperations/rotating/Turbine.cpp
    reads: src/unitOperations/heatTransfer/PhaseChanger.cpp
    reads: src/unitOperations/heatTransfer/HeatExchanger.cpp
    reads: src/unitOperations/hydraulics/Pipe.cpp
    reads: src/unitOperations/flash/StreamEquilibrium.H
    reads: src/thermo/pureFluid/PureFluidModel.cpp
    reads: src/thermo/ThermoPackage.cpp
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
#  The two points AT the band's edge (|e| = 1e-6) fall inside the band on one
#  platform and outside it on another (seen on the CI runner, 2026-11-13: the
#  compressor's T_out moved by 1.6e-4 K at e = -1e-6, the honest effect of
#  1e-6 in pressure on a state priced at its own (T, P)).  They are held to the
#  BRANCH, not to the last digit: a phase flip moves the pump's dT by 124 K and
#  the compressor's T_out by 114 K.
EDGE_TOL = 1.0e-2                # K
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


def tsat_if97(P):
    """T_sat [K] at P [Pa], by bisection on Eq. 30 (monotone in T)."""
    lo, hi = 273.16, 647.09
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if psat_if97(mid) < P:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


R_GAS = 8.314462618         # J/(mol K)
MW_WATER = 18.015268e-3     # kg/mol (IAPWS)
E5 = (-5e-7, -1e-9, 0.0, 1e-9, 5e-7)
T_LIQ = 550.0


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


UNIT_CASES = {
    "phaseChanger": """units
(
    { name U; type phaseChanger; in probe; outputs ( out ); operation { Q -1 kW; } }
);
""",
    "heatExchanger": """units
(
    { name U; type heatExchanger; inputs ( probe partner ); outputs ( out pout );
      operation { area 1 m2; U 500 W/m2/K; flow counter; } }
);
""",
    "pipe": """units
(
    { name U; type pipe; in probe; outputs ( out );
      operation { geometry { D 0.1 m; L 50 m; roughness 4.6e-5 m; dz 0 m; }
                  viscosity 1.0e-4 Pa.s; } }
);
""",
}


def build_unit(tmp: Path, kind: str, T: float, ph: str, P: float) -> Path:
    d = tmp / f"{kind}_{ph}_{T!r}_{P!r}"
    (d / "system").mkdir(parents=True)
    (d / "0").mkdir()
    shutil.copytree(TEMPLATE / "constant", d / "constant")
    shutil.copy(TEMPLATE / "system" / "controlDict", d / "system" / "controlDict")
    (d / "system" / "flowsheetDict").write_text(UNIT_CASES[kind])
    (d / "0" / "probe").write_text(STATE.format(T=T, P=P, ph=ph))
    if kind == "heatExchanger":
        (d / "0" / "partner").write_text(STATE.format(T=300.0, P=2.0 * P, ph="liquid"))
        (d / "0" / "pout").write_text(STATE.format(T=301.0, P=2.0 * P, ph="liquid"))
    (d / "0" / "out").write_text(STATE.format(T=T - 1.0, P=P, ph=ph))
    return d


def run_full(case: Path):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT), LC_ALL="C")
    p = subprocess.run([str(ROOT / "choupoSolve"), "."], cwd=case, env=env,
                       capture_output=True, text=True, timeout=600)
    out = p.stdout + p.stderr
    if "pureFluids override (water)" not in out:
        return None, "the run did not take the pure-fluid route"
    blocks = RESULT.findall(p.stdout)
    if p.returncode != 0 or not blocks:
        err = [ln for ln in out.splitlines() if "ERROR" in ln]
        return None, f"exit {p.returncode}: " + (err[0][:300] if err else out[-300:])
    return json.loads(blocks[-1]), None


def unit_arms(tmp: Path, fail: list) -> dict:
    """Arm (f): phaseChanger, heatExchanger, pipe, declared inlets in the band."""
    shown = {}
    specs = (("phaseChanger", T_IN, "gas"), ("phaseChanger", T_LIQ, "liquid"),
             ("heatExchanger", T_LIQ, "liquid"), ("pipe", T_LIQ, "liquid"))
    for kind, T, ph in specs:
        ps = psat_if97(T)
        rows = []
        for e in E5:
            res, err = run_full(build_unit(tmp, kind, T, ph, ps * (1.0 + e)))
            tag = f"{kind} `phase {ph};` at {T} K, P = p_sat (1 {e:+.0e})"
            if err:
                fail.append(f"{tag}: {err}")
                continue
            k = res.get("kpis", {}).get("U", {})
            out = (res.get("streams") or {}).get("out") or {}
            geb = res.get("globalEnergyBoundary") or {}
            r = geb.get("residual_kW")
            if r is None or abs(float(r)) > 1.0e-6:
                fail.append(f"{tag}: plant-boundary residual {r} kW (> 1e-6): the unit "
                            "and the energy report price the inlet on two branches")
            if kind == "phaseChanger":
                Tout, vf = float(out.get("T", float("nan"))), float(out.get("vf", float("nan")))
                if ph == "gas":
                    ok = abs(Tout - T) <= 1.0e-3 and 1.0 - 1.0 / 34.2 <= vf <= 1.0
                    want = "vf_out in [0.9708, 1] on the plateau at T_in"
                else:
                    dT = T - Tout
                    ok = vf <= 1.0e-9 and 9.3 <= dT <= 13.9
                    want = "a liquid outlet 9.3-13.9 K colder"
                if not ok:
                    fail.append(f"{tag}: T_out = {Tout:.6f} K, vf_out = {vf:.6g} -- not "
                                f"the declared branch ({want})")
                rows.append((e, Tout, vf))
            elif kind == "heatExchanger":
                gap = float(k.get("H_closure_gap_kW", float("nan")))
                if not abs(gap) <= 1.0e-6:
                    fail.append(f"{tag}: H_closure_gap_kW = {gap:.6g} kW (> 1e-6): the "
                                "unit re-resolved its declared inlet")
                rows.append((e, float(out.get("T", float("nan"))), gap))
            else:
                rho = float(k.get("density", float("nan")))
                rho_ig = ps * (1.0 + e) * MW_WATER / (R_GAS * T)
                if not rho > 10.0 * rho_ig:
                    fail.append(f"{tag}: density {rho:.6g} kg/m3, not a liquid "
                                f"(10 x ideal gas = {10.0 * rho_ig:.4g})")
                rows.append((e, float(k.get("deltaP", float("nan"))), rho))
        if len(rows) == len(E5):
            for j in (1, 2):
                lo = min(r[j] for r in rows)
                hi = max(r[j] for r in rows)
                if hi - lo > 1.0e-6 * max(1.0, abs(hi)):
                    fail.append(f"{kind} `phase {ph};` at {T} K depends on the last bits of "
                                "the inlet pressure inside the band -- " + ", ".join(
                                    f"{r[0]:+.0e}: {r[j]:.9g}" for r in rows))
            shown[(kind, ph)] = rows[2]
    return shown


def turbine_source(fail: list) -> None:
    """Arm (e): the turbine's inlet calls carry the vapour phase it holds."""
    src = (ROOT / "src" / "unitOperations" / "rotating" / "Turbine.cpp").read_text()
    code = "\n".join(ln.split("//")[0] for ln in src.splitlines())
    for fn in ("H_real", "S_real"):
        pat = re.compile(r"thermo\." + fn + r"\(\s*T_in\s*,\s*P_in\s*,\s*y\s*,\s*"
                         r"DensityPhase::Vapour\s*\)")
        if not pat.search(code):
            fail.append(f"turbine: Turbine.cpp no longer asks {fn}(T_in, P_in, y, "
                        "DensityPhase::Vapour) -- its inlet on the saturation line would "
                        "be read on whichever root the last bit of P picks")


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
    res = json.loads(blocks[-1])
    k = res.get("kpis", {}).get(unit, {})
    if key not in k:
        return None, f"kpi {unit}.{key} not published"
    geb = res.get("globalEnergyBoundary") or {}
    return (float(k[key]), geb), None


def main() -> int:
    if not (ROOT / "choupoSolve").exists():
        print(f"{NAME}: FAIL -- {ROOT / 'choupoSolve'} does not exist; build the tree")
        return 1
    if not (TEMPLATE / "constant" / "thermoPhysPropDict").exists():
        print(f"{NAME}: FAIL -- the template {TEMPLATE.relative_to(ROOT)} is missing")
        return 1
    ps = psat_if97(T_IN)
    fail, got, bound = [], {}, []
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        for kind, unit, key in (("pump", "feedPump", "dT"),
                                ("compressor", "steamCompressor", "T_out")):
            vals = []
            for e in EPS:
                r, err = run(build(tmp, kind, ps * (1.0 + e)), unit, key)
                if err:
                    fail.append(f"{kind} at P = p_sat (1 {e:+.0e}): {err}")
                else:
                    vals.append((e, r[0]))
                    if kind == "pump":
                        bound.append((e, r[1]))
            got[kind] = vals
            if len(vals) == len(EPS):
                inside = [v for e, v in vals if abs(e) < 1.0e-6]
                centre = [v for e, v in vals if e == 0.0][0]
                lo, hi = min(inside), max(inside)
                edge = max(abs(v - centre) for e, v in vals if abs(e) >= 1.0e-6)
                if hi - lo > TOL:
                    fail.append(f"{kind}: {unit}.{key} depends on the last bits of the "
                                f"inlet pressure -- " + ", ".join(
                                    f"{e:+.0e}: {v:.9g}" for e, v in vals)
                                + f" (spread inside the band {hi - lo:.3g} K > {TOL:g} K): "
                                  "the unit's inlet phase is decided by the formulation's "
                                  "router, not by the phase the unit holds")
                elif edge > EDGE_TOL:
                    fail.append(f"{kind}: {unit}.{key} changes branch at the band's edge "
                                f"-- " + ", ".join(f"{e:+.0e}: {v:.9g}" for e, v in vals)
                                + f" ({edge:.3g} K from the centre > {EDGE_TOL:g} K)")
        shown = unit_arms(tmp, fail)
    for term in ("H_feeds_kW", "H_products_kW"):
        vs = [(e, g.get(term)) for e, g in bound if abs(e) < 1.0e-6]
        if any(v is None for _, v in vs) or len(vs) != 5:
            fail.append(f"report: globalEnergyBoundary.{term} not published by every pump run")
            continue
        ref = [v for e, v in vs if e == 0.0][0]
        spread = max(abs(v - ref) for _, v in vs)
        if spread > 1.0e-6 * max(abs(ref), 1.0e-12):
            fail.append(f"report: the plant-boundary {term} of the pump case depends on "
                        "the last bits of the suction pressure -- " + ", ".join(
                            f"{e:+.0e}: {v:.9g}" for e, v in vs)
                        + ": the report prices a pure stream on the line by the "
                          "router, not by its carried vapour fraction")
    # (d) the branch, against numbers computed outside the engine
    ts20 = tsat_if97(2.0e6)
    for e, v in got.get("compressor", []):
        if not v > ts20 + 1.0:
            fail.append(f"compressor at P = p_sat (1 {e:+.0e}): T_out = {v:.6f} K is not "
                        f"above T_sat(20 bar) + 1 K = {ts20 + 1.0:.4f} K (IF97 Eq. 30, "
                        "inverted outside the engine): saturated steam compressed "
                        "adiabatically leaves superheated, so the suction was read on "
                        "the liquid side")
    dTmax = 1.2e-3 * (8.0e6 - ps) / (0.80 * 4180.0)
    for e, v in got.get("pump", []):
        if not 0.0 < v <= dTmax:
            fail.append(f"pump at P = p_sat (1 {e:+.0e}): dT = {v:.6f} K is outside "
                        f"(0, v_max dP / (eta cp_min)] = (0, {dTmax:.4f}] K: a liquid "
                        "pump heats by its losses, never by a latent heat")
    turbine_source(fail)
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
          f"steam (vapour, to 20 bar) T_out = {ct:.9g} K, each the same to {TOL:g} K over "
          f"the five pressures inside the band and on the same branch (within {EDGE_TOL:g} K) "
          "at the two on its edge, "
          f"and the pump case's plant-boundary H_feeds_kW = {bound[3][1]['H_feeds_kW']:.9g} "
          "and H_products_kW the same to 1e-6 relative over the five runs inside the "
          "band, every run on the pure-fluid route; the branch held outside the engine: "
          f"T_out above T_sat(20 bar) + 1 K = {tsat_if97(2.0e6) + 1.0:.4f} K and the pump's "
          f"dT within (0, {1.2e-3 * (8.0e6 - ps) / (0.80 * 4180.0):.4f}] K; at five "
          "pressures inside the band (|e| <= 5e-7) phaseChanger cooling declared steam by "
          f"1 kW stays on its plateau (vf_out = {shown[('phaseChanger', 'gas')][2]:.6f}) "
          "and a declared liquid at 550 K leaves liquid "
          f"(T_out = {shown[('phaseChanger', 'liquid')][1]:.6f} K), the heatExchanger's "
          "H_closure_gap_kW stays within 1e-6 kW, the pipe takes the liquid path "
          f"(rho = {shown[('pipe', 'liquid')][2]:.4f} kg/m3), each the same at every e and "
          "with the plant residual within 1e-6 kW; the turbine's two inlet calls carry "
          "DensityPhase::Vapour (by source: no saturated-steam turbine run converges, water "
          "being a wet fluid).  NOT CHECKED: the values beyond those bounds, a pure stream beyond "
          "the band whose vapour fraction contradicts its T and P, a wet turbine exhaust, a "
          "heatExchanger fed a declared saturated vapour.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
