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

NOT CHECKED: whether either law is right; a formulation with no shipped
steady witness; the time-integrated binaries (they refuse a unit `thermo`
and build one package per run through the same builder).

    reads: src/thermo/Database.cpp src/thermo/ThermoPackageBuilder.cpp
    reads: src/thermo/ThermoPackage.cpp src/thermo/Component.cpp src/thermo/RecordLaws.cpp
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

#  (formulation label, witness, component, property, must the number move?)
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


def make_case(tmp, witness, comp, prop, mode):
    d = Path(tmp) / mode
    shutil.copytree(ROOT / witness, d, ignore=shutil.ignore_patterns(
        "converged", "postProcessing", "reports", "log.*", "*.csv"))
    rec = d / "constant" / "components" / f"{comp}.dat"
    if not rec.exists():
        rec.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(ROOT / "data/standards/components" / f"{comp}.dat", rec)
    t = rec.read_text()
    a, b, c = block_span(t, prop)
    body = t[b:c]
    preferred = "second" if mode == "preferred" else "own"
    new = (f"{prop}\n{{\n    preferred {preferred};\n    own\n    {{{body}    }}\n"
           f"    second\n    {{{second_law(prop, body)}    }}\n}}")
    rec.write_text(t[:a] + new + t[c + 1:])
    if mode == "pinned":
        tp = d / "constant" / "thermoPhysPropDict"
        s = tp.read_text()
        home = "equilibrium" if prop == "vaporPressure" else "caloric"
        pin = (f"{prop} {{ pin ( {{ component {comp}; law second; reason \"{NAME}\"; }} ); }}")
        span = block_span(s, home)
        if span is None:
            s += f"\n{home}\n{{\n    {pin}\n}}\n"
        else:
            s = s[:span[2]] + f"    {pin}\n" + s[span[2]:]
        tp.write_text(s)
    return d


def numbers(case):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(SOLVE), str(case)], capture_output=True, text=True,
                       env=env, timeout=900)
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
    return out, ""


def main():
    if not SOLVE.exists():
        print(f"{NAME}: FAIL -- {SOLVE} is missing (build first)")
        return 1
    fails, lines = [], []
    for form, witness, comp, prop, moves in ARMS:
        with tempfile.TemporaryDirectory(prefix="pins_") as tmp:
            res = {}
            for mode in ("base", "preferred", "pinned"):
                res[mode], err = numbers(make_case(tmp, witness, comp, prop, mode))
                if res[mode] is None:
                    fails.append(f"{form}: {witness} ({comp} {prop}, {mode}) did not run: {err}")
            if any(v is None for v in res.values()):
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
          f" preferred, in {len(ARMS)} arms over the five formulations ({'; '.join(lines)})."
          "  NOT CHECKED: whether either law is right; the time-integrated binaries.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
