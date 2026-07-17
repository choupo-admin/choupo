#!/usr/bin/env python3
"""Seal-drift gate: sealed copies vs the live standards catalogue.

A sealed case's constant/propertyManifest records, for every IMPORTED record,
the sha256 of the catalogue file it was copied from (originSha256).  When the
catalogue evolves (curation), the sealed copies silently age -- the case still
runs (that is the POINT of sealing), but the drift must be VISIBLE, or the
standards tree rots unnoticed under 270+ frozen copies.

This gate walks every tutorials/**/constant/propertyManifest and reports each
imported/merged record whose origin file changed (or vanished) in
data/standards/.  Exit 0 with drift REPORTED (informational -- drift is
legitimate after curation; re-run `bin/choupo-import` per case to refresh);
exit 1 only on manifest corruption (a claimed file missing on disk or failing
its own sha256 -- that is damage, not drift).

Adopted records are the author's -- never checked against the catalogue.
"""
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STD = ROOT / "data" / "standards"


def sha_file(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def read_manifest(mf):
    txt = re.sub(r'/\*.*?\*/', '', mf.read_text(), flags=re.S)
    txt = re.sub(r'^\s*//.*$', '', txt, flags=re.M)
    out = {}
    for m in re.finditer(r'"([^"]+)"\s*\{([^}]*)\}', txt):
        rel, body = m.group(1), m.group(2)
        entry = {}
        for km in re.finditer(r'\b(\w+)\s+("([^"]*)"|[^;\s]+)\s*;', body):
            entry[km.group(1)] = km.group(3) if km.group(3) is not None \
                else km.group(2)
        out[rel] = entry
    return out


drift, damage = [], []
nManifests = nRecords = 0
for mf in sorted((ROOT / "tutorials").rglob("constant/propertyManifest")):
    nManifests += 1
    case = mf.parent.parent.relative_to(ROOT)
    for rel, e in read_manifest(mf).items():
        t = e.get("type", "")
        if t == "adopted":
            continue                      # the author's record, not ours to check
        nRecords += 1
        dst = mf.parent / rel
        # (a) integrity of the sealed copy itself -- damage, not drift
        if not dst.exists():
            damage.append(f"{case}: claimed constant/{rel} MISSING on disk")
            continue
        if "sha256" in e and sha_file(dst) != e["sha256"]:
            damage.append(f"{case}: constant/{rel} fails its manifest sha256"
                          " (edited without --adopt-local/--overwrite?)")
            continue
        # (b) drift of the origin -- informational
        osha = e.get("originSha256")
        if not osha:
            continue
        src = STD / rel
        if not src.exists():
            drift.append(f"{case}: origin data/standards/{rel} VANISHED from"
                         " the catalogue")
        elif sha_file(src) != osha:
            drift.append(f"{case}: data/standards/{rel} changed since import")

if damage:
    print("SEAL DAMAGE (broken manifests -- fix these, they are not drift):")
    for d in damage:
        print("  " + d)
if drift:
    print(f"SEAL DRIFT: {len(drift)} sealed record(s) whose catalogue origin"
          " evolved (re-run `bin/choupo-import <case>` to refresh):")
    seen = {}
    for d in drift:
        seen.setdefault(d.split(": ", 1)[1], []).append(d.split(": ", 1)[0])
    for what, cases in sorted(seen.items()):
        print(f"  {what}   [{len(cases)} case(s)]")
if not damage and not drift:
    print(f"seal drift: clean -- {nRecords} imported record(s) across"
          f" {nManifests} manifest(s) all match the live catalogue")
sys.exit(1 if damage else 0)
