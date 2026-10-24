#!/usr/bin/env python3
"""Gate: the DSPM-DE pore SOLVED by finite differences -- grid, machine
level, an analytic limit, the default untouched, the refusals, the voice.

    bin/curate/check_pore_solver.py

WHY THIS EXISTS (2026-10-22, DEV.md 4c C138).  The default DSPM-DE did not
solve the pore (it does since 2026-10-24, DEV.md 4c C141 -- see (d)): it makes the pore electroneutral at the feed face, the
permeate electroneutral, and carries each ion across ALONE by a closed-form
transmission, while its header listed pore electroneutrality and zero
current as "the physics solved".  `transportParameters { poreSolver { method
finiteDifference; nodes <n>; } }` now SOLVES the extended Nernst-Planck
equations across the pore -- every node at once, by Newton on the declared
block-tridiagonal structure -- the method of NanoFiltran (Geraldes & Alves,
J. Membr. Sci. 321 (2008) 172-182).  A new solver is a claim about numbers,
so the numbers are MEASURED here, from inputs this gate can see.

WHAT THIS GATE CHECKS.

  (a) THE PROBE.  `_poreSolverProbe.cpp`, compiled HERE against
      PoreNernstPlanck.cpp and the solver sources alone, hands the pore
      solver problems whose coefficients are written in the probe:
        ANALYTIC  a 1:1 salt, X_d = 0, unequal partitions and conductances:
                  electroneutrality and zero current collapse the two ENP
                  equations into ONE ambipolar equation with a closed-form
                  answer, c_p / (gamma c_w) = S Kc_s / (1 - (1 - S Kc_s)
                  e^{-Pe}), S = sqrt(Phi+ Phi-), P_s = 2 P+ P-/(P+ + P-),
                  Kc_s = (Kc+ P- + Kc- P+)/(P+ + P-), Pe = Kc_s J_v / P_s --
                  RECOMPUTED HERE from the probe's inputs.  At Peclet 0.44
                  and 4.4 the FD answer converges to it at an observed
                  order in [1.8, 2.2] from 25 to 400 intervals and is within
                  1e-8 at 1600; at Peclet 440 (a cell Peclet number of 17.6
                  at 25 intervals, where a central difference oscillates)
                  it is within 1e-10 at EVERY grid -- the arm that sees the
                  flux is the exponentially fitted one; and the cation and
                  anion permeates agree to 1e-12 (zero current).
        GRID      a STIFF pore (X_d = -200 mol/m3 against a divalent co-ion
                  and a trace monovalent one): Richardson's observed order
                  from 25/50/100 and 50/100/200 intervals in [1.8, 2.2] on
                  every ion.
        MACHINE   on every stiff run: ||F|| <= 1e-12, the flux constancy
                  (relative to the two fitted terms each interval nets),
                  the zero current and the electroneutrality each <= 1e-13.
        AUDIT     the declared block-tridiagonal structure measured on the
                  first solve: EXACTLY 0 outside the bands.
        SWEEP     water flux 1e-7..1e-2 m/s x X_d -2000..+1000 mol/m3, 56
                  problems from a CRUDE seed: every one converges, with
                  ||F|| <= 1e-12 and zero current and electroneutrality
                  <= 1e-13; how many needed the continuation is printed.
        WARM      a warm start from a neighbouring flux agrees with a cold
                  solve to 1e-10.
        REFUSED   a pore with one sign of charge, and an absent ion handed
                  in as a term, each refuse by name.
  (b) THE WITNESS membrane20_dspmde_pore_finite_difference, run here: each
      `_pore` unit announces the method, its node count, the first solve's
      Newton iterations and ||F||, and the structure VERIFIED at 0; prints a
      pore summary whose residual, flux constancy, zero current and
      electroneutrality are each <= 1e-12 (the Newton's own tolerance); publishes
      `pore_nodes` 101.  The `_closedForm` unit (MgSO4, `method closedForm;`
      DECLARED since C141) says and publishes NOTHING about a pore -- silence
      keeps meaning "not solved".
  (c) THE ENGINE AGAINST THE ANALYTIC LIMIT, END TO END.  A copy of the
      witness on an UNCHARGED, Born-free variant of its membrane (written
      here, beside the record): per station, the permeate the march used
      (dN_b / dQ_b between profile rows) against the ambipolar closed form
      above, built in Python from the station's own J_w and wall
      concentration (the profile's c_b and Gamma), the Davies gamma at the
      bulk ionic strength, the ion radii and D0 from the case's species
      records, and an independent transcription of the Dechadilok-Deen
      hindrance pair (K_d = H/Phi, their K_c; until 2026-10-24 the retired
      default that took H as K_d): within 1e-5 at every station.  This is what proves the LAW hands the pore the right
      conductances, hindrances and partitions -- the probe cannot.
      (c2) A FINDING, pinned: on the same stations the DECLARED closed form
      (a second copy, its NaCl unit switched to `method closedForm;`)
      departs from that limit by more than 5 % -- the day it stops, this
      arm fails asking for its pin back.
      (c3) A FINDING, pinned (C141): on the CHARGED witness membrane the
      declared closed form with the corrected hindrance returns a NaCl
      permeate richer than the wall -- its transmission tends to K_c > 1 at
      low Peclet number -- and the module refuses the run on its solute
      balance; the day it runs, this arm asks for its pin back (and the
      NaCl closed-form unit membrane20 lost for this reason can return).
  (d) THE DEFAULT IS THE SOLVED PORE (C141, 2026-10-24; until then this arm
      held the closed form untouched).  membrane10 and membrane11 (DSPM-DE,
      no transportParameters) run here: every unit announces the hindrance
      DechadilokDeen2006 "(the default)", wallClosure porePermeate "(the
      default)" and the pore SOLVED "(poreSolver finiteDifference, the
      default)" on 101 nodes "(stated default; declare `nodes`)", prints a
      pore summary at machine level and publishes `pore_nodes` 101; and
      every row of their `expected` golden is reproduced to 1e-10 relative
      -- tighter than the golden's own 1e-4, at the twelve printed digits.
      THAT LAST HALF FAILS until Vitor's re-record of the two goldens: the
      default moved by design (C141), and the moved rows are his to see
      first (CLAUDE.md, a golden re-record is a claim).
  (e) REFUSALS, on copies of the witness: an unknown method word (naming
      both accepted words), `nodes 2`, `nodes` beside `method closedForm`,
      an unknown key inside `poreSolver`, an unknown key inside
      `transportParameters` -- each exits non-zero naming its cause.

WHAT THIS GATE DOES NOT COVER, stated so its green line cannot imply it:
any comparison with NanoFiltran's published numbers (the code-to-code
comparison is check_nanofiltran_reference's); the batch diafilter under the
solved pore (it runs, but no witness and no pore summary there); the
closed-form wall (B_s) against the solved pore's (porePermeate) as a pair;
activity inside the pore and at the permeate face (ideal in both paths);
whether 101 nodes are ENOUGH for a given case (the grid arm measures the
order, a case must still declare its grid); wall-clock speed.

SABOTAGE-VERIFIED 2026-10-22, by hand, each restored and rebuilt (`make
all`) before the next; OBSERVED output, abridged to the failing arms.
  S1 -- the fitted flux replaced by a central difference (B(x) = 1 - x/2):
          (a) ANALYTIC: at N=1600 the FD answer is -2.756e-08 from the
              analytic limit (> 1e-8)
          (a) HIGH PECLET: at Pe 439 and N=25 the FD answer is -2.628e-03
              from the analytic limit (> 1e-10)
        The low-Peclet orders stayed at 2 -- a central difference is second
        order too where it is stable -- which is why the Peclet-440 arm exists.
  S2 -- X_d dropped from the electroneutrality ROW (kept in the measurement):
          (a) MACHINE: electroneutrality 9.956686e-01 at N=25 ... (every grid)
          (a) SWEEP: worst electroneutrality 9.995829e-01
          (b) NF_NaCl_pore's pore summary: ... electroneutrality 0.951
  S3 -- the zero-current row weighted 1 % off on the first ion:
          (a) ANALYTIC: cation and anion permeates differ at N=25
              (3.701517000469435 vs 3.738532170474129) -- zero current is
              not held; observed order -0.002 ...; 3.980e-03 from the limit
  S4 -- DSPM-DE skips the structure audit on its first solve:
          (b) the first-solve line (iterations, ||F||, structure VERIFIED)
              appears 0 times, not 2
  S5 -- DSPM-DE hands the pore an unhindered conductance (K_d dropped from
        P = K_d D A_k/dx).  The probe cannot see it -- it hands the pore its
        own coefficients -- and ONLY the end-to-end arm does:
          (c) the solved pore departs from the ambipolar limit by 1.394e+00
              at its worst station (> 1e-5)
  S6 -- the DEFAULT closed form nudged by 1e-6 in K_c:
          (d) membrane10_dspmde_divalent kpi NF_NaCl R_obs_NaCl:
              0.549471363018 against the golden 0.549471614469 ... (13 rows)
        Found by it: two golden rows sit at round-off (mass_closure_rel
        2.2e-16 vs 4.4e-16), so such rows are now compared absolutely
        (1e-14); a 1e-10 relative test on them is a test of the compiler.
  S7 -- an unknown method word ACCEPTED (the refusal removed).  SURVIVED
        the first version of arm (e): its `banana` probe also declared
        `nodes`, and with the method refusal gone `banana` fell to the closed
        form, which then refused `nodes` -- a refusal for another reason,
        whose output still contained every needle.  Each probe now carries
        ONE defect and its needle is the refusal's own sentence:
          (e) `method banana` was ACCEPTED (exit 0)
  S8 -- the continuation disabled:
          (a) GRID: the stiff pore at N=25 did not converge ... ||F|| =
              6.07e+00 ... (every grid, from the crude seed)
"""
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
BUILD = ROOT / "build" / "linux64Gcc"
PROBE = ROOT / "bin" / "curate" / "_poreSolverProbe.cpp"
SOURCES = ["src/unitOperations/membrane/transport/PoreNernstPlanck.cpp",
           "src/solver/NewtonND.cpp", "src/solver/LU.cpp",
           "src/solver/BlockTridiagonal.cpp"]
