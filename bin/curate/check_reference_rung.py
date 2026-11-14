#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: a formation datum is read on the rung it DECLARES, or not at all.

    bin/curate/check_reference_rung.py

WHY THIS EXISTS.  `standardThermochemistry { dHf_298; s_298; referenceState; }`
names the thermodynamic standard state its two numbers are tabulated on --
`idealGas` (the default, NIST/JANAF), `pureLiquid`, or `pureSolid`.  The field
has been parsed since long before this gate, and `h_formation(T, phase)`
honours it correctly, taking the transition at 298 K.

But `h_pure_ig(T)` and `s_pure_ig(T)` -- and therefore `g_pure_ig`, and
therefore every equilibrium constant the Gibbs reactors and `Reaction::Kp`
compute -- read `Hf298_` and `S298_` straight off the record and integrate the
IDEAL-GAS Cp on top.  Until 2026-08-06 they did that whatever the record
declared.  A `pureSolid` datum read there comes back wrong by a heat of
sublimation: right sign, plausible magnitude, no diagnostic.

MEASURED BEFORE THE FIX (2026-08-06), because the size of the hole is the
argument for closing it:

    247 component records; 160 carry standardThermochemistry
    142 take the DEFAULT idealGas rung  -- correct for every one of them
     16 declare pureSolid, 2 declare pureLiquid
      0 of those 18 carry an idealGasHeatCapacity{} block

So the catalogue could not reach the defect -- not because anything checked,
but because those 18 records happen to lack a gas Cp.  `h_pure_ig` refused
them with "needs idealGasHeatCapacity block in .dat", and THAT is the part
worth the gate: the message named the wrong cause and its advice was the bug.
A curator who added the gas Cp it asked for -- a reasonable thing to do for
H3PO4 or HNO3, which have perfectly good gas-phase data -- would have turned
an honest refusal into a silent wrong answer.

WHAT IS CHECKED.  A probe builds synthetic records (the defective one does not
exist in the catalogue and must NOT be added to it) and reads each surface:

  (a) THE DEFAULT RUNG STILL WORKS.  A record writing no `referenceState`
      must evaluate exactly as before -- 142 records depend on it, and a
      refusal that also catches them would be a 142-record regression wearing
      a safety argument.

  (b) WRITTEN idealGas == OMITTED.  If the parser treated the two
      differently, a curator making the rung explicit would change the answer.

  (c) THE SOLID RUNG REFUSES, WITH THE GAS Cp PRESENT.  This is the case the
      catalogue cannot currently reach and the whole reason for the slice.

  (d) THE SOLID RUNG REFUSES FOR THE RIGHT REASON, WITHOUT THE GAS Cp.  The
      18 real records.  They refused before; the gate checks the message now
      names the RUNG and no longer advises adding a Cp block.  A refusal that
      fires for the wrong reason is not the refusal being claimed.

  (e) THE LIQUID RUNG REFUSES TOO -- H2SO4 and HNO3 are real records.

  (f) THE ENTROPY SURFACE REFUSES, ASKED DIRECTLY -- and (f2) the derived
      Gibbs one.  These are two arms because a sabotage proved they had to be.
      The first version asked only for `g_pure_ig` and claimed that covered
      the entropy; removing ONLY `s_pure_ig`'s guard left the whole gate
      GREEN, because g = h - T*s evaluates the enthalpy first and its refusal
      fires before the entropy is ever touched.  `ThermoPackage::S_ig` calls
      `s_pure_ig` directly, so the uncovered path was real, not hypothetical.
      The claim was narrowed by strengthening the arm, not by softening the
      sentence.

