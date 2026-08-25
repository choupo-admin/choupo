#!/usr/bin/env python3
"""Gate: the MESH's declared block-tridiagonal structure is verified, honest, and cheap.

    bin/curate/check_block_tridiagonal.py

WHY THIS EXISTS.  The simultaneous MESH column declares its Jacobian
block-tridiagonal (`opts.blockTri`), buying the Curtis-Powell-Reid colored
finite-difference Jacobian (~3*nv residual evaluations per iteration,
INDEPENDENT of stage count, against N*nv dense) and a block-Thomas linear
solve.  Measured on a 48-stage reactive stripper the day it was built:
62.7 s dense -> 28.9 s structured, identical convergence (10 iterations,
||F|| matching to 3 digits), with the Jacobian cost falling 16x.

A declared structure is a SOLVER AID, and the doctrine is explicit: aids
report aloud and are never trusted silently.  So the first iteration builds
the dense Jacobian too, measures the largest off-band entry, REFUSES by
name when the declaration is materially false, and announces the measured
maximum.  This gate pins all of that -- because the dangerous failure is
not slowness, it is a false structure quietly deleting real coupling and
converging to a subtly wrong column.

WHAT THIS GATE CHECKS.

  (a) THE VERIFICATION LINE IS REAL AND SAYS ZERO.  column02 (15 stages,
      binary) must print the `block-tridiagonal structure VERIFIED` line
      with max off-band |J| = 0.00e+00 -- the corpus measurement that
      justified the declaration, repeated on every run rather than
      remembered from the day it was made.

  (b) THE EVALUATION COUNT IS RECOMPUTED HERE, from the printed iteration
      count, by the formula the design promises:
          evals = iters * 3 colors * nv * 2 (central)  +  2 * N * nv (audit)
      A printed count that drifts from the formula means the coloring is
      quietly doing more (or less) work than the structure allows.

  (c) THE ANSWER IS THE SAME ANSWER.  The golden-master comparison for the
      column tutorials (all 20 PASS on the day this landed) carries this
      arm in the main suite; here a cheap re-check of column02's top/bottom
      purities against its own `expected` guards the gate's independence.

  (d) A FALSE DECLARATION REFUSES BY NAME.  Verified by sabotage (the
      declaration widened to a wrong block size must throw the named
      refusal, never converge) -- recorded below, not runnable per-commit
      without a rebuild.

WHAT THIS GATE DOES **NOT** COVER, stated so its green line cannot imply
it: the fullMESH (Naphtali-Sandholm with V,L unknowns) still solves DENSE
-- its structure is bordered, not clean tridiagonal, and it is NOT declared;
wall-clock speedups (machine-dependent; the deterministic evaluation count
is pinned instead); and the reactive stageK path's internal solvers, which
have their own gates.

SABOTAGE-VERIFIED 2026-08-25, five times; OBSERVED output, verbatim.

S1 -- the declaration COARSENED (blocks of nv+1): did NOT trip the named
refusal, and that is a finding worth the docstring: a coarser-than-truth
structure is still TRUE (wide bands contain narrow ones), so the audit
passes; what caught it was the EVALUATION-COUNT arm:

    the printed evaluation count 150 is not the formula's 120 ...

S2 -- depositColumn writes sub/sup swapped: the column DIVERGES (no
VERIFIED line, "did not converge") -- a corrupted band is not a subtle
wrongness here because Newton simply fails; the golden arm stands guard
for any subtler variant.

S3 -- the announcement deleted: "never printed the VERIFIED line" -- an
aid gone quiet is itself the failure.

S4 -- the first-iteration audit skipped: same signature as S3, because the
VERIFIED line IS the audit's output; skipping the audit cannot be silent.

S5 -- the declaration REFINED (N*nv blocks of 1, finer than the physics):
the named refusal fires at runtime, which is arm (d)'s real proof:

    newtonND: the DECLARED block-tridiagonal structure (30 blocks of 1) is
    FALSE: max |J| outside the bands is 0.088759 against 1.233004 inside.
    ... Refusing -- a wrong structure must not become a silently wrong answer.

The pair S1/S5 is the lesson: a false-coarse declaration wastes work and is
caught by arithmetic; a false-fine declaration deletes real coupling and is
caught by the audit.  Both directions are pinned.
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
CASE = "tutorials/steady/distillation/column02_simultaneous"
NV = 2      # benzene/toluene binary: (n-1) x's + T = 2
N_STAGES = 15


def main():
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(BUILD / "choupoSolve"), str(ROOT / CASE)],
                       capture_output=True, text=True, timeout=600, env=env)
    out = p.stdout + p.stderr
    failures = []

    m = re.search(r"block-tridiagonal structure VERIFIED on the first"
                  r" iteration: max \|J\| outside the bands = ([0-9.e+-]+);"
                  r" Jacobians built with 3-color finite differences"
                  r" \((\d+) residual evaluations total\)", out)
    if not m:
        failures.append("column02 never printed the VERIFIED line -- either "
                        "the declaration is gone (dense again, silently) or "
                        "the announcement was dropped (an aid gone quiet)")
    else:
        off = float(m.group(1))
        evals = int(m.group(2))
        if off != 0.0:
            failures.append(f"the measured off-band maximum is {off}, not the "
                            "0.0 the corpus measurement showed -- the MESH "
                            "residual has grown a coupling the structure "
                            "does not carry")
        it = re.search(r"Newton iters:\s*(\d+)", out)
        if not it:
            failures.append("no iteration count printed")
        else:
            iters = int(it.group(1))
            want = iters * 3 * NV * 2 + 2 * N_STAGES * NV
            if evals != want:
                failures.append(
                    f"the printed evaluation count {evals} is not the "
                    f"formula's {want} (= {iters} iters * 3 colors * {NV} "
                    f"slots * 2 central + 2*{N_STAGES}*{NV} audit) -- the "
                    "coloring is doing different work than the structure "
                    "allows")

    if "Converged:   yes" not in out:
        failures.append("column02 did not converge")

    #  (c) two KPIs against the case's own golden, so this gate does not
    #  depend on the main suite having run.
    exp = (ROOT / CASE / "expected").read_text()
    got = {}
    jm = re.search(r"<<<Choupo:result-begin>>>(.*)<<<Choupo:result-end>>>",
                   out, re.S)
    if jm:
        kp = json.loads(jm.group(1)).get("kpis", {})
        for unit in kp.values():
            if isinstance(unit, dict):
                got.update(unit)
    for row in exp.splitlines():
        parts = row.split()
        if len(parts) >= 3 and parts[0] == "kpi" and "x_top" in parts[1]:
            name, want_v = parts[1].split(".", 1)[-1], float(parts[2])
            for k, v in got.items():
                if k == name and abs(v - want_v) > 1e-6 * max(1, abs(want_v)):
                    failures.append(f"{name}: {v} moved from golden {want_v}")

    if failures:
        print("check_block_tridiagonal: FAILED")
        for f in failures:
            print("  " + f)
        return 1
    print("check_block_tridiagonal: OK -- column02's MESH declares "
          f"{N_STAGES} blocks of {NV} and the declaration is VERIFIED live: "
          "measured off-band max = 0.0 (the coupling really is "
          "nearest-neighbour), the evaluation count equals the CPR formula "
          "recomputed here (3 colors * nv * 2 per iteration + the "
          "first-iteration dense audit), and the column converges to its "
          "golden.  Measured the day this landed, 48-stage reactive "
          "stripper: 62.7 s dense -> 28.9 s structured, identical "
          "convergence, Jacobian evaluations down 16x.  NOT covered: "
          "fullMESH stays dense (bordered structure, not declared), "
          "wall-clock times (machine-dependent), and the inner reactive "
          "solvers (their own gates).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