MEMB = ROOT / "tutorials" / "steady" / "membranes"
WITNESS = MEMB / "membrane20_dspmde_pore_finite_difference"
DEFAULTS = [MEMB / "membrane10_dspmde_divalent",
            MEMB / "membrane11_dspmde_born_toggle"]

fails = []
notes = []


# ---- helpers ------------------------------------------------------------------
def run_case(case_dir):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(BUILD / "choupoSolve"), str(case_dir)],
                       capture_output=True, text=True, timeout=900, env=env)
    return r.returncode, r.stdout + r.stderr


def result_of(out):
    if "<<<Choupo:result-begin>>>" not in out:
        return None
    return json.loads(out.split("<<<Choupo:result-begin>>>")[1]
                         .split("<<<Choupo:result-end>>>")[0])


def copy_case(src, dst):
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
        "expected", "converged", "reports", "design", "*.csv"))
    return dst


def order(e1, e2):
    return math.log(abs(e1) / abs(e2), 2.0)


# ---- (a) the probe --------------------------------------------------------------
def arm_probe(tmp):
    cxx = shutil.which("g++") or shutil.which("clang++")
    if not cxx:
        fails.append("(a) no C++ compiler: the probe cannot run -- a check "
                     "that cannot run must not pass")
        return None
    exe = tmp / "probe"
    r = subprocess.run([cxx, "-std=c++17", "-O2", "-I", str(ROOT / "src"),
                        str(PROBE)] + [str(ROOT / s) for s in SOURCES]
                       + ["-o", str(exe)], capture_output=True, text=True)
    if r.returncode != 0:
        fails.append("(a) the probe does not compile:\n" + r.stderr[-2000:])
        return None
    p = subprocess.run([str(exe)], capture_output=True, text=True, timeout=900)
    out = p.stdout

    # ANALYTIC -- recomputed here from the probe's own inputs (kept in step
    # with _poreSolverProbe.cpp: P+ 4e-4, P- 7e-4, Kc+ 1.10, Kc- 1.15,
    # Phi+ 0.16, Phi- 0.20, gamma c_w 9).
    Pp, Pm, Kp, Km, Fp, Fm, gcw = 4.0e-4, 7.0e-4, 1.10, 1.15, 0.16, 0.20, 9.0
    Ps = 2 * Pp * Pm / (Pp + Pm)
    Kcs = (Kp * Pm + Km * Pp) / (Pp + Pm)
    S = math.sqrt(Fp * Fm)
    analytic_orders = []
    for Jv in (2.0e-4, 2.0e-3, 2.0e-1):
        Pe = Kcs * Jv / Ps
        exact = S * Kcs * gcw / (1 - (1 - S * Kcs) * math.exp(-Pe))
        m = re.search(rf"^analyticExact {Jv:.3e} (\S+)", out, re.M)
        if not m or abs(float(m.group(1)) / exact - 1) > 1e-14:
            fails.append(f"(a) ANALYTIC: the probe's closed form at J_v {Jv:.1e}"
                         f" is not the one recomputed here ({exact!r})")
        rows = re.findall(rf"^analyticJv {Jv:.3e} N (\d+) conv (\d) .*? en \S+ (\S+) (\S+)$",
                          out, re.M)
        if len(rows) < 7:
            fails.append(f"(a) ANALYTIC: the probe printed {len(rows)} grid rows at "
                         f"J_v {Jv:.1e}, not 7:\n{out[-1500:]}")
            continue
        errs = []
        for N, conv, cp, cm in rows:
            cp, cm = float(cp), float(cm)
            if conv != "1":
                fails.append(f"(a) ANALYTIC: N={N} at J_v {Jv:.1e} did not converge")
            if abs(cp - cm) > 1e-12 * cp:
                fails.append(f"(a) ANALYTIC: cation and anion permeates differ at N={N}"
                             f" ({cp!r} vs {cm!r}) -- zero current is not held")
            errs.append((int(N), (cp - exact) / exact))
        if Jv > 1e-2:
            #  A cell Peclet number of 17.6 at N = 25: a central difference
            #  is not free of oscillation there, the fitted flux is exact
            #  for a uniform drift -- measured at round-off at EVERY grid.
            for n_, e_ in errs:
                if abs(e_) > 1e-10:
                    fails.append(f"(a) HIGH PECLET: at Pe {Pe:.0f} and N={n_} the FD answer is "
                                 f"{e_:.3e} from the analytic limit (> 1e-10) -- the flux is not "
                                 "the exponentially fitted one")
            continue
        for (n1, e1), (n2, e2) in zip(errs[:4], errs[1:5]):
            p_ = order(e1, e2)
            analytic_orders.append(p_)
            if not 1.8 <= p_ <= 2.2:
                fails.append(f"(a) ANALYTIC: observed order {p_:.3f} between N={n1} and"
                             f" {n2} at J_v {Jv:.1e} (errors {e1:.3e}, {e2:.3e}) -- not 2")
        if abs(errs[-1][1]) > 1e-8:
            fails.append(f"(a) ANALYTIC: at N={errs[-1][0]} the FD answer is "
                         f"{errs[-1][1]:.3e} from the analytic limit (> 1e-8)")

    # GRID + MACHINE on the stiff pore
    rows = re.findall(r"^stiff (\d+) conv (\d) it \d+ cont \d+ res (\S+) flux (\S+) "
                      r"fluxRel \S+ stiff (\S+) current (\S+) en (\S+) (.*)$", out, re.M)
    grid_orders = []
    stiffness = None
    if len(rows) < 4:
        fails.append(f"(a) GRID: the probe printed {len(rows)} stiff rows:\n{out[-1500:]}")
    else:
        vals = {}
        for N, conv, res, flux, stiff, cur, en, cps in rows:
            stiffness = float(stiff)
            if conv != "1":
                fails.append(f"(a) GRID: the stiff pore at N={N} did not converge")
            if float(res) > 1e-12:
                fails.append(f"(a) MACHINE: ||F|| = {res} at N={N} (> 1e-12)")
            for nm, v in (("flux constancy", flux), ("zero current", cur),
                          ("electroneutrality", en)):
                if float(v) > 1e-13:
                    fails.append(f"(a) MACHINE: {nm} {v} at N={N} (> 1e-13)")
            vals[int(N)] = [float(x) for x in cps.split()]
        for ion in range(len(vals[25])):
            for a, b, c in ((25, 50, 100), (50, 100, 200)):
                d1 = vals[a][ion] - vals[b][ion]
                d2 = vals[b][ion] - vals[c][ion]
                if abs(d2) < 1e-14 * abs(vals[c][ion]):
                    fails.append(f"(a) GRID: ion {ion}'s change from N={b} to {c} is at "
                                 "round-off; the order cannot be measured there")
                    continue
                p_ = order(d1, d2)
                grid_orders.append(p_)
                if not 1.8 <= p_ <= 2.2:
                    fails.append(f"(a) GRID: Richardson order {p_:.3f} on ion {ion} from "
                                 f"N={a}/{b}/{c} -- not 2")

    # AUDIT
    audits = re.findall(r"^audit \S+ offBand (\S+) evals (\d+) blocks (\d+) size (\d+)$",
                        out, re.M)
    if len(audits) != 3:
        fails.append(f"(a) AUDIT: {len(audits)} audit lines, not 3")
    for off, ev, nb, sz in audits:
        if float(off) != 0.0:
            fails.append(f"(a) AUDIT: {off} outside the declared bands (must be exactly 0)")

    # SWEEP
    m = re.search(r"^sweep total (\d+) converged (\d+) continued (\d+) worstRes (\S+)"
                  r" worstFlux (\S+) worstCurrent (\S+) worstEn (\S+) worstIter (\d+)$",
                  out, re.M)
    sweep = None
    if not m:
        fails.append("(a) SWEEP: no summary line:\n" + out[-1500:])
    else:
        tot, ok, cont = int(m.group(1)), int(m.group(2)), int(m.group(3))
        sweep = (tot, ok, cont)
        if ok != tot or tot != 56:
            fails.append(f"(a) SWEEP: {ok} of {tot} problems converged (56 expected):\n"
                         + "\n".join(re.findall(r"^sweepFail.*$", out, re.M)))
        if float(m.group(4)) > 1e-12:
            fails.append(f"(a) SWEEP: worst ||F|| {m.group(4)} (> 1e-12)")
        for nm, v in (("zero current", m.group(6)), ("electroneutrality", m.group(7))):
            if float(v) > 1e-13:
                fails.append(f"(a) SWEEP: worst {nm} {v} (> 1e-13)")

    # WARM
    m = re.search(r"^warm itWarm \d+ contWarm \d+ itCold \d+ contCold \d+ maxRelDiff (\S+)$",
                  out, re.M)
    if not m or float(m.group(1)) > 1e-10:
        fails.append("(a) WARM: a warm start does not reproduce a cold solve "
                     + (m.group(1) if m else "(no line)"))

    # REFUSED
    for tag, needle in (("one-sign", "one cation and one anion"),
                        ("absent-ion", "absent ion is not a term")):
        m = re.search(rf"^REFUSED {tag}: (.*)$", out, re.M)
        if not m or needle not in m.group(1):
            fails.append(f"(a) REFUSED: {tag} was not refused naming '{needle}'")
    return (analytic_orders, grid_orders, stiffness, sweep)


