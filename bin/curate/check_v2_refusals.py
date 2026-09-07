#!/usr/bin/env python3
# NEGATIVE-PARITY GATE: every refusal the engine's grammar promises must be
# demonstrated EXECUTABLE.  Builds tiny bad systems in a temp case and asserts
# each one is REFUSED with the named message -- a silent acceptance (exit 0)
# FAILS the gate.  Two families:
#   NEGATIVES        -- bad thermophysicalPropertySystem bodies (choupoProps)
#   GRAMMAR_NEGATIVES -- retired public grammar homes: block-form component,
#                        bare nonvolatile bool, constant/propertyDict,
#                        streams{} authored in a steady flowsheetDict
#   SOLID_PHASE       -- a chemistryDict `solidPhases ( ... )` word that no
#                        record owns.  Added 2026-09-07 after the reverse was
#                        measured: `solidPhases ( sylvite );` on a NaCl brine
#                        -- a real mineral, but potassium's -- ran to exit 0
#                        with m_sat 1e-9, Ksp 0 and a crystalliser yield of
#                        0.999999999868 against the correct 0.18832, seal
#                        "verified", and one line of trace reading like
#                        physics: "Solubility c_sat(T_op) = 0.000 kg NaCl /
#                        kg water".  Nothing validated the phase NAME:
#                        ChemistrySystem::read checks the KEYS inside
#                        `equilibria {}` and never the words in the list.
#                        The arm has three parts, and the middle one is the
#                        reason it is not simply "refuse a phase with no
#                        anchor": OWNERSHIP is the test, not completeness.
#                        flash16/flash19 declare `calcite`, which CaCO3.dat
#                        owns with a mass-action Ksp and NO calorimetric
#                        block, and refusing that would refuse a correct
#                        case.  So an owned phase with no anchor is
#                        ANNOUNCED instead, and the third part witnesses the
#                        announcement.
#
# SABOTAGES PERFORMED BY HAND on 2026-09-07 against the solid-phase arm, each
# restored and the engine rebuilt.  The lines are what the gate printed:
#   S5  the ownership refusal deleted -> "solid-phase-unowned: ACCEPTED
#       (exit 0) -- a declared phase no record owns is tolerated again, and the
#       saturation anchor stays silently ZERO".
#   S6  the refusal widened to fire on EVERY phase (`if (true)`) -> both
#       negatives fired: "solid-phase-owned: `halite`, which NaCl.dat
#       declares, did not run clean (exit 1)" and "solid-phase-noanchor: an
#       owned phase added by a case overlay was refused as unowned".
#   S7  the anchor ANNOUNCEMENT deleted, refusal intact -> "solid-phase-
#       noanchor: an owned phase with no `calorimetric` anchor is NOT
#       announced. ..."
# S5 SURVIVED ITS FIRST RUN in a weaker form: the probe op was the
# propertyPoint asking for Z, which dies on the salt's missing ideal-gas datum,
# so the sabotaged run still exited 1 and the gate reported only "refused but
# WITHOUT the named message".  A probe that cannot reach exit 0 cannot tell a
# silent acceptance from an unrelated refusal, so the op was changed to
# `electrolyteActivity`, which exercises the assembled package and returns 0.
import subprocess, sys, tempfile, os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROPS = ROOT / "build" / "linux64Gcc" / "choupoProps"
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"

BASE_PROPS = """operations
(
    { name p; type propertyPoint;
      state { T 300 K; P 1 bar; composition { water 1.0; } }
      properties ( Z ); }
);
"""
CTRL = 'application   choupoProps;\ndescription   "negative gate";\nverbosity 1;\n'

