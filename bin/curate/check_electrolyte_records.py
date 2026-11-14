#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""One structural guard for the six per-file electrolyte record populations.

What was wrong: seven near-identical migration-era gates each read a retired
monolith under data/standards/electrolyte/ as their first act and exited 0,
leaving every later arm unreachable (found 2026-08-22); rewritten that day as
seven clones of one 60-line shape -- ~630 lines for one job.  This file is
the seven collapsed into one, same coverage, six fewer files (Gall rule,
2026-08-23).

What it checks, per population: the retired monolith stays ABSENT (a
resurrected one is a second home that drifts), every record carries its
recordType, required fields and a source citation, and a collapsed scan
(count under the floor) refuses instead of describing nothing.  Plus the
minerals arm: the mineralSolubility KIND stays retired -- dissolution data
lives in the owning component's solidPhases{} block.
"""
import re, sys
from pathlib import Path

repo = Path(__file__).resolve().parents[2]
std = repo / "data/standards"
fails = []

# label, retired monolith, dirs, select-token, required (regex, meaning), floor
POPS = [
 ("pitzer-pairs", "pairs.dat", ["parameters/Pitzer/pairs"], None,
  [("recordType electrolytePairParameters", "recordType"),
   (r"\bbeta0\b", "a beta0 value"), (r'source\s+"', "a source citation")], 40),
 ("pitzer-mixing", "mixing.dat",
  ["parameters/Pitzer/theta", "parameters/Pitzer/psi",
   "parameters/Pitzer/lambda", "parameters/Pitzer/zeta"], None,
  [("recordType electrolyteMixingParameter", "recordType"),
   (r'source\s+"', "a source citation")], 45),
 ("eNRTL", "enrtl.dat", ["parameters/eNRTL"], None,
  [("recordType electrolyteNRTLParameters", "recordType"),
   (r"\btau_m_ca\b", "tau_m_ca"), (r"\btau_ca_m\b", "tau_ca_m"),
   (r"\balpha\b", "alpha"), (r'source\s+"', "a source citation")], 2),
 ("speciation", "speciation.dat", ["chemistry"],
  "recordType aqueousSpeciation",
  [(r"\blogK25\b", "a logK25"), (r'source\s+"', "a source citation")], 45),
 ("gas-liquid", "gases.dat", ["chemistry"],
  "recordType gasLiquidEquilibrium",
  [("schemaVersion 2", "schemaVersion 2"),
   (r"\bgasSpecies\b", "a typed gasSpecies"),
   (r"\bdissolvedSpecies\b", "a typed dissolvedSpecies"),
   (r"\blogK25\b", "a logK25"), (r'source\s+"', "a source citation")], 6),
 ("ion-exchange", "exchange.dat", ["chemistry"],
  "recordType ionExchangeEquilibrium",
  [(r"\blogK25\b", "a logK25"), (r"\bmasters\b", "a masters block"),
   (r'source\s+"', "a source citation")], 4),
]

counts = {}
for label, mono, dirs, select, required, floor in POPS:
    m = std / "electrolyte" / mono
    if m.exists():
        fails.append(f"{label}: {m} EXISTS again -- the kind was consolidated"
                     " into per-file records; a monolith is a second home")
    n = 0
    for d in dirs:
        base = std / d
        if not base.is_dir():
            fails.append(f"{label}: record home data/standards/{d} is MISSING")
            continue
        for f in sorted(base.glob("*.dat")):
            txt = f.read_text(encoding="utf-8", errors="replace")
            if select and select not in txt:
                continue
            n += 1
            for pat, meaning in required:
                if not re.search(pat, txt):
                    fails.append(f"{f.relative_to(repo)}: missing {meaning}")
    if n < floor:
        fails.append(f"{label}: only {n} record(s) scanned (floor {floor})"
                     " -- collapsed scan")
    counts[label] = n

# minerals: the retired kind stays retired
if (std / "electrolyte/minerals.dat").exists():
    fails.append("electrolyte/minerals.dat EXISTS again -- mineral"
                 " dissolution data lives in the component's solidPhases{}")
chem = std / "chemistry"
if chem.is_dir():
    for f in sorted(chem.glob("*.dat")):
        if "recordType mineralSolubility" in f.read_text(encoding="utf-8",
                                                         errors="replace"):
            fails.append(f"{f.relative_to(repo)}: resurrects the RETIRED"
                         " mineralSolubility kind (no reader exists)")

# --- tCorrelationForm arm (EL-03, 2026-11-12 electrolyte review) -----------
# The Pitzer pair bridge (SaltFromCatalogue.H bridgePitzerPair) used to copy
# only the keys inside `parameters {}`, so the record's TOP-LEVEL
# `tCorrelationForm` never reached the resolver: every run told the curator to
# "declare it in the record" about the records that do, and the refusal of a
# declared form whose fields say otherwise could never fire on a standards
# record.  Two engine arms, both through the real binary:
#   (t1) every standards pair record that DECLARES a form is read as declared
#        -- the run prints no "tCorrelationForm not declared" for that pair;
#   (t2) a case-local copy of a record declaring a form its fields do not
#        support REFUSES, naming the form (two fixtures, two forms).
# A check that cannot run must not pass: no binary is a FAIL, not a skip.
import os, shutil, subprocess, tempfile

TCF = re.compile(r"^tCorrelationForm\s+(\w+)\s*;", re.M)
props_bin = repo / "choupoProps"
declaring = []
for f in sorted((std / "parameters/Pitzer/pairs").glob("*.dat")):
    m = TCF.search(f.read_text(encoding="utf-8", errors="replace"))
    if m:
        declaring.append((f, m.group(1)))
t_counts = {"t1": 0, "t2": 0}


def _probe(work: Path, cation: str, anion: str, local_record: str = None):
    (work / "system").mkdir(parents=True)
    (work / "constant").mkdir(parents=True)
    (work / "system/controlDict").write_text(
        'application choupoProps;\ndescription "tCorrelationForm probe";\n'
        "verbosity 1;\n")
    (work / "system/propsDict").write_text(
        "operations\n(\n{ name k; type pitzerActivity; cation %s; anion %s;"
        " molality { from 1; to 1; n 2; } output { file k.csv; } }\n);\n"
        % (cation, anion))
    (work / "constant/thermoPhysPropDict").write_text(
        "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
        "components ( water );\nequilibrium { formulation gammaPhi; liquid {"
        " activityModel ideal; standardState pureLiquid; } vapour {"
        " fugacityModel idealGas; } }\n")
    if local_record is not None:
        d = work / "constant/parameters/Pitzer/pairs"
        d.mkdir(parents=True)
        (d / f"{cation}-{anion}.dat").write_text(local_record)
    env = dict(os.environ, CHOUPO_HOME=str(repo))
    r = subprocess.run([str(props_bin), "."], cwd=work, env=env,
                       capture_output=True, text=True, timeout=120)
    return r.returncode, r.stdout + r.stderr


if not props_bin.exists():
    fails.append("tCorrelationForm arm: choupoProps is not built -- the arm"
                 " cannot run, and a check that cannot run must not pass")
elif len(declaring) < 3:
    fails.append(f"tCorrelationForm arm: only {len(declaring)} standards"
                 " record(s) declare a form (floor 3) -- collapsed scan")
else:
    tmp = Path(tempfile.mkdtemp(prefix="tcf_"))
    try:
        for f, form in declaring:
            cation, anion = f.stem.split("-", 1)
            rc, out = _probe(tmp / f"t1_{f.stem}", cation, anion)
            if rc != 0:
                fails.append(f"(t1) {f.stem}: the probe run failed (exit {rc})"
                             f" -- {out.strip().splitlines()[-1:]}")
            elif f"pitzer pair {f.stem}: tCorrelationForm not declared" in out:
                fails.append(f"(t1) {f.stem}: the record declares"
                             f" `tCorrelationForm {form};` and the engine says"
                             " it is not declared -- the bridge drops the"
                             " top-level key again")
            else:
                t_counts["t1"] += 1
        # (t2) a declared form contradicted by the record's own fields.
        by_stem = {f.stem: (f, form) for f, form in declaring}
        fixtures = [
            ("Na-Cl", "constant298",
             "tCorrelationForm constant298 declared but T-extension"),
            ("K-Cl", "silvesterPitzer1977",
             "tCorrelationForm silvesterPitzer1977 declared but the record"
             " carries no sp_q1"),
        ]
        for stem, lie, expect in fixtures:
            if stem not in by_stem:
                fails.append(f"(t2) fixture source {stem}.dat no longer"
                             " declares a form -- the fixture cannot be built")
                continue
            f, form = by_stem[stem]
            txt = TCF.sub(f"tCorrelationForm {lie};",
                          f.read_text(encoding="utf-8"), count=1)
            cation, anion = stem.split("-", 1)
            rc, out = _probe(tmp / f"t2_{stem}", cation, anion, txt)
            if rc == 0 or expect not in out:
                fails.append(f"(t2) {stem} declared `{lie}` against fields"
                             f" for `{form}`: expected a refusal naming"
                             f" '{expect}', got exit {rc}")
            else:
                t_counts["t2"] += 1
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

if fails:
    print("electrolyte-records GATE FAILED:")
    for x in fails[:40]:
        print("  -", x)
    sys.exit(1)
print("electrolyte-records: OK -- monoliths absent, "
      + ", ".join(f"{v} {k}" for k, v in counts.items())
      + " record(s) structurally sound; the mineralSolubility kind stays"
      f" retired; {t_counts['t1']} declared tCorrelationForm(s) read as"
      f" declared and {t_counts['t2']} contradicted form(s) refused through"
      " choupoProps (a form's AGREEMENT with the physics is not checked).")
