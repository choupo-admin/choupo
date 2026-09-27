#!/usr/bin/env python3
"""Gate: a Gibbs reactor's pure solid phase appears when it should, vanishes
when it should, and conserves what it deposits.

    bin/curate/check_gibbs_solid_phase.py

WHY THIS EXISTS (commission C14, 2026-09-27).  A steam reformer run short of
steam deposits carbon, and the catalogue had no solid carbon and the
`gibbsReactor` no pure condensed phase: the answer a student got was a
carbon-free gas that was NOT the Gibbs minimum, at exit 0.  `graphite.dat`
(NASA TM-4513, `referenceState pureSolid;`) and `GibbsMethod::solve`
(src/unitOperations/reactor/gibbsMethod/GibbsSolidPhase.cpp) close it.  A
golden can pin what the witness prints; it cannot tell whether the phase set
is RIGHT, so this gate recomputes it by a DIFFERENT route.

WHAT IS CHECKED, on the witness tutorials/steady/gibbs/gibbs11_carbon_deposition
(two reformers, 1000 K, 1 bar: S/C 0.8 cokes, S/C 3.0 does not):

  (a) THE PHASE SET AND ITS ANNOUNCEMENT.  reformerLow publishes a positive
      n_solid_graphite_mol_s at activity 1 (to 1e-8) and prints `APPEARS`;
      reformerHigh publishes zero at an activity below 1 and prints
      `ABSENT`.  Both verdicts reach the end-of-run caveat block.

  (b) AN INDEPENDENT RECOMPUTATION.  The engine minimises G by element
      potentials; this gate solves the SAME equilibrium by a REACTION-based
      route -- three equilibrium constants (reforming, shift, methane
      cracking) from the case's own records, nested bisections on the three
      extents, the carbon test as a_C = K_crack p_CH4 / p_H2^2 -- sharing no
      line of code with the engine.  Every gas amount, the graphite amount
      and the carbon-free activity must agree to 1e-6 relative.

  (c) THE ELEMENT BALANCE, recomputed from the result JSON (fluid + solid)
      for C, H and O on each reformer, to 1e-7 relative -- a deposit that
      left the outlet would be carbon destroyed.  The band is the fluid
      Newton's own: it stops at |F| <= 1e-8 mol/s on the element residual
      (GibbsMethod.cpp, `ndo.tolerance`), which on 0.28 mol/s of carbon is
      a relative closure of a few 1e-8 -- measured 1.8e-8 on reformerLow.

  (d) THE FIRST LAW, twice.  The report's plant residual is zero (1e-6 kW);
      and each reformer's Q_kW is recomputed here as H_out - H_in on the
      records (ideal gas + graphite on its SOLID rung, NASA-7) to 1e-6
      relative -- a duty that forgot the deposit, or priced it on another
      surface, moves by 0.81 kW on reformerLow.

  (e) THE ABSENT SOLID CHANGES NOTHING.  reformerHigh is gibbs02's feed and
      conditions; with graphite declared and absent, its gas KPIs and duty
      must equal gibbs02's published ones to 1e-10 relative.

  (f) THE REFUSAL.  The same case under `model directMin;` -- a method that
      publishes no element potentials -- must refuse BY NAME rather than
      decide the phase set on nothing.

  (g) THE ADIABATIC ENERGY PATH.  reformerLow run adiabatically from a 1300 K
      feed: the outer Newton on T balances H through
      `GibbsReactor::stateEnthalpy_W`, which must carry the deposit; the
      report's plant residual must be zero (1e-6 kW) and the deposit must
      still be at activity 1.

WHAT THIS DOES NOT CHECK, said plainly: more than one pure solid present at
once (refused by the engine, not exercised here); the `reactiveFlash` path
with a solid (it publishes element potentials and is accepted, but no case
runs it); the `gibbsMap` props op (it calls the fluid-only `equilibrium` and
a pure-solid species there refuses on the reference rung); real-gas
fugacities with a solid (the witness is ideal gas).

SABOTAGES, by hand, each restored with `cp` and `make all`; all six run on
2026-09-27 and all six CAUGHT, results as measured (not as predicted):

  S1  GibbsReactor.cpp: drop `pureSolidEnthalpy_W` from Q_kW
      -> (d): plant residual -0.8141 kW; reformerLow Q_kW 41.960 against
         42.774 recomputed on the solid rung.
  S2  GibbsSolidPhase.cpp: appearance threshold 1e-10 -> 1e10 (never appears)
      -> (a) no deposit, a = 2.330 and no APPEARS verdict; (b) every species
         off; (d) Q off; (g) the adiabatic deposit lost.  (e) untouched, as it
         must be -- that reformer's solid is absent either way.
  S3  GibbsSolidPhase.cpp: bisection capped at 3 iterations
      -> (a) a = 1.241 with the solid "present"; (b) graphite 0.0521 against
         0.0690 mol/s; (d); (g).
  S4  GibbsReactor.cpp: the deposit not written into the outlet's solids
      -> (c) carbon out 2.0875e-4 against 2.7778e-4 kmol/s in; (d) +0.8141
         kW; (g) +0.5023 kW.
  S5  GibbsSolidPhase.cpp: `requirePi` returns instead of refusing
      -> (f): the run died on SIGSEGV (exit -11) reading an empty pi -- the
         refusal is what stands between a derivative-free method and an
         out-of-range read.
  S6  GibbsReactor.cpp: `pureSolidEnthalpy_W` dropped from stateEnthalpy_W
      -> (g) ONLY (adiabatic residual -0.5203 kW): the isothermal witness
         never reads that function, which is why arm (g) exists.
"""

