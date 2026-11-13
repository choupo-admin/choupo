#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: every pipe end lands on a PORT of its item, and the port is where the
convention says it is (2026-11-05, DEV.md 4c C229).

    bin/curate/check_pipe_ports.py
    bin/curate/check_pipe_ports.py --keep DIR    run, keep the runs in DIR, check

WHY THIS EXISTS.  Until C229 every pipe entered and left a placed item at its
plan centre, at its TOP (PlantLayout.cpp "Stylised: no nozzle schedule is
published by any sizer"), so a column's feed, reflux and bottoms met at one
point on its head and a unit realising several items was piped through the
first the case listed.  A student group drew by hand a 3D page whose pipe
connections were right, and the engine's layout, which is generated from any
case and checked, was not.  Now each pipe end lands on a PORT: a point on the
item's surface derived from the item's KIND, its SIZED dimensions and the
stream's ROLE in its unit (read off the unit's declared ports and, for a
drum, off the produced stream's own vapour fraction -- never off a stream's
name).  It is a drafting CONVENTION and is said so, once per run, on every
surface.  The case may move a port: `ports { <stream> { item X; side S;
[elevation z;] } }`.

The risks, and the arm for each:

  (a) A COLUMN, recomputed here from the published sheet (column09 with a
      generated layoutDict that places its shell, condenser, reboiler and
      reflux drum -- ONE unit, FOUR placed items): the feed lands on the
      SHELL at the height of its stage (z recomputed from nTrays,
      traySpacing, H and the case's feedStage with the free height split
      equally between head and sump), NOT at the top; the bottoms leave the
      shell at its base; the distillate leaves the REFLUX DRUM (the item the
      case placed for it), not the first item the case listed.
  (b) AN EXCHANGER AND A DRUM on the ammonia02 witness, recomputed from the
      published extents: the feed-effluent exchanger's tube inlet and outlet
      at the two ends of its axis, its shell inlet on top at +0.35 of the
      length and its shell outlet underneath at -0.35; the separator's inlet
      on its side at mid-height, its vapour on top, its liquid at the bottom.
  (c) NO TWO PIPES END AT THE SAME POINT of an item that has ports -- over
      every pipe of the witness and of the column.
  (d) A DECLARED PORT is honoured (a side and an elevation, `origin
      declared`), and two streams declared on the SAME port stand off each
      other by the published slot offset.
  (e) REFUSALS, each fired through the real reader (exit 2, naming the
      defect): a stream the run does not have, an item that is not placed, an
      item of a unit at neither end of the stream, an unknown side, an
      elevation on a top port, an elevation outside the item.
  (f) THE CONVENTION IS SAID: on stderr, in the result's `advisories`, and as
      `layout.portConvention`; and every pipe end on an item publishes its
      port with an `origin`.

BY-HAND SABOTAGES (each performed on the engine source, rebuilt, the gate
read, restored): see DEV.md 4c C229.

NOT COVERED: that a nozzle's convention is the right one for a real
vessel (it is a convention; no vendor schedule exists), a pipe's clash with
another item (check_plant_layout arm (k)), the GUI drawing of the nozzles
(tests/equipmentModel.test.ts).
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
from math import hypot
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BIN = ROOT / "choupoSolve"
WITNESS = ROOT / "tutorials/plant/ammonia02_full_plant"
COLUMN = ROOT / "tutorials/steady/distillation/column09_tray_hydraulics"
ENV = {"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"}
TOL = 1e-6

COLUMN_LAYOUT = """items
(
    { item "column09/shell";      x 20 m; y 0 m; z 0 m; orientation vertical; }
    { item "column09/condenser";  x 26 m; y 8 m; z 0 m; orientation alongX;
      footprint { length 6 m; width 1 m; height 1 m; } }
    { item "column09/refluxDrum"; x 36 m; y 8 m; z 0 m; orientation alongX; }
    { item "column09/reboiler";   x 14 m; y -8 m; z 0 m; orientation alongX;
      footprint { length 5 m; width 1 m; height 1 m; } }
);
"""

fails = []
claims = []


def fail(msg):
    fails.append(msg)


def prepare(work, name, src, layout_edit=None, layout_text=None):
    d = work / name
    if d.exists():
        shutil.rmtree(d)
    shutil.copytree(src, d, ignore=shutil.ignore_patterns(
        "reports", "converged", "design", "iterations"))
    lay = d / "system" / "layoutDict"
    if layout_text is not None:
        lay.write_text(layout_text)
    if layout_edit is not None:
        lay.write_text(layout_edit(lay.read_text()))
    return d


