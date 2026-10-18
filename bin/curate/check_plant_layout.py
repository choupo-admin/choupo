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
      it carries the separation table, the declared footprints, the hazards,
      the non-process item and (C82) the plot margin, and its own check
      finds no shortfall.
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

  (h) THE PIPES (2026-10-17, DEV.md 4c C80), on the three plants that carry
      a layout, all three on DECLARED racks (ammonia02_full_plant since C93,
      when its tank farm dragged the stated default onto the main road; the
      stated default is exercised on a copy of it with `pipeRack` removed):
      every stream of the stream table (one per identity: an entry marked
      `aliasOf`/`boundaryLabel` is a label, an independent home for the set)
      is routed or listed in `notRouted` with a reason, never both, never
      dropped; every route is ORTHOGONAL (each segment along one axis), its
      published length is the polyline's own (recomputed here), and its two
      ends are where the published block puts them -- an item's top centre,
      a junction's node, the rack's xStart/xEnd for a battery limit (with a
      fence, the published crossing ON the fence); a rack route claims no
      override; the default rack (the probe) is published as such and
      ANNOUNCED on stderr, the caveat block and the advisories, a declared one
      announces nothing; each pipe REPRODUCES its golden `layout` rows (from,
      to, length), every published pipe is pinned and every pinned pipe is
      published, and the summary's pipe counts agree three ways.  The witness
      routes EVERY stream: its `notRouted` must be empty (Vitor, C93: "there
      are compressors that have no inlets").
  (i) A DECLARED ROUTE: on a copy of the witness, `pipes { rawLiquid {
      waypoints (...) } }` is honoured (separator top -> two waypoints ->
      let-down top, `routedBy waypoints`, no lane) and its length recomputed;
      REFUSED, each exit 2 and naming its defect: a diagonal segment, an
      override naming no stream, an override on a stream with no routable end
      (`productNH3`, once T201's bullets are taken off the copy's plot plan: a
      sized unit none of whose items is placed), a partial `pipeRack`, a
      fractional
      `lanesPerTier`.  THE UNROUTED MARK (C93): on the same copy with no
      override, `productNH3` is listed with `fromUnit letdown`, `toUnit T201`
      and an `anchor` equal to the routed pipe's first point (the let-down's
      nozzle -- where the 3D view marks the missing pipe), and
      `productStored`, which reaches no end, carries no anchor.  The forced
      draft carries a declared rack as declared and says it did not carry the
      waypoint overrides.

  (j) THE PLOT (2026-10-17, DEV.md 4c C82), on the same three plants and on
      two fixtures of the sectored flagship: the published plot RECOMPUTED
      here from the published items, areas and pipe routes by the stated
      rule (envelope + the margin read from the case's own layoutDict, 0 m
      where it declares none), and its area; the footprint area recomputed
      (a vertical cylinder's disc, any other item's rectangle) and its share;
      a declared margin announces nothing, an absent one is ANNOUNCED on
      stderr, the caveat block and the advisories (aceticAcid02); every
      published plot / plotSector number is pinned by a golden row and every
      pinned one is published.  On the flagship: two declared sector areas
      that overlap -- their union and the shared ground recomputed, the
      overlap announced, each sector's area its declared one; then one area
      declared and a margin -- the undeclared sector's area is the envelope
      of its own footprints, the margin grows the plot.  REFUSED, exit 2 and
      named: a negative margin, a plot block with no reason.

  (k) THE ROADS (2026-10-18, DEV.md 4c C90), on the witness, which declares
      a gate, a canteen, a warehouse and seven roads: each road's published
      length is its centre line's own and the network's is their sum (both
      recomputed here); the PAVED AREA is recomputed here as the union of the
      paved rectangles on the grid of their own edges -- an independent
      implementation of the rule; the crossing under the rack is recomputed
      from the published rack band and the published clearance is the rack's
      elevation, at least the declared headroom; every item's ACCESS distance
      (footprint edge to the nearest paved rectangle of a road a gate
      reaches) is recomputed here and each is within the declared distance,
      so the witness raises no road finding; the plot recomputed by arm (j)
      includes the paved rectangles (this arm requires that the plot would be
      SMALLER without them, so the roads are in the envelope); every
      published road length, network length, paved area and access distance
      is pinned by a golden row and every pinned one is published.  Then on
      copies of the witness, REFUSED (exit 2, named): a road through a
      footprint (the converter), a road under the rack with a headroom above
      the rack's 6 m, a pipe below the headroom over a road (a waypoint
      route), a diagonal road segment, a road declared twice, a waypoint
      carrying a `z`, a roads block with no `access`, a non-process item with
      a `source` and no `reason`.  ANNOUNCED (stderr, the caveat block and
      the JSON, values recomputed here): a road in a zone the case closes to
      traffic (the makeup compressor's zone 2 grown to reach the west road,
      with `noTraffic ( 1 2 )`), a road no gate reaches, a site building no road
      serves, a process item beyond the access distance, a network with no
      gate, a weighbridge no road crosses -- and its negative: a weighbridge
      the main road runs OVER is not refused as a road through a footprint,
      is published `onDeck`, and raises nothing.  The forced draft says it did
      not carry the roads and carries each site building's source and reason.

  (l) THE FENCE (2026-10-18, DEV.md 4c C93), on the witness, which declares
      a fence with inset 0 and six crossings: the fence RECOMPUTED here from
      the published plot (moved by the inset read from the case) and its
      length; each gate opening recomputed (the side nearest the gate, the
      serving road's centre-line vertex nearest that side, the road's width);
      every road's paved rectangle meets the fence only inside an opening;
      each crossing recomputed (its side -- west for an inlet, east for an
      outlet, or the declared one; its point -- the pipe's lane y and height,
      or the declared `at` on the fence line; its label and direction) and
      the pipe's battery-limit end IS that point; the witness raises no
      `unlabelledCrossing`; every published fence / opening / crossing number
      and word is pinned by a golden row and every pinned one is published.
      ANNOUNCED (stderr, caveat block, JSON, exit 0): a crossing with no label
      (the `makeup` entry removed from a copy); a fence with no gate.
      REFUSED (exit 2, named): a road through the fence at no gate (inset
      6 m pulls the fence across the east road), an item across the fence
      (no roads, inset 6 m), a negative inset, a crossing for a stream that
      does not cross the battery limit (`mixed`), an outlet labelled `from`,
      `side north` with no `at`, an `at` outside the fence, a stream declared
      twice.

