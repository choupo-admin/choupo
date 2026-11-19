#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_pinch -- 3 former gates run as ARMS of one script (DEV.md 4c C419).

Former gates, each moved here verbatim as a function (its own docstring first,
its own checks, its own printed lines): check_pinch_p1, check_pinch_p2, check_pinch_utility.
Each arm prints exactly what its gate printed; this runner prints ONE claim
line first (`check_pinch: OK -- ...`) that carries every arm's own claim, then
the arms' output, and exits non-zero when any arm does.  An arm that fails does
not stop the others: every verdict is reported.
"""

import contextlib
import io
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

def arm_pinch_p1():
    """Pinch P1 gate: the pass's targets equal an INDEPENDENT problem-table
implementation, the composite-curve artefact is coherent, and the pass
neither runs uninvited nor accepts a meaningless approach.

Programme scope: docs/design/pinch-programme-scope.md (P1 approved
2026-08-02, P2/P3 NOT built; the pass targets, it never rewrites the
network).  The witness is tutorials/steady/heat/pinch01_four_stream_classic
(the classic four-stream exercise; targets hand-checkable from the four
CPs because the synthetic fluid's liquid cp is constant).

Probes, through the real choupoSolve binary:

  WITNESS      the pass's printed targets and pinch.* KPIs equal THIS
               SCRIPT'S own Linnhoff-Flower cascade over the same four
               segments (independent reimplementation, not a copy of the
               C++), and the problem table is printed row by row.
  CSV          reports/pinch/compositeCurves.csv carries the four curves
               (hot/cold/hotShifted/coldShifted), each with monotonically
               non-decreasing T and H, and the correct total enthalpies
               (hot 420 kW, cold 487.5 kW).
  NEGATIVE     the same case WITHOUT a postDict prints no [pinch] line and
               reports no pinch KPIs (the pass never runs uninvited).
  REFUSAL      dTmin <= 0 refuses loudly (a zero approach makes every
               match infinitely large).
  LATENT       H2's duty compressed into |dT| = 0.8 K (< latentWidth) must
               enter as the documented near-isothermal SLICE (width 1 K,
               CP = |Q|/latentWidth centred on the unit T); the independent
               cascade models exactly that representation, so a pass that
               quietly kept the sensible branch fails by value
               (sabotage-verified: branch disabled -> 3 probes fail).
  POPULATION   (C150 R16, 2026-10-25) the targets say what they are the
               targets OF.  P1 the witness: 4 segments, nothing excluded.
               P2 process02_reactor_hx_flash + this postDict: the reactor's
               duty, published as `Q_kW`, is LISTED as excluded
               (population.csv, KPIs duties_excluded / Q_excluded_kW) and the
               targets line says NOT the plant's.  P3 heatExchanger01 + a
               pinchPass at dTmin 10 K: the exchanger enters as BOTH sides,
               neither current-utility total counts its duty, and the targets
               equal this script's cascade over the two sides.  Measured
               against the parent build: P1/P2 had no population KPIs, and
               P3 entered the hot side alone with Q_cool_current 93.79 kW and
               Q_C,min 93.79 kW for a plant that needs no utility.

  CLASS        (C234, 2026-11-07) the cascade CLASSIFIES the problem by its
               whole corrected cascade, interior zeros included: the witness
               swept at dTmin 1/20/40 K (net Q_H,min - Q_C,min = 67.5 kW at
               every approach, the class word, KPIs, summary.csv, console and
               problemTable.csv all equal the independent cascade; a threshold
               prints no 'pinch at T*' and no VIOLATION), a two-pinch fixture,
               a no-utility fixture, ammonia02_full_plant (threshold, no hot
               utility) and a source arm: the page keeps no TypeScript cascade.

Exit 1 listing failures."""
    import csv
    import json
    import os
    import re
    import shutil
    import case_records  # noqa: E402
    import subprocess
    import sys
    import tempfile
    from pathlib import Path

    ROOT = Path(__file__).resolve().parents[2]
    SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
    CASE = ROOT / "tutorials" / "steady" / "heat" / "pinch01_four_stream_classic"

    failures = []


    # ---- the independent problem table (pure Python, from first principles) ----
    #  The four streams of the witness, as (hot?, T_supply, T_target, CP[W/K]).
    #  These repeat the case's declared duties/flows, NOT the pass's output.
    STREAMS = [
        (True, 423.15, 333.15, 2000.0),   # H1: 150 -> 60 C, F 20 mol/s * 100 J/mol.K
        (True, 363.15, 333.15, 8000.0),   # H2:  90 -> 60 C, F 80 mol/s
        (False, 293.15, 398.15, 2500.0),  # C1:  20 -> 125 C, F 25 mol/s
        (False, 298.15, 373.15, 3000.0),  # C2:  25 -> 100 C, F 30 mol/s
    ]
    DTMIN = 20.0


    def problem_table(streams, dtmin):
        hs, cs = -dtmin / 2.0, +dtmin / 2.0
        bounds = set()
        for hot, ta, tb, _ in streams:
            sh = hs if hot else cs
            bounds.update((min(ta, tb) + sh, max(ta, tb) + sh))
        T = sorted(bounds, reverse=True)
        cascade, min_casc, t_pinch = 0.0, 0.0, T[0]
        for i in range(len(T) - 1):
            mid = 0.5 * (T[i] + T[i + 1])
            cph = cpc = 0.0
            for hot, ta, tb, cp in streams:
                sh = hs if hot else cs
                if min(ta, tb) + sh <= mid <= max(ta, tb) + sh:
                    if hot:
                        cph += cp
                    else:
                        cpc += cp
            cascade += (cph - cpc) * (T[i] - T[i + 1])
            if cascade < min_casc - 1e-9:
                min_casc, t_pinch = cascade, T[i + 1]
        qh = -min_casc
        qc = cascade + qh
        return qh / 1e3, qc / 1e3, t_pinch


    def run(case: Path):
        env = dict(os.environ, CHOUPO_HOME=str(ROOT))
        p = subprocess.run([str(SOLVE), "."], cwd=case, env=env,
                           capture_output=True, text=True, timeout=900)
        return p.returncode, p.stdout + p.stderr


    def copy(tmp: Path, tag: str) -> Path:
        case = tmp / tag
        case_records.copytree(CASE, case,
                        ignore=shutil.ignore_patterns("expected", "log.*",
                                                      "reports", "converged"))
        return case


    def kpi_block(out: str):
        m = re.search(r'"pinch":\s*({[^}]*})', out)
        return json.loads(m.group(1)) if m else None


    def classify(streams, dtmin):
        """Independent CLASSIFICATION by the whole corrected cascade (DEV.md 4c
    C234): returns (QH kW, QC kW, interior zeros, word, corrected cascade)."""
        hs, cs = -dtmin / 2.0, +dtmin / 2.0
        bounds = set()
        for hot, ta, tb, _ in streams:
            sh = hs if hot else cs
            bounds.update((min(ta, tb) + sh, max(ta, tb) + sh))
        T = sorted(bounds, reverse=True)
        cas = [0.0]
        dHs = []
        for i in range(len(T) - 1):
            mid = 0.5 * (T[i] + T[i + 1])
            cph = cpc = 0.0
            for hot, ta, tb, cp in streams:
                sh = hs if hot else cs
                if min(ta, tb) + sh <= mid <= max(ta, tb) + sh:
                    if hot:
                        cph += cp
                    else:
                        cpc += cp
            dH = (cph - cpc) * (T[i] - T[i + 1])
            dHs.append(dH)
            cas.append(cas[-1] + dH)
        qh = -min(cas)
        cor = [c + qh for c in cas]
        tol = 1e-9 * sum(abs(d) for d in dHs) + 1e-6
        inner = [k for k in range(1, len(T) - 1) if abs(cor[k]) <= tol]
        top, bot = qh <= tol, abs(cor[-1]) <= tol
        if len(inner) == 1:
            word = "interiorPinch"
        elif len(inner) > 1:
            word = "severalPinches"
        elif top and bot:
            word = "thresholdNoUtility"
        elif top:
            word = "thresholdNoHotUtility"
        else:
            word = "thresholdNoColdUtility"
        return qh / 1e3, cor[-1] / 1e3, len(inner), word, cor, T


    def build_case(tmp: Path, tag: str, streams, dtmin):
        """The witness with its four units re-declared as `streams` (hot, T_in,
    T_out, CP W/K): units coolerH1, coolerH2, heaterC1, heaterC2 in order."""
        case = copy(tmp, tag)
        names = ["h1In", "h2In", "c1In", "c2In"]
        for nm, (hot, ta, tb, cp) in zip(names, streams):
            f = case / "0" / nm
            txt = f.read_text()
            txt = re.sub(r"hxFluid\s+[-0-9.eE+]+ mol/s;",
                         f"hxFluid    {cp / 100.0:.10g} mol/s;", txt)
            txt = re.sub(r"\nT\s+[-0-9.eE+]+ K;", f"\nT               {ta:.10g} K;", txt, 1)
            f.write_text(txt)
        fd = case / "system" / "flowsheetDict"
        q = iter(cp * (tb - ta) for _, ta, tb, cp in streams)
        fd.write_text(re.sub(r"operation   \{ Q  [-0-9.eE+]+ kW; \}",
                             lambda m: f"operation   {{ Q  {next(q) / 1e3:.10g} kW; }}",
                             fd.read_text()))
        pd = case / "system" / "postDict"
        pd.write_text(re.sub(r"dTmin\s+[0-9.eE+]+ K;", f"dTmin   {dtmin:g} K;",
                             pd.read_text()))
        return case


    def read_summary(case: Path):
        p = case / "reports" / "pinch" / "summary.csv"
        if not p.exists():
            return {}
        d = {}
        for line in p.read_text().splitlines()[1:]:
            k, _, v = line.partition(",")
            d[k] = v
        return d


    def class_arms(tmp: Path):
        """THE CASCADE CLASSIFIES THE PROBLEM, AND EVERY SURFACE SAYS IT (C234)."""
        codes = {"interiorPinch": 1, "severalPinches": 2, "thresholdNoHotUtility": 3,
                 "thresholdNoColdUtility": 4, "thresholdNoUtility": 5}
        hot_total = sum(cp * abs(ta - tb) for h, ta, tb, cp in STREAMS if h) / 1e3
        cold_total = sum(cp * abs(ta - tb) for h, ta, tb, cp in STREAMS if not h) / 1e3

        # ---- (a) the sweep: the net of the duties is 67.5 kW at any approach ----
        for d in (1.0, 20.0, 40.0):
            case = build_case(tmp, f"cls{d:g}", STREAMS, d)
            rc, out = run(case)
            qh, qc, ni, word, cor, T = classify(STREAMS, d)
            k = kpi_block(out) or {}
            if rc != 0 or not k:
                failures.append(f"class dTmin {d}: exit {rc} / no KPIs")
                continue
            if abs(k.get("Q_H_min_kW", 1e9) - k.get("Q_C_min_kW", 0.0) - 67.5) > 1e-6:
                failures.append(f"class dTmin {d}: Q_H,min - Q_C,min ="
                                f" {k.get('Q_H_min_kW')} - {k.get('Q_C_min_kW')}"
                                " != 67.5 kW (cold total - hot total)")
            if abs(qh - qc - 67.5) > 1e-9 or abs(cold_total - hot_total - 67.5) > 1e-9:
                failures.append("class: the SCRIPT's own identity is wrong")
            if abs(k.get("Q_recovery_max_kW", 1e9) - (hot_total - qc)) > 1e-6:
                failures.append(f"class dTmin {d}: Q_recovery_max_kW"
                                f" {k.get('Q_recovery_max_kW')} != hot total -"
                                f" Q_C,min = {hot_total - qc}")
            s = read_summary(case)
            if s.get("class") != word or int(s.get("n_pinches", -1)) != ni:
                failures.append(f"class dTmin {d}: summary.csv says"
                                f" {s.get('class')}/{s.get('n_pinches')},"
                                f" independent {word}/{ni}")
            if k.get("problem_class") != codes[word] or \
                    k.get("pinch_exists") != (1.0 if ni else 0.0) or \
                    k.get("n_pinches") != ni:
                failures.append(f"class dTmin {d}: KPIs problem_class/pinch_exists/"
                                f"n_pinches {k.get('problem_class')}/"
                                f"{k.get('pinch_exists')}/{k.get('n_pinches')}"
                                f" disagree with {word}")
            if f"CLASS: {word}" not in out:
                failures.append(f"class dTmin {d}: the console does not say {word}")
            if ni == 0:
                #  THRESHOLD: no pinch line, no VIOLATION wording, the word THRESHOLD
                if "pinch at T*" in out:
                    failures.append(f"class dTmin {d}: a threshold problem prints"
                                    " 'pinch at T*'")
                if "THRESHOLD problem" not in out:
                    failures.append(f"class dTmin {d}: threshold not announced")
                if "VIOLATION" in out:
                    failures.append(f"class dTmin {d}: threshold diagnostics still"
                                    " say VIOLATION")
            elif "pinch at T*" not in out:
                failures.append(f"class dTmin {d}: a pinch problem does not locate it")
            if d == 20.0:
                #  the worked table the page draws == the independent cascade
                tp = case / "reports" / "pinch" / "problemTable.csv"
                rows = list(csv.DictReader(open(tp))) if tp.exists() else []
                if len(rows) != len(T) - 1:
                    failures.append(f"class: problemTable.csv has {len(rows)} rows,"
                                    f" independent {len(T) - 1}")
                else:
                    for i, r in enumerate(rows):
                        if abs(float(r["T_star_hi_K"]) - T[i]) > 1e-6 or \
                                abs(float(r["T_star_lo_K"]) - T[i + 1]) > 1e-6 or \
                                abs(float(r["corrected_out_kW"]) - cor[i + 1] / 1e3) > 1e-6:
                            failures.append(f"class: problemTable.csv row {i + 1}"
                                            " differs from the independent cascade")
                            break
                blob = out + (tp.read_text() if tp.exists() else "") + \
                    (case / "reports" / "pinch" / "summary.csv").read_text()
                if "optimal" in blob.lower():
                    failures.append("class: the word 'optimal' appears")

        # ---- (b) SEVERAL pinches: the interior zeros are looked for, not the
        #      single minimum.  Shifted cascade -10, +20, -20, +5 (dTmin 20).
        several = [(True, 340.0, 330.0, 2000.0), (True, 320.0, 310.0, 500.0),
                   (False, 320.0, 330.0, 1000.0), (False, 300.0, 310.0, 2000.0)]
        qh, qc, ni, word, _, _ = classify(several, 20.0)
        if (word, ni) != ("severalPinches", 2) or abs(qh - 10.0) > 1e-9 \
                or abs(qc - 5.0) > 1e-9:
            failures.append(f"class: the several-pinch fixture is wrong: {word},"
                            f" {ni}, {qh}, {qc} -- fix the SCRIPT")
        case = build_case(tmp, "several", several, 20.0)
        rc, out = run(case)
        s = read_summary(case)
        if rc != 0 or s.get("class") != "severalPinches" or s.get("n_pinches") != "2":
            failures.append(f"class several: summary {s} (expected severalPinches,"
                            f" 2); exit {rc}")
        if "further pinches at T*" not in out:
            failures.append("class several: the console does not name the second pinch")

        # ---- (c) a threshold with NEITHER utility (both ends zero) ---------------
        nothing = [(True, 300.0, 200.0, 1000.0), (True, 300.0, 200.0, 1000.0),
                   (False, 180.0, 280.0, 1000.0), (False, 180.0, 280.0, 1000.0)]
        word0 = classify(nothing, 20.0)[3]
        if word0 != "thresholdNoUtility":
            failures.append(f"class: the no-utility fixture is {word0} -- fix the SCRIPT")
        case = build_case(tmp, "nothing", nothing, 20.0)
        rc, out = run(case)
        if rc != 0 or read_summary(case).get("class") != "thresholdNoUtility":
            failures.append(f"class no-utility: {read_summary(case)}; exit {rc}")

        # ---- (d) the plant that was misread: a threshold problem, no hot utility
        am = tmp / "ammonia02"
        case_records.copytree(ROOT / "tutorials" / "plant" / "ammonia02_full_plant", am,
                        ignore=shutil.ignore_patterns("expected", "log.*",
                                                      "reports", "converged"))
        rc, out = run(am)
        k = kpi_block(out) or {}
        if rc != 0 or read_summary(am).get("class") != "thresholdNoHotUtility" \
                or k.get("pinch_exists") != 0.0:
            failures.append(f"class ammonia02: {read_summary(am)}, pinch_exists"
                            f" {k.get('pinch_exists')}; exit {rc}")
        if "pinch at T*" in out:
            failures.append("class ammonia02: 'pinch at T*' on a threshold plant")

        # ---- (e) the page draws the engine's table; it recomputes no cascade ----
        for rel in ("gui/src/ui/methods/PinchCompositeTool.tsx", "gui/src/case/pinch.ts"):
            src = re.sub(r"/\*.*?\*/", "", (ROOT / rel).read_text(), flags=re.S)
            src = re.sub(r"//[^\n]*", "", src)
            if re.search(r"computePinchFromCurves|crossCheckAgainstKpis|interpolateH", src):
                failures.append(f"{rel}: a TypeScript cascade is back (the engine"
                                " decides, the GUI draws)")


    def main() -> int:
        if not SOLVE.exists():
            print(f"check_pinch_p1: {SOLVE} missing -- build first")
            return 1

        qh_ref, qc_ref, tp_ref = problem_table(STREAMS, DTMIN)
        #  Sanity of the reference itself (the published classic answer).
        if abs(qh_ref - 107.5) > 1e-6 or abs(qc_ref - 40.0) > 1e-6 \
                or abs(tp_ref - 353.15) > 1e-9:
            failures.append(
                f"reference cascade is wrong: {qh_ref} / {qc_ref} / {tp_ref}"
                " (expected 107.5 / 40 / 353.15) -- fix the SCRIPT")

        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)

            # ---- WITNESS ------------------------------------------------------
            w = copy(tmp, "witness")
            rc, out = run(w)
            if rc != 0:
                failures.append(f"witness: exit {rc}")
            if "[pinch] problem table (Linnhoff-Flower)" not in out:
                failures.append("witness: problem table not printed")
            k = kpi_block(out)
            if not k:
                failures.append("witness: no pinch KPI block in the result")
            else:
                for key, ref in (("Q_H_min_kW", qh_ref), ("Q_C_min_kW", qc_ref),
                                 ("T_pinch_K", tp_ref)):
                    got = k.get(key)
                    if got is None or abs(got - ref) > 1e-6 * max(1.0, abs(ref)):
                        failures.append(
                            f"witness: pinch.{key} = {got}, independent = {ref}")

            # ---- CSV ----------------------------------------------------------
            csvf = w / "reports" / "pinch" / "compositeCurves.csv"
            if not csvf.exists():
                failures.append("witness: reports/pinch/compositeCurves.csv missing")
            else:
                curves = {}
                with open(csvf) as fh:
                    for row in csv.DictReader(fh):
                        curves.setdefault(row["curve"], []).append(
                            (float(row["T_K"]), float(row["H_kW"])))
                for name in ("hot", "cold", "hotShifted", "coldShifted"):
                    pts = curves.get(name)
                    if not pts:
                        failures.append(f"csv: curve '{name}' missing")
                        continue
                    if any(pts[i][0] > pts[i + 1][0] or pts[i][1] > pts[i + 1][1]
                           for i in range(len(pts) - 1)):
                        failures.append(f"csv: curve '{name}' not monotone")
                for name, total in (("hot", 420.0), ("cold", 487.5)):
                    if name in curves and abs(curves[name][-1][1] - total) > 1e-6:
                        failures.append(
                            f"csv: {name} total {curves[name][-1][1]} != {total}")

            # ---- NEGATIVE -----------------------------------------------------
            n = copy(tmp, "negative")
            (n / "system" / "postDict").unlink()
            rc, out = run(n)
            if rc != 0:
                failures.append(f"negative: exit {rc}")
            if "[pinch]" in out:
                failures.append("negative: [pinch] output without a postDict")
            if kpi_block(out):
                failures.append("negative: pinch KPIs without a postDict")

            # ---- REFUSAL: dTmin <= 0 -----------------------------------------
            r = copy(tmp, "refusal")
            f = r / "system" / "postDict"
            f.write_text(f.read_text().replace("dTmin   20 K;", "dTmin   0 K;"))
            rc, out = run(r)
            if rc == 0:
                failures.append("refusal: dTmin 0 accepted (expected refusal)")
            elif "dTmin must be positive" not in out:
                failures.append("refusal: message lacks 'dTmin must be positive'")

            # ---- LATENT branch: a near-isothermal duty becomes a slice ---------
            #  Raise H2's flow so its -240 kW compresses into |dT| = 0.8 K
            #  (< latentWidth 1 K): the pass must represent it as a 1-K slice
            #  of CP = |Q| / latentWidth centred on the unit temperature -- the
            #  documented phase-change hypothesis -- and the independent cascade
            #  below models EXACTLY that representation.  Sensible-vs-latent is
            #  not numerically inert here (the boundaries move), so a pass that
            #  quietly kept the sensible branch fails by value.
            lt = copy(tmp, "latent")
            f = lt / "0" / "h2In"
            f.write_text(f.read_text().replace("hxFluid    80 mol/s;",
                                               "hxFluid    3000 mol/s;"))
            rc, out = run(lt)
            if rc != 0:
                failures.append(f"latent: exit {rc}")
            else:
                #  H2: CP = 3000*100 = 300 kW/K, dT = 240/300 = 0.8 K,
                #  Tc = 363.15 - 0.4 = 362.75, slice [362.25, 363.25] at 240 kW/K.
                lat_streams = [
                    (True, 423.15, 333.15, 2000.0),
                    (True, 362.25, 363.25, 240000.0),   # the latent slice
                    (False, 293.15, 398.15, 2500.0),
                    (False, 298.15, 373.15, 3000.0),
                ]
                qh_l, qc_l, tp_l = problem_table(lat_streams, DTMIN)
                k = kpi_block(out)
                if not k:
                    failures.append("latent: no pinch KPI block")
                else:
                    for key, ref in (("Q_H_min_kW", qh_l), ("Q_C_min_kW", qc_l),
                                     ("T_pinch_K", tp_l)):
                        got = k.get(key)
                        if got is None or abs(got - ref) > 1e-6 * max(1.0, abs(ref)):
                            failures.append(f"latent: pinch.{key} = {got},"
                                            f" independent slice model = {ref}")

            # ---- POPULATION (C150 R16, 2026-10-25) ------------------------------
            #  The targets must say what they are the targets OF.  P1: the
            #  witness extracts four segments and leaves nothing out.  P2: a
            #  plant whose reactor publishes its duty as `Q_kW` (not the generic
            #  `Q`) has that duty LISTED as excluded, its kW summed into the KPIs,
            #  and the targets labelled NOT the plant's.  P3: a two-stream
            #  exchanger is heat ALREADY recovered -- both sides enter, and its
            #  duty is in neither current-utility total (the parent build entered
            #  its hot side alone and counted 93.79 kW of it as current COOLING,
            #  with Q_C,min = 93.79 kW for a plant that needs no utility).
            k = kpi_block(run(copy(tmp, "pop1"))[1]) or {}
            if (k.get("segments"), k.get("duties_excluded"),
                    k.get("Q_excluded_kW")) != (4.0, 0.0, 0.0):
                failures.append(f"P1: witness population segments/excluded/kW ="
                                f" {k.get('segments')}/{k.get('duties_excluded')}"
                                f"/{k.get('Q_excluded_kW')} (expected 4/0/0)")

            p2 = tmp / "pop2"
            case_records.copytree(ROOT / "tutorials" / "steady" / "flowsheets"
                            / "process02_reactor_hx_flash", p2,
                            ignore=shutil.ignore_patterns("expected", "log.*",
                                                          "reports", "converged"))
            shutil.copy(CASE / "system" / "postDict", p2 / "system" / "postDict")
            rc, out = run(p2)
            k = kpi_block(out) or {}
            mq = re.search(r'"reactor": \{[^{}]*"Q_kW": ([-+0-9.eE]+)', out)
            qr = abs(float(mq.group(1))) if mq else None
            if rc != 0 or qr is None:
                failures.append(f"P2: process02 + pinchPass: exit {rc}, reactor"
                                f" Q_kW {'found' if mq else 'MISSING'}")
            else:
                if k.get("duties_excluded") != 1.0 or \
                        abs((k.get("Q_excluded_kW") or 0.0) - qr) > 1e-6 * max(1, qr):
                    failures.append(f"P2: duties_excluded {k.get('duties_excluded')}"
                                    f", Q_excluded_kW {k.get('Q_excluded_kW')}"
                                    f" (expected 1 and the reactor's {qr})")
                if "(NOT the plant's: 1 heat duty excluded" not in out:
                    failures.append("P2: the targets line does not say they are"
                                    " NOT the plant's")
                pop = p2 / "reports" / "pinch" / "population.csv"
                rows = list(csv.DictReader(open(pop))) if pop.exists() else []
                if not any(r["unit"] == "reactor" and r["role"] == "excluded"
                           and r["kpi"] == "Q_kW" for r in rows):
                    failures.append("P2: population.csv does not list the"
                                    " reactor's Q_kW as excluded")

            p3 = tmp / "pop3"
            case_records.copytree(ROOT / "tutorials" / "steady" / "heat"
                            / "heatExchanger01_water_water", p3,
                            ignore=shutil.ignore_patterns("expected", "log.*",
                                                          "reports", "converged"))
            (p3 / "system" / "postDict").write_text(
                (CASE / "system" / "postDict").read_text()
                .replace("dTmin   20 K;", "dTmin   10 K;"))
            rc, out = run(p3)
            k = kpi_block(out) or {}
            mh = re.search(r'"hx": (\{[^{}]*\})', out)
            if rc != 0 or not mh or not k:
                failures.append(f"P3: heatExchanger01 + pinchPass: exit {rc}")
            else:
                hx = json.loads(mh.group(1))
                q = hx["Q_kW"] * 1000.0
                streams = [
                    (True, hx["T_hot_in"], hx["T_hot_out"],
                     q / (hx["T_hot_in"] - hx["T_hot_out"])),
                    (False, hx["T_cold_in"], hx["T_cold_out"],
                     q / (hx["T_cold_out"] - hx["T_cold_in"])),
                ]
                qh3, qc3, _ = problem_table(streams, 10.0)
                if k.get("Q_heat_current_kW") != 0.0 or \
                        k.get("Q_cool_current_kW") != 0.0:
                    failures.append(f"P3: recovered heat counted as current"
                                    f" utility (heating"
                                    f" {k.get('Q_heat_current_kW')}, cooling"
                                    f" {k.get('Q_cool_current_kW')} kW)")
                if k.get("segments") != 2.0:
                    failures.append(f"P3: segments {k.get('segments')} (expected"
                                    " the exchanger's two sides)")
                for key, ref in (("Q_H_min_kW", qh3), ("Q_C_min_kW", qc3)):
                    if abs((k.get(key) or 0.0) - ref) > 1e-6 * max(1.0, abs(ref)):
                        failures.append(f"P3: pinch.{key} = {k.get(key)},"
                                        f" independent two-side cascade = {ref}")

            class_arms(tmp)

        if failures:
            print("check_pinch_p1: FAIL")
            for f in failures:
                print("  -", f)
            return 1
        print("check_pinch_p1: OK -- witness targets equal the independent"
              " cascade (107.5 / 40 / 353.15), CSV coherent, negative silent,"
              " dTmin<=0 refused; the cascade CLASSIFIES the problem (interior"
              " pinch, several pinches, threshold either utility or neither,"
              " Q_H,min - Q_C,min = 67.5 kW at dTmin 1/20/40, the worked table and"
              " summary.csv equal the independent cascade, ammonia02 is a"
              " threshold plant, no TypeScript cascade); the population is published and labelled --"
              " an excluded Q_kW duty is listed and the targets say NOT the"
              " plant's, and a two-stream exchanger enters as both sides with its"
              " duty in neither current-utility total (no duty is ADDED to the"
              " population: columns, reactors and crystallisers stay excluded)")
        return 0
    return main()


def arm_pinch_p2():
    """Pinch P2 gate: the candidate-match ANALYSIS TABLE (ratified
2026-08-03) is an exhaustive per-region enumeration whose duties equal an
INDEPENDENT recomputation, whose language never claims an optimum, and
whose violation diagnostics satisfy the excess identity.

Programme scope: docs/design/pinch-programme-scope.md (P2 = analysis
table, never a rewiring; P3 stays UNAUTHORISED).  Witness:
tutorials/steady/heat/pinch01_four_stream_classic -- the hand-worked
candidate table lives in its flowsheetDict header.

Probes, through the real choupoSolve binary:

  SCHEMA     reports/pinch/candidateMatches.csv carries the ratified
             columns region,hotStream,coldStream,temperatureFeasible,
             pinchRule,maximumCandidateDuty_kW,limitingReason,
             recommendation -- and exactly the 6 exhaustive pairs of the
             classic (2 above, 4 below).
  DUTY       every row's maximum candidate duty equals THIS SCRIPT'S own
             counter-current bound over the same clipped segments
             (independent reimplementation of
             Q_max = min(Q_hot, Q_cold, min(CP)*(Th_hi - Tc_lo - dTmin))
             from the four published stream specs, not a copy of the C++).
  CP RULE    the two below-pinch H1 rows carry the VIOLATED rule and the
             "away from the pinch only" recommendation; the holding rows
             say so; no row -- and no stdout line -- ever contains the
             word "optimal" (the ratified language boundary).
  VIOLATION  the diagnostics name H1's 120 kW cooler-above and C1/C2's
             125+135 kW heaters-below, the KPIs carry 120/260, and the
             identity holds: violations sum == Q_heat_current - Q_H_min
             (380 kW) -- the excess over target IS the violations.

Sabotage-verified at build time: flipping the below-pinch CP inequality
turns H2's holding rows into VIOLATED ones -> the CP RULE probe fails by
value (recorded in the commit).

Exit 1 listing failures."""
    import csv
    import re
    import shutil
    import case_records  # noqa: E402
    import subprocess
    import sys
    import tempfile
    from pathlib import Path

    ROOT = Path(__file__).resolve().parents[2]
    SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
    CASE = ROOT / "tutorials" / "steady" / "heat" / "pinch01_four_stream_classic"

    failures = []

    #  The classic four-stream population (published spec, C; CP in kW/K)
    #  and the case's declared approach.
    DTMIN = 20.0
    PINCH_HOT, PINCH_COLD = 90.0, 70.0
    HOT = {"coolerH1": (60.0, 150.0, 2.0), "coolerH2": (60.0, 90.0, 8.0)}
    COLD = {"heaterC1": (20.0, 125.0, 2.5), "heaterC2": (25.0, 100.0, 3.0)}


    def clip(lo, hi, pinch, above):
        lo2, hi2 = (max(lo, pinch), hi) if above else (lo, min(hi, pinch))
        return (lo2, hi2) if hi2 - lo2 > 1e-9 else None


    def qmax(hseg, cseg, cph, cpc):
        qh = cph * (hseg[1] - hseg[0])
        qc = cpc * (cseg[1] - cseg[0])
        qa = min(cph, cpc) * (hseg[1] - cseg[0] - DTMIN)
        return max(0.0, min(qh, qc, qa))


    def independent_table():
        rows = {}
        for above in (True, False):
            for hn, (hlo, hhi, cph) in HOT.items():
                h = clip(hlo, hhi, PINCH_HOT, above)
                if not h:
                    continue
                for cn, (clo, chi, cpc) in COLD.items():
                    c = clip(clo, chi, PINCH_COLD, above)
                    if not c:
                        continue
                    region = "abovePinch" if above else "belowPinch"
                    rows[(region, hn, cn)] = qmax(h, c, cph, cpc)
        return rows


    def main() -> int:
        if not SOLVE.exists():
            print(f"check_pinch_p2: {SOLVE} missing -- build first")
            return 1
        with tempfile.TemporaryDirectory() as td:
            case = Path(td) / CASE.name
            case_records.copytree(CASE, case, ignore=shutil.ignore_patterns(
                "expected", "log.*", "reports", "converged", "resultJson*"))
            p = subprocess.run([str(SOLVE), "."], cwd=case,
                               capture_output=True, text=True, timeout=600)
            out = p.stdout + p.stderr
            if p.returncode != 0:
                print("check_pinch_p2: witness run failed\n" + out[-1200:])
                return 1

            # ---- the ratified language boundary ----------------------------
            f = case / "reports" / "pinch" / "candidateMatches.csv"
            if not f.exists():
                print("check_pinch_p2: candidateMatches.csv missing")
                return 1
            blob = out + f.read_text()
            if "optimal" in blob.lower():
                failures.append("the word 'optimal' appears -- the table may"
                                " only ever claim thermodynamic admissibility")

            # ---- SCHEMA + exhaustive enumeration ---------------------------
            want_hdr = ("region,hotStream,coldStream,temperatureFeasible,"
                        "pinchRule,maximumCandidateDuty_kW,limitingReason,"
                        "recommendation")
            lines = f.read_text().splitlines()
            if lines[0] != want_hdr:
                failures.append(f"CSV header '{lines[0]}' != ratified schema")
            rows = list(csv.DictReader(lines))
            mine = independent_table()
            if len(rows) != len(mine):
                failures.append(f"{len(rows)} rows vs {len(mine)} exhaustive"
                                " pairs")

            # ---- DUTY: independent recomputation ---------------------------
            for r in rows:
                key = (r["region"], r["hotStream"], r["coldStream"])
                if key not in mine:
                    failures.append(f"unexpected row {key}")
                    continue
                got = float(r["maximumCandidateDuty_kW"])
                if abs(got - mine[key]) > 1e-6 * max(mine[key], 1.0):
                    failures.append(f"{key}: duty {got} != independent"
                                    f" {mine[key]}")
                if r["recommendation"].startswith("thermodynamically"
                                                  " admissible") \
                   != (mine[key] > 1e-9):
                    failures.append(f"{key}: admissibility wording does not"
                                    " match the duty")

            # ---- CP RULE wording -------------------------------------------
            def row(region, h, c):
                for r in rows:
                    if (r["region"], r["hotStream"], r["coldStream"]) \
                       == (region, h, c):
                        return r
                return None

            for cn in ("heaterC1", "heaterC2"):
                r = row("belowPinch", "coolerH1", cn)
                if not r or "VIOLATED" not in r["pinchRule"] \
                   or "away from the pinch only" not in r["recommendation"]:
                    failures.append(f"belowPinch H1 x {cn}: the CP violation"
                                    " and its away-from-pinch wording are"
                                    " required")
                r2 = row("belowPinch", "coolerH2", cn)
                if not r2 or "holds" not in r2["pinchRule"]:
                    failures.append(f"belowPinch H2 x {cn}: CP_hot >= CP_cold"
                                    " holds and must say so")

            # ---- VIOLATION diagnostics + the excess identity ----------------
            for needle in (
                "VIOLATION cooler above the pinch: unit 'coolerH1' rejects 120",
                "VIOLATION heater below the pinch: unit 'heaterC1' draws 125",
                "VIOLATION heater below the pinch: unit 'heaterC2' draws 135",
            ):
                if needle not in out:
                    failures.append(f"stdout lacks '{needle}'")

            def kpi(name):
                m = re.search(r'"%s":\s*([0-9.eE+-]+)' % re.escape(name), out)
                return float(m.group(1)) if m else None

            cool = kpi("violation_cool_above_pinch_kW")
            heat = kpi("violation_heat_below_pinch_kW")
            qcur = kpi("Q_heat_current_kW")
            qmin_ = kpi("Q_H_min_kW")
            if None in (cool, heat, qcur, qmin_):
                failures.append("violation / target KPIs missing")
            else:
                if abs(cool - 120.0) > 1e-6 or abs(heat - 260.0) > 1e-6:
                    failures.append(f"violation KPIs {cool}/{heat} != 120/260")
                if abs((cool + heat) - (qcur - qmin_)) > 1e-6:
                    failures.append("identity broken: violations sum"
                                    f" {cool + heat} != excess {qcur - qmin_}")

        if failures:
            print("check_pinch_p2: FAIL")
            for m in failures:
                print("  -", m)
            return 1
        print("check_pinch_p2: OK -- 6 exhaustive pairs equal the independent"
              " duty bound, CP-rule wording exact, no 'optimal' anywhere,"
              " violations 120+260 == the 380 kW excess over target")
        return 0
    return main()


def arm_pinch_utility():
    """Pinch gate: A UTILITY IS NOT A PROCESS STREAM (DEV.md 4c C230).

Witness: tutorials/plant/ammonia02_full_plant, whose water cooler takes
485.64 -> 311.66 K from the hot effluent with COOLING WATER (298.15 ->
303.66 K, the declared circuit CW1).  The pinch pass used to count that
water as a cold PROCESS stream and so manufactured a pinch (Q_H,min 2158 kW,
Q_C,min 39 791 kW, T* 308.15 K).  The right answer is a THRESHOLD problem.

Probes, through the real choupoSolve binary:

  RIGHT      the case as shipped.  The pass's pinch.* KPIs equal THIS
             SCRIPT'S own Linnhoff-Flower cascade over the four process
             segments built from the units' own published temperatures and
             duties (FEHE hot and cold sides, the cooler's hot side, the
             separator, the letdown as a 1 K latent slice): Q_H,min = 0,
             Q_C,min = 95 708.8 kW, NO pinch (pinch_exists 0); the water is a
             `utility` row of population.csv, not a segment; utility_sides 1.
  WRONG      the same case with the `utilities` circuit deleted (so the
             water is nothing declared): the pass cannot know it is a service
             and the result equals this script's cascade WITH the water as a
             cold stream -- the old, wrong numbers.  The gate distinguishes
             the two: if the exclusion stopped working, RIGHT would equal
             WRONG and fail by value.

Sabotage (by hand, restored): (1) in PinchPass.cpp make serviceOf empty
-> RIGHT fails (the pinch returns); (2) skip `continue` after the utility
branch -> RIGHT fails (segments 6); (3) make the utility side the hot one
always -> RIGHT fails by value.

Exit 1 listing failures."""
    import csv
    import json
    import os
    import re
    import shutil
    import case_records  # noqa: E402
    import subprocess
    import sys
    import tempfile
    from pathlib import Path

    ROOT = Path(__file__).resolve().parents[2]
    SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
    CASE = ROOT / "tutorials" / "plant" / "ammonia02_full_plant"
    DTMIN = 20.0
    LATENT = 1.0

    failures = []


    def problem_table(streams, dtmin):
        """Linnhoff-Flower cascade. streams: (hot, Tlo, Thi, CP[W/K]).
    Returns (QH, QC, has_pinch) in kW."""
        hs, cs = -dtmin / 2.0, +dtmin / 2.0
        bounds = set()
        for hot, lo, hi, _ in streams:
            sh = hs if hot else cs
            bounds.update((lo + sh, hi + sh))
        T = sorted(bounds, reverse=True)
        cascade, lowest = 0.0, 0.0
        for i in range(len(T) - 1):
            mid = 0.5 * (T[i] + T[i + 1])
            net = 0.0
            for hot, lo, hi, cp in streams:
                sh = hs if hot else cs
                if lo + sh <= mid <= hi + sh:
                    net += cp if hot else -cp
            cascade += net * (T[i] - T[i + 1])
            lowest = min(lowest, cascade)
        qh = -lowest
        return qh / 1e3, (cascade + qh) / 1e3, qh > 1e-6


    def kpis_of(out, unit):
        m = re.search(r'"%s":\s*(\{[^{}]*\})' % re.escape(unit), out)
        return json.loads(m.group(1)) if m else None


    def run(case):
        env = dict(os.environ, CHOUPO_HOME=str(ROOT))
        p = subprocess.run([str(SOLVE), "."], cwd=case, env=env,
                           capture_output=True, text=True, timeout=1500)
        return p.returncode, p.stdout + p.stderr


    def segments(out, with_water):
        fe, wc = kpis_of(out, "FEHE"), kpis_of(out, "waterCooler")
        sp, ld = kpis_of(out, "separator"), kpis_of(out, "letdown")
        if not all((fe, wc, sp, ld)):
            return None
        qfe, qwc = fe["Q_kW"] * 1e3, wc["Q_kW"] * 1e3
        qsp, qld = abs(sp["Q_kW"]) * 1e3, ld["Q_kW"] * 1e3
        s = [
            (True, fe["T_hot_out"], fe["T_hot_in"],
             qfe / (fe["T_hot_in"] - fe["T_hot_out"])),
            (False, fe["T_cold_in"], fe["T_cold_out"],
             qfe / (fe["T_cold_out"] - fe["T_cold_in"])),
            (True, wc["T_hot_out"], wc["T_hot_in"],
             qwc / (wc["T_hot_in"] - wc["T_hot_out"])),
            (True, sp["T"], wc["T_hot_out"], qsp / (wc["T_hot_out"] - sp["T"])),
            (False, ld["T"] - LATENT / 2, ld["T"] + LATENT / 2, qld / LATENT),
        ]
        if with_water:
            s.append((False, wc["T_cold_in"], wc["T_cold_out"],
                      qwc / (wc["T_cold_out"] - wc["T_cold_in"])))
        return s


    def close(a, b, rel=1e-6):
        return abs(a - b) <= rel * max(1.0, abs(a), abs(b))


    def main():
        if not SOLVE.exists():
            print(f"check_pinch_utility: {SOLVE} missing -- build first")
            return 1
        with tempfile.TemporaryDirectory() as t:
            tmp = Path(t)
            ig = shutil.ignore_patterns("expected", "log.*", "reports", "converged")
            results = {}
            for tag in ("right", "wrong"):
                c = tmp / tag
                case_records.copytree(CASE, c, ignore=ig)
                if tag == "wrong":
                    fd = c / "system" / "flowsheetDict"
                    txt = fd.read_text()
                    new = re.sub(r"\nutilities\s*\(.*?\n\);", "\n", txt, flags=re.S)
                    if new == txt:
                        failures.append("WRONG: could not delete the utilities"
                                        " circuit from the case copy")
                    fd.write_text(new)
                    #  without the circuit the economics pass would refuse an
                    #  unpriced cooling-water stream; this probe is about the
                    #  pinch only, so its postDict carries the pinch pass alone
                    (c / "system" / "postDict").write_text(
                        "pinchPass\n{\n    dTmin   20 K;\n}\n")
                    (c / "system" / "layoutDict").unlink()   # it places sized items
                rc, out = run(c)
                m = re.search(r'"pinch":\s*(\{[^{}]*\})', out)
                if rc != 0 or not m:
                    failures.append(f"{tag.upper()}: exit {rc} or no pinch KPIs")
                    continue
                results[tag] = (json.loads(m.group(1)), out, c)

            for tag, with_water in (("right", False), ("wrong", True)):
                if tag not in results:
                    continue
                k, out, c = results[tag]
                segs = segments(out, with_water)
                if segs is None:
                    failures.append(f"{tag.upper()}: unit KPIs not found")
                    continue
                qh, qc, pin = problem_table(segs, DTMIN)
                if not close(k["Q_H_min_kW"] or 0.0, qh, 1e-6) or \
                        not close(k["Q_C_min_kW"], qc, 1e-6):
                    failures.append(
                        f"{tag.upper()}: engine Q_H,min {k['Q_H_min_kW']},"
                        f" Q_C,min {k['Q_C_min_kW']} vs independent cascade"
                        f" {qh}, {qc}")
                if bool(k.get("pinch_exists", -1)) != pin:
                    failures.append(f"{tag.upper()}: pinch_exists"
                                    f" {k.get('pinch_exists')} vs independent {pin}")
                pop = c / "reports" / "pinch" / "population.csv"
                rows = list(csv.DictReader(open(pop))) if pop.exists() else []
                nutil = sum(1 for r in rows if r["role"] == "utility")
                nseg = sum(1 for r in rows if r["role"] in ("segment", "recovered"))
                if tag == "right":
                    if nutil != 1 or k.get("utility_sides") != 1.0:
                        failures.append(f"RIGHT: utility rows {nutil}, KPI"
                                        f" utility_sides {k.get('utility_sides')}"
                                        " (expected 1)")
                    if nseg != 5 or k.get("segments") != 5.0:
                        failures.append(f"RIGHT: {nseg} stream rows (expected 5:"
                                        " the water is not one)")
                    #  95732.5 -> 95708.8 (moving reference) -> 95719.5 (fixed reference) on 2026-11-18 (DEV.md 4c C390): the liquid
                    #  enthalpy carries v(1 - alpha T) dP now, so the ammonia let-down and
                    #  separator duties of the witness moved (separator -38345.6 -> -38081.9 kW);
                    #  the independent cascade above still equals the engine to 1e-6.
                    if not close(k["Q_C_min_kW"], 95719.5, 1e-5) or \
                            abs(k["Q_H_min_kW"] or 0.0) > 1e-3:
                        failures.append("RIGHT: targets are not the hand-computed"
                                        " 0 / 95719.5 kW (engine %r / %r)"
                                        % (k["Q_H_min_kW"], k["Q_C_min_kW"]))
                    if pin:
                        failures.append("RIGHT: a pinch was found; the problem is"
                                        " a threshold problem")
                    if "THRESHOLD problem" not in out:
                        failures.append("RIGHT: the console does not announce the"
                                        " threshold problem")
                    if "utility   waterCooler [cold side]" not in out:
                        failures.append("RIGHT: the utility side is not announced")
                else:
                    if nutil != 0 or k.get("segments") != 6.0:
                        failures.append("WRONG: with no declared circuit the"
                                        " water must be a stream (segments 6)")
            if "right" in results and "wrong" in results:
                a, b = results["right"][0], results["wrong"][0]
                if close(a["Q_C_min_kW"], b["Q_C_min_kW"], 1e-3) or \
                        close(a["Q_H_min_kW"] or 0.0, b["Q_H_min_kW"], 1e-3):
                    failures.append("the declared and undeclared water give the"
                                    " same targets: the exclusion does nothing")
        if failures:
            print("check_pinch_utility: FAIL")
            for f in failures:
                print("  -", f)
            return 1
        print("check_pinch_utility: OK -- ammonia02's cooling water (declared"
              " circuit CW1) is a utility row, not a stream: targets equal the"
              " independent cascade over the 5 process segments (Q_H,min 0,"
              " Q_C,min 95719.5 kW, no pinch); the same case with the circuit"
              " deleted counts the water and gives the old pinch, so the gate"
              " tells them apart (the exclusion reads the declared circuit and"
              " category, never a stream name)")
        return 0
    return main()


ARMS = [
    ("pinch_p1", arm_pinch_p1),
    ("pinch_p2", arm_pinch_p2),
    ("pinch_utility", arm_pinch_utility),
]


def _claim(name, text):
    from gate_claim import claim_in
    import re
    c = claim_in(text, "check_" + name)
    c = c if c else (text.strip().splitlines() or ["(no output)"])[-1].strip()
    return "[" + name + "] " + re.sub(r"^\s*(\[[^\]]+\]|[\w.\-]+:)\s*OK\b\s*(--)?\s*", "", c)


def main():
    results = []
    arms = ARMS
    if "--arm" in sys.argv:         # run named arm(s) only: --arm a[,b]
        i = sys.argv.index("--arm")
        want = sys.argv[i + 1].split(",")
        del sys.argv[i:i + 2]
        arms = [a for a in ARMS if a[0] in want]
        if len(arms) != len(want):
            print("check_pinch: FAILED -- unknown arm in " + ",".join(want) + "; arms are " + ", ".join(n for n, _ in ARMS))
            return 2
    for name, fn in arms:
        buf = io.StringIO()
        rc = 0
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
            try:
                r = fn()
                rc = r if isinstance(r, int) else 0
            except SystemExit as e:
                rc = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
                if isinstance(e.code, str):
                    print(e.code)
            except Exception:
                traceback.print_exc()
                rc = 1
        results.append((name, rc, buf.getvalue()))
    bad = [n for n, rc, _ in results if rc != 0]
    if bad:
        print("check_pinch: FAILED -- arm(s) " + ", ".join(bad))
    else:
        print("check_pinch: OK -- " + " || ".join(_claim(n, t) for n, _, t in results))
    for name, rc, text in results:
        print("--- arm check_%s (exit %d)" % (name, rc))
        sys.stdout.write(text if text.endswith("\n") or not text else text + "\n")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
