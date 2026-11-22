"""Wall (best of 3), counts and deviation from a Rodas4 rtol-1e-11 reference, for combustion cases.
usage: selfsweep.py case integrators(comma) rtols(comma) [none|keep]   (atol = rtol*1e-7 for nox03; kept scaled for nox02)"""
import sys, os, re, csv, shutil, subprocess, time, resource
import numpy as np
W = '/home/user/choupo/.claude/worktrees/agent-ab13c900530066bf3'
B = W + '/build/linux64Gcc/choupoBatch'
case = sys.argv[1]; integs = sys.argv[2].split(','); rtols = [float(x) for x in sys.argv[3].split(',')]
scr = W + '/build/scratch'
def run(integ, rt, rep=5):
    d = scr + '/ss_' + case; shutil.rmtree(d, ignore_errors=True)
    shutil.copytree(W + '/tutorials/batch/combustion/' + case, d); shutil.rmtree(d + '/expected', ignore_errors=True)
    for fn in ('flowsheetDict',):
        p = d + '/system/' + fn; s = open(p).read()
        s = re.sub(r'integrator\s+(Rosenbrock23|Rodas4|seulex);', 'integrator %s;' % integ, s); open(p, 'w').write(s)
    p = d + '/system/controlDict'; c = open(p).read()
    if 'rtol' in c:
        at = float(re.search(r'atol\s+([0-9.eE+-]+);', c).group(1)); r0 = float(re.search(r'rtol\s+([0-9.eE+-]+);', c).group(1))
        c = re.sub(r'rtol\s+[0-9.eE+-]+;', 'rtol %g;' % rt, c); c = re.sub(r'atol\s+[0-9.eE+-]+;', 'atol %g;' % (at * rt / r0), c)
        open(p, 'w').write(c)
    ws = []
    for _ in range(rep):
        r0 = resource.getrusage(resource.RUSAGE_CHILDREN)
        out = subprocess.run([B, d], capture_output=True, text=True, env=dict(os.environ, CHOUPO_ODE_STATS='1'), cwd=d).stdout
        r1 = resource.getrusage(resource.RUSAGE_CHILDREN)
        ws.append((r1.ru_utime - r0.ru_utime) + (r1.ru_stime - r0.ru_stime))
    m = re.search(r'steps=\d+ accepted=(\d+) rejected=(\d+) jacobians=(\d+) factorisations=(\d+) rhs=(\d+)', out)
    R = list(csv.DictReader(open(d + '/trajectory.csv')))
    cols = [k for k in R[0] if k != 't']
    return min(ws), m.groups() if m else None, np.array([[float(r[c]) for c in cols] for r in R]), cols
_, _, ref, cols = run('Rodas4', 1e-11, 1)
isn = [j for j, c in enumerate(cols) if '.n_' in c]
isT = [j for j, c in enumerate(cols) if 'T' in c.split('.')[-1] and '.n_' not in c]
def dev(A):
    tot_r = ref[:, isn].sum(1, keepdims=True); tot_a = A[:, isn].sum(1, keepdims=True)
    # per-unit mole fractions are not separable here: use the amounts relative to the unit's total (single-vessel) or raw
    X = A[:, isn] / np.maximum(tot_a, 1e-300); Xr = ref[:, isn] / np.maximum(tot_r, 1e-300)
    m = Xr > 1e-6
    d = (np.abs(X - Xr) / np.maximum(Xr, 1e-9))[m].max() if m.any() else 0
    return d, np.abs(A[:, isT] - ref[:, isT]).max() if isT else 0
print('case', case)
for integ in integs:
    for rt in rtols:
        w, m, A, _ = run(integ, rt)
        d, dT = dev(A)
        print('%-10s rtol %-7g cpu %.3f s  dev %.1e  dT %.1e K  acc/rej/J/fact/rhs %s' % (integ, rt, w, d, dT, m), flush=True)
