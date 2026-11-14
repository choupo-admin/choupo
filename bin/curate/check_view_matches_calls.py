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

HOW.  Every law object, at its first evaluation, describes itself
(recordLaws::selfLine: component, property, law, type, who chose it, its
window with its type's built-in one, its source, where its record was
read); a binary pair, as its activity model takes it.  With
CHOUPO_LAW_TRACE set these go to stderr as `[law-call] ...` and
`[pair-call] ...`.  For each witness this gate runs the case so and
requires:

  (a) every law that was CALLED appears, field for field, as a line of a
      resolved view of the same run (the view formats its lines on its own,
      in ResolvedView.cpp; it never prints the law's description);
  (b) every pair a view lists was taken by an activity model of the run;
  (c) per witness, what that witness exists for: the reactive electrolyte
      case says "view not built for electrolyteGammaPhi" and no activity
      model; the pure-fluid case's transport rows name the formulation; a
      law type with a built-in window prints it; the time-integrated
      binaries print the system's view (CV-12);
  (d) THE SABOTAGE ARM (the reviewer's request): the views of one witness,
      with every law line's "who chose it" replaced by the constant "the
      record's preferred law" -- what ResolvedView.cpp would print if it
      printed L.by as a constant -- must FAIL (a).  A comparison that cannot
      see that sabotage is reported as a failure of this gate.

NOT CHECKED: a law never evaluated in the witnesses (its view line is not
compared); the numbers (other gates hold them); the views' prose rows
(energy basis, enthalpy routes) beyond (c); formulations without a witness.

    reads: src/thermo/ResolvedView.cpp src/thermo/RecordLaws.cpp src/thermo/Component.cpp
    reads: src/thermo/ThermoPackage.cpp src/thermo/activityCoefficient/ActivityModel.H
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
     ["case pin (reason:"], []),
    ("tutorials/props/thermo/purelaws02_water_two_vapour_pressure_laws", 1, [], []),
    ("tutorials/steady/thermo/variants01_ethanol_water_line", 2, ["RESOLVED PROPERTIES: variant 'vogelLaw'"], []),
    ("tutorials/steady/flash/flash01_benzene_toluene", 4, [], []),
    ("tutorials/props/steam/steam02_water_transport", 3,
     ["[liquidViscosity]: law none (pure fluid) (IAPWS R12-08", "[surfaceTension]: law none (pure fluid) (IAPWS R1-76",
      "[liquidThermalConductivity]: law none (pure fluid) (IAPWS R15-11",
      "[vapourViscosity]: law none (pure fluid) (IAPWS R12-08",
      "[vapourConductivity]: law none (pure fluid) (IAPWS R15-11"], []),
    ("tutorials/steady/flowsheets/esterification2sector", 4, ["pair ethylAcetate-water: perNode"], []),
    ("tutorials/steady/flash/flash12_nh3_acetic_ethanol_reactive", 1,
     ["view not built for electrolyteGammaPhi: the resolver lines are the record"],
     ["liquid activity model:", "K-value world:"]),
    ("tutorials/steady/flash/flash10_ch4propane_pcsaft", 1, [], ["liquid activity model:"]),
    ("tutorials/steady/flash/vlle03_audit_artificial", 1, [], []),
    ("tutorials/steady/flash/flash08_co2_water_package", 1, ["view not built for diluteSolution"], []),
    ("tutorials/props/compare/compare_psat_ambrose_walton", 1,
     ["built-in (type AmbroseWalton)"], []),
    ("tutorials/steady/distillation/acetone06_luyben_column_C1", 1,
     ["built-in (type RowlinsonBondi): Tr 0.25-0.85"], []),
    ("tutorials/batch/reactor/batch01_first_order", 0, ["RESOLVED PROPERTIES: system"], []),
    ("tutorials/ctrl/ctrl01_cstr_temp_control", 0, ["RESOLVED PROPERTIES: system"], []),
]

LAW = re.compile(r"^\S+ \[\w+\]: law ")


def binary_of(case):
    m = re.search(r"application\s+(\w+)\s*;", (Path(case) / "system" / "controlDict").read_text())
    return ROOT / (m.group(1) if m else "choupoSolve")


