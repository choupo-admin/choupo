#!/usr/bin/env python3
"""The ChemSep UNIFAC subgroup id -> Choupo group NAME key, DERIVED.

    bin/curate/unifac_key.py            # print the key and its coverage

WHY THIS IS DERIVED AND NOT WRITTEN DOWN.  ChemSep states a compound's UNIFAC
decomposition as subgroup IDS; Choupo states it as subgroup NAMES.  Nothing in
the ChemSep distribution carries the key between them -- not chemsep1.xml, not
pcd/.  The obvious move is to write the classic Fredenslund/Gmehling subgroup
numbering from memory, and it is the wrong move: ChemSep numbers water 17 and
methanol 16 where the classic table has 16 and 15.  A remembered key would
have mapped ethanol's OH onto a neighbouring group and produced an activity
coefficient that looks entirely reasonable and is not.  There is no symptom.

SO THE KEY IS SOLVED FROM EVIDENCE THE REPOSITORY ALREADY HOLDS.  Forty
components are described BOTH by a curated `groups { unifac ( ... ) }` block
(names + counts) and by a ChemSep `<UnifacVLE>` block (ids + counts), matched
by CAS -- never by name, per the F2 contract.  Each such component is a
constraint.  Propagating to a fixed point:

  * a component whose ids are all explained but ONE, and whose names are all
    explained but ONE, pins that pairing -- provided the two COUNTS agree, so
    `CH3` appearing twice cannot be read onto a name appearing once;
  * every already-solved id is re-checked against every component that uses
    it, and a disagreement is a CONTRADICTION, reported and never averaged
    away.

THE KEY IS RECOMPUTED ON EVERY RUN, never stored.  A derived fact with a
second home is the arity sin, and this one would go stale the day a curated
component's groups were corrected -- silently, because a stale key still
produces a decomposition.

WHAT IT DOES NOT DO.  It determines only the ids the overlap actually
exercises.  Every other id stays UNDETERMINED, and the importer refuses to
write ANY groups for a component that uses one: a partial decomposition is
not partial information, it is a different molecule, and UNIFAC will answer
for that molecule without complaint.  The remedy is stated rather than
guessed -- curating one component that uses a blocking id determines it.

Nor does it check that the curated decompositions are THEMSELVES right; it
inherits whatever the catalogue says, which is exactly the intent (the
catalogue is the one home for what a group name means here).
"""

import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMP = ROOT / "data" / "standards" / "components"
XML = ROOT / "thirdParty" / "chemsep" / "chemsep1.xml"


#  A record this importer wrote is NOT evidence.  Once the groups are
#  emitted, those records carry `unifac ( ... )` blocks too, and a naive scan
#  counts them as curated -- so the key would be solved partly against its own
#  output.  The overlap silently grew from 40 components to 232 the first time
#  the emitter ran, which is the whole failure in one number: nothing broke,
#  the key came out identical, and a corrupted written block would from then
#  on have REINFORCED a corrupted key instead of contradicting it.  Evidence
#  must be independent of what it is used to produce.
IMPORT_MARK = 'importedBy    "chemsep_to_choupo"'


def curated():
    """CAS -> (stem, {groupName: count}) for every HAND-CURATED `unifac ( )`.

    Records carrying the importer's own marker are excluded: see IMPORT_MARK.
    """
    out = {}
    for p in sorted(COMP.glob("*.dat")):
        t = p.read_text(errors="ignore")
        if IMPORT_MARK in t:
            continue
        m = re.search(r"\bunifac\s*\((.*?)\)\s*;", t, re.S)
        if not m:
            continue
        g = {gm.group(1): int(gm.group(2)) for gm in re.finditer(
            r"\{\s*group\s+(\S+?)\s*;\s*count\s+(\d+)\s*;\s*\}", m.group(1))}
        cas = re.search(r"^\s*CAS\s+([0-9-]+)\s*;", t, re.M)
        if g and cas:
            out[cas.group(1)] = (p.stem, g)
    return out


