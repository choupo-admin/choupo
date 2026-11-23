"""The step-end level: error of a single written state (a step end, no dense output) against the tight reference,
at the write times of gridtable.py.   usage: stependlevel.py case integrator rtol"""
import sys
from common import *
case, integ, rt = sys.argv[1], sys.argv[2], float(sys.argv[3])
REF = np.load(os.path.join(SCR, 'ref_%s.npy' % case))
cm = np.abs(REF).max(0)
cm[cm == 0] = 1
W = 1e-3
worst = 0.0
wc = ''
for k in range(1, REF.shape[0]):
    R, _ = run(case, integ, 'sparse', rtol=rt, atol=1e-15, end=k * W, tag='se')
    kk, A = mat(R[-1:])
    D = np.abs(A[0] - REF[k]) / cm
    if D.max() > worst:
        worst, wc = D.max(), kk[int(D.argmax())]
print('%s %s rtol %.0e: step-end level (single-write runs) %.2e (%s)' % (case, integ, rt, worst, wc))
