#!/usr/bin/env python3
"""Aqueous navigation ontology gate.

metadata/aqueous-navigation.dat carries NAVIGATION, not thermodynamics: the
chemical family of each master species, the universal mediators, and the closed
topic vocabulary.  It lives outside data/standards/ so a taxonomy edit can never
drift a sealed case's hashes.

That separation is only real if it is ENFORCED.  This gate checks:

  1. no phantom species  -- every id in the ontology exists in the registry;
  2. complete coverage   -- every master species has a family root;
  3. mediators declared  -- H and OH carry navigationRole (the propagation rule
                            collapses into `water` without them);
  4. closed vocabulary   -- topicVocabulary has no duplicates and every topic
                            used elsewhere is registered;
  5. NO RUNTIME READER   -- no solver, model or resolver opens this file.

Exit 1 on any violation.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ONTO = ROOT / "metadata" / "aqueous-navigation.dat"
SPECIES = ROOT / "data" / "standards" / "species"

# Engine directories that must NEVER reach for the ontology.  The view
# generator is the only legitimate consumer.
RUNTIME_DIRS = ["src/thermo", "src/unitOperations", "src/solver", "src/streams",
                "src/materials", "src/outerDriver", "src/postProcessing"]

MEDIATORS = {"H", "OH"}

bad = []


def strip_comments(txt):
    txt = re.sub(r'/\*.*?\*/', '', txt, flags=re.S)
    return re.sub(r'//.*$', '', txt, flags=re.M)


if not ONTO.exists():
    print(f"navigation gate: {ONTO.relative_to(ROOT)} MISSING")
    sys.exit(1)

txt = strip_comments(ONTO.read_text())

# ---- parse -----------------------------------------------------------------
block = re.search(r'speciesNavigation\s*\{(.*)\n\}', txt, re.S)
if not block:
    print("navigation gate: speciesNavigation block not found")
    sys.exit(1)

entries = {}
for m in re.finditer(r'(\w+)\s*\{([^}]*)\}', block.group(1)):
    sid, body = m.group(1), m.group(2)
    roots = re.search(r'familyRoots\s*\(([^)]*)\)', body)
    role = re.search(r'navigationRole\s+(\w+)\s*;', body)
    entries[sid] = {
        "roots": roots.group(1).split() if roots else [],
        "role": role.group(1) if role else None,
    }

vocab = re.search(r'topicVocabulary\s*\(([^)]*)\)', txt)
topics = vocab.group(1).split() if vocab else []

# ---- 1. no phantom species -------------------------------------------------
registry = {p.stem for p in SPECIES.glob("*.dat")}
for sid in sorted(entries):
    if sid not in registry:
        bad.append(f"ontology names '{sid}', which is not in data/standards/species/")

# ---- 2. complete coverage --------------------------------------------------
for sid in sorted(registry - set(entries)):
    bad.append(f"master species '{sid}' has no familyRoots -- it would be "
               f"invisible to every family view")

# ---- 3. every entry has a root, mediators declared -------------------------
for sid, e in sorted(entries.items()):
    if not e["roots"]:
        bad.append(f"'{sid}' declares an empty familyRoots list")
for sid in sorted(MEDIATORS):
    if sid in entries and entries[sid]["role"] is None:
        bad.append(f"'{sid}' is a universal mediator but declares no "
                   f"navigationRole -- family propagation would collapse "
                   f"every acid-base reaction into 'water'")

# ---- 4. closed vocabulary --------------------------------------------------
if not topics:
    bad.append("topicVocabulary is missing or empty")
if len(topics) != len(set(topics)):
    dup = sorted({t for t in topics if topics.count(t) > 1})
    bad.append(f"topicVocabulary has duplicates: {', '.join(dup)}")

# ---- 5. no runtime reader --------------------------------------------------
needle = "aqueous-navigation"
for d in RUNTIME_DIRS:
    p = ROOT / d
    if not p.is_dir():
        continue
    for f in list(p.rglob("*.cpp")) + list(p.rglob("*.H")):
        if needle in f.read_text(errors="replace"):
            bad.append(f"{f.relative_to(ROOT)} reaches for the navigation "
                       f"ontology -- it is a VIEW input, never a runtime one")

# ---- report ----------------------------------------------------------------
if bad:
    print("navigation gate FAILED:")
    for b in bad:
        print("  " + b)
    sys.exit(1)

roots = sorted({r for e in entries.values() for r in e["roots"]})
print(f"navigation gate: {len(entries)} species -> {len(roots)} families, "
      f"{len(topics)} topics, {len(MEDIATORS)} mediators; no runtime reader")
sys.exit(0)
