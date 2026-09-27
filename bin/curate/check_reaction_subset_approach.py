#!/usr/bin/env python3
"""Gate: the temperature approach on `equilibriumReactor`, read per reaction.

    bin/curate/check_reaction_subset_approach.py

WHY THIS EXISTS.  `equilibriumReactor` equilibrates a DECLARED list of
reactions -- the reaction-subset level of equilibrium, where the list itself
is kinetic knowledge ("methanation is too slow to matter over this
catalyst").  Until 2026-09-27 it read no approach key at all, while
`gibbsReactor` had carried one since 2026-07-02.  Commission C11 gave it one,
on the SAME rule (Vitor, 2026-09-26: the case declares a MAGNITUDE, the
engine assigns the sign), read PER REACTION: a probe solve at the physical T
says which way each reaction RUNS from this feed, and the sign of
(extent x dH_rxn as written) is its thermicity as it runs.  Exothermic as it
runs -> Kp_j at T + |dT|; endothermic -> Kp_j at T - |dT|.  The rule has ONE
home, `src/unitOperations/reactor/TemperatureApproach.H`, which
`GibbsReactor::approachDirection` calls too.

WHAT THIS GATE CHECKS.

  (a) ABSENCE.  The shipped equil01 (no key) prints no approach line and
      publishes no `temperatureApproach_K` / `T_Kp_<name>`; the same case
      with `temperatureApproach 0;` declared produces the SAME output, byte
      for byte once the case path is neutralised.  An absence must go on
      meaning what it meant.  (Against a build of the PARENT commit the
      absent case was measured byte-identical on 2026-09-27, on every
      `gibbsReactor` / `equilibriumReactor` / `gibbsMap` case in the corpus;
      that one-time comparison needs two builds and is recorded in the
      record, not repeated here.)
  (b) THE SIGN, FORWARD.  equil01 + 10 K: `smr` runs forward and is
      endothermic -> T_Kp_smr = T - 10; `wgs` runs forward and is exothermic
      -> T_Kp_wgs = T + 10.  The sign of each dH_rxn is RECOMPUTED here from
      the case's own component records (sum nu dHf_298), not read off the
      engine's message; it is the 298 K sign and the gate says so -- for
      these two reactions the sign does not change up to 1100 K.
  (c) THE SIGN, BACKWARD -- the discriminating arm.  The same reactions on a
      CO2 + H2 feed both run BACKWARD, so as they run smr is exothermic
      (methanation) and wgs endothermic: T_Kp_smr = T + 10, T_Kp_wgs =
      T - 10.  A rule that read the sign "as written" passes (b) and fails
      here.  And the approach must SHRINK each backward extent.
  (d) THE OVERRIDE.  A reaction's own `temperatureApproach 0;` exempts it
      (T_Kp = T, and the run SAYS it is unshifted); a reaction's own 25 with
      no global value shifts that reaction alone and publishes no
      `temperatureApproach_K` (that KPI is the GLOBAL magnitude).
  (e) THE SHIFTED Kp IS Kp AT THE SHIFTED T, AND THE REACTOR STAYS AT T.
      equil01 run at operation T = 1090 K with no approach must report the
      same Kp_smr the approach run reports at T = 1100 K (1e-9 relative);
      the approach run's `T` KPI and its outlet stream T stay 1100.
  (f) REFUSALS.  A negative global value and a negative per-reaction value
      each REFUSE by name (exit != 0, the word MAGNITUDE, and -- for the
      per-reaction one -- the reaction's name).
  (g) ONE HOME FOR THE RULE (source arm).  Both reactors call
      `temperatureApproach::fromThermicity`; neither writes the sign rule
      itself (`? +1 : -1` outside TemperatureApproach.H, comments stripped).
  (h) THE WITNESS equil02_methanol_declared_pathways: `complete` (every
      independent reaction declared) reproduces the Gibbs reactor's outlet
      composition (1e-6 relative on every species above 1e-8); `declared`
      (methanation excluded) carries NO methane and at least 1e6 times the
      Gibbs reactor's methanol.  The difference is the exclusion, not the
      solver.
  (i) THE ANNOUNCEMENT REACHES THE CAVEAT BLOCK, not only its site.
  (j) A DECLARED REACTION THAT RUNS TO COMPLETION (added 2026-09-27, record
      docs/design/an-equilibrium-that-runs-to-completion.md).  The witness
      equil03_ammonia_oxidation_declared_pathways: `complete` reproduces the
      Gibbs outlet on EVERY species above 1e-30, the NH3 at ~6e-18 included
      (1e-6 relative); `declared` (the NO route alone) leaves the fed N2
      untouched, and its unconverted NH3 -- below the old solver's 1e-12
      interior floor and behind its subtraction -- is RECOMPUTED here from
      the declared equilibrium, 4 ln y_NH3 = 4 ln y_NO + 6 ln y_H2O
      - 5 ln y_O2 + ln(P/P0) - ln Kp, with Kp read off the run (1e-6).  An
      extent solver stalls on both reactors (measured: residuals 16.26 and
      69.77 at f5e5cf3f1).
  (k) A DEPENDENT SET REFUSES NAMING THE REACTION: equil03's complete list
      plus the NO route written twice over refuses, naming the doubled
      reaction as the one the earlier ones already span.  A regression guard,
      not a discriminator: the extent solver refused this set too, by the
      pivot of its Jacobian.
  (l) BEYOND A DOUBLE, SAID.  A built fixture (unsealed, catalogue records):
      2 C16H34 + 49 O2 <-> 32 CO2 + 34 H2O at 300 K, ln Kp ~ 8243.  The
      reactor must CONVERGE (it needs the step control on ln n: without it
      the first Newton step overshoots the products by orders of magnitude
      and the iteration ends on a singular Jacobian -- by-hand sabotage S4),
      publish the hexadecane as exactly 0 and ANNOUNCE its ln n (below the
      smallest double), and withhold the KPI Kp_burn while announcing its
      ln Kp.  No corpus case reaches either limit, which is why the fixture
      is built here rather than read from a witness.

A PURE SOLID IN A DECLARED SET (added 2026-09-27, commission C14 slice 2;
record docs/design/a-solid-in-a-declared-reaction-set.md).  The witness
equil04_reforming_carbon_declared_pathways (CH4 + H2O at S/C 1.0, 900 K,
1 bar) is held to an INDEPENDENT recomputation: the reaction-based route of
check_gibbs_solid_phase.py (three K's from the case's own records, nested
bisections on the extents, the carbon test a_C = K_crack p_CH4 / p_H2^2),
which shares no line of code with either reactor.
  (m) the COMPLETE set (reforming, shift, cracking) and the Gibbs reactor
      both reproduce the route on every species, graphite included (1e-6);
      the complete set deposits at activity 1 and says APPEARS.
  (n) the DECLARED set (Boudouard and cracking left out) carries no
      graphite, its gas is the route's SOLID-FREE equilibrium (1e-6), and
      its published activity_graphite is > 1 and equals the route's
      solid-free carbon activity (1e-6); the supersaturation is announced,
      and reaches the caveat block under the unit's name.
  (o) the solid on its SOLID rung: the complete set's Q_kW recomputed as
      H_out - H_in on the records, graphite by its NASA-7 solid Cp (1e-6);
      the plant first law closes (1e-6 kW).
  (p) C, H and O close on both equilibriumReactors, the deposit counted
      (1e-9).
  (q) THE ROUTE DOES NOT MATTER: Boudouard in place of cracking gives the
      same outlet (1e-9); all four together refuse, naming boudouard as the
      reaction the other three span.
  (r) A STEAM MARGIN: at S/C 3.0 the complete set leaves graphite ABSENT
      (said) and both equilibriumReactors publish the route's activity < 1.
  (s) NO ACTIVITY WITHOUT ELEMENT POTENTIALS: CO2 fed past a list that
      declares only reforming is an unequilibrated species, so the carbon
      activity would depend on the route; it is refused by name and not
      published.
  (t) ONE HOME (source arm): both reactors call pureSolidPhase::verdict,
      publishKpis and publishSolidFlow, and neither writes the verdict
      sentence or a solid KPI name itself.

  By-hand sabotages (2026-09-27, each restored by copy + touch + make; all
  seven CAUGHT, results as measured):
    S1 EquilibriumReactor.cpp: appearance threshold 1e10 (never appears)
       -> (m) every species off, graphite 0 against 1.506e-4 kmol/s, a =
          1.58 with nothing deposited; (o) Q 77.378 against 76.595.
    S2 PureSolidPhase.cpp: speciesEnthalpy prices the solid at 0
       -> (o) Q 75.139 against 76.595, plant residual -1.4565 kW.
    S3 EquilibriumReactor.cpp: the deposit not written to the outlet's s[]
       -> (m) graphite 0; (o) residual +1.4565 kW; (p) C in 6.944e-4 out
          5.439e-4 kmol/s.
    S4 EquilibriumReactor.cpp: the activity fit over the reacting species
       only (the unequilibrated CO2 left out)
       -> (s) activity 1.623 published for a route-dependent quantity.
    S5 PureSolidPhase.cpp: the solid's standard potential left out of ln K
       -> (m) no deposit (a = 0.398); (o); (r) activity 0.074 against 0.294.
    S6 GibbsReactor.cpp: F_solid_kmol_h written inline again
       -> (t) twice (no publishSolidFlow call; the literal).
    S7 EquilibriumReactor.cpp: the observer's activity withheld
       -> (n) activity None; (r) declared activity None.

WHAT THIS GATE DOES NOT COVER, stated so its green line cannot imply it.
It does not judge whether any approach magnitude is RIGHT for any bed (the
key is empirical, calibrated, never predicted).  It does not check a
COUPLED effect -- a shift on one reaction moves the others' extents, and the
engine says so rather than resolving it.  It does not cover an adiabatic
equilibriumReactor (there is none) nor any Kp beyond the ideal-gas rung.
And it reads the dH sign at 298 K, which is the reaction's sign at T only
where it does not change sign in between (true for both reactions used).

SABOTAGE-VERIFIED 2026-09-27; see the record
docs/design/a-declared-pathway-and-its-approach.md section 6 for the by-hand
sabotages and the output each produced.
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
BIN = ROOT / "build" / "linux64Gcc" / "choupoSolve"
SRC = ROOT / "src" / "unitOperations" / "reactor"
EQUIL01 = ROOT / "tutorials" / "steady" / "reactors" / "equil01_reforming"
EQUIL02 = (ROOT / "tutorials" / "steady" / "reactors"
           / "equil02_methanol_declared_pathways")
EQUIL03 = (ROOT / "tutorials" / "steady" / "reactors"
           / "equil03_ammonia_oxidation_declared_pathways")
EQUIL04 = (ROOT / "tutorials" / "steady" / "reactors"
           / "equil04_reforming_carbon_declared_pathways")
sys.path.insert(0, str(Path(__file__).resolve().parent))

OP_LINE = "operation   { T 1100 K; }"
fails = []


def run(case: Path, catalogue: bool = False):
    #  A sealed witness runs from its own constant/; an unsealed fixture
    #  (arm l) is TOLD where the catalogue is, never left to find one.
    env = dict(os.environ, CHOUPO_HOME=str(ROOT)) if catalogue else None
    p = subprocess.run([str(BIN)], cwd=str(case), capture_output=True,
                       text=True, timeout=600, env=env)
    out = p.stdout + p.stderr
    js = None
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  out, re.S)
    if m:
        try:
            js = json.loads(m.group(1))
        except json.JSONDecodeError:
            js = None
    return p.returncode, out, js


def fixture(td: str, name: str, src: Path = EQUIL01, fs=None, rxn=None,
            feed=None) -> Path:
    """Copy `src` to td/name and apply text edits (old, new) to its files.
    Every edit must land exactly once -- a probe that silently misses its
    dict runs the engine on the wrong question."""
    dst = Path(td) / name
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
        "converged", "reports", "iterations", "design"))
    for rel, edits in (("system/flowsheetDict", fs),
                       ("constant/reactions", rxn), ("0/feed", feed)):
        if not edits:
            continue
        f = dst / rel
        t = f.read_text()
        for old, new in edits:
            if t.count(old) != 1:
                raise SystemExit(f"check_reaction_subset_approach: the probe "
                                 f"'{name}' cannot find '{old}' exactly once "
                                 f"in {rel} -- the fixture is STALE")
            t = t.replace(old, new)
        f.write_text(t)
    return dst


def kpis(js, unit="reformer"):
    return ((js or {}).get("kpis") or {}).get(unit, {})


def close(a, b, rel):
    return abs(a - b) <= rel * max(abs(a), abs(b), 1e-300)


def dHf298(case: Path, comp: str) -> float:
    txt = (case / "constant" / "components" / f"{comp}.dat").read_text()
    m = re.search(r"dHf_298\s+([-+0-9.eE]+)", txt)
    if not m:
        raise SystemExit(f"check_reaction_subset_approach: {comp}.dat carries "
                         "no dHf_298 -- the sign cannot be recomputed")
    return float(m.group(1))


def reaction_sign_298(case: Path, rxn: str) -> int:
    """sign(sum nu dHf_298) from the case's OWN records: -1 exo, +1 endo."""
    lib = (case / "constant" / "reactions").read_text()
    m = re.search(rxn + r"\s*(//[^\n]*)?\n\{(.*?)\n\}", lib, re.S)
    if not m:
        raise SystemExit(f"check_reaction_subset_approach: reaction '{rxn}' "
                         "not found in the fixture's constant/reactions")
    dH = 0.0
    for comp, nu in re.findall(r"component\s+(\w+);\s*nu\s+([-+0-9.]+);",
                               m.group(2)):
        dH += float(nu) * dHf298(case, comp)
    return -1 if dH < 0 else +1


