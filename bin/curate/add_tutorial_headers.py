#!/usr/bin/env python3
"""Tutorial licence banner, OpenFOAM-style (Vitor, 2026-07-18).

OpenFOAM stamps every tutorial dict with the project banner (name, version,
website) -- Choupo tutorials get the same: ONE canonical banner prepended to
every AUTHORED case file (dicts, 0/ streams, component/parameter .dat), so a
file copied out of the tree still says what project, version and licence it
came from.

Rules:
  * The banner goes ON TOP; the file's own explanatory header (no-juiceless-
    files doctrine) stays untouched right below it.
  * Idempotent: a file already carrying the banner line is skipped.
  * MACHINE outputs are never touched: log.*, expected, reports/, converged/,
    iterations/, generated propertyManifest (importer-owned, hash-claimed!),
    .cho markers, csv datasets, README/md.
  * Sealed-case IMPORTED records (claimed by constant/propertyManifest) are
    importer-owned copies -- stamping them would break their manifest sha256;
    they are skipped (their provenance lives in the manifest).  Only authored
    (unclaimed) files are stamped.
  * Case dicts and data are GPL-3.0-or-later (executable examples -- the
    licence policy of 2026-06-18).
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "bin"))

VERSION = re.search(r'CHOUPO_VERSION\s*=\s*"([^"]+)"',
                    (ROOT / "src/core/Banner.H").read_text()).group(1)

BANNER = f"""/*--------------------------------*- Choupo -*--------------------------------*\\
|       \\|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\\\|//   H eat-transfer |  Version:  {VERSION:<34} |
|     \\\\\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\\\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \\|/    P roperties    |  Tutorial case file -- part of Choupo         |
|        |     O ptimization  |                                               |
\\*-----------------------------------------------------------------------------*/
"""

BANNER_MARK = "*- Choupo -*"

SKIP_DIRS = {"reports", "converged", "iterations", "code", "data",
             "postProcessing"}
SKIP_NAMES = {"expected", "propertyManifest", "README", "README.md",
              "Allrun", "Allclean"}
SKIP_SUFFIX = {".cho", ".csv", ".md", ".png", ".pdf", ".ods", ".json",
               ".expect-nonconvergence", ".py", ".H", ".cpp"}


def manifest_claims(case_root):
    """All repo-relative paths claimed (imported/merged) by any manifest under
    the case -- importer-owned files the stamp must never touch."""
    claimed = set()
    for mf in case_root.rglob("constant/propertyManifest"):
        txt = re.sub(r'/\*.*?\*/', '', mf.read_text(errors="replace"),
                     flags=re.S)
        for m in re.finditer(r'"([^"]+)"\s*\{([^}]*)\}', txt):
            if re.search(r'\btype\s+(imported|merged)\s*;', m.group(2)):
                claimed.add((mf.parent / m.group(1)).resolve())
    return claimed


def eligible(f, claimed):
    if f.suffix in SKIP_SUFFIX or f.name in SKIP_NAMES:
        return False
    if f.name.startswith("log."):
        return False
    if any(part in SKIP_DIRS for part in f.parts):
        return False
    if f.resolve() in claimed:
        return False                       # importer-owned, hash-claimed
    try:
        head = f.read_text(errors="replace")[:400]
    except OSError:
        return False
    if BANNER_MARK in head:
        return False                       # idempotent
    return True


def main():
    targets = sys.argv[1:] or [str(ROOT / "tutorials")]
    stamped = skipped = 0
    for t in targets:
        base = Path(t).resolve()
        claimed = manifest_claims(base)
        for f in sorted(base.rglob("*")):
            if not f.is_file():
                continue
            if not eligible(f, claimed):
                skipped += 1
                continue
            body = f.read_text(errors="replace")
            f.write_text(BANNER + body)
            stamped += 1
    print(f"add_tutorial_headers: stamped {stamped}, skipped {skipped}"
          f" (version {VERSION})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
