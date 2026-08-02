#!/usr/bin/env python3
"""The `constant/electrolyte/` sidecars: ALL legs retired (the last one,
`speciationMode replace`, converted 2026-08-02 to D-R1's declared
`networkScope restricted` -- see check_restricted_network for that side).

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

    # ---- CORPUS: the sidecar directory may not regrow ANYWHERE -------------
    #      (all three legs are retired now; the restriction that kept
    #      `replace` alive has its canonical home in D-R1's networkScope.)
    for f in sorted((ROOT / "tutorials").rglob("constant/electrolyte/*.dat")):
        rel = f.relative_to(ROOT)
        failures.append(f"CORPUS: {rel} -- constant/electrolyte/ is fully"
                        " retired (species -> constant/species/, reactions ->"
                        " constant/chemistry/, a deliberate restriction ->"
                        " `networkScope restricted` in the speciation block)")

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

    # ---- CONVERTED SURVIVOR: the restriction now lives in the declaration --
    #      (D-R1, approved 2026-08-02; the deep checks are
    #      check_restricted_network's -- here only the sidecar absence.)
    if (PITZ / "constant" / "electrolyte").exists():
        failures.append("CONVERTED: pitzer_seawater_verify still ships a"
                        " constant/electrolyte/ sidecar -- it converted to"
                        " `networkScope restricted` and the directory must"
                        " stay gone")

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

        # ---- REFUSAL: ANY speciation.dat sidecar (whole file retired) -----
        case = copy(tmp, PITZ, "sidecar")
        f = case / SIDECAR
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text("speciationMode replace;\nreactions ( );\n")
        want(run(case), "sidecarRetired",
             ["constant/electrolyte/speciation.dat sidecar is"
              " RETIRED",
              "networkScope restricted;",
              "pitzer_seawater_verify"])

    if failures:
        print("check_electrolyte_sidecars: FAIL")
        for x in failures:
            print("  -", x)
        return 1
    print("check_electrolyte_sidecars: OK -- constant/electrolyte/ is fully"
          " retired: every leg refuses by name with its canonical remedy"
          " (species -> constant/species/, reactions -> constant/chemistry/,"
          " restriction -> networkScope restricted), the tartrate case builds"
          " its 9-activated network canonically, and the converted seawater"
          " case ships no sidecar")
    return 0


if __name__ == "__main__":
    sys.exit(main())
