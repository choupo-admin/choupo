#!/usr/bin/env python3
"""Independent recomputation of the packed-bed HETP of C329 (Rocha-Bravo-Fair).

HOW TO RUN (standard library only):
    python3 packing_rbf_independent.py            # prints the tables
    python3 packing_rbf_independent.py --tsv DIR  # also writes .tsv files

Case: packing01_schulz_0p10bar (p-xylene / o-xylene, top 0.10 bar, F 1.5 on
the tower area at the reboiler, bed 2.2 m, a_p 478, eps 0.92, 60 deg, S 9 mm,
gauze).  The reviewer's own route: ideal-gas vapour; Chung low-pressure
vapour viscosity with LITERATURE critical volumes (not the engine's Zc(omega)
estimate), Wilke mixing; Fuller diffusivity (the case's diffusion volumes);
Rackett liquid volume with the Yamada-Gunn Z_RA anchored on the record's
Vliq at 298 K; Wilke-Chang with Le Bas volumes; Brock-Bird surface tension
(mole-fraction average); Raoult + Antoine.  The Rocha-Bravo-Fair hydraulics
(IECR 32 (1993) 641) and mass transfer (IECR 35 (1996) 1660, gauze area)
are written from the reviewer's knowledge of the published forms; the
primary PDFs were NOT available in this session.

(A) one cross-section (the bottom of the bed, the engine's state taken as
    input: T, P, y); (B) the whole bed integrated independently
    (dy/dz = (y* - y)/H_OG, constant molar vapour, RK4, the bottom pressure
    found by bisection so that the top is at 0.10 bar), HETP by Fenske.
"""
import math
import sys

R = 8.314462618
g = 9.80665
C = {
    'pX': dict(MW=106.165, Tc=616.168, Pc=35.31521e5, w=0.324, Tb=411.4704, Vliq=1.2393e-4,
               sv=132.0, ant=(4.21832, 1520.25, -50.7471), Vc=379.0e-6, LeBas=8 * 14.8 + 10 * 3.7 - 15),
    'oX': dict(MW=106.165, Tc=630.259, Pc=37.3746e5, w=0.312, Tb=417.521, Vliq=1.2120e-4,
               sv=132.0, ant=(4.22028, 1538.93, -52.5474), Vc=370.0e-6, LeBas=8 * 14.8 + 10 * 3.7 - 15),
}
L1, L2 = 'pX', 'oX'
D_col, H_bed, ap, eps, th, S = 1.22, 2.2, 478.0, 0.92, math.radians(60.0), 0.009
muL = 3.91e-4
dPflood = 1025.0


def psat(c, T):
    A, B, Cc = C[c]['ant']
    return 1e5 * 10 ** (A - B / (T + Cc))


def bubble(x, P, T=350.0):
    for _ in range(100):
        f = x * psat(L1, T) + (1 - x) * psat(L2, T) - P
        df = (x * psat(L1, T + 1e-3) + (1 - x) * psat(L2, T + 1e-3) - P - f) / 1e-3
        T -= f / df
        if abs(f / df) < 1e-11:
            break
    return T


def ystar(x, P, T0=350.0):
    T = bubble(x, P, T0)
    return x * psat(L1, T) / P, T


def chung(c, T):
    d = C[c]
    Ts = 1.2593 * T / d['Tc']
    Om = 1.16145 * Ts ** -0.14874 + 0.52487 * math.exp(-0.7732 * Ts) + 2.16178 * math.exp(-2.43787 * Ts)
    return 40.785 * (1 - 0.2756 * d['w']) * math.sqrt(d['MW'] * T) / ((d['Vc'] * 1e6) ** (2 / 3) * Om) * 1e-7


def rackett(c, T):
    d = C[c]
    Z = 0.29056 - 0.08775 * d['w']
    f = lambda TT: Z ** (1 + (1 - TT / d['Tc']) ** (2 / 7))
    return d['Vliq'] * f(T) / f(298.15)


def brock_bird(c, T):
    d = C[c]
    Tbr = d['Tb'] / d['Tc']
    Pc = d['Pc'] / 1e5
    Q = 0.1196 * (1 + Tbr * math.log(Pc / 1.01325) / (1 - Tbr)) - 0.279
    return Pc ** (2 / 3) * d['Tc'] ** (1 / 3) * Q * (1 - T / d['Tc']) ** (11 / 9) * 1e-3


