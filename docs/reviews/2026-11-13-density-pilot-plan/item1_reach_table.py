#!/usr/bin/env python3
"""Item 1: per pump / CSTR unit of the scratch runs made by run_reach_cases.py,
the inlet state, the density today's engine USED, and an independent
recomputation of the plan's "pilot, anchored leaves" column.

usage (repository root):
  python3 -I docs/reviews/2026-11-13-density-pilot-plan/item1_reach_table.py <scratch_dir> > item1_reach.tsv

today's density:
  pump  rho = dP / (head_m * g)          (Pump.cpp: head = dP/(rho g), g 9.80665)
  cstr  v = V_R / tau_s / F_in[mol/s]; rho = MW_mix(z_in) / v   (CSTR.cpp: Q = F v, tau = V_R/Q)
pilot "anchored leaves" (the plan's column): ideal mixing of molar volumes over
x > 0, each V_i(T) = Vliq * Rackett(T)/Rackett(298.15) (ThermoPackage.cpp
liquidMolarVolumeOf), Vliq / Tc / Pc / omega read from the component record the
case resolves (case constant/components first, then data/standards/components).
A component with Vliq and no criticals: flat Vliq.  T >= Tc: REFUSED.  No
Vliq and no criticals: no leaf (an ion: 'noVolume').
"""
import json, math, os, re, sys

ROOT = os.getcwd()
scratch = os.path.abspath(sys.argv[1])
G = 9.80665
R = 8.314462618

def rackett(T, Tc, Pc_Pa, w):
    Tr = T / Tc
    if Tr >= 1.0:
        return float('nan')
    Z = 0.29056 - 0.08775 * w
    return (R * Tc / Pc_Pa) * Z ** (1.0 + (1.0 - Tr) ** (2.0 / 7.0))

def strip_comments(t):
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    return re.sub(r'//[^\n]*', '', t)

def record(case, name):
    for dp, dn, fn in os.walk(case):
        if dp.endswith(os.path.join('constant', 'components')) and name + '.dat' in fn:
            return os.path.join(dp, name + '.dat')
    p = os.path.join(ROOT, 'data', 'standards', 'components', name + '.dat')
    return p if os.path.exists(p) else None

def facts(path):
    t = strip_comments(open(path, errors='replace').read())
    out = {}
    for k in ('MW', 'Tc', 'Pc', 'omega', 'Vliq'):
        m = re.search(r'^' + k + r'\s+([-+0-9.eE]+)\s*([A-Za-z/0-9^]*)\s*;', t, re.M)
        if m:
            v = float(m.group(1)); u = m.group(2)
            if k == 'Pc' and u in ('', 'bar'):
                v *= 1e5
            elif k == 'Pc' and u == 'Pa':
                pass
            elif k == 'Pc' and u == 'MPa':
                v *= 1e6
            out[k] = v
    return out

def units(case):
    res = []
    for dp, dn, fn in os.walk(case):
        if 'flowsheetDict' not in fn or '/iterations' in dp:
            continue
        t = strip_comments(open(os.path.join(dp, 'flowsheetDict')).read())
        for m in re.finditer(r'\{\s*name\s+(\w+)\s*;\s*type\s+(pump|cstr)\s*;(.*?)\n\s*\}', t, re.S):
            body = m.group(3)
            mi = re.search(r'\b(?:in|inputs)\s+\(?\s*(\w+)', body)
            res.append((m.group(1), m.group(2), mi.group(1) if mi else '?'))
    return res

# Leaf-folder units (a unit with its own folder, `type` at top level, no
# `name`): the unit is named by its folder and its inlet is given by the
# parent's `connections {}`; read by hand from the cases' flowsheetDicts.
LEAF = {
    'ChemicalPlantTutorial': [('Fermentor', 'cstr', 'FERMENTATION.Mixed')],
    'sugarPlantEconomicsSweep': [('Fermentor', 'cstr', 'FERMENTATION.Mixed')],
    'esterification2sector': [('reactor', 'cstr', 'Feed')],
}

def find(dct, key):
    if key in dct:
        return key
    c = [k for k in dct if k.split('.')[-1] == key]
    return c[0] if len(c) == 1 else (c[0] if c else None)

print('\t'.join(['case', 'unit', 'type', 'inletStream', 'T_K', 'P_bar', 'vf', 'composition(x>0)',
                 'rho_today', 'rho_anchored', 'change_pct', 'leaf_notes']))
for name in sorted(os.listdir(os.path.join(scratch, 'cases'))):
    case = os.path.join(scratch, 'cases', name)
    rj = os.path.join(case, 'result.json')
    if not os.path.exists(rj):
        print(f'{name}\t-\t-\t-\t-\t-\t-\t-\tNO RUN\t-\t-\t-')
        continue
    d = json.loads(open(rj).read().split('<<<Choupo:result-end>>>')[0])
    mwmap = d.get('componentMolarMass', {})
    for (u, typ, sin) in units(case) + LEAF.get(name, []):
        ku = find(d['kpis'], u)
        ks = find(d['streams'], sin)
        if not ku or not ks:
            print(f'{name}\t{u}\t{typ}\t{sin}\t(unit or stream not in result)'); continue
        k = d['kpis'][ku]; s = d['streams'][ks]
        z = s['composition']; T = s['T']; P = s['P']
        MW = sum(z[c] * mwmap[c] for c in z)
        if typ == 'pump':
            rho_today = k['dP'] / (k['head_m'] * G)
        else:
            Fmol = k['F_in_kmol_h'] / 3600.0 * 1000.0
            v = k['V_R'] / k['tau_s'] / Fmol
            rho_today = MW / 1000.0 / v
        V = 0.0; notes = []; refused = False; mw_vol = 0.0
        for c, x in z.items():
            if x <= 0: continue
            p = record(case, c)
            f = facts(p) if p else {}
            if 'Vliq' in f and 'Tc' in f and 'Pc' in f:
                if T >= f['Tc']:
                    refused = True; notes.append(f'{c}:T>=Tc({f["Tc"]})x={x:.3g}'); continue
                vi = f['Vliq'] * rackett(T, f['Tc'], f['Pc'], f.get('omega', 0.0)) / rackett(298.15, f['Tc'], f['Pc'], f.get('omega', 0.0))
            elif 'Vliq' in f:
                vi = f['Vliq']; notes.append(f'{c}:flatVliq')
            elif 'Tc' in f and 'Pc' in f:
                if T >= f['Tc']:
                    refused = True; notes.append(f'{c}:T>=Tc(bare)x={x:.3g}'); continue
                vi = rackett(T, f['Tc'], f['Pc'], f.get('omega', 0.0)); notes.append(f'{c}:bareRackett')
            else:
                notes.append(f'{c}:noVolume x={x:.3g}'); continue
            V += x * vi; mw_vol += x * mwmap[c]
        if refused:
            ra = 'REFUSED'; ch = '-'
        else:
            ra_v = (MW / 1000.0) / V   # all mass over the volumes found (massWithoutVolume reading)
            ra = f'{ra_v:.4f}'; ch = f'{(ra_v/rho_today-1)*100:+.3f}'
        comp = ' '.join(f'{c}={x:.4g}' for c, x in z.items() if x > 0)
        print(f'{name}\t{u}\t{typ}\t{ks}\t{T:.6f}\t{P/1e5:.6f}\t{s.get("vf")}\t{comp}\t{rho_today:.4f}\t{ra}\t{ch}\t{";".join(notes)}')
