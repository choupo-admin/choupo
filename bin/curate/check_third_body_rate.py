#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""The batch reactor's `thirdBody` rate is k(T) [M] PROD c, forward AND
reversible (DEV.md 4c C185 item 9).

THE DEFECT THIS GATE EXISTS FOR.  `BatchReactor::rateOfReaction_` read

    case RateForm::ThirdBody:
    case RateForm::Factory: break;   // handled above

and only the Factory form is handled above, so a `thirdBody` reaction left
the switch with k = 0, and the third-body arm inside the Falloff case
(k = A T^b exp(-Ea/RT) [M]) was unreachable.  Every `thirdBody` reaction
in the corpus (the H2/O2 recombinations R5-R8 of the O Conaire mechanism,
in ignition01_h2o2, its _rk4/_eulersi twins and ignition02_h2air_slack;
the third-body steps of nox01_zeldovich_postflame) ran at rate ZERO, at
exit 0, with goldens pinned on the truncated mechanism.  No golden could
see it: a golden pins what a run PRINTS.

WHAT IS CHECKED.  A probe built from ignition01_h2o2's own components
holds ONE reaction, R5 of that mechanism verbatim (H2 + M = 2 H + M, A in
cm3/mol/s, Ea in kcal/mol, efficiencies water 12, H2 2.5), in an
ISOTHERMAL rigid vessel at 2800 K, 5 bar, H2/N2/water 0.3/0.6/0.1, with
explicit RK4 at deltaT = 2e-6 s.  The gate integrates the SAME ODE itself
(its own RK4 on a step half the engine's), with every term computed here and
never read from the engine:

    k(T)  = A (1e-3)^(order) T^b exp(-Ea/RT)      (CHEMKIN cm -> SI kmol-m3)
    [M]   = SUM_j eff_j c_j                       (unlisted species: 1)
    r_f   = k [M] c_H2
    r_r   = (k / Kc) [M] c_H^2                    (reversible arm only)
    Kc    = exp(-SUM nu g_i / RT) (Pref/RT)^SUM nu,  g_i = h_i - T s_i from
            the records' dHf_298, s_298 and Cp (NASA-9 or polynomial),
            integrated here by Simpson's rule from 298.15 K.

  (a) IRREVERSIBLE  (`reversible false;`): n_H2, n_H and the total at the
      end of the run agree with the independent integration to 1e-6
      relative, and the H2 converted is not zero.
  (b) REVERSIBLE    (`reversible true;`, run long enough to reach the
      equilibrium plateau): the same agreement, AND the end state satisfies
      c_H^2 / c_H2 = Kc with the independent Kc to 1e-6 -- the reverse leg
      carries the same [M] as the forward leg (it cancels at equilibrium
      only if it does).
  (c) The corpus readers.  `thirdBody` is read in ONE place in src/
      (BatchReactor); the dynamic CSTR refuses the word by name (it keeps
      only `Arrhenius` and sends every other word to the ReactionRate
      factory, which does not register it).  Arm (c) re-counts that: the
      word `RateForm::ThirdBody` appears only in BatchReactor.{H,cpp}.

Scope: the batch reactor's `thirdBody` form.  NOT checked: `falloff` (its
own arm of the same switch, unchanged by C185), the adiabatic energy
balance, the CHEMKIN unit conversion of any other molecularity.

