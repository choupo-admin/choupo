#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""proofs -- the "proofs of nine": a MEASUREMENT tool, NOT a gate, NOT wired into bin/runTests.

ONE loop.  For a case: copy it (case_records.copytree; a shipped case is never edited), apply a
declared TRANSFORMATION, run the native binary, read the result JSON, compare with the declared
RELATION and judge HOLDS / VIOLATES / NOT JUDGED (with the reason and the quantity that breaks it).

  bin/curate/proofs.py T1 [T2 ...|all] [--scope fast|all|<case>...] [--sabotage] [--jobs N]

Transformations are DATA (TRANSFORMATIONS below), each with its domain predicate:
  T1 homogeneity      every feed x2: extensive x2, intensive equal.  Domain: no declared size,
                      duty or volume in system/ (NOT JUDGED, the declared key named).
  T2 component order  `components (...)` and every componentMolarFlows table reversed; result
                      compared by name, equal to roundoff.
  T3 unit writing     bar/kPa/MPa -> Pa, kmol/h -> mol/s, kg/h -> kg/s, kW -> W in 0/ and the
                      flowsheet/solver dicts; every KPI equal to 1e-10.
  T4 closure outside  mass and element closures recomputed from the raw converged/ files with
                      proofs_closure.py (the cloud's verify-the-verifier), compared with the
                      engine's report.
  T5 admissibility    flows >= 0, fractions in [0,1] summing to 1, vf in [0,1], T and P positive
                      and finite, on every published stream.
  T6 no-op restart    converged/ re-run as 0/: the outputs are reproduced to the recycle tolerance.

--sabotage changes ONE number of the transformation's input (a bumped flow, a wrong factor) and
must flip the verdict: it is the tool's check that a HOLDS is not vacuous.

Scratch: $PROOFS_SCRATCH (default ~/.cache/choupo/proofs).  Binary: $PROOFS_BIN (default
build/linux64Gcc/choupoSolve of this tree).  If ~/.cache/choupo/sweep.lock exists the tool waits.
Results: <scratch>/results/<T>.jsonl, one line per case; summary table on stdout.
"""
import json
import math
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import case_records          # noqa: E402
import proofs_closure as pc  # noqa: E402

WT = HERE.parents[1]
BIN = Path(os.environ.get('PROOFS_BIN', WT / 'build/linux64Gcc/choupoSolve'))
SCR = Path(os.environ.get('PROOFS_SCRATCH', Path.home() / '.cache/choupo/proofs'))
LOCK = Path.home() / '.cache/choupo/sweep.lock'
TIMEOUT = int(os.environ.get('PROOFS_TIMEOUT', '240'))
SABOTAGE = False

HOLDS, VIOLATES, NOTJ = 'HOLDS', 'VIOLATES', 'NOT JUDGED'

# --------------------------------------------------------------------------- text helpers


def strip_comments(t):
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    return re.sub(r'//[^\n]*', '', t)


def read(p):
    return Path(p).read_text(errors='ignore')


FLOWKEYS = ('componentMolarFlows', 'speciesMolarFlows', 'componentMassFlows')
_ENTRY = r'([A-Za-z0-9_\-\+\(\)\[\]]+\s+)([-+0-9.eE]+)(\s*[A-Za-z0-9/]*\s*;)'


def scale_flows(txt, k):
    """multiply every entry of every flow table by k (tables may be nested, e.g. inside phases{})."""
    def blk(m):
        body = re.sub(_ENTRY, lambda e: e.group(1) + repr(float(e.group(2)) * k) + e.group(3), m.group(2))
        return m.group(1) + body + '}'
    return re.sub(r'(\b(?:%s)\s*\{)([^{}]*)\}' % '|'.join(FLOWKEYS), blk, txt)


def reverse_flows(txt):
    def blk(m):
        body = strip_comments(m.group(2))
        ents = [e.strip() for e in body.split(';') if e.strip()]
        return m.group(1) + '\n' + ''.join('        %s;\n' % e for e in reversed(ents)) + '    }'
    return re.sub(r'(\b(?:%s)\s*\{)([^{}]*)\}' % '|'.join(FLOWKEYS), blk, txt)


# --------------------------------------------------------------------------- running

def wait_lock():
    while LOCK.exists():
        time.sleep(30)


def app_of(case):
    m = re.search(r'\bapplication\s+(\w+)', strip_comments(read(Path(case) / 'system/controlDict')))
    return m.group(1) if m else None


def extract(stdout):
    m = re.search(r'<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>', stdout, re.S)
    return json.loads(m.group(1)) if m else None


def fresh_copy(case, dst):
    dst = Path(dst)
    if dst.exists():
        shutil.rmtree(dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    case_records.copytree(case, dst)
    for junk in ('converged', 'reports', 'problemDivergence', 'log.choupoSolve'):
        j = dst / junk
        if j.is_dir():
            shutil.rmtree(j)
        elif j.exists():
            j.unlink()
    return dst


def run_in(d):
    """run the binary in directory d.  -> dict(json, err, secs)"""
    wait_lock()
    t0 = time.time()
    try:
        p = subprocess.run([str(BIN), '.'], cwd=d, env=dict(os.environ, CHOUPO_HOME=str(WT)),
                           capture_output=True, text=True, timeout=TIMEOUT)
    except subprocess.TimeoutExpired:
        return {'json': None, 'err': 'timeout %d s' % TIMEOUT, 'secs': TIMEOUT}
    (Path(d) / 'out.txt').write_text(p.stdout)
    j = extract(p.stdout)
    err = None
    if j is None:
        tail = [x for x in (p.stderr + '\n' + p.stdout).strip().split('\n') if x.strip()]
        err = 'rc=%d: %s' % (p.returncode, ' | '.join(tail[-2:])[:300])
    return {'json': j, 'err': err, 'secs': time.time() - t0}


_BASE = {}


def base_of(case):
    """the base run of a case, cached in memory and on disk (<scratch>/base/<name>)."""
    case = Path(case)
    name = case.name
    if name in _BASE:
        return _BASE[name]
    d = SCR / 'base' / name
    cache = d / 'base.json'
    if cache.exists() and (d / 'converged').exists():
        r = {'json': json.loads(cache.read_text()), 'err': None, 'secs': 0, 'dir': d}
    else:
        fresh_copy(case, d)
        r = run_in(d)
        r['dir'] = d
        if r['json'] is not None:
            cache.write_text(json.dumps(r['json']))
    _BASE[name] = r
    return r


def base_problem(case, r):
    j = r['json']
    if j is None:
        return 'base run refused or failed: %s' % r['err']
    if j.get('converged') is False:
        return 'base run did not converge'
    return None


# --------------------------------------------------------------------------- comparison

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


def view(j):
    return flat({k: v for k, v in j.items() if k in ('streams', 'kpis', 'globalEnergyBoundary')})


EXT_LAST = re.compile(r'^(F|F_mass|F_solid_mass|H_kW)$')


def classify(k):
    """ext / int / res (noise) / unc, by the name of the key (the cloud's rule, simplified)."""
    last = k.split('/')[-1]
    if last.endswith('residual_kW') or last.endswith('residual_pct') or last.endswith('residual_denom_kW'):
        return 'res'
    if k.startswith('streams/'):
        return 'ext' if (EXT_LAST.match(last) or '/solids/' in k) else 'int'
    if k.startswith('globalEnergyBoundary/'):
        return 'ext' if last.endswith('_kW') else 'unc'
    if re.search(r'^F_(in|out|alpha|beta)$|^[QW]_?(kW)?$|W_shaft|[Dd]uty', last):
        return 'ext'
    if re.search(r'_over_|[Rr]atio|(^|_)(T|P|vf|x|y|z|K|alpha|eta|conversion|recovery|selectivity)(_|\[|$)|^K_|^x_|^y_|dT|dP|composition|frac|yield|purity', last):
        return 'int'
    if re.search(r'(^|_)(F|Q|W|duty|power|flow|mass|rate|area|V)(_|\[|$)|kW|[Ff]low|[Dd]uty|F_(in|out|alpha|beta)|W_shaft|extent|moles', last):
        return 'ext'
    return 'unc'


def compare(b, x, k, tol, label_all=False):
    """k: the factor extensive keys must scale by (1 = everything equal).  Returns
    (worst_dev, worst_key, violations[list of strings], n_compared)."""
    viol, worst, wk, n = [], 0.0, '-', 0
    for key in sorted(b):
        c = classify(key)
        if c == 'res':
            continue
        if key not in x:
            viol.append('%s missing' % key)
            continue
        bv, xv = b[key], x[key]
        if label_all or k == 1:
            want, scale = bv, max(abs(bv), abs(xv))
            if c == 'unc' and not label_all:
                pass
        elif c == 'ext':
            want, scale = k * bv, abs(k * bv)
        elif c == 'int':
            want, scale = bv, abs(bv)
        else:
            continue
        if isinstance(bv, float) and (math.isnan(bv) or math.isnan(xv)):
            if not (math.isnan(bv) and math.isnan(xv)):
                viol.append('%s NaN base %r new %r' % (key, bv, xv))
            continue
        if scale < 1e-9:
            dev = abs(xv - want)
            if dev < 1e-9:
                continue
        else:
            dev = abs(xv - want) / scale
        n += 1
        if dev > worst:
            worst, wk = dev, '%s base %.10g new %.10g' % (key, bv, xv)
        if dev > tol:
            viol.append('%s base %.10g new %.10g dev %.2e' % (key, bv, xv, dev))
    return worst, wk, viol, n


def is_recycle(case):
    t = ''
    for f in Path(case).rglob('system/*'):
        if f.is_file() and f.name in ('flowsheetDict', 'solverDict'):
            t += strip_comments(read(f))
    return bool(re.search(r'recycleTol|\btears?\b|tearStreams|tearSeed', t))


def verdict_from(viol, worst, wk, n, extra=''):
    if viol:
        return VIOLATES, '%d key(s) beyond tolerance (worst %.2e): %s%s' % (len(viol), worst, '; '.join(viol[:3]), extra)
    return HOLDS, 'max dev %.2e over %d keys (%s)' % (worst, n, wk.split(' ')[0])


def bump_first_flow(path, f=1.001):
    t = read(path)
    t2 = re.sub(r'(\bcomponentMolarFlows\s*\{\s*[A-Za-z0-9_\-\+\(\)\[\]]+\s+)([-+0-9.eE]+)', lambda m: m.group(1) + repr(float(m.group(2)) * f), t, count=1)
    Path(path).write_text(t2)


def feed_files(case, base):
    """the feed state files of the case, as paths relative to converged/ (cloud's topology reader)."""
    feeds, _, _, _ = pc.topology(Path(base['dir']))
    return [Path(p).relative_to(Path(base['dir']) / 'converged') for p in feeds.values()]


# --------------------------------------------------------------------------- T1

DECLARED_EXT = ['area', 'V_R', 'V', 'volume', 'Q', 'Qdot', 'duty', 'W_shaft', 'W', 'power', 'distillateRate', 'bottomsRate',
                'refluxRate', 'diameter', 'bodyDiameter', 'D', 'length', 'L', 'dz', 'height', 'H_bed', 'filterArea', 'membraneArea',
                'current', 'N_cellpairs', 'mAdsPerColumn', 'tCycle', 'geometry', 'holdup', 'mass', 'massFlowRate',
                'molarFlowRate', 'flowRate', 'F_set', 'productRate', 'rate', 'capacity', 'residenceTime', 'A_m', 'A_w_area',
                'cutSize', 'nTubes', 'tubeLength', 'shellDiameter', 'packedHeight', 'areaTotal', 'W_kW', 'Q_kW']


def declared_extensive(case):
    """-> the first declared extensive key found in system/ (non-zero), or None."""
    pat = re.compile(r'(?m)(?<![\w.$])(%s)\s+([^;{\n]*?)\s*;' % '|'.join(re.escape(k) for k in DECLARED_EXT))
    for f in sorted(Path(case).rglob('system/*')):
        if not f.is_file() or f.name in ('controlDict', 'postDict', 'layoutDict'):
            continue
        if f.name == 'outerDict':
            return 'outerDict present (%s)' % f.relative_to(case)
        t = strip_comments(read(f))
        for m in pat.finditer(t):
            v = m.group(2).split()
            try:
                if v and float(v[0]) == 0.0:
                    continue
            except ValueError:
                pass
            return '%s %s in %s' % (m.group(1), m.group(2)[:30], f.relative_to(case))
        if re.search(r'(?<![\w.])geometry\s*\{', t):
            return 'geometry {} in %s' % f.relative_to(case)
    return None


def t1(case, k=2.0):
    case = Path(case)
    r = base_of(case)
    p = base_problem(case, r)
    if p:
        return NOTJ, p
    dec = declared_extensive(case)
    if dec:
        return NOTJ, 'declared size/duty/volume: ' + dec
    try:
        feeds = feed_files(case, r)
    except (ValueError, LookupError, KeyError, OSError) as e:
        return NOTJ, 'feeds not identified: %s' % e
    if not feeds:
        return NOTJ, 'no feed stream identified'
    d = fresh_copy(case, SCR / 'T1' / case.name)
    scaled = []
    for f in d.joinpath('0').rglob('*'):
        if f.is_file():
            rel = f.relative_to(d / '0')
            txt = read(f)
            if rel in feeds:
                f.write_text(scale_flows(txt, k))
                scaled.append(str(rel))
            elif any(w in txt for w in FLOWKEYS):
                f.write_text(scale_flows(txt, k))      # tear seeds scale with the plant
    if SABOTAGE:
        bump_first_flow(d / '0' / feeds[0])
    rr = run_in(d)
    if rr['json'] is None:
        return VIOLATES if not r['err'] else NOTJ, 'x%g run failed: %s' % (k, rr['err'])
    tol = 1e-4 if is_recycle(case) else 1e-8
    worst, wk, viol, n = compare(view(r['json']), view(rr['json']), k, tol)
    return verdict_from(viol, worst, wk, n, ' [tol %.0e, feeds %s]' % (tol, ','.join(scaled)))


# --------------------------------------------------------------------------- T2

def t2(case):
    case = Path(case)
    r = base_of(case)
    p = base_problem(case, r)
    if p:
        return NOTJ, p
    d = fresh_copy(case, SCR / 'T2' / case.name)
    ncomp, changed = 0, 0
    for f in d.rglob('thermoPhysPropDict'):
        t = read(f)
        m = re.search(r'(?m)^(\s*components\s*\()([^)]*)\)', t)
        if m:
            w = m.group(2).split()
            ncomp = max(ncomp, len(w))
            f.write_text(t[:m.start()] + m.group(1) + ' ' + ' '.join(reversed(w)) + ' )' + t[m.end():])
            changed += 1
    if not changed or ncomp < 2:
        return NOTJ, 'no `components (...)` list of >= 2 names in the case (%d dict)' % changed
    for f in (d / '0').rglob('*'):
        if f.is_file():
            t = read(f)
            if any(w in t for w in FLOWKEYS):
                f.write_text(reverse_flows(t))
    if SABOTAGE:
        bump_first_flow(next(f for f in sorted((d / '0').rglob('*')) if f.is_file() and 'componentMolarFlows' in read(f)))
    rr = run_in(d)
    if rr['json'] is None:
        return VIOLATES, 'reversed run failed where the base ran: %s' % rr['err']
    tol = 1e-5 if is_recycle(case) else 1e-8
    worst, wk, viol, n = compare(view(r['json']), view(rr['json']), 1, tol)
    return verdict_from(viol, worst, wk, n, ' [tol %.0e, %d components]' % (tol, ncomp))


# --------------------------------------------------------------------------- T3

_UNITS = {'bar': (1e5, 'Pa'), 'kPa': (1e3, 'Pa'), 'MPa': (1e6, 'Pa'), 'atm': (101325.0, 'Pa'),
          'kmol/h': (1000.0 / 3600.0, 'mol/s'), 'mol/h': (1.0 / 3600.0, 'mol/s'),
          'kg/h': (1.0 / 3600.0, 'kg/s'), 'kW': (1000.0, 'W')}
_NUMU = re.compile(r'(?<![\w.])([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)(\s+)(bar|kPa|MPa|atm|kmol/h|mol/h|kg/h|kW)(\s*;)')


def convert_units(txt, wrong=1.0):
    n = [0]

    def sub(m):
        f, u = _UNITS[m.group(3)]
        n[0] += 1
        return '%s%s%s%s' % (repr(float(m.group(1)) * f * wrong), m.group(2), u, m.group(4))
    return _NUMU.sub(sub, txt), n[0]


def t3(case):
    case = Path(case)
    r = base_of(case)
    p = base_problem(case, r)
    if p:
        return NOTJ, p
    d = fresh_copy(case, SCR / 'T3' / case.name)
    total = 0
    files = [f for f in (d / '0').rglob('*') if f.is_file()] + \
            [f for f in d.rglob('system/*') if f.is_file() and f.name in ('flowsheetDict', 'solverDict')]
    for i, f in enumerate(files):
        t, n = convert_units(read(f), wrong=(1.001 if SABOTAGE else 1.0))
        if n:
            f.write_text(t)
            total += n
    if total == 0:
        return NOTJ, 'no value in bar/kPa/MPa/atm/kmol/h/kg/h/kW to rewrite'
    rr = run_in(d)
    if rr['json'] is None:
        return VIOLATES, 'run with SI-written values failed where the base ran: %s' % rr['err']
    worst, wk, viol, n = compare(view(r['json']), view(rr['json']), 1, 1e-10, label_all=True)
    return verdict_from(viol, worst, wk, n, ' [tol 1e-10, %d values rewritten]' % total)


# --------------------------------------------------------------------------- T4

def t4(case):
    case = Path(case)
    r = base_of(case)
    p = base_problem(case, r)
    if p:
        return NOTJ, p
    d = Path(r['dir'])
    if SABOTAGE:
        d = SCR / 'T4' / case.name
        if d.exists():
            shutil.rmtree(d)
        shutil.copytree(r['dir'], d)
        feeds = [f for f in (d / 'converged').rglob('*') if f.is_file() and 'componentMolarFlows' in read(f)]
        bump_first_flow(feeds[0])
    res = pc.measure(d)
    v, why = pc.verdict(res)
    if v == 'AGREE':
        mi, mo, mc = res['mass']
        return HOLDS, 'mass closure %.6f%% (engine %.4f%%), %d elements, %d/%d/%d feeds/products/internal' % (
            mc, res['eng_mass'][2], len(res['elem']), *res['counts'])
    if v == 'NOT JUDGED':
        return NOTJ, why[:250]
    return VIOLATES, why[:400]


# --------------------------------------------------------------------------- T5

def check_stream_text(txt, name):
    bad = []
    t = strip_comments(txt)
    for m in re.finditer(r'\b(?:%s)\s*\{([^{}]*)\}' % '|'.join(FLOWKEYS), t):
        vals = []
        for e in m.group(1).split(';'):
            w = e.split()
            if len(w) >= 2:
                try:
                    vals.append((w[0], float(w[1])))
                except ValueError:
                    bad.append('%s: unreadable flow %r' % (name, e.strip()))
        tot = sum(abs(v) for _, v in vals)
        for c, v in vals:
            if not math.isfinite(v):
                bad.append('%s: flow of %s is %r' % (name, c, v))
            elif v < -1e-9 * max(tot, 1e-300):
                bad.append('%s: flow of %s = %.6e (negative, total %.4e)' % (name, c, v, tot))
    return bad


def t5(case):
    case = Path(case)
    r = base_of(case)
    p = base_problem(case, r)
    if p:
        return NOTJ, p
    d = Path(r['dir'])
    if SABOTAGE:
        d = SCR / 'T5' / case.name
        if d.exists():
            shutil.rmtree(d)
        shutil.copytree(r['dir'], d)
        f = next(f for f in sorted((d / 'converged').rglob('*')) if f.is_file() and 'componentMolarFlows' in read(f))
        t = read(f)
        f.write_text(re.sub(r'(componentMolarFlows\s*\{\s*[A-Za-z0-9_\-\+\(\)\[\]]+\s+)([-+0-9.eE]+)', lambda m: m.group(1) + '-3.0e-3', t, count=1))
    bad = []
    nfiles = 0
    for f in sorted((d / 'converged').rglob('*')):
        if f.is_file() and f.name != 'problemDivergence' and 'internalStates' not in f.parts and 'view' not in f.parts:
            t = read(f)
            if 'componentMolarFlows' in t or 'speciesMolarFlows' in t or 'componentMassFlows' in t:
                nfiles += 1
                bad += check_stream_text(t, str(f.relative_to(d / 'converged')))
    nstream = 0
    for s, v in (json.loads((d / 'base.json').read_text()) if (d / 'base.json').exists() else r['json']).get('streams', {}).items():
        nstream += 1
        for key in ('T', 'P'):
            x = v.get(key)
            if x is None:
                continue
            if not (isinstance(x, (int, float)) and math.isfinite(x) and x > 0):
                bad.append('%s: %s = %r' % (s, key, x))
        vf = v.get('vf')
        if isinstance(vf, (int, float)) and not (-1e-12 <= vf <= 1 + 1e-12):
            bad.append('%s: vf = %r' % (s, vf))
        comp = v.get('composition') or {}
        if comp:
            vals = list(comp.values())
            if any((not isinstance(x, (int, float))) or not math.isfinite(x) or x < -1e-12 or x > 1 + 1e-12 for x in vals):
                bad.append('%s: composition outside [0,1]: %s' % (s, {c: x for c, x in comp.items() if not (-1e-12 <= x <= 1 + 1e-12)}))
            if v.get('F', 1) and abs(sum(vals) - 1.0) > 1e-9:
                bad.append('%s: fractions sum to %.12f' % (s, sum(vals)))
        for key in ('F', 'F_mass', 'H_kW'):
            x = v.get(key)
            if x is not None and not (isinstance(x, (int, float)) and math.isfinite(x)):
                bad.append('%s: %s = %r' % (s, key, x))
        for key in ('F', 'F_mass'):
            x = v.get(key)
            if isinstance(x, (int, float)) and x < -1e-12:
                bad.append('%s: %s = %.6e negative' % (s, key, x))
    if bad:
        return VIOLATES, '%d finding(s): %s' % (len(bad), '; '.join(bad[:4]))
    if nstream == 0:
        return NOTJ, 'the result publishes no streams'
    return HOLDS, '%d streams, %d state files read' % (nstream, nfiles)


# --------------------------------------------------------------------------- T6

def t6(case):
    case = Path(case)
    r = base_of(case)
    p = base_problem(case, r)
    if p:
        return NOTJ, p
    conv = Path(r['dir']) / 'converged'
    if not any(f.is_file() and f.name != 'problemDivergence' for f in conv.iterdir()):
        return NOTJ, 'converged/ holds no state files'
    d = fresh_copy(case, SCR / 'T6' / case.name)
    shutil.rmtree(d / '0')
    shutil.copytree(conv, d / '0', ignore=shutil.ignore_patterns('problemDivergence'))
    if SABOTAGE:
        f = next((f for f in sorted((d / '0').rglob('*')) if f.is_file() and 'componentMolarFlows' in read(f)), None)
        if f:
            bump_first_flow(f)
    rr = run_in(d)
    if rr['json'] is None:
        return VIOLATES, 'restart from converged/ as 0/ failed: %s' % rr['err']
    tol = 1e-4 if is_recycle(case) else 1e-7
    worst, wk, viol, n = compare(view(r['json']), view(rr['json']), 1, tol, label_all=True)
    return verdict_from(viol, worst, wk, n, ' [tol %.0e]' % tol)


TRANSFORMATIONS = {
    'T1': ('homogeneity of degree one (feeds x2)', t1),
    'T2': ('component order reversed', t2),
    'T3': ('unit writing (SI instead of bar, kmol/h)', t3),
    'T4': ('closures recomputed outside the engine', t4),
    'T5': ('admissibility of every published stream', t5),
    'T6': ('no-op restart from converged/', t6),
}

# --------------------------------------------------------------------------- corpus


def cases_all():
    out = []
    for top in ('tutorials/steady', 'tutorials/plant'):
        for cho in sorted((WT / top).rglob('*.cho')):
            d = cho.parent
            if (d / 'system/controlDict').exists() and app_of(d) == 'choupoSolve':
                out.append(d)
    return out


def cases_fast():
    out = []
    for ln in read(WT / 'tutorials/FASTSET').splitlines():
        ln = ln.split('#')[0].strip()
        if ln.startswith(('tutorials/steady/', 'tutorials/plant/')):
            d = WT / ln
            if (d / 'system/controlDict').exists() and app_of(d) == 'choupoSolve':
                out.append(d)
    return out


def main(argv):
    global SABOTAGE
    args = [a for a in argv if not a.startswith('--')]
    SABOTAGE = '--sabotage' in argv
    scope = 'fast'
    named = []
    for a in argv:
        if a.startswith('--scope='):
            scope = a[8:]
        if a.startswith('--case='):
            named.append(WT / a[7:])
    ts = [a for a in args if a in TRANSFORMATIONS or a == 'all']
    if not ts:
        print(__doc__)
        return 2
    if 'all' in ts:
        ts = list(TRANSFORMATIONS)
    cases = named or (cases_all() if scope == 'all' else cases_fast())
    (SCR / 'results').mkdir(parents=True, exist_ok=True)
    for t in ts:
        title, fn = TRANSFORMATIONS[t]
        outp = SCR / 'results' / (t + ('-sabotage' if SABOTAGE else '') + '.%s.jsonl' % ('case' if named else scope))
        counts = {HOLDS: 0, VIOLATES: 0, NOTJ: 0}
        with open(outp, 'w') as fo:
            for c in cases:
                t0 = time.time()
                try:
                    v, why = fn(c)
                except Exception as e:              # a tool failure is never a verdict
                    v, why = NOTJ, 'tool error %s: %s' % (type(e).__name__, str(e)[:200])
                counts[v] += 1
                fo.write(json.dumps({'t': t, 'case': str(c.relative_to(WT)), 'verdict': v, 'why': why, 'secs': round(time.time() - t0, 1)}) + '\n')
                fo.flush()
                print('%s %-11s %-48s %s' % (t, v, c.name, why[:170]), flush=True)
        print('== %s %s%s: HOLDS %d  VIOLATES %d  NOT JUDGED %d  (%d cases)' % (
            t, title, ' [SABOTAGED]' if SABOTAGE else '', counts[HOLDS], counts[VIOLATES], counts[NOTJ], len(cases)), flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