def solve(d):
    p = subprocess.run([str(BIN), str(d)], capture_output=True, text=True,
                       cwd=str(ROOT), timeout=1200, env=ENV)
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


def sheet_value(d, rel, key):
    t = (d / "design" / rel).read_text()
    blk = t[t.index("\nsizing"):]
    m = re.search(r"^\s+" + re.escape(key) + r"\s+(?:\[[^\]]*\]\s+)?([-0-9.eE+]+)[\s;]", blk, re.M)
    return float(m.group(1)) if m else None


def near(p, q):
    return p is not None and q is not None and all(abs(a - b) <= 1e-5 for a, b in zip(p, q))


def pipe_of(lay, stream):
    for p in lay["pipes"]:
        if p["stream"] == stream:
            return p
    return None


# --------------------------------------------------------------- (a) -----
def arm_column(work):
    d = prepare(work, "column", COLUMN, layout_text=COLUMN_LAYOUT)
    out, err, rc = solve(d)
    j = result_json(out)
    if rc != 0 or not j or "layout" not in j:
        fail(f"(a) the column probe exited {rc}:\n    " + (err.strip().splitlines() or [""])[-1][:300])
        return None
    lay = j["layout"]
    items = {i["id"]: i for i in lay["items"]}
    shell = items["column09/shell"]
    H = sheet_value(d, "column09/shell", "H")
    n = sheet_value(d, "column09/shell", "nTrays")
    sp = sheet_value(d, "column09/shell", "traySpacing")
    stage = 8   # the case's feedStage
    free = H - (n - 1) * sp
    z_expect = shell["z"] + H - 0.5 * free - (stage - 1) * sp
    feed = pipe_of(lay, "feed")
    tp = (feed or {}).get("toPort")
    if not tp or tp["item"] != "column09/shell" or tp["port"] != "feed":
        fail(f"(a) the column feed does not land on the shell's `feed` port: {tp}")
    else:
        if abs(tp["point"][2] - z_expect) > 1e-5:
            fail(f"(a) feed port z = {tp['point'][2]:.6f} m, recomputed {z_expect:.6f} m"
                 f" (stage {stage}, nTrays {n:g}, spacing {sp:g}, H {H:g})")
        top = shell["z"] + shell["dz"]
        if tp["point"][2] > top - 1.0 or tp["point"][2] < shell["z"] + 1.0:
            fail(f"(a) the column feed is at the head or the sump (z {tp['point'][2]:.3f}"
                 f" of a {top:.3f} m shell) -- it must stand at its stage's height")
        r = shell["dx"] / 2
        if abs(abs(tp["point"][0] - shell["x"]) - r) > 1e-5 or abs(tp["point"][1] - shell["y"]) > 1e-5:
            fail(f"(a) the feed nozzle is not on the shell's surface: {tp['point']}")
    bt = pipe_of(lay, "bottoms")
    fp = (bt or {}).get("fromPort")
    if not fp or fp["item"] != "column09/shell" or fp["port"] != "bottoms" \
            or not near(fp["point"], [shell["x"], shell["y"], shell["z"]]):
        fail(f"(a) the bottoms do not leave the shell at its base centre: {fp}")
    ds = pipe_of(lay, "distillate")
    fp = (ds or {}).get("fromPort")
    drum = items["column09/refluxDrum"]
    #  the drum lies along x: its bottom nozzle stands at +0.3 of the length
    if not fp or fp["item"] != "column09/refluxDrum" or fp["port"] != "distillate" \
            or not near(fp["point"], [drum["x"] + 0.3 * drum["dx"], drum["y"], drum["z"]]):
        fail(f"(a) the distillate does not leave the reflux drum at its bottom: {fp}")
    claims.append(f"a column's feed on stage {stage} at z = {z_expect:.3f} m of {H:g} m"
                  " (recomputed from the sheet), its bottoms at the base, its distillate"
                  " out of the reflux drum -- one unit, four placed items")
    return lay


