#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Case-records gate: a case that REFERENCES the catalogue carries only the
records that are the case's own (C413, the pin-form half of what
check_sealed_corpus held for sealed cases).

For every case whose constant/propertyManifest holds `pins`:

  * no local record is computationally identical to the catalogue record of its
    name -- the copies may not come back (delete it; the pin follows the record);
  * every local record that has a catalogue homonym is either DECLARED
    (`overlayOf` / `variationOf` / `distinctFrom`, each with a
    `variationReason`) or listed under `held {}` (the transitional block);
  * `held` only shrinks: the number of held copies in the tree may not exceed
    HELD_CEILING, which is lowered by whoever re-points a held copy and never
    raised;
  * a pin is not written for a record the case reads ALONE (a declared
    variation or a held copy): the case does not read the catalogue's, and a
    pin that says it does is a claim nothing checks;
  * a path the case's own run WRITES (`record "constant/<sub>"` in a dict under
    system/) has no catalogue homonym -- otherwise deleting the product would
    silently resolve the catalogue's record (membrane24's NF270_FdL2021.dat).

The sealed cases are still judged by check_sealed_corpus (marker, manifest, the
records a manifest names on disk and not git-ignored).  This gate does not
require a manifest: that is check_sealed_corpus's claim.  Exit 1 listing the
problems, each with its remedy."""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROPS = ROOT / "build" / "linux64Gcc" / "choupoProps"
sys.path.insert(0, str(Path(__file__).resolve().parent))
import case_records  # noqa: E402

#  The number of `held` copies the tree may carry.  LOWER IT when a held copy is
#  re-pointed; never raise it (a held copy is debt with a number, not a feature).
#  The tree it reads (for `bin/integrate --plan`, DEV.md 4c C394): every case's constant/ records and dicts.
SCAN_ROOTS = ("tutorials", "data/curation")

HELD_CEILING = 0          # C421 (2026-11-18): every held copy retired -- a reference or a declared variation; only ever LOWER it

SUBS = ("components", "species", "chemistry", "parameters", "assets",
        "utilities", "adsorbents", "mixtures")
_canon = {}


def canon(p):
    k = str(p)
    if k not in _canon:
        r = subprocess.run([str(PROPS), "--canonical-hash", k],
                           capture_output=True, text=True)
        _canon[k] = r.stdout.split()[0] if r.returncode == 0 else None
    return _canon[k]


def strip(txt):
    txt = re.sub(r'/\*.*?\*/', '', txt, flags=re.S)
    return re.sub(r'(?m)^\s*//.*$', '', txt)


def declaration(path):
    t = strip(path.read_text(errors="replace"))
    kinds = [k for k in ("overlayOf", "variationOf", "distinctFrom")
             if re.search(r'(?m)^\s*' + k + r'\s+\S+;', t)]
    reason = bool(re.search(r'(?m)^\s*variationReason\s+(".+"|\S+)\s*;', t))
    return kinds, reason


def judge(case, root=ROOT):
    """-> [problem strings] for ONE case directory (a fixture outside the tree
    is judged against `root`'s catalogue)."""
    case = Path(case)
    std = Path(root) / "data" / "standards"
    man = case / "constant" / "propertyManifest"
    mf = case_records.read_manifest(man)
    if not mf["has_pins"]:
        return []
    out = []
    name = case.name
    for sub in SUBS:
        base = case / "constant" / sub
        if not base.is_dir():
            continue
        for f in sorted(base.rglob("*.dat")):
            rel = str(f.relative_to(case / "constant"))
            cat = std / rel
            if not cat.is_file():
                continue                          # local-only: nothing to declare
            held = rel in mf["held"]
            kinds, reason = declaration(f)
            alone = held or any(k in ("variationOf", "distinctFrom") for k in kinds)
            if not held and canon(f) is not None and canon(f) == canon(cat):
                out.append(f"{name}: constant/{rel} is computationally IDENTICAL to"
                           f" data/standards/{rel} -- a copy may not come back."
                           f"  Remedy: delete it; `bin/choupo-import --pin <case>` pins the record")
                continue
            if not held and not kinds:
                out.append(f"{name}: constant/{rel} shadows data/standards/{rel} and"
                           f" declares nothing.  Remedy: `variationOf` (a full record)"
                           f" or `overlayOf` (a delta) or `distinctFrom` (another species),"
                           f" each with a `variationReason \"...\";`")
            elif not held and not reason:
                out.append(f"{name}: constant/{rel} declares `{kinds[0]}` and no"
                           f" `variationReason`.  Remedy: add the one sentence")
            if alone and rel in mf["pins"]:
                out.append(f"{name}: the manifest pins {rel}, but the case reads its own"
                           f" copy ALONE (a {'held copy' if held else 'declared variation'})"
                           f" -- a pin for a record the run does not read is a claim"
                           f" nothing checks.  Remedy: remove the pin line")
    return out


def written_homonyms(case, root=ROOT):
    """A path the case's OWN run writes (`record "constant/<sub>"` in a dict
    under system/) with a catalogue homonym -- for ANY case, pinned or not."""
    case = Path(case)
    std = Path(root) / "data" / "standards"
    out = []
    for sd in sorted((case / "system").glob("*Dict")):
        for m in re.finditer(r'\brecord\s+"constant/([^"]+)"', strip(sd.read_text(errors="replace"))):
            rel = m.group(1)
            if (std / rel).is_file():
                out.append(f"{case.name}: system/{sd.name} WRITES constant/{rel}, which has a"
                           f" catalogue homonym data/standards/{rel} -- deleting the product"
                           f" would silently resolve the catalogue's record.  Remedy: give the"
                           f" product a name the catalogue does not use")
    return out


def main():
    if not PROPS.exists():
        print(f"check_case_records: {PROPS} missing -- build first")
        return 1
    problems, nCases, nHeld, nWriters = [], 0, 0, 0
    for sd in sorted(ROOT.glob("tutorials/**/system/controlDict")) \
            + sorted(ROOT.glob("data/curation/**/system/controlDict")):
        nWriters += 1
        problems += written_homonyms(sd.parent.parent, ROOT)
    for m in case_records.manifests(ROOT):
        mf = case_records.read_manifest(m)
        if not mf["has_pins"]:
            continue
        nCases += 1
        nHeld += len(mf["held"])
        problems += judge(m.parent.parent, ROOT)
    if nHeld > HELD_CEILING:
        problems.append(f"{nHeld} held cop(ies) in the tree, the ceiling is {HELD_CEILING}"
                        f" -- `held` only shrinks.  Remedy: re-point a held copy"
                        f" (`choupo-import --pin <case> --from-sealed --repoint <rel>`), never"
                        f" raise the ceiling")
    if problems:
        print("check_case_records: FAIL")
        for p in problems:
            print("  - " + p)
        return 1
    print(f"check_case_records: OK -- {nCases} referencing case(s): no local record equals the"
          f" catalogue's, every homonym is declared with its reason (or held), {nHeld} held"
          f" cop(ies) against a ceiling of {HELD_CEILING}, no pin names a record read alone, and no"
          f" path a case writes has a catalogue homonym ({nWriters} cases read for it).  NOT CHECKED: that every case has a"
          f" manifest (check_sealed_corpus), that a declared variation's numbers are right, or the"
          f" sealed cases' copies (check_seal_drift).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
