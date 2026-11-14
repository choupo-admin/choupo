#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: a case's pin of a record law changes the number the engine computes, in every formulation.

    bin/curate/check_record_law_pins.py

WHY (DEV.md 4c C398 slice (b), review row SB-01).  A pin of a vapour-pressure
law was applied to the package's own components AFTER the assembly, while
the reactive electrolyte engine had already taken its own copy of the
component: the run used the record's preferred law and the resolved view
printed "case pin".  A view that prints a choice the engine did not make is
the defect this gate exists for.  The pins are now applied where every copy
is born (Database::loadComponent inside a RecordLawPinScope) and verified on
the package (ThermoPackage::verifyRecordLawPins).

WHAT IT CHECKS.  For one shipped witness of each formulation the tree ships
(gammaPhi, diluteSolution, electrolyteGammaPhi with and without the reactive
engine, gammaGamma, phiPhi), on a scratch copy whose record of one
component holds TWO laws -- its own and a second one --, three runs:

    base       the component's own law preferred
    preferred  the second law preferred
    pinned     its own law preferred, the second PINNED beside the property

and it requires every number of `pinned`'s result to equal `preferred`'s:
the pin reached every copy the engine reads.  Where the property enters the
result, `base` must differ (the arm is not vacuous); where it does not (the
phi-phi world prices no saturation curve), the arm says so.  The vapour-
pressure law's second form is the Antoine A shifted by log10 2 (the curve
doubled); the liquid heat capacity's is its polynomial scaled by 1.2.

THE PATHS A PIN TAKES (C398 review rows CV-11, CN-03): besides the system
dictionary of each formulation, an arm for each other place a pin is
written or read --

    idealGasHeatCapacity   the SL-05 chain: the ideal-gas law a
                           RowlinsonBondi liquid law consumes (acetone06)
    solidHeatCapacity      a solid's law in a spray dryer (sprayDryer01)
    transport              a liquid viscosity pin beside the property in
                           `transport { liquid { viscosity { } } }`, between
                           the record's two shipped laws (purelaws01)
    variant                a pin inside a named variant a unit selects
    inline                 a pin inside a unit's inline `thermo {}`
    sector                 a pin in a sector dictionary (lithiumBrinePlant
                           HOTAIR), compared on the sector unit's numbers
    speciate               water's vapour-pressure law priced by the
                           speciation operation's solvent leg, a copy of the
                           component loaded outside any package (CN-03)

The variant, inline and sector arms compare the selecting unit's KPIs only:
the rest of the plant runs on the system's package, which the pin does not
reach by design.

NOT CHECKED: whether either law is right; a formulation with no shipped
steady witness; the time-integrated binaries (they refuse a unit `thermo`
and build one package per run through the same builder).

    reads: src/thermo/Database.cpp src/thermo/ThermoPackageBuilder.cpp
    reads: src/thermo/ThermoPackage.cpp src/thermo/Component.cpp src/thermo/RecordLaws.cpp
    reads: src/propertyOps/Speciate.cpp src/unitOperations/flowsheet/Flowsheet.cpp
