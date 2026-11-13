#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
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
  (c2) CLEANING (DEV.md 4c C210, E3).  The plan's `cleaning` entries are
      recomputed from the declarations and the plan's own lots and campaigns
      (never read back): per machine the cleans a year (a clean after every
      lot of each of the N_ip instances the lot is split over, and of every
      installed instance N_ip N_op at each campaign changeover), the purified
      water and the effluent (the declared fraction), and per train the cleans,
      water and effluent of a FULL campaign, against `kpis.cleaning`; the
      totals; and the water arm (c) is held to the same cleans: the demand per
      lot includes the lot cleans, the year includes the changeover cleans, and
      the Gantt peak includes the draws of the cleans (a lot clean over the
      stage's `cleanTime` ending with its bar, a changeover clean over the
      train's changeover bar) -- ONE water ledger.
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
      have, and one that declares `value` instead of `valuePerSupplyAir`; a
      `cleaning` entry for a unit in no stage, one with no `effluentFraction`;
      the SEVERAL-PRODUCTS arm on donepezil02_two_strengths (C249 d): the
      fit per product, the cleaning per product, the water per product, a product
      that does not fit named, an itemMassByProduct for no product; and, with no `cleaning` declared, the
      once-announced "cleaning water is not counted" and a run whose purified-
      water items carry no cleaning keys.

  (f) THE PRESS ON DWELL TIME AND ON COMPACTION FORCE (DEV.md 4c C270), on
      the witness tutorials/batch/plant/tabletPress01_dwell_and_force.  From
      the declaration alone: the dwell at the catalogue speed L/(pi D n), the
      dwell-limited speed L/(pi D t_min) and capacity, which binds, the OEE,
      the effective capacity, and the utilisation = the plan's load over the
      LOWER, effective capacity; the porosity ln(sigma_0/sigma_t)/k_b, the
      solid fraction, the Heckel pressure (ln(1/(1-D)) - A)/K, the punch
      force and its ratio to the maximum, the flat-faced thickness -- each
      against the published item to 1e-6.  The witness's four constants
      (K, A, sigma_0, k_b) are held to compaction01_mcc's GOLDEN (op
      mcc_inDie) to 1e-9, so the chain bench -> constants -> force cannot
      drift apart.  The witness's own announcements (dwell binds, window
      extrapolation, basis mismatch, one material) are read.  Fixtures on
      copies: a target at or above sigma_0, a negative K, a solid fraction
      below the line's zero-pressure density, K beside Py -- each refused
      BY NAME; quality < 1 on a press that already splits off rejects
      (counted twice), a force above the maximum -- announced; one basis
      and a pressure inside the window -- the two warnings ABSENT; a dwell
      need that does not bind -- no binding announcement; a dwell need that
      makes the press no longer fit -- the fit refusal; and the blocks
      stripped -- "NOT checked" for dwell and for compaction, no C270 key
      published and the utilisation back on the nameplate.  THE NEGATIVE:
      the three shipped plants announce both absences and publish no C270
      value (their goldens are held by the suite).

NOT CHECKED: the vendor numbers (they are the case's, declared assumptions),
whether the air-change rates are right for a product (a risk assessment), and
the physics of any machine (there is none, beyond the press's declared dwell
kinematics and the inversion of declared compaction curves, arm (f)).

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
  S8  BatchPlanPass.cpp (C210 E3): the lot cleans count the campaigns, not
      the lots (`double(plan.lotsPerYear)` -> `double(t.campaigns)`)
  S9  BatchPlanPass.cpp (C210 E3): the changeover cleans count the instances
      of ONE lot (`c.instances` -> `c.instancesPerLot`); the shipped cases run
      one instance of each so only the parallelClean fixture sees it
BY-HAND SABOTAGES (2026-11-13, C270), each on RatedMachineSize.cpp unless
named, committed first, rebuilt, the gate run, restored with git checkout and
rebuilt: see the commit message of the slice for the outputs.
  S10 the dwell-limited speed without pi (L / (D t_min))
  S11 the utilisation on the nameplate: drop `if (binds) perMachine = capLim;`
  S12 the OEE not applied to the capacity (drop `perMachine *= a * p * q`)
  S13 the porosity inverted with the wrong sign (ln(sigma_t/sigma_0)/k_b) in
      CompactionLaws.H -- the bench's goldens do not see it (the bench never
      inverts), only this arm does
  S14 the force without the tip area's unit (P x A_tip x 1e-6 dropped)
  S15 the sigma_0 refusal removed (the target-above-sigma_0 fixture)
  S16 the double-count announcement removed
  S17 the basis-mismatch announcement fired on every run (`if (true)`)
  S18 the "NOT checked for dwell time" announcement removed
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
         for n in ("apalutamide01_tablets", "donepezil01_tablets",
                   "donepezil02_two_strengths")]
