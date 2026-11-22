#!/usr/bin/env python3
"""Cantera input for a Miller & Bowman transcription, with the SAME NASA-9 Cp Choupo reads.

    cantera_mech.py APP CASEDIR OUT.yaml     APP = A or B

1. ck2yaml (Cantera 3.2) on mb1989_app<APP>.inp with placeholder NASA-7 thermo
   (ck2yaml needs thermo to run; only the reactions are kept from it);
2. every species' thermo block is replaced by NASA-9 built from the Choupo record
   Choupo reads (case-local override, else RRHO-computed / NASA table / catalogue):
   the seven Cp coefficients as printed, a7 and a8 (integration constants) set so that
   H(298.15) = dHf_298 and S(298.15) = s_298 of that record (Choupo integrates Cp from
   the same anchors), the 1000-6000 K interval continuous in H and S at Tcommon.
"""
import os, re, subprocess, sys, math, tempfile
from ruamel import yaml as _y
yaml = _y.YAML(typ='safe'); yaml.default_flow_style = None
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
R = 8.314462618
SING = {'SCH2': '1CH2'}
def parse_formula(f):
    d = {}
    for m in re.finditer(r'([A-Z][a-z]?)(\d*)', f): d[m.group(1)] = d.get(m.group(1), 0) + int(m.group(2) or 1)
    return d
def record_path(case, name):
    for d in (os.path.join(case, 'constant/components'), os.path.join(ROOT, 'data/standards/thermoTables/RRHO-computed'),
              os.path.join(ROOT, 'data/standards/thermoTables/NASA-TP-2002-211556'), os.path.join(ROOT, 'data/standards/components')):
        p = os.path.join(d, name + '.dat')
        if os.path.exists(p): return p
    raise SystemExit('no record for ' + name)
def nums(s): return [float(x) for x in s.replace('(', ' ').replace(')', ' ').split()]
def read_record(p):
    t = open(p).read()
    f = re.search(r'^formula\s+(\S+);', t, re.M).group(1)
    h = float(re.search(r'dHf_298\s+(\S+);', t).group(1)); s = float(re.search(r's_298\s+(\S+);', t).group(1))
    blk = re.search(r'^idealGasHeatCapacity\s*\{(.*?)^\}', t, re.S | re.M).group(1)
    if 'polynomial' in blk and f == 'He':           # monatomic carrier: constant Cp, as the catalogue record
        cp = float(re.search(r'coefficients\s+\(\s*([0-9.eE+-]+)', blk).group(1)) / R
        return f, h, s, [0, 0, cp, 0, 0, 0, 0], [0, 0, cp, 0, 0, 0, 0], [200.0, 1000.0, 6000.0]
    assert 'NASA9' in blk, p
    lo = nums(re.search(r'low\s+\((.*?)\);', blk, re.S).group(1)); hi = nums(re.search(r'high\s+\((.*?)\);', blk, re.S).group(1))
    T = [float(re.search(k + r'\s+(\S+);', blk).group(1)) for k in ('Tlow', 'Tcommon', 'Thigh')]
    return f, h, s, lo, hi, T
def HS(c, T):  # H/R (K) and S/R of the cp polynomial with a7 = a8 = 0 (the integral without constants)
    a = c
    h = -a[0] / T + a[1] * math.log(T) + a[2] * T + a[3] * T**2 / 2 + a[4] * T**3 / 3 + a[5] * T**4 / 4 + a[6] * T**5 / 5
    s = -a[0] / (2 * T**2) - a[1] / T + a[2] * math.log(T) + a[3] * T + a[4] * T**2 / 2 + a[5] * T**3 / 3 + a[6] * T**4 / 4
    return h, s
def nasa9(h298, s298, lo, hi, T):
    h0, s0 = HS(lo, 298.15)
    b1 = h298 / R - h0; b2 = s298 / R - s0          # constants of the low interval
    hc, sc = HS(lo, T[1]); hc += b1; sc += b2
    h1, s1 = HS(hi, T[1])
    return [lo + [b1, b2], hi + [hc - h1, sc - s1]]
def main(app, case, out):
    inp = os.path.join(HERE, 'mb1989_app%s.inp' % app)
    txt = open(inp).read()
    names = re.search(r'SPECIES(.*?)END', txt, re.S).group(1).split()
    rec = {n: read_record(record_path(case, SING.get(n, n))) for n in names}
    th = ['THERMO ALL', '   200.000  1000.000  6000.000']
    for n in names:
        comp = parse_formula(rec[n][0])
        el = ''.join('%-2s%3d' % (k.upper(), v) for k, v in list(comp.items())[:4]).ljust(20)
        th.append('%-18s%-6s%-20sG%10.3f%10.3f%8.2f      1' % (n[:18], 'MB89', el, 200.0, 6000.0, 1000.0))
        for i in (2, 3, 4): th.append('%15.8E' * 5 % (1., 0., 0., 0., 0.) + '%5d' % i)
    th.append('END')
    d = tempfile.mkdtemp()
    open(d + '/mech.inp', 'w').write(txt.replace('REACTIONS', '\n'.join(th) + '\nREACTIONS', 1))
    r = subprocess.run(['/usr/local/bin/ck2yaml', '--input=' + d + '/mech.inp', '--output=' + d + '/m.yaml', '--no-validate'], capture_output=True, text=True)
    if r.returncode: sys.exit(r.stdout[-1500:] + r.stderr[-1500:])
    y = yaml.load(open(d + '/m.yaml'))
    for sp in y['species']:
        f, h, s, lo, hi, T = rec[sp['name']]
        a = nasa9(h * 1.0 / 1.0, s, lo, hi, T)
        sp['thermo'] = {'model': 'NASA9', 'reference-pressure': 1.0e5, 'temperature-ranges': [T[0], T[1], T[2]], 'data': a}
        # NASA9 in Cantera is in J/kmol basis through R: a-coefficients are dimensionless (H/R) -- fine
    y['phases'][0]['name'] = 'gas'
    yaml.dump(y, open(out, 'w'))
if __name__ == '__main__':
    main(*sys.argv[1:4])
