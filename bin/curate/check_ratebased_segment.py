#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the rate-based packed segment holds to its oracle, conserves, is
independent of its segment count, and refuses what it is not.

    bin/curate/check_ratebased_segment.py

WHAT IT HOLDS (DEV.md 4c C329 part 2, slice B1; Theory Guide
sec:rateBasedSegment; src/unitOperations/distillation/RateBasedSegment.{H,cpp}).

  (1) THE LIMIT.  On each of packing01..04 (the transfer-unit bed, `model
      totalReflux;` with `packing {}`) and the same bed as `model rateBased;`
      with `limit transferUnits;`, both at the declared F-factor (outerDict
      removed) and the cases' 100 segments, the two HETPs must agree to
      C_LIMIT r_max^2, r_max = the largest dz/H_OG the rate run publishes
      (`dzOverHOG_max`).  C_LIMIT = 0.01 is sized from the MEASURED
      coefficient (RB-04, 2026-11-14): the four differences at 100 segments
      are 0.0019, 0.0046, 0.0015 and 0.0034 of r_max^2 (they fall by four per
      doubling), so 0.01 is 2.2 times the worst, and the tolerance (0.017 to
      0.035 %) is 2.2 to 6.6 times the measured difference on each case.  The
      first form of this gate, r_max^2/2 (the bound the two schemes' leading
      terms give, 0.83 to 1.74 %), was 70 to 430 times the difference and let
      a defect of under 1 % through.  The four differences are printed.  The same runs must print the block-tridiagonal audit with an
      off-band maximum of exactly 0.
  (2) CONSERVATION.  On ratebased01..04 (rate mode, declared F-factor): the
      reboiler's material balance, which no row writes, must close to 1e-9 of
      the boil-up (the Newton's own tolerance; the steady mass gate's band,
      read from check_mass_closure.py, is far looser and is reported beside
      it); the energy closure must be published `verified`, mustAgree, by the
      reboiler's own envelope.  In the LIMIT runs it must be published NOT
      verified with "no second route" (no energy row is solved there).
  (3) INDEPENDENCE.  ratebased01..04 at 100, 200 and 400 segments: the HETP
      and the reflux composition must move by less than 1 % (the model's own
      refusal threshold) between 100 and 400, and the engine's printed
      estimate at 100 must be below 1 %.  The table is printed.
  (4) REFUSALS, each by name with its remedy: a reboiler composition with a
      component at zero (RB-01), height 0, a negative top pressure and a
      non-integer segment count (RB-08), three components (slice B4a),
      a reflux ratio (slice B3), trays (slice B2), a packing with no
      correlation, fewer than 10 segments, a non-ideal vapour, an unknown
      limit word, the rate mode without the two thermal conductivities.  And
      the one thing that used to be refused and now RUNS: a non-ideal liquid,
      with the thermodynamic factor taken as 1 and the risk said.  The arm
      uses p-xylene + ethylbenzene (UNIFAC activity coefficients 0.975 and
      0.998 at x = 0.2 / 0.8, 320 K; a p-/o-xylene pair has identical groups,
      gamma = 1 exactly, and the arm tested the announcement alone, RB-05):
      the same pair run ideal is the control, and the UNIFAC run must move
      alpha by more than 1 % and the HETP by more than 0.05 % (measured:
      2.8 % and 0.14 %).

