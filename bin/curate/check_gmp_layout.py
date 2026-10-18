#!/usr/bin/env python3
"""Gate: a GMP interior is DECLARED by the case and CHECKED by the engine.

    bin/curate/check_gmp_layout.py
    bin/curate/check_gmp_layout.py --keep DIR    run, keep the runs in DIR, check

WHY THIS EXISTS (2026-10-18, DEV.md 4c C97 phase B).  `system/layoutDict` may
declare a `building {}` -- floors, rooms of declared cleanliness grade and
pressure, airlocks (rooms with a role and a regime), doors, stairs and lifts,
and the personnel, material and waste flows -- and the engine
(`src/postProcessing/layout/BuildingLayout.cpp`) REFUSES what is not a
building and ANNOUNCES every rule a building breaks (the pressure cascade, the
airlock regimes, a change of grade with no airlock, containment, gowning, the
flows' continuity, direction and separation, ATEX against ignition, escape).
A rule finding is a verdict, and a verdict nobody recomputes is a verdict
nobody checks: this gate holds every one of them to an INDEPENDENT
recomputation from the published JSON alone.

The probe is a copy of `tutorials/steady/drying/sprayDryer07_design` (one
sized spray dryer) under a temp dir, given a layoutDict with three declared
non-process boxes (blender, tablet press, pan coater) and a 17-room,
two-floor oral-solid-dose block written in this file (CLEAN below).  Nothing
under tutorials/ is touched.

  (a) THE CLEAN PROBE runs, publishes the `building` block, and announces
      NOTHING: the engine's finding list is empty and the list recomputed
      here from the published rooms, connections and flows is empty too.
      Each room's area is recomputed from its box, each `pressureToOutside`
      from the declared `pressure` + `relativeTo` chain, each connection's
      `dP` from the two resolved pressures, the summary counts from the
      lists.
  (b) EVERY RULE FIRES on a probe built for it, and on EVERY probe the
      engine's finding ids are EQUAL to the ids recomputed here (no finding
      missing, none extra), each with the expected kind present, and the
      `value` / `limit` of every numeric finding equal to the recomputed one:
      cascade (across a cascade airlock) and a cascade airlock not between
      its neighbours; a sink not below its neighbours by the step; a
      containment room opened on the corridor (containmentAccess,
      containmentNotNegative) and a change of grade with no airlock; a
      personnel flow through the material airlock (wrongAirlock, a crossing,
      an ungowned entry); a material flow revisiting a room and a flow
      through a wall; a waste flow through the product train with one room
      declared `shared`; an ATEX room nearer an ignition room than the
      declared separation, and the separation left undeclared; a room whose
      only way out is a lift; the plot margin removed (rooms beyond the
      plot); a containment room behind a cascade airlock.
  (c) THE ANNOUNCEMENT REACHES ALL THREE SURFACES: stderr (`[building]`),
      the end-of-run caveat block under PLANT LAYOUT, and the result JSON
      (`advisories` and `building.findings`).
  (d) REFUSALS, each fired through the real reader, each required to exit
      non-zero and NAME its defect: overlapping rooms, two rooms sharing a
      volume across floors, two floors sharing a height, an item that does
      not fit its room, a placed item inside a room that does not list it,
      an item that is not placed, a door with no shared wall, a door
      outside from a room with no exterior wall, a stair on one floor, a
      `relativeTo` cycle, an unknown grade, a regime on a plain room, a
      flow through an unknown room, no `cascade` block, a `shared` entry
      with one kind.
  (e) ABSENCE IS SILENCE: the clean probe with its `building` block removed
      publishes no `building` key, prints no `[building]` line, and its
      `layout` block is byte-identical to the clean probe's.
  (f) PUBLISHED => PINNED: `bin/runTests --record` on the clean probe writes
      `layout` rows for the building block (summary, rooms, connections,
      flows), `bin/runTests` passes on them, and the same check FAILS once a
      room's declared pressure moves -- the rows are read, not merely written.

SABOTAGES, by hand (2026-10-18), each run against this gate and each caught:
  S1  `cascadeCheck` returns early for every pair (the cascade never
      raised): arm (b) "cascade" probe -- engine ids lack `cascade:coating:
      packaging` that the recomputation finds.  CAUGHT.
  S2  the sink test reads `pmax - p` instead of `pmin - p`: arm (b) sink
      probe -- the finding vanishes (p 10 is below pmax 25 by 15).  CAUGHT.
  S3  the containment rule skips every airlock neighbour (not only a sink):
      arm (b) "containment behind a cascade airlock" -- containmentAccess:
      sprayDrying:sdIn missing.  CAUGHT.
  S4  the personnel walk forgets to reset at CNC rooms: arm (b) "re-entry
      from CNC" -- a person leaves through the waste airlock into the CNC
      waste room and comes back into the D corridor without gowning; with
      S4 the engine misses both ungownedEntry findings.  CAUGHT.
  S5  `announce()` stops writing the AdvisoryLog: arm (c) -- the message is
      on stderr and in building.findings but not in `advisories`.  CAUGHT --
      and its FIRST run showed the caveat-block half of arm (c) SURVIVING:
      it searched stdout from the PLANT LAYOUT heading to the END, and the
      result JSON (which carries the sentence in `building.findings`) sits
      after the block and answered for it.  The arm now stops at
      `<<<Choupo:result-begin>>>`; re-run, both halves catch S5.
  S6  the overlap refusal compares only plan (ignoring z): arm (d) "volume
      across floors" still refuses (plan overlap), but arm (a) refuses too
      -- the clean electrical room above the lobby overlaps it in plan.
      CAUGHT (the clean probe exits 2).
  S7  the runTests building awk pass pins no NUMBER (its numeric key list
      emptied): arm (f) -- the recorded golden has no `buildingSummary`
      row (the room / door / flow WORD rows survive, which is why the arm
      requires all four families).  CAUGHT.
  (Each run on a build of the sabotaged source, restored and rebuilt after;
  the first S7 run landed on S6's binary and is discarded.)
"""