# --------------------------------------------------------------- (b) -----
def hx_expect(i, port):
    """The exchanger's port point, recomputed from its published extents."""
    zc = i["z"] + 0.5 * i["dz"]
    x, y = i["x"], i["y"]
    if i["orientation"] == "alongX":
        L, ax = i["dx"], (lambda a: (x + a, y))
        minus, plus = (x - i["dx"] / 2, y, zc), (x + i["dx"] / 2, y, zc)
    elif i["orientation"] == "alongY":
        L, ax = i["dy"], (lambda a: (x, y + a))
        minus, plus = (x, y - i["dy"] / 2, zc), (x, y + i["dy"] / 2, zc)
    else:
        return None
    if port == "tubeInlet":
        return list(minus)
    if port == "tubeOutlet":
        return list(plus)
    if port == "shellInlet":
        p = ax(0.35 * L)
        return [p[0], p[1], i["z"] + i["dz"]]
    if port == "shellOutlet":
        p = ax(-0.35 * L)
        return [p[0], p[1], i["z"]]
    return None


def arm_witness(work):
    d = prepare(work, "witness", WITNESS)
    out, err, rc = solve(d)
    j = result_json(out)
    if rc != 0 or not j or "layout" not in j:
        fail(f"(b) the witness exited {rc}:\n    " + (err.strip().splitlines() or [""])[-1][:300])
        return None, "", ""
    lay = j["layout"]
    items = {i["id"]: i for i in lay["items"]}
    fehe = items["FEHE"]
    want = {("hotEffluent", "toPort"): "shellInlet", ("cooledEffluent", "fromPort"): "shellOutlet",
            ("mixed", "toPort"): "tubeInlet", ("preheatedFeed", "fromPort"): "tubeOutlet"}
    for (stream, end), port in want.items():
        pp = (pipe_of(lay, stream) or {}).get(end)
        exp = hx_expect(fehe, port)
        if not pp or pp["item"] != "FEHE" or pp["port"] != port:
            fail(f"(b) {stream}: expected the FEHE `{port}` port, got {pp}")
        elif exp is None or not near(pp["point"], exp):
            fail(f"(b) {stream}: FEHE {port} at {pp['point']}, recomputed {exp}")
    sep = items["separator"]
    zc = sep["z"] + 0.5 * sep["dz"]
    pin = (pipe_of(lay, "chilledEffluent") or {}).get("toPort")
    if not pin or pin["item"] != "separator" or pin["port"] != "inlet" \
            or abs(abs(pin["point"][0] - sep["x"]) - sep["dx"] / 2) > 1e-5 \
            or abs(pin["point"][1] - sep["y"]) > 1e-5 or abs(pin["point"][2] - zc) > 1e-5:
        fail(f"(b) the separator inlet is not on its side at mid-height: {pin}")
    pv = (pipe_of(lay, "unreactedGas") or {}).get("fromPort")
    if not pv or pv["port"] != "vapour" \
            or not near(pv["point"], [sep["x"], sep["y"], sep["z"] + sep["dz"]]):
        fail(f"(b) the separator's vapour is not at the top centre: {pv}")
    pl = (pipe_of(lay, "rawLiquid") or {}).get("fromPort")
    if not pl or pl["port"] != "liquid" \
            or not near(pl["point"], [sep["x"], sep["y"], sep["z"]]):
        fail(f"(b) the separator's liquid is not at the bottom centre: {pl}")
    claims.append("the feed-effluent exchanger's four nozzles (tube ends, shell over/under at"
                  " +/-0.35 L) and the separator's side inlet, top vapour and bottom liquid,"
                  " recomputed from the published extents")
    return lay, out, err


