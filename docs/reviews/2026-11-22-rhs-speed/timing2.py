"""Wall time of choupoBatch builds, and of Cantera 3.2 CVODES, on a Miller-Bowman case at the tolerance
pairs of docs/reviews/2026-11-22-miller-bowman/timing.py (best of 3, process start included for Choupo).

usage: timing2.py INTEGRATOR [--case NAME] [--cantera] BINDIR [BINDIR ...]
  INTEGRATOR  Rosenbrock23 | Rodas4 | seulex (a build that has it)
  --case      a tutorials/batch/combustion case (default nox03_millerbowman_large)
  --cantera   add the Cantera rows (nox03 only: needs cantera and ruamel.yaml)
  BINDIR      a directory holding choupoBatch and libchoupo.so (e.g. build/linux64Gcc, or a saved copy);
              the data are always this tree's (CHOUPO_HOME)."""
import csv, os, re, shutil, subprocess, sys, tempfile, time, warnings
import numpy as np
warnings.simplefilter('ignore')

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
args = sys.argv[1:]
if len(args) < 2: sys.exit(__doc__)
integ = args.pop(0); name = 'nox03_millerbowman_large'; ct_on = False; bins = []
while args:
    a = args.pop(0)
    if a == '--case': name = args.pop(0)
    elif a == '--cantera': ct_on = True
    else: bins.append(os.path.abspath(a))
CASE = os.path.join(ROOT, 'tutorials/batch/combustion', name)
env = dict(os.environ, CHOUPO_HOME=ROOT)
TOL = ((1e-6, 1e-12), (1e-8, 1e-15), (1e-10, 1e-18))
W = tempfile.mkdtemp()
res = {}
try:
    src = open(os.path.join(CASE, 'system/controlDict')).read(); fl = open(os.path.join(CASE, 'system/flowsheetDict')).read()
    ref = os.path.join(W, 'ref'); shutil.copytree(CASE, ref, ignore=shutil.ignore_patterns('expected'))
    subprocess.run([os.path.join(ROOT, 'choupoBatch'), ref], capture_output=True, env=env, check=True)
    if ct_on:
        import cantera as ct
        rows = list(csv.DictReader(open(os.path.join(ref, 'trajectory.csv'))))
        t = np.array([float(r['t']) for r in rows]); names = [k[len('vessel.n_'):] for k in rows[0] if k.startswith('vessel.n_')]
        yaml = os.path.join(W, 'mbA.yaml')
        subprocess.run([sys.executable, os.path.join(ROOT, 'docs/reviews/2026-11-22-miller-bowman/cantera_mech.py'), 'A', CASE, yaml], check=True, capture_output=True)
        cn = lambda s: {'1CH2': 'SCH2'}.get(s, s)
        g = ct.Solution(yaml)
        X0 = np.array([float(rows[0]['vessel.n_' + s]) for s in names]); X0 /= X0.sum()

        def run_ct(rt, at):
            g.TPX = 1300.0, 101325.0, {cn(s): X0[i] for i, s in enumerate(names)}
            r = ct.IdealGasReactor(g, clone=False); r.volume = 1e-3; net = ct.ReactorNet([r]); net.rtol = rt; net.atol = at
            t0 = time.perf_counter()
            for tt in t:
                if tt > 0: net.advance(tt)
            return time.perf_counter() - t0
        for rt, at in TOL: res[('Cantera CVODES', rt)] = min(run_ct(rt, at) for _ in range(3))
    for b in bins:
        for rt, at in TOL:
            d = os.path.join(W, 'c'); shutil.rmtree(d, ignore_errors=True)
            shutil.copytree(CASE, d, ignore=shutil.ignore_patterns('expected', 'trajectory.csv', 'log.*', 'latest', 'solution.log'))
            cd = re.sub(r'rtol\s+[0-9.e+-]+;', 'rtol        %g;' % rt, src); cd = re.sub(r'atol\s+[0-9.e+-]+;', 'atol        %g;' % at, cd)
            open(d + '/system/controlDict', 'w').write(cd)
            open(d + '/system/flowsheetDict', 'w').write(re.sub(r'integrator\s+\w+;', 'integrator %s;' % integ, fl))
            ws = []
            for _ in range(3):
                for x in os.listdir(d):
                    if re.match(r'^[0-9]', x) and x != '0': shutil.rmtree(os.path.join(d, x), ignore_errors=True)
                t0 = time.perf_counter(); r = subprocess.run([os.path.join(b, 'choupoBatch'), d], capture_output=True, env=env); ws.append(time.perf_counter() - t0)
            res[(os.path.relpath(b, ROOT), rt)] = min(ws) if r.returncode == 0 else float('nan')
finally:
    shutil.rmtree(W, ignore_errors=True)
labels = sorted({k[0] for k in res}, key=lambda s: (s != 'Cantera CVODES', s))
print('%-28s' % ('%s rtol' % integ) + ''.join('%12g' % rt for rt, _ in TOL))
for lab in labels:
    print('%-28s' % lab + ''.join('%12.3f' % res.get((lab, rt), float('nan')) for rt, _ in TOL))
