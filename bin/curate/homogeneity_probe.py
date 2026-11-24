#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""homogeneity_probe -- a MEASUREMENT tool, not a gate; NOT wired into bin/runTests.

A steady flowsheet specified only by intensive quantities is homogeneous of degree
one in its feeds: scale every feed's flow by k and every extensive result scales by
k while every intensive one is unchanged.  This tool copies a case into
build/homog/<case>.base and .x2 (a plain copy: the copy reads the catalogue through
CHOUPO_HOME, as the engine does), multiplies the flows of the named feed streams in
the x2 copy's 0/ by k, runs both, and compares the result JSON (streams, kpis,
globalEnergyBoundary).  Report: docs/audits/2026-11-24-homogeneity.md.

  homogeneity_probe.py <case> <feed1,feed2,...> [--k=2] [--tol=1e-8] [--seeds]

  --seeds   scale every other 0/ stream too (tear seeds)
  HOM_BIN   environment: the binary to run (default build/linux64Gcc/choupoSolve)

A case with a DECLARED size or extensive quantity (area, volume, Q, W_shaft, a fixed
product rate) breaks the property by design: it is NOT JUDGED, and the tool cannot
tell -- read the flowsheetDict first.  KPIs it cannot classify by name are listed as
UNC with their observed ratio; they are never counted as violations.
"""
import sys, re, os, json, subprocess, shutil
from pathlib import Path
WT = Path(__file__).resolve().parents[2]

FLOWKEYS = ('componentMolarFlows', 'speciesMolarFlows', 'componentMassFlows')

def scale_text(txt, k):
    """multiply the entries of every componentMolarFlows/speciesMolarFlows block by k."""
    out = []; depth = 0; inblk = None; pend = None
    lines = txt.split('\n')
    for ln in lines:
        s = re.sub(r'//.*', '', ln)
        mi = re.search(r'\b(' + '|'.join(FLOWKEYS) + r')\s*\{([^{}]*)\}', ln)
        if mi:
            body = re.sub(r'([A-Za-z0-9_\-\+\(\)\[\]]+\s+)([-+0-9.eE]+)(\s*[A-Za-z0-9/]*\s*;)', lambda m: m.group(1) + repr(float(m.group(2)) * k) + m.group(3), mi.group(2))
            ln = ln[:mi.start(2)] + body + ln[mi.end(2):]
            out.append(ln); depth += s.count('{') - s.count('}'); continue
        if inblk is None and re.search(r'\b(' + '|'.join(FLOWKEYS) + r')\b', s):
            pend = depth
        if inblk is None and pend is not None and '{' in s:
            inblk = pend; pend = None
        if inblk is not None:
            m = re.match(r'^(\s*[A-Za-z0-9_\-\+\(\)\[\]]+\s+)([-+0-9.eE]+)(\s*[A-Za-z0-9/]*\s*;.*)$', ln)
            if m and not re.search(r'\b(' + '|'.join(FLOWKEYS) + r')\b', s):
                ln = m.group(1) + repr(float(m.group(2)) * k) + m.group(3)
        depth += s.count('{') - s.count('}')
        if inblk is not None and depth <= inblk:
            inblk = None
        out.append(ln)
    return '\n'.join(out)

def run(d):
    p = subprocess.run([os.environ.get('HOM_BIN', str(WT / 'build/linux64Gcc/choupoSolve')), '.'], cwd=d, env=dict(os.environ, CHOUPO_HOME=str(WT)), capture_output=True, text=True, timeout=3000)
    (Path(d) / 'out.txt').write_text(p.stdout); (Path(d) / 'err.txt').write_text(p.stderr)
    m = re.search(r'<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>', p.stdout, re.S)
    if not m:
        return None, (p.stderr.strip().split('\n') or [''])[-1][:300] + ' | ' + (p.stdout.strip().split('\n') or [''])[-1][:200]
    return json.loads(m.group(1)), None

def flat(o, pre=''):
    r = {}
    if isinstance(o, dict):
        for k, v in o.items():
            r.update(flat(v, pre + '/' + k if pre else k))
    elif isinstance(o, list):
        if all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in o) and len(o) < 400:
            for i, v in enumerate(o):
                r['%s[%d]' % (pre, i)] = v
    elif isinstance(o, (int, float)) and not isinstance(o, bool):
        r[pre] = o
    return r

EXT = re.compile(r'(^|[/_\.])(F|F_mass|F_solid_mass|F_in|F_out|F_alpha|F_beta|Q|Q_kW|W|W_kW|H_kW|duty|power|W_shaft|W_shaft_kW|Qdot|m_dot|mdot|n_dot|flow|flows|massFlow|molarFlow|mass|moles|rate|production|consumption|area_required|V_dot|Vdot|boundary|Q_boundary_kW|Q_heat_kW|H_feeds_kW|H_products_kW|residual_kW|raw_kW|step_kW|remaining_kW|magnitude)([/_\[\.]|$)|flow|Flow|_kW$|kW|duty|[Pp]ower')
INT = re.compile(r'(^|[/_\.])(T|P|vf|x|y|z|K|alpha|V_over_F|conversion|selectivity|recovery|efficiency|eta|composition|fraction|split|ratio|T_out|P_out|dP|dT|T_in|pressure|temperature|Ratio|phaseSet|H|S|rho|Cp|[Ss]election|yield|purity|Z)([/_\[\.]|$)|composition|frac|(^|_)ratio|conversion|recovery|K_|^streams/[^/]+/(T|P|vf|H)$')

def classify(k):
    # explicit streams block rules first
    last = k.split('/')[-1]
    if '_over_' in last: return 'int'
    if re.search(r'kWh_t|_um$|Sv_m2|(^|_)[rR]atio|dT_K|^T_out|_dev$|topClass|specificEnergy|reductionRatio', last): return 'int'
    if k.startswith('streams/'):
        if last in ('F', 'F_mass', 'F_solid_mass', 'H_kW') or '/solids/' in k: return 'ext'
        return 'int'
    if k.endswith('residual_kW') or k.endswith('residual_pct'): return 'res'
    if k.startswith('globalEnergyBoundary/'):
        return 'ext' if last.endswith('_kW') else 'unc'
    if k.startswith('energyClosures'):
        return 'unc'
    if k.startswith('convergence'):
        return 'unc'
    if EXT.search(k) and not re.search(r'(^|/)(T|P)(\[|$|/)', k): return 'ext'
    if INT.search(k): return 'int'
    return 'unc'

def main():
    TOL = 1e-8
    K = 2.0
    for a in sys.argv:
        if a.startswith('--k='): K = float(a[4:])
    global KK; KK = K
    for a in sys.argv:
        if a.startswith('--tol='): TOL = float(a[6:])
    case = sys.argv[1]; feeds = sys.argv[2].split(','); seeds = '--seeds' in sys.argv
    name = Path(case).name
    root = WT / 'build/homog'
    for v in ('base', 'x2'):
        if (root / (name + '.' + v)).exists(): shutil.rmtree(root / (name + '.' + v))
        shutil.copytree(WT / case, root / (name+'.'+v))
        for junk in ('converged', 'reports', 'problemDivergence'):
            if (root / (name+'.'+v) / junk).exists(): shutil.rmtree(root / (name+'.'+v) / junk)
    zero = root / (name+'.x2') / '0'
    for f in zero.rglob('*'):
        if f.is_file():
            rel = str(f.relative_to(zero))
            if rel in feeds or seeds:
                f.write_text(scale_text(f.read_text(), KK))
    jb, eb = run(root / (name+'.base')); j2, e2 = run(root / (name+'.x2'))
    if jb is None or j2 is None:
        print('FAILED', name, 'base:', eb, 'x2:', e2); return
    print('converged base/x2:', jb.get('converged'), j2.get('converged'))
    fb, f2 = flat({k: v for k, v in jb.items() if k in ('streams', 'kpis', 'globalEnergyBoundary')}), flat({k: v for k, v in j2.items() if k in ('streams', 'kpis', 'globalEnergyBoundary')})
    rows = []; resid = []
    worst_e = 0; worst_i = 0; viol = []; unc = []
    for k in sorted(fb):
        if k not in f2: viol.append((k, 'missing in x2')); continue
        b, x = fb[k], f2[k]
        c = classify(k)
        if c == 'ext':
            dev = abs(x - KK * b) / max(abs(KK * b), 1e-300) if b != 0 else abs(x)
            # absolute floor relative to the streams' scale
            worst_e = max(worst_e, dev if abs(b) > 1e-12 else 0)
            if dev > TOL and abs(b) > 1e-12: viol.append((k, 'ext', b, x, x / b if b else None, dev))
        elif c == 'int':
            scale = max(abs(b), 1e-300)
            dev = abs(x - b) / scale if abs(b) > 1e-9 else abs(x - b)
            worst_i = max(worst_i, dev)
            if dev > TOL: viol.append((k, 'int', b, x, x / b if b else None, dev))
        elif c == 'res':
            scale = max(abs(fb.get('globalEnergyBoundary/H_feeds_kW', 0)), abs(fb.get('globalEnergyBoundary/H_products_kW', 0)), 1.0)
            resid.append((k, b, x, abs(b)/scale, abs(x)/scale))
        else:
            unc.append((k, b, x, (x / b if b else None)))
    print('max rel dev extensive (vs k x): %.2e   max rel dev intensive: %.2e' % (worst_e, worst_i))
    print('n keys', len(fb), 'viol', len(viol), 'unclassified', len(unc))
    for r in resid: print('RESIDUAL (noise, not judged)', r[0], 'base %.3g x2 %.3g, as fraction of H_feeds: %.2e / %.2e' % (r[1], r[2], r[3], r[4]))
    for v in viol: print('VIOL', v)
    for u in unc: print('UNC', u)
    json.dump({'viol': viol, 'unc': unc}, open(root / (name+'.cmp.json'), 'w'), default=str)

if __name__ == '__main__':
    main()
