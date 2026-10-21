#!/usr/bin/env python3
# =============================================================================
#  benchmarks/dwsim/compare.py -- run a benchmark case and print it beside the
#  reference simulator's stored numbers.
#
#  Developer-facing (benchmarks/README.md).  NOT part of bin/runTests.
#
#      python3 -I benchmarks/dwsim/compare.py distillation01_methanol_acetone_pressure_swing
#      python3 -I benchmarks/dwsim/compare.py extraction01_water_acetone_mibk
#      python3 -I benchmarks/dwsim/compare.py all
#
#  Every run happens in a SCRATCH COPY of the case (a temporary directory,
#  removed afterwards; `--keep` keeps it), so the tree is never written.  A
#  case's `variants/<name>/` directories hold only the files that differ;
#  the script overlays them on the copy (a variant that brings its own
#  thermoPhysPropDict runs with no case-local pair record, a variant that
#  brings a `0/` keeps only the authored inlets of the case's own).
#
#  Needs a native build of this tree (`make all`): ./choupoSolve and
#  ./choupoProps at the repository root.
# =============================================================================

import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
SOLVE = os.path.join(ROOT, 'choupoSolve')
PROPS = os.path.join(ROOT, 'choupoProps')
INIT0 = os.path.join(ROOT, 'bin', 'choupo-init0')


# ---------------------------------------------------------------- dictionary
def parse_dict(text):
    """A reader for the subset of the dictionary grammar `reference` uses:
    `key value ... ;`, `key { ... }`, `key ( ... )`, strings, comments."""
    # Comments are tokens too, so a `//` inside a string (a URL) stays text.
    toks = [t for t in re.findall(r'"[^"]*"|/\*.*?\*/|//[^\n]*|[{}();]|[^\s{}();"]+', text, flags=re.S)
            if not t.startswith(('//', '/*'))]
    pos = 0

    def atom(t):
        if t.startswith('"'):
            return t[1:-1]
        try:
            return float(t)
        except ValueError:
            return t

    def block(end):
        nonlocal pos
        out, multi = {}, {}
        while pos < len(toks) and toks[pos] != end:
            key = toks[pos]; pos += 1
            if toks[pos] == '{':
                pos += 1
                val = block('}'); pos += 1
            elif toks[pos] == '(':
                pos += 1
                val = []
                while toks[pos] != ')':
                    val.append(atom(toks[pos])); pos += 1
                pos += 1
                if pos < len(toks) and toks[pos] == ';':
                    pos += 1
            else:
                vals = []
                while toks[pos] != ';':
                    vals.append(atom(toks[pos])); pos += 1
                pos += 1
                val = vals[0] if len(vals) == 1 else vals
            if key in out:                       # repeated key (`port`, `spec`) -> list
                multi.setdefault(key, [out[key]]).append(val)
                out[key] = multi[key]
            else:
                out[key] = val
        return out

    return block(None)


# ---------------------------------------------------------------- running
def scratch_copy(case, variant, work):
    dst = os.path.join(work, os.path.basename(case) + ('.' + variant if variant else ''))
    shutil.copytree(case, dst, ignore=shutil.ignore_patterns(
        'variants', 'converged', 'reports', 'measurements', 'README*', 'reference'))
    if variant:
        vdir = os.path.join(case, 'variants', variant)
        if not os.path.isdir(vdir):
            sys.exit('compare: no variant %s in %s' % (variant, case))
        if os.path.exists(os.path.join(vdir, 'constant', 'thermoPhysPropDict')):
            shutil.rmtree(os.path.join(dst, 'constant', 'parameters'), ignore_errors=True)
        if os.path.isdir(os.path.join(vdir, '0')):
            for f in os.listdir(os.path.join(dst, '0')):
                if f not in ('feed', 'solvent'):
                    p = os.path.join(dst, '0', f)
                    shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
        for dp, _, fn in os.walk(vdir):
            for f in fn:
                src = os.path.join(dp, f)
                out = os.path.join(dst, os.path.relpath(src, vdir))
                os.makedirs(os.path.dirname(out), exist_ok=True)
                shutil.copyfile(src, out)
        subprocess.run([INIT0, dst], cwd=ROOT, capture_output=True, text=True)
    return dst


