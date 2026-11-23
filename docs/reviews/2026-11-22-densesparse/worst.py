"""worst.py integ write end: the worst (row, column) of dense vs sparse and the values there."""
import sys
from common import *
integ = sys.argv[1]; w = float(sys.argv[2]); end = float(sys.argv[3])
a, _ = run('nox03', integ, 'dense', end=end, write=w, atol=1e-15, tag='ga')
b, _ = run('nox03', integ, 'sparse', end=end, write=w, atol=1e-15, tag='gb')
ka, A = mat(a); _, Bm = mat(b)
cm = np.maximum(np.abs(A).max(0), np.abs(Bm).max(0)); cm[cm == 0] = 1
D = np.abs(A - Bm) / cm
i, j = np.unravel_index(D.argmax(), D.shape)
print('worst row %d (t=%s) col %s: dense %.9e sparse %.9e colmax %.3e dev %.2e' % (i, a[i].get('t', '?'), ka[j], A[i, j], Bm[i, j], cm[j], D[i, j]))
print('per-row max dev:', ' '.join('%.0e' % v for v in D.max(1)[:60]))
print('rows with dev > 1e-6: %d of %d; per column count of cols with colmax dev>1e-4: %d' % ((D.max(1) > 1e-6).sum(), len(D), (D.max(0) > 1e-4).sum()))
top = np.argsort(-D.max(0))[:8]
print('worst columns:', ', '.join('%s %.1e (colmax %.1e)' % (ka[c], D[:, c].max(), cm[c]) for c in top))
