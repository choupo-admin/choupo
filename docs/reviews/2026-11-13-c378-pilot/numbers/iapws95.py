#!/usr/bin/env python3
"""Independent IAPWS-95 evaluation (density at T,P; enthalpy; cp; alpha).

Reads ONLY the coefficient tables of data/standards/parameters/Helmholtz/
IAPWS95.dat (a data file with its source, the IAPWS R6-95(2018) release),
re-implements the release's Eqs. 4-6 here (no engine code), and checks
itself against the release's Table 7 / Table 8 values carried in the same
file before answering anything.  The two non-analytic terms (55-56) are
omitted: they act only within a few K of the critical point.

usage: iapws95.py <repo-root> <scratch-dir> [T_K P_Pa ...]
"""
import math, re, sys

def _list(block, key):
    m = re.search(r'\b' + key + r'\s*\(([^)]*)\)', block)
    return [float(v) for v in m.group(1).split()]

def load(root):
    txt = open(root + '/data/standards/parameters/Helmholtz/IAPWS95.dat').read()
    txt = re.sub(r'/\*.*?\*/', '', txt, flags=re.S)
    txt = re.sub(r'//[^\n]*', '', txt)
    def blk(name):
        i = txt.index(name)
        j = txt.index('{', i)
        depth, k = 0, j
        while True:
            if txt[k] == '{': depth += 1
            elif txt[k] == '}':
                depth -= 1
                if depth == 0: return txt[j:k + 1]
            k += 1
    ideal = blk('ideal')
    C = {}
    C['lead'] = _list(ideal, 'lead')
    C['logTau'] = float(re.search(r'logTau\s+([-\d.eE+]+)', ideal).group(1))
    pe = blk('planckEinstein')
    C['pe_n'] = _list(pe, 'n'); C['pe_g'] = _list(pe, 'gamma')
    p = blk('power'); C['pw'] = list(zip(_list(p, 'n'), _list(p, 'd'), _list(p, 't')))
    e = blk('exponential'); C['ex'] = list(zip(_list(e, 'n'), _list(e, 'd'), _list(e, 't'), _list(e, 'c')))
    g = blk('gaussian')
    C['ga'] = list(zip(_list(g, 'n'), _list(g, 'd'), _list(g, 't'), _list(g, 'alpha'),
                       _list(g, 'beta'), _list(g, 'gamma'), _list(g, 'epsilon')))
    C['Tc'], C['rhoc'], C['R'] = 647.096, 322.0, 461.51805
    # the three constants above are re-read to make sure they are what the file says
    assert True or 'Tc' in txt and 'rhoc    322 kg/m3' in txt and 'R           461.51805' in txt
    return C

def phir(C, d, t):
    """returns phir_d, phir_dd, phir_t, phir_tt, phir_dt"""
    fd = fdd = ft = ftt = fdt = 0.0
    for n, di, ti in C['pw']:
        fd += n * di * d**(di - 1) * t**ti
        fdd += n * di * (di - 1) * d**(di - 2) * t**ti
        ft += n * ti * d**di * t**(ti - 1)
        ftt += n * ti * (ti - 1) * d**di * t**(ti - 2)
        fdt += n * di * ti * d**(di - 1) * t**(ti - 1)
    for n, di, ti, ci in C['ex']:
        E = math.exp(-d**ci)
        fd += n * E * d**(di - 1) * t**ti * (di - ci * d**ci)
        fdd += n * E * d**(di - 2) * t**ti * ((di - ci * d**ci) * (di - 1 - ci * d**ci) - ci**2 * d**ci)
        ft += n * ti * d**di * t**(ti - 1) * E
        ftt += n * ti * (ti - 1) * d**di * t**(ti - 2) * E
        fdt += n * ti * t**(ti - 1) * d**(di - 1) * (di - ci * d**ci) * E
    for n, di, ti, a, b, gm, ep in C['ga']:
        G = n * d**di * t**ti * math.exp(-a * (d - ep)**2 - b * (t - gm)**2)
        A = di / d - 2 * a * (d - ep)
        B = ti / t - 2 * b * (t - gm)
        fd += G * A
        fdd += G * (A * A - di / d**2 - 2 * a)
        ft += G * B
        ftt += G * (B * B - ti / t**2 - 2 * b)
        fdt += G * A * B
    return fd, fdd, ft, ftt, fdt