SABOTAGE-VERIFIED three ways, each with a rebuild between rounds: remove the
rung check from `h_pure_ig` (arms c/d/e fire, and d reproduces the old
misleading advice verbatim); remove it from `s_pure_ig` alone (arm f -- this
is the round that found the blind arm above); make `h_formation`'s solid leg
throw (arm g fires, which is the only thing in the tree that would notice a
remedy that does not work).

  (g) THE REMEDY WORKS.  The refusal tells the reader to use
      `h_formation(T, phase)`.  The gate calls it, on the same record, to
      both `solid` and `liquid` targets, and requires a finite answer.  Advice
      that does not work is worse than no advice, and nothing else in the tree
      would have caught it.

  (j) THE LIQUID RUNG OF AN ASSOCIATING ACID (DEV.md 4c C201 item 1, finding
      F9 of docs/reviews/2026-11-02-newcomer-tutorial-review.md).  Real
      aceticAcid / ethanol / ethylAcetate / water crossed gas -> liquid must
      land within a band of the liquid formation enthalpies (-484.3 +-5,
      -277.0 +-2, -479.3 +-2, -285.83 +-2 kJ/mol), and the esterification
      heat they give within +-5 kJ/mol of -3.83.  Measured with the derived
      bridge: acetic acid -486.34 (-2.04), ethanol -277.90, ethyl acetate
      -478.22, water -286.40; reaction -0.38 kJ/mol at 298 K.  Without it
      acetic acid sat at -460.43 (+23.87) and the reaction at -26.3 (cstr01
      published Q = -1.879 kW at 0.07304 mol/s = -25.7 kJ/mol).  The band is
      wide on purpose: the residual is Watson's extrapolation to 298 K, which
      this arm does not claim to fix.  SABOTAGE (by hand, 2026-11-02): the
      `vapourDimerisation` key of chemistry/aceticAcid-dissolution.dat
      renamed -> arm (j) FAILED naming aceticAcid +23.87 kJ/mol; record
      restored.  (Only the acetic-acid enthalpy band fires in that case; the
      reaction-heat band is reached only when all four enthalpies pass.)

  (k) THE ASSOCIATED IDEAL-GAS VAPOUR (DEV.md 4c C201 item 1, piece 2): the
      pure limit, the latent heat at Tb against a closed form, and the
      acetic acid/water T-x-y against a measured dataset -- see `arm_k`.

WHAT IS NOT CHECKED, deliberately:

  * whether a record's DECLARED rung is the right one for its numbers.  That
    is a curation judgement against a primary source.

    (The `water.dat` example this paragraph used to end on is CLOSED as of
    2026-08-07: a record may now declare additional rungs as named sub-blocks,
    water carries its `pureLiquid` datum beside the ideal-gas one, and
    `water-dissociation` derives -13.9980 against its stored -14.000.  Arm (h)
    below guards the grammar; `check_logk_crosscheck` measures the arithmetic.
    The paragraph is kept, shortened, because the DISTINCTION it drew --
    a missing second datum is not a mislabelled one -- is what made the fix a
    data-layer change rather than a guard.)

  * the 87 records carrying no `standardThermochemistry` at all.  They have no
    rung to be wrong about.

