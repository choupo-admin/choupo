#!/usr/bin/env python3
# NEGATIVE-PARITY GATE (Codex 2026-07-18): every refusal the retired
# translateV2 scaffold enforced must survive in the NATIVE reader/dispatch.
# Builds tiny bad systems in a temp case and asserts each one is REFUSED
# with the named message -- a silent acceptance (exit 0) FAILS the gate.
import subprocess, sys, tempfile, os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROPS = ROOT / "build" / "linux64Gcc" / "choupoProps"

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
  "RETIRED"),
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
    if fails:
        print("V2 NEGATIVE-PARITY GATE FAILED (%d):" % len(fails))
        for f in fails: print("  " + f)
        return 1
    print("v2 negative-parity gate: %d refusals verified with their named"
          " messages" % len(NEGATIVES))
    return 0

if __name__ == "__main__":
    sys.exit(main())