def neutral(out: str, path: Path) -> str:
    return out.replace(str(path), "CASE")


# ---- (m)-(r): the pure solid in a declared set (C14 slice 2) ---------------
def outlet_moles(streams, name):
    """kmol/s of every species in a stream, FLUID AND SOLID (the result
    JSON's F and composition are the overall material incl. solids)."""
    st = streams.get(name) or {}
    return {c: st.get("F", 0.0) * x for c, x in
            (st.get("composition") or {}).items()}


def carbon_arms(td: str) -> None:
    import check_gibbs_solid_phase as gsp
    sp = {k: gsp.Gas(k, EQUIL04) for k in gsp.GASES}
    gr = gsp.Graphite(EQUIL04)
    T, P_BAR, SC = 900.0, 1.0, 1.0

    cw = Path(td) / "carbon"
    shutil.copytree(EQUIL04, cw, ignore=shutil.ignore_patterns(
        "converged", "reports", "iterations", "design"))
    rc, out, js = run(cw)
    if rc != 0 or js is None:
        err = re.findall(r"ERROR:.*", out)
        fails.append(f"(m) the witness equil04 did not run (exit {rc}"
                     f"{': ' + err[-1][:160] if err else ''})")
        return
    S = js.get("streams") or {}
    K = js.get("kpis") or {}
    n_ref, aC0 = gsp.reaction_route(sp, gr, T, P_BAR, SC)
    n_free, _ = gsp.reaction_route(sp, gr, T, P_BAR, SC, solid_free=True)
    species = gsp.GASES + ("graphite",)

    # (m) complete set == Gibbs == the reaction route, graphite included.
    for unit, fin, fout in (("complete", "feedComplete", "outComplete"),
                            ("gibbs", "feedGibbs", "outGibbs")):
        ch4 = outlet_moles(S, fin).get("CH4", 0.0)
        got = outlet_moles(S, fout)
        for c in species:
            ref = n_ref[c] * ch4
            if not close(got.get(c, -1.0), ref, 1e-6):
                fails.append(f"(m) {unit} {c}: {got.get(c)} kmol/s, the "
                             f"reaction route gives {ref}")
    kc = K.get("complete", {})
    if not (kc.get("n_solid_graphite_mol_s", 0.0) > 0.0
            and close(kc.get("activity_graphite", 0.0), 1.0, 1e-12)):
        fails.append("(m) the complete set did not deposit graphite at "
                     f"activity 1 (n = {kc.get('n_solid_graphite_mol_s')}, "
                     f"a = {kc.get('activity_graphite')})")
    if not ("[equilibriumReactor] pure solid phase 'graphite': activity in "
            "the solid-free equilibrium" in out and "APPEARS" in out):
        fails.append("(m) the complete set did not announce graphite APPEARS")

    # (n) the declared set: NO carbon, the solid-free gas, and a > 1 said.
    kd = K.get("declared", {})
    god = outlet_moles(S, "outDeclared")
    ch4d = outlet_moles(S, "feedDeclared").get("CH4", 0.0)
    if god.get("graphite", -1.0) != 0.0 or kd.get("n_solid_graphite_mol_s") != 0.0 \
            or "solids" in (S.get("outDeclared") or {}):
        fails.append("(n) the declared set (Boudouard and cracking left out) "
                     "carries graphite")
    for c in gsp.GASES:
        if not close(god.get(c, -1.0), n_free[c] * ch4d, 1e-6):
            fails.append(f"(n) declared {c}: {god.get(c)} kmol/s, the "
                         f"solid-free route gives {n_free[c] * ch4d}")
    a_d = kd.get("activity_graphite")
    if a_d is None or not a_d > 1.0 or not close(a_d, aC0, 1e-6):
        fails.append(f"(n) the declared outlet's carbon activity is {a_d}; "
                     f"the solid-free route gives {aC0} (must be > 1 here)")
    if "SUPERSATURATED in it -- a metastable state the declared reaction " \
            "list ASSERTS" not in out:
        fails.append("(n) the declared set's supersaturation was not announced")
    tail = out.split("ASSUMPTIONS AND CAVEATS", 1)
    if len(tail) < 2 or "equilibriumReactor declared: pure solid phase " \
            "'graphite'" not in tail[1]:
        fails.append("(n) the declared set's carbon verdict did not reach the "
                     "caveat block under the unit's name")

    # (o) the solid on its SOLID rung: the complete duty recomputed on the
    #     records, and the plant first law.
    ch4 = outlet_moles(S, "feedComplete").get("CH4", 0.0) * 1000.0   # mol/s
    H_in = sp["CH4"].h(T) + SC * sp["water"].h(T)
    H_out = sum(n_ref[c] * sp[c].h(T) for c in gsp.GASES) \
        + n_ref["graphite"] * gr.h(T)
    Q = (H_out - H_in) * ch4 / 1000.0
    if not close(kc.get("Q_kW", 0.0), Q, 1e-6):
        fails.append(f"(o) complete Q_kW {kc.get('Q_kW')}, recomputed on the "
                     f"records {Q} (graphite on its solid rung)")
    res = (js.get("globalEnergyBoundary") or {}).get("residual_kW", 1e9)
    if abs(res) > 1e-6:
        fails.append(f"(o) plant first-law residual {res} kW")

    # (p) C/H/O close on each equilibriumReactor, the deposit counted.
    atoms = {"CH4": (1, 4, 0), "water": (0, 2, 1), "CO": (1, 0, 1),
             "CO2": (1, 0, 2), "H2": (0, 2, 0), "graphite": (1, 0, 0)}
    for unit, fin, fout in (("complete", "feedComplete", "outComplete"),
                            ("declared", "feedDeclared", "outDeclared")):
        e = []
        for nm in (fin, fout):
            m = outlet_moles(S, nm)
            e.append([sum(m.get(c, 0.0) * atoms[c][j] for c in atoms)
                      for j in range(3)])
        for j, el in enumerate("CHO"):
            if not close(e[1][j], e[0][j], 1e-9):
                fails.append(f"(p) {unit}: element {el} in {e[0][j]} out "
                             f"{e[1][j]} kmol/s")

    CR = "reactions   ( steamReforming waterGasShift methaneCracking );"
    # (q) the route does not matter: Boudouard in place of cracking gives the
    #     same outlet; all four together refuse, naming Boudouard.
    cb = fixture(td, "boudouard", src=EQUIL04, fs=[(CR,
                 "reactions   ( steamReforming waterGasShift boudouard );")])
    rcb, outb, jsb = run(cb)
    if rcb != 0:
        fails.append(f"(q) the Boudouard route did not run (exit {rcb})")
    else:
        gb = outlet_moles((jsb or {}).get("streams") or {}, "outComplete")
        got = outlet_moles(S, "outComplete")
        for c in species:
            if not close(gb.get(c, -1.0), got.get(c, -2.0), 1e-9):
                fails.append(f"(q) {c}: Boudouard route {gb.get(c)}, "
                             f"cracking route {got.get(c)}")
    c4 = fixture(td, "allFour", src=EQUIL04, fs=[(CR,
                 "reactions   ( steamReforming waterGasShift methaneCracking "
                 "boudouard );")])
    rc4, out4, _ = run(c4)
    if rc4 == 0 or "LINEARLY DEPENDENT" not in out4 \
            or "reaction 'boudouard'" not in out4:
        fails.append(f"(q) all four reactions were not refused naming "
                     f"boudouard (exit {rc4})")

    # (r) a steam margin: S/C 3.  The complete set's graphite is ABSENT, at
    #     the activity the reaction route gives, and the declared set's
    #     observer reads the same number (the gas is fully equilibrated).
    c3 = fixture(td, "sc3", src=EQUIL04, feed=[("    water    10.0 kmol/h;",
                                               "    water    30.0 kmol/h;")])
    rc3, out3, js3 = run(c3)
    if rc3 != 0:
        fails.append(f"(r) the S/C 3 probe did not run (exit {rc3})")
    else:
        _, a3 = gsp.reaction_route(sp, gr, T, P_BAR, 3.0)
        k3 = (js3 or {}).get("kpis") or {}
        for unit in ("complete", "declared"):
            a = k3.get(unit, {}).get("activity_graphite")
            if a is None or not a < 1.0 or not close(a, a3, 1e-6):
                fails.append(f"(r) {unit} at S/C 3: activity {a}, the route "
                             f"gives {a3} (< 1)")
            if k3.get(unit, {}).get("n_solid_graphite_mol_s") != 0.0:
                fails.append(f"(r) {unit} deposits graphite at S/C 3")
        if "the solid is ABSENT (n = 0)" not in out3:
            fails.append("(r) the complete set's ABSENT verdict was not said")

    # (s) a gas NOT fully equilibrated has no carbon activity: CO2 fed past a
    #     list that declares no reaction touching it (the shift left out) is
    #     an unequilibrated species, so the carbon activity depends on the
    #     route and is refused by name and not published.  (Reforming alone
    #     on a CH4 + H2O feed is NOT such a case: CO2 is then absent, and
    #     reforming is the complete set for the four species present.)
    cs = fixture(td, "noShift", src=EQUIL04, fs=[(
        "reactions   ( steamReforming waterGasShift );",
        "reactions   ( steamReforming );")],
        feed=[("    water    10.0 kmol/h;",
               "    water    10.0 kmol/h;\n    CO2       2.0 kmol/h;")])
    rcs, outs, jss = run(cs)
    ks = (((jss or {}).get("kpis") or {}).get("declared") or {})
    if rcs != 0 or "activity_graphite" in ks \
            or "not in complete internal equilibrium" not in outs:
        fails.append(f"(s) a declared set that leaves a fluid pathway closed "
                     f"did not withhold the carbon activity by name (exit "
                     f"{rcs}, published {ks.get('activity_graphite')})")

    # (t) ONE HOME (source arm): both reactors say the verdict and publish the
    #     KPIs through PureSolidPhase.H; neither writes the sentence itself.
    for f in ("GibbsReactor.cpp", "EquilibriumReactor.cpp"):
        src = re.sub(r"//[^\n]*", "", re.sub(r"/\*.*?\*/", "",
                     (SRC / f).read_text(), flags=re.S))
        if "pureSolidPhase::verdict" not in src \
                or "pureSolidPhase::publishKpis" not in src \
                or "pureSolidPhase::publishSolidFlow" not in src:
            fails.append(f"(t) {f} does not speak through pureSolidPhase::"
                         "verdict / publishKpis -- a second home for them")
        for literal in ("the solid APPEARS", '"n_solid_"', '"activity_"',
                        '"F_solid_kmol_h"'):
            if literal in src:
                fails.append(f"(t) {f} writes {literal} itself -- the verdict "
                             "and the KPI names have one home, PureSolidPhase")


