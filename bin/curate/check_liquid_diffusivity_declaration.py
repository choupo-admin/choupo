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
TRAYS = ROOT / "tutorials" / "steady" / "distillation" / "trayEfficiency01_yanagi14"
SECTORS = ROOT / "tutorials" / "steady" / "flowsheets" / "table05_sector_table_pins"


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


COMPONENT_DIR = WITNESS / "constant" / "components"


def record_number(comp, key):
    m = re.search(r"^\s*" + key + r"\s+([0-9.eE+-]+)\s*;", (COMPONENT_DIR / f"{comp}.dat").read_text(), re.M)
    return float(m.group(1))


def record_number_at(path, key):
    m = re.search(r"^\s*" + key + r"\s+([0-9.eE+-]+)\s*;", Path(path).read_text(), re.M)
    return float(m.group(1))


def wilke_chang(solute, solvent, T, mu_solvent, phi):
    """Poling 5th ed. Eq. 11-9.1, by hand: 7.4e-8 (phi M_B)^0.5 T / (eta_B[cP] V_A^0.6) cm2/s."""
    MB = record_number(solvent, "MW")
    VA = record_number(solute, "Vliq") * 1.0e6
    return 7.4e-8 * (phi * MB) ** 0.5 * T / (mu_solvent * 1.0e3 * VA ** 0.6) * 1.0e-4