# ---- (b) the witness ---------------------------------------------------------------
SUMMARY = re.compile(r"\[DSPM-DE\] pore summary \((\w+)\): (\d+) pore solves on (\d+) nodes,"
                     r" at most (\d+) Newton iterations, \|\|F\|\| <= (\S+); flux constancy"
                     r" <= (\S+) of the terms it nets \((\S+) of the net flux, at a stiffness"
                     r" of (\S+)\), zero current <= (\S+), electroneutrality <= (\S+); (\d+)"
                     r" solves by continuation in J_v")


def arm_witness():
    rc, out = run_case(WITNESS)
    if rc != 0:
        fails.append(f"(b) the witness exited {rc}:\n{out[-2000:]}")
        return None
    res = result_of(out)
    if res is None:
        fails.append("(b) the witness printed no result JSON")
        return None
    banners = re.findall(r"\[DSPM-DE\] pore SOLVED \(poreSolver finiteDifference\): the "
                         r"extended Nernst-Planck equations on (\d+) nodes", out)
    firsts = re.findall(r"\[DSPM-DE\] first pore solve: (\d+) Newton iterations, \|\|F\|\| ="
                        r" (\S+), block-tridiagonal structure VERIFIED \(max \|J\| off the"
                        r" bands = (\S+)\)", out)
    if banners != ["101", "101"]:
        fails.append(f"(b) the method banner appears {len(banners)} times with nodes "
                     f"{banners} (expected twice, 101)")
    if len(firsts) != 2:
        fails.append(f"(b) the first-solve line (iterations, ||F||, structure VERIFIED) "
                     f"appears {len(firsts)} times, not 2")
    for it, r_, off in firsts:
        if float(r_.rstrip(",")) > 1e-12 or float(off) != 0.0:
            fails.append(f"(b) first solve: ||F|| {r_}, off-band {off}")
    sums = {m.group(1): m for m in SUMMARY.finditer(out)}
    if set(sums) != {"NF_NaCl_pore", "NF_MgSO4_pore"}:
        fails.append(f"(b) pore summaries for {sorted(sums)}, expected exactly the two "
                     "_pore units -- a _closedForm unit must say nothing about a pore")
    for u, m in sums.items():
        if float(m.group(5)) > 1e-12 or float(m.group(6)) > 1e-12 \
                or float(m.group(9)) > 1e-12 or float(m.group(10)) > 1e-12:
            fails.append(f"(b) {u}'s pore summary: ||F|| {m.group(5)}, flux constancy "
                         f"{m.group(6)}, current {m.group(9)}, electroneutrality "
                         f"{m.group(10)} -- not machine level")
    k = res.get("kpis", {})
    for u in ("NF_NaCl_pore", "NF_MgSO4_pore"):
        if k.get(u, {}).get("pore_nodes") != 101:
            fails.append(f"(b) {u} does not publish pore_nodes 101")
    for u in ("NF_MgSO4_closedForm",):
        if any(key.startswith("pore_") for key in k.get(u, {})):
            fails.append(f"(b) {u} publishes a pore_ KPI -- the closed form solved no pore")
    r_obs = {u: k.get(u, {}).get("R_obs_" + u.split("_")[1]) for u in k}
    return sums, r_obs