# --------------------------------------------------------------- (g) -----
def arm_tank_ends(lay):
    """A HORIZONTAL TANK's nozzles take the end of the axis nearer the other end
    of their own pipe (C229 review: with the fixed end, ammonia02's `productStored`
    left the bullet's far end, climbed 42 m to the rack lane and came back, 143.6 m
    for a 33 m run).  The bullet T201/vessel1 lies along y at y = -54 m; its outlet
    runs to a south fence crossing (declared `side south`), its fill comes from
    the let-down at y = -6 m: the outlet must sit on the SOUTH end (-0.3 of the
    axis), the fill on the NORTH end (+0.3), and the product pipe must not visit
    the rack lane (it stands beyond it, on the fence's side) -- it is a direct
    run, here under 60 m.
    SINCE C268 (2026-11-09) the eight bullets are piped by HEADERS: the outlet
    and the fill of vessel1 are the ports of its two BRANCHES
    (`pipe:productStored@T201/vessel1`, `pipe:productNH3@T201/vessel1`), and
    `productStored` begins in a main along the row (its first segment); the
    direct run is what follows the main, and is held under 60 m."""
    if not lay:
        return
    by_id = {p.get("id", "pipe:" + p["stream"]): p for p in lay["pipes"]}
    it = next((i for i in lay["items"] if i["id"] == "T201/vessel1"), None)
    out = by_id.get("pipe:productStored") or {}
    bout = by_id.get("pipe:productStored@T201/vessel1") or {}
    bfil = by_id.get("pipe:productNH3@T201/vessel1") or {}
    if not it or it["orientation"] != "alongY" or not out or not bout or not bfil:
        fail("(g) the witness's T201/vessel1 (a bullet along y), its outlet branch, its fill"
             " branch or the productStored main is missing")
        return
    po = (bout.get("fromPort") or {}).get("point")
    pf = (bfil.get("toPort") or {}).get("point")
    if not po or abs(po[1] - (it["y"] - 0.3 * it["dy"])) > 1e-5:
        fail(f"(g) the bullet's outlet must stand on its SOUTH end (the fence is south), at"
             f" y = {it['y'] - 0.3 * it['dy']:.4f}; published {po}")
    if not pf or abs(pf[1] - (it["y"] + 0.3 * it["dy"])) > 1e-5:
        fail(f"(g) the bullet's fill must stand on its NORTH end (the let-down is north), at"
             f" y = {it['y'] + 0.3 * it['dy']:.4f}; published {pf}")
    lane = lay["pipeRack"]["y"]
    r = out["route"]
    main = sum(abs(r[0][k] - r[1][k]) for k in range(3))   # the main along the row
    beyond = out["length"] - main
    if max(q[1] for q in r) >= lane or abs(r[0][1] - r[1][1]) > 1e-9 or beyond > 60.0:
        fail(f"(g) productStored must begin in its main along the row and run straight to the"
             f" south fence, not by way of the rack lane (y = {lane}): {beyond:.2f} m beyond"
             f" the main (the fixed-end rule gave 143.58 m), highest y of its route"
             f" {max(q[1] for q in r):.2f}")
    claims.append(f"a horizontal tank's outlet and fill each take the axis end nearer their pipe's"
                  f" other end (the bullet's outlet south, fill north, on its header branches) and"
                  f" the product pipe runs {beyond:.1f} m straight from its {main:.0f} m main to"
                  f" the fence, not 143.6 m by way of the rack")


# --------------------------------------------------------------- (c) -----
def arm_unique(lay, tag):
    seen = {}
    for p in lay["pipes"]:
        for end in ("fromPort", "toPort"):
            pp = p.get(end)
            if not pp or pp["origin"] == "default":
                continue
            key = (pp["item"],) + tuple(round(v, 6) for v in pp["point"])
            if key in seen:
                fail(f"(c) {tag}: pipes `{seen[key]}` and `{p['stream']}` both end at"
                     f" {pp['point']} on `{pp['item']}`")
            seen[key] = p["stream"]
    return len(seen)


# --------------------------------------------------------------- (d) -----
def arm_declared(work):
    def edit(t):
        return t + """
ports
{
    rawLiquid       { item letdown;   side north;  elevation 1.0 m; }
    unreactedGas    { item separator; side west;   elevation 2.0 m; }
    chilledEffluent { item separator; side west;   elevation 2.0 m; }
}
"""
    d = prepare(work, "declared", WITNESS, layout_edit=edit)
    out, err, rc = solve(d)
    j = result_json(out)
    if rc != 0 or not j:
        fail(f"(d) the declared-ports probe exited {rc}:\n    " + (err.strip().splitlines() or [""])[-1][:300])
        return
    lay = j["layout"]
    items = {i["id"]: i for i in lay["items"]}
    ld = items["letdown"]
    tp = (pipe_of(lay, "rawLiquid") or {}).get("toPort")
    if not tp or tp["origin"] != "declared" or tp["item"] != "letdown" \
            or not near(tp["point"], [ld["x"], ld["y"] + ld["dy"] / 2, 1.0]):
        fail(f"(d) a declared `side north; elevation 1 m;` is not honoured: {tp}")
    sp = items["separator"]
    a = (pipe_of(lay, "unreactedGas") or {}).get("fromPort")
    b = (pipe_of(lay, "chilledEffluent") or {}).get("toPort")
    if not a or not b or a["origin"] != "declared" or b["origin"] != "declared":
        fail(f"(d) two declared ports were not read: {a} {b}")
        return
    off = 0.2 * min(sp["dx"], sp["dy"])
    if abs(a["point"][1] - sp["y"]) > 1e-5 and abs(b["point"][1] - sp["y"]) > 1e-5:
        fail("(d) neither of two pipes on one declared port stands on its centre")
    if abs(abs(a["point"][1] - b["point"][1]) - off) > 1e-5:
        fail(f"(d) two pipes on ONE port stand {abs(a['point'][1] - b['point'][1]):.6f} m"
             f" apart, the slot offset is {off:.6f} m")
    claims.append("a declared side and elevation honoured (`origin declared`); two streams on"
                  " one declared port stand off each other by the published slot offset")


