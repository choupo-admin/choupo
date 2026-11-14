#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the liquid diffusivity a package returns is the one its property
dictionary declares, in the direction it names; a column block carries no
property; and every refusal of the slice speaks by name.

    bin/curate/check_liquid_diffusivity_declaration.py

WHAT IT HOLDS (DEV.md 4c C398 slice (d) and its rulings 1-5; Theory Guide
sec:liquid-diffusivity-declared and sec:measured-liquid-viscosity;
src/thermo/transport/LiquidTransportDeclarations.{H,cpp}).

  (1) THE WITNESS (tutorials/props/transport/liquidDiffusivity01_pelkonen_ternary)
      runs to exit 0; the measured entry of the variant `poling288` is
      returned exactly (1.26e-5 cm2/s read as 1.26e-9 m2/s, the unit column
      honoured); the opposite direction is NOT that value; the effective value
      of `binaryEffective` is the Vignes combination of the two
      infinite-dilution values the same operation prints (relative 1e-12);
      the same entry written inline gives the same value; a `use check`
      mixture viscosity is printed beside the computed one and never used;
      the view says 2-propanol's association factor is the default, and every
      record of debt_registry.ASSOCIATION_FACTOR_DEFAULTED still writes none.
  (2) REFUSALS OF THE GRAMMAR, each by its words, on a copy of the witness:
      an effective value of three components; VignesKooijmanTaylor; a file
      cited in the other direction; a file of two points; `kind fick`;
      `thermodynamicFactor { from ... }`; `returns effective` without the
      factor; an entry's datum used outside its box; a column without a unit.
  (3) THE COLUMN (a copy of ratebased01_schulz_0p10bar, its sweep removed):
      `liquidViscosity` typed back in `packing {}` is refused with the line to
      write; with no `diffusivity` block the column says what to declare; a
      measured viscosity box that misses the bed's temperatures is refused
      at its first use, never handed to another source.

