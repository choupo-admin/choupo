"""Shared helpers: run nox03/nox02 with a chosen integrator / linear solver / tolerance in a scratch copy.
Paths are derived from this file's location (the tree root); needs a native build (make all) and numpy."""
import os, re, csv, shutil, subprocess
import numpy as np
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
B = os.path.join(ROOT, 'build', 'linux64Gcc', 'choupoBatch')
SCR = os.path.join(ROOT, 'build', 'scratch_densesparse')
CASES = {'nox03': 'tutorials/batch/combustion/nox03_millerbowman_large',
         'nox02': 'tutorials/batch/combustion/nox02_millerbowman_denox'}


def run(case, integ, ls, rtol=1e-8, atol=None, end=None, write=None, tag='r', env=None, T0=None):
    """Run one case; returns (rows of trajectory.csv, stdout).  end/write None -> the case's own grid."""
    d = os.path.join(SCR, tag)
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(SCR, exist_ok=True)
    shutil.copytree(os.path.join(ROOT, CASES[case]), d)
    shutil.rmtree(d + '/expected', ignore_errors=True)
    fp = d + '/system/flowsheetDict'
    f = open(fp).read()
    f = re.sub(r'integrator\s+\w+;', 'integrator %s;' % integ, f)
    f = re.sub(r'linearSolver\s+\w+;', 'linearSolver %s;' % ls, f)
    open(fp, 'w').write(f)
    cp = d + '/system/controlDict'
    c = open(cp).read()
    c = re.sub(r'rtol\s+[0-9.eE+-]+;', 'rtol %g;' % rtol, c)
    if atol is not None:
        c = re.sub(r'atol\s+[0-9.eE+-]+;', 'atol %g;' % atol, c)
    if end is not None:
        c = re.sub(r'endTime\s+[0-9.eE+-]+;', 'endTime %g;' % end, c)
        c = re.sub(r'writeInterval\s+[0-9.eE+-]+;', 'writeInterval %g;' % (write or end), c)
        c = re.sub(r'deltaTmax[^\n]*\n', '', c)
    open(cp, 'w').write(c)
    if T0 is not None:                      # perturb the initial temperature (a state perturbation at round-off scale)
        sp = d + '/0/internalStates/vessel'
        txt = open(sp).read()
        open(sp, 'w').write(re.sub(r'T\s+1300.00 K;', 'T %.13f K;' % T0, txt, count=1))
    e = dict(os.environ)
    e.update(env or {})
    out = subprocess.run([B, d], capture_output=True, text=True, env=e, cwd=d).stdout
    R = list(csv.DictReader(open(d + '/trajectory.csv')))
    return R, out


def mat(R):
    keys = [k for k in R[0] if k not in ('t', 'time')]
    return keys, np.array([[float(r[k]) for k in keys] for r in R])


def devs(Ra, Rb):
    """max over columns of max|a-b| / column max (the review's metric) and the worst column."""
    ka, A = mat(Ra)
    kb, Bm = mat(Rb)
    assert ka == kb and A.shape == Bm.shape, (A.shape, Bm.shape)
    cm = np.maximum(np.abs(A).max(0), np.abs(Bm).max(0))
    cm[cm == 0] = 1
    d = np.abs(A - Bm).max(0) / cm
    j = int(d.argmax())
    return d[j], ka[j]
