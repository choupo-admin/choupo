#!/usr/bin/env python3
# =============================================================================
#        \|/       C hemicals     | Open-source, glass-box chemical process simulator
#       \\|//      H eat-transfer | https://choupo.org
#      \\\|///     O perations    |
#       \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
#        \|/       P roperties    | Licence: GPL-3.0-or-later
#         |        O ptimization  |
#        /|\                      |
# -----------------------------------------------------------------------------
#     SPDX-License-Identifier: GPL-3.0-or-later
#     Credit and attribution: see AUTHORS
#     Required legal notices:  see NOTICE
# =============================================================================
"""check_flash_specification -- a flash specified by (P,H), (P,S), (T,V/F) or
(P,V/F) from ONE home (DEV.md 4c C214 W1, 2026-11-03;
src/unitOperations/flash/SpecifiedFlash.{H,cpp}, the `flashSpec` props op;
record docs/design/a-general-flash-specification.md).

The gate holds, from runs it performs itself:

  (a) ROUND TRIP AGAINST THE ISOTHERMAL FLASH.  On three corpus mixtures --
      flash01 (benzene/toluene, ideal), flash02 (ethanol/water, NRTL: the
      excess entropy is live) and flash09 (N2/CH4, SRK with a fitted kij)
      -- on a COPY of each case's sealed constant/: a state (T0, P0) is
      flashed, its H and S priced, and (P0, H0) and (P0, S0) must recover T0
      to 1e-8 relative.  On each two-phase state the flash's own V/F0 is then
      specified back: (P0, V/F0) must recover T0 and (T0, V/F0) must recover
      P0, both to 1e-8 relative.  Single-phase liquid and vapour states are
      in the set, so both sides of the band are crossed.
  (b) THE BAND EDGE IS THE FLASH'S: on flash01 (P, V/F = 0) and (P, V/F = 1)
      give Tb and Td; the isothermal flash at Tb(1 - 1e-7) carries no vapour
      and at Tb(1 + 1e-7) some; at Td(1 - 1e-7) some liquid and at
      Td(1 + 1e-7) none.  And Tb < T0 < Td for the two-phase state.
  (c) THE WITNESS IS THE STEAM TABLE: flashSpec01's isentropic expansion
      (80 bar / 500 C -> 0.1 bar) lands on the saturation PLATEAU with the
      quality 0.8102 +- 5e-4, h 2129.8 +- 1 kJ/kg and Tsat 318.96 +- 0.02 K
      (IAPWS-IF97 table values, read by hand -- its header shows the
      arithmetic), its entropy equal to the inlet's to 1e-9; the throttle's
      flash fraction 0.147 +- 1e-3; Tsat(1 atm) 373.124 +- 1e-3 K;
      Psat(373.15 K) 101418 +- 5 Pa.  The witness's golden is held too.
  (d) EACH REFUSAL FIRES BY NAME: an unknown pair word; a target the window
      cannot reach; a vapour fraction specified on water above its critical
      point; the specified value given twice; the pair's UNKNOWN declared;
      a vapour fraction outside [0, 1]; a search starved of iterations (the
      verdict refuses -- the unconverged state is NOT published); an entropy
      asked of an electrolyte package (evaporator07's eNRTL brine) -- while a (P, H)
      specification on that same package answers, its S withheld and said.
  (e) THE VERDICT IS CONVERGENCE.H'S: every run announces its controls
      (`[convergence] flashSpec.<pair>: DEFAULT controls`) and names the
      criterion that decided (the degenerate one-equation case, raw).
  (f) SOURCE: SpecifiedFlash.cpp reaches the flash only through
      `flashDiscardingSupercriticalSplit` (never `solveCore` directly), and
      carries no Rachford-Rice, no stability test and exactly ONE `Kvec(`
      (the pure saturation curve, ln K = 0) -- the one-flash-home rule no
      output arm can see from a number that happens to agree.
  (g) THE ENTROPY IS THE ENTHALPY'S PARTNER -- the arm that exists because
      (a) CANNOT see a wrong entropy (the search and its reference share one
      surface, so a consistent error inverts perfectly; S1 below proves it):
      dH = T dS single-phase, the ideal mixing entropy, a pure component's
      latent entropy against its latent heat.  See `arm_g`.

SABOTAGES, performed by hand on 2026-11-03 and restored (the engine rebuilt
between them, the gate re-run green after the last):
  S1  `S_liquid_formation` prices a liquid species on `s_pure_ig` (the
      ideal-gas leg, no vaporisation entropy)  -> caught by (g1) on flash01's
      liquid (T dS 27.5 % below dH) and (g3) (benzene's latent entropy 0)
      ONLY.  (a) stayed green -- the predicted blind spot, measured.
  S2  `S_liquid_formation` drops the ideal mixing term  -> caught by (g2)
      ONLY (mixing entropy 2e-10 against 5.596 J/(mol K)).
  S3  the plateau's lever rule inverted ((S_V - S)/(S_V - S_L), the LIQUID
      fraction)  -> caught by (c): the verdict itself refuses (the published
      state's S misses its target by the whole swing), so the witness exits 1.

NOT CHECKED, said plainly: any MEASURED entropy (the arms are round trips and
identities on the engine's own surface plus a hand-read steam table); the
two-phase MIXTURE entropy blend (`sOfState` pricing each phase at its own
composition): an error there that stays a state function -- say the blend
taken at z -- is invisible to (a) for the reason above and to (g), whose
identities are single-phase or pure (predicted, NOT performed: the sabotage
lands in StreamEquilibrium.H, which half the engine includes); a three-phase
(VLLE) specification; the units that keep their own searches (adiabaticFlash,
valve, compressor, turbine -- not migrated, docs/design §6); the NRTL liquid's
dH = T dS (its H surface omits H^E, announced by the engine, and the entropy
follows the G^E the flash equilibrates); EoS-liquid Gibbs consistency (named
in the record, §3).
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
BIN = ROOT / "choupoProps"
WITNESS = ROOT / "tutorials/props/thermo/flashSpec01_wet_steam_expansion"
FLASH = ROOT / "tutorials/steady/flash"
SRC = ROOT / "src/unitOperations/flash/SpecifiedFlash.cpp"

fails = []


def fail(msg):
    fails.append(msg)
    print("FAIL  " + msg)


def run(case_dir):
    p = subprocess.run([str(BIN), "."], cwd=case_dir, capture_output=True,
                       text=True, timeout=900,
                       env={"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"})
    return p.returncode, p.stdout, p.stderr


def result_json(out):
    i = out.find("<<<Choupo:result-begin>>>")
    j = out.find("<<<Choupo:result-end>>>")
    if i < 0 or j < 0:
        return None
    return json.loads(out[i + len("<<<Choupo:result-begin>>>"):j])


def diags(js):
    """{op name: {key: value}} from the result JSON."""
    out = {}
    for op in (js or {}).get("operationResults", []):
        out[op.get("name")] = op.get("diagnostics", {})
    return out


def g(v):
    return repr(float(v))


def props_case(tmp, tag, steady_constant, ops, verbosity=2):
    d = Path(tmp) / tag
    (d / "system").mkdir(parents=True)
    shutil.copytree(steady_constant, d / "constant")
    (d / "system/controlDict").write_text(
        f'application choupoProps;\ndescription "probe";\nverbosity {verbosity};\n')
    body = "\n".join("    " + o for o in ops)
    (d / "system/propsDict").write_text("operations\n(\n" + body + "\n);\n")
    return d


def op(name, comp, spec, extra=""):
    return (f"{{ name {name}; type flashSpec; composition {{ {comp} }} "
            f"spec {{ {spec} }} {extra} }}")


def rel(a, b):
    return abs(a - b) / max(abs(b), 1e-300)


# The three mixtures and their states: (case, composition, [(tag, T0, P0)]).
MIXTURES = [
    ("flash01_benzene_toluene", "benzene 0.4; toluene 0.6;",
     [("2ph", 370.0, 1.0e5), ("liq", 330.0, 1.0e5), ("vap", 400.0, 1.0e5)]),
    ("flash02_ethanol_water", "ethanol 0.5; water 0.5;",
     [("2ph", 355.0, 101325.0), ("liq", 330.0, 101325.0)]),
    ("flash09_n2ch4_stryjek", "N2 0.3; CH4 0.7;",
     [("2ph", 149.82, 2061600.0), ("vap", 200.0, 2061600.0)]),
]


def arm_a(tmp):
    n_states = n_two_phase = 0
    worst = 0.0
    for case, comp, states in MIXTURES:
        cst = FLASH / case / "constant"
        ops = []
        for tag, T0, P0 in states:
            ops.append(op(f"ph_{tag}", comp,
                          f"pair PH; P {g(P0)}; targetFrom {{ T {g(T0)}; P {g(P0)}; }}"))
            ops.append(op(f"ps_{tag}", comp,
                          f"pair PS; P {g(P0)}; targetFrom {{ T {g(T0)}; P {g(P0)}; }}"))
        d = props_case(tmp, "a_" + case, cst, ops)
        rc, out, err = run(d)
        js = result_json(out)
        if rc != 0 or js is None:
            fail(f"(a) {case}: the PH/PS round trip did not run (exit {rc}): "
                 + (err.strip().splitlines() or ["?"])[-1])
            continue
        if "[convergence] flashSpec.PH: DEFAULT controls" not in out \
                or "[convergence] flashSpec.PS: DEFAULT controls" not in out:
            fail(f"(e) {case}: the convergence controls were not announced")
        if "normalization degenerated" not in out:
            fail(f"(e) {case}: the verdict did not name its criterion")
        D = diags(js)
        second = []
        for tag, T0, P0 in states:
            for pr in ("ph", "ps"):
                dd = D.get(f"{pr}_{tag}", {})
                T = dd.get("T", math.nan)
                e = rel(T, T0)
                worst = max(worst, e)
                if not e <= 1e-8:
                    fail(f"(a) {case} {tag}: ({pr.upper()}) recovered T = {T}"
                         f" against T0 = {T0} (rel {e:.2e} > 1e-8)")
            n_states += 1
            vf0 = D.get(f"ph_{tag}", {}).get("ref_vaporFraction", math.nan)
            if tag == "2ph":
                if not (1e-6 < vf0 < 1 - 1e-6):
                    fail(f"(a) {case}: the 'two-phase' state is not two-phase"
                         f" (V/F = {vf0})")
                    continue
                n_two_phase += 1
                second.append(op(f"pvf_{tag}", comp,
                                 f"pair PVF; P {g(P0)}; vaporFraction {g(vf0)};"))
                second.append(op(f"tvf_{tag}", comp,
                                 f"pair TVF; T {g(T0)}; vaporFraction {g(vf0)};"))
                expect = {f"pvf_{tag}": ("T", T0), f"tvf_{tag}": ("P", P0)}
            else:
                if tag == "liq" and not vf0 <= 1e-12:
                    fail(f"(a) {case}: the liquid state carries vapour ({vf0})")
                if tag == "vap" and not vf0 >= 1 - 1e-12:
                    fail(f"(a) {case}: the vapour state carries liquid ({vf0})")
        if second:
            d2 = props_case(tmp, "a2_" + case, cst, second)
            rc, out, err = run(d2)
            D2 = diags(result_json(out))
            if rc != 0:
                fail(f"(a) {case}: the V/F round trip did not run (exit {rc}): "
                     + (err.strip().splitlines() or ["?"])[-1])
                continue
            for name, (key, want) in expect.items():
                got = D2.get(name, {}).get(key, math.nan)
                e = rel(got, want)
                worst = max(worst, e)
                if not e <= 1e-8:
                    fail(f"(a) {case}: {name} recovered {key} = {got} against"
                         f" {want} (rel {e:.2e} > 1e-8)")
    return n_states, n_two_phase, worst


def arm_b(tmp):
    case, comp = "flash01_benzene_toluene", "benzene 0.4; toluene 0.6;"
    cst = FLASH / case / "constant"
    d = props_case(tmp, "b1", cst, [
        op("bub", comp, "pair PVF; P 1e5; vaporFraction 0;"),
        op("dew", comp, "pair PVF; P 1e5; vaporFraction 1;")])
    rc, out, err = run(d)
    D = diags(result_json(out))
    if rc != 0:
        fail(f"(b) the bubble/dew specification did not run (exit {rc})")
        return
    Tb = D.get("bub", {}).get("T", math.nan)
    Td = D.get("dew", {}).get("T", math.nan)
    if not (Tb < 370.0 < Td):
        fail(f"(b) Tb = {Tb}, Td = {Td} do not bracket the two-phase state 370 K")
    probes = [("b_lo", Tb * (1 - 1e-7)), ("b_hi", Tb * (1 + 1e-7)),
              ("d_lo", Td * (1 - 1e-7)), ("d_hi", Td * (1 + 1e-7))]
    ops = [op(n, comp, f"pair PH; P 1e5; targetFrom {{ T {g(T)}; P 1e5; }}")
           for n, T in probes]
    d2 = props_case(tmp, "b2", cst, ops)
    rc, out, err = run(d2)
    D2 = diags(result_json(out))
    vf = {n: D2.get(n, {}).get("ref_vaporFraction", math.nan) for n, _ in probes}
    if not vf["b_lo"] <= 0.0:
        fail(f"(b) just below the bubble T the flash carries vapour ({vf['b_lo']})")
    if not vf["b_hi"] > 0.0:
        fail(f"(b) just above the bubble T the flash carries no vapour ({vf['b_hi']})")
    if not vf["d_lo"] < 1.0:
        fail(f"(b) just below the dew T the flash carries no liquid ({vf['d_lo']})")
    if not vf["d_hi"] >= 1.0:
        fail(f"(b) just above the dew T the flash carries liquid ({vf['d_hi']})")
    return Tb, Td


def golden_rows(case):
    rows = []
    for line in (case / "expected").read_text().splitlines():
        f = line.split()
        if len(f) >= 5 and f[0] == "diag":
            rows.append((f[1], f[2], float(f[3]), float(f[4])))
    return rows


def arm_c(tmp):
    d = Path(tmp) / "witness"
    shutil.copytree(WITNESS, d)
    rc, out, err = run(d)
    D = diags(result_json(out))
    if rc != 0:
        fail(f"(c) the witness did not run (exit {rc})")
        return
    e = D.get("expand", {})
    checks = [
        ("expand quality", e.get("vaporFraction"), 0.8102, 5e-4),
        ("expand h [kJ/kg]", e.get("H_per_mass"), 2129.8, 1.0),
        ("expand Tsat [K]", e.get("T"), 318.96, 0.02),
        ("throttle flash fraction", D.get("throttle", {}).get("vaporFraction"), 0.147, 1e-3),
        ("Tsat(1 atm) [K]", D.get("halfBoil", {}).get("T"), 373.124, 1e-3),
        ("Psat(373.15 K) [Pa]", D.get("dewP", {}).get("P"), 101418.0, 5.0),
    ]
    for label, got, want, tol in checks:
        if got is None or not abs(got - want) <= tol:
            fail(f"(c) {label} = {got}, the steam table says {want} +- {tol}")
    if e.get("onSaturationPlateau") != 1.0:
        fail("(c) the isentropic expansion did not land on the saturation plateau")
    if not rel(e.get("S", math.nan), e.get("ref_S", math.nan)) <= 1e-9:
        fail(f"(c) the expansion is not isentropic: S {e.get('S')} vs ref"
             f" {e.get('ref_S')}")
    if (WITNESS / "expected").exists():
        for name, key, want, tol in golden_rows(WITNESS):
            got = D.get(name, {}).get(key)
            if got is None or abs(got - want) > tol * max(abs(want), 1e-12) + 1e-12:
                fail(f"(c) the witness golden moved: {name} {key} = {got}"
                     f" against {want}")
    else:
        fail("(c) the witness ships no golden")


def arm_d(tmp):
    b = FLASH / "flash01_benzene_toluene" / "constant"
    bt = "benzene 0.4; toluene 0.6;"
    w = WITNESS / "constant"
    br = ROOT / "tutorials/steady/evaporation/evaporator07_nacl_enrtl/constant"
    probes = [
        ("pair", b, op("x", bt, "pair PT; P 1e5; H 0;"),
         "not a specification this engine solves"),
        ("window", b, op("x", bt, "pair PH; P 1e5; H 1e9;"),
         "is not reached at P"),
        ("supercritical", w, op("x", "water 1;", "pair TVF; T 700 K; vaporFraction 0.5;"),
         "has no saturation"),
        ("twice", b, op("x", bt, "pair PH; P 1e5; H 0; targetFrom { T 370; P 1e5; }"),
         "needs exactly ONE"),
        ("unknown", b, op("x", bt, "pair PH; P 1e5; T 370; H 0;"),
         "which is the UNKNOWN of this pair"),
        ("vfRange", b, op("x", bt, "pair PVF; P 1e5; vaporFraction 1.5;"),
         "lies outside [0, 1]"),
        ("starved", b, op("x", bt, "pair PH; P 1e5; targetFrom { T 370; P 1e5; }",
                          "convergence { tolerance 1e-12; relTol 0; maxIter 1; }"),
         "did not meet its tolerance"),
        ("electrolyte", br, op("x", "NaCl 0.03; water 0.97;",
                               "pair PS; P 1 atm; S 0;"),
         "an ELECTROLYTE liquid has no entropy"),
    ]
    n = 0
    for tag, cst, o, needle in probes:
        d = props_case(tmp, "d_" + tag, cst, [o])
        rc, out, err = run(d)
        text = out + err
        if rc == 0 or needle not in text:
            fail(f"(d) {tag}: not refused by name (exit {rc}; wanted {needle!r})")
        else:
            n += 1
    #  ...and on the SAME package an enthalpy specification still answers:
    #  the entropy is then not published, and the run says why (a by-product
    #  that cannot be priced is withheld, never priced on a neighbouring rung).
    d = props_case(tmp, "d_electrolytePH", br, [op(
        "x", "NaCl 0.03; water 0.97;",
        "pair PH; P 1 atm; targetFrom { T 350 K; P 1 atm; }")])
    rc, out, err = run(d)
    dd = diags(result_json(out)).get("x", {})
    if rc != 0 or "S" in dd or "the entropy of this state is not published" not in out:
        fail(f"(d) electrolyte PH: wanted a converged state with S withheld and"
             f" said (exit {rc}; S published: {'S' in dd})")
    elif not rel(dd.get("T", math.nan), 350.0) <= 1e-8:
        fail(f"(d) electrolyte PH: recovered T = {dd.get('T')} against 350 K")
    return n


def arm_g(tmp):
    """THE ENTROPY SURFACE IS THE ENTHALPY'S PARTNER (the round trips above
    cannot see a wrong entropy: the search and the reference share one
    surface, so any consistent error inverts perfectly).
      (g1) dH = T dS at fixed P and composition, single phase, by a central
           difference of +-0.1 K (the result JSON carries 12 digits, and the
           O(dT^2/T^2) bias is below 1e-7): flash01's ideal liquid (330 K), flash01's
           vapour (400 K), flash09's SRK vapour (200 K), to 1e-6 relative.
           NOT on the NRTL liquid: its H surface omits H^E (announced in the
           engine), and the entropy follows the G^E the flash equilibrates, so
           the identity there misses exactly the omitted term.
      (g2) the IDEAL mixing entropy: S(mixture) - sum z S(pure) = -R sum z ln z
           on flash01's liquid at 330 K, to 1e-9 J/(mol K).
      (g3) the latent entropy of a pure component on the GENERIC surface (no
           pure-fluid method): benzene at Tsat(1 bar), T (S_V - S_L) against
           H_V - H_L, within 1 % (exact for the Watson-slope leg, a 298 K
           bridge on a declared liquid Cp is not exactly Clausius-Clapeyron).
    """
    R = 8.314462618
    b = FLASH / "flash01_benzene_toluene" / "constant"
    s9 = FLASH / "flash09_n2ch4_stryjek" / "constant"
    worst = 0.0
    for tag, cst, comp, T0, P0 in [
            ("liq01", b, "benzene 0.4; toluene 0.6;", 330.0, 1.0e5),
            ("vap01", b, "benzene 0.4; toluene 0.6;", 400.0, 1.0e5),
            ("vap09", s9, "N2 0.3; CH4 0.7;", 200.0, 2061600.0)]:
        ops = [op(f"p{k}", comp,
                  f"pair PS; P {g(P0)}; targetFrom {{ T {g(T0 + dt)}; P {g(P0)}; }}")
               for k, dt in (("m", -0.1), ("p", 0.1))]
        d = props_case(tmp, "g1_" + tag, cst, ops)
        rc, out, err = run(d)
        D = diags(result_json(out))
        try:
            dH = D["pp"]["ref_H"] - D["pm"]["ref_H"]
            TdS = T0 * (D["pp"]["ref_S"] - D["pm"]["ref_S"])
        except KeyError:
            fail(f"(g1) {tag}: the probe did not run (exit {rc})")
            continue
        e = rel(TdS, dH)
        worst = max(worst, e)
        if not e <= 1e-6:
            fail(f"(g1) {tag}: dH = {dH:.9g} J/mol but T dS = {TdS:.9g} over"
                 f" +-0.1 K at {T0} K (rel {e:.2e} > 1e-6) -- the entropy is not"
                 " the enthalpy's partner")
    ops = [op(n, c, "pair PS; P 1e5; targetFrom { T 330; P 1e5; }")
           for n, c in (("mix", "benzene 0.4; toluene 0.6;"),
                        ("b", "benzene 1;"), ("t", "toluene 1;"))]
    d = props_case(tmp, "g2", b, ops)
    rc, out, err = run(d)
    D = diags(result_json(out))
    try:
        smix = D["mix"]["ref_S"] - 0.4 * D["b"]["ref_S"] - 0.6 * D["t"]["ref_S"]
        want = -R * (0.4 * math.log(0.4) + 0.6 * math.log(0.6))
        if not abs(smix - want) <= 1e-9:
            fail(f"(g2) the ideal liquid's mixing entropy is {smix:.12g}, the"
                 f" ideal solution's is {want:.12g} J/(mol K)")
    except KeyError:
        fail(f"(g2) the mixing probe did not run (exit {rc})")
        smix = math.nan
    ops = [op(n, "benzene 1;", f"pair PVF; P 1e5; vaporFraction {v};")
           for n, v in (("L", 0), ("V", 1))]
    d = props_case(tmp, "g3", b, ops)
    rc, out, err = run(d)
    D = diags(result_json(out))
    try:
        Ts = D["L"]["T"]
        dHlat = D["V"]["H"] - D["L"]["H"]
        TdSlat = Ts * (D["V"]["S"] - D["L"]["S"])
        lat = rel(TdSlat, dHlat)
        if not (dHlat > 1e4 and lat <= 1e-2):
            fail(f"(g3) benzene at Tsat {Ts:.4f} K: latent H {dHlat:.6g} J/mol,"
                 f" T x latent S {TdSlat:.6g} (rel {lat:.2e} > 1e-2)")
    except KeyError:
        fail(f"(g3) the latent probe did not run (exit {rc})")
        lat = math.nan
    return worst, lat


def arm_f():
    src = SRC.read_text()
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    src = re.sub(r"//[^\n]*", "", src)
    if "flashDiscardingSupercriticalSplit(" not in src:
        fail("(f) SpecifiedFlash.cpp no longer reaches the flash through"
             " flashDiscardingSupercriticalSplit")
    for banned in ("solveCore(", "Rachford", "michelsen", "StabilityTest",
                   "stabilityTest("):
        if banned in src:
            fail(f"(f) SpecifiedFlash.cpp carries `{banned}` -- an equilibrium"
                 " of its own beside the one flash home")
    if src.count("Kvec(") != 1:
        fail(f"(f) SpecifiedFlash.cpp carries {src.count('Kvec(')} `Kvec(` calls;"
             " the one allowed is the pure saturation curve (ln K = 0)")


def main():
    if not BIN.exists():
        print("check_flash_specification: FAILED -- choupoProps is missing;"
              " build first (a check that cannot run must not pass)")
        return 1
    with tempfile.TemporaryDirectory() as tmp:
        n_states, n_2ph, worst = arm_a(tmp)
        bd = arm_b(tmp)
        arm_c(tmp)
        n_ref = arm_d(tmp)
        g1, glat = arm_g(tmp)
    arm_f()
    if fails:
        print(f"check_flash_specification: FAILED ({len(fails)} finding(s))")
        return 1
    print("check_flash_specification: OK -- (P,H) and (P,S) recover T on"
          f" {n_states} states of 3 corpus mixtures (flash01 ideal, flash02 NRTL,"
          f" flash09 SRK; liquid, vapour and {n_2ph} two-phase), (P,V/F) and"
          " (T,V/F) recover T and P on each two-phase state, worst relative"
          f" error {worst:.1e} (<= 1e-8); the bubble/dew edge is the flash's"
          f" (Tb {bd[0]:.4f} K, Td {bd[1]:.4f} K, probed at 1e-7); the witness's"
          " wet isentropic expansion, throttle, Tsat and Psat match the IF97"
          f" steam table; the entropy is the enthalpy's partner (dH = T dS"
          f" single-phase to {g1:.1e}, the ideal mixing entropy exact, benzene's"
          f" latent T dS/dH within {glat:.1e}); {n_ref} refusals by name; the"
          " convergence verdict"
          " announced; source arm (one flash home).  NOT checked: any measured"
          " entropy; the two-phase MIXTURE entropy blend beyond its round"
          " trip; a VLLE specification; the units that keep their own"
          " search (adiabaticFlash, valve, compressor, turbine).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
