#!/usr/bin/env python3
"""The six records the branch leaves unresolved (propane, propylene, H2O2,
HCHO, HCN, NO2) against the measured liquid volumes the ThermoML mirror holds.

usage: unresolved_six.py KEYS_TSV CURVE_TSV ENGINE_RHO_TSV OUT_TSV
  ENGINE_RHO_TSV: component<TAB>T_K<TAB>rho_kg_m3 as printed by the engine
                  (rho_liquid_<component> of a choupoProps propertyPoint), or
                  'refused: <message>' in the rho column.
For each: the temperature at which the measured saturated-liquid molar volume
equals the stored Vliq (ln V linear in T between the bracketing measured
points), the measured volume at the normal boiling point Tb of the record,
and the engine's 298.15 K liquid density against the measured one there.
"""
import math, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
from measured_vs_stored import load_keys  # noqa: E402

SIX = ('propane', 'propylene', 'H2O2', 'HCHO', 'HCN', 'NO2')


def piecewise(c, x, key_in, key_out):
    for a, b in zip(c, c[1:]):
        lo, hi = sorted((a[key_in], b[key_in]))
        if lo <= x <= hi and a[key_in] != b[key_in]:
            if key_in == 'T':
                w = (x - a['T']) / (b['T'] - a['T'])
                return math.exp((1 - w) * math.log(a['V']) + w * math.log(b['V'])), (a, b)
            w = (math.log(x) - math.log(a['V'])) / (math.log(b['V']) - math.log(a['V']))
            return a['T'] + w * (b['T'] - a['T']), (a, b)
    return None, None


def main():
    keys = load_keys(sys.argv[1])
    curves = {}
    for line in open(sys.argv[2]).readlines()[1:]:
        f = line.rstrip('\n').split('\t')
        curves.setdefault(f[0], []).append(dict(T=float(f[1]), V=float(f[2]), U=float(f[5]), dois=f[8]))
    eng = {}
    for line in open(sys.argv[3]):
        f = line.rstrip('\n').split('\t')
        eng[(f[0], float(f[1]))] = f[2]
    repo_tb = {}
    with open(sys.argv[4], 'w') as fo:
        fo.write('component\tinchikey\tM\tstored_Vliq_cm3\tT_where_measured_equals_stored_K\tbracketing_points\t'
                 'Tb_record_K\tmeasured_V_at_Tb_cm3\tstored_vs_Tb_pct\tmeasured_V_at_298.15_cm3\t'
                 'measured_rho_at_298.15\tengine_rho_at_298.15\tengine_vs_measured_pct\tmax_stated_U_cm3\tdois\tstatus\n')
        for n in SIX:
            k = keys[n]
            c = sorted(curves.get(n, []), key=lambda p: p['T'])
            Te, br = piecewise(c, k['Vliq'], 'V', 'T')
            Tb = k.get('Tb', float('nan'))
            Vtb, _ = piecewise(c, Tb, 'T', 'V') if Tb == Tb else (None, None)
            V298, br298 = piecewise(c, 298.15, 'T', 'V')
            er = eng.get((n, 298.15), 'not run')
            try:
                erf = float(er)
            except ValueError:
                erf = None
            rm = 1000 * k['M'] / V298 if V298 else None
            pts = list((br or ())) + list((br298 or ()))
            dois = sorted(set(d for p in pts for d in p['dois'].split(',')))
            fo.write('\t'.join([
                n, k['key'], '%g' % k['M'], '%g' % k['Vliq'],
                '%.2f' % Te if Te else ('no measured liquid volume in the mirror' if not c else 'not bracketed'),
                ';'.join('%.2fK:%.3f' % (p['T'], p['V']) for p in pts) or '-',
                '%g' % Tb, '%.3f' % Vtb if Vtb else '-',
                '%+.2f' % ((k['Vliq'] / Vtb - 1) * 100) if Vtb else '-',
                '%.3f' % V298 if V298 else '-', '%.2f' % rm if rm else '-',
                er, '%+.2f' % ((erf / rm - 1) * 100) if (erf and rm) else '-',
                '%.4f' % max((p['U'] for p in pts), default=float('nan')) if pts else '-',
                ','.join(dois) or '-',
                'transcribedNotCheckedAgainstArticle' if dois else '-']) + '\n')


if __name__ == '__main__':
    main()