REL = 1e-6

fails = []
counts = {"machines": 0, "rooms": 0, "grades": 0, "uses": 0, "refusals": 0,
          "hvacCosts": 0, "cleaning": 0, "productFits": 0, "productCleans": 0,
          "productWater": 0, "pressNumbers": 0, "benchConstants": 0,
          "pressAnnouncements": 0, "pressFixtures": 0, "pressNegatives": 0}


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
    # SEVERAL PRODUCTS (DEV.md 4c C249 d): one view per product -- its lot (its
    # own, or the plan's), its lot hours and its stage overrides, read from the
    # declaration; a single-product plan is one view named "".
    multi = "products" in plan
    plist = [{"name": q["product"][0], "d": q} for q in plan["products"]] if multi \
        else [{"name": "", "d": {}}]
    for q in plist:
        lt = q["d"]["lot"] if "lot" in q["d"] else plan["lot"]
        q["lot_hours"] = val(lt, "mass") / rates[lt["stream"][0]]
        q["over"] = {o["stage"][0]: o for o in q["d"].get("stages", [])} \
            if isinstance(q["d"].get("stages", []), list) else {}
    lot_hours = plist[0]["lot_hours"]

    def im(q, r):
        # a strength with its own tablet weight (`itemMassByProduct`), else `itemMass`
        ib = r.get("itemMassByProduct")
        if multi and isinstance(ib, dict) and q["name"] in ib:
            return val(ib, q["name"])
        return val(r, "itemMass")

    def pval(q, st, key):
        o = q["over"].get(st["stage"][0])
        return val(o, key) if o is not None and key in o else val(st, key)
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
        utils, loads = {}, {}
        for q in plist:
            lh = q["lot_hours"]
            if kind == "batchVolume":
                m_lot = rates[st["holds"][0]] * lh
                load = m_lot / pval(q, st, "bulkDensity")
                cap = n * val(r, "nominalVolume") * float(r["maxFill"][0])
            else:
                m_unit = sum(rates[s] for s in ins[u]) * lh
                t_op = pval(q, st, "operatingTime")
                if kind == "massRate":
                    load = m_unit / t_op
                    cap = n * val(r, "capacity")
                elif kind == "tabletPress":
                    load = m_unit / im(q, r) / t_op
                    cap = (n * float(r["stations"][0]) * float(r["turretSpeed"][0]) * 60.0
                           * float(r["compressionsPerRevolution"][0]))
                else:
                    load = m_unit / im(q, r) / t_op / float(r["itemsPerPack"][0])
                    cap = n * float(r["packsPerMinute"][0]) * 60.0
            utils[q["name"]] = load / cap
            loads[q["name"]] = load
        per = cap / n
        need("%s %s utilisation" % (case.name, u), it["utilisation"], max(utils.values()))
        need("%s %s machinesNeeded" % (case.name, u), it["machinesNeeded"],
             max(max(1, math.ceil(l / per - 1e-9)) for l in loads.values()))
        if multi:
            for pn in utils:
                need("%s %s utilisation_%s" % (case.name, u, pn),
                     it["utilisation_" + pn], utils[pn])
                need("%s %s load_%s" % (case.name, u, pn), it["load_" + pn], loads[pn])
            need("%s %s productsChecked" % (case.name, u), it["productsChecked"], len(plist))
            counts["productFits"] += len(plist)
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
    gantt = [(g["stage"], g["start"], g["end"], g.get("product", "")) for g in js["batchPlan"]["gantt"]
             if g.get("lot", 0) != 0]
    # the changeover bars of a train: the single plan's one bar kind; several
    # products add the product-changeover bars (a 0 h clean draws nothing)
    changeover_bars = {}
    for g in js["batchPlan"]["gantt"]:
        if g["stage"] == "changeover" or (multi and g["stage"] == "productChangeover"):
            if g["end"] > g["start"]:
                changeover_bars.setdefault(g["train"], []).append((g["start"], g["end"]))
    lh_of = {q["name"]: q["lot_hours"] for q in plist}
    draws, Vlot = [], 0.0
    Vlot_p = {q["name"]: 0.0 for q in plist}
    for u in w["uses"]:
        dt = val(u, "drawTime")
        for q in plist:
            Vq = (rates[u["stream"][0]] * lh_of[q["name"]] / rhow if "stream" in u
                  else val(u, "volumePerLot"))
            Vlot_p[q["name"]] += Vq
        V = (rates[u["stream"][0]] * lot_hours / rhow if "stream" in u
             else val(u, "volumePerLot"))
        Vlot += V
        for (stg, s0, s1, pg) in gantt:
            if stg != u["stage"][0]:
                continue
            Vg = (rates[u["stream"][0]] * lh_of[pg] / rhow if "stream" in u
                  else val(u, "volumePerLot")) if multi else V
            st0 = s0 if u["when"][0] == "start" else s1 - dt
            draws.append((st0, st0 + dt, Vg / dt))
        counts["uses"] += 1
    # (c2) the plan's cleaning, recomputed -------------------------------
    VcleanChg = 0.0
    cl = plan.get("cleaning", [])
    trains_js = {t["name"]: t for t in js["batchPlan"]["trains"]}
    stage_of = {}
    for st_ in plan["stages"]:
        for u_ in st_["units"]:
            stage_of[u_] = st_
    stage_train = {st_["stage"][0]: st_["train"][0] for st_ in plan["stages"]}
    lots_ = js["batchPlan"]["summary"]["lotsPerYear"]
    # several products: each product's lots and its campaigns on each train
    # (the plan's own counts; arm (h) of check_batch_plan recomputes them)
    lots_of = {x["name"]: x["lotsPerYear"] for x in js["batchPlan"].get("products", [])}
    camp_of = {(x["product"], x["train"]): x["campaigns"]
               for x in js["batchPlan"].get("productTrains", [])}
    kc = None
    mkc = re.search(r'"cleaning": (\{[^}]*\})', out)
    if mkc:
        kc = json.loads(mkc.group(1))
    if cl and kc is None:
        fail("%s: the plan declares cleaning and kpis.cleaning is not published" % case.name)
    if not cl and kc is not None:
        fail("%s: kpis.cleaning is published with no cleaning declared" % case.name)
    totC = totW = totE = 0.0
    perTrain = {}
    perProd = {}
    for c in cl:
        unit = c["unit"][0]
        st_ = stage_of[unit]
        tn = st_["train"][0]
        nip = int(float(st_["inPhase"][0])) if "inPhase" in st_ else 1
        nop = int(float(st_["outOfPhase"][0])) if "outOfPhase" in st_ else 1
        wl, wc = val(c, "waterPerLotClean"), val(c, "waterPerChangeover")
        fr = float(c["effluentFraction"][0])
        camp = trains_js[tn]["campaigns"]
        nc = min(int(trains_js[tn]["lotsPerCampaign"]), lots_)
        cleansC = nc * nip + nip * nop
        waterC = nc * nip * wl + nip * nop * wc
        if multi:
            # per product i: N_i N_ip lot cleans; (c_i - 1) campaign changeovers and
            # ONE product changeover (a lone product: c_i changeovers) of N_ip N_op
            cleansY = waterY = chgCleans = 0.0
            several = len(plist) >= 2
            for q in plist:
                pn = q["name"]
                cl_lot = lots_of[pn] * nip
                cl_chg = (camp_of[(pn, tn)] - 1 + (0 if several else 1)) * nip * nop \
                    + (nip * nop if several else 0)
                cy = cl_lot + cl_chg
                wy = cl_lot * wl + cl_chg * wc
                if kc is not None:
                    need("%s cleaning %s %s cleans_year" % (case.name, unit, pn),
                         kc["%s_%s_cleans_year" % (unit, pn)], cy)
                    need("%s cleaning %s %s water_m3_year" % (case.name, unit, pn),
                         kc["%s_%s_water_m3_year" % (unit, pn)], wy)
                    need("%s cleaning %s %s effluent_m3_year" % (case.name, unit, pn),
                         kc["%s_%s_effluent_m3_year" % (unit, pn)], fr * wy)
                    pk = perProd.setdefault(pn, [0.0, 0.0, 0.0])
                    pk[0] += cy; pk[1] += wy; pk[2] += fr * wy
                cleansY += cy; waterY += wy; chgCleans += cl_chg
                counts["productCleans"] += 1
        else:
            cleansY = lots_ * nip + camp * nip * nop
            waterY = lots_ * nip * wl + camp * nip * nop * wc
        if kc is not None:
            need("%s cleaning %s cleans_year" % (case.name, unit), kc[unit + "_cleans_year"], cleansY)
            need("%s cleaning %s water_m3_year" % (case.name, unit), kc[unit + "_water_m3_year"], waterY)
            need("%s cleaning %s effluent_m3_year" % (case.name, unit), kc[unit + "_effluent_m3_year"], fr * waterY)
        totC += cleansY; totW += waterY; totE += fr * waterY
        a = perTrain.setdefault(tn, [0.0, 0.0, 0.0])
        a[0] += cleansC; a[1] += waterC; a[2] += fr * waterC
        # the same cleans in the water ledger
        Vl = wl * nip
        if Vl > 0:
            dt = val(st_, "cleanTime")
            Vlot += Vl
            for q in plist:
                Vlot_p[q["name"]] += Vl
            for (stg, s0, s1, pg) in gantt:
                if stg == st_["stage"][0]:
                    dtg = pval(next(q for q in plist if q["name"] == pg), st_, "cleanTime") \
                        if multi else dt
                    draws.append((s1 - dtg, s1, Vl / dtg))
        if wc > 0:
            Vc = wc * nip * nop
            for (b0, b1) in changeover_bars[tn]:
                draws.append((b0, b1, Vc / (b1 - b0)))
            VcleanChg += (wc * chgCleans) if multi else Vc * camp
        counts["cleaning"] += 1
    if kc is not None:
        for tn, a in ({} if multi else perTrain).items():
            need("%s cleaning train %s cleans_campaign" % (case.name, tn), kc["train_%s_cleans_campaign" % tn], a[0])
            need("%s cleaning train %s water_campaign" % (case.name, tn), kc["train_%s_water_m3_campaign" % tn], a[1])
            need("%s cleaning train %s effluent_campaign" % (case.name, tn), kc["train_%s_effluent_m3_campaign" % tn], a[2])
        for pn, a in perProd.items():
            need("%s cleaning product %s cleans_year" % (case.name, pn), kc["product_%s_cleans_year" % pn], a[0])
            need("%s cleaning product %s water_m3_year" % (case.name, pn), kc["product_%s_water_m3_year" % pn], a[1])
            need("%s cleaning product %s effluent_m3_year" % (case.name, pn), kc["product_%s_effluent_m3_year" % pn], a[2])
        need("%s cleaning cleans_year" % case.name, kc["cleans_year"], totC)
        need("%s cleaning water_m3_year" % case.name, kc["water_m3_year"], totW)
        need("%s cleaning effluent_m3_year" % case.name, kc["effluent_m3_year"], totE)
    peak = max(sum(r for (a0, a1, r) in draws if a0 <= s + 1e-12 < a1 - 1e-12)
               for (s, _e, _r) in draws)
    lots = js["batchPlan"]["summary"]["lotsPerYear"]
    margin = float(w["generator"]["margin"][0])
    hold = val(w["storage"], "holdTime")
    g_it, t_it = items.get("purifiedWater/generator"), items.get("purifiedWater/storage")
    if not g_it or not t_it:
        fail("%s: no purified-water items" % case.name)
    else:
        if multi:
            # per product: lots_i x (its streams over its own lot hours + the declared
            # volumes + the lot cleans); the year sums them + the changeover cleans
            need("%s V_lot (largest product)" % case.name, g_it["V_lot"], max(Vlot_p.values()))
            need("%s lotsPerYear" % case.name, g_it["lotsPerYear"], sum(lots_of.values()))
            for pn, V in Vlot_p.items():
                need("%s V_lot_%s" % (case.name, pn), g_it["V_lot_" + pn], V)
                need("%s lotsPerYear_%s" % (case.name, pn), g_it["lotsPerYear_" + pn], lots_of[pn])
                counts["productWater"] += 1
            need("%s V_year" % case.name, g_it["V_year"],
                 sum(lots_of[pn] * V for pn, V in Vlot_p.items()) + VcleanChg)
        else:
            need("%s V_lot" % case.name, g_it["V_lot"], Vlot)
            need("%s V_year" % case.name, g_it["V_year"], Vlot * lots + VcleanChg)
        if not cl and "V_cleaning_lot" in g_it:
            fail("%s: the generator carries cleaning keys with no cleaning declared" % case.name)
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
        # (c2) cleaning refusals, and the absent declaration ------------------
        dropcl = lambda t: re.sub(r"    cleaning\n    \(.*?\n    \);\n", "", t, count=1, flags=re.S)
        expect_text("cleaningNoStage", pd(lambda t: sub(t, "{ unit coatingPan;", "{ unit acetoneTank;")),
                    "is in no stage of the plan")
        expect_text("cleaningNoFraction", pd(lambda t: sub(t, "effluentFraction 0.95;", "", )),
                    "`effluentFraction` is not declared")
        expect_text("cleaningTwice", pd(lambda t: sub(t, "{ unit blender;", "{ unit finalBlender;")),
                    "declared twice")
        out, err, rc = fixture(td, case, "noCleaning", pd(dropcl))
        counts["refusals"] += 1
        if rc != 0 or "cleaning the machines is not counted" not in out + err:
            fail("fixture noCleaning: rc %s, or the once-announcement is missing:\n%s" % (rc, (out + err)[-500:]))
        if '"cleaning": {' in out or "V_cleaning_lot" in out:
            fail("fixture noCleaning: cleaning keys are published with nothing declared")
        elif "(the plan's cleaning)" in out:
            fail("fixture noCleaning: the water table carries cleaning rows")
        # (c2) parallel instances: a lot is split over N_ip and every installed
        # instance is cleaned at a changeover -- the shipped cases run ONE of
        # each, so this fixture is the only arm that can tell N_ip from N_ip N_op.
        out, err, rc = fixture(td, case, "parallelClean", pd(lambda t: sub(
            t, "stage  blending;  train solidDose;  type batch;",
            "stage  blending;  train solidDose;  type batch;  inPhase 2;  outOfPhase 2;")))
        counts["refusals"] += 1
        jsx = result_json(out)
        mk = re.search(r'"cleaning": (\{[^}]*\})', out)
        if rc != 0 or jsx is None or not mk:
            fail("fixture parallelClean did not run with cleaning published:\n" + (out + err)[-600:])
        else:
            kcx = json.loads(mk.group(1))
            postx = read_dict(case / "system" / "postDict")
            cb = next(c for c in postx["batchPlan"]["cleaning"] if c["unit"] == ["blender"])
            lotsx = jsx["batchPlan"]["summary"]["lotsPerYear"]
            campx = next(t for t in jsx["batchPlan"]["trains"] if t["name"] == "solidDose")["campaigns"]
            wl, wc = val(cb, "waterPerLotClean"), val(cb, "waterPerChangeover")
            need("parallelClean blender cleans_year", kcx["blender_cleans_year"], lotsx * 2 + campx * 4)
            need("parallelClean blender water_m3_year", kcx["blender_water_m3_year"],
                 lotsx * 2 * wl + campx * 4 * wc)
        expect_text("badRoom", pd(lambda t: sub(t, "rooms ( hvacPlant", "rooms ( noSuchRoom hvacPlant")),
                    "is not a room of the building")
        expect_text("badStage", pd(lambda t: sub(t, "stage suspensionPreparation;  drawTime 0.5 h;", "stage nowhere;  drawTime 0.5 h;")),
                    "is not a stage of the batch plan")
        # SEVERAL PRODUCTS (C249 d), on donepezil02: a product that does not fit is
        # named; an itemMassByProduct entry for no product refuses by name.
        case2 = CASES[2]

        def expect_multi(name, edit, must):
            out, err, rc = fixture(td, case2, name, {"postDict": edit})
            counts["refusals"] += 1
            if must not in out + err:
                fail("multi refusal %s: expected %r; got tail:\n%s" % (name, must, (out + err)[-600:]))
        expect_multi("multiNoFit", lambda t: sub(t, "strength5 0.14 g;", "strength5 0.001 g;"),
                     "does NOT fit the lot of product 'strength5'")
        expect_multi("multiNoProduct", lambda t: sub(t, "strength5 0.14 g;", "strength9 0.14 g;"),
                     "names no product of the plan")