# ---- (c) the engine against the analytic limit -------------------------------------
def species_value(case, ion, key):
    txt = (case / "constant" / "species" / f"{ion}.dat").read_text()
    return float(re.search(rf"^{key}\s*\{{\s*value\s+(\S+);", txt, re.M).group(1))


def deen(lam):
    """Dechadilok & Deen 2006 (Ind. Eng. Chem. Res. 45, 6953), transcribed
    independently: their polynomial is H = Phi K_d, so K_d = H/Phi
    (lambda <= 0.95; the lubrication form above), and their rational K_c.
    Until 2026-10-24 (DEV.md 4c C141) this transcribed the retired default,
    which took H itself as K_d."""
    lam = max(lam, 0.0)
    phi = (1 - lam) ** 2
    if lam <= 0.95:
        h = (1 + 9.0 / 8.0 * lam * math.log(lam) - 1.56034 * lam + 0.528155 * lam ** 2
             + 1.91521 * lam ** 3 - 2.81903 * lam ** 4 + 0.270788 * lam ** 5
             + 1.10115 * lam ** 6 - 0.435933 * lam ** 7)
        kd = h / phi
    else:
        kd = 0.984 * ((1 - lam) / lam) ** 2.5
    kc = (1 + 3.867 * lam - 1.907 * lam ** 2 - 0.834 * lam ** 3) / (1 + 1.867 * lam - 0.741 * lam ** 2)
    return phi, kd, kc


