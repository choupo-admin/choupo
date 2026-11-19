#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the rates of production a mechanism prints are the integrator's own, to round-off.

    bin/curate/check_rate_of_production.py

THE REAL DEFECT THIS WOULD HAVE CAUGHT.  A "which reactions make and destroy species i"
table is built from a matrix c_ij = nu_ij r_j V that is computed a SECOND time, beside
the integrator's right-hand side.  A reporting path that forgot what the right-hand side
adds in rateOfReaction_ -- the third-body concentration [M] of R5-R9, R15 or the
fall-off blend of R9 and R15 of the O Conaire H2/O2 mechanism -- would print plausible
numbers (every contribution has the right sign and the right order of magnitude, the
shares add to 100 %) that do NOT sum to dn_i/dt the solver is advancing: the student
would be told that H is mostly made by a reaction that, in the run, makes a fifth of it.
No golden sees it (a golden pins what a run prints, and the wrong table is what it
would pin), and no closure sees it (every column is element-balanced reaction by
reaction, so atoms close whatever r_j is).  The sum rule against the integrator's own
derivative is the only identity that holds r_j to account.

WHAT THIS GATE CHECKS, on tutorials/batch/combustion/ignition01_h2o2_rop (3 instants,
9 species, 21 reactions), from the run's own rateOfProduction.csv and stdout:

  (a) SUM RULE.  For every species at every instant, sum_j c_ij equals the integrator's
      dn_i/dt (the `DNDT_ODE` rows, written by derivatives_ at the same state) to 1e-10
      of the largest term |c_ij| of that species (absolute on the gross scale, so a
      species whose net is a tiny difference of large legs is judged on the legs); and
      the `NET` row equals the sum of the listed contributions.
  (b) ELEMENT CONSERVATION.  For every element e (H, O, N from the components'
      `formula`), sum_i a_ei NET_i = 0 to 1e-10 of sum_i a_ei sum_j |c_ij|.
  (c) THE OPT-IN CHANGES NOTHING.  ignition01_h2o2 (no key) and ignition01_h2o2_rop
      (the key) are run side by side: trajectory.csv byte-identical, every KPI of the
      result JSON equal.  (The original is also held against its own golden by the
      suite; this arm holds that the key does not perturb the integration.)
  (d) THE PRINTED TABLE IS THE MATRIX.  Per species, the printed `net` equals the CSV's
      NET to the 5 digits it prints, and the shares of a side are descending and add to
      at most 100 % (the remainder is the reactions not listed under `top`).
  (e) REFUSALS BY NAME.  A time outside [startTime, endTime] and an unknown key in the
      block each exit non-zero with the unit and the word in the message.
  (f) TEETH.  The same CSV with the contributions of every third-body / fall-off
      reaction (R5-R9, R15) deleted -- exactly the defect above -- must FAIL the sum
      rule of (a) by far more than 1e-10 (relative 1e-3 or more on H or HO2); otherwise
      the comparison could not have seen it.

