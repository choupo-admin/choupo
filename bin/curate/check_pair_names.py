#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: component and pair file names follow the engine's rule (DEV.md 4c C296).

    bin/curate/check_pair_names.py

THE RULE THE ENGINE READS.  A symmetric pair record is `<a>-<b>.dat` with the
two names in BYTE order: `alphaPairFilename` (src/thermo/activityCoefficient/
NRTL.cpp:62) builds `a < b ? a-b : b-a` on std::string, i.e. unsigned byte
comparison.  Python's sorted() on str compares code points, which equals byte
order for the ASCII names the first rule enforces; no locale is ever used.

WHAT IT CHECKS
  1. every data/standards/components/*.dat stem matches [A-Za-z0-9]+
     (EXEMPT, named debt below: stems the tree already carries that do not);
  2. no two component stems collide case-insensitively;
  3. no two files of one data/standards/parameters/<MODEL>/ directory collide
     case-insensitively;
  4. in the symmetric-pair directories (NRTL, UNIQUAC, Wilson -- a directory
     absent from the standards is tolerated) each `<a>-<b>.dat` is exactly two
     existing component names in byte order;
  5. every `fittedInCase` a record carries names a directory that exists;
  6. (DEV.md 4c C294) in a symmetric directory every record declares
     `model <that directory>;`, and a record a pair case fitted names a case
     of that very pair (data/curation/pairs/<stem>/...): the UNIQUAC and
     Wilson records the pair cases fit beside their NRTL share its stem.

NOT APPLIED (looked at, 2026-11-10): Henry (directed solute-solvent), Pitzer
(subdirectories lambda/pairs/psi), EdwardsPitzer, eNRTL (cation-anion ions,
not components), UNIFAC (groups/interactions tables), SRK, adsorption,
solution, electrolyte.  NOT CHECKED: file contents beyond `fittedInCase`,
data/local, case-local parameter directories.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STD = ROOT / "data" / "standards"
COMP = STD / "components"
PARAMS = STD / "parameters"
SYMMETRIC = ("NRTL", "UNIQUAC", "Wilson")

# Named debt: component stems already in the tree that are not [A-Za-z0-9]+.
# Renaming is a curation act for the commander, not this gate's.
NAME_DEBT = {"labile_S", "sepiolite_d"}


def collisions(names):
    seen, bad = {}, []
    for n in names:
        k = n.lower()
        if k in seen:
            bad.append((seen[k], n))
        seen[k] = n
    return bad


def main() -> int:
    errs = []
    stems = sorted(p.stem for p in COMP.glob("*.dat"))
    for s in stems:
        if not re.fullmatch(r"[A-Za-z0-9]+", s) and s not in NAME_DEBT:
            errs.append(f"component stem not [A-Za-z0-9]+: {s}")
    for s in sorted(NAME_DEBT):
        if s not in stems:
            errs.append(f"named debt {s} no longer exists: remove it from NAME_DEBT")
        elif re.fullmatch(r"[A-Za-z0-9]+", s):
            errs.append(f"named debt {s} is now conforming: remove it from NAME_DEBT")
    for a, b in collisions(stems):
        errs.append(f"component names collide case-insensitively: {a} / {b}")
    comps = set(stems)

    fitted = 0
    for mdir in sorted(d for d in PARAMS.iterdir() if d.is_dir()):
        files = sorted(p.name for p in mdir.iterdir() if p.is_file())
        for a, b in collisions(files):
            errs.append(f"{mdir.name}/: names collide case-insensitively: {a} / {b}")
        if mdir.name in SYMMETRIC:
            for f in files:
                if not f.endswith(".dat"):
                    continue
                parts = f[:-4].split("-")
                if len(parts) != 2:
                    errs.append(f"{mdir.name}/{f}: stem is not <a>-<b>")
                    continue
                a, b = parts
                for c in (a, b):
                    if c not in comps:
                        errs.append(f"{mdir.name}/{f}: '{c}' is not a component in data/standards/components")
                if a >= b:
                    errs.append(f"{mdir.name}/{f}: names not in byte order (expected {min(a, b)}-{max(a, b)}.dat)")
        if mdir.name in SYMMETRIC:
            for p in sorted(mdir.glob("*.dat")):
                body = re.sub(r"/\*.*?\*/", "", p.read_text(errors="replace"), flags=re.S)
                mm = re.search(r"^\s*model\s+(\S+?)\s*;", body, re.M)
                if not mm or mm.group(1) != mdir.name:
                    errs.append(f"{mdir.name}/{p.name}: declares model "
                                f"{mm.group(1) if mm else 'nothing'}, not {mdir.name}")
                fc = re.search(r'^\s*fittedInCase\s+"([^"]+)"', body, re.M)
                if fc and fc.group(1).startswith("data/curation/pairs/"):
                    if Path(fc.group(1)).parts[3] != p.stem:
                        errs.append(f"{mdir.name}/{p.name}: fittedInCase {fc.group(1)} is "
                                    "not a case of this pair (data/curation/pairs/<stem>/)")
        for p in mdir.rglob("*.dat"):
            for m in re.finditer(r'^\s*fittedInCase\s+"([^"]+)"', p.read_text(errors="replace"), re.M):
                fitted += 1
                if not (ROOT / m.group(1)).is_dir():
                    errs.append(f"{p.relative_to(ROOT)}: fittedInCase '{m.group(1)}' is not a directory")
    if errs:
        print("check_pair_names: FAIL")
        for e in errs:
            print("  " + e)
        return 1
    n_pairs = sum(len(list((PARAMS / m).glob("*.dat"))) for m in SYMMETRIC if (PARAMS / m).is_dir())
    per = ", ".join(f"{m} {len(list((PARAMS / m).glob('*.dat'))) if (PARAMS / m).is_dir() else 0}"
                    for m in SYMMETRIC)
    print(f"check_pair_names: OK -- {len(stems)} component stems ({len(NAME_DEBT)} named debt), "
          f"{n_pairs} symmetric pair files ({per}) in byte order over existing components, "
          "each declaring its directory's model, a pair-case record naming a case of its pair, "
          f"{fitted} fittedInCase paths resolve, no case-insensitive collisions.  "
          f"NOT APPLIED: Henry, Pitzer, EdwardsPitzer, eNRTL, UNIFAC, SRK, adsorption, solution.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
