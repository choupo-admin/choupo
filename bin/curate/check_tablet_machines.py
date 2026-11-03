#!/usr/bin/env python3
"""A machine fits the batch; the building's air and water follow from the
building (DEV.md 4c C195).

WHAT THIS GATE IS FOR.  Two things were added with NO new physics, and a
golden cannot see either of them wrong (a golden pins what a run PRINTS):

  * `type ratedMachine` (src/postProcessing/sizing/RatedMachineSize.cpp): a
    solid-dose machine carried as a mixer/splitter is checked against a
    vendor rating the CASE declares and the batch plan's lot.  A utilisation
    that divided the wrong mass, or by the wrong time, or forgot the
    installed count, would be a stable wrong number.
  * the `cleanUtilities` pass (src/postProcessing/CleanUtilitiesPass.cpp):
    the HVAC and purified-water items of the GMP building the layout checked.

WHAT IS CHECKED, every number RECOMPUTED HERE from the case dictionaries and
the run's own stream masses (never read back from the item it is compared to):

  (a) MACHINES.  For every `ratedMachine` entry of apalutamide01_tablets and
      donepezil01_tablets: the lot hours (declared lot mass over the lot
      stream's rate), the mass the unit's inlets carry, the stage's declared
      operating time or bulk density, and the capacity from the declared
      rating and installed count give a utilisation that agrees with the
      published one to 1e-6; the machines needed, and that no ratedMachine
      item carries its own cost (the quote does).
  (b) HVAC.  The rooms are re-read from system/layoutDict by an independent
      reader (floor height, a room's own `height`, the plan box, the grade);
      per grade and in total the room volume, the supply flow (the declared
      air changes per hour), the fan power (flow x declared rise / efficiency)
      and the sensible winter heating and summer cooling of the fresh-air
      share agree with the published items to 1e-6; `unserved` rooms are
      left out.
  (b2) HVAC COST (DEV.md 4c C210, E2).  Every `hvacGrade` quote of the case
      is recomputed -- the declared `valuePerSupplyAir` x the supply air this
      gate recomputed from the rooms (never read back from the item), basis
      installed, the costing year's own money -- and must equal the bare-module
      and total-module cost the costing published for `hvac/grade<G>` (C_TM =
      1.18 C_BM) and the `hvac` KPIs (per grade and the total); a grade present
      in the building with NO quote must not exist (the total would read
      INCOMPLETE, arm (d)).
  (c) WATER.  The demand per lot (declared streams over the declared density
      plus the declared volumes), the year, the PEAK from the plan's own
      Gantt rows with the declared draw windows, the generator rating
      (peak x (1 + margin)) and the storage volume (hold x peak) agree.
  (d) NEUTRALITY.  The capital total is not INCOMPLETE; the layout summary
      still reads unplaced 0 / internal 0 (the machines are neither left out
      nor internal: `notPlacedBecause`); the quotes beside the sized machines
      are still priced (the item and a quote coexist).
  (e) REFUSALS fired on copies of a shipped case, each by NAME: a missing
      rating key, a rating without its source, a machine that does not fit
      (utilisation above 1, naming the machines that would carry it), the
      same machine with a declared `installed` count (legal, and the
      utilisation is the base one divided by the count), an unknown `kind`, a
      unit in no stage of the plan, an HVAC grade with no declared rate, an
      `unserved` name that is no room, and a water use in no stage; the supply
      air of a grade with NO `hvacGrade` quote (refuses by name, the total
      INCOMPLETE), an `hvacGrade` quote for a grade the building does not
      have, and one that declares `value` instead of `valuePerSupplyAir`.

NOT CHECKED: the vendor numbers (they are the case's, declared assumptions),
whether the air-change rates are right for a product (a risk assessment), and
the physics of any machine (there is none).

BY-HAND SABOTAGES (2026-11-02), each on the named source, rebuilt with
`make -j1 all`, the gate run, the file restored and rebuilt: see the commit
message of the slice for the outputs.
  S1  RatedMachineSize.cpp: capacity = perMachine (drop `installed *`)
  S2  RatedMachineSize.cpp: load of a rate kind without the lot-hours scale
  S3  CleanUtilitiesPass.cpp: volume = area (drop the height)
  S4  CleanUtilitiesPass.cpp: fan power without the efficiency
  S5  CleanUtilitiesPass.cpp: peak = the largest single draw (not the sum)
  S6  PlantLayout.cpp: drop the `notPlacedBecause` skip in the unplaced loop
  S7  DeclaredQuote.cpp (C210 E2): the hvacGrade value = valuePerSupplyAir
      alone (drop `* hvacQ`, the supply air)
Exit 1 listing failures."""
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BIN = ROOT / "choupoSolve"
_CACHE = os.environ.get("CHOUPO_SUITE_OUTPUTS")
ENV = dict(os.environ, CHOUPO_HOME=str(ROOT))
CASES = [ROOT / "tutorials" / "batch" / "plant" / n
         for n in ("apalutamide01_tablets", "donepezil01_tablets")]
