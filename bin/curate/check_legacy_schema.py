#!/usr/bin/env python3
"""Anti-legacy gate (D2 closed migration, ratified 2026-07-26): NO
pre-identity gas-liquid schema remains in the dev corpus.

The loader keeps a LEGACY ADAPTER strictly at its boundary (old external
cases open, converted in memory, announced `[legacy] ... re-import
recommended`) -- but the corpus this repo SHIPS must be canonical:

  * data/standards/chemistry/ gasLiquidEquilibrium records: schemaVersion 2
    with the typed identity (gasSpecies / dissolvedSpecies / solvent /
    convention) and WITHOUT the legacy `gas` / `dissolved` keys;
  * data/standards/parameters/Henry/ pair records: the typed identity
    present (delegated to migrate_henry_identity.py --check);
  * every sealed tutorial mirror (tutorials/**/constant/chemistry/,
    tutorials/**/constant/parameters/Henry/): the same rules -- a stale
    mirror means the case was not re-imported after the wave.

data/local/ (private tier) and thirdParty/ are the adapter's domain and
are NOT scanned.
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
bad = []


def strip(t):
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    return re.sub(r'//.*$', '', t, flags=re.M)


def check_gasliquid(p, label):
    raw = p.read_text()
    if "recordType gasLiquidEquilibrium;" not in raw:
        return
    t = strip(raw)
    for key in ("gasSpecies", "dissolvedSpecies", "solvent", "convention"):
        pat = rf'\b{key}\s+("[^"]+"|\S+)\s*;'
        if not re.search(pat, t):
            bad.append(f"{label}: missing canonical `{key}`")
    if re.search(r'\bgas\s+\S+\s*;', t) or re.search(r'\bdissolved\s', t):
        bad.append(f"{label}: legacy gas/dissolved keys present -- legacy"
                   f" schema is accepted for migration only, never shipped")
    if not re.search(r'\bschemaVersion\s+2\s*;', t):
        bad.append(f"{label}: gasLiquidEquilibrium must be schemaVersion 2")


def check_henry(p, label):
    t = strip(p.read_text())
    if not re.search(r'\bsolute\s+\S+\s*;', t):
        return
    for key in ("gasSpecies", "dissolvedSpecies", "convention"):
        if not re.search(rf'\b{key}\s+\S+\s*;', t):
            bad.append(f"{label}: missing typed identity `{key}`")


for p in sorted((ROOT / "data/standards/chemistry").glob("*.dat")):
    check_gasliquid(p, f"data/standards/chemistry/{p.name}")

r = subprocess.run([sys.executable,
                    str(ROOT / "bin/curate/migrate_henry_identity.py"),
                    "--check"], capture_output=True, text=True)
if r.returncode != 0:
    bad.append("parameters/Henry identity check failed:\n"
               + (r.stdout + r.stderr).strip())

tut = ROOT / "tutorials"
for p in sorted(tut.glob("**/constant/chemistry/*.dat")):
    check_gasliquid(p, str(p.relative_to(ROOT)))
for p in sorted(tut.glob("**/constant/parameters/Henry/*.dat")):
    check_henry(p, str(p.relative_to(ROOT)))

if bad:
    print("legacy-schema gate FAILED:")
    for x in bad:
        print("  " + x)
    sys.exit(1)
print("legacy-schema gate: dev corpus fully canonical (standards chemistry"
      " + Henry pairs + sealed tutorial mirrors)")