# (name, thermoPhysPropDict body, expected message fragment)
NEGATIVES = [
 ("unknown-formulation",
  "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
  "components ( water );\nequilibrium { formulation quantumFoam; }\n",
  "is not implemented"),
 ("chemistry-inline",
  "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
  "components ( water );\nchemistry { salts ( halite ); }\n"
  "equilibrium { formulation gammaPhi; liquid { activityModel ideal; }"
  " vapour { fugacityModel idealGas; } }\n",
  "constant/chemistryDict"),
 ("bad-standardState",
  "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
  "components ( water );\nequilibrium { formulation gammaPhi;"
  " liquid { activityModel ideal; standardState fusedSalt; }"
  " vapour { fugacityModel idealGas; } }\n",
  "standardState must be pureLiquid"),
 ("retired-pairs-key",
  "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
  "components ( water );\nequilibrium { formulation gammaPhi;"
  " liquid { activityModel { model NRTL; pairs ( { i water; j water; } ); } }"
  " vapour { fugacityModel idealGas; } }\n",
  "binaryParameters"),
 ("transport-mixingRule",
  "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
  "components ( water );\nequilibrium { formulation gammaPhi;"
  " liquid { activityModel ideal; } vapour { fugacityModel idealGas; } }\n"
  "transport { vapour { viscosity { model Chung; mixingRule Wilke; } } }\n",
  "mixingRule is not SELECTABLE"),
 ("electrolyte-bad-model",
  "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
  "components ( water NaCl );\nequilibrium { formulation electrolyteGammaPhi;"
  " aqueous { activityModel { model Debye; } }"
  " vapour { fugacityModel idealGas; } }\n",
  "implemented: Pitzer | eNRTL"),
 ("electrolyte-bad-basis",
  "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
  "components ( water NaCl );\nequilibrium { formulation electrolyteGammaPhi;"
  " aqueous { activityModel { model Pitzer; } compositionBasis moleFraction; }"
  " vapour { fugacityModel idealGas; } }\n",
  "molality-based"),
 ("dilute-bad-rung",
  "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
  "components ( water CO2 );\nequilibrium { formulation diluteSolution;"
  " liquid { solvent { component water; standardState infiniteDilution; }"
  " solutes { components ( CO2 ); } } vapour { fugacityModel idealGas; } }\n",
  "pureLiquid (Raoult) rung"),
 ("caloric-bad-basis",
  "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
  "components ( water );\nequilibrium { formulation gammaPhi;"
  " liquid { activityModel ideal; } vapour { fugacityModel idealGas; } }\n"
  "caloric { energyBasis steamTables; }\n",
  "elementsDatum"),
 ("aqueous-bad-model",
  "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
  "components ( water );\naqueousProperties { activityCoefficients"
  " { model Margules; } }\n",
  "implemented: Davies | PitzerHMW"),
]

V2_SYSTEM = (
    "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
    "components ( badcomp );\nequilibrium { formulation gammaPhi;"
    " liquid { activityModel ideal; } vapour { fugacityModel idealGas; } }\n")
BADCOMP_PROPS = BASE_PROPS.replace("water", "badcomp")

# (name, {relative path: content or None to delete}, binary, expected fragment)
GRAMMAR_NEGATIVES = [
 ("component-block-form",
  {"constant/components/badcomp.dat": "identity\n{\n    name badcomp;\n"
                                      "    MW 18.0;\n}\n"},
  "props", "is not the component grammar"),
 ("component-nonvolatile-bool",
  {"constant/components/badcomp.dat": "name badcomp;\nMW 18.0;\n"
                                      "nonvolatile true;\n"},
  "props", "role nonvolatile"),
 ("component-speciesMap-home",
  {"constant/components/badcomp.dat": "name badcomp;\nMW 18.0;\n"
   "component\n{\n    speciesMap { Na 1; Cl 1; }\n}\n"},
  "props", "is not the component grammar"),
 ("case-propertyDict-v1",
  {"constant/components/badcomp.dat": "name badcomp;\nMW 18.0;\n",
   "constant/thermoPhysPropDict": None,
   "constant/propertyDict": V2_SYSTEM},
  "props", "constant/thermoPhysPropDict"),
 ("flowsheet-streams-nested",
  {"system/controlDict": 'application   choupoSolve;\n'
                         'description   "negative gate";\nverbosity 1;\n',
   "system/flowsheetDict":
       "sectors ( sub );\nconnections\n{\n    feed { to sub/feed; }\n"
       "    hot  { from sub/hot; }\n}\n",
   "sub/flowsheetDict":
       "name sub;\ntype heater;\n"
       "boundary { inlets ( feed ); outlets ( hot ); }\n"
       "operation { T_out 350 K; }\n"
       "streams { x { T 300; } }\n",
   "constant/thermoPhysPropDict": V2_SYSTEM.replace("badcomp", "water")},
  "solve", "the sub-flowsheet 'sub'"),
 ("flowsheet-streams-block",
  {"system/controlDict": 'application   choupoSolve;\n'
                         'description   "negative gate";\nverbosity 1;\n',
   "system/flowsheetDict":
       "units\n(\n    { name H1; type heater; in feed; out hot;"
       " operation { T_out 350 K; } }\n);\n"
       "streams\n{\n    feed { T 300; P 1e5; F 1.0; z ( 1.0 ); }\n}\n",
   "constant/thermoPhysPropDict": V2_SYSTEM.replace("badcomp", "water")},
  "solve", "the legacy steady stream-state reader does not exist"),
]


