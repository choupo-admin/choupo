#!/usr/bin/env python3
# =============================================================================
#        \|/       C hemicals     | Open-source, glass-box chemical process simulator
#       \\|//      H eat-transfer | https://choupo.org
#      \\\|///     O perations    |
#       \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
#        \|/       P roperties    | Licence: GPL-3.0-or-later
#         |        O ptimization  |
#        /|\                      |
# -----------------------------------------------------------------------------
#     SPDX-License-Identifier: GPL-3.0-or-later
#     Credit and attribution: see AUTHORS
#     Required legal notices:  see NOTICE
# =============================================================================
"""check_phase_split_scan -- the phase split of one feed, swept along T or P
(DEV.md 4c C118 stage 1, 2026-10-20; src/propertyOps/PhaseSplitScan.cpp).

The op solves ONE isothermal flash per grid point through the flash unit's
own solver and publishes what exists at each point.  This gate holds, from
runs it performs itself:

  (a) ONE HOME.  A single-point scan at each of the three steady witnesses'
      operating state -- flash21 (ice from water/ethanol), flash16 (calcite
      under a speciation), flash19 (vapour + aqueous + organic + precipitate)
      -- on a COPY of that case's sealed constant/, reproduces the unit's own
      golden (solidFraction, a_water; pH, V_over_F) to 1e-6 relative.  A scan
      that solved a different equilibrium from the unit would be a second
      flash under another name.
  (b) THE FREEZING-POINT IDENTITY, recomputed here from the witness's OWN
      water.dat (Hfus, triplePoint.T -- parsed, never typed): at every grid
      point where ice is present `a_water` = exp(-dHfus (1 - T/Tt)/(R T)) to
      1e-8, and where ice is absent `a_water` lies BELOW that value (lnSI =
      ln(a_w/aEq) <= 0: the declared crystal stays subsaturated).  Also the
      engine's own `aEq_water` column equals the recomputation.
  (c) THE APPEARANCE IS ANNOUNCED: the ice point found from the CSV (the
      first grid value whose `ice` amount is > 0) is the `appeared` event in
      the JSON block, printed on the console between the two grid values it
      lies between, and `diag first_ice` is that grid value.
  (d) A REFUSED POINT IS A PUBLISHED FACT: a probe of PURE water under the
      same LIQUID+SOLID declaration has no state with BOTH phases below its
      melting point (forming ice cannot change a pure liquid's activity, so
      the solver's consistency guard refuses: "does not relax its own
      saturation" -- the whole feed would freeze, which that phase set does
      not contain) -- every sub-273.16 K point is refused BY NAME (the
      flash's own sentence), every point above solves,
      the CSV carries every row (`solved 0`, nan amounts -- no neighbour's
      phases, no single-phase guess), the refusal rides the advisory log, and
      the run exits 0 because points were solved.
  (e) EVERY EXTRAPOLATION THE RECORDS ANNOUNCE reaches the block at the first
      point that raised it: the sub-273 K Antoine extrapolation (`validity`)
      and the solid's missing dCp term (`thermo`) are in `firstRaised` on
      exactly one point each, and that point is the first one below the
      record's own lower bound.
  (f) THE GRAMMAR REFUSES BY NAME: `state` carrying the swept axis; a
      variable that is not T or P; an empty composition; an unknown
      `phaseSet` word (refused by the flash unit's own reader).
  (g) CLOSURE at every solved point of the witness: the phase amounts sum to
      1 and the amount-weighted compositions reproduce the feed, both to
      1e-9 -- a split that does not conserve the feed is not a split.
  (h) SOURCE: the op calls `IsothermalFlash::solveCore` and `readOptions` and
      writes no equilibrium of its own (no `solidEq::`, no `Kvec`, no
      `equilibrate(` outside the flash call) -- the one-flash-home rule, which
      no output arm can see from a number that happens to agree.

SABOTAGES, performed by hand on 2026-10-20 and restored (each a one-line edit
of PhaseSplitScan.cpp; the engine was rebuilt between them):
  S1  `readPhases` reads the solid amount but does NOT subtract it from the
      liquid (`liq[i] = (1 - V) sol.x[i]`)            -> caught by (g) ONLY
      (amounts summing to 1.032 at 264.15 K, 1.476 at 258.15 K; water
      reconstructing to 1.33 against a feed of 0.9).  Arm (a) did NOT see
      it -- it pins the ice amount and a_water, which the sabotage leaves
      intact -- which is why (g) exists as its own arm.
  S2  the appearance detection compares each point with the FIRST solved
      point instead of the previous one                -> caught by (c) (the
      event's `from` is 273.15, not the grid value before the ice point).
  S3  a refused point falls back to the previous point's phases (the silent
      fallback this op exists to refuse)               -> caught by (d) (rows
      below 273.16 K read solved 1).
  S4  `a_water` published as x_w instead of gamma_w x_w -- NOT reachable from
      this op (the observable is the flash's, IsothermalFlash.cpp solveSLE),
      so it was performed THERE: caught by (b) at every ice-present point
      (0.80 against 0.857 at 258.15 K) and by (a).

NOT CHECKED, said plainly: any MEASURED freezing point (the witness is
structural, as flash21 is); the reactive path along a sweep (arm (a) holds
flash16/flash19 at ONE point each -- a pH trajectory against a published
curve is a validation act nobody has performed); `phaseSet auto` changing
along a scan (no corpus package both admits two liquids and crosses a split
on a declared grid); the pressure sweep (`variable P`) beyond the grammar
arm -- the same loop, a different axis, exercised by no witness yet.
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
BIN = ROOT / "choupoProps"
WITNESS = ROOT / "tutorials/props/thermo/phaseSplit01_freeze_water_ethanol"
FLASH = ROOT / "tutorials/steady/flash"
SRC = ROOT / "src/propertyOps/PhaseSplitScan.cpp"
R = 8.314462618

fails = []


def fail(msg):
    fails.append(msg)
    print("FAIL  " + msg)


def run(case_dir):
    p = subprocess.run([str(BIN), "."], cwd=case_dir, capture_output=True,
                       text=True, timeout=900,
                       env={"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"})
    return p.returncode, p.stdout, p.stderr


def result_json(out):
    i = out.find("<<<Choupo:result-begin>>>")
    j = out.find("<<<Choupo:result-end>>>")
    if i < 0 or j < 0:
        return None
    return json.loads(out[i + len("<<<Choupo:result-begin>>>"):j])


def read_csv(path):
    lines = path.read_text().splitlines()
    head = lines[0].split(",")
    rows = []
    for ln in lines[1:]:
        if not ln.strip():
            continue
        vals = ln.split(",")
        rows.append({h: (float(v) if v != "nan" else math.nan)
                     for h, v in zip(head, vals)})
    return head, rows


def golden(case, kind, name, key):
    for line in (case / "expected").read_text().splitlines():
        f = line.split()
        if len(f) >= 4 and f[0] == kind and f[1] == name and f[2] == key:
            return float(f[3])
    fail(f"{case.name}'s golden carries no row `{kind} {name} {key}`")
    return math.nan


def props_case(tmp, tag, steady, state, vary, extra=""):
    """A props case on a COPY of a steady case's sealed constant/."""
    d = Path(tmp) / tag
    (d / "system").mkdir(parents=True)
    shutil.copytree(steady / "constant", d / "constant")
    (d / "system/controlDict").write_text(
        'application choupoProps;\ndescription "probe";\nverbosity 3;\n')
    (d / "system/propsDict").write_text(
        "operations\n(\n    {\n        name probe;\n        type phaseSplitScan;\n"
        f"        state {{ {state} }}\n        vary {{ {vary} }}\n{extra}"
        "        output { file probe.csv; }\n    }\n);\n")
    return d


