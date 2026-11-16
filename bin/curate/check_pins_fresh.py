#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Pins-fresh gate: every pin equals the catalogue record it names (C413).

A case that REFERENCES the catalogue pins, per record its run reads, the
COMPUTATIONAL hash of the record (constant/propertyManifest, `pins {}`).  A
catalogue edit is committed WITH its re-pin (`bin/choupo-import --repin
<record>`); this gate holds that, STATICALLY, without running a case:

  * every pin names a file that exists in data/standards/ (class `vanished`),
    or is `absent` and the file still does not exist (class `appeared`);
  * every pin equals the computational hash of that file (class `changed`);
  * every `held` copy exists in the case and equals its own claimed hash;
  * a manifest holds `pins` OR `sealed true; records`, never both.

It is the pin-form successor of check_seal_drift's integrity half.
check_seal_drift keeps judging the cases that are still SEALED (their copies
and `records`); this gate judges the ones that reference.  Where the old gate
reported divergence from the live catalogue as history, this one FAILS it: a
pin that is not the record's hash is a case that no longer reproduces what it
claims, and the cure is one command per record.

The computational hash is the ENGINE's (`choupoProps --canonical-hash`): one
implementation, never a Python re-parse.

Exit 1 on any broken pin, naming the record, the cases and the remedy."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STD = ROOT / "data" / "standards"
PROPS = ROOT / "build" / "linux64Gcc" / "choupoProps"
sys.path.insert(0, str(Path(__file__).resolve().parent))
import case_records  # noqa: E402

_cache = {}


def canon(p):
    k = str(p)
    if k not in _cache:
        r = subprocess.run([str(PROPS), "--canonical-hash", k],
                           capture_output=True, text=True)
        _cache[k] = r.stdout.split()[0] if r.returncode == 0 else None
    return _cache[k]


def main():
    if not PROPS.exists():
        print(f"check_pins_fresh: {PROPS} missing -- build first")
        return 1
    bad = []
    nCases = nPins = nHeld = 0
    for m in case_records.manifests(ROOT):
        mf = case_records.read_manifest(m)
        case = m.parent.parent.relative_to(ROOT)
        if mf["pins"] and (mf["sealed"] or mf["records"]):
            bad.append(f"{case}: the manifest holds `pins` AND `sealed true;"
                       f" records` -- a referencing case and a sealed case are"
                       f" two claims.  Remedy: keep one (`bin/choupo-import"
                       f" --seal <case> --to <dir>` exports the sealed copy)")
        if mf["held"] and not mf["pins"]:
            bad.append(f"{case}: `held` without `pins` -- held is the"
                       f" transitional block of a pinned case")
        if not mf["pins"]:
            continue
        nCases += 1
        for rel, want in sorted(mf["pins"].items()):
            nPins += 1
            f = STD / rel
            if ".." in Path(rel).parts or rel.startswith("/"):
                bad.append(f"{case}: pin '{rel}' escapes data/standards/")
            elif want == "absent":
                if f.exists():
                    bad.append(f"{case}: pin '{rel}' is ABSENT in the manifest and the record"
                               f" now EXISTS (a pair or record among the case's components has"
                               f" appeared) -- `bin/choupo-import --repin {rel}`, then read which"
                               f" goldens moved")
            elif not f.exists():
                bad.append(f"{case}: pin '{rel}' VANISHED from the catalogue"
                           f" -- restore the record (or `bin/choupo-import --repin {rel}` pins"
                           f" it as absent), then read which goldens moved")
            else:
                got = canon(f)
                if got is None:
                    bad.append(f"{case}: pin '{rel}' names a record that does not PARSE --"
                               f" repair the record")
                elif got != want:
                    bad.append(f"{case}: pin '{rel}' CHANGED (the catalogue record"
                               f" is no longer the one pinned) -- `bin/choupo-import --repin {rel}`,"
                               f" then read which goldens moved")
        for rel, want in sorted(mf["held"].items()):
            nHeld += 1
            f = m.parent / rel
            if not f.is_file():
                bad.append(f"{case}: held copy constant/{rel} MISSING --"
                           f" restore it, or drop the entry and pin the record")
            elif canon(f) != want:
                bad.append(f"{case}: held copy constant/{rel} no longer equals"
                           f" its claimed hash -- the copy was edited; update"
                           f" the claim or restore the copy")
    if bad:
        print("check_pins_fresh: FAIL")
        for b in bad:
            print("  - " + b)
        return 1
    print(f"check_pins_fresh: OK -- {nPins} pin(s) in {nCases} referencing"
          f" case(s) each equal the computational hash of their data/standards/"
          f" record, and {nHeld} held cop(ies) equal their own claims; no"
          f" manifest holds pins together with a sealed `records`.  NOT CHECKED:"
          f" that a case reads nothing it does not pin (the run's end check and"
          f" check_shadow_identity hold that), the sealed cases (check_seal_drift),"
          f" or that any pinned value is right.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