REL = 1e-6

fails = []
counts = {"machines": 0, "rooms": 0, "grades": 0, "uses": 0, "refusals": 0,
          "hvacCosts": 0}


def fail(msg):
    fails.append(msg)


def close(a, b, rel=REL):
    return abs(a - b) <= rel * max(abs(a), abs(b), 1e-12) + 1e-12


def need(what, got, want, rel=REL):
    if not close(got, want, rel):
        fail("%s: published %.10g vs recomputed %.10g" % (what, got, want))


# ------------------------------------------------------ a small dict reader --
def tokens(text):
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)
    out = []
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c.isspace():
            i += 1
        elif text.startswith("//", i):
            j = text.find("\n", i)
            i = n if j < 0 else j
        elif c == '"':
            j = i + 1
            while j < n and text[j] != '"':
                j += 2 if text[j] == "\\" else 1
            out.append(("str", text[i + 1:j]))
            i = j + 1
        elif c in "{}();":
            out.append(("p", c))
            i += 1
        else:
            j = i
            while j < n and not text[j].isspace() and text[j] not in '{}();"':
                j += 1
            out.append(("w", text[i:j]))
            i = j
    return out


def parse_block(tk, i):
    d = {}
    while i < len(tk) and tk[i] != ("p", "}"):
        key = tk[i][1]
        i += 1
        if i >= len(tk):
            break
        if tk[i] == ("p", "{"):
            d[key], i = parse_block(tk, i + 1)
            i += 1
        elif tk[i] == ("p", "("):
            d[key], i = parse_list(tk, i + 1)
            i += 1
            if i < len(tk) and tk[i] == ("p", ";"):
                i += 1
        else:
            vals = []
            while tk[i] != ("p", ";"):
                vals.append(tk[i][1])
                i += 1
            d[key] = vals
            i += 1
    return d, i


def parse_list(tk, i):
    out = []
    while tk[i] != ("p", ")"):
        if tk[i] == ("p", "{"):
            b, i = parse_block(tk, i + 1)
            out.append(b)
            i += 1
        else:
            out.append(tk[i][1])
            i += 1
    return out, i


def read_dict(path):
    d, _ = parse_block(tokens(Path(path).read_text()), 0)
    return d


UNITS = {  # to the gate's working units: h, kg, m3, m, kg/m3, kg/h, Pa, K
    "h": 1.0, "min": 1 / 60.0, "s": 1 / 3600.0,
    "kg": 1.0, "g": 1e-3, "m3": 1.0, "L": 1e-3, "m": 1.0,
    "kg/m3": 1.0, "kg/h": 1.0, "Pa": 1.0, "J/kg/K": 1.0,
}


def val(d, key):
    v = d[key]
    x = float(v[0])
    if len(v) > 1:
        if v[1] == "degC":
            return x + 273.15
        return x * UNITS[v[1]]
    return x


# ------------------------------------------------------------ running ---
def run_case(case):
    rel_ = case.relative_to(ROOT).as_posix()
    if _CACHE:
        f = Path(_CACHE) / (rel_.replace("/", "__") + ".out")
        try:
            return f.read_text(errors="replace"), ""
        except OSError:
            pass
    p = subprocess.run([str(BIN), str(case)], capture_output=True, text=True,
                       env=ENV, cwd=str(case))
    return p.stdout, p.stderr