import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
CASE = ROOT / "tutorials/steady/gibbs/gibbs11_carbon_deposition"
TWIN = ROOT / "tutorials/steady/gibbs/gibbs02_steam_reforming"
R = 8.314462618                         # src/core/Constants.H
T_REACTOR, P_BAR = 1000.0, 1.0
FEEDS = {"reformerLow": 0.8, "reformerHigh": 3.0}   # S/C, 1 kmol/h CH4


# ---------------------------------------------------------------- records --
def strip(t):
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    return re.sub(r"//.*$", "", t, flags=re.M)


def block(t, name):
    m = re.search(r"\b" + name + r"\s*\{", t)
    if not m:
        raise KeyError(name)
    i, d = m.end(), 1
    while d:
        d += {"{": 1, "}": -1}.get(t[i], 0)
        i += 1
    return t[m.end():i - 1]


def num(t, key):
    return float(re.search(r"\b" + key + r"\s+([-+0-9.eE]+)", t).group(1))


def vec(t, key):
    return [float(x) for x in
            re.search(r"\b" + key + r"\s*\(([^)]*)\)", t).group(1).split()]


def record(name):
    """The case's own sealed copy first -- the one the run reads."""
    for p in (CASE / "constant/components" / f"{name}.dat",
              ROOT / "data/standards/components" / f"{name}.dat"):
        if p.exists():
            return strip(p.read_text())
    raise FileNotFoundError(name)


class Gas:
    def __init__(self, name):
        t = record(name)
        st = block(t, "standardThermochemistry")
        self.Hf, self.S = num(st, "dHf_298"), num(st, "s_298")
        cp = block(t, "idealGasHeatCapacity")
        if not re.search(r"\bmodel\s+polynomial\s*;", cp):
            raise RuntimeError(f"{name}: this gate reads a polynomial Cp only")
        self.c = (vec(cp, "coefficients") + [0, 0, 0, 0])[:4]

    def h(self, T, T0=298.15):
        a, b, c, d = self.c
        H = lambda x: a*x + b*x**2/2 + c*x**3/3 + d*x**4/4
        return self.Hf + H(T) - H(T0)

    def g(self, T, T0=298.15):
        a, b, c, d = self.c
        S = lambda x: a*math.log(x) + b*x + c*x**2/2 + d*x**3/3
        return self.h(T) - T * (self.S + S(T) - S(T0))


