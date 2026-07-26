#!/usr/bin/env python3
"""VT-2005 scrub gate: the public tree ships NO externally-restricted values.

A COSMO set in the public repository is either an EXTERNAL REFERENCE
(`licence externalRestricted; installed false;` -- names and cites the
dataset, carries no numbers) or a set whose source declares open terms
(the synthetic teaching surrogates, GPL).  A sigmaProfile sitting under a
restricted licence anywhere in data/ or tutorials/ is redistribution and
fails this gate.  data/local is gitignored and out of scope: what the user
installs there is theirs.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
bad = []
scanned = refs = synth = 0
for base in ("data/standards", "tutorials"):
    for p in sorted((ROOT / base).rglob("*.dat")):
        if "data/local" in str(p):
            continue
        t = p.read_text(errors="replace")
        if "cosmo" not in t:
            continue
        scanned += 1
        for m in re.finditer(r'(\w+)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}', t):
            body = m.group(2)
            if "sigmaProfile" not in body and "variant" not in body:
                continue
            restricted = "externalRestricted" in body or "REQUIRES REVIEW" in body
            hasProfile = "sigmaProfile" in body
            openSrc = re.search(r'source\s+"[^"]*(SYNTHETIC|GPL|public domain|CC-BY(?!-NC))[^"]*"', body)
            if hasProfile and restricted:
                bad.append(f"{p.relative_to(ROOT)}: set '{m.group(1)}' carries a"
                           f" sigmaProfile under a restricted licence --"
                           f" redistribution; strip it to an external reference")
            if hasProfile and not restricted and not openSrc:
                bad.append(f"{p.relative_to(ROOT)}: set '{m.group(1)}' carries a"
                           f" sigmaProfile with no open-licence declaration in"
                           f" its source -- declare the terms or strip it")
            if hasProfile and openSrc:
                synth += 1
            if not hasProfile and restricted:
                refs += 1

if bad:
    print("cosmo-scrub gate FAILED:")
    for b in bad:
        print("  " + b)
    sys.exit(1)
print(f"cosmo-scrub gate: {refs} external references (no values shipped),"
      f" {synth} open-licence profiles; 0 restricted values in the public tree")
sys.exit(0)
