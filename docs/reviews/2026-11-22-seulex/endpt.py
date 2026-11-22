"""Step-endpoint accuracy: endTime = writeInterval = E, so the single written state is a step END (no dense output).
usage: endpt.py integrators(comma) rtol1,rtol2,..."""
import sys, os, re, csv, shutil, subprocess, time, warnings
warnings.simplefilter('ignore')
import numpy as np, cantera as ct
W = '/home/user/choupo/.claude/worktrees/agent-ab13c900530066bf3'
B = W + '/build/linux64Gcc/choupoBatch'
scr = W + '/build/scratch'; src = W + '/tutorials/batch/combustion/nox03_millerbowman_large'
integs = sys.argv[1].split(','); rtols = [float(x) for x in sys.argv[2].split(',')]
Es = [1e-3, 2e-3, 3e-3]; FLOOR = 1e-6
g = ct.Solution('/tmp/mb89/mbA.yaml')
def run(integ, rt, E):
    d = scr + '/ep'; shutil.rmtree(d, ignore_errors=True); shutil.copytree(src, d); shutil.rmtree(d + '/expected', ignore_errors=True)
    f = open(d + '/system/flowsheetDict').read(); f = re.sub(r'integrator\s+\w+;', 'integrator %s;' % integ, f, count=1)
    open(d + '/system/flowsheetDict', 'w').write(f)
    c = open(d + '/system/controlDict').read()
    c = re.sub(r'rtol\s+[0-9.eE+-]+;', 'rtol %g;' % rt, c); c = re.sub(r'atol\s+[0-9.eE+-]+;', 'atol %g;' % (rt * 1e-7), c)
    c = re.sub(r'endTime\s+[0-9.eE+-]+;', 'endTime %g;' % E, c); c = re.sub(r'writeInterval\s+[0-9.eE+-]+;', 'writeInterval %g;' % E, c)
    c = re.sub(r'deltaTmax[^\n]*\n', '', c)
    open(d + '/system/controlDict', 'w').write(c)
    out = subprocess.run([B, d], capture_output=True, text=True, env=dict(os.environ, CHOUPO_ODE_STATS='1'), cwd=d).stdout
    R = list(csv.DictReader(open(d + '/trajectory.csv')))
    return R, re.search(r'accepted=(\d+) rejected=(\d+)', out)
R, _ = run('Rodas4', 1e-8, Es[0])
names = [k[len('vessel.n_'):] for k in R[0] if k.startswith('vessel.n_')]
cn = lambda s: {'1CH2': 'SCH2'}.get(s, s)
X0 = np.array([float(R[0]['vessel.n_' + s]) for s in names]); X0 /= X0.sum()
ref = {}
for E in Es:
    g.TPX = 1300., 101325., {cn(s): X0[i] for i, s in enumerate(names)}
    r = ct.IdealGasReactor(g, clone=False); r.volume = 1e-3; net = ct.ReactorNet([r]); net.rtol = 1e-12; net.atol = 1e-20
    net.advance(E); ref[E] = (r.phase.X[[g.species_index(cn(s)) for s in names]], r.T)
print('%-8s %-8s %s' % ('integ', 'rtol', ' | '.join('E=%.0e dev / dT' % E for E in Es)))
for integ in integs:
    for rt in rtols:
        cells = []
        for E in Es:
            R, m = run(integ, rt, E)
            N = np.array([float(R[-1]['vessel.n_' + s]) for s in names]); X = N / N.sum(); T = float(R[-1]['vessel.T'])
            Xr, Tr = ref[E]; dd = (np.abs(X - Xr) / np.maximum(Xr, 1e-9))[Xr > FLOOR].max()
            cells.append('%.1e / %.1e K' % (dd, abs(T - Tr)))
        print('%-8s %-8g %s' % (integ, rt, ' | '.join(cells)), flush=True)