class Graphite:
    def __init__(self):
        t = record("graphite")
        st = block(t, "standardThermochemistry")
        if not re.search(r"referenceState\s+pureSolid\s*;", st):
            raise RuntimeError("graphite.dat is not on the pureSolid rung")
        self.Hf, self.S = num(st, "dHf_298"), num(st, "s_298")
        cp = block(t, "solidHeatCapacity")
        self.lo, self.hi = vec(cp, "low")[:5], vec(cp, "high")[:5]
        self.Tc = num(cp, "Tcommon")

    def _seg(self, a, T0, T1):
        h = lambda x: R*(a[0]*x + a[1]*x**2/2 + a[2]*x**3/3 + a[3]*x**4/4
                         + a[4]*x**5/5)
        s = lambda x: R*(a[0]*math.log(x) + a[1]*x + a[2]*x**2/2
                         + a[3]*x**3/3 + a[4]*x**4/4)
        return h(T1) - h(T0), s(T1) - s(T0)

    def _dHdS(self, T, T0=298.15):
        if T <= self.Tc:
            return self._seg(self.lo, T0, T)
        h1, s1 = self._seg(self.lo, T0, self.Tc)
        h2, s2 = self._seg(self.hi, self.Tc, T)
        return h1 + h2, s1 + s2

    def h(self, T):
        return self.Hf + self._dHdS(T)[0]

    def g(self, T):
        dH, dS = self._dHdS(T)
        return self.Hf + dH - T * (self.S + dS)


GASES = ("CH4", "water", "CO", "CO2", "H2")


def bisect(f, lo, hi, it=64):
    flo = f(lo)
    for _ in range(it):
        mid = 0.5 * (lo + hi)
        fm = f(mid)
        if (fm > 0) == (flo > 0):
            lo, flo = mid, fm
        else:
            hi = mid
    return 0.5 * (lo + hi)


def reaction_route(sp, gr, T, P_bar, s):
    """Feed 1 mol CH4 + s mol H2O.  Extents: x1 reforming, x2 shift,
    x3 cracking (CH4 -> C(gr) + 2 H2).  Returns moles per mol CH4."""
    g = {k: sp[k].g(T) / (R * T) for k in GASES}
    lnK1 = -(g["CO"] + 3*g["H2"] - g["CH4"] - g["water"])
    lnK2 = -(g["CO2"] + g["H2"] - g["CO"] - g["water"])
    lnK3 = -(gr.g(T) / (R * T) + 2*g["H2"] - g["CH4"])
    lnP = math.log(P_bar)

    def moles(x1, x2, x3):
        return {"CH4": 1 - x1 - x3, "water": s - x1 - x2, "CO": x1 - x2,
                "CO2": x2, "H2": 3*x1 + x2 + 2*x3}

    def gas(x3):
        def x2of(x1):
            hi = min(s - x1, x1)

            def f2(x2):
                n = moles(x1, x2, x3)
                return (math.log(n["CO2"]) + math.log(n["H2"])
                        - math.log(n["CO"]) - math.log(n["water"]) - lnK2)
            return bisect(f2, 1e-300, hi * (1 - 1e-15))

        def f1(x1):
            n = moles(x1, x2of(x1), x3)
            N = sum(n.values())
            return (math.log(n["CO"]) + 3*math.log(n["H2"])
                    - math.log(n["CH4"]) - math.log(n["water"])
                    + 2*(lnP - math.log(N)) - lnK1)
        hi = min(1 - x3, s)
        x1 = bisect(f1, 1e-14 * hi, hi * (1 - 1e-14))
        return x1, x2of(x1)

    def lnaC(x3):
        x1, x2 = gas(x3)
        n = moles(x1, x2, x3)
        N = sum(n.values())
        return (lnK3 + math.log(n["CH4"]) - 2*math.log(n["H2"])
                + math.log(N) - lnP), n

    la0, n = lnaC(0.0)
    x3 = 0.0
    if la0 > 0:
        x3 = bisect(lambda z: lnaC(z)[0], 0.0, 0.999999)
        n = lnaC(x3)[1]
    n = dict(n)
    n["graphite"] = x3
    return n, math.exp(la0)


# ---------------------------------------------------------------- engine ---
def run(case, binary="choupoSolve"):
    p = subprocess.run([str(BUILD / binary), str(case)],
                       capture_output=True, text=True, timeout=600)
    out = p.stdout + p.stderr
    m = re.search(r"<<<Choupo:result-begin>>>\n(.*?)<<<Choupo:result-end>>>",
                  out, re.S)
    return p.returncode, out, (json.loads(m.group(1)) if m else None)


def rel(a, b):
    return abs(a - b) / max(abs(b), 1e-300)


