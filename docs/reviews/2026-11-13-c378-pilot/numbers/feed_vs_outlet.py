#!/usr/bin/env python3
"""A CSTR's volumetric flow at its FEED (what the engine uses) against its OUTLET state (the
vessel's contents), both outside the engine (recompute_units.py's arithmetic).
usage: feed_vs_outlet.py <repo-root> <scratch-dir> <tag> <unit> <feedStream> <outStream> [<unitKey>]"""
import json, sys
R, S, tag, unit, fin, fout = sys.argv[1:7]
key = sys.argv[7] if len(sys.argv) > 7 else unit
sys.argv = [sys.argv[0], R, S]
g = {'__file__': S + '/recompute_units.py'}; exec(open(S + '/recompute_units.py').read().split('lines = []')[0], g)
d = S + '/runs/' + tag
r = json.load(open(d + '/result.json')); mwv = g['massless'](d)
res = []
for name in (fin, fout):
    st = r['streams'][name]
    comp = {c: x for c, x in st['composition'].items() if x > 0}
    sid = 'IAPWS95' if 'water' in comp else ''
    try:
        rho = g['my_rho'](d, sid, st['T'], st['P'], comp, mwv)
    except Exception as e:
        rho = float('nan')
    M = sum(x * r['componentMolarMass'][c] for c, x in comp.items()) / sum(comp.values()) / 1000
    Q = st['F'] * 1000 * M / rho
    res.append((name, st['T'], st['F'], st['F_mass'], rho, Q))
lines = [f'{tag} {unit}'] + [f'  {n}: T {T:.3f} F {F:.6e} kmol/s m {m:.6e} kg/s rho {rho:.3f} Q {Q:.6e} m3/s' for n, T, F, m, rho, Q in res]
lines.append(f'  Q_out/Q_feed - 1 = {res[1][5]/res[0][5]-1:+.4f};  tau published {r["kpis"][key]["tau_s"]:.4f}')
open(S + '/feed_vs_outlet.txt', 'a').write('\n'.join(lines) + '\n'); print('\n'.join(lines))
