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

The witness is a copy of `tutorials/plant/apalutamide01_tablets` under a temp
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
WITNESS = ROOT / "tutorials/plant/apalutamide01_tablets"
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
          " store's size (not computed), multiproduct sequencing (not built),"
          " and the scaled quote's exponent (the case's convention).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