SABOTAGE-VERIFIED BY HAND (2026-11-14), one per arm, each on
RateBasedSegment.cpp, rebuilt, run, restored and rebuilt; observed output:
  S1 (limit)        the limit's linearised equilibrium with the slope doubled
                    (`ys + 2.0 * m * (xI - xbar)`) -> arm (1) FAILS on all four
                    cases: "HETP differs from the transfer-unit bed by
                    +16.75788 % > 1.077 %" (packing01; +13.6, +6.4, +6.1 %; the
                    first tolerance, r_max^2/2).
  S2 (conservation) the interface energy row replaced by `w_t` in the rate
                    mode -> arm (2) FAILS on all four: the closure is published
                    notVerified, "gap -3.847127e+00 > 1.121973e-05" kW
                    (ratebased01): the gap is the sum of e_V - e_L over the
                    bed, so the closure is not an identity.  This is the
                    source sabotage check_gate_selftest re-runs.
  S3 (independence) the vapour film driven by the segment's OUTLET instead of
                    the mean (first order) -> every run REFUSES by the
                    engine's own measured estimate: "|HETP(100) - HETP(50)|/3
                    = 0.0214926 of the HETP, exceeds 0.01; declare `segments
                    148;`", so arms (1) and (3) FAIL.
  S4 (refusals)     the n != 2 refusal disabled -> arm (4) FAILS: the ternary
                    dies in the block-Thomas solve without naming slice B4a.

WHAT IT DOES NOT CHECK, said here and in its claim: that the rate model is
closer to the measurement than the transfer-unit bed (it is not; the
comparison is a table in the Theory Guide, not an assertion); the film
heat-transfer analogy (no measurement in the tree); the goldens of the four
ratebased cases (the suite's golden arm holds them).
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / "tutorials" / "steady" / "distillation"
PAIRS = [("packing01_schulz_0p10bar", "ratebased01_schulz_0p10bar"),
         ("packing02_schulz_0p02bar", "ratebased02_schulz_0p02bar"),
         ("packing03_schulz_delft_0p10bar", "ratebased03_schulz_delft_0p10bar"),
         ("packing04_schulz_delft_0p02bar", "ratebased04_schulz_delft_0p02bar")]
NAME = "check_ratebased_segment"
C_LIMIT = 0.01      # tolerance of the limit's HETP difference in units of r_max^2 (RB-04; see the docstring)


def mass_band():
    """The steady mass gate's band, read from its source, never copied."""
    t = (ROOT / "bin" / "curate" / "check_mass_closure.py").read_text()
    m = re.search(r"^BAND\s*=\s*([0-9.eE+-]+)", t, re.M)
    return float(m.group(1)) if m else None


def run(case: Path, timeout=600):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    try:
        p = subprocess.run([str(ROOT / "choupoSolve"), "."], cwd=str(case), env=env,
                           capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return 124, "TIMEOUT"
    return p.returncode, p.stdout + p.stderr


def last(out):
    lines = [ln for ln in out.strip().splitlines() if ln.strip()]
    for ln in reversed(lines):
        if "ERROR" in ln:
            return ln.strip()[:220]
    return (lines[-1] if lines else "")[:220]


def result_json(out):
    a = out.find("<<<Choupo:result-begin>>>")
    b = out.find("<<<Choupo:result-end>>>")
    if a < 0 or b < 0:
        return None
    try:
        return json.loads(out[a + len("<<<Choupo:result-begin>>>"):b])
    except ValueError:
        return None


def kpis(out):
    r = result_json(out)
    if not r:
        return None
    return r.get("kpis", {}).get("column")


def closure(out):
    r = result_json(out) or {}
    for c in r.get("closuresByConstruction", []):
        if c.get("unit") == "column" and c.get("balance") == "energy":
            return c
    return None


def copy_case(src: Path, tmp: Path, tag: str) -> Path:
    dst = tmp / tag
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
        "reports", "converged", "iterations", "log.*", "expected", "*.csv"))
    (dst / "system" / "outerDict").unlink(missing_ok=True)
    return dst


def edit(case: Path, rel: str, old: str, new: str):
    f = case / rel
    t = f.read_text()
    if old not in t:
        raise SystemExit(f"{NAME}: fixture edit target missing in {rel}: {old[:60]!r}")
    f.write_text(t.replace(old, new, 1))


