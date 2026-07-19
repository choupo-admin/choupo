#!/usr/bin/env python3
"""Element-composition gate: THE shared formula parser
(src/thermo/ElementComposition, surfaced by the `elementalComposition`
props op) reads the full grammar and refuses the rest LOUDLY.

Executable cases (Codex-ratified minimum + the charge-convention proofs:
a terminal sign ALONE is monovalent -- the digit before it is
STOICHIOMETRY; an explicit magnitude is sign-before-digits):
  C2H6O        -> C 2, H 6, O 1
  Ca(OH)2      -> Ca 1, O 2, H 2       (nested group x multiplier)
  CaSO4:2H2O   -> Ca 1, S 1, O 6, H 4  (hydrate with leading multiplier)
  SO4-2        -> S 1, O 4             (sign-before-digits magnitude)
  Fe+3         -> Fe 1
  Na+          -> Na 1
  NH4+         -> N 1, H 4             (the 4 is stoichiometry, NOT charge)
  HCO3-        -> H 1, C 1, O 3
  NO3-         -> N 1, O 3
  CaB(OH)4+    -> Ca 1, B 1, O 4, H 4
  C2D6O        -> D kept as its own isotope symbol, not folded into H
  NotAFormula  -> UNAVAILABLE naming the reason
  A2B          -> UNAVAILABLE (lumped toy species, not elements)

Exit 1 listing failures."""
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROPS = ROOT / "build" / "linux64Gcc" / "choupoProps"

CTRL = 'application   choupoProps;\ndescription   "element gate";\nverbosity 3;\n'
V2 = ("recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
      "components ( water );\nequilibrium { formulation gammaPhi;"
      " liquid { activityModel ideal; } vapour { fugacityModel idealGas; } }\n")
PROPS_DICT = """operations
(
    { name atoms; type elementalComposition;
      formulas ( C2H6O "Ca(OH)2" "CaSO4:2H2O" SO4-2 Fe+3 Na+ NH4+
                 HCO3- NO3- "CaB(OH)4+" C2D6O NotAFormula A2B ); }
);
"""

# expected "label -> atoms" lines; None = expected UNAVAILABLE
EXPECT = {
    "C2H6O":      {"C": 2, "H": 6, "O": 1},
    "Ca(OH)2":    {"Ca": 1, "O": 2, "H": 2},
    "CaSO4:2H2O": {"Ca": 1, "S": 1, "O": 6, "H": 4},
    "SO4-2":      {"S": 1, "O": 4},
    "Fe+3":       {"Fe": 1},
    "Na+":        {"Na": 1},
    "NH4+":       {"N": 1, "H": 4},
    "HCO3-":      {"H": 1, "C": 1, "O": 3},
    "NO3-":       {"N": 1, "O": 3},
    "CaB(OH)4+":  {"Ca": 1, "B": 1, "O": 4, "H": 4},
    "C2D6O":      {"C": 2, "D": 6, "O": 1},
    "NotAFormula": None,
    "A2B":         None,
}


def main():
    bad = []
    with tempfile.TemporaryDirectory(prefix="choupo-elem-") as tmp:
        case = Path(tmp) / "case"
        (case / "system").mkdir(parents=True)
        (case / "constant").mkdir()
        (case / "system" / "controlDict").write_text(CTRL)
        (case / "system" / "propsDict").write_text(PROPS_DICT)
        (case / "constant" / "thermoPhysPropDict").write_text(V2)
        r = subprocess.run([str(PROPS), str(case)], capture_output=True,
                           text=True, cwd=ROOT)
        out = r.stdout + r.stderr
        if r.returncode != 0:
            print("ELEMENT-COMPOSITION GATE FAILED: op errored:\n" + out[-800:])
            return 1
        for label, want in EXPECT.items():
            esc = re.escape(label)
            if want is None:
                if not re.search(esc + r"\s+->\s+UNAVAILABLE:", out):
                    bad.append(f"{label}: expected UNAVAILABLE with a reason")
                continue
            m = re.search(esc + r"\s+\(" + esc + r"\)\s+->\s+(.+)", out)
            if not m:
                bad.append(f"{label}: no decomposition line printed")
                continue
            got = {}
            for sym, n in re.findall(r"([A-Z][a-z]?)\s+([0-9.]+)", m.group(1)):
                got[sym] = float(n)
            if got != {k: float(v) for k, v in want.items()}:
                bad.append(f"{label}: got {got}, want {want}")
    if bad:
        print("ELEMENT-COMPOSITION GATE FAILED (%d):" % len(bad))
        for b in bad:
            print("  " + b)
        return 1
    print("element-composition gate: %d formulas decompose/refuse exactly"
          " as the grammar promises" % len(EXPECT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