def main() -> int:
    if not BIN.exists():
        print(f"check_reaction_subset_approach: FAILED -- no engine at {BIN} "
              "(run `make all`); a check that cannot run must not pass")
        return 1
    T = 1100.0
    with tempfile.TemporaryDirectory() as td:
        # ---- (a) absence ------------------------------------------------
        c0 = fixture(td, "absent")
        rc0, out0, js0 = run(c0)
        cz = fixture(td, "zero", fs=[(OP_LINE,
                     "operation   { T 1100 K; temperatureApproach 0; }")])
        rcz, outz, jsz = run(cz)
        if rc0 != 0 or rcz != 0:
            fails.append(f"(a) equil01 did not run (exit {rc0} / {rcz})")
        else:
            k0 = kpis(js0)
            if "[equilibriumReactor] temperatureApproach" in out0:
                fails.append("(a) the case declares NO approach, yet the run "
                             "announced one -- an absence stopped meaning "
                             "what it meant")
            leaked = [k for k in k0 if k == "temperatureApproach_K"
                      or k.startswith("T_Kp_")]
            if leaked:
                fails.append(f"(a) no approach declared, yet the run "
                             f"published {leaked}")
            if neutral(out0, c0) != neutral(outz, cz):
                fails.append("(a) `temperatureApproach 0;` changed the "
                             "output -- a declared zero must be the true "
                             "equilibrium, byte for byte")

        # ---- (b) forward sign -------------------------------------------
        cf = fixture(td, "fwd", fs=[(OP_LINE,
                     "operation   { T 1100 K; temperatureApproach 10; }")])
        rcf, outf, jsf = run(cf)
        kf = kpis(jsf)
        if rcf != 0:
            fails.append(f"(b) equil01 + 10 K did not run (exit {rcf})")
        else:
            for rxn in ("smr", "wgs"):
                s298 = reaction_sign_298(cf, rxn)          # -1 exo, +1 endo
                x = kf.get(f"extent_{rxn}_kmol_h", 0.0)
                runs = 1 if x > 0 else -1
                want = T + (+10.0 if s298 * runs < 0 else -10.0)
                got = kf.get(f"T_Kp_{rxn}")
                if got is None or not close(got, want, 1e-12):
                    fails.append(f"(b) reaction '{rxn}' runs "
                                 f"{'forward' if runs > 0 else 'backward'} and "
                                 f"is {'exo' if s298 < 0 else 'endo'}thermic as "
                                 f"written (recomputed from dHf_298), so its Kp "
                                 f"belongs at {want} K; the engine published "
                                 f"T_Kp_{rxn} = {got}")
            if not close(kf.get("temperatureApproach_K", -1.0), 10.0, 1e-12):
                fails.append("(b) temperatureApproach_K is not the declared "
                             f"global magnitude 10 (got "
                             f"{kf.get('temperatureApproach_K')})")

        # ---- (c) backward sign ------------------------------------------
        cb = fixture(td, "back",
                     fs=[(OP_LINE,
                          "operation   { T 1100 K; temperatureApproach 10; }")],
                     feed=[("    CH4    1.0 kmol/h;", "    CO2    1.0 kmol/h;"),
                           ("    water    3.0 kmol/h;", "    H2    1.0 kmol/h;")])
        cb0 = fixture(td, "back0",
                      feed=[("    CH4    1.0 kmol/h;", "    CO2    1.0 kmol/h;"),
                            ("    water    3.0 kmol/h;", "    H2    1.0 kmol/h;")])
        rcb, outb, jsb = run(cb)
        rcb0, _, jsb0 = run(cb0)
        kb, kb0 = kpis(jsb), kpis(jsb0)
        if rcb != 0 or rcb0 != 0:
            fails.append(f"(c) the CO2 + H2 probe did not run "
                         f"(exit {rcb} / {rcb0})")
        else:
            for rxn in ("smr", "wgs"):
                x0 = kb0.get(f"extent_{rxn}_kmol_h", 0.0)
                if not x0 < 0:
                    fails.append(f"(c) the probe is STALE: '{rxn}' no longer "
                                 f"runs backward from a CO2 + H2 feed "
                                 f"(extent {x0}), so it cannot tell 'as it "
                                 "runs' from 'as written'")
                    continue
                s298 = reaction_sign_298(cb, rxn)
                want = T + (+10.0 if s298 * (-1) < 0 else -10.0)
                got = kb.get(f"T_Kp_{rxn}")
                if got is None or not close(got, want, 1e-12):
                    fails.append(f"(c) reaction '{rxn}' runs BACKWARD from this "
                                 f"feed, so its thermicity AS IT RUNS is the "
                                 f"opposite of as written and its Kp belongs "
                                 f"at {want} K; the engine published "
                                 f"T_Kp_{rxn} = {got}")
                x = kb.get(f"extent_{rxn}_kmol_h", 0.0)
                if not abs(x) < abs(x0):
                    fails.append(f"(c) the approach did not SHRINK '{rxn}''s "
                                 f"backward extent ({x0} -> {x}): it moved the "
                                 "answer PAST equilibrium")

        # ---- (d) per-reaction override ----------------------------------
        cx = fixture(td, "exempt",
                     fs=[(OP_LINE,
                          "operation   { T 1100 K; temperatureApproach 10; }")],
                     rxn=[("wgs                     // water-gas shift: CO + H2O <-> CO2 + H2\n{",
                           "wgs                     // water-gas shift: CO + H2O <-> CO2 + H2\n{\n    temperatureApproach 0;")])
        rcx, outx, jsx = run(cx)
        kx = kpis(jsx)
        if rcx != 0:
            fails.append(f"(d) the exemption probe did not run (exit {rcx})")
        else:
            if not close(kx.get("T_Kp_wgs", -1.0), T, 1e-12):
                fails.append(f"(d) `temperatureApproach 0;` on reaction 'wgs' "
                             f"did not exempt it (T_Kp_wgs = "
                             f"{kx.get('T_Kp_wgs')})")
            if "reaction 'wgs': no approach" not in outx:
                fails.append("(d) an exempt reaction beside a shifted one was "
                             "not SAID to be unshifted")
            if not close(kx.get("T_Kp_smr", -1.0), T - 10.0, 1e-12):
                fails.append("(d) exempting wgs moved smr's evaluation T "
                             f"(T_Kp_smr = {kx.get('T_Kp_smr')})")
        co = fixture(td, "own25",
                     rxn=[("wgs                     // water-gas shift: CO + H2O <-> CO2 + H2\n{",
                           "wgs                     // water-gas shift: CO + H2O <-> CO2 + H2\n{\n    temperatureApproach 25;")])
        rco, outo, jso = run(co)
        ko = kpis(jso)
        if rco != 0:
            fails.append(f"(d) the per-reaction probe did not run (exit {rco})")
        else:
            if not close(ko.get("T_Kp_wgs", -1.0), T + 25.0, 1e-12):
                fails.append(f"(d) reaction 'wgs' declares its own 25 K and is "
                             f"exothermic as it runs, so its Kp belongs at "
                             f"{T + 25} K; got T_Kp_wgs = {ko.get('T_Kp_wgs')}")
            if not close(ko.get("T_Kp_smr", -1.0), T, 1e-12):
                fails.append("(d) a per-reaction value leaked onto another "
                             f"reaction (T_Kp_smr = {ko.get('T_Kp_smr')})")
            if "temperatureApproach_K" in ko:
                fails.append("(d) no GLOBAL approach was declared, yet "
                             "temperatureApproach_K was published "
                             f"({ko['temperatureApproach_K']})")

        # ---- (e) Kp at the shifted T; the reactor stays at T -------------
        c1090 = fixture(td, "at1090", fs=[(OP_LINE, "operation   { T 1090 K; }")])
        rc1090, _, js1090 = run(c1090)
        k1090 = kpis(js1090)
        if rc1090 != 0 or rcf != 0:
            fails.append("(e) could not run the 1090 K comparison")
        else:
            if not close(kf.get("Kp_smr", 0.0), k1090.get("Kp_smr", -1.0), 1e-9):
                fails.append(f"(e) Kp_smr under a 10 K approach at 1100 K "
                             f"({kf.get('Kp_smr')}) is not Kp_smr at 1090 K "
                             f"({k1090.get('Kp_smr')}) -- the shifted Kp is "
                             "not the Kp of the shifted temperature")
            if not close(kf.get("T", 0.0), T, 1e-12):
                fails.append(f"(e) the reactor's T KPI moved to {kf.get('T')}: "
                             "an approach shifts Kp only")
            st = ((jsf or {}).get("streams") or {}).get("syngas", {})
            if not close(st.get("T", 0.0), T, 1e-12):
                fails.append(f"(e) the outlet stream left at {st.get('T')} K, "
                             "not at the physical T")

        # ---- (f) refusals -------------------------------------------------
        cn = fixture(td, "neg", fs=[(OP_LINE,
                     "operation   { T 1100 K; temperatureApproach -10; }")])
        rcn, outn, _ = run(cn)
        if rcn == 0 or "MAGNITUDE" not in outn \
                or "'temperatureApproach' in operation{}" not in outn:
            fails.append(f"(f) a negative GLOBAL approach was not refused by "
                         f"name (exit {rcn})")
        cr = fixture(td, "negr",
                     rxn=[("smr                     // steam-methane reforming: CH4 + H2O <-> CO + 3 H2\n{",
                           "smr                     // steam-methane reforming: CH4 + H2O <-> CO + 3 H2\n{\n    temperatureApproach -5;")])
        rcr, outr, _ = run(cr)
        if rcr == 0 or "MAGNITUDE" not in outr or "on reaction 'smr'" not in outr:
            fails.append(f"(f) a negative PER-REACTION approach was not "
                         f"refused naming the reaction (exit {rcr})")

        # ---- (i) the caveat block -----------------------------------------
        if rcf == 0:
            tail = outf.split("ASSUMPTIONS AND CAVEATS", 1)
            if len(tail) < 2 or "temperatureApproach 10 K on reaction 'smr'" \
                    not in tail[1].split("<<<Choupo:result-begin>>>")[0]:
                fails.append("(i) the per-reaction announcement did not reach "
                             "the end-of-run ASSUMPTIONS AND CAVEATS block")

        # ---- (h) the witness ----------------------------------------------
        cw = Path(td) / "witness"
        shutil.copytree(EQUIL02, cw, ignore=shutil.ignore_patterns(
            "converged", "reports", "iterations", "design"))
        rcw, outw, jsw = run(cw)
        if rcw != 0:
            fails.append(f"(h) the witness equil02 did not run (exit {rcw})")
        else:
            streams = (jsw or {}).get("streams") or {}
            zg = (streams.get("outGibbs") or {}).get("composition", {})
            zc = (streams.get("outComplete") or {}).get("composition", {})
            zd = (streams.get("outDeclared") or {}).get("composition", {})
            for sp, yg in zg.items():
                if yg > 1e-8 and not close(yg, zc.get(sp, -1.0), 1e-6):
                    fails.append(f"(h) the COMPLETE reaction set does not "
                                 f"reproduce the Gibbs reactor on {sp} "
                                 f"({zc.get(sp)} vs {yg})")
            if zd.get("CH4", 1.0) != 0.0:
                fails.append(f"(h) the declared list excludes methanation, "
                             f"yet the outlet carries CH4 = {zd.get('CH4')}")
            if not zd.get("methanol", 0.0) > 1e6 * zg.get("methanol", 1.0):
                fails.append("(h) the declared list does not make methanol "
                             f"where Gibbs does not ({zd.get('methanol')} vs "
                             f"{zg.get('methanol')})")

        # ---- (j) a declared reaction that runs to completion --------------
        co = Path(td) / "ostwald"
        shutil.copytree(EQUIL03, co, ignore=shutil.ignore_patterns(
            "converged", "reports", "iterations", "design"))
        rco3, outo, jso = run(co)
        if rco3 != 0:
            err = re.findall(r"ERROR:.*", outo)
            fails.append(f"(j) the witness equil03 did not run (exit {rco3}"
                         f"{': ' + err[-1][:120] if err else ''})")
        else:
            streams = (jso or {}).get("streams") or {}
            zg = (streams.get("outGibbs") or {}).get("composition", {})
            zc = (streams.get("outComplete") or {}).get("composition", {})
            zd = (streams.get("outDeclared") or {}).get("composition", {})
            for sp, yg in zg.items():
                if yg > 1e-30 and not close(yg, zc.get(sp, -1.0), 1e-6):
                    fails.append(f"(j) the COMPLETE set does not reproduce the "
                                 f"Gibbs reactor on {sp} ({zc.get(sp)} vs {yg})")
            if not 0.0 < zg.get("NH3", 0.0) < 1e-15:
                fails.append(f"(j) the probe is STALE: Gibbs NH3 is "
                             f"{zg.get('NH3')}, no longer a deep trace")
            fd = streams.get("feedDeclared") or {}
            od = streams.get("outDeclared") or {}
            n2_in = fd.get("F", 0.0) * (fd.get("composition") or {}).get("N2", 0.0)
            n2_out = od.get("F", 0.0) * zd.get("N2", 0.0)
            if not close(n2_in, n2_out, 1e-9):
                fails.append(f"(j) the declared list excludes the N2 route, "
                             f"yet N2 moved ({n2_in} -> {n2_out} kmol/s)")
            Kp = kpis(jso, "declared").get("Kp_ammoniaToNO")
            P = (od.get("P") or 0.0) / 1.0e5
            if not (Kp and P and all(zd.get(k, 0.0) > 0.0
                                     for k in ("NH3", "NO", "water", "O2"))):
                fails.append(f"(j) the declared outlet cannot be recomputed "
                             f"(Kp {Kp}, P {P}, y {zd})")
            else:
                y_nh3 = math.exp((4 * math.log(zd["NO"])
                                  + 6 * math.log(zd["water"])
                                  - 5 * math.log(zd["O2"]) + math.log(P)
                                  - math.log(Kp)) / 4.0)
                if not close(y_nh3, zd["NH3"], 1e-6):
                    fails.append(f"(j) the declared NH3 ({zd['NH3']}) is not "
                                 f"the declared equilibrium's ({y_nh3})")
                if not zd["NH3"] < 1e-12:
                    fails.append(f"(j) the probe is STALE: declared NH3 "
                                 f"{zd['NH3']} is no longer below the old "
                                 f"1e-12 floor")

        # ---- (k) a dependent set refuses naming the reaction --------------
        twice = ("ammoniaToNOtwice\n{\n    stoichiometry\n    (\n"
                 "        { component NH3;    nu -8; }\n"
                 "        { component O2;     nu -10; }\n"
                 "        { component NO;     nu  8; }\n"
                 "        { component water;  nu  12; }\n    );\n}\n\n")
        cd = fixture(td, "dependent", src=EQUIL03,
                     fs=[("reactions   ( ammoniaToNO ammoniaToN2 );",
                          "reactions   ( ammoniaToNO ammoniaToN2 "
                          "ammoniaToNOtwice );")],
                     rxn=[("ammoniaToN2             // 4 NH3 + 3 O2",
                           twice + "ammoniaToN2             // 4 NH3 + 3 O2")])
        rcd, outd, _ = run(cd)
        if rcd == 0 or "LINEARLY DEPENDENT" not in outd \
                or "reaction 'ammoniaToNOtwice'" not in outd:
            fails.append(f"(k) a dependent declared set was not refused naming "
                         f"the redundant reaction (exit {rcd})")

        # ---- (l) beyond a double, said -----------------------------------
        cl = Path(td) / "beyondDouble"
        for sub in ("system", "constant", "0"):
            (cl / sub).mkdir(parents=True)
        (cl / "system" / "controlDict").write_text(
            "application choupoSolve;\ndescription \"gate fixture\";\n"
            "verbosity 3;\n")
        (cl / "constant" / "thermoPhysPropDict").write_text(
            "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
            "components ( nHexadecane O2 N2 CO2 water );\n"
            "equilibrium { formulation gammaPhi;\n"
            "  liquid { activityModel ideal; standardState pureLiquid; }\n"
            "  vapour { fugacityModel idealGas; } }\n")
        (cl / "constant" / "reactions").write_text(
            "burn { stoichiometry ( { component nHexadecane; nu -2; }\n"
            "  { component O2; nu -49; } { component CO2; nu 32; }\n"
            "  { component water; nu 34; } ); }\n")
        (cl / "system" / "flowsheetDict").write_text(
            "units ( { name burner; type equilibriumReactor; in feed;\n"
            "  outputs ( out ); operation { T 300 K; }\n"
            "  reactions ( burn ); } );\n")
        state = ("componentMolarFlows { nHexadecane 1.0 kmol/h; O2 30 kmol/h;"
                 " N2 70 kmol/h; }\nT 300 K;\nP 1 bar;\nphase gas;\n")
        (cl / "0" / "feed").write_text(state)
        (cl / "0" / "out").write_text(state)
        rcl, outl, jsl = run(cl, catalogue=True)
        if rcl != 0:
            err = re.findall(r"ERROR:.*", outl)
            fails.append(f"(l) the ln Kp ~ 8243 fixture did not converge "
                         f"(exit {rcl}{': ' + err[-1][:120] if err else ''})")
        else:
            kl = kpis(jsl, "burner")
            zl = (((jsl or {}).get("streams") or {}).get("out") or {}) \
                .get("composition", {})
            if not re.search(r"species 'nHexadecane' is at ln n = -\d+", outl):
                fails.append("(l) the hexadecane below the smallest double "
                             "was not announced with its ln n")
            if zl.get("nHexadecane", -1.0) != 0.0:
                fails.append(f"(l) the hexadecane was published as "
                             f"{zl.get('nHexadecane')}, not as exactly 0")
            if "Kp_burn" in kl:
                fails.append(f"(l) Kp_burn was published ({kl['Kp_burn']}) "
                             f"although a double cannot carry it")
            if "KPI Kp_burn is not published" not in outl:
                fails.append("(l) the withheld Kp_burn was not announced")

        # ---- (m)-(r) a pure solid in a declared set (C14 slice 2) ---------
        carbon_arms(td)

    # ---- (g) one home for the rule (source arm) ----------------------------
    def code(path: Path) -> str:
        t = path.read_text()
        t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
        return re.sub(r"//[^\n]*", "", t)
    rule_home = SRC / "TemperatureApproach.H"
    if "fromThermicity" not in code(rule_home):
        fails.append("(g) TemperatureApproach.H no longer defines fromThermicity")
    for f in ("GibbsReactor.cpp", "EquilibriumReactor.cpp"):
        c = code(SRC / f)
        if "temperatureApproach::fromThermicity" not in c:
            fails.append(f"(g) {f} does not call temperatureApproach::"
                         "fromThermicity -- the sign rule has a second home")
        if re.search(r"\?\s*\+1\s*:\s*-1", c):
            fails.append(f"(g) {f} writes the sign rule itself "
                         "(`? +1 : -1`) -- a second home for it")

    if fails:
        print("check_reaction_subset_approach: FAILED")
        for f in fails:
            print("  " + f)
        return 1
    print("check_reaction_subset_approach: OK -- equilibriumReactor's "
          "temperatureApproach: absent and declared-0 runs identical; per "
          "reaction the sign follows the thermicity AS IT RUNS (forward "
          "smr at T-10, wgs at T+10; backward both flipped, extents shrink); "
          "a reaction's own value overrides (0 exempts, said); the shifted "
          "Kp is Kp at the shifted T and the reactor stays at T; negative "
          "values refused by name, globally and per reaction; the rule has "
          "one home (both reactors call it); the announcement reaches the "
          "caveat block; equil02's complete set reproduces the Gibbs "
          "reactor and the declared subset makes methanol and no methane; "
          "equil03's complete set reproduces the Gibbs reactor down to its "
          "NH3 at ~6e-18, and the declared NO route's unconverted NH3 "
          "(below 1e-12) is the declared equilibrium recomputed by hand; a "
          "dependent set refuses naming the redundant reaction; a "
          "ln Kp ~ 8243 fixture converges and SAYS what a double cannot "
          "carry (its ln n, its ln Kp); equil04's complete set deposits "
          "graphite and reproduces the Gibbs reactor and an independent "
          "reaction route (gas and solid, 1e-6), its declared set (carbon "
          "routes left out) forms none and publishes the route's carbon "
          "activity > 1, the solid is priced on its solid rung (duty and "
          "plant first law), C/H/O close, Boudouard and cracking give one "
          "answer and all four refuse, S/C 3 leaves it absent, a gas with "
          "an unequilibrated species gets no activity, and both reactors "
          "speak through PureSolidPhase.  "
          "NOT checked: whether any magnitude is right for a bed, coupled "
          "effects, adiabatic operation, non-ideal Kp, two solids at once, "
          "a solid in the feed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
