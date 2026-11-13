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
pressures P = p_sat(T) (1 + e), e in (-5e-7, -1e-9, -1e-12, 0, +1e-12,
+1e-9, +5e-7), T = 446.5158944 K (the case's condensate) -- inside the band:
since TD-04 a declared phase 1e-6 or more across the line is REFUSED (arm (g)),
so the band's own edge would test the last bit of the refusal:
  (a) the feed pump alone, inlet declared `phase liquid;`, to 80 bar --
      the five pump dT with |e| <= 1e-9 must agree to 1e-6 K and the two at
      |e| = 5e-7 must stay on the same branch (within 0.01 K);
  (b) the mirror: a compressor fed the same water declared `phase gas;`
      (saturated steam), P_out 20 bar, eta 0.8 -- the discharge
      temperatures held the same way;
  (c) the energy REPORT of the pump case: its plant-boundary terms
      (globalEnergyBoundary H_feeds_kW and H_products_kW) must agree across
      the FIVE runs strictly inside the band (|e| <= 1e-9) to 1e-6
      relative (tighter than the goldens' 1e-4).  e = +-5e-7 is left out
      as it always was: the arm holds the runs strictly on the line.
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
  (g) a DECLARED phase its own (T, P) contradict beyond the band (review
      TD-04: a pump whose suction was declared liquid 2e-6 below p_sat left
      +40.65 / +36.70 / +28.16 kW on the plant boundary at 373.15 /
      446.5159 / 550 K, at exit 0) is REFUSED before any unit runs: at the
      three temperatures, a pump fed `phase liquid;` and a compressor fed
      `phase gas;`, accepted at e = -5e-7 and +5e-7 and on the declared side
      at 2e-6, refused at 2e-6 across the line (liquid -2e-6, gas +2e-6);
      the refusal must name the stream and its file, T, the relative distance,
      the phase word, the remedy `delete the phase word` and `P <p_sat> Pa;`
      with p_sat(T) to 1e-9 of Eq. 30 here;
  (h) the same refusal in a consuming unit's OWN thermophysical world: a
      `phase liquid;` inlet at 424.986 K, P = p_sat_IF97 (1 + 2e-5), is
      liquid in the case's IF97 and vapour beyond the band in the pump's own
      IAPWS-95 `thermo {}`, and must be refused naming that unit;
  (i) a COMPUTED inlet its consumer's own world places across the line
      (review TD-17, the coordinator's ruling): a phaseChanger under its own
      `thermo {}` puts its outlet on ITS saturation line, and the consumer's
      world places that state 1.4e-4 across.  The compressor and the turbine
      (vapour held; producer IAPWS-95, consumer IF97) and the pump (liquid
      held; producer IF97, consumer IAPWS-95) must each refuse at the
      hand-over, naming the unit, the inlet, the phase held, the consumer's
      formulation, the side, p_sat(T), P/p_sat - 1 against the band, the
      producing unit with ITS formulation, and the remedy;
  (j) by SOURCE, and it says so: ThermoPackage's H_real and S_real with a
      phase evaluate a pure fluid at pureFluidStreamPressure (the stream
      functions' rule: (T, P) beyond the band) and announce it through
      AdvisoryLog::addAnnouncedOnce.  No flowsheet run reaches that branch
      any more (measured over all 31 runs of this gate: none prints it): an
      authored inlet beyond the band is refused before any unit runs, a
      computed one at the hand-over (i), and the pump's discharge search runs
      only when a liquid root exists below T_sat(P_out) (k).  Also by source,
      DynamicDriver.cpp applies the authored-inlet refusal to the
      time-integrated binaries (no time-integrated template carries a
      pure-fluid formulation).
  (k) the pump never publishes an outlet it did not find: at 550 K, dP 1 bar,
      inlet declared liquid at p_sat (1 + 5e-7), eta 0.5 and 0.03 run with
      dT > 0 and the plant residual within 1e-6 kW, and eta 0.01 -- whose
      losses heat the liquid past T_sat(P_out) -- refuses naming the pump,
      the inlet, T_in, P_out, T_sat(P_out), the enthalpy asked against the
      saturated liquid's, eta and both remedies (before: T_out = T_in,
      published silently, +0.18 kW on the plant boundary at exit 0).
p_sat(T) is IAPWS-IF97 region 4 (Wagner et al. 2000, Eq. 30), the same
closed form the engine evaluates.  Each run must also announce the pure-fluid
route (`pureFluids override (water)`), so a template that lost its IF97
declaration cannot pass by agreeing on the incompressible pump.

SABOTAGES of arms (g)-(k), each applied alone by hand, built, run, restored
and rebuilt (2026-11-13): Sg the global-world refusal call removed -> (g)
fails; Sh the own-world refusal call removed -> (h) fails; Si the hand-over
refusal's throw removed -> (i) fails for all three units; Sw the producer's
world no longer stamped on the stream -> (i) fails (the message cannot name
the other formulation); Sj H_real with a phase back on the saturated branch
beyond the band -> (j) fails; Sj2 the time-integrated call removed -> (j)
fails; Sk1 the pump's enthalpy refusal disabled (the search then fails and
raises its non-convergence, which does not name the cause) -> (k) fails;
Sk2 the old code (no refusal, `T_out = r.converged ? r.x : T_in`) -> (k)
fails.  Restoring the fallback line ALONE is not caught: the enthalpy
refusal fires before the search in every case the arm builds.

WHAT IT DOES NOT CHECK.  The values to more than the bounds of arm (d)
and (f) (rankine02's golden pins them); the turbine's BEHAVIOUR (arm (e)
reads its source: no run can reach it); a turbine fed a computed inlet beyond
the band (its T(S) search does not converge on a compressed liquid either);
the time-integrated refusal's BEHAVIOUR (arm (j) reads its source); the
pump's search non-convergence for any other cause (no case reaches it); a wet
turbine exhaust (the unit does not hold that phase); a
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
    reads: src/unitOperations/flowsheet/Flowsheet.cpp
    reads: src/dynamicDriver/DynamicDriver.cpp
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
EPS = (-5e-7, -1e-9, -1e-12, 0.0, 1e-12, 1e-9, 5e-7)
TOL = 1.0e-6                     # K
#  The two OUTER points (|e| = 5e-7).  The band's edge itself (|e| = 1e-6)
#  fell inside the band on one platform and outside it on another (seen on the
#  CI runner, 2026-11-13: the compressor's T_out moved by 1.6e-4 K at
#  e = -1e-6, the honest effect of 1e-6 in pressure on a state priced at its
#  own (T, P)); since TD-04 a declared phase beyond the edge is REFUSED, so the
#  edge is no longer run at all.  The outer points are still held to the
#  BRANCH, not to the last digit: a phase flip moves the pump's dT by 124 K and
#  the compressor's T_out by 114 K.
EDGE_TOL = 1.0e-2                # K
OUTER = 1.0e-7                   # |e| at or above this is an outer point
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


# ---------------------------------------------------------------------------
#  Arms (g)-(j): a declared phase its own (T, P) contradict beyond the band
#  (review TD-04).
# ---------------------------------------------------------------------------
T_REVIEW = (373.15, 446.5158944, 550.0)
CONTRADICTED = "DECLARED PHASE CONTRADICTED BY T AND P"
AT_TP = "(T, P) is used, as the stream functions price it"
HELMHOLTZ = "water { method Helmholtz; equation IAPWS95; }"


def probe_case(tmp: Path, tag: str, units: str, streams: dict, global_method=None) -> Path:
    """A scratch case from the template; `streams` maps name -> (T, P, phase)."""
    d = tmp / tag
    (d / "system").mkdir(parents=True)
    (d / "0").mkdir()
    shutil.copytree(TEMPLATE / "constant", d / "constant")
    if global_method is not None or "pureFluids" in units:
        # The Helmholtz record is not in the template's seal: unseal the copy.
        (d / "constant" / "propertyManifest").unlink(missing_ok=True)
    if global_method is not None:
        tp = d / "constant" / "thermoPhysPropDict"
        tp.write_text(tp.read_text().replace("water { method IF97; }", global_method))
    shutil.copy(TEMPLATE / "system" / "controlDict", d / "system" / "controlDict")
    (d / "system" / "flowsheetDict").write_text("units\n(\n" + units + "\n);\n")
    for nm, (T, P, ph) in streams.items():
        (d / "0" / nm).write_text(STATE.format(T=T, P=P, ph=ph))
    return d


def run_raw(case: Path):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT), LC_ALL="C")
    p = subprocess.run([str(ROOT / "choupoSolve"), "."], cwd=case, env=env,
                       capture_output=True, text=True, timeout=600)
    blocks = RESULT.findall(p.stdout)
    return p.returncode, (json.loads(blocks[-1]) if blocks else None), p.stdout + p.stderr


def refusal_arm(tmp: Path, fail: list) -> int:
    """Arm (g): refused beyond the band on the contradicting side, accepted inside it."""
    n = 0
    for T in T_REVIEW:
        ps = psat_if97(T)
        for kind, ph, bad in (("pump", "liquid", -2e-6), ("compressor", "gas", 2e-6)):
            for e in (-5e-7, 5e-7, -bad, bad):
                P = ps * (1.0 + e)
                unit = (f"    {{ name U; type {kind}; in probe; outputs ( out ); "
                        f"operation {{ P_out {1.5 * P!r} Pa; eta 0.8; }} }}")
                out_ph = "liquid" if kind == "pump" else "gas"
                rc, res, out = run_raw(probe_case(
                    tmp, f"g_{kind}_{T!r}_{e!r}", unit,
                    {"probe": (T, P, ph), "out": (T + 1.0, 1.5 * P, out_ph)}))
                tag = f"{kind} `phase {ph};` at {T} K, P = p_sat (1 {e:+.0e})"
                n += 1
                if e != bad:
                    if rc != 0 or res is None or CONTRADICTED in out:
                        fail.append(f"(g) {tag}: not accepted (exit {rc}) -- inside the "
                                    "band, or on the declared side, the pin decides")
                    continue
                if rc == 0 or CONTRADICTED not in out:
                    fail.append(f"(g) {tag}: NOT refused (exit {rc}) -- a declared phase "
                                "its T and P contradict beyond the band must be refused")
                    continue
                line = next((ln for ln in out.splitlines() if "stream 'probe'" in ln), "")
                m = re.search(r"p_sat\(T\) = ([0-9.eE+-]+) Pa", line)
                want = [f"stream 'probe' (0/probe)", f"T = {T:.10g} K",
                        f"P/p_sat - 1 = {e:+.3e}", f"`phase {ph};`",
                        "delete the phase word", f"`P {ps:.10g} Pa;`"]
                miss = [w for w in want if w not in line]
                if m is None or abs(float(m.group(1)) / ps - 1.0) > 1e-9:
                    miss.append(f"p_sat(T) = {ps:.10g} Pa")
                if miss:
                    fail.append(f"(g) {tag}: the refusal does not name " + "; ".join(miss)
                                + f" -- printed: {line[:300]}")
    return n


def own_world_arm(tmp: Path, fail: list) -> None:
    """Arm (h): the rule applied in a consuming unit's own thermophysical world."""
    T = 424.9862439
    P = psat_if97(T) * (1.0 + 2.0e-5)     # liquid side in IF97, vapour side in IAPWS-95
    unit = ("    { name U; type pump; in probe; outputs ( out ); "
            f"operation {{ P_out {2.0 * P!r} Pa; eta 0.8; }} "
            f"thermo {{ pureFluids {{ {HELMHOLTZ} }} }} }}")
    rc, res, out = run_raw(probe_case(tmp, "h_own", unit, {
        "probe": (T, P, "liquid"), "out": (T + 1.0, 2.0 * P, "liquid")}))
    if rc == 0 or CONTRADICTED not in out or "OWN thermophysical world of unit 'U'" not in out:
        fail.append(f"(h) a `phase liquid;` inlet at {T} K, P = p_sat_IF97 (1 + 2e-5) -- "
                    "liquid in the case's IF97, vapour beyond the band in the pump's own "
                    f"IAPWS-95 -- was not refused in the unit's own world (exit {rc})")


def computed_inlet_arm(tmp: Path, fail: list) -> dict:
    """Arm (i): a COMPUTED inlet its consumer's own world places across the line.

    A phaseChanger computing in one pure-fluid world puts its outlet on ITS
    saturation line; the consumer computes in another, where that state lies
    1.4e-4 across.  The compressor and the turbine (vapour held) and the pump
    (liquid held) must each REFUSE at the hand-over, naming both worlds and
    the distance (review TD-17)."""
    IF97 = "water { method IF97; }"
    vap = {"feed": (400.0, 5.0e5, "liquid"), "mid": (430.0, 5.0e5, "gas"),
           "out": (600.0, 1.0e6, "gas")}
    liq = {"feed": (500.0, 5.0e5, "gas"), "mid": (420.0, 5.0e5, "liquid"),
           "out": (430.0, 1.0e6, "liquid")}
    prod = ("    {{ name prod; type phaseChanger; in feed; outputs ( mid ); "
            "operation {{ outletState {state}; }} "
            "thermo {{ pureFluids {{ {world} }} }} }}\n")
    cases = (
        ("compressor", "operation { P_out 10 bar; eta 0.8; }", "saturatedVapour",
         HELMHOLTZ, None, vap, "VAPOUR", "liquid", "IAPWS-IF97",
         "Helmholtz reference equation IAPWS95"),
        ("turbine", "operation { W_shaft -0.1 kW; eta 0.85; }", "saturatedVapour",
         HELMHOLTZ, None, vap, "VAPOUR", "liquid", "IAPWS-IF97",
         "Helmholtz reference equation IAPWS95"),
        ("pump", "operation { P_out 10 bar; eta 0.8; }", "saturatedLiquid",
         IF97, HELMHOLTZ, liq, "LIQUID", "vapour",
         "Helmholtz reference equation IAPWS95", "IAPWS-IF97"),
    )
    shown = {}
    for kind, op, state, pworld, gworld, streams, held, side, own, other in cases:
        units = (prod.format(state=state, world=pworld)
                 + f"    {{ name U; type {kind}; in mid; outputs ( out ); {op} }}")
        rc, res, out = run_raw(probe_case(tmp, f"i_{kind}", units, streams,
                                          global_method=gworld))
        line = next((ln for ln in out.splitlines() if "cannot take inlet 'mid'" in ln), "")
        want = [f"{kind} 'U' cannot take inlet 'mid'", f"it holds a {held}",
                f"own world (the pure-fluid formulation {own})", f"on the {side} side",
                "p_sat(T) = ", "P/p_sat - 1 = ", "against the 1e-06 band",
                "produced by unit 'prod'", f"the pure-fluid formulation {other}",
                "Put producer and consumer in one thermophysical world",
                "do not ask a saturated state to cross a model boundary"]
        miss = [w for w in want if w not in line]
        if rc == 0 or miss:
            fail.append(f"(i) {kind} fed a computed {held.lower()} its own world puts "
                        f"across the line: not refused naming {miss or 'it'} (exit {rc})")
        shown[kind] = line
    return shown


def overload_source(fail: list) -> None:
    """Arm (j), a SOURCE arm: the phase-taking caloric overloads price (T, P)
    beyond the band by pureFluidStreamPressure and announce it through the
    advisory log.  No flowsheet run reaches that branch any more: an authored
    inlet beyond the band is refused before any unit runs, a computed one at
    the hand-over (arm (i)), and the pump's discharge search runs only when
    a liquid root exists below T_sat(P_out) (arm (k)) -- so the rule is held
    by reading ThermoPackage.cpp, and says so."""
    src = (ROOT / "src" / "thermo" / "ThermoPackage.cpp").read_text()
    code = "\n".join(ln.split("//")[0] for ln in src.splitlines())
    for fn, m in (("H_real", "h_molar"), ("S_real", "s_molar")):
        body = re.search(r"scalar ThermoPackage::" + fn + r"\(scalar T, scalar P_Pa, "
                         r"const sVector& y,\s*DensityPhase ph\) const\s*\{(.*?)\n\}",
                         code, re.S)
        if body is None:
            fail.append(f"(j) source: ThermoPackage::{fn}(T, P, y, phase) not found")
            continue
        b = body.group(1)
        if ("m." + m + "(T, pureFluidStreamPressure(") not in b.replace("\n", " ").replace("  ", " ") \
                and not re.search(m + r"\(T,\s*pureFluidStreamPressure\(", b):
            fail.append(f"(j) source: {fn} with a phase no longer evaluates the pure fluid "
                        "at pureFluidStreamPressure (the stream functions' rule)")
        if not re.search(r"announceAcross\([^;]*,\s*true\)", b):
            fail.append(f"(j) source: {fn} with a phase no longer announces a state "
                        "beyond the band priced at (T, P)")
    if "AdvisoryLog::instance()" not in code or "addAnnouncedOnce(key" not in code:
        fail.append("(j) source: announceAcross no longer rides AdvisoryLog::addAnnouncedOnce")


def discharge_arm(tmp: Path, fail: list) -> dict:
    """Arm (k): the pump never publishes an outlet it did not find."""
    T = 550.0
    P = psat_if97(T) * (1.0 + 5.0e-7)
    shown = {}
    for eta in (0.5, 0.03, 0.01):
        unit = ("    { name U; type pump; in probe; outputs ( out ); "
                f"operation {{ dP 1 bar; eta {eta}; }} }}")
        rc, res, out = run_raw(probe_case(tmp, f"k_{eta}", unit, {
            "probe": (T, P, "liquid"), "out": (T + 1.0, P + 1.0e5, "liquid")}))
        tag = f"(k) pump at {T} K, dP 1 bar, eta {eta}"
        if eta == 0.01:
            line = next((ln for ln in out.splitlines() if "no LIQUID outlet" in ln), "")
            want = ["pump 'U'", "inlet 'probe'", "T_in = 550 K", "P_out = ", "T_sat(P_out) = ",
                    "the balance asks", "eta = 0.01", "saturated liquid's",
                    "raise the discharge pressure or the efficiency",
                    "a flashing discharge is not this unit's model"]
            miss = [w for w in want if w not in line]
            if rc == 0 or miss:
                fail.append(f"{tag}: the losses heat the liquid past T_sat(P_out) and the "
                            f"pump must refuse naming {miss or 'it'} (exit {rc})")
            continue
        if rc != 0 or res is None:
            fail.append(f"{tag}: exit {rc} -- a liquid discharge exists here")
            continue
        r = float((res.get("globalEnergyBoundary") or {}).get("residual_kW", float("nan")))
        dT = float(res["kpis"]["U"].get("dT", float("nan")))
        if not abs(r) <= 1.0e-6 or not dT > 0.0:
            fail.append(f"{tag}: plant residual {r:.6g} kW, dT {dT:.6g} K -- the "
                        "discharge must carry the shaft work")
        shown[eta] = dT
    return shown


def dynamic_source(fail: list) -> None:
    """Arm (j'): the time-integrated binaries apply the same refusal (by source)."""
    src = (ROOT / "src" / "dynamicDriver" / "DynamicDriver.cpp").read_text()
    code = "\n".join(ln.split("//")[0] for ln in src.splitlines())
    if "flashState::declaredPhaseBeyondBandRefusal(" not in code:
        fail.append("(j) DynamicDriver.cpp no longer calls "
                    "flashState::declaredPhaseBeyondBandRefusal on its authored inlets")


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
                inside = [v for e, v in vals if abs(e) < OUTER]
                centre = [v for e, v in vals if e == 0.0][0]
                lo, hi = min(inside), max(inside)
                edge = max(abs(v - centre) for e, v in vals if abs(e) >= OUTER)
                if hi - lo > TOL:
                    fail.append(f"{kind}: {unit}.{key} depends on the last bits of the "
                                f"inlet pressure -- " + ", ".join(
                                    f"{e:+.0e}: {v:.9g}" for e, v in vals)
                                + f" (spread inside the band {hi - lo:.3g} K > {TOL:g} K): "
                                  "the unit's inlet phase is decided by the formulation's "
                                  "router, not by the phase the unit holds")
                elif edge > EDGE_TOL:
                    fail.append(f"{kind}: {unit}.{key} changes branch at |e| = 5e-7 "
                                f"-- " + ", ".join(f"{e:+.0e}: {v:.9g}" for e, v in vals)
                                + f" ({edge:.3g} K from the centre > {EDGE_TOL:g} K)")
        shown = unit_arms(tmp, fail)
        n_refusal = refusal_arm(tmp, fail)
        own_world_arm(tmp, fail)
        computed_inlet_arm(tmp, fail)
        disch = discharge_arm(tmp, fail)
    dynamic_source(fail)
    overload_source(fail)
    for term in ("H_feeds_kW", "H_products_kW"):
        vs = [(e, g.get(term)) for e, g in bound if abs(e) <= 1.0e-9]
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
    print(f"{NAME}: OK -- at seven suction pressures p_sat(T)(1+e), e from -5e-7 to "
          f"+5e-7 including 0 and +-1e-12, T = {T_IN} K on IF97 water: the feed pump "
          f"(liquid, to 80 bar) gives dT = {pd:.9g} K and the compressor fed saturated "
          f"steam (vapour, to 20 bar) T_out = {ct:.9g} K, each the same to {TOL:g} K over "
          f"the five pressures inside the band and on the same branch (within {EDGE_TOL:g} K) "
          "at the two outer ones (|e| = 5e-7), "
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
          "being a wet fluid).  BEYOND THE BAND (TD-04): "
          f"{n_refusal} runs at 373.15, 446.5159 and 550 K -- a declared phase 2e-6 "
          "across the line refused by name with p_sat(T) and both remedies, accepted at "
          "+-5e-7 and on its own side; refused in a consuming unit's own IAPWS-95 world; "
          "a computed inlet its consumer's own world places across the line (produced "
          "in another pure-fluid world) refused at the hand-over by the compressor, the "
          "turbine and the pump, each naming both worlds and the distance; the "
          "time-integrated refusal by source; the caloric overloads' (T, P) rule beyond "
          "the band by SOURCE (no flowsheet run reaches it); "
          f"a pump discharge: eta 0.5 and 0.03 close (dT = {disch.get(0.5, float('nan')):.4f} "
          f"and {disch.get(0.03, float('nan')):.4f} K), eta 0.01 heated past T_sat(P_out) "
          "refused by name.  "
          "NOT CHECKED: the values beyond those bounds, the overloads' (T, P) branch "
          "by behaviour, the time-integrated refusal's behaviour, the pump's search "
          "failing for another cause, a wet turbine exhaust, a heatExchanger fed a "
          "declared saturated vapour.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
