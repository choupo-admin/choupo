#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Regression of data/standards/parameters/solution/NaCl-water.dat (C402, MB-02): the polynomialTSqrtX form fitted to
Laliberte and Cooper 2004 (NaCl constants from their Table 1 p. 1144, Eqs. 6, 8, 9 p. 1142) on 0-60 degC x w[NaCl]
0-0.26.  Prints the coefficients and the comparisons with the CRC Handbook tables (p. 8-77, p. 14-12)."""
import numpy as np
c0, c1, c2, c3, c4 = -0.00433, 0.06471, 1.01660, 0.014624, 3315.6   # Laliberte & Cooper 2004 Table 1, NaCl
def rhow(t):
    num = (((((-2.8054253e-10*t + 1.0556302e-7)*t - 4.6170461e-5)*t - 0.0079870401)*t + 16.945176)*t + 999.83952)
    return num/(1 + 0.01687985*t)
def rho(t, w):
    v = (w + c2 + c3*t)/((c0*w + c1)*np.exp(1e-6*(t + c4)**2))
    return 1.0/((1 - w)/rhow(t) + w*v)
print('LC NaCl 25C w=0.035', rho(25, 0.035), ' CRC seawater S=35:', 1023.343)
print('LC NaCl 20C w=0.03,0.04', rho(20, .03), rho(20, .04), ' CRC 8-77: 1019.6, 1026.8')
ts = np.linspace(0, 60, 31); ws = np.linspace(0, 0.26, 53)
T, W = np.meshgrid(ts, ws); T = T.ravel(); W = W.ravel(); X = 1 - W
y = rho(T, W)
cols = []
for j in range(3):
    for k in range(6):
        cols.append(T**j * X**(k/2))
A = np.array(cols).T
# fit with relative weighting
sol, *_ = np.linalg.lstsq(A/y[:, None], np.ones_like(y), rcond=None)
fit = A @ sol
err = (fit - y)
print('max abs err kg/m3', np.abs(err).max(), 'rms', np.sqrt((err**2).mean()))
b = {j: sol[6*j:6*j+6] for j in range(3)}
for j in range(3):
    print('b%d (' % (j+1), '  '.join('%.12g' % v for v in b[j]), ');')
def law(t, w):
    x = 1 - w
    return sum(sum(b[j][k]*x**(k/2) for k in range(6))*t**j for j in range(3))
print('law 25C w=.035', law(25, .035), 'law 20C .03,.04', law(20, .03), law(20, .04), 'pure water 25', law(25, 0))