# ------------------------------------------------ (f) the press (C270) ---
WITNESS = ROOT / "tutorials" / "batch" / "plant" / "tabletPress01_dwell_and_force"
BENCH = ROOT / "tutorials" / "props" / "powder" / "compaction01_mcc"
PRESS_UNITS = {"MPa": 1e6, "1/MPa": 1e-6, "mm": 1e-3, "m": 1.0, "ms": 1e-3,
               "mm2": 1e-6, "kN": 1e3, "g/cm3": 1e3, "g": 1e-3}


def pval(d, key):
    """A declared value in SI (the press arm's own unit table)."""
    v = d[key]
    return float(v[0]) * (PRESS_UNITS[v[1]] if len(v) > 1 else 1.0)


def bench_golden():
    """The bench's own golden values of op mcc_inDie (diag rows)."""
    g = {}
    for line in (BENCH / "expected").read_text().splitlines():
        f = line.split()
        if len(f) >= 4 and f[0] == "diag" and f[1] == "mcc_inDie":
            g[f[2]] = float(f[3])
    return g


def press_item(out, unit="tabletPress"):
    for line in out.splitlines():
        if '"item": "%s"' % unit in line and '"type": "ratedMachine"' in line:
            mv = re.search(r'"values": \{([^}]*)\}', line)
            if mv:
                return {k: float(x) for k, x in re.findall(
                    r'"([A-Za-z_][A-Za-z0-9_]*)": *(-?[0-9][0-9.eE+-]*)', mv.group(1))}
    return None