"""
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NAME = "check_record_law_pins"
SOLVE = ROOT / "choupoSolve"

#  (formulation label, witness, component, property, must the number move?,
#   where the pin is written, which result paths are compared)
ARMS7 = [
    ("SL-05 ideal-gas law", "tutorials/steady/distillation/acetone06_luyben_column_C1", "isopropanol",
     "idealGasHeatCapacity", True, "system", None),
    ("solid",           "tutorials/steady/drying/sprayDryer01_sugar",            "sucrose", "solidHeatCapacity", True, "system", None),
    ("transport",       "tutorials/props/transport/purelaws01_methanol_isopropanol_water", "water", "liquidViscosity", True, "transport", None),
    ("variant",         "tutorials/steady/flash/flash01_benzene_toluene",       "benzene", "vaporPressure", True, "variant:flash01", ".kpis.flash01"),
    ("inline unit thermo", "tutorials/steady/flash/flash01_benzene_toluene",    "benzene", "vaporPressure", True, "inline:flash01", ".kpis.flash01"),
    ("sector dictionary", "tutorials/plant/lithiumBrinePlant",                  "CH4",     "idealGasHeatCapacity", True, "sector:HOTAIR", ".kpis.HOTAIR."),
    ("speciate solvent leg", "tutorials/props/electrolyte/edwards02_table7_vle", "water", "vaporPressure", True, "system", None),
]

ARMS = [
    ("gammaPhi",                    "tutorials/steady/flash/flash01_benzene_toluene",            "benzene", "vaporPressure",      True),
    ("gammaPhi",                    "tutorials/steady/flash/flash01_benzene_toluene",            "benzene", "liquidHeatCapacity", True),
    ("diluteSolution",              "tutorials/steady/flash/flash08_co2_water_package",          "water",   "vaporPressure",      True),
    ("electrolyteGammaPhi",         "tutorials/steady/evaporation/evaporator06_nacl_pitzer",   "water",   "vaporPressure",      True),
    ("electrolyteGammaPhi reactive", "tutorials/steady/flash/flash12_nh3_acetic_ethanol_reactive", "ethanol", "vaporPressure",    True),
    ("electrolyteGammaPhi reactive", "tutorials/steady/flash/flash12_nh3_acetic_ethanol_reactive", "water",  "liquidHeatCapacity", None),
    ("gammaGamma",                  "tutorials/steady/flash/vlle03_audit_artificial",            "compA",   "vaporPressure",      True),
    ("phiPhi",                      "tutorials/steady/flash/flash10_ch4propane_pcsaft",          "propane", "vaporPressure",      None),
]


def block_span(text, key):
    m = re.search(r"^" + key + r"\s*\{", text, re.M)
    if not m:
        return None
    i, depth = m.end() - 1, 0
    while i < len(text):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return m.start(), m.end(), i
        i += 1
    return None


def second_law(prop, body):
    """The second law's body: Antoine A + log10 2, or a polynomial x 1.2."""
    m = re.search(r"coefficients\s*\(([^)]*)\)", body)
    if not m or not re.search(r"\bmodel\s+(Antoine|polynomial)\s*;", body):
        raise SystemExit(f"{NAME}: the witness law is not Antoine/polynomial:\n{body}")
    c = [float(x) for x in m.group(1).split()]
    if prop == "vaporPressure":
        c[0] += math.log10(2.0)
    else:
        c = [x * 1.2 for x in c]
    return body[:m.start(1)] + " ".join(repr(x) for x in c) + body[m.end(1):]


def make_case(tmp, witness, comp, prop, mode, how="system"):
    d = Path(tmp) / mode
    shutil.copytree(ROOT / witness, d, ignore=shutil.ignore_patterns(
        "converged", "postProcessing", "reports", "log.*", "*.csv"))
    rec = d / "constant" / "components" / f"{comp}.dat"
    if not rec.exists():
        rec.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(ROOT / "data/standards/components" / f"{comp}.dat", rec)
    t = rec.read_text()
    a, b, c = block_span(t, prop)
    if how == "transport":
        #  The record's own two laws: the preferred one, and the other.
        body = t[b:c]
        laws = re.findall(r"^\s*(\w+)\s*\{", body, re.M)
        pref = re.search(r"preferred\s+(\w+)\s*;", body).group(1)
        other = [x for x in laws if x != pref][0]
        if mode == "preferred":
            rec.write_text(t[:b] + body.replace(f"preferred {pref};", f"preferred {other};") + t[c:])
        law2 = other
    else:
        body = t[b:c]
        preferred = "second" if mode == "preferred" else "own"
        new = (f"{prop}\n{{\n    preferred {preferred};\n    own\n    {{{body}    }}\n"
               f"    second\n    {{{second_law(prop, body)}    }}\n}}")
        rec.write_text(t[:a] + new + t[c + 1:])
        law2 = "second"
    if mode != "pinned":
        return d
    pin = f"pin ( {{ component {comp}; law {law2}; reason \"{NAME}\"; }} );"
    home = ("equilibrium" if prop == "vaporPressure" else
            "transport" if how == "transport" else "caloric")
    block = (f"{prop} {{ {pin} }}" if how != "transport" else
             f"liquid {{ viscosity {{ {pin} }} }}")
    if how.startswith("variant:") or how.startswith("inline:"):
        unit = how.split(":", 1)[1]
        fs = d / "system" / "flowsheetDict"
        f = fs.read_text()
        m = re.search(r"name\s+" + re.escape(unit) + r"\s*;", f)
        if how.startswith("variant:"):
            tp = d / "constant" / "thermoPhysPropDict"
            tp.write_text(tp.read_text() + f"\nvariants\n{{\n    pinV {{ {home} {{ {block} }} }}\n}}\n")
            f = f[:m.end()] + "\n        thermo      pinV;" + f[m.end():]
        else:
            f = f[:m.end()] + f"\n        thermo      {{ {home} {{ {block} }} }}" + f[m.end():]
        fs.write_text(f)
        return d
    if how.startswith("sector:"):
        tp = d / "sectors" / how.split(":", 1)[1] / "constant" / "thermoPhysPropDict"
    else:
        tp = d / "constant" / "thermoPhysPropDict"
    s = tp.read_text()
    span = block_span(s, home)
    if how == "transport":
        s = re.sub(r"viscosity\s*\{\s*\}", "viscosity { " + pin + " }", s, count=1)
    elif span is None:
        s += f"\n{home}\n{{\n    {block}\n}}\n"
    else:
        s = s[:span[2]] + f"    {block}\n" + s[span[2]:]
    tp.write_text(s)
    return d


