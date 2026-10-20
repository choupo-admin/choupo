#!/usr/bin/env python3
"""Gate: a batch plant is designed on the steady balance, and every number
the engine publishes for it RECOMPUTES here.

    bin/curate/check_batch_plan.py
    bin/curate/check_batch_plan.py --keep DIR    run, keep the runs in DIR, check

WHY THIS EXISTS (2026-10-19, DEV.md 4c C99).  `system/postDict` may declare
`batchPlan {}` and the engine (`src/postProcessing/BatchPlanPass.cpp`) then
designs the BATCH PLANT on the converged flowsheet: size factors per stage
from the flowsheet's own stream masses, the lot, the lots a year, each
stage's cycle, the limiting cycle of each train, parallel units in and out of
phase, campaigns, occupancy, a Gantt of the first campaign.  A vessel may
take its volume from it (`volume fromBatchPlan;`), a declared quote may scale
with a stage's size (`scaling {}`), and the economics may take the year's
flows from it (`streamFactor fromBatchPlan;`).  Arithmetic nobody recomputes
is arithmetic nobody checks: every arm below recomputes from the DECLARED
postDict (parsed here, with its units) and the published stream masses, and
never from the engine's echo of an input.

The witness is a copy of `tutorials/batch/plant/apalutamide01_tablets` under a temp
dir; every fixture is a text edit of that copy.  Nothing under tutorials/ is
touched.

  (a) THE WITNESS: S_j, B, N, the mass per lot, every volume and rate per
      unit, every operating time (declared, or the rated unit's own rate),
      every discharge through a fed stage, every cycle, T_L and the limiting
      stage of each train, utilisation, offsets, campaigns, span, required
      hours, train and stage occupancy, busy and idle hours, the equivalent
      hours and stream factor, and every Gantt bar recompute from the
      declaration and the stream masses (relative 1e-6); the finding set is
      exactly the set recomputed here (lowUtilisation, idleTrain,
      capacityMismatch), and the units in no stage are the flowsheet's
      units minus the declared ones.
  (b) THE CONSEQUENCES: each `volume fromBatchPlan;` vessel's published size
      is its stage's volume per unit; each scaled quote's C_p is value x
      units x (size / referenceSize)^exponent with the stage's size and the
      DECLARED reference and exponent; the economics' streamFactor is Q / (r_P
      x 8760).
  (c) THE ANNOUNCEMENTS reach all three surfaces: stderr `[batchPlan]`, the
      end-of-run caveat block under BATCH PLAN, and `batchPlan.findings`; a
      fixture declaring the dryer's operating time raises capacityMismatch
      and one with a long available time raises idleTrain, each recomputed.
  (d) THE OTHER LOT RULE and PARALLEL UNITS: `rule largestEquipment` (every
      batch stage's `maxVolume`) and a slow packaging line (14 h a lot) with
      two units out of phase -- it must still limit, at T_L = t / 2 -- and a
      coater with two in phase, recomputed by (a)'s code.
  (e) REFUSALS, each required to exit non-zero and NAME its defect: a stage
      busier than its train's year, a train whose campaigns do not fit, a
      time without its unit, an unknown `holds` stream, a unit in two
      stages, a stage feeding an earlier one, `fromFlowsheet` on a stage
      with no rated unit, `maxVolume` under `rule declared`, a missing
      `source`, a fill fraction above 1, a scaling quote of the wrong size
      kind, a scaling quote with the batch plan below the costing, a numeric
      streamFactor beside a batch plan; and `volume fromBatchPlan` on a stage
      of two vessels, refused the sizing pass's way (the unit listed FAILED,
      not sized, the run goes on).
  (f) ABSENCE IS SILENCE: economics01 (no batchPlan) publishes no
      `batchPlan` key and prints no `[batchPlan]` line.
  (g) PUBLISHED => PINNED: `bin/runTests --record` on a copy writes `batch`
      rows for the summary, each train and each stage; the check passes on
      them; and it FAILS once a stage's declared processing time moves.

MULTIPRODUCT (2026-10-20, DEV.md 4c C110 G2).  `products ( ... )`,
`campaignOrder ( ... )` and a stage's `productChangeover` make the plan
several products in single-product campaigns (BatchPlanPass.H states the
method).  NO tutorial carries the form: the witness is a PROBE built here from
the same copy of apalutamide01 -- `production {}` replaced by three products
(strengthA on the flowsheet's balance and the plan's lot; strengthB with its
own lot, its own kg per kg of coating suspension, its own times, density and
fill, and a 10 h coating clean before strengthC; strengthC one partial
campaign on a slower packaging line), every stage given a clean between
products (0 h on the spray-drying train, which makes the intermediate both
share).  Every number in it is the probe's, chosen to exercise one rule each.

  (h) THE PROBE: every product's lot, lots a year, production and equivalent
      hours; every (product, stage)'s mass per product and per lot, size
      factor, volume or rate, the four times, cycle, utilisation, offset and
      the clean after the product's last campaign; every (product, train)'s
      T_L, limiting stage, campaigns, lots in the last, first span, start in
      the year, clean before the next product and required hours; every
      stage's size (the LARGEST any product needs) and the product that sets
      it, busy, idle, occupancy, largest utilisation; every train's
      campaigns, product changes, changeover hours, required hours and
      occupancy; every bar of the year's Gantt (ids, times, kinds) -- whose
      last bar must end at the train's required time -- and the finding set,
      all recomputed independently from the declaration and the published
      stream masses.  The consequences follow the largest size: the vessels
      `volume fromBatchPlan`, the scaled quotes, and the economics' stream
      factor (sum Q / r_P x 8760).  The announcements reach stderr and the
      advisories JSON, and the probe must still exercise what it claims
      (a stage sized by strengthB, strengthB's changeoverTo taken, strengthC
      in one partial campaign).
  (i) THE ORDER IS A DECISION: the same probe in the order B A C needs
      exactly 2 h a year less on the solid-dose train than A B C -- the
      difference between strengthB's 10 h coating clean before strengthC and
      the 8 h every other product change takes; both recompute.
  (j) ONE PRODUCT THROUGH `products` IS THE ONE-PRODUCT PLAN: every lot,
      cycle, offset, busy hour, size, finding and purchased cost to 1e-9
      against the unmodified witness.
  (k) REFUSALS, each named: `production` beside `products`; no
      `campaignOrder`; an order that is not a permutation; a stage with no
      `productChangeover`; `productChangeover` and `campaignOrder` in a
      one-product plan; a duplicate product; `changeoverTo` naming itself;
      a unitless `changeoverTo`; an override naming no stage, using a key its
      stage type lacks, changing nothing, or with no source; `massPerProduct`
      on the product stream, on a stream nothing reads, or with a unit; a
      product with no lot anywhere; a plan lot every product overrides; a
      stage busier than its year and a train whose year does not fit, each
      naming the products' shares.
  (l) PUBLISHED => PINNED: `--record` on the probe pins `batch` rows for the
      summary, product, productTrain, productStage, stage and train records
      (including the new keys), the check passes on them, and strengthB's
      compression moved by 0.5 h fails it on its productStage row.
  (a) also requires the one-product witness to publish NO multiproduct
      record (`products`, `productStages`, `productTrains`, Gantt kinds).

By-hand sabotages (2026-10-19), each run against this gate:
  S1  BatchPlanPass.cpp: `t.cycleTime = s.effectiveCycle` -> `s.cycleTime`
      (out-of-phase units ignored for T_L).  SURVIVED its first run: the
      out-of-phase fixture made packaging FAST, so it stopped limiting and
      T_L never read its effective cycle -- a guard whose case never
      reaches it.  The fixture now slows packaging to 14 h a lot with two
      lines out of phase, so it limits at t / 2, and (d) catches it (T_L 16
      published against 8 recomputed, and everything downstream of it).
  S2  BatchPlanPass.cpp: the side-feed back-schedule drops `- s.chargeTime`:
      caught by (a) (suspensionPreparation's offset and its Gantt bars).
  S3  BatchPlanPass.cpp: `busyHours` drops the changeover term: caught by
      (a) (busy/occupancy/idle of every stage).
  S4  DeclaredQuote.cpp: the scale omits `unitsInstalled`: caught by (d)
      only, on the fixture with parallel units (the coater at two in phase,
      the packaging line at two out of phase: each C_p half the
      recomputed) -- the witness has one unit per stage, so (b) cannot see it.
  S5  BatchPlanPass.cpp: the stage-occupancy refusal disabled: caught by
      (e) stageBusy (the train refusal then speaks instead, without the
      stage's name and its `outOfPhase` remedy).
  S2 was caught by (a) and every fixture (suspensionPreparation's offset
  12.25 published against 11.75); S3 by (a) and every fixture (busy, occupancy
  and idle hours of every stage).

By-hand sabotages of the multiproduct pass (2026-10-20), each run against
arms (h)-(k) with the engine rebuilt:
  S6  BatchPlanPass.cpp: the clean before the next product ADDED to the
      same-product changeover (`pt.campaigns * t.changeover + pco`): caught
      by (h), (i) and (j) -- every requiredTime and start 24 h off per
      product, and the one-product twin no longer the one-product plan.
  S7  BatchPlanPass.cpp: the stage sized by the LAST product instead of the
      largest: caught by (h) and (i) (sizingProduct on nine stages, the
      press's rate 87.5 against 100, two scaled quotes).
  S8  BatchPlanPass.cpp: `changeoverTo` ignored, the stage's
      productChangeover always taken: caught by (h) (strengthB's coating
      clean 8 against 10, and everything downstream).  It SURVIVED arm (i)'s
      first form, which compared the RECOMPUTED years of the two orders --
      a recomputation moves with the order by construction, so the arm was
      testing this gate's arithmetic and not the engine's; (i) now reads
      the published years and catches it (0 h moved, 2 h recomputed).
  S9  BatchPlanPass.cpp: the ownBalance announcement dropped: caught by (h)
      and (i) (findings [] against ['ownBalance:strengthB']).
  S10 BatchPlanPass.cpp: a `throughFedStage` discharge read from the STAGE's
      default processing time instead of the PRODUCT's: caught by (h), (i)
      and (j) (the solution tank's cycle 6 h against 53.14 h, the spray-
      drying train's limiting stage and cycle, the one-product twin).
  S11 BatchPlanPass.cpp: the `campaignOrder` requirement dropped (the
      declaration order taken in silence): caught by (k) noOrder only.
"""