NOT CHECKED: that the mechanism's reaction rates are right (the Slack pin of
ignition02_h2air_slack and the O Conaire table hold that); a mechanism with a Factory
(LHHW / expression) law (the same rateOfReaction_ serves it; no witness here); the
isothermal mode's T (derivatives_ pins it identically).
"""
import csv
import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gatekit  # noqa: E402
import case_records  # noqa: E402

BASE = "tutorials/batch/combustion/ignition01_h2o2"
ROP = "tutorials/batch/combustion/ignition01_h2o2_rop"
TIMES = [3.0e-6, 7.0e-6, 1.5e-5]
TOL = 1.0e-10
STRIP = ("expected", "latest", "solution.log", "trajectory.csv", "rateOfProduction.csv",
         "constant/propertyManifest")
THIRD_BODY = ("R5_", "R6_", "R7_", "R8_", "R9_", "R15_")


def result(out):
    m = re.search(r"<<<Choupo:result-begin>>>\s*(\{.*?\})\s*<<<Choupo:result-end>>>", out, re.S)
    return json.loads(m.group(1)) if m else None


def atoms(formula):
    d = defaultdict(int)
    for el, n in re.findall(r"([A-Z][a-z]?)(\d*)", formula):
        d[el] += int(n) if n else 1
    return d


def load(path):
    """-> {t: {species: {"c": {reaction: value}, "net": x, "dndt": y}}}"""
    out = defaultdict(lambda: defaultdict(lambda: {"c": {}, "net": None, "dndt": None}))
    with open(path) as f:
        for row in csv.DictReader(f):
            t, sp, rx, v = float(row["t_s"]), row["species"], row["reaction"], float(row["contribution_kmol_s"])
            rec = out[t][sp]
            if rx == "NET":
                rec["net"] = v
            elif rx == "DNDT_ODE":
                rec["dndt"] = v
            else:
                rec["c"][rx] = v
    return out


def sum_rule(data, drop=()):
    """-> (worst |sum_j c - dn/dt| / max|c|, worst relative miss on a species, list of text)."""
    worst, worst_rel, where = 0.0, 0.0, ""
    for t, species in data.items():
        for sp, rec in species.items():
            cs = {k: v for k, v in rec["c"].items() if not k.startswith(drop)} if drop else rec["c"]
            scale = max((abs(v) for v in rec["c"].values()), default=0.0)
            if scale == 0.0:
                continue
            d = abs(sum(cs.values()) - rec["dndt"]) / scale
            if d > worst:
                worst, where = d, f"{sp} at t={t:g}"
            worst_rel = max(worst_rel, abs(sum(cs.values()) - rec["dndt"]) / max(abs(rec["dndt"]), scale * 1e-12))
    return worst, worst_rel, where


def main():
    failures = []
    batch = gatekit.binary("choupoBatch")
    with gatekit.probe_copy(BASE, strip=STRIP) as c0, gatekit.probe_copy(ROP, strip=STRIP) as c1:
        rc0, out0 = gatekit.run(batch, c0)
        rc1, out1 = gatekit.run(batch, c1)
        if rc0 != 0 or rc1 != 0:
            failures.append(f"the witnesses did not run (exit {rc0}/{rc1}): "
                            + " | ".join((out1 if rc1 else out0).strip().splitlines()[-3:]))
            return gatekit.verdict("check_rate_of_production", failures, "")
        csv_path = c1 / "rateOfProduction.csv"
        if not csv_path.exists():
            failures.append("ignition01_h2o2_rop wrote no rateOfProduction.csv")
            return gatekit.verdict("check_rate_of_production", failures, "")
        data = load(csv_path)

        # ---- (c) the opt-in changes nothing ---------------------------------------
        t0, t1 = (c0 / "trajectory.csv").read_bytes(), (c1 / "trajectory.csv").read_bytes()
        if t0 != t1:
            failures.append("(c) trajectory.csv differs between ignition01_h2o2 and ignition01_h2o2_rop: "
                            "the opt-in key changed the integration")
        j0, j1 = result(out0), result(out1)
        k0 = j0["kpis"] if j0 else None
        k1 = j1["kpis"] if j1 else None
        if k0 is None or k0 != k1:
            failures.append("(c) the KPI blocks of the result JSON differ with the key present")

        # ---- instants -----------------------------------------------------------
        got = sorted(data)
        if len(got) != len(TIMES) or any(abs(g - r) > 1e-9 * r for g, r in zip(got, TIMES)):
            failures.append(f"the instants reported are {got}, expected {TIMES}")

        # ---- (a) sum rule + NET row ----------------------------------------------
        worst, _, where = sum_rule(data)
        if worst > TOL:
            failures.append(f"(a) sum_j c_ij differs from the integrator's dn_i/dt by {worst:.3e} of the "
                            f"largest term (> {TOL:g}), worst: {where}")
        net_miss = 0.0
        for t, species in data.items():
            for sp, rec in species.items():
                scale = max((abs(v) for v in rec["c"].values()), default=0.0) or 1.0
                net_miss = max(net_miss, abs(sum(rec["c"].values()) - rec["net"]) / scale)
        if net_miss > 1e-14:
            failures.append(f"(a) the NET rows are not the sum of the listed contributions ({net_miss:.2e})")

        # ---- (b) elements ----------------------------------------------------------
        worst_el, where_el = 0.0, ""
        names = {sp for s in data.values() for sp in s}
        a_of = {}
        for sp in names:
            txt = case_records.record_path(Path(c1), f"components/{sp}.dat").read_text()
            m = re.search(r"^\s*formula\s+(\w+)\s*;", txt, re.M)
            if not m:
                failures.append(f"(b) {sp}: no formula in its record")
                continue
            a_of[sp] = atoms(m.group(1))
        elements = sorted({e for a in a_of.values() for e in a})
        for t, species in data.items():
            for e in elements:
                net = sum(a_of[sp].get(e, 0) * rec["net"] for sp, rec in species.items() if sp in a_of)
                gross = sum(a_of[sp].get(e, 0) * abs(v) for sp, rec in species.items() if sp in a_of
                            for v in rec["c"].values())
                r = abs(net) / gross if gross else 0.0
                if r > worst_el:
                    worst_el, where_el = r, f"{e} at t={t:g}"
        if worst_el > TOL:
            failures.append(f"(b) an element is not conserved by the reported nets: {worst_el:.3e} of the gross "
                            f"({where_el}) > {TOL:g}")

        # ---- (d) the printed table is the matrix -----------------------------------
        blocks = out1.split("=== Rates of production")[1:]
        if len(blocks) != len(TIMES):
            failures.append(f"(d) {len(blocks)} printed blocks for {len(TIMES)} instants")
        else:
            worst_print = 0.0
            for blk, t in zip(blocks, got):
                lines = blk.splitlines()
                cur = None
                for ln in lines:
                    m = re.match(r"\s{2}(\S+):\s+net\s+(\S+) kmol/s", ln)
                    if m:
                        cur = m.group(1)
                        want = data[t][cur]["net"]
                        have = float(m.group(2))
                        worst_print = max(worst_print, abs(have - want) / max(abs(want), 1e-300))
                        continue
                    m = re.match(r"\s+(made by|destroyed by):\s*(.*)$", ln)
                    if m:
                        shares = [float(x) for x in re.findall(r"([\d.]+) %", m.group(2))]
                        if shares != sorted(shares, reverse=True) or sum(shares) > 100.0 + 0.1 * len(shares):
                            failures.append(f"(d) {cur} at t={t:g}: printed shares {shares} are not descending / exceed 100 %")
            if worst_print > 6e-5:
                failures.append(f"(d) a printed net differs from the CSV's NET by {worst_print:.2e} relative (> 6e-5, 5 digits)")

        # ---- (e) refusals by name --------------------------------------------------
        for label, old, new, words in (
            ("a time outside the run", "times  ( 3.0e-6  7.0e-6  1.5e-5 );", "times  ( 3.0e-6  1.0 );", ("bomb", "outside")),
            ("an unknown key", "top    5;", "top    5;  frobnicate 1;", ("bomb", "frobnicate")),
        ):
            with gatekit.probe_copy(ROP, strip=STRIP) as c2:
                try:
                    gatekit.edit(c2 / "system/flowsheetDict", old, new)
                except gatekit.EditNotApplied as e:
                    failures.append(f"(e) {label}: {e}")
                    continue
                rc, out = gatekit.run(batch, c2)
                if rc == 0 or not all(w in out for w in words):
                    failures.append(f"(e) {label} was not refused by name (exit {rc}; wanted {words} in the message)")

        # ---- (f) teeth: drop the third-body reactions' columns ----------------------
        w_drop, w_rel, _ = sum_rule(data, drop=THIRD_BODY)
        if w_drop < 1e-3:
            failures.append(f"(f) deleting the third-body / fall-off contributions moved the sum rule by only "
                            f"{w_drop:.2e} -- the comparison cannot see that defect")

    return gatekit.verdict(
        "check_rate_of_production", failures,
        f"the rates of production of the O Conaire H2/O2 mechanism at {len(TIMES)} instants of the ignition equal "
        f"the integrator's own dn_i/dt term by term (worst {worst:.1e} of the largest term, tol {TOL:g}); atoms H, O, N "
        f"are conserved by the nets (worst {worst_el:.1e}); the key changes nothing when absent (trajectory byte-identical); "
        f"the printed table is the matrix; two misuses are refused by name; dropping the third-body columns is seen "
        f"({w_drop:.1e})",
    )


if __name__ == "__main__":
    sys.exit(main())
