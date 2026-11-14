#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the resolved view names the law, source and window of the object the package actually calls.

    bin/curate/check_view_matches_calls.py

WHY (DEV.md 4c C398, review rows CV-01..CV-07, the architect's ruling
CV-07).  The resolved view (src/thermo/ResolvedView.cpp) said five false
things about the engine on shipped cases -- another package's pairs, "no
model" where a pure-fluid formulation answered, "no window declared" for
laws with a built-in window, an ideal gamma-phi system for the reactive
electrolyte engine, a model's citation as the source of a pinned law -- and
no gate could fail on any of them: the gates compared views with views and
numbers with numbers.  The view is now generated from the objects the
computation uses, and this gate holds it to them.

HOW.  Every object that computes a property describes itself in the fields
the view prints, tagged with the IDENTITY of the package that holds it (the
fingerprint of its resolved definition, which heads that package's view):
a record law at its first evaluation, with the value it computes at its
probe temperature (`value:`, from the object itself -- the view prints the
value of a fresh object built from the law its label names, so an object
that drifted from its label differs); a predictive transport model and a
pure fluid's transport at their first use; and, at the package's assembly,
its activity model, its vapour and liquid transport models, its mixing
rules, each pure-fluid formulation (saturation, density, enthalpy), each
binary pair and each Henry pair.  With CHOUPO_LAW_TRACE set these go to
stderr as `[law-call] #<identity> ...` and `[pair-call] #<identity> ...`.
For each witness this gate runs the case so and requires:

  (a) every object a package described appears, field for field, in THAT
      package's own resolved view (never the union of the run's views:
      review row CV-20) -- a package that computed and printed no view fails;
  (b) every pair a view lists was taken by that package's model;
  (c) per witness, what that witness exists for; for a formulation the view
      does not describe, the line "view not built" names the run's lines
      that ARE the record, and each tag it names was printed by the run
      (review row CV-21);
  (d) THE SABOTAGE ARMS: seven edits of the captured views, each of which
      must make (a) or (b) FAIL -- who chose a law printed as a constant
      (the reviewer's first request); a mixing rule GrunbergNissan -> Li; a
      predictive surface tension BrockBird -> SatoRiedel; a vapour viscosity
      Chung -> ChapmanEnskog; an activity model NRTL -> UNIQUAC; the ideal-
      gas law a RowlinsonBondi law holds, its type changed; a variant's
      view stripped of its vapour-pressure lines (the reviewer's six, CV-20).
      An arm the comparison cannot see is a failure of this gate.

NOT CHECKED: a law never evaluated in the witnesses (its view line is not
compared); the numbers (other gates hold them); the views' prose rows
(energy basis, enthalpy routes) beyond (c); formulations without a witness.

    reads: src/thermo/ResolvedView.cpp src/thermo/RecordLaws.cpp src/thermo/Component.cpp
    reads: src/thermo/ThermoPackage.cpp src/thermo/activityCoefficient/ActivityModel.H
    reads: src/thermo/ThermoPackageBuilder.cpp src/thermo/Database.cpp
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NAME = "check_view_matches_calls"

#  (witness, minimum calls that must be compared, the strings its views must
#   carry, the strings its views must not carry)
WITNESSES = [
    ("tutorials/props/transport/purelaws01_methanol_isopropanol_water", 4,
     ["case pin (reason:", "[liquidViscosity.mixingRule]: law none (model) (GrunbergNissan)"], []),
    ("tutorials/props/thermo/purelaws02_water_two_vapour_pressure_laws", 1, [], []),
    ("tutorials/steady/thermo/variants01_ethanol_water_line", 2, ["RESOLVED PROPERTIES: variant 'vogelLaw'"], []),
    ("tutorials/steady/flash/flash01_benzene_toluene", 4, [], []),
    ("tutorials/props/steam/steam02_water_transport", 3,
     ["[liquidViscosity]: law none (pure fluid) (IAPWS R12-08", "[surfaceTension]: law none (pure fluid) (IAPWS R1-76",
      "[liquidThermalConductivity]: law none (pure fluid) (IAPWS R15-11",
      "[vapourViscosity]: law none (pure fluid) (IAPWS R12-08",
      "[vapourConductivity]: law none (pure fluid) (IAPWS R15-11",
      "water [pureFluid.vaporPressure]: law none (pure fluid) (IAPWS-IF97)"], []),
    ("tutorials/steady/flowsheets/esterification2sector", 4, ["pair ethylAcetate-water: perNode"], []),
    ("tutorials/steady/flash/flash12_nh3_acetic_ethanol_reactive", 1,
     ["view not built for electrolyteGammaPhi: the record is the [resolver] lines"],
     ["liquid activity model:", "K-value world:", "[liquidActivity]"]),
    ("tutorials/steady/evaporation/evaporator06_nacl_pitzer", 0,
     ["view not built for electrolyteGammaPhi: the record is the"], ["[liquidActivity]"]),
    ("tutorials/steady/flash/flash10_ch4propane_pcsaft", 1, [], ["liquid activity model:", "[liquidActivity]"]),
    ("tutorials/steady/flash/vlle03_audit_artificial", 1, ["[liquidActivity]: law none (model) (NRTL)"], []),
    ("tutorials/steady/flash/flash08_co2_water_package", 1,
     ["view not built for diluteSolution: the record is the [henry] and [builder] lines", "henry pair CO2-water"], []),
    ("tutorials/props/compare/compare_psat_ambrose_walton", 1, ["built-in (type AmbroseWalton)"], []),
    ("tutorials/steady/distillation/acetone06_luyben_column_C1", 1,
     ["built-in (type RowlinsonBondi): Tr 0.25-0.85", "[liquidHeatCapacity.idealGas]"], []),
    ("tutorials/steady/drying/sprayDryer01_sugar", 1, ["(BrockBird)"], []),
    ("tutorials/props/transport/mixing01_water_acetone", 1, ["[vapourViscosity]: law none (model) (Chung)"], []),
    ("tutorials/batch/reactor/batch01_first_order", 0, ["RESOLVED PROPERTIES: system"], []),
    ("tutorials/ctrl/ctrl01_cstr_temp_control", 0, ["RESOLVED PROPERTIES: system"], []),
    #  CV-26: the system on NRTL in the slot the flash's fragment writes, so
    #  the two definitions are equal and only the pairs they took differ.
    ("tutorials/steady/flowsheets/esterification2sector@nrtlSystem", 4,
     ["pair ethylAcetate-water: perNode", "pair ethylAcetate-water: caseRoot"], []),
]


def prepare(witness, d):
    """A witness spelled `<case>@<variant>`: the edit that makes the variant."""
    if witness.endswith("@nrtlSystem"):
        tp = d / "constant" / "thermoPhysPropDict"
        s = tp.read_text()
        assert "activityModel ideal;" in s
        tp.write_text(s.replace("activityModel ideal;", "activityModel { model NRTL; }", 1))


#  THE SABOTAGE ARMS (d): (label, witness, edit of one view line -> edited line or None).
SABOTAGE = [
    ("who chose a law, printed as a constant", "purelaws01_methanol_isopropanol_water",
     lambda v: re.sub(r"^(\S+ \[\w+\]: law .*?\(.*?\)), (.*?); window:", r"\1, the record's preferred law; window:", v)),
    ("mixing rule GrunbergNissan -> Li", "purelaws01_methanol_isopropanol_water",
     lambda v: v.replace("(GrunbergNissan)", "(Li)")),
    ("predictive surface tension BrockBird -> SatoRiedel", "sprayDryer01_sugar",
     lambda v: v.replace("(BrockBird)", "(SatoRiedel)")),
    ("vapour viscosity Chung -> ChapmanEnskog", "mixing01_water_acetone",
     lambda v: v.replace("(Chung)", "(ChapmanEnskog)")),
    ("activity model NRTL -> UNIQUAC", "vlle03_audit_artificial",
     lambda v: v.replace("law none (model) (NRTL)", "law none (model) (UNIQUAC)")),
    ("RowlinsonBondi's ideal-gas law, its type changed", "acetone06_luyben_column_C1",
     lambda v: re.sub(r"(\[liquidHeatCapacity\.idealGas\]: law .*? )\((\w+)\), held", r"\1(NASA9), held", v)),
    ("a variant's view stripped of its vapour-pressure lines", "variants01_ethanol_water_line", "STRIP_VARIANT_VP"),
    ("the flash's own pair replaced by the system's (CV-01, CV-26)", "esterification2sector@nrtlSystem",
     "SWAP_FLASH_PAIR"),
]

LAW = re.compile(r"^\S+ \[\w+\]: law ")


def binary_of(case):
    m = re.search(r"application\s+(\w+)\s*;", (Path(case) / "system" / "controlDict").read_text())
    return ROOT / (m.group(1) if m else "choupoSolve")


def run(witness, tmp):
    base = witness.split("@")[0]
    d = Path(tmp) / Path(base).name
    shutil.copytree(ROOT / base, d, ignore=shutil.ignore_patterns(
        "converged", "postProcessing", "reports", "log.*", "[0-9]*", "*.csv"), symlinks=True)
    if not (d / "0").exists() and (ROOT / base / "0").exists():
        shutil.copytree(ROOT / base / "0", d / "0")
    prepare(witness, d)
    env = dict(os.environ, CHOUPO_HOME=str(ROOT), CHOUPO_LAW_TRACE="1")
    r = subprocess.run([str(binary_of(d)), str(d)], capture_output=True, text=True, env=env,
                       timeout=1800, cwd=str(d))
    return r


def views_by_package(stdout):
    """{identity: [lines]} -- each view's lines, keyed by the fingerprint its header prints."""
    out, cur, title = {}, None, {}
    for line in stdout.splitlines():
        if not line.startswith("[properties] "):
            continue
        s = line[len("[properties] "):].strip()
        if s.startswith("================  RESOLVED PROPERTIES:"):
            cur = None
            pending = s
            continue
        m = re.match(r"^package (\S+) ", s)
        if m and cur is None:
            cur = m.group(1)
            out.setdefault(cur, [])
            title[cur] = pending
            continue
        if s.startswith("================  end of resolved properties"):
            cur = None
            continue
        if cur is None:
            continue
        s = re.sub(r"^(CHOICE|DATA)\s+", "", s)
        s = re.sub(r"^when the phase is pure in it: ", "", s)
        out[cur].append(s)
    return out, title


def tagged(stderr, prefix):
    calls = set()
    for l in stderr.splitlines():
        if l.startswith(prefix):
            m = re.match(re.escape(prefix) + r"#(\S+) (.*)$", l)
            if m:
                calls.add((m.group(1), m.group(2)))
    return calls


def compare(calls, pairs, views):
    """-> mismatches between what each package's objects said and that package's own view."""
    bad = []
    for tag, c in sorted(calls):
        if tag not in views:
            bad.append(f"package #{tag} computed ({c[:80]}...) and printed no view")
        elif c not in set(views[tag]):
            bad.append(f"package #{tag}: called but not in its own view: {c}")
    for tag, v in views.items():
        for line in v:
            if line.startswith("pair ") and (tag, line) not in pairs:
                bad.append(f"package #{tag}: its view lists a pair its model did not take: {line}")
    for tag, p in sorted(pairs):
        if p.startswith("henry pair") and (tag not in views or p not in set(views[tag])):
            bad.append(f"package #{tag}: a Henry pair it uses is not in its view: {p}")
    return bad


def sabotaged(views, titles, edit):
    if edit == "SWAP_FLASH_PAIR":
        sysline = next((l for t, v in views.items() if "SEPARATION.flash" not in titles.get(t, "")
                        for l in v if l.startswith("pair ethylAcetate-water:")), None)
        return {t: ([sysline if (l.startswith("pair ethylAcetate-water:") and sysline) else l for l in v]
                    if "SEPARATION.flash" in titles.get(t, "") else v) for t, v in views.items()}
    if edit == "STRIP_VARIANT_VP":
        return {t: ([l for l in v if "[vaporPressure]" not in l] if "variant '" in titles.get(t, "") else v)
                for t, v in views.items()}
    return {t: [edit(l) for l in v] for t, v in views.items()}


def main():
    fails, lines, captured = [], [], {}
    for witness, minimum, must, mustnot in WITNESSES:
        if not (ROOT / witness.split("@")[0]).exists():
            fails.append(f"{witness}: the witness is gone")
            continue
        with tempfile.TemporaryDirectory(prefix="view_") as tmp:
            r = run(witness, tmp)
        if r.returncode != 0:
            fails.append(f"{witness}: exited {r.returncode}: {(r.stdout + r.stderr).strip().splitlines()[-1:]}")
            continue
        calls = tagged(r.stderr, "[law-call] ")
        pairs = tagged(r.stderr, "[pair-call] ")
        views, titles = views_by_package(r.stdout)
        if "@nrtlSystem" in witness and len(views) < 2:
            fails.append(f"{witness}: the system and the flash printed ONE package identity -- two packages that"
                         " hold different pairs must not share one (review CV-26)")
        text = "\n".join(l[len("[properties] "):].strip() for l in r.stdout.splitlines()
                         if l.startswith("[properties] ")) + "\n"
        text = re.sub(r"(?m)^(CHOICE|DATA)\s+", "", text)
        bad = compare(calls, pairs, views)
        fails += [f"{witness}: {b}" for b in bad]
        if len(calls) < minimum:
            fails.append(f"{witness}: {len(calls)} object(s) described, the arm needs {minimum} -- vacuous")
        fails += [f"{witness}: the view does not say `{m.strip()}`" for m in must if m not in text]
        fails += [f"{witness}: the view says `{m.strip()}`, which is false for this case" for m in mustnot if m in text]
        #  (c) a "view not built" line names tags the run printed
        for m in re.finditer(r"the record is (.*)$", text, re.M):
            for tg in re.findall(r"\[[\w ]+\]", m.group(1)):
                if tg not in (r.stdout + r.stderr).replace("[properties]", ""):
                    fails.append(f"{witness}: the view names {tg} lines as the record, and the run printed none")
        key = Path(witness.split("@")[0]).name + ("@" + witness.split("@")[1] if "@" in witness else "")
        captured[key] = (calls, pairs, views, titles)
        lines.append(f"{key} {len(calls)} objects/{len(pairs)} pairs in {len(views)} view(s)")
    #  (d) the sabotage arms
    for label, name, edit in SABOTAGE:
        if name not in captured:
            fails.append(f"sabotage arm '{label}': its witness {name} did not run")
            continue
        calls, pairs, views, titles = captured[name]
        sab = sabotaged(views, titles, edit)
        if sab == views:
            fails.append(f"sabotage arm '{label}': the edit changed nothing in {name}'s views -- the arm is vacuous")
            continue
        n = len(compare(calls, pairs, sab))
        if n == 0:
            fails.append(f"sabotage arm '{label}' on {name}: the comparison still matched -- it cannot see it")
        else:
            lines.append(f"sabotage '{label}': {n} mismatch(es), FAILS as it must")
    if fails:
        print(f"{NAME}: FAIL ({len(fails)})")
        for x in fails:
            print("  " + x)
        return 1
    print(f"{NAME}: OK -- in {len(WITNESSES)} witnesses every object a package holds or calls (record laws"
          " with the value they compute, predictive and vapour transport models, mixing rules, activity"
          " models, pure-fluid formulations, binary and Henry pairs) is printed field for field by THAT"
          f" package's own resolved view, and {len(SABOTAGE)} sabotage arms fail ({'; '.join(lines)})."
          "  NOT CHECKED: objects never built in the witnesses, the numbers, prose rows beyond the"
          " witnesses' own claims.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
