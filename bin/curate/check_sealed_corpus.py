#!/usr/bin/env python3
"""Sealed-corpus gate: every case carries its data, or names why not.

The pedagogical contract Vitor asked for in one line: a student opens ANY
tutorial and finds, under constant/, a copy of every record the case uses --
components, species, chemistry, parameters -- listed and hashed in
constant/propertyManifest.  No hunting through the installation catalogue to
learn what a case consumed.

Enforced here: every TOP-LEVEL case (it has its own system/controlDict and is
not a unit or sector folder nested inside a parent case) must carry constant/propertyManifest.

The ONE named exemption: a LIVE-OVERLAY demo -- a case whose component records
declare `overlayOf`, whose whole lesson is the field-by-field overlay resolving
against the EVOLVING standards base.  Sealing it would freeze the very
mechanism it teaches; the importer itself refuses to pre-merge it.  Those
cases stay unsealed, and this gate checks they really are that kind.

AND ITS OWN BLIND SPOT, closed 2026-07-31.  This gate finds cases by
`rglob("*.cho")` -- the marker file that CLAUDE.md sec.3 calls "the GUI's
openable entity".  So a case with no marker was not judged lenient here: it
was not judged AT ALL.  `pfr_polyesterification` had none, which made it
invisible in the GUI *and* invisible to this gate, and the pass printed a
clean count without it.  A discovery mechanism that silently omits part of
the corpus reports on the part it can see and calls it the whole.

So the marker is now a CHECKED contract, not merely the thing the search
happens to key on: every directory with `system/controlDict` must carry one.
The two checks share the same walk of the tree -- a marker audit that used a
different discovery rule from the gate it protects would be back where it
started.
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

bad = []
sealed = live = 0

#  THE MARKER AUDIT, first -- because it decides what the rest can see.
#  Walk for the thing that DEFINES a case (its controlDict), not for the
#  marker, and report every case the marker-based search below would miss.
missingMarker = []
for ctrl in sorted((ROOT / "tutorials").rglob("system/controlDict")):
    c = ctrl.parent.parent
    if not list(c.glob("*.cho")):
        missingMarker.append(str(c.relative_to(ROOT)))

caseDirs = {p.parent for p in (ROOT / "tutorials").rglob("*.cho")}
tops = []
for c in sorted(caseDirs):
    if not (c / "system" / "controlDict").exists():
        continue                          # a marker inside a composite: not a case
    # a nested unit or sector folder lives INSIDE another case directory
    if any(par in caseDirs and (par / "system" / "controlDict").exists()
           for par in c.parents):
        continue
    tops.append(c)

#  A MANIFEST'S RECORDS MUST BE IN THE CASE, AND IN GIT (C378 pilot review,
#  PA-01, 2026-11-13).  Until then this gate counted a manifest as a seal
#  without opening it: the two caustic demonstrations named
#  `parameters/solution/NaOH-water.dat`, a `.gitignore` rule (`**/solution/`)
#  kept that file out of every commit, and the gate passed on the builder's
#  tree because the ignored file was on its disk.  A hosted runner, or
#  `git archive`, got a case that refuses.  So every record a manifest names
#  must exist under constant/ AND must not be ignored by git -- the second
#  half is the one that would have seen it.
RECORD = re.compile(r'^\s*"([^"]+)"\s*$')
named = []          # (case, relative record path)
for c in tops:
    m = c / "constant" / "propertyManifest"
    if not m.exists():
        continue
    inRecords = False
    for line in m.read_text(errors="replace").splitlines():
        if re.match(r"^\s*records\b", line):
            inRecords = True
            continue
        if inRecords:
            r = RECORD.match(line)
            if r:
                named.append((c, r.group(1)))
missingRecord = []
for c, rel in named:
    if not (c / "constant" / rel).is_file():
        missingRecord.append(f"{c.relative_to(ROOT)}: its propertyManifest names"
                             f" `{rel}` and constant/{rel} is not on disk -- the"
                             f" sealed case refuses every catalogue fallback, so it"
                             f" cannot run (re-seal with bin/choupo-import)")
paths = [str((c / "constant" / rel).relative_to(ROOT)) for c, rel in named
         if (c / "constant" / rel).is_file()]
if paths and (ROOT / ".git").exists():
    try:
        q = subprocess.run(["git", "-C", str(ROOT), "check-ignore", "--no-index",
                            "--stdin"], input="\n".join(paths),
                           capture_output=True, text=True)
        for ign in q.stdout.split():
            missingRecord.append(f"{ign}: named by its case's propertyManifest and"
                                 f" IGNORED by git -- the file is on this disk and"
                                 f" in no commit, so the case does not run from"
                                 f" what git holds (narrow the .gitignore rule;"
                                 f" `git check-ignore -v {ign}` names it)")
    except FileNotFoundError:
        pass                               # no git: the on-disk half still ran

for c in tops:
    if (c / "constant" / "propertyManifest").exists():
        sealed += 1
        continue
    isLive = any(re.search(r'\boverlayOf\b', p.read_text(errors="replace"))
                 for p in (c / "constant").rglob("*.dat")) \
             if (c / "constant").is_dir() else False
    if isLive:
        live += 1
        continue
    bad.append(f"{c.relative_to(ROOT)}: no constant/propertyManifest and not a"
               f" live-overlay demo -- run bin/choupo-import so the case"
               f" carries (and names, hashed) every record it uses")

if missingMarker:
    print("sealed-corpus gate FAILED -- case(s) with no `.cho` marker:")
    for m in missingMarker:
        print(f"  {m}: has system/controlDict but no <name>.cho -- it cannot"
              f" be opened in the GUI, and this gate's own search would not"
              f" have seen it either (create the empty marker:"
              f" touch {m}/$(basename {m}).cho)")
if bad:
    print("sealed-corpus gate FAILED:")
    for b in bad:
        print("  " + b)
if missingRecord:
    print("sealed-corpus gate FAILED -- a manifest names a record the case does"
          " not carry in git:")
    for m in missingRecord:
        print("  " + m)
if missingMarker or bad or missingRecord:
    sys.exit(1)

print(f"check_sealed_corpus: OK -- every top-level case under tutorials/ carries"
      f" its .cho marker (so none is invisible to this search) and is either"
      f" SEALED with a constant/propertyManifest ({sealed}) or a live-overlay"
      f" demo exempt by design ({live}), 0 unsealed; and the {len(named)}"
      f" records those manifests name are each on disk under the case's"
      f" constant/ AND not ignored by git, so a case runs from what git holds"
      f" (C378 pilot review, PA-01).  NOT CHECKED: that a named record's"
      f" content matches the hash its manifest claims (the runtime's seal"
      f" check and check_seal_drift hold that), that a case reads no record"
      f" its manifest does not name (a sealed case reading the installation"
      f" catalogue, review PC-10), or that any sealed value is right.")
sys.exit(0)
