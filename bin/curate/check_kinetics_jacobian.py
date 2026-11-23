#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the batch reactor's analytic kinetics Jacobian is the derivative, and it pays.

    bin/curate/check_kinetics_jacobian.py

THE REAL DEFECT THIS WOULD HAVE CAUGHT.  An analytic Jacobian with a term missing --
the third-body efficiency term k0 eff_k of a `+M` reaction, a fall-off blend
differentiated as if [M] were constant, a reverse leg left out -- does not crash a
Rosenbrock method.  Rosenbrock23 and Rodas4 are NOT W-methods: their order conditions
hold only with the true Jacobian in W = I - h d J, but the embedded error estimate still
accepts or rejects each step, so a wrong J only makes the run silently SLOWER or LESS
ACCURATE.  Measured by sabotage on ignition01_h2o2_jac (below): with the third-body term
dropped, Rodas4 took 3317 accepted steps instead of 602 and every KPI of the golden still
passed (T_final 1.1e-10 relative) -- no golden, no closure and no step counter in any
existing gate would have said a word.  The only place the omission is visible is a
comparison of the claimed Jacobian with the derivative it claims to be; the engine makes
that comparison on a doubling schedule (ODEAnalyticJacobian) and this gate holds it.

WHAT THIS GATE CHECKS.

  (a) THE CLAIM, ALONG THE TRAJECTORY.  ignition01_h2o2_jac (Rosenbrock23, as shipped) and
      the same case on Rodas4 print the engine's audits: the analytic Jacobian against the
      dense forward difference at analytic Jacobians 1, 2, 4, 8, ... .  At least five audits,
      covering the PRE-IGNITION state (T < 1150 K), the RAMP (1150-3000 K) and the BURNED
      gas (T > 3000 K), each with the worst column difference at most GATE_TOL = 1e-5 of the
      column's scale (the engine refuses above 1e-4; measured 7e-8 to 6.5e-7: the forward
      difference of the analytic Jacobian's own T column against the audit's central one).
  (b) THE SAME ANSWER, CHEAPER.  ignition01_h2o2 (finite difference) and
      ignition01_h2o2_jac (analytic), both at solver verbosity 4 (the right-hand-side
      count): every KPI of ignition01_h2o2's golden is met by BOTH runs at the golden's
      tolerance, the two runs agree with each other to 1e-8 relative, and the analytic run
      spends at most half the right-hand sides of the finite-difference run (measured
      8252 against 27668: n + 4 = 14 per step against 4, plus 204 on the audits).  The
      steps, rejected steps,
      right-hand sides and Jacobians of both are printed.
  (c) EVERY PATH, ON A CASE THAT ALREADY SHIPS.  Six batch tutorials, each run twice on
      Rosenbrock23 in a private copy -- finite difference, then `jacobian analytic;` --
      with every audit within GATE_TOL and the KPIs of the two runs equal to 1e-6
      relative (abs 1e-12 near zero): batch02_adiabatic (liquidDH energy row),
      batch04_reversible_wgs (isothermal, reversible Arrhenius: the T column exactly zero),
      batch07_lhhw_methylAcetate (a Factory LHHW law, by its own difference),
      nox01_zeldovich_postflame (isothermal fall-off and third body), and through the
      ADAPTIVE sweep (the analytic Jacobian handed to it block by block)
      batch06_adaptive_runaway (adiabatic liquidDH) and batch31_fast_equilibrium_reduced
      (a `type expression` law).
  (e) THE CLOSED FORMS (2026-11-21).  The T column is no longer a difference: dk/dT of
      every Arrhenius leg, Troe exactly in [M] and T (F_cent(T) included), PLOG's dk/dT and
      dk/dP, d ln Kc/dT from the species' h(T), the heat capacities' slope; and
      `energy gasConstantP` is derived (V = nRT/P: a rank-one term).  Five probes whose
      every law has a derivative -- ignition01_h2o2_jac on Rosenbrock23 and on Rodas4; the
      same with GRI-Mech 3.0's H2O2(+M) Troe constants (F_cent moves with T); the same with
      R2 rewritten as a reversible PLOG bracketing the run's pressure (5 -> ~14 bar at
      fixed V); ignition03_h2air_constp -- each with every audit after the radical pool has
      formed (T > T0 + 1 K) at most EXACT_TOL = 1e-8 (measured 2e-10 to 1e-9; the forward-
      difference T column it replaced read 7e-8 to 6.5e-7).  Earlier audits hold a trace
      species within the audit's own step of zero, whose column the AUDIT differences
      forward (5e-9 to 5e-8): judged on GATE_TOL there.
      THE CHEMKIN FORMS (2026-11-21, sec:elementary-rate), four more probes of the same kind
      on ignition01_h2o2_jac: R9's Troe replaced by SRI with five numbers (F = d W^X T^e,
      Reaction::falloffRateDerivs); R9 on a single collider (`thirdBody { N2 1; }
      defaultEfficiency 0;`, CHEMKIN's `(+N2)`); R8 with N2 on BOTH sides (order 1, orderRev 1,
      nu 0, reversible); R10 irreversible with explicit orders HO2 1.5 and a non-reactant N2
      0.5 (what FORD writes).  Measured: late audits <= 6e-10 on all four.
      SABOTAGE-VERIFIED 2026-11-21 (by hand in a copy of the tree, rebuilt, restored):
      SRI's d ln F/dp set to 0 (Reaction::falloffRateDerivs) -- the SRI probe refused at
      analytic Jacobian #1, d(n_H)/d(T) -1.99934e-05 against -2.01633e-05 (0.00673);
      a zero-efficiency species treated as a collider in the derivative only
      (BatchReactor::rateGradient_) -- the single-collider probe refused at #1,
      d(n_HO2)/d(n_H2) -100.307 against 0.00251685 (0.114); the reverse factor of the
      derivative read on nu instead of orderRev -- the both-sides probe refused at #2048,
      d(n_H)/d(T) -0.0354183 against -0.0430142 (0.177).  FORD adds no derivative code.
  (f) THE DEFAULT.  With no `jacobian` key: ignition01_h2o2 and ignition03_h2air_constp run
      on the audited analytic Jacobian (the first audit line says "the default"), and
      ignition03's KPIs equal those of `jacobian finiteDifference;` to 1e-6; batch07 (an
      LHHW law, no derivative) stays on the finite difference (no audit), and with
      `jacobian analytic;` names the reaction it differences.
  (g) THE SPARSE FACTORISATION OF W (2026-11-21, solver/SparseLU, sec:sparse-lu).
      (g1) test/sparse_lu.cpp, built here: SparseLU against the dense LU (partial
      pivoting) on eight families of random sparse matrices with dense rows and columns,
      n = 5 to 1000, two refactorisations of each pattern: x equal to 1e-12 of |x|
      (measured 7e-15), residual at round-off, and a zero pivot that only a row exchange
      cures REFUSED.  (g2) the six combustion cases on Rosenbrock (ignition04's 22
      integrations included) with `linearSolver sparse` against `dense`: KPIs equal to
      SPARSE_TOL = 1e-10 (measured 1.4e-11: the round-off of a different elimination
      order, amplified through an ignition) and NOT ONE factorisation refactored dense
      (a factor is accepted on its backward error on W_s, <= 1e-12).
      (g3) an adaptive sweep of one vessel factors sparse.  (g4) `linearSolver banded;`
      and `linearSolver sparse;` beside `jacobian finiteDifference;` refused by name.
      THE REAL DEFECT (g2) CAUGHT, in the first build: the threshold pivot test ran on the
      UNSCALED rows, the temperature row's entries (K/s per kmol) dwarfed every pivot of
      its column, and ignition03 refactored 2155 of 2155 matrices dense -- every KPI
      equal, the run correct, the sparse path never taken.  Row equilibration fixed it
      (and the threshold test was then replaced by the backward-error test, which a
      synthetic 50-species mechanism showed to be the right instrument).
  (d) REFUSALS BY NAME.  `jacobian exact;` (an unknown word), `integrator RK4;` beside
      `jacobian analytic;` (a contradiction), and `jacobian analytic;` on a fixed-step run
      that integrates with the default RK4 (a key nothing would read) each exit non-zero
      with the word in the message.