BY-HAND SABOTAGES (2026-10-31), each on BatchReactor.cpp, rebuilt with
`make -j1 all`, the gate run, the file restored and rebuilt:

  S1  restore the defect (`case RateForm::ThirdBody:` back above
      `case RateForm::Factory: break;`) -- this is also the REPRODUCTION
      on the parent commit 972882c54, which printed the same:
        check_third_body_rate: FAIL
          - (a) irreversible: n_H2 engine 6.44316e-06 vs independent
            4.05761e-06 (rel 3.70e-01)
          - (a) irreversible: n_H engine 0 vs independent 4.77111e-06
          - (a) irreversible: the engine converted NO H2 (rate zero) --
            fraction -3.653e-13
          - (b) reversible: c_H^2/c_H2 at the end = 0 vs Kc 2.8854132e-05
          (nine lines in all)
  S2  drop [M] from the third-body constant (k = A T^b exp(-Ea/RT) only):
        check_third_body_rate: FAIL
          - (a) irreversible: n_H2 engine 1.25446e-09 vs independent
            4.05761e-06 (rel 1.00e+00)
          - (a) irreversible: n_H engine 1.28838e-05 vs independent
            4.77111e-06 (rel 6.30e-01)
          - (a) irreversible: totalMoles engine 2.79191e-05 vs ...
      Arm (b) PASSES under S2, as it must: with [M] missing from BOTH
      legs the plateau is still Kc and the 80 ms run sits on it.  Only
      arm (a) can see a [M] dropped symmetrically.
  S3  the reverse leg without [M] (k_rev = A T^b exp(-Ea/RT) / Kc for a
      thirdBody reaction, the forward leg intact):
        check_third_body_rate: FAIL
          - (b) reversible: n_H engine 1.00488e-07 vs independent
            4.24022e-07 (rel 7.63e-01)
          - (b) reversible: c_H^2/c_H2 at the end = 1.5795258e-06 vs Kc
            2.8854132e-05 (rel 9.45e-01) -- the reverse leg does not
            carry the forward leg's [M]
      Arm (a) PASSES under S3 (an irreversible reaction has no reverse
      leg); only arm (b) can see it.

Exit 1 listing failures."""
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
BATCH = ROOT / "build" / "linux64Gcc" / "choupoBatch"
DONOR = ROOT / "tutorials" / "batch" / "combustion" / "ignition01_h2o2"

R = 8.314462618          # J/(mol K)  -- core/Constants.H
PREF = 1.0e5             # Pa
T = 2800.0               # K
P = 5.0e5                # Pa
V = 1.0e-3               # m3
X0 = {"H2": 0.3, "N2": 0.6, "water": 0.1}
SPECIES = ["H2", "O2", "H", "O", "OH", "HO2", "H2O2", "water", "N2"]

# R5 of ignition01's constant/reactions, verbatim.
A_CM, B, EA_KCAL = 4.57e19, -1.4, 105.1
EFF = {"water": 12.0, "H2": 2.5}

failures = []


def reaction_block(reversible):
    return f"""
TB_H2_M_2H_M
{{
    reversible        {"true" if reversible else "false"};
    limitingReactant  H2;
    stoichiometry
    (
        {{ component H;      nu  2;  order 0; }}
        {{ component H2;     nu -1;  order 1; }}
    );
    kinetics
    {{
        type thirdBody;
        A {A_CM:.4e};  b {B};  Ea {EA_KCAL};
        thirdBody {{ water 12.0; H2 2.5; }}
        units {{ A "cm3/mol/s"; Ea "kcal/mol"; }}
    }}
}}
"""


def build_probe(tmp, reversible, end_time):
    case = Path(tmp) / ("probe_rev" if reversible else "probe_irr")
    shutil.copytree(DONOR, case, ignore=shutil.ignore_patterns(
        "expected", "propertyManifest", "converged", "log.*", "reports",
        "trajectory.csv", "[1-9]*", "0.*"))
    (case / "constant" / "reactions").write_text(reaction_block(reversible))
    fs = case / "system" / "flowsheetDict"
    txt = fs.read_text()
    txt = re.sub(r"mode\s+adiabatic;", "mode      isothermal;", txt)
    txt = re.sub(r"integrator\s+Rosenbrock23;", "integrator  RK4;", txt)
    txt = re.sub(r"reactions\s*\(.*?\);", "reactions ( TB_H2_M_2H_M );",
                 txt, flags=re.S)
    assert "isothermal" in txt and "TB_H2_M_2H_M" in txt and "RK4" in txt
    fs.write_text(txt)
    cd = case / "system" / "controlDict"
    txt = cd.read_text()
    txt = re.sub(r"(?m)^endTime\s+[^;]+;", f"endTime         {end_time};", txt)
    txt = re.sub(r"(?m)^deltaT\s+[^;]+;", "deltaT          2.0e-6;", txt)
    txt = re.sub(r"(?m)^writeInterval\s+[^;]+;",
                 f"writeInterval   {end_time};", txt)
    txt = re.sub(r"(?m)^verbosity\s+\d+;", "verbosity     1;", txt)
    cd.write_text(txt)
    ntot = P * V / (R * 1000.0 * T)       # kmol
    comp = "\n".join(f"        {s} {X0.get(s, 0.0)};" for s in SPECIES)
    hold = case / "0" / "internalStates" / "bomb"
    hold.write_text(f"""recordType  internalState;
