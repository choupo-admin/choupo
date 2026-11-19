#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: a pressure the dictionary reader already returned in SI is never rescaled as if it were bar.

    bin/curate/check_pressure_si.py

THE DEFECT THIS WOULD HAVE CAUGHT (DEV.md 4c C390, 2026-11-19).  The dictionary reader
converts `P 1.013 bar;` to SI, so every pressure a unit or a state struct holds is in PASCAL.
The batch vessel state documented its pressure as "bar" and FIVE ledger sites priced a
package at `pkg.P * 1.0e5` -- a liquid at 1.0e10 Pa.  Nothing read the pressure of a liquid,
and a vapour on an ideal gas does not depend on it, so the error was silent until the liquid
enthalpy gained its pressure term: still01_benzene_toluene moved its reboiler from +30 to -468
kJ, recipe04's T_final from 317 to 345 K, diafilter01's intake by 1.15e6 kJ.  The same pattern
was then found in two dynamic units (a constant-volume CSTR and the Williams-Otto plant).

TWO RULES, counted over src/unitOperations, src/dynamicDriver, src/applications and
src/postProcessing (comment lines, `//` tails and string literals excluded), zero debt:
  scale   a pressure-named operand (P, Pin, Pout, P_in, P_out, P_op_, P_, P1, Pfeed, `.P`,
          `->P`, ...) MULTIPLIED by 1e5 / 1.0e5 / 100000: bar -> Pa applied to a quantity
          that is already Pa.  A division by 1e5 (Pa -> bar, for a printed line or a `_bar`
          KPI) is the right direction and is not counted; `Pc` (the component record's
          critical pressure IS in bar), a name that says bar (`pressureDesign_bar`,
          `P_bar`) and a non-pressure operand (`pd->second`) are not pressure-named.
  header  a pressure MEMBER declared in a header whose trailing comment says bar
          (`scalar P = 0; // pressure [bar]`): the comment that makes the next author
          write the multiplication above.
Each rule is proved against probe lines before the tree is read (a probe the rule does not
catch, or a clean line it does, fails the gate).

NOT CHECKED, said plainly: a rescaling spelled with a named constant, a pressure carried under a
name that does not start with P, and the right unit of a number that is only COMPARED.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DIRS = ["src/unitOperations", "src/dynamicDriver", "src/applications", "src/postProcessing"]

SCALE = re.compile(
    r"(?:(?<![A-Za-z0-9_])|(?<=\.)|(?<=->))"
    r"(P|Pin|Pout|Pfeed|P_in|P_out|P_op_?|P_|P[0-9]|P_feed|PoutN|Pmid)"
    r"\s*(?:\)\s*)?\*\s*(?:1\.?0?e\+?5|100000(?:\.0)?)\b")
HEADER = re.compile(
    r"\b(?:scalar|double|float)\s+(?:P|P_|P_op_|Pin|Pout)\b[^;]*;\s*//.*\bbar\b", re.I)

PROBES_BAD = {
    "scale": ["return thermo.H_stream_formation(pkg.T, pkg.P * 1.0e5, vf, z);",
              "const scalar P_Pa = state_.P > 0.0 ? state_.P * 1.0e5 : 1.0e5;",
              "x = H(T, P_op_ * 1.0e5, z);", "y = P_ * 1e5;"],
    "header": ["    scalar  P = 0;   // pressure [bar]",
               "    scalar   P_ = 1.0;             // bar (not used)"],
}
PROBES_OK = {
    "scale": ["sol.K[i] = (c.Pc() * 1.0e5 / in.P);", "std::cout << (P / 1.0e5) << \" bar\";",
              "const scalar P_Pa = pressureDesign_bar * 1.0e5;", "Pset_g = pd->second * 1.0e5;",
              "kpis_[\"P_out_bar\"] = P_out / 1.0e5;"],
    "header": ["    scalar  P = 0;   // pressure [Pa]", "    scalar  Pc = 0;   // [bar]"],
}


def strip(code):
    code = re.sub(r'"(?:[^"\\]|\\.)*"', '""', code)
    return re.sub(r"//.*$", "", code)


def hits(rule, line):
    code = strip(line)
    return bool((SCALE if rule == "scale" else HEADER).search(code if rule == "scale" else line))


def main():
    for rule in ("scale", "header"):
        for p in PROBES_BAD[rule]:
            if not hits(rule, p):
                print(f"check_pressure_si: FAIL -- the {rule} rule does not catch its probe: {p}")
                return 1
        for p in PROBES_OK[rule]:
            if hits(rule, p):
                print(f"check_pressure_si: FAIL -- the {rule} rule flags a clean line: {p}")
                return 1
    found = []
    nfiles = 0
    for d in DIRS:
        for f in sorted((ROOT / d).rglob("*")):
            if f.suffix not in (".cpp", ".H"):
                continue
            nfiles += 1
            in_block = False
            for n, line in enumerate(f.read_text(errors="replace").splitlines(), 1):
                s = line.strip()
                if in_block:
                    if "*/" in s:
                        in_block = False
                    continue
                if s.startswith("/*") and "*/" not in s:
                    in_block = True
                    continue
                if s.startswith("//") or s.startswith("*"):
                    continue
                if hits("scale", line):
                    found.append((f.relative_to(ROOT), n, "scale", s))
                if f.suffix == ".H" and hits("header", line):
                    found.append((f.relative_to(ROOT), n, "header", s))
    if found:
        print(f"check_pressure_si: FAIL -- {len(found)} site(s):")
        for p, n, r, s in found:
            print(f"  {p}:{n} [{r}] {s[:150]}")
        print("  A pressure read through the dictionary reader is Pa already; a header comment saying bar is the bug's seed.")
        return 1
    print(f"check_pressure_si: OK -- {nfiles} files of {', '.join(DIRS)}: no pressure-named operand is multiplied by 1e5 and no pressure member is documented in bar; "
          f"both rules caught all their probe lines.  NOT CHECKED: a rescaling by a named constant, a pressure under a name that does not start with P, "
          f"and whether a number that is only compared is in the right unit.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