import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BIN = ROOT / "choupoSolve"
WITNESS = ROOT / "tutorials/batch/plant/apalutamide01_tablets"
ECON = ROOT / "tutorials/steady/economics/economics01_esterification_dcf"
ENV = {"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"}
REL = 1e-6

fails = []
claims = []


def fail(msg):
    fails.append(msg)


# ------------------------------------------------- a small dict reader --
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


UNITS = {"h": 1.0, "hr": 1.0, "min": 1 / 60.0, "day": 24.0, "s": 1 / 3600.0,
         "kg": 1.0, "t": 1000.0, "g": 1e-3,
         "m3": 1.0, "L": 1e-3,
         "kg/m3": 1.0, "g/mL": 1000.0,
         "kg/h": 1.0, "kg/s": 3600.0, "t/h": 1000.0}


def val(d, key):
    v = d[key]
    x = float(v[0])
    return x * UNITS[v[1]] if len(v) > 1 else x


def word(d, key, default=None):
    return d[key][0] if key in d else default


# ------------------------------------------------- running -------------------
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


def copy_witness(work, name, edit=None):
    d = work / name
    if d.exists():
        shutil.rmtree(d)
    shutil.copytree(WITNESS, d, ignore=shutil.ignore_patterns(
        "reports", "converged", "design", "iterations", "expected"))
    if edit:
        pd = d / "system" / "postDict"
        pd.write_text(edit(pd.read_text()))
    return d


def solve(d):
    out, err, rc = run([str(BIN), str(d)])
    return out, err, rc, result_json(out)


def close(a, b, rel=REL):
    return abs(a - b) <= rel * max(abs(a), abs(b), 1e-12) + 1e-12


def sub(text, old, new, count=1):
    if old not in text:
        raise RuntimeError(f"fixture anchor not found: {old!r}")
    return text.replace(old, new, count)


def stage_edit(text, stage, old, new):
    """Edit `old` -> `new` inside the stage block named `stage`."""
    m = re.search(r"\{\s*\n\s*stage\s+%s;.*?\n        \}" % re.escape(stage), text, re.S)
    if not m:
        raise RuntimeError(f"stage {stage} not found")
    blk = m.group(0)
    if old not in blk:
        raise RuntimeError(f"anchor {old!r} not in stage {stage}")
    return text[:m.start()] + blk.replace(old, new, 1) + text[m.end():]


# ------------------------------------------------- the recomputation -------------
def recompute(case_dir, j):
    """The batch plan the DECLARATION implies, from the postDict and the
    published stream masses alone."""
    pd = read_dict(case_dir / "system" / "postDict")
    bp = pd["batchPlan"]
    streams = j["streams"]
    rate = lambda s: streams[s]["F_mass"] * 3600.0
    unit_type = {}
    fs = read_dict(case_dir / "system" / "flowsheetDict")
    for u in fs["units"]:
        unit_type[u["name"][0]] = u["type"][0]

    P = word(bp, "product")
    rP = rate(P)
    Q = val(bp["production"], "perYear")
    low = val(bp, "lowUtilisation") if "lowUtilisation" in bp else 0.25
    lot = bp["lot"]
    rule = word(lot, "rule")

    trains = {}
    for t in bp["trains"]:
        trains[word(t, "train")] = dict(
            avail=val(t, "availableTime"), nc=int(val(t, "lotsPerCampaign")),
            co=val(t, "changeover"), stages=[])
    stages = {}
    order = []
    for s in bp["stages"]:
        n = word(s, "stage")
        st = dict(name=n, train=word(s, "train"), type=word(s, "type"),
                  units=s["units"], holds=word(s, "holds"),
                  nip=int(val(s, "inPhase")) if "inPhase" in s else 1,
                  nop=int(val(s, "outOfPhase")) if "outOfPhase" in s else 1,
                  charge=val(s, "chargeTime"), clean=val(s, "cleanTime"),
                  feeds=word(s, "feeds"))
        st["rate_fs"] = rate(st["holds"])
        st["f"] = st["rate_fs"] / rP
        st["rated"] = [u for u in st["units"] if unit_type.get(u) == "sprayDryer"]
        if st["type"] == "batch":
            st["rho"] = val(s, "bulkDensity")
            st["phi"] = val(s, "fillFraction")
            st["S"] = st["f"] / (st["rho"] * st["phi"])
            st["vmax"] = val(s, "maxVolume") if "maxVolume" in s else None
            st["proc"] = val(s, "processTime")
            st["from"] = None
        else:
            if word(s, "operatingTime") == "fromFlowsheet":
                st["from"] = "flowsheet"
                st["proc"] = None
            else:
                st["from"] = "declared"
                st["proc"] = val(s, "operatingTime")
        st["disch_fed"] = word(s, "dischargeTime") == "throughFedStage"
        st["disch"] = None if st["disch_fed"] else val(s, "dischargeTime")
        stages[n] = st
        order.append(n)
        trains[st["train"]]["stages"].append(n)
    for t in trains.values():
        for k, n in enumerate(t["stages"]):
            st = stages[n]
            if st["feeds"] == "none":
                st["feeds"] = None
            elif st["feeds"] is None and k + 1 < len(t["stages"]):
                st["feeds"] = t["stages"][k + 1]

    if rule == "declared":
        B = val(lot, "mass") * rP / rate(word(lot, "stream"))
        lot_lim = None
    else:
        cands = [(st["nip"] * st["vmax"] / st["S"], n) for n, st in stages.items()
                 if st["type"] == "batch"]
        B, lot_lim = min(cands)
    N = math.ceil(Q / B - 1e-9 * Q / B)

    for st in stages.values():
        st["m"] = st["f"] * B
        if st["type"] == "batch":
            st["V"] = st["S"] * B
            st["Vu"] = st["V"] / st["nip"]
        else:
            if st["from"] == "flowsheet":
                st["proc"] = st["m"] / (st["nip"] * st["rate_fs"])
            st["R"] = st["m"] / st["proc"]
            st["Ru"] = st["R"] / st["nip"]
    for st in stages.values():
        if st["disch_fed"]:
            st["disch"] = stages[st["feeds"]]["proc"]
        st["t"] = st["charge"] + st["proc"] + st["disch"] + st["clean"]
        st["teff"] = st["t"] / st["nop"]

    findings = set()
    gantt = {}
    for tn, t in trains.items():
        names = t["stages"]
        TL, lim = -1.0, None
        for n in names:
            if stages[n]["teff"] > TL + 1e-12:
                TL, lim = stages[n]["teff"], n
        t["TL"], t["lim"] = TL, lim
        # offsets: forward along the feeds, side feeds backwards
        fed_by = {}
        for n in names:
            if stages[n]["feeds"]:
                fed_by.setdefault(stages[n]["feeds"], []).append(n)
        off = {}
        for k, n in enumerate(names):
            if k == 0:
                off[n] = 0.0
                continue
            starts = [off[f] + stages[f]["charge"] + stages[f]["proc"]
                      for f in fed_by.get(n, []) if f in off]
            if starts:
                off[n] = max(starts)
        for n in reversed(names):
            if n in off:
                continue
            st = stages[n]
            if st["feeds"]:
                tg = stages[st["feeds"]]
                off[n] = off[tg["name"]] + tg["charge"] - st["charge"] - st["proc"]
            else:
                off[n] = 0.0
        omin = min(off.values())
        for n in names:
            stages[n]["off"] = off[n] - omin
        last = max(stages[n]["off"] + stages[n]["t"] for n in names)
        span = lambda k: last + (k - 1) * TL
        nc = t["nc"]
        t["camp"] = (N + nc - 1) // nc
        full, rem = divmod(N, nc)
        nfirst = min(nc, N)
        t["span"] = span(nfirst)
        t["dur"] = t["span"] + t["co"]
        t["req"] = full * (span(nc) + t["co"]) + ((span(rem) + t["co"]) if rem else 0.0)
        t["occ"] = t["req"] / t["avail"]
        for n in names:
            st = stages[n]
            st["u"] = st["teff"] / TL
            st["busy"] = N * st["t"] / st["nop"] + t["camp"] * t["co"]
            st["occ"] = st["busy"] / t["avail"]
            st["idle"] = t["avail"] - st["busy"]
            for i in range(nfirst):
                gantt[f"gantt:{tn}:{n}:{i + 1}"] = (st["off"] + i * TL,
                                                    st["off"] + i * TL + st["t"],
                                                    (i % st["nop"]) + 1)
        gantt[f"gantt:{tn}:changeover"] = (t["span"], t["dur"], 0)
        if t["occ"] < low:
            findings.add(f"idleTrain:{tn}")
    for n, st in stages.items():
        if n != trains[st["train"]]["lim"] and st["u"] < low:
            findings.add(f"lowUtilisation:{n}")
        if st["from"] == "declared" and st["rated"]:
            if abs(st["Ru"] / st["rate_fs"] - 1.0) > 0.01:
                findings.add(f"capacityMismatch:{n}")
    claimed = set(u for st in stages.values() for u in st["units"])
    unplanned = [u for u in unit_type if u not in claimed]
    return dict(rP=rP, Q=Q, B=B, N=N, rule=rule, lot_lim=lot_lim,
                Heq=Q / rP, SF=Q / rP / 8760.0, stages=stages, trains=trains,
                gantt=gantt, findings=findings, unplanned=unplanned, pd=pd)