def main():
    for _, rb in PAIRS:
        if not (DIST / rb / "system" / "flowsheetDict").is_file():
            print(f"{NAME}: FAILED -- the case {rb} is missing: the gate has nothing to hold")
            return 1
    if not (ROOT / "choupoSolve").exists():
        print(f"{NAME}: FAILED -- no choupoSolve in the tree (build first)")
        return 1
    failures = []
    tmp = Path(tempfile.mkdtemp(prefix="ratebased-gate-"))
    try:
        # ---------------------------------------------------- (1) the limit
        print("(1) the limit `transferUnits` against the transfer-unit bed, 100 segments, F 1.5:")
        limits = []
        for orc, rb in PAIRS:
            o = copy_case(DIST / orc, tmp, "orc_" + orc)
            lim = copy_case(DIST / rb, tmp, "lim_" + rb)
            edit(lim, "system/flowsheetDict", "condenser      { type total; }",
                 "condenser      { type total; }\n            limit          transferUnits;")
            ro, oo = run(o)
            rl, ol = run(lim)
            ko, kl = kpis(oo), kpis(ol)
            if ro or rl or not ko or not kl:
                failures.append(f"limit {rb}: a run failed (exit {ro}/{rl}): {last(ol if rl else oo)}")
                continue
            diff = kl["HETP"] / ko["HETP"] - 1.0
            tol = C_LIMIT * kl["dzOverHOG_max"] ** 2
            limits.append((rb, diff, tol))
            print(f"    {orc:34s} HETP {ko['HETP']:.7f}  limit {kl['HETP']:.7f}  "
                  f"difference {100*diff:+.5f} %  tolerance {C_LIMIT} r_max^2 = {100*tol:.4f} %")
            if abs(diff) > tol:
                failures.append(f"limit {rb}: HETP differs from the transfer-unit bed by "
                                f"{100*diff:+.5f} % > {100*tol:.3f} %")
            m = re.search(r"block-tridiagonal: VERIFIED on the first Newton of the \d+-segment"
                          r" solve, max off-band \|J\| = ([0-9.e+-]+)", ol)
            if not m:
                failures.append(f"limit {rb}: no block-tridiagonal VERIFIED line (the audit is gone or silent)")
            elif float(m.group(1)) != 0.0:
                failures.append(f"limit {rb}: off-band maximum {m.group(1)}, not 0")
            c = closure(ol)
            if not c or c.get("status") != "notVerified" or "no second route" not in c.get("note", ""):
                failures.append(f"limit {rb}: the energy closure is not published 'notVerified, no second"
                                f" route' ({c and c.get('status')})")

        # ----------------------------------------- (2) conservation, (3) independence
        band = mass_band()
        print(f"(2) conservation, rate mode, F 1.5 (steady mass band read from check_mass_closure: {band} %):")
        print("(3) independence, rate mode, HETP at 100 / 200 / 400 segments:")
        for _, rb in PAIRS:
            res = {}
            for seg in (100, 200, 400):
                c = copy_case(DIST / rb, tmp, f"rate{seg}_" + rb)
                edit(c, "system/flowsheetDict", "segments          100;", f"segments          {seg};")
                rc, out = run(c)
                k = kpis(out)
                if rc or not k:
                    failures.append(f"{rb} at {seg} segments: the run failed (exit {rc}): {last(out)}")
                    break
                res[seg] = (k, out)
            if len(res) < 3:
                continue
            k100, out100 = res[100]
            mm = re.search(r"the reboiler's balance \(written by no row\) closes to ([0-9.e+-]+) of the boil-up", out100)
            mg = float(mm.group(1)) if mm else float("inf")
            cl = closure(out100)
            print(f"    {rb:34s} reboiler material balance {mg:.2e} of the boil-up; energy closure "
                  f"{cl and cl.get('status')} (gap {cl and cl.get('gap'):.3e} kW, tolerance "
                  f"{cl and cl.get('tolerance'):.3e})")
            if not (mg <= 1e-9):
                failures.append(f"{rb}: the reboiler's material balance closes to {mg:.3e} > 1e-9")
            if band is not None and not (100.0 * mg <= band):
                failures.append(f"{rb}: material closure {100*mg} % outside the steady band {band} %")
            if not cl or cl.get("status") != "verified" or not cl.get("mustAgree"):
                failures.append(f"{rb}: the energy closure is not published verified/mustAgree"
                                f" ({cl and cl.get('status')}: {cl and cl.get('note', '')[:160]})")
            h = [res[s][0]["HETP"] for s in (100, 200, 400)]
            xT = [res[s][0]["x_reflux_LK"] for s in (100, 200, 400)]
            dH = abs(h[0] / h[2] - 1.0)
            dX = abs(xT[0] / xT[2] - 1.0)
            est = k100["discretisationError_est"]
            print(f"    {rb:34s} HETP {h[0]:.7f} / {h[1]:.7f} / {h[2]:.7f}  (100 vs 400: {100*dH:.4f} %;"
                  f" engine's estimate at 100: {100*est:.4f} %); reflux x {xT[0]:.7f} / {xT[2]:.7f}")
            if dH > 1e-2 or dX > 1e-2:
                failures.append(f"{rb}: 100 vs 400 segments moves the HETP by {100*dH:.3f} % or the reflux"
                                f" by {100*dX:.3f} % (> 1 %)")
            if est > 1e-2:
                failures.append(f"{rb}: the engine's own discretisation estimate {est} exceeds 1 %")

        # ------------------------------------------------------- (4) refusals
        print("(4) refusals, each by name:")
        base = DIST / PAIRS[0][1]
        ternary_rec = ROOT / "data" / "standards" / "components" / "mXylene.dat"

        def ternary(c):
            shutil.copy(ternary_rec, c / "constant" / "components" / "mXylene.dat")
            edit(c, "constant/thermoPhysPropDict", "components ( pXylene oXylene );",
                 "components ( pXylene oXylene mXylene );")
            edit(c, "system/flowsheetDict", "oXylene    0.80;", "oXylene    0.79;\n                    mXylene    0.01;")

        arms = [
            ("three components", ternary, "slice B4a"),
            ("a reflux ratio", lambda c: edit(c, "system/flowsheetDict", "condenser      { type total; }",
                                              "condenser      { type total; }\n            refluxRatio    2;"), "slice B3"),
            ("trays", lambda c: edit(c, "system/flowsheetDict", "condenser      { type total; }",
                                     "condenser      { type total; }\n            nStages        10;"), "slice B2"),
            ("a packing with no correlation", lambda c: edit(c, "system/flowsheetDict",
                                                             "model             RochaBravoFair;",
                                                             "model             BilletSchultes;"),
             "no mass-transfer correlation"),
            ("a zero component (RB-01)", lambda c: edit(c, "system/flowsheetDict",
                                                        "pXylene    0.2;", "pXylene    0.0;"),
             "needs BOTH components"),
            ("height 0 (RB-08)", lambda c: edit(c, "system/flowsheetDict",
                                                "height            2.2 m;", "height            0 m;"),
             "`packing { height }` must be positive"),
            ("negative pressure (RB-08)", lambda c: edit(c, "system/flowsheetDict",
                                                         "P              0.10 bar;", "P              -0.10 bar;"),
             "top pressure `P` must be positive"),
            ("segments 10.7 (RB-08)", lambda c: edit(c, "system/flowsheetDict", "segments          100;",
                                                     "segments          10.7;"), "whole number"),
            ("5 segments", lambda c: edit(c, "system/flowsheetDict", "segments          100;",
                                          "segments          5;"), "below the minimum"),
            ("a non-ideal vapour", lambda c: edit(c, "constant/thermoPhysPropDict",
                                                  "fugacityModel idealGas;", "fugacityModel SRK;"),
             "not an ideal gas"),
            ("an unknown limit word", lambda c: edit(c, "system/flowsheetDict", "condenser      { type total; }",
                                                     "condenser      { type total; }\n            limit          plates;"),
             "rate-based limit"),
            ("no liquid conductivity", lambda c: edit(c, "constant/thermoPhysPropDict",
                                                      "thermalConductivity { model SatoRiedel; }", ""),
             "thermal conductivity of BOTH phases"),
        ]
        for i, (what, fix, must) in enumerate(arms):
            c = copy_case(base, tmp, f"refuse{i}")
            fix(c)
            rc, out = run(c)
            ok = rc != 0 and must in out
            print(f"    {what:32s} -> exit {rc}, {'names' if must in out else 'does NOT name'} '{must}'")
            if not ok:
                tail = (out.strip().splitlines() or [""])[-1][:200]
                failures.append(f"refusal '{what}': exit {rc}, expected '{must}': {tail}")
        #  The one that RUNS: a non-ideal liquid.  p-xylene + ethylbenzene, whose
        #  UNIFAC activity coefficients differ from 1 (RB-05); the catalogue's
        #  UNIFAC tables are needed, so the copy is unsealed.  The same pair run
        #  ideal is the control.
        def ethylbenzene_pair(tag, model):
            c = copy_case(base, tmp, tag)
            rec = (ROOT / "data" / "standards" / "components" / "ethylBenzene.dat").read_text()
            if "\ndiffusionVolume" not in rec:
                rec += "\ndiffusionVolume 132.0;   // Fuller: 8 C x 15.9 + 10 H x 2.31 - 18.3 aromatic ring\n"
            (c / "constant" / "components" / "ethylBenzene.dat").write_text(rec)
            edit(c, "constant/thermoPhysPropDict", "components ( pXylene oXylene );",
                 "components ( pXylene ethylBenzene );")
            edit(c, "constant/thermoPhysPropDict", "activityModel ideal;", f"activityModel {model};")
            edit(c, "system/flowsheetDict", "oXylene    0.80;", "ethylBenzene    0.80;")
            edit(c, "constant/propertyManifest", "sealed             true;", "sealed             false;")
            return c
        rc0, out0 = run(ethylbenzene_pair("pairIdeal", "ideal"))
        rc, out = run(ethylbenzene_pair("nonIdealLiquid", "UNIFAC"))
        k0, k = kpis(out0), kpis(out)
        says = ("NOT exact here" in out and "RISK: the liquid film's flux is off by the factor Gamma" in out
                and "liquid film's share of the overall resistance" in out)
        moved = False
        if k0 and k:
            dA = k["alpha_mean"] / k0["alpha_mean"] - 1.0
            dH = k["HETP"] / k0["HETP"] - 1.0
            moved = abs(dA) > 1e-2 and abs(dH) > 5e-4
            print(f"    {'a non-ideal liquid (UNIFAC)':32s} -> exit {rc}, runs and "
                  f"{'says' if says else 'does NOT say'} Gamma = 1 with its risk and the liquid film's share;"
                  f" against the ideal control alpha {100*dA:+.2f} %, HETP {100*dH:+.3f} %")
        if rc0 or rc or not k0 or not k or not says or "liquidFilmShare_max" not in (k or {}) or not moved:
            failures.append("a non-ideal liquid does not run with the thermodynamic factor announced "
                            "and the liquid film's share published, or its activity coefficients do not "
                            "move alpha by > 1 % and the HETP by > 0.05 % against the ideal control")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if failures:
        print(f"{NAME}: FAILED")
        for f in failures:
            print("  " + f)
        return 1
    worst = max(abs(d) for _, d, _ in limits)
    print(f"{NAME}: OK -- the rate-based segment reduces to the transfer-unit bed on packing01-04"
          f" (worst {100*worst:.4f} %, inside {C_LIMIT} r_max^2), audits block-tridiagonal with off-band 0,"
          f" closes the reboiler's material balance to 1e-9 and its first law VERIFIED (not verified in"
          f" the limit), moves < 1 % from 100 to 400 segments, and refuses 12 inputs by name while a"
          f" non-ideal liquid runs announced; it does NOT check that the model is closer to the"
          f" measurement or the film heat-transfer analogy")
    return 0


if __name__ == "__main__":
    sys.exit(main())
