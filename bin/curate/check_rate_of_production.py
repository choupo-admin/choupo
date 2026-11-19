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

PHASE 2, THE ELEMENT PATH FLUX (`pathFlux ( H O );` in the same block).

THE SECOND REAL DEFECT THIS WOULD HAVE CAUGHT.  A flux of H or O atoms from reactant A to
product B built from the stoichiometry the vessel stores -- the NET nu per entry -- or
without the normalisation by the atoms N_ej of the element on one side of the step,
draws a diagram whose arrows are individually plausible (every flux has the right
direction and order of magnitude) but move atoms that the reaction does not move: a
species on both sides of a step cancels out of its net coefficient and its atoms vanish
from the picture, and a missing 1/N_ej counts the atoms of a step with two atoms of the
element twice.  The student reads "OH makes water" off an arrow that is wrong by a
factor of two.  No golden sees it (it pins the printed wrong figure) and the species
rates do not see it (they never read the flux).  The identity that holds it to account
is the atom balance of each species, taken from the paths: what arrives at species i
minus what leaves it is a_ei times its net rate, and that net rate is the OTHER
output of the same run (rateOfProduction.csv).

  (g) PATHS REBUILT.  The NET rows of pathFlux.csv equal the per-reaction rows summed with
      the reverse legs subtracted (one direction per pair), to round-off.
  (h) ATOM IDENTITY.  For every instant, element e and species i: sum_B F_{B->i} - sum_B
      F_{i->B} = a_ei net_i, with net_i read from rateOfProduction.csv, to 1e-10 of the
      gross flux through i.
  (i) ONE REACTION AT A TIME.  The rows of reaction j sum to |r_j| V N_ej, with |r_j| V
      taken from rateOfProduction.csv and N_ej counted by this gate from the reactions
      file; every row runs from a reactant to a product when r_j > 0 and from a product
      to a reactant when r_j < 0.
  (j) THE DRAWING IS THE TABLE.  Each pathFlux_<element>_<t>.dot has balanced braces, every
      edge's nodes declared, and as many edges as the CSV has NET pairs for that element
      and instant.
  (k) REFUSALS BY NAME: an element in no species, a stoichiometry entry with nu = 0
      (the split is lost) and a reaction that does not conserve the element.
  (l) TEETH.  The same rows with the 1/N_ej normalisation dropped (every flux times
      N_ej) must FAIL (h) by far more than 1e-10; otherwise (h) could not have seen it.