def binary_of(case):
    m = re.search(r"application\s+(\w+)\s*;", (Path(case) / "system" / "controlDict").read_text())
    return ROOT / (m.group(1) if m else "choupoSolve")


def numbers(case, keys=None):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(binary_of(case)), str(case)], capture_output=True, text=True,
                       env=env, timeout=1800)
    m = re.search(r"<<<Choupo:result-begin>>>\n(.*?)\n<<<Choupo:result-end>>>",
                  r.stdout + r.stderr, re.S)
    if r.returncode != 0 or not m:
        tail = (r.stdout + r.stderr).strip().splitlines()[-3:]
        return None, " / ".join(tail)
    out = {}

    def walk(x, path):
        if isinstance(x, dict):
            for k, v in x.items():
                if k in ("timestamp", "wallTime", "elapsed", "commit", "date", "seconds"):
                    continue
                walk(v, path + "." + k)
        elif isinstance(x, list):
            for i, v in enumerate(x):
                walk(v, f"{path}[{i}]")
        elif isinstance(x, (int, float)) and not isinstance(x, bool):
            out[path] = x
    walk(json.loads(m.group(1)), "")
    if keys:
        out = {k: v for k, v in out.items() if k.startswith(keys) or keys in k}
    return out, ""


def main():
    if not SOLVE.exists():
        print(f"{NAME}: FAIL -- {SOLVE} is missing (build first)")
        return 1
    fails, lines = [], []
    arms = [a + ("system", None) for a in ARMS] + ARMS7
    sel = [x for x in sys.argv[1:] if not x.startswith("-")]   # labels to run alone (development)
    arms = [a for a in arms if not sel or any(x in a[0] for x in sel)]
    for form, witness, comp, prop, moves, how, keys in arms:
        with tempfile.TemporaryDirectory(prefix="pins_") as tmp:
            res = {}
            for mode in ("base", "preferred", "pinned"):
                res[mode], err = numbers(make_case(tmp, witness, comp, prop, mode, how), keys)
                if res[mode] is None:
                    fails.append(f"{form}: {witness} ({comp} {prop}, {mode}) did not run: {err}")
            if any(v is None for v in res.values()):
                continue
            if not res["preferred"]:
                fails.append(f"{form}: {witness} published no number under {keys!r} -- the arm compares nothing")
                continue
            diff = [k for k in res["preferred"] if res["pinned"].get(k) != res["preferred"][k]]
            moved = [k for k in res["preferred"] if res["base"].get(k) != res["preferred"][k]]
            if diff:
                fails.append(f"{form}: {comp}'s pinned {prop} law gives {len(diff)} number(s) that"
                             f" differ from the same law preferred (first: {diff[0]}"
                             f" {res['pinned'].get(diff[0])} vs {res['preferred'][diff[0]]}):"
                             " the pin did not reach every copy the engine reads")
            if moves and not moved:
                fails.append(f"{form}: the second {prop} law of {comp} moves no number --"
                             " the arm is vacuous")
            lines.append(f"{form} {comp}.{prop}: pinned = preferred over {len(res['preferred'])}"
                         f" numbers, {len(moved)} moved by the law"
                         + ("" if moved else " (the property does not enter this result)"))
    if fails:
        print(f"{NAME}: FAIL ({len(fails)})")
        for x in fails:
            print("  " + x)
        return 1
    print(f"{NAME}: OK -- a pinned record law gives every number the same law gives when"
          f" preferred, in {len(arms)} arms: the five formulations and the paths a pin takes"
          f" ({'; '.join(lines)})."
          "  NOT CHECKED: whether either law is right; the time-integrated binaries.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