def result_json(out):
    m = re.search(r"<<<Choupo:result-begin>>>\s*\n(.*?)\n<<<Choupo:result-end>>>",
                  out, re.S)
    if not m:
        return None
    return json.loads(m.group(1))


def fixture(td, case, name, edit):
    d = Path(td) / name
    shutil.copytree(case, d, ignore=shutil.ignore_patterns(
        "reports", "converged", "design", "iterations", "expected"))
    for f, fn in edit.items():
        p = d / "system" / f
        p.write_text(fn(p.read_text()))
    r = subprocess.run([str(BIN), "."], capture_output=True, text=True,
                       env=ENV, cwd=str(d))
    return r.stdout, r.stderr, r.returncode


def sub(text, old, new):
    if old not in text:
        raise RuntimeError("fixture anchor not found: %r" % old)
    return text.replace(old, new, 1)


# --------------------------------------------------------------- arms ---
def stream_rates(js):
    """kg/h by stream name from the result JSON."""
    return {k: v["F_mass"] * 3600.0 for k, v in js["streams"].items()
            if isinstance(v, dict) and "F_mass" in v}


def unit_ins(fs):
    ins = {}
    for u in fs["units"]:
        names = u.get("inputs") or u.get("in") or []
        ins[u["name"][0]] = list(names)
    return ins