def compare(tag, case_dir, j):
    """Hold the published block to the recomputation; return it."""
    b = j.get("batchPlan")
    if not b:
        fail(f"{tag}: no `batchPlan` block in the result JSON")
        return None
    R = recompute(case_dir, j)
    bad = []

    def chk(what, got, want):
        if got is None or not close(float(got), float(want)):
            bad.append(f"{what} published {got} recomputed {want:.9g}")

    s = b["summary"]
    chk("productRate", s["productRate"], R["rP"])
    chk("lotSize", s["lotSize"], R["B"])
    chk("lotsPerYear", s["lotsPerYear"], R["N"])
    chk("production", s["production"], R["N"] * R["B"])
    chk("equivalentHours", s["equivalentHours"], R["Heq"])
    chk("streamFactor", s["streamFactor"], R["SF"])
    if R["lot_lim"] and s.get("lotLimitingStage") != R["lot_lim"]:
        bad.append(f"lotLimitingStage {s.get('lotLimitingStage')} != {R['lot_lim']}")
    if sorted(s["unplannedUnits"]) != sorted(R["unplanned"]):
        bad.append(f"unplannedUnits {s['unplannedUnits']} != {R['unplanned']}")
    for t in b["trains"]:
        r = R["trains"][t["name"]]
        if t["limitingStage"] != r["lim"]:
            bad.append(f"train {t['name']} limiting {t['limitingStage']} != {r['lim']}")
        for k, w in (("cycleTime", "TL"), ("campaigns", "camp"), ("campaignSpan", "span"),
                     ("campaignDuration", "dur"), ("requiredTime", "req"),
                     ("occupancy", "occ")):
            chk(f"train {t['name']} {k}", t[k], r[w])
    for st in b["stages"]:
        r = R["stages"][st["name"]]
        if (st["limiting"] == "yes") != (st["name"] == R["trains"][r["train"]]["lim"]):
            bad.append(f"stage {st['name']} limiting flag")
        pairs = [("massPerLot", "m"), ("processTime", "proc"), ("dischargeTime", "disch"),
                 ("cycleTime", "t"), ("effectiveCycle", "teff"), ("utilisation", "u"),
                 ("offset", "off"), ("busyHours", "busy"), ("occupancy", "occ"),
                 ("idleHours", "idle")]
        if r["type"] == "batch":
            pairs += [("sizeFactor", "S"), ("volume", "V"), ("volumePerUnit", "Vu")]
        else:
            pairs += [("rate", "R"), ("ratePerUnit", "Ru")]
        for k, w in pairs:
            chk(f"stage {st['name']} {k}", st[k], r[w])
        if st["unitsInstalled"] != r["nip"] * r["nop"]:
            bad.append(f"stage {st['name']} unitsInstalled")
    pub_g = {g["id"]: g for g in b["gantt"]}
    if set(pub_g) != set(R["gantt"]):
        bad.append(f"gantt ids differ: extra {sorted(set(pub_g) - set(R['gantt']))[:3]}"
                   f" missing {sorted(set(R['gantt']) - set(pub_g))[:3]}")
    for gid, (a, e, u) in R["gantt"].items():
        g = pub_g.get(gid)
        if g and (not close(g["start"], a) or not close(g["end"], e) or g["unit"] != u):
            bad.append(f"{gid} [{g['start']}, {g['end']}] u{g['unit']} recomputed"
                       f" [{a:.6g}, {e:.6g}] u{u}")
    got_f = set(f["id"] for f in b["findings"])
    if got_f != R["findings"]:
        bad.append(f"findings {sorted(got_f)} recomputed {sorted(R['findings'])}")
    if s["findings"] != len(b["findings"]):
        bad.append("summary findings count")
    if bad:
        fail(f"{tag}: " + "; ".join(bad[:8]) + (f" (+{len(bad) - 8} more)" if len(bad) > 8 else ""))
    return R


def check_consequences(tag, j, R):
    """(b): the vessels, the scaled quotes and the economics follow the plan."""
    bad = []
    pd = R["pd"]
    vessels = [u for u in pd["sizing"]["units"]
               if u.get("designRules", {}).get("volume") == ["fromBatchPlan"]]
    eq = {e["item"]: e for e in j.get("equipment", [])}
    for v in vessels:
        n = v["unitName"][0]
        st = next(s for s in R["stages"].values() if n in s["units"])
        e = eq.get(n)
        V = e and e.get("values", {}).get("V_R")
        if V is None or not close(V, st["Vu"]):
            bad.append(f"vessel {n} V {V} != stage volume per unit {st['Vu']:.6g}")
    nscaled = 0
    for q in pd["costing"].get("quotes", []):
        if "scaling" not in q:
            continue
        nscaled += 1
        n = q["unit"][0]
        st = next(s for s in R["stages"].values() if n in s["units"])
        sc = q["scaling"]
        ref = val(sc, "referenceSize")
        size = st["Vu"] if st["type"] == "batch" else st["Ru"]
        cp = float(q["value"][0]) * st["nip"] * st["nop"] * (size / ref) ** float(sc["exponent"][0])
        e = eq.get(n)
        got = e and e["cost"]["purchased"]
        if got is None or not close(got, cp):
            bad.append(f"quote {n} C_p {got} recomputed {cp:.9g}")
    econ = pd.get("economics", {})
    if econ.get("streamFactor") == ["fromBatchPlan"]:
        m = re.search(r"Equivalent hours H = Q / r_P = .*?\(streamFactor ([0-9.]+),", j["_out"])
        if not m or not close(float(m.group(1)), R["SF"], 1e-5):
            bad.append("the economics' streamFactor is not Q / (r_P 8760)")
    if bad:
        fail(f"{tag}: " + "; ".join(bad))
    return len(vessels), nscaled


# ------------------------------------------------- MULTIPRODUCT (C110 G2) -------
#  The probe: a copy of the witness whose plan makes THREE products on the
#  same trains, in a declared campaign order, each stage cleaned between
#  products.  Every number is the probe's own, chosen to exercise one rule
#  each (a product with its own lot, its own balance on one stream, its own
#  times and densities, a sequence-dependent clean, a partial campaign);
#  NOTHING here describes a real product.
PCO = {"solutionPreparation": "0 h", "sprayDrying": "0 h", "blending": "4 h",
       "granulation": "6 h", "finalBlending": "4 h", "compression": "8 h",
       "suspensionPreparation": "2 h", "coating": "8 h", "packaging": "6 h"}

PRODUCTS = """
    products
    (
        {
            product  strengthA;
            perYear  20000 kg;
            source   "probe (check_batch_plan, multiproduct arm)";
            reason   "the high-volume strength, on the flowsheet's balance and the plan's lot";
        }
        {
            product  strengthB;
            perYear  8000 kg;
            lot
            {
                rule declared;  stream finalBlend;  mass 300 kg;
                source "probe";  reason "a smaller lot for the second strength";
            }
            massPerProduct { coatingSuspension 0.12; }
            stages
            (
                { stage blending;  cleanTime 1.5 h;  source "probe";  reason "a stickier blend"; }
                { stage finalBlending;  bulkDensity 550 kg/m3;  fillFraction 0.55;
                  source "probe";  reason "a denser final blend"; }
                { stage compression;  operatingTime 3 h;  source "probe";  reason "fewer, heavier tablets"; }
                { stage coating;  processTime 3.5 h;  changeoverTo { strengthC 10 h; }
                  source "probe";  reason "a darker coat, harder to clean out"; }
                { stage packaging;  operatingTime 4 h;  source "probe";  reason "fewer tablets a lot"; }
            );
            source   "probe (check_batch_plan, multiproduct arm)";
            reason   "a second strength with its own lot, coat and times";
        }
        {
            product  strengthC;
            perYear  1500 kg;
            stages
            (
                { stage packaging;  operatingTime 9 h;  chargeTime 1.5 h;
                  source "probe";  reason "a bottle line"; }
            );
            source   "probe (check_batch_plan, multiproduct arm)";
            reason   "a small strength, one partial campaign";
        }
    );
    campaignOrder ( ORDER );
"""