NOT CHECKED: that the mechanism's reaction rates are right (the Slack pin of
ignition02_h2air_slack and the O Conaire table hold that); a mechanism with a Factory
(LHHW / expression) law (the same rateOfReaction_ serves it; no witness here); the
isothermal mode's T (derivatives_ pins it identically); a step written with a
species ONCE at its net coefficient although it is on both sides (the dictionary must
list it as two entries; no witness has one); the Graphviz rendering itself.
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
STRIP = ("expected", "latest", "solution.log", "trajectory.csv", "rateOfProduction.csv", "pathFlux.csv",
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


def parse_reactions(text):
    """-> {reaction name: [(component, nu), ...]} from a constant/reactions dictionary."""
    out = {}
    for m in re.finditer(r"^(\w+)\s*\{(.*?)^\}", text, re.S | re.M):
        st = re.search(r"stoichiometry\s*\((.*?)\)\s*;", m.group(2), re.S)
        if st:
            out[m.group(1)] = [(c, float(n)) for c, n in
                               re.findall(r"component\s+(\w+)\s*;\s*nu\s+([-+\d.eE]+)\s*;", st.group(1))]
    return out


def load_flux(path):
    """-> (rows, net): rows = [(t, e, from, to, reaction, flux)] per reaction;
    net = {(t, e): {(from, to): flux}} the NET rows."""
    rows, net = [], defaultdict(dict)
    with open(path) as f:
        for row in csv.DictReader(f):
            t, e, a, b, rx, v = (float(row["t_s"]), row["element"], row["from"], row["to"],
                                 row["reaction"], float(row["flux_kmol_atoms_s"]))
            if rx == "NET":
                net[(t, e)][(a, b)] = v
            else:
                rows.append((t, e, a, b, rx, v))
    return rows, net


def nets_from_rows(rows, scale=None):
    """Directed per-reaction rows -> {(t, e): {(A, B): F_AB > 0}} with self-loops dropped.
    `scale(t, e, rx)` multiplies each row (the sabotage of (l))."""
    acc = defaultdict(lambda: defaultdict(float))
    for t, e, a, b, rx, v in rows:
        if a == b:
            continue
        v *= scale(t, e, rx) if scale else 1.0
        acc[(t, e)][(a, b)] += v
        acc[(t, e)][(b, a)] -= v
    return {k: {p: v for p, v in d.items() if v > 0.0} for k, d in acc.items()}


def atom_identity(nets, a_of, data):
    """worst |inflow - outflow - a_ei net_i| / gross flux through i, and where."""
    worst, where = 0.0, ""
    for (t, e), pairs in nets.items():
        tk = min(data, key=lambda x: abs(x - t))
        for sp in {x for p in pairs for x in p}:
            inflow = sum(v for (a, b), v in pairs.items() if b == sp)
            outflow = sum(v for (a, b), v in pairs.items() if a == sp)
            gross = inflow + outflow
            miss = abs(inflow - outflow - a_of[sp].get(e, 0) * data[tk][sp]["net"]) / gross
            if miss > worst:
                worst, where = miss, f"{sp}, element {e}, t={t:g}"
    return worst, where


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

        # ======================= phase 2: the element path flux =========================
        flux_path = c1 / "pathFlux.csv"
        n_pairs = n_dot = 0
        worst_g = worst_h = worst_i = w_tooth = 0.0
        if not flux_path.exists():
            failures.append("ignition01_h2o2_rop wrote no pathFlux.csv")
        else:
            rows, wnet = load_flux(flux_path)
            rxns = parse_reactions((c1 / "constant/reactions").read_text())
            els = sorted({k[1] for k in wnet})
            if els != ["H", "O"]:
                failures.append(f"pathFlux.csv carries elements {els}, expected ['H', 'O']")
            # |r_j| V per reaction and instant, from the rate matrix: c_ij / nu_ij
            rv = defaultdict(dict)
            with open(csv_path) as f:
                for row in csv.DictReader(f):
                    if row["nu"] != "" and float(row["nu"]) != 0.0:
                        rv[(float(row["t_s"]), row["reaction"])][row["species"]] = (
                            float(row["contribution_kmol_s"]) / float(row["nu"]))
            tkey = lambda t: min(got, key=lambda x: abs(x - t))  # noqa: E731

            def N_of(rx, e):
                return sum(-nu * a_of[c].get(e, 0) for c, nu in rxns[rx] if nu < 0)

            # (g) the NET rows are the rows rebuilt
            rebuilt = nets_from_rows(rows)
            for key in set(rebuilt) | set(wnet):
                a, b = rebuilt.get(key, {}), wnet.get(key, {})
                for pair in set(a) | set(b):
                    sc = max(abs(a.get(pair, 0.0)), abs(b.get(pair, 0.0)))
                    worst_g = max(worst_g, abs(a.get(pair, 0.0) - b.get(pair, 0.0)) / sc)
            if worst_g > 1e-12:
                failures.append(f"(g) the NET rows differ from the per-reaction rows rebuilt by {worst_g:.2e}")
            # (h) the atom identity on the written NET rows
            worst_h, where_h = atom_identity(wnet, a_of, data)
            if worst_h > TOL:
                failures.append(f"(h) inflow - outflow of atoms differs from a_ei net_i by {worst_h:.3e} of the gross "
                                f"flux (> {TOL:g}), worst: {where_h}")
            # (i) each reaction on its own
            by_rx = defaultdict(float)
            for t, e, a, b, rx, v in rows:
                by_rx[(tkey(t), e, rx)] += v
                nus = dict(rxns[rx])
                if a not in nus or b not in nus:
                    failures.append(f"(i) {rx}: a flux row names a species outside the reaction ({a} -> {b})")
                    continue
                # the sign of the rate: c_ij = nu r V, so r > 0 iff the first species' ratio is positive
                r_sign = next(iter(rv[(tkey(t), rx)].values()))
                donor_ok = (nus[a] < 0 and nus[b] > 0) if r_sign > 0 else (nus[a] > 0 and nus[b] < 0)
                if not donor_ok:
                    failures.append(f"(i) {rx} at t={t:g}: {a} -> {b} runs against the direction of the net rate")
            for (t, e, rx), tot in by_rx.items():
                rabs = abs(next(iter(rv[(t, rx)].values())))
                want = rabs * N_of(rx, e)
                worst_i = max(worst_i, abs(tot - want) / want)
            if worst_i > TOL:
                failures.append(f"(i) the fluxes of a reaction do not sum to |r_j| V N_ej: worst {worst_i:.3e} (> {TOL:g})")
            # (j) the .dot files
            for t in TIMES:
                for e in els:
                    dot = c1 / f"pathFlux_{e}_{t:.3e}.dot"
                    if not dot.exists():
                        failures.append(f"(j) {dot.name} was not written")
                        continue
                    txt = dot.read_text()
                    if txt.count("{") != txt.count("}") or txt.count("{") != 1:
                        failures.append(f"(j) {dot.name}: braces are not balanced")
                    nodes = set(re.findall(r'^\s*"([^"]+)";\s*$', txt, re.M))
                    edges = re.findall(r'^\s*"([^"]+)"\s*->\s*"([^"]+)"\s*\[', txt, re.M)
                    for a, b in edges:
                        if a not in nodes or b not in nodes:
                            failures.append(f"(j) {dot.name}: edge {a} -> {b} uses an undeclared node")
                    k = next(x for x in wnet if x[1] == e and abs(x[0] - t) < 1e-9 * t)
                    nz = sum(1 for v in wnet[k].values() if v != 0.0)
                    if len(edges) != nz:
                        failures.append(f"(j) {dot.name}: {len(edges)} edges but {nz} nonzero NET pairs in the CSV")
                    n_dot += 1
                    n_pairs += nz
            # (l) teeth: the same rows without the 1/N_ej normalisation
            sab = nets_from_rows(rows, scale=lambda t, e, rx: N_of(rx, e))
            w_tooth, _ = atom_identity(sab, a_of, data)
            if w_tooth < 1e-3:
                failures.append(f"(l) dropping the 1/N_ej normalisation moved the atom identity by only {w_tooth:.2e} "
                                f"-- (h) cannot see that defect")

        # (k) refusals by name
        for label, path, old, new, words in (
            ("an element in no species", "system/flowsheetDict", "pathFlux ( H O );", "pathFlux ( H Xx );", ("bomb", "Xx")),
            ("a stoichiometry entry with nu = 0", "constant/reactions",
             "{ component H;      nu -1;  order 1; }\n        { component O;      nu  1;  order 0; }",
             "{ component H;      nu -1;  order 1; }\n        { component N2;     nu  0;  order 0; }\n"
             "        { component O;      nu  1;  order 0; }",
             ("bomb", "N2", "nu = 0")),
            ("a reaction that does not conserve the element", "constant/reactions",
             "{ component O;      nu  1;  order 0; }", "{ component O;      nu  2;  order 0; }",
             ("bomb", "R1_H_O2_O_OH", "not conserved")),
        ):
            with gatekit.probe_copy(ROP, strip=STRIP) as c3:
                try:
                    gatekit.edit(c3 / path, old, new)
                except gatekit.EditNotApplied as ex:
                    failures.append(f"(k) {label}: {ex}")
                    continue
                rc, out = gatekit.run(batch, c3)
                if rc == 0 or not all(w in out for w in words):
                    failures.append(f"(k) {label} was not refused by name (exit {rc}; wanted {words} in the message)")

    return gatekit.verdict(
        "check_rate_of_production", failures,
        f"the rates of production of the O Conaire H2/O2 mechanism at {len(TIMES)} instants of the ignition equal "
        f"the integrator's own dn_i/dt term by term (worst {worst:.1e} of the largest term, tol {TOL:g}); atoms H, O, N "
        f"are conserved by the nets (worst {worst_el:.1e}); the key changes nothing when absent (trajectory byte-identical); "
        f"the printed table is the matrix; two misuses are refused by name; dropping the third-body columns is seen "
        f"({w_drop:.1e}).  Element path flux of H and O: the NET rows are the per-reaction rows rebuilt ({worst_g:.0e}); "
        f"inflow - outflow of atoms at every species equals a_ei net_i to {worst_h:.1e} of the gross flux; each reaction's "
        f"fluxes sum to |r_j| V N_ej ({worst_i:.1e}); {n_dot} .dot files parse and carry the {n_pairs} NET pairs; three "
        f"misuses are refused by name; dropping 1/N_ej is seen ({w_tooth:.1e})",
    )


if __name__ == "__main__":
    sys.exit(main())