import json
import re
import shutil
import subprocess
import sys
import tempfile
from math import sqrt
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BIN = ROOT / "choupoSolve"
SRC = ROOT / "tutorials/steady/drying/sprayDryer07_design"
ENV = {"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"}
TOL = 1e-6

fails = []
claims = []


def fail(msg):
    fails.append(msg)


CLEAN = r'''/*--- Probe: a small oral-solid-dose block round one spray dryer (C97 B). ---*/
items
(
    { item "dryer"; x 28 m; y 15 m; z 0 m; orientation vertical; }
    { nonProcess "blender"; kind blender; x 41 m; y 15 m; z 0 m; orientation alongX;
      footprint { length 2 m; width 2 m; height 2.5 m; }
      source "probe"; reason "a bin blender, a probe's box"; }
    { nonProcess "press"; kind tabletPress; x 49 m; y 15 m; z 0 m; orientation alongX;
      footprint { length 2 m; width 1.5 m; height 2 m; }
      source "probe"; reason "a rotary press, a probe's box"; }
    { nonProcess "coater"; kind panCoater; x 57 m; y 15 m; z 0 m; orientation alongX;
      footprint { length 3 m; width 2 m; height 2.5 m; }
      source "probe"; reason "a pan coater, a probe's box"; }
);
plot { margin 30 m; reason "the probe's building lies beyond its items"; }

building
{
    name   "probe OSD block";
    source "gate probe (check_gmp_layout)";
    reason "every rule's clean case at once";

    cascade
    {
        minimumStep 10 Pa;
        source "EU GMP Annex 1 (2022) para 4.14: a minimum of 10 Pa between adjacent rooms of different grades (guidance value)";
        reason "the guidance value, taken as the design step";
    }
    atexSeparation { distance 6 m; source "probe"; reason "a probe distance"; }

    floors
    (
        { floor ground; elevation 0 m; height 6 m; }
        { floor upper;  elevation 7 m; height 4 m; }
    );

    rooms
    (
        { room warehouse;   floor ground; xMin 0 m;  xMax 8 m;  yMin 10 m; yMax 20 m; grade CNC; pressure 5 Pa;  relativeTo outside; }
        { room MAL;         floor ground; xMin 8 m;  xMax 11 m; yMin 10 m; yMax 20 m; grade D;   role materialAirlock; regime cascade; pressure 15 Pa; relativeTo outside; }
        { room dispensing;  floor ground; xMin 11 m; xMax 19 m; yMin 10 m; yMax 20 m; grade D;   pressure 25 Pa; relativeTo outside; occupancy 2; }
        { room sdIn;        floor ground; xMin 19 m; xMax 22 m; yMin 10 m; yMax 20 m; grade D;   role materialAirlock; regime sink; pressure -20 Pa; relativeTo dispensing; }
        { room sprayDrying; floor ground; xMin 22 m; xMax 34 m; yMin 10 m; yMax 20 m; grade D;   pressure 15 Pa; relativeTo outside;
          containment yes; equipment ( dryer ); occupancy 1;
          atex { zone 1; source "probe"; reason "an organic solvent is evaporated here"; } }
        { room sdOut;       floor ground; xMin 34 m; xMax 37 m; yMin 10 m; yMax 20 m; grade D;   role materialAirlock; regime sink; pressure 5 Pa; relativeTo outside; }
        { room blending;    floor ground; xMin 37 m; xMax 45 m; yMin 10 m; yMax 20 m; grade D;   pressure 25 Pa; relativeTo outside; equipment ( blender ); }
        { room compression; floor ground; xMin 45 m; xMax 53 m; yMin 10 m; yMax 20 m; grade D;   pressure 25 Pa; relativeTo outside; equipment ( press ); occupancy 2; }
        { room coating;     floor ground; xMin 53 m; xMax 61 m; yMin 10 m; yMax 20 m; grade D;   pressure 25 Pa; relativeTo outside; equipment ( coater ); }
        { room exitMAL;     floor ground; xMin 61 m; xMax 64 m; yMin 10 m; yMax 20 m; grade D;   role materialAirlock; regime cascade; pressure 15 Pa; relativeTo outside; }
        { room packaging;   floor ground; xMin 64 m; xMax 72 m; yMin 10 m; yMax 20 m; grade CNC; pressure 5 Pa;  relativeTo outside; occupancy 3; }
        { room corridor;    floor ground; xMin 8 m;  xMax 64 m; yMin 6 m;  yMax 10 m; grade D;   pressure 25 Pa; relativeTo outside; }
        { room lobby;       floor ground; xMin 10 m; xMax 16 m; yMin 0 m;  yMax 6 m;  grade CNC; pressure 5 Pa;  relativeTo outside; }
        { room gowning;     floor ground; xMin 16 m; xMax 20 m; yMin 0 m;  yMax 6 m;  grade D;   role gowning; regime cascade; pressure 10 Pa; relativeTo lobby; }
        { room wasteAL;     floor ground; xMin 40 m; xMax 44 m; yMin 0 m;  yMax 6 m;  grade D;   role materialAirlock; regime cascade; pressure 15 Pa; relativeTo outside; }
        { room wasteRoom;   floor ground; xMin 44 m; xMax 50 m; yMin 0 m;  yMax 6 m;  grade CNC; pressure 5 Pa;  relativeTo outside; }
        { room electrical;  floor upper;  xMin 10 m; xMax 16 m; yMin 0 m;  yMax 6 m;  grade CNC; pressure 0 Pa;  relativeTo outside;
          ignition "switchgear and motor control centres"; }
    );

    connections
    (
        { between ( warehouse outside );     type door; }
        { between ( warehouse MAL );         type door; }
        { between ( MAL dispensing );        type door; }
        { between ( dispensing sdIn );       type door; }
        { between ( sdIn sprayDrying );      type door; }
        { between ( sprayDrying sdOut );     type door; }
        { between ( sdOut blending );        type door; }
        { between ( blending compression );  type door; }
        { between ( compression coating );   type door; }
        { between ( coating exitMAL );       type door; }
        { between ( exitMAL packaging );     type door; }
        { between ( packaging outside );     type door; }
        { between ( dispensing corridor );   type door; }
        { between ( blending corridor );     type door; }
        { between ( compression corridor );  type door; }
        { between ( coating corridor );      type door; }
        { between ( lobby outside );         type door; }
        { between ( lobby gowning );         type door; }
        { between ( gowning corridor );      type door; }
        { between ( corridor wasteAL );      type door; }
        { between ( wasteAL wasteRoom );     type door; }
        { between ( wasteRoom outside );     type door; }
        { between ( lobby electrical );      type stair; }
    );

    flows
    (
        { flow "product"; kind material; reason "raw API and excipients to packed tablets";
          path ( outside warehouse MAL dispensing sdIn sprayDrying sdOut blending compression coating exitMAL packaging outside ); }
        { flow "operators"; kind personnel; reason "the press operators' way in";
          path ( outside lobby gowning corridor compression ); }
        { flow "rejects"; kind waste; reason "rejected tablets out";
          path ( compression corridor wasteAL wasteRoom outside ); }
    );
}
'''