# ---- SOLID_PHASE: the chemistryDict phase-name arm ------------------------
ELECTROLYTE_SYSTEM = (
    "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
    "components ( water NaCl );\nequilibrium { formulation"
    " electrolyteGammaPhi; aqueous { activityModel { model Pitzer; } }"
    " vapour { fugacityModel idealGas; } }\n")
#  A brine op that really EXERCISES the assembled package and exits 0 when it
#  is well formed -- the propertyPoint probe used elsewhere in this file asks
#  for Z and dies on the salt's missing ideal-gas datum, which would leave the
#  arm unable to tell a silent acceptance from an unrelated refusal.
BRINE_PROPS = ("operations\n(\n    { name g; type electrolyteActivity;"
               " molality { from 0.5; to 1.0; n 2; }"
               " output { file probe.csv; } }\n);\n")
CHEMISTRY = ("recordType    chemistrySystem;\nschemaVersion 1;\n"
             "equilibria { solidPhases ( %s ); }\n")
#  An overlay that ADDS a second phase to NaCl carrying crystal properties and
#  no calorimetric anchor.  It is the only way to reach the announcement: the
#  builder resolves the salt from the STANDARDS base, so a wholly case-local
#  salt is not seen as one, and `dolomite` -- the one standards salt whose
#  phase carries no anchor -- refuses on a missing vaporPressure block before
#  the phase is ever read.
NACL_OVERLAY = (
    "recordType    component;\noverlayOf     NaCl;\nname          NaCl;\n"
    "solidPhases\n{\n    gatePhase\n    {\n"
    "        dissolutionReaction { masters ( { ion Na; nu 1; }"
    " { ion Cl; nu 1; } ); }\n"
    "        crystal { rho_p 2165; k_v 1.0; }\n    }\n}\n")
UNOWNED_FRAG = "which no record owns"
ANNOUNCE_FRAG = "no calorimetric solubility anchor"


def solid_phase_arm(tmp):
    """Three parts: an unowned phase refuses; an owned one does not; an owned
    one with no saturation anchor is announced."""
    fails = []

    def build(tag, phase, overlay=False):
        case = Path(tmp) / ("solidphase-" + tag)
        (case / "system").mkdir(parents=True)
        (case / "constant").mkdir()
        (case / "system" / "controlDict").write_text(CTRL)
        (case / "system" / "propsDict").write_text(BRINE_PROPS)
        (case / "constant" / "thermoPhysPropDict").write_text(ELECTROLYTE_SYSTEM)
        (case / "constant" / "chemistryDict").write_text(CHEMISTRY % phase)
        if overlay:
            (case / "constant" / "components").mkdir()
            (case / "constant" / "components" / "NaCl.dat").write_text(
                NACL_OVERLAY)
        r = subprocess.run([str(PROPS), str(case)], capture_output=True,
                           text=True, cwd=ROOT)
        return r.returncode, r.stdout + r.stderr

    #  (1) a mineral no record owns -- and `sylvite` is chosen deliberately
    #      over a nonsense word: it IS a real phase, KCl's, so the refusal
    #      cannot be passing on a spelling heuristic.
    rc, out = build("unowned", "sylvite")
    if rc == 0:
        fails.append("solid-phase-unowned: ACCEPTED (exit 0) -- a declared "
                     "phase no record owns is tolerated again, and the "
                     "saturation anchor stays silently ZERO")
    elif UNOWNED_FRAG not in out:
        fails.append("solid-phase-unowned: refused but WITHOUT the named "
                     f"message ('{UNOWNED_FRAG}' absent)")
    elif "sylvite" not in out or "halite" not in out:
        fails.append("solid-phase-unowned: the refusal does not name BOTH the "
                     "phase asked for and what the salt's record declares")

    #  (2) the negative: the phase the salt really owns must not be refused,
    #      and the run must reach exit 0.  Without this half, a check that
    #      refused every phase would pass part (1) and pin nothing.
    rc, out = build("owned", "halite")
    if UNOWNED_FRAG in out or rc != 0:
        fails.append("solid-phase-owned: `halite`, which NaCl.dat declares, "
                     f"did not run clean (exit {rc}) -- the check cannot tell "
                     "an unowned phase from an owned one")

    #  (3) an OWNED phase with no calorimetric anchor is ANNOUNCED, not
    #      refused: the run must still reach exit 0 and must carry the line.
    rc, out = build("noanchor", "gatePhase", overlay=True)
    if UNOWNED_FRAG in out:
        fails.append("solid-phase-noanchor: an owned phase added by a case "
                     "overlay was refused as unowned -- ownership is being "
                     "read from the standards base alone, so a case's own "
                     "declared phase cannot be used")
    elif ANNOUNCE_FRAG not in out:
        fails.append("solid-phase-noanchor: an owned phase with no "
                     "`calorimetric` anchor is NOT announced.  This adapter "
                     "reads no other saturation datum, so the molality it "
                     "uses is zero and the run reports essentially complete "
                     "crystallisation -- the exact silence the unowned-phase "
                     "refusal exists to end, arriving by the other road.")
    return fails


