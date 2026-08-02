#!/usr/bin/env python3
"""The `constant/electrolyte/` sidecars: two legs RETIRED, one SURVIVING and
named.

Design record: DEV.md section 5 debt 3.

The sidecar directory predates the typed per-record homes.  Measured on
2026-08-02, each of its legs falls into one of two classes:

  RETIRED, because a canonical home already does the same act ---
    `ions.dat`     a monolith list of inline identities, read FIRST and
                   whole-row-first-wins, so it SHADOWED the very record it
                   duplicated.  It did: the tartrate case shipped Tart and
                   HTart in the sidecar while constant/species/Tart.dat and
                   HTart.dat sat beside it holding the same four numbers.
                   Canonical home: constant/species/<name>.dat.
    `speciationMode extend`
                   adding reactions to the curated network is exactly what
                   constant/chemistry/ does (scanRecordDir merges the case
                   directory over the catalogue by FILENAME).  The sidecar
                   merged by SPECIES instead, so it could take over a curated
                   reaction without naming the file it replaced.

  SURVIVING, because nothing else can say it ---
    `speciationMode replace`
                   a DELIBERATELY RESTRICTED network.  pitzer_seawater_verify
                   must exclude the sulfate ion pairs or it double-counts what
                   the HMW ternary terms already carry, and the importer's
                   closure is REACHABILITY-based, so a re-import pulls every
                   excluded record straight back.  Until that restriction has
                   a canonical declaration, dropping this leg would silently
                   change the case's physics.

This gate keeps that split true: the two retirements REFUSE through the real
reader, the survivor still runs and announces itself, and the corpus is
checked for any regrowth of the retired forms.  When `replace` finally gets a
canonical home, THIS FILE is what has to change -- which is the point.

Exit 1 listing failures."""
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROPS = ROOT / "build" / "linux64Gcc" / "choupoProps"
TART = ROOT / "tutorials" / "props" / "electrolyte" / "tartaricAcid_acidulation"
PITZ = ROOT / "tutorials" / "props" / "electrolyte" / "pitzer_seawater_verify"
SIDECAR = "constant/electrolyte/speciation.dat"

failures = []


def run(case: Path):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(PROPS), "."], cwd=case, env=env,
                       capture_output=True, text=True, timeout=900)
    return p.returncode, p.stdout + p.stderr


def copy(tmp: Path, src: Path, tag: str) -> Path:
    case = tmp / tag
    shutil.copytree(src, case, ignore=shutil.ignore_patterns("expected", "*.csv",
                                                             "log.*"))
    return case


def want(res, tag: str, needles):
    rc, out = res
    if rc == 0:
        failures.append(f"REFUSAL {tag}: expected nonzero exit, got 0")
        return
    for nd in needles:
        if nd not in out:
            failures.append(f"REFUSAL {tag}: message lacks '{nd}'")


def main() -> int:
    if not PROPS.exists():
        print(f"check_electrolyte_sidecars: {PROPS} missing -- build first")
        return 1

    # ---- CORPUS: neither retired form may regrow anywhere ------------------
    for f in sorted((ROOT / "tutorials").rglob("constant/electrolyte/*.dat")):
        rel = f.relative_to(ROOT)
        if f.name == "ions.dat":
            failures.append(f"CORPUS: {rel} is the retired identity monolith"
                            " -- write constant/species/<name>.dat instead")
        elif f.name == "speciation.dat":
            mode = re.search(r"\bspeciationMode\s+(\w+)\s*;", f.read_text())
            if not mode or mode.group(1) != "replace":
                failures.append(f"CORPUS: {rel} does not declare"
                                " `speciationMode replace;` -- the extend leg"
                                " is retired; write one file per reaction"
                                " under constant/chemistry/")

    # ---- POSITIVE: the converted case builds its network canonically -------
    if (TART / "constant" / "electrolyte").exists():
        failures.append("POSITIVE: tartaricAcid_acidulation still ships a"
                        " constant/electrolyte/ sidecar")
    for rel in ("constant/species/H2Tart.dat",
                "constant/chemistry/HTart-formation.dat",
                "constant/chemistry/Tart-formation.dat"):
        if not (TART / rel).exists():
            failures.append(f"POSITIVE: tartaricAcid_acidulation lacks {rel}"
                            " -- the canonical route is not what it runs on")
    rc, out = run(TART)
    if rc != 0:
        failures.append(f"POSITIVE: tartaricAcid_acidulation exited {rc}")
    else:
        if "[overlay] speciation:" in out:
            failures.append("POSITIVE: the converted case still reads a"
                            " speciation sidecar")
        for sp in ("HTart: reachable from H2Tart",
                   "Tart: reachable from H2Tart"):
            if sp not in out:
                failures.append(f"POSITIVE: '{sp}' absent -- the tartrate"
                                " chemistry did not survive the move to"
                                " constant/chemistry/")
        m = re.search(r"closure over the curated network: (\d+) equilibria"
                      r" activated, (\d+) unreachable", out)
        if not m or (m.group(1), m.group(2)) != ("9", "1"):
            failures.append("POSITIVE: the closure is not the 9-activated /"
                            " 1-unreachable network the sidecar produced --"
                            f" got {m.groups() if m else 'no match'}")

    # ---- SURVIVOR: `replace` still runs, and says so ----------------------
    rc, out = run(PITZ)
    if rc != 0:
        failures.append(f"SURVIVOR: pitzer_seawater_verify exited {rc} -- the"
                        " restricted-network leg must keep working until it"
                        " has a canonical home")
    elif "REPLACES the standard catalogue (1 reactions)" not in out:
        failures.append("SURVIVOR: the restriction is not announced -- a case"
                        " running on a deliberately reduced network must say"
                        " so on every run")

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        # ---- REFUSAL: the retired identity monolith -----------------------
        case = copy(tmp, TART, "ions")
        d = case / "constant" / "electrolyte"
        d.mkdir(parents=True, exist_ok=True)
        (d / "ions.dat").write_text(
            'ions ( { species Tart; ion "C4H4O6-2"; z -2; MW 148.07; } );\n')
        want(run(case), "ionsMonolith",
             ["RETIRED monolith identity list",
              "constant/species/<name>.dat",
              "arity failure"])

        # ---- REFUSAL: the retired extend leg ------------------------------
        case = copy(tmp, PITZ, "extend")
        f = case / SIDECAR
        f.write_text(f.read_text().replace("speciationMode replace;",
                                           "speciationMode extend;"))
        want(run(case), "extendLeg",
             ["`speciationMode extend`", "RETIRED",
              "constant/chemistry/<species>-formation.dat",
              "replace"])

        # ---- REFUSAL: a mode word that is neither -------------------------
        case = copy(tmp, PITZ, "bogus")
        f = case / SIDECAR
        f.write_text(f.read_text().replace("speciationMode replace;",
                                           "speciationMode merge;"))
        want(run(case), "bogusMode",
             ["speciationMode 'merge' is not one of extend / replace"])

    if failures:
        print("check_electrolyte_sidecars: FAIL")
        for x in failures:
            print("  -", x)
        return 1
    print("check_electrolyte_sidecars: OK -- the identity monolith and the"
          " `extend` leg are retired and refuse by name with their canonical"
          " remedy; the converted tartrate case builds the SAME 9-activated"
          " network from constant/species/ + constant/chemistry/ with no"
          " sidecar; the one surviving leg (`replace`, a deliberately"
          " restricted network with no canonical home yet) still runs and"
          " announces its restriction on every run")
    return 0


if __name__ == "__main__":
    sys.exit(main())