def multi_edit(order="strengthA strengthB strengthC", products=PRODUCTS, pco=PCO, extra=None):
    """The witness's postDict made multiproduct: `production {}` replaced by
    `products ( ... ); campaignOrder ( ... );`, and every stage given its
    clean between products."""
    def edit(t):
        m = re.search(r"\n    production\n    \{.*?\n    \}\n", t, re.S)
        if not m:
            raise RuntimeError("production block not found")
        t = t[:m.start()] + "\n" + products.replace("ORDER", order) + t[m.end():]
        for st, v in (pco or {}).items():
            t = stage_edit(t, st, "source ", f"productChangeover {v};\n            source ")
        return extra(t) if extra else t
    return edit


def recompute_multi(case_dir, j):
    """The multiproduct plan the DECLARATION implies (postDict + published
    stream masses), recomputed here and independently of the engine."""
    pd = read_dict(case_dir / "system" / "postDict")
    bp = pd["batchPlan"]
    streams = j["streams"]
    rate = lambda s: streams[s]["F_mass"] * 3600.0
    unit_type = {}
    fs = read_dict(case_dir / "system" / "flowsheetDict")
    for u in fs["units"]:
        unit_type[u["name"][0]] = u["type"][0]
    P = word(bp, "product")
    rP = rate(P)
    low = val(bp, "lowUtilisation") if "lowUtilisation" in bp else 0.25

    trains = {}
    for t in bp["trains"]:
        trains[word(t, "train")] = dict(
            avail=val(t, "availableTime"), nc=int(val(t, "lotsPerCampaign")),
            co=val(t, "changeover"), stages=[])
    base = {}
    for s in bp["stages"]:
        n = word(s, "stage")
        b = dict(name=n, train=word(s, "train"), type=word(s, "type"),
                 units=s["units"], holds=word(s, "holds"), feeds=word(s, "feeds"),
                 nip=int(val(s, "inPhase")) if "inPhase" in s else 1,
                 nop=int(val(s, "outOfPhase")) if "outOfPhase" in s else 1,
                 d=s)
        b["rate_fs"] = rate(b["holds"])
        b["rated"] = [u for u in b["units"] if unit_type.get(u) == "sprayDryer"]
        b["pco"] = val(s, "productChangeover") if "productChangeover" in s else None
        b["vmax"] = val(s, "maxVolume") if "maxVolume" in s else None
        base[n] = b
        trains[b["train"]]["stages"].append(n)
    for t in trains.values():
        for k, n in enumerate(t["stages"]):
            b = base[n]
            if b["feeds"] == "none":
                b["feeds"] = None
            elif b["feeds"] is None and k + 1 < len(t["stages"]):
                b["feeds"] = t["stages"][k + 1]

    prods = bp["products"]
    names = [word(p, "product") for p in prods]
    order = bp.get("campaignOrder", names)
    NP = len(order)
    pdecl = {word(p, "product"): p for p in prods}
    top_lot = bp.get("lot")

    PR = {}
    for i, pn in enumerate(order):
        p = pdecl[pn]
        Q = val(p, "perYear")
        lot = p.get("lot", top_lot)
        mpp = {k: float(v[0]) for k, v in p.get("massPerProduct", {}).items()}
        ovr = {word(o, "stage"): o for o in p.get("stages", [])}
        f = lambda s: mpp[s] if s in mpp else rate(s) / rP
        nxt = order[(i + 1) % NP]
        ps = {}
        for n, b in base.items():
            s, o = b["d"], ovr.get(n, {})
            x = dict(f=f(b["holds"]))
            x["charge"] = val(o, "chargeTime") if "chargeTime" in o else val(s, "chargeTime")
            x["clean"] = val(o, "cleanTime") if "cleanTime" in o else val(s, "cleanTime")
            if b["type"] == "batch":
                x["rho"] = val(o, "bulkDensity") if "bulkDensity" in o else val(s, "bulkDensity")
                x["phi"] = val(o, "fillFraction") if "fillFraction" in o else val(s, "fillFraction")
                x["S"] = x["f"] / (x["rho"] * x["phi"])
                x["proc"] = val(o, "processTime") if "processTime" in o else val(s, "processTime")
                x["from"] = None
            else:
                src = o if "operatingTime" in o else s
                if word(src, "operatingTime") == "fromFlowsheet":
                    x["from"], x["proc"] = "flowsheet", None
                else:
                    x["from"], x["proc"] = "declared", val(src, "operatingTime")
            src = o if "dischargeTime" in o else s
            x["disch_fed"] = word(src, "dischargeTime") == "throughFedStage"
            x["disch"] = None if x["disch_fed"] else val(src, "dischargeTime")
            to = o.get("changeoverTo", {})
            if NP < 2:
                x["coAfter"] = trains[b["train"]]["co"]
            elif nxt in to:
                x["coAfter"] = val(to, nxt)
            else:
                x["coAfter"] = b["pco"]
            ps[n] = x
        rule = word(lot, "rule")
        lot_lim = None
        if rule == "declared":
            B = val(lot, "mass") / f(word(lot, "stream"))
        else:
            B, lot_lim = min((base[n]["nip"] * base[n]["vmax"] / x["S"], n)
                             for n, x in ps.items() if base[n]["type"] == "batch")
        N = math.ceil(Q / B - 1e-9 * Q / B)
        for n, x in ps.items():
            b = base[n]
            x["m"] = x["f"] * B
            if b["type"] == "batch":
                x["V"] = x["S"] * B
                x["Vu"] = x["V"] / b["nip"]
            else:
                if x["from"] == "flowsheet":
                    x["proc"] = x["m"] / (b["nip"] * b["rate_fs"])
                x["R"] = x["m"] / x["proc"]
                x["Ru"] = x["R"] / b["nip"]
        for n, x in ps.items():
            if x["disch_fed"]:
                x["disch"] = ps[base[n]["feeds"]]["proc"]
            x["t"] = x["charge"] + x["proc"] + x["disch"] + x["clean"]
            x["teff"] = x["t"] / base[n]["nop"]
        PR[pn] = dict(Q=Q, B=B, N=N, rule=rule, lot_lim=lot_lim, stages=ps,
                      next=nxt, own=sorted(mpp))

    gantt, findings, PT = {}, set(), {}
    for tn, t in trains.items():
        snames = t["stages"]
        clock = 0.0
        t["req"], t["camp"], t["coh"] = 0.0, 0, 0.0
        for pn in order:
            pr = PR[pn]
            ps = pr["stages"]
            TL, lim = -1.0, None
            for n in snames:
                if ps[n]["teff"] > TL + 1e-12:
                    TL, lim = ps[n]["teff"], n
            fed_by = {}
            for n in snames:
                if base[n]["feeds"]:
                    fed_by.setdefault(base[n]["feeds"], []).append(n)
            off = {}
            for k, n in enumerate(snames):
                if k == 0:
                    off[n] = 0.0
                    continue
                starts = [off[g] + ps[g]["charge"] + ps[g]["proc"]
                          for g in fed_by.get(n, []) if g in off]
                if starts:
                    off[n] = max(starts)
            for n in reversed(snames):
                if n in off:
                    continue
                if base[n]["feeds"]:
                    tg = base[n]["feeds"]
                    off[n] = off[tg] + ps[tg]["charge"] - ps[n]["charge"] - ps[n]["proc"]
                else:
                    off[n] = 0.0
            omin = min(off.values())
            for n in snames:
                ps[n]["off"] = off[n] - omin
                ps[n]["u"] = ps[n]["teff"] / TL
                ps[n]["lim"] = (n == lim)
            last = max(ps[n]["off"] + ps[n]["t"] for n in snames)
            span = lambda k: last + (k - 1) * TL
            nc, N = t["nc"], pr["N"]
            camp = (N + nc - 1) // nc
            full, rem = divmod(N, nc)
            pco = max(ps[n]["coAfter"] for n in snames) if NP >= 2 else t["co"]
            req = full * span(nc) + (span(rem) if rem else 0.0) + (camp - 1) * t["co"] + pco
            PT[(pn, tn)] = dict(TL=TL, lim=lim, camp=camp,
                               last_lots=rem if rem else min(nc, N),
                               span=span(min(nc, N)), start=clock, pco=pco, req=req)
            #  the year's Gantt on this train, from `clock`
            c0 = clock
            for k in range(1, camp + 1):
                n_l = nc if k <= full else rem
                gantt[f"gantt:{tn}:{pn}:campaign:{k}"] = (c0, c0 + span(n_l), 0, "campaign")
                if k == 1:
                    for n in snames:
                        x = ps[n]
                        for l in range(n_l):
                            a = c0 + x["off"] + l * TL
                            gantt[f"gantt:{tn}:{pn}:{n}:{l + 1}"] = (
                                a, a + x["t"], (l % base[n]["nop"]) + 1, "lot")
                c0 += span(n_l)
                if k < camp or NP < 2:
                    gantt[f"gantt:{tn}:{pn}:changeover:{k}"] = (c0, c0 + t["co"], 0, "changeover")
                    c0 += t["co"]
                else:
                    gantt[f"gantt:{tn}:{pn}:productChangeover"] = (c0, c0 + pco, 0,
                                                                   "productChangeover")
                    for n in snames:
                        gantt[f"gantt:{tn}:{pn}:{n}:clean"] = (c0, c0 + ps[n]["coAfter"], 0,
                                                               "stageClean")
                    c0 += pco
            clock += req
            t["req"] += req
            t["camp"] += camp
            t["coh"] += (camp - 1) * t["co"] + pco
        t["occ"] = t["req"] / t["avail"]
        if t["occ"] < low:
            findings.add(f"idleTrain:{tn}")

    ST = {}
    for n, b in base.items():
        t = trains[b["train"]]
        busy = sum(PR[pn]["N"] * PR[pn]["stages"][n]["t"] / b["nop"]
                   + (PT[(pn, b["train"])]["camp"] - 1) * t["co"]
                   + PR[pn]["stages"][n]["coAfter"] for pn in order)
        key = "Vu" if b["type"] == "batch" else "Ru"
        best, who = -1.0, None
        for pn in order:
            v = PR[pn]["stages"][n][key]
            if who is None or v > best * (1.0 + 1e-9):
                best, who = v, pn
        umax = max(PR[pn]["stages"][n]["u"] for pn in order)
        lim = any(PR[pn]["stages"][n]["lim"] for pn in order)
        ST[n] = dict(b, busy=busy, occ=busy / t["avail"], idle=t["avail"] - busy,
                     sizing=who, umax=umax, limiting=lim,
                     Vu=best if b["type"] == "batch" else None,
                     Ru=best if b["type"] != "batch" else None)
        if not lim and umax < low:
            findings.add(f"lowUtilisation:{n}")
        for pn in order:
            x = PR[pn]["stages"][n]
            if (x["from"] == "declared" and b["rated"]
                    and abs(x["Ru"] / b["rate_fs"] - 1.0) > 0.01):
                findings.add(f"capacityMismatch:{pn}:{n}")
    for pn in order:
        if PR[pn]["own"]:
            findings.add(f"ownBalance:{pn}")
    claimed = set(u for b in base.values() for u in b["units"])
    unplanned = [u for u in unit_type if u not in claimed]
    Qt = sum(PR[pn]["Q"] for pn in order)
    return dict(rP=rP, Q=Qt, order=order, products=PR, ptrains=PT, stages=ST,
                trains=trains, gantt=gantt, findings=findings, unplanned=unplanned,
                N=sum(PR[pn]["N"] for pn in order),
                prod=sum(PR[pn]["N"] * PR[pn]["B"] for pn in order),
                Heq=Qt / rP, SF=Qt / rP / 8760.0, pd=pd)