def sub(text, old, new, count=1):
    if text.count(old) < 1:
        raise RuntimeError(f"probe edit anchor not found: {old!r}")
    return text.replace(old, new, count)


def insert_before(text, anchor, add):
    return sub(text, anchor, add + anchor)


def prepare(work, name, layout):
    d = work / name
    if d.exists():
        shutil.rmtree(d)
    shutil.copytree(SRC, d, ignore=shutil.ignore_patterns(
        "reports", "converged", "design", "iterations", "expected"))
    (d / "system" / "layoutDict").write_text(layout)
    return d


def run(cmd, cwd=ROOT, timeout=900):
    p = subprocess.run(cmd, capture_output=True, text=True, cwd=str(cwd),
                       timeout=timeout, env=ENV)
    return p.stdout, p.stderr, p.returncode


def result_json(out):
    m = re.search(r"<<<Choupo:result-begin>>>\s*\n(.*?)\n<<<Choupo:result-end>>>",
                  out, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return None


def solve(d):
    out, err, rc = run([str(BIN), str(d)])
    return out, err, rc, result_json(out)


# ------------------------------------------------- the independent verdicts --
RANK = {"A": 4, "B": 3, "C": 2, "D": 1, "CNC": 0}
AIRLOCKS = {"personnelAirlock", "materialAirlock", "gowning"}


def recompute(b, plot):
    """Every finding the published building block implies, recomputed here
    from rooms, connections, flows, shared and the summary -- never read from
    `findings`.  Returns {id: (value, limit)}."""
    rooms = {r["name"]: r for r in b["rooms"]}
    step = b["summary"]["minimumStep"]
    out = {}

    def add(kind, a, bb, value=0.0, limit=0.0):
        out.setdefault(f"{kind}:{a}:{bb}", (value, limit))

    def p(s):
        return 0.0 if s == "outside" else rooms[s]["pressureToOutside"]

    def rank(s):
        return -1 if s == "outside" else RANK[rooms[s]["grade"]]

    def airlock(s):
        return s != "outside" and rooms[s]["role"] in AIRLOCKS

    def cont(s):
        return s != "outside" and rooms[s]["containment"]

    adj = {n: [] for n in list(rooms) + ["outside"]}
    pairs = set()
    for c in b["connections"]:
        adj[c["a"]].append((c["b"], c["type"]))
        adj[c["b"]].append((c["a"], c["type"]))
        pairs.add(frozenset((c["a"], c["b"])))

    def cascade(u, v):
        if cont(u) != cont(v) or rank(u) == rank(v):
            return
        clean, dirty = (u, v) if rank(u) > rank(v) else (v, u)
        if rank(clean) < 1:
            return
        dp = p(clean) - p(dirty)
        if dp < step - 1e-9:
            add("cascade", clean, dirty, dp, step)

    for c in b["connections"]:
        if not (airlock(c["a"]) or airlock(c["b"])):
            cascade(c["a"], c["b"])
    for name, r in rooms.items():
        if r["role"] not in AIRLOCKS:
            continue
        nb = []
        for n, _ in adj[name]:
            if n not in nb:
                nb.append(n)
        if len(nb) < 2:
            add("airlockRegime", name, "", len(nb), 2)
            continue
        pmin, pmax = min(p(n) for n in nb), max(p(n) for n in nb)
        pr = r["pressureToOutside"]
        if r["regime"] == "bubble" and pr - pmax < step - 1e-9:
            add("airlockRegime", name, "bubble", pr - pmax, step)
        elif r["regime"] == "sink" and pmin - pr < step - 1e-9:
            add("airlockRegime", name, "sink", pmin - pr, step)
        elif r["regime"] == "cascade":
            margin = min(pr - pmin, pmax - pr)
            if margin <= 1e-9:
                add("airlockRegime", name, "cascade", margin, 0)
            for i in range(len(nb)):
                for j in range(i + 1, len(nb)):
                    if not airlock(nb[i]) and not airlock(nb[j]):
                        cascade(nb[i], nb[j])
    for c in b["connections"]:
        a, bb = c["a"], c["b"]
        if airlock(a) or airlock(bb) or rank(a) == rank(bb) or max(rank(a), rank(bb)) < 1:
            continue
        add("gradeChangeWithoutAirlock", a, bb)
    for name, r in rooms.items():
        if not r["containment"]:
            continue
        for n, _ in adj[name]:
            if cont(n):
                continue
            if not airlock(n):
                add("containmentAccess", name, n)
            elif rooms[n]["regime"] == "cascade":
                add("containmentAccess", name, n)
            if airlock(n) and rooms[n]["regime"] == "sink":
                continue
            dn = p(n) - r["pressureToOutside"]
            if dn < step - 1e-9:
                add("containmentNotNegative", name, n, dn, step)

    shared = {}
    for s in b["shared"]:
        shared.setdefault(s["room"], set()).update(s["flows"])

    def is_shared(room, k1, k2):
        return k1 in shared.get(room, set()) and k2 in shared.get(room, set())

    for f in b["flows"]:
        path = f["path"]
        for k in range(len(path) - 1):
            if frozenset((path[k], path[k + 1])) not in pairs:
                add("flowBreak", f["name"], f"{path[k]}->{path[k + 1]}")
        for n in path:
            if not airlock(n):
                continue
            pers = f["kind"] == "personnel"
            role = rooms[n]["role"]
            wrong = role == "materialAirlock" if pers else role != "materialAirlock"
            other = "material" if pers else "personnel"
            if wrong and not is_shared(n, f["kind"], other):
                add("wrongAirlock", f["name"], n)
        if f["kind"] == "material":
            seen = set()
            for n in path:
                if n != "outside" and n in seen:
                    add("materialRevisit", f["name"], n)
                seen.add(n)
        if f["kind"] == "personnel":
            gowned = -1
            for n in path:
                if n == "outside":
                    gowned = -1
                    continue
                r = rooms[n]
                if r["role"] == "gowning":
                    gowned = RANK[r["grade"]]
                    continue
                if r["role"] in AIRLOCKS:
                    continue
                rk = RANK[r["grade"]]
                if rk < 1:
                    gowned = -1
                    continue
                if rk > gowned:
                    add("ungownedEntry", f["name"], n, rk, gowned)

    def interior(f):
        return {n for n in f["path"][1:-1] if n != "outside"}

    for m in b["flows"]:
        if m["kind"] != "material":
            continue
        mi = interior(m)
        for o in b["flows"]:
            if o["kind"] == "material":
                continue
            for room in sorted(interior(o) & mi):
                if is_shared(room, o["kind"], "material"):
                    continue
                kind = "flowCrossing" if o["kind"] == "personnel" else "wasteMeetsMaterial"
                add(kind, room, f"{o['name']}|{m['name']}")

    ax = [n for n, r in rooms.items() if "atexZone" in r]
    ig = [n for n, r in rooms.items() if "ignition" in r]
    dist = b["summary"].get("atexDistance")
    if ax and ig and dist is None:
        add("atexSeparationUndeclared", b["summary"]["name"], "")
    elif ax and ig:
        for a in ax:
            for g in ig:
                if a == g or frozenset((a, g)) in pairs:
                    add("atexIgnition", a, g, 0, dist)
                    continue
                A, G = rooms[a], rooms[g]
                gx = max(0, max(A["xMin"], G["xMin"]) - min(A["xMax"], G["xMax"]))
                gy = max(0, max(A["yMin"], G["yMin"]) - min(A["yMax"], G["yMax"]))
                gz = max(0, max(A["z"], G["z"]) - min(A["z"] + A["height"], G["z"] + G["height"]))
                gap = sqrt(gx * gx + gy * gy + gz * gz)
                if gap < dist - 1e-6:
                    add("atexIgnition", a, g, gap, dist)

    reach = {"outside"}
    todo = ["outside"]
    while todo:
        s = todo.pop()
        for n, t in adj[s]:
            if t != "lift" and n not in reach:
                reach.add(n)
                todo.append(n)
    for n in rooms:
        if n not in reach:
            add("noEscape", n, "")

    if plot:
        for n, r in rooms.items():
            ix = max(0.0, min(r["xMax"], plot["xMax"]) - max(r["xMin"], plot["xMin"]))
            iy = max(0.0, min(r["yMax"], plot["yMax"]) - max(r["yMin"], plot["yMin"]))
            outside = r["area"] - ix * iy
            if outside > 1e-6:
                add("roomBeyondPlot", n, "", outside, 0)
    return out


def published_ok(b, tag):
    """The block's own arithmetic, recomputed: areas, pressures, dP, counts."""
    rooms = {r["name"]: r for r in b["rooms"]}
    ok = True
    for r in b["rooms"]:
        area = (r["xMax"] - r["xMin"]) * (r["yMax"] - r["yMin"])
        if abs(area - r["area"]) > 1e-6:
            fail(f"{tag}: room {r['name']} area {r['area']} != box {area}")
            ok = False
        p, cur, seen = 0.0, r, set()
        while True:
            p += cur["pressure"]
            if cur["relativeTo"] == "outside":
                break
            if cur["name"] in seen:
                p = float("nan")
                break
            seen.add(cur["name"])
            cur = rooms[cur["relativeTo"]]
        if not abs(p - r["pressureToOutside"]) < 1e-9:
            fail(f"{tag}: room {r['name']} pressureToOutside {r['pressureToOutside']}"
                 f" != chain {p}")
            ok = False
    for c in b["connections"]:
        pa = rooms[c["a"]]["pressureToOutside"]
        pb = 0.0 if c["b"] == "outside" else rooms[c["b"]]["pressureToOutside"]
        if abs((pa - pb) - c["dP"]) > 1e-9:
            fail(f"{tag}: connection {c['id']} dP {c['dP']} != {pa - pb}")
            ok = False
    s = b["summary"]
    for k in ("rooms", "connections", "flows", "findings", "floors"):
        if s[k] != len(b[k]):
            fail(f"{tag}: summary {k} {s[k]} != {len(b[k])} published")
            ok = False
    if abs(s["floorArea"] - sum(r["area"] for r in b["rooms"])) > 1e-6:
        fail(f"{tag}: summary floorArea {s['floorArea']} != the rooms' sum")
        ok = False
    return ok


def compare(tag, j, want_kinds):
    """Engine findings == recomputed findings (ids, values, limits)."""
    b = j.get("building")
    if not b:
        fail(f"{tag}: no `building` block published")
        return None
    published_ok(b, tag)
    plot = (j.get("layout") or {}).get("plot")
    rec = recompute(b, plot)
    eng = {f["id"]: f for f in b["findings"]}
    if set(eng) != set(rec):
        fail(f"{tag}: engine findings {sorted(eng)} != recomputed {sorted(rec)}")
        return b
    for fid, (v, lim) in rec.items():
        f = eng[fid]
        if abs(f["value"] - v) > 1e-6 or abs(f["limit"] - lim) > 1e-6:
            fail(f"{tag}: {fid} value/limit {f['value']}/{f['limit']} != recomputed {v}/{lim}")
    kinds = {f["kind"] for f in b["findings"]}
    missing = set(want_kinds) - kinds
    if missing:
        fail(f"{tag}: expected the probe to raise {sorted(missing)}; it raised {sorted(kinds)}")
    return b


# --------------------------------------------------------------------- arms --
def arm_clean(work):
    d = prepare(work, "clean", CLEAN)
    out, err, rc, j = solve(d)
    if rc != 0 or not j:
        fail(f"(a) the clean probe exited {rc}: {err.strip()[-400:]}")
        return None
    b = compare("(a) clean", j, [])
    if b is not None and b["findings"]:
        fail(f"(a) the clean probe raised {[f['id'] for f in b['findings']]}")
    if "[building]" in err:
        fail("(a) the clean probe printed a [building] announcement")
    if b is not None and not fails:
        claims.append(f"(a) clean probe: {b['summary']['rooms']} rooms on"
                      f" {b['summary']['floors']} floors, {b['summary']['connections']}"
                      " connections, 3 flows; areas, chained pressures, dP and counts"
                      " recomputed; zero findings published and zero recomputed")
    return j


PROBES = [
    ("cascade across an airlock", ["cascade", "airlockRegime"],
     lambda t: sub(t, "{ room packaging;   floor ground; xMin 64 m; xMax 72 m; yMin 10 m; yMax 20 m; grade CNC; pressure 5 Pa;",
                   "{ room packaging;   floor ground; xMin 64 m; xMax 72 m; yMin 10 m; yMax 20 m; grade CNC; pressure 20 Pa;")),
    ("sink not below", ["airlockRegime"],
     lambda t: sub(t, "pressure -20 Pa; relativeTo dispensing;", "pressure -15 Pa; relativeTo dispensing;")),
    ("containment opened on the corridor; a grade change with no airlock",
     ["containmentAccess", "containmentNotNegative", "gradeChangeWithoutAirlock"],
     lambda t: insert_before(sub(t, "pressure 15 Pa; relativeTo outside;\n          containment yes;",
                                 "pressure 20 Pa; relativeTo outside;\n          containment yes;"),
                             "        { between ( lobby electrical );",
                             "        { between ( sprayDrying corridor ); type door; }\n"
                             "        { between ( lobby corridor );       type door; }\n")),
    ("personnel through the material airlock",
     ["wrongAirlock", "flowCrossing", "ungownedEntry"],
     lambda t: sub(t, "path ( outside lobby gowning corridor compression ); }",
                   "path ( outside warehouse MAL dispensing ); }")),
    ("re-entry from CNC without re-gowning", ["ungownedEntry", "wrongAirlock"],
     lambda t: sub(t, "path ( outside lobby gowning corridor compression ); }",
                   "path ( outside lobby gowning corridor compression ); }\n"
                   "        { flow \"detour\"; kind personnel;\n"
                   "          path ( outside lobby gowning corridor wasteAL wasteRoom wasteAL corridor compression ); }")),
    ("a revisit and a flow through a wall", ["materialRevisit", "flowBreak"],
     lambda t: insert_before(t, "        { flow \"operators\";",
                             "        { flow \"rework\"; kind material; path ( compression blending compression ); }\n"
                             "        { flow \"jump\"; kind material; path ( warehouse dispensing ); }\n")),
    ("waste through the product train, one room shared", ["wasteMeetsMaterial"],
     lambda t: insert_before(
         sub(t, "path ( compression corridor wasteAL wasteRoom outside ); }",
             "path ( compression coating exitMAL packaging outside ); }"),
         "    connections\n",
         "    shared ( { room packaging; flows ( waste material ); reason \"probe: sealed bins\"; } );\n\n")),
    ("ATEX nearer an ignition room than declared", ["atexIgnition"],
     lambda t: sub(t, "atexSeparation { distance 6 m;", "atexSeparation { distance 8 m;")),
    ("ATEX separation undeclared", ["atexSeparationUndeclared"],
     lambda t: sub(t, '    atexSeparation { distance 6 m; source "probe"; reason "a probe distance"; }\n', "")),
    ("a lift is not an exit", ["noEscape"],
     lambda t: sub(t, "{ between ( lobby electrical );      type stair; }",
                   "{ between ( lobby electrical );      type lift; }")),
    ("no plot margin", ["roomBeyondPlot"],
     lambda t: sub(t, 'plot { margin 30 m; reason "the probe\'s building lies beyond its items"; }\n', "")),
    ("containment behind a cascade airlock", ["containmentAccess", "airlockRegime"],
     lambda t: sub(t, "role materialAirlock; regime sink; pressure -20 Pa;",
                   "role materialAirlock; regime cascade; pressure -20 Pa;")),
]


def arm_rules(work):
    n, kinds, total = 0, set(), 0
    for i, (label, want, edit) in enumerate(PROBES):
        d = prepare(work, f"rule{i:02d}", edit(CLEAN))
        out, err, rc, j = solve(d)
        if rc != 0 or not j:
            fail(f"(b) {label}: exit {rc}: {err.strip()[-300:]}")
            continue
        before = len(fails)
        b = compare(f"(b) {label}", j, want)
        if b is not None and len(fails) == before:
            n += 1
            total += len(b["findings"])
            kinds |= {f["kind"] for f in b["findings"]}
    claims.append(f"(b) {n}/{len(PROBES)} rule probes, {total} findings in all of"
                  f" {len(kinds)} kinds ({', '.join(sorted(kinds))}), each probe's"
                  " engine list EQUAL to the list recomputed here, value and limit"
                  " included")


def arm_surfaces(work):
    d = prepare(work, "surfaces", PROBES[1][2](CLEAN))
    out, err, rc, j = solve(d)
    if rc != 0 or not j or not j.get("building"):
        fail(f"(c) the sink probe exited {rc}")
        return
    f = [x for x in j["building"]["findings"] if x["kind"] == "airlockRegime"]
    if not f:
        fail("(c) the sink probe raised no airlockRegime")
        return
    msg = f[0]["message"]
    ok = True
    if "[building] " + msg not in err:
        fail("(c) the finding's sentence is not on stderr after [building]")
        ok = False
    #  The caveat block only: from its PLANT LAYOUT heading to the result
    #  JSON, which itself carries the sentence and must not answer for it.
    head = out.rfind("PLANT LAYOUT")
    stop = out.find("<<<Choupo:result-begin>>>", max(head, 0))
    tail = out[head:stop if stop > head else len(out)] if head >= 0 else ""
    if not tail or msg[:60] not in tail:
        fail("(c) the finding is not in the end-of-run caveat block under PLANT LAYOUT")
        ok = False
    if not any(msg == a.get("message") for a in j.get("advisories", [])):
        fail("(c) the finding is not in the result JSON's advisories")
        ok = False
    if ok:
        claims.append("(c) a finding reaches stderr, the caveat block (PLANT LAYOUT)"
                      " and the JSON advisories, word for word")


REFUSALS = [
    ("overlapping rooms", "share a volume",
     lambda t: sub(t, "{ room lobby;       floor ground; xMin 10 m; xMax 16 m;",
                   "{ room lobby;       floor ground; xMin 10 m; xMax 17 m;")),
    ("a volume shared across floors", "share a volume",
     lambda t: sub(sub(t, "{ room electrical;  floor upper;  xMin 10 m; xMax 16 m; yMin 0 m;  yMax 6 m;",
                       "{ room electrical;  floor upper;  xMin 24 m; xMax 30 m; yMin 12 m; yMax 18 m;"),
                   "pressure 15 Pa; relativeTo outside;\n          containment yes;",
                   "pressure 15 Pa; relativeTo outside; height 9 m;\n          containment yes;")),
    ("floors sharing a height", "share a height",
     lambda t: sub(t, "{ floor upper;  elevation 7 m;", "{ floor upper;  elevation 5 m;")),
    ("an item that does not fit its room", "does not fit its room",
     lambda t: sub(t, '{ item "dryer"; x 28 m;', '{ item "dryer"; x 33.8 m;')),
    ("an unlisted item inside a room", "does not list it",
     lambda t: sub(t, " equipment ( blender );", "")),
    ("an item not placed", "is not placed on the plot plan",
     lambda t: sub(t, " equipment ( blender );", " equipment ( blender ghost );")),
    ("a door with no shared wall", "share no wall",
     lambda t: insert_before(t, "        { between ( lobby electrical );",
                             "        { between ( warehouse dispensing ); type door; }\n")),
    ("a door outside with no exterior wall", "no exterior wall",
     lambda t: insert_before(
         insert_before(t, "    );\n\n    connections",
                       "        { room northStore; floor ground; xMin 8 m; xMax 11 m; yMin 20 m; yMax 24 m; grade CNC; pressure 5 Pa; relativeTo outside; }\n"),
         "        { between ( lobby electrical );",
         "        { between ( MAL outside ); type door; }\n")),
    ("a stair on one floor", "joins two floors",
     lambda t: sub(t, "{ between ( lobby gowning );         type door; }",
                   "{ between ( lobby gowning );         type stair; }")),
    ("a relativeTo cycle", "closes on itself",
     lambda t: sub(t, "grade CNC; pressure 5 Pa;  relativeTo outside; }\n        { room gowning;",
                   "grade CNC; pressure 5 Pa;  relativeTo gowning; }\n        { room gowning;")),
    ("an unknown grade", "Accepted",
     lambda t: sub(t, "yMax 20 m; grade CNC; pressure 5 Pa;  relativeTo outside; }\n        { room MAL;",
                   "yMax 20 m; grade E; pressure 5 Pa;  relativeTo outside; }\n        { room MAL;")),
    ("a regime on a plain room", "belongs to an airlock",
     lambda t: sub(t, "pressure 25 Pa; relativeTo outside; equipment ( blender );",
                   "pressure 25 Pa; relativeTo outside; regime bubble; equipment ( blender );")),
    ("a flow through an unknown room", "names no room",
     lambda t: sub(t, "path ( compression corridor wasteAL wasteRoom outside ); }",
                   "path ( compression corridor nowhere outside ); }")),
    ("no cascade block", "cascade { minimumStep",
     lambda t: re.sub(r"    cascade\n    \{.*?\n    \}\n", "", t, count=1, flags=re.S)),
    ("a road through a ground-floor room", "runs through room `corridor`",
     lambda t: insert_before(t, "\nbuilding\n",
                             '\nroads { source "probe"; reason "probe"; headroom 5 m;\n'
                             '        access { distance 80 m; source "probe"; reason "probe"; }\n'
                             '        network ( { road "spine"; width 4 m; reason "probe";\n'
                             '                    waypoints ( { x -5 m; y 8 m; } { x 80 m; y 8 m; } ); } ); }\n')),
    ("a room across the fence", "across or outside the fence",
     lambda t: insert_before(t, "\nbuilding\n",
                             '\nfence { source "probe"; reason "probe"; inset 8 m; }\n')),
    ("a shared room with one kind", "DIFFERENT kinds",
     lambda t: insert_before(t, "    connections\n",
                             "    shared ( { room corridor; flows ( waste ); reason \"probe\"; } );\n\n")),
]


def arm_refusals(work):
    n = 0
    for i, (label, needle, edit) in enumerate(REFUSALS):
        d = prepare(work, f"refuse{i:02d}", edit(CLEAN))
        out, err, rc, j = solve(d)
        if rc == 0:
            fail(f"(d) {label}: the run was NOT refused (exit 0)")
        elif needle not in err + out:
            fail(f"(d) {label}: refused (exit {rc}) without naming it ('{needle}'):"
                 f" {err.strip()[-300:]}")
        else:
            n += 1
    claims.append(f"(d) {n}/{len(REFUSALS)} refusals fired through the real reader,"
                  " each non-zero and naming its defect")


def arm_absent(work, clean_json):
    t = re.sub(r"\nbuilding\n\{.*\n\}\n", "\n", CLEAN, count=1, flags=re.S)
    d = prepare(work, "absent", t)
    out, err, rc, j = solve(d)
    if rc != 0 or not j:
        fail(f"(e) the probe without a building exited {rc}")
        return
    bad = []
    if "building" in j:
        bad.append("a `building` key")
    if "[building]" in out + err:
        bad.append("a [building] line")
    if clean_json and j.get("layout") != clean_json.get("layout"):
        bad.append("a `layout` block different from the clean probe's")
    if bad:
        fail("(e) with no building block the run still printed " + ", ".join(bad))
    else:
        claims.append("(e) with no `building` block: no key, no line, and the `layout`"
                      " block identical to the clean probe's")


def arm_golden(work):
    d = prepare(work, "golden", CLEAN)
    out, err, rc = run([str(ROOT / "bin/runTests"), "--record", str(d)], timeout=1200)
    exp = d / "expected"
    if rc != 0 or not exp.exists():
        fail(f"(f) runTests --record on the clean probe exited {rc}")
        return
    rows = [l for l in exp.read_text().splitlines() if l.startswith("layout ")]
    want = {"buildingSummary": False, "room:": False, "door:": False, "flow:": False}
    for l in rows:
        ident = l.split()[1]
        for k in want:
            if ident.startswith(k):
                want[k] = True
    missing = [k for k, v in want.items() if not v]
    if missing:
        fail(f"(f) the recorded golden pins no building row for {missing}")
        return
    out, err, rc = run([str(ROOT / "bin/runTests"), str(d)], timeout=1200)
    if rc != 0 or "FAIL 0" not in out:
        fail(f"(f) runTests on the freshly recorded probe did not pass (exit {rc})")
        return
    lay = d / "system" / "layoutDict"
    lay.write_text(sub(lay.read_text(), "{ room dispensing;  floor ground; xMin 11 m; xMax 19 m; yMin 10 m; yMax 20 m; grade D;   pressure 25 Pa;",
                       "{ room dispensing;  floor ground; xMin 11 m; xMax 19 m; yMin 10 m; yMax 20 m; grade D;   pressure 26 Pa;"))
    out, err, rc = run([str(ROOT / "bin/runTests"), str(d)], timeout=1200)
    if rc == 0 or "room:dispensing" not in out:
        fail("(f) a moved room pressure did not fail the golden on its"
             " room:dispensing row")
        return
    nb = sum(1 for l in rows if l.split()[1].split(":")[0] in
             ("buildingSummary", "room", "floor", "door", "stair", "lift", "flow"))
    claims.append(f"(f) --record pins {nb} building rows on the clean probe, the check"
                  " passes on them, and a room pressure moved by 1 Pa fails it on that"
                  " room's row")


def main():
    argv = sys.argv[1:]
    keep = Path(argv[argv.index("--keep") + 1]).resolve() if "--keep" in argv else None
    if not BIN.exists():
        print("check_gmp_layout: FAIL -- no choupoSolve build; run `make all`")
        return 1
    work = keep or Path(tempfile.mkdtemp(prefix="gmplayout."))
    work.mkdir(parents=True, exist_ok=True)
    try:
        clean = arm_clean(work)
        arm_rules(work)
        arm_surfaces(work)
        arm_refusals(work)
        arm_absent(work, clean)
        arm_golden(work)
    finally:
        if not keep:
            shutil.rmtree(work, ignore_errors=True)
    if fails:
        print("check_gmp_layout: FAIL")
        for f in fails:
            print("  - " + f)
        return 1
    print("check_gmp_layout: OK -- " + "; ".join(claims)
          + ".  NOT COVERED: whether a declared grade, pressure, step or separation"
          " is sensible for the product (the case's assumption -- no table is"
          " shipped), air change rates and HVAC, door widths and travel distances,"
          " a pipe or a road against a room's walls beyond a road through a room,"
          " the GUI drawing (a vitest), and the corpus witness (wired after C97"
          " phase A lands).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
