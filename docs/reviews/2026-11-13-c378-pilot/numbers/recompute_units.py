#!/usr/bin/env python3
"""For each run under <scratch>/runs/<tag>/ (made by run_case.py): every liquid-density use
the result's propertySources records for a pump or a cstr, recomputed from OUTSIDE the
engine at the state it records (T, P) and the composition of the unit's inlet stream:
  idealMixing: rho = sum x_i M_i / sum_{not massless} x_i v_i, v_i anchored Rackett from the
  case's (or the catalogue's) component record, water by IAPWS-95 (own code) when the id
  names it; massWithoutVolume components = those of the case's approximations block.
Then the published KPI: pump rho = Mbar / v_molar_liq; CSTR rho = tau F_mass / V_R.
usage: recompute_units.py <repo-root> <scratch-dir> <tag> [<tag> ...]"""
import json, os, re, sys, importlib.util
from pathlib import Path
root, scratch = sys.argv[1], Path(sys.argv[2])
here = os.path.dirname(os.path.abspath(__file__))
def load(name, file):
    spec = importlib.util.spec_from_file_location(name, here + '/' + file)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
i95 = load('i95', 'iapws95.py'); rm = load('rm', 'rackett_mix.py')
C = i95.load(root)

def record(case, name):
    for p in list(Path(case).rglob(f'constant/components/{name}.dat')) + [Path(root) / f'data/standards/components/{name}.dat']:
        if p.exists():
            t = re.sub(r'/\*.*?\*/', '', p.read_text(), flags=re.S)
            def g(k):
                m = re.search(r'^\s*' + k + r'\s+([-\d.eE+]+)', t, re.M)
                return float(m.group(1)) if m else None
            return dict(MW=g('MW'), Tc=g('Tc'), Pc=g('Pc'), omega=g('omega'), Vliq=g('Vliq'), VliqT=g('VliqT'), path=str(p))
    raise KeyError(name)

def massless(case):
    out = set()
    for p in Path(case).rglob('constant/thermoPhysPropDict'):
        t = re.sub(r'//[^\n]*', '', p.read_text())
        m = re.search(r'massWithoutVolume\s*\{[^}]*components\s*\(([^)]*)\)', t, re.S)
        if m: out |= set(m.group(1).split())
    return out

def units(case):
    """unit -> (type, inlet stream, V_R) from every flowsheetDict (leaf names only)."""
    u = {}
    for p in Path(case).rglob('system/flowsheetDict'):
        t = re.sub(r'//[^\n]*', '', p.read_text())
        for m in re.finditer(r'name\s+(\w+);\s*type\s+(\w+);\s*in\s+(\w+);(?=(.{0,400}))', t, re.S):
            v = re.search(r'V_R\s+([\d.eE+-]+)', m.group(4))
            u[m.group(1)] = (m.group(2), m.group(3), float(v.group(1)) if v else None)
    return u

def my_rho(case, sid, T, P, comp, mwv):
    M = V = 0.0; s = sum(comp.values())
    for c, x in comp.items():
        x /= s; r = record(case, c)
        M += x * r['MW'] * 1e-3
        if c in mwv: continue
        if c == 'water' and 'IAPWS95' in sid:
            V += x * r['MW'] * 1e-3 / i95.rho_liquid(C, T, P)
        else:
            V += x * rm.vliq(r, T)
    return M / V

lines = []
for tag in sys.argv[3:]:
    d = scratch / 'runs' / tag
    res = json.load(open(d / 'result.json'))
    U = units(d); mwv = massless(d)
    for use in res['propertySources']['used']:
        if use['property'] != 'liquidDensity' or use['consumerType'] not in ('pump', 'cstr'): continue
        unit = use['unit']; leaf = unit.split('.')[-1]
        typ, sin, VR = U.get(leaf, (None, None, None))
        st = None
        for k, s in (res["streams"].items() if sin else []):
            if k == sin or k.endswith('.' + sin) or k.split('.')[-1] == sin:
                st = s; break
        if st is None:
            lines.append(f'{tag} {unit}: stream {sin} not found; skipped'); continue
        if use['TMin'] != use['TMax'] or use['PMin'] != use['PMax']:
            # several calls (a recycle): recompute at the converged inlet state
            use = dict(use, TMin=st['T'], PMin=st['P'], valueMin=float('nan'))
        comp = {c: x for c, x in st['composition'].items() if x > 0}
        T_, P_ = use['TMin'], use['PMin']
        mine = my_rho(d, use['sourceId'], use['TMin'], use['PMin'], comp, mwv)
        k = res['kpis'].get(unit) or res['kpis'].get(leaf) or {}
        if use['consumerType'] == 'pump':
            Mbar = sum(x * res['componentMolarMass'][c] for c, x in comp.items()) / sum(comp.values()) / 1000
            pub = Mbar / k['v_molar_liq']; what = 'Mbar/v_molar_liq'
        else:
            pub = k['tau_s'] * st['F_mass'] / VR; what = 'tau F_mass/V_R'
        if pub != pub: pass
        if use['valueMin'] != use['valueMin']: use['valueMin'] = mine
        lines.append(f'{tag} {unit} [{use["sourceId"]}] T {use["TMin"]:.4f} P {use["PMin"]:.6g}: '
                     f'kernel {use["valueMin"]:.6f}  mine {mine:.6f} ({mine/use["valueMin"]-1:+.1e})  '
                     f'published {what} {pub:.6f} ({pub/use["valueMin"]-1:+.1e})  stream T {st["T"]:.4f} P {st["P"]:.6g}')
open(scratch / 'recompute_units.txt', 'a').write('\n'.join(lines) + '\n')
print('\n'.join(lines))
