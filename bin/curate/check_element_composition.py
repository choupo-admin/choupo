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


# ---------------------------------------------------------------------------
#  Component-level resolver cases (the ratified elementalComposition{}
#  contract): declared blocks convert via MW/AW into the SAME canonical
#  atoms basis; consistency, closure, provenance and PARTIAL are enforced.
# ---------------------------------------------------------------------------
PROV = ("provenance\n{\n    elementalComposition\n    {\n"
        "        origin  measured;\n"
        "        method  \"gate fixture ultimate analysis\";\n    }\n}\n")

# kerosene-like cut: C 0.85, H 0.148, unaccounted 0.002; MW 170.
CUT_OK = ("name petCut;\nformula pseudo;\nMW 170.0;\nrole nonvolatile;\n"
          "elementalComposition\n{\n    basis massFraction;\n"
          "    massFractions { C 0.85; H 0.148; }\n"
          "    unaccountedMassFraction 0.002;\n}\n" + PROV)

COMPONENT_CASES = [
    # (name, .dat body, expected fragments in the op output)
    ("declared-massFraction-PARTIAL", CUT_OK,
     ["declaredMassFraction", "PARTIAL", "unaccounted"]),
    ("declared-formulaUnit", (
        "name pclUnit;\nformula pseudo;\nMW 114.144;\nrole nonvolatile;\n"
        "elementalComposition\n{\n    basis formulaUnit;\n"
        "    atomCounts { C 6; H 10; O 2; }\n}\n" + PROV),
     ["declaredFormulaUnit", "full", "C 6", "O 2"]),
    ("formula-block-consistent", (
        "name tolCheck;\nformula C7H8;\nMW 92.141;\nrole nonvolatile;\n"
        "elementalComposition\n{\n    basis massFraction;\n"
        "    massFractions { C 0.9124; H 0.0875; }\n"
        "    unaccountedMassFraction 0.0001;\n}\n" + PROV),
     ["formula", "full"]),
    ("formula-block-DIVERGENT", (
        "name badTol;\nformula C7H8;\nMW 92.141;\nrole nonvolatile;\n"
        "elementalComposition\n{\n    basis massFraction;\n"
        "    massFractions { C 0.80; H 0.20; }\n"
        "    unaccountedMassFraction 0.0;\n}\n" + PROV),
     ["UNAVAILABLE", "DISAGREE"]),
]

# malformed declarations REFUSE at component read (fatal run, named reason)
REFUSAL_CASES = [
    ("sum-off", ("name bad1;\nformula pseudo;\nMW 100.0;\nrole nonvolatile;\n"
        "elementalComposition\n{\n    basis massFraction;\n"
        "    massFractions { C 0.5; }\n"
        "    unaccountedMassFraction 0.0;\n}\n" + PROV),
     "!= 1"),
    ("unaccounted-missing", ("name bad2;\nformula pseudo;\nMW 100.0;\n"
        "role nonvolatile;\nelementalComposition\n{\n"
        "    basis massFraction;\n    massFractions { C 1.0; }\n}\n" + PROV),
     "MANDATORY"),
    ("negative-w", ("name bad3;\nformula pseudo;\nMW 100.0;\n"
        "role nonvolatile;\nelementalComposition\n{\n"
        "    basis massFraction;\n    massFractions { C 1.2; H -0.2; }\n"
        "    unaccountedMassFraction 0.0;\n}\n" + PROV),
     "finite and >= 0"),
    ("provenance-missing", ("name bad4;\nformula pseudo;\nMW 100.0;\n"
        "role nonvolatile;\nelementalComposition\n{\n"
        "    basis massFraction;\n    massFractions { C 1.0; }\n"
        "    unaccountedMassFraction 0.0;\n}\n"),
     "provenance.elementalComposition"),
    ("provenance-typo-origin", ("name bad5;\nformula pseudo;\nMW 100.0;\n"
        "role nonvolatile;\nelementalComposition\n{\n"
        "    basis massFraction;\n    massFractions { C 1.0; }\n"
        "    unaccountedMassFraction 0.0;\n}\n"
        "provenance\n{\n    elementalComposition\n    {\n"
        "        origin  literatre;\n        method  \"x\";\n    }\n}\n"),
     "provenance.elementalComposition"),
    ("formulaUnit-MW-mismatch", ("name bad6;\nformula pseudo;\nMW 500.0;\n"
        "role nonvolatile;\nelementalComposition\n{\n"
        "    basis formulaUnit;\n    atomCounts { C 6; H 10; O 2; }\n}\n"
        + PROV),
     "does not reproduce"),
    ("formulaUnit-unaccounted-forbidden", ("name bad7;\nformula pseudo;\n"
        "MW 114.144;\nrole nonvolatile;\nelementalComposition\n{\n"
        "    basis formulaUnit;\n    atomCounts { C 6; H 10; O 2; }\n"
        "    unaccountedMassFraction 0.0;\n}\n" + PROV),
     "FORBIDDEN"),
]


def run_component_case(tmp, name, dat, opBody):
    case = Path(tmp) / name
    (case / "system").mkdir(parents=True)
    (case / "constant" / "components").mkdir(parents=True)
    (case / "system" / "controlDict").write_text(CTRL)
    (case / "system" / "propsDict").write_text(opBody)
    (case / "constant" / "thermoPhysPropDict").write_text(
        V2.replace("water", dat.split(";")[0].split()[-1]))
    comp = dat.split(";")[0].split()[-1]
    (case / "constant" / "components" / (comp + ".dat")).write_text(dat)
    return subprocess.run([str(PROPS), str(case)], capture_output=True,
                          text=True, cwd=ROOT)


def component_gate(bad):
    with tempfile.TemporaryDirectory(prefix="choupo-elemc-") as tmp:
        for name, dat, frags in COMPONENT_CASES:
            comp = dat.split(";")[0].split()[-1]
            op = ("operations\n(\n    { name atoms;"
                  " type elementalComposition;"
                  f" components ( {comp} ); }}\n);\n")
            r = run_component_case(tmp, name, dat, op)
            out = r.stdout + r.stderr
            if r.returncode != 0:
                bad.append(f"{name}: run failed: {out[-300:]}")
                continue
            for f in frags:
                if f not in out:
                    bad.append(f"{name}: '{f}' absent from the op output")
        for name, dat, frag in REFUSAL_CASES:
            comp = dat.split(";")[0].split()[-1]
            op = ("operations\n(\n    { name atoms;"
                  " type elementalComposition;"
                  f" components ( {comp} ); }}\n);\n")
            r = run_component_case(tmp, name, dat, op)
            out = r.stdout + r.stderr
            if r.returncode == 0:
                bad.append(f"{name}: ACCEPTED -- the refusal is gone")
            elif frag not in out:
                bad.append(f"{name}: refused WITHOUT the named reason"
                           f" ('{frag}' absent)")


if __name__ == "__main__":
    _bad = []
    component_gate(_bad)
    if _bad:
        print("ELEMENT-COMPOSITION GATE FAILED (component cases, %d):"
              % len(_bad))
        for b in _bad:
            print("  " + b)
        sys.exit(1)
    sys.exit(main())