def props(T, P, x):
    M = C[L1]['MW']                     # isomers: one molar mass
    rhoG = P * M / 1000 / (R * T)
    rhoL = M / 1000 / (x * rackett(L1, T) + (1 - x) * rackett(L2, T))
    muG = x * chung(L1, T) + (1 - x) * chung(L2, T)   # Wilke reduces to this within 0.1 % for isomers of equal M
    MAB = M
    DG = 0.00143 * T ** 1.75 / ((P / 1e5) * math.sqrt(MAB) * (2 * 132.0 ** (1 / 3)) ** 2) * 1e-4
    DLwc = 7.4e-8 * math.sqrt(M) * T / (muL * 1e3 * C[L1]['LeBas'] ** 0.6) * 1e-4
    sig = x * brock_bird(L1, T) + (1 - x) * brock_bird(L2, T)
    h = 1e-4
    m = (ystar(x + h, P, T)[0] - ystar(x - h, P, T)[0]) / (2 * h)
    return dict(rhoG=rhoG, rhoL=rhoL, muG=muG, DG=DG, DL=DLwc, sigma=sig, m=m, M=M)


def rbf(UGs, ULs, p):
    sth = math.sin(th)
    ReL = ULs * S * p['rhoL'] / muL
    WeL = ULs ** 2 * p['rhoL'] * S / p['sigma']
    FrL = ULs ** 2 / (S * g)
    Ft = 29.12 * (WeL * FrL) ** 0.15 * S ** 0.359 / (ReL ** 0.2 * eps ** 0.6 * (1 - 0.93 * 0.9) * sth ** 0.3)
    A = 0.177 * p['rhoG'] / (S * eps ** 2 * sth ** 2)
    B = 88.774 * p['muG'] / (S ** 2 * eps * sth)
    dPd = A * UGs ** 2 + B * UGs
    K2 = 0.614 + 71.35 * S
    # solve dP = dPd / (1 - K2 hL(dP))^5 by bisection on dP in [dPd, dPflood)
    def resid(dP):
        geff = g * (p['rhoL'] - p['rhoG']) / p['rhoL'] * (1 - dP / dPflood)
        hL = (4 * Ft / S) ** (2 / 3) * (3 * muL * ULs / (p['rhoL'] * sth * eps * geff)) ** (1 / 3)
        return dP - dPd / (1 - K2 * hL) ** 5, hL
    lo, hi = dPd, dPflood * (1 - 1e-12)
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        r, _ = resid(mid)
        if r < 0:
            lo = mid
        else:
            hi = mid
    dP = 0.5 * (lo + hi)
    hL = resid(dP)[1]
    Uge = UGs / (eps * (1 - hL) * sth)
    ULe = ULs / (eps * hL * sth)
    kG = 0.054 * p['DG'] / S * ((Uge + ULe) * p['rhoG'] * S / p['muG']) ** 0.8 * (p['muG'] / (p['DG'] * p['rhoG'])) ** 0.33
    kL = 2 * math.sqrt(p['DL'] * 0.9 * ULe / (math.pi * S))
    beta = 1 - 1.203 * FrL ** 0.111
    ae = beta * ap
    HG = UGs / (kG * ae)
    HL = ULs / (kL * ae)
    lam = p['m']
    HOG = HG + lam * HL
    HETP = HOG * math.log(lam) / (lam - 1)
    return dict(dP=dP, hL=hL, beta=beta, kG=kG, kL=kL, HG=HG, HL=HL, HOG=HOG, HETP=HETP, Ft=Ft, dPdry=dPd)


