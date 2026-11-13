#!/usr/bin/env python3
"""The anchored-Rackett liquid molar volume, written out independently of the
engine, under the rule of the parent line (datum at 298.15 K) and under the
branch's rule (datum at the record's VliqT).

usage: rackett_before_after.py KEYS_TSV CURVE_TSV OUT_TSV COMPONENT:T[,T...] ...

Rule (src/thermo/ThermoPackage.cpp, liquidMolarVolumeOf; closure in
src/thermo/DerivedClosures.H, rackettVliq):
    Vr(T) = (R Tc / Pc) * Zra^(1 + (1 - T/Tc)^(2/7)),  Zra = 0.29056 - 0.08775 omega
    V(T)  = Vliq * Vr(T) / Vr(T_datum)
before: T_datum = 298.15 K (NaN when 298.15 >= Tc: (1-Tr)^(2/7) of a negative
number -- the engine refused there); after: T_datum = VliqT.
The measured column is the ThermoML saturated/near-saturated curve from
measured_vs_stored.py, ln V interpolated, never extrapolated.
"""
import math, sys
sys.path.insert(0, __import__('os').path.dirname(__file__))
from measured_vs_stored import load_keys  # noqa: E402

R = 8.314462618


def rackett(T, Tc, Pc_bar, omega):
    Tr = T / Tc
    if Tr >= 1.0:
        return float('nan')
    Zra = 0.29056 - 0.08775 * omega
    return (R * Tc / (Pc_bar * 1e5)) * Zra ** (1.0 + (1.0 - Tr) ** (2.0 / 7.0)) * 1e6


def main():
    keys = load_keys(sys.argv[1])
    curve = {}
    for line in open(sys.argv[2]).readlines()[1:]:
        f = line.split('\t')
        curve.setdefault(f[0], []).append((float(f[1]), float(f[2]), f[8]))
    with open(sys.argv[3], 'w') as fo:
        fo.write('component\tT_K\tM\tVliq_stored\tVliqT\tV_before_cm3\trho_before_kg_m3\t'
                 'V_after_cm3\trho_after_kg_m3\tchange_in_rho_pct\tV_measured_cm3\t'
                 'rho_before_vs_measured_pct\trho_after_vs_measured_pct\tmeasured_dois\tstatus\n')
        for arg in sys.argv[4:]:
            name, Ts = arg.split(':')
            k = keys[name]
            for T in map(float, Ts.split(',')):
                Vb = k['Vliq'] * rackett(T, k['Tc'], k['Pc'], k['omega']) / rackett(298.15, k['Tc'], k['Pc'], k['omega'])
                Va = k['Vliq'] * rackett(T, k['Tc'], k['Pc'], k['omega']) / rackett(k['VliqT'], k['Tc'], k['Pc'], k['omega'])
                c = sorted(curve.get(name, []))
                Vm, dois = float('nan'), ''
                for a, b in zip(c, c[1:]):
                    if a[0] <= T <= b[0]:
                        w = (T - a[0]) / (b[0] - a[0])
                        Vm = math.exp((1 - w) * math.log(a[1]) + w * math.log(b[1]))
                        dois = ','.join(sorted(set(a[2].split(',') + b[2].split(','))))
                        break
                rb = 1000 * k['M'] / Vb if Vb == Vb else float('nan')
                ra = 1000 * k['M'] / Va
                rm = 1000 * k['M'] / Vm if Vm == Vm else float('nan')
                fmt = lambda x, p='%.3f': (p % x) if x == x else 'n/a'
                fo.write('\t'.join([name, '%g' % T, '%g' % k['M'], '%g' % k['Vliq'], '%g' % k['VliqT'],
                                    fmt(Vb), fmt(rb, '%.2f'), fmt(Va), fmt(ra, '%.2f'),
                                    fmt((rb / ra - 1) * 100, '%+.2f'), fmt(Vm),
                                    fmt((rb / rm - 1) * 100, '%+.2f'), fmt((ra / rm - 1) * 100, '%+.2f'),
                                    dois or '-',
                                    'transcribedNotCheckedAgainstArticle' if dois else '-']) + '\n')


if __name__ == '__main__':
    main()