def observations():
    """(stem, names, ids) for every component BOTH sources describe."""
    if not XML.is_file():
        return None
    cur = curated()
    obs = []
    for c in ET.parse(XML).getroot():
        ce, ue = c.find("CAS"), c.find("UnifacVLE")
        if ce is None or ue is None:
            continue
        cas = ce.get("value")
        if cas not in cur:
            continue
        try:
            ids = {int(g.get("id")): int(g.get("value")) for g in ue.findall("group")}
        except (TypeError, ValueError):
            continue
        obs.append((cur[cas][0], cur[cas][1], ids))
    return obs


def derive():
    """-> (key, contradictions, observation count).  Empty key if no archive."""
    obs = observations()
    if obs is None:
        #  A CHECK THAT CANNOT RUN MUST NOT PASS, and a KEY that cannot be
        #  derived must not be invented: with no archive there is no evidence,
        #  so the key is EMPTY and every component is blocked.  That is the
        #  correct behaviour on a clean checkout, where there is nothing to
        #  import either.
        return {}, [], 0

    solved, contra = {}, []
    changed = True
    while changed:
        changed = False
        for stem, names, ids in obs:
            explained = {i: solved[i] for i in ids if i in solved}
            for i, nm in explained.items():
                if names.get(nm) != ids[i]:
                    contra.append(
                        f"{stem}: id {i} is keyed to `{nm}`, which the ChemSep"
                        f" record uses {ids[i]} times and the curated record"
                        f" {names.get(nm)} times")
            un_ids = {i: c for i, c in ids.items() if i not in solved}
            un_names = {k: v for k, v in names.items()
                        if k not in set(explained.values())}
            if len(un_ids) == 1 and len(un_names) == 1:
                (i, ci), = un_ids.items()
                (k, ck), = un_names.items()
                if ci == ck:
                    solved[i] = k
                    changed = True
                else:
                    contra.append(
                        f"{stem}: the only unexplained id {i} occurs {ci} times"
                        f" and the only unexplained name `{k}` occurs {ck} --"
                        " they cannot be the same subgroup")
    return solved, sorted(set(contra)), len(obs)


def blocking():
    """-> {unknown id: [component stems it blocks]} across the ChemSep set."""
    key, _, _ = derive()
    out = {}
    if not XML.is_file():
        return out
    for c in ET.parse(XML).getroot():
        ue = c.find("UnifacVLE")
        nm = c.find("CompoundID")
        if ue is None or nm is None:
            continue
        try:
            ids = [int(g.get("id")) for g in ue.findall("group")]
        except (TypeError, ValueError):
            continue
        for i in ids:
            if i not in key:
                out.setdefault(i, []).append(nm.get("value"))
    return out


def main() -> int:
    key, contra, n = derive()
    if not n:
        print("unifac_key: no ChemSep archive at thirdParty/chemsep/chemsep1.xml"
              " -- the key is DERIVED from it and cannot be computed.  Nothing is"
              " assumed: with no evidence the key is empty and every component"
              " is blocked, which is also the state in which there is nothing"
              " to import.")
        return 0
    print(f"unifac_key: {len(key)} subgroup id(s) determined from {n} components"
          " described by both the curated catalogue and ChemSep, matched by CAS.")
    for i, nm in sorted(key.items()):
        print(f"    id {i:3d}  ->  {nm}")
    if contra:
        print("\n  CONTRADICTIONS (never averaged away):")
        for c in contra:
            print("   -", c)
    blk = blocking()
    if blk:
        print(f"\n  {len(blk)} id(s) UNDETERMINED; the 10 blocking the most"
              " ChemSep compounds:")
        for i, comps in sorted(blk.items(), key=lambda kv: -len(kv[1]))[:10]:
            print(f"    id {i:3d}  blocks {len(comps):3d}  e.g. {comps[0]}")
        print("  Curating one component that uses a blocking id determines it.")
    return 1 if contra else 0


if __name__ == "__main__":
    sys.exit(main())
