#!/usr/bin/env python3
"""ChemicalPlantTutorial's Fermentor: its liquid density at the converged feed (FERMENTATION.Mixed),
recomputed outside the engine; tau = V rho / m_dot against the published tau.
usage: fermentor.py <repo-root> <scratch-dir>"""
import json, sys, importlib.util, os
R, S = sys.argv[1], sys.argv[2]
sys.argv = [sys.argv[0], R, S]
spec = importlib.util.spec_from_file_location('ru', S + '/recompute_units.py')
src = open(S + '/recompute_units.py').read().split('lines = []')[0]
g = {'__file__': S + '/recompute_units.py'}; exec(src, g)
d = S + '/runs/tutorials_plant_ChemicalPlantTutorial'
r = json.load(open(d + '/result.json'))
st = r['streams']['FERMENTATION.Mixed']
comp = {c: x for c, x in st['composition'].items() if x > 0}
mwv = g['massless'](d)
rho = g['my_rho'](d, 'IAPWS95', st['T'], st['P'], comp, mwv)
M = sum(x * r['componentMolarMass'][c] for c, x in comp.items()) / 1000
w_mwv = sum(comp[c] * r['componentMolarMass'][c] for c in comp if c in mwv) / 1000 / M
tau = 5.0 * rho / st['F_mass']
out = [f'comp {comp}', f'T {st["T"]} P {st["P"]} F_mass {st["F_mass"]} massless {mwv} w_massless {w_mwv:.3e}',
       f'mine rho {rho:.6f}  tau {tau:.6f}  published tau {r["kpis"]["FERMENTATION.Fermentor"]["tau_s"]:.6f} rel {tau/r["kpis"]["FERMENTATION.Fermentor"]["tau_s"]-1:+.2e}']
for c in comp: out.append(f'  {c}: {g["record"](d, c)}')
open(S + '/fermentor.txt', 'w').write('\n'.join(out) + '\n'); print('\n'.join(out))
