#!/usr/bin/env python3
"""Gate: a plant layout is DECLARED by the case, CHECKED by the engine, DRAFTED by a tool.

    bin/curate/check_plant_layout.py
    bin/curate/check_plant_layout.py --keep DIR    run, keep the runs in DIR, check

WHY THIS EXISTS (2026-10-17, DEV.md 4c C75).  `system/layoutDict` places the
sized items of a run on a plot plan; the engine reads each item's FOOTPRINT
from its own sizer (a diameter and a length) or from a box the case declares,
REFUSES what is not a layout (an unknown or internal item, an item placed
twice, two footprints that overlap, a malformed declaration), and ANNOUNCES
what is a layout the student must defend (a pair closer than its declared
separation, an item outside its sector's area, an ignition source inside a
declared hazardous-area zone or downwind of a release source, a rule that
names no placed kind, the sized items left out).  `bin/choupo-layout --draft`
writes a proposal from the topology and the sizes.  Every distance, zone and
angle is the CASE's own; no table is shipped.

The risks such a feature carries are specific, and each arm names one:

  (a) THE WITNESS (`tutorials/plant/ammonia02_full_plant`) runs and publishes
      the block; each vessel's extents equal the D and H on its OWN design
      sheet (design/<unit>/vessel, read here as text -- an independent home
      for the footprint rule); and the one separation finding's distance is
      RECOMPUTED here from the published positions and extents
      (circle-to-circle, edge to edge) and agrees.
  (b) THE ANNOUNCEMENT REACHES ALL THREE SURFACES: stderr at its site, the
      end-of-run caveat block under PLANT LAYOUT, and the result JSON
      (`advisories` AND `layout.findings`).
  (c) REFUSALS, each fired through the real reader on a copy of the witness
      and each required to exit 2 and NAME its defect: an unknown item, an
      item placed twice, an overlap, a footprint declared on an item that
      publishes its own size, an item that publishes none and declares none,
      an angle with no unit, a zone that is not 0/1/2, areas on a flat case,
      one pair of kinds declared twice; on a column: its tray stack (an
      internal) placed on its own; on the sectored flagship: an area for a
      sector the case does not have.
  (d) THE HAZARD ANNOUNCEMENTS: a non-process ignition source moved into the
      let-down drum's zone 2 and the wind turned to blow at it raise an
      `ignitionInZone` and `ignitionDownwind` finding each, with the
      distances recomputed here; a rule naming an absent kind raises a
      `deadRule`; on the sectored flagship an area that leaves an item out
      raises `outsideArea`.
  (e) THE DRAFT TOOL: on the flagship (no layoutDict) it writes a file headed
      as a DRAFT, the same run checks it (block published, zero findings),
      areas are written per sector, items with no size of their own are
      listed for the student and not placed; run again without --force it
      REFUSES and leaves the file byte-identical; with --force on the witness
      it carries the separation table, the declared footprints, the hazards
      and the non-process item, and its own check finds no shortfall.
  (f) ABSENCE IS SILENCE: the witness with its layoutDict removed publishes
      no `layout` key, prints no `[layout]` line and no PLANT LAYOUT heading.
  (g) A PLACED ITEM WHOSE SIZER REFUSED (2026-10-17, DEV.md 4c C79, the
      commander's decision): on a copy of the witness whose postDict makes
      the separator's sizer refuse (a flow KPI the unit does not publish),
      the run exits 0, the separator is NOT placed, a `sizingRefused`
      finding names it and quotes the sizer's own FAILED line, and the
      announcement reaches stderr, the caveat block and the JSON.  The
      negative, on the same sabotaged sizing: an item `separatorX` (a name
      that merely STARTS with the refused entry's) still refuses as naming
      no sized item -- the id belongs to an entry only as the entry itself
      or `entry/<tag>` (`EquipmentSizing::isItemOf`).

NOT COVERED, said so: whether a declared distance or zone extent is SENSIBLE
(the author's assumption, by design -- no standard is shipped), pipe lengths,
structures, rotations other than the two plan axes, the GUI drawing (its
pure scene mapping is tested in gui/tests/plantLayout.test.ts), and
byte-identity of the cases without a layout (measured once, not gated).

SABOTAGES performed by hand (2026-10-17; each restored with `git checkout`
and one idempotent `make all`; all CAUGHT, two only after the gate was
strengthened):
  S1 `clearPlan` circle-circle returns the CENTRE distance        -> (a) the
     engine's 3.5 m against the 1.886 m recomputed here; (c) the overlap
     fixture exits 0.
  S2 the overlap refusal's condition inverted to `c > kTol`        -> (a) the
     witness itself refused; (c), (d), (e) every fixture refused.
  S3 `announce()` writes stderr only, no AdvisoryLog::add         -> (b) no
     PLANT LAYOUT block, no advisory in the JSON; (d) neither hazard finding
     in the caveat block.
  S4 the draft skips the `layoutDict && !force` refusal            -> (e) exit 0.
     The file-unchanged half did NOT fire on its own: the tool is
     deterministic, so its overwrite was byte-identical to what it replaced.
     The arm now appends a student edit before the second draft (S4b: caught
     on both halves).
  S5 `publishedFootprint` reads (D, D) instead of (D, H)           -> (a) dz
     against the design sheets' H, all three vessels.
  S6 the downwind direction taken as `from`, not `from + 180`      -> (a) two
     spurious downwind findings on the witness; (d) three missing.
  S7 the zone check's VERTICAL test removed                        -> SURVIVED
     first: every fixture item stood at grade, so the height half of the
     envelope had no case.  The hazard fixture now carries a panel 20 m up,
     inside two zone radii in plan and above both envelopes -> caught.
  (C79, arm (g), 2026-10-17; each restored with `cp` of the saved file
  and one idempotent `make all`, all CAUGHT):
  S8 `refusedSizingOf` returns nullptr at its top (the C76 behaviour) -> (g)
     "a layout placing an item whose sizer refused exited 2".
  S9 `EquipmentSizing::isItemOf` loses its `id[unit.size()] == '/'` test
     (a bare prefix match)                                          -> (g)
     "`separatorX` beside a refused `separator` exited 0".
  S10 `addFinding` skips `announce()` for a sizingRefused finding (the
     finding still published in `layout.findings`)                 -> (g)
     not on stderr, not in the caveat block, not in the advisories.
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
import hashlib
from math import hypot, atan2, degrees
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BIN = ROOT / "choupoSolve"
TOOL = ROOT / "bin" / "choupo-layout"
WITNESS = ROOT / "tutorials/plant/ammonia02_full_plant"
FLAGSHIP = ROOT / "tutorials/plant/ChemicalPlantTutorial"
COLUMN = ROOT / "tutorials/steady/distillation/column09_tray_hydraulics"
ENV = {"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"}

fails = []
claims = []


def fail(msg):
    fails.append(msg)


def prepare(work, name, src, edit=None, drop_layout=False):
    d = work / name
    if d.exists():
        shutil.rmtree(d)
    shutil.copytree(src, d, ignore=shutil.ignore_patterns(
        "reports", "converged", "design", "iterations"))
    lay = d / "system" / "layoutDict"
    if drop_layout and lay.exists():
        lay.unlink()
    if edit is not None:
        lay.write_text(edit(lay.read_text() if lay.exists() else ""))
    return d


def run(cmd, cwd=ROOT):
    p = subprocess.run(cmd, capture_output=True, text=True, cwd=str(cwd),
                       timeout=900, env=ENV)
    return p.stdout, p.stderr, p.returncode


def solve(d, *extra):
    return run([str(BIN), *extra, str(d)])


def result_json(out):
    m = re.search(r"<<<Choupo:result-begin>>>\s*\n(.*?)\n<<<Choupo:result-end>>>",
                  out, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return None


def sheet_value(d, rel, key):
    """A sizing value read off a design sheet as TEXT (`key  12.3 m;`)."""
    t = (d / "design" / rel).read_text()
    blk = t[t.index("\nsizing"):]
    m = re.search(r"^\s+" + re.escape(key) + r"\s+([-0-9.eE+]+)\s", blk, re.M)
    return float(m.group(1)) if m else None


def clear_circles(a, b):
    return hypot(a["x"] - b["x"], a["y"] - b["y"]) - a["dx"] / 2 - b["dx"] / 2


def point_to_box(px, py, i):
    gx = max(0.0, abs(px - i["x"]) - i["dx"] / 2)
    gy = max(0.0, abs(py - i["y"]) - i["dy"] / 2)
    return hypot(gx, gy)


# --------------------------------------------------------------- arms -----
def arm_witness(work):
    d = prepare(work, "witness", WITNESS)
    out, err, rc = solve(d)
    if rc != 0:
        fail(f"(a) the witness exited {rc}:\n    " + (err.strip().splitlines() or [""])[-1])
        return
    j = result_json(out)
    lay = (j or {}).get("layout")
    if not lay:
        fail("(a) the witness published no `layout` block")
        return
    items = {i["id"]: i for i in lay["items"]}
    if len(items) != 8:
        fail(f"(a) the witness places {len(items)} items, expected 8")
    for unit in ("converter", "separator", "letdown"):
        D = sheet_value(d, f"{unit}/vessel", "D")
        H = sheet_value(d, f"{unit}/vessel", "H")
        it = items.get(unit)
        if it is None or D is None or H is None:
            fail(f"(a) {unit}: not placed, or its design sheet carries no D/H")
            continue
        if abs(it["dx"] - D) > 1e-6 * D or abs(it["dy"] - D) > 1e-6 * D \
                or abs(it["dz"] - H) > 1e-6 * H:
            fail(f"(a) {unit}: published extents {it['dx']} x {it['dy']} x {it['dz']}"
                 f" are not its design sheet's D = {D}, H = {H}")
        if it["shape"] != "cylinder" or it["footprintFrom"] != "published":
            fail(f"(a) {unit}: drawn as {it['shape']}/{it['footprintFrom']}, not a"
                 " published cylinder")
    f = [x for x in lay["findings"] if x["id"] == "separation:separator:letdown"]
    if len(f) != 1 or len(lay["findings"]) != 1:
        fail(f"(a) the witness's findings are {[x['id'] for x in lay['findings']]},"
             " expected exactly separation:separator:letdown")
    else:
        mine = clear_circles(items["separator"], items["letdown"])
        if abs(mine - f[0]["value"]) > 1e-6 or f[0]["limit"] != 4:
            fail(f"(a) separator-letdown: the engine says {f[0]['value']} m against"
                 f" {f[0]['limit']} m; recomputed here {mine} m against 4 m")
    # (b) three surfaces
    msg = f[0]["message"] if f else "stand"
    if "[layout] " + msg not in err:
        fail("(b) the separation announcement is not on stderr at its site")
    if "PLANT LAYOUT" not in out or msg not in out.split("PLANT LAYOUT", 1)[-1]:
        fail("(b) the separation announcement is not in the caveat block under PLANT LAYOUT")
    if not any(a.get("category") == "layout" and a.get("message") == msg
               for a in (j.get("advisories") or [])):
        fail("(b) the separation announcement is not in the result JSON's advisories")
    claims.append("witness: 8 items, vessel extents = their design sheets' D/H,"
                  " the one shortfall recomputed edge to edge and announced on"
                  " stderr, the caveat block and the JSON")
    return lay


def sub(old, new):
    def f(text):
        if old not in text:
            raise RuntimeError(f"fixture anchor not found: {old!r}")
        return text.replace(old, new, 1)
    return f


def chain(*fs):
    def f(text):
        for g in fs:
            text = g(text)
        return text
    return f


ITEMS_OPEN = "items\n(\n"
REFUSALS = {
    "unknown item": (sub(ITEMS_OPEN, ITEMS_OPEN
        + '    { item "noSuchItem"; x 200 m; y 0 m; z 0 m; orientation vertical; }\n'),
        [r"item `noSuchItem` names no sized item", r"Placeable items:.*converter"]),
    "placed twice": (sub(ITEMS_OPEN, ITEMS_OPEN
        + '    { item "converter"; x 200 m; y 0 m; z 0 m; orientation vertical; }\n'),
        [r"item `converter` is placed twice"]),
    "overlap": (sub("x           59.5 m;", "x           56.5 m;"),
        [r"`separator` and `letdown` OVERLAP", r"interpenetrate by"]),
    "footprint on a sized item": (sub('item        "converter";        // D and H from its own sizing',
        'item        "converter";  footprint { length 3 m; width 3 m; height 3 m; }'),
        [r"declares a `footprint`, but its sizer\s+already published its size",
         r"one item, one size"]),
    "no footprint, no size": (sub("        footprint   { length 8 m; width 4 m; height 4 m; }   // author-set\n", ""),
        [r"item `makeupComp` \(a `compressor`\) cannot be placed",
         r"No size is\s+invented"]),
    "angle with no unit": (sub("from        225 deg;", "from        225;"),
        [r"`from` carries no unit", r"the raw form is the radian"]),
    "zone not 0/1/2": (sub("{ zone 1; radius 1.5 m;", "{ zone 3; radius 1.5 m;"),
        [r"hazardous-area zone", r"Accepted.*0.*1.*2"]),
    "areas on a flat case": (lambda t: t + "\nareas { LOOP { xMin 0 m; xMax 10 m; yMin 0 m; yMax 10 m; } }\n",
        [r"`areas` are declared, and this case has no sectors"]),
    "pair declared twice": (sub("{ between ( vessel vessel );           distance 4 m;  }",
        "{ between ( vessel vessel );           distance 4 m;  }\n"
        "            { between ( vessel vessel );           distance 6 m;  }"),
        [r"between `vessel` and\s+`vessel` is declared twice"]),
}


def arm_refusals(work):
    n = 0
    for label, (edit, pats) in REFUSALS.items():
        d = prepare(work, "refuse_" + re.sub(r"\W", "_", label), WITNESS, edit)
        out, err, rc = solve(d)
        txt = out + err
        if rc != 2:
            fail(f"(c) {label}: exit {rc}, expected the refusal's 2")
            continue
        for p in pats:
            if not re.search(p, txt, re.S):
                fail(f"(c) {label}: the refusal does not say /{p}/:\n    "
                     + "\n    ".join(l for l in txt.splitlines() if "ERROR" in l)[:500])
        n += 1
    # an internal: the column's tray stack, placed on its own
    d = prepare(work, "refuse_internal", COLUMN,
                lambda _t: 'items ( { item "column09/trays"; x 0 m; y 0 m; z 0 m;'
                           ' orientation vertical; } );\n')
    out, err, rc = solve(d)
    if rc != 2 or not re.search(r"is not placed on its own: it is a `sieveTrays`",
                                out + err):
        fail(f"(c) internal: column09/trays was not refused as an internal (exit {rc})")
    else:
        n += 1
    # an unknown sector, on the sectored flagship
    d = prepare(work, "refuse_sector", FLAGSHIP,
                lambda _t: 'items ( { item "DRYING.SD"; x 0 m; y 0 m; z 0 m;'
                           ' orientation vertical; } );\n'
                           'areas { NOWHERE { xMin 0 m; xMax 1 m; yMin 0 m; yMax 1 m; } }\n')
    out, err, rc = solve(d)
    if rc != 2 or not re.search(r"areas: `NOWHERE`", out + err) \
            or "FERMENTATION" not in out + err:
        fail(f"(c) unknown sector: NOWHERE was not refused naming the sectors (exit {rc})")
    else:
        n += 1
    claims.append(f"{n} refusals fired through the real reader, each exit 2 and"
                  " naming its defect")


def arm_hazards(work):
    #  The control room moved east of the let-down drum, the wind turned to
    #  blow from the west, a rule for an absent kind added.
    edit = chain(
        sub("        x           -30 m;\n        y           -40 m;",
            "        x           70 m;\n        y           -6 m;"),
        sub("from        225 deg;", "from        270 deg;"),
        sub("{ between ( building shellTubeHX );    distance 30 m; }",
            "{ between ( building shellTubeHX );    distance 30 m; }\n"
            "            { between ( flare vessel );            distance 60 m; }"),
        # the control room is now too close to everything at 30 m: drop
        # those rules so the arm reads the HAZARD findings alone
        sub("{ between ( building compressor );     distance 30 m; }", ""),
        sub("{ between ( building vessel );         distance 30 m; }", ""),
        sub("{ between ( building shellTubeHX );    distance 30 m; }", ""),
        # an ignition source on a platform ABOVE both zone envelopes it sits
        # within in plan: the envelope is a cylinder of declared HEIGHT, so it
        # must not be reported (found by sabotage S7: without this item the
        # vertical half of the rule was untested)
        sub(ITEMS_OPEN, ITEMS_OPEN
            + '    { nonProcess "elevatedPanel"; kind panel; x 59.5 m; y -2 m;'
              ' z 20 m; orientation alongX;'
              ' footprint { length 1 m; width 1 m; height 1 m; }'
              ' ignition "an electrical panel on a platform"; }\n'),
    )
    d = prepare(work, "hazards", WITNESS, edit)
    out, err, rc = solve(d)
    j = result_json(out)
    lay = (j or {}).get("layout")
    if rc != 0 or not lay:
        fail(f"(d) the hazard fixture exited {rc} / published no layout:\n    "
             + "\n    ".join(l for l in (out + err).splitlines() if "ERROR" in l)[:400])
        return
    items = {i["id"]: i for i in lay["items"]}
    got = {f["id"]: f for f in lay["findings"]}
    cr = items["controlRoom"]
    # zone: the let-down drum's zone 2 (radius 4.5 m) reaches the room's box
    zid = "ignitionInZone:controlRoom:letdown#zone2"
    mine = point_to_box(items["letdown"]["x"], items["letdown"]["y"], cr)
    if zid not in got:
        fail(f"(d) no {zid}; findings: {sorted(got)}")
    elif abs(got[zid]["value"] - mine) > 1e-6 or got[zid]["limit"] != 4.5:
        fail(f"(d) zone: engine {got[zid]['value']} / {got[zid]['limit']},"
             f" recomputed {mine} / 4.5")
    if "ignitionInZone:controlRoom:letdown#zone1" in got:
        fail("(d) the room is outside the let-down drum's zone 1 (1.5 m) and was"
             " reported inside it")
    # wind: from 270 (true), plan north = true north, so downwind is plan +x;
    # within +/-30 deg and 60 m: separator (14 m), letdown (10.5 m),
    # recycleComp (52 m, 2.2 deg off); makeupComp is 64 m away.
    want = {"separator", "letdown", "recycleComp"}
    for rel in ("separator", "letdown", "recycleComp", "makeupComp"):
        fid = f"ignitionDownwind:controlRoom:{rel}"
        r = items[rel]
        dist = hypot(cr["x"] - r["x"], cr["y"] - r["y"])
        bearing = degrees(atan2(cr["x"] - r["x"], cr["y"] - r["y"])) % 360
        inside = dist <= 60 and abs(((bearing - 90) + 180) % 360 - 180) <= 30
        if inside != (rel in want):
            fail(f"(d) the fixture's own geometry moved: {rel} at {dist} m,"
                 f" bearing {bearing}")
        if inside and (fid not in got or abs(got[fid]["value"] - dist) > 1e-6):
            fail(f"(d) {fid}: expected at {dist} m, got {got.get(fid)}")
        if not inside and fid in got:
            fail(f"(d) {fid} reported though {rel} is {dist} m away, bearing {bearing}")
    p = items.get("elevatedPanel")
    if p is None or point_to_box(items["letdown"]["x"], items["letdown"]["y"], p) >= 4.5:
        fail("(d) the elevated panel fixture is not where it must be (inside the"
             " let-down drum's zone-2 radius in plan)")
    for fid in got:
        if fid.startswith("ignitionInZone:elevatedPanel:"):
            fail(f"(d) {fid}: the panel stands 20 m up, above every envelope's"
                 " declared height, and was reported inside one")
    if "deadRule:flare:flare|vessel" not in got:
        fail(f"(d) the rule naming the absent kind `flare` raised no deadRule; {sorted(got)}")
    caveat = out.split("PLANT LAYOUT", 1)[-1] if "PLANT LAYOUT" in out else ""
    for fid in (zid, "ignitionDownwind:controlRoom:letdown"):
        if fid in got and got[fid]["message"] not in caveat:
            fail(f"(d) {fid} did not reach the caveat block")
    # outsideArea, on the sectored flagship
    d = prepare(work, "outside_area", FLAGSHIP,
                lambda _t: 'items ( { item "DRYING.SD"; x 0 m; y 0 m; z 0 m;'
                           ' orientation vertical; }\n'
                           '        { item "FERMENTATION.Fermentor"; x 10 m; y 0 m; z 0 m;'
                           ' orientation vertical; } );\n'
                           'areas { DRYING { xMin -2 m; xMax 2 m; yMin -2 m; yMax 2 m; }\n'
                           '        FERMENTATION { xMin 3 m; xMax 6 m; yMin -2 m; yMax 2 m; } }\n')
    out, err, rc = solve(d)
    lay = ((result_json(out) or {}).get("layout")) or {}
    ids = {f["id"] for f in lay.get("findings", [])}
    if rc != 0 or "outsideArea:FERMENTATION.Fermentor:FERMENTATION" not in ids \
            or any(i.startswith("outsideArea:DRYING") for i in ids):
        fail(f"(d) outsideArea: exit {rc}, findings {sorted(ids)}")
    if lay and len(lay.get("areas", [])) != 2:
        fail("(d) the flagship's two declared areas were not published")
    claims.append("a zone-2 intrusion and three downwind ignitions recomputed"
                  " here, a dead rule, an item outside its sector's area")


def arm_draft(work):
    d = prepare(work, "draft_flagship", FLAGSHIP)
    lay_path = d / "system/layoutDict"
    out, err, rc = run([str(TOOL), "--draft", str(d)])
    if rc != 0 or not lay_path.exists():
        fail(f"(e) the draft on the flagship exited {rc} / wrote nothing:\n    "
             + "\n    ".join(l for l in (out + err).splitlines() if "ERROR" in l)[:400])
        return
    text = lay_path.read_text()
    if "A DRAFT" not in text or "PROPOSAL, NOT A LAYOUT" not in text:
        fail("(e) the draft is not headed as a DRAFT the student must own")
    lay = ((result_json(out) or {}).get("layout")) or {}
    if not lay or lay.get("findings"):
        fail(f"(e) the draft's own check: block {'present' if lay else 'ABSENT'},"
             f" findings {[f['id'] for f in lay.get('findings', [])]}")
    if sorted(a["sector"] for a in lay.get("areas", [])) != ["DRYING", "FERMENTATION"]:
        fail(f"(e) the draft's areas are {[a['sector'] for a in lay.get('areas', [])]}")
    for u in ("CONCENTRATION.Evap1", "CONCENTRATION.Cryst"):
        if u not in lay.get("unplaced", []) or f'"{u}"' in text.split("NOT PLACED")[0]:
            fail(f"(e) {u} publishes no size and was placed, or not listed for the student")
    #  The student's edit, so an overwrite is visible even when the tool would
    #  write the same proposal again (it is deterministic: a byte-identical
    #  rewrite passed the hash alone -- found by sabotage S4).
    lay_path.write_text(lay_path.read_text() + "\n// the student's own edit\n")
    h = hashlib.sha256(lay_path.read_bytes()).hexdigest()
    out, err, rc = run([str(TOOL), "--draft", str(d)])
    if rc != 2 or "never overwritten without --force" not in out + err \
            or hashlib.sha256(lay_path.read_bytes()).hexdigest() != h:
        fail(f"(e) a second draft without --force: exit {rc}; the file"
             f" {'changed' if hashlib.sha256(lay_path.read_bytes()).hexdigest() != h else 'kept'}")
    # --force on the witness: carried, and its own check finds no shortfall
    d = prepare(work, "draft_force", WITNESS)
    out, err, rc = run([str(TOOL), "--draft", "--force", str(d)])
    text = (d / "system/layoutDict").read_text()
    lay = ((result_json(out) or {}).get("layout")) or {}
    if rc != 0 or not lay:
        fail(f"(e) --force on the witness exited {rc}")
        return
    if lay.get("findings"):
        fail(f"(e) the forced draft has findings {[f['id'] for f in lay['findings']]}"
             " -- it must honour every declared separation")
    for needle in ('nonProcess  "controlRoom"', "footprint   { length 8.00 m",
                   "between ( vessel vessel ); distance 4.00 m", "from      225 deg",
                   "{ zone 1; radius 1.50 m; height 3.00 m; }"):
        if needle not in text:
            fail(f"(e) the forced draft did not carry `{needle}`")
    if len(lay.get("items", [])) != 8:
        fail(f"(e) the forced draft places {len(lay.get('items', []))} items, expected 8")
    claims.append("the draft writes a headed proposal its own run checks clean,"
                  " lists what it will not size, refuses to overwrite, and with"
                  " --force carries the author's table, boxes, hazards and"
                  " non-process item with no shortfall")


def arm_absent(work):
    d = prepare(work, "absent", WITNESS, drop_layout=True)
    out, err, rc = solve(d)
    j = result_json(out)
    if rc != 0 or j is None:
        fail(f"(f) the witness without its layout exited {rc}")
        return
    if "layout" in j or "[layout]" in out + err or "PLANT LAYOUT" in out \
            or '"category": "layout"' in out:
        fail("(f) a case without system/layoutDict printed or published a layout")
    claims.append("a case without a layoutDict prints and publishes nothing of one")


REFUSED_SIZER_EDIT = ("designRules { residenceTime 45.0;  flowKey F_beta;",
                      "designRules { residenceTime 45.0;  flowKey noSuchKpi;")


def prepare_refused_sizer(work, name, layout_edit=None):
    d = prepare(work, name, WITNESS, layout_edit)
    pd = d / "system" / "postDict"
    text = pd.read_text()
    if text.count(REFUSED_SIZER_EDIT[0]) != 1:
        raise RuntimeError("fixture anchor not found in the witness postDict: "
                           + REFUSED_SIZER_EDIT[0])
    pd.write_text(text.replace(*REFUSED_SIZER_EDIT))
    return d


def arm_refused_sizer(work):
    d = prepare_refused_sizer(work, "refused_sizer")
    out, err, rc = solve(d)
    j = result_json(out)
    lay = (j or {}).get("layout")
    if rc != 0 or not lay:
        tail = [l for l in (out + err).splitlines() if l.strip()][-1:]
        fail(f"(g) a layout placing an item whose sizer refused exited {rc} /"
             " published no layout -- one refused sizer must not cost the run:\n    "
             + ("\n    ".join(l for l in (out + err).splitlines() if "ERROR" in l)
                or "\n    ".join(tail))[:400])
        return
    failed = re.search(r"separator  FAILED: (.*)", err)
    if not failed:
        fail("(g) the fixture's separator sizer did not refuse -- the probe"
             " no longer reaches the case it is about")
        return
    ids = [i["id"] for i in lay["items"]]
    if "separator" in ids:
        fail("(g) the separator was placed although its sizer refused")
    if len(ids) != 7:
        fail(f"(g) {len(ids)} items placed, expected the witness's 8 less the separator")
    f = [x for x in lay["findings"] if x["id"] == "sizingRefused:separator:separator"]
    if len(f) != 1:
        fail(f"(g) no sizingRefused finding for the separator; findings "
             f"{[x['id'] for x in lay['findings']]}")
        return
    msg = f[0]["message"]
    if failed.group(1).strip() not in msg or "UNPLACED" not in msg:
        fail("(g) the finding does not quote the sizer's FAILED line and say"
             f" UNPLACED: {msg}")
    if "[layout] " + msg not in err:
        fail("(g) the sizingRefused announcement is not on stderr at its site")
    if "PLANT LAYOUT" not in out or msg not in out.split("PLANT LAYOUT", 1)[-1]:
        fail("(g) the sizingRefused announcement is not in the caveat block")
    if not any(a.get("category") == "layout" and a.get("message") == msg
               for a in (j.get("advisories") or [])):
        fail("(g) the sizingRefused announcement is not in the JSON's advisories")
    # the negative: a name that merely starts with the refused entry's
    d = prepare_refused_sizer(work, "refused_sizer_typo", sub(ITEMS_OPEN, ITEMS_OPEN
        + '    { item "separatorX"; x 200 m; y 0 m; z 0 m; orientation vertical; }\n'))
    out, err, rc = solve(d)
    if rc != 2 or not re.search(r"item `separatorX` names no sized item", out + err):
        fail(f"(g) `separatorX` beside a refused `separator` exited {rc}; it must"
             " still refuse as naming no sized item")
    claims.append("an item whose sizer refused is left unplaced and announced"
                  " on all three surfaces quoting the sizer, the run going on;"
                  " a name that only starts like the refused entry's still refuses")


def main():
    argv = sys.argv[1:]
    keep = Path(argv[argv.index("--keep") + 1]).resolve() if "--keep" in argv else None
    if not BIN.exists():
        print("check_plant_layout: FAIL -- no choupoSolve build; run `make all`")
        return 1
    work = keep or Path(tempfile.mkdtemp(prefix="plantlayout."))
    work.mkdir(parents=True, exist_ok=True)
    try:
        arm_witness(work)
        arm_refusals(work)
        arm_hazards(work)
        arm_draft(work)
        arm_absent(work)
        arm_refused_sizer(work)
    finally:
        if not keep:
            shutil.rmtree(work, ignore_errors=True)
    if fails:
        print("check_plant_layout: FAIL")
        for f in fails:
            print("  - " + f)
        return 1
    print("check_plant_layout: OK -- " + "; ".join(claims)
          + ".  NOT COVERED: whether a declared distance or zone is sensible"
          " (the author's assumption -- no standard is shipped), pipe lengths,"
          " structures, the GUI drawing (its scene mapping is a vitest), and"
          " byte-identity of cases without a layout (measured once, not gated).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
