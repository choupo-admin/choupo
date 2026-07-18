#!/usr/bin/env python3
"""Stream-face gate: the aggregated snapshot grammar is streamFaces/faces{}
EVERYWHERE a writer or migrator can produce it.

1. MIGRATOR: run bin/curate/migrate_dyn0.py on a temp dynamic case with
   inline initial{}/inlet{} -- it must write 0/streamFaces with a faces{}
   block and must NOT write 0/streams (the official migrator resurrecting
   the retired name was an executable defect, not prose).

2. WRITER: run the byUnit-projecting plant case in a temp copy -- each
   instant must carry `streamFaces` (never a file named `streams`), and
   byUnit/<unit>/ must hold a `streamFaces -> ../../streamFaces` symlink
   plus a ports file whose projection field reads
   `streamFaces "../../streamFaces";` (one spelling, no `streams` alias).

Exit 1 listing failures."""
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
PLANT = ROOT / "tutorials" / "plant" / "ChemicalPlantTutorial"

FLOWSHEET = """units
(
    {
        name        reactor;
        type        dynamicCSTR;
        initial
        {
            T            320.0 K;
            P            1.013 bar;
            V            0.001;
            totalMoles   0.012;
            molarComposition  { compA 1.0;  compB 0.0; }
        }
        inlet
        {
            F            5.0e-5 kmol/s;
            T            330.0 K;
            molarComposition  { compA 1.0;  compB 0.0; }
        }
        operation { UA 50.0; T_jacket 360.0 K; }
    }
);
"""


def check_migrator(tmp, bad):
    case = Path(tmp) / "dyn"
    (case / "system").mkdir(parents=True)
    (case / "system" / "flowsheetDict").write_text(FLOWSHEET)
    r = subprocess.run([sys.executable,
                        str(ROOT / "bin" / "curate" / "migrate_dyn0.py"),
                        str(case)], capture_output=True, text=True, cwd=ROOT)
    if r.returncode != 0:
        bad.append("migrate_dyn0.py failed: " + (r.stdout + r.stderr)[-300:])
        return
    if (case / "0" / "streams").exists():
        bad.append("migrate_dyn0.py wrote 0/streams (the retired name)")
    faces = case / "0" / "streamFaces"
    if not faces.exists():
        bad.append("migrate_dyn0.py did not write 0/streamFaces")
        return
    txt = faces.read_text()
    if "faces" not in txt.split("{")[0].splitlines()[-1] and "\nfaces\n" not in txt:
        bad.append("0/streamFaces lacks the faces{} block")
    if "\nstreams\n" in txt:
        bad.append("0/streamFaces still spells a streams{} block")


def check_writer(tmp, bad):
    case = Path(tmp) / "plant"
    shutil.copytree(PLANT, case,
                    ignore=shutil.ignore_patterns("log.choupo*", "reports",
                                                  "converged", "iterations",
                                                  "postProcessing"))
    r = subprocess.run([str(SOLVE), str(case)], capture_output=True,
                       text=True, cwd=ROOT)
    if r.returncode != 0:
        bad.append("plant run failed: " + (r.stdout + r.stderr)[-300:])
        return
    insts = sorted((case / "iterations").iterdir())
    if not insts:
        bad.append("plant wrote no iterations/ instants")
        return
    inst = insts[-1]
    for f in inst.rglob("streams"):
        bad.append(f"instant carries a file named 'streams': {f}")
    if not (inst / "streamFaces").exists():
        bad.append(f"{inst.name}/streamFaces missing")
    by = inst / "byUnit"
    if by.exists():
        units = [d for d in by.iterdir() if d.is_dir()]
        if not units:
            bad.append("byUnit/ has no unit projections")
        for u in units[:1]:
            link = u / "streamFaces"
            if not link.is_symlink() or os.readlink(link) != "../../streamFaces":
                bad.append(f"{u.name}: streamFaces symlink missing or not"
                           " ../../streamFaces")
            ports = (u / "ports").read_text() if (u / "ports").exists() else ""
            if 'streamFaces "../../streamFaces";' not in ports:
                bad.append(f"{u.name}/ports lacks the streamFaces projection"
                           " field")
            if 'streams "../../streams";' in ports:
                bad.append(f"{u.name}/ports still emits the retired streams"
                           " alias")
    else:
        bad.append("byUnit/ projection missing (plant controlDict enables it)")


def main():
    bad = []
    with tempfile.TemporaryDirectory(prefix="choupo-faces-") as tmp:
        check_migrator(tmp, bad)
        check_writer(tmp, bad)
    if bad:
        print("STREAM-FACE GATE FAILED (%d):" % len(bad))
        for b in bad:
            print("  " + b)
        return 1
    print("stream-face gate: migrator + writer speak streamFaces/faces{}"
          " (no retired spelling)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