PORE_LINE = "poreSolver { method finiteDifference;  nodes 101; }"
CLOSED_LINE = "poreSolver { method closedForm; }"


def uncharged_copy(tmp, name, closed_nacl):
    """The witness on an UNCHARGED, Born-free variant of its membrane; with
    `closed_nacl` its NaCl unit declares the closed form instead."""
    case = copy_case(WITNESS, tmp / name)
    rec = (case / "constant" / "assets" / "NF270_dspmde.dat").read_text()
    rec = rec.replace("name           NF270_dspmde;", "name           NF270_dspmde_uncharged;")
    rec = re.sub(r"^\s*chargeDensity.*$", "", rec, flags=re.M)
    rec = re.sub(r"^\s*poreDielectric.*$", "", rec, flags=re.M)
    if "NF270_dspmde_uncharged" not in rec:
        fails.append("(c) could not write the uncharged variant (the record's name line moved)")
        return None, None
    (case / "constant" / "assets" / "NF270_dspmde_uncharged.dat").write_text(rec)
    fd = (case / "system" / "flowsheetDict").read_text()
    fd = fd.replace("membrane         NF270_dspmde;", "membrane         NF270_dspmde_uncharged;")
    if closed_nacl:
        if fd.count(PORE_LINE) != 2:
            fails.append("(c2) the witness's poreSolver line moved; the closed-form copy "
                         "cannot be built")
            return None, None
        fd = fd.replace(PORE_LINE, CLOSED_LINE, 1)      # the first unit is NF_NaCl_pore
    (case / "system" / "flowsheetDict").write_text(fd)
    return case, rec


