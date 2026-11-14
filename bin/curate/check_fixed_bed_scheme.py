#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the fixed bed's convection scheme, held to the closed form, to the
mesh, to its bounds and to conservation (DEV.md 4c C375).

    bin/curate/check_fixed_bed_scheme.py

WHY THIS EXISTS.  FixedBedAdsorber took first-order upwind face values, which
add a numerical dispersion v dz/2 to the declared one (interstitial basis,
v = u/eps, D_L = Dax/eps).  On batch13 at 100 cells that is 3.1e-4 m2/s
against a physical 2.5e-4: the 5-95 % front was 314 s wide where the
mesh-converged front is 220 s, and the pinned breakthrough time was the
grid's.  The unit now announces that term and offers `convectionScheme
vanLeer;` (a MUSCL face value with the van Leer limiter).  A scheme is a
claim about accuracy, boundedness and conservation, and each is measured
here on real runs of the engine -- never on its header.

ARMS (every number below was measured when the gate was written, 2026-11-12;
each tolerance is that measurement with a margin, and says so):

  PULSE      batch29_pulse_two_schemes (a linear Henry sorbent, a 2 s
             rectangular injection) at 100 and 200 cells.  The closed form
             of the linear equilibrium-dispersive model with LDF and closed
             (Danckwerts) ends (Theory Guide eq:chrom-moments):
                 mean     = t_R + t_inj/2
                 variance = t_R^2 [2/Pe - 2(1 - exp(-Pe))/Pe^2]
                          + 2 k' t0/k + t_inj^2/12
             recomputed HERE from the case's own numbers.  vanLeer must match
             the variance WITHOUT any grid term (measured 1.88 % at 100
             cells, 0.256 % at 200; tolerances 2.5 % and 0.4 %); upwind must
             match it only WITH D_L -> D_L + v dz/2 (measured 0.23 % and
             0.075 %; tolerances 0.3 % and 0.1 %) and must MISS it without
             (measured 86 % and 43 %: the grid term is real).  The upwind
             mean equals the closed form to 1e-9 (measured 6e-13); the van
             Leer mean to 5e-4 at 100 cells (measured 1.25e-4) and 1e-4 at
             200 (2.2e-5).  m0 = c_in t_inj for both (1e-6).
  MESH       batch13 (Langmuir CO2/He breakthrough) at 50/100/200 cells
             under both schemes.  Observed order of the 5-95 % width from the
             triple: upwind in [0.9, 1.2] (measured 1.04), vanLeer >= 1.8
             (measured 2.13).  vanLeer at 100 cells against the converged
             reference REF_* below -- the Richardson extrapolation of upwind
             at 800 and 1600 cells, first order, measured with this engine
             -- t_5% within 0.3 % (measured -0.18 %) and the width within
             7 % (measured +5.4 %), while upwind at 100 cells misses the
             width by 43 %: vanLeer's width error must be at least 5 times
             smaller.
  BOUNDS     batch13 with Dax = 0 (a pure-advection, self-sharpening
             Langmuir front) at 100 cells under vanLeer: no c above the feed
             (c_max/c_feed - 1 <= 1e-8; measured 3.4e-10, the time
             integration's tolerance), no negative c below -1e-12 c_feed
             (measured -1e-22), q within [ -1e-12 q*, q*(1 + 1e-8) ].
  CONSERVE   every run above: the bed's species closure and the campaign's
             mass closure <= 1e-12; and batch20 (thermal, Ergun, 25 cells:
             the ODD count that pads the two-cell Jacobian blocks) under
             vanLeer: mass and energy closure <= 1e-12 and the structure
             audit VERIFIED with 13 blocks.
  RK4        batch14 (pure transport, explicit RK4 at deltaT 0.005 s) under
             vanLeer is REFUSED by the 6 u_i/dz Gershgorin bound, and at
             deltaT 0.003 s it runs bounded and conservative, its t_50
             within 0.05 % of the analytic one (measured -0.023 %; upwind
             -0.21 %).
  ANNOUNCE   the upwind run's header and KPIs carry D_num = v dz/2 =
             3.125e-4, ratio 1.25 and nCells 1251; the vanLeer run says it
             has no first-order numerical dispersion and publishes 0.
  REFUSAL    an unknown `convectionScheme` word is refused naming the two.
  PROFILES   C375 (b): with `solutionControl { write false; }` the bed
             writes no <t>/ directory at all; by default it writes
             0/<unit>.profile (its later <t>/ profiles are erased by the
             driver's own instant write -- a separate defect, see the arm).

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
BATCH = ROOT / "build" / "linux64Gcc" / "choupoBatch"
ADS = ROOT / "tutorials" / "batch" / "adsorber"
B13 = ADS / "batch13_breakthrough_co2"
B14 = ADS / "batch14_transport_only"
B20 = ADS / "batch20_thermal_breakthrough"
B29 = ADS / "batch29_pulse_two_schemes"

#  The converged batch13 front (Richardson, upwind 800 and 1600 cells, p = 1;
#  measured 2026-11-12: t5 2933.590 / 2936.425 s, width 230.811 / 225.204 s).
REF_T5 = 2939.261
REF_WIDTH = 219.59

failures = []


def variant(tmp: Path, base: Path, tag: str, fs_edits=(), ctrl_edits=()):
    case = tmp / tag
    shutil.copytree(base, case, ignore=shutil.ignore_patterns(
        "expected", "[0-9]*", "latest", "reports", "*.csv", "log*",
        "solution.log"))
    fs = case / "system" / "flowsheetDict"
    t = fs.read_text()
    for pat, rep in fs_edits:
        if pat is None:          # the case's own scheme line goes first
            t = re.sub(rep, "", t)
            continue
        t2 = re.sub(pat, rep, t)
        if t2 == t:
            raise SystemExit(f"check_fixed_bed_scheme: edit '{pat}' did not"
                             f" apply to {base.name} -- the case changed")
        t = t2
    fs.write_text(t)
    cd = case / "system" / "controlDict"
    c = cd.read_text()
    for pat, rep in ctrl_edits:
        c2 = re.sub(pat, rep, c, flags=re.M)
        if c2 == c:
            raise SystemExit(f"check_fixed_bed_scheme: controlDict edit '{pat}'"
                             f" did not apply to {base.name}")
        c = c2
    cd.write_text(c)
    return case


def run(case: Path):
    p = subprocess.run([str(BATCH), "."], cwd=case, capture_output=True,
                       text=True, timeout=900,
                       env=dict(os.environ, CHOUPO_HOME=str(ROOT)))
    out = p.stdout + p.stderr
    k = {}
    for line in p.stdout.splitlines():
        m = re.match(r'\s*"(\w+)": (\{.*\}),?$', line)
        if m:
            try:
                k[m.group(1)] = json.loads(m.group(2))
            except ValueError:
                pass
    return p.returncode, out, k


def scheme_edit(n: int, scheme: str, diag: bool = False):
    extra = " schemeDiagnostics true;" if diag else ""
    #  A case may declare its own scheme (batch14 and batch15 pin upwind):
    #  that line is removed first, so the arm's scheme is the only one.
    return [(None, r"\n[ \t]*convectionScheme\s+\w+\s*;[^\n]*"),
            (r"nCells\s+\d+\s*;", f"nCells {n}; convectionScheme {scheme};{extra}")]


def need(cond: bool, msg: str):
    if not cond:
        failures.append(msg)


def closures(tag: str, k: dict, beds, species="CO2"):
    for b in beds:
        mc = k.get(b, {}).get(f"mass_closure_{species}")
        need(mc is not None and mc <= 1e-12,
             f"CONSERVE {tag}: {b}.mass_closure_{species} = {mc} (> 1e-12)")
    camp = k.get("campaign", {}).get("mass_closure_rel")
    need(camp is not None and camp <= 1e-12,
         f"CONSERVE {tag}: campaign mass_closure_rel = {camp} (> 1e-12)")


def closed_form(n_cells):
    """Mean and variance of batch29's pulse, from the case's own numbers."""
    R, T, H = 8.314462618, 298.15, 0.4             # henrySorbent CO2 record
    rho_b, eps, L, u, Dax, k, t_inj = 500.0, 0.4, 0.5, 0.05, 1e-4, 10.0, 2.0
    K = H * R * T / 1e5                             # m3/kg (H per bar)
    kp = rho_b * K / eps
    t0 = eps * L / u
    tR = t0 * (1.0 + kp)
    D = Dax / eps + (0.0 if n_cells is None else 0.5 * (u / eps) * L / n_cells)
    Pe = (u / eps) * L / D
    var = (tR**2 * (2.0 / Pe - 2.0 * (1.0 - math.exp(-Pe)) / Pe**2)
           + 2.0 * kp * t0 / k + t_inj**2 / 12.0)
    return tR + t_inj / 2.0, var, 0.01 * 1e5 / (R * T) * t_inj


def main() -> int:
    if not BATCH.exists():
        print(f"check_fixed_bed_scheme: {BATCH} missing -- build first")
        return 1
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        # ---- PULSE ---------------------------------------------------------
        tol = {100: dict(vl_var=2.5e-2, up_var=3e-3, vl_mean=5e-4),
               200: dict(vl_var=4e-3, up_var=1e-3, vl_mean=1e-4)}
        for n in (100, 200):
            rc, out, k = run(variant(tmp, B29, f"pulse{n}",
                                     [(r"nCells\s+100\s*;", f"nCells {n};")]))
            if rc != 0:
                failures.append(f"PULSE {n}: exit {rc}\n" + out[-800:])
                continue
            mean, var0, m0 = closed_form(None)
            _, varg, _ = closed_form(n)
            up, vl = k.get("bedUpwind", {}), k.get("bedVanLeer", {})
            for name, b in (("bedUpwind", up), ("bedVanLeer", vl)):
                got = b.get("outlet_m0_CO2", float("nan"))
                need(abs(got / m0 - 1) <= 1e-6,
                     f"PULSE {n} {name}: m0 {got} vs c_in t_inj {m0}")
            dm_u = abs(up.get("outlet_mean_CO2", 0) / mean - 1)
            dm_v = abs(vl.get("outlet_mean_CO2", 0) / mean - 1)
            dv_v = abs(vl.get("outlet_variance_CO2", 0) / var0 - 1)
            dv_u = abs(up.get("outlet_variance_CO2", 0) / varg - 1)
            dv_u0 = abs(up.get("outlet_variance_CO2", 0) / var0 - 1)
            need(dm_u <= 1e-9, f"PULSE {n}: upwind mean off the closed form"
                               f" by {dm_u:.3g} (> 1e-9)")
            need(dm_v <= tol[n]["vl_mean"], f"PULSE {n}: vanLeer mean off by"
                 f" {dm_v:.3g} (> {tol[n]['vl_mean']})")
            need(dv_v <= tol[n]["vl_var"], f"PULSE {n}: vanLeer variance off"
                 f" the closed form (no grid term) by {dv_v:.3g}"
                 f" (> {tol[n]['vl_var']})")
            need(dv_u <= tol[n]["up_var"], f"PULSE {n}: upwind variance off"
                 f" the closed form WITH D_L + v dz/2 by {dv_u:.3g}"
                 f" (> {tol[n]['up_var']})")
            need(dv_u0 >= 0.3, f"PULSE {n}: upwind variance within"
                 f" {dv_u0:.3g} of the closed form WITHOUT the grid term --"
                 " the v dz/2 term has vanished, which upwind cannot do")
            closures(f"pulse{n}", k, ("bedUpwind", "bedVanLeer"))

        # ---- MESH + ANNOUNCE ----------------------------------------------
        res = {}
        for scheme in ("upwind", "vanLeer"):
            for n in (50, 100, 200):
                rc, out, k = run(variant(tmp, B13, f"b13_{scheme}_{n}",
                                         scheme_edit(n, scheme)))
                if rc != 0:
                    failures.append(f"MESH {scheme} {n}: exit {rc}\n"
                                    + out[-800:])
                    continue
                b = k.get("bed", {})
                res[(scheme, n)] = (b.get("t_breakthrough_5pct_CO2"),
                                    b.get("t_breakthrough_95pct_CO2")
                                    - b.get("t_breakthrough_5pct_CO2"))
                closures(f"b13_{scheme}_{n}", k, ("bed",))
                if n == 100 and scheme == "upwind":
                    need("NUMERICAL dispersion D_num = v dz/2 = 0.0003125" in out,
                         "ANNOUNCE upwind: header lacks D_num = v dz/2 = 0.0003125")
                    need(abs(b.get("D_numerical", 0) - 3.125e-4) <= 1e-12
                         and abs(b.get("numerical_dispersion_ratio", 0) - 1.25) <= 1e-12
                         and b.get("nCells_numerical_ratio_0p1") == 1251,
                         "ANNOUNCE upwind: KPIs D_numerical/ratio/nCells are"
                         f" {b.get('D_numerical')}/{b.get('numerical_dispersion_ratio')}"
                         f"/{b.get('nCells_numerical_ratio_0p1')}, expected"
                         " 3.125e-4/1.25/1251")
                if n == 100 and scheme == "vanLeer":
                    need("no first-order numerical dispersion" in out,
                         "ANNOUNCE vanLeer: header lacks 'no first-order"
                         " numerical dispersion'")
                    need(b.get("D_numerical") == 0,
                         f"ANNOUNCE vanLeer: D_numerical = {b.get('D_numerical')}")
                    need("Jacobian structure VERIFIED" in out,
                         "MESH vanLeer: the two-cell block structure was not"
                         " VERIFIED by the integrator's audit")
        if len(res) == 6:
            def order(s):
                w = [res[(s, n)][1] for n in (50, 100, 200)]
                return math.log2(abs((w[0] - w[1]) / (w[1] - w[2])))
            pu, pv = order("upwind"), order("vanLeer")
            need(0.9 <= pu <= 1.2, f"MESH: upwind width order {pu:.3f}"
                                   " outside [0.9, 1.2]")
            need(pv >= 1.8, f"MESH: vanLeer width order {pv:.3f} < 1.8")
            t5v, wv = res[("vanLeer", 100)]
            t5u, wu = res[("upwind", 100)]
            et5 = abs(t5v / REF_T5 - 1)
            ewv, ewu = abs(wv / REF_WIDTH - 1), abs(wu / REF_WIDTH - 1)
            need(et5 <= 3e-3, f"MESH: vanLeer(100) t_5% {t5v:.3f} s is"
                              f" {et5:.3g} off the converged {REF_T5} s")
            need(ewv <= 0.07, f"MESH: vanLeer(100) width {wv:.3f} s is"
                              f" {ewv:.3g} off the converged {REF_WIDTH} s")
            need(ewu >= 5 * ewv, f"MESH: vanLeer(100) width error {ewv:.3g}"
                                 f" is not 5x below upwind's {ewu:.3g}")
            mesh_note = (f"orders upwind {pu:.2f} / vanLeer {pv:.2f}; width"
                         f" at 100 cells {wu:.1f} / {wv:.1f} s vs {REF_WIDTH}")
        else:
            mesh_note = "mesh arm incomplete"

        # ---- BOUNDS --------------------------------------------------------
        rc, out, k = run(variant(tmp, B13, "bounds",
                                 scheme_edit(100, "vanLeer", diag=True)
                                 + [(r"Dax\s+\[0 2 -1 0 0\]\s+1e-4;",
                                     "Dax [0 2 -1 0 0] 0;")]))
        if rc != 0:
            failures.append(f"BOUNDS: exit {rc}\n" + out[-800:])
        else:
            b = k.get("bed", {})
            cmax = b.get("c_max_over_feed_CO2", 9) - 1
            qmax = b.get("q_max_over_qstar_feed_CO2", 9) - 1
            cmin, qmin = b.get("c_min_CO2", -9), b.get("q_min_CO2", -9)
            need(cmax <= 1e-8, f"BOUNDS: c overshoots the feed by {cmax:.3g}")
            need(cmin >= -1e-12 * 0.15 * 40.36,
                 f"BOUNDS: c undershoots zero, c_min = {cmin:.3g} mol/m3")
            need(qmax <= 1e-8, f"BOUNDS: q overshoots q*(c_feed) by {qmax:.3g}")
            need(qmin >= -1e-12 * 2.87, f"BOUNDS: q_min = {qmin:.3g} mol/kg")
            closures("bounds", k, ("bed",))

        # ---- CONSERVE: thermal, odd N (padded blocks) ----------------------
        rc, out, k = run(variant(tmp, B20, "thermal",
                                 scheme_edit(25, "vanLeer")))
        if rc != 0:
            failures.append(f"CONSERVE thermal: exit {rc}\n" + out[-800:])
        else:
            camp = k.get("campaign", {})
            for key in ("mass_closure_rel", "energy_closure_rel"):
                v = camp.get(key)
                need(v is not None and v <= 1e-12,
                     f"CONSERVE thermal (batch20, vanLeer, 25 cells):"
                     f" campaign {key} = {v}")
            need(re.search(r"structure VERIFIED on the first step \(13 blocks",
                           out) is not None,
                 "CONSERVE thermal: the padded 13-block structure was not"
                 " VERIFIED")

        # ---- RK4 -----------------------------------------------------------
        rc, out, _ = run(variant(tmp, B14, "rk4_refused",
                                 scheme_edit(200, "vanLeer")))
        need(rc != 0 and "EXCEEDS the Gershgorin stability bound" in out
             and "advection 300" in out,
             "RK4: vanLeer at deltaT 0.005 s was not refused by the 6 u_i/dz"
             " bound (advection 300 1/s)")
        rc, out, k = run(variant(tmp, B14, "rk4_ok",
                                 scheme_edit(200, "vanLeer", diag=True),
                                 [(r"^deltaT\s.*$", "deltaT 0.003;")]))
        if rc != 0:
            failures.append(f"RK4 at 0.003 s: exit {rc}\n" + out[-800:])
        else:
            b = k.get("bed", {})
            e50 = abs(b.get("t_50_CO2", 0) / 3.984074227 - 1)
            need(e50 <= 5e-4, f"RK4: vanLeer t_50 {b.get('t_50_CO2')} is"
                              f" {e50:.3g} off the analytic 3.984074227 s")
            need(b.get("c_max_over_feed_CO2", 9) - 1 <= 1e-12
                 and b.get("c_min_CO2", -9) >= -1e-15,
                 "RK4: vanLeer under explicit RK4 left the feed's bounds")
            closures("rk4_ok", k, ("bed",))

        # ---- REFUSAL -------------------------------------------------------
        rc, out, _ = run(variant(tmp, B13, "refusal",
                                 [(r"nCells\s+\d+\s*;",
                                   "nCells 25; convectionScheme quick;")]))
        need(rc != 0 and "convectionScheme" in out and "upwind" in out
             and "vanLeer" in out,
             "REFUSAL: `convectionScheme quick;` was not refused naming"
             " upwind and vanLeer")

        # ---- PROFILES (C375 b) ---------------------------------------------
        off = variant(tmp, B29, "profiles_off", [(r"nCells\s+100\s*;",
                                                   "nCells 25;")],
                      [(r"^timeStepping\s.*$",
                        "timeStepping adaptive;\nsolutionControl { write false; }")])
        rc, out, _ = run(off)
        dirs = [p.name for p in off.iterdir() if p.is_dir()
                and re.fullmatch(r"[0-9.e+-]+", p.name)]
        need(rc == 0 and not dirs, f"PROFILES: write false left time"
                                   f" directories {sorted(dirs)[:5]}")
        need("axial profiles: NOT written" in out,
             "PROFILES: write false not announced by the bed")
        on = variant(tmp, B29, "profiles_on", [(r"nCells\s+100\s*;",
                                                  "nCells 25;")])
        rc, out, _ = run(on)
        #  Only 0/ is asserted: at t > 0 the driver's atomic instant write
        #  (SolutionWriter::writeDynamicInstant, remove_all + rename)
        #  replaces the <t>/ directory the bed had already written its
        #  profile into -- a defect found by this arm and reported (C375),
        #  not fixed in this slice.
        need(rc == 0 and (on / "0" / "bedUpwind.profile").exists()
             and (on / "0" / "bedVanLeer.profile").exists(),
             "PROFILES: the default no longer writes the 0/ profiles")

    if failures:
        print("check_fixed_bed_scheme: FAIL")
        for f in failures:
            print("  -", f)
        return 1
    print("check_fixed_bed_scheme: OK -- pulse moments vs the closed form at"
          " 100/200 cells (vanLeer without a grid term, upwind only with"
          " v dz/2); batch13 mesh: " + mesh_note + "; bounded at Dax = 0;"
          " mass (and batch20's energy, padded blocks) closed at round-off;"
          " RK4 bound 6u/dz refuses and holds; announcement, refusal and the"
          " solutionControl switch")
    return 0


if __name__ == "__main__":
    sys.exit(main())
