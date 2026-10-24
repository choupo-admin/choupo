#!/usr/bin/env python3
"""Gate: the DSPM-DE pore SOLVED by finite differences -- the analytic
Jacobian, the grid, machine level, an analytic limit, the station solved at
once, the default, the refusals, the voice.

    bin/curate/check_pore_solver.py

WHY THIS EXISTS (2026-10-22, DEV.md 4c C138; rebuilt 2026-10-24, C142).  The
DSPM-DE law SOLVES the extended Nernst-Planck equations across the pore --
every node at once, by Newton on the declared block-tridiagonal structure
(PoreNernstPlanck.H).  Since C142 (Vitor: "Eu quero que facas um solver
melhor!") the Jacobian of that Newton is ANALYTIC, the wall (the film's
interface balance) and the water flux J_w = A_w (dP - dpi) are rows of the
SAME Newton instead of a Newton and a secant around it, and the closed form
that did not solve the pore is RETIRED.  A solver is a claim about numbers,
so the numbers are MEASURED here, from inputs this gate can see.

WHAT THIS GATE CHECKS.

  (a) THE PROBE.  `_poreSolverProbe.cpp`, compiled HERE against
      PoreNernstPlanck.cpp, InterfaceBalance.cpp and the solver sources
      alone, hands the pore solver problems whose coefficients are written in
      the probe:
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
        GRADED    (C142) the same limit on the grid graded toward both faces
                  (tanh, beta 2): order in [1.8, 2.2] (a smooth map keeps
                  it) and exact to 1e-10 at Peclet 440.  The error beside the
                  uniform grid's at 100 intervals is PRINTED, not judged: it
                  is the measurement that kept the uniform grid the default
                  (docs/design/a-stiff-pore-solved-at-once.md section 11).
        GRID      a STIFF pore (X_d = -200 mol/m3 against a divalent co-ion
                  and a trace monovalent one): Richardson's observed order
                  from 25/50/100 and 50/100/200 intervals in [1.8, 2.2] on
                  every ion.
        MACHINE   on every stiff run: ||F|| <= 1e-12, the flux constancy
                  (relative to the two fitted terms each interval nets),
                  the zero current and the electroneutrality each <= 1e-13.
        AUDIT     the declared block-tridiagonal structure measured on the
                  first solve: EXACTLY 0 outside the bands.
        JACOBIAN  (C142) the ANALYTIC Jacobian against a Richardson-combined
                  central finite difference of the residual, entry by entry,
                  each relative to the largest |dF/dx| of its row, on 50
                  RANDOM states around the seeds of five problems on the
                  uniform and the graded grid -- the fixed-face pore, the
                  stiff pore, and three STATIONS with the wall and the water
                  flux folded in (porePermeate; a coupled film with face
                  activities at an imposed J_v; the solution-diffusion wall):
                  every departure <= 1e-6 (measured ~1e-11, and 4e-8 on the
                  stiff pore, where the oracle's own round-off is the floor),
                  and every finite-difference entry OFF the three bands
                  exactly 0.
        STATION   (C142) the three stations solved from a crude seed: ||F||
                  <= 1e-12; the answer RECOMPUTED HERE -- each wall
                  concentration from the film's interface balance at the
                  printed J_v, permeate and field (Geraldes & Afonso 2007;
                  the suction factor of 2006 transcribed independently, the
                  solution-diffusion closure for the third), the water flux
                  from J_v = A_w (dP - RT (sum c_m - sum c_p)), and
                  electroneutrality at the coupled walls -- each to 1e-10;
                  and the finite-difference (oracle) Newton reaching the same
                  answer to 1e-10.
        SWEEP     water flux 1e-7..1e-2 m/s x X_d -2000..+1000 mol/m3, 56
                  problems from a CRUDE seed: every one converges, with
                  ||F||, zero current and electroneutrality <= 1e-12 (the
                  Newton's own tolerance); how many needed the continuation
                  is printed.
        WARM      a warm start from a neighbouring flux agrees with a cold
                  solve to 1e-10.
        REFUSED   a pore with one sign of charge, and an absent ion handed
                  in as a term, each refuse by name.
  (b) THE WITNESS membrane20_dspmde_pore_finite_difference, run here: each of
      its FOUR units announces the method and its node count, the first
      station's Newton iterations and ||F||, and -- on an 11-node copy of
      that station -- the structure VERIFIED at 0 and the analytic Jacobian
      against finite differences (<= 1e-6); prints a pore summary whose
      residual, flux constancy, zero current and electroneutrality are each
      <= 1e-12; publishes `pore_nodes` 101.  THE PAIR it teaches: on NaCl
      the solution-diffusion wall loses more than 10 points of R_obs against
      the wall closed with the pore's own permeate; on MgSO4 the two agree to
      1e-5.
  (c) THE ENGINE AGAINST THE ANALYTIC LIMIT, END TO END.  A copy of the
      witness on an UNCHARGED, Born-free variant of its membrane (written
      here, beside the record): per station, the permeate the march used
      (dN_b / dQ_b between profile rows) against the ambipolar closed form
      above, built in Python from the station's own J_w and wall
      concentration (the profile's c_b and Gamma), the Davies gamma at the
      bulk ionic strength, the ion radii and D0 from the case's species
      records, and an independent transcription of the Dechadilok-Deen
      hindrance pair (K_d = H/Phi, their K_c): within 1e-5 at every
      station.  This is what proves the LAW hands the pore the right
      conductances, hindrances and partitions -- the probe cannot.
      (c2) THE RETIRED CLOSED FORM (C142): a copy declaring `method
      closedForm;` refuses by name, giving the reason (K_c > 1 at low
      Peclet number) and the remedy.  Until C142 this arm ran it and pinned
      its 76 % departure from the analytic limit, and (c3) its exhausted
      bulk on the charged membrane, as findings.
  (d) THE DEFAULT IS THE SOLVED PORE (C141, 2026-10-24).  membrane10 and
      membrane11 (DSPM-DE, no transportParameters) run here: every unit
      announces the hindrance DechadilokDeen2006 "(the default)", wallClosure
      porePermeate "(the default)" and the pore SOLVED "(poreSolver
      finiteDifference, the default)" on 101 nodes "(stated default; declare
      `nodes`)", prints a pore summary at machine level and publishes
      `pore_nodes` 101; and every row of their `expected` golden is
      reproduced to 1e-10 relative -- tighter than the golden's own 1e-4, at
      the twelve printed digits.  C142 changed the solver and not the
      discretisation, so every pinned row reproduces; the one published
      number that moved, `pore_stiffness_max`, is pinned by no golden (it
      was a maximum over every pore the nested solver evaluated on its way
      -- wall-Newton trials, finite-difference probes, the first water-flux
      pass at J = A_w dP -- and is now over the accepted station answers, as
      its header always said).
  (e) REFUSALS, on copies of the witness: an unknown method word (naming
      the accepted word and the retired one), `method closedForm` (RETIRED,
      with its reason), `nodes 2`, `grading 7`, an unknown key inside
      `poreSolver`, an unknown key inside `transportParameters` -- each
      exits non-zero naming its cause.

WHAT THIS GATE DOES NOT COVER, stated so its green line cannot imply it:
any comparison with NanoFiltran's published numbers (the code-to-code
comparison is check_nanofiltran_reference's); the batch diafilter under the
solved pore (it runs, but no witness and no pore summary there); activity
inside the pore between the faces (ideal); whether 101 nodes are ENOUGH for
a given case (the grid arms measure the order, a case must still declare its
grid -- an interior ion-exchange front, as in NanoFiltran's example at
J_v = 5e-5 m/s, needs some 400 nodes for 1e-4); wall-clock speed (measured
in the record, section 11, not gated).

SABOTAGE-VERIFIED.  On the C138 code (2026-10-22), by hand, each restored and
rebuilt (`make all`) before the next; OBSERVED output, abridged to the
failing arms.  S1-S3 and S8 attack the pore arithmetic the C142 code keeps;
S4 and S6-S7 attacked paths C142 changed (the audit now on an 11-node copy,
the closed form retired) and are superseded by C1-C4 below.
  S1 -- the fitted flux replaced by a central difference (B(x) = 1 - x/2):
          (a) ANALYTIC: at N=1600 the FD answer is -2.756e-08 from the
              analytic limit (> 1e-8)
          (a) HIGH PECLET: at Pe 439 and N=25 the FD answer is -2.628e-03
              from the analytic limit (> 1e-10)
        The low-Peclet orders stayed at 2 -- a central difference is second
        order too where it is stable -- which is why the Peclet-440 arm exists.
  S2 -- X_d dropped from the electroneutrality ROW (kept in the measurement):
          (a) MACHINE: electroneutrality 9.956686e-01 at N=25 ... (every grid)
  S3 -- the zero-current row weighted 1 % off on the first ion:
          (a) ANALYTIC: cation and anion permeates differ at N=25
  S5 -- DSPM-DE hands the pore an unhindered conductance (K_d dropped from
        P = K_d D A_k/dx).  The probe cannot see it -- it hands the pore its
        own coefficients -- and ONLY the end-to-end arm does:
          (c) the solved pore departs from the ambipolar limit by 1.394e+00
  S8 -- the continuation disabled:
          (a) GRID: the stiff pore at N=25 did not converge ... (every grid)
On the C142 code (2026-10-24), by hand, each restored before the next:
  C1 -- SABOTAGE_C1
  C2 -- SABOTAGE_C2
  C3 -- SABOTAGE_C3
  C4 -- SABOTAGE_C4
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
           "src/unitOperations/membrane/massTransfer/InterfaceBalance.cpp",
           "src/solver/NewtonND.cpp", "src/solver/LU.cpp",
           "src/solver/BlockTridiagonal.cpp"]
MEMB = ROOT / "tutorials" / "steady" / "membranes"
WITNESS = MEMB / "membrane20_dspmde_pore_finite_difference"
DEFAULTS = [MEMB / "membrane10_dspmde_divalent",
            MEMB / "membrane11_dspmde_born_toggle"]
WITNESS_UNITS = ("NF_NaCl_pore", "NF_NaCl_BsWall", "NF_MgSO4_pore", "NF_MgSO4_BsWall")

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


# ---- the film's interface balance, transcribed independently (STATION arm) ----
def suction(word, phi):
    if word == "none":
        return 1.0
    if phi == 0.0:
        return 1.0
    if word == "filmTheory" or phi < 0.0:
        return phi + phi / math.expm1(phi)
    return phi + (1.0 + 0.26 * phi ** 1.4) ** -1.7          # Geraldes & Afonso 2006


#  The probe's three stations (kept in step with _poreSolverProbe.cpp's
#  `station()`): ion order Na+, SO4 2-, Cl-.
STATION_Z = (1, -2, -1)
STATION_CB = (20.01, 10.0, 0.01)
STATION_K = (5.0e-5, 4.0e-5, 6.0e-5)
STATION_D = (1.33e-9, 1.06e-9, 2.03e-9)
STATION_B = (1.0e-7, 1.0e-7, 1.0e-7)
STATION_AW, STATION_DP, STATION_RT = 1.0e-11, 9.0e5, 8.314462618 * 298.15
STATIONS = {   # name: (suction word, coupled, solutionDiffusion wall, closure)
    "porePermeate":      ("filmTheory", False, False, True),
    "coupledActivity":   ("GeraldesAfonso2006", True, False, False),
    "solutionDiffusion": ("GeraldesAfonso2006", True, True, True),
}


def check_station(name, line):
    word, coupled, sd, closure = STATIONS[name]
    f = line.split()
    kv = dict(zip(f[2::2], f[3::2]))
    J, xi = float(kv["Jv"]), float(kv["xiPrime"])
    pairs = re.findall(r"cp (\S+) cm (\S+)", line)
    cp = [float(a) for a, _ in pairs]
    cm = [float(b) for _, b in pairs]
    worst = 0.0
    for i in range(3):
        k = STATION_K[i]
        ks = k * suction(word, J / k)
        mig = STATION_Z[i] * STATION_D[i] * xi if coupled else 0.0
        if sd:
            B = STATION_B[i]
            want = ks * STATION_CB[i] / ((ks - J) + mig + J * B / (J + B))
        else:
            want = (ks * STATION_CB[i] - J * cp[i]) / ((ks - J) + mig)
        worst = max(worst, abs(cm[i] / want - 1.0))
    if worst > 1e-10:
        fails.append(f"(a) STATION {name}: a wall concentration departs from the interface"
                     f" balance recomputed here by {worst:.3e} (> 1e-10)")
    if coupled:
        q = sum(z * c for z, c in zip(STATION_Z, cm))
        qa = sum(abs(z) * c for z, c in zip(STATION_Z, cm))
        if abs(q) / qa > 1e-10:
            fails.append(f"(a) STATION {name}: the coupled wall is not electroneutral"
                         f" ({abs(q) / qa:.3e})")
    if closure:
        Jw = STATION_AW * (STATION_DP - STATION_RT * (sum(cm) - sum(cp)))
        if abs(J / Jw - 1.0) > 1e-10:
            fails.append(f"(a) STATION {name}: J_v {J!r} is not A_w (dP - dpi) = {Jw!r}"
                         " recomputed here")
    return worst


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
    analytic_orders, graded_orders, graded_ratio = [], [], []
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
        grows = re.findall(rf"^graded {Jv:.3e} N (\d+) conv (\d) (\S+)$", out, re.M)
        if len(grows) != 5:
            fails.append(f"(a) GRADED: {len(grows)} graded rows at J_v {Jv:.1e}, not 5")
            continue
        gerrs = []
        for N, conv, cp in grows:
            if conv != "1":
                fails.append(f"(a) GRADED: N={N} at J_v {Jv:.1e} did not converge")
            gerrs.append((int(N), (float(cp) - exact) / exact))
        if Jv > 1e-2:
            #  A cell Peclet number of 17.6 at N = 25: a central difference
            #  is not free of oscillation there, the fitted flux is exact
            #  for a uniform drift -- measured at round-off at EVERY grid,
            #  uniform or graded.
            for n_, e_ in errs + gerrs:
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
        for (n1, e1), (n2, e2) in zip(gerrs[:-1], gerrs[1:]):
            p_ = order(e1, e2)
            graded_orders.append(p_)
            if not 1.8 <= p_ <= 2.2:
                fails.append(f"(a) GRADED: observed order {p_:.3f} between N={n1} and {n2}"
                             f" at J_v {Jv:.1e} -- a smooth map must keep 2")
        u100 = dict(errs)[100]
        g100 = dict(gerrs)[100]
        graded_ratio.append(abs(g100 / u100))

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

    # JACOBIAN
    jac = re.findall(r"^jacobian (\w+) beta (\S+) states 5 worst (\S+) offBand (\S+)$",
                     out, re.M)
    m = re.search(r"^jacobianStates (\d+)$", out, re.M)
    jac_worst = 0.0
    if len(jac) != 10 or not m or m.group(1) != "50":
        fails.append(f"(a) JACOBIAN: {len(jac)} problem lines and "
                     f"{m.group(1) if m else 'no'} states, not 10 and 50:\n{out[-1500:]}")
    for tag, beta, worst, off in jac:
        jac_worst = max(jac_worst, float(worst))
        if float(worst) > 1e-6:
            fails.append(f"(a) JACOBIAN: on {tag} (beta {beta}) the analytic Jacobian departs"
                         f" from the finite-difference one by {float(worst):.3e} of its row"
                         " (> 1e-6) -- a derivative is wrong")
        if float(off) != 0.0:
            fails.append(f"(a) JACOBIAN: on {tag} (beta {beta}) a finite-difference entry"
                         f" OFF the three bands is {off} -- the residual couples"
                         " non-adjacent blocks")

    # STATION
    st = {mm.group(1): mm.group(0) for mm in
          re.finditer(r"^station (\w+) conv .*$", out, re.M)}
    if set(st) != set(STATIONS):
        fails.append(f"(a) STATION: lines for {sorted(st)}, expected {sorted(STATIONS)}")
    st_worst = 0.0
    for name, line in st.items():
        f = line.split()
        kv = dict(zip(f[2::2], f[3::2]))
        if kv.get("conv") != "1" or float(kv.get("res", "1")) > 1e-12:
            fails.append(f"(a) STATION {name}: conv {kv.get('conv')}, ||F|| {kv.get('res')}")
        if kv.get("fdConv") != "1" or float(kv.get("fdMaxRelDiff", "1")) > 1e-10:
            fails.append(f"(a) STATION {name}: the finite-difference Newton (the oracle)"
                         f" gives conv {kv.get('fdConv')}, differing by"
                         f" {kv.get('fdMaxRelDiff')} (> 1e-10)")
        for k_ in ("current", "en", "wallCharge"):
            if float(kv.get(k_, "1")) > 1e-12:
                fails.append(f"(a) STATION {name}: {k_} {kv.get(k_)} (> 1e-12)")
        st_worst = max(st_worst, check_station(name, line))

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
        for nm, v in (("||F||", m.group(4)), ("zero current", m.group(6)),
                      ("electroneutrality", m.group(7))):
            if float(v) > 1e-12:
                fails.append(f"(a) SWEEP: worst {nm} {v} (> 1e-12)")

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
    return (analytic_orders, graded_orders, graded_ratio, grid_orders, stiffness,
            sweep, jac_worst, st_worst)


# ---- (b) the witness ---------------------------------------------------------------
SUMMARY = re.compile(r"\[DSPM-DE\] pore summary \((\w+)\): (\d+) pore solves on (\d+) nodes"
                     r" \(pore, wall and water flux in one Newton per station\), at most"
                     r" (\d+) Newton iterations \((\d+) in all\), \|\|F\|\| <= (\S+); flux"
                     r" constancy <= (\S+) of the terms it nets \((\S+) of the net flux, at a"
                     r" stiffness of (\S+)\), zero current <= (\S+), electroneutrality <="
                     r" (\S+); (\d+) solves by continuation in J_v")
FIRST = re.compile(r"\[DSPM-DE\] first station solve: (\d+) Newton iterations(?: \(\d+ solves"
                   r" by continuation\))?, \|\|F\|\| = (\S+); on an 11-node copy of this"
                   r" station the block-tridiagonal structure VERIFIED \(max \|J\| off the"
                   r" bands = (\S+)\) and the analytic Jacobian against finite differences"
                   r" (\S+) \(of each row's largest entry\)")


def summary_at_machine_level(m):
    return all(float(m.group(g)) <= 1e-12 for g in (6, 7, 10, 11))


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
    firsts = FIRST.findall(out)
    if banners != ["101"] * 4:
        fails.append(f"(b) the method banner appears {len(banners)} times with nodes "
                     f"{banners} (expected four times, 101)")
    if len(firsts) != 4:
        fails.append(f"(b) the first-solve line (iterations, ||F||, structure and analytic "
                     f"Jacobian VERIFIED) appears {len(firsts)} times, not 4")
    for it, r_, off, mis in firsts:
        if float(r_) > 1e-12 or float(off) != 0.0 or float(mis) > 1e-6:
            fails.append(f"(b) first solve: ||F|| {r_}, off-band {off}, analytic Jacobian "
                         f"against FD {mis}")
    sums = {m.group(1): m for m in SUMMARY.finditer(out)}
    if set(sums) != set(WITNESS_UNITS):
        fails.append(f"(b) pore summaries for {sorted(sums)}, expected exactly "
                     f"{sorted(WITNESS_UNITS)}")
    for u, m in sums.items():
        if not summary_at_machine_level(m):
            fails.append(f"(b) {u}'s pore summary: ||F|| {m.group(6)}, flux constancy "
                         f"{m.group(7)}, current {m.group(10)}, electroneutrality "
                         f"{m.group(11)} -- not machine level")
    k = res.get("kpis", {})
    for u in WITNESS_UNITS:
        if k.get(u, {}).get("pore_nodes") != 101:
            fails.append(f"(b) {u} does not publish pore_nodes 101")
    r_obs = {u: k.get(u, {}).get("R_obs_" + u.split("_")[1]) for u in WITNESS_UNITS}
    if None in r_obs.values():
        fails.append(f"(b) an R_obs is missing: {r_obs}")
        return sums, r_obs
    gapNaCl = r_obs["NF_NaCl_pore"] - r_obs["NF_NaCl_BsWall"]
    gapMg = abs(r_obs["NF_MgSO4_pore"] - r_obs["NF_MgSO4_BsWall"])
    if not gapNaCl > 0.10:
        fails.append(f"(b) THE PAIR: on NaCl the B_s wall gives R_obs {r_obs['NF_NaCl_BsWall']}"
                     f" against {r_obs['NF_NaCl_pore']} with the pore's own permeate -- the"
                     " case header's lesson (more than 10 points lost) no longer holds")
    if not gapMg < 1e-5:
        fails.append(f"(b) THE PAIR: on MgSO4 the two closures part by {gapMg:.3e} (> 1e-5)"
                     " -- the case header says they agree")
    return sums, r_obs


# ---- (c) the engine against the analytic limit -------------------------------------
def species_value(case, ion, key):
    txt = (case / "constant" / "species" / f"{ion}.dat").read_text()
    return float(re.search(rf"^{key}\s*\{{\s*value\s+(\S+);", txt, re.M).group(1))


def deen(lam):
    """Dechadilok & Deen 2006 (Ind. Eng. Chem. Res. 45, 6953), transcribed
    independently: their polynomial is H = Phi K_d, so K_d = H/Phi
    (lambda <= 0.95; the lubrication form above), and their rational K_c."""
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


PORE_LINE = "poreSolver { method finiteDifference;  nodes 101;  wallClosure porePermeate; }"


def uncharged_copy(tmp, name):
    """The witness on an UNCHARGED, Born-free variant of its membrane."""
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
    (case / "system" / "flowsheetDict").write_text(fd)
    return case, rec


def arm_analytic_engine(tmp):
    case, rec = uncharged_copy(tmp, "uncharged")
    if case is None:
        return None
    rc, out = run_case(case)
    if rc != 0:
        fails.append(f"(c) the uncharged variant exited {rc}:\n{out[-2000:]}")
        return None
    if "Donnan OFF (X_d=0)" not in out or "Born OFF" not in out:
        fails.append("(c) the variant does not announce Donnan OFF and Born OFF -- it is "
                     "not the limit this arm computes")
        return None
    run = result_of(out)
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
    cols = run["profiles"]["NF_NaCl_pore"]["columns"]
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
    if w > 1e-5:
        fails.append(f"(c) the solved pore departs from the ambipolar limit by "
                     f"{w:.3e} at its worst station (> 1e-5) -- the law"
                     " hands the pore the wrong conductances, hindrances or partitions")
    return w


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
            if not summary_at_machine_level(m):
                fails.append(f"(d) {src.name}.{u}'s pore summary: ||F|| {m.group(6)}, current "
                             f"{m.group(10)}, electroneutrality {m.group(11)} -- not machine level")
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
                             f"golden {want!r} -- the default path moved")
    if checked < 40:
        fails.append(f"(d) only {checked} golden rows were compared -- the reader lost "
                     "the golden's format")
    return checked


# ---- (e) refusals -----------------------------------------------------------------
def arm_refusals(tmp):
    fd0 = (WITNESS / "system" / "flowsheetDict").read_text()
    line = PORE_LINE
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
         ["unknown DSPM-DE pore solver method 'banana'", "finiteDifference",
          "`closedForm` was retired"]),
        ("method closedForm", "poreSolver { method closedForm; }",
         ["`method closedForm;`, which is RETIRED", "K_c > 1",
          "`method finiteDifference;`"]),
        ("nodes 2", "poreSolver { method finiteDifference;  nodes 2; }",
         ["`nodes` must be a whole number", "at least 3"]),
        ("grading 7", "poreSolver { method finiteDifference;  grading 7; }",
         ["`grading` is the beta of the tanh map", "between 0 (uniform) and 6"]),
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
        checked = arm_default(tmp)
        fired = arm_refusals(tmp)
    if fails:
        print("check_pore_solver: FAILED")
        for f in fails:
            print("  " + f)
        return 1
    ao, go, gr, grid_o, stiff, sweep, jw, sw = probe
    sums, r_obs = wit
    print(f"check_pore_solver: OK -- the probe (compiled here) converges to the ambipolar "
          f"analytic limit at observed order {min(ao):.2f}-{max(ao):.2f} on the uniform grid "
          f"and {min(go):.2f}-{max(go):.2f} on the face-graded one (whose error is "
          f"{min(gr):.1f}-{max(gr):.1f}x the uniform grid's at 100 intervals -- why uniform "
          f"stays the default), to 1e-8 at 1600 intervals and to 1e-10 on every grid at "
          f"Peclet 440; a stiff pore (migration {stiff:.2e} x its net flux) shows Richardson "
          f"order {min(grid_o):.2f}-{max(grid_o):.2f} with ||F||, flux constancy, zero current "
          f"and electroneutrality at machine level; the ANALYTIC Jacobian matches finite "
          f"differences within {jw:.1e} of its row on 50 random states of five problems, with "
          f"exactly 0 off the bands; three stations with the wall and the water flux folded in "
          f"reproduce the interface balance, the closure and the wall electroneutrality "
          f"recomputed here within {sw:.1e} and the finite-difference Newton's answer; "
          f"{sweep[1]}/{sweep[0]} sweep problems from a crude seed converge ({sweep[2]} by "
          f"continuation); a warm start reproduces a cold solve; 2 probe refusals fire.  The "
          f"witness's four units announce method, nodes, iterations, residual, the structure "
          f"and the analytic Jacobian, and teach the pair (NaCl R_obs "
          f"{r_obs['NF_NaCl_pore']:.4f} with the pore's own permeate, "
          f"{r_obs['NF_NaCl_BsWall']:.4f} with the B_s wall; MgSO4 equal to 1e-5); END TO END "
          f"the engine matches the analytic limit within {worst:.1e} at every station of an "
          f"uncharged Born-free variant; membrane10/11 run the DEFAULT solved pore, say so on "
          f"every unit and reproduce {checked} golden rows to 1e-10; {fired} refusals fire by "
          f"name, the retired closed form among them.  NOT CHECKED here: NanoFiltran (held by "
          f"check_nanofiltran_reference), the batch diafilter under the solved pore, whether "
          f"a case's grid is enough, wall-clock speed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
