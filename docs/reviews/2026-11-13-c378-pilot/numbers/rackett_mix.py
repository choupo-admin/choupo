#!/usr/bin/env python3
"""Ideal-mixing liquid density from the component records, my own arithmetic.

v_i(T) = Vliq_i * R(T)/R(Tref),  R(T) = (R Tc/Pc) Zra^(1+(1-T/Tc)^(2/7)),
Zra = 0.29056 - 0.08775 omega (the Rackett form, stated, read off the
records' Tc, Pc, omega, Vliq); water optionally on IAPWS-95 (iapws95.py).
rho_mix = sum x_i M_i / sum x_i v_i.

usage: rackett_mix.py <repo-root> <scratch-dir> T P comp:x comp:x ... [--water95]
"""
import re, sys, importlib.util, os

def rec(root, name):
    t = open(f'{root}/data/standards/components/{name}.dat').read()
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    def g(k):
        m = re.search(r'^\s*' + k + r'\s+([-\d.eE+]+)', t, re.M)
        return float(m.group(1)) if m else None
    return dict(MW=g('MW'), Tc=g('Tc'), Pc=g('Pc'), omega=g('omega'), Vliq=g('Vliq'), VliqT=g('VliqT'))

def rackett(T, Tc, Pc_Pa, w):
    Z = 0.29056 - 0.08775 * w
    return 8.314462618 * Tc / Pc_Pa * Z ** (1 + (1 - T / Tc) ** (2 / 7))

def vliq(r, T):
    if not (r['Tc'] and r['Pc']):
        return r['Vliq']          # no critical constants: the datum held flat
    Tref = r['VliqT'] or 298.15
    return r['Vliq'] * rackett(T, r['Tc'], r['Pc'] * 1e5, r['omega']) / rackett(Tref, r['Tc'], r['Pc'] * 1e5, r['omega'])

def main():
    root, scratch, T, P = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
    w95 = '--water95' in sys.argv
    comps = [a.split(':') for a in sys.argv[5:] if ':' in a]
    xs = {c: float(x) for c, x in comps}
    s = sum(xs.values()); xs = {c: x / s for c, x in xs.items()}
    if w95:
        here = os.path.dirname(os.path.abspath(__file__))
        spec = importlib.util.spec_from_file_location('i95', here + '/iapws95.py')
        m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
        C = m.load(root)
    M = V = 0.0
    lines = []
    for c, x in xs.items():
        r = rec(root, c)
        if w95 and c == 'water':
            v = r['MW'] * 1e-3 / m.rho_liquid(C, T, P)
        else:
            v = vliq(r, T)
        M += x * r['MW'] * 1e-3; V += x * v
        lines.append(f'{c} x={x:.6f} MW={r["MW"]} v={v:.6e} rho_i={r["MW"]*1e-3/v:.3f}')
    out = '\n'.join(lines) + f'\nT={T} P={P} Mbar={M:.6e} vbar={V:.6e} rho={M / V:.4f}\n'
    print(out, end='')
    with open(scratch + '/rackett_mix.log', 'a') as f: f.write(' '.join(sys.argv[3:]) + '\n' + out)

if __name__ == '__main__':
    main()