def arm_case(case):
    out, _err = run_case(case)
    js = result_json(out)
    if js is None:
        fail("%s: no result JSON" % case.name)
        return None
    post = read_dict(case / "system" / "postDict")
    fs = read_dict(case / "system" / "flowsheetDict")
    lay = read_dict(case / "system" / "layoutDict")
    rates = stream_rates(js)
    ins = unit_ins(fs)
    plan = post["batchPlan"]
    lot_mass = val(plan["lot"], "mass")
    lot_hours = lot_mass / rates[plan["lot"]["stream"][0]]
    stages = {}
    for s in plan["stages"]:
        for u in s["units"]:
            stages[u] = s
    items = {}
    for line in out.splitlines():
        m = re.search(r'"item": "([^"]*)"', line)
        mv = re.search(r'"values": \{([^}]*)\}', line)
        if m and mv and '"unit":' in line:
            items[m.group(1)] = {k: float(x) for k, x in re.findall(
                r'"([A-Za-z_][A-Za-z0-9_]*)": *(-?[0-9][0-9.eE+-]*)', mv.group(1))}

    # (a) machines ------------------------------------------------------
    for e in post["sizing"]["units"]:
        if e["type"] != ["ratedMachine"]:
            continue
        u = e["unitName"][0]
        dr = e["designRules"]
        kind = dr["kind"][0]
        r = dr["rating"]
        st = stages[u]
        n = int(float(dr["installed"]["count"][0])) if "installed" in dr else 1
        it = items.get(u)
        if it is None:
            fail("%s %s: no ratedMachine item published" % (case.name, u))
            continue
        if kind == "batchVolume":
            m_lot = rates[st["holds"][0]] * lot_hours
            load = m_lot / val(st, "bulkDensity")
            cap = n * val(r, "nominalVolume") * float(r["maxFill"][0])
        else:
            m_unit = sum(rates[s] for s in ins[u]) * lot_hours
            t_op = val(st, "operatingTime")
            if kind == "massRate":
                load = m_unit / t_op
                cap = n * val(r, "capacity")
            elif kind == "tabletPress":
                load = m_unit / val(r, "itemMass") / t_op
                cap = (n * float(r["stations"][0]) * float(r["turretSpeed"][0]) * 60.0
                       * float(r["compressionsPerRevolution"][0]))
            else:
                load = m_unit / val(r, "itemMass") / t_op / float(r["itemsPerPack"][0])
                cap = n * float(r["packsPerMinute"][0]) * 60.0
        need("%s %s utilisation" % (case.name, u), it["utilisation"], load / cap)
        per = cap / n
        need("%s %s machinesNeeded" % (case.name, u), it["machinesNeeded"],
             max(1, math.ceil(load / per - 1e-9)))
        counts["machines"] += 1

    # (b) HVAC ----------------------------------------------------------
    b = lay["building"]
    fh = {f["floor"][0]: val(f, "height") for f in b["floors"]}
    h = post["cleanUtilities"]["hvac"]
    ach = {c["grade"][0]: float(c["perHour"][0]) for c in h["changesPerHour"]}
    rho, cp = val(h["air"], "density"), val(h["air"], "heatCapacity")
    dP, eta = val(h["fan"], "pressureRise"), float(h["fan"]["efficiency"][0])
    Tw, Ts = val(h["outdoor"], "winter"), val(h["outdoor"], "summer")
    Tsup, fresh = val(h["supply"], "temperature"), float(h["supply"]["freshAirFraction"][0])
    unserved = set(h["unserved"]["rooms"]) if "unserved" in h else set()
    byg, tot = {}, [0, 0.0, 0.0]
    for r in b["rooms"]:
        if r["room"][0] in unserved:
            continue
        hh = val(r, "height") if "height" in r else fh[r["floor"][0]]
        V = (val(r, "xMax") - val(r, "xMin")) * (val(r, "yMax") - val(r, "yMin")) * hh
        g = r["grade"][0]
        Q = ach[g] * V
        a = byg.setdefault(g, [0, 0.0, 0.0])
        a[0] += 1; a[1] += V; a[2] += Q
        tot[0] += 1; tot[1] += V; tot[2] += Q
        counts["rooms"] += 1

    def hv(a):
        Qs = a[2] / 3600.0
        m = rho * Qs
        return {"nRooms": a[0], "V_rooms": a[1], "Q_supply": a[2],
                "P_fan": Qs * dP / eta / 1000.0,
                "Q_heating": m * fresh * cp * max(0.0, Tsup - Tw) / 1000.0,
                "Q_cooling": m * fresh * cp * max(0.0, Ts - Tsup) / 1000.0}
    expect = {"hvac/grade" + g: hv(a) for g, a in byg.items()}
    expect["hvac/total"] = hv(tot)
    for k, want in expect.items():
        if k not in items:
            fail("%s: no %s item" % (case.name, k))
            continue
        for key, w in want.items():
            need("%s %s %s" % (case.name, k, key), items[k][key], w)
    counts["grades"] += len(byg)

    # (b2) HVAC cost ------------------------------------------------------
    quotes = post["costing"].get("quotes", [])
    hq = {q["hvacGrade"][0]: q for q in quotes if isinstance(q, dict) and "hvacGrade" in q}
    for g in byg:
        if g not in hq:
            fail("%s: grade %s is in the building and has no hvacGrade quote" % (case.name, g))
    sumBM = 0.0
    for g, q in hq.items():
        Qg = byg[g][2] if g in byg else 0.0
        if q["basis"][0] != "installed" or q["currency"][0] != "EUR":
            fail("%s: the gate recomputes installed EUR quotes only" % case.name)
        cbm = float(q["valuePerSupplyAir"][0]) * Qg
        sumBM += cbm
        m = re.search(r'"item": "hvac/grade%s".*?"bareModule": ([0-9.eE+-]+), "totalModule": ([0-9.eE+-]+)' % g, out)
        if not m:
            fail("%s: no priced hvac/grade%s item" % (case.name, g))
            continue
        need("%s hvac/grade%s C_BM" % (case.name, g), float(m.group(1)), cbm)
        need("%s hvac/grade%s C_TM" % (case.name, g), float(m.group(2)), 1.18 * cbm)
        mk = re.search(r'"hvac": \{[^}]*"C_BM_grade%s": ([0-9.eE+-]+)' % g, out)
        if not mk:
            fail("%s: no hvac KPI C_BM_grade%s" % (case.name, g))
        else:
            need("%s KPI hvac.C_BM_grade%s" % (case.name, g), float(mk.group(1)), cbm)
        counts["hvacCosts"] += 1
    mt = re.search(r'"hvac": \{[^}]*"C_BM_total": ([0-9.eE+-]+)', out)
    if not mt:
        fail("%s: no hvac KPI C_BM_total" % case.name)
    else:
        need("%s KPI hvac.C_BM_total" % case.name, float(mt.group(1)), sumBM)

    # (c) water ---------------------------------------------------------
    w = post["cleanUtilities"]["purifiedWater"]
    rhow = val(w["fluid"], "density")
    gantt = [(g["stage"], g["start"], g["end"]) for g in js["batchPlan"]["gantt"]
             if g.get("lot", 0) != 0]
    draws, Vlot = [], 0.0
    for u in w["uses"]:
        V = (rates[u["stream"][0]] * lot_hours / rhow if "stream" in u
             else val(u, "volumePerLot"))
        Vlot += V
        dt = val(u, "drawTime")
        for (stg, s0, s1) in gantt:
            if stg != u["stage"][0]:
                continue
            st0 = s0 if u["when"][0] == "start" else s1 - dt
            draws.append((st0, st0 + dt, V / dt))
        counts["uses"] += 1
    peak = max(sum(r for (a0, a1, r) in draws if a0 <= s + 1e-12 < a1 - 1e-12)
               for (s, _e, _r) in draws)
    lots = js["batchPlan"]["summary"]["lotsPerYear"]
    margin = float(w["generator"]["margin"][0])
    hold = val(w["storage"], "holdTime")
    g_it, t_it = items.get("purifiedWater/generator"), items.get("purifiedWater/storage")
    if not g_it or not t_it:
        fail("%s: no purified-water items" % case.name)
    else:
        need("%s V_lot" % case.name, g_it["V_lot"], Vlot)
        need("%s V_year" % case.name, g_it["V_year"], Vlot * lots)
        need("%s draw_peak" % case.name, g_it["draw_peak"], peak)
        need("%s capacity" % case.name, g_it["capacity"], peak * (1 + margin))
        need("%s tank V_R" % case.name, t_it["V_R"], hold * peak)

    # (d) neutrality ----------------------------------------------------
    if "TOTALS (EUR) -- INCOMPLETE" in out:
        fail("%s: the capital total reads INCOMPLETE" % case.name)
    lay_sum = re.search(r'"summary": \{ "id": "summary", "placed": (\d+), "unplaced": (\d+), "internal": (\d+)', out)
    if not lay_sum or lay_sum.group(2) != "0" or lay_sum.group(3) != "0":
        fail("%s: layout summary no longer unplaced 0 / internal 0: %s"
             % (case.name, lay_sum.group(0) if lay_sum else "absent"))
    for line in out.splitlines():
        if '"type": "ratedMachine"' in line and '"unit": "blender"' in line:
            if '"declared-quote"' not in line:
                fail("%s: the blender quote is not priced beside its sized item" % case.name)
    return out