def compare_multi(tag, case_dir, j):
    """Hold a multiproduct block to `recompute_multi`; return it."""
    b = j.get("batchPlan")
    if not b:
        fail(f"{tag}: no `batchPlan` block in the result JSON")
        return None
    R = recompute_multi(case_dir, j)
    bad = []

    def chk(what, got, want):
        if got is None or not close(float(got), float(want)):
            bad.append(f"{what} published {got} recomputed {want:.9g}")

    s = b["summary"]
    for k, w in (("productRate", R["rP"]), ("productPerYear", R["Q"]),
                 ("lotsPerYear", R["N"]), ("production", R["prod"]),
                 ("equivalentHours", R["Heq"]), ("streamFactor", R["SF"]),
                 ("products", len(R["order"]))):
        chk(f"summary {k}", s.get(k), w)
    if s.get("campaignOrder") != R["order"]:
        bad.append(f"campaignOrder {s.get('campaignOrder')} != {R['order']}")
    if sorted(s["unplannedUnits"]) != sorted(R["unplanned"]):
        bad.append("unplannedUnits")
    pub = {p["name"]: p for p in b.get("products", [])}
    if list(pub) != R["order"]:
        bad.append(f"products published {list(pub)}, the order is {R['order']}")
    for pn, r in R["products"].items():
        p = pub.get(pn)
        if not p:
            continue
        chk(f"product {pn} lotSize", p["lotSize"], r["B"])
        chk(f"product {pn} lotsPerYear", p["lotsPerYear"], r["N"])
        chk(f"product {pn} production", p["production"], r["N"] * r["B"])
        chk(f"product {pn} equivalentHours", p["equivalentHours"], r["Q"] / R["rP"])
        if p["next"] != r["next"]:
            bad.append(f"product {pn} next {p['next']} != {r['next']}")
        if sorted(p["ownBalance"]) != r["own"]:
            bad.append(f"product {pn} ownBalance {p['ownBalance']} != {r['own']}")
        if r["lot_lim"] and p.get("lotLimitingStage") != r["lot_lim"]:
            bad.append(f"product {pn} lotLimitingStage {p.get('lotLimitingStage')}")
    pt = {(x["product"], x["train"]): x for x in b.get("productTrains", [])}
    for key, r in R["ptrains"].items():
        x = pt.get(key)
        if not x:
            bad.append(f"productTrain {key} missing")
            continue
        if x["limitingStage"] != r["lim"]:
            bad.append(f"productTrain {key} limiting {x['limitingStage']} != {r['lim']}")
        for k, w in (("cycleTime", "TL"), ("campaigns", "camp"),
                     ("lotsLastCampaign", "last_lots"), ("campaignSpan", "span"),
                     ("start", "start"), ("productChangeover", "pco"),
                     ("requiredTime", "req")):
            chk(f"productTrain {key} {k}", x[k], r[w])
    pst = {(x["product"], x["stage"]): x for x in b.get("productStages", [])}
    for pn, pr in R["products"].items():
        for n, r in pr["stages"].items():
            x = pst.get((pn, n))
            if not x:
                bad.append(f"productStage {pn}:{n} missing")
                continue
            pairs = [("massPerProduct", "f"), ("massPerLot", "m"), ("chargeTime", "charge"),
                     ("processTime", "proc"), ("dischargeTime", "disch"),
                     ("cleanTime", "clean"), ("cycleTime", "t"), ("effectiveCycle", "teff"),
                     ("utilisation", "u"), ("offset", "off"), ("changeoverAfter", "coAfter")]
            if R["stages"][n]["type"] == "batch":
                pairs += [("sizeFactor", "S"), ("volume", "V"), ("volumePerUnit", "Vu")]
            else:
                pairs += [("rate", "R"), ("ratePerUnit", "Ru")]
            for k, w in pairs:
                chk(f"productStage {pn}:{n} {k}", x.get(k), r[w])
            if (x["limiting"] == "yes") != r["lim"]:
                bad.append(f"productStage {pn}:{n} limiting flag")
    for st in b["stages"]:
        r = R["stages"][st["name"]]
        if r["type"] == "batch":
            chk(f"stage {st['name']} volumePerUnit", st.get("volumePerUnit"), r["Vu"])
        else:
            chk(f"stage {st['name']} ratePerUnit", st.get("ratePerUnit"), r["Ru"])
        for k, w in (("busyHours", "busy"), ("occupancy", "occ"), ("idleHours", "idle"),
                     ("maxUtilisation", "umax")):
            chk(f"stage {st['name']} {k}", st.get(k), r[w])
        if st.get("sizingProduct") != r["sizing"]:
            bad.append(f"stage {st['name']} sizingProduct {st.get('sizingProduct')}"
                       f" != {r['sizing']}")
        if (st["limiting"] == "yes") != r["limiting"]:
            bad.append(f"stage {st['name']} limiting flag")
        if r["pco"] is not None:
            chk(f"stage {st['name']} productChangeover", st.get("productChangeover"), r["pco"])
        if st["unitsInstalled"] != r["nip"] * r["nop"]:
            bad.append(f"stage {st['name']} unitsInstalled")
    for t in b["trains"]:
        r = R["trains"][t["name"]]
        for k, w in (("campaigns", "camp"), ("requiredTime", "req"), ("occupancy", "occ"),
                     ("changeoverHours", "coh")):
            chk(f"train {t['name']} {k}", t.get(k), r[w])
        chk(f"train {t['name']} productChangeovers", t.get("productChangeovers"),
            len(R["order"]) if len(R["order"]) >= 2 else 0)
    pub_g = {g["id"]: g for g in b["gantt"]}
    if set(pub_g) != set(R["gantt"]):
        bad.append(f"gantt ids differ: extra {sorted(set(pub_g) - set(R['gantt']))[:3]}"
                   f" missing {sorted(set(R['gantt']) - set(pub_g))[:3]}")
    for gid, (a, e, u, kind) in R["gantt"].items():
        g = pub_g.get(gid)
        if g and (not close(g["start"], a) or not close(g["end"], e) or g["unit"] != u
                  or g.get("kind") != kind):
            bad.append(f"{gid} [{g['start']}, {g['end']}] u{g['unit']} {g.get('kind')}"
                       f" recomputed [{a:.6g}, {e:.6g}] u{u} {kind}")
    for tn, t in R["trains"].items():
        ends = [e for gid, (a, e, u, k) in R["gantt"].items()
                if gid.startswith(f"gantt:{tn}:") and k in ("changeover", "productChangeover")]
        if not ends or not close(max(ends), t["req"]):
            bad.append(f"train {tn}: the year's Gantt does not end at its required time")
    got_f = set(f["id"] for f in b["findings"])
    if got_f != R["findings"]:
        bad.append(f"findings {sorted(got_f)} recomputed {sorted(R['findings'])}")
    if s["findings"] != len(b["findings"]):
        bad.append("summary findings count")
    if bad:
        fail(f"{tag}: " + "; ".join(bad[:8])
             + (f" (+{len(bad) - 8} more)" if len(bad) > 8 else ""))
    return R