def arm_analytic_engine(tmp):
    runs = {}
    for name, closed in (("uncharged", False), ("uncharged_closed", True)):
        case, rec = uncharged_copy(tmp, name, closed)
        if case is None:
            return None
        rc, out = run_case(case)
        if rc != 0:
            fails.append(f"(c) the {name} variant exited {rc}:\n{out[-2000:]}")
            return None
        if "Donnan OFF (X_d=0)" not in out or "Born OFF" not in out:
            fails.append("(c) the variant does not announce Donnan OFF and Born OFF -- it is "
                         "not the limit this arm computes")
            return None
        runs[name] = result_of(out)
    m = re.search(r"poreRadius\s+(\S+);", rec); r_p = float(m.group(1))
    m = re.search(r"porosityOverThickness\s+(\S+);", rec); akdx = float(m.group(1))
    ions = {}
    for ion in ("Na", "Cl"):
        r = species_value(WITNESS, ion, "radius")
        D = species_value(WITNESS, ion, "D0")
        phi, kd, kc = deen(r / r_p)
        ions[ion] = (phi, kd * D * akdx, kc)
    (Fp, Pp, Kp), (Fm, Pm, Km) = ions["Na"], ions["Cl"]
    Ps = 2 * Pp * Pm / (Pp + Pm)
    Kcs = (Kp * Pm + Km * Pp) / (Pp + Pm)
    S = math.sqrt(Fp * Fm)
    A = 0.51            # Davies A at 298.15 K (debyeHuckelFactor = 1 there)
    worst = {}
    for key, name in (("solved", "uncharged"), ("closedForm", "uncharged_closed")):
        cols = runs[name]["profiles"]["NF_NaCl_pore"]["columns"]
        Jw, Q, cb, G = cols["J_w"], cols["Q_b"], cols["c_b_NaCl"], cols["Gamma_NaCl"]
        w = 0.0
        for k in range(len(Q) - 1):
            cp_march = (Q[k + 1] * cb[k + 1] - Q[k] * cb[k]) / (Q[k + 1] - Q[k])
            cm = cb[k] * (1 + G[k])
            I = cb[k]                         # 1:1, kmol/m3 = mol/L
            sI = math.sqrt(I)
            gam = 10 ** (-A * (sI / (1 + sI) - 0.3 * I))
            Pe = Kcs * Jw[k] / Ps
            cp_exact = S * Kcs * gam * cm / (1 - (1 - S * Kcs) * math.exp(-Pe))
            w = max(w, abs(cp_march / cp_exact - 1))
        worst[key] = w
    if worst["solved"] > 1e-5:
        fails.append(f"(c) the solved pore departs from the ambipolar limit by "
                     f"{worst['solved']:.3e} at its worst station (> 1e-5) -- the law"
                     " hands the pore the wrong conductances, hindrances or partitions")
    if worst["closedForm"] < 0.05:
        fails.append(f"(c2) the declared closed form now departs from the analytic limit by"
                     f" only {worst['closedForm']:.3e} (< 5 %): the recorded finding"
                     " has closed -- take this pin back and re-read DSPM_DE.H")
    return worst