def arm_refusals():
    case = CASES[0]
    with tempfile.TemporaryDirectory() as td:
        def expect_text(name, edits, must, rc_zero=None):
            out, err, rc = fixture(td, case, name, edits)
            counts["refusals"] += 1
            blob = out + err
            if must not in blob:
                fail("refusal %s: expected %r in the output; got tail:\n%s"
                     % (name, must, blob[-700:]))
            return out, err, rc

        pd = lambda fn: {"postDict": fn}
        blender = "{ unitName blender;"
        expect_text("noKey", pd(lambda t: sub(t, "nominalVolume 1.2 m3;", "")),
                    "`nominalVolume` is not declared")
        expect_text("noSource", pd(lambda t: sub(
            t, "(an estimate): a 1 000-1 200 L IBC/bin blender; the largest fill is an author-set assumption\";\n                       reason \"the intragranular", "(an estimate)\";\n                       reasonX \"the intragranular")),
            "reason \"...\"; }` is not declared")
        base = lambda t: t
        out, err, rc = expect_text("tooSmall", pd(lambda t: sub(t, "capacity 400 kg/h;", "capacity 10 kg/h;")),
                                   "does NOT fit the lot")
        if "machine(s) of this rating would carry it" not in out + err:
            fail("refusal tooSmall: the refusal does not name the machines that would carry the lot")
        # a declared second unit makes it legal: 10 kg/h x 40 = 400 kg/h
        out, err, rc = fixture(td, case, "installed", pd(lambda t: sub(
            sub(t, "capacity 400 kg/h;", "capacity 10 kg/h;"),
            "taken in about 3 h\";\n              }\n", "taken in about 3 h\";\n              }\n              installed { count 40; source \"gate fixture\"; reason \"gate fixture\"; }\n")))
        counts["refusals"] += 1
        js = result_json(out)
        if rc != 0 or js is None:
            fail("refusal installed: the declared second unit does not run:\n" + (out + err)[-600:])
        else:
            m = re.search(r'"item": "rollerCompactor".*?"utilisation": ([0-9.eE+-]+)', out)
            if not m or not close(float(m.group(1)), 0.313725490191, 1e-6):
                fail("installed fixture: utilisation %s is not the base 0.3137 (10 kg/h x 40)"
                     % (m.group(1) if m else "absent"))
        expect_text("badKind", pd(lambda t: sub(t, "kind massRate;", "kind massrate;")), "Accepted")
        expect_text("noStage", pd(lambda t: sub(
            t, "        { unitName blender;", "        { unitName acetoneTank;  type ratedMachine;  material SS316;\n          designRules { kind massRate; rating { capacity 10 kg/h; source \"x\"; reason \"y\"; } } }\n        { unitName blender;")),
            "is in no stage")
        expect_text("noGrade", pd(lambda t: sub(
            t, "{ grade CNC;  perHour 6;", "{ grade A;  perHour 6;")), "declares no rate for that grade")
        dropq = lambda t: re.sub(r'\{ hvacGrade CNC;.*?"; \}\n', '', t, count=1, flags=re.S)
        out, err, rc = expect_text("noHvacQuote", pd(dropq),
                                   "no cost is declared for the supply air of this grade")
        if "INCOMPLETE" not in out:
            fail("refusal noHvacQuote: the capital total does not read INCOMPLETE")
        expect_text("hvacGradeAbsent", pd(lambda t: sub(t, "hvacGrade CNC;", "hvacGrade A;")),
                    "no supply air was sized for that grade")
        expect_text("hvacValue", pd(lambda t: sub(t, "valuePerSupplyAir 5;", "valuePerSupplyAir 5;  value 7;")),
                    "declares `valuePerSupplyAir")
        expect_text("badRoom", pd(lambda t: sub(t, "rooms ( hvacPlant", "rooms ( noSuchRoom hvacPlant")),
                    "is not a room of the building")
        expect_text("badStage", pd(lambda t: sub(t, "stage coating;  drawTime 1 h;", "stage nowhere;  drawTime 1 h;")),
                    "is not a stage of the batch plan")