unit        "bomb";
equipment   batchReactor;
holdup
{{
    T            {T} K;
    P            {P / 1e5} bar;
    V            {V};
    totalMoles   {ntot:.15e};
    molarComposition
    {{
{comp}
    }}
}}
""")
    return case, ntot


def run(case):
    e = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(BATCH), str(case)], capture_output=True,
                       text=True, timeout=600, env=e)
    out = r.stdout + r.stderr
    if r.returncode != 0 or "<<<Choupo:result-begin>>>" not in out:
        return None, out
    j = json.loads(out.split("<<<Choupo:result-begin>>>")[1]
                      .split("<<<Choupo:result-end>>>")[0])
    return j, out


# ---------------------------------------------------- independent thermo
def record(name):
    txt = (DONOR / "constant" / "components" / f"{name}.dat").read_text()
    txt = re.sub(r"//[^\n]*", "", txt)
    hf = float(re.search(r"dHf_298\s+([-+0-9.eE]+)", txt).group(1))
    s0 = float(re.search(r"s_298\s+([-+0-9.eE]+)", txt).group(1))
    cp = re.search(r"idealGasHeatCapacity\s*\{(.*?)\n\}", txt, re.S).group(1)
    model = re.search(r"model\s+(\w+)", cp).group(1)
    if model == "NASA9":
        tc = float(re.search(r"Tcommon\s+([0-9.eE+]+)", cp).group(1))
        lo = [float(v) for v in re.search(r"low\s*\(([^)]*)\)", cp).group(1).split()]
        hi = [float(v) for v in re.search(r"high\s*\(([^)]*)\)", cp).group(1).split()]

        def f(t):
            a = lo if t <= tc else hi
            return R * (a[0] / t**2 + a[1] / t + a[2] + a[3] * t
                        + a[4] * t**2 + a[5] * t**3 + a[6] * t**4)
        breaks = [tc]
    elif model == "polynomial":
        c = [float(v) for v in re.search(r"coefficients\s*\(([^)]*)\)", cp).group(1).split()]

        def f(t):
            return sum(ci * t**i for i, ci in enumerate(c))
        breaks = []
    else:
        raise SystemExit(f"check_third_body_rate: Cp model '{model}' of {name}"
                         " is not one this gate integrates -- extend it")
    return hf, s0, f, breaks


def simpson(g, a, b, n=4000):
    h = (b - a) / n
    s = g(a) + g(b)
    for i in range(1, n):
        s += (4 if i % 2 else 2) * g(a + i * h)
    return s * h / 3.0


def gibbs(name, t):
    hf, s0, cp, breaks = record(name)
    pts = [298.15] + [x for x in breaks if 298.15 < x < t] + [t]
    dh = sum(simpson(cp, a, b) for a, b in zip(pts, pts[1:]))
    ds = sum(simpson(lambda x: cp(x) / x, a, b) for a, b in zip(pts, pts[1:]))
    return (hf + dh) - t * (s0 + ds)          # J/mol


def kc_independent(t):
    dg = 2.0 * gibbs("H", t) - gibbs("H2", t)
    cstd = PREF / (1000.0 * R * t)            # kmol/m3
    return math.exp(-dg / (R * t)) * cstd     # sum nu = +1


# ------------------------------------------------- independent kinetics
def integrate(n0, t_end, reversible, kc):
    k = A_CM * 1.0e-3 * T**B * math.exp(-EA_KCAL * 4184.0 / (R * T))

    def rhs(n):
        c = {s: max(n[s], 0.0) / V for s in n}
        m = sum(EFF.get(s, 1.0) * c[s] for s in c)
        r = k * m * c["H2"]
        if reversible:
            r -= (k / kc) * m * c["H"] ** 2
        d = {s: 0.0 for s in n}
        d["H2"] = -r * V
        d["H"] = 2.0 * r * V
        return d

    def add(n, a, d):
        return {s: n[s] + a * d[s] for s in n}

    n = dict(n0)
    h = 1.0e-6
    steps = int(round(t_end / h))
    for _ in range(steps):
        k1 = rhs(n)
        k2 = rhs(add(n, h / 2, k1))
        k3 = rhs(add(n, h / 2, k2))
        k4 = rhs(add(n, h, k3))
        n = {s: n[s] + h / 6 * (k1[s] + 2 * k2[s] + 2 * k3[s] + k4[s]) for s in n}
    return n


def rel(a, b):
    return abs(a - b) / max(abs(a), abs(b), 1e-300)


def arm(tmp, reversible, end_time, kc):
    tag = "(b) reversible" if reversible else "(a) irreversible"
    case, ntot = build_probe(tmp, reversible, end_time)
    j, out = run(case)
    if j is None:
        failures.append(f"{tag}: the probe did not run\n--- tail:\n" + out[-1200:])
        return None
    k = j["kpis"]["bomb"]
    eng = {"H2": k["n_H2_final"], "H": k["n_H_final"]}
    n0 = {s: X0.get(s, 0.0) * ntot for s in SPECIES}
    ref = integrate(n0, end_time, reversible, kc)
    for s in ("H2", "H"):
        if rel(eng[s], ref[s]) > 1e-6:
            failures.append(f"{tag}: n_{s} engine {eng[s]:.6g} vs independent"
                            f" {ref[s]:.6g} (rel {rel(eng[s], ref[s]):.2e})")
    tot_ref = sum(ref.values())
    if rel(k["totalMoles_final"], tot_ref) > 1e-6:
        failures.append(f"{tag}: totalMoles engine {k['totalMoles_final']:.6g}"
                        f" vs independent {tot_ref:.6g}")
    converted = 1.0 - eng["H2"] / n0["H2"]
    if converted < 1e-3:
        failures.append(f"{tag}: the engine converted NO H2 (rate zero) --"
                        f" fraction {converted:.3e}")
    return eng, ref, converted


def main():
    if not BATCH.exists():
        print(f"check_third_body_rate: {BATCH} missing -- build first")
        return 1
    kc = kc_independent(T)
    with tempfile.TemporaryDirectory() as tmp:
        a = arm(tmp, False, 2.0e-3, kc)
        b = arm(tmp, True, 8.0e-2, kc)
    msg_b = ""
    if b is not None:
        eng = b[0]
        q = (eng["H"] / V) ** 2 / (eng["H2"] / V)
        if rel(q, kc) > 1e-6:
            failures.append(f"(b) reversible: c_H^2/c_H2 at the end = {q:.8g}"
                            f" vs Kc {kc:.8g} (rel {rel(q, kc):.2e}) -- the"
                            " reverse leg does not carry the forward leg's [M]")
        msg_b = (f"reversible: on the plateau c_H^2/c_H2 = {q:.6g} = Kc"
                 f" {kc:.6g} kmol/m3 (independent, from the records)")
    # (c) the readers of the form
    readers = sorted({str(p.relative_to(ROOT)) for p in (ROOT / "src").rglob("*")
                      if p.suffix in (".cpp", ".H")
                      and "RateForm::ThirdBody" in p.read_text(errors="ignore")})
    if readers != ["src/unitOperations/batch/BatchReactor.cpp"]:
        failures.append(f"(c) RateForm::ThirdBody is read outside the batch"
                        f" reactor: {readers} -- hold the new reader here")
    if failures:
        print("check_third_body_rate: FAIL")
        for f in failures:
            print("  -", f)
        return 1
    print(f"check_third_body_rate: OK -- the batch reactor's thirdBody rate"
          f" is k(T)[M]c_H2 on R5 of O Conaire 2004 at {T:.0f} K:"
          f" irreversible, {a[2]*100:.2f} % of the H2 converted in 2 ms,"
          f" n_H2 and n_H equal to an independent RK4 integration to 1e-6;"
          f" {msg_b}; RateForm::ThirdBody read only in BatchReactor.cpp."
          "  Scope: the thirdBody form of batchReactor; NOT checked: falloff,"
          " the adiabatic energy balance, CHEMKIN conversion at other"
          " molecularities")
    return 0


if __name__ == "__main__":
    sys.exit(main())
