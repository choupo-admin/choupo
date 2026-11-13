#!/usr/bin/env python3
"""Gate: the liquid-density pilot's demonstrations and its behavioural witness.

    bin/curate/check_density_pilot.py

WHY (DEV.md 4c C378, the pilot; docs/design/density-pilot-plan.md sections 8
and 10; the thresholds as amended in DEV.md 4c).  The pump and the CSTR take
their liquid density from the property kernel's methods.  A golden pins what
a run prints; this gate holds what the pilot CLAIMS, on the six cases of
tutorials/steady/thermo/liquidDensity0*, run on scratch copies (no shipped
case is edited), with the kernel's own double read through
`choupoProps --liquid-density-probe` (%.17g).

WHAT IT CHECKS (each arm prints PASS or FAIL with its numbers):
  W  WIRING, for EACH method a pump or a CSTR can receive -- the reference
     equation (D1), idealMixing (D2), the solution law (D3), the measurement
     (D3b): the pump's rho (M / v_molar_liq) at its inlet state and the
     CSTR's rho (tau m_dot / V_R) at its feed state equal the kernel's to
     1e-9 relative, at two states that the method prices differently, so a
     unit that kept a number of its own cannot pass.
  D1 the twelve printed IAPWS-95 anchors (Wagner and Pruss 2002, Tables
     13.1-13.2; data/curation/batches/density_pilot/d1_anchors.tsv), the
     saturated ones asked at p_sat(T) of the formulation under test: within
     0.001 %; the 1-bar maximum lies between 275 and 280 K; 500 bar differs
     from 1 bar and lies within 0.005 % of 1018.4; 373.15 K at 1 bar is
     REFUSED as a vapour (no unit reads 996.96 anywhere).
  D2 THE MECHANISM: at x = 0.5, 298.15 K the kernel equals the additive
     volumes of the two leaves it reads (each asked alone) to 1e-9, and
     differs from the mass-fraction average by more than 1 kg/m3; the
     ethanol leaf at 298.15 K lies within 0.3 % of the measured 785.7.
  D3 the record's law against a copy of the 18 constants held HERE (Olsson et
     al. 1997, Table IV) at 1e-6, at five states; a state outside Table III
     is refused naming the bands.
  D3b the marked point: Q = m_dot/1213.8 and tau = 1213.8 m_dot to 1e-6 (the
     table names the measurement and what it replaced); at 333.15 K the run
     is REFUSED by the box; the check-only variant prices by the law there.
  D4 the same refusal at 293.15 and 313.15 K naming `v_inf` and
     massWithoutVolume; with the hypothesis bounded at 0.01, refused by it.
  D5 pump, CSTR and bench refuse naming {ethanol, NaCl, water}, "No solution
     record covers this set", ethanol-NaCl-water.dat; no number.
  M  THE BEHAVIOURAL WITNESS of the measurement (plan section 10): the D3b
     case run twice with the point replaced by 1000 and 1500 kg/m3 (a wide
     box, reason "witness"): the CSTR's tau / rho unchanged to 1e-9.  (The
     caustic cases have no pump: its discharge temperature needs NaOH's
     liquid heat capacity, which the record lacks -- outside the pilot; the
     pump's wiring is held by the W arms on water and water + ethanol.)
  R3 the package's line decides the phase (ruling 3 at hand-back A): pure
     water with no `pureFluids` fed at the package's own saturation line at
     0.05 bar is pumped and the run announces the two lines; 5 % below it is
     REFUSED naming both pressures.

NOT CHECKED HERE: the accuracy scores that need the measured sets the mirror
holds and git does not (D2 against Pecar and Rehman, D3 against Galindo-Luna
and Hnedkovsky): data/curation/batches/density_pilot/scripts/score_pilot.py
prints them where the mirror exists.  Whether any value is right beyond the
anchors.
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
NAME = "check_density_pilot"
CASES = ROOT / "tutorials" / "steady" / "thermo"
SOLVE = ROOT / "choupoSolve"
PROPS = ROOT / "choupoProps"
G = 9.80665
OLSSON = [[5007.2279636, -25131.164248, 74107.692582, -104657.48684, 69821.773186, -18145.911810],
          [-64.786269079, 525.34360564, -1608.4471903, 2350.9753235, -1660.9035108, 457.64374355],
          [0.24436776978, -1.9737722344, 6.04601497138, -8.9090614947, 6.37146769397, -1.7816083111]]

results = []


def arm(tag, ok, text):
    results.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  {tag}: {text}")


def copy_case(name, tmp, tag):
    d = Path(tmp) / tag
    shutil.copytree(CASES / name, d, ignore=shutil.ignore_patterns(
        "converged", "reports", "log*", "iterations", "postProcessing", "*.csv"))
    return d


def set_feed(d, T=None, P=None, stream="feed"):
    f = d / "0" / stream
    s = f.read_text()
    if T is not None:
        s = re.sub(r"^T\s+[^;]+;", f"T               {T!r} K;", s, flags=re.M)
    if P is not None:
        s = re.sub(r"^P\s+[^;]+;", f"P               {P!r} Pa;", s, flags=re.M)
    f.write_text(s)


def solve(d):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT), LC_ALL="C")
    r = subprocess.run([str(SOLVE), str(d)], capture_output=True, text=True, env=env, timeout=600)
    out = r.stdout + r.stderr
    m = re.search(r"<<<Choupo:result-begin>>>\n(.*?)\n<<<Choupo:result-end>>>", out, re.S)
    res = json.loads(m.group(1)) if (m and r.returncode == 0) else None
    return r.returncode, res, out


def probe(d, states):
    """states: [(T, P, {name: x})] -> [float or 'REFUSED msg']"""
    pd = Path(d) / "system" / "propsDict"
    if not pd.exists():
        pd.write_text("operations\n(\n);\n")      # the probe runs no operation
    f = Path(d) / "probe.txt"
    f.write_text("".join(f"{T!r} {P!r} " + " ".join(f"{k} {v!r}" for k, v in x.items()) + "\n"
                         for T, P, x in states))
    env = dict(os.environ, CHOUPO_HOME=str(ROOT), LC_ALL="C")
    r = subprocess.run([str(PROPS), str(d), f"--liquid-density-probe={f}"], capture_output=True,
                       text=True, env=env, timeout=600)
    out = []
    for l in r.stdout.splitlines():
        if l.startswith("probe\t"):
            p = l.split("\t")
            out.append(p[3] if p[2] == "REFUSED" else float(p[2]))
    if len(out) != len(states):
        sys.exit(f"{NAME}: FAIL -- the probe answered {len(out)} of {len(states)} states:\n"
                 + (r.stdout + r.stderr)[-2000:])
    return out


def mole_fractions(stream):
    return {k: v for k, v in stream["composition"].items() if v > 0}


def unit_rhos(res, mw):
    """(pump rho at its inlet or None, CSTR rho at its feed, the two states)."""
    k = res["kpis"]
    s = res["streams"]
    feedC = s["pumped"] if "pumped" in s else s["feed"]
    zin = mole_fractions(feedC)
    c = k["R1"]
    rho_c = c["tau_s"] * feedC["F_mass"] / c["V_R"]
    sc = (feedC["T"], feedC["P"], zin)
    if "P1" not in k:
        return None, rho_c, None, sc
    pin = s["feed"]
    zp = mole_fractions(pin)
    Mbar = sum(x * mw[n] for n, x in zp.items()) / 1000.0              # kg/mol
    rho_p = Mbar / k["P1"]["v_molar_liq"]
    return rho_p, rho_c, (pin["T"], pin["P"], zp), sc


def rel(a, b):
    return abs(a / b - 1.0)


def wiring(tag, name, variants, tmp):
    """Run the case at each (T, P) variant; the units equal the kernel to 1e-9."""
    rhos = []
    for k, (T, P) in enumerate(variants):
        d = copy_case(name, tmp, f"{tag}_{k}")
        set_feed(d, T, P)
        rc, res, out = solve(d)
        if res is None:
            arm(f"W {tag}", False, f"{name} at {T} K, {P} Pa did not run (exit {rc}): "
                + out.strip().splitlines()[-1][:300])
            return None
        mw = res["componentMolarMass"]
        rp, rc_, sp, sc = unit_rhos(res, mw)
        if rp is None:
            kc = probe(d, [sc])[0]
            worst = rel(rc_, kc)
            rhos.append(rc_)
            arm(f"W {tag}", worst <= 1e-9,
                f"{name} at {T} K: CSTR {rc_:.10g} vs kernel {kc:.10g} kg/m3 (rel {worst:.2e}, "
                "limit 1e-9; no pump in this case)")
            continue
        kp, kc = probe(d, [sp, sc])
        worst = max(rel(rp, kp), rel(rc_, kc))
        rhos.append(rp)
        arm(f"W {tag}", worst <= 1e-9,
            f"{name} at {T} K, {P!r} Pa: pump {rp:.10g} vs kernel {kp:.10g}, CSTR {rc_:.10g} vs kernel "
            f"{kc:.10g} kg/m3 (worst {worst:.2e}, limit 1e-9)")
    if len(rhos) == 2:
        arm(f"W {tag}", rel(rhos[0], rhos[1]) > 1e-4,
            f"the two states are priced differently ({rhos[0]:.8g} / {rhos[1]:.8g}), so a unit "
            "holding a number of its own could not pass")
    return rhos


def olsson(T, w_naoh):
    t = T - 273.15
    s = math.sqrt(1.0 - w_naoh)
    b = [sum(OLSSON[j][k] * s ** k for k in range(6)) for j in range(3)]
    return b[0] + b[1] * t + b[2] * t * t


def xmol(w, mw):
    n = {k: v / mw[k] for k, v in w.items()}
    s = sum(n.values())
    return {k: v / s for k, v in n.items()}


def main():
    for exe in (SOLVE, PROPS):
        if not exe.exists():
            print(f"{NAME}: FAIL -- {exe} missing; build the tree (make all)")
            return 1
    tmp = tempfile.mkdtemp(prefix="densityPilot-")
    try:
        # ---- W and D1: water ---------------------------------------------
        wiring("referenceEquation", "liquidDensity01_water", [(298.15, 1.0e5), (277.15, 5.0e7)], tmp)
        dw = copy_case("liquidDensity01_water", tmp, "d1")
        rc, res, out = solve(dw)
        rho1 = res and unit_rhos(res, res["componentMolarMass"])[0]
        d500 = copy_case("liquidDensity01_water", tmp, "d1_500")
        set_feed(d500, 298.15, 5.0e7)
        rc5, res5, _ = solve(d500)
        rho500 = res5 and unit_rhos(res5, res5["componentMolarMass"])[0]
        arm("D1 500 bar", bool(rho500) and rel(rho500, rho1) > 1e-3 and rel(rho500, 1018.4) <= 5e-5
            and abs(rho500 - 996.96) > 0.5,
            f"pump at 298.15 K: 1 bar {rho1:.6f}, 500 bar {rho500:.6f} kg/m3 (within 0.005 % of "
            f"1018.4: {rel(rho500, 1018.4)*100:.4f} %)")
        dv = copy_case("liquidDensity01_water", tmp, "d1_vapour")
        set_feed(dv, 373.15, 1.0e5)
        rcv, resv, outv = solve(dv)
        bench = probe(dv, [(373.15, 1.0e5, {"water": 1.0})])[0]
        arm("D1 373.15 K, 1 bar", rcv != 0 and isinstance(bench, str) and "is a VAPOUR" in bench
            and "p_sat(T) = 101418 Pa" in bench,
            "the run refuses (the pump does not accept a vapour inlet) and the kernel refuses it as a "
            "vapour, naming p_sat(T) = 101418 Pa" if rcv != 0 else f"answered (exit {rcv})")
        # the anchors, saturated ones at the formulation's own p_sat(T)
        dp = copy_case("liquidDensity01_water", tmp, "d1_psat")
        th = (dp / "constant" / "thermoPhysPropDict")
        th.write_text(th.read_text() + "\npureFluids { water { method Helmholtz; equation IAPWS95; } }\n")
        anchors = [l.split("\t") for l in (ROOT / "data/curation/batches/density_pilot/d1_anchors.tsv")
                   .read_text().splitlines() if l and l[0] in "si" and not l.startswith("kind")]
        states = []
        for a in anchors:
            T, p = float(a[1]), float(a[2]) * 1e6
            if a[0] == "sat" or abs(T - 372.756) < 1e-9:
                states.append((T, None))
            else:
                states.append((T, p))
        # p_sat(T) of IAPWS-95: the pure set {water} on its liquid branch at the
        # line equals the saturated liquid; read p_sat by bisection on the
        # probe's refusal text is costly -- the formulation's p_sat comes from
        # the refusal message of a state just below any line instead.
        #  p_sat(T) of IAPWS-95 itself (the package with that pure-fluid
        #  selection reports it), to 9 digits -- inside the band of 1e-6.
        sat_T = [T for T, p in states if p is None]
        (dp / "system" / "propsDict").write_text(
            "operations ( { name s; type propertyScan1D; vary { variable T; points ( "
            + " ".join(repr(T) for T in sat_T) + " ); } state { P 1e5 Pa; composition { water 1; } } "
            "properties ( Psat_water ); output { file \"psat.csv\"; } } );\n")
        subprocess.run([str(PROPS), str(dp)], capture_output=True, text=True,
                       env=dict(os.environ, CHOUPO_HOME=str(ROOT), LC_ALL="C"), timeout=600)
        rows = [l.split(",") for l in next(dp.rglob("psat.csv")).read_text().splitlines()[1:]
                if l and l[0] != "#"]
        psat = {T: float(r[1]) for T, r in zip(sat_T, rows)}
        asked = [(T, p if p is not None else psat[T], {"water": 1.0}) for T, p in states]
        vals = probe(dw, asked)
        worst = 0.0
        for a, v in zip(anchors, vals):
            if isinstance(v, str):
                worst = float("inf")
                continue
            worst = max(worst, rel(v, float(a[3])))
        arm("D1 anchors", worst <= 1e-5,
            f"12 printed IAPWS-95 densities, max |dev| {worst*100:.5f} % (limit 0.001 %)")
        mx = probe(dw, [(273.16, 1e5, {"water": 1.0}), (277.15, 1e5, {"water": 1.0}),
                        (283.15, 1e5, {"water": 1.0})])
        arm("D1 maximum", mx[1] > mx[0] and mx[1] > mx[2],
            f"1 bar: 273.16 K {mx[0]:.4f}, 277.15 K {mx[1]:.4f}, 283.15 K {mx[2]:.4f} kg/m3")

        # ---- W and D2: water + ethanol -------------------------------------
        wiring("idealMixing", "liquidDensity02_waterEthanol", [(298.15, 1.0e5), (323.15, 1.0e5)], tmp)
        d2 = copy_case("liquidDensity02_waterEthanol", tmp, "d2")
        rw, re_, rm = probe(d2, [(298.15, 101325.0, {"water": 1.0}), (298.15, 101325.0, {"ethanol": 1.0}),
                                 (298.15, 101325.0, {"water": 0.5, "ethanol": 0.5})])
        Mw, Me = 18.015, 46.069
        add = (0.5 * Mw + 0.5 * Me) / (0.5 * Mw / rw + 0.5 * Me / re_)
        ww = 0.5 * Mw / (0.5 * Mw + 0.5 * Me)
        mavg = ww * rw + (1 - ww) * re_
        arm("D2 mechanism", rel(rm, add) <= 1e-9 and abs(rm - mavg) > 1.0,
            f"x = 0.5, 298.15 K: kernel {rm:.12g}, additive volumes of its two leaves {add:.12g} "
            f"(rel {rel(rm, add):.1e}, limit 1e-9); mass-fraction average {mavg:.4f} "
            f"(|diff| {abs(rm-mavg):.3f} kg/m3 > 1)")
        arm("D2 ethanol leaf", rel(re_, 785.7) <= 3e-3,
            f"pure ethanol at 298.15 K {re_:.3f} kg/m3 against the measured 785.7 "
            f"({(re_/785.7-1)*100:+.3f} %, limit 0.3 %)")

        # ---- W and D3: aqueous NaOH ----------------------------------------
        wiring("solutionLaw", "liquidDensity03_NaOH", [(303.15, 1.0e5), (333.15, 1.0e5)], tmp)
        d3 = copy_case("liquidDensity03_NaOH", tmp, "d3")
        mw = {"NaOH": 39.997, "water": 18.015}
        pts = [(293.15, 0.5), (303.15, 0.2), (323.15, 0.35), (343.15, 0.1), (353.15, 0.45)]
        vals = probe(d3, [(T, 1e5, xmol({"NaOH": w, "water": 1 - w}, mw)) for T, w in pts])
        worst = max(rel(v, olsson(T, w)) for v, (T, w) in zip(vals, pts))
        arm("D3 law", worst <= 1e-6, f"the record against the 18 constants held here, 5 states, "
            f"max {worst:.1e} (limit 1e-6)")
        out = probe(d3, [(285.0, 1e5, xmol({"NaOH": 0.4, "water": 0.6}, mw))])[0]
        arm("D3 window", isinstance(out, str) and "outside every band" in out,
            "285 K at 40 wt % refused naming the bands" if isinstance(out, str) else f"answered {out}")

        # ---- W, D3b and M: the measured point ------------------------------
        d4 = copy_case("liquidDensity04_NaOHpoint", tmp, "d3b")
        rc, res, outb = solve(d4)
        if res is None:
            arm("D3b", False, f"did not run (exit {rc}): " + outb.strip().splitlines()[-1][:300])
        else:
            mdot = res["streams"]["feed"]["F_mass"]
            tau = res["kpis"]["R1"]["tau_s"]
            Q = res["kpis"]["R1"]["V_R"] / tau
            arm("D3b point", rel(Q / mdot, 1 / 1213.8) <= 1e-6 and rel(tau / mdot, 1213.8) <= 1e-6
                and "replaces solutionLaw.NaOH-water" in outb and "measured.NaOH20_303K" in outb,
                f"m_dot {mdot:.9g} kg/s: Q {Q:.6e} m3/s (m_dot/1213.8 = {mdot/1213.8:.6e}), tau "
                f"{tau:.6f} s; the table names measured.NaOH20_303K and what it replaced")
        d4h = copy_case("liquidDensity04_NaOHpoint", tmp, "d3b_hot")
        set_feed(d4h, 333.15, None)
        rch, _, outh = solve(d4h)
        arm("D3b box", rch != 0 and "outside the box the case declared for its measurement NaOH20_303K" in outh,
            "333.15 K refused by the box" if rch != 0 else "answered at 333.15 K")
        d4c = copy_case("liquidDensity04_NaOHpoint", tmp, "d3b_check")
        set_feed(d4c, 333.15, None)
        th = d4c / "constant" / "thermoPhysPropDict"
        th.write_text(th.read_text().replace(
            'NaOH20_303K { use method; replaces { method solutionLaw; record NaOH-water; } reason "the laboratory point of our caustic"; }',
            "NaOH20_303K { use check; }"))
        rcc, resc, outc = solve(d4c)
        arm("D3b check-only", rcc == 0 and "not at its conditions" in outc,
            "333.15 K priced by the law, the point printed 'not at its conditions'" if rcc == 0
            else f"exit {rcc}")
        # the measurement's witness: 1000 and 1500 kg/m3
        prods = []
        for rho in (1000.0, 1500.0):
            dm = copy_case("liquidDensity04_NaOHpoint", tmp, f"m{int(rho)}")
            e = dm / "constant" / "experiments" / "NaOH20_303K.dat"
            s = e.read_text().replace("303.15  100  0.200  1213.8", f"303.15  100  0.200  {rho}")
            s = s.replace("box         { T ( 301.65 304.65 ); P ( 50e3 1500e3 ); w[NaOH] ( 0.199 0.201 ); }",
                          "box         { T ( 280 340 ); P ( 1e3 1e7 ); w[NaOH] ( 0.1 0.3 ); }")
            e.write_text(s)
            th = dm / "constant" / "thermoPhysPropDict"
            th.write_text(th.read_text().replace('reason "the laboratory point of our caustic"', 'reason "witness"'))
            rcm, resm, outm = solve(dm)
            if resm is None:
                arm("M witness", False, f"rho {rho}: exit {rcm} " + outm.strip().splitlines()[-1][:200])
                continue
            mdot = resm["streams"]["feed"]["F_mass"]
            prods.append((resm["kpis"]["R1"]["tau_s"] / rho / mdot,))
        if len(prods) == 2:
            worst = max(rel(a, b) for a, b in zip(*prods))
            arm("M witness", worst <= 1e-9,
                f"point at 1000 and 1500 kg/m3: the CSTR's tau / (rho m_dot) unchanged "
                f"(worst {worst:.1e}, limit 1e-9)")
        wiring("measured", "liquidDensity04_NaOHpoint", [(303.15, None)], tmp)

        # ---- D4 ------------------------------------------------------------
        for T in (293.15, 313.15):
            d = copy_case("liquidDensity05_CO2water", tmp, f"d4_{T}")
            set_feed(d, T, None)
            rc, _, o = solve(d)
            arm(f"D4 {T} K", rc != 0 and "'CO2' is a declared Henry solute" in o and "`v_inf`" in o
                and "massWithoutVolume" in o, "refused, naming v_inf and massWithoutVolume" if rc != 0
                else "answered")
        d = copy_case("liquidDensity05_CO2water", tmp, "d4_hyp")
        th = d / "constant" / "thermoPhysPropDict"
        th.write_text(th.read_text() + '\napproximations { massWithoutVolume { components ( CO2 ); '
                      'maxMassFraction 0.01; reason "D4 probe"; } }\n')
        rc, _, o = solve(d)
        arm("D4 bound", rc != 0 and "above the maxMassFraction 0.01" in o,
            "with the hypothesis at 0.01, refused by its bound" if rc != 0 else "answered")

        # ---- D5 ------------------------------------------------------------
        d5 = copy_case("liquidDensity06_NaClwaterEthanol", tmp, "d5")
        rc, _, o = solve(d5)
        need = ["{ethanol, NaCl, water}", "No solution record covers this set",
                "ethanol-NaCl-water.dat", "massWithoutVolume"]
        last = o.split("ERROR")[0].rsplit(">>>  Unit", 1)[-1]
        arm("D5 pump", rc != 0 and all(n in o for n in need) and "(type = pump)" in last,
            "refused with the set, the record kind and the remedies" if rc != 0 else "answered")
        th = d5 / "system" / "flowsheetDict"
        s = th.read_text()
        s = re.sub(r"\{\s*name\s+P1;.*?\}\s*\}", "", s, count=1, flags=re.S).replace("in          pumped;", "in          feed;")
        th.write_text(s)
        (d5 / "0" / "pumped").unlink()
        rc, _, o = solve(d5)
        last = o.split("ERROR")[0].rsplit(">>>  Unit", 1)[-1]
        arm("D5 CSTR", rc != 0 and all(n in o for n in need) and "(type = cstr)" in last,
            "refused with the same words"
            if rc != 0 else "answered")
        r = probe(d5, [(298.15, 1e5, {"water": 30 / 36, "ethanol": 5 / 36, "NaCl": 1 / 36})])[0]
        arm("D5 bench", isinstance(r, str) and all(n in r for n in need),
            "rho_liquid_kernel refused with the same words" if isinstance(r, str) else f"answered {r}")

        # ---- R3: the package's line ----------------------------------------
        d = copy_case("liquidDensity01_water", tmp, "r3")
        pk = copy_case("liquidDensity01_water", tmp, "r3pkg")
        # the package's own saturation line at 0.05 bar: T by bisection on Psat
        (pk / "system" / "propsDict").write_text(
            "operations ( { name s; type propertyScan1D; vary { variable T; points ( "
            + " ".join(f"{306.0 + 0.0001 * i!r}" for i in range(1000))
            + " ); } state { P 1e5 Pa; composition { water 1; } } properties ( Psat_water ); "
              "output { file \"psat.csv\"; } } );\n")
        subprocess.run([str(PROPS), str(pk)], capture_output=True, text=True,
                       env=dict(os.environ, CHOUPO_HOME=str(ROOT), LC_ALL="C"), timeout=600)
        csv = next(pk.rglob("psat.csv"))
        rows = [l.split(",") for l in csv.read_text().splitlines()[1:] if l and l[0] != "#"]
        T0, p0 = min(((float(a), float(b)) for a, b in rows), key=lambda r: abs(r[1] - 5000.0))
        #  A pure stream declared by T and P ON its line is refused by the
        #  inlet check (two variables fix a stream); 1e-4 above the package's
        #  line it is a liquid for the package and still below the reference
        #  equation's own line (5e-4 above it here): the zone of ruling 3.
        set_feed(d, T0, p0 * 1.0001)
        rc, res, o = solve(d)
        arm("R3 between the lines", rc == 0 and "the package's own saturation line puts this state in the liquid" in o,
            f"pure water at {T0:.4f} K, 1e-4 above the package's line at 0.05 bar, below IAPWS-95's: "
            "pumped, both lines announced" if rc == 0 else f"exit {rc}: " + o.strip().splitlines()[-1][:200])
        below = probe(d, [(T0, 0.95 * p0, {"water": 1.0})])[0]
        arm("R3 below both", isinstance(below, str) and "both say vapour" in below,
            "5 % below the package's line: the kernel refuses, naming both pressures"
            if isinstance(below, str) else f"answered {below}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    bad = results.count(False)
    print(f"{NAME}: {'OK' if not bad else 'FAIL'} -- {len(results) - bad} of {len(results)} arms hold "
          "(wiring per method, D1-D5, the measurement's witness, the package's line).  NOT CHECKED: "
          "the accuracy scores on the mirror's measured sets (score_pilot.py).")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