SABOTAGE-VERIFIED 2026-11-19 (by hand, then restored and rebuilt; not runnable per
commit without a rebuild).  In BatchReactor::rateGradient_ the third-body arm's
`dkdM = k0;` replaced by `dkdM = 0.0;` -- the term dropped from the Jacobian ONLY, the
right-hand side untouched.  OBSERVED, verbatim:

    ERROR: batchReactor 'bomb': the ANALYTIC Jacobian is FALSE at analytic Jacobian #32
    (t = 0.000000 s into the interval): d(n_H)/d(n_N2) is -88.0541 against the
    finite-difference -88.1057 (relative difference 0.000117 on the column's scale,
    tolerance 0.0001).  A term of the model is missing from, or wrong in, its
    derivative.  ...  Refusing; ...

The suite under the same sabotage: this gate FAILS -- (a) both integrators refused (at
analytic Jacobian #32 on Rosenbrock23, #8 on Rodas4: d(n_H)/d(n_N2) 1.05e-4 of the
column's scale), (b) the analytic run refused.  With the refusal disabled (tolerance 1e30)
the audits of the sabotaged run read, from the first Jacobian to the ramp, 6.4e-5,
6.4e-5, 6.7e-5, 7.2e-5, 9.1e-5, 1.2e-4, 1.6e-4, 4.7e-4, 5.8e-3, 0.11, 0.54
(Rosenbrock23, 1912 + 23 steps against 1939 + 23) and up to 0.92 (Rodas4: 3317 + 30 steps
against 602 + 15 with the correct Jacobian), while every KPI of ignition01_h2o2's golden
still passed (T_final 3.4e-9 and 1.1e-10 relative): the omission is small where the
radicals are few and O(1) at the ramp.  Arm (a)'s GATE_TOL sits 6x under the first of
those numbers; the correct Jacobian's worst over every audit of this gate is 1e-6 (the
forward difference the reactor takes for an LHHW law and for the T column, by design).

SABOTAGE-VERIFIED 2026-11-21 (each by hand, rebuilt, gate run, restored, rebuilt):
  - d ln k/dT without its b/T term (Reaction::dlnModifiedArrheniusdT): (a), (b), (e) and
    (f) fail -- "d(n_H)/d(T) is -2.27795e-05 against the finite-difference -2.08717e-05
    (relative difference 0.0755 ...)" at analytic Jacobian #1;
  - Troe's dF_cent/dT dropped (Reaction::falloffRateDerivs): ONLY the F_cent(T) probe of
    (e) fails -- d(n_HO2)/d(T) -3.96739e-06 against -4.8755e-06 (0.0359);
  - PLOG's dk/dP set to 0 (ElementaryRate::kEffDerivs): ONLY the PLOG probe of (e) fails
    -- d(n_H)/d(n_N2) -97.371 against -96.7629 (0.00138) at analytic Jacobian #4;
  - the gasConstantP rank-one term s_j set to 0 (BatchReactor::odeJacobianSparse): the
    gasConstantP probe of (e) and (f) fail -- d(n_H)/d(n_N2) -117.044 against 221.594.

SABOTAGE-VERIFIED 2026-11-21, arm (g) (by hand, rebuilt, restored, rebuilt):
  - FIRST BUILD (a KLU-style threshold pivot test, tau = 1e-3), SparseLU without row
    equilibration: (g2) failed on the five adiabatic cases -- "1962 of 1962
    factorisations refused a pivot and were refactored dense" (2155 of 2155 on
    ignition03); (g1) and every KPI passed: only the count saw it.  The threshold test
    was then replaced by the backward-error test (it refused 9549 of 12749 factors of a
    synthetic 50-species mechanism whose factors all solve to 1.4e-19), and against
    THAT test the same sabotage is harmless and is NOT caught: 0 dense refactorisations,
    every KPI equal (measured).  Equilibration now only scales the breakdown guard;
  - the last update of every L column dropped in SparseLU::factor (a wrong factor):
    (g1) fails on all eight families (|xs-xd|/|x| 4e-3 to 0.15); in the integrator the
    backward-error probe rejects the wrong factor and refactors dense (1938 of 1962 on
    ignition01_h2o2, 2063 of 2064 on ignition02), and (g2) fails on that count and on
    the KPIs the 24 accepted wrong factors move (n_O_final 8.4e-9).  Before the probe
    existed the same sabotage moved the KPIs by 9e-7, INSIDE every golden's 1e-4: a
    Rosenbrock step with a wrong factor is still accepted by its error estimate.

NOT CHECKED: that the rate laws themselves are right (ignition02_h2air_slack's Slack pin,
check_elementary_rates); a power-law order below one near zero (within 300 audit steps of zero): that ONE reaction's share of the column is taken out of the analytic Jacobian and of the reference, the rest audited (C468; a share is exact, but an expression/LHHW law declares no orders and is not covered; order 1.5 at zero passes at 4.5e-5 of the engine's 1e-4, the one-sided difference's truncation); the heat-capacity slope dC_p/dT
(a central difference of the record's law: the record offers no derivative); wall time (machine-
dependent: the right-hand-side count is the deterministic proxy); a sweep that mixes a
unit with an analytic Jacobian and one without (it falls back to the difference by
construction; no witness has two ODE units).
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gatekit  # noqa: E402

# Every directory walk in this gate is over its own scratch probe copies
# (gatekit.probe_copy); it reads no tree root a case plan could miss.
SCAN_ROOTS = ()

FD = "tutorials/batch/combustion/ignition01_h2o2"
JAC = "tutorials/batch/combustion/ignition01_h2o2_jac"
STRIP = ("expected", "latest", "solution.log", "trajectory.csv")
GATE_TOL = 1.0e-5
CONSTP = "tutorials/batch/combustion/ignition03_h2air_constp"
SPARSE_TOL = 1.0e-10
SPARSE_CASES = [
    "tutorials/batch/combustion/ignition01_h2o2",
    "tutorials/batch/combustion/ignition01_h2o2_rop",
    "tutorials/batch/combustion/ignition02_h2air_slack",
    "tutorials/batch/combustion/ignition03_h2air_constp",
    "tutorials/batch/combustion/ignition04_h2air_sensitivity",
    "tutorials/batch/combustion/nox01_zeldovich_postflame",
]
EXACT_TOL = 1.0e-8

