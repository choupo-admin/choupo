#!/usr/bin/env python3
"""Stream-face gate: the aggregated STEADY instant snapshot is spelled
streamFaces/faces{} wherever its writer produces it.

WRITER: run the byUnit-projecting plant case in a temp copy -- each
iterations/ instant must carry `streamFaces` (never a file named `streams`),
and byUnit/<unit>/ must hold a `streamFaces -> ../../streamFaces` symlink plus
a ports file whose projection field reads `streamFaces "../../streamFaces";`
(one spelling, no `streams` alias).

RETIRED ARM (2026-09-30, task #186): this gate used to run
bin/curate/migrate_dyn0.py and require it to write `0/streamFaces`.  The
time-integrated binaries no longer read that file -- a `0/streamFaces` is
REFUSED by name -- so the migrator that produced it was deleted with its
twin migrate_batch0.py, and the arm went with them.  The time-integrated
layout (one file per stream, `internalStates/<unit>` per vessel, refusal of
the old shape, `<t>/` directories by default and restartable) is held by
check_time_state_layout.  `streamFaces` survives only as the STEADY
iterations/ snapshot's file name, which is what this gate still checks.

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
    #  The byUnit/ projection lives where the UNITS live: at the plant root
    #  for a leaf listed in the plant's own `sectors`, and under each
    #  sector's instant directory for the units inside it.  Until 2026-09-05
    #  the flagship kept one leaf at the root (JuiceSplitter), so this arm
    #  looked at the root alone and was satisfied by it; the day that unit
    #  moved into MAIN/ the root held no unit, the arm reported the projection
    #  "missing", and every sector's byUnit/ was sitting one level down.  A
    #  gate that knows one layout of a sectored case is a gate about one case.
    by_dirs = [d for d in [inst / "byUnit"]
               + sorted(sd / "byUnit" for sd in inst.iterdir() if sd.is_dir() and sd.name != "byUnit")
               if d.exists()]
    if by_dirs:
        units = [d for by in by_dirs for d in by.iterdir() if d.is_dir()]
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
        bad.append("byUnit/ projection missing at the plant root and under every "
                   "sector (plant controlDict enables it)")


def main():
    bad = []
    with tempfile.TemporaryDirectory(prefix="choupo-faces-") as tmp:
        check_writer(tmp, bad)
    if bad:
        print("STREAM-FACE GATE FAILED (%d):" % len(bad))
        for b in bad:
            print("  " + b)
        return 1
    print("check_stream_faces: OK -- the STEADY iterations/ instant writer"
          " speaks streamFaces/faces{} with its byUnit/ projection (no"
          " retired `streams` spelling), on the flagship plant.  NOT checked"
          " here: the time-integrated layout, which check_time_state_layout"
          " holds")
    return 0


if __name__ == "__main__":
    sys.exit(main())