def main() -> int:
    fails = []
    sp = {k: Gas(k) for k in GASES}
    gr = Graphite()

    rc, out, js = run(CASE)
    if rc != 0 or js is None:
        print(f"gibbs-solid-phase: FAILED -- the witness did not run "
              f"(exit {rc})\n{out[-3000:]}")
        return 1
    K = js["kpis"]
    F_CH4 = 1000.0 / 3600.0            # mol/s, 1 kmol/h

    # (a) phase set + announcement ---------------------------------------
    low, high = K["reformerLow"], K["reformerHigh"]
    if not low.get("n_solid_graphite_mol_s", 0.0) > 0.0:
        fails.append("(a) reformerLow deposits no graphite at S/C 0.8")
    if abs(low.get("activity_graphite", 0.0) - 1.0) > 1e-8:
        fails.append(f"(a) reformerLow graphite activity "
                     f"{low.get('activity_graphite')} is not 1 with the solid present")
    if high.get("n_solid_graphite_mol_s", -1.0) != 0.0:
        fails.append("(a) reformerHigh deposits graphite at S/C 3")
    if not (0.0 < high.get("activity_graphite", 2.0) < 1.0):
        fails.append(f"(a) reformerHigh activity {high.get('activity_graphite')}"
                     " is not below 1")
    for unit, word in (("reformerLow", "APPEARS"), ("reformerHigh", "ABSENT")):
        line = f"gibbsReactor {unit}: pure solid phase 'graphite'"
        if not any(line in l and word in l for l in out.splitlines()):
            fails.append(f"(a) {unit}: no `{word}` verdict for graphite in the"
                         " end-of-run caveat block")
    if out.count("[gibbs] pure solid phase 'graphite'") != 2:
        fails.append("(a) the per-reactor verdict line is not printed once per"
                     " reformer")

    # (b) independent reaction-based recomputation ------------------------
    for unit, s in FEEDS.items():
        n, aC0 = reaction_route(sp, gr, T_REACTOR, P_BAR, s)
        k = K[unit]
        Ng = k["F_out_kmol_h"] / 3.6                # fluid, mol/s
        for c in GASES:
            eng = k[f"y_{c}"] * Ng
            ref = n[c] * F_CH4
            if rel(eng, ref) > 1e-6:
                fails.append(f"(b) {unit} {c}: engine {eng:.9e} mol/s, "
                             f"reaction route {ref:.9e}")
        eng, ref = k["n_solid_graphite_mol_s"], n["graphite"] * F_CH4
        if (ref == 0.0 and eng != 0.0) or (ref > 0 and rel(eng, ref) > 1e-6):
            fails.append(f"(b) {unit} graphite: engine {eng:.9e} mol/s, "
                         f"reaction route {ref:.9e}")
        m = re.search(r"gibbsReactor %s: pure solid phase 'graphite': activity"
                      r" in the solid-free equilibrium a = ([0-9.eE+-]+)" % unit,
                      out)
        if not m or rel(float(m.group(1)), aC0) > 1e-5:
            fails.append(f"(b) {unit}: carbon-free activity printed "
                         f"{m.group(1) if m else None}, reaction route "
                         f"{aC0:.6g}")

    # (c) element balance from the result JSON ----------------------------
    atoms = {"CH4": (1, 4, 0), "water": (0, 2, 1), "CO": (1, 0, 1),
             "CO2": (1, 0, 2), "H2": (0, 2, 0), "graphite": (1, 0, 0)}
    S = js["streams"]
    for unit, (fin, fout) in {"reformerLow": ("feedLow", "syngasLow"),
                              "reformerHigh": ("feedHigh", "syngasHigh")}.items():
        tot = []
        for name in (fin, fout):
            st = S[name]
            e = [0.0, 0.0, 0.0]
            for c, x in st["composition"].items():
                for j in range(3):
                    e[j] += st["F"] * x * atoms[c][j]
            tot.append(e)
        for j, el in enumerate("CHO"):
            if rel(tot[1][j], tot[0][j]) > 1e-7:
                fails.append(f"(c) {unit}: element {el} in {tot[0][j]:.12e}"
                             f" out {tot[1][j]:.12e} kmol/s")

    # (d) first law, report + recomputed duty -----------------------------
    gb = js.get("globalEnergyBoundary", {})
    if abs(gb.get("residual_kW", 1e9)) > 1e-6:
        fails.append(f"(d) plant first-law residual {gb.get('residual_kW')} kW")
    for unit, s in FEEDS.items():
        n, _ = reaction_route(sp, gr, T_REACTOR, P_BAR, s)
        H_in = sp["CH4"].h(T_REACTOR) + s * sp["water"].h(T_REACTOR)
        H_out = sum(n[c] * sp[c].h(T_REACTOR) for c in GASES) \
            + n["graphite"] * gr.h(T_REACTOR)
        Q = (H_out - H_in) * F_CH4 / 1000.0          # kW
        if rel(K[unit]["Q_kW"], Q) > 1e-6:
            fails.append(f"(d) {unit}: Q_kW {K[unit]['Q_kW']:.9g}, recomputed"
                         f" on the records {Q:.9g} (graphite on its solid rung)")

    # (e) the absent solid changes nothing --------------------------------
    rc2, out2, js2 = run(TWIN)
    if rc2 != 0 or js2 is None:
        fails.append("(e) gibbs02 did not run")
    else:
        twin = js2["kpis"]["reformer"]
        for key in ("y_CH4", "y_water", "y_CO", "y_CO2", "y_H2", "Q_kW",
                    "F_out_kmol_h", "lambda_C", "lambda_H", "lambda_O"):
            if rel(high[key], twin[key]) > 1e-10:
                fails.append(f"(e) reformerHigh {key} {high[key]!r} != "
                             f"gibbs02 {twin[key]!r} -- a declared but ABSENT"
                             " solid moved the answer")

    with tempfile.TemporaryDirectory() as td:
        # (f) the refusal -------------------------------------------------
        probe = Path(td) / "directMin"
        shutil.copytree(CASE, probe, ignore=shutil.ignore_patterns(
            "converged", "reports", "design", "iterations"))
        fs = probe / "system/flowsheetDict"
        t = fs.read_text()
        t2 = t.replace("type        gibbsReactor;",
                       "type        gibbsReactor;\n        model       directMin;")
        fs.write_text(t2)
        rc3, out3, _ = run(probe)
        if rc3 == 0 or "publishes no element potentials" not in out3:
            fails.append(f"(f) directMin with a pure solid did not refuse by "
                         f"name (exit {rc3})")

        # (g) adiabatic ---------------------------------------------------
        probe = Path(td) / "adiabatic"
        shutil.copytree(CASE, probe, ignore=shutil.ignore_patterns(
            "converged", "reports", "design", "iterations"))
        fs = probe / "system/flowsheetDict"
        t = fs.read_text()
        t2 = t.replace("            T          1000.0 K;\n            P          1.0 bar;",
                       "            T          1000.0 K;\n            P          1.0 bar;\n"
                       "            mode       adiabatic;", 1)
        fs.write_text(t2)
        fl = probe / "0/feedLow"
        fl.write_text(fl.read_text().replace("T               1000 K;",
                                             "T               1300 K;"))
        rc4, out4, js4 = run(probe)
        if t2 == t or rc4 != 0 or js4 is None:
            fails.append(f"(g) the adiabatic probe did not run (exit {rc4})")
        else:
            k4 = js4["kpis"]["reformerLow"]
            res = js4.get("globalEnergyBoundary", {}).get("residual_kW", 1e9)
            if abs(res) > 1e-6:
                fails.append(f"(g) adiabatic plant residual {res} kW -- the"
                             " outer Newton balanced an enthalpy that is not"
                             " the one its outlet carries")
            if not (k4.get("n_solid_graphite_mol_s", 0) > 0
                    and abs(k4.get("activity_graphite", 0) - 1) < 1e-8):
                fails.append("(g) the adiabatic reformerLow lost its deposit"
                             f" (n = {k4.get('n_solid_graphite_mol_s')}, a = "
                             f"{k4.get('activity_graphite')})")

    if fails:
        print("gibbs-solid-phase: FAILED")
        for f in fails:
            print("  " + f)
        return 1
    print(f"gibbs-solid-phase: OK -- graphite APPEARS at S/C 0.8 "
          f"({low['n_solid_graphite_mol_s']:.6g} mol/s, a = 1) and is ABSENT at"
          f" S/C 3 (a = {high['activity_graphite']:.4g}); a reaction-based"
          " recomputation agrees to 1e-6, C/H/O close to 1e-7, both duties"
          " recompute on the solid rung, the absent solid leaves gibbs02's"
          " answer untouched, directMin refuses by name, and the adiabatic"
          " path closes its first law.  NOT checked: two solids at once,"
          " reactiveFlash with a solid, gibbsMap, real-gas fugacity.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