def arm_closed_form_charged(tmp):
    """(c3) the declared closed form on the CHARGED witness membrane, NaCl."""
    case = copy_case(WITNESS, tmp / "charged_closed")
    fd = (case / "system" / "flowsheetDict").read_text()
    if fd.count(PORE_LINE) != 2:
        fails.append("(c3) the witness's poreSolver line moved; the probe cannot be built")
        return None
    (case / "system" / "flowsheetDict").write_text(fd.replace(PORE_LINE, CLOSED_LINE, 1))
    rc, out = run_case(case)
    needle = "spiralWoundModule solute balance does not close"
    if rc == 0:
        fails.append("(c3) the declared closed form now RUNS the charged NaCl unit (exit 0): "
                     "the recorded finding has closed -- take this pin back, re-read "
                     "DSPM_DE.H, and consider restoring membrane20's NaCl closed-form unit")
        return None
    if needle not in out:
        fails.append(f"(c3) the charged closed-form NaCl probe exited {rc} without the "
                     f"solute-balance refusal it is pinned to:\n{out[-800:]}")
        return None
    m = re.search(r"worst solute rel = (\S+)", out)
    return m.group(1) if m else "?"


# ---- (d) the default: the solved pore ----------------------------------------------
DEFAULT_VOICE = (
    "[DSPM-DE] hindrance DechadilokDeen2006 (the default)",
    "[DSPM-DE] wallClosure porePermeate (the default)",
    "[DSPM-DE] pore SOLVED (poreSolver finiteDifference, the default): the extended "
    "Nernst-Planck equations on 101 nodes across the pore (stated default; declare `nodes`)",
)


def arm_default(tmp):
    checked = 0
    for src in DEFAULTS:
        case = copy_case(src, tmp / src.name)
        rc, out = run_case(case)
        if rc != 0:
            fails.append(f"(d) {src.name} exited {rc}:\n{out[-1500:]}")
            continue
        res = result_of(out)
        units = [u for u, d in res.get("kpis", {}).items()
                 if isinstance(d, dict) and "J_w_avg" in d]
        for needle in DEFAULT_VOICE:
            if out.count(needle) != len(units):
                fails.append(f"(d) {src.name}: '{needle[:60]}...' appears {out.count(needle)} "
                             f"times for {len(units)} DSPM-DE units -- the default is not said")
        sums = {m.group(1): m for m in SUMMARY.finditer(out)}
        if set(sums) != set(units):
            fails.append(f"(d) {src.name}: pore summaries for {sorted(sums)}, units {sorted(units)}")
        for u, m in sums.items():
            if float(m.group(5)) > 1e-12 or float(m.group(9)) > 1e-12 \
                    or float(m.group(10)) > 1e-12:
                fails.append(f"(d) {src.name}.{u}'s pore summary: ||F|| {m.group(5)}, current "
                             f"{m.group(9)}, electroneutrality {m.group(10)} -- not machine level")
        for u in units:
            if res["kpis"][u].get("pore_nodes") != 101:
                fails.append(f"(d) {src.name}.{u} does not publish pore_nodes 101")
        for line in (src / "expected").read_text().splitlines():
            if line.startswith("#") or not line.strip():
                continue
            kind, name, key, val = line.split()[:4]
            if kind == "kpi":
                got = res["kpis"].get(name, {}).get(key)
            elif kind == "stream":
                s = res["streams"].get(name, {})
                got = s.get(key)
                if got is None:
                    got = s.get("composition", {}).get(key)
            else:
                continue
            if got is None:
                continue
            want = float(val)
            checked += 1
            #  A row at round-off (a closure of 1e-16) is compared absolutely:
            #  its last digit is the compiler's, not the default path's.
            tol = 1e-14 if abs(want) < 1e-12 else 1e-10 * abs(want)
            if abs(got - want) > tol:
                fails.append(f"(d) {src.name} {kind} {name} {key}: {got!r} against the "
                             f"golden {want!r} -- the default path moved (until the C141 "
                             "re-record, by design)")
    if checked < 40:
        fails.append(f"(d) only {checked} golden rows were compared -- the reader lost "
                     "the golden's format")
    return checked


