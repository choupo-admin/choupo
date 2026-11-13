#!/usr/bin/env python3
"""liquidDensity01 with a pureFluids selection for water (IF97, then Helmholtz IAPWS95):
does the plant's first law close, and what density / tau / dT result?
usage: ld01_purefluid.py <repo-root> <scratch-dir>"""
import sys, os, importlib.util, json
root, scratch = sys.argv[1], sys.argv[2]
here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('rc', here + '/run_case.py')
rc = importlib.util.module_from_spec(spec); spec.loader.exec_module(rc)
out = []
for tag, sel in (('none', None), ('IF97', 'method IF97;'), ('Helmholtz', 'method Helmholtz; equation IAPWS95;')):
    def edit(d, sel=sel):
        if sel:
            p = d / 'constant/thermoPhysPropDict'
            p.write_text(p.read_text() + '\npureFluids\n{\n    water { ' + sel + ' }\n}\n')
    code, res, log = rc.run(root, scratch, 'tutorials/steady/thermo/liquidDensity01_water', 'ld01_' + tag, edit)
    if res is None:
        out.append(f'{tag}: exit {code}: ' + log.strip().splitlines()[-1][:300]); continue
    k, g = res['kpis'], res['globalEnergyBoundary']
    src = [s for s in res.get('propertySources', [])] if isinstance(res.get('propertySources'), list) else res.get('propertySources')
    out.append(f"{tag}: exit {code} pump v {k['P1']['v_molar_liq']:.10e} dT {k['P1']['dT']:.6f} W_shaft {k['P1']['W_shaft']:.4f} "
               f"tau {k['R1']['tau_s']:.6f} residual_kW {g['residual_kW']:.6g} residual_pct {g['residual_pct']:.4f}")
open(scratch + '/ld01_purefluid.txt', 'w').write('\n'.join(out) + '\n'); print('\n'.join(out))
