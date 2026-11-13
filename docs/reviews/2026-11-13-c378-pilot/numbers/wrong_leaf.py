#!/usr/bin/env python3
"""Would a wrong method still pass?  liquidDensity02 in a scratch copy with the ethanol
record's omega changed (Rackett's temperature shape only; the 25 C datum untouched), run at
the two states the gate's wiring arm uses (298.15 and 323.15 K, 1 bar).
usage: wrong_leaf.py <repo-root> <scratch-dir>"""
import sys, os, re, importlib.util, json
R, S = sys.argv[1], sys.argv[2]
spec = importlib.util.spec_from_file_location('rc', S + '/run_case.py')
rc = importlib.util.module_from_spec(spec); spec.loader.exec_module(rc)
out = []
for omega in ('0.6490', '0.0000'):
    for T in (298.15, 323.15):
        def edit(d, omega=omega, T=T):
            p = d / 'constant/components/ethanol.dat'
            p.write_text(re.sub(r'^omega\s+[\d.]+;', f'omega       {omega};', p.read_text(), flags=re.M))
            f = d / '0/feed'
            f.write_text(re.sub(r'^T\s+[^;]+;', f'T               {T} K;', f.read_text(), flags=re.M))
        code, res, log = rc.run(R, S, 'tutorials/steady/thermo/liquidDensity02_waterEthanol', f'wrong_{omega}_{T}', edit)
        if res is None:
            out.append(f'omega {omega} T {T}: exit {code}: ' + ' | '.join(l for l in log.splitlines() if 'seal' in l.lower() or 'ERROR' in l)[:400]); continue
        u = {x['unit']: x for x in res['propertySources']['used']}
        k = res['kpis']; st = res['streams']['feed']
        pump_rho = (st['F_mass'] / (st['F'] * 1000)) / k['P1']['v_molar_liq']
        out.append(f'omega {omega} T {T}: exit {code} pump rho {pump_rho:.4f} kernel {u["P1"]["valueMin"]:.4f} (unit = kernel: {abs(pump_rho/u["P1"]["valueMin"]-1):.1e})')
open(S + '/wrong_leaf.txt', 'w').write('\n'.join(out) + '\n'); print('\n'.join(out))
