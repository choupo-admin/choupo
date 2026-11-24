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
    author's frame, source optimum reproduced to 1e-6, every third."""
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
    return survivors[::3], survivors, excluded


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
            return approx_derivative(fobj, x, method="2-point", bounds=(lo, hi), f0=cnt(x)[0])

        def constraints(self, x):
            return fcon(x)

        def jacobian(self, x):
            return approx_derivative(fcon, x, method="2-point", bounds=(lo, hi), f0=fcon(x)).ravel()

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
    else:
        sys.exit(__doc__)