def recompute_press(dr):
    """Every C270 number, from the declaration alone (never read back)."""
    r = dr["rating"]
    st, rpm, cpr = (float(r["stations"][0]), float(r["turretSpeed"][0]),
                    float(r["compressionsPerRevolution"][0]))
    want = {"capacity_machine": st * rpm * 60.0 * cpr}
    cap = want["capacity_machine"]
    if "dwell" in dr:
        dw = dr["dwell"]
        L, D, tmin = pval(dw, "punchFlat"), pval(dw, "pitchCircle"), pval(dw, "minimumDwellTime")
        t_at = L / (math.pi * D * rpm / 60.0)
        n_max = L / (math.pi * D * tmin) * 60.0
        want.update({"dwellTime_atRating": t_at * 1e3, "turretSpeed_dwellLimited": n_max,
                     "capacity_dwellLimited": st * n_max * 60.0 * cpr,
                     "dwellBinds": 1.0 if n_max < rpm else 0.0})
        cap = min(cap, want["capacity_dwellLimited"])
    if "effectiveness" in dr:
        e = dr["effectiveness"]
        oee = float(e["availability"][0]) * float(e["performance"][0]) * float(e["quality"][0])
        want["oee"] = oee
        cap *= oee
    if "dwell" in dr or "effectiveness" in dr:
        want["capacity_effective"] = cap
    if "compaction" in dr:
        c = dr["compaction"]
        h, rd = c["heckel"], c["ryshkewitch"]
        K = float(h["K"][0]) if "K" in h else 1.0 / float(h["Py"][0])      # 1/MPa
        A = float(h["A"][0])
        s0, kb = pval(rd, "sigma0") / 1e6, float(rd["kb"][0])
        sig = pval(c, "targetTensileStrength") / 1e6
        eps = math.log(s0 / sig) / kb
        Dsol = 1.0 - eps
        P = (math.log(1.0 / (1.0 - Dsol)) - A) / K
        At = pval(c, "punchTipArea")
        F = P * 1e6 * At
        want.update({"porosity_target": eps, "solidFraction_target": Dsol,
                     "compactionPressure": P, "punchForce": F / 1e3,
                     "forceRatio": F / pval(c, "maxCompressionForce")})
        if "trueDensity" in c:
            want["tabletThickness"] = val(r, "itemMass") / (pval(c, "trueDensity") * Dsol * At) * 1e3
    return want, cap


