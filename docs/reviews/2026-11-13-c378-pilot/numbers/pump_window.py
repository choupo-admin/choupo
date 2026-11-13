#!/usr/bin/env python3
"""liquidDensity01 fed pure water at 450 K, 0.97 MPa: above IAPWS-95's p_sat (0.932 MPa),
below the package's Antoine p_sat (1.0145 MPa).  What phase does the stream carry, and what
density does the pump use?  usage: pump_window.py <repo-root> <scratch-dir>"""
import sys, re, importlib.util
R, S = sys.argv[1], sys.argv[2]
spec = importlib.util.spec_from_file_location('rc', S + '/run_case.py')
rc = importlib.util.module_from_spec(spec); spec.loader.exec_module(rc)
out = []
for tag, extra in (('undeclared', ''), ('liquid', 'phase liquid;\n')):
    def edit(d, extra=extra):
        f = d / '0/feed'; s = f.read_text()
        s = re.sub(r'^T\s+[^;]+;', 'T               450 K;', s, flags=re.M)
        s = re.sub(r'^P\s+[^;]+;', 'P               970000 Pa;', s, flags=re.M)
        f.write_text(s + extra)
    code, res, log = rc.run(R, S, 'tutorials/steady/thermo/liquidDensity01_water', 'window_' + tag, edit)
    if res is None:
        out.append(f'{tag}: exit {code}: ' + ' | '.join(l.strip() for l in log.splitlines() if 'ERROR' in l or 'refus' in l.lower() or 'vapour' in l.lower())[:600]); continue
    st = res['streams']['feed']; k = res['kpis']['P1']
    out.append(f"{tag}: exit {code} feed vf {st['vf']} pump v {k['v_molar_liq']:.6e} rho {0.018015/k['v_molar_liq']:.3f} "
               + ' | '.join(l.strip() for l in log.splitlines() if '[liquid density]' in l)[:300])
open(S + '/pump_window.txt', 'w').write('\n'.join(out) + '\n'); print('\n'.join(out))
