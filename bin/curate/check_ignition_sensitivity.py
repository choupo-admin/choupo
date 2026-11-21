#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the brute-force ignition-delay sensitivity multiplies the NET rate of a reaction.

    bin/curate/check_ignition_sensitivity.py

THE REAL DEFECT THIS WOULD HAVE CAUGHT.  `sensitivity { }` on a batchReactor repeats the
integration with ONE reaction's rate multiplied by a factor.  A multiplier applied to the
FORWARD rate only (the obvious first implementation: scale k, leave k_rev = k/Kc computed
from the unscaled k) does not scale the reaction, it changes its equilibrium constant:
the perturbed run ends in a DIFFERENT final state, and the table still prints a plausible
S_j with the right sign and the right order of magnitude, because early in an ignition the
reverse leg is small.  No closure sees it (mass and elements close in every run) and no
golden can (it pins what the run prints).  Two independent statements catch it:

  (a) the final state of every multiplied run equals the base run's: T_end of each of the
      N runs against the base T_end, relative, within 1e-6.  A rate multiplier that is
      not a rate multiplier moves the equilibrium, and T_end with it.
  (b) S of the top reaction equals a HAND recomputation from two separate runs of the
      case: the case's own `A` of that reaction multiplied by the factor in a copy (k and,
      through Kc, k_rev both scale: the definition of the net multiplier), tau_0 of the
      base and tau_0 of the copy, S = ln(tau'/tau) / ln(factor), to 1e-6.

WHAT THIS GATE CHECKS (choupoBatch, tutorials/batch/combustion/ignition04_h2air_sensitivity,
the 21-reaction O Conaire mechanism, constant volume, analytic Jacobian: the Jacobian audit
refuses the run if its multiplier were missing there).  Plus one SABOTAGE ARM on the
comparison itself: the hand copy with A x 1.2 instead of x 1.1 must DISAGREE with S by far
more than 1e-6, so (b) cannot pass by comparing two runs that do not differ.

  The engine-side sabotage (multiplier on the forward rate only) was run by hand when the
  gate was written: (a) then failed at 2.5e-3 relative in T_end and (b) at 4e-3 in S
  (docs/reviews/2026-11-19-chemkin-real-mechanism/REPORT.md section 10).

  (c) THE THREADS (2026-11-21).  The N perturbed integrations run on `solver { threads N; }`
      threads (default allowed CPUs - 2, capped by CHOUPO_THREADS), each with its multiplier
      in thread-local storage.  On 1 and on 3 threads the sensitivity.csv must be the same
      bytes.  The defect it would catch: the multiplier kept as a member of the shared
      reaction record (as it was before the threads) and set by each worker -- the workers
      then integrate with each other's multipliers and the table changes with the thread
      count and the timing.  Verified by hand 2026-11-21: the three thread-local variables
      of BatchReactor (sensOwner_, sensJ_, sensF_) made plain statics, shared by the
      workers: (c) failed (the csv differs between 1 and 3 threads) and so did (b) on the
      default two threads (S(R9) 0.3665 against the hand 0.0069); restored, rebuilt, OK.

NOT CHECKED: the agreement with Cantera (section 10, run by hand: Cantera is not a
dependency), the sign or size of any S as chemistry, a vessel on `energy gasConstantP`.
"""
import csv
import math
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gatekit  # noqa: E402

CASE = "tutorials/batch/combustion/ignition04_h2air_sensitivity"
STRIP = ("expected", "converged", "constant/propertyManifest")
TOL_END = 1.0e-6
TOL_S = 1.0e-6


def read_csv(case):
    p = Path(case) / "sensitivity.csv"
    if not p.exists():
        return None
    return list(csv.DictReader(open(p)))


def main():
    failures = []
    batch = gatekit.binary("choupoBatch")

    with gatekit.probe_copy(CASE, strip=STRIP) as c:
        rc, out = gatekit.run(batch, c, inside=True)
        rows = read_csv(c) if rc == 0 else None
        if not rows:
            return gatekit.verdict("check_ignition_sensitivity",
                                   [f"{CASE}: did not run / no sensitivity.csv (exit {rc}): "
                                    + " | ".join(out.strip().splitlines()[-2:])], "")
    factor = float(rows[0]["factor"])
    tau0 = float(rows[0]["tau0_s"])
    T0 = float(rows[0]["T_end0_K"])
    top = rows[0]["reaction"]
    S_top = float(rows[0]["S"])

    # (a) every multiplied run ends where the base run ends.
    dT = max(abs(float(r["T_end_K"]) / T0 - 1.0) for r in rows)
    worst = max(rows, key=lambda r: abs(float(r["T_end_K"]) / T0 - 1.0))["reaction"]
    if dT > TOL_END:
        failures.append(f"(a) the run with {worst} multiplied ends at a T_end that differs from the base by "
                        f"{dT:.2e} relative (> {TOL_END:g}): the multiplier moved the equilibrium, so it is "
                        "not applied to the net rate")
    if len(rows) < 10 or abs(S_top) < 0.5:
        failures.append(f"the table has {len(rows)} rows and a top |S| of {abs(S_top):.3g}: the witness "
                        "no longer exercises a governing reaction")

    # (b) the top reaction against two separate runs with its A edited in a copy.
    def hand(fac):
        with gatekit.probe_copy(CASE, strip=STRIP) as c:
            rx = Path(c) / "constant/reactions"
            text = rx.read_text()
            m = re.search(r"^" + re.escape(top) + r"\s*\{.*?\n\s*A\s+([-0-9.eE+]+)\s*;", text, re.S | re.M)
            if not m:
                raise gatekit.EditNotApplied(f"reaction {top}: no `A <number>;` found in constant/reactions")
            new = "%.17g" % (float(m.group(1)) * fac)
            rx.write_text(text[:m.start(1)] + new + text[m.end(1):])
            fd = Path(c) / "system/flowsheetDict"
            gatekit.edit(fd, "reactions   all;", f"reactions   ( {top} );")
            rc2, out2 = gatekit.run(batch, c, inside=True)
            r2 = read_csv(c) if rc2 == 0 else None
            if not r2:
                raise gatekit.EditNotApplied(f"hand copy of {top} did not run (exit {rc2})")
            return float(r2[0]["tau0_s"])

    try:
        tau_edit = hand(factor)
        S_hand = math.log(tau_edit / tau0) / math.log(factor)
        dS = abs(S_hand - S_top)
        if dS > TOL_S:
            failures.append(f"(b) S({top}) = {S_top:.10g} but two separate runs with its A x {factor:g} "
                            f"give {S_hand:.10g} (difference {dS:.2e} > {TOL_S:g})")
        tau_bad = hand(1.2)
        S_bad = math.log(tau_bad / tau0) / math.log(factor)
        if abs(S_bad - S_top) < 1.0e-3:
            failures.append("sabotage arm: the hand copy with A x 1.2 gives the same S as x 1.1 "
                            f"({S_bad:.6g} vs {S_top:.6g}) -- the comparison cannot see a wrong multiplier")
    except gatekit.EditNotApplied as e:
        failures.append(str(e))
        dS = float("nan")

    # (c) THE THREADS (2026-11-21): the N perturbed runs on 1 and on 3 threads write the
    #     same sensitivity.csv byte for byte, and the run says how many it used.
    csvs = {}
    for thr in (1, 3):
        with gatekit.probe_copy(CASE, strip=STRIP) as c:
            fd = Path(c) / "system/flowsheetDict"
            gatekit.edit(fd, "integrator  Rosenbrock23;", f"integrator  Rosenbrock23; threads {thr};")
            env = dict(os.environ, CHOUPO_HOME=str(gatekit.repo), CHOUPO_THREADS=str(thr))
            rc3, out3 = gatekit.run(batch, c, inside=True, env=env)
            p3 = Path(c) / "sensitivity.csv"
            if rc3 != 0 or not p3.exists():
                failures.append(f"(c) threads {thr}: did not run (exit {rc3})")
                continue
            if f"on {thr} thread(s)" not in out3:
                failures.append(f"(c) threads {thr}: the run did not say it used {thr} thread(s)")
            csvs[thr] = p3.read_bytes()
    if len(csvs) == 2 and csvs[1] != csvs[3]:
        failures.append("(c) sensitivity.csv differs between 1 and 3 threads: the perturbed runs are not "
                        "independent (a shared multiplier, or a result written outside its own slot)")

    return gatekit.verdict(
        "check_ignition_sensitivity", failures,
        f"the multiplier scales the NET rate: {len(rows)} multiplied runs end at the base T_end "
        f"(max relative difference {dT:.1e}; tol {TOL_END:g}) and S({top}) = {S_top:.6f} equals the hand "
        f"recomputation from two runs with its A x {factor:g} (difference {dS:.1e}; tol {TOL_S:g}); "
        "a wrong A factor is seen; 1 and 3 threads write the same sensitivity.csv byte for byte",
    )


if __name__ == "__main__":
    sys.exit(main())