def arm_press():
    """(f) C270: the dwell limit, the effectiveness and the compaction force."""
    out, err = run_case(WITNESS)
    js = result_json(out)
    if js is None:
        fail("tabletPress01: no result JSON")
        return
    post = read_dict(WITNESS / "system" / "postDict")
    dr = next(e for e in post["sizing"]["units"] if e["unitName"] == ["tabletPress"])["designRules"]
    it = press_item(out)
    if it is None:
        fail("tabletPress01: no ratedMachine item")
        return
    want, cap = recompute_press(dr)
    for k, w in want.items():
        if k not in it:
            fail("tabletPress01: the item publishes no %s" % k)
        else:
            need("tabletPress01 %s" % k, it[k], w)
            counts["pressNumbers"] += 1
    # the utilisation divides the load by the LOWER (and effective) capacity
    rates = stream_rates(js)
    plan = post["batchPlan"]
    lot = val(plan["lot"], "mass")
    st = plan["stages"][0]
    load = lot / val(dr["rating"], "itemMass") / val(st, "operatingTime")
    need("tabletPress01 load", it["load"], load)
    need("tabletPress01 utilisation (on the dwell-limited, effective capacity)",
         it["utilisation"], load / cap)
    counts["pressNumbers"] += 2
    # the four constants are the bench's golden, so the two cannot drift apart
    g = bench_golden()
    c = dr["compaction"]
    for got, key in ((float(c["heckel"]["K"][0]), "heckel_K_perMPa"),
                     (float(c["heckel"]["A"][0]), "heckel_A"),
                     (pval(c["ryshkewitch"], "sigma0") / 1e6, "ryshkewitch_sigma0_MPa"),
                     (float(c["ryshkewitch"]["kb"][0]), "ryshkewitch_kb")):
        if key not in g:
            fail("tabletPress01: the bench golden carries no %s" % key)
        elif not close(got, g[key], 1e-9):
            fail("tabletPress01: the declared %s %.12g is not the bench's golden %.12g "
                 "(tutorials/props/powder/compaction01_mcc/expected)" % (key, got, g[key]))
        else:
            counts["benchConstants"] += 1
    # the witness's own announcements: the dwell binds, the window, the basis
    for must in ("the DWELL LIMIT BINDS", "OUTSIDE the window the Heckel line was fitted on",
                 "the two curves are on DIFFERENT bases", "no mixture rule is implemented"):
        if must not in out:
            fail("tabletPress01: the announcement %r is not in the result" % must)
        else:
            counts["pressAnnouncements"] += 1

    # fixtures on copies: refusals and announcements fired one at a time
    with tempfile.TemporaryDirectory() as td:
        def fx(name, old, new, must, rc0=None, absent=None):
            o, e, rc = fixture(td, WITNESS, name, {"postDict": lambda t: sub(t, old, new)})
            counts["pressFixtures"] += 1
            blob = o + e
            if must not in blob:
                fail("press fixture %s: expected %r; got tail:\n%s" % (name, must, blob[-600:]))
            if rc0 is not None and (rc == 0) != rc0:
                fail("press fixture %s: exit code %d" % (name, rc))
            if absent and absent in blob:
                fail("press fixture %s: %r must not be printed" % (name, absent))
            return o
        fx("targetAboveSigma0", "targetTensileStrength  2 MPa;", "targetTensileStrength  35 MPa;",
           "no porosity gives it", rc0=None)
        fx("negativeK", "K       0.00906082550054 1/MPa;", "K       -0.00906082550054 1/MPa;",
           "must be positive", rc0=None)
        # a solid fraction below the line's own zero-pressure density
        fx("belowIntercept", "targetTensileStrength  2 MPa;", "targetTensileStrength  0.3 MPa;",
           "the Heckel line cannot give the solid fraction", rc0=None)
        fx("bothKandPy", "A       0.657612232409;", "A       0.657612232409;  Py 110 MPa;",
           "both `K` and `Py`", rc0=None)
        fx("doubleCount", "quality      1.0;", "quality      0.99;",
           "the rejects are COUNTED TWICE", rc0=True)
        fx("forceAbove", "maxCompressionForce    80 kN;", "maxCompressionForce    2.5 kN;",
           "is ABOVE the press's maximum compression force", rc0=True)
        # inside the window and on one basis: neither announcement
        o = fx("inWindowOneBasis", "basis   outOfDie;", "basis   inDie;",
               "no mixture rule is implemented", rc0=True,
               absent="the two curves are on DIFFERENT bases")
        o = fx("insideWindow", "targetTensileStrength  2 MPa;", "targetTensileStrength  3 MPa;",
               "COMPACTION", rc0=True, absent="OUTSIDE the window the Heckel line")
        fx("dwellNotBinding", "minimumDwellTime  10 ms;", "minimumDwellTime  6 ms;",
           "DWELL (kinematics", rc0=True, absent="the DWELL LIMIT BINDS")
        # the dwell limit can make a press that fit no longer fit: refused, naming the count
        fx("dwellRefuses", "minimumDwellTime  10 ms;", "minimumDwellTime  20 ms;",
           "does NOT fit the lot", rc0=None)
        # the absent blocks: announced as unchecked, and nothing new published
        strip = lambda t: re.sub(r"\n              //  THE DWELL LIMIT.*?\n              compaction\n              \{.*?\n              \}\n",
                                 "\n", t, count=1, flags=re.S)
        o, e, rc = fixture(td, WITNESS, "nothingDeclared", {"postDict": strip})
        counts["pressFixtures"] += 1
        blob = o + e
        if rc != 0:
            fail("press fixture nothingDeclared: exit %d\n%s" % (rc, blob[-600:]))
        for must in ("NOT checked for dwell time", "NOT checked for compaction force"):
            if must not in blob:
                fail("press fixture nothingDeclared: %r missing" % must)
        itn = press_item(o) or {}
        new = sorted(k for k in itn if k in ("dwellTime_atRating", "capacity_dwellLimited", "oee",
                                              "capacity_effective", "compactionPressure", "punchForce"))
        if new:
            fail("press fixture nothingDeclared: it publishes C270 keys %s" % new)
        if itn and not close(itn.get("utilisation", -1), load / it["capacity_machine"]):
            fail("press fixture nothingDeclared: the utilisation is not load / nameplate")
    # the negative on the shipped plants: announced, nothing new published
    for case in CASES:
        o, e = run_case(case)
        for must in ("NOT checked for dwell time", "NOT checked for compaction force"):
            if must not in o + e:
                fail("%s: the press does not announce %r" % (case.name, must))
        itc = press_item(o) or {}
        if any(k in itc for k in ("dwellTime_atRating", "oee", "compactionPressure")):
            fail("%s: the press publishes a C270 value it never declared" % case.name)
        counts["pressNegatives"] += 1


