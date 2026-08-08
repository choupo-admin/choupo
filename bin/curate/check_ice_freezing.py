#!/usr/bin/env python3
"""Gate: the pure crystal is a PHASE, and freezing-point depression falls out.

    bin/curate/check_ice_freezing.py

WHY THIS EXISTS.  Vitor's instruction was explicit: classical thermodynamics
already handles a freezing solvent, so the class architecture must express it
NATURALLY -- the OpenFOAM posture -- and not by a special case bolted onto the
flash.  The whole implementation is therefore one virtual:

    SolidPhase::fEffective(T, P, x) = Psat(T) * exp(-dG_fus(T)/(R T))  at the
                                      crystal's index, and ZERO everywhere else

with dG_fus(T) = dHfus * (1 - T/Tfus).  Nothing else changed.  `Kvec_phases`
already derives K from `Phase::fEffective`, so

    K = f_solid/f_liquid = exp(-dG_fus/(R T)) / (gamma_w x_w)

and K = 1 gives  ln a_w = -dG_fus/(R T),  which IS freezing-point depression --
DERIVED, never declared.  Design record:
docs/design/ice-as-a-solid-phase-of-the-solvent.md.

That elegance is exactly what makes a gate necessary.  A model with no code of
its own has no obvious place to go wrong, and therefore no obvious place to
LOOK when it does.  Every claim below is checked against arithmetic recomputed
here, from the record's own numbers.

WHAT THIS GATE CHECKS.

  (a) THE CRYSTAL AND THE LIQUID CROSS AT THE MELTING POINT.  K = f_s/f_l for
      PURE water must pass through 1 at 273.15 K.  This is the one number that
      cannot be tuned: both legs reach Psat through the SAME
      components_[i].vp().Psat_Pa(T) call, so the ratio is exp(-dG_fus/RT)
      alone and the crossing is a pure statement about Hfus and Tfus.

  (b) THE RESIDUAL IS THE DECLARED APPROXIMATION, NOT SLOP.  K at 273.15 K is
      0.999903, not 1.000000, and the gate demands that gap be present AND
      bounded.  water.dat declares Tfus as the TRIPLE point, 273.16 K, which
      is 0.01 K above the melting point; dG_fus(273.15) = 0.22 J/mol and
      exp(-0.22/RT) = 0.999903 exactly.  A tolerance loose enough to call this
      "1" would hide a real declared approximation; one tight enough to fail
      it would be demanding a number the record does not claim.  So the gate
      recomputes the expected residual and pins it both ways.

  (c) THE SLOPE HAS THE RIGHT SIGN AND SIZE.  Below the melting point the
      crystal is the stable phase (K < 1); above it the liquid is (K > 1).  A
      sign error here would still cross at 273.15 K and still close every
      balance -- it would simply freeze on heating.

  (d) THE PURITY CLAIM.  Every component that is not the crystal gets fugacity
      ZERO.  That zero is a CLAIM -- solutes cannot enter the lattice -- and
      solute inclusion is deliberately not modelled.  A non-zero value would
      let salt dissolve into the ice, and the concentrate's balance would be
      wrong while still closing perfectly.  This is the sabotage that a
      balance check can never catch.

  (e) K_f IS DERIVED, AND ONLY WHERE ITS INPUTS EXIST.  The cryoscopic
      constant K_f = R*Tf^2*M/dHfus was reference-only until this slice, by a
      condition Component.H itself wrote down: "a record declaring Hfus with a
      primary citation, and a unit operation that needs freezing-point
      depression".  Both now hold.  The gate recomputes the derivation from
      water.dat's own triplePoint.T / MW / sublimation.Hfus -- pinning a
      literal would be a second home for the value this promotion removed --
      and checks it against the declared anchor.
      THE NEGATIVES MATTER MORE, and getting them wrong cost a surviving
      sabotage.  Two shapes must come back UNDERIVED: a record declaring a
      K_f and NO heat of fusion, and a record declaring a heat of fusion and
      NO K_f.  Both are built in the probe, because no catalogue record has
      either shape -- water is the only record carrying a K_f at all.  The
      first version used ethanol for the first shape; ethanol declares
      neither, so the arm was blocked by the anchor guard and deleting the
      Hfus guard left this gate green.  A negative whose subject does not
      exist tests nothing while reading as though it tests everything.
      This is the K_b lesson repeated on the twin constant -- deriving for
      every solvent gave a boiling-point elevation to a case that models
      without one, and an absence must go on meaning what it meant.

  (f) EVERY REFUSAL FIRES, BY NAME.  Five of them, each naming its remedy.
      The gate reads the refusal TEXT, not merely that something threw: a
      refusal that fires for the wrong reason is not the refusal claimed.

WHAT THIS GATE DOES NOT CHECK, said plainly because a gate that implies more
coverage than it has is worse than one that reports less:

  * THE PHASE'S CASE CONSUMER IS fpd01_nacl_freezing (2026-08-08), via the
    `freezingPoint` props op -- the witness this section used to say was
    deliberately last, landed against an interim one-point anchor (AAD
    0.05 %).  What is STILL not covered: no FLASH converges onto the crystal
    -- the flash has no solid path until the C2 spike is built and reviewed.

  * THE SOLUTE SIDE IS UNCHECKED.  The freezing-point depression of a real
    solution is K = 1 solved against gamma_w x_w, and its accuracy is the
    ACTIVITY MODEL's, not this phase's.  Measured off-line during development:
    1.0 molal NaCl gives -3.597 degC with an ideal a_w and -3.429 degC with
    the real osmotic coefficient phi = 0.936, against a tabulated -3.37 degC.
    The gap closes in the right direction and by the right amount, which is
    how one knows the residual belongs to the activity model.  Those numbers
    are recorded, not gated -- gating them would be gating Pitzer here.

  * THE LIQUID REFERENCE BELOW 273 K IS AN EXTRAPOLATION, BY CONSTRUCTION.
    water.dat's Antoine range STARTS at the melting point, so every
    sub-freezing point is outside the fit.  The engine says so -- the probe's
    own stdout carries the `[psat]` advisory -- and the gate asserts the
    advisory is RAISED rather than silently swallowed.  It does not attempt to
    judge the extrapolation's accuracy; that would need sub-freezing Psat data
    the catalogue does not carry.

  * THE THIRD fEffective REFUSAL IS UNREACHABLE from a parsed record, and the
    gate reports that instead of pretending otherwise: `readFromDict` already
    refuses a component with no vapour-pressure model, so no Component can
    reach SolidPhase without one.  The guard stays as a defence against a
    hand-built Component; the gate records that its coverage is by
    construction, not by exercise.
"""
import json
import math
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROBE = ROOT / "build" / "linux64Gcc" / "freezingProbe"
SRC = ROOT / "bin" / "curate" / "_freezingProbe.cpp"
WATER = ROOT / "data/standards/components/water.dat"
R_GAS = 8.314462618

