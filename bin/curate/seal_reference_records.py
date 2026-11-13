#!/usr/bin/env python3
"""Copy a reference equation's record into a SEALED case, claimed in its manifest.

    bin/curate/seal_reference_records.py <caseDir> <equation> [<equation> ...]
    bin/curate/seal_reference_records.py --check <caseDir> <equation> ...

WHY (DEV.md 4c C378 pilot, ruling 1).  The liquid-density kernel prices a
component by its reference equation BY THE FACT that a Helmholtz record in
parameters/Helmholtz/ names it.  A sealed case reads only its own constant/,
so the fact must be in the case: the seal copies the record.  This tool is
that act for ONE kind of record, without re-importing the case's closure
(a full `bin/choupo-import` refresh would also refresh every other record to
today's catalogue and move rows that have nothing to do with the pilot).

WHAT IT DOES.  Copies data/standards/parameters/Helmholtz/<equation>.dat to
<case>/constant/parameters/Helmholtz/, byte for byte, and adds an `imported`
claim to the nearest constant/propertyManifest with the same fields
bin/choupo-import writes: sha256 (installed), computationalSha256 (the
engine's own canonical hash, choupoProps --canonical-hash), origin,
originSha256 and the record's release (data/standards/CATALOGUE.dat).  The
manifest's `catalogueRelease` is not touched: it names the catalogue the case
was sealed from.  A claim already present with the same hash is left alone;
a destination file that exists unclaimed is refused (it is authored).
`--check` verifies the copy and the claim and writes nothing.
"""
import hashlib
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NAME = "seal_reference_records"


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def canonical(p):
    exe = ROOT / "build" / "linux64Gcc" / "choupoProps"
    r = subprocess.run([str(exe), "--canonical-hash", str(p)], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"{NAME}: choupoProps --canonical-hash failed on {p}: {r.stderr.strip()}")
    return r.stdout.split()[0]


def release():
    #  The importer's own reading (bin/choupo-import read_release).
    t = "\n".join(l for l in (ROOT / "data" / "standards" / "CATALOGUE.dat")
                  .read_text().splitlines() if not l.lstrip().startswith("//"))
    m = re.search(r"\brelease\s+([A-Za-z][A-Za-z0-9_.-]*)\s*;", t)
    return m.group(1) if m else "Choupo-unknown"


def main(argv):
    check = "--check" in argv
    args = [a for a in argv if a != "--check"]
    if len(args) < 2:
        print(__doc__)
        return 2
    case = Path(args[0]).resolve()
    man = case / "constant" / "propertyManifest"
    if not man.exists():
        sys.exit(f"{NAME}: {man} does not exist (not a sealed case)")
    text = man.read_text()
    bad = 0
    for eq in args[1:]:
        rel = f"parameters/Helmholtz/{eq}.dat"
        src = ROOT / "data" / "standards" / rel
        dst = case / "constant" / rel
        claimed = f'"{rel}"' in text
        if check:
            ok = dst.exists() and claimed and sha(dst) == sha(src)
            print(f"{'OK  ' if ok else 'FAIL'}  {case.relative_to(ROOT)}  {rel}")
            bad += 0 if ok else 1
            continue
        if dst.exists() and not claimed:
            sys.exit(f"{NAME}: {dst} exists and the manifest does not claim it -- an"
                     " authored file is never overwritten")
        if claimed and dst.exists() and sha(dst) == sha(src):
            print(f"unchanged  {case.relative_to(ROOT)}  {rel}")
            continue
        if claimed:
            sys.exit(f"{NAME}: {rel} is claimed in {man} with another content; refresh"
                     " the case with bin/choupo-import instead")
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(src.read_bytes())
        entry = (f'        "{rel}"\n        {{\n'
                 f'            type          imported;\n'
                 f'            sha256        "{sha(dst)}";\n'
                 f'            computationalSha256 "{canonical(dst)}";\n'
                 f'            origin        "data/standards/{rel}";\n'
                 f'            originSha256  "{sha(src)}";\n'
                 f'            release       {release()};\n'
                 f'        }}\n')
        m = re.search(r"\n(\s*)records\s*\n\s*\{\n", text)
        if not m:
            sys.exit(f"{NAME}: {man} has no `records {{` block")
        text = text[:m.end()] + entry + text[m.end():]
        man.write_text(text)
        print(f"sealed     {case.relative_to(ROOT)}  {rel}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
