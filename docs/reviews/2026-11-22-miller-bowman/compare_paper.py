#!/usr/bin/env python3
"""nox02 against Miller & Bowman Fig. 57 (p. 313), data set 1, as DIGITISED from the page image.

    compare_paper.py CASEDIR

The page image (400 dpi) was thresholded; axis frame found by pixel columns/rows (900-1500 K,
0-300 ppm); the solid model line was traced as a connected component and read at the
temperatures below (columns: mean of the line's thickness), the circles (Lyon & Hardy data
set 1) by their centroids.  Digitising uncertainty about +-3 ppm in NOx and +-5 K in T, and the
steep part of the curve (1150-1225 K) a little more.  Information, not a pin.
"""
import csv, sys, os
import numpy as np
MODEL = {1100: 224, 1125: 221, 1150: 191, 1175: 132, 1200: 68, 1225: 17, 1250: 22, 1275: 40, 1300: 64,
         1325: 88, 1350: 126, 1375: 164, 1400: 202, 1425: 237}
EXPT = {1086: 225, 1115: 222, 1142: 195, 1172: 88, 1201: 27.5, 1229: 14.5, 1256: 15, 1284: 26.6, 1312: 48.6, 1338: 79}
rows = list(csv.DictReader(open(os.path.join(sys.argv[1], 'trajectory.csv')))); last = rows[-1]
Ts = sorted({int(k.split('.')[0][1:]) for k in last if k.startswith('T') and '.n_' in k})
nox = {}
for T in Ts:
    n = sum(float(v) for k, v in last.items() if k.startswith('T%d.n_' % T))
    nox[T] = (float(last['T%d.n_NO' % T]) + float(last['T%d.n_NO2' % T])) / n * 1e6
tt = np.array(Ts, float); vv = np.array([nox[T] for T in Ts])
print('T/K   Choupo(App.B)  paper model (digitised)  diff')
for T, m in MODEL.items():
    c = np.interp(T, tt, vv); print('%5d %9.1f %12d %14.1f' % (T, c, m, c - m))
print('\nT/K   Choupo(interp)  Lyon & Hardy data set 1 (digitised)  diff')
for T, e in EXPT.items():
    c = np.interp(T, tt, vv); print('%5d %9.1f %12.1f %14.1f' % (T, c, e, c - e))
mod = np.array([np.interp(T, tt, vv) - m for T, m in MODEL.items()])
print('\nmodel curve: rms diff %.1f ppm, max |diff| %.1f ppm' % (np.sqrt((mod**2).mean()), np.abs(mod).max()))
ex = np.array([np.interp(T, tt, vv) - e for T, e in EXPT.items()])
print('experiment : rms diff %.1f ppm, max |diff| %.1f ppm' % (np.sqrt((ex**2).mean()), np.abs(ex).max()))
i = int(np.argmin(vv)); print('Choupo minimum on the grid: %.1f ppm at %d K (paper model ~17 ppm at ~1225 K; data ~14.5 ppm at 1229 K)' % (vv[i], Ts[i]))
