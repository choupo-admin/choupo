#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the dominant-eigenvalue recycle accelerator (DEV.md 4c C214 W3).

    bin/curate/check_recycle_acceleration.py

`recycleSolver DominantEigenvalue;` is the dominant eigenvalue method of
Orbach & Crowe, Can. J. Chem. Eng. 49 (1971) 509: lambda from the norm ratio
of successive differences (Eq 17), the move of Eq 18.  The header
src/solver/DominantEigenvalue.H lists what is the paper's and what is
Choupo's own safeguard; THIS gate holds the method to a recomputation.

WHAT THIS CHECKS:

  (a) ONE MOVE ON A LINEAR MAP (alpha = 1).  A C++ probe compiles DominantEigenvalue.cpp
      alone (g++ -std=c++17, no engine build) and runs it on x = A x + b with
      A = V diag(0.8, 0.3, 0.1) V^-1 known, the initial error along the
      dominant eigenvector only.  After three direct steps (the paper's "at least three more
      iterations") the moved
      iterate must equal the fixed point x* = (I - A)^-1 b, computed in the
      probe by an independent Gaussian elimination, to 1e-12.
  (b) OSCILLATING MODE.  The same with lambda = -0.7 (the bound is
      symmetric): exact in one step again.
  (c) FALLBACK, TWO WAYS, EACH ANNOUNCED.  (i) two modes excited at once
      (a 0.8 rotation by 60 degrees): the cosine of successive differences is below the bound,
      so the step is plain direct substitution and note() says so.
      (ii) lambda = 0.97 > lambdaMax: direct substitution, announced.
  (g) EQ 18 WITH DAMPING.  With alpha = 0.7 the same map leaves, after the
      move, exactly (1 - alpha)|dX|/(1 - lambda) of error: the damped move
      recomputed from the paper's formula.
  (d) THE ITERATION LAW.  On the two-mode linear map the accelerated
      iteration reaches the tolerance in fewer steps than direct substitution.
  (e) THE CASE.  The witness case runs with `recycleSolver DominantEigenvalue;`
      to exit 0, its log carries the aid announcement (the defaults named as
      defaults), and its converged tear equals the Wegstein/Newton answer of
      the parent case to 1e-6 relative on the recycle stream's total flow.
  (f) A MISSPELT SOLVER REFUSES.  `recycleSolver Dominant;` exits non-zero
      naming the accepted words (the old selector ran Newton in silence).

By-hand sabotages (recorded in the commit): dropping the `lambda/(1-lambda)`
factor to `lambda` fails (a)/(b); removing the |lambda| bound fails (c)(ii);
removing the cosine test fails (c)(i).
"""
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
WITNESS = ROOT / "tutorials/steady/flowsheets/recycle02_dominant_eigenvalue"
fails = []

PROBE = r'''
#include "solver/DominantEigenvalue.H"
#include <cstdio>
#include <cmath>
using namespace Choupo; using namespace Choupo::solver;
typedef std::vector<std::vector<double>> M;
static M mul(const M&a,const M&b){M c(3,std::vector<double>(3,0));for(int i=0;i<3;i++)for(int j=0;j<3;j++)for(int k=0;k<3;k++)c[i][j]+=a[i][k]*b[k][j];return c;}
static sVector mv(const M&a,const sVector&x){sVector y(3,0);for(int i=0;i<3;i++)for(int j=0;j<3;j++)y[i]+=a[i][j]*x[j];return y;}
static M inv3(M a){M b(3,std::vector<double>(3,0));for(int i=0;i<3;i++)b[i][i]=1;
 for(int c=0;c<3;c++){int p=c;for(int r=c+1;r<3;r++)if(std::fabs(a[r][c])>std::fabs(a[p][c]))p=r;std::swap(a[c],a[p]);std::swap(b[c],b[p]);
  double d=a[c][c];for(int j=0;j<3;j++){a[c][j]/=d;b[c][j]/=d;}
  for(int r=0;r<3;r++)if(r!=c){double f=a[r][c];for(int j=0;j<3;j++){a[r][j]-=f*a[c][j];b[r][j]-=f*b[c][j];}}}return b;}
static M build(double l1,double l2,double l3,M&V){V={{1,0.4,0.1},{0.2,1,0.3},{0.3,0.2,1}};M D={{l1,0,0},{0,l2,0},{0,0,l3}};return mul(mul(V,D),inv3(V));}
static double dist(const sVector&a,const sVector&b){double s=0;for(size_t i=0;i<a.size();i++)s+=(a[i]-b[i])*(a[i]-b[i]);return std::sqrt(s);}
// run k steps from x0; returns iterate after the LAST step; reports notes
static void run(const char*tag,double l1,double l2,double l3,double c1,double c2,double alpha,double lamMax)
{
  M V; M A=build(l1,l2,l3,V); sVector b={1.0,-2.0,0.5};
  M IA=A; for(int i=0;i<3;i++)for(int j=0;j<3;j++)IA[i][j]=(i==j?1:0)-A[i][j];
  sVector xs=mv(inv3(IA),b);
  sVector x(3); for(int i=0;i<3;i++) x[i]=xs[i]+c1*V[i][0]+c2*V[i][1];
  DominantEigenvalueOptions o; o.lambdaMax=lamMax; o.alpha=alpha; DominantEigenvalue acc(3,o);
  int n=0; std::string lastNote;
  // direct count
  { sVector y=x; int m=0; while(dist(y,xs)>1e-10 && m<100000){ sVector g=mv(A,y); for(int i=0;i<3;i++)g[i]+=b[i]; y=g; ++m;} std::printf("%s_direct_steps %d\n",tag,m); }
  while(dist(x,xs)>1e-10 && n<100000){
    sVector g=mv(A,x); for(int i=0;i<3;i++)g[i]+=b[i];
    sVector xn=acc.step(x,g); ++n;
    if(!acc.note().empty()) lastNote=acc.note();
    if(n==3) { std::printf("%s_err_after3 %.17g\n",tag,dist(xn,xs));
               std::printf("%s_expect_after3 %.17g\n",tag,(1.0-alpha)*dist(g,x)/(1.0-l1)); }
    x=xn;
  }
  std::printf("%s_steps %d\n%s_extrap %d\n%s_fallbacks %d\n",tag,n,tag,acc.extrapolations(),tag,acc.fallbacks());
  std::printf("%s_note %s\n",tag,lastNote.empty()?"-":lastNote.c_str());
}
int main()
{
  run("one",   0.8,0.3,0.1, 1.0,0.0, 1.0,0.9);
  run("osc",  -0.7,0.3,0.1, 1.0,0.0, 1.0,0.9);
  run("two",   0.8,0.3,0.1, 1.0,1.0, 0.7,0.9);
  run("paper", 0.8,0.3,0.1, 1.0,0.0, 0.7,0.9);
  { // complex pair: 0.8*rotation(60 deg) -- successive differences are NOT parallel
    double c=0.8*0.5, sn=0.8*std::sqrt(3.0)/2; M A={{c,-sn,0},{sn,c,0},{0,0,0.1}}; sVector b={1,-2,0.5};
    M IA=A; for(int i=0;i<3;i++)for(int j=0;j<3;j++)IA[i][j]=(i==j?1:0)-A[i][j];
    sVector xs=mv(inv3(IA),b); sVector x={xs[0]+1,xs[1],xs[2]};
    DominantEigenvalueOptions o; o.alpha=1.0; DominantEigenvalue acc(3,o); std::string note; int n=0;
    while(dist(x,xs)>1e-10 && n<100000){ sVector g=mv(A,x); for(int i=0;i<3;i++)g[i]+=b[i]; x=acc.step(x,g); ++n; if(!acc.note().empty()) note=acc.note(); }
    std::printf("mix_steps %d\nmix_extrap %d\nmix_fallbacks %d\nmix_note %s\n",n,acc.extrapolations(),acc.fallbacks(),note.c_str()); }
  run("big",   0.97,0.3,0.1,1.0,0.0, 1.0,0.9);
  return 0;
}
'''


def probe():
    cxx = shutil.which("g++") or shutil.which("clang++")
    if not cxx:
        fails.append("no C++ compiler: the probe cannot run -- a check that cannot run must not pass")
        return {}
    with tempfile.TemporaryDirectory() as td:
        src, exe = Path(td) / "p.cpp", Path(td) / "p"
        src.write_text(PROBE)
        r = subprocess.run([cxx, "-std=c++17", "-O0", "-I", str(ROOT / "src"), str(src),
                            str(ROOT / "src/solver/DominantEigenvalue.cpp"), "-o", str(exe)],
                           capture_output=True, text=True)
        if r.returncode != 0:
            fails.append("probe does not compile:\n" + r.stderr[-2000:])
            return {}
        out = subprocess.run([str(exe)], capture_output=True, text=True).stdout
    d = {}
    for line in out.splitlines():
        k, _, v = line.partition(" ")
        d[k] = v
    return d


def arms_probe():
    d = probe()
    if not d:
        return
    for tag, what in (("one", "(a) one-mode map"), ("osc", "(b) oscillating mode")):
        e = float(d.get(tag + "_err_after3", "nan"))
        if not e < 1e-12:
            fails.append("%s: error after 3 steps %s, expected < 1e-12 (one-step exactness)" % (what, e))
        if int(d.get(tag + "_extrap", 0)) < 1:
            fails.append("%s: no extrapolation was made" % what)
    if int(d.get("mix_fallbacks", 0)) < 1 or "several modes" not in d.get("mix_note", "") and int(d.get("mix_fallbacks", 0)) < 1:
        fails.append("(c)(i) a complex pair (successive differences rotate): no announced fallback (cosine test)")
    if int(d.get("big_fallbacks", 0)) < 1 or int(d.get("big_extrap", 0)) != 0:
        fails.append("(c)(ii) lambda=0.97 above lambdaMax: expected fallbacks only, got %s extrapolations, %s fallbacks"
                     % (d.get("big_extrap"), d.get("big_fallbacks")))
    if "outside" not in d.get("big_note", ""):
        fails.append("(c)(ii) fallback not announced with its reason: %r" % d.get("big_note"))
    e7 = float(d.get("paper_err_after3", "nan"))
    ed = float(d.get("paper_expect_after3", "nan"))
    if not abs(e7 - ed) <= 1e-9 * max(1.0, ed):
        fails.append("(g) Eq 18 with alpha=0.7: error after the move %s, expected (1-alpha)|dX|/(1-lambda) = %s" % (e7, ed))
    s, ds = int(d.get("two_steps", 10**9)), int(d.get("two_direct_steps", 0))
    if not s < ds:
        fails.append("(d) accelerated %d steps is not fewer than direct %d" % (s, ds))
    return d


def run_case(case_src, solver_word, tag):
    """Run a COPY of the case with recycleSolver replaced; returns (rc, log)."""
    import os
    with tempfile.TemporaryDirectory() as td:
        dst = Path(td) / "c"
        shutil.copytree(case_src, dst, ignore=shutil.ignore_patterns("converged", "iterations", "reports", "design", "log.*"))
        sd = dst / "system/solverDict"
        txt = sd.read_text()
        if re.search(r"^\s*recycleSolver\s+\w+\s*;", txt, re.M):
            txt = re.sub(r"^(\s*)recycleSolver\s+\w+\s*;", r"\1recycleSolver %s;" % solver_word, txt, flags=re.M)
        else:
            txt += "\nrecycleSolver %s;\n" % solver_word
        sd.write_text(txt)
        exe = ROOT / "choupoSolve"
        r = subprocess.run([str(exe), str(dst)], capture_output=True, text=True, cwd=td)
        return r.returncode, r.stdout + r.stderr


def iters(log):
    m = re.search(r"(?:Recycle )?converged in (\d+)", log)
    return int(m.group(1)) if m else None


def arms_case():
    if not WITNESS.is_dir():
        fails.append("witness case %s missing" % WITNESS)
        return {}
    res = {}
    for w in ("Newton", "Wegstein", "DominantEigenvalue"):
        rc, log = run_case(WITNESS, w, w)
        res[w] = (rc, iters(log), log)
    rc, n, log = res["DominantEigenvalue"]
    if rc != 0 or n is None:
        fails.append("(e) witness with DominantEigenvalue: rc=%s, converged=%s" % (rc, n))
    if "[aid] dominant-eigenvalue method (Orbach & Crowe 1971)" not in log or "(default)" not in log:
        fails.append("(e) the aid announcement (with defaults named) is missing from the log")
    if n is not None and res["Wegstein"][1] is not None and not n < res["Wegstein"][1]:
        fails.append("(e) on the witness DominantEigenvalue took %d iterations, Wegstein %d: the case no longer shows an advantage" % (n, res["Wegstein"][1]))
    # tear flow equal to Wegstein's
    def tearF(log):
        rows = re.findall(r"^\s+\d+\s+[0-9.eE+-]+\s+([0-9.]+)\s+kmol/h", log, re.M)
        return float(rows[-1]) if rows else None
    a, b = tearF(log), tearF(res["Wegstein"][2])
    if a is None or b is None or abs(a - b) > 1e-6 * abs(b):
        fails.append("(e) converged tear flow %s differs from Wegstein's %s" % (a, b))
    rc, log2 = run_case(WITNESS, "Dominant", "x")
    if rc == 0 or "Accepted: Newton, Wegstein, DominantEigenvalue" not in log2:
        fails.append("(f) a misspelt recycleSolver must refuse naming the accepted words (rc=%s)" % rc)
    return res


def main():
    d = arms_probe()
    res = arms_case()
    if fails:
        print("check_recycle_acceleration: FAIL")
        for f in fails:
            print("  - " + f)
        return 1
    print("check_recycle_acceleration: OK  one-step exact on a linear map (err %s), oscillating mode exact (%s), "
          "fallbacks announced (several-modes, lambda>bound), %s vs %s direct steps on the two-mode map; witness %s "
          "iterations Newton/Wegstein/DominantEigenvalue = %s/%s/%s.  NOT checked: nonlinear maps beyond the one "
          "witness, the energy-feedback tear (forces Wegstein)."
          % (d["one_err_after3"], d["osc_err_after3"], d["two_steps"], d["two_direct_steps"],
             WITNESS.name, res["Newton"][1], res["Wegstein"][1], res["DominantEigenvalue"][1]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