def bed(F_reb=1.5, xN=0.20, Ptop=1.0e4, nseg=200):
    def march(Pb):
        TN = bubble(xN, Pb)
        yb = xN * psat(L1, TN) / Pb
        rhoGb = Pb * C[L1]['MW'] / 1000 / (R * TN)
        V = F_reb * (math.pi * D_col ** 2 / 4) * math.sqrt(rhoGb) / C[L1]['MW']  # kmol/s
        AT = math.pi * D_col ** 2 / 4
        y, P, T = yb, Pb, TN
        dz = H_bed / nseg
        def rhs(y, P, T):
            p = props(T, P, y)
            UGs = V * p['M'] / (p['rhoG'] * AT)
            ULs = V * p['M'] / (p['rhoL'] * AT)
            r = rbf(UGs, ULs, p)
            ys, Tn = ystar(y, P, T)
            return (ys - y) / r['HOG'], -r['dP'], Tn, r
        top_hetp = None
        for _ in range(nseg):
            k1, q1, T, _r = rhs(y, P, T)
            k2, q2, _, _ = rhs(y + dz / 2 * k1, P + dz / 2 * q1, T)
            k3, q3, _, _ = rhs(y + dz / 2 * k2, P + dz / 2 * q2, T)
            k4, q4, _, _ = rhs(y + dz * k3, P + dz * q3, T)
            y += dz / 6 * (k1 + 2 * k2 + 2 * k3 + k4)
            P += dz / 6 * (q1 + 2 * q2 + 2 * q3 + q4)
        return P, y, yb, TN, bubble(y, P)
    lo, hi = Ptop, Ptop + dPflood * H_bed
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        if march(mid)[0] < Ptop:
            lo = mid
        else:
            hi = mid
    Pb = 0.5 * (lo + hi)
    Ptop_r, ytop, ybot, Tbot, Ttop = march(Pb)
    a = lambda T: psat(L1, T) / psat(L2, T)
    alpha = math.sqrt(a(Ttop) * a(Tbot))   # engine: alpha at the two ends of the bed
    r = lambda v: v / (1 - v)
    Nt = math.log(r(ytop) / r(ybot)) / math.log(alpha)
    return dict(HETP=H_bed / Nt, Nt=Nt, Pb=Pb, ytop=ytop, ybot=ybot, alpha=alpha,
                dPbed=(Pb - Ptop_r) / H_bed / 100)


def main():
    out = sys.argv[sys.argv.index('--tsv') + 1] if '--tsv' in sys.argv else None
    # (A) bottom cross-section, engine state
    T, P, y, F = 346.643856945, 10265.8705798, 0.236432664678, 1.4995606486
    p = props(T, P, y)
    UGs = F / math.sqrt(p['rhoG'])
    ULs = UGs * p['rhoG'] / p['rhoL']
    r = rbf(UGs, ULs, p)
    rows = [('quantity', 'independent', 'engine', 'rel_diff_pct')]
    def add(n, a, b):
        rows.append((n, '%.5g' % a, '%.5g' % b if b is not None else 'not printed',
                     '%.2f' % (100 * (a - b) / b) if b else ''))
    add('u_L m3/(m2 h)', ULs * 3600, 4.003)
    add('dP/dz Pa/m', r['dP'], 120.109910949)
    add('a_e/a_p', r['beta'], 0.652)
    add('local HETP m', r['HETP'], 0.148256240891)
    for k in ('rhoG', 'rhoL', 'muG', 'DG', 'DL', 'sigma', 'm'):
        rows.append((k, '%.5g' % p[k], 'not printed', ''))
    for k in ('hL', 'kG', 'kL', 'HG', 'HL', 'HOG', 'dPdry'):
        rows.append(('RBF ' + k, '%.5g' % r[k], 'not printed', ''))
    print('(A) packing01, bottom of the bed, F 1.5')
    for row in rows:
        print('\t'.join(row))
    # (B) the bed
    b = bed()
    rows2 = [('quantity', 'independent', 'engine', 'rel_diff_pct'),
             ('HETP (Fenske over the bed) m', '%.5g' % b['HETP'], '0.155281', '%.2f' % (100 * (b['HETP'] - 0.155281) / 0.155281)),
             ('bed dP mbar/m', '%.4g' % b['dPbed'], '1.2085', '%.2f' % (100 * (b['dPbed'] - 1.2085) / 1.2085)),
             ('y top (reflux)', '%.5f' % b['ytop'], '0.86873', ''),
             ('alpha', '%.5f' % b['alpha'], '1.24127', '')]
    print('\n(B) packing01, whole bed, F 1.5 (engine run: segments 100)')
    for row in rows2:
        print('\t'.join(row))
    if out:
        with open(out + '/packing01_rbf_independent.tsv', 'w') as f:
            for row in rows + [('', '', '', '')] + rows2:
                f.write('\t'.join(row) + '\n')


if __name__ == '__main__':
    main()