#  Troe with a T-dependent F_cent (GRI-Mech 3.0's H2O2 (+M) parameters -- a probe of
#  the derivative only; the case's own Troe lines have F_cent = 0.5 flat in T).
TROE_OLD = "troe ( 0.5 1e-30 1e+30 1e+100 );"
TROE_NEW = "troe ( 0.7346 94 1756 5182 );"
#  R2 rewritten as a reversible PLOG whose table brackets the run's pressure (5 bar at
#  the start, about 14 in the burned gas at fixed V): ln k interpolated in ln P, so
#  dk/dP != 0, and the T column carries (dr/dP) P/T.  A numerical probe, not chemistry.
PLOG_OLD = """        type modifiedArrhenius;
        A 5.0800e+04;  b 2.67;  Ea 6.292;
        units { A "cm3/mol/s"; Ea "kcal/mol"; }"""
PLOG_NEW = """        type plog;
        plog
        (
            { P 2 bar;  A 2.5000e+04;  b 2.67;  Ea 6.292; }
            { P 10 bar; A 5.0800e+04;  b 2.67;  Ea 6.292; }
            { P 50 bar; A 1.0000e+05;  b 2.50;  Ea 6.000; }
        );
        units { A "cm3/mol/s"; Ea "kcal/mol"; }"""


#  The CHEMKIN forms of 2026-11-21 (Theory Guide sec:elementary-rate), each a numerical probe of
#  the derivative on R8 / R9 / R10 of the shipped case, not chemistry:
#  SRI with five numbers in place of R9's Troe (d and e exercised: F = d W^X T^e);
SRI_NEW = "sri ( 0.45 797 979 0.9 0.02 );"
#  R9 on a SINGLE collider, N2 (CHEMKIN `(+N2)`: efficiency 1 for N2, 0 for every other species);
COLL_OLD = "thirdBody { H2 1.3; water 14.0; }"
COLL_NEW = "thirdBody { N2 1.0; }  defaultEfficiency 0;"
#  R8 with N2 on BOTH sides (H + OH + N2 <=> H2O + N2: order 1, orderRev 1, nu 0), reversible;
R8_OLD = """        { component H;      nu -1;  order 1; }
        { component OH;     nu -1;  order 1; }
        { component water;  nu  1;  order 0; }
    );
    kinetics
    {
        type thirdBody;
        A 4.5000e+22;  b -2.0;  Ea 0.0;
        thirdBody { water 12.0; H2 0.73; }"""
R8_BOTH = """        { component H;      nu -1;  order 1; }
        { component N2;     nu  0;  order 1;  orderRev 1; }
        { component OH;     nu -1;  order 1; }
        { component water;  nu  1;  order 0; }
    );
    kinetics
    {
        type modifiedArrhenius;
        A 4.5000e+22;  b -2.0;  Ea 0.0;"""
#  R10 irreversible with explicit (FORD-style) orders: HO2 1.5 and a non-reactant N2 0.5.
#  (the probe copy writes a case that asks the reaction library INLINE, entry for entry, without the
#  shipped comment line: bin/curate/kinetics_inline.py)
R10_HEAD_OLD = """R10_HO2_H_H2_O2
{
    reversible        true;"""
R10_HEAD_NEW = """R10_HO2_H_H2_O2
{"""
R10_ST_OLD = """        { component H;      nu -1;  order 1; }
        { component H2;     nu  1;  order 0; }
        { component HO2;    nu -1;  order 1; }
        { component O2;     nu  1;  order 0; }"""
R10_ST_NEW = """        { component H;      nu -1;  order 1; }
        { component H2;     nu  1;  order 0; }
        { component HO2;    nu -1;  order 1.5; }
        { component N2;     nu  0;  order 0.5; }
        { component O2;     nu  1;  order 0; }"""



def calibrated_nox03(c):
    """C477 gave nox03 a log write grid and a `routeIntegral` block; this gate's bounds were
    measured on its earlier shape (a uniform 1 ms grid, no routes), so the probe copy is put
    back in that shape: the routes' tiny cumulative columns are quadrature-level numbers that
    would be judged as state, and the log grid moves the rows the bounds were set on."""
    (Path(c) / "system/postDict").unlink(missing_ok=True)   # its log-axis figures refuse t = 0
    fd = Path(c) / "system/flowsheetDict"
    t = fd.read_text()
    m = re.search(r"\n[ \t]*routeIntegral\s*\{", t)
    if m:
        i = t.index("{", m.start()); d = 0
        for k in range(i, len(t)):
            if t[k] == "{": d += 1
            elif t[k] == "}":
                d -= 1
                if d == 0:
                    t = t[:m.start()] + t[k + 1:]
                    break
        fd.write_text(t)
    cd = Path(c) / "system/controlDict"
    s = cd.read_text()
    if re.search(r"^writeSpacing\s+log;", s, flags=re.M):
        s = re.sub(r"^writeSpacing[^\n]*\n", "writeInterval   1.0e-3;\n", s, flags=re.M)
        s = re.sub(r"^writeStart[^\n]*\n", "", s, flags=re.M)
        s = re.sub(r"^writePerDecade[^\n]*\n", "", s, flags=re.M)
        cd.write_text(s)

def _sri(c):
    gatekit.edit(c / "constant/reactions", TROE_OLD, SRI_NEW)


def _collider(c):
    gatekit.edit(c / "constant/reactions", COLL_OLD, COLL_NEW)


def _both(c):
    gatekit.edit(c / "constant/reactions", R8_OLD, R8_BOTH)


def _ford(c):
    gatekit.edit(c / "constant/reactions", R10_HEAD_OLD, R10_HEAD_NEW)
    gatekit.edit(c / "constant/reactions", R10_ST_OLD, R10_ST_NEW)


def _troe(c):
    gatekit.edit(c / "constant/reactions", TROE_OLD, TROE_NEW)


def _plog(c):
    gatekit.edit(c / "constant/reactions", PLOG_OLD, PLOG_NEW)


def _rodas(c):
    set_solver(c, "analytic", integrator="Rodas4")


EXACT_PROBES = [   # (label, case, edit of a private copy)
    ("closed-form T column (ignition01_h2o2_jac)", "tutorials/batch/combustion/ignition01_h2o2_jac", None),
    ("closed-form T column on Rodas4", "tutorials/batch/combustion/ignition01_h2o2_jac", _rodas),
    ("Troe with F_cent(T)", "tutorials/batch/combustion/ignition01_h2o2_jac", _troe),
    ("reversible PLOG in a fixed-V gas", "tutorials/batch/combustion/ignition01_h2o2_jac", _plog),
    ("gasConstantP (V = nRT/P, rank one)", "tutorials/batch/combustion/ignition03_h2air_constp", None),
    ("SRI fall-off (a b c d e)", "tutorials/batch/combustion/ignition01_h2o2_jac", _sri),
    ("single collider (+N2) on a fall-off", "tutorials/batch/combustion/ignition01_h2o2_jac", _collider),
    ("species on both sides (H + OH + N2 <=> H2O + N2)", "tutorials/batch/combustion/ignition01_h2o2_jac", _both),
    ("explicit orders (HO2 1.5, non-reactant N2 0.5), irreversible", "tutorials/batch/combustion/ignition01_h2o2_jac", _ford),
]

