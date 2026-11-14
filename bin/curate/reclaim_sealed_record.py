#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Re-claim a sealed copy after an in-place CURATION edit, without re-importing.

    bin/curate/reclaim_sealed_record.py <record.dat> [<record.dat> ...]
    bin/curate/reclaim_sealed_record.py --check <record.dat> ...

WHY (DEV.md 4c C398 slice (b), review row SL-09).  Thirty-five provenance
entries had been filed by a curation tool inside a record's `cosmo {}` block
in sealed copies.  Moving each into the record's own `provenance {}` block is
a curation edit of the sealed copy; re-importing the case to make the
manifest describe the file again would ALSO refresh every other record of the
case to today's catalogue and move rows that have nothing to do with the
move.  This tool is the narrow act: for each given record, the claim in the
nearest constant/propertyManifest gets the file's new `sha256` and
`computationalSha256` (the engine's canonical hash, choupoProps
--canonical-hash -- the one the runtime seal check reads, SealCheck.cpp).
Nothing else in the manifest is touched: `origin`, `originSha256`, `release`
and `importedAt` still say what was imported and from where, which stays
true; the catalogue's later edit is drift, reported by check_seal_drift.

Refused: a record the manifest does not claim (an authored file is never
claimed by this tool), a claim that is neither `imported` nor `adopted` (an
adopted record is the author's and carries no hash: it is reported and left),
a record whose file does not parse.  `--check` verifies that each claim matches its file and
writes nothing.
"""
import hashlib
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NAME = "reclaim_sealed_record"


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def canonical(p):
    exe = ROOT / "build" / "linux64Gcc" / "choupoProps"
    r = subprocess.run([str(exe), "--canonical-hash", str(p)], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"{NAME}: choupoProps --canonical-hash failed on {p}: {r.stderr.strip()}")
    return r.stdout.split()[0]


def manifest_for(rec):
    """The nearest constant/propertyManifest above the record, and the claim key."""
    p = rec.resolve().parent
    while p != p.parent:
        if p.name == "constant" and (p / "propertyManifest").exists():
            return p / "propertyManifest", str(rec.resolve().relative_to(p))
        p = p.parent
    sys.exit(f"{NAME}: no constant/propertyManifest above {rec}")


def main(argv):
    check = "--check" in argv
    recs = [Path(a) for a in argv if a != "--check"]
    if not recs:
        print(__doc__)
        return 2
    bad = 0
    for rec in recs:
        man, key = manifest_for(rec)
        text = man.read_text()
        m = re.search(r'\n(\s*)"' + re.escape(key) + r'"\s*\n\s*\{(.*?)\n\s*\}', text, re.S)
        if not m:
            sys.exit(f"{NAME}: {man} does not claim {key} -- an authored file is never claimed here")
        body = m.group(2)
        if re.search(r"\btype\s+adopted\s*;", body):
            #  An adopted record is the author's: never hash-enforced, nothing to claim.
            print(f"adopted    {rec}  (no hash claimed; nothing to do)")
            continue
        if not re.search(r"\btype\s+imported\s*;", body):
            sys.exit(f"{NAME}: the claim of {key} in {man} is not `imported`")
        s_new, c_new = sha(rec), canonical(rec)
        s_old = re.search(r'\bsha256\s+"([0-9a-f]+)"', body)
        c_old = re.search(r'\bcomputationalSha256\s+"([0-9a-f]+)"', body)
        if check:
            ok = s_old and c_old and s_old.group(1) == s_new and c_old.group(1) == c_new
            print(f"{'OK  ' if ok else 'FAIL'}  {rec}")
            bad += 0 if ok else 1
            continue
        nb = re.sub(r'(\bsha256\s+")[0-9a-f]+(")', r"\g<1>" + s_new + r"\g<2>", body, count=1)
        if c_old:
            nb = re.sub(r'(\bcomputationalSha256\s+")[0-9a-f]+(")', r"\g<1>" + c_new + r"\g<2>", nb, count=1)
        text = text[:m.start(2)] + nb + text[m.end(2):]
        man.write_text(text)
        print(f"reclaimed  {rec}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
