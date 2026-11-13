#!/usr/bin/env python3
"""Item 3, corpus count: in the scratch runs of <scratch_dir>/<subdir>, every
converged stream that is PURE WATER (water the only component with x > 0),
liquid (vf == 0), within 0.5 K of the saturation temperature the CASE's own
water model gives at its pressure, and what consumes it.

The case's own saturation: the component record's Antoine (log10 P/bar = A -
B/(T + C), the form of data/standards/components/water.dat) read from the
case's constant/components/water.dat when present, else the standards record;
a case that selects `pureFluids { water ... }` is flagged (its equilibrium is
that formulation's, not the record's).  The reference equation's T_sat(P)
(IAPWS95, the record in data/standards/parameters/Helmholtz) is asked of the
engine for every candidate pressure in one props run.  The pilot's rule
refuses a one-constituent liquid set when T > T_sat_ref(P) + 1 mK.

Consumers come from the units' `in` / `inputs ( ... )` in every flowsheetDict
of the case (flat units with a `name`; leaf-folder units are listed as
'(leaf units not parsed)').

usage (repository root):
  python3 -I docs/reviews/2026-11-13-density-pilot-plan/item3_corpus.py <scratch_dir> <subdir> > item3_corpus.tsv
"""
import json, math, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import propscase as pc

scratch = os.path.abspath(sys.argv[1]); sub = sys.argv[2]
ROOT = os.getcwd()

def strip(t):
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    return re.sub(r'//[^\n]*', '', t)

def antoine(path):
    t = strip(open(path).read())
    m = re.search(r'vaporPressure\s*\{[^}]*model\s+(\w+)\s*;[^}]*coefficients\s*\(([^)]*)\)', t, re.S)
    if not m or m.group(1) != 'Antoine':
        return None
    return [float(v) for v in m.group(2).split()]

def tsat_antoine(c, P_Pa):
    A, B, C = c
    return B / (A - math.log10(P_Pa / 1e5)) - C

cands = []
for name in sorted(os.listdir(os.path.join(scratch, sub))):
    case = os.path.join(scratch, sub, name)
    rj = os.path.join(case, 'result.json')
    if not os.path.exists(rj):
        continue
    try:
        d = json.loads(open(rj).read().split('<<<Choupo:result-end>>>')[0])
    except Exception:
        continue
    wpath = None
    for dp, dn, fn in os.walk(case):
        if dp.endswith('constant/components') and 'water.dat' in fn:
            wpath = os.path.join(dp, 'water.dat'); break
    wpath = wpath or os.path.join(ROOT, 'data/standards/components/water.dat')
    coef = antoine(wpath)
    pure = False
    for dp, dn, fn in os.walk(case):
        if 'thermoPhysPropDict' in fn and re.search(r'pureFluids\s*\{[^}]*\bwater\b', strip(open(os.path.join(dp, 'thermoPhysPropDict')).read()), re.S):
            pure = True
    consumers = {}
    leaf = False
    for dp, dn, fn in os.walk(case):
        if 'flowsheetDict' not in fn:
            continue
        t = strip(open(os.path.join(dp, 'flowsheetDict')).read())
        if re.search(r'^type\s+\w+\s*;', t, re.M):
            leaf = True
        for m in re.finditer(r'\{\s*name\s+(\w+)\s*;\s*type\s+(\w+)\s*;(.*?)\n\s*\}', t, re.S):
            body = m.group(3)
            ins = []
            mi = re.search(r'\binputs\s*\(([^)]*)\)', body)
            if mi: ins = mi.group(1).split()
            mi = re.search(r'\bin\s+(\w+)\s*;', body)
            if mi: ins.append(mi.group(1))
            for s in ins:
                consumers.setdefault(s, []).append(f'{m.group(1)}({m.group(2)})')
    for sname, s in d.get('streams', {}).items():
        z = s.get('composition', {})
        present = [c for c, x in z.items() if x > 0]
        if present != ['water'] or s.get('vf') not in (0, 0.0):
            continue
        if not coef:
            continue
        T, P = s['T'], s['P']
        if not (P > 0):
            continue
        ts = tsat_antoine(coef, P)
        if abs(T - ts) <= 0.5:
            cons = consumers.get(sname.split('.')[-1], []) or (['(leaf units not parsed)'] if leaf else ['(none: product)'])
            cands.append((name, sname, T, P, ts, pure, ';'.join(cons)))

# reference T_sat for every candidate pressure
pressures = sorted({c[3] for c in cands})
ref = {}
if pressures:
    dcase = pc.make_case(scratch, 'corpus_ref', ['water'], pc.ROUTES['IAPWS95'])
    res, _ = pc.scan(dcase, [(p, [300.0]) for p in pressures], {'water': 1.0}, ['T_bubble'])
    for p, r in zip(pressures, res):
        ref[p] = r[300.0]['T_bubble'] if r else None
print('case\tstream\tT_K\tP_bar\tTsat_record_K\tTsat_IAPWS95_K\tT_minus_TsatRef_mK\tcase_selects_pureFluids\tpilot_rule\tconsumers')
for (n, s, T, P, ts, pure, cons) in cands:
    tr = ref.get(P)
    dm = (T - tr) * 1000 if tr else float('nan')
    rule = 'refused' if dm > 1.0 else 'priced'
    if pure:
        rule += ' (but pureFluids pins the method: rule on that formulation)'
    print(f'{n}\t{s}\t{T:.6f}\t{P/1e5:.6f}\t{ts:.6f}\t{tr:.6f}\t{dm:.2f}\t{pure}\t{rule}\t{cons}')