def run_grammar_negative(tmp, name, layout, binary, frag):
    case = Path(tmp) / name
    (case / "system").mkdir(parents=True)
    (case / "constant" / "components").mkdir(parents=True)
    (case / "system" / "controlDict").write_text(CTRL)
    (case / "system" / "propsDict").write_text(BADCOMP_PROPS)
    (case / "constant" / "thermoPhysPropDict").write_text(V2_SYSTEM)
    for rel, content in layout.items():
        p = case / rel
        if content is None:
            p.unlink(missing_ok=True)
        else:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content)
    binpath = PROPS if binary == "props" else SOLVE
    r = subprocess.run([str(binpath), str(case)], capture_output=True,
                       text=True, cwd=ROOT)
    out = r.stdout + r.stderr
    if r.returncode == 0:
        return f"{name}: ACCEPTED (exit 0) -- the refusal is gone"
    if frag not in out:
        return (f"{name}: refused but WITHOUT the named message"
                f" ('{frag}' absent)")
    return None


def main():
    fails = []
    with tempfile.TemporaryDirectory(prefix="choupo-neg-") as tmp:
        case = Path(tmp) / "neg"
        (case / "system").mkdir(parents=True)
        (case / "constant").mkdir()
        (case / "system" / "controlDict").write_text(CTRL)
        (case / "system" / "propsDict").write_text(BASE_PROPS)
        for name, body, frag in NEGATIVES:
            (case / "constant" / "thermoPhysPropDict").write_text(body)
            r = subprocess.run([str(PROPS), str(case)], capture_output=True,
                               text=True, cwd=ROOT)
            out = r.stdout + r.stderr
            if r.returncode == 0:
                fails.append(f"{name}: ACCEPTED (exit 0) -- the refusal is gone")
            elif frag not in out:
                fails.append(f"{name}: refused but WITHOUT the named message"
                             f" ('{frag}' absent)")
        for name, layout, binary, frag in GRAMMAR_NEGATIVES:
            bad = run_grammar_negative(tmp, name, layout, binary, frag)
            if bad:
                fails.append(bad)
        fails.extend(solid_phase_arm(tmp))
    if fails:
        print("V2 NEGATIVE-PARITY GATE FAILED (%d):" % len(fails))
        for f in fails: print("  " + f)
        return 1
    print("check_v2_refusals: OK -- %d refusals verified with their named"
          " messages, plus the solid-phase arm (a chemistryDict phase no"
          " record owns REFUSES naming the phase and what the salt declares;"
          " the phase it does own is not refused; an owned phase with no"
          " calorimetric anchor is ANNOUNCED, not refused).  DOMAIN: the v2"
          " grammar's own refusals, driven through choupoProps/choupoSolve on"
          " temp cases.  LIMITS: it proves each refusal FIRES with its"
          " message, never that the message is the right advice; the"
          " solid-phase arm covers the single-salt electrolyte adapter only --"
          " the gammaPhi and reactive paths read the phase list elsewhere and"
          " are not tested here."
          % (len(NEGATIVES) + len(GRAMMAR_NEGATIVES)))
    return 0

if __name__ == "__main__":
    sys.exit(main())