# ------------------------------------------------- the arms ----------------------
def arm_witness(work):
    d = copy_witness(work, "witness")
    out, err, rc, j = solve(d)
    if rc != 0 or not j:
        fail(f"(a) the witness did not run (exit {rc}): {err[-400:]}")
        return
    j["_out"] = out
    R = compare("(a) witness", d, j)
    if R is None:
        return
    nv, nq = check_consequences("(b) witness", j, R)
    b = j["batchPlan"]
    # (c) surfaces
    for f in b["findings"]:
        if f"[batchPlan] {f['message']}" not in err:
            fail(f"(c) finding {f['id']} is not on stderr")
        if f["message"] not in out.split("BATCH PLAN  (", 1)[-1]:
            fail(f"(c) finding {f['id']} is not in the caveat block under BATCH PLAN")
        if not any(a.get("locus") == f["id"] for a in j.get("advisories", [])):
            fail(f"(c) finding {f['id']} is not in the advisories JSON")
    if not b["findings"]:
        fail("(c) the witness raises no finding, so the three surfaces are untested")
    for k in ("products", "productStages", "productTrains"):
        if k in b or k in b["summary"]:
            fail(f"(f) the one-product witness publishes a multiproduct `{k}`")
    if any(g.get("kind") or g.get("product") for g in b["gantt"]):
        fail("(f) the one-product witness's Gantt carries multiproduct fields")
    ns = len(b["stages"])
    claims.append(f"(a) the witness's {ns} stages in {len(b['trains'])} trains"
                  f" recompute (lot {R['B']:.4g} kg, {R['N']} lots/yr, T_L "
                  + ", ".join(f"{t}={r['TL']:.4g} h by {r['lim']}" for t, r in R["trains"].items())
                  + f", {len(b['gantt'])} Gantt bars, findings {sorted(R['findings'])})")
    claims.append(f"(b) {nv} vessel(s) sized from the plan, {nq} scaled quote(s) and"
                  " the economics' stream factor recompute")


def arm_announcements(work):
    def mismatch(t):
        return stage_edit(t, "sprayDrying", "operatingTime fromFlowsheet;", "operatingTime 40 h;")
    d = copy_witness(work, "mismatch", mismatch)
    out, err, rc, j = solve(d)
    if rc != 0 or not j:
        fail(f"(c) the capacity-mismatch fixture did not run (exit {rc})")
    else:
        j["_out"] = out
        compare("(c) capacityMismatch", d, j)
        if "capacityMismatch:sprayDrying" not in [f["id"] for f in j["batchPlan"]["findings"]]:
            fail("(c) a declared dryer time 15 % off its rate raised no capacityMismatch")
    d = copy_witness(work, "idle", lambda t: sub(t, "availableTime   3840 h;", "availableTime   8000 h;"))
    out, err, rc, j = solve(d)
    if rc != 0 or not j:
        fail(f"(c) the idle-train fixture did not run (exit {rc})")
    else:
        compare("(c) idleTrain", d, j)
        if "idleTrain:solidDose" not in [f["id"] for f in j["batchPlan"]["findings"]]:
            fail("(c) a train busy under a quarter of its year raised no idleTrain")
    claims.append("(c) the witness's findings reach stderr, the caveat block and the"
                  " JSON; capacityMismatch and idleTrain fire on their fixtures and recompute")


def arm_rules(work):
    def largest(t):
        t = sub(t, "        rule     declared;\n        stream   finalBlend;\n        mass     350 kg;",
                "        rule     largestEquipment;")
        for st, v in (("solutionPreparation", "3 m3"), ("blending", "1.2 m3"),
                      ("finalBlending", "1.5 m3"), ("suspensionPreparation", "0.2 m3"),
                      ("coating", "1 m3")):
            t = stage_edit(t, st, "fillFraction", f"maxVolume {v};  fillFraction")
        return t
    d = copy_witness(work, "largest", largest)
    out, err, rc, j = solve(d)
    if rc != 0 or not j:
        fail(f"(d) the largestEquipment fixture did not run (exit {rc}): {err[-300:]}")
    else:
        j["_out"] = out
        R = compare("(d) largestEquipment", d, j)
        if R and j["batchPlan"]["summary"].get("lotRule") != "largestEquipment":
            fail("(d) the lot rule word is not published")

    def parallel(t):
        t = stage_edit(t, "packaging", "operatingTime 8 h;", "operatingTime 14 h;")
        t = stage_edit(t, "packaging", "cleanTime 1 h;", "cleanTime 1 h;  outOfPhase 2;")
        t = stage_edit(t, "coating", "cleanTime 1 h;", "cleanTime 1 h;  inPhase 2;")
        return t
    d = copy_witness(work, "parallel", parallel)
    out, err, rc, j = solve(d)
    if rc != 0 or not j:
        fail(f"(d) the parallel-units fixture did not run (exit {rc}): {err[-300:]}")
    else:
        j["_out"] = out
        R = compare("(d) parallel units", d, j)
        if R:
            check_consequences("(d) parallel units", j, R)
            tr = R["trains"]["solidDose"]
            pk = R["stages"]["packaging"]
            if tr["lim"] != "packaging" or not close(tr["TL"], pk["t"] / 2.0):
                fail("(d) the slow packaging line, two out of phase, does not set"
                     " T_L = t / 2 -- the fixture no longer tests T_L = max t_j / N_op")
    claims.append("(d) `rule largestEquipment` and units in and out of phase recompute"
                  " (with the coater's scaled quote at two units)")


REFUSALS = [
    ("stageBusy", lambda t: sub(t, "availableTime   3840 h;", "availableTime   100 h;"),
     ["stage 'blending' is busy", "outOfPhase 2"]),
    ("trainLong", lambda t: sub(t, "availableTime   3840 h;", "availableTime   1300 h;"),
     ["train 'solidDose' needs", "unreachable"]),
    ("bareTime", lambda t: stage_edit(t, "blending", "processTime 0.5 h;", "processTime 0.5;"),
     ["carries no unit"]),
    ("badStream", lambda t: stage_edit(t, "blending", "holds intraBlend;", "holds noSuchStream;"),
     ["noSuchStream", "is not a"]),
    ("twoStages", lambda t: stage_edit(t, "finalBlending", "units  ( finalBlender );",
                                       "units  ( finalBlender blender );"),
     ["already in stage 'blending'"]),
    ("feedsEarlier", lambda t: stage_edit(t, "finalBlending", "type batch;",
                                          "type batch;  feeds blending;"),
     ["listed BEFORE"]),
    ("fromFsPlaceholder", lambda t: stage_edit(t, "compression", "operatingTime 4 h;",
                                               "operatingTime fromFlowsheet;"),
     ["no RATED unit"]),
    ("maxVolDeclared", lambda t: stage_edit(t, "blending", "fillFraction 0.6;",
                                            "fillFraction 0.6;  maxVolume 2 m3;"),
     ["read by nothing"]),
    ("noSource", lambda t: re.sub(r'(stage  packaging;.*?)\n            source "[^"]*";', r"\1", t,
                                  count=1, flags=re.S),
     ["`source", "packaging"]),
    ("fill", lambda t: stage_edit(t, "coating", "fillFraction 0.65;", "fillFraction 1.2;"),
     ["(0, 1]"]),
    ("scaleKind", lambda t: sub(t, "scaling { referenceSize 1 m3;", "scaling { referenceSize 100 kg/h;"),
     ["size kind"]),
    ("planBelowCosting", lambda t: move_plan_below_costing(t),
     ["ABOVE"]),
    ("numericSF", lambda t: sub(t, "streamFactor        fromBatchPlan;", "streamFactor        0.45;"),
     ["Two homes"]),
    ("twoVessels", lambda t: stage_edit(t, "solutionPreparation", "cleanTime 2 h;",
                                        "cleanTime 2 h;  outOfPhase 2;"),
     ["solutionPrep  FAILED", "ONE vessel"]),
]

#  A SIZER's refusal is the sizing pass's own kind: the unit is listed as
#  FAILED and not sized, the run goes on (SizingPass's rule, not this one's).
SOFT = {"twoVessels"}


def move_plan_below_costing(t):
    m = re.search(r"\nbatchPlan\n\{.*?\n\}\n", t, re.S)
    blk = m.group(0)
    t = t[:m.start()] + "\n" + t[m.end():]
    i = t.index("\neconomics\n{")
    return t[:i] + blk + t[i:]


