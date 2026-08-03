#!/usr/bin/env python3
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

Exit 1 listing failures."""
import csv
import json
import os
import re
import shutil
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
    shutil.copytree(CASE, case,
                    ignore=shutil.ignore_patterns("expected", "log.*",
                                                  "reports", "converged"))
    return case


def kpi_block(out: str):
    m = re.search(r'"pinch":\s*({[^}]*})', out)
    return json.loads(m.group(1)) if m else None


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

    if failures:
        print("check_pinch_p1: FAIL")
        for f in failures:
            print("  -", f)
        return 1
    print("check_pinch_p1: OK -- witness targets equal the independent"
          " cascade (107.5 / 40 / 353.15), CSV coherent, negative silent,"
          " dTmin<=0 refused")
    return 0


if __name__ == "__main__":
    sys.exit(main())