def run(witness, tmp):
    d = Path(tmp) / Path(witness).name
    shutil.copytree(ROOT / witness, d, ignore=shutil.ignore_patterns(
        "converged", "postProcessing", "reports", "log.*", "[0-9]*", "*.csv"), symlinks=True)
    if not (d / "0").exists() and (ROOT / witness / "0").exists():
        shutil.copytree(ROOT / witness / "0", d / "0")
    env = dict(os.environ, CHOUPO_HOME=str(ROOT), CHOUPO_LAW_TRACE="1")
    r = subprocess.run([str(binary_of(d)), str(d)], capture_output=True, text=True, env=env,
                       timeout=1800, cwd=str(d))
    return r


def view_lines(stdout):
    out = []
    for line in stdout.splitlines():
        if not line.startswith("[properties] "):
            continue
        s = line[len("[properties] "):].strip()
        s = re.sub(r"^(CHOICE|DATA)\s+", "", s)
        s = re.sub(r"^when the phase is pure in it: ", "", s)
        out.append(s)
    return out


def compare(calls, pairs, views):
    """-> list of mismatches between what was called and what the views say."""
    vset = set(views)
    bad = [f"called but not in any view: {c}" for c in sorted(calls) if c not in vset]
    vpairs = {v for v in views if v.startswith("pair ")}
    bad += [f"a view lists a pair no model of the run took: {p}" for p in sorted(vpairs) if p not in pairs]
    return bad


def sabotage(views):
    """What the view would print if ResolvedView printed L.by as a constant."""
    return [re.sub(r"^(\S+ \[\w+\]: law .*?\(.*?\)), (.*?); window:",
                   r"\1, the record's preferred law; window:", v) if LAW.match(v) else v
            for v in views]


def main():
    fails, lines, sab_done = [], [], False
    for witness, minimum, must, mustnot in WITNESSES:
        if not (ROOT / witness).exists():
            fails.append(f"{witness}: the witness is gone")
            continue
        with tempfile.TemporaryDirectory(prefix="view_") as tmp:
            r = run(witness, tmp)
        if r.returncode != 0:
            fails.append(f"{witness}: exited {r.returncode}: {(r.stdout + r.stderr).strip().splitlines()[-1:]}")
            continue
        calls = {l[len("[law-call] "):] for l in r.stderr.splitlines() if l.startswith("[law-call] ")}
        pairs = {l[len("[pair-call] "):] for l in r.stderr.splitlines() if l.startswith("[pair-call] ")}
        views = view_lines(r.stdout)
        text = "\n".join(views) + "\n"
        bad = compare(calls, pairs, views)
        fails += [f"{witness}: {b}" for b in bad]
        if len(calls) < minimum:
            fails.append(f"{witness}: {len(calls)} law(s) called, the arm needs {minimum} -- vacuous")
        fails += [f"{witness}: the view does not say `{m.strip()}`" for m in must if m not in text]
        fails += [f"{witness}: the view says `{m.strip()}`, which is false for this case" for m in mustnot if m in text]
        lines.append(f"{Path(witness).name} {len(calls)} calls/{len(pairs)} pairs")
        #  (d) the sabotage arm, on the first witness whose comparison it can bite
        if not sab_done and calls and not bad:
            sab = compare(calls, pairs, sabotage(views))
            if not sab and any("the record's preferred law" not in c for c in calls):
                fails.append(f"{witness}: the SABOTAGE ARM passed -- with every law line's choice"
                             " replaced by a constant the comparison still matched; it cannot see a"
                             " view that lies about who chose a law")
            if any("the record's preferred law" not in c for c in calls):
                sab_done = True
                lines.append(f"sabotage arm on {Path(witness).name}: {len(sab)} mismatch(es), FAILS as it must")
    if not sab_done:
        fails.append("the sabotage arm found no witness to bite on")
    if fails:
        print(f"{NAME}: FAIL ({len(fails)})")
        for x in fails:
            print("  " + x)
        return 1
    print(f"{NAME}: OK -- in {len(WITNESSES)} witnesses every law the package called is printed by a"
          " resolved view of the same run, law, type, choice, window, source and record field for field,"
          f" and every pair a view lists was taken by a model of the run ({'; '.join(lines)}).  NOT"
          " CHECKED: laws never evaluated, the numbers, prose rows beyond the witnesses' own claims.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