def run(binary, case):
    r = subprocess.run([binary, case], cwd=ROOT, capture_output=True, text=True)
    out = r.stdout + r.stderr
    b, e = out.find('<<<Choupo:result-begin>>>'), out.find('<<<Choupo:result-end>>>')
    res = json.loads(out[b + len('<<<Choupo:result-begin>>>'):e]) if 0 <= b < e else None
    with open(case + '.log', 'w') as f:
        f.write(out)
    return r.returncode, res, out


def nan_free(res):
    bad = re.search(r'\b(nan|inf)\b', json.dumps(res.get('streams', {})), re.I) if res else None
    return bad is None


# ---------------------------------------------------------------- printing
def fmt(v, nd=4):
    if v is None:
        return '--'
    if isinstance(v, str):
        return v
    if v == 0:
        return '0'
    a = abs(v)
    if a >= 1e4 or a < 1e-3:
        return '%.4e' % v
    return '%.*f' % (nd, v)


def table(title, cols, rows, note=None):
    print('\n' + title)
    print('-' * len(title))
    w0 = max(len(r[0]) for r in rows)
    widths = [max(len(c), 12) for c in cols]
    print(' ' * w0 + '  ' + '  '.join(c.rjust(w) for c, w in zip(cols, widths)))
    for r in rows:
        print(r[0].ljust(w0) + '  ' + '  '.join(fmt(v).rjust(w) for v, w in zip(r[1:], widths)))
    if note:
        print(note)


def rel(a, b):
    if a is None or b is None or b == 0:
        return None
    return 100.0 * (a - b) / abs(b)


# ---------------------------------------------------------------- azeotrope
def azeotrope(case_copy, comp_a, comp_b, P_Pa):
    """The bubble-point azeotrope of the case's own thermophysical system at P:
    an x-scan of T_bubble and y_eq through choupoProps, root of y - x."""
    d = case_copy + '.azeo%.0f' % P_Pa
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(os.path.join(d, 'system'))
    shutil.copytree(os.path.join(case_copy, 'constant'), os.path.join(d, 'constant'))
    with open(os.path.join(d, 'system', 'controlDict'), 'w') as f:
        f.write('application choupoProps;\ndescription "azeotrope scan";\nverbosity 1;\n')
    with open(os.path.join(d, 'system', 'propsDict'), 'w') as f:
        f.write('operations\n(\n    {\n        name txy;\n        type propertyScan1D;\n'
                '        vary { variable x[%s];  from 0.0;  to 1.0;  n 401; }\n'
                '        state { P %.6g Pa;  composition { %s 0.5;  %s 0.5; } }\n'
                '        properties ( T_bubble  y_eq_%s );\n'
                '        output { file txy.csv; }\n    }\n);\n' % (comp_a, P_Pa, comp_a, comp_b, comp_a))
    subprocess.run([PROPS, d], cwd=ROOT, capture_output=True, text=True)
    csv = os.path.join(d, 'txy.csv')
    if not os.path.exists(csv):
        return None
    lines = [l.strip().split(',') for l in open(csv) if l.strip() and not l.startswith('#')]
    hdr = lines[0]
    ix = [i for i, h in enumerate(hdr) if h.startswith('x')][0]
    iT = hdr.index('T_bubble')
    iy = [i for i, h in enumerate(hdr) if h.startswith('y_eq')][0]
    pts = [(float(r[ix]), float(r[iT]), float(r[iy])) for r in lines[1:]]
    for (x0, T0, y0), (x1, T1, y1) in zip(pts[1:-2], pts[2:-1]):
        f0, f1 = y0 - x0, y1 - x1
        if f0 == 0 or f0 * f1 < 0:
            t = f0 / (f0 - f1) if f0 != f1 else 0.0
            return x0 + t * (x1 - x0), T0 + t * (T1 - T0)
    return None