def main():
    if not BIN.exists():
        print("check_tablet_machines: FAILED\n  choupoSolve is not built (make all)")
        return 1
    for c in CASES:
        arm_case(c)
    arm_refusals()
    arm_press()
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
          "%d plan cleaning entries recompute (cleans, purified water and effluent a year and "
          "per full campaign of the train, the water ledger's lot demand, year and Gantt "
          "peak carrying the same cleans); the capital total stays complete, the layout stays unplaced 0 / internal 0 and the "
          "quotes beside the sized machines stay priced; %d refusals/fixtures fire by name "
          "(a missing rating key or source, a machine that does not fit and the declared "
          "second unit that makes it legal, an unknown kind, a unit in no stage, a grade "
          "with no air-change rate, an unserved name that is no room, a water use in no "
          "stage; a grade with no hvacGrade quote, a quote for an absent grade, "
          "`value` beside `valuePerSupplyAir`; a cleaning unit in no stage, with no effluent "
          "fraction, declared twice; the absent declaration announced once and publishing "
          "nothing).  NOT CHECKED: the vendor numbers and air-change rates (the case's own "
          "assumptions), any machine physics (none is modelled; the press checks of arm (f) are kinematics and declared curves).  SEVERAL PRODUCTS "
          "(donepezil02_two_strengths, C249 d): %d product-fits recomputed from each "
          "product's own lot and stage override, %d per-product cleaning rows and %d "
          "per-product water lots recomputed.  THE PRESS (C270, tabletPress01_dwell_and_force): "
          "%d published numbers recomputed from the declaration alone (dwell at the catalogue "
          "speed, the dwell-limited speed and capacity, which binds, OEE, the effective capacity, "
          "the load and the utilisation on the LOWER capacity; porosity, solid fraction, Heckel "
          "pressure, punch force and ratio, thickness); %d bench constants equal to "
          "compaction01_mcc's golden; %d of the witness's announcements read; %d fixtures (four "
          "refusals by name, double-counted rejects and a force above the maximum announced, "
          "the window and basis warnings absent when not due, a dwell need that does not bind "
          "and one that refuses the fit, the blocks stripped: announced unchecked and nothing "
          "new published); %d shipped plants announce both absences and publish no C270 value.  "
          "NOT CHECKED: whether a minimum dwell or a target strength is right for a "
          "formulation (the case's declarations), and any mixture rule (there is none)."
          % (counts["machines"], counts["rooms"], counts["grades"], counts["uses"],
             counts["hvacCosts"], counts["cleaning"], counts["refusals"],
             counts["productFits"], counts["productCleans"], counts["productWater"],
             counts["pressNumbers"], counts["benchConstants"], counts["pressAnnouncements"],
             counts["pressFixtures"], counts["pressNegatives"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