Exit 1 naming the arm that failed.
"""
import json
import os
import math
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROBE = ROOT / "build" / "linux64Gcc" / "referenceRungProbe"
SRC = ROOT / "bin" / "curate" / "_referenceRungProbe.cpp"
#  Arm (k) asks the PACKAGE (not the component) through the auditor probe
#  check_column_thermo_consistency already uses -- built under its own name so
#  the two gates never race on one binary.
PKG_PROBE = ROOT / "build" / "linux64Gcc" / "columnThermoProbe_rung"
PKG_SRC = ROOT / "bin" / "curate" / "_columnThermoProbe.cpp"
WITNESS = ROOT / "tutorials" / "props" / "compare" / "aceticWater01_txy_association"


def build_probe():
    cmd = ["g++", "-std=c++17", "-O2", f"-I{ROOT / 'src'}", f"-I{ROOT}",
           str(SRC),
           str(ROOT / "build" / "linux64Gcc" / "libchoupo.so"),
           "-Wl,-rpath," + str(ROOT / "build" / "linux64Gcc"),
           "-o", str(PROBE)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r.returncode, r.stderr[-1200:]


def main() -> int:
    fail, checked = [], []

    if not SRC.exists():
        print("check_reference_rung: FAILED\n  the probe source is missing")
        return 1

    rc, err = build_probe()
    if rc != 0:
        print("check_reference_rung: FAILED\n  probe did not compile -- the "
              "Component surface or the library moved.  A check that cannot "
              "build must not pass.\n" + err)
        return 1

    #  CHOUPO_HOME is passed EXPLICITLY: arm (i) reads the real water.dat,
    #  and the probe falls back to "." when the variable is unset -- which
    #  would silently resolve against whatever directory the caller
    #  happened to be in.  A gate must not depend on the environment it is
    #  invoked from.
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(PROBE)], capture_output=True, text=True,
                       timeout=300, env=env)
    if r.returncode != 0:
        print(f"check_reference_rung: FAILED\n  probe exited {r.returncode}\n"
              + r.stdout[-800:] + r.stderr[-800:])
        return 1
    try:
        got = json.loads(r.stdout)
    except json.JSONDecodeError:
        print("check_reference_rung: FAILED\n  probe output is not JSON:\n"
              + r.stdout[-600:])
        return 1

    def res(key):
        return got.get(key, {}).get("result", "<missing>")

    # ---- (a) the default rung still evaluates ------------------------------
    if res("defaultRung") != "ok":
        fail.append("(a) a record declaring NO referenceState was refused: "
                    + res("defaultRung")
                    + "\n      142 catalogue records take that default.")
    elif not math.isfinite(got["defaultRung"]["h"]):
        fail.append("(a) the default rung returned a non-finite enthalpy")
    else:
        checked.append("the default (idealGas) rung evaluates, h(400 K) = "
                       f"{got['defaultRung']['h']:.1f} J/mol")

    # ---- (b) written idealGas behaves as omitted ---------------------------
    if res("explicitIdealGas") != "ok":
        fail.append("(b) `referenceState idealGas;` written explicitly was "
                    "refused: " + res("explicitIdealGas"))
    elif got["explicitIdealGas"]["h"] != got["defaultRung"]["h"]:
        fail.append("(b) writing `referenceState idealGas;` CHANGED the answer "
                    f"({got['explicitIdealGas']['h']} vs "
                    f"{got['defaultRung']['h']}) -- making a default explicit "
                    "must never move a number.")
    else:
        checked.append("an explicit `idealGas` is byte-identical to omitting it")

    # ---- (c)(d)(e) the non-gas rungs refuse, and say why -------------------
    for key, rung, arm in (("solidRungWithGasCp", "pureSolid", "c"),
                           ("solidRungNoGasCp", "pureSolid", "d"),
                           ("liquidRungWithGasCp", "pureLiquid", "e")):
        msg = res(key)
        if msg == "ok":
            fail.append(f"({arm}) h_pure_ig accepted a record declaring "
                        f"`referenceState {rung};` -- the datum is not on the "
                        "ideal-gas rung and reading it there is wrong by a "
                        "heat of sublimation or vaporisation.")
            continue
        if "referenceState" not in msg or rung not in msg:
            fail.append(f"({arm}) the refusal for `{rung}` does not quote the "
                        "record's own key and word, so the reader cannot find "
                        "it in their file:\n      " + msg)
        elif "h_formation" not in msg:
            fail.append(f"({arm}) the refusal for `{rung}` names no remedy:\n"
                        "      " + msg)
        else:
            checked.append(f"`{rung}` is refused by name, quoting the record's "
                           "own key, with h_formation named as the remedy")

    # ---- (d) extra: the message must NOT advise adding a gas Cp ------------
    msg = res("solidRungNoGasCp")
    if msg != "ok" and "idealGasHeatCapacity" in msg and "NOT" not in msg:
        fail.append("(d) the refusal still advises adding an "
                    "idealGasHeatCapacity{} block.  That advice IS the defect: "
                    "adding one converts an honest refusal into a silent wrong "
                    "answer.\n      " + msg)
    elif msg != "ok":
        checked.append("the refusal explicitly warns AGAINST adding a gas Cp "
                       "block, which was the old message's advice")

    # ---- (f) the ENTROPY surface, asked directly --------------------------
    #  Not through g_pure_ig: a sabotage proved that arm blind.  g = h - T*s
    #  evaluates h_pure_ig first, so its refusal fires before the entropy is
    #  touched, and removing ONLY s_pure_ig's guard left the gate green.
    #  ThermoPackage::S_ig calls s_pure_ig directly, so the gap was real.
    if res("entropySolidRung") == "ok":
        fail.append("(f) s_pure_ig accepted a solid-rung record.  Guarding "
                    "h_pure_ig alone is not enough -- ThermoPackage::S_ig "
                    "calls the entropy directly and would cross the rung "
                    "silently.")
    elif "referenceState" not in res("entropySolidRung"):
        fail.append("(f) s_pure_ig refused, but not on the rung:\n      "
                    + res("entropySolidRung"))
    elif res("entropyDefaultRung") != "ok":
        fail.append("(f) s_pure_ig refused the DEFAULT rung: "
                    + res("entropyDefaultRung"))
    else:
        checked.append("s_pure_ig refuses the solid rung ON ITS OWN, not only "
                       "through g_pure_ig")

    # ---- (f2) the derived Gibbs surface ------------------------------------
    if res("gibbsSolidRung") == "ok":
        fail.append("(f2) g_pure_ig accepted a solid-rung record")
    elif res("gibbsDefaultRung") != "ok":
        fail.append("(f2) g_pure_ig refused the DEFAULT rung: "
                    + res("gibbsDefaultRung"))
    else:
        checked.append("g = h - T*s refuses the solid rung and accepts the "
                       "default")

    # ---- (h) multi-rung: a second rung is accepted, a duplicate refused ----
    if res("secondRungAccepted") != "ok":
        fail.append("(h) a record declaring a LEGITIMATE second rung "
                    "(`pureLiquid{}` beside an idealGas referenceState) was "
                    "refused: " + res("secondRungAccepted")
                    + "\n      Water needs exactly this: the gas datum for "
                      "combustion, the liquid one for every aqueous "
                      "equilibrium it takes part in.")
    else:
        checked.append("a second rung is accepted and both are reachable")

    msg = res("duplicateRungRefused")
    if msg == "ok":
        fail.append("(h) a record declaring `referenceState idealGas` AND an "
                    "`idealGas{}` sub-block was ACCEPTED -- that is two homes "
                    "for one datum, and one of them would silently win.")
    elif "two homes" not in msg:
        fail.append("(h) the duplicate-rung refusal does not say WHY:\n      "
                    + msg)
    else:
        checked.append("a duplicate of the declared rung is refused as two "
                       "homes for one datum")

    # ---- (i) the POTENTIAL closes where its halves do not -----------------
    #  CODATA for liquid water: dHf -285830 J/mol, S 69.95 J/(mol K), so
    #  g = -306685.6 J/mol.  The engine reaches the same liquid state from the
    #  GAS datum by Watson Hvap and dS = (Hvap - dG_vap)/T -- an independent
    #  route, so this is a real comparison and not a restatement.
    CODATA_H, CODATA_S = -285830.0, 69.95
    CODATA_G = CODATA_H - 298.15 * CODATA_S
    w = got.get("waterLiquidCrossing", {})
    if w.get("result") != "ok":
        fail.append("(i) water could not be crossed gas -> liquid: "
                    + str(w.get("result")))
    else:
        dh, ds, dg = w["h"] - CODATA_H, w["s"] - CODATA_S, w["g"] - CODATA_G
        if abs(dg) > 50.0:
            fail.append(f"(i) the derived liquid POTENTIAL is {dg:+.1f} J/mol "
                        f"from CODATA (h {dh:+.0f}, s {ds:+.2f}).  The two legs "
                        "are each approximate and their errors cancel in "
                        "g = h - T*s; a potential this far out means the "
                        "cancellation broke, and the usual cause is the "
                        "vaporisation entropy being taken as Hvap/T -- which "
                        "holds only at equilibrium, and water at 298 K is not "
                        "(Psat = 0.0317 bar).")
        elif abs(dh) < 100.0:
            fail.append(f"(i) the enthalpy leg is only {dh:+.1f} J/mol from "
                        "CODATA, which is TOO GOOD for a Watson extrapolation "
                        "-- this arm exists to prove the potential closes "
                        "DESPITE approximate legs, and if the leg became exact "
                        "the arm is no longer testing what it claims.")
        else:
            checked.append(f"the derived liquid potential closes to {dg:+.2f} "
                           f"J/mol of CODATA while its legs are {dh:+.0f} J/mol "
                           f"and {ds:+.2f} J/(mol K) out -- the cancellation "
                           "that makes a potential the right interface")

    # ---- (j) the LIQUID RUNG of the esterification four (DEV.md 4c C201) ---
    #  The liquid heat of an associating acid is bridged to the datum's own
    #  ideal-gas MONOMER by a DERIVED heat (calorimetric + dimer dissociation).
    #  Bridged with the calorimetric heat alone, acetic acid's liquid sat 23.9
    #  kJ/mol above its liquid formation enthalpy and the liquid-phase
    #  esterification heat came out -26 kJ/mol against about -4 measured
    #  (cstr01 published Q = -1.879 kW at 0.07304 mol/s).  Primary values:
    #  NIST WebBook / NBS liquid dHf: acetic acid -484.3, ethanol -277.0,
    #  ethyl acetate -479.3, water -285.83 kJ/mol.
    LIQ = {"aceticAcid": (-484.3e3, 5.0e3), "ethanol": (-277.0e3, 2.0e3),
           "ethylAcetate": (-479.3e3, 2.0e3), "water": (-285.83e3, 2.0e3)}
    hl, ok_liq = {}, True
    for nm, (ref, band) in LIQ.items():
        e = got.get("liquidRung_" + nm, {})
        if e.get("result") != "ok":
            fail.append(f"(j) {nm}: liquid rung unreadable: {e.get('result')}")
            ok_liq = False
            continue
        hl[nm] = e["h"]
        if abs(e["h"] - ref) > band:
            fail.append(f"(j) {nm}: h_formation(298.15 K, liquid) = "
                        f"{e['h']/1e3:.2f} kJ/mol is {(e['h']-ref)/1e3:+.2f} "
                        f"from the liquid formation enthalpy {ref/1e3:.2f} "
                        f"(band +-{band/1e3:.1f}).")
            ok_liq = False
    if ok_liq:
        rxn = hl["ethylAcetate"] + hl["water"] - hl["aceticAcid"] - hl["ethanol"]
        REF_RXN = (-479.3 - 285.83 + 484.3 + 277.0) * 1e3     # -3.83 kJ/mol
        if abs(rxn - REF_RXN) > 5.0e3:
            fail.append(f"(j) liquid esterification heat {rxn/1e3:.2f} kJ/mol "
                        f"is {(rxn-REF_RXN)/1e3:+.2f} from the value the four "
                        f"liquid formation enthalpies give ({REF_RXN/1e3:.2f}), "
                        "band +-5 kJ/mol.  A bridge to the wrong vapour shifts "
                        "this by the dimer dissociation heat (~26 kJ/mol).")
        else:
            checked.append(f"the liquid esterification heat is {rxn/1e3:.2f} "
                           f"kJ/mol against {REF_RXN/1e3:.2f} from the liquid "
                           "formation enthalpies (acetic acid bridged to the "
                           "datum's monomer, "
                           f"{(hl['aceticAcid']+484.3e3)/1e3:+.2f} kJ/mol out)")


    # ---- (k) the ASSOCIATED VAPOUR: pure limit + latent heat at Tb --------
    fail_k, checked_k = arm_k()
    fail += fail_k
    checked += checked_k

    # ---- (g) the named remedy actually works ------------------------------
    for key, target in (("formationSolidToSolid", "solid"),
                        ("formationSolidToLiquid", "liquid")):
        if res(key) != "ok":
            fail.append(f"(g) the REMEDY the refusal names does not work: "
                        f"h_formation(T, \"{target}\") on the same solid-rung "
                        "record returned: " + res(key)
                        + "\n      A refusal whose advice fails is worse than "
                          "no refusal.")
        elif not math.isfinite(got[key]["h"]):
            fail.append(f"(g) h_formation(T, \"{target}\") returned a "
                        "non-finite value on a solid-rung record")
        else:
            checked.append(f"the named remedy works: h_formation(400 K, "
                           f"\"{target}\") = {got[key]['h']:.1f} J/mol")

    if fail:
        print("check_reference_rung: FAILED")
        for f in fail:
            print("  * " + f)
        return 1

    print("check_reference_rung: OK -- " + "; ".join(checked))
    return 0


def _num(text, key):
    m = re.search(r"^\s*" + key + r"\s+([-+0-9.eE]+)\s*;", text, re.M)
    return float(m.group(1)) if m else None


def _coeffs(text, block):
    m = re.search(block + r"\s*\{[^}]*?coefficients\s*\(([^)]*)\)", text, re.S)
    return [float(t) for t in m.group(1).split()] if m else None


def arm_k():
    """(k) THE ASSOCIATED IDEAL-GAS VAPOUR (DEV.md 4c C201 item 1, piece 2).

    Asked of the PACKAGE of the witness aceticWater01_txy_association through
    the auditor probe (H_stream_formation, BubblePoint/DewPoint, Kvec), and
    held to a closed form recomputed HERE from the witness's own sealed
    records (no engine arithmetic reused):
      * pure limit: the bubble AND dew temperature of pure acetic acid at
        1 atm equal the root of the record's Antoine (the chemical theory
        makes p_m + p_d = Psat_apparent exact) to 1e-4 K, and that root is
        within 0.1 K of the record's Tb (391.05 K, Antoine's own residual);
        K = 1 there at x = y = pure;
      * the latent heat the package prices between the saturated liquid and
        the saturated ASSOCIATED vapour at that T reproduces the closed form
        (monomer bridge at 298.15 K + Kirchhoff on the record's Cp's + the
        dimer heat at Tb) to 1 J/mol, and equals the record's measured
        HvapTb 24.39 to 0.1 kJ/mol -- BY CONSTRUCTION since 2026-11-03
        (DEV.md 4c C201 item 3): the bridge is the monomer heat at Tb carried
        to 298.15 K by Kirchhoff on the same Cp's the package prices with, so
        a miss here means a phase is priced on a different surface;
      * the association is IN the vapour: HV at Tb sits below the monomer
        ideal gas by the dimer heat (xi * 63.18 kJ/mol, xi ~ 0.36).
      * the T-x-y of the witness, run here, against Calvar, Dominguez & Tojo
        (2005) at 101.325 kPa: AAD T <= 2.6 K and AAD y_water <= 0.031.
        Measured: associated vapour 2.187 K / 0.0272, monomer ideal gas
        3.486 K / 0.0355 -- the ceiling sits between, nothing was tuned.
    SABOTAGE (by hand, 2026-11-02): `associationResidualTotal` made to return
    0 (the vapour loses its dimer heat, the K-values keep the association) ->
    arm (k) FAILED: "latent heat at Tb priced 49.5137 kJ/mol, the closed form
    from the records gives 33.0246"; restored, rebuilt, OK.
    """
    fail, checked = [], []
    lib = ROOT / "build" / "linux64Gcc" / "libchoupo.so"
    p = subprocess.run(
        ["g++", "-std=c++17", "-O2", "-I" + str(ROOT / "src"), "-I" + str(ROOT),
         str(PKG_SRC), str(lib), "-Wl,-rpath," + str(lib.parent),
         "-o", str(PKG_PROBE)], capture_output=True, text=True)
    if p.returncode != 0:
        return ["(k) the package probe did not compile:\n" + p.stderr[-800:]], []
    comp = (WITNESS / "constant" / "components" / "aceticAcid.dat").read_text()
    chem = (WITNESS / "constant" / "chemistry" / "aceticAcid-dissolution.dat").read_text()
    A, B, C = _coeffs(comp, "vaporPressure")
    cpg = _coeffs(comp, "idealGasHeatCapacity")
    cpl = _coeffs(comp, "liquidHeatCapacity")
    Tb_rec, Hb, Tc = _num(comp, "Tb"), _num(comp, "HvapTb"), _num(comp, "Tc")
    vd = chem[chem.index("vapourDimerisation"):]
    logK, dH = _num(vd, "logK25"), _num(vd, "dH")
    P = 101325.0
    psat = lambda T: 10 ** (A - B / (T + C)) * 1e5
    T = Tb_rec
    for _ in range(60):
        T -= (psat(T) - P) / ((psat(T + 1e-4) - psat(T - 1e-4)) / 2e-4)
    T_ant = T
    Kd = lambda T: 10 ** (logK - (dH / (math.log(10) * 8.31446)) * (1 / T - 1 / 298.15))

    def sat(T, Patm):
        k = Kd(T)
        pm = (-1 + math.sqrt(1 + 4 * k * Patm)) / (2 * k)
        pd = k * pm * pm
        return pd / (pm + 2 * pd)

    def poly_int(c, a, b):
        return sum(ci / (i + 1) * (b ** (i + 1) - a ** (i + 1)) for i, ci in enumerate(c))
    #  The bridge is the MONOMER's latent heat at 298.15 K: the apparent
    #  HvapTb put on the monomer basis at Tb (where it was measured, at
    #  Psat(Tb)), then carried to 298.15 K by Kirchhoff on the record's OWN
    #  Cp_ig and liquid Cp -- the arithmetic the package undoes when it prices
    #  the liquid, so the latent heat at Tb is HvapTb by construction (DEV.md
    #  4c C201 item 3; Watson, on the apparent heat or on the monomer, was
    #  measured and rejected: 29.3 and 27.15 kJ/mol against 24.39).
    hMonoTb = Hb + sat(Tb_rec, psat(Tb_rec) / 101325.0) * (-dH)
    bridge = hMonoTb - (poly_int(cpg, 298.15, Tb_rec) - poly_int(cpl, 298.15, Tb_rec))
    xiTb = sat(T_ant, P / 101325.0)
    latent_cf = (bridge + poly_int(cpg, 298.15, T_ant) - poly_int(cpl, 298.15, T_ant)
                 + xiTb * dH)

    req = [f"SAT {T_ant} {P} 1 0",
           f"HL {T_ant} {P} 1 0",
           f"HV {T_ant} {P} 1 0",
           f"K {T_ant} {P} 1 0 1 0"]
    with tempfile.NamedTemporaryFile("w", suffix=".req", delete=False) as f:
        f.write("\n".join(req) + "\n")
        rp = f.name
    try:
        r = subprocess.run([str(PKG_PROBE), str(WITNESS), rp], capture_output=True,
                           text=True, timeout=300, env=dict(os.environ, CHOUPO_HOME=str(ROOT)))
    finally:
        os.unlink(rp)
    m = re.search(r"<<<PROBE\n(.*)PROBE>>>", r.stdout, re.S)
    if r.returncode != 0 or not m:
        return [f"(k) the package probe gave no answer (exit {r.returncode}): "
                + (r.stdout + r.stderr)[-600:]], []
    lines = m.group(1).splitlines()
    vals = []
    for l in lines:
        if not l.startswith("OK"):
            return [f"(k) the package refused a request: {l}"], []
        vals.append([float(t) for t in l.split()[1:]])
    (Tbub, Tdew), (hl,), (hv,), K = vals
    if abs(Tbub - T_ant) > 1e-4 or abs(Tdew - T_ant) > 1e-4:
        fail.append(f"(k) pure acetic acid at 1 atm: bubble {Tbub:.6f} K / dew "
                    f"{Tdew:.6f} K, the record's Antoine root is {T_ant:.6f} K -- "
                    "the associated vapour must leave the pure limit exact.")
    elif abs(T_ant - Tb_rec) > 0.1:
        fail.append(f"(k) the Antoine root {T_ant:.4f} K is not within 0.1 K "
                    f"of the record's Tb {Tb_rec}")
    elif abs(K[0] - 1.0) > 1e-6:
        fail.append(f"(k) K(pure acetic acid, Tb) = {K[0]:.9f}, not 1")
    else:
        checked.append(f"pure acetic acid boils at {Tbub:.4f} K (bubble = dew = "
                       f"the record's Antoine root; record Tb {Tb_rec}) on the "
                       "associated vapour, K = 1")
    lat = hv - hl
    if abs(lat - latent_cf) > 1.0:
        fail.append(f"(k) latent heat at Tb priced {lat/1e3:.4f} kJ/mol, the "
                    f"closed form from the records gives {latent_cf/1e3:.4f}: "
                    "the vapour or the liquid is not on the surface this arm "
                    "derives (bridge + Kirchhoff + dimer heat at Tb).")
    elif abs(lat - Hb) > 0.1e3:
        #  0.1 kJ/mol covers only the two anchors' gap: the record's Tb
        #  (391.05 K, at Psat(Tb) = 1.0145 bar) against the Antoine root at
        #  1 atm (391.0085 K) where the package is asked.  Measured: a few J.
        fail.append(f"(k) latent heat at Tb {lat/1e3:.4f} kJ/mol is not the "
                    f"record's HvapTb {Hb/1e3:.2f} -- the bridge is built to "
                    "close on it, so the liquid and the vapour are not on the "
                    "surface the bridge was derived on")
    elif not (abs((hv - hl) - (bridge + poly_int(cpg, 298.15, T_ant)
                               - poly_int(cpl, 298.15, T_ant))) > 10.0e3):
        fail.append("(k) the vapour at Tb carries no association heat")
    else:
        checked.append(f"latent heat at Tb {lat/1e3:.3f} kJ/mol on the "
                       f"associated vapour (closed form {latent_cf/1e3:.3f}; "
                       f"record HvapTb {Hb/1e3:.2f}, {(lat-Hb)/1e3:+.2f}; dimer "
                       f"heat in the vapour {xiTb*dH/1e3:.2f} kJ/mol)")

    # ---- the T-x-y against the MEASUREMENT (Calvar et al. 2005) ----------
    import csv
    import shutil
    with tempfile.TemporaryDirectory() as td:
        case = Path(td) / WITNESS.name
        shutil.copytree(WITNESS, case, ignore=shutil.ignore_patterns(
            "*.csv", "log.*", "reports", "converged"))
        shutil.copytree(WITNESS / "constant" / "experimental",
                        case / "constant" / "experimental", dirs_exist_ok=True)
        rr = subprocess.run([str(ROOT / "choupoProps"), "."], cwd=case,
                            capture_output=True, text=True, timeout=600,
                            env=dict(os.environ, CHOUPO_HOME=str(ROOT)))
        out = case / "txy_calvar2005.csv"
        if rr.returncode != 0 or not out.exists():
            fail.append("(k) the witness T-x-y did not run: "
                        + (rr.stdout + rr.stderr)[-400:])
            return fail, checked
        mod = list(csv.reader(out.open()))[1:]
        exp = list(csv.reader(l for l in (WITNESS / "constant" / "experimental"
                   / "calvar2005_txy.csv").open() if not l.startswith("#")))[1:]
    if len(mod) != len(exp) or any(abs(float(m[0]) - float(e[0])) > 1e-9
                                   for m, e in zip(mod, exp)):
        fail.append("(k) the witness T-x-y is not evaluated at the measured "
                    "liquid compositions")
        return fail, checked
    aadT = sum(abs(float(m[1]) - float(e[1])) for m, e in zip(mod, exp)) / len(exp)
    aadY = sum(abs(float(m[2]) - float(e[2])) for m, e in zip(mod, exp)) / len(exp)
    #  Measured 2026-11-02: monomer ideal gas (main before C201) AAD T 3.486 K,
    #  y 0.0355; associated vapour 2.187 K, 0.0272.  The ceiling sits between
    #  the two: losing the association fails this arm.  Nothing was tuned.
    if aadT > 2.6 or aadY > 0.031:
        fail.append(f"(k) T-x-y against Calvar et al. 2005: AAD T {aadT:.3f} K, "
                    f"y_water {aadY:.4f} -- above the associated-vapour ceiling "
                    "(2.6 K, 0.031; the monomer ideal gas read 3.49 K, 0.0355)")
    else:
        checked.append(f"acetic acid/water T-x-y at 1 atm (UNIFAC + associated "
                       f"vapour) against Calvar et al. 2005: AAD T {aadT:.3f} K, "
                       f"y_water {aadY:.4f} (monomer ideal gas: 3.486 K, 0.0355)")
    return fail, checked


if __name__ == "__main__":
    sys.exit(main())