# ================================================================= case B
def case_B(case, work):
    ref = parse_dict(open(os.path.join(case, 'reference')).read())

    # The case-local NRTL record must be a byte copy of its one home.
    home = os.path.join(ROOT, 'tutorials/props/curation/curate05_nrtl_acetone_methanol/'
                        'constant/parameters/NRTL/acetone-methanol.dat')
    mine = os.path.join(case, 'constant/parameters/NRTL/acetone-methanol.dat')
    if open(home, 'rb').read() != open(mine, 'rb').read():
        sys.exit('compare: %s is no longer a byte copy of %s -- the pair has ONE home; '
                 'copy it again (or say in the case why it differs).' % (mine, home))

    runs = {}
    for label, variant in (('Choupo NRTL', None), ('Choupo UNIFAC', 'unifac')):
        cp = scratch_copy(case, variant, work)
        code, res, _ = run(SOLVE, cp)
        runs[label] = (cp, code, res)
        print('[%s] exit %d, converged %s, NaN-free %s'
              % (label, code, res and res.get('converged'), nan_free(res)))

    S = ref['streams']
    U = ref['units']
    LPr, HPr = U['methanolColumn1Atm'], U['acetoneColumn6Atm']

    def st(res, name, key):
        s = res['streams'][name] if res else None
        if s is None:
            return None
        if key == 'F':
            return s['F'] * 1000.0
        if key.startswith('x_'):
            return s['composition'][key[2:]]
        return s[key]

    def kp(res, unit, key):
        return res['kpis'][unit][key] if res else None

    cols = ['reference'] + list(runs) + ['NRTL - ref']
    rows = []

    def add(label, refv, f):
        vals = [f(runs[k][2]) for k in runs]
        d = None if refv is None or vals[0] is None else vals[0] - refv
        rows.append([label, refv] + vals + [d])

    # Azeotropes of each model -- a property of the model, not of the plant.
    az = {k: (azeotrope(runs[k][0], 'methanol', 'acetone', 101325.0),
              azeotrope(runs[k][0], 'methanol', 'acetone', 607950.0)) for k in runs}
    rows.append(['azeotrope 1 atm  x_MeOH (model)', None]
                + [az[k][0][0] if az[k][0] else None for k in runs] + [None])
    rows.append(['azeotrope 1 atm  T [K]  (model)', None]
                + [az[k][0][1] if az[k][0] else None for k in runs] + [None])
    rows.append(['azeotrope 6 atm  x_MeOH (model)', None]
                + [az[k][1][0] if az[k][1] else None for k in runs] + [None])
    rows.append(['azeotrope 6 atm  T [K]  (model)', None]
                + [az[k][1][1] if az[k][1] else None for k in runs] + [None])

    add('LP distillate  x_MeOH', S['lPAzeotrope']['x']['methanol'], lambda r: st(r, 'lpDistillate', 'x_methanol'))
    add('LP distillate  T [K]', S['lPAzeotrope']['T'], lambda r: st(r, 'lpDistillate', 'T'))
    add('LP condenser stage  T [K]', LPr['Tf'][0], lambda r: r['profiles']['LP']['columns']['T'][0] if r else None)
    add('HP distillate  x_MeOH', S['hPAzeotrope']['x']['methanol'], lambda r: st(r, 'hpDistillate', 'x_methanol'))
    add('HP distillate  T [K]', S['hPAzeotrope']['T'], lambda r: st(r, 'hpDistillate', 'T'))
    add('recycle  F [mol/s] (as attached to LP)', S['recycledHPAzeotrope']['F'], lambda r: st(r, 'recycle', 'F'))
    add('HP distillate  F [mol/s] (as produced)', S['hPAzeotrope']['F'], lambda r: st(r, 'hpDistillate', 'F'))
    add('methanol product  F [mol/s]', S['methanol']['F'], lambda r: st(r, 'methanol', 'F'))
    add('methanol product  x_MeOH', S['methanol']['x']['methanol'], lambda r: st(r, 'methanol', 'x_methanol'))
    add('methanol product  T [K]', S['methanol']['T'], lambda r: st(r, 'methanol', 'T'))
    add('acetone product  F [mol/s]', S['acetoneRichProduct']['F'], lambda r: st(r, 'acetone', 'F'))
    add('acetone product  x_acetone', S['acetoneRichProduct']['x']['acetone'], lambda r: st(r, 'acetone', 'x_acetone'))
    add('acetone product  T [K]', S['acetoneRichProduct']['T'], lambda r: st(r, 'acetone', 'T'))
    add('LP condenser duty [kW] (removed)', LPr['condenserDuty'], lambda r: -kp(r, 'LP', 'Q_condenser_kW'))
    add('LP reboiler duty  [kW]', -LPr['reboilerDuty'], lambda r: kp(r, 'LP', 'Q_reboiler_kW'))
    add('HP condenser duty [kW] (removed)', HPr['condenserDuty'], lambda r: -kp(r, 'HP', 'Q_condenser_kW'))
    add('HP reboiler duty  [kW]', -HPr['reboilerDuty'], lambda r: kp(r, 'HP', 'Q_reboiler_kW'))
    add('pump power [kW]', ref['energyStreams']['pE1'], lambda r: kp(r, 'pump', 'W_shaft_kW'))
    table('Benchmark B -- methanol + acetone pressure-swing distillation', cols, rows,
          'Duties are compared as magnitudes; a model azeotrope has no reference number (the\n'
          'sample stores no azeotrope, only product streams -- see README).')

    # Plant balances, each side measured on its own numbers.
    fin = S['equimolarFeed']
    ref_in = fin['F']
    ref_out = S['methanol']['F'] + S['acetoneRichProduct']['F']
    ref_meoh = (S['methanol']['F'] * S['methanol']['x']['methanol']
                + S['acetoneRichProduct']['F'] * S['acetoneRichProduct']['x']['methanol'])
    ref_q = (ref['energyStreams']['reboilerDuty'] + ref['energyStreams']['reboilerDuty2']
             + ref['energyStreams']['pE1'] - ref['energyStreams']['condenserDuty']
             - ref['energyStreams']['condenserDuty2'])
    ref_e = fin['H_kW'] + ref_q - S['methanol']['H_kW'] - S['acetoneRichProduct']['H_kW']
    res = runs['Choupo NRTL'][2]
    geb = res.get('globalEnergyBoundary', {})
    print('\nPlant balances (each side on its own stored numbers)')
    print('  reference: feed %.6f mol/s, products %.6f mol/s (%+.3f %%); methanol out %.6f vs in %.6f;'
          % (ref_in, ref_out, 100 * (ref_out - ref_in) / ref_in, ref_meoh, fin['F'] * fin['x']['methanol']))
    print('             first law  H_feed + Q + W - H_products = %+.3f kW' % ref_e)
    print('             recycle block: converged %s after %s iteration(s); stored |error| T %s K, mass %s kg/s'
          ' against tolerances T %s, mass %s' % (
              U['recycleOp']['converged'], U['recycleOp']['iterationsTaken'],
              U['recycleOp']['errors']['Temperature'], U['recycleOp']['errors']['MassFlow'],
              U['recycleOp']['tolerances']['Temperatura'], U['recycleOp']['tolerances']['VazaoMassica']))
    print('  Choupo NRTL: first-law residual %+.4f kW (%s)' % (geb.get('residual_kW', float('nan')),
                                                             geb.get('residual_basis', '')))

    # Stage profiles, stage j against stage j (condenser = 1).
    for unit, refu, n in (('LP', LPr, 40), ('HP', HPr, 20)):
        prof = res['profiles'][unit]['columns']
        dT = [prof['T'][j] - refu['Tf'][j] for j in range(n)]
        dx = [prof['x_methanol'][j] - refu['xf_methanol'][j] for j in range(n)]
        jT = max(range(n), key=lambda j: abs(dT[j]))
        jx = max(range(n), key=lambda j: abs(dx[j]))
        print('\n%s stage profile, Choupo NRTL - reference (stage 1 = condenser)' % unit)
        print('  stage   T_ref [K]  T_Choupo   dT [K]    x_MeOH_ref  x_MeOH_Choupo   dx')
        for j in sorted(set([0, 1, n // 4, n // 2, 3 * n // 4, n - 1, jT, jx])):
            print('  %5d   %8.3f  %8.3f  %+7.3f    %9.6f   %9.6f   %+9.6f'
                  % (j + 1, refu['Tf'][j], prof['T'][j], dT[j], refu['xf_methanol'][j],
                     prof['x_methanol'][j], dx[j]))
        print('  max |dT| %.3f K at stage %d;  max |dx_MeOH| %.4f at stage %d' % (abs(dT[jT]), jT + 1, abs(dx[jx]), jx + 1))


# ================================================================= case C
def case_C(case, work):
    ref = parse_dict(open(os.path.join(case, 'reference')).read())
    S = ref['streams']
    col = ref['units']['aBS002']

    runs = {}
    for label, variant in (('extractor NRTL', None), ('extractor UNIFAC', 'unifac'),
                           ('stage cascade NRTL', 'stageCascade')):
        cp = scratch_copy(case, variant, work)
        code, res, _ = run(SOLVE, cp)
        conv = None
        if res:
            conv = res.get('converged')
            if 'extractor' in res.get('kpis', {}):
                conv = conv and bool(res['kpis']['extractor'].get('converged'))
        runs[label] = (cp, code, res, conv)
        print('[%s] exit %d, converged %s, NaN-free %s' % (label, code, conv, nan_free(res)))

    def names(label):
        return ('extract', 'raffinate') if label.startswith('extractor') else ('E1', 'raffinate')

    def st(label, which, key):
        res = runs[label][2]
        if not res:
            return None
        s = res['streams'][names(label)[which]]
        if key == 'F':
            return s['F'] * 1000.0
        if key.startswith('x_'):
            return s['composition'][key[2:]]
        return s[key]

    cols = ['reference'] + list(runs)
    rows = []

    def add(label, refv, which, key):
        rows.append([label, refv] + [st(k, which, key) for k in runs])

    E, R = S['eXTRACTEDPRODUCT'], S['bOTTOMS']
    add('extract  F [mol/s]', E['F'], 0, 'F')
    add('extract  x_acetone', E['x']['acetone'], 0, 'x_acetone')
    add('extract  x_water', E['x']['water'], 0, 'x_water')
    add('extract  x_MIBK', E['x']['methylIsobutylKetone'], 0, 'x_methylIsobutylKetone')
    add('extract  T [K]', E['T'], 0, 'T')
    add('raffinate  F [mol/s]', R['F'], 1, 'F')
    add('raffinate  x_acetone', R['x']['acetone'], 1, 'x_acetone')
    add('raffinate  x_water', R['x']['water'], 1, 'x_water')
    add('raffinate  x_MIBK', R['x']['methylIsobutylKetone'], 1, 'x_methylIsobutylKetone')
    add('raffinate  T [K]', R['T'], 1, 'T')
    feed_ac = S['fEED']['F'] * S['fEED']['x']['acetone']
    rec = [1.0 - R['F'] * R['x']['acetone'] / feed_ac]
    for k in runs:
        f, x = st(k, 1, 'F'), st(k, 1, 'x_acetone')
        rec.append(None if f is None else 1.0 - f * x / feed_ac)
    rows.append(['acetone recovery to extract'] + rec)
    conv = ['yes'] + ['yes' if runs[k][3] else 'NO' for k in runs]
    rows.append(['converged'] + conv)
    table('Benchmark C -- acetone from water with MIBK, 4 counter-current stages', cols, rows,
          'A column marked NO is published by the engine but is NOT an answer (README).')

    ref_e = (S['fEED']['H_kW'] + S['sOLVENT']['H_kW'] - E['H_kW'] - R['H_kW'])
    print('\nReference column: stage T (K) %s; adiabatic first law in - out = %+.3f kW'
          % (' '.join('%.2f' % t for t in col['Tf']), ref_e))

    # The curated NRTL set: first the TRANSCRIPTION (the authors' own calculated
    # lines must come back), then the MODEL against the measurements.
    tie_line_check(case, work, 'choiRhim1986_table6_mibk_nrtl.csv', 'calc',
                   "Transcription check: the case NRTL at the midpoints of the authors' CALCULATED "
                   'tie lines (their Table 6), 298.15 K')
    tie_line_check(case, work, 'choiRhim1986_table5_mibk.csv', 'meas',
                   'The case NRTL at the midpoints of the MEASURED tie lines (their Table 5), 298.15 K\n'
                   '(a midpoint flash returns the MODEL tie line through that point)')


def tie_line_check(case, work, csvname, tag, title):
    meas = [l.strip().split(',') for l in open(os.path.join(case, 'measurements', csvname))
            if l.strip() and not l.startswith('#')][1:]
    d = os.path.join(work, 'tieLines.' + tag)
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(os.path.join(d, 'system'))
    shutil.copytree(os.path.join(case, 'constant'), os.path.join(d, 'constant'))
    with open(os.path.join(d, 'system', 'controlDict'), 'w') as f:
        f.write('application choupoProps;\ndescription "tie-line check";\nverbosity 1;\n')
    ops = []
    for i, r in enumerate(meas):
        v = [float(t) for t in r]
        z = [(v[k] + v[k + 3]) / 2 for k in range(3)]       # the midpoint of the tie line
        ops.append('    {\n        name tl%d;\n        type phaseSplitScan;\n'
                   '        state { P 1 atm;  composition { methylIsobutylKetone %.6f; water %.6f; acetone %.6f; } }\n'
                   '        vary { variable T;  from 298.15 K;  to 298.16 K;  n 2; }\n'
                   '        phaseSet LL;  alphaRich water;  betaRich methylIsobutylKetone;\n'
                   '        output { file tl%d.csv; }\n    }' % (i, z[0], z[1], z[2], i))
    with open(os.path.join(d, 'system', 'propsDict'), 'w') as f:
        f.write('operations\n(\n%s\n);\n' % '\n'.join(ops))
    r = subprocess.run([PROPS, d], cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit('compare: the tie-line check did not run:\n' + (r.stdout + r.stderr)[-2000:])
    print('\n' + title)
    print('  line   table organic (MIBK, water, acetone)   Choupo organic         '
          'table aqueous          Choupo aqueous')
    worst = 0.0
    for i, r in enumerate(meas):
        v = [float(t) for t in r]
        p = os.path.join(d, 'tl%d.csv' % i)
        got = None
        if os.path.exists(p):
            L = [l.strip().split(',') for l in open(p) if l.strip()]
            h, row = L[0], L[1]          # the 298.15 K row (the second point only closes the grid)
            if 'x_L2_water' in h:
                def x(ph, c):
                    return float(row[h.index('x_%s_%s' % (ph, c))]) if 'x_%s_%s' % (ph, c) in h else 0.0
                org = 'L1' if x('L1', 'methylIsobutylKetone') > x('L2', 'methylIsobutylKetone') else 'L2'
                aq = 'L2' if org == 'L1' else 'L1'
                got = ([x(org, c) for c in ('methylIsobutylKetone', 'water', 'acetone')],
                       [x(aq, c) for c in ('methylIsobutylKetone', 'water', 'acetone')])
        if got:
            dev = max(abs(a - b) for a, b in zip(got[0] + got[1], v[:3] + v[3:]))
            worst = max(worst, dev)
            print('  %2d    %s   %s   %s   %s   max|d| %.4f' % (i + 1, ' '.join('%.4f' % t for t in v[:3]),
                  ' '.join('%.4f' % t for t in got[0]), ' '.join('%.4f' % t for t in v[3:]),
                  ' '.join('%.4f' % t for t in got[1]), dev))
        else:
            print('  %2d    %s   ONE LIQUID (no split found)' % (i + 1, ' '.join('%.4f' % t for t in v[:3])))
    print('  largest |table - Choupo| over the split lines: %.4f mole fraction' % worst)


CASES = {
    'distillation01_methanol_acetone_pressure_swing': case_B,
    'extraction01_water_acetone_mibk': case_C,
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('case', help='a case folder name under benchmarks/dwsim/, or all')
    ap.add_argument('--keep', action='store_true', help='keep the scratch copies and print where')
    a = ap.parse_args()
    for exe in (SOLVE, PROPS):
        if not os.path.exists(exe):
            sys.exit('compare: %s not found -- build this tree first (make all)' % exe)
    names = list(CASES) if a.case == 'all' else [os.path.basename(a.case.rstrip('/'))]
    work = tempfile.mkdtemp(prefix='choupo-bench-')
    try:
        for n in names:
            if n not in CASES:
                sys.exit('compare: unknown case %s (known: %s)' % (n, ', '.join(CASES)))
            print('=' * 78 + '\n' + n + '\n' + '=' * 78)
            CASES[n](os.path.join(HERE, n), work)
    finally:
        if a.keep:
            print('\nscratch copies kept in', work)
        else:
            shutil.rmtree(work, ignore_errors=True)


if __name__ == '__main__':
    main()