PATHS = [   # (case, what it exercises)
    ("tutorials/batch/reactor/batch02_adiabatic", "liquidDH energy row, fixed step"),
    ("tutorials/batch/reactor/batch04_reversible_wgs", "isothermal reversible Arrhenius"),
    ("tutorials/batch/reactor/batch07_lhhw_methylAcetate", "Factory LHHW law"),
    ("tutorials/batch/combustion/nox01_zeldovich_postflame", "isothermal fall-off + third body"),
    ("tutorials/batch/reactor/batch06_adaptive_runaway", "adaptive sweep, adiabatic liquidDH"),
    ("tutorials/batch/reactor/batch31_fast_equilibrium_reduced", "adaptive sweep, expression law"),
]
AUDIT = re.compile(r"\[jacobian\] (?:batchReactor '[^']*'|adaptive sweep): analytic Jacobian #(\d+) AUDITED "
                   r"at t = (\S+) s(?: \(T = (\S+) K\))?: worst column d\((.*?)\)/d\((.*?)\) (\S+) of the column")


def result(out):
    m = re.search(r"<<<Choupo:result-begin>>>\s*(\{.*?\})\s*<<<Choupo:result-end>>>", out, re.S)
    return json.loads(m.group(1)) if m else None


def audits(out):
    return [(int(m.group(1)), float(m.group(2)), float(m.group(3)) if m.group(3) else None,
             m.group(4), m.group(5), float(m.group(6))) for m in AUDIT.finditer(out)]


def set_solver(case, jacobian, integrator=None, verbosity=None, linear=None):
    """Write `jacobian`/`integrator`/`verbosity` into the (first) batchReactor's solver block,
    creating the block after `type batchReactor;` when there is none."""
    p = case / "system/flowsheetDict"
    s = p.read_text()
    s = re.sub(r"\n[ \t]*jacobian[ \t]+\w+;[^\n]*", "", s)
    unit = re.search(r"\n[ \t]*type[ \t]+batchReactor;[^\n]*\n", s)   # past the header comment
    if not unit:
        raise gatekit.GateRefusal(f"{case}: no batchReactor in flowsheetDict")
    blk = re.compile(r"\n([ \t]*)solver\s*\{").search(s, unit.end())
    keys = []
    if integrator:
        keys.append(f"integrator {integrator};")
    if verbosity is not None:
        keys.append(f"verbosity {verbosity};")
    if jacobian:
        keys.append(f"jacobian {jacobian};")
    if linear:
        keys.append(f"linearSolver {linear};")
    if blk:
        body_start = blk.end()
        body_end = s.index("}", body_start)
        body = s[body_start:body_end]
        if integrator:
            body = re.sub(r"\n[ \t]*integrator[ \t]+\w+;", "", body)
        if verbosity is not None:
            body = re.sub(r"\n[ \t]*verbosity[ \t]+\d+;", "", body)
        s = s[:body_start] + body + "".join("\n            " + k for k in keys) + "\n        " + s[body_end:]
    else:
        s = s[:unit.end()] + "        solver { " + " ".join(keys) + " }\n" + s[unit.end():]
    p.write_text(s)


def kpis(out):
    j = result(out)
    return j["kpis"] if j else None


def flat(k):
    out = {}
    for unit, d in (k or {}).items():
        if isinstance(d, dict):
            for key, v in d.items():
                if isinstance(v, (int, float)) and not isinstance(v, bool):
                    out[(unit, key)] = float(v)
    return out


def kpi_diff(a, b, rel=1e-6, abs_floor=1e-12):
    """-> (worst relative difference, where, keys missing on either side)."""
    fa, fb = flat(a), flat(b)
    worst, where = 0.0, ""
    missing = sorted(set(fa) ^ set(fb))
    for k in set(fa) & set(fb):
        x, y = fa[k], fb[k]
        d = abs(x - y)
        if d <= abs_floor:
            continue
        r = d / max(abs(x), abs(y))
        if r > worst:
            worst, where = r, f"{k[0]}.{k[1]} {x:.12g} vs {y:.12g}"
    return worst, where, missing


def golden(path):
    rows = []
    for line in Path(path).read_text().splitlines():
        if line.startswith("#") or not line.strip():
            continue
        kind, unit, key, val, tol = line.split()
        rows.append((unit, key, float(val), tol))
    return rows


def meets_golden(k, rows):
    bad = []
    f = flat(k)
    for unit, key, val, tol in rows:
        g = f.get((unit, key))
        if g is None:
            bad.append(f"{unit}.{key} missing")
            continue
        if tol.startswith("abs:"):
            ok = abs(g - val) <= float(tol[4:])
        else:
            ok = abs(g - val) <= float(tol) * max(abs(val), 1e-300)
        if not ok:
            bad.append(f"{unit}.{key} {g:.10g} vs golden {val:.10g} ({tol})")
    return bad


def cost(out):
    rhs = re.findall(r"right-hand sides so far (\d+)", out)
    acc = sum(int(x) for x in re.findall(r"steps:\s*(\d+) accepted", out))
    rej = sum(int(x) for x in re.findall(r"accepted,\s*(\d+) rejected", out))
    nj = re.findall(r"Jacobian analytic \((\d+) built, (\d+) right-hand sides spent on audits", out)
    return (int(rhs[-1]) if rhs else None, acc, rej, (int(nj[-1][0]), int(nj[-1][1])) if nj else None)


