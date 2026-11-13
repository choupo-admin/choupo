#!/usr/bin/env python3
"""Water: Antoine p_sat of water.dat (log10 P[bar] = A - B/(T + C)) against IAPWS-95
p_sat by the Maxwell criterion (own implementation, iapws95.py), 275-645 K.
Also: the density change between the compressed liquid at the Antoine pressure and
the saturated liquid at T (what the kernel's 'saturated liquid at T' substitution moves).
usage: psat_compare.py <repo-root> <scratch-dir>"""
import sys, re, math, importlib.util, os
root, scratch = sys.argv[1], sys.argv[2]
here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('i95', here + '/iapws95.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
C = m.load(root)
t = open(root + '/data/standards/components/water.dat').read()
A, B, Cc = [float(v) for v in re.search(r'vaporPressure\s*\{[^}]*coefficients\s*\(([^)]*)\)', t).group(1).split()]
def antoine(T): return 10 ** (A - B / (T + Cc)) * 1e5
def phi0(d, tau):
    s = math.log(d) + C['lead'][0] + C['lead'][1] * tau + C['logTau'] * math.log(tau)
    for n, g in zip(C['pe_n'], C['pe_g']): s += n * math.log(1 - math.exp(-g * tau))
    return s
def phir(d, tau):
    s = 0
    for n, di, ti in C['pw']: s += n * d**di * tau**ti
    for n, di, ti, ci in C['ex']: s += n * d**di * tau**ti * math.exp(-d**ci)
    for n, di, ti, a, b, gm, ep in C['ga']: s += n * d**di * tau**ti * math.exp(-a*(d-ep)**2 - b*(tau-gm)**2)
    return s
def gibbs(rho, T):
    d, tau = rho / C['rhoc'], C['Tc'] / T
    fd = m.phir(C, d, tau)[0]
    return C['R'] * T * (1 + phi0(d, tau) + phir(d, tau) + d * fd)
def rho_vap(T, P, guess):
    r = guess
    for _ in range(200):
        f = m.pressure(C, r, T) - P; dp = m.props(C, r, T)['dpdrho']
        rn = r - f / dp
        if rn <= 0 or dp <= 0: rn = r / 2
        r = rn
        if abs(f) < 1e-9 * P: break
    return r
_state = {}
def psat95(T):
    # continuation in T from the last solved state (275 K start from Antoine)
    Tp = _state.get('T')
    if Tp is None:
        p, rl0 = antoine(T), 1000.0
        rv0 = p / (C['R'] * T)
    else:
        p0, rl0, rv0 = _state['p'], _state['rl'], _state['rv']
        # Clausius-Clapeyron step
        dh = (1 / rv0 - 1 / rl0) * 0  # unused
        p = p0 * math.exp(5000 * (1 / Tp - 1 / T))
        rv0 = rv0 * p / p0
    for _ in range(200):
        rl = m.rho_liquid(C, T, p, rl0); rv = rho_vap(T, p, rv0)
        dg = gibbs(rl, T) - gibbs(rv, T)
        step = dg / (1 / rl - 1 / rv)
        p = max(p - step, 0.5 * p)
        rl0, rv0 = rl, rv
        if abs(step) < 1e-11 * p: break
    if T > 0:
        _state.update(T=T, p=p, rl=rl, rv=rv)
    return p, rl
rows = []
for T in [275, 300, 350, 373.124, 400, 450, 500, 550, 580, 600, 610, 620, 630, 640]:
    p, rl = psat95(T); pa = antoine(T)
    rows.append((T, p, pa, pa / p - 1, rl))
# Table 8 check (450 K): 0.932203564 MPa
_state.clear(); [psat95(T) for T in (275,300,350,400,450)]; p450 = _state['p']
with open(scratch + '/psat_compare.txt', 'w') as f:
    hdr = f'Antoine A B C = {A} {B} {Cc}; check IAPWS-95 psat(450 K) = {p450:.9e} Pa (Table 8: 0.932203564 MPa)'
    print(hdr); f.write(hdr + '\n')
    for r in rows:
        s = 'T %.3f  psat95 %.6e Pa  Antoine %.6e Pa  Antoine/95-1 %+.4f  rhoL_sat %.3f' % r
        print(s); f.write(s + '\n')
    # density effect where the Antoine line is BELOW the reference line (between-lines case):
    # kernel returns rho_sat(T); a compressed liquid would need P >= p_ref.  Where Antoine is ABOVE,
    # p_ref <= P < p_pkg is answered as a liquid by the reference equation while the package says vapour.
    _state.clear(); [psat95(T) for T in (275,300,350,400,450,500,550,580)]
    for T in [600, 610, 620]:
        p, rl = psat95(T); pa = antoine(T)
        rhi = m.rho_liquid(C, T, max(p, pa), rl)
        s = f'T {T}: rho_sat {rl:.3f}; rho_L at max(p_ref,p_pkg)={max(p,pa):.4e} Pa: {rhi:.3f}; diff {rhi/rl-1:+.4%}'
        print(s); f.write(s + '\n')