# --------------------------------------------------------------- (e) -----
REFUSALS = [
    ("an unknown stream",
     "ports { noSuchStream { item letdown; side top; } }", "noSuchStream"),
    ("an item that is not placed",
     "ports { rawLiquid { item noSuchItem; side top; } }", "noSuchItem"),
    ("an item of a unit at neither end of the stream",
     "ports { rawLiquid { item FEHE; side top; } }", "either end"),
    ("an unknown side",
     "ports { rawLiquid { item letdown; side upstairs; } }", "upstairs"),
    ("an elevation on a top port",
     "ports { rawLiquid { item letdown; side top; elevation 1 m; } }", "elevation"),
    ("an elevation outside the item",
     "ports { rawLiquid { item letdown; side east; elevation 500 m; } }", "outside"),
]


def arm_refusals(work):
    n = 0
    for k, (what, block, needle) in enumerate(REFUSALS):
        d = prepare(work, f"refuse{k}", WITNESS, layout_edit=lambda t, b=block: t + "\n" + b + "\n")
        out, err, rc = solve(d)
        msg = err + out
        if rc != 2:
            fail(f"(e) {what}: exit {rc}, expected 2")
        elif needle not in msg or "ports" not in msg:
            fail(f"(e) {what}: refused, but the message does not name `{needle}` and `ports`")
        else:
            n += 1
    claims.append(f"{n} port refusals fired through the real reader and named")


# --------------------------------------------------------------- (f) -----
def arm_said(lay, out, err):
    if not lay:
        return
    if "land on PORTS" not in err:
        fail("(f) the port convention is not said on stderr")
    j = result_json(out)
    adv = json.dumps((j or {}).get("advisories", ""))
    if "land on PORTS" not in adv:
        fail("(f) the port convention is not in the result's advisories")
    if "NOT a vendor" not in (lay.get("portConvention") or ""):
        fail("(f) layout.portConvention is missing or does not say it is not a vendor schedule")
    n = 0
    for p in lay["pipes"]:
        for end, kind in (("fromPort", "fromKind"), ("toPort", "toKind")):
            if p[kind] == "item":
                pp = p.get(end)
                if not pp or pp.get("origin") not in ("convention", "declared", "default") \
                        or len(pp.get("point", [])) != 3:
                    fail(f"(f) pipe `{p['stream']}`: its item end publishes no port: {pp}")
                n += 1
    claims.append(f"the convention said on stderr, in the advisories and in layout.portConvention;"
                  f" all {n} item ends of the witness publish a port")


def main():
    argv = sys.argv[1:]
    keep = Path(argv[argv.index("--keep") + 1]).resolve() if "--keep" in argv else None
    if not BIN.exists():
        print("check_pipe_ports: FAIL -- no choupoSolve build; run `make all`")
        return 1
    work = keep or Path(tempfile.mkdtemp(prefix="pipeports."))
    work.mkdir(parents=True, exist_ok=True)
    try:
        col = arm_column(work)
        lay, out, err = arm_witness(work)
        total = 0
        for tag, l in (("column", col), ("witness", lay)):
            if l:
                total += arm_unique(l, tag)
        if total:
            claims.append(f"no two of {total} port ends coincide on an item")
        arm_tank_ends(lay)
        arm_declared(work)
        arm_refusals(work)
        arm_said(lay, out, err)
    finally:
        if not keep:
            shutil.rmtree(work, ignore_errors=True)
    if fails:
        print("check_pipe_ports: FAIL")
        for f in fails:
            print("  - " + f)
        return 1
    print("check_pipe_ports: OK -- " + "; ".join(claims)
          + ".  NOT COVERED: that a nozzle position is right for a real vessel (it is a"
          " convention, no vendor schedule exists), a unit type with no port rule (it keeps"
          " the top centre and the run says which), a pipe's clash with another item"
          " (check_plant_layout), the GUI drawing of the nozzles (a vitest).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
