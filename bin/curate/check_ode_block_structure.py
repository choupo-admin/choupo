#!/usr/bin/env python3
"""Gate: the stiff integrator's DECLARED block structure is verified, honest
and cheap -- and the fixed bed's warm start no longer throws steps away.

    bin/curate/check_ode_block_structure.py

WHY THIS EXISTS (2026-10-21, DEV.md 4c C125).  Two EduTools (`breakthrough`,
`lub-scaleup`) run the witness batch13_breakthrough_co2 when a student opens
them; the browser kept the student waiting about 195 s.  Natively the run
took 85 s, and two causes were measured, both in the integration and neither
in the physics:

  (1) Rosenbrock23 built a DENSE finite-difference Jacobian every step -- one
      derivative evaluation per state row, 202 of them for 100 cells -- and
      factored a dense W = I - h d J, while the bed couples each cell only
      to its two neighbors.
  (2) The unit integrates in samplingInterval chunks and warm-started each
      chunk from ODEStats::hLast, the step grown out of the one SHORTENED to
      land on the chunk end -- it overshot, and the first step of every
      chunk was rejected (200 rejected against 400 accepted per 100 s in
      steady running; 5274 against 14865 over the run).

The remedy follows the MESH precedent (check_block_tridiagonal, 2026-08-25):
the unit DECLARES its structure (ODEControls::structure -- one block per
cell, the ledger rows as a quadrature border), Rosenbrock23 builds a COLORED
(Curtis-Powell-Reid) Jacobian of 3*nv evaluations and factors W by
block-Thomas, closes each border row directly -- a ledger reading one cell
from its own colored entries (so the mass ledgers keep telescoping to
round-off), a ledger reading every cell (Q_wall) from one directional
difference -- and AUDITS the declaration against a dense Jacobian on its
first step, refusing a false one by name.  The warm start reads ODEStats::hNext,
the controller's own proposal.

WHAT THIS GATE CHECKS.

  (a) THE PROBE.  `_odeBlockStructureProbe.cpp`, compiled HERE against the
      four solver sources alone (no engine build touched), integrates one
      method-of-lines bed laid out species-major with ledger rows in the
      middle -- the adsorber's own layout -- dense AND structured, in
      chunks, and requires:
        - the two final states to agree to 1e-9 (the structure changes how
          W is solved, never what is solved), the two border ledgers too;
        - the audit to have measured EXACTLY 0 outside the structure and
          EXACTLY 0 between the colored and the dense bands;
        - THE GROUPING ARM (timing-free): the colored evaluation count to
          equal jacobians * nv * min(3, nBlocks), recomputed here -- a
          Jacobian built column by column (the grouping dropped) costs
          nBlocks * nv and fails this arm while every answer stays right;
        - the audit to have run ONCE (n dense evaluations, not per step);
        - four FALSE declarations to be REFUSED by name: blocks holding the
          wrong cells (neighbors that are not neighbors), a border row
          that is read back, a ledger row declared to read a cell it does
          not read, a malformed row map.
  (b) THE WITNESS.  batch13 run live:
        - the Jacobian line announces `blockTridiagonal (stated default)`;
        - the VERIFIED line reports 0.00e+00 outside and 0.00e+00 between
          colored and dense;
        - the cumulative evaluation count reproduces the CPR formula with
          the nv the run printed;
        - the WARM-START ARM: rejected steps are at most 5 % of accepted
          ones over the run (the hLast warm start measured 50 %).
  (c) A WORD THE UNIT DOES NOT KNOW REFUSES.  `solver { jacobian banana; }`
      on a copy of batch13 exits non-zero naming both accepted words.
  (d) DENSE AND STRUCTURED AGREE ON A CASE WITH EVERY BORDER KIND.  A 60 s
      variant of batch22_wall_cooled (Ergun flow, the thermal T rows after
      the ledger rows, the dense Q_wall border row) is run with
      `jacobian dense;` and with the default, and every KPI of the result
      JSON agrees to 1e-7 relative.

WHAT THIS GATE DOES NOT COVER, stated so its green line cannot imply it:
wall-clock speed (machine-dependent -- the evaluation count is pinned
instead); whether the goldens of the adsorber witnesses still hold (the main
suite's per-case comparison does that); other Rosenbrock23 users, which
declare no structure and take the dense path untouched; and the MESH, which
keeps its own gate (check_block_tridiagonal) on the block-Thomas home the
two now share.

SABOTAGE-VERIFIED 2026-10-21, by hand, each restored and rebuilt (`make
all`) before the next; OBSERVED output, abridged to the failing arms.

  S1 -- the declaration FALSE (buildOdeStructure_ puts cell (j+1) mod N in
        block j): batch13 and batch22 REFUSE at their first step --
          (b) batch13 exited 2: ... the DECLARED block-tridiagonal structure
          (100 blocks of 2, 2 border rows) is FALSE: max |J| outside it is
          35.000000 against 134.197555 inside.
  S2 -- the column grouping DROPPED (one block per evaluation): every answer
        unchanged -- (b) VERIFIED and (d) both PASS -- and only the grouping
        arms see it:
          (a) GROUPING: 113940 colored evaluations for 1266 Jacobians, the
              CPR formula gives 11394
          (b) GROUPING: batch13 spent 2980800 colored evaluations on 14904
              Jacobians, the CPR formula gives 89424
  S3 -- the coloring stride 2 instead of 3 (two perturbed cells share a
        row): the audit refuses by name, the probe and both cases stop --
          ERROR: Rosenbrock23: the COLORED Jacobian disagrees with the dense
          one inside the declared structure (max difference 35.000000 ...
  S4 -- the audit skipped: the three false declarations of the probe are
        ACCEPTED and batch13 prints no VERIFIED line --
          (a) the audit spent 0 dense evaluations, not the 92 ...
          (a) the false declaration F1-wrong-neighbors was not refused ...
          (b) batch13 never printed the VERIFIED line ...
  S5 -- the warm start back on hLast:
          (b) WARM START: 5269 rejected against 14888 accepted steps (> 5%)
        and, a finding: (d) failed too (deltaP 74.1094159307 dense vs
        74.1094056832, 1.4e-7) -- with a rejection on every chunk the two
        paths' step sequences part on round-off, which is the warm-start
        defect showing itself a second way.
  S6 -- the narrow ledger rows closed by the directional difference instead
        of their colored entries: the helium ledger stops telescoping --
          (d) ... on bed.carrier_fabricated_mol (1.33226762955e-15 dense vs
              -4.57281545962e-10)
          (a) the false declaration F4-border-reads-elsewhere was not refused
        This one was not hypothetical: it is the first version of this
        slice, and batch24_blowdown_inert then reported a 3.8e-6 LEAK where
        the dense run closes at 5.7e-16.  The absolute floor of arm (d) is
        what makes it visible on a case whose closures sit at round-off.
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
BUILD = ROOT / "build" / "linux64Gcc"
PROBE = ROOT / "bin" / "curate" / "_odeBlockStructureProbe.cpp"
SOURCES = ["src/solver/ODE/Rosenbrock23.cpp", "src/solver/ODE/Jacobian.cpp",
           "src/solver/LU.cpp", "src/solver/BlockTridiagonal.cpp"]
B13 = ROOT / "tutorials" / "batch" / "adsorber" / "batch13_breakthrough_co2"
B22 = ROOT / "tutorials" / "batch" / "adsorber" / "batch22_wall_cooled"
WARM_START_MAX_REJECTED = 0.05

fails = []


def arm_probe(tmp: Path):
    cxx = shutil.which("g++") or shutil.which("clang++")
    if not cxx:
        fails.append("(a) no C++ compiler: the probe cannot run -- a check "
                     "that cannot run must not pass")
        return
    exe = tmp / "probe"
    r = subprocess.run([cxx, "-std=c++17", "-O2", "-I", str(ROOT / "src"),
                        str(PROBE)] + [str(ROOT / s) for s in SOURCES]
                       + ["-o", str(exe)], capture_output=True, text=True)
    if r.returncode != 0:
        fails.append("(a) the probe does not compile:\n" + r.stderr[-2000:])
        return
    out = subprocess.run([str(exe)], capture_output=True, text=True,
                         timeout=600).stdout
    v = {}
    for line in out.splitlines():
        parts = line.split()
        if len(parts) >= 2 and not line.startswith(("REFUSED", "ACCEPTED")):
            v[parts[0]] = parts[1:]
    try:
        n = int(v["n"][0])
        N = int(v["nBlocks"][0])
        nv = int(v["blockSize"][0])
        jac = int(v["jacobians"][0])
        evals = int(v["jacobianEvals"][0])
        audit = int(v["auditEvals"][0])
        diff = float(v["maxRelDiff"][0])
        off = float(v["offStructureMax"][0])
        mis = float(v["coloredMismatch"][0])
    except (KeyError, ValueError, IndexError) as e:
        fails.append(f"(a) the probe did not print {e}:\n{out[-1500:]}")
        return
    if diff > 1e-9:
        fails.append(f"(a) dense and structured final states differ by "
                     f"{diff:.3e} relative (> 1e-9): the structured path "
                     "solves a different problem")
    for key in ("Mout", "Qwall"):
        a, b = (float(x) for x in v[key])
        if abs(a - b) > 1e-9 * max(abs(a), 1.0):
            fails.append(f"(a) the border ledger {key} differs: dense {a} vs "
                         f"structured {b}")
    if off != 0.0 or mis != 0.0:
        fails.append(f"(a) the audit measured {off} outside the structure and "
                     f"{mis} colored-vs-dense (both must be exactly 0 on a "
                     "true structure)")
    want = jac * nv * min(3, N)
    if evals != want:
        fails.append(f"(a) GROUPING: {evals} colored evaluations for {jac} "
                     f"Jacobians, the CPR formula gives {want} (= {jac} * "
                     f"{nv} * {min(3, N)}) -- the coloring is not grouping "
                     "the columns it may")
    if audit != n:
        fails.append(f"(a) the audit spent {audit} dense evaluations, not the "
                     f"{n} of ONE dense Jacobian")
    for tag, needle in (("F1-wrong-neighbors", "is FALSE"),
                        ("F2-border-read-back", "is FALSE"),
                        ("F4-border-reads-elsewhere", "is FALSE"),
                        ("F3-malformed", "malformed")):
        m = re.search(rf"^REFUSED {tag}: (.*)$", out, re.M)
        if not m or needle not in m.group(1):
            fails.append(f"(a) the false declaration {tag} was not refused "
                         f"naming '{needle}':\n{out[-1500:]}")
    return (N, nv, jac, evals, diff)


def run_batch(case: Path):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(BUILD / "choupoBatch"), "."], cwd=case,
                       capture_output=True, text=True, timeout=900, env=env)
    return p.returncode, p.stdout + p.stderr


def copy_case(base: Path, dst: Path) -> Path:
    shutil.copytree(base, dst, ignore=shutil.ignore_patterns(
        "expected", "*.csv", "[0-9]*", "resultJson*", "reports"))
    return dst


def kpis(out: str):
    m = re.search(r"<<<Choupo:result-begin>>>(.*)<<<Choupo:result-end>>>",
                  out, re.S)
    if not m:
        return None
    flat = {}
    for unit, d in json.loads(m.group(1)).get("kpis", {}).items():
        if isinstance(d, dict):
            for k, val in d.items():
                if isinstance(val, (int, float)):
                    flat[f"{unit}.{k}"] = float(val)
    return flat


def arm_witness(tmp: Path):
    rc, out = run_batch(copy_case(B13, tmp / "b13"))
    if rc != 0:
        fails.append(f"(b) batch13 exited {rc}:\n{out[-1500:]}")
        return None
    if "solver.jacobian blockTridiagonal (stated default)" not in out:
        fails.append("(b) batch13 does not announce `solver.jacobian "
                     "blockTridiagonal (stated default)` -- the aid went quiet")
    m = re.search(r"Jacobian structure VERIFIED on the first step \((\d+) "
                  r"blocks of (\d+), (\d+) border rows\): max \|J\| outside it"
                  r" = ([0-9.e+-]+) against ([0-9.e+-]+) inside; colored vs"
                  r" dense in the bands = ([0-9.e+-]+)", out)
    if not m:
        fails.append("(b) batch13 never printed the VERIFIED line -- the "
                     "declaration is gone (dense again, silently) or the "
                     "audit was skipped")
        return None
    N, nv = int(m.group(1)), int(m.group(2))
    if float(m.group(4)) != 0.0 or float(m.group(6)) != 0.0:
        fails.append(f"(b) batch13's audit measured {m.group(4)} outside the "
                     f"structure and {m.group(6)} colored-vs-dense, not 0")
    cum = re.findall(r"(\d+) accepted, (\d+) rejected sub-steps, h_next = "
                     r"[0-9.e+-]+ s; cumulative: (\d+) colored Jacobians, "
                     r"(\d+) evaluations, (\d+) border products", out)
    if not cum:
        fails.append("(b) batch13 printed no cumulative Jacobian count")
        return None
    acc = sum(int(c[0]) for c in cum)
    rej = sum(int(c[1]) for c in cum)
    jac, evals = int(cum[-1][2]), int(cum[-1][3])
    want = jac * nv * min(3, N)
    if evals != want:
        fails.append(f"(b) GROUPING: batch13 spent {evals} colored evaluations"
                     f" on {jac} Jacobians, the CPR formula gives {want}")
    if acc == 0 or rej > WARM_START_MAX_REJECTED * acc:
        fails.append(f"(b) WARM START: {rej} rejected against {acc} accepted "
                     f"steps (> {WARM_START_MAX_REJECTED:.0%}) -- each chunk "
                     "is again restarting from a step it then throws away")
    return (N, nv, acc, rej, jac, evals)


def arm_word(tmp: Path):
    case = copy_case(B13, tmp / "b13junk")
    fs = case / "system" / "flowsheetDict"
    txt = fs.read_text()
    anchor = "        type        fixedBedAdsorber;\n"
    assert anchor in txt, "batch13 flowsheetDict changed shape"
    fs.write_text(txt.replace(anchor, anchor
                  + "        solver { jacobian banana; }\n", 1))
    rc, out = run_batch(case)
    if rc == 0 or "banana" not in out or "blockTridiagonal" not in out \
            or "dense" not in out:
        fails.append(f"(c) `jacobian banana;` was not refused by name "
                     f"(exit {rc}):\n{out[-1200:]}")


def arm_dense_vs_structured(tmp: Path):
    got = {}
    for tag, decl in (("dense", "jacobian dense; "), ("block", "")):
        case = copy_case(B22, tmp / f"b22{tag}")
        ctrl = case / "system" / "controlDict"
        t = ctrl.read_text()
        t2 = re.sub(r"endTime\s+12000;", "endTime 60;", t)
        t2 = re.sub(r"writeInterval\s+\d+;", "writeInterval 30;", t2)
        assert t2 != t, "batch22 controlDict changed shape"
        ctrl.write_text(t2)
        fs = case / "system" / "flowsheetDict"
        s = fs.read_text()
        old = "solver { samplingInterval 2.0; rtol 1e-6; }"
        assert old in s, "batch22 solver block changed shape"
        fs.write_text(s.replace(old, "solver { " + decl
                                + "samplingInterval 2.0; rtol 1e-6; }", 1))
        rc, out = run_batch(case)
        k = kpis(out)
        if rc != 0 or not k:
            fails.append(f"(d) batch22 ({tag}) exited {rc} or published no "
                         f"KPIs:\n{out[-1200:]}")
            return None
        got[tag] = k
    worst, where = 0.0, ""
    for key, a in got["dense"].items():
        b = got["block"].get(key)
        if b is None:
            fails.append(f"(d) KPI {key} published dense but not structured")
            continue
        #  1e-7 relative, with an ABSOLUTE floor of 1e-12: the closure KPIs
        #  sit at round-off (1e-15) and must STAY there -- a border row
        #  differentiated off the colored perturbations once moved the
        #  helium closure to 4e-10 and this floor is what caught it.
        excess = abs(a - b) / max(1e-7 * max(abs(a), abs(b)), 1e-12)
        if excess > worst:
            worst, where = excess, f"{key} ({a!r} dense vs {b!r})"
    if worst > 1.0:
        fails.append(f"(d) dense and structured batch22 differ beyond "
                     f"max(1e-7 relative, 1e-12 absolute) on {where}")
    return (len(got["dense"]), worst, where)


def main() -> int:
    if not (BUILD / "choupoBatch").exists():
        print("check_ode_block_structure: FAILED -- no choupoBatch build; a "
              "check that cannot run must not pass")
        return 1
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        pa = arm_probe(tmp)
        pb = arm_witness(tmp)
        arm_word(tmp)
        pd = arm_dense_vs_structured(tmp)
    if fails:
        print("check_ode_block_structure: FAILED")
        for f in fails:
            print("  " + f)
        return 1
    N, nv, jac, evals, diff = pa
    bN, bnv, acc, rej, bjac, bevals = pb
    nk, worst, where = pd
    print(f"check_ode_block_structure: OK -- the probe ({N} cells of {nv}, "
          f"ledgers between the cell rows) integrates dense and structured to "
          f"{diff:.1e} apart, its audit measured exactly 0 outside the "
          f"structure and between colored and dense bands, {evals} colored "
          f"evaluations for {jac} Jacobians = the CPR formula, and four false "
          f"declarations refused by name; batch13 declares {bN} blocks of "
          f"{bnv}, VERIFIED at 0, {bevals} evaluations for {bjac} Jacobians = "
          f"the formula, {rej} rejected against {acc} accepted steps "
          f"(warm start from hNext); `jacobian banana;` refused; batch22 "
          f"(60 s) dense vs structured agree on all {nk} KPIs within "
          f"max(1e-7 rel, 1e-12 abs) (worst at {worst:.2f} of that band).  NOT covered: wall-clock speed, the adsorber "
          "goldens (the suite's per-case check), Rosenbrock23 users that "
          "declare no structure (dense, untouched).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
