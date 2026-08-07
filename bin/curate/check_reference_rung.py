#!/usr/bin/env python3
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
import math
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROBE = ROOT / "build" / "linux64Gcc" / "referenceRungProbe"
SRC = ROOT / "bin" / "curate" / "_referenceRungProbe.cpp"


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

    r = subprocess.run([str(PROBE)], capture_output=True, text=True, timeout=300)
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


if __name__ == "__main__":
    sys.exit(main())