def main():
    if not BIN.exists():
        print("check_tablet_machines: FAILED\n  choupoSolve is not built (make all)")
        return 1
    for c in CASES:
        arm_case(c)
    arm_refusals()
    if fails:
        print("check_tablet_machines: FAILED")
        for f in fails:
            print("  " + f)
        return 1
    print("check_tablet_machines: OK -- %d rated machines of apalutamide01_tablets and "
          "donepezil01_tablets recompute their utilisation (lot hours from the declared "
          "lot and its stream, the unit's inlet mass, the stage's operating time or bulk "
          "density, the declared rating and installed count) and their machines needed "
          "to 1e-6; %d rooms of the two buildings, re-read from layoutDict by an "
          "independent reader, give %d grade items and two totals whose volume, supply "
          "flow, fan power and sensible winter/summer duty agree; the %d water uses give "
          "the demand per lot, the year, the Gantt peak, the generator and the tank; %d "
          "hvacGrade quote(s) recompute to the published bare-module and total-module "
          "cost and KPIs (declared cost per m3/h x the supply air recomputed from the rooms); the "
          "capital total stays complete, the layout stays unplaced 0 / internal 0 and the "
          "quotes beside the sized machines stay priced; %d refusals/fixtures fire by name "
          "(a missing rating key or source, a machine that does not fit and the declared "
          "second unit that makes it legal, an unknown kind, a unit in no stage, a grade "
          "with no air-change rate, an unserved name that is no room, a water use in no "
          "stage; a grade with no hvacGrade quote, a quote for an absent grade, "
          "`value` beside `valuePerSupplyAir`).  NOT CHECKED: the vendor numbers and air-change rates (the case's own "
          "assumptions), any machine physics (there is none)."
          % (counts["machines"], counts["rooms"], counts["grades"], counts["uses"],
             counts["hvacCosts"], counts["refusals"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