def arm_refusals(work):
    for tag, edit, want in REFUSALS:
        try:
            d = copy_witness(work, "ref_" + tag, edit)
        except RuntimeError as e:
            fail(f"(e) {tag}: fixture could not be built ({e})")
            continue
        out, err, rc, _ = solve(d)
        text = out + err
        if rc == 0 and tag not in SOFT:
            fail(f"(e) {tag}: ran to exit 0 -- not refused")
        elif not all(w in text for w in want):
            tail = (err.strip().splitlines() or ["(no stderr)"])[-1][:240]
            fail(f"(e) {tag}: refused (exit {rc}) without naming {want}: {tail}")
    claims.append(f"(e) {len(REFUSALS)} refusals fire, each naming its defect")


def arm_absent(work):
    d = work / "econ"
    if d.exists():
        shutil.rmtree(d)
    shutil.copytree(ECON, d, ignore=shutil.ignore_patterns(
        "reports", "converged", "design", "iterations"))
    out, err, rc, j = solve(d)
    if rc != 0 or not j:
        fail(f"(f) economics01 did not run (exit {rc})")
    elif "batchPlan" in j or "[batchPlan]" in out + err:
        fail("(f) a case with no batchPlan publishes or prints one")
    else:
        claims.append("(f) a case with no batchPlan publishes no block and prints no line")


def arm_golden(work):
    d = copy_witness(work, "golden")
    out, err, rc = run([str(ROOT / "bin/runTests"), "--record", str(d)], timeout=1200)
    exp = d / "expected"
    if rc != 0 or not exp.exists():
        fail(f"(g) runTests --record on the witness copy exited {rc}")
        return
    rows = [l for l in exp.read_text().splitlines() if l.startswith("batch ")]
    ids = set(l.split()[1].split(":")[0] for l in rows)
    for k in ("batchPlan", "train", "stage"):
        if k not in ids:
            fail(f"(g) the recorded golden pins no `batch` row for {k}")
            return
    out, err, rc = run([str(ROOT / "bin/runTests"), str(d)], timeout=1200)
    if rc != 0 or "FAIL 0" not in out:
        fail(f"(g) runTests on the freshly recorded copy did not pass (exit {rc})")
        return
    pd = d / "system" / "postDict"
    pd.write_text(stage_edit(pd.read_text(), "coating", "processTime 3 h;", "processTime 3.5 h;"))
    out, err, rc = run([str(ROOT / "bin/runTests"), str(d)], timeout=1200)
    if rc == 0 or "stage:coating" not in out:
        fail("(g) a moved coating time did not fail the golden on its stage:coating row")
        return
    claims.append(f"(g) --record pins {len(rows)} `batch` rows on the witness, the check"
                  " passes on them, and a coating time moved by 0.5 h fails it on the"
                  " stage:coating row")



def arm_multiproduct(work):
    """(h) the three-product probe recomputes, and its consequences follow
    the LARGEST size any product needs; (i) the order moves the year."""
    d = copy_witness(work, "multi", multi_edit())
    out, err, rc, j = solve(d)
    if rc != 0 or not j:
        fail(f"(h) the multiproduct probe did not run (exit {rc}): {err[-400:]}")
        return
    j["_out"] = out
    R = compare_multi("(h) multiproduct", d, j)
    if R is None:
        return
    nv, nq = check_consequences("(h) multiproduct", j, R)
    b = j["batchPlan"]
    for f in b["findings"]:
        if f"[batchPlan] {f['message']}" not in err:
            fail(f"(h) finding {f['id']} is not on stderr")
        if not any(a.get("locus") == f["id"] for a in j.get("advisories", [])):
            fail(f"(h) finding {f['id']} is not in the advisories JSON")
    if "ownBalance:strengthB" not in R["findings"]:
        fail("(h) strengthB's own coat raised no ownBalance announcement")
    # the probe must exercise what it claims to
    sz = {n: s["sizing"] for n, s in R["stages"].items()}
    if "strengthB" not in sz.values():
        fail("(h) no stage is sized by strengthB -- the max-over-products rule is untested")
    if R["products"]["strengthB"]["stages"]["coating"]["coAfter"] != 10.0:
        fail("(h) strengthB's coating clean before strengthC is not its changeoverTo")
    if R["ptrains"][("strengthC", "solidDose")]["camp"] != 1 or \
            R["products"]["strengthC"]["N"] >= R["trains"]["solidDose"]["nc"]:
        fail("(h) strengthC is no longer one partial campaign")
    sd = R["trains"]["solidDose"]
    lots = ", ".join("%s %d lots of %.4g kg" % (p, r["N"], r["B"])
                     for p, r in R["products"].items())
    claims.append(
        f"(h) a three-product probe recomputes ({lots};"
        f" solidDose {sd['camp']} campaigns, {sd['coh']:.4g} h of changeovers, {sd['req']:.6g} h/yr;"
        f" {len(b['gantt'])} Gantt bars ending at each train's required time; findings"
        f" {sorted(R['findings'])}); {nv} vessel(s) and {nq} scaled quote(s) take the"
        " largest size any product needs, the economics sum Q / r_P")

    # (i) the order is the student's decision and it moves the year
    d2 = copy_witness(work, "multi_order", multi_edit(order="strengthB strengthA strengthC"))
    out2, err2, rc2, j2 = solve(d2)
    if rc2 != 0 or not j2:
        fail(f"(i) the reordered probe did not run (exit {rc2})")
        return
    R2 = compare_multi("(i) reordered", d2, j2)
    if R2 is None:
        return
    #  The PUBLISHED years, not the recomputed ones: the recomputation moves
    #  with the order by construction, so comparing it would test this gate's
    #  arithmetic and not the engine's (sabotage S8 survived this arm until
    #  it read the result JSON).
    pub = lambda jj: next(t["requiredTime"] for t in jj["batchPlan"]["trains"]
                          if t["name"] == "solidDose")
    a, c = pub(j), pub(j2)
    # A B C: B -> C coats with the 10 h clean; B A C: every product change takes 8 h
    if not close(a - c, 2.0, 1e-9):
        fail(f"(i) the order A B C against B A C moved solidDose by {a - c:.9g} h,"
             " recomputed 2 h (strengthB's 10 h coating clean before strengthC)")
    else:
        claims.append(f"(i) the declared order moves the year: A B C needs {a:.6g} h on"
                      f" solidDose, B A C {c:.6g} h (the 2 h of strengthB's coating"
                      " clean before strengthC)")


ONE_PRODUCT = """
    products
    (
        {
            product  only;
            perYear  30000 kg;
            source   "probe";
            reason   "one product through the multiproduct path";
        }
    );
"""


def arm_one_product(work):
    """(j) one product through the multiproduct path IS the single plan."""
    ds = copy_witness(work, "single_ref")
    outs, errs, rcs, js = solve(ds)
    d = copy_witness(work, "one", multi_edit(products=ONE_PRODUCT, pco=None))
    out, err, rc, j = solve(d)
    if rcs != 0 or rc != 0 or not js or not j:
        fail(f"(j) the one-product probe or its single twin did not run ({rcs}, {rc})")
        return
    R = compare_multi("(j) one product", d, j)
    if R is None:
        return
    s, m = js["batchPlan"], j["batchPlan"]
    bad = []
    ps = m["products"][0]
    for k in ("lotSize", "lotsPerYear", "production", "equivalentHours"):
        if not close(ps[k], s["summary"][k], 1e-9):
            bad.append(f"{k} {ps[k]} != {s['summary'][k]}")
    if not close(m["summary"]["streamFactor"], s["summary"]["streamFactor"], 1e-12):
        bad.append("streamFactor")
    pt = {x["train"]: x for x in m["productTrains"]}
    for t in s["trains"]:
        x, mt = pt[t["name"]], next(u for u in m["trains"] if u["name"] == t["name"])
        for k in ("cycleTime", "campaigns", "campaignSpan"):
            if not close(x[k], t[k], 1e-9):
                bad.append(f"train {t['name']} {k} {x[k]} != {t[k]}")
        if x["limitingStage"] != t["limitingStage"]:
            bad.append(f"train {t['name']} limiting")
        for k in ("requiredTime", "occupancy", "campaigns"):
            if not close(mt[k], t[k], 1e-9):
                bad.append(f"train {t['name']} {k} {mt[k]} != {t[k]}")
    pst = {x["stage"]: x for x in m["productStages"]}
    mst = {x["name"]: x for x in m["stages"]}
    for st in s["stages"]:
        x, ms = pst[st["name"]], mst[st["name"]]
        for k in ("massPerLot", "processTime", "dischargeTime", "cycleTime", "offset",
                  "utilisation"):
            if not close(x[k], st[k], 1e-9):
                bad.append(f"stage {st['name']} {k} {x[k]} != {st[k]}")
        for k in ("busyHours", "occupancy", "idleHours") + (
                ("volumePerUnit",) if st["type"] == "batch" else ("ratePerUnit",)):
            if not close(ms[k], st[k], 1e-9):
                bad.append(f"stage {st['name']} {k} {ms[k]} != {st[k]}")
    if sorted(f["id"] for f in s["findings"]) != sorted(f["id"] for f in m["findings"]):
        bad.append("findings")
    eqs = {e["item"]: e["cost"]["purchased"] for e in js.get("equipment", [])
           if (e.get("cost") or {}).get("purchased") is not None}
    eqm = {e["item"]: e["cost"]["purchased"] for e in j.get("equipment", [])
           if (e.get("cost") or {}).get("purchased") is not None}
    for k, v in eqs.items():
        if k not in eqm or not close(eqm[k], v, 1e-9):
            bad.append(f"C_p {k} {eqm.get(k)} != {v}")
    if bad:
        fail("(j) one product through the multiproduct path is not the single plan: "
             + "; ".join(bad[:8]))
    else:
        claims.append(f"(j) one product declared in `products` reproduces the single"
                      f" plan (every lot, cycle, offset, busy hour, size, finding and"
                      f" all {len(eqs)} purchased costs, to 1e-9)")