def feed_of(steady):
    """componentMolarFlows of 0/feed, as `name value;` text (moles)."""
    t = (steady / "0/feed").read_text()
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    t = re.sub(r"//[^\n]*", "", t)
    m = re.search(r"componentMolarFlows\s*\{(.*?)\}", t, re.S)
    parts = []
    for ln in m.group(1).split(";"):
        f = ln.split()
        if len(f) >= 2:
            parts.append(f"{f[0]} {f[1]};")
    return " ".join(parts)


def operating(steady):
    t = (steady / "system/flowsheetDict").read_text()
    m = re.search(r"operation\s*\{\s*T\s+([\d.]+)\s*K\s*;\s*P\s+([\d.]+)\s*atm", t)
    return float(m.group(1)), float(m.group(2)) * 101325.0


def rel(a, b):
    return abs(a - b) / max(abs(b), 1e-300)


def main():
    if not BIN.exists():
        print("check_phase_split_scan: FAILED -- choupoProps is missing; build"
              " first (a check that cannot run must not pass)")
        return 1
    if not (WITNESS / "expected").exists():
        fail("the witness ships no golden")

    with tempfile.TemporaryDirectory() as tmp:
        # ---- (a) one home: the three steady witnesses at ONE point each ----
        for name, pins in (
            ("flash21_freeze_concentration",
             (("solidFraction", "ice"), ("a_water", "a_water"))),
            ("flash16_calcite_precipitation",
             (("pH", "pH"), ("V_over_F", "V"))),
            ("flash19_organic_and_precipitate",
             (("pH", "pH"), ("V_over_F", "V"))),
        ):
            steady = FLASH / name
            T, P = operating(steady)
            d = props_case(tmp, "a_" + name, steady,
                           f"P {P}; composition {{ {feed_of(steady)} }}",
                           f"variable T; from {T}; to {T + 1.0}; n 2;")
            rc, out, err = run(d)
            if rc != 0:
                fail(f"(a) {name}: the single-point scan did not run (exit"
                     f" {rc}):\n{(out + err)[-1500:]}")
                continue
            head, rows = read_csv(d / "probe.csv")
            row = rows[0]
            if row["solved"] != 1:
                fail(f"(a) {name}: the operating point was not solved")
                continue
            for key, col in pins:
                want = golden(steady, "kpi", "flash01" if "flash" in name
                              and name != "flash21_freeze_concentration"
                              else "freezer01", key)
                got = row.get(col, math.nan)
                if not (rel(got, want) <= 1e-6):
                    fail(f"(a) {name}: scan {col} = {got:.12g}, the unit's"
                         f" golden {key} = {want:.12g}")
            if name == "flash19_organic_and_precipitate":
                #  four phases at once: V, aqueous, organic, calcite
                present = [h for h in ("V", "L1", "L2", "calcite")
                           if row.get(h, 0.0) > 0.0]
                if len(present) != 4:
                    fail(f"(a) flash19: expected V, L1, L2 and calcite present,"
                         f" got {present}")
                js = result_json(out)
                labels = js["phaseSplitScans"][0]["phaseLabels"]
                if labels.get("L1") != "aqueous" or labels.get("L2") != "organic":
                    fail(f"(a) flash19: L1/L2 are not labelled aqueous/organic:"
                         f" {labels}")
            if name == "flash16_calcite_precipitation" and \
                    not (row.get("calcite", 0.0) > 0.0):
                fail("(a) flash16: the precipitate is not published as"
                     " `calcite` by the mineral that owns it")

        # ---- the witness itself ----------------------------------------
        d = Path(tmp) / "witness"
        shutil.copytree(WITNESS, d, ignore=shutil.ignore_patterns("expected", "*.csv"))
        rc, out, err = run(d)
        if rc != 0:
            fail(f"the witness did not run (exit {rc}):\n{(out + err)[-1500:]}")
            print("check_phase_split_scan: FAILED")
            return 1
        js = result_json(out)
        blk = js["phaseSplitScans"][0]
        head, rows = read_csv(d / "freeze.csv")
        diag = next(o for o in js["operationResults"]
                    if o["name"] == "freeze")["diagnostics"]

        # ---- (b) the identity from the record's own numbers ------------
        wat = (d / "constant/components/water.dat").read_text()
        Tt = float(re.search(r"triplePoint\s*\{[^}]*?\bT\s+([\d.]+)", wat, re.S).group(1))
        Hfus = float(re.search(r"\bHfus\s+([\d.]+)", wat).group(1))
        n_ice = 0
        for row in rows:
            if row["solved"] != 1:
                continue
            T = row["T"]
            aEq = math.exp(-Hfus * (1.0 - T / Tt) / (R * T))
            if abs(row["aEq_water"] - aEq) > 1e-10:
                fail(f"(b) T = {T}: the engine's aEq_water {row['aEq_water']:.12g}"
                     f" is not exp(-dG_fus/RT) = {aEq:.12g} from water.dat")
            if row.get("ice", 0.0) > 0.0:
                n_ice += 1
                if abs(row["a_water"] - aEq) > 1e-8:
                    fail(f"(b) T = {T}: ice present but gamma_w x_w ="
                         f" {row['a_water']:.12g} != {aEq:.12g}")
            elif not (row["a_water"] < aEq):
                #  lnSI = ln(a_w / aEq) <= 0 when the crystal is absent: the
                #  liquid's water activity is BELOW what the crystal needs.
                fail(f"(b) T = {T}: ice absent but the water activity"
                     f" {row['a_water']:.12g} is not below the saturation"
                     f" value {aEq:.12g} (lnSI would be positive)")
        if n_ice < 5 or n_ice >= len(rows):
            fail(f"(b) the witness has ice at {n_ice} of {len(rows)} points --"
                 " the scan must cross the ice point")

        # ---- (c) the appearance ---------------------------------------
        ice_rows = [r for r in rows if r.get("ice", 0.0) > 0.0]
        before = [r for r in rows if not (r.get("ice", 0.0) > 0.0)]
        if ice_rows and before:
            first = ice_rows[0]["T"]
            prev = min(r["T"] for r in before if r["T"] > first)   # the grid value just above
            ev = [e for e in blk["events"]
                  if e["kind"] == "appeared" and e["phase"] == "ice"]
            if len(ev) != 1:
                fail(f"(c) expected ONE `appeared` event for ice, got {ev}")
            else:
                if abs(ev[0]["to"] - first) > 1e-9 or abs(ev[0]["from"] - prev) > 1e-9:
                    fail(f"(c) the ice event lies between {ev[0]['from']} and"
                         f" {ev[0]['to']}; the CSV says between {prev} and {first}")
            line = f"phase 'ice' APPEARED between T = {prev:.3f} and {first:.3f}"
            if line not in out:
                fail(f"(c) the console does not announce {line!r}")
            if abs(diag.get("first_ice", math.nan) - first) > 1e-9:
                fail(f"(c) diag first_ice = {diag.get('first_ice')} != {first}")
            if any(e["kind"] == "disappeared" for e in blk["events"]):
                fail("(c) a disappearance was announced on a monotone cooling")

        # ---- (e) the announcements at their first point ---------------
        raised = [(p["T"], a) for p in blk["points"]
                  for a in p.get("firstRaised", [])]
        psat = [(T, a) for T, a in raised
                if a["category"] == "validity" and "OUTSIDE its declared Trange" in a["message"]]
        dcp = [(T, a) for T, a in raised
               if a["category"] == "thermo" and "heat-capacity term" in a["message"]]
        if not psat:
            fail("(e) no sub-273 K Psat extrapolation reached the block")
        else:
            lo = float(re.search(r"Trange\s*\(\s*([\d.]+)", wat).group(1))
            first_below = max(r["T"] for r in rows if r["T"] < lo)
            for T, a in psat:
                if abs(T - first_below) > 1e-9:
                    fail(f"(e) the Psat extrapolation was first raised at T = {T},"
                         f" not at the first point below Trange ({first_below})")
        if len(dcp) != 1:
            fail(f"(e) the solid's missing-dCp announcement should be raised at"
                 f" exactly one point, got {len(dcp)}")
        if diag.get("n_announcements", 0) != len(raised):
            fail("(e) diag n_announcements disagrees with the block")

        # ---- (g) closure ----------------------------------------------
        feed = blk["feed"]
        names = blk["phaseNames"]
        for row in rows:
            if row["solved"] != 1:
                continue
            tot = sum(row[p] for p in names)
            if abs(tot - 1.0) > 1e-9:
                fail(f"(g) T = {row['T']}: phase amounts sum to {tot:.12g}")
            for comp, zc in feed.items():
                recon = sum(row[p] * row[f"x_{p}_{comp}"] for p in names
                            if row[p] > 0.0)
                if abs(recon - zc) > 1e-9:
                    fail(f"(g) T = {row['T']}: {comp} reconstructs to {recon:.12g},"
                         f" feed {zc}")
        if diag["n_refused"] != 0 or diag["n_solved"] != len(rows):
            fail("(g) the witness has refused points; it must not")

        # ---- (d) a refused point ----------------------------------------
        T0 = 275.15
        p = props_case(tmp, "d_pure", FLASH / "flash21_freeze_concentration",
                       "P 101325; composition { water 1.0; }",
                       f"variable T; from {T0}; to 268.15; n 8;")
        rc, out, err = run(p)
        if rc != 0:
            fail(f"(d) the pure-water probe must exit 0 (points above 273.16 K"
                 f" solve); got {rc}:\n{(out + err)[-1200:]}")
        else:
            head, prow = read_csv(p / "probe.csv")
            if len(prow) != 8:
                fail(f"(d) the CSV must carry every row, got {len(prow)}")
            pj = result_json(out)["phaseSplitScans"][0]
            for row, pt in zip(prow, pj["points"]):
                below = row["T"] < Tt
                if below and row["solved"] != 0:
                    fail(f"(d) T = {row['T']}: pure water below Tt was 'solved'"
                         " -- a fallback answer stood in for a refusal")
                if below and not all(math.isnan(row[n]) for n in pj["phaseNames"]):
                    fail(f"(d) T = {row['T']}: a refused row carries phase amounts")
                #  Pure water below Tt: forming ice cannot change a pure
                #  liquid's activity (x_w stays 1), so the solver's own
                #  consistency guard refuses ("does not relax its own
                #  saturation") -- there is no state with BOTH phases; the
                #  exhaustion sentence is the other way the flash says it.
                if below and not any(s in pt.get("reason", "") for s in
                                     ("does not relax its own saturation",
                                      "complete solidification")):
                    fail(f"(d) T = {row['T']}: the refusal is not the flash's own"
                         f" sentence: {pt.get('reason', '')[:120]!r}")
                if not below and row["solved"] != 1:
                    fail(f"(d) T = {row['T']}: pure water above Tt did not solve")
            advs = [a for a in result_json(out)["advisories"]
                    if a.get("category") == "refusal" and "REFUSED by the flash" in a.get("message", "")]
            if not advs:
                fail("(d) the refusals did not ride the advisory log")
            if "REFUSED --" not in out:
                fail("(d) the console table does not mark the refused points")

        # ---- (f) the grammar --------------------------------------------
        steady = FLASH / "flash21_freeze_concentration"
        for tag, state, vary, extra, needle in (
            ("f_twohomes", "P 101325; T 260; composition { water 0.9; ethanol 0.1; }",
             "variable T; from 273.15; to 263.15; n 3;", "", "two homes for one axis"),
            ("f_variable", "P 101325; composition { water 0.9; ethanol 0.1; }",
             "variable x[ethanol]; from 0.1; to 0.2; n 3;", "", "must be T or P"),
            ("f_empty", "P 101325; composition { }",
             "variable T; from 273.15; to 263.15; n 3;", "", "sums to zero"),
            ("f_phaseset", "P 101325; composition { water 0.9; ethanol 0.1; }",
             "variable T; from 273.15; to 263.15; n 3;",
             "        phaseSet VLS;\n", "Unknown phaseSet"),
        ):
            d2 = props_case(tmp, tag, steady, state, vary, extra)
            rc, out, err = run(d2)
            text = out + err
            if tag == "f_phaseset":
                #  the flash's reader refuses at every point: a scan with NO
                #  solved point exits 1 and names the word in every refusal
                if rc == 0 or needle not in text:
                    fail(f"(f) {tag}: an unknown phaseSet word was not refused"
                         f" by name (exit {rc})")
            elif rc == 0 or needle not in text:
                fail(f"(f) {tag}: not refused by name (exit {rc}; wanted {needle!r})")

    # ---- (h) source -----------------------------------------------------
    src = SRC.read_text()
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    src = re.sub(r"//[^\n]*", "", src)
    if "IsothermalFlash::solveCore(" not in src or "IsothermalFlash::readOptions(" not in src:
        fail("(h) the op no longer calls IsothermalFlash::solveCore / readOptions")
    for banned in ("solidEq::", "Kvec", ".equilibrate(", "michelsenTPD", "Rachford"):
        if banned in src:
            fail(f"(h) the op carries `{banned}` -- an equilibrium of its own"
                 " beside the one flash home")

    if fails:
        print(f"check_phase_split_scan: FAILED ({len(fails)} finding(s))")
        return 1
    print("check_phase_split_scan: OK -- one flash home (flash21/16/19 goldens"
          " reproduced at their operating point), the freezing-point identity"
          f" recomputed from water.dat at every point ({n_ice} ice points), the"
          " ice appearance announced between its grid values, a pure-water probe"
          " refused by name below Tt and continued, the Psat/dCp announcements"
          " at their first point, closure to 1e-9, 4 grammar refusals, source"
          " arm.  NOT checked: any measured freezing point; the reactive path"
          " along a sweep; `phaseSet auto` changing along a scan; `variable P`"
          " beyond the grammar.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
