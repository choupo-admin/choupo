#!/usr/bin/env python3
"""Item 5, D1: the twelve printed anchors of
data/curation/batches/density_pilot/d1_anchors.tsv against today's engine on
three routes (record = the generic route; IF97; IAPWS95), plus the reference
equation evaluated at 1 bar instead of P (a 'pressure dropped' implementation),
and the plan's liquid-branch rule at each anchor: T_sat_IAPWS95(p_anchor) and
whether T > T_sat + 1 mK (the rule would REFUSE the anchor's state).

usage (repository root):
  python3 -I docs/reviews/2026-11-13-density-pilot-plan/item5_d1.py <scratch_dir> > item5_d1.tsv
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import propscase as pc
scratch = os.path.abspath(sys.argv[1])
rows = []
for l in open('data/curation/batches/density_pilot/d1_anchors.tsv'):
    if l.startswith('#') or l.startswith('kind'):
        continue
    f = l.rstrip('\n').split('\t')
    rows.append((f[0], float(f[1]), float(f[2]) * 1e6, float(f[3])))
res = {}
for route in ('record', 'IF97', 'IAPWS95'):
    d = pc.make_case(scratch, 'd1_' + route, ['water'], pc.ROUTES[route])
    out, _ = pc.scan(d, [(p, [T]) for (_, T, p, _) in rows], {'water': 1.0}, ['rho_liquid_water', 'T_bubble', 'Psat_water'])
    res[route] = [o[T] if o else {} for o, (_, T, _, _) in zip(out, rows)]
    out1, _ = pc.scan(d, [(1e5, [T]) for (_, T, p, _) in rows], {'water': 1.0}, ['rho_liquid_water'])
    res[route + '@1bar'] = [o[T] if o else {} for o, (_, T, _, _) in zip(out1, rows)]
print('kind\tT_K\tp_Pa\trho_printed\tdev_record_pct\tdev_IF97_pct\tdev_IAPWS95_pct\tdev_IAPWS95_at_1bar_pct\t'
      'Psat_IAPWS95(T)_Pa\tTsat_IAPWS95(p)_K\tT_minus_Tsat_mK\tplan_rule')
mx = {}
for k, (kind, T, p, r) in enumerate(rows):
    def dev(route):
        v = res[route][k].get('rho_liquid_water')
        return None if v is None else (v / r - 1) * 100
    ts = res['IAPWS95'][k].get('T_bubble'); ps = res['IAPWS95'][k].get('Psat_water')
    dm = (T - ts) * 1000 if ts else float('nan')
    rule = 'REFUSED (T > Tsat(p) + 1 mK)' if dm > 1 else 'priced'
    vals = [dev('record'), dev('IF97'), dev('IAPWS95'), dev('IAPWS95@1bar')]
    for nm, v in zip(('record', 'IF97', 'IAPWS95', 'IAPWS95@1bar'), vals):
        if v is not None:
            mx[nm] = max(mx.get(nm, 0), abs(v))
    f = lambda v: 'None' if v is None else f'{v:+.5f}'
    print(f'{kind}\t{T}\t{p:.1f}\t{r}\t' + '\t'.join(f(v) for v in vals) + f'\t{ps}\t{ts}\t{dm:.2f}\t{rule}')
print('# max |dev| %: ' + ', '.join(f'{k} {v:.5f}' for k, v in mx.items()))
