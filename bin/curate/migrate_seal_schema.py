#!/usr/bin/env python3
"""Sealing-SCHEMA migration (ratified 2026-08-03): legacySeal ->
computationalSeal, declared as exactly that -- a schema migration, NEVER
a scientific reseal.

What it does, per sealed case (constant/propertyManifest, recursively
for context manifests):

  1. FAIL-CLOSED verification: every imported/merged record's byte
     sha256 must still match the installed file.  A case with ANY byte
     divergence is SKIPPED and listed -- migrating it would silently
     re-claim content the legacy seal says moved, which is the
     "scientific reseal" this migration exists to avoid.
  2. For each verified record, computationalSha256 is computed by the
     ENGINE (choupoProps --canonical-hash -- the one canonicalization,
     src/core/DictCanonical) from the installed file.  Because the file
     is byte-identical to what was imported, this hash describes the
     import-time content: nothing is re-validated, nothing re-imported.
  3. The manifest gains `sealSchema computational;` and per-record
     `computationalSha256` lines by MINIMAL TEXTUAL INSERTION -- the
     rest of the manifest (importedAt, importerVersion, the original
     byte hashes) is preserved byte for byte as the historical
     provenance record.

Idempotent: a manifest already carrying sealSchema computational is
left untouched.  --dry-run reports without writing.

Exit 1 if any case had to be skipped (the migration is not complete
until someone resolves those by hand -- re-import or adopt, a curation
act this script must never take on its own).
"""
import argparse
import hashlib
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROPS = ROOT / "build" / "linux64Gcc" / "choupoProps"


def sha_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def canonical_sha(p: Path) -> str:
    r = subprocess.run([str(PROPS), "--canonical-hash", str(p)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError("choupoProps --canonical-hash failed on %s:\n%s"
                           % (p, r.stderr.strip()))
    return r.stdout.split()[0]


def rel_display(p: Path) -> str:
    try:
        return str(p.relative_to(ROOT))
    except ValueError:
        return str(p)


RECORD_RE = re.compile(
    r'("(?P<rel>[^"]+)"\s*\n\s*\{\n)(?P<body>.*?)(\n\s*\})',
    re.DOTALL)


def migrate_manifest(mf: Path, dry: bool):
    """-> (status, detail): status in migrated | already | skipped."""
    text = mf.read_text()
    if re.search(r'\bsealSchema\s+computational\s*;', text):
        return "already", ""

    const = mf.parent
    #  Pass 1 -- fail-closed byte verification of every hashed record.
    bad = []
    for m in RECORD_RE.finditer(text):
        body = m.group("body")
        tm = re.search(r'\btype\s+(\w+)\s*;', body)
        hm = re.search(r'\bsha256\s+"([0-9a-f]{64})"\s*;', body)
        if not tm or tm.group(1) not in ("imported", "merged") or not hm:
            continue
        f = const / m.group("rel")
        if not f.exists():
            bad.append("%s (claimed, not on disk)" % m.group("rel"))
        elif sha_file(f) != hm.group(1):
            bad.append("%s (bytes diverged from the legacy claim)"
                       % m.group("rel"))
    if bad:
        return "skipped", "; ".join(bad)

    #  Pass 2 -- minimal insertion: computationalSha256 after each sha256
    #  line, sealSchema after `sealed ...;`.
    def add_comp(m):
        rel, body = m.group("rel"), m.group("body")
        tm = re.search(r'\btype\s+(\w+)\s*;', body)
        if not tm or tm.group(1) not in ("imported", "merged") \
           or "computationalSha256" in body \
           or not re.search(r'\bsha256\s+"', body):
            return m.group(0)
        comp = canonical_sha(const / rel)
        body2 = re.sub(
            r'(\n(\s*)sha256\s+"[0-9a-f]{64}"\s*;)',
            lambda sm: sm.group(1) + '\n%scomputationalSha256 "%s";'
                       % (sm.group(2), comp),
            body, count=1)
        return m.group(1) + body2 + m.group(4)

    text2 = RECORD_RE.sub(add_comp, text)
    text2, n = re.subn(r'(\n(\s*)sealed\s+\w+\s*;)',
                       lambda sm: sm.group(1)
                       + "\n%ssealSchema         computational;" % sm.group(2),
                       text2, count=1)
    if n != 1:
        return "skipped", "no `sealed ...;` line found to anchor sealSchema"
    if not dry:
        mf.write_text(text2)
    return "migrated", ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("paths", nargs="*",
                    help="case dirs (default: the whole tutorials/ corpus)")
    a = ap.parse_args()
    if not PROPS.exists():
        print("migrate_seal_schema: %s missing -- run `make all` first"
              % PROPS)
        return 1

    roots = [Path(p) for p in a.paths] or [ROOT / "tutorials"]
    manifests = sorted({mf for r in roots
                        for mf in r.rglob("constant/propertyManifest")})
    migrated = already = 0
    skipped = []
    for mf in manifests:
        st, why = migrate_manifest(mf, a.dry_run)
        if st == "migrated":
            migrated += 1
            print("migrated  %s" % rel_display(mf))
        elif st == "already":
            already += 1
        else:
            skipped.append((mf, why))
    print("migrate_seal_schema: %d migrated, %d already computational,"
          " %d skipped%s" % (migrated, already, len(skipped),
                             " (DRY RUN)" if a.dry_run else ""))
    for mf, why in skipped:
        print("  SKIPPED %s: %s" % (rel_display(mf), why))
    return 1 if skipped else 0


if __name__ == "__main__":
    sys.exit(main())