def main():
    failures, notes = [], []
    batch = gatekit.binary("choupoBatch")

    # ---- (a) the claim along the trajectory, Rosenbrock23 and Rodas4 ------------------
    all_audits = []
    for integ in ("Rosenbrock23", "Rodas4"):
        with gatekit.probe_copy(JAC, strip=STRIP) as c:
            if integ != "Rosenbrock23":
                set_solver(c, "analytic", integrator=integ)
            rc, out = gatekit.run(batch, c)
            if rc != 0:
                failures.append(f"(a) ignition01_h2o2_jac on {integ} exited {rc}: "
                                + " | ".join(out.strip().splitlines()[-2:])[:600])
                continue
            a = audits(out)
            if not a:
                failures.append(f"(a) ignition01_h2o2_jac on {integ} printed no audit line")
            all_audits += [(integ,) + x for x in a]
    pre = [x for x in all_audits if x[3] is not None and x[3] < 1150.0]
    ramp = [x for x in all_audits if x[3] is not None and 1150.0 <= x[3] <= 3000.0]
    burned = [x for x in all_audits if x[3] is not None and x[3] > 3000.0]
    if len(all_audits) < 5 or not pre or not ramp or not burned:
        failures.append(f"(a) the audits do not cover the trajectory: {len(all_audits)} audits, "
                        f"{len(pre)} pre-ignition, {len(ramp)} ramp, {len(burned)} burned")
    worst_a = max(all_audits, key=lambda x: x[6]) if all_audits else None
    for integ, jn, t, T, row, col, d in all_audits:
        if not d <= GATE_TOL:
            failures.append(f"(a) {integ} analytic Jacobian #{jn} at t={t:g} s, T={T} K: "
                            f"d({row})/d({col}) differs by {d:.3e} of the column's scale (> {GATE_TOL:g})")
    for label, grp in (("pre-ignition", pre), ("ramp", ramp), ("burned", burned)):
        if grp:
            w = max(grp, key=lambda x: x[6])
            notes.append(f"{label} {len(grp)} audits, worst {w[6]:.1e}")

    # ---- (b) the same answer, cheaper --------------------------------------------------
    rows = golden(gatekit.base_case(FD) / "expected")
    runs = {}
    for name, base, jac in (("finite difference", FD, "finiteDifference"), ("analytic", JAC, "analytic")):
        with gatekit.probe_copy(base, strip=STRIP) as c:
            set_solver(c, jac, verbosity=4)
            rc, out = gatekit.run(batch, c)
            if rc != 0:
                failures.append(f"(b) the {name} run exited {rc}: "
                                + " | ".join(out.strip().splitlines()[-2:])[:600])
                continue
            runs[name] = (kpis(out), cost(out))
            for b in meets_golden(runs[name][0], rows):
                failures.append(f"(b) {name} run misses ignition01_h2o2's golden: {b}")
    if len(runs) == 2:
        (kf, cf), (ka, ca) = runs["finite difference"], runs["analytic"]
        w, where, missing = kpi_diff(kf, ka, rel=1e-8)
        if missing:
            failures.append(f"(b) KPI keys differ between the runs: {missing[:5]}")
        if w > 1e-8:
            failures.append(f"(b) the analytic run differs from the finite-difference run by {w:.2e} "
                            f"relative (> 1e-8): {where}")
        if cf[0] is None or ca[0] is None or ca[3] is None:
            failures.append("(b) the right-hand-side count was not printed (verbosity 4)")
        elif not ca[0] <= 0.5 * cf[0]:
            failures.append(f"(b) the analytic run spent {ca[0]} right-hand sides against {cf[0]} "
                            "for the finite difference: not the saving the Jacobian exists for")
        else:
            notes.append(f"FD {cf[1]}+{cf[2]} steps {cf[0]} RHS; analytic {ca[1]}+{ca[2]} steps "
                         f"{ca[0]} RHS ({ca[3][0]} Jacobians, {ca[3][1]} RHS on audits); KPIs {w:.0e}")

    # ---- (c) every path, on cases that already ship ------------------------------------
    for case, what in PATHS:
        adaptive = "adaptive" in what
        got = {}
        for jac in ("finiteDifference", "analytic"):
            with gatekit.probe_copy(case, strip=STRIP) as c:
                set_solver(c, jac, integrator=None if adaptive else "Rosenbrock23")
                rc, out = gatekit.run(batch, c)
                if rc != 0:
                    failures.append(f"(c) {Path(case).name} ({what}) with jacobian "
                                    f"{jac} exited {rc}: "
                                    + " | ".join(out.strip().splitlines()[-2:])[:500])
                    continue
                got[jac] = (kpis(out), audits(out))
        if len(got) != 2:
            continue
        a = got["analytic"][1]
        if not a:
            failures.append(f"(c) {Path(case).name} ({what}): no audit printed -- the analytic "
                            "Jacobian was not used")
            continue
        wa = max(x[5] for x in a)
        if not wa <= GATE_TOL:
            failures.append(f"(c) {Path(case).name} ({what}): an audit differs by {wa:.3e} (> {GATE_TOL:g})")
        w, where, missing = kpi_diff(got["finiteDifference"][0], got["analytic"][0])
        if missing or w > 1e-6:
            failures.append(f"(c) {Path(case).name} ({what}): the KPIs of the two Jacobians differ by "
                            f"{w:.2e} ({where}){' missing ' + str(missing[:3]) if missing else ''}")
        notes.append(f"{Path(case).name} {len(a)} audits <= {wa:.0e}")

    # ---- (e) the closed-form T column, Troe and PLOG, gasConstantP --------------------
    #  Every reaction of these probes has an analytic derivative, so NO column of the
    #  Jacobian is a difference any more: the audits must sit at the rounding of the
    #  audit's own central difference (measured 1e-10 to 7e-10), EXACT_TOL = 1e-8 --
    #  60x under the forward-difference T column this replaced (7e-8 to 6.5e-7).
    exact = []
    for label, base, edit in EXACT_PROBES:
        with gatekit.probe_copy(base, strip=STRIP) as c:
            if edit:
                edit(c)
            rc, out = gatekit.run(batch, c)
            if rc != 0:
                failures.append(f"(e) {label} exited {rc}: " + " | ".join(out.strip().splitlines()[-2:])[:600])
                continue
            a = audits(out)
            if not a:
                failures.append(f"(e) {label}: no audit printed -- the analytic Jacobian was not used")
                continue
            if "has no analytic derivative" in out:
                failures.append(f"(e) {label}: a reaction was differenced (no analytic derivative)")
            w = max(a, key=lambda x: x[5])
            if not w[5] <= GATE_TOL:
                failures.append(f"(e) {label}: analytic Jacobian #{w[0]} d({w[3]})/d({w[4]}) differs by "
                                f"{w[5]:.3e} of the column's scale (> {GATE_TOL:g})")
            #  Before the radical pool forms a trace species sits within the audit's step
            #  of zero and its column is a FORWARD difference in the audit itself (5e-9 to
            #  5e-8, the audit's error, not J's).  Once T has risen 1 K every column of the
            #  audit is central, and the audit reads J itself.
            T0 = a[0][2]
            late = [x for x in a if x[2] is not None and T0 is not None and x[2] > T0 + 1.0]
            if len(late) < 2:
                failures.append(f"(e) {label}: only {len(late)} audits after the radical pool formed")
            elif max(x[5] for x in late) > EXACT_TOL:
                wl = max(late, key=lambda x: x[5])
                failures.append(f"(e) {label}: analytic Jacobian #{wl[0]} (T = {wl[2]} K) d({wl[3]})/d({wl[4]}) "
                                f"differs by {wl[5]:.3e} of the column's scale (> {EXACT_TOL:g}: a closed-form "
                                "term is wrong)")
            else:
                exact.append(f"{label} {len(late)} late audits <= {max(x[5] for x in late):.0e}")
    notes += exact

    # ---- (f) the DEFAULT: analytic where every law has a derivative ------------------
    with gatekit.probe_copy(FD, strip=STRIP) as c:          # no `jacobian` key
        rc, out = gatekit.run(batch, c)
        if rc != 0 or not audits(out) or "the default" not in out:
            failures.append(f"(f) ignition01_h2o2 (no `jacobian` key) did not integrate on the audited "
                            f"analytic Jacobian by default (exit {rc})")
    with gatekit.probe_copy(CONSTP, strip=STRIP) as c:      # gasConstantP: now derived
        rc, out = gatekit.run(batch, c)
        k_def = kpis(out) if rc == 0 else None
        if rc != 0 or not audits(out):
            failures.append(f"(f) ignition03_h2air_constp (gasConstantP) did not run on the analytic "
                            f"Jacobian by default (exit {rc})")
    with gatekit.probe_copy(CONSTP, strip=STRIP) as c:
        set_solver(c, "finiteDifference")
        rc, out = gatekit.run(batch, c)
        if rc != 0:
            failures.append(f"(f) ignition03_h2air_constp on `jacobian finiteDifference;` exited {rc}")
        elif k_def is not None:
            w, where, missing = kpi_diff(kpis(out), k_def)
            if missing or w > 1e-6:
                failures.append(f"(f) gasConstantP: analytic and finite-difference KPIs differ by {w:.2e} ({where})")
    with gatekit.probe_copy("tutorials/batch/reactor/batch07_lhhw_methylAcetate", strip=STRIP) as c:
        set_solver(c, None, integrator="Rosenbrock23")
        rc, out = gatekit.run(batch, c)
        if rc != 0 or audits(out):
            failures.append(f"(f) batch07 (an LHHW law, no `jacobian` key) did not stay on the finite "
                            f"difference (exit {rc}, {len(audits(out))} audits)")
    with gatekit.probe_copy("tutorials/batch/reactor/batch07_lhhw_methylAcetate", strip=STRIP) as c:
        set_solver(c, "analytic", integrator="Rosenbrock23")
        rc, out = gatekit.run(batch, c)
        if rc != 0 or "has no analytic derivative" not in out:
            failures.append(f"(f) batch07 with `jacobian analytic;` did not name the differenced LHHW "
                            f"reaction (exit {rc})")

    # ---- (g) the SPARSE factorisation of W (solver/SparseLU, sec:sparse-lu) ------------
    #  (g1) the factorisation itself, against the dense LU, on random sparse matrices
    exe = Path(tempfile.mkdtemp(prefix="sparse_lu_")) / "sparse_lu"
    cxx = shutil.which("g++") or shutil.which("clang++")
    if not cxx:
        failures.append("(g1) no C++ compiler to build test/sparse_lu.cpp")
    else:
        root = gatekit.repo
        r = subprocess.run([cxx, "-std=c++17", "-O2", "-I", str(root / "src"),
                            str(root / "test/sparse_lu.cpp"), str(root / "src/solver/SparseLU.cpp"),
                            str(root / "src/solver/LU.cpp"), "-o", str(exe)],
                           capture_output=True, text=True, timeout=600)
        if r.returncode != 0:
            failures.append("(g1) test/sparse_lu.cpp did not compile: " + r.stderr[-400:])
        else:
            r = subprocess.run([str(exe)], capture_output=True, text=True, timeout=600)
            if r.returncode != 0 or "SPARSE_LU_OK" not in r.stdout:
                failures.append("(g1) SparseLU differs from the dense LU on random sparse matrices:\n"
                                + r.stdout[-1500:])
            else:
                worst = max(float(x) for x in re.findall(r"\|xs-xd\|/\|x\| (\S+)", r.stdout))
                notes.append(f"SparseLU = dense LU on 8 random families to {worst:.0e} "
                             "(n 5..1000), a zero pivot refused")
        shutil.rmtree(exe.parent, ignore_errors=True)
    #  (g2) every combustion case on Rosenbrock: `linearSolver sparse` against `dense`,
    #  KPIs equal to SPARSE_TOL and NO step refactored dense (the threshold test).
    sp_worst, sp_n = 0.0, 0
    for case in SPARSE_CASES:
        got = {}
        for ls in ("dense", "sparse"):
            with gatekit.probe_copy(case, strip=STRIP) as c:
                set_solver(c, None, verbosity=4, linear=ls)
                rc, out = gatekit.run(batch, c)
                if rc != 0:
                    failures.append(f"(g2) {Path(case).name} with linearSolver {ls} exited {rc}: "
                                    + " | ".join(out.strip().splitlines()[-2:])[:500])
                    continue
                got[ls] = (kpis(out), out)
        if len(got) != 2:
            continue
        m = re.findall(r"W factored SPARSE \((\d+) factorisations, (\d+) refactored dense", got["sparse"][1])
        if not m or int(m[-1][0]) == 0:
            failures.append(f"(g2) {Path(case).name}: the sparse run printed no sparse factorisation")
        elif int(m[-1][1]) != 0:
            failures.append(f"(g2) {Path(case).name}: {m[-1][1]} of {m[-1][0]} factorisations were "
                            "refactored dense -- the sparse path is not the one taken")
        #  every KPI on its relative scale (the trace radicals' 1e-7 kmol included);
        #  the balance-closure rows are round-off themselves (1e-16..1e-15 absolute)
        #  and are compared absolutely, to 1e-12
        def split(k, closure):
            return {u: {key: v for key, v in d.items()
                        if (("closure" in key or "residual" in key) == closure)}
                    for u, d in (k or {}).items() if isinstance(d, dict)}
        w, where, missing = kpi_diff(split(got["dense"][0], False), split(got["sparse"][0], False),
                                     abs_floor=0.0)
        wc, wherec, _ = kpi_diff(split(got["dense"][0], True), split(got["sparse"][0], True),
                                 abs_floor=1e-12)
        if wc > 0.0:
            failures.append(f"(g2) {Path(case).name}: a balance closure differs by more than 1e-12 "
                            f"absolute between sparse and dense: {wherec}")
        if missing or w > SPARSE_TOL:
            failures.append(f"(g2) {Path(case).name}: sparse and dense KPIs differ by {w:.2e} "
                            f"(> {SPARSE_TOL:g}): {where}")
        sp_worst, sp_n = max(sp_worst, w), sp_n + 1
    notes.append(f"sparse = dense on {sp_n} combustion cases to {sp_worst:.1e}, 0 dense refactorisations")
    #  (g3) the adaptive sweep of ONE vessel factors sparse too
    with gatekit.probe_copy("tutorials/batch/reactor/batch32_fast_intermediate_full", strip=STRIP) as c:
        set_solver(c, None, linear="sparse")
        rc, out = gatekit.run(batch, c)
        if rc != 0 or "factored SPARSE on the vessel pattern" not in out:
            failures.append(f"(g3) batch32 (adaptive sweep, one vessel) with linearSolver sparse did not "
                            f"factor W sparse (exit {rc})")
    #  (g4) refusals by name
    for ls, jac, word in (("banded", None, "banded"), ("sparse", "finiteDifference", "linearSolver sparse")):
        with gatekit.probe_copy(JAC, strip=STRIP) as c:
            set_solver(c, jac, linear=ls)
            rc, out = gatekit.run(batch, c)
            if rc == 0 or word not in out or "bomb" not in out:
                failures.append(f"(g4) `linearSolver {ls};`{' beside jacobian ' + jac if jac else ''} "
                                f"was not refused by name (exit {rc})")

    # ---- (h) C474: the clean charge, the declared scheme, the several-vessel sweep ----------
    NOX3 = "tutorials/batch/combustion/nox03_millerbowman_large"
    NOX2 = "tutorials/batch/combustion/nox02_millerbowman_denox"
    got = {}
    for tag, integ, ls in (("sparse", "Rosenbrock23", "sparse"), ("dense", "Rosenbrock23", "dense"),
                           ("rodas", "Rodas4", "sparse")):
        with gatekit.probe_copy(NOX3, strip=STRIP) as c:
            calibrated_nox03(c)
            fd = c / "system/flowsheetDict"      # nox03's solver block is one line
            fd.write_text(re.sub(r"solver\s*\{[^}]*\}",
                                 f"solver {{ integrator {integ}; jacobian analytic; linearSolver {ls}; verbosity 3; }}",
                                 fd.read_text(), count=1))
            rc, out = gatekit.run(batch, c)
            if rc != 0:
                failures.append(f"(h1) nox03 on {integ} with linearSolver {ls} exited {rc}: "
                                + " | ".join(out.strip().splitlines()[-2:])[:400])
            else:
                got[tag] = (kpis(out), out)
    if "sparse" in got and "dense" in got:
        #  THE REAL DEFECT (h1) CATCHES: the dense LU's partial pivoting leaves -1e-33 kmol on
        #  a species row that is exactly zero, and the 2(3) pair rejected the step on it until
        #  h fell below hMin: a clean charge could not start on `linearSolver dense`, while
        #  the sparse LU's structural zeros gave an exact 0.
        w, where, missing = kpi_diff(got["dense"][0], got["sparse"][0], abs_floor=1e-12)
        if missing or w > SPARSE_TOL:
            failures.append(f"(h1) nox03: dense and sparse KPIs differ by {w:.2e}: {where}")
    if "rodas" in got and "sparse" in got:
        #  THE REAL DEFECT (h2) CATCHES: `solver { integrator Rodas4; }` was accepted by the
        #  batch reactor and never read by the adaptive sweep, which was always Rosenbrock23
        #  (a Rodas4 copy of nox03 agreed with Rosenbrock23 to every digit printed).
        if "adaptive Rodas4" not in got["rodas"][1] or "adaptive Rosenbrock23" not in got["sparse"][1]:
            failures.append("(h2) the adaptive sweep did not announce the declared integrator")
        #  tauIgnition (C477) is located on the dense output's samples, so it carries their
        #  resolution (Rodas4 vs Rosenbrock23: 0.37 us of 2.38 ms, 1.6e-4); the arm judges the state.
        noTau = lambda k: {u: {kk: v for kk, v in d.items() if kk != "tauIgnition"} if isinstance(d, dict) else d
                           for u, d in (k or {}).items()}
        w, where, _ = kpi_diff(noTau(got["rodas"][0]), noTau(got["sparse"][0]), abs_floor=1e-12)
        if w == 0.0 or w > 1e-4:
            failures.append(f"(h2) nox03 on Rodas4 vs Rosenbrock23: KPIs differ by {w:.2e} ({where}) -- "
                            "0 means the declared scheme was not the one stepped, > 1e-4 a wrong one")
    #  (h3) THE REAL DEFECT: a run of several vessels read `linearSolver` in no vessel (the sweep
    #  factored sparse for ONE vessel only) -- nox02's 17 gasConstantP vessels, 357 packed rows,
    #  on `auto`, now factor W on the block-diagonal pattern, each vessel's rank-one part kept.
    #  Since C473 g the 17 vessels are INDEPENDENT and each is integrated on its own step, so the
    #  union path is the one `solver { vessels coupled; }` keeps: the arm asks for it.
    with gatekit.probe_copy(NOX2, strip=STRIP) as c:
        fs = c / "system" / "flowsheetDict"
        fs.write_text(re.sub(r"solver(\s*)\{", r"solver\1{ vessels coupled;", fs.read_text()))
        rc, out = gatekit.run(batch, c)
        if rc != 0 or not re.search(r"factored SPARSE on the vessel pattern .*: 357 rows", out):
            failures.append(f"(h3) nox02 (17 vessels, `vessels coupled; linearSolver auto`) did not factor W sparse on the "
                            f"union of the vessels' patterns (exit {rc})")
        if "17 vessels integrated TOGETHER" not in out:
            failures.append("(h3) `vessels coupled;` was not announced as the single-step sweep")
    #  (h4) THE REAL DEFECT: seventeen independent vessels were stepped together, the stiffest one
    #  setting every step.  The default now integrates each on its own, announced, each factoring
    #  its own block sparse.
    with gatekit.probe_copy(NOX2, strip=STRIP) as c:
        fs = c / "system" / "flowsheetDict"
        fs.write_text(fs.read_text().replace("linearSolver auto;", "linearSolver sparse;"))
        rc, out = gatekit.run(batch, c)
        if rc != 0 or "17 independent vessels integrated separately (each its own step)" not in out \
                or not re.search(r"factored SPARSE on the vessel pattern: 21 rows", out):
            failures.append(f"(h4) nox02 did not integrate its 17 independent vessels separately, each "
                            f"factoring its own 21-row block sparse (exit {rc})")
    notes.append("nox03: dense = sparse, Rodas4 is stepped; nox02 factors sparse over 17 vessels (coupled) and per vessel (independent)")
    #  (h5) THE REAL DEFECTS the review of the per-vessel integration found: (i) a vessel that gave up
    #  lost the whole run's output (the error left its thread and nothing was written); (ii) the
    #  one-time "outside its window" notices of the Cp laws came out in the order the threads reached
    #  them.  The probes run at 1 and 4 threads and the answers must be the same bytes.
    def run_threads(extra_control, edit_unit, n):
        with gatekit.probe_copy(NOX2, strip=STRIP) as c:
            fs = c / "system" / "flowsheetDict"
            fs.write_text(re.sub(r"solver(\s*)\{", r"solver\1{ threads %d;" % n, fs.read_text()))
            if extra_control:
                cd = c / "system" / "controlDict"
                cd.write_text(extra_control(cd.read_text()))
            if edit_unit:
                edit_unit(c)
            rc, out = gatekit.run(batch, c)
            csvp = c / "trajectory.csv"
            dirs = sorted(d.name for d in c.iterdir() if d.is_dir() and d.name[:1].isdigit())
            return rc, out.replace(str(c), "CASE").replace("threads %d;" % n, ""), \
                (csvp.read_text() if csvp.exists() else ""), dirs
    cut = lambda t: re.sub(r"(deltaT0\s)", "maxSteps 300;\n    \\1",
                           re.sub(r"\nwriteInterval\s+[^;]+;", "\nwriteInterval 1e-3;", t), count=1)
    r1, r4 = run_threads(cut, None, 1), run_threads(cut, None, 4)
    if r1[0] == 0 or "T1500" not in r1[1] or len(r1[2].splitlines()) < 3:
        failures.append("(h5) nox02 with maxSteps 300: the failing vessel did not stop the run by name"
                        " after the trajectory and the <t>/ directories reached the last time every vessel passed")
    if r1[1:] != r4[1:]:
        failures.append("(h5) nox02 with maxSteps 300: the failure's output differs between 1 and 4 threads")

    def hot(c):
        for name, T in (("T1450", "7000"), ("T1500", "7500")):
            f = c / "0" / "internalStates" / name
            f.write_text(re.sub(r"(\n\s*T\s+)[0-9.]+ K;", r"\g<1>" + T + " K;", f.read_text(), count=1))
    short = lambda t: re.sub(r"\nendTime\s+[^;]+;", "\nendTime 1e-4;", re.sub(r"\nwriteInterval\s+[^;]+;", "\nwriteInterval 1e-5;", t))
    c1, c4 = run_threads(short, hot, 1), run_threads(short, hot, 4)
    if c1[0] != 0 or "OUTSIDE its published interval" not in c1[1] or c1[1:] != c4[1:]:
        failures.append("(h5) two vessels crossing a heat-capacity window: standard output and error differ"
                        " between 1 and 4 threads (or the notice is missing)")


    # ---- (i) C468: the audit at zero, and a power below one at zero ------------------------
    #  THE REAL DEFECT (i1) CATCHES (C468 defect 2).  kinetics02_h2o2_falloff, a trace of
    #  H2O2 with every radical at EXACTLY zero, was refused: d(n_OH)/d(n_OH) -0.206 analytic
    #  against -0.439 difference (the first report: HO2/HO2 -0.9618 against -0.9665).  The
    #  analytic derivative was right; the audit's reference was not: a column of a species at
    #  zero was a two-point FORWARD difference, biased by k h for every rate quadratic in it
    #  (2 OH, 2 HO2), and the audit's step exceeded the trace parent's own amount.  Both
    #  kinetics cases declared `jacobian finiteDifference;` to hide it; they now run the
    #  default.  Sabotage (by hand, rebuilt, restored): the one-sided formula put back to
    #  (f(h) - f0)/h with h = sqrt(eps) s -- (i1) refuses kinetics02 by name.
    #  The three-point step also showed the reference's own ROUNDING: an all-zero analytic
    #  column (a zeroth-order rate, check_positivity_mask (c)) read -7.6e-13 against a matrix
    #  scale of 1e-12 and was refused; the audit now takes 8 eps^(2/3) |f0_r| / s_r off each
    #  entry's disagreement (the difference's rounding), and that gate holds it.
    #  THE REAL DEFECT (i2) CATCHES (C468 defect 1).  A rate of order 1/2 on a species at
    #  c = 0 (batch34_fractional_order_at_zero: B absent at t = 0): d(c^0.5)/dc is infinite,
    #  the reaction was differenced at the Jacobian's own step, the audit differenced at its
    #  own, and the run was refused on every path (-2.678 against -2.671).  The fix takes out
    #  EXACTLY the singular term: reaction j's share of column k, from the analytic column
    #  and from the reference (BatchReactor::odeAuditExclusions; the SAME stencil), and audits
    #  the remainder -- so a second reaction reading the same trace species at order 2 is
    #  still audited.  Both paths (fixed step and the adaptive sweep, per-unit hook mapped by
    #  offset), a factory law (A_rev: the law names its fractional orders) and order 1.5 are
    #  variants of the fixture.  SABOTAGE-VERIFIED 2026-11-22 (by hand, rebuilt, restored):
    #  the exclusion returned empty -- (i2) refuses fixed/adaptive base, 25.9 against 66.99
    #  (the one-sided difference at the small step), and A_rev, 51.8 against 66.99; the
    #  one-sided formula put back to two points -- (i1) refuses kinetics01 and kinetics02
    #  (and (g2), (h3), so shipped analytic-Jacobian cases were one unlucky charge from the
    #  same refusal).
    for case in ("tutorials/batch/combustion/kinetics01_oh_decay",
                 "tutorials/batch/combustion/kinetics02_h2o2_falloff"):
        with gatekit.probe_copy(case, strip=STRIP) as c:
            if re.search(r"jacobian\s+finiteDifference", (c / "system/flowsheetDict").read_text()):
                failures.append(f"(i1) {Path(case).name} still declares `jacobian finiteDifference;`")
            rc, out = gatekit.run(batch, c)
            a = audits(out) if rc == 0 else []
            if rc != 0 or not a or "the default" not in out:
                failures.append(f"(i1) {Path(case).name} on the DEFAULT analytic Jacobian exited {rc}: "
                                + " | ".join(out.strip().splitlines()[-2:])[:500])
            elif max(x[5] for x in a) > GATE_TOL:
                failures.append(f"(i1) {Path(case).name}: an audit differs by {max(x[5] for x in a):.3e} (> {GATE_TOL:g})")
            else:
                notes.append(f"{Path(case).name} analytic, {len(a)} audits <= {max(x[5] for x in a):.0e}")
    FRAC = "tutorials/batch/reactor/batch34_fractional_order_at_zero"
    ADAPT = ("\ntimeStepping adaptive;\ntimeSteppingControl { rtol 1e-6; atol 1e-9; deltaT0 1e-3;"
             " deltaTmax 25; maxGrowth 2.0; }\n")

    def frac_variant(c, kind, adaptive):
        rx = c / "constant/reactions"
        if kind == "A_rev":      # a factory law (explicit reverse leg): its orders live in the law
            rx.write_text(rx.read_text().replace("A      2.0e-3;", "A      2.0e-3; A_rev 1e-9; Ea_rev 0;"))
        elif kind == "order 1.5":
            rx.write_text(rx.read_text().replace("order 0.5;", "order 1.5;"))
        if adaptive:
            cd = c / "system/controlDict"
            cd.write_text(cd.read_text() + ADAPT)

    got = {}
    for tag, integ, jac, kind, adaptive in (
            ("analytic", "Rosenbrock23", "analytic", "", False), ("rodas", "Rodas4", "analytic", "", False),
            ("fd", "Rosenbrock23", "finiteDifference", "", False),
            ("adaptive", "Rosenbrock23", "analytic", "", True),
            ("A_rev", "Rosenbrock23", "analytic", "A_rev", False),
            ("A_rev adaptive", "Rosenbrock23", "analytic", "A_rev", True),
            ("order 1.5", "Rosenbrock23", "analytic", "order 1.5", False),
            ("order 1.5 adaptive", "Rosenbrock23", "analytic", "order 1.5", True)):
        with gatekit.probe_copy(FRAC, strip=STRIP) as c:
            set_solver(c, jac, integrator=integ)
            frac_variant(c, kind, adaptive)
            rc, out = gatekit.run(batch, c)
            if rc != 0:
                failures.append(f"(i2) fractional-order fixture [{tag}] exited {rc}: "
                                + " | ".join(out.strip().splitlines()[-2:])[:500])
                continue
            a = audits(out)
            if not a and jac == "analytic":
                failures.append(f"(i2) fractional-order fixture [{tag}] printed no audit -- the analytic Jacobian was not used")
            #  order 1.5 at zero is the reference's own truncation (c^1.5 is not a quadratic):
            #  measured 4.5e-5, inside the engine's 1e-4 that the exit code already holds
            if a and kind != "order 1.5" and max(x[5] for x in a) > GATE_TOL:
                failures.append(f"(i2) fractional-order fixture [{tag}]: an audit differs by {max(x[5] for x in a):.3e}")
            got[tag] = (kpis(out), a)
    if "analytic" in got and "fd" in got:
        w, where, missing = kpi_diff(got["fd"][0], got["analytic"][0], rel=1e-4)
        if missing or w > 1e-4:
            failures.append(f"(i2) fractional-order fixture: analytic and finite-difference KPIs differ by {w:.2e} ({where})")
    if "rodas" in got and "analytic" in got:
        w, where, _ = kpi_diff(got["rodas"][0], got["analytic"][0], rel=1e-4)
        if w > 1e-4:
            failures.append(f"(i2) fractional-order fixture: Rodas4 and Rosenbrock23 differ by {w:.2e} ({where})")
    notes.append(f"batch34: order 1/2 at c = 0, fixed and adaptive, a factory law (A_rev) and order 1.5 audited ({len(got)} runs)")

    # ---- (d) refusals by name ----------------------------------------------------------
    probes = [
        ("exact", None, "jacobian exact"),
        ("analytic", "RK4", "integrator RK4; jacobian analytic"),
    ]
    for jac, integ, word in probes:
        with gatekit.probe_copy(JAC, strip=STRIP) as c:
            set_solver(c, jac, integrator=integ)
            rc, out = gatekit.run(batch, c)
            if rc == 0 or ("jacobian" not in out or "bomb" not in out
                           or (jac == "exact" and "exact" not in out)
                           or (integ and "RK4" not in out)):
                failures.append(f"(d) `{word};` was not refused by name (exit {rc})")
    with gatekit.probe_copy("tutorials/batch/reactor/batch01_first_order", strip=STRIP) as c:
        set_solver(c, "analytic")
        rc, out = gatekit.run(batch, c)
        if rc == 0 or "jacobian" not in out or "RK4" not in out:
            failures.append(f"(d) `jacobian analytic;` on a default-RK4 fixed-step run was not refused (exit {rc})")

    ok = (f"{len(all_audits)} audits on ignition01 (worst {worst_a[6]:.1e}); " if worst_a else "") \
        + "; ".join(notes)
    return gatekit.verdict("check_kinetics_jacobian", failures, ok)


if __name__ == "__main__":
    sys.exit(main())
