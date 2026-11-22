"""Sweep integrators x tolerances on a combustion case; wall (best of 3), deviation from Cantera rtol 1e-12, counts.
usage: sweep.py CASE YAML T0 VOL P0 integrators(comma) dtmax(comma)"""
import sys, os, re, csv, shutil, subprocess, time, warnings
warnings.simplefilter('ignore')
import numpy as np, cantera as ct
W = '/home/user/choupo/.claude/worktrees/agent-ab13c900530066bf3'
B = W + '/build/linux64Gcc/choupoBatch'
case, yaml, T0, vol, P0 = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5])
integs = sys.argv[6].split(','); dtmaxs = sys.argv[7].split(',')
tols = [(1e-6, 1e-12), (1e-8, 1e-15), (1e-10, 1e-18), (1e-12, 1e-21)]
FLOOR = 1e-6
scr = W + '/build/scratch'; os.makedirs(scr, exist_ok=True)
src = W + '/tutorials/batch/combustion/' + case
def run(integ, rt, at, dt):
    d = scr + '/sw_' + case; shutil.rmtree(d, ignore_errors=True)
    shutil.copytree(src, d); shutil.rmtree(d + '/expected', ignore_errors=True)
    f = open(d + '/system/flowsheetDict').read()
    f = re.sub(r'integrator\s+(Rosenbrock23|Rodas4|seulex);', 'integrator %s;' % integ, f, count=1)
    open(d + '/system/flowsheetDict', 'w').write(f)
    c = open(d + '/system/controlDict').read()
    c = re.sub(r'rtol\s+[0-9.eE+-]+;', 'rtol %g;' % rt, c); c = re.sub(r'atol\s+[0-9.eE+-]+;', 'atol %g;' % at, c)
    if dt == 'none': c = re.sub(r'deltaTmax[^\n]*\n', '', c)
    elif dt != 'keep': c = re.sub(r'deltaTmax\s+[0-9.eE+-]+;', 'deltaTmax %s;' % dt, c)
    open(d + '/system/controlDict', 'w').write(c)
    ws = []
    for _ in range(3):
        t0 = time.perf_counter()
        out = subprocess.run([B, d], capture_output=True, text=True, env=dict(os.environ, CHOUPO_ODE_STATS='1'), cwd=d).stdout
        ws.append(time.perf_counter() - t0)
    m = re.search(r'\[ode-stats\].*', out)
    R = list(csv.DictReader(open(d + '/trajectory.csv')))
    return min(ws), (m.group(0) if m else 'NOSTATS'), R
# reference from the first run's grid
w, s, R0 = run(integs[0], 1e-8, 1e-15, 'keep')
t = np.array([float(r['t']) for r in R0]); names = [k[len('vessel.n_'):] for k in R0[0] if k.startswith('vessel.n_')]
cn = lambda s: {'1CH2': 'SCH2'}.get(s, s)
g = ct.Solution(yaml)
X0 = np.array([float(R0[0]['vessel.n_' + s]) for s in names]); X0 /= X0.sum()
def cant(rt, at):
    g.TPX = T0, P0, {cn(s): X0[i] for i, s in enumerate(names)}
    r = ct.IdealGasReactor(g, clone=False); r.volume = vol
    net = ct.ReactorNet([r]); net.rtol = rt; net.atol = at
    X, T = [], []; t0 = time.perf_counter()
    for tt in t:
        if tt > 0: net.advance(tt)
        X.append(r.phase.X[[g.species_index(cn(s)) for s in names]]); T.append(r.T)
    return time.perf_counter() - t0, np.array(X), np.array(T)
_, Xr, Tr = cant(1e-12, 1e-20)
def dev(X, T):
    d = np.abs(X - Xr) / np.maximum(Xr, 1e-9); return d[Xr > FLOOR].max(), np.abs(T - Tr).max()
print('%-12s %-6s %-8s %8s %10s %9s  %s' % ('integrator', 'dtmax', 'rtol', 'wall/s', 'maxreldev', 'dT/K', 'counts'))
for rt, at in tols[:3]:
    w = min(cant(rt, at)[0] for _ in range(3)); _, X, T = cant(rt, at); d, dT = dev(X, T)
    print('%-12s %-6s %-8g %8.3f %10.2e %9.2e  %s' % ('Cantera', '-', rt, w, d, dT, dict(ct.ReactorNet.solver_stats.fget) if False else ''))
for integ in integs:
    for dt in dtmaxs:
        for rt, at in tols:
            w, s, R = run(integ, rt, at, dt)
            N = np.array([[float(x['vessel.n_' + n]) for n in names] for x in R]); X = N / N.sum(1, keepdims=True)
            T = np.array([float(x['vessel.T']) for x in R])
            d, dT = dev(X, T)
            print('%-12s %-6s %-8g %8.3f %10.2e %9.2e  %s' % (integ, dt, rt, w, d, dT, s.replace('[ode-stats] integrator=%s ' % integ, '')), flush=True)