# ---- (e) refusals -----------------------------------------------------------------
def arm_refusals(tmp):
    fd0 = (WITNESS / "system" / "flowsheetDict").read_text()
    line = "poreSolver { method finiteDifference;  nodes 101; }"
    if fd0.count(line) != 2:
        fails.append("(e) the witness's poreSolver line moved; the refusal probes cannot "
                     "be built")
        return 0
    #  Each probe carries ONE defect, and its needle is the refusal's own
    #  sentence: a probe that also declared `nodes` beside the bad method word
    #  was refused for the grid instead, and PASSED with the method refusal
    #  removed (sabotage S7, 2026-10-22) -- a refusal for another reason is
    #  not the refusal under test.
    probes = [
        ("method banana", "poreSolver { method banana; }",
         ["unknown DSPM-DE pore solver method 'banana'", "closedForm",
          "finiteDifference"]),
        ("nodes 2", "poreSolver { method finiteDifference;  nodes 2; }",
         ["`nodes` must be a whole number", "at least 3"]),
        ("nodes with closedForm", "poreSolver { method closedForm;  nodes 101; }",
         ["the closed form has no grid"]),
        ("unknown key in poreSolver",
         "poreSolver { method finiteDifference;  nodes 101;  tolerance 1e-9; }",
         ["declares `tolerance`, which the pore solver does not read"]),
        ("unknown key in transportParameters",
         "poreSolver { method finiteDifference;  nodes 101; } gel { solute NaCl; }",
         ["declares `gel`, which this law does not read"]),
    ]
    fired = 0
    for tag, repl, needles in probes:
        case = copy_case(WITNESS, tmp / ("refuse_" + tag.replace(" ", "_")))
        (case / "system" / "flowsheetDict").write_text(fd0.replace(line, repl, 1))
        rc, out = run_case(case)
        if rc == 0:
            fails.append(f"(e) `{tag}` was ACCEPTED (exit 0)")
            continue
        miss = [n for n in needles if n not in out]
        if miss:
            fails.append(f"(e) `{tag}` exited {rc} without naming {miss}:\n{out[-800:]}")
            continue
        fired += 1
    return fired


def main():
    with tempfile.TemporaryDirectory(prefix="pore_") as d:
        tmp = Path(d)
        probe = arm_probe(tmp)
        wit = arm_witness()
        worst = arm_analytic_engine(tmp)
        c3 = arm_closed_form_charged(tmp)
        checked = arm_default(tmp)
        fired = arm_refusals(tmp)
    if fails:
        print("check_pore_solver: FAILED")
        for f in fails:
            print("  " + f)
        return 1
    ao, go, stiff, sweep = probe
    sums, r_obs = wit
    print(f"check_pore_solver: OK -- the probe (compiled here) converges to the ambipolar "
          f"analytic limit at observed order {min(ao):.2f}-{max(ao):.2f} and to 1e-8 at 1600 "
          f"intervals, and to 1e-10 on every grid at Peclet 440; a stiff pore (migration {stiff:.2e} x its net flux) shows Richardson order "
          f"{min(go):.2f}-{max(go):.2f} with ||F||, flux constancy, zero current and "
          f"electroneutrality at machine level; the declared block-tridiagonal structure is "
          f"audited at exactly 0 off the bands; {sweep[1]}/{sweep[0]} sweep problems from a crude "
          f"seed converge ({sweep[2]} by continuation in J_v); a warm start reproduces a cold "
          f"solve; 2 probe refusals fire.  The witness announces method, nodes, iterations, "
          f"residual and the structure on both solved units and nothing on the closed-form "
          f"one; END TO END the engine's solved pore matches the analytic limit within "
          f"{worst['solved']:.1e} at every station of an uncharged Born-free variant "
          f"(the declared closed form departs by {worst['closedForm']:.1%}, and on the charged "
          f"membrane refuses on its solute balance at {c3}, both pinned as findings); "
          f"membrane10/11 run the DEFAULT solved pore, say so on every unit and reproduce "
          f"{checked} golden rows to 1e-10; "
          f"{fired} refusals fire by name.  NOT CHECKED here: NanoFiltran (held by "
          f"check_nanofiltran_reference, with the declared wall closure and activities), "
          f"the batch diafilter under the solved pore, whether a case's grid is enough.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
