#!/usr/bin/env python3
# NEGATIVE-PARITY GATE: every refusal the engine's grammar promises must be
# demonstrated EXECUTABLE.  Builds tiny bad systems in a temp case and asserts
# each one is REFUSED with the named message -- a silent acceptance (exit 0)
# FAILS the gate.  Two families:
#   NEGATIVES        -- bad thermophysicalPropertySystem bodies (choupoProps)
#   GRAMMAR_NEGATIVES -- retired public grammar homes: block-form component,
#                        bare nonvolatile bool, constant/propertyDict,
#                        streams{} authored in a steady flowsheetDict
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
    if fails:
        print("V2 NEGATIVE-PARITY GATE FAILED (%d):" % len(fails))
        for f in fails: print("  " + f)
        return 1
    print("v2 negative-parity gate: %d refusals verified with their named"
          " messages" % (len(NEGATIVES) + len(GRAMMAR_NEGATIVES)))
    return 0

if __name__ == "__main__":
    sys.exit(main())