NOT COVERED, said so: whether a declared distance or zone extent is SENSIBLE
(the author's assumption, by design -- no standard is shipped), a pipe's
pressure drop and cost (none is computed), whether a route clashes with an
item it passes, structures, rotations other than the two plan axes, a road's
turning radius or gradient, whether a declared headroom or access distance is
sensible (the author's assumption, as every distance here), the GUI
drawing (its pure scene mapping, phase, speed, declutter and camera fit are
tested in gui/tests/plantLayout.test.ts), and byte-identity of the cases
without a layout (measured once, not gated).

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
  (C80, arms (h) and (i), 2026-10-17; each restored with `cp` of the saved
  PlantLayout.cpp and one idempotent `make all`, all CAUGHT on first run):
  S11 the length taken end to end, not along the polyline          -> (h)
     every pipe's length against its own polyline and its golden row.
  S12 the corner across to the lane dropped                         -> (h)
     every rack route moves along two axes at once.
  S13 declared waypoints ignored (always the rack)                  -> (i)
     the override not honoured, its length wrong, the diagonal one exit 0.
  S14 the default-rack announcement removed                         -> (h)
     ammonia02's default rack said on no surface.
  S15 a stream with no routable end dropped without a `notRouted` row -> (h)
     four ammonia02 streams neither routed nor listed; the summary count
     against the golden.
  S16 a junction placed at its FIRST placed neighbour, not the mean -> (h)
     the junction-touching pipes' lengths against their golden rows.
  (C82, arm (j), 2026-10-17; each in PlantLayout.cpp, restored byte for
  byte (sha256 checked) and the engine rebuilt; all CAUGHT on first run):
  S17 the margin left off the plot's x extent                      -> (j)
     ammonia02, greenAmmoniaPEQ and the flagship fixture: the plot against
     its recomputation and the golden.
  S18 a vertical cylinder's footprint counted as its square        -> (j)
     the footprint area on all three plants and their golden rows; the
     flagship's FERMENTATION sector.
  S19 the absent-margin announcement removed                       -> (j)
     aceticAcid02 says it on no surface.
  S20 the union of the sector areas counts shared ground twice     -> (j)
     the flagship: union 1200 m2 / overlap 0 against 1000 / 200.
  S21 the routed pipes left out of the envelope                    -> (j)
     ammonia02's default rack reaches 5 m past the eastmost footprint and
     aceticAcid02's declared rack past its westmost: both plots short.
  (C90, arm (k), 2026-10-18; each in PlantLayout.cpp, restored byte for
  byte (sha256 checked) and the engine rebuilt; all CAUGHT on first run):
  S22 the road-through-footprint refusal skipped                   -> (k) the
      fixture still exits 2, but on the pipe riser it then meets, and the
      arm requires the refusal to NAME the converter.
  S23 the paved area summed per rectangle (no union)               -> (k)
      2400 m2 against the union's 2140.75 m2, and the golden row.
  S24 the roads left out of the plot envelope                      -> (k) the
      plot 9535.5 m2 against 11918.5 m2 recomputed with the roads.
  S25 the rack-crossing headroom test inverted                     -> (k) the
      witness itself refused (6 m > 5 m now reads as too low).
  S26 the access distance measured to the centre line, not the
      paved edge                                                   -> (k)
      every access distance off by half its road's width.
  S27 connectivity taken as "every road joined"                    -> (k) the
      island road raises no roadDisconnected.
  S28 the roadInZone finding never raised                          -> (k) the
      closed-zone fixture publishes none.
  (S14 and S21 were caught on ammonia02's default rack; since C93 that rack
  is declared and the default lives on the probe copy, which (h) reads.)
  (C93, arm (l) and the unrouted mark, 2026-10-18; each in PlantLayout.cpp
  or ResultEmitter.cpp, restored with `cp` of the saved file and one
  idempotent `make all`; all CAUGHT on first run):
  S29 the fence taken as the plot itself, the inset ignored         -> (l) the
      road-through-fence and item-across-fence probes no longer refuse (both
      depend on the 6 m inset).
  S30 a gate opening centred on the GATE's x, not the road's        -> (l) the
      opening against its recomputation and its golden row.
  S31 the road-at-no-gate refusal disabled                          -> (l) the
      probe exits 2 on a DIFFERENT message (the item it then meets), and the
      arm requires the refusal to name the road and the side.
  S32 the unlabelledCrossing finding never raised                   -> (l) the
      unlabelled probe announces nothing.
  S33 an inlet's default side taken as east                         -> (l) the
      makeup crossing against its recomputation and its golden row.
  S34 a default crossing placed at grade (z = 0), not the lane       -> (l) the
      witness itself exits 2: the pipe's drop to grade runs under the road
      headroom.
  S35 the notRouted anchor not emitted                              -> (i) the
      unrouted mark: productNH3 carries no anchor.
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
import hashlib
from math import hypot, atan2, degrees, pi
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
    if len(items) != 18:
        fail(f"(a) the witness places {len(items)} items, expected 18 (seven process"
             " items and the product store's seven bullets, sized, and the control"
             " room, gate, canteen and warehouse)")
    #  The process vessels stand; the product store's bullets (DEV.md 4c
    #  C92) LIE -- a lying cylinder's plan extents are its length along its
    #  axis and D across, and its height is D.
    stores = [(f"T201/vessel{k}", f"T201/vessel{k}", False) for k in range(1, 8)]
    for unit, sheet, standing in [(u, f"{u}/vessel", True)
                                  for u in ("converter", "separator", "letdown")] + stores:
        D = sheet_value(d, sheet, "D")
        H = sheet_value(d, sheet, "H")
        it = items.get(unit)
        if it is None or D is None or H is None:
            fail(f"(a) {unit}: not placed, or its design sheet carries no D/H")
            continue
        if standing:
            want = (D, D, H)
        elif it.get("orientation") == "alongX":
            want = (H, D, D)
        else:
            want = (D, H, D)
        if any(abs(it[k] - w) > 1e-6 * w for k, w in zip(("dx", "dy", "dz"), want)):
            fail(f"(a) {unit}: published extents {it['dx']} x {it['dy']} x {it['dz']}"
                 f" are not its design sheet's D = {D}, H = {H}"
                 f" ({'standing' if standing else 'lying'})")
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
    claims.append("witness: 18 items, vessel extents = their design sheets' D/H"
                  " (standing, and T201's bullets lying),"
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


ROADS_BLOCK = re.compile(r"\nroads\n\{.*?\n\}\n", re.S)


def drop_roads(text):
    """The witness's road network (C90), removed: a fixture that moves an
    item where a road runs is about the item, not the road."""
    out, n = ROADS_BLOCK.subn("\n", text)
    if n != 1:
        raise RuntimeError("fixture anchor not found: the witness's roads block")
    return out


def arm_hazards(work):
    #  The control room moved east of the let-down drum, the wind turned to
    #  blow from the west, a rule for an absent kind added.  The roads go:
    #  the room's new place is where the east road runs.
    edit = chain(
        drop_roads,
        sub("        x           -30 m;\n        y           -40 m;",
            "        x           70 m;\n        y           -6 m;"),
        sub("from        225 deg;", "from        270 deg;"),
        sub("{ between ( controlRoom shellTubeHX ); distance 30 m; }",
            "{ between ( controlRoom shellTubeHX ); distance 30 m; }\n"
            "            { between ( flare vessel );            distance 60 m; }"),
        # the control room is now too close to everything at 30 m: drop
        # those rules so the arm reads the HAZARD findings alone
        sub("{ between ( compressor controlRoom );   distance 30 m; }", ""),
        sub("{ between ( controlRoom vessel );      distance 30 m; }", ""),
        sub("{ between ( controlRoom shellTubeHX ); distance 30 m; }", ""),
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
                   "{ zone 1; radius 1.50 m; height 3.00 m; }",
                   "margin 5.00 m;", 'kind        canteen;',
                   'reason      "meals and rest for the shift crews',
                   "`roads {}` network is NOT carried"):
        if needle not in text:
            fail(f"(e) the forced draft did not carry `{needle}`")
    if len(lay.get("items", [])) != 18:
        fail(f"(e) the forced draft places {len(lay.get('items', []))} items, expected 18")
    if "roadNetwork" in lay or "\nroads\n{" in text:
        fail("(e) the forced draft wrote or ran a road network: roads are drawn round"
             " positions the draft moves, and are never carried")
    claims.append("the draft writes a headed proposal its own run checks clean,"
                  " lists what it will not size, refuses to overwrite, and with"
                  " --force carries the author's table, boxes, hazards and"
                  " non-process item with no shortfall")


LAND_BLOCK = re.compile(r"\n    //  THE LAND \(DEV\.md 4c C82\).*?\n    land\n    \{.*?\n    \}\n", re.S)


def drop_land(d):
    """The witness prices its PLOT as land (C82): without a layout the land
    has no area and refuses by name, so a fixture that removes the layout
    removes the land block with it."""
    pd = d / "system" / "postDict"
    text, n = LAND_BLOCK.subn("\n", pd.read_text())
    if n != 1:
        raise RuntimeError("fixture anchor not found: the witness postDict's land block")
    pd.write_text(text)


def arm_absent(work):
    d = prepare(work, "absent", WITNESS, drop_layout=True)
    drop_land(d)
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
    if len(ids) != 17:
        fail(f"(g) {len(ids)} items placed, expected the witness's 18 less the separator")
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


# ------------------------------------------------------------ pipes (C80) --
PIPE_CASES = {
    "ammonia02": WITNESS,
    "greenAmmoniaPEQ": ROOT / "tutorials/plant/greenAmmoniaPEQ_baseCase",
    "aceticAcid02": ROOT / "tutorials/plant/aceticAcid02_plant",
}
TOL = 1e-6


def stream_identities(j):
    """The physical streams of a run, from the STREAM TABLE's own rule (one
    row per identity: an entry marked `aliasOf` or `boundaryLabel` is a
    label of another), an independent home for the set the pipes must
    cover."""
    return {k for k, v in (j.get("streams") or {}).items()
            if not v.get("aliasOf") and not v.get("boundaryLabel")}


def end_point(lay, kind, at, first, stream=None):
    """Where a pipe end must lie, recomputed here from the published items,
    junctions and rack: an item's top centre, a junction's node, or (x only)
    the rack's end for a battery limit -- or, where the case declares a fence
    (DEV.md 4c C93), the crossing the engine published for that stream, all
    three coordinates."""
    if kind == "batteryLimit" and lay.get("fence"):
        c = next((x for x in lay.get("fenceCrossings", []) if x["stream"] == stream), None)
        return None if c is None else (c["x"], c["y"], c["z"])
    if kind == "item":
        i = next((x for x in lay["items"] if x["id"] == at), None)
        return None if i is None else (i["x"], i["y"], i["z"] + i["dz"])
    if kind == "junction":
        jn = next((x for x in lay.get("junctions", []) if x["unit"] == at), None)
        return None if jn is None else (jn["x"], jn["y"], jn["z"])
    if kind == "batteryLimit":
        return (lay["pipeRack"]["xStart"] if first else lay["pipeRack"]["xEnd"],)
    return None


def check_routes(tag, lay, require_rack_route=True):
    """Every published route: each segment along ONE axis, its length the
    polyline's own, its two ends where the published items / junctions /
    rack say.  Returns the number of pipes checked."""
    n = 0
    for p in lay.get("pipes", []):
        r = p["route"]
        if len(r) < 2:
            fail(f"(h) {tag} pipe {p['stream']}: a route of {len(r)} point(s)")
            continue
        L = 0.0
        for a, b in zip(r, r[1:]):
            moved = sum(1 for k in range(3) if abs(a[k] - b[k]) > TOL)
            if moved != 1:
                fail(f"(h) {tag} pipe {p['stream']}: segment {a} -> {b} moves along"
                     f" {moved} axes -- a route is orthogonal")
            L += sum(abs(a[k] - b[k]) for k in range(3))
        if abs(L - p["length"]) > 1e-9 * max(1.0, L):
            fail(f"(h) {tag} pipe {p['stream']}: published length {p['length']} m,"
                 f" the polyline's own {L} m")
        for first, kind, at, pt in ((True, p["fromKind"], p["from"], r[0]),
                                    (False, p["toKind"], p["to"], r[-1])):
            want = end_point(lay, kind, at, first, p["stream"])
            if want is None:
                fail(f"(h) {tag} pipe {p['stream']}: its end `{at}` ({kind}) is nowhere"
                     " in the published block")
            elif kind == "batteryLimit" and lay.get("fence"):
                if any(abs(pt[k] - want[k]) > TOL for k in range(3)):
                    fail(f"(h) {tag} pipe {p['stream']}: a battery-limit end at {pt},"
                         f" the fence crossing the engine published is {want}")
            elif kind == "batteryLimit":
                if p["routedBy"] == "rack" and abs(pt[0] - want[0]) > TOL:
                    fail(f"(h) {tag} pipe {p['stream']}: a battery-limit end at x ="
                         f" {pt[0]}, the rack's {'xStart' if first else 'xEnd'} is {want[0]}")
            elif any(abs(pt[k] - want[k]) > TOL for k in range(3)):
                fail(f"(h) {tag} pipe {p['stream']}: its {'source' if first else 'target'}"
                     f" end {pt} is not `{at}`'s point {want}")
        if require_rack_route and p["routedBy"] != "rack":
            fail(f"(h) {tag} pipe {p['stream']}: routed by {p['routedBy']}, and the case"
                 " declares no override")
        n += 1
    return n


def golden_rows(case):
    rows = {}
    for line in (case / "expected").read_text().splitlines():
        f = line.split()
        if len(f) >= 5 and f[0] == "layout" and (f[1].startswith("pipe:")
                                                 or f[1] == "summary"):
            rows[(f[1], f[2])] = (f[3], f[4])
    return rows


def arm_pipes(work):
    total = 0
    for tag, case in PIPE_CASES.items():
        d = prepare(work, "pipes_" + tag, case)
        out, err, rc = solve(d)
        j = result_json(out)
        lay = (j or {}).get("layout")
        if rc != 0 or not lay or "pipes" not in lay:
            fail(f"(h) {tag}: exit {rc}, no layout or no pipes block")
            continue
        # every stream routed, or listed with a reason -- never dropped
        ids = stream_identities(j)
        routed = [p["stream"] for p in lay["pipes"]]
        listed = [n["stream"] for n in lay.get("notRouted", [])]
        if len(set(routed)) != len(routed) or set(routed) & set(listed):
            fail(f"(h) {tag}: a stream is routed twice, or both routed and listed")
        missing = ids - set(routed) - set(listed)
        extra = (set(routed) | set(listed)) - ids
        if missing:
            fail(f"(h) {tag}: stream(s) neither routed nor listed: {sorted(missing)}")
        if extra:
            fail(f"(h) {tag}: pipe(s) for no stream of the table: {sorted(extra)}")
        for nr in lay.get("notRouted", []):
            if len(nr.get("reason", "")) < 10:
                fail(f"(h) {tag}: {nr['stream']} is not routed and says no reason")
        # the witness routes EVERY stream (DEV.md 4c C93, Vitor: "there are
        # compressors that have no inlets"): no unit it places stands with a
        # port drawn to nothing
        if case == WITNESS and listed:
            fail(f"(h) {tag}: the witness must route every stream; not routed: {listed}")
        total += check_routes(tag, lay)
        check_plot(tag, case, lay, out, err, j)
        # the rack: declared in all three (ammonia02 since C93, when its tank
        # farm dragged the stated default onto the main road); the stated
        # default is exercised by the probe below, a copy with no pipeRack
        rack = lay["pipeRack"]
        default_said = "no `pipeRack` is declared" in err
        if not rack["declared"] or default_said:
            fail(f"(h) {tag} declares its pipeRack: it must be published as declared,"
                 " with no default announced")
        # the pipes reproduce the golden rows, and every pipe is pinned
        gold = golden_rows(case)
        for p in lay["pipes"]:
            pid = "pipe:" + p["stream"]
            for key, val in (("from", p["from"]), ("to", p["to"]), ("length", p["length"])):
                g = gold.get((pid, key))
                if g is None:
                    fail(f"(h) {tag}: {pid} {key} is published and pinned by no golden row")
                elif key == "length":
                    if abs(float(g[0]) - val) > float(g[1]) * max(abs(val), 1e-30):
                        fail(f"(h) {tag}: {pid} length {val} m against the golden {g[0]} m")
                elif g[0] != val:
                    fail(f"(h) {tag}: {pid} {key} `{val}` against the golden `{g[0]}`")
        pinned = {k[0] for k in gold if k[0].startswith("pipe:")}
        stale = pinned - {"pipe:" + s for s in routed}
        if stale:
            fail(f"(h) {tag}: golden rows pin pipes the run no longer publishes: {sorted(stale)}")
        summ = lay.get("summary", {})
        for key, val in (("pipes", len(routed)), ("notRouted", len(listed))):
            g = gold.get(("summary", key))
            if g is None or int(float(g[0])) != val or summ.get(key) != val:
                fail(f"(h) {tag}: summary {key} = {summ.get(key)} / golden"
                     f" {g[0] if g else 'absent'} / counted here {val}")
    # THE STATED DEFAULT RACK, on a copy of the witness with its declared rack
    # taken out (DEV.md 4c C93 moved this role from the shipped witness to a
    # probe): published as the default AND announced on all three surfaces.
    d = prepare(work, "pipes_default_rack", WITNESS, drop_block_edit("pipeRack"))
    out, err, rc = solve(d)
    j = result_json(out)
    lay = (j or {}).get("layout") or {}
    caveat = out.split("PLANT LAYOUT", 1)[-1] if "PLANT LAYOUT" in out else ""
    if rc != 0 or lay.get("pipeRack", {}).get("declared", True) \
            or "no `pipeRack` is declared" not in err \
            or "no `pipeRack` is declared" not in caveat \
            or not any("no `pipeRack` is declared" in (a.get("message") or "")
                       for a in (j or {}).get("advisories") or []):
        fail(f"(h) the witness with no pipeRack (exit {rc}): the default must be published"
             " as such AND announced on stderr, the caveat block and the advisories")
    else:
        total += check_routes("default-rack probe", lay)
    claims.append(f"{total} pipes on three plants, every stream routed or listed with"
                  " its reason, each route orthogonal with its length its own and its"
                  " ends at the published nozzles, junctions and battery limits, each"
                  " reproducing its golden rows; the default rack announced on three"
                  " surfaces where none is declared")


MARGIN_RE = re.compile(r"^plot\s*\{[^}]*?margin\s+([-0-9.eE+]+)\s*m\s*;", re.M)
PLOT_KEYS = ("plotArea", "footprintArea")


def margin_of(layout_text):
    """The margin the case DECLARES, read from its layoutDict as text (an
    independent home for the number); 0 where it declares none."""
    m = MARGIN_RE.search(re.sub(r"//[^\n]*", "", layout_text))
    return float(m.group(1)) if m else 0.0


def plan_area(i):
    if i["shape"] == "cylinder" and i["orientation"] == "vertical":
        return pi * i["dx"] ** 2 / 4.0
    return i["dx"] * i["dy"]


def plot_recomputed(lay, margin):
    """The stated rule, recomputed: the envelope of the declared areas, the
    placed footprints and the routed pipes' points, grown by the margin."""
    xs, ys = [], []
    for i in lay["items"]:
        xs += [i["x"] - i["dx"] / 2, i["x"] + i["dx"] / 2]
        ys += [i["y"] - i["dy"] / 2, i["y"] + i["dy"] / 2]
    for a in lay.get("areas", []):
        xs += [a["xMin"], a["xMax"]]
        ys += [a["yMin"], a["yMax"]]
    #  With a fence (DEV.md 4c C93) the rack-routed pipes enter as the rack's
    #  plan band (the legs that carry them on to the fence are drawn FROM this
    #  plot); a declared waypoint route enters as itself.
    fenced = bool(lay.get("fence"))
    band = False
    for p in lay.get("pipes", []):
        if fenced and p["routedBy"] == "rack":
            band = True
            continue
        for q in p["route"]:
            xs.append(q[0])
            ys.append(q[1])
    if band:
        k = lay["pipeRack"]
        hw = k["lanesPerTier"] * k["laneSpacing"] / 2
        xs += [k["xStart"], k["xEnd"]]
        ys += [k["y"] - hw, k["y"] + hw]
    for rect in paved_rects(lay):
        xs += [rect[0], rect[1]]
        ys += [rect[2], rect[3]]
    r = (min(xs) - margin, max(xs) + margin, min(ys) - margin, max(ys) + margin)
    return r, (r[1] - r[0]) * (r[3] - r[2])


def close(a, b, rel=1e-9):
    return abs(a - b) <= rel * max(1.0, abs(a), abs(b))


def check_plot(tag, case, lay, out, err, j):
    """Arm (j) on one plant: the plot recomputed, the margin's announcement,
    and published <=> pinned."""
    plot = lay.get("plot")
    if not plot:
        fail(f"(j) {tag}: the layout publishes no `plot`")
        return
    margin = margin_of((case / "system" / "layoutDict").read_text())
    rect, area = plot_recomputed(lay, margin)
    got = (plot["xMin"], plot["xMax"], plot["yMin"], plot["yMax"])
    if not all(close(a, b) for a, b in zip(rect, got)) or not close(area, plot["plotArea"]):
        fail(f"(j) {tag}: the plot {got} = {plot['plotArea']} m2; recomputed here"
             f" {rect} = {area} m2 (margin {margin} m)")
    if plot["margin"] != margin or plot["marginDeclared"] != (margin != 0.0):
        fail(f"(j) {tag}: margin {plot['margin']} (declared {plot['marginDeclared']}),"
             f" the case's layoutDict says {margin}")
    fa = sum(plan_area(i) for i in lay["items"])
    if not close(fa, plot["footprintArea"], 1e-8) \
            or not close(fa / area, plot["footprintShare"], 1e-8):
        fail(f"(j) {tag}: footprints {plot['footprintArea']} m2 (share"
             f" {plot['footprintShare']}); recomputed {fa} m2 ({fa / area})")
    said = "no `plot { margin; reason; }` is declared"
    caveat = out.split("PLANT LAYOUT", 1)[-1] if "PLANT LAYOUT" in out else ""
    everywhere = (said in err and said in caveat
                  and any(said in (a.get("message") or "") for a in j.get("advisories") or []))
    if plot["marginDeclared"] and said in out + err:
        fail(f"(j) {tag} declares its plot margin and the default was announced")
    if not plot["marginDeclared"] and not everywhere:
        fail(f"(j) {tag} declares no plot margin: that must be ANNOUNCED on stderr, the"
             " caveat block and the advisories")
    # published <=> pinned
    gold = {}
    for line in (case / "expected").read_text().splitlines():
        f = line.split()
        if len(f) >= 5 and f[0] == "layout" and (f[1] == "plot" or f[1].startswith("plotSector:")):
            gold[(f[1], f[2])] = (f[3], f[4])
    published = {("plot", k): plot[k] for k in PLOT_KEYS}
    for s_ in lay.get("plotSectors", []):
        for k in PLOT_KEYS:
            published[("plotSector:" + s_["sector"], k)] = s_[k]
    for key, val in published.items():
        g = gold.get(key)
        if g is None:
            fail(f"(j) {tag}: {key[0]} {key[1]} is published and pinned by no golden row")
        elif abs(float(g[0]) - val) > float(g[1]) * max(abs(val), 1e-30):
            fail(f"(j) {tag}: {key[0]} {key[1]} {val} against the golden {g[0]}")
    for key in gold:
        if key not in published and key[1] in PLOT_KEYS:
            fail(f"(j) {tag}: a golden row pins {key[0]} {key[1]}, which the run no"
                 " longer publishes")
    PLOT_SEEN.append(tag)


PLOT_SEEN = []

FLAGSHIP_ITEMS = ('items ( { item "DRYING.SD"; x 0 m; y 0 m; z 0 m; orientation vertical; }\n'
                  '        { item "FERMENTATION.Fermentor"; x 20 m; y 0 m; z 0 m;'
                  ' orientation vertical; } );\n')


def arm_plot(work):
    """(j) on the sectored flagship: declared sector areas, their overlap, an
    undeclared sector's envelope, a declared margin; and the two refusals."""
    #  Two declared areas that share ground: 20..30 x -10..10 is claimed twice.
    d = prepare(work, "plot_overlap", FLAGSHIP, lambda _t: FLAGSHIP_ITEMS
                + 'areas { DRYING { xMin -10 m; xMax 30 m; yMin -10 m; yMax 10 m; }\n'
                  '        FERMENTATION { xMin 20 m; xMax 40 m; yMin -10 m; yMax 10 m; } }\n')
    out, err, rc = solve(d)
    j = result_json(out) or {}
    lay = j.get("layout") or {}
    plot = lay.get("plot") or {}
    if rc != 0 or not plot:
        fail(f"(j) flagship, overlapping areas: exit {rc}, plot {'published' if plot else 'ABSENT'}")
    else:
        rect, area = plot_recomputed(lay, 0.0)
        if not close(area, plot["plotArea"]) or not (rect[0] <= -10 and rect[1] >= 40):
            fail(f"(j) flagship: the plot {plot['plotArea']} m2; recomputed {area} m2 on {rect}")
        # the union of 40x20 and 20x20 sharing 10x20: 800 + 400 - 200
        if not close(plot["declaredAreasUnion"], 1000.0) \
                or not close(plot["declaredAreasOverlap"], 200.0):
            fail(f"(j) flagship: areas union {plot['declaredAreasUnion']} m2 / overlap"
                 f" {plot['declaredAreasOverlap']} m2; recomputed 1000 / 200")
        secs = {x["sector"]: x for x in lay.get("plotSectors", [])}
        want = {"DRYING": ("declaredArea", 800.0), "FERMENTATION": ("declaredArea", 400.0)}
        for sec, (frm, a) in want.items():
            x = secs.get(sec)
            if not x or x["from"] != frm or not close(x["plotArea"], a):
                fail(f"(j) flagship: sector {sec} published {x}; expected {frm} {a} m2")
        msg = "the declared areas of sectors DRYING and FERMENTATION share 200 m2"
        if msg not in err or msg not in out.split("PLANT LAYOUT", 1)[-1]:
            fail("(j) flagship: two sector areas sharing ground were not announced on"
                 " stderr and the caveat block")
    #  One area declared, a margin: FERMENTATION's area is its footprints' envelope.
    d = prepare(work, "plot_envelope", FLAGSHIP, lambda _t: FLAGSHIP_ITEMS
                + 'areas { DRYING { xMin -10 m; xMax 10 m; yMin -10 m; yMax 10 m; } }\n'
                  'plot { margin 5 m; reason "fixture"; }\n')
    out, err, rc = solve(d)
    j = result_json(out) or {}
    lay = j.get("layout") or {}
    plot = lay.get("plot") or {}
    if rc != 0 or not plot:
        fail(f"(j) flagship, one area and a margin: exit {rc}")
    else:
        rect, area = plot_recomputed(lay, 5.0)
        if not close(area, plot["plotArea"]) or not plot["marginDeclared"]:
            fail(f"(j) flagship + margin: the plot {plot['plotArea']} m2; recomputed {area} m2")
        f = next((i for i in lay["items"] if i["id"] == "FERMENTATION.Fermentor"), None)
        secs = {x["sector"]: x for x in lay.get("plotSectors", [])}
        x = secs.get("FERMENTATION")
        if f is None or not x or x["from"] != "footprintEnvelope" \
                or not close(x["plotArea"], f["dx"] * f["dy"]) \
                or not close(x["footprintArea"], plan_area(f)):
            fail(f"(j) flagship: FERMENTATION published {x}; expected the envelope of its"
                 f" one footprint, {f['dx'] * f['dy'] if f else '?'} m2")
        if "no `plot { margin; reason; }` is declared" in out + err:
            fail("(j) flagship: a declared margin was announced as missing")
    #  Refusals, on the witness's own plot block.
    n = 0
    for label, edit, pat in (
            ("negative margin", sub("    margin  5 m;", "    margin  -1 m;"),
             r"plot: `margin -1 m;`.*cannot be negative"),
            ("no reason", lambda t: re.sub(r"\n    reason  \"author-set assumption for this"
                                           r" exercise: the fence and a 5 m[^\n]*", "", t),
             r"plot: `reason` is not declared")):
        d = prepare(work, "plot_refuse_" + re.sub(r"\W", "_", label), WITNESS, edit)
        out, err, rc = solve(d)
        if rc != 2 or not re.search(pat, out + err, re.S):
            fail(f"(j) refusal `{label}`: exit {rc}, not named")
        n += 1
    claims.append(f"the plot recomputed on {len(PLOT_SEEN)} plants ({', '.join(PLOT_SEEN)})"
                  " from the published footprints, areas and routes with the margin read"
                  " from each layoutDict, its footprint share, the absent margin announced"
                  " on three surfaces, every plot number pinned; on the flagship two"
                  f" overlapping sector areas (union and shared ground recomputed,"
                  f" announced) and an undeclared sector's footprint envelope; {n} refusals")


def drop_block(text, name):
    """The layoutDict `text` without its top-level `name { ... }` block."""
    m = re.search(r"^%s\s*\n\{" % re.escape(name), text, re.M)
    if not m:
        return text + "\n#error the probe found no `%s` block\n" % name
    depth, i = 0, m.end() - 1
    while i < len(text):
        depth += {"{": 1, "}": -1}.get(text[i], 0)
        i += 1
        if depth == 0:
            break
    return text[:m.start()] + text[i:]


def drop_block_edit(name):
    return lambda t: drop_block(t, name)


def drop_items(text, prefix):
    """The layoutDict `text` without every `item "<prefix>..."` entry: each
    entry is the brace block that opens on the line before its `item`."""
    out, i = [], 0
    lines = text.split("\n")
    while i < len(lines):
        if lines[i].strip() == "{" and i + 1 < len(lines) \
                and re.match(r'\s*item\s+"%s' % re.escape(prefix), lines[i + 1]):
            depth = 0
            while True:
                depth += lines[i].count("{") - lines[i].count("}")
                i += 1
                if depth == 0:
                    break
            continue
        out.append(lines[i])
        i += 1
    return "\n".join(out)


OVERRIDE = """
pipes
{
    rawLiquid
    {
        waypoints ( { x 56 m; y -6 m; z 10 m; } { x 59.5 m; y -6 m; z 10 m; } );
    }
}
"""


def arm_pipe_override(work):
    d = prepare(work, "pipe_override", WITNESS, lambda t: t + OVERRIDE)
    out, err, rc = solve(d)
    lay = ((result_json(out) or {}).get("layout")) or {}
    p = next((x for x in lay.get("pipes", []) if x["stream"] == "rawLiquid"), None)
    if rc != 0 or p is None:
        fail(f"(i) the waypoint override exited {rc} / published no rawLiquid pipe")
        return
    items = {i["id"]: i for i in lay["items"]}
    s, t = items["separator"], items["letdown"]
    want = [[56, -6, s["z"] + s["dz"]], [56, -6, 10], [59.5, -6, 10],
            [59.5, -6, t["z"] + t["dz"]]]
    if p["routedBy"] != "waypoints" or p["lane"] != -1 or len(p["route"]) != 4 \
            or any(abs(a - b) > TOL for q, w in zip(p["route"], want) for a, b in zip(q, w)):
        fail(f"(i) the declared waypoints were not honoured: {p['routedBy']} {p['route']}")
    L = (10 - want[0][2]) + 3.5 + (10 - want[3][2])
    if abs(p["length"] - L) > 1e-9:
        fail(f"(i) the override's length {p['length']} m, recomputed here {L} m")
    check_routes("override", lay, require_rack_route=False)
    nh3 = next((x for x in lay.get("pipes", []) if x["stream"] == "productNH3"), None)
    n = 1
    # THE UNROUTED MARK (DEV.md 4c C93): a stream the engine cannot route is
    # listed with the units at its ends and the plan point of the end it
    # DOES reach, which is where the 3D view marks the missing pipe -- the
    # letdown's nozzle, where the routed pipe started in the run above; the
    # stream with no reachable end carries no point.
    d = prepare(work, "pipe_unrouted_mark", WITNESS, lambda t: drop_items(t, "T201/vessel"))
    out, err, rc = solve(d)
    nr = {x["stream"]: x for x in
          (((result_json(out) or {}).get("layout")) or {}).get("notRouted", [])}
    a_ = nr.get("productNH3", {})
    b_ = nr.get("productStored", {})
    if rc != 0 or nh3 is None or a_.get("fromUnit") != "letdown" or a_.get("toUnit") != "T201" \
            or len(a_.get("anchor", [])) != 3 \
            or any(abs(u - v) > TOL for u, v in zip(a_["anchor"], nh3["route"][0])) \
            or b_.get("fromUnit") != "T201" or b_.get("toUnit") != "" or "anchor" in b_:
        fail(f"(i) the unrouted mark (exit {rc}): productNH3 {a_} against the routed pipe's"
             f" first point {nh3['route'][0] if nh3 else None}; productStored {b_}")
    else:
        n += 1
    refusals = {
        "diagonal waypoint": (lambda t: t + OVERRIDE.replace("{ x 59.5 m; y -6 m; z 10 m; }",
                                                             "{ x 59.5 m; y -2 m; z 10 m; }"),
                              [r"moves along more than one axis", r"ORTHOGONAL"]),
        "unknown stream": (lambda t: t + "\npipes { noSuchStream { waypoints ( { x 0 m;"
                           " y 0 m; z 9 m; } ); } }\n",
                           [r"pipes: `noSuchStream`", r"Accepted.*rawLiquid"]),
        #  `productNH3` runs to T201, whose bullets the witness places (C92);
        #  the copy takes them off its plot plan, so the unit is sized and
        #  NONE of its items is placed -- a stream with no routable end.
        "override on an unroutable stream": (
            lambda t: drop_items(t, "T201/vessel")
            + "\npipes { productNH3 { waypoints ( { x 70 m; y 0 m; z 9 m; } ); } }\n",
            [r"pipes `productNH3`: an override routes a pipe", r"T201"]),
        "partial pipeRack": (
            lambda t: drop_block(t, "pipeRack") + "\npipeRack { y 0 m; elevation 6 m; laneSpacing 0.6 m;"
                          " lanesPerTier 6; tierSpacing 1.5 m; xStart -5 m;"
                          " reason \"r\"; }\n",
            [r"pipeRack: `xEnd` is not declared"]),
        "a fractional lane count": (
            lambda t: drop_block(t, "pipeRack") + "\npipeRack { y 0 m; elevation 6 m; laneSpacing 0.6 m;"
                          " lanesPerTier 2.5; tierSpacing 1.5 m; xStart -5 m; xEnd 70 m;"
                          " reason \"r\"; }\n",
            [r"lanesPerTier 2\.5", r"whole number"]),
    }
    for label, (edit, pats) in refusals.items():
        d = prepare(work, "pipe_refuse_" + re.sub(r"\W", "_", label), WITNESS, edit)
        out, err, rc = solve(d)
        if rc != 2 or not all(re.search(pt, out + err, re.S) for pt in pats):
            fail(f"(i) {label}: exit {rc}, expected 2 naming {pats}:\n    "
                 + "\n    ".join(l for l in (out + err).splitlines() if "ERROR" in l)[:400])
        else:
            n += 1
    # the draft: a declared rack is carried; none declared leaves a template
    rack = ("\npipeRack { y -1 m; elevation 7 m; laneSpacing 0.5 m; lanesPerTier 4;"
            " tierSpacing 1.25 m; xStart -6 m; xEnd 70 m; reason \"the author's own\"; }\n")
    d = prepare(work, "pipe_draft", WITNESS,
                lambda t: drop_block(t, "pipeRack") + rack + OVERRIDE)
    out, err, rc = run([str(TOOL), "--draft", "--force", str(d)])
    text = (d / "system/layoutDict").read_text()
    lay = ((result_json(out) or {}).get("layout")) or {}
    if rc != 0 or "lanesPerTier 4;" not in text or "xEnd         70.00 m;" not in text \
            or "the author's own" not in text or "are NOT\n//  carried" not in text \
            or not lay.get("pipeRack", {}).get("declared"):
        fail(f"(i) the forced draft (exit {rc}) did not carry the declared rack, or did not"
             " say it dropped the waypoint overrides")
    else:
        n += 1
    claims.append(f"a declared waypoint route honoured and measured, an unrouted stream"
                  f" marked at the end it reaches, {n - 3} refusals"
                  " (a diagonal segment, an unknown stream, an override on an unroutable"
                  " stream, a partial rack, a fractional lane count), and the draft"
                  " carrying a declared rack")


# ------------------------------------------------------------ roads (C90) --
def paved_rects(lay):
    """Each road's paved rectangles, from the PUBLISHED centre line and width
    (x0, x1, y0, y1): every segment widened by half the width on every side."""
    out = []
    for r in lay.get("roads", []):
        h = r["width"] / 2
        c = r["centreline"]
        for a, b in zip(c, c[1:]):
            out.append((min(a[0], b[0]) - h, max(a[0], b[0]) + h,
                        min(a[1], b[1]) - h, max(a[1], b[1]) + h))
    return out


def union_area(rects):
    """The union of axis-aligned rectangles, exactly, on the grid of their
    own edges -- written here again, not imported, so the engine's rule has
    an independent home."""
    xs = sorted({v for r in rects for v in r[:2]})
    ys = sorted({v for r in rects for v in r[2:]})
    total = 0.0
    for x0, x1 in zip(xs, xs[1:]):
        for y0, y1 in zip(ys, ys[1:]):
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            if any(r[0] < cx < r[1] and r[2] < cy < r[3] for r in rects):
                total += (x1 - x0) * (y1 - y0)
    return total


def clear_item_rect(i, rect):
    """Clear plan distance from an item's footprint to a rectangle (0 if
    they touch or overlap): a vertical cylinder is a disc, any other a box."""
    x0, x1, y0, y1 = rect
    if i["shape"] == "cylinder" and i["orientation"] == "vertical":
        px = min(max(i["x"], x0), x1)
        py = min(max(i["y"], y0), y1)
        return max(0.0, hypot(i["x"] - px, i["y"] - py) - i["dx"] / 2)
    gx = max(0.0, max(x0 - (i["x"] + i["dx"] / 2), (i["x"] - i["dx"] / 2) - x1))
    gy = max(0.0, max(y0 - (i["y"] + i["dy"] / 2), (i["y"] - i["dy"] / 2) - y1))
    return hypot(gx, gy)


def layout_of(d, extra_ok=False):
    out, err, rc = solve(d)
    j = result_json(out) or {}
    return out, err, rc, j, (j.get("layout") or {})


def said_everywhere(msg, out, err, j):
    caveat = out.split("PLANT LAYOUT", 1)[-1] if "PLANT LAYOUT" in out else ""
    return ("[layout] " + msg in err and msg in caveat
            and any(a.get("category") == "layout" and a.get("message") == msg
                    for a in j.get("advisories") or []))


ROAD_REFUSALS = {
    "a road through a footprint": (
        sub("waypoints ( { x 28 m; y -31 m; } { x 28 m; y 16 m; } );",
            "waypoints ( { x 40 m; y -31 m; } { x 40 m; y 16 m; } );"),
        [r"road `rackCrossing` runs THROUGH `converter`", r"interpenetrate by"]),
    "a road under a rack below the headroom": (
        sub("    headroom 5 m;", "    headroom 7 m;"),
        [r"road `(east|rackCrossing)` passes UNDER the pipe rack", r"6 m above grade",
         r"7 m headroom"]),
    #  The route ends below the purge splitter's rack node, on the witness's
    #  DECLARED rack line, y = -3 m (C93; the stated default's -22/7 m
    #  before the tank farm).
    "a pipe below the headroom over a road": (
        lambda t: t + "\npipes { unreactedGas { waypoints ( { x 56 m; y -6 m; z 3 m; }"
                      " { x 56 m; y -31 m; z 3 m; } { x 37 m; y -31 m; z 3 m; }"
                      " { x 37 m; y -3 m; z 3 m; } ); } }\n",
        [r"pipe `unreactedGas` crosses road `main` 3 m above grade"]),
    "a diagonal road segment": (
        sub("waypoints ( { x -8 m; y -31 m; } { x -8 m; y 16 m; } );",
            "waypoints ( { x -8 m; y -31 m; } { x -6 m; y 16 m; } );"),
        [r"road `west`: the segment .* runs DIAGONALLY", r"add the corner"]),
    "a road declared twice": (
        sub('            road      "west";', '            road      "east";'),
        [r"road `east` is declared twice"]),
    "a waypoint with a z": (
        sub("{ x -8 m; y 16 m; } { x 68 m; y 16 m; }", "{ x -8 m; y 16 m; z 1 m; } { x 68 m; y 16 m; }"),
        [r"road `north` waypoint 1: a road lies at grade"]),
    "no access block": (
        lambda t: re.sub(r"\n    access\n    \{.*?\n    \}\n", "\n", t, count=1, flags=re.S),
        [r"roads: `access \{ distance <m>;", r"is not declared"]),
    "a source with no reason": (
        sub('        reason      "spares, catalyst drums', '        // reason      "spares, catalyst drums'),
        [r"nonProcess `warehouse`: declare both `source"]),
}


def arm_roads(work):
    d = prepare(work, "roads_witness", WITNESS)
    out, err, rc, j, lay = layout_of(d)
    net = lay.get("roadNetwork")
    if rc != 0 or not net:
        fail(f"(k) the witness exited {rc} / published no roadNetwork")
        return
    roads = lay.get("roads", [])
    if len(roads) != 7 or net["roads"] != 7:
        fail(f"(k) the witness declares seven roads; published {len(roads)} / {net['roads']}")
    total = 0.0
    for r in roads:
        c = r["centreline"]
        L = sum(abs(a[0] - b[0]) + abs(a[1] - b[1]) for a, b in zip(c, c[1:]))
        total += L
        if not close(L, r["length"]):
            fail(f"(k) road {r['road']}: published length {r['length']} m, its centre line's"
                 f" own {L} m")
        if not r["fromEntrance"]:
            fail(f"(k) road {r['road']}: published as not reached from the gate")
    if not close(total, net["length"]):
        fail(f"(k) the network's length {net['length']} m, the roads summed here {total} m")
    rects = paved_rects(lay)
    pav = union_area(rects)
    if not close(pav, net["pavedArea"]):
        fail(f"(k) paved area: the engine {net['pavedArea']} m2, the union recomputed here"
             f" {pav} m2 (the plain sum would be {sum((r[1]-r[0])*(r[3]-r[2]) for r in rects)})")
    if net["components"] != 1 or net["entrances"] != ["gate"]:
        fail(f"(k) the witness's network: {net['components']} component(s), entrances"
             f" {net['entrances']}; expected one, reached from `gate`")
    # the crossing under the rack, recomputed from the published rack band
    k = lay["pipeRack"]
    hw = k["lanesPerTier"] * k["laneSpacing"] / 2
    band = (k["xStart"], k["xEnd"], k["y"] - hw, k["y"] + hw)
    want = []
    for r in roads:
        h = r["width"] / 2
        c = r["centreline"]
        for a, b in zip(c, c[1:]):
            x0, x1 = max(min(a[0], b[0]) - h, band[0]), min(max(a[0], b[0]) + h, band[1])
            y0, y1 = max(min(a[1], b[1]) - h, band[2]), min(max(a[1], b[1]) + h, band[3])
            if x1 - x0 > 1e-6 and y1 - y0 > 1e-6:
                want.append((r["road"], x0, x1, y0, y1))
    got = [(c["road"], c["xMin"], c["xMax"], c["yMin"], c["yMax"])
           for c in lay.get("rackCrossings", [])]
    if len(want) != len(got) or any(w[0] != g[0] or not all(close(a, b) for a, b in zip(w[1:], g[1:]))
                                    for w, g in zip(want, got)):
        fail(f"(k) rack crossings: published {got}; recomputed {want}")
    for c in lay.get("rackCrossings", []):
        if c["clearance"] != k["elevation"] or c["clearance"] < net["headroom"]:
            fail(f"(k) crossing {c['road']}: clearance {c['clearance']} m, the rack's"
                 f" elevation {k['elevation']} m, headroom {net['headroom']} m")
    if sorted(w[0] for w in want) != ["east", "rackCrossing"]:
        fail(f"(k) the witness's roads cross the rack at {[w[0] for w in want]};"
             " the case declares two crossings, `rackCrossing` and `east`")
    # access: footprint edge to the nearest paved rectangle of a reached road
    items = {i["id"]: i for i in lay["items"]}
    access = {a["item"]: a for a in lay.get("access", [])}
    reached = [r for r in roads if r["fromEntrance"]]
    for iid, it in items.items():
        a = access.get(iid)
        best, road = None, None
        for r in reached:
            for rect in paved_rects({"roads": [r]}):
                dd = clear_item_rect(it, rect)
                if best is None or dd < best - 1e-9:
                    best, road = dd, r["road"]
        if a is None or a.get("road") != road or not close(a.get("distance", -1), best, 1e-8):
            fail(f"(k) access {iid}: published {a}; recomputed {road} at {best} m")
        elif best > net["accessDistance"] + 1e-9:
            fail(f"(k) access {iid}: {best} m, beyond the declared {net['accessDistance']} m,"
                 " on the witness")
    road_kinds = {"roadInZone", "roadDisconnected", "buildingNotReached", "noRoadAccess",
                  "noEntrance", "weighbridgeOffRoad", "gateOffRoad"}
    bad = [f["id"] for f in lay["findings"] if f["kind"] in road_kinds]
    if bad:
        fail(f"(k) the witness raises road findings {bad}; it must raise none")
    # the roads are inside the plot: without them it would be smaller
    margin = margin_of((WITNESS / "system" / "layoutDict").read_text())
    _, with_roads = plot_recomputed(lay, margin)
    _, without = plot_recomputed({**lay, "roads": []}, margin)
    if not (without < with_roads - 1.0) or not close(with_roads, lay["plot"]["plotArea"]):
        fail(f"(k) the plot {lay['plot']['plotArea']} m2: recomputed with the roads"
             f" {with_roads} m2, without them {without} m2 -- the roads must be in the envelope")
    # published <=> pinned
    gold = {}
    for line in (WITNESS / "expected").read_text().splitlines():
        f = line.split()
        if len(f) >= 5 and f[0] == "layout" and (f[1].startswith("road:") or f[1] == "roadNetwork"
                                                 or f[1].startswith("access:")):
            gold[(f[1], f[2])] = (f[3], f[4])
    published = {("roadNetwork", "length"): net["length"],
                 ("roadNetwork", "pavedArea"): net["pavedArea"]}
    for r in roads:
        published[("road:" + r["road"], "length")] = r["length"]
    for a in lay.get("access", []):
        if "distance" in a:
            published[("access:" + a["item"], "distance")] = a["distance"]
    for key, val in published.items():
        g = gold.get(key)
        if g is None:
            fail(f"(k) {key[0]} {key[1]} is published and pinned by no golden row")
        elif abs(float(g[0]) - val) > float(g[1]) * max(abs(val), 1e-30) + 1e-12:
            fail(f"(k) {key[0]} {key[1]} {val} against the golden {g[0]}")
    for key in gold:
        if key not in published:
            fail(f"(k) a golden row pins {key[0]} {key[1]}, which the run no longer publishes")
    n_ok = 0
    # ---- refusals ----------------------------------------------------------
    for label, (edit, pats) in ROAD_REFUSALS.items():
        d = prepare(work, "roads_refuse_" + re.sub(r"\W", "_", label), WITNESS, edit)
        out, err, rc = solve(d)
        if rc != 2 or not all(re.search(pt, out + err, re.S) for pt in pats):
            fail(f"(k) refusal `{label}`: exit {rc}, expected 2 naming {pats}:\n    "
                 + "\n    ".join(l for l in (out + err).splitlines() if "ERROR" in l)[:500])
        else:
            n_ok += 1
    # ---- announcements -----------------------------------------------------
    announced = 0
    #  a road in a closed zone: the makeup compressor's zone 2 grown to 12 m
    #  about (6, -8), so it reaches the west road (11 m), zone 2 closed
    d = prepare(work, "roads_zone", WITNESS, chain(
        sub("    noTraffic ( 1 );", "    noTraffic ( 1 2 );"),
        sub("zones   ( { zone 2; radius 7.5 m; height 6 m; } );",
            "zones   ( { zone 2; radius 12 m; height 6 m; } );")))
    out, err, rc, j, lay2 = layout_of(d)
    f = next((x for x in lay2.get("findings", []) if x["id"] == "roadInZone:west:makeupComp#zone2"), None)
    if rc != 0 or f is None:
        fail(f"(k) zone: exit {rc}, findings {[x['id'] for x in lay2.get('findings', [])]}")
    else:
        it = {i["id"]: i for i in lay2["items"]}["makeupComp"]
        r = next(x for x in lay2["roads"] if x["road"] == "west")
        mine = min(clear_item_rect({"shape": "cylinder", "orientation": "vertical",
                                    "x": it["x"], "y": it["y"], "dx": 0.0}, rect)
                   for rect in paved_rects({"roads": [r]}))
        if not close(f["value"], mine, 1e-8) or f["limit"] != 12:
            fail(f"(k) zone: engine {f['value']} / {f['limit']}, recomputed {mine} / 12")
        elif not said_everywhere(f["message"], out, err, j):
            fail("(k) the roadInZone announcement did not reach stderr, the caveat block"
                 " and the advisories")
        else:
            announced += 1
    #  a disconnected road, a building no road serves, a process item beyond
    #  the access distance
    d = prepare(work, "roads_reach", WITNESS, chain(
        sub("    access\n    {\n        distance 20 m;",
            "    access\n    {\n        distance 7 m;"),
        sub("        x           -30 m;\n        y           -20 m;",
            "        x           -30 m;\n        y           20 m;"),
        lambda t: t.replace("    network\n    (\n", "    network\n    (\n"
            '        { road "island"; width 4 m; reason "fixture";'
            ' waypoints ( { x 100 m; y 0 m; } { x 110 m; y 0 m; } ); }\n', 1)))
    out, err, rc, j, lay3 = layout_of(d)
    got = {x["id"]: x for x in lay3.get("findings", [])}
    want_ids = [next((x for x in got if x.startswith(w)), w)
                for w in ("roadDisconnected:island:", "buildingNotReached:warehouse:")]
    if rc != 0 or any(w not in got for w in want_ids):
        fail(f"(k) reach: exit {rc}, findings {sorted(got)}")
    else:
        for w in want_ids:
            if not said_everywhere(got[w]["message"], out, err, j):
                fail(f"(k) {w} did not reach all three surfaces")
        it3 = {i["id"]: i for i in lay3["items"]}
        reached3 = [r for r in lay3["roads"] if r["fromEntrance"]]
        for iid, it in it3.items():
            if it["nonProcess"]:
                continue
            best = min(clear_item_rect(it, rect) for r in reached3
                       for rect in paved_rects({"roads": [r]}))
            fid = next((x for x in got if x.startswith(f"noRoadAccess:{iid}:")), None)
            if (best > 7 + 1e-9) != (fid is not None):
                fail(f"(k) access 7 m: {iid} at {best} m, finding {fid}")
            elif fid and not close(got[fid]["value"], best, 1e-8):
                fail(f"(k) {fid}: engine {got[fid]['value']} m, recomputed {best} m")
        if not any(x.startswith("noRoadAccess:") for x in got):
            fail("(k) the 7 m access distance raised no noRoadAccess: the fixture no longer"
                 " reaches the case it is about")
        isl = next(r for r in lay3["roads"] if r["road"] == "island")
        if isl["fromEntrance"] or lay3["roadNetwork"]["components"] != 2:
            fail(f"(k) the island road: fromEntrance {isl['fromEntrance']}, components"
                 f" {lay3['roadNetwork']['components']}")
        announced += 1
    #  no gate
    d = prepare(work, "roads_nogate", WITNESS, sub('        kind        gate;', '        kind        guardhouse;'))
    out, err, rc, j, lay4 = layout_of(d)
    if rc != 0 or "noEntrance:roads:" not in {x["id"] for x in lay4.get("findings", [])} \
            or lay4.get("roadNetwork", {}).get("entrances") != []:
        fail(f"(k) no gate: exit {rc}, findings {[x['id'] for x in lay4.get('findings', [])]}")
    else:
        announced += 1
    #  a weighbridge: ON the main road (driven over, nothing raised), then off it
    wb = ('    { nonProcess "weighbridge"; kind weighbridge; x 40 m; y -31 m; z 0 m;'
          ' orientation alongX; footprint { length 18 m; width 3.5 m; height 0.4 m; }'
          ' source "fixture"; reason "fixture: road tankers weighed at the gate"; }\n')
    d = prepare(work, "roads_weighbridge_on", WITNESS, sub(ITEMS_OPEN, ITEMS_OPEN + wb))
    out, err, rc, j, lay5 = layout_of(d)
    acc = {a["item"]: a for a in lay5.get("access", [])}.get("weighbridge", {})
    if rc != 0 or not acc.get("onDeck") or acc.get("road") != "main" \
            or any(x["a"] == "weighbridge" for x in lay5.get("findings", [])):
        fail(f"(k) a weighbridge on the main road: exit {rc}, access {acc}, findings"
             f" {[x['id'] for x in lay5.get('findings', [])]}")
    else:
        announced += 1
    d = prepare(work, "roads_weighbridge_off", WITNESS,
                sub(ITEMS_OPEN, ITEMS_OPEN + wb.replace("y -31 m;", "y -40 m;")))
    out, err, rc, j, lay6 = layout_of(d)
    f6 = next((x for x in lay6.get("findings", []) if x["id"] == "weighbridgeOffRoad:weighbridge:"), None)
    if rc != 0 or f6 is None or not said_everywhere(f6["message"], out, err, j):
        fail(f"(k) a weighbridge off the road: exit {rc}, findings"
             f" {[x['id'] for x in lay6.get('findings', [])]}")
    else:
        announced += 1
    claims.append(f"the witness's seven roads: lengths, the network's length and its paved area"
                  f" ({net['pavedArea']:.2f} m2, the union recomputed here), the crossing under"
                  " the rack and every item's access distance recomputed, none beyond the"
                  " declared distance, the roads inside the plot, every road number pinned;"
                  f" {n_ok} road refusals; {announced} road announcement fixtures (a closed"
                  " zone, a disconnected road with an unserved building and items beyond"
                  " the access distance, no gate, a weighbridge on and off the road)")



# ------------------------------------------------------------ the fence (C93) --
def fence_declared(text):
    """The witness's `fence {}` block, read here as TEXT: its inset and, per
    crossing, (word, label, side, at) -- an independent home for what the
    engine must have read."""
    m = re.search(r"^fence\s*\n\{(.*?)^\}", text, re.S | re.M)
    if not m:
        return None
    body = m.group(1)
    im = re.search(r"\binset\s+([-0-9.eE+]+)\s*m\s*;", body)
    out = {"inset": float(im.group(1)) if im else None, "crossings": {}}
    for e in re.findall(r"\{([^{}]*)\}", body):
        s = re.search(r"\bstream\s+(\w+)\s*;", e)
        w = re.search(r'\b(from|to)\s+"([^"]*)"\s*;', e)
        side = re.search(r"\bside\s+(\w+)\s*;", e)
        at = re.search(r"\bat\s+([-0-9.eE+]+)\s*m\s*;", e)
        if s and w:
            out["crossings"][s.group(1)] = (w.group(1), w.group(2),
                                            side.group(1) if side else None,
                                            float(at.group(1)) if at else None)
    return out


def arm_fence(work):
    """(l) THE FENCE -- see the module docstring."""
    text = (WITNESS / "system" / "layoutDict").read_text()
    dec = fence_declared(text)
    if dec is None:
        fail("(l) the witness declares no `fence {}` -- this arm CANNOT RUN; it must not pass")
        return
    d = prepare(work, "fence_witness", WITNESS)
    out, err, rc, j, lay = layout_of(d)
    F, plot = lay.get("fence"), lay.get("plot")
    if rc != 0 or not F or not plot:
        fail(f"(l) the witness exited {rc} / published no fence or no plot")
        return
    # the line: the published plot moved `inset` inward, its length
    inset = dec["inset"] if dec["inset"] is not None else 0.0
    want = (plot["xMin"] + inset, plot["xMax"] - inset, plot["yMin"] + inset, plot["yMax"] - inset)
    got = (F["xMin"], F["xMax"], F["yMin"], F["yMax"])
    L = 2 * ((want[1] - want[0]) + (want[3] - want[2]))
    if not all(close(a, b) for a, b in zip(want, got)) or not close(F["length"], L) \
            or F["inset"] != inset or F["insetDeclared"] != (dec["inset"] is not None):
        fail(f"(l) the fence {got}, {F['length']} m (inset {F['inset']}); recomputed from"
             f" the published plot and the declared inset {want}, {L} m")
    x0, x1, y0, y1 = want

    def nearest(px, py):
        c = [(py - y0, "south"), (y1 - py, "north"), (px - x0, "west"), (x1 - px, "east")]
        best = c[0]
        for v in c[1:]:
            if v[0] < best[0] - 1e-6:
                best = v
        return best[1]

    def on_side(side, along):
        return {"south": (along, y0), "north": (along, y1),
                "west": (x0, along), "east": (x1, along)}[side]
    along_x = lambda side: side in ("south", "north")
    # the openings: one per gate, on its nearest side, centred on the end of
    # the road that serves it (the nearest paved rectangle), that road's width
    items = {i["id"]: i for i in lay["items"]}
    gates = [i for i in lay["items"] if i.get("nonProcess") and i["kind"] == "gate"]
    opens = {o["gate"]: o for o in lay.get("fenceOpenings", [])}
    if len(opens) != len(gates) or not gates:
        fail(f"(l) {len(gates)} gate(s) placed, {len(opens)} opening(s) published")
    for g in gates:
        o = opens.get(g["id"])
        side = nearest(g["x"], g["y"])
        best, road = None, None
        for r in lay.get("roads", []):
            for rect in paved_rects({"roads": [r]}):
                dd = max(0.0, clear_item_rect(g, rect))
                if best is None or dd < best - 1e-6:
                    best, road = dd, r
        along = g["x"] if along_x(side) else g["y"]
        width = g["dx"] if along_x(side) else g["dy"]
        if road:
            dmin = None
            for q in road["centreline"]:
                fx, fy = on_side(side, q[0] if along_x(side) else q[1])
                dd = hypot(q[0] - fx, q[1] - fy)
                if dmin is None or dd < dmin - 1e-6:
                    dmin, along = dd, (q[0] if along_x(side) else q[1])
            width = road["width"]
        ox, oy = on_side(side, along)
        if not o or o["side"] != side or not close(o["x"], ox) or not close(o["y"], oy) \
                or not close(o["width"], width) or o["road"] != (road["road"] if road else ""):
            fail(f"(l) the opening for gate {g['id']}: published {o}; recomputed {side} side"
                 f" at ({ox}, {oy}), {width} m, road {road['road'] if road else ''}")
    # no road meets the fence outside an opening (recomputed, both ways)
    for r in lay.get("roads", []):
        for (rx0, rx1, ry0, ry1) in paved_rects({"roads": [r]}):
            for side, hit, a0, a1 in (
                    ("south", ry0 < y0 - 1e-6 < ry1, max(rx0, x0), min(rx1, x1)),
                    ("north", ry0 < y1 + 1e-6 < ry1, max(rx0, x0), min(rx1, x1)),
                    ("west", rx0 < x0 - 1e-6 < rx1, max(ry0, y0), min(ry1, y1)),
                    ("east", rx0 < x1 + 1e-6 < rx1, max(ry0, y0), min(ry1, y1))):
                if not hit:
                    continue
                ok = any(o["side"] == side and
                         a0 >= (o["x"] if along_x(side) else o["y"]) - o["width"] / 2 - 1e-6 and
                         a1 <= (o["x"] if along_x(side) else o["y"]) + o["width"] / 2 + 1e-6
                         for o in opens.values())
                if not ok:
                    fail(f"(l) road {r['road']} meets the fence on its {side} side outside"
                         " every gate opening, and the witness ran")
    # every pipe with a battery-limit end crosses once, where the rule says,
    # with the declared label; nothing else crosses
    k = lay["pipeRack"]
    def lane(n):
        tier, pos = divmod(n, k["lanesPerTier"])
        return (k["y"] + (pos - 0.5 * (k["lanesPerTier"] - 1)) * k["laneSpacing"],
                k["elevation"] + tier * k["tierSpacing"])
    cross = {c["stream"]: c for c in lay.get("fenceCrossings", [])}
    boundary = [p for p in lay.get("pipes", [])
                if "batteryLimit" in (p["fromKind"], p["toKind"])]
    if set(cross) != {p["stream"] for p in boundary} or not boundary:
        fail(f"(l) crossings {sorted(cross)} against the pipes with a battery-limit end"
             f" {sorted(p['stream'] for p in boundary)}")
    for p in boundary:
        c = cross.get(p["stream"])
        if c is None:
            continue
        inlet = p["fromKind"] == "batteryLimit"
        w = dec["crossings"].get(p["stream"])
        ly, lz = lane(p["lane"])
        side = w[2] if w and w[2] else ("west" if inlet else "east")
        if along_x(side):
            pt = (w[3], y0 if side == "south" else y1, lz)
        else:
            pt = (x0 if side == "west" else x1, ly, lz)
        if c["direction"] != ("in" if inlet else "out") or c["side"] != side \
                or any(not close(c[q], v) for q, v in zip(("x", "y", "z"), pt)):
            fail(f"(l) crossing {p['stream']}: published {c['direction']} {c['side']}"
                 f" ({c['x']}, {c['y']}, {c['z']}); recomputed {side} {pt}")
        if not w or not c["labelDeclared"] or c["label"] != w[1] \
                or w[0] != ("from" if inlet else "to"):
            fail(f"(l) crossing {p['stream']}: label {c['label']!r} (declared"
                 f" {c['labelDeclared']}) against the layoutDict's {w}")
    if any(f["kind"] == "unlabelledCrossing" for f in lay["findings"]):
        fail("(l) the witness raises an unlabelledCrossing finding; every crossing is labelled")
    # published <=> pinned
    gold = {}
    for line in (WITNESS / "expected").read_text().splitlines():
        f = line.split()
        if len(f) >= 5 and f[0] == "layout" and (f[1] == "fence" or f[1].startswith("fence")):
            gold[(f[1], f[2])] = f[3]
    pub = [("fence", "length", F["length"])]
    for o in opens.values():
        pub += [("fenceOpening:" + o["gate"], q, o[q]) for q in ("x", "y", "side")]
    for c in cross.values():
        pub += [("fenceCrossing:" + c["stream"], q, c[q]) for q in ("x", "y", "z", "side")]
    for rid, key, v in pub:
        g = gold.get((rid, key))
        if g is None:
            fail(f"(l) {rid} {key} is published and pinned by no golden row")
        elif isinstance(v, str):
            if g != v:
                fail(f"(l) {rid} {key} `{v}` against the golden `{g}`")
        elif not close(float(g), v, 1e-4):
            fail(f"(l) {rid} {key} {v} against the golden {g}")
    pubkeys = {(r, q) for r, q, _ in pub}
    for key in gold:
        if key not in pubkeys:
            fail(f"(l) a golden row pins {key[0]} {key[1]}, which the run no longer publishes")

    # ---- an unlabelled crossing is ANNOUNCED by name, never refused ----------
    n_ok = 0
    d = prepare(work, "fence_unlabelled", WITNESS, lambda t: re.sub(
        r"\n\s*\{\s*stream makeup;[^{}]*\}", "", t, count=1))
    out, err, rc, j, lay2 = layout_of(d)
    f = next((x for x in lay2.get("findings", []) if x["id"] == "unlabelledCrossing:makeup:"), None)
    if rc != 0 or f is None or not said_everywhere(f["message"], out, err, j) \
            or "`makeup`" not in f["message"]:
        fail(f"(l) the makeup crossing's label removed: exit {rc}, findings"
             f" {[x['id'] for x in lay2.get('findings', [])]} -- it must be ANNOUNCED by"
             " name on all three surfaces and the run must finish")
    else:
        n_ok += 1
    # ---- the gate-closed announcement --------------------------------------
    d = prepare(work, "fence_nogate", WITNESS, sub("        kind        gate;",
                                                     "        kind        guardhouse;"))
    out, err, rc, j, lay3 = layout_of(d)
    if rc != 0 or "the fence declares no way in" not in err \
            or (lay3.get("fenceOpenings") or []) != []:
        fail(f"(l) no gate: exit {rc}; the closed fence must be announced and open nowhere")
    else:
        n_ok += 1
    # ---- refusals, each exit 2 and naming its defect -------------------------
    inset_line = re.search(r"\n    inset\s+[^;]*;", text).group(0)
    refusals = {
        #  6 m inward cuts the entrance road AT the gate's opening (allowed)
        #  and the east road on the north side, where no gate opens it.
        "a road through the fence at no gate": (
            sub(inset_line, "\n    inset   6 m;"),
            [r"road `east` meets the fence on its north side", r"no gate"]),
        "an item across the fence": (
            chain(drop_block_edit("roads"), sub(inset_line, "\n    inset   6 m;")),
            [r"fence: `\w+` stands across or outside the fence", r"reduce the inset"]),
        "a negative inset": (
            sub(inset_line, "\n    inset   -1 m;"), [r"`inset -1 m;`", r"INWARD"]),
        "a crossing on no boundary stream": (
            sub("    crossings\n    (\n", "    crossings\n    (\n"
                '        { stream mixed; to "nowhere"; }\n'),
            [r"fence crossing `mixed`: no pipe of this layout ends at a battery limit"]),
        "an outlet labelled `from`": (
            sub('{ stream letdownGas;    to ', '{ stream letdownGas;    from '),
            [r"`letdownGas` is a plant OUTLET", r"`to"]),
        "a north crossing with no `at`": (
            sub("side north;  at 37 m;", "side north;"),
            [r"fence crossing `purge`: a crossing on the north side names where"]),
        "an `at` off the side": (
            sub("side north;  at 37 m;", "side north;  at 900 m;"),
            [r"`at 900 m;` lies outside the north side"]),
        "a crossing declared twice": (
            sub("    crossings\n    (\n", "    crossings\n    (\n"
                '        { stream makeup; from "again"; }\n'),
            [r"fence crossing `makeup` is declared twice"]),
    }
    for label, (edit, pats) in refusals.items():
        d = prepare(work, "fence_refuse_" + re.sub(r"\W", "_", label), WITNESS, edit)
        o, e, r = solve(d)
        if r != 2 or not all(re.search(pt, o + e, re.S) for pt in pats):
            fail(f"(l) {label}: exit {r}, expected 2 naming {pats}:\n    "
                 + "\n    ".join(l for l in (o + e).splitlines() if "ERROR" in l)[:400])
        else:
            n_ok += 1
    claims.append(f"the witness's fence ({F['length']:.2f} m) recomputed from the published"
                  f" plot and the declared inset, {len(opens)} gate opening(s) recomputed"
                  " from the gate and its road, no road meeting it elsewhere,"
                  f" {len(cross)} pipe crossings recomputed (side, point, lane) each with"
                  " the declared origin or destination, every fence number pinned;"
                  f" {n_ok} fixtures (an unlabelled crossing announced by name, a gateless"
                  " fence announced, eight refusals)")


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
        arm_pipes(work)
        arm_pipe_override(work)
        arm_plot(work)
        arm_roads(work)
        arm_fence(work)
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
          " (the author's assumption -- no standard is shipped), a pipe's"
          " pressure drop and cost (none is computed), whether a route clashes"
          " with an item (not checked), structures, a road's turning radius or"
          " gradient, whether a declared headroom or access distance is sensible,"
          " the GUI drawing (its scene"
          " mapping is a vitest), and"
          " byte-identity of cases without a layout (measured once, not gated).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
