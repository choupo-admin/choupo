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

WHICH HASH THE SEAL CLAIMS.  A manifest declares `sealSchema legacy` (the
original whole-file byte claim) or `sealSchema computational` (the claim is
the PARSED content).  This reporter reads the declaration and checks the
hash the manifest actually claims -- see seal_check() for why that had to be
said in code as well as here.
"""
import hashlib
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STD = ROOT / "data" / "standards"
PROPS = ROOT / "build" / "linux64Gcc" / "choupoProps"


def sha_file(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


#  computationalSha256 cache (sealing-schema migration, 2026-08-03): one
#  canonical hash per distinct catalogue file classifies the drift --
#  cosmetic (comments/spacing/unit spellings; the parsed content the
#  seal claims is intact) vs COMPUTATIONAL (a value moved).
_canon = {}


def canon_sha(p):
    key = str(p)
    if key not in _canon:
        r = subprocess.run([str(PROPS), "--canonical-hash", key],
                           capture_output=True, text=True)
        _canon[key] = r.stdout.split()[0] if r.returncode == 0 else None
    return _canon[key]


_dump = {}


def canon_dump(p):
    key = str(p)
    if key not in _dump:
        r = subprocess.run([str(PROPS), "--canonical-dump", key],
                           capture_output=True, text=True)
        _dump[key] = r.stdout.strip() if r.returncode == 0 else None
    return _dump[key]


#  SEVERITY, from the parsed content -- not from the byte diff.
#  A sealed case is BROKEN only if it no longer reproduces its OWN
#  contents; differing from the LIVE catalogue is history, not failure,
#  and the two must never be printed as one number.  (Counsel 2026-08-03:
#  "não actualizes a história para tornar o aviso mais pequeno; resume a
#  história e destaca apenas aquilo que exige decisão".)
DOCUMENTATION_ONLY   = "documentation/provenance only"
ADDITIVE_UNUSED_DATA = "additive data the sealed copy does not carry"
VALUE_CHANGED        = "a declared VALUE moved"
REMOVED              = "the origin no longer declares something the seal has"


def kv(dump):
    """Top-level `key=value;` pairs of a canonical dump -- enough to tell
    an ADDED block from a MOVED number without a full tree diff."""
    out, depth, buf = {}, 0, ""
    body = dump[1:-1] if dump.startswith("{") else dump
    for ch in body:
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
        if ch == ";" and depth == 0:
            if "=" in buf:
                k, _, v = buf.partition("=")
                out[k] = v
            buf = ""
        else:
            buf += ch
    return out


def classify(sealed, origin, claimType="imported"):
    """-> severity class of the difference between two records.

    `claimType` matters: a MERGED record is the catalogue base with a
    case-local overlay already applied, so it carries keys the base does
    not -- by construction, not by drift.  Reading that as "the origin no
    longer declares something the seal has" invented a curation finding
    on 5 cases that have none (caught 2026-08-03 by checking the claim
    before reporting it).  Only an IMPORTED record -- a verbatim copy --
    lets that comparison mean anything."""
    ds, do = canon_dump(sealed), canon_dump(origin)
    if ds is None or do is None:
        return VALUE_CHANGED            # unreadable: assume the worst
    if ds == do:
        return DOCUMENTATION_ONLY       # parsed content identical
    a, b = kv(ds), kv(do)
    for k in a:
        if k not in b:
            #  Expected for a merged record; a real signal only for a
            #  verbatim imported copy.
            if claimType == "merged":
                continue
            return REMOVED
        if a[k] != b[k]:
            if claimType == "merged":
                continue          # the overlay is what differs, by design
            return VALUE_CHANGED
    return ADDITIVE_UNUSED_DATA         # origin only GAINED keys


def read_manifest(mf):
    txt = re.sub(r'/\*.*?\*/', '', mf.read_text(), flags=re.S)
    txt = re.sub(r'^\s*//.*$', '', txt, flags=re.M)
    m = re.search(r'\bsealSchema\s+(\w+)\s*;', txt)
    schema = m.group(1) if m else "legacy"
    out = {}
    for m in re.finditer(r'"([^"]+)"\s*\{([^}]*)\}', txt):
        rel, body = m.group(1), m.group(2)
        entry = {}
        for km in re.finditer(r'\b(\w+)\s+("([^"]*)"|[^;\s]+)\s*;', body):
            entry[km.group(1)] = km.group(3) if km.group(3) is not None \
                else km.group(2)
        out[rel] = entry
    return schema, out


#  WHICH HASH IS THE CLAIM.  Under `sealSchema computational` the manifest
#  claims the PARSED content; the byte sha256 is kept beside it as a record
#  of what was installed, not as the claim.  This reporter checked the byte
#  hash unconditionally and so was one schema behind the runtime -- the
#  2026-08-04 banner sweep (a comment-only edit, canonical hash BYTE-IDENTICAL
#  by construction) made it report SEAL DAMAGE on a case SealCheck.cpp passes.
#  A gate that disagrees with the engine about what the seal means is worse
#  than no gate: it teaches you to distrust a true refusal.
#
#  Cosmetic byte drift is COUNTED and reported, never treated as damage --
#  exactly the runtime's `cosmetic` bucket.
def seal_check(dst, e, schema):
    """-> (status, detail).  status in {ok, cosmetic, damage}."""
    if schema == "computational":
        #  A computational manifest whose record omits the computational
        #  claim is a BROKEN MANIFEST, not a pass -- same verdict as
        #  SealCheck.cpp, so the two can never disagree about a record.
        if "computationalSha256" not in e:
            return "damage", ("declares sealSchema computational but claims"
                              " no computationalSha256 -- re-import the case")
        got = canon_sha(dst) if PROPS.exists() else None
        if got is None:
            #  Cannot parse (or no binary): fall back to the byte claim
            #  rather than pass silently on an unverifiable record.
            if "sha256" in e and sha_file(dst) != e["sha256"]:
                return "damage", "unparseable AND fails its byte sha256"
            return "ok", ""
        if got != e["computationalSha256"]:
            return "damage", "fails its manifest computationalSha256"
        if "sha256" in e and sha_file(dst) != e["sha256"]:
            return "cosmetic", ""
        return "ok", ""
    if "sha256" in e and sha_file(dst) != e["sha256"]:
        return "damage", "fails its manifest sha256"
    return "ok", ""


drift, damage, cosmeticSeal = [], [], []
byClass = {}
nManifests = nRecords = 0
FULL = "--full-drift-report" in sys.argv
for mf in sorted((ROOT / "tutorials").rglob("constant/propertyManifest")):
    nManifests += 1
    case = mf.parent.parent.relative_to(ROOT)
    schema, records = read_manifest(mf)
    for rel, e in records.items():
        t2 = e.get("type", "")
        if t2 == "adopted":
            continue                      # the author's record, not ours to check
        nRecords += 1
        dst = mf.parent / rel
        # (a) integrity of the sealed copy itself -- THIS is a failure
        if not dst.exists():
            damage.append(f"{case}: claimed constant/{rel} MISSING on disk")
            continue
        status, detail = seal_check(dst, e, schema)
        if status == "damage":
            hint = "" if detail.endswith("re-import the case") \
                else "  (edited without --adopt-local/--overwrite?)"
            damage.append(f"{case}: constant/{rel} {detail}{hint}")
            continue
        if status == "cosmetic":
            cosmeticSeal.append(f"{case}: constant/{rel}")
        # (b) divergence from the LIVE catalogue -- history, not failure
        osha = e.get("originSha256")
        if not osha:
            continue
        src = STD / rel
        if not src.exists():
            drift.append((REMOVED, str(case), rel, "origin VANISHED"))
            byClass[REMOVED] = byClass.get(REMOVED, 0) + 1
        elif sha_file(src) != osha:
            cls = classify(dst, src, t2) if PROPS.exists() \
                  else VALUE_CHANGED
            drift.append((cls, str(case), rel, ""))
            byClass[cls] = byClass.get(cls, 0) + 1

#  What a human must look at.  A sealed case is only BROKEN by (a); a
#  value that moved in the live catalogue is worth a curator's eye, and
#  added blocks or reworded comments are not.
ACTIONABLE = (VALUE_CHANGED, REMOVED)
actionable = [d for d in drift if d[0] in ACTIONABLE]
cases_needing_review = len({d[1] for d in actionable})

print("SEALED CATALOGUE DRIFT SUMMARY")
print("  manifests inspected:            %6d" % nManifests)
print("  embedded records inspected:     %6d" % nRecords)
print("  records differing from origin:  %6d" % len(drift))
for cls in (DOCUMENTATION_ONLY, ADDITIVE_UNUSED_DATA, VALUE_CHANGED, REMOVED):
    if byClass.get(cls):
        print("      %-46s %5d" % (cls, byClass[cls]))
print()
print("  sealedReproducibilityFailures:  %6d   <- a case that no longer"
      " reproduces its OWN contents" % len(damage))
print("  cosmeticSealDrift:              %6d   <- bytes moved, the"
      " CLAIMED (parsed) content did not" % len(cosmeticSeal))
print("  catalogDivergenceCount:         %6d   <- history: the live"
      " catalogue moved on" % len(drift))
print("  cases needing a curator's eye:  %6d" % cases_needing_review)
print()
print("  A sealed case is VALID while it reproduces its own records.")
print("  Divergence from the live catalogue is a historical fact about")
print("  the catalogue, NOT a defect in the case -- do not re-seal to")
print("  make this number smaller: that rewrites the provenance the seal")
print("  exists to preserve.")

if damage:
    print()
    print("SEAL DAMAGE (these are real -- fix them):")
    for d in damage:
        print("  " + d)

if actionable:
    print()
    print("REVIEW REQUIRED (a declared value moved under a sealed case):")
    seen = {}
    for cls, case, rel, why in actionable:
        seen.setdefault((cls, rel), []).append(case)
    for (cls, rel), cases in sorted(seen.items()):
        print("  %-58s %s   [%d case(s)]" % (rel, cls, len(cases)))

if FULL:
    print()
    print("FULL INVENTORY (--full-drift-report):")
    for cls, case, rel, why in sorted(drift):
        print("  %-44s %-30s %s" % (rel, cls, case))
elif len(drift) > len(actionable):
    print()
    print("  %d further difference(s) are documentation or additive data;"
          " run with --full-drift-report to list them." % (len(drift) - len(actionable)))

sys.exit(1 if damage else 0)
