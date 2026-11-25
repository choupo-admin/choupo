#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""optimizer_bench -- the optimizer benchmark of DEV.md 4c C496.

A MEASUREMENT TOOL.  It is NOT a gate, it is NOT in bin/runTests, and the
packages it imports (numpy, scipy, cobyqa, cyipopt, PyNomadBBO, modopt) are
EXTERNAL: install them in a throw-away virtual environment outside the
repository; nothing in Choupo depends on them.  The rules it applies are the
ones written, before any result existed, in
docs/audits/2026-11-24-optimizer-bench-protocol.md (read that first).

Sub-commands (run with the virtualenv's python):

  build-hs   fetch Schittkowski's published Fortran collection from the
             author's site and compile it, unmodified, into a shared library
             (needs gfortran and network).  The collection is NEVER copied into
             the repository.
  select     print the Hock-Schittkowski subset the selection rule yields.
  hs         run set A (analytic problems) -> <out>/hs_runs.jsonl (resumable).
  flow-noise measure the response noise of the four flowsheets -> table.
  flow       run set B (the flowsheets as a black box) -> <out>/flow_runs.jsonl.
  report     read the .jsonl files and write the profiles and tables.

Environment: OPTBENCH_DIR (work directory, default /tmp/optbench),
OPTBENCH_PIPE (path of the compiled choupo_pipe_driver, built from
bin/curate/optbench/choupo_pipe_driver.cpp with src/solver/*.cpp).
"""
import ctypes
import json
import math
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
WORK = Path(os.environ.get("OPTBENCH_DIR", "/tmp/optbench"))
PIPE = os.environ.get("OPTBENCH_PIPE", str(WORK / "choupo_pipe_driver"))
HS_URL = "http://klaus-schittkowski.de/test_probs_src.zip"

LEVELS = [1e-8, 1e-6, 1e-4]
SEEDS = [11, 22, 33]
TAUS = [1e-2, 1e-4, 1e-6]
CV_TOL = 1e-4
BIG = 1e20
THIN = 6                      # protocol amendment A2: every sixth survivor
SKIP_AUTHOR = {58, 82, 94, 115}
CODES = ["choupoSqp", "choupoNM", "slsqp", "trustConstr", "cobyla", "cobyqa",
         "ipopt", "nomad", "opensqp"]


# ----------------------------------------------------------------------------
#  Set A: the Hock-Schittkowski collection through its own Fortran
# ----------------------------------------------------------------------------
def build_hs():
    d = WORK / "hs"
    d.mkdir(parents=True, exist_ok=True)
    subprocess.check_call(["curl", "-sSL", "-m", "300", "-o", str(d / "src.zip"), HS_URL])
    subprocess.check_call(["unzip", "-o", "-q", str(d / "src.zip"), "PROB.FOR", "CONV.FOR"], cwd=d)
    (d / "prob.f").write_bytes((d / "PROB.FOR").read_bytes())
    (d / "conv.f").write_bytes((d / "CONV.FOR").read_bytes())
    (d / "hswrap.f90").write_text(HSWRAP)
    subprocess.check_call(["gfortran", "-O1", "-fPIC", "-shared", "-std=legacy", "-w",
                           "-ffixed-line-length-132", "-o", str(d / "libhs.so"),
                           "hswrap.f90", "prob.f", "conv.f"], cwd=d)
    print("built", d / "libhs.so")


HSWRAP = """\
subroutine hs_init(ntp_in, n, nili, ninl, neli, nenl, x0, xl_o, xu_o, lxl_o, lxu_o, lex_o, fex_o, xex_o) bind(C, name="hs_init")
  use iso_c_binding
  implicit none
  integer(c_int), value :: ntp_in
  integer(c_int) :: n, nili, ninl, neli, nenl, lxl_o(101), lxu_o(101), lex_o
  real(c_double) :: x0(101), xl_o(101), xu_o(101), fex_o, xex_o(101)
  integer :: ntp, n1, nili1, ninl1, neli1, nenl1, nex, i
  double precision :: x(101), g(50), gf(101), gg(50*101), fx, xl(101), xu(101), fex, xex(101)
  logical :: index1(50), index2(50), lxl(101), lxu(101), lex
  common /L1/ n1, nili1, ninl1, neli1, nenl1
  common /L2/ x
  common /L3/ g
  common /L4/ gf
  common /L5/ gg
  common /L6/ fx
  common /L9/ index1
  common /L10/ index2
  common /L11/ lxl
  common /L12/ lxu
  common /L13/ xl
  common /L14/ xu
  common /L20/ lex, nex, fex, xex
  common /L8/ ntp
  ntp = ntp_in
  lxl = .false.
  lxu = .false.
  lex = .false.
  call conv(1)
  n = n1
  nili = nili1
  ninl = ninl1
  neli = neli1
  nenl = nenl1
  do i = 1, 101
    x0(i) = x(i)
    xl_o(i) = xl(i)
    xu_o(i) = xu(i)
    xex_o(i) = xex(i)
    lxl_o(i) = merge(1, 0, lxl(i))
    lxu_o(i) = merge(1, 0, lxu(i))
  end do
  lex_o = merge(1, 0, lex)
  fex_o = fex
end subroutine

subroutine hs_eval(ntp_in, n, mtot, xin, f, gout) bind(C, name="hs_eval")
  use iso_c_binding
  implicit none
  integer(c_int), value :: ntp_in, n, mtot
  real(c_double) :: xin(n), f, gout(*)
  integer :: ntp, n1, nili1, ninl1, neli1, nenl1, i
  double precision :: x(101), g(50), gf(101), gg(50*101), fx
  logical :: index1(50), index2(50)
  common /L1/ n1, nili1, ninl1, neli1, nenl1
  common /L2/ x
  common /L3/ g
  common /L4/ gf
  common /L5/ gg
  common /L6/ fx
  common /L9/ index1
  common /L10/ index2
  common /L8/ ntp
  ntp = ntp_in
  do i = 1, n
    x(i) = xin(i)
  end do
  call conv(2)
  f = fx
  if (mtot > 0) then
    do i = 1, mtot
      index1(i) = .true.
    end do
    call conv(4)
    do i = 1, mtot
      gout(i) = g(i)
    end do
  end if
end subroutine
"""

_LIB = None


def lib():
    global _LIB
    if _LIB is None:
        _LIB = ctypes.CDLL(os.environ.get("OPTBENCH_HS_LIB", str(WORK / "hs" / "libhs.so")))
    return _LIB


class HSProblem:
    """One problem of the collection, read through the author's own code."""

    def __init__(self, k):
        C = ctypes
        n = C.c_int()
        a = [C.c_int() for _ in range(4)]
        x0 = (C.c_double * 101)()
        xl = (C.c_double * 101)()
        xu = (C.c_double * 101)()
        lxl = (C.c_int * 101)()
        lxu = (C.c_int * 101)()
        lex = C.c_int()
        fex = C.c_double()
        xex = (C.c_double * 101)()
        lib().hs_init(C.c_int(k), C.byref(n), *[C.byref(v) for v in a], x0, xl, xu, lxl, lxu,
                      C.byref(lex), C.byref(fex), xex)
        self.k = k
        self.n = n.value
        nili, ninl, neli, nenl = [v.value for v in a]
        self.mi = nili + ninl
        self.me = neli + nenl
        self.fstar = fex.value
        self.xex = np.array(xex[:self.n])
        x0 = np.array(x0[:self.n])
        lo = np.array([xl[i] if lxl[i] else -np.inf for i in range(self.n)])
        hi = np.array([xu[i] if lxu[i] else np.inf for i in range(self.n)])
        #  the rule of the author's own test frame (TESTP.FOR): an unbounded
        #  variable gets the start +- 1e5; the start is clipped into the box
        self.lo = np.where(np.isfinite(lo), lo, x0 - 1e5)
        self.hi = np.where(np.isfinite(hi), hi, x0 + 1e5)
        self.span_own = np.where(np.isfinite(lo) & np.isfinite(hi), hi - lo, np.inf)
        self.x0 = np.clip(x0, self.lo, self.hi)

    def raw(self, x):
        C = ctypes
        f = C.c_double()
        m = self.mi + self.me
        g = (C.c_double * 60)()
        lib().hs_eval(C.c_int(self.k), C.c_int(self.n), C.c_int(m),
                      (C.c_double * self.n)(*[float(v) for v in x]), C.byref(f), g)
        g = np.array(g[:m])
        return f.value, g[:self.mi], g[self.mi:]      # inequalities g >= 0, equalities h = 0

    def check_source(self):
        f, g, h = self.raw(self.xex)
        rel = abs(f - self.fstar) / max(1.0, abs(self.fstar))
        viol = max([0.0] + [max(0.0, -v) for v in g] + [abs(v) for v in h]
                   + list(np.maximum(0, self.lo - self.xex)) + list(np.maximum(0, self.xex - self.hi)))
        return rel, viol


def select():
    """The protocol's rule (section 2): 1..119, n <= 10, not skipped by the
    author's frame, source optimum reproduced to 1e-6, every sixth."""
    survivors, excluded = [], []
    for k in range(1, 120):
        P = HSProblem(k)
        if P.n > 10 or k in SKIP_AUTHOR:
            continue
        rel, viol = P.check_source()
        if rel > 1e-6 or viol > 1e-6:
            excluded.append((k, rel, viol))
            continue
        survivors.append(k)
    return survivors[::THIN], survivors, excluded


# ----------------------------------------------------------------------------
#  One counting function, outside every code
# ----------------------------------------------------------------------------
class Budget(Exception):
    pass


class Counter:
    """The only evaluator any code sees.  One call = one evaluation, whatever
    it was for; noise is added here; the true values are recorded beside."""

    def __init__(self, raw, n, lo, hi, x0, budget, sigma=0.0, rng=None, fscale=1.0,
                 true_raw=None):
        self.raw, self.n, self.lo, self.hi = raw, n, lo, hi
        self.budget, self.sigma, self.rng, self.fscale = budget, sigma, rng, fscale
        self.true_raw = true_raw or raw
        self.count = 0
        self.fail = 0
        self.f_true, self.cv_true = [], []
        self._last = []          # last two (key, value): an f and a c asked at the SAME x are one pass
        self.t0 = time.time()

    def __call__(self, x):
        xc = np.clip(np.asarray(x, dtype=float).ravel(), self.lo, self.hi)
        key = np.asarray(x, dtype=float).tobytes()
        for k, v in self._last:
            if k == key:
                return v
        if self.count >= self.budget:
            raise Budget()
        self.count += 1
        try:
            f, g, h = self.raw(xc)
            ok = np.isfinite(f) and np.all(np.isfinite(g)) and np.all(np.isfinite(h))
        except Exception:
            ok = False
        if not ok:
            self.fail += 1
            self.f_true.append(np.inf)
            self.cv_true.append(np.inf)
            nI, nE = getattr(self, "mi", 0), getattr(self, "me", 0)
            v = (BIG, np.full(nI, -BIG), np.full(nE, BIG))
        else:
            self.f_true.append(f)
            self.cv_true.append(max([0.0] + [max(0.0, -t) for t in g] + [abs(t) for t in h]))
            if self.sigma > 0:
                f = f + self.sigma * self.fscale * self.rng.standard_normal()
                g = g + self.sigma * self.rng.standard_normal(len(g))
                h = h + self.sigma * self.rng.standard_normal(len(h))
            v = (float(f), np.array(g), np.array(h))
        self._last = (self._last + [(key, v)])[-2:]
        return v

    def times_to_solve(self, fstar):
        """t(tau): first evaluation count with a point inside the gap AND cv_true <= CV_TOL; inf if never."""
        out = []
        ft = np.array(self.f_true)
        cv = np.array(self.cv_true)
        gap = np.abs(ft - fstar) / max(1.0, abs(fstar))
        for tau in TAUS:
            ok = np.where((gap <= tau) & (cv <= CV_TOL))[0]
            out.append(int(ok[0]) + 1 if len(ok) else None)
        return out


# ----------------------------------------------------------------------------
#  The codes (external; defaults; numerical derivatives or none)
# ----------------------------------------------------------------------------
def _cons_vectors(cnt, mi, me):
    gi = (lambda x: cnt(x)[1]) if mi else None
    he = (lambda x: cnt(x)[2]) if me else None
    return gi, he


def run_slsqp(cnt, x0, lo, hi, mi, me):
    from scipy.optimize import minimize, Bounds
    cons = []
    if mi:
        cons.append({"type": "ineq", "fun": lambda x: cnt(x)[1]})
    if me:
        cons.append({"type": "eq", "fun": lambda x: cnt(x)[2]})
    r = minimize(lambda x: cnt(x)[0], x0, method="SLSQP", bounds=Bounds(lo, hi),
                 constraints=cons, options={"maxiter": 10 ** 6})
    return {"status": str(r.message)}


def run_trust(cnt, x0, lo, hi, mi, me):
    from scipy.optimize import minimize, Bounds, NonlinearConstraint, BFGS
    cons = []
    if mi:
        cons.append(NonlinearConstraint(lambda x: cnt(x)[1], 0.0, np.inf, jac="2-point", hess=BFGS()))
    if me:
        cons.append(NonlinearConstraint(lambda x: cnt(x)[2], 0.0, 0.0, jac="2-point", hess=BFGS()))
    r = minimize(lambda x: cnt(x)[0], x0, method="trust-constr", jac="2-point", hess=BFGS(),
                 bounds=Bounds(lo, hi), constraints=cons, options={"maxiter": 10 ** 6, "verbose": 0})
    return {"status": str(r.message)}


def run_cobyla(cnt, x0, lo, hi, mi, me):
    from scipy.optimize import minimize, Bounds
    cons = []
    if mi:
        cons.append({"type": "ineq", "fun": lambda x: cnt(x)[1]})
    if me:        # COBYLA has no equality: each one is two opposite inequalities
        cons.append({"type": "ineq", "fun": lambda x: cnt(x)[2]})
        cons.append({"type": "ineq", "fun": lambda x: -cnt(x)[2]})
    r = minimize(lambda x: cnt(x)[0], x0, method="COBYLA", bounds=Bounds(lo, hi),
                 constraints=cons, options={"maxiter": 10 ** 6})
    return {"status": str(r.message)}


def run_cobyqa(cnt, x0, lo, hi, mi, me):
    import cobyqa
    from scipy.optimize import Bounds, NonlinearConstraint
    cons = []
    if mi:
        cons.append(NonlinearConstraint(lambda x: cnt(x)[1], 0.0, np.inf))
    if me:
        cons.append(NonlinearConstraint(lambda x: cnt(x)[2], 0.0, 0.0))
    r = cobyqa.minimize(lambda x: cnt(x)[0], x0, bounds=Bounds(lo, hi), constraints=cons,
                        options={"disp": False})
    return {"status": str(r.message)}


def run_ipopt(cnt, x0, lo, hi, mi, me):
    """IPOPT through cyipopt.  The system IPOPT (3.11.9) has no internal
    finite-difference option, so the bench supplies forward differences, one
    counted evaluation per perturbed point, with SciPy's default relative step
    (sqrt(machine epsilon)) -- the same step SLSQP and trust-constr use."""
    import cyipopt
    from scipy.optimize._numdiff import approx_derivative
    n, m = len(x0), mi + me
    fobj = lambda x: cnt(x)[0]
    fcon = lambda x: np.concatenate([cnt(x)[1], cnt(x)[2]])

    class P:
        def objective(self, x):
            return cnt(x)[0]

        def gradient(self, x):
            xc = np.clip(x, lo, hi)      # IPOPT relaxes bounds by ~1e-8; the difference routine refuses a point outside
            return approx_derivative(fobj, xc, method="2-point", bounds=(lo, hi), f0=cnt(xc)[0])

        def constraints(self, x):
            return fcon(x)

        def jacobian(self, x):
            xc = np.clip(x, lo, hi)
            return approx_derivative(fcon, xc, method="2-point", bounds=(lo, hi), f0=fcon(xc)).ravel()

    nlp = cyipopt.Problem(n=n, m=m, problem_obj=P(), lb=lo, ub=hi,
                          cl=np.zeros(m), cu=np.concatenate([np.full(mi, np.inf), np.zeros(me)]))
    nlp.add_option("hessian_approximation", "limited-memory")
    nlp.add_option("max_iter", 10 ** 6)
    nlp.add_option("print_level", 0)
    nlp.add_option("sb", "yes")
    x, info = nlp.solve(x0)
    return {"status": str(info.get("status_msg"))}


def run_nomad(cnt, x0, lo, hi, mi, me, seed=0):
    import PyNomad
    nout = 1 + mi + 2 * me

    def bb(point):
        try:
            x = np.array([point.get_coord(i) for i in range(point.size())])
            f, g, h = cnt(x)
        except Budget:
            return False
        out = [f] + [-v for v in g] + [v for v in h] + [-v for v in h]
        point.setBBO(" ".join("%.17g" % v for v in out).encode())
        return True

    types = "OBJ" + " PB" * (mi + 2 * me)
    params = ["BB_OUTPUT_TYPE " + types, "MAX_BB_EVAL %d" % cnt.budget, "DISPLAY_DEGREE 0",
              "SEED %d" % seed]
    PyNomad.optimize(bb, list(x0), list(lo), list(hi), params)
    return {"status": "nomad ended"}


def run_opensqp(cnt, x0, lo, hi, mi, me):
    from modopt import ProblemLite, OpenSQP
    m = mi + me
    kw = {}
    if m:
        kw = dict(con=lambda x: np.concatenate([cnt(x)[1], cnt(x)[2]]),
                  cl=np.zeros(m), cu=np.concatenate([np.full(mi, np.inf), np.zeros(me)]))
    prob = ProblemLite(np.array(x0, dtype=float), name="bench", obj=lambda x: cnt(x)[0],
                       xl=lo, xu=hi, **kw)
    opt = OpenSQP(prob, turn_off_outputs=True, maxiter=10 ** 6)
    opt.solve()
    return {"status": "opensqp ended"}


def run_choupo(cnt, x0, lo, hi, mi, me, method, span_own):
    """Choupo's own solver::sqp / solver::nelderMead, UNCHANGED, over a pipe."""
    n = len(x0)
    #  the bench passes the box start +- 1e5 for the unbounded variables; Choupo's
    #  scaling is told the problem's own span where it is finite
    lo_s = np.where(np.isfinite(span_own), lo, -np.inf)
    hi_s = np.where(np.isfinite(span_own), hi, np.inf)
    p = subprocess.Popen([PIPE, method, str(n), str(me), str(mi)], stdin=subprocess.PIPE,
                         stdout=subprocess.PIPE, text=True, bufsize=1)

    def line(v):
        return " ".join("%.17g" % t for t in v) + "\n"
    p.stdin.write(line(x0) + line(np.where(np.isfinite(span_own), lo, lo)) + line(hi))
    p.stdin.flush()
    status = "?"
    try:
        while True:
            s = p.stdout.readline()
            if not s:
                break
            if s.startswith("DONE"):
                status = s.strip()
                break
            x = np.array([float(t) for t in s.split()[1:]])
            try:
                f, g, h = cnt(x)
                reply = "F " + " ".join("%.17g" % v for v in np.concatenate([[f], h, -g])) + "\n"
            except Budget:
                reply = "STOP\n"
            p.stdin.write(reply)
            p.stdin.flush()
    finally:
        try:
            p.stdin.close()
        except Exception:
            pass
        p.wait(timeout=30)
    return {"status": status}


RUNNERS = {
    "slsqp": run_slsqp, "trustConstr": run_trust, "cobyla": run_cobyla, "cobyqa": run_cobyqa,
    "ipopt": run_ipopt, "nomad": run_nomad, "opensqp": run_opensqp,
}


def run_code(code, cnt, x0, lo, hi, mi, me, span_own, seed=0):
    cnt.mi, cnt.me = mi, me
    if code == "choupoSqp":
        return run_choupo(cnt, x0, lo, hi, mi, me, "sqp", span_own)
    if code == "choupoNM":
        if mi + me:
            return {"status": "N/A: Nelder-Mead has no constraints (the driver refuses them)", "na": True}
        return run_choupo(cnt, x0, lo, hi, mi, me, "nelderMead", span_own)
    if code == "nomad":
        return run_nomad(cnt, x0, lo, hi, mi, me, seed)
    return RUNNERS[code](cnt, x0, lo, hi, mi, me)


class Timeout(Exception):
    pass


def _alarm(signum, frame):
    raise Timeout()


def one_run(code, cnt, x0, lo, hi, mi, me, span_own, seed, limit=180):
    signal.signal(signal.SIGALRM, _alarm)
    signal.alarm(limit)
    info = {}
    t0 = time.time()
    try:
        info = run_code(code, cnt, x0, lo, hi, mi, me, span_own, seed)
    except Budget:
        info = {"status": "budget"}
    except Timeout:
        info = {"status": "timeout %ds" % limit, "timeout": True}
    except BaseException as e:      # a code that dies is recorded, never replaced
        info = {"status": "error: %s: %s" % (type(e).__name__, str(e)[:200]), "error": True}
    finally:
        signal.alarm(0)
    info["wall"] = time.time() - t0
    return info


# ----------------------------------------------------------------------------
#  Set A driver
# ----------------------------------------------------------------------------
def versions():
    import importlib.metadata as md
    out = {}
    for pkg in ["numpy", "scipy", "cobyqa", "cyipopt", "PyNomadBBO", "modopt"]:
        try:
            m = md.metadata(pkg)
            lic = m.get("License-Expression") or m.get("License") or ""
            cls = [c for c in (m.get_all("Classifier") or []) if c.startswith("License")]
            out[pkg] = {"version": md.version(pkg), "license": lic[:120], "classifiers": cls}
        except Exception as e:
            out[pkg] = {"error": str(e)}
    try:
        import cyipopt
        out["ipopt_library"] = ".".join(str(v) for v in cyipopt.IPOPT_VERSION)
    except Exception:
        pass
    return out


def done_keys(path):
    keys = set()
    if Path(path).exists():
        for ln in open(path):
            r = json.loads(ln)
            keys.add((r["problem"], r["code"], r["sigma"], r["seed"]))
    return keys


def run_hs(codes=None, only=None):
    WORK.mkdir(parents=True, exist_ok=True)
    out = WORK / "hs_runs.jsonl"
    done = done_keys(out)
    sel, _, _ = select()
    (WORK / "versions.json").write_text(json.dumps(versions(), indent=1))
    for k in sel:
        if only and k not in only:
            continue
        P = HSProblem(k)
        budget = 100 * (P.n + 1)
        conditions = [(0.0, 0)] + [(s, sd) for s in LEVELS for sd in SEEDS]
        fscale = max(1.0, abs(P.raw(P.x0)[0]))
        for sigma, seed in conditions:
            for code in (codes or CODES):
                if (k, code, sigma, seed) in done:
                    continue
                rng = np.random.default_rng([seed, k, int(-math.log10(sigma)) if sigma else 0])
                cnt = Counter(P.raw, P.n, P.lo, P.hi, P.x0, budget, sigma, rng, fscale)
                info = one_run(code, cnt, P.x0.copy(), P.lo, P.hi, P.mi, P.me, P.span_own, seed)
                rec = dict(problem=k, n=P.n, mi=P.mi, me=P.me, code=code, sigma=sigma, seed=seed,
                           budget=budget, count=cnt.count, fail=cnt.fail, fstar=P.fstar,
                           t=cnt.times_to_solve(P.fstar),
                           best_gap=float(min([abs(f - P.fstar) / max(1, abs(P.fstar))
                                               for f, c in zip(cnt.f_true, cnt.cv_true)
                                               if c <= CV_TOL] or [np.inf])),
                           **info)
                with open(out, "a") as fh:
                    fh.write(json.dumps(rec, default=str) + "\n")
        print("problem", k, "done", flush=True)


# ----------------------------------------------------------------------------
#  Report: profiles, bootstrap, winner rule (protocol sections 6-8)
# ----------------------------------------------------------------------------
def load_runs(path):
    return [json.loads(ln) for ln in open(path)]


def tmatrix(rows, tau_i):
    """cells keyed (problem, sigma, seed): {n, constrained, t: {code: evaluations or inf}}."""
    cells = {}
    for r in rows:
        key = (r["problem"], r["sigma"], r["seed"])
        t = r["t"][tau_i]
        cells.setdefault(key, {"n": r["n"], "constrained": (r["mi"] + r["me"]) > 0, "t": {}})
        cells[key]["t"][r["code"]] = np.inf if t is None else float(t)
    return cells


def kappa_of(cell, code):
    return cell["t"].get(code, np.inf) / (cell["n"] + 1)


def fraction_solved(cells, code, sigma, kappa=100.0, seed=None, problems=None):
    sel = [c for (p, s, sd), c in cells.items()
           if s == sigma and (seed is None or sd == seed) and (problems is None or p in problems)]
    if not sel:
        return float("nan")
    return float(np.mean([kappa_of(c, code) <= kappa for c in sel]))


def _per_problem(cells, code, sigma, kappa):
    probs = sorted({p for (p, s, sd) in cells if s == sigma})
    return np.array([np.mean([kappa_of(c, code) <= kappa for (p, s, sd), c in cells.items()
                              if p == q and s == sigma]) for q in probs])


def bootstrap_diff(cells, a, b, sigma, kappa=100.0, nboot=10000, seed=7):
    d = _per_problem(cells, a, sigma, kappa) - _per_problem(cells, b, sigma, kappa)
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(d), size=(nboot, len(d)))
    boots = d[idx].mean(axis=1)
    return float(d.mean()), float(np.percentile(boots, 2.5)), float(np.percentile(boots, 97.5))


def seed_range(cells, codes, sigma, kappa=100.0):
    seeds = sorted({sd for (p, s, sd) in cells if s == sigma})
    out = {}
    for c in codes:
        if len(seeds) > 1:
            fr = [fraction_solved(cells, c, sigma, kappa, seed=sd) for sd in seeds]
            out[c] = max(fr) - min(fr)
        else:
            out[c] = 0.0
    return out


def winner(cells, codes, sigma, kappa=100.0):
    """Protocol section 7: positive difference against EVERY other code, bootstrap 95 % interval
    excluding zero, and the difference larger than the largest seed-to-seed range of the pair
    (on the clean condition: larger than one problem of the set)."""
    nprob = len({p for (p, s, sd) in cells if s == sigma})
    noisy = sigma > 0
    rng_of = seed_range(cells, codes, sigma, kappa)
    for a in codes:
        ok = True
        for b in codes:
            if a == b:
                continue
            m, lo, hi = bootstrap_diff(cells, a, b, sigma, kappa)
            floor = max(rng_of[a], rng_of[b]) if noisy else 1.0 / nprob
            if not (m > 0 and lo > 0 and m > floor):
                ok = False
                break
        if ok:
            return a, rng_of
    return None, rng_of


def report(workdir, outdir):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    rows = load_runs(Path(workdir) / "hs_runs.jsonl")
    Path(outdir).mkdir(parents=True, exist_ok=True)
    codes = [c for c in CODES if any(r["code"] == c for r in rows)]
    sigmas = [0.0] + LEVELS
    head = "| code | " + " | ".join("clean" if s == 0 else "sigma %g" % s for s in sigmas) + " |"
    rule = "|---|" + "---|" * len(sigmas)
    md = []
    colour = {"choupoSqp": "#000000", "choupoNM": "#7f7f7f", "slsqp": "#0072B2", "trustConstr": "#56B4E9",
              "cobyla": "#009E73", "cobyqa": "#B8A400", "ipopt": "#D55E00", "nomad": "#CC79A7",
              "opensqp": "#E69F00"}
    probs = sorted({r["problem"] for r in rows})
    pinfo = {r["problem"]: (r["n"], r["mi"], r["me"]) for r in rows}
    md.append("Problems run (%d): %s.\n" % (len(probs), ", ".join("HS%d" % p for p in probs)))
    md.append("Runs read: %d (codes: %s).\n" % (len(rows), ", ".join(codes)))
    for ti, tau in enumerate(TAUS):
        cells = tmatrix(rows, ti)
        md.append("\n#### Fraction of cells solved within the full budget (kappa = 100), tau = %g\n" % tau)
        md.append(head)
        md.append(rule)
        for c in codes:
            md.append("| %s | " % c + " | ".join("%.3f" % fraction_solved(cells, c, s) for s in sigmas) + " |")
        md.append("| **winner (protocol section 7)** | " + " | ".join(
            str(winner(cells, codes, s)[0]) for s in sigmas) + " |")
    cells = tmatrix(rows, 1)
    md.append("\n#### Seed-to-seed range of the fraction solved (tau = 1e-4, kappa = 100)\n")
    md.append("| code | " + " | ".join("sigma %g" % s for s in LEVELS) + " |")
    md.append("|---|" + "---|" * len(LEVELS))
    for c in codes:
        md.append("| %s | " % c + " | ".join("%.3f" % seed_range(cells, codes, s)[c] for s in LEVELS) + " |")
    md.append("\n#### Choupo sqp against every other code: difference in fraction solved (sqp minus other) with the 95 % bootstrap interval over problems, kappa = 100\n")
    for ti, tau in enumerate(TAUS):
        cells = tmatrix(rows, ti)
        md.append("\ntau = %g\n" % tau)
        md.append("| other code | " + " | ".join("clean" if s == 0 else "sigma %g" % s for s in sigmas) + " |")
        md.append(rule)
        for c in codes:
            if c == "choupoSqp":
                continue
            cv = []
            for s in sigmas:
                m, lo, hi = bootstrap_diff(cells, "choupoSqp", c, s)
                flag = "" if lo <= 0 <= hi else (" (sqp ahead)" if m > 0 else " (sqp behind)")
                cv.append("%+.2f [%+.2f, %+.2f]%s" % (m, lo, hi, flag))
            md.append("| %s | " % c + " | ".join(cv) + " |")
    uncon = {p for p in probs if pinfo[p][1] + pinfo[p][2] == 0}
    cells = tmatrix(rows, 1)
    md.append("\n#### Unconstrained problems only (%d: %s), tau = 1e-4, kappa = 100\n" % (
        len(uncon), ", ".join("HS%d" % p for p in sorted(uncon))))
    md.append(head)
    md.append(rule)
    for c in codes:
        md.append("| %s | " % c + " | ".join("%.3f" % fraction_solved(cells, c, s, problems=uncon)
                                                for s in sigmas) + " |")
    con = set(probs) - uncon
    md.append("\n#### Constrained problems only (%d), tau = 1e-4, kappa = 100\n" % len(con))
    md.append(head)
    md.append(rule)
    for c in codes:
        md.append("| %s | " % c + " | ".join("%.3f" % fraction_solved(cells, c, s, problems=con)
                                                for s in sigmas) + " |")
    md.append("\n#### Median evaluations / (n + 1) to reach tau = 1e-4, over the cells the code solved (count solved in brackets)\n")
    md.append(head)
    md.append(rule)
    for c in codes:
        cv = []
        for s in sigmas:
            ts = [cl["t"][c] / (cl["n"] + 1) for (p, ss, sd), cl in cells.items()
                  if ss == s and np.isfinite(cl["t"].get(c, np.inf))]
            cv.append("%.1f (%d)" % (np.median(ts), len(ts)) if ts else "-")
        md.append("| %s | " % c + " | ".join(cv) + " |")
    md.append("\n#### Run endings: errors, timeouts, N/A, and non-finite evaluations\n")
    md.append("| code | runs | errors | timeouts | N/A | non-finite evaluations |")
    md.append("|---|---|---|---|---|---|")
    for c in codes:
        rr = [r for r in rows if r["code"] == c]
        md.append("| %s | %d | %d | %d | %d | %d |" % (
            c, len(rr), sum(1 for r in rr if r.get("error")), sum(1 for r in rr if r.get("timeout")),
            sum(1 for r in rr if r.get("na")), sum(r["fail"] for r in rr)))
    kap = np.geomspace(1, 100, 60)
    for ti in range(3):
        cells = tmatrix(rows, ti)
        fig, axes = plt.subplots(1, 4, figsize=(13, 3.2), sharey=True)
        for ax, s in zip(axes, sigmas):
            for c in codes:
                sel = [cl for (p, ss, sd), cl in cells.items() if ss == s]
                ax.plot(kap, [np.mean([kappa_of(cl, c) <= k for cl in sel]) for k in kap],
                        color=colour[c], lw=1.6, ls="-" if c.startswith("choupo") else "--", label=c)
            ax.set_xscale("log")
            ax.set_title("clean" if s == 0 else "noise sigma = %g" % s, fontsize=9)
            ax.set_xlabel("evaluations / (n + 1)", fontsize=8)
            ax.grid(alpha=.3)
        axes[0].set_ylabel("fraction solved, tau = %g" % TAUS[ti], fontsize=8)
        axes[0].set_ylim(0, 1)
        axes[-1].legend(fontsize=6, loc="lower right")
        fig.tight_layout()
        fig.savefig(Path(outdir) / ("data_profile_tau%g.png" % TAUS[ti]), dpi=80)
        plt.close(fig)
    cells = tmatrix(rows, 1)
    alphas = np.geomspace(1, 1000, 80)
    fig, axes = plt.subplots(1, 4, figsize=(13, 3.2), sharey=True)
    for ax, s in zip(axes, sigmas):
        sel = [cl for (p, ss, sd), cl in cells.items() if ss == s]
        sel = [cl for cl in sel if any(np.isfinite(v) for v in cl["t"].values())]
        for c in codes:
            r = np.array([cl["t"].get(c, np.inf) / min(v for v in cl["t"].values() if np.isfinite(v))
                          for cl in sel])
            ax.plot(alphas, [np.mean(r <= a) for a in alphas], color=colour[c], lw=1.6,
                    ls="-" if c.startswith("choupo") else "--", label=c)
        ax.set_xscale("log")
        ax.set_title("clean" if s == 0 else "noise sigma = %g" % s, fontsize=9)
        ax.set_xlabel("ratio to the best code", fontsize=8)
        ax.grid(alpha=.3)
    axes[0].set_ylabel("fraction of cells, tau = 1e-4", fontsize=8)
    axes[-1].legend(fontsize=6, loc="lower right")
    fig.tight_layout()
    fig.savefig(Path(outdir) / "performance_profile_tau1e-4.png", dpi=80)
    plt.close(fig)
    (Path(outdir) / "hs_tables.md").write_text("\n".join(md) + "\n")
    print("\n".join(md))


# ----------------------------------------------------------------------------
#  Set B: the four Choupo flowsheets as a black box through choupoSolve
# ----------------------------------------------------------------------------
import re
import shutil

OPTDIR = ROOT / "tutorials" / "steady" / "optimisation"
SOLVE = os.environ.get("OPTBENCH_SOLVE", str(ROOT / "build" / "linux64Gcc" / "choupoSolve"))
SCRATCH = ROOT / "build" / "optbench" / "steady" / "optimisation"   # inside the tree, four levels below the root like the tutorials: the data root and the catalogue references resolve

#  Each variable: file, regex whose group 1 is the text before the value, SI formatter, bounds, tutorial start.
#  Each constraint is written g >= 0 and scaled by max(|rhs|, 1) (protocol amendment A2).
FLOW = {
    "optim01_column_reflux": dict(
        vars=[("system/flowsheetDict", r"(refluxRatio\s+)[^;]+;", "%.12g;", 3.0, 5.0, 4.0),
              ("system/flowsheetDict", r"(feedStage\s+)[^;]+;", "%.12g;", 6.0, 12.0, 8.0)],
        obj=("kpi", "column01.V_strip"), sense=+1, cons=[]),
    "optim02_process_cost": dict(
        vars=[("system/flowsheetDict", r"(operation\s*\{\s*V_R\s+)[^;]+;", "%.12g;", 0.002, 0.010, 0.005),
              ("system/flowsheetDict", r"(operation\s*\{\s*Q\s+)[^;]+;", "%.12g W;", 0.0, 500.0, 150.0)],
        obj=("costTotal", "totalModuleCost"), sense=+1, cons=[]),
    "optim04_membrane_recovery_scaling": dict(
        vars=[("0/feed", r"(?m)^(P\s+)[^;]+;", "%.12g Pa;", 10e5, 30e5, 14e5),
              ("system/flowsheetDict", r"(?m)^(\s*nMods\s+)[^;]+;", "%.12g;", 3.0, 9.0, 5.0)],
        obj=("kpi", "vessel.water_recovery"), sense=-1,
        cons=[("vessel.maxSI_gypsum_wall", "atMost", 0.0), ("vessel.maxSI_calcite_wall", "atMost", 0.0)]),
    "optim05_reactor_npv": dict(
        vars=[("system/flowsheetDict", r"(?m)^(\s*V_R\s+)[^;]+;", "%.12g;", 1.0, 30.0, 4.0),
              ("system/flowsheetDict", r"(?m)^(\s*T_feed\s+)[^;]+;", "%.12g K;", 348.0, 352.5, 350.0)],
        obj=("kpi", "economics.NPV"), sense=-1,
        cons=[("reactor.V_R", "atMost", 12.0), ("economics.FCI", "atMost", 1.0e6)]),
}


class FlowProblem:
    """A flowsheet as a black box.  raw(x) -> (f, g >= 0 scaled, h)."""

    def __init__(self, name, tag="w"):
        self.name = name
        self.spec = FLOW[name]
        self.n = len(self.spec["vars"])
        self.lo = np.array([v[3] for v in self.spec["vars"]])
        self.hi = np.array([v[4] for v in self.spec["vars"]])
        self.x0_tutorial = np.array([v[5] for v in self.spec["vars"]])
        self.mi, self.me = len(self.spec["cons"]), 0
        self.dir = SCRATCH / ("%s_%s" % (name, tag))
        self.fscale = 1.0
        self.nsim = 0
        self.nfail = 0
        self._prepare()

    def _prepare(self):
        if self.dir.exists():
            shutil.rmtree(self.dir)
        SCRATCH.mkdir(parents=True, exist_ok=True)
        sys.path.insert(0, str(HERE))
        import case_records           # the copy is materialised: pinned catalogue records come along
        case_records.copytree(OPTDIR / self.name, self.dir)
        od = self.dir / "system" / "outerDict"
        if od.exists():
            od.rename(self.dir / "system" / "outerDict.off")      # a single pass: the wrapper is the driver
        self.orig = {}
        for (f, pat, fmt, lo, hi, x0) in self.spec["vars"]:
            self.orig[f] = (self.dir / f).read_text()

    def _write(self, x):
        texts = dict(self.orig)
        for xi, (f, pat, fmt, lo, hi, x0) in zip(x, self.spec["vars"]):
            new, k = re.subn(pat, lambda m: m.group(1) + (fmt % xi), texts[f], count=1)
            if k != 1:
                raise RuntimeError("pattern %r not found in %s" % (pat, f))
            texts[f] = new
        for f, t in texts.items():
            (self.dir / f).write_text(t)

    def simulate(self, x):
        self._write(x)
        self.nsim += 1
        p = subprocess.run([SOLVE, str(self.dir)], capture_output=True, text=True, timeout=300)
        out = p.stdout
        if "<<<Choupo:result-begin>>>" not in out:
            raise RuntimeError("no result block: " + p.stderr[-200:])
        js = json.loads(out.split("<<<Choupo:result-begin>>>")[1].split("<<<Choupo:result-end>>>")[0])
        if not js.get("converged", False):
            raise RuntimeError("flowsheet did not converge")
        return js

    @staticmethod
    def _get(js, path):
        a, b = path.split(".", 1)
        if a in js.get("kpis", {}) and b in js["kpis"][a]:
            return float(js["kpis"][a][b])
        raise KeyError(path)

    def objective_of(self, js):
        kind, path = self.spec["obj"]
        if kind == "kpi":
            v = self._get(js, path)
        else:                      # costTotal: the sum over the sized items of cost.totalModule
            v = sum(float(e["cost"][path[0].lower() + path[1:] if False else "totalModule"])
                    for e in js["equipment"] if e.get("cost"))
        return self.spec["sense"] * v

    def raw(self, x):
        try:
            js = self.simulate(x)
            f = self.objective_of(js) / self.fscale
            g = []
            for path, op, rhs in self.spec["cons"]:
                v = self._get(js, path)
                sc = max(abs(rhs), 1.0)
                g.append((rhs - v) / sc if op == "atMost" else (v - rhs) / sc)
            return f, np.array(g), np.zeros(0)
        except Exception:
            self.nfail += 1
            return np.nan, np.full(self.mi, np.nan), np.zeros(0)


def flow_start(P, which):
    if which == "A":
        return P.x0_tutorial.copy()
    fr = {"B": (0.2, 0.8), "C": (0.8, 0.2)}[which]
    return P.lo + np.array(fr) * (P.hi - P.lo)


def flow_noise():
    """Section 3 of the protocol (as amended by A2): repeatability and finite-difference slope against offset."""
    out = []
    offs = [10 ** (-k / 2.0) for k in range(6, 19)]       # 1e-3 ... 1e-9 in half decades
    for name in FLOW:
        P = FlowProblem(name, "noise")
        x0 = P.x0_tutorial
        P.fscale = max(1.0, abs(P.raw(x0)[0]))       # the rescaling of section 3 (A2), fixed before anything is measured
        base = P.raw(x0)
        rep = [P.raw(x0) for _ in range(5)]
        names = ["f"] + [c[0] for c in P.spec["cons"]]
        vals = lambda r: [r[0] * 1.0] + list(r[1])
        repeat = [max(abs(vals(r)[j] - vals(base)[j]) for r in rep) for j in range(len(names))]
        out.append(dict(case=name, kind="repeat", names=names, base=vals(base), repeatSpread=repeat,
                        fscale=P.fscale))
        for i in range(P.n):
            span = P.hi[i] - P.lo[i]
            for d in offs:
                row = {}
                for sgn in (+1, -1):
                    x = x0.copy()
                    x[i] = np.clip(x0[i] + sgn * d * span, P.lo[i], P.hi[i])
                    row[sgn] = (x[i] - x0[i], vals(P.raw(x)))
                dx = row[+1][0] - row[-1][0]
                slopes = [(row[+1][1][j] - row[-1][1][j]) / dx if dx != 0 else np.nan
                          for j in range(len(names))]
                fwd = [(row[+1][1][j] - vals(base)[j]) / row[+1][0] if row[+1][0] != 0 else np.nan
                       for j in range(len(names))]
                out.append(dict(case=name, kind="offset", var=i, offset=d, dx=dx, names=names,
                                central=slopes, forward=fwd,
                                change=[abs(row[+1][1][j] - vals(base)[j]) for j in range(len(names))]))
        out.append(dict(case=name, kind="count", sims=P.nsim, failures=P.nfail))
        print(name, "noise measured:", P.nsim, "simulator runs,", P.nfail, "failed", flush=True)
    (WORK / "flow_noise.json").write_text(json.dumps(out, default=float, indent=1))


def run_flow(codes=None):
    out = WORK / "flow_runs.jsonl"
    done = set()
    if out.exists():
        for ln in open(out):
            r = json.loads(ln)
            done.add((r["problem"], r["code"], r["start"]))
    for name in FLOW:
        P = FlowProblem(name, "run")
        base = P.raw(P.x0_tutorial)
        P.fscale = max(1.0, abs(base[0]))
        for st in "ABC":
            x0 = flow_start(P, st)
            for code in (codes or CODES):
                if code in ("choupoNM",) and P.mi:
                    pass
                if (name, code, st) in done:
                    continue
                cnt = Counter(P.raw, P.n, P.lo, P.hi, x0, 100)
                cnt.xs = []
                orig_call = cnt.raw

                def rec(x, _o=orig_call, _c=cnt):
                    _c.xs.append([float(v) for v in x])
                    return _o(x)
                cnt.raw = rec
                span_own = P.hi - P.lo
                info = one_run(code, cnt, x0.copy(), P.lo, P.hi, P.mi, P.me, span_own, 0, limit=900)
                rec_ = dict(problem=name, code=code, start=st, count=cnt.count, fail=cnt.fail,
                            fscale=P.fscale, f_true=[float(v) for v in cnt.f_true],
                            cv_true=[float(v) for v in cnt.cv_true], xs=cnt.xs, **info)
                with open(out, "a") as fh:
                    fh.write(json.dumps(rec_, default=str) + "\n")
                print(name, st, code, cnt.count, "evals", info["status"][:50], flush=True)


def run_flow_choupo_own():
    """Choupo's own sqp / nelderMead through their own outerDict (the shipped one, only `initial` and
    the method changed), run by choupoSolve itself.  The count is the driver's own."""
    out = WORK / "flow_own.jsonl"
    done = set()
    if out.exists():
        for ln in open(out):
            r = json.loads(ln)
            done.add((r["problem"], r["method"], r["start"]))
    for name in FLOW:
        P = FlowProblem(name, "own")
        for method in ("sqp", "nelderMead"):
            if method == "nelderMead" and P.mi:
                continue
            for st in "ABC":
                if (name, method, st) in done:
                    continue
                x0 = flow_start(P, st)
                shutil.copytree  # (kept for clarity: the case dir is reused)
                src = (OPTDIR / name / "system" / "outerDict").read_text()
                txt = src
                #  the start: write `initial` of each variable block, in the units the dict is written in
                blocks = list(re.finditer(r"\{[^{}]*path[^{}]*\}", txt))
                new, last = [], 0
                for b, xi in zip(blocks, x0):
                    body = b.group(0)
                    body = re.sub(r"\s*initial\s+[^;]+;", "", body)
                    unit = ""
                    pm = re.search(r"path\s+(\S+);", body).group(1)
                    if pm.startswith("streams.") and pm.endswith(".P"):
                        val = "%.12g" % (xi / 1e5) + " bar"
                    elif pm.endswith("T_feed"):
                        val = "%.12g K" % xi
                    else:
                        val = "%.12g" % xi
                    body = body.rstrip("}").rstrip() + "\n        initial  %s;\n    }" % val
                    new.append(txt[last:b.start()])
                    new.append(body)
                    last = b.end()
                new.append(txt[last:])
                txt = "".join(new)
                txt = re.sub(r"method\s+\w+;", "method %s;" % method, txt)
                if method == "sqp" and "options" in txt and "fdStep" not in txt:
                    txt = re.sub(r"options\s*\{", "options\n{\n    fdStep 1e-5;\n    fdMode forward;", txt, count=1)
                if method == "nelderMead":
                    txt = re.sub(r"constraints\s*\(.*?\n\);", "", txt, flags=re.S)
                    txt = re.sub(r"\n\s*fdStep[^\n]*", "", txt)
                    txt = re.sub(r"\n\s*fdMode[^\n]*", "", txt)
                (P.dir / "system" / "outerDict").write_text(txt)
                t0 = time.time()
                p = subprocess.run([SOLVE, str(P.dir)], capture_output=True, text=True, timeout=1800)
                o = p.stdout
                info = dict(problem=name, method=method, start=st, wall=time.time() - t0,
                            rc=p.returncode, tail=(o[-600:] if p.returncode else ""))
                m = re.search(r"(?:evaluations|simulator runs):\s*(\d+)", o)
                info["evaluations"] = int(m.group(1)) if m else None
                if "<<<Choupo:result-begin>>>" in o:
                    js = json.loads(o.split("<<<Choupo:result-begin>>>")[1].split("<<<Choupo:result-end>>>")[0])
                    info["converged_flowsheet"] = js.get("converged")
                    try:
                        info["f"] = P.objective_of(js)
                        info["g"] = [(P._get(js, c[0]), c[1], c[2]) for c in P.spec["cons"]]
                    except Exception as e:
                        info["extract_error"] = str(e)
                info["optimum_block"] = o[o.find("====  Optimum") - 5:][:1500] if "Optimum" in o else ""
                with open(out, "a") as fh:
                    fh.write(json.dumps(info, default=str) + "\n")
                print(name, method, st, "evaluations", info["evaluations"], flush=True)


def report_flow(workdir, outdir):
    """Set B: reference = best feasible value over every run of every code; per-cell gaps and counts."""
    rows = [json.loads(ln) for ln in open(Path(workdir) / "flow_runs.jsonl")]
    md = []
    probs = list(dict.fromkeys(r["problem"] for r in rows))
    codes = [c for c in CODES if any(r["code"] == c for r in rows)]
    solved = {(c, tau): 0 for c in codes for tau in TAUS}
    ncell = {c: 0 for c in codes}
    for p in probs:
        rr = [r for r in rows if r["problem"] == p]
        best = np.inf
        for r in rr:
            for f, cv in zip(r["f_true"], r["cv_true"]):
                if np.isfinite(f) and cv <= CV_TOL:
                    best = min(best, f)
        md.append("\n**%s**: reference value (best feasible over all runs, rescaled objective, sense folded in) = %.9g  (physical objective = %.9g x scale %.6g)\n"
                  % (p, best, best, rr[0]["fscale"]))
        md.append("| code | start A: gap / evals | start B: gap / evals | start C: gap / evals | failed evals |")
        md.append("|---|---|---|---|---|")
        for c in codes:
            cells, fails = [], 0
            for st in "ABC":
                r = [x for x in rr if x["code"] == c and x["start"] == st]
                if not r:
                    cells.append("-")
                    continue
                r = r[0]
                fails += r["fail"]
                if r.get("na"):
                    cells.append("N/A (no constraints)")
                    ncell[c] += 0
                    continue
                ncell[c] += 1
                g = [abs(f - best) / max(1.0, abs(best)) for f, cv in zip(r["f_true"], r["cv_true"])
                     if np.isfinite(f) and cv <= CV_TOL]
                cells.append(("%.1e" % min(g) if g else "no feasible point") + " / %d" % r["count"])
                for tau in TAUS:
                    if g and min(g) <= tau:
                        solved[(c, tau)] += 1
            md.append("| %s | %s | %d |" % (c, " | ".join(cells), fails))
    md.append("\n**Cells solved against the bench reference (4 problems x 3 starts = 12 cells; N/A cells count as unsolved)**\n")
    md.append("| code | " + " | ".join("tau %g" % t for t in TAUS) + " |")
    md.append("|---|---|---|---|")
    for c in codes:
        md.append("| %s | " % c + " | ".join("%d / 12" % solved[(c, t)] for t in TAUS) + " |")
    own = Path(workdir) / "flow_own.jsonl"
    if own.exists():
        md.append("\n**Choupo's own codes through their own `outerDict` (driver's own count)**\n")
        md.append("| problem | method | start | evaluations (driver) | objective (physical) | constraint values | return code |")
        md.append("|---|---|---|---|---|---|---|")
        for ln in open(own):
            r = json.loads(ln)
            md.append("| %s | %s | %s | %s | %s | %s | %s |" % (
                r["problem"], r["method"], r["start"], r["evaluations"],
                ("%.9g" % r["f"]) if "f" in r else "-",
                ", ".join("%.5g" % g[0] for g in r.get("g", [])) or "-", r["rc"]))
    (Path(outdir) / "flow_tables.md").write_text("\n".join(md) + "\n")
    print("\n".join(md))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "help"
    if cmd == "build-hs":
        build_hs()
    elif cmd == "select":
        sel, surv, exc = select()
        print("survivors", len(surv), "selected", len(sel), sel)
        print("excluded by the source check:", exc)
    elif cmd == "hs":
        only = set(int(a) for a in sys.argv[3:]) if len(sys.argv) > 3 else None
        codes = sys.argv[2].split(",") if len(sys.argv) > 2 and sys.argv[2] != "all" else None
        run_hs(codes, only)
    elif cmd == "flow-noise":
        WORK.mkdir(parents=True, exist_ok=True)
        flow_noise()
    elif cmd == "flow":
        WORK.mkdir(parents=True, exist_ok=True)
        run_flow(sys.argv[2].split(",") if len(sys.argv) > 2 and sys.argv[2] != "all" else None)
    elif cmd == "flow-own":
        WORK.mkdir(parents=True, exist_ok=True)
        run_flow_choupo_own()
    elif cmd == "report-flow":
        report_flow(sys.argv[2] if len(sys.argv) > 2 else WORK,
                    sys.argv[3] if len(sys.argv) > 3 else WORK / "out")
    elif cmd == "report":
        report(sys.argv[2] if len(sys.argv) > 2 else WORK,
               sys.argv[3] if len(sys.argv) > 3 else WORK / "out")
    else:
        sys.exit(__doc__)