def profile_of(out, unit="column"):
    a = out.find("<<<Choupo:result-begin>>>")
    b = out.find("<<<Choupo:result-end>>>")
    r = json.loads(out[a + len("<<<Choupo:result-begin>>>"):b])
    return r.get("profiles", {}).get(unit)


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
            #  EACH RULE BY HAND (review rows DG-06, DG-07): on the methanol-water
            #  binary, where D0(water in methanol) / D0(methanol in water) ~ 2.5,
            #  from the two infinite-dilution values (in the PURE solvents'
            #  viscosities) and the viscosities the same run prints.
            x_m, x_w = 0.9459, 0.0541
            mu_m = dg.get("muMethanol", {}).get("viscosity_liquid")
            mu_w = dg.get("muWater", {}).get("viscosity_liquid")
            for op, rule in (("binaryEffective", "Vignes"), ("cbBinary", "CaldwellBabb"),
                             ("lcBinary", "LefflerCullinan"), ("abBinary", "AndersonBabb")):
                b = dg.get(op, {})
                dmw, dwm, eff, mu = (b.get(k) for k in ("D_L_inf_methanol_in_water",
                                     "D_L_inf_water_in_methanol", "D_L_effective", "viscosity_liquid"))
                if None in (dmw, dwm, eff, mu, mu_m, mu_w):
                    fails.append(f"(1) {op}: a value is missing")
                    continue
                hand = {"Vignes": dwm ** x_m * dmw ** x_w,
                        "CaldwellBabb": x_m * dwm + x_w * dmw,
                        "LefflerCullinan": (dwm * mu_m) ** x_m * (dmw * mu_w) ** x_w / mu,
                        "AndersonBabb": (x_m * dwm * mu_m + x_w * dmw * mu_w) / mu}[rule]
                if abs(eff / hand - 1.0) > 1e-11:
                    fails.append(f"(1) {op}: D_L_effective {eff} is not {rule}'s value by hand {hand}")
            if dg.get("cbBinary", {}).get("D_L_effective") == dg.get("abBinary", {}).get("D_L_effective"):
                fails.append("(1) CaldwellBabb and AndersonBabb give the same number: the witness cannot"
                             " tell the two rules apart")
            #  THE ASSOCIATION FACTOR TAKEN BY DEFAULT, by value AND by its words
            #  (review row DG-06 item 3): D0(methanol in 2-propanol) is Wilke-Chang
            #  with phi = 1.0 exactly, and the view says so.
            mu_i = dg.get("muIsopropanol", {}).get("viscosity_liquid")
            d_mi = dg.get("topDinf", {}).get("D_L_inf_methanol_in_isopropanol")
            if None in (mu_i, d_mi):
                fails.append("(1) the 2-propanol values are missing")
            else:
                hand = wilke_chang("methanol", "isopropanol", 328.62, mu_i, 1.0)
                if abs(d_mi / hand - 1.0) > 1e-10:
                    fails.append(f"(1) D0(methanol in 2-propanol) {d_mi} is not Wilke-Chang with phi 1.0"
                                 f" by hand ({hand}): the default association factor moved")
            for rec in ASSOCIATION_FACTOR_DEFAULTED:
                text = (ROOT / "data" / "standards" / "components" / f"{rec}.dat").read_text()
                if re.search(r"^\s*associationFactor\s", text, re.M):
                    fails.append(f"(1) PAID: {rec}.dat now writes associationFactor -- remove it from"
                                 " debt_registry.ASSOCIATION_FACTOR_DEFAULTED in this commit")
                elif f"{rec} as a solvent: associationFactor default 1.0, not in the record" not in out \
                        and rec in ("isopropanol",):
                    fails.append(f"(1) the view does not say {rec}'s association factor is the default")
            #  WATER AS THE SOLUTE (review row DF-01): named for the pair, marked.
            if out.count("OUTSIDE THE METHOD'S STATED SCOPE") < 2:
                fails.append("(1) the view does not mark the two water-solute pairs outside the"
                             " method's stated scope")
            notes.append("witness")

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
            'provenance { citation "a probe of this gate"; basis "a probe value"; }\n'
            "property liquidViscosity;\nsystem ( methanol isopropanol water );\nsolvent water;\n"
            "columns ( { name mu; unit mPa.s; } );\ndata ( 0.5 );\n"
            "box { T ( 280 400 ); w[methanol] ( 0 1 ); w[isopropanol] ( 0 1 ); }\n")
        edit(d / "system/propsDict", "D_L_inf_isopropanol_in_water     D_L_inf_water_in_isopropanol );",
             "D_L_inf_isopropanol_in_water     D_L_inf_water_in_isopropanol  viscosity_liquid );")
        rc, out = run(d, "choupoProps")
        mu = diagnostics(out).get("topDinf", {}).get("viscosity_liquid")
        if rc != 0 or "[liquid viscosity] stated value muCheck (a probe value) 0.0005 Pa s beside the computed" \
                not in out or mu is None or abs(mu - 5e-4) < 1e-12:
            fails.append(f"(1b) a `use check` stated value: exit {rc}, the comparison line "
                         f"{'printed' if 'muCheck' in out else 'NOT printed'}, value {mu}"
                         " (a check is never used)")
        else:
            notes.append("use check")

        # ---- (2) refusals of the grammar -----------------------------------
        tp = "constant/thermoPhysPropDict"
        ex = "constant/experiments/methanolInWater288.dat"
        pd = "system/propsDict"
        STATED = ("provenance { citation \"a probe of this gate\"; basis \"a probe value\"; }\n"
                  "property liquidViscosity;\n")
        def stated_file(d, name, system, solvent, cols, data, box):
            (d / f"constant/experiments/{name}.dat").write_text(
                STATED + f"system ( {system} );\n" + (f"solvent {solvent};\n" if solvent else "")
                + f"columns ( {cols} );\ndata ( {data} );\nbox {{ {box} }}\n")
        arms = [
            ("an effective value of three components",
             [(pd, "composition { methanol 0.9459;  water 0.0541; } }\n        properties  ( D_L_inf_methanol_in_water  D_L_inf_water_in_methanol  D_L_effective  viscosity_liquid );\n    }\n    {\n        name        cbBinary;",
                   "composition { methanol 0.8;  isopropanol 0.1;  water 0.1; } }\n        properties  ( D_L_effective );\n    }\n    {\n        name        cbBinary;")],
             "a liquid of 3 components"),
            ("VignesKooijmanTaylor", [(tp, "{ rule Vignes; }", "{ rule VignesKooijmanTaylor; }")],
             "refused until its source is read"),
            ("a file cited in the other direction",
             [(ex, "solute      methanol;\nsolvent     water;", "solute      water;\nsolvent     methanol;")],
             "The direction of an infinite-dilution value is part of the datum"),
            ("a file of two points", [(ex, "data        ( 288 1.26e-5 );", "data        ( 288 1.26e-5  298 1.6e-5 );")],
             "a law of type `table`"),
            ("kind fick", [(tp, "solvent water;  kind infiniteDilution;\n                              experiments",
                                "solvent water;  kind fick;\n                              experiments")],
             "no consumer reads a datum of that kind"),
            ("an entry with no kind", [(tp, "solvent water;  kind infiniteDilution;\n                              experiments",
                                            "solvent water;\n                              experiments")],
             "the entry names no `kind`"),
            ("a thermodynamic factor from the activity model",
             [(tp, "{ rule Vignes; }\n                    infiniteDilution", "{ rule Vignes; }\n                    infiniteDilution"),
              (tp, "                    thermodynamicFactor { take 1; }\n                }\n            }\n        }\n    }\n    cbBinary",
                   "                    thermodynamicFactor { from equilibrium.liquid; }\n                }\n            }\n        }\n    }\n    cbBinary")],
             "the liquid film takes the thermodynamic factor as 1"),
            ("`take 2`", [(tp, "                    thermodynamicFactor { take 1; }\n                }\n            }\n        }\n    }\n    cbBinary",
                               "                    thermodynamicFactor { take 2; }\n                }\n            }\n        }\n    }\n    cbBinary")],
             "write `take 1;`"),
            ("`take 0`", [(tp, "                    thermodynamicFactor { take 1; }\n                }\n            }\n        }\n    }\n    cbBinary",
                               "                    thermodynamicFactor { take 0; }\n                }\n            }\n        }\n    }\n    cbBinary")],
             "write `take 1;`"),
            ("`take x`", [(tp, "                    thermodynamicFactor { take 1; }\n                }\n            }\n        }\n    }\n    cbBinary",
                               "                    thermodynamicFactor { take x; }\n                }\n            }\n        }\n    }\n    cbBinary")],
             "take"),
            ("returns effective without the factor",
             [(tp, "                    thermodynamicFactor { take 1; }\n                }\n            }\n        }\n    }\n    cbBinary",
                   "                }\n            }\n        }\n    }\n    cbBinary")],
             "needs the thermodynamic factor"),
            ("an entry used outside its box",
             [(pd, "{ T 288 K;  P 1 bar;", "{ T 290 K;  P 1 bar;")],
             "is outside the box"),
            ("a column without a unit", [(ex, "{ name D; unit cm2/s; }", "{ name D; }")],
             "declares no unit"),
            ("the default Wilke-Chang with water as the solute (DF-01)",
             [(tp, "                    { solute water;  solvent methanol;  kind infiniteDilution;  model WilkeChang;\n"
                   "                      reason \"taken outside its stated scope, measured against: Lee & Li (1991), as Poling 5th ed. p. 11.38 reports it, give 2.67e-5 cm2/s at 313.13 K, and Wilke-Chang is +167 % there (variant leeLi313 prints both)\"; }\n", "")],
             "The method should not be used when water is the solute"),
            ("an unlisted pair names the slice's grammar (DG-05)",
             [(tp, "                default { model WilkeChang; }\n                entries\n                (\n                    { solute water;",
                   "                entries\n                (\n                    { solute water;")],
             "infiniteDilution { default { model WilkeChang; } entries ("),
        ]
        #  The stated mixture viscosity's refusals (DG-02, DG-03, DG-04).
        stated_arms = [
            ("a stated value applied to a liquid holding another component (DG-02)",
             "muS { use method; reason \"a probe\"; }",
             lambda d: stated_file(d, "muS", "methanol water", "water", "{ name mu; unit mPa.s; }", "0.5",
                                   "T ( 280 400 ); w[methanol] ( 0 1 );"),
             "also holds isopropanol"),
            ("a one-component stated value (DG-03)",
             "muS { use method; reason \"a probe\"; }",
             lambda d: stated_file(d, "muS", "methanol", None, "{ name mu; unit mPa.s; }", "0.5", "T ( 280 400 );"),
             "names ONE component"),
            ("`use check` beside `use method` on one set (DG-04)",
             "muS { use method; reason \"a probe\"; } muC { use check; reason \"a probe\"; }",
             lambda d: (stated_file(d, "muS", "methanol water", "water", "{ name mu; unit mPa.s; }", "0.5",
                                    "T ( 280 400 ); w[methanol] ( 0 1 );"),
                        stated_file(d, "muC", "methanol water", "water", "{ name mu; unit mPa.s; }", "0.6",
                                    "T ( 280 400 ); w[methanol] ( 0 1 );")),
             "on the same set"),
            ("a stated value with no basis (DF-04)",
             "muS { use method; reason \"a probe\"; }",
             lambda d: (d / "constant/experiments/muS.dat").write_text(
                 "provenance { citation \"a probe\"; }\nproperty liquidViscosity;\nsystem ( methanol water );\n"
                 "solvent water;\ncolumns ( { name mu; unit mPa.s; } );\ndata ( 0.5 );\n"
                 "box { T ( 280 400 ); w[methanol] ( 0 1 ); }\n"),
             "states no `basis"),
        ]
        k = 0
        for label, edits, words in arms:
            k += 1
            d = copy(WITNESS, tmp, f"a{k}")
            for f, old, new in edits:
                if old != new:
                    edit(d / f, old, new)
            rc, out = run(d, "choupoProps")
            if rc == 0:
                fails.append(f"(2) {label}: ran to exit 0")
            elif words not in out:
                fails.append(f"(2) {label}: refused, but not by its words ({words!r})")
            else:
                notes.append(label)
        for label, decl, files, words in stated_arms:
            k += 1
            d = copy(WITNESS, tmp, f"s{k}")
            edit(d / tp, "viscosity   { }", "viscosity   { measured { " + decl + " } }")
            files(d)
            #  The ternary state topDinf holds isopropanol beside the stated set.
            edit(d / pd, "D_L_inf_isopropanol_in_water     D_L_inf_water_in_isopropanol );",
                 "D_L_inf_isopropanol_in_water     D_L_inf_water_in_isopropanol  viscosity_liquid );")
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
            ("sigma typed two blocks deep (DG-01)",
             [("system/flowsheetDict", "                segments          100;",
               "                segments          100;\n                probe { inner { sigma 0.02; } }")],
             "`sigma` typed in `operation.packing.probe.inner`"),
            ("no liquid diffusivity declared",
             [(tp, "            returns             effective;", "            returns             infiniteDilution;"),
              (tp, "            composition         { rule AndersonBabb; }\n", ""),
              (tp, "            thermodynamicFactor { take 1; }\n", "")],
             "the liquid film needs the effective liquid diffusivity"),
            ("a stated viscosity box that misses the bed",
             [("constant/experiments/schulz2018_0p10bar_liquidViscosity.dat",
               "T           ( 320 370 );", "T           ( 345 347.5 );")],
             "is outside the box the case declared for its stated value"),
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

        # ---- (3a) the old form is refused by name, with the line to write
        #      (DEV.md 4c C402: no legacy reader once no shipped case uses it)
        d = copy(WITNESS, tmp, "oldform")
        t = (d / tp).read_text()
        i = t.index("        diffusivity\n        {")
        j, depth = t.index("{", i) + 1, 1
        while depth:
            depth += {"{": 1, "}": -1}.get(t[j], 0)
            j += 1
        (d / tp).write_text(t[:i] + "        diffusivity { model WilkeChang; }" + t[j:])
        rc, out = run(d, "choupoProps")
        line = "returns infiniteDilution; infiniteDilution { default { model WilkeChang; } } }"
        if rc == 0 or "is no longer read" not in out or line not in out:
            fails.append(f"(3a) the old `diffusivity {{ model WilkeChang; }}` form: exit {rc},"
                         f" {'refused' if rc else 'NOT refused'}"
                         f"{'' if line in out else ', without the line to write'}")
        else:
            notes.append("the old form refused by name")

        # ---- (3e) a sector's file is read from the sector's constant/, never
        #      the root's (slice (c)'s TG-02, held for this slice's entries) ---
        d = copy(SECTORS, tmp, "sector")
        for mf in d.rglob("propertyManifest"):
            mf.write_text(mf.read_text().replace("sealed             true;", "sealed             false;"))
        edit(d / tp, "components ( water );", "components ( water methanol );")
        edit(d / "sectors/A" / tp, "    liquid\n    {\n",
             "    liquid\n    {\n        diffusivity\n        {\n            returns infiniteDilution;\n"
             "            infiniteDilution\n            {\n                default { model WilkeChang; }\n"
             "                entries ( { solute methanol; solvent water; kind infiniteDilution;"
             " experiments methanolInWater288; } );\n            }\n        }\n")
        datum = WITNESS / "constant/experiments/methanolInWater288.dat"
        shutil.copy(datum, d / "sectors/A/constant/experiments" / datum.name)
        rc1, out1 = run(d, "choupoSolve")
        (d / "sectors/A/constant/experiments" / datum.name).rename(d / "constant/experiments" / datum.name)
        rc2, out2 = run(d, "choupoSolve")
        if rc1 != 0 or "methanol in water (kind infiniteDilution): 1.26e-09" not in out1:
            fails.append(f"(3e) a sector's diffusivity entry with its file in the sector: exit {rc1}, not read")
        elif rc2 == 0 or "no file sectors/A/constant/experiments/methanolInWater288.dat" not in out2:
            fails.append(f"(3e) the sector's file moved to the root: exit {rc2}, "
                         f"{'read from the root' if rc2 == 0 else 'refused, but not naming the sector path'}")
        else:
            notes.append("a sector's file from the sector, never the root")
        d = copy(WITNESS, tmp, "writtenDir")
        edit(d / tp, "experiments methanolInWater288;", "experiments methanolInWater288;  experimentsDir \"x\";")
        rc, out = run(d, "choupoProps")
        if rc == 0 or "is not a word a dictionary writes" not in out:
            fails.append(f"(3e) a hand-written experimentsDir: exit {rc}, not refused by name")
        else:
            notes.append("a hand-written experimentsDir refused")

        # ---- (3b) a stated mixture value and its constituents (DG-11) -----
        def stated_probe(name, box_w, ops_edit=None):
            d = copy(WITNESS, tmp, name)
            edit(d / tp, "viscosity   { }",
                 'viscosity   { measured { muS { use method; reason "a probe"; } } }')
            stated_file(d, "muS", "methanol water", "water", "{ name mu; unit mPa.s; }", "0.5",
                        f"T ( 280 400 ); w[methanol] ( {box_w} );")
            if ops_edit:
                ops_edit(d)
            return d
        d = stated_probe("dg11pure", "0 1")
        rc, out = run(d, "choupoProps")
        mu_pure = diagnostics(out).get("muMethanol", {}).get("viscosity_liquid")
        mu_law = dg.get("muMethanol", {}).get("viscosity_liquid") if dg else None
        if rc != 0 or mu_pure is None or mu_pure != mu_law \
                or "does not describe pure methanol; its record law is used" not in out:
            fails.append(f"(3b) a pure constituent of a stated binary: exit {rc}, viscosity {mu_pure}"
                         f" (its record law gives {mu_law}), the announcement "
                         f"{'printed' if 'does not describe pure methanol' in out else 'NOT printed'}")
        else:
            notes.append("pure constituent by its law")
        d = stated_probe("dg11box", "0.98 1")
        rc, out = run(d, "choupoProps")
        if rc == 0 or "is outside the box the case declared for its stated value" not in out:
            fails.append(f"(3b) a binary of the stated set outside its box: exit {rc}, not refused by its words")
        else:
            notes.append("binary outside the box")
        #  (the superset -- a liquid holding another component -- is arm (2)'s DG-02)

        # ---- (3c) Leffler-Cullinan where it is NOT Vignes (DG-12) ----------
        d = copy(WITNESS, tmp, "dg12lc")
        edit(d / tp, "viscosity   { }",
             'viscosity   { interaction ( { i methanol; j water; A 1.0; Tmin 300; Tmax 350;'
             ' source "a probe of this gate, not a datum"; } ); }')
        rc, out = run(d, "choupoProps")
        g = diagnostics(out)
        b, v = g.get("lcBinary", {}), g.get("binaryEffective", {})
        mu_m2 = g.get("muMethanol", {}).get("viscosity_liquid")
        mu_w2 = g.get("muWater", {}).get("viscosity_liquid")
        try:
            dmw, dwm, eff, mu = (b[k] for k in ("D_L_inf_methanol_in_water", "D_L_inf_water_in_methanol",
                                               "D_L_effective", "viscosity_liquid"))
            hand = (dwm * mu_m2) ** 0.9459 * (dmw * mu_w2) ** 0.0541 / mu
            vig = v["D_L_effective"]
            if rc != 0 or abs(eff / hand - 1.0) > 1e-11 or abs(eff / vig - 1.0) < 1e-3:
                fails.append(f"(3c) Leffler-Cullinan {eff} against its hand value {hand} (and Vignes {vig},"
                             " which it must NOT equal here)")
            else:
                notes.append(f"Leffler-Cullinan off Vignes by {100 * (eff / vig - 1):+.2f} %")
        except (KeyError, TypeError):
            fails.append(f"(3c) the Leffler-Cullinan probe did not run (exit {rc})")

        # ---- (3d) the column's surface tension: one per tray, and the
        #      supercritical left-out rule (DG-13) -----------------------------
        d = copy(TRAYS, tmp, "dg13")
        (d / "system" / "outerDict").unlink(missing_ok=True)
        #  cyclohexane's Tc moved to 360 K in this temporary copy only, so the
        #  trays (321.9-330 K) sit between 0.9 Tc and Tc: nothing is above Tc.
        rec = d / "constant/components/cyclohexane.dat"
        rec.write_text(re.sub(r"(?m)^Tc\s+[0-9.eE+-]+;", "Tc          360.0;", rec.read_text()))
        Tc = {"cyclohexane": 360.0,
              "nHeptane": record_number_at(d / "constant/components/nHeptane.dat", "Tc")}
        rc, out = run(d, "choupoSolve")
        prof = profile_of(out) if rc == 0 else None
        cols = (prof or {}).get("columns", prof or {})
        if not cols or "sigma" not in cols or "sigma_efficiency" not in cols:
            fails.append(f"(3d) the tray probe (exit {rc}) publishes no per-tray surface tension")
        else:
            bad = []
            for k, T in enumerate(cols["T"]):
                s_h, s_e = cols["sigma"][k], cols["sigma_efficiency"][k]
                if s_h > 0.0 and s_e > 0.0 and abs(s_e / s_h - 1.0) > 1e-9:
                    bad.append(f"tray {k + 1}: efficiency {s_e} vs hydraulics {s_h}")
                if s_h > 0.0:
                    hand = sum(cols[f"x_{c}"][k] for c in Tc if T >= Tc[c])
                    if abs(cols["sigma_unpricedFraction"][k] - hand) > 1e-12:
                        bad.append(f"tray {k + 1} at {T:.2f} K: left out {cols['sigma_unpricedFraction'][k]},"
                                   f" by the rule (T >= Tc) {hand}")
            if bad:
                fails.append("(3d) " + "; ".join(bad[:3]))
            else:
                notes.append("one surface tension per tray; left out only above Tc")

        # ---- (4) RULING 7: the column and a property operation, one state ---
        d = copy(RATE, tmp, "r7col")
        (d / "system" / "outerDict").unlink(missing_ok=True)
        rc, out = run(d, "choupoSolve")
        prof = profile_of(out) if rc == 0 else None
        if not prof or "D_L" not in prof.get("columns", prof):
            fails.append(f"(4) ratebased01 (exit {rc}) publishes no D_L / mu_L in its profile")
        else:
            cols = prof.get("columns", prof)
            k50 = len(cols["D_L"]) // 2
            T, P = cols["liquidFilm_T"][k50], cols["liquidFilm_P"][k50]
            x = cols["liquidFilm_x_pXylene"][k50]
            p = copy(RATE, tmp, "r7props")
            (p / "system" / "flowsheetDict").unlink()
            (p / "system" / "outerDict").unlink(missing_ok=True)
            cd = (p / "system" / "controlDict").read_text()
            (p / "system" / "controlDict").write_text(re.sub(r"application\s+\w+;", "application   choupoProps;", cd))
            (p / "system" / "propsDict").write_text(
                "operations\n(\n    {\n        name        film;\n        type        propertyPoint;\n"
                f"        state       {{ T {T!r} K;  P {P!r} Pa;  composition {{ pXylene {x!r};  oXylene {1.0 - x!r}; }} }}\n"
                "        properties  ( D_L_effective  viscosity_liquid );\n    }\n);\n")
            rc2, out2 = run(p, "choupoProps")
            fd = diagnostics(out2).get("film", {})
            for key, col in (("D_L_effective", "D_L"), ("viscosity_liquid", "mu_L")):
                got, want = fd.get(key), cols[col][k50]
                if rc2 != 0 or got is None or abs(got / want - 1.0) > 1e-10:
                    fails.append(f"(4) ruling 7: the column's {col} at segment {k50} ({want}) and a"
                                 f" property operation at its state ({got}, exit {rc2}) differ")
            notes.append("ruling 7")

    if fails:
        print(f"{NAME}: FAIL")
        for f in fails:
            print("  " + f)
        return 1
    print(f"{NAME}: OK -- the witness returns its declared entry exactly (from a file and inline);"
          f" each of the four rules equals its value by hand to 1e-11 on a binary whose two"
          f" infinite-dilution values differ 2.5-fold; the default association factor holds by value"
          f" and by its words; the column's liquid film and a property operation at its state agree to"
          f" 1e-10 (ruling 7); a `use check` stated viscosity is printed and not used;"
          f" a stated mixture value leaves a pure constituent to its law; Leffler-Cullinan by hand where it"
          f" differs from Vignes; one surface tension per tray, left out only at or above Tc; a sector's file read from the sector's constant/, never the root's;"
          f" {len(notes) - 9} refusals each by name, the old `diffusivity {{ model <word>; }}` form among them.  NOT CHECKED: the migrated cases' numbers (their"
          f" goldens and the byte-identity run), Wilke-Chang's fitness for a pair, Brock-Bird's"
          f" fitness for a polar liquid (announced, not judged).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
