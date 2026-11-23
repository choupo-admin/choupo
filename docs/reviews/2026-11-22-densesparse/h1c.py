"""H1c: (a) dense vs sparse at 30 grid times each reached as a STEP END (a fresh run per E, no dense output);
(b) in one free-step run, split the rows of trajectory.csv into those that fall at/near an accepted step end and
the interior ones, and show where the deviation lives; (c) the accepted step ends of the two runs, compared by
running to each step end t_k (the same sequence).   usage: h1c.py integ"""
import sys, re
from common import *
integ = sys.argv[1]

# (a) fresh run to each grid time, no cap, one write
worst = 0.0
for k in range(1, 31):
    E = k * 1e-3
    a, _ = run('nox03', integ, 'dense', end=E, atol=1e-15, tag='ea')
    b, _ = run('nox03', integ, 'sparse', end=E, atol=1e-15, tag='eb')
    ka, A = mat(a[-1:]); _, Bm = mat(b[-1:])
    sc = np.maximum(np.abs(A), np.abs(Bm))
    m = sc[0] > 1e-6 * sc.max()          # species above 1e-6 of the largest amount
    rel = (np.abs(A - Bm) / np.where(sc == 0, 1, sc))[0]
    worst = max(worst, rel[m].max())
    if k in (1, 2, 3, 5, 10, 20, 30):
        print('  step end E=%2d ms: max rel dev, species above 1e-6 of max: %.1e;  all species: %.1e (%s)' % (k, rel[m].max(), rel.max(), ka[int(rel.argmax())]))
print('(a) worst over 30 fresh step-end states (species above 1e-6 of max): %.1e' % worst)

# (b) one free-step run with a 1e-5 write grid, rows classified by distance to the nearest accepted step end
w = 1e-5; end = 3e-3
a, oa = run('nox03', integ, 'dense', end=end, write=w, atol=1e-15, tag='ga', env={'CHOUPO_ODE_STATS': '1'})
b, ob = run('nox03', integ, 'sparse', end=end, write=w, atol=1e-15, tag='gb', env={'CHOUPO_ODE_STATS': '1'})
ends = [float(m.group(1)) for m in re.finditer(r'^\s+(\d\.\d+e[+-]\d+)\s+\d\.\d+e[+-]\d+\s*$', oa, re.M)]
ends = np.array(sorted(set(ends)))
ka, A = mat(a); _, Bm = mat(b)
cm = np.maximum(np.abs(A).max(0), np.abs(Bm).max(0)); cm[cm == 0] = 1
D = (np.abs(A - Bm) / cm).max(1)
t = np.array([float(r['t']) for r in a])
near = np.array([np.min(np.abs(ends - x)) < 0.01 * w for x in t])
print('(b) %d step ends in 3 ms; rows %d: on a step end %d (max dev %.1e), interior %d (max dev %.1e, median %.1e)'
      % (len(ends), len(t), near.sum(), D[near].max() if near.any() else float('nan'), (~near).sum(), D[~near].max(), np.median(D[~near])))