WHAT IT DOES NOT CHECK: the numbers of the sixteen migrated column cases (their
goldens hold them, and the slice's byte-identity run compared every line);
that Wilke-Chang is the right correlation for a pair; that the measured
values transcribe their papers (read by the author).
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from debt_registry import ASSOCIATION_FACTOR_DEFAULTED  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
NAME = "check_liquid_diffusivity_declaration"
WITNESS = ROOT / "tutorials" / "props" / "transport" / "liquidDiffusivity01_pelkonen_ternary"
RATE = ROOT / "tutorials" / "steady" / "distillation" / "ratebased01_schulz_0p10bar"


def run(case: Path, binary: str, timeout=600):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    try:
        p = subprocess.run([str(ROOT / binary), "."], cwd=str(case), env=env,
                           capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return 124, "TIMEOUT"
    return p.returncode, p.stdout + p.stderr


def diagnostics(out):
    a = out.find("<<<Choupo:result-begin>>>")
    b = out.find("<<<Choupo:result-end>>>")
    if a < 0 or b < 0:
        return {}
    r = json.loads(out[a + len("<<<Choupo:result-begin>>>"):b])
    return {op["name"]: op.get("diagnostics", {}) for op in r.get("operationResults", [])}


def copy(src: Path, tmp: str, name: str) -> Path:
    d = Path(tmp) / name
    shutil.copytree(src, d, ignore=shutil.ignore_patterns("*.csv", "log.*", "reports",
                                                          "postProcessing", "converged"))
    return d


def edit(path: Path, old: str, new: str):
    s = path.read_text()
    if s.count(old) != 1:
        raise SystemExit(f"{NAME}: FAIL -- the arm's edit does not apply to {path.name}: {old[:60]!r}")
    path.write_text(s.replace(old, new, 1))


def main():
    fails, notes = [], []
    with tempfile.TemporaryDirectory(prefix="ldd_") as tmp:
        # ---- (1) the witness ------------------------------------------------
        w = copy(WITNESS, tmp, "w")
        rc, out = run(w, "choupoProps")
        dg = diagnostics(out)
        if rc != 0 or not dg:
            fails.append(f"(1) the witness did not run (exit {rc})")
        else:
            p = dg.get("poling288", {})
            if p.get("D_L_inf_methanol_in_water") != 1.26e-09:
                fails.append(f"(1) poling288: methanol in water {p.get('D_L_inf_methanol_in_water')}"
                             " is not the declared 1.26e-5 cm2/s")
            if p.get("D_L_inf_water_in_methanol") in (None, 1.26e-09):
                fails.append("(1) poling288: water in methanol took the methanol-in-water datum")
            b = dg.get("binaryEffective", {})
            x_m, x_w = 0.9459, 0.0541
            dmw, dwm, eff = (b.get(k) for k in ("D_L_inf_methanol_in_water",
                                                 "D_L_inf_water_in_methanol", "D_L_effective"))
            if None in (dmw, dwm, eff):
                fails.append("(1) binaryEffective: a value is missing")
            else:
                vig = dmw ** x_w * dwm ** x_m
                if abs(eff / vig - 1.0) > 1e-12:
                    fails.append(f"(1) binaryEffective: D_L_effective {eff} is not the Vignes value {vig}")
            for rec in ASSOCIATION_FACTOR_DEFAULTED:
                text = (ROOT / "data" / "standards" / "components" / f"{rec}.dat").read_text()
                if re.search(r"^\s*associationFactor\s", text, re.M):
                    fails.append(f"(1) PAID: {rec}.dat now writes associationFactor -- remove it from"
                                 " debt_registry.ASSOCIATION_FACTOR_DEFAULTED in this commit")
                elif f"{rec} as a solvent: associationFactor default 1.0, not in the record" not in out \
                        and rec in ("isopropanol",):
                    fails.append(f"(1) the view does not say {rec}'s association factor is the default")
            notes.append("witness: 3 operations, entry exact, Vignes to 1e-12, the default announced")

        # ---- (1b) an inline entry, and a `use check` viscosity --------------
        d = copy(WITNESS, tmp, "inline")
        edit(d / "constant/thermoPhysPropDict", "experiments methanolInWater288; }",
             'value 1.26e-5 cm2/s;  T 288 K;  box { T (288 288); }  source "Poling 5th ed. Table 11-5"; }')
        rc, out = run(d, "choupoProps")
        v = diagnostics(out).get("poling288", {}).get("D_L_inf_methanol_in_water")
        if rc != 0 or v is None or abs(v / 1.26e-9 - 1.0) > 1e-14:
            fails.append(f"(1b) an inline constant entry: exit {rc}, value {v} (expected 1.26e-9 m2/s)")
        else:
            notes.append("inline entry")
        d = copy(WITNESS, tmp, "check")
        edit(d / "constant/thermoPhysPropDict", "viscosity   { }",
             'viscosity   { measured { muCheck { use check; reason "a probe"; } } }')
        (d / "constant/experiments/muCheck.dat").write_text(
            'provenance { citation "a probe of this gate"; }\nproperty liquidViscosity;\n'
            "system ( methanol isopropanol water );\nsolvent water;\n"
            "columns ( { name mu; unit mPa.s; } );\ndata ( 0.5 );\n"
            "box { T ( 280 400 ); w[methanol] ( 0 1 ); w[isopropanol] ( 0 1 ); }\n")
        edit(d / "system/propsDict", "D_L_inf_isopropanol_in_water     D_L_inf_water_in_isopropanol );",
             "D_L_inf_isopropanol_in_water     D_L_inf_water_in_isopropanol  viscosity_liquid );")
        rc, out = run(d, "choupoProps")
        mu = diagnostics(out).get("topDinf", {}).get("viscosity_liquid")
        if rc != 0 or "[liquid viscosity] measured muCheck 0.0005 Pa s beside the computed" not in out \
                or mu is None or abs(mu - 5e-4) < 1e-12:
            fails.append(f"(1b) a `use check` measurement: exit {rc}, the comparison line "
                         f"{'printed' if 'measured muCheck' in out else 'NOT printed'}, value {mu}"
                         " (a check is never used)")
        else:
            notes.append("use check")

        # ---- (2) refusals of the grammar -----------------------------------
        tp = "constant/thermoPhysPropDict"
        ex = "constant/experiments/methanolInWater288.dat"
        arms = [
            ("an effective value of three components",
             [("system/propsDict", "composition { methanol 0.9459;  water 0.0541; }",
               "composition { methanol 0.8;  isopropanol 0.1;  water 0.1; }")],
             "a liquid of 3 components"),
            ("VignesKooijmanTaylor", [(tp, "{ rule Vignes; }", "{ rule VignesKooijmanTaylor; }")],
             "refused until its source is read"),
            ("a file cited in the other direction",
             [(ex, "solute      methanol;\nsolvent     water;", "solute      water;\nsolvent     methanol;")],
             "The direction of an infinite-dilution value is part of the datum"),
            ("a file of two points", [(ex, "data        ( 288 1.26e-5 );", "data        ( 288 1.26e-5  298 1.6e-5 );")],
             "slice (c)'s table type"),
            ("kind fick", [(tp, "solvent water;  kind infiniteDilution;", "solvent water;  kind fick;")],
             "no consumer reads a datum of that kind"),
            ("a thermodynamic factor from the activity model",
             [(tp, "thermodynamicFactor { take 1; }", "thermodynamicFactor { from equilibrium.liquid; }")],
             "the liquid film takes the thermodynamic factor as 1"),
            ("returns effective without the factor", [(tp, "thermodynamicFactor { take 1; }", "")],
             "needs the thermodynamic factor"),
            ("an entry used outside its box",
             [("system/propsDict", "{ T 288 K;  P 1 bar;", "{ T 290 K;  P 1 bar;")],
             "is outside the box"),
            ("a column without a unit", [(ex, "{ name D; unit cm2/s; }", "{ name D; }")],
             "has no `unit`"),
        ]
        for label, edits, words in arms:
            d = copy(WITNESS, tmp, "a" + str(len(notes)) + re.sub(r"\W", "", label)[:20])
            for f, old, new in edits:
                edit(d / f, old, new)
            rc, out = run(d, "choupoProps")
            if rc == 0:
                fails.append(f"(2) {label}: ran to exit 0")
            elif words not in out:
                fails.append(f"(2) {label}: refused, but not by its words ({words!r})")
            else:
                notes.append(label)

        # ---- (3) the column --------------------------------------------------
        col = [
            ("liquidViscosity typed back in packing {}",
             [("system/flowsheetDict", "                segments          100;",
               "                liquidViscosity   3.91e-4;\n                segments          100;")],
             "transport { liquid { viscosity { measured"),
            ("no liquid diffusivity declared",
             [(tp, "            returns             effective;", "            returns             infiniteDilution;"),
              (tp, "            composition         { rule AndersonBabb; }\n", ""),
              (tp, "            thermodynamicFactor { take 1; }\n", "")],
             "the liquid film needs the effective liquid diffusivity"),
            ("a measured viscosity box that misses the bed",
             [("constant/experiments/schulz2018_0p10bar_liquidViscosity.dat",
               "T           ( 320 370 );", "T           ( 345 347.5 );")],
             "is outside the box the case declared for its measurement"),
        ]
        for label, edits, words in col:
            d = copy(RATE, tmp, "c" + re.sub(r"\W", "", label)[:24])
            (d / "system" / "outerDict").unlink(missing_ok=True)
            for f, old, new in edits:
                edit(d / f, old, new)
            rc, out = run(d, "choupoSolve")
            if rc == 0:
                fails.append(f"(3) {label}: ran to exit 0")
            elif words not in out:
                fails.append(f"(3) {label}: refused, but not by its words ({words!r}); last: "
                             + (out.strip().splitlines() or [""])[-1][:200])
            else:
                notes.append(label)

    if fails:
        print(f"{NAME}: FAIL")
        for f in fails:
            print("  " + f)
        return 1
    print(f"{NAME}: OK -- the witness returns its declared entry exactly (from a file and inline) and"
          f" the Vignes value to 1e-12; a `use check` viscosity is printed and not used;"
          f" {len(notes) - 3} refusals each by name (9 of the grammar, 3 of the column).  NOT"
          " CHECKED: the migrated cases' numbers (their goldens), Wilke-Chang's fitness for a pair.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