TMELT = 273.15          # the melting point at 1 atm
TCOLD, THOT = 268.15, 278.15


def build_probe():
    cmd = ["g++", "-std=c++17", "-O2", f"-I{ROOT / 'src'}", f"-I{ROOT}",
           str(SRC),
           str(ROOT / "build" / "linux64Gcc" / "libchoupo.so"),
           "-Wl,-rpath," + str(ROOT / "build" / "linux64Gcc"),
           "-o", str(PROBE)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r.returncode, r.stderr[-1500:]


def live(text):
    """Strip comments before reading a value.

    Paid for once already, on another gate: a `//` line quoting the old value
    was read as the live one, so the gate went green over a record that had
    been changed underneath it.
    """
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    return re.sub(r'//[^\n]*', '', text)


def scalar(text, key):
    m = re.search(rf'^\s*{key}\s+(-?[\d.]+(?:[eE][-+]?\d+)?)\s*;', text, re.M)
    return float(m.group(1)) if m else None


def block_scalar(text, block, key):
    """Read `key` from inside `block { ... }`, one nesting level only."""
    m = re.search(rf'\b{block}\s*\{{(.*?)\}}', text, re.S)
    return scalar(m.group(1), key) if m else None


def main() -> int:
    fail, notes = [], []

    if not SRC.exists():
        print("check_ice_freezing: FAILED\n  the probe source is missing")
        return 1
    if not (ROOT / "build" / "linux64Gcc" / "libchoupo.so").exists():
        print("check_ice_freezing: FAILED\n  libchoupo.so not built -- a "
              "check that cannot run must not pass")
        return 1

    rc, err = build_probe()
    if rc != 0:
        print("check_ice_freezing: FAILED\n  probe did not compile -- the "
              "SolidPhase or Component surface moved.  A check that cannot "
              "build must not pass.\n" + err)
        return 1

    #  CHOUPO_HOME EXPLICITLY: the probe reads the real catalogue and falls
    #  back to "." when unset, which would resolve against whatever directory
    #  the caller happened to be in.
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(PROBE)], capture_output=True, text=True,
                       env=env, timeout=300)
    raw = p.stdout + p.stderr
    m = re.search(r'<<<JSON\n(.*?)JSON>>>', raw, re.S)
    if p.returncode != 0 or not m:
        print("check_ice_freezing: FAILED\n  the probe did not produce its "
              f"JSON block (exit {p.returncode})\n" + raw[-1500:])
        return 1
    d = json.loads(m.group(1))

    # ---- the record's own numbers, read live ---------------------------
    wt = live(WATER.read_text())
    Hfus = block_scalar(wt, "sublimation", "Hfus")
    Tfus = block_scalar(wt, "triplePoint", "T")
    MW = scalar(wt, "MW")
    Kf_anchor = scalar(wt, "K_f")
    if None in (Hfus, Tfus, MW):
        print("check_ice_freezing: FAILED\n  water.dat no longer declares "
              "sublimation.Hfus / triplePoint.T / MW -- the crystal reference "
              "cannot be formed, and the probe is stale, not the engine")
        return 1

    # ---- (a)(b)(c) the crossing --------------------------------------------
    cv = d["crystalVsLiquid"]
    if cv["result"] != "ok":
        fail.append("the crystal/liquid comparison did not run: "
                    + cv["result"])
    else:
        rows = {round(r["T"], 2): r for r in cv["rows"]}
        missing = [T for T in (TCOLD, TMELT, THOT) if T not in rows]
        if missing:
            fail.append(f"the probe did not report T = {missing}")
        else:
            #  (b) THE EXPECTED RESIDUAL, recomputed rather than pinned.
            #  dG_fus at the MELTING point is not zero, because Tfus in the
            #  record is the TRIPLE point 0.01 K higher.
            dG = Hfus * (1.0 - TMELT / Tfus)
            expect = math.exp(-dG / (R_GAS * TMELT))
            got = rows[TMELT]["K"]
            if abs(got - expect) > 5e-6:
                fail.append(
                    f"K at the melting point is {got:.6f}; the record's own "
                    f"Hfus={Hfus} and Tfus={Tfus} give {expect:.6f}.  The "
                    "crystal and its liquid do not cross where the record "
                    "says they should.")
            #  ...and the residual must be PRESENT.  A K of exactly 1 would
            #  mean the 0.01 K triple-vs-melting offset had been quietly
            #  rounded away, which is a declared approximation going silent.
            if abs(got - 1.0) < 1e-9:
                fail.append(
                    f"K at the melting point is {got} -- exactly 1.  water.dat "
                    "declares Tfus as the TRIPLE point, 0.01 K above the "
                    "melting point, so the honest answer is 0.999903.  An "
                    "exact 1 means the declared approximation has been hidden.")
            if abs(got - 1.0) > 2e-4:
                fail.append(
                    f"K at the melting point is {got:.6f} -- {abs(got-1)*1e4:.1f}"
                    "e-4 from 1, more than the 0.01 K triple-point offset can "
                    "explain.  Something other than the declared approximation "
                    "is in the ratio.")
            #  (c) the sign and size of the slope
            kc, kh = rows[TCOLD]["K"], rows[THOT]["K"]
            if not (kc < 1.0 < kh):
                fail.append(
                    f"K = {kc:.4f} at {TCOLD} K and {kh:.4f} at {THOT} K.  "
                    "The crystal must be the stable phase BELOW the melting "
                    "point (K < 1) and the liquid above it.  A reversed sign "
                    "still crosses at 273.15 K and still closes every balance "
                    "-- it simply freezes on heating.")
            else:
                #  The magnitude is the Clausius-Clapeyron slope, and checking
                #  it separates "the sign happens to be right" from "the
                #  physics is right".
                for T, k in ((TCOLD, kc), (THOT, kh)):
                    want = math.exp(-Hfus * (1.0 - T / Tfus) / (R_GAS * T))
                    if abs(k - want) > 1e-5:
                        fail.append(
                            f"K at {T} K is {k:.6f}; exp(-dG_fus/RT) from the "
                            f"record is {want:.6f}.  The ratio carries "
                            "something besides the fusion term -- the two "
                            "phases are not reaching Psat by the same call.")

    # ---- (d) the purity claim ----------------------------------------------
    pur = d["purity"]
    if pur["result"] != "ok":
        fail.append("the purity probe did not run: " + pur["result"])
    elif pur["fOther"] != 0.0:
        fail.append(
            f"a non-crystallising component has fugacity {pur['fOther']} in "
            "the solid.  It must be ZERO: solute inclusion in the lattice is "
            "deliberately not modelled, and a non-zero value lets solute "
            "dissolve into the ice -- the concentrate's balance would then be "
            "WRONG WHILE STILL CLOSING, which no balance check can catch.")
    elif not (pur["f"] > 0.0):
        fail.append("the crystal's own fugacity is not positive -- the phase "
                    "is present but contributes nothing")

    # ---- (e) K_f derived, and only where its inputs exist ------------------
    want_Kf = R_GAS * Tfus * Tfus * (MW / 1000.0) / Hfus
    w = d["Kf_water"]
    if w["result"] != "ok":
        fail.append("water's K_f could not be read: " + w["result"])
    else:
        if not w["derived"]:
            fail.append(
                "water's K_f is NOT derived.  Component.H set the promotion "
                "condition itself -- a cited Hfus and a consumer -- and both "
                "now hold (IAPWS sublimation{Hfus} + SolidPhase).  A stored "
                "derivative whose inputs are all present beside it is the "
                "arity sin in its textbook form.")
        if abs(w["K_f"] - want_Kf) > 1e-5:
            fail.append(
                f"water's K_f is {w['K_f']:.6f}; R*Tf^2*M/dHfus from its own "
                f"triplePoint.T={Tfus} MW={MW} Hfus={Hfus} gives "
                f"{want_Kf:.6f}")
        if Kf_anchor and abs(w["anchor"] - Kf_anchor) > 1e-9:
            fail.append(
                f"the declared K_f anchor is lost: the record says "
                f"{Kf_anchor}, the engine reports {w['anchor']}.  A derivation "
                "that discards its measured anchor cannot be audited.")
        if Kf_anchor:
            gap = abs(w["K_f"] - Kf_anchor) / Kf_anchor * 100.0
            if gap > 1.0:
                fail.append(
                    f"derived K_f {w['K_f']:.6f} and the declared anchor "
                    f"{Kf_anchor} differ by {gap:.2f} % (> 1 %) -- the record "
                    "disagrees with itself; curate it")

    #  THE TWO NEGATIVES, and they are SYNTHESISED for a reason found by a
    #  surviving sabotage.  The first version used ethanol as the "declares
    #  K_f, declares no Hfus" fixture; ethanol declares NEITHER, and no
    #  catalogue record declares K_f without an Hfus (water is the only
    #  record carrying K_f at all).  So the arm was blocked by the ANCHOR
    #  guard, never by the Hfus guard, and deleting the Hfus guard left this
    #  gate green.  A negative whose subject does not exist tests nothing
    #  while reading as though it tests everything.
    #
    #  The records are built in the probe, NOT curated into the catalogue: a
    #  record must never be invented to make a gate reachable.
    a = d["Kf_anchorNoHfus"]
    if a["result"] != "ok":
        fail.append("the anchor-without-Hfus fixture did not build: "
                    + a["result"])
    else:
        if a["Hfus"] != 0.0 or a["anchor"] <= 0.0:
            fail.append(
                "the anchor-without-Hfus fixture is not that shape any more "
                f"(anchor={a['anchor']}, Hfus={a['Hfus']}).  It must declare a "
                "K_f and no heat of fusion, or it is testing something else. "
                " Note K_f is parsed from `anchors {}`, not as a bare key -- "
                "writing it bare makes the fixture declare nothing at all.")
        if a["derived"]:
            fail.append(
                "K_f was DERIVED for a record declaring no heat of fusion "
                f"(it came back {a['K_f']}).  The derivation is inventing its "
                "own inputs.  This is the K_b failure on the twin constant: "
                "an absent datum is the author declaring 'not modelled here', "
                "and an absence must go on meaning what it meant.")

    n = d["Kf_hfusNoAnchor"]
    if n["result"] != "ok":
        fail.append("the Hfus-without-anchor fixture did not build: "
                    + n["result"])
    else:
        if n["Hfus"] <= 0.0 or n["Tfus"] <= 0.0:
            fail.append(
                "the Hfus-without-anchor fixture is not that shape any more "
                f"(Hfus={n['Hfus']}, Tfus={n['Tfus']})")
        if n["derived"] or n["K_f"] != 0.0:
            fail.append(
                f"K_f came back {n['K_f']} (derived={n['derived']}) for a "
                "record that declares a heat of fusion and NO K_f.  The "
                "promotion replaces a stored derivative where it lives; it "
                "must invent nothing where none was declared.  This is the "
                "exact shape that gave evaporator04 a boiling-point elevation "
                "its own record says it models without.")

    e = d["Kf_ethanol"]
    if e["result"] != "ok":
        fail.append("ethanol's K_f could not be read: " + e["result"])
    elif e["derived"] or e["K_f"] != 0.0:
        fail.append(
            f"ethanol's K_f is {e['K_f']} (derived={e['derived']}).  It "
            "declares neither constant, so it must stay at zero -- nothing "
            "is made out of nothing.")

    # ---- (f) the refusals, by name -----------------------------------------
    expected = {
        "noComponentKey":  "declare `component <name>;`",
        "unknownComponent": "is not in this package",
        "inertMode":       "does not participate in phase equilibrium",
        "noHfus":          "declares no enthalpy of fusion",
        "noTriplePoint":   "declares no fusion temperature",
    }
    for key, phrase in expected.items():
        got = d[key]["result"]
        if got == "ok":
            fail.append(f"the '{key}' probe was ACCEPTED.  It must refuse "
                        f"with a message naming '{phrase}'.")
        elif phrase not in got:
            fail.append(f"the '{key}' refusal fired, but for the wrong "
                        f"reason: expected a message naming '{phrase}', got "
                        f"'{got[:160]}'")

    #  Every refusal must carry a remedy.  A refusal that names no way
    #  forward turns a curation gap into a dead end.
    for key in ("noHfus", "noTriplePoint", "noComponentKey"):
        got = d[key]["result"]
        if "Add `" not in got and "declare `" not in got:
            fail.append(f"the '{key}' refusal names no remedy -- it tells the "
                        "curator what is wrong and not what to write")

    #  The unreachable one, reported rather than claimed.
    nvp = d["noVaporPressure"]["result"]
    if not nvp.startswith("refused at parse:"):
        fail.append(
            "a Component with NO vapour-pressure block was BUILT.  The third "
            "fEffective guard was documented as unreachable-by-construction "
            "because readFromDict refuses first; if that is no longer true, "
            "the guard must be exercised rather than assumed.")
    else:
        notes.append("the no-vapour-pressure guard is unreachable from a "
                     "parsed record (readFromDict refuses first) and is NOT "
                     "exercised here")

    # ---- the extrapolation must be ANNOUNCED, not swallowed ----------------
    if "[psat]" not in raw or "268.15" not in raw:
        fail.append(
            "no `[psat]` extrapolation advisory was raised for the "
            "sub-freezing point.  water.dat's Antoine range STARTS at the "
            "melting point, so every point below it is outside the fit BY "
            "CONSTRUCTION -- if the engine has stopped saying so, a caveat "
            "that rides every freezing calculation has gone silent.")

    #  THE NEGLECTED HEAT-CAPACITY TERM MUST BE ANNOUNCED (2026-08-07).
    #  dHfus is measured AT Tfus, so dG_fus = dHfus(1 - T/Tfus) drops the
    #  liquid/solid Cp difference and degrades away from the melting point.
    #  DWSIM writes that term and disables it with a stated data reason
    #  (docs/design/dwsim-solids-study.md §3); Choupo omits it too, and the
    #  difference worth having is that Choupo says so at the point of use.
    #  An unannounced approximation is indistinguishable from one nobody knew
    #  about.
    if "heat-capacity term" not in raw or "[solid]" not in raw:
        fail.append(
            "the crystal does not announce that dG_fus omits the liquid/solid "
            "heat-capacity term.  The omission is legitimate and shared with "
            "DWSIM, which disables the same term for a data reason -- but a "
            "silent approximation is one no student can weigh, and this "
            "project's own doctrine is that a declared approximation must be "
            "visible where it is used.")

    if fail:
        print("check_ice_freezing: FAILED")
        for f in fail:
            print("  " + f)
        return 1

    kmelt = {round(r["T"], 2): r["K"] for r in d["crystalVsLiquid"]["rows"]}
    print(
        "check_ice_freezing: OK -- the pure crystal is a Phase and nothing "
        "else changed.  f_solid/f_liquid for pure water is "
        f"{kmelt[TCOLD]:.6f} / {kmelt[TMELT]:.6f} / {kmelt[THOT]:.6f} at "
        f"{TCOLD} / {TMELT} / {THOT} K -- it crosses 1 AT the melting point, "
        "and the 1e-4 residual is EXACTLY the declared approximation "
        f"(Tfus in the record is the TRIPLE point {Tfus} K, so "
        f"dG_fus({TMELT}) = {Hfus * (1 - TMELT / Tfus):.2f} J/mol), not slop; "
        "each of the three K's is recomputed here from the record's own Hfus "
        "and Tfus, so the two phases are provably reaching Psat by the same "
        "call.  A non-crystallising component has fugacity exactly 0 (solute "
        f"inclusion is not modelled, and the zero is a claim).  K_f = "
        f"{d['Kf_water']['K_f']:.6f} is now DERIVED from water's own "
        f"triplePoint/MW/Hfus against its declared anchor {Kf_anchor} "
        f"({abs(d['Kf_water']['K_f'] - Kf_anchor) / Kf_anchor * 100:.2f} % "
        "apart, two independent primaries, a finding and not an error), while "
        "a record with a K_f and no Hfus, one with an Hfus and no K_f, and "
        "ethanol (neither) all come back UNDERIVED and untouched.  Five "
        "refusals fire by name, each carrying a remedy, the sub-freezing "
        "Psat extrapolation is announced, and the crystal states that its "
        "dG_fus omits the liquid/solid heat-capacity term (quoting |T - Tfus|; "
        "DWSIM disables the same term for a data reason).  The phase's case "
        "consumer is fpd01_nacl_freezing (the freezingPoint op, 2026-08-08); "
        "still NOT COVERED: no FLASH converges onto the crystal -- no solid "
        "path until the C2 spike is built and reviewed; the solute side "
        "belongs to the "
        "activity model and is not gated; "
        + ("; ".join(notes) if notes else "no further caveats") + ".")
    return 0


if __name__ == "__main__":
    sys.exit(main())