MULTI_REFUSALS = [
    ("productionBeside", multi_edit(extra=lambda t: sub(
        t, "    products\n", "    production { perYear 1 kg; source \"x\"; reason \"y\"; }\n    products\n")),
     ["two homes"]),
    ("noOrder", multi_edit(extra=lambda t: re.sub(r"\n    campaignOrder \([^)]*\);", "", t)),
     ["campaignOrder", "does not"]),
    ("badOrder", multi_edit(order="strengthA strengthB strengthB"),
     ["exactly once"]),
    ("noPco", multi_edit(pco={k: v for k, v in PCO.items() if k != "coating"}),
     ["'coating'", "productChangeover"]),
    ("pcoSingle", lambda t: stage_edit(t, "coating", "cleanTime 1 h;",
                                       "cleanTime 1 h;  productChangeover 4 h;"),
     ["read by nothing"]),
    ("orderSingle", lambda t: sub(t, "    lowUtilisation", "    campaignOrder ( x );\n    lowUtilisation"),
     ["read by nothing"]),
    ("dupProduct", multi_edit(extra=lambda t: sub(t, "product  strengthC;", "product  strengthA;")),
     ["second product"]),
    ("toSelf", multi_edit(extra=lambda t: sub(t, "changeoverTo { strengthC 10 h; }",
                                              "changeoverTo { strengthB 10 h; }")),
     ["ANOTHER product"]),
    ("toUnitless", multi_edit(extra=lambda t: sub(t, "changeoverTo { strengthC 10 h; }",
                                                  "changeoverTo { strengthC 10; }")),
     ["carries no unit"]),
    ("unknownStage", multi_edit(extra=lambda t: sub(t, "{ stage blending;  cleanTime 1.5 h;",
                                                    "{ stage blendng;  cleanTime 1.5 h;")),
     ["blendng", "names no stage"]),
    ("wrongKey", multi_edit(extra=lambda t: sub(t, "{ stage compression;  operatingTime 3 h;",
                                                "{ stage compression;  processTime 3 h;")),
     ["processTime", "semicontinuous"]),
    ("emptyOverride", multi_edit(extra=lambda t: sub(t, "{ stage blending;  cleanTime 1.5 h;",
                                                     "{ stage blending;")),
     ["changes nothing"]),
    ("overrideNoSource", multi_edit(extra=lambda t: sub(
        t, '{ stage blending;  cleanTime 1.5 h;  source "probe";', "{ stage blending;  cleanTime 1.5 h;")),
     ["`source", "blending"]),
    ("mppProduct", multi_edit(extra=lambda t: sub(t, "massPerProduct { coatingSuspension 0.12; }",
                                                  "massPerProduct { packagedTablets 0.9; }")),
     ["product stream itself"]),
    ("mppUnread", multi_edit(extra=lambda t: sub(t, "massPerProduct { coatingSuspension 0.12; }",
                                                 "massPerProduct { granules 0.5; }")),
     ["granules", "read by nothing"]),
    ("mppUnit", multi_edit(extra=lambda t: sub(t, "massPerProduct { coatingSuspension 0.12; }",
                                               "massPerProduct { coatingSuspension 0.12 kg; }")),
     ["RATIO"]),
    ("noLotAnywhere", multi_edit(extra=lambda t: re.sub(
        r"\n    lot\n    \{.*?\n    \}\n", "\n", t, count=1, flags=re.S)),
     ["strengthA", "no `lot {}`"]),
    ("lotUnread", multi_edit(extra=lambda t: _all_own_lots(t)),
     ["read by nothing"]),
    ("multiStageBusy", multi_edit(extra=lambda t: sub(t, "perYear  20000 kg;", "perYear  200000 kg;")),
     ["stage '", "strengthA", "lots x", "cannot be run"]),
    ("multiTrainLong", multi_edit(extra=lambda t: sub(t, "availableTime   3840 h;", "availableTime   1250 h;")),
     ["train 'solidDose' needs", "changeovers", "unreachable"]),
]


def _all_own_lots(t):
    own = ("            lot\n            {\n                rule declared;  stream finalBlend;"
           "  mass 350 kg;\n                source \"probe\";  reason \"its own\";\n            }\n")
    t = sub(t, "            perYear  20000 kg;\n", "            perYear  20000 kg;\n" + own)
    return sub(t, "            perYear  1500 kg;\n", "            perYear  1500 kg;\n" + own)


def arm_multi_refusals(work):
    n = 0
    for tag, edit, want in MULTI_REFUSALS:
        try:
            d = copy_witness(work, "mref_" + tag, edit)
        except RuntimeError as e:
            fail(f"(k) {tag}: fixture could not be built ({e})")
            continue
        out, err, rc, _ = solve(d)
        text = out + err
        if rc == 0:
            fail(f"(k) {tag}: ran to exit 0 -- not refused")
        elif not all(w in text for w in want):
            tail = (err.strip().splitlines() or ["(no stderr)"])[-1][:240]
            fail(f"(k) {tag}: refused (exit {rc}) without naming {want}: {tail}")
        n += 1
    claims.append(f"(k) {n} multiproduct refusals fire, each naming its defect")


def arm_multi_golden(work):
    d = copy_witness(work, "mgolden", multi_edit())
    out, err, rc = run([str(ROOT / "bin/runTests"), "--record", str(d)], timeout=1200)
    exp = d / "expected"
    if rc != 0 or not exp.exists():
        fail(f"(l) runTests --record on the multiproduct probe exited {rc}")
        return
    rows = [l for l in exp.read_text().splitlines() if l.startswith("batch ")]
    ids = set(l.split()[1].split(":")[0] for l in rows)
    for k in ("batchPlan", "product", "train", "stage", "productTrain", "productStage"):
        if k not in ids:
            fail(f"(l) the recorded golden pins no `batch` row for {k}")
            return
    keys = set(l.split()[2] for l in rows)
    for k in ("changeoverAfter", "productChangeover", "changeoverHours", "sizingProduct",
              "maxUtilisation", "lotsLastCampaign", "start", "perYear"):
        if k not in keys:
            fail(f"(l) the recorded golden pins no `{k}` row")
            return
    out, err, rc = run([str(ROOT / "bin/runTests"), str(d)], timeout=1200)
    if rc != 0 or "FAIL 0" not in out:
        fail(f"(l) runTests on the freshly recorded probe did not pass (exit {rc})")
        return
    pd = d / "system" / "postDict"
    pd.write_text(sub(pd.read_text(), "{ stage compression;  operatingTime 3 h;",
                      "{ stage compression;  operatingTime 3.5 h;"))
    out, err, rc = run([str(ROOT / "bin/runTests"), str(d)], timeout=1200)
    if rc == 0 or "productStage:strengthB:compression" not in out:
        fail("(l) strengthB's compression time moved by 0.5 h did not fail the golden"
             " on its productStage:strengthB:compression row")
        return
    claims.append(f"(l) --record pins {len(rows)} `batch` rows on the probe (summary,"
                  " product, productTrain, productStage, stage, train), the check passes"
                  " on them, and strengthB's compression moved by 0.5 h fails it on"
                  " its productStage row")


def main():
    argv = sys.argv[1:]
    keep = Path(argv[argv.index("--keep") + 1]).resolve() if "--keep" in argv else None
    if not BIN.exists():
        print("check_batch_plan: FAIL -- no choupoSolve build; run `make all`")
        return 1
    if not WITNESS.exists():
        print("check_batch_plan: FAIL -- the witness is missing; this gate CANNOT RUN")
        return 1
    work = keep or Path(tempfile.mkdtemp(prefix="batchplan."))
    work.mkdir(parents=True, exist_ok=True)
    try:
        arm_witness(work)
        arm_announcements(work)
        arm_rules(work)
        arm_refusals(work)
        arm_absent(work)
        arm_golden(work)
        arm_multiproduct(work)
        arm_one_product(work)
        arm_multi_refusals(work)
        arm_multi_golden(work)
    finally:
        if not keep:
            shutil.rmtree(work, ignore_errors=True)
    if fails:
        print("check_batch_plan: FAIL")
        for f in fails:
            print("  - " + f)
        return 1
    print("check_batch_plan: OK -- " + "; ".join(claims)
          + ".  NOT COVERED: whether a declared time, density, fill or lot is"
          " right for the product (the case's assumption), the intermediate"
          " store's size (not computed), whether a declared campaign order is"
          " a GOOD one (no optimiser: the student's decision), campaigns of"
          " different products overlapping on a train (not built), several"
          " rotations a year (not built), and the scaled quote's exponent (the"
          " case's convention).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