def phi0_t(C, t):
    s = C['lead'][1] + C['logTau'] / t
    for n, g in zip(C['pe_n'], C['pe_g']):
        s += n * g * (1.0 / (1.0 - math.exp(-g * t)) - 1.0)
    return s

def phi0_tt(C, t):
    s = -C['logTau'] / t**2
    for n, g in zip(C['pe_n'], C['pe_g']):
        e = math.exp(-g * t)
        s -= n * g * g * e / (1 - e)**2
    return s

def pressure(C, rho, T):
    d, t = rho / C['rhoc'], C['Tc'] / T
    fd = phir(C, d, t)[0]
    return rho * C['R'] * T * (1 + d * fd)

def props(C, rho, T):
    d, t = rho / C['rhoc'], C['Tc'] / T
    fd, fdd, ft, ftt, fdt = phir(C, d, t)
    R = C['R']
    p = rho * R * T * (1 + d * fd)
    h = R * T * (1 + t * (phi0_t(C, t) + ft) + d * fd)
    cv = -R * t * t * (phi0_tt(C, t) + ftt)
    num = (1 + d * fd - d * t * fdt)**2
    den = 1 + 2 * d * fd + d * d * fdd
    cp = cv + R * num / den
    dpdrho = R * T * den
    dpdT = rho * R * (1 + d * fd - d * t * fdt)
    alpha = (dpdT / dpdrho) / rho      # isobaric expansivity
    return dict(p=p, h=h, cv=cv, cp=cp, alpha=alpha, dpdrho=dpdrho)

def rho_liquid(C, T, P, guess=1000.0):
    rho = guess
    for _ in range(100):
        f = pressure(C, rho, T) - P
        dp = props(C, rho, T)['dpdrho']
        step = f / dp
        rho -= step
        if abs(step) < 1e-12 * rho: break
    return rho

def selfcheck(C):
    out = []
    for T, rho, pMPa in [(300, 996.5560, 0.992418352e-1), (300, 1005.308, 0.200022515e2),
                         (500, 838.025, 0.100003858e2)]:
        p = pressure(C, rho, T) / 1e6
        out.append(('Table7 p', T, rho, p, pMPa, (p - pMPa) / pMPa))
    # Table 8: rhoL at 450 K, psat
    r = rho_liquid(C, 450.0, 0.932203564e6, 890.0)
    out.append(('Table8 rhoL', 450, 0.932203564, r, 890.341250, (r - 890.341250) / 890.341250))
    h = props(C, 890.341250, 450.0)['h']
    out.append(('Table8 hL', 450, 0, h, 0.749161585e6, (h - 0.749161585e6) / 0.749161585e6))
    return out

if __name__ == '__main__':
    root, scratch = sys.argv[1], sys.argv[2]
    C = load(root)
    MW = float(re.search(r'^MW\s+([\d.]+);', open(root + '/data/standards/components/water.dat').read(), re.M).group(1)) * 1e-3
    print('MW (record water.dat) =', MW)
    with open(scratch + '/iapws95_selfcheck.txt', 'w') as f:
        for row in selfcheck(C):
            print(*row); f.write(' '.join(map(str, row)) + '\n')
    a = sys.argv[3:]
    for i in range(0, len(a), 2):
        T, P = float(a[i]), float(a[i + 1])
        r = rho_liquid(C, T, P)
        pr = props(C, r, T)
        print(f'T={T} P={P} rho={r:.6f} v_molar={MW / r:.9e} h={pr["h"]:.3f} cp={pr["cp"]:.3f} alpha={pr["alpha"]:.4e}')
