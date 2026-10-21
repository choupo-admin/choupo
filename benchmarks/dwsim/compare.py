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


# ================================================================= helpers shared by A, D, E
def kp(res, unit, *keys):
    """The first of `keys` the unit publishes, else None."""
    if not res or unit not in res.get('kpis', {}):
        return None
    for k in keys:
        if k in res['kpis'][unit]:
            return res['kpis'][unit][k]
    return None


def stv(res, name, key):
    """A stream's T [K], P [Pa], F [mol/s], vf or x_<component>."""
    if not res or name not in res.get('streams', {}):
        return None
    s = res['streams'][name]
    if key == 'F':
        return s['F'] * 1000.0
    if key.startswith('x_'):
        return s['composition'].get(key[2:])
    return s.get(key)


def regenerate(copy, subcase, binary, outputs, ignore=(r'^\s*(Written|fitDate|generated)\b',), label=''):
    """Re-run a generator props case inside the scratch copy and REFUSE if what
    it writes differs from the committed file (lines matching `ignore` -- the
    date the file was written -- excepted).  The committed records are the
    ones the case runs on; a generator that no longer reproduces them means
    the engine or the table moved and the case is running on a stale number."""
    before = {o: open(os.path.join(copy, o)).read() if os.path.exists(os.path.join(copy, o)) else None
              for o in outputs}
    r = subprocess.run([binary, os.path.join(copy, subcase) if subcase else copy],
                       cwd=ROOT, capture_output=True, text=True)
    with open(os.path.join(copy, (subcase or 'case').replace('/', '_') + '.regen.log'), 'w') as f:
        f.write(r.stdout + r.stderr)
    if r.returncode != 0:
        sys.exit('compare: %s did not run (exit %d):\n%s' % (label or subcase, r.returncode,
                 (r.stdout + r.stderr)[-3000:]))
    pat = re.compile('|'.join(ignore))
    for o in outputs:
        p = os.path.join(copy, o)
        if not os.path.exists(p):
            sys.exit('compare: %s wrote no %s' % (label or subcase, o))
        new = [l for l in open(p).read().splitlines() if not pat.search(l)]
        old = [l for l in (before[o] or '').splitlines() if not pat.search(l)]
        if before[o] is None:
            sys.exit('compare: %s is not committed; the generator wrote it -- commit it (the case '
                     'runs on the committed file)' % o)
        if new != old:
            import difflib
            diff = '\n'.join(list(difflib.unified_diff(old, new, 'committed', 'regenerated', lineterm=''))[:40])
            sys.exit('compare: the committed %s is NOT what %s writes today -- the engine or its '
                     'table moved; regenerate and commit, or say why the committed one differs:\n%s'
                     % (o, label or subcase, diff))
    print('[%s] regenerated %d file(s), identical to the committed ones' % (label or subcase, len(outputs)))
    return r.stdout + r.stderr


def plant_lines(res, label):
    geb = res.get('globalEnergyBoundary', {}) if res else {}
    print('  %s: first-law residual %s kW (%s); converged %s'
          % (label, fmt(geb.get('residual_kW')), geb.get('residual_basis', '--'),
             res.get('converged') if res else None))


# ================================================================= case A
def case_A(case, work):
    ref = parse_dict(open(os.path.join(case, 'reference')).read())
    S, U, E = ref['streams'], ref['units'], ref['energyStreams']
    cp = scratch_copy(case, None, work)
    sets = ['constant/parameters/PengRobinson/ppr78_%s.dat' % t
            for t in ('SEP0_322.03K', 'SEP1_310.92K', 'SEP2_308.7K', 'SEP3_302.6K')]
    regenerate(cp, 'kijTables', PROPS, sets, label='A kij sets (PPR78 at the four separators)')
    subprocess.run([INIT0, cp], cwd=ROOT, capture_output=True, text=True)
    code, res, _ = run(SOLVE, cp)
    print('[Choupo] exit %d, converged %s, NaN-free %s' % (code, res and res.get('converged'), nan_free(res)))

    cols = ['reference', 'Choupo', 'Choupo - ref', 'rel %']
    rows = []

    def add(label, refv, v):
        d = None if refv is None or v is None else v - refv
        rows.append([label, refv, v, d, rel(v, refv)])

    # products and the loop streams, as stored vs as solved
    for sid, what in (('8', 'GAS PRODUCT s8'), ('18', 'LIQUID PRODUCT s18'), ('5', 'SEP0 vapour s5'),
                      ('6', 'SEP0 liquid s6'), ('1', 'recycle s1 (V0 out)'), ('3', 'recycle s3 (C1 out)'),
                      ('20', 'recycle s20 (C2 out)'), ('4', 'tear s4 (M0 out)'), ('12', 'tear s12 (M1 out)')):
        r = S[sid]
        name = 's' + sid
        add(what + '  F [mol/s]', r['F'], stv(res, name, 'F'))
        add(what + '  T [K]', r['T'], stv(res, name, 'T'))
        if sid in ('8', '18', '4', '12'):
            for c in ('methane', 'ethane', 'propane', 'nButane', 'nDecane'):
                cc = {'methane': 'CH4'}.get(c, c)
                add(what + '  x_' + cc, r['x'].get(c), stv(res, name, 'x_' + cc))
        if 'vaporFraction' in r:
            add(what + '  vapour fraction', r['vaporFraction'], stv(res, name, 'vf'))
    # duties: the sample's vessel = Choupo's declared-T mixer + separator (README)
    def qsum(*units):
        vals = [kp(res, u, 'Q_kW') for u in units]
        return None if any(v is None for v in vals) else sum(vals)
    add('SEP0 duty [kW] (Choupo: M0 + SEP0)', E['eSTR003'], qsum('M0', 'SEP0'))
    add('SEP1 duty [kW]', E['eSTR005'], kp(res, 'SEP1', 'Q_kW'))
    add('SEP2 duty [kW] (Choupo: M1 + SEP2)', E['eSTR006'], qsum('M1', 'SEP2'))
    add('SEP3 duty [kW]', E['eSTR004'], kp(res, 'SEP3', 'Q_kW'))
    add('C0 shaft power [kW]', E['e1'], kp(res, 'C0', 'W_shaft_kW'))
    add('C1 shaft power [kW]', E['e2'], kp(res, 'C1', 'W_shaft_kW'))
    add('C2 shaft power [kW]', E['e3'], kp(res, 'C2', 'W_shaft_kW'))
    add('C0 outlet T [K]', S['7']['T'], stv(res, 's7', 'T'))
    add('C1 outlet T [K]', S['15']['T'], stv(res, 's3', 'T'))
    add('C2 outlet T [K]', S['19']['T'], stv(res, 's20', 'T'))
    add('V0 outlet T [K]', S['10']['T'], stv(res, 's1', 'T'))
    add('V1 outlet T [K]', S['11']['T'], stv(res, 's11', 'T'))
    add('V2 outlet T [K]', S['16']['T'], stv(res, 's16', 'T'))
    table('Benchmark A -- Cavett as the reference sample ships it (psig, compressors, valves; PR78 + PPR78)',
          cols, rows, 'Duties: + heating, - cooling, both sides.  Every reference number is the sample\'s stored state.')

    feed = S['2']
    ref_out = S['8']['F'] + S['18']['F']
    worst = max(abs(feed['F'] * feed['x'][c] - S['8']['F'] * S['8']['x'][c] - S['18']['F'] * S['18']['x'][c])
                for c in feed['x'])
    ref_e = (feed['H_kW'] + E['eSTR003'] + E['eSTR005'] + E['eSTR006'] + E['eSTR004'] + E['e1'] + E['e2'] + E['e3']
             - S['8']['H_kW'] - S['18']['H_kW'])
    print('\nPlant balances (each side on its own stored numbers)')
    print('  reference: feed %.4f mol/s, products %.4f mol/s (%+.4f %%); worst component imbalance %.4f mol/s'
          % (feed['F'], ref_out, 100 * (ref_out - feed['F']) / feed['F'], worst))
    print('             first law  H_feed + sum(duties) + sum(W) - H_products = %+.3f kW' % ref_e)
    for r in ('rEC000', 'rEC001', 'rEC002'):
        print('             recycle block %s: converged %s after %s iteration(s)'
              % (r, U[r]['converged'], U[r]['iterationsTaken']))
    plant_lines(res, 'Choupo')

    # THE FINDING, kept on screen: the same plant with ADIABATIC mixers, as built
    cpv = scratch_copy(case, 'adiabaticMixers', work)
    codev, resv, _ = run(SOLVE, cpv)
    print('\nVariant adiabaticMixers (the mixers as the sample has them): exit %d, converged %s'
          % (codev, resv and resv.get('converged')))
    plant_lines(resv, 'Choupo, adiabatic mixers')
    by = os.path.join(cpv, 'reports', 'balances', 'energyBalance_byUnit.csv')
    if os.path.exists(by):
        lines = open(by).read().split('\n\n')[0].splitlines()
        hdr = lines[0].split(',')
        for l in lines[1:]:
            f = l.split(',')
            if f and f[0] in ('M0', 'M1'):
                print('  %s: H_in %s kW, H_out %s kW, remaining imbalance %s kW (the engine\'s own report)'
                      % (f[0], f[hdr.index('H_in_kW')], f[hdr.index('H_out_kW')], f[hdr.index('remaining_kW')]))


# ================================================================= case D
def case_D(case, work):
    ref = parse_dict(open(os.path.join(case, 'reference')).read())
    S, U, E = ref['streams'], ref['units'], ref['energyStreams']
    cp = scratch_copy(case, None, work)
    regenerate(cp, 'kijTables', PROPS, ['constant/parameters/PengRobinson/eppr78_510.15K.dat'],
               label='D kij set (E-PPR78 at 510.15 K)')
    fitlog = regenerate(cp, 'kijFits', PROPS,
                        ['constant/parameters/PengRobinson/%s-methanol.dat' % g for g in ('H2', 'CO', 'CO2')]
                        + ['constant/parameters/PengRobinson/methanol-water.dat'],
                        label='D methanol pairs (fitParameters P_bubble, Brunner 1987)')
    for m in re.finditer(r'VERDICT\n\s+(\w+)', fitlog):
        pass
    verdicts = re.findall(r'proposal written to: (\S+)\s+\(verdict (\w+)', fitlog)
    for path, v in verdicts:
        print('  fit %s: verdict %s' % (os.path.basename(path), v))
    subprocess.run([INIT0, cp], cwd=ROOT, capture_output=True, text=True)
    code, res, _ = run(SOLVE, cp)
    print('[Choupo] exit %d, converged %s, NaN-free %s' % (code, res and res.get('converged'), nan_free(res)))

    cols = ['reference', 'Choupo', 'Choupo - ref', 'rel %']
    rows = []

    def add(label, refv, v):
        d = None if refv is None or v is None else v - refv
        rows.append([label, refv, v, d, rel(v, refv)])

    comp = {'methanol': 'methanol', 'water': 'water', 'hydrogen': 'H2', 'carbonDioxide': 'CO2',
            'carbonMonoxide': 'CO', 'argon': 'Ar'}
    pairs = (('mSTR006', 's6', 'H2 compressed s6'), ('mSTR031', 's31', 'CO2 compressed s31'),
             ('mSTR033', 's33', 'make-up s33'), ('mSTR040', 's40', 'reactor feed s40'),
             ('outletPFR', 'sPFR', 'reactor outlet'), ('mSTR042', 's42', 'after feed/effluent HX s42'),
             ('mSTR046', 's46', 'condenser outlet s46'), ('mSTR052', 's52', 'HP separator vapour'),
             ('mSTR055', 's55', 'after V54 (COMP-054) s55'),
             ('mSTR053', 's53', 'HP separator liquid'), ('purgeGases', 'purge', 'purge'),
             ('mSTR043', 's43', 'recycle s43'), ('mSTR044', 's44', 'recycle heated s44'),
             ('vent', 'vent', 'vent'), ('mSTR064', 's64', 'column feed liquid s64'),
             ('mSTR070', 's70', 'COL85 distillate s70'), ('waterProduct', 'waterProduct', 'water product'),
             ('methanolProduct', 'methanolProduct', 'METHANOL PRODUCT'), ('mSTR080', 's80', 'COL78 bottoms s80'))
    for rk, ck, what in pairs:
        r = S[rk]
        add(what + '  F [mol/s]', r['F'], stv(res, ck, 'F'))
        add(what + '  T [K]', r['T'], stv(res, ck, 'T'))
        if 'vaporFraction' in r:
            add(what + '  vapour fraction', r['vaporFraction'], stv(res, ck, 'vf'))
        if rk in ('outletPFR', 'mSTR053', 'purgeGases', 'methanolProduct', 'waterProduct', 'vent', 'mSTR064'):
            for rc, cc in comp.items():
                add(what + '  x_' + cc, r['x'].get(rc), stv(res, ck, 'x_' + cc))
    add('C5 H2 compressor [kW]', E['eSTR007'], kp(res, 'C5', 'W_shaft_kW'))
    add('C10 [kW]', E['eSTR009'], kp(res, 'C10', 'W_shaft_kW'))
    add('C16 [kW]', E['eSTR018'], kp(res, 'C16', 'W_shaft_kW'))
    add('C23 [kW]', E['eSTR025'], kp(res, 'C23', 'W_shaft_kW'))
    add('C27 [kW]', E['eSTR032'], kp(res, 'C27', 'W_shaft_kW'))
    add('HX12 duty [kW]', U['hE012']['q'], kp(res, 'HX12', 'Q_kW'))
    add('HX19 duty [kW]', U['hE019']['q'], kp(res, 'HX19', 'Q_kW'))
    add('HX26 duty [kW]', U['hE026']['q'], kp(res, 'HX26', 'Q_kW'))
    add('HX41 feed/effluent duty [kW]', U['hE041']['q'], kp(res, 'HX41', 'Q_kW'))
    add('condenser PC45 duty [kW] (ref HE-045)', -abs(U['hE045']['q']) if U['hE045'].get('q') else None,
        kp(res, 'PC45', 'Q_kW'))
    mixQ = kp(res, 'M39', 'Q_kW')
    pfrQ = kp(res, 'PFR', 'Q_kW')
    add('reactor duty [kW] (ref: outlet-T mode; Choupo: M39 heat + isothermal PFR)', E['eSTR036'],
        None if mixQ is None or pfrQ is None else mixQ + pfrQ)
    rows.append(['   of which M39 (489 -> 510.15 K)', None, mixQ, None, None])
    rows.append(['   of which PFR (isothermal)', None, pfrQ, None, None])
    add('pump P66 [kW]', E['eSTR068'], kp(res, 'P66', 'W_shaft_kW', 'W_kW'))
    add('COL85 N (shortcut)', U['sC085']['m_N'], kp(res, 'COL85', 'N_theoretical'))
    add('COL85 N_min', U['sC085']['m_Nmin'], kp(res, 'COL85', 'N_min'))
    add('COL85 R_min', U['sC085']['m_Rmin'], kp(res, 'COL85', 'R_min'))
    add('COL78 N (shortcut)', U['sC078']['m_N'], kp(res, 'COL78', 'N_theoretical'))
    add('COL78 N_min', U['sC078']['m_Nmin'], kp(res, 'COL78', 'N_min'))
    add('COL78 R_min', U['sC078']['m_Rmin'], kp(res, 'COL78', 'R_min'))
    table('Benchmark D -- methanol from CO2, the plant as the reference sample ships it (PR78 + E-PPR78 + fitted methanol pairs)',
          cols, rows, 'Every reference number is the sample\'s stored state; its reactor runs in outlet-T mode (489 -> 510.15 K).')

    fin = S['hYDROGEN']['F'] + S['cO2']['F']
    fout = S['purgeGases']['F'] + S['vent']['F'] + S['waterProduct']['F'] + S['methanolProduct']['F'] + S['mSTR080']['F']
    print('\nPlant balances (each side on its own stored numbers)')
    print('  reference: feeds %.6f mol/s, products %.6f mol/s (%+.4f %%) -- a flow balance only; the sample'
          ' stores no enthalpy per stream' % (fin, fout, 100 * (fout - fin) / fin))
    for r in ('rEC050', 'rEC059'):
        print('             recycle block %s: converged %s after %s iteration(s)'
              % (r, U[r]['converged'], U[r]['iterationsTaken']))
    plant_lines(res, 'Choupo')


# ================================================================= case E
def case_E(case, work):
    ref = parse_dict(open(os.path.join(case, 'reference')).read())
    S, U, E = ref['streams'], ref['units'], ref['energyStreams']
    cp = scratch_copy(case, None, work)
    regenerate(cp, 'kijTables', PROPS, ['constant/parameters/PengRobinson/eppr78_1000K.dat'],
               label='E kij set (E-PPR78 at 1000 K)')
    # the lnK table pasted into constant/reactions must be what reactionGibbs writes today
    r = subprocess.run([PROPS, cp], cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit('compare: E reactionGibbs did not run:\n' + (r.stdout + r.stderr)[-2000:])
    csv = os.path.join(cp, 'reactionGibbs.csv')
    lnk = {}
    for line in open(csv).read().splitlines()[1:]:
        f = line.split(',')
        if len(f) >= 6:
            lnk.setdefault(f[0], []).append((float(f[1]), float(f[5])))
    rx = open(os.path.join(cp, 'constant', 'reactions')).read()
    for rname, col in (('steamReforming', 'lnK1'), ('waterGasShift', 'lnK2'), ('overallReforming', 'lnK3')):
        m = re.search(col + r'\s*\(([^)]*)\)', rx)
        pasted = [float(t) for t in m.group(1).split()] if m else []
        fresh = [v for _, v in lnk.get(rname, [])]
        if len(pasted) != len(fresh) or any(abs(a - b) > 1e-6 for a, b in zip(pasted, fresh)):
            sys.exit('compare: the %s table pasted in constant/reactions is not what reactionGibbs writes today '
                     '(%s vs %s) -- re-run the op and paste the CSV' % (col, pasted[:3], fresh[:3]))
    print('[E lnK tables] the three pasted tables reproduce reactionGibbs today (%d points each)' % len(fresh))
    # the sample's own K correlations (read from the numerators `reference` stores) beside
    # Choupo's formation-data K at 1000 K, both on the bar basis (theirs are in atm: K1, K3 x 1.01325^2)
    rxs = ref.get('reactions', {})
    corr = {}
    for v in rxs.values():
        num = v.get('rateEquationNumerator', '') if isinstance(v, dict) else ''
        m = re.search(r'exp\(([-+0-9.]+)([-+][0-9.]+)/T\)\)\)\s*$', num.strip('"'))
        if m:
            corr[num] = (float(m.group(1)), float(m.group(2)))
    at = dict((r, dict(lnk[r])) for r in lnk)
    print('  equilibrium constants at 1000 K, bar basis (the sample\'s correlation / Choupo\'s formation data):')
    for rname, a_b, atm2 in (('steamReforming', (30.42, -27106.0), True), ('waterGasShift', (-3.798, 4160.0), False),
                             ('overallReforming', (34.218, -31266.0), True)):
        found = [k for k, ab in corr.items() if ab == a_b]
        Ks = math.exp(a_b[0] + a_b[1] / 1000.0) * (1.01325 ** 2 if atm2 else 1.0)
        Kc = math.exp(at[rname][1000.0])
        print('    %-17s sample %.4g  Choupo %.4g  (ratio %.4f)%s'
              % (rname, Ks, Kc, Ks / Kc, '' if found else '   [correlation NOT found in reference -- re-read]'))
    subprocess.run([INIT0, cp], cwd=ROOT, capture_output=True, text=True)
    code, res, _ = run(SOLVE, cp)
    print('[Choupo] exit %d, converged %s, NaN-free %s' % (code, res and res.get('converged'), nan_free(res)))

    cols = ['reference', 'Choupo', 'Choupo - ref', 'rel %']
    rows = []

    def add(label, refv, v):
        d = None if refv is None or v is None else v - refv
        rows.append([label, refv, v, d, rel(v, refv)])

    p = S['mSTR001']
    add('product F [mol/s]', p['F'], stv(res, 'product', 'F'))
    add('product T [K]', p['T'], stv(res, 'product', 'T'))
    add('product P [Pa]', p['P'], stv(res, 'product', 'P'))
    for rc, cc in (('methane', 'CH4'), ('hydrogen', 'H2'), ('water', 'water'), ('carbonDioxide', 'CO2'),
                   ('carbonMonoxide', 'CO')):
        add('product x_' + cc, p['x'].get(rc), stv(res, 'product', 'x_' + cc))
    feedCH4 = S['mSTR000']['F'] * S['mSTR000']['x']['methane']
    add('CH4 conversion', 1 - p['F'] * p['x']['methane'] / feedCH4,
        None if res is None else 1 - stv(res, 'product', 'F') * stv(res, 'product', 'x_CH4') / feedCH4)
    add('reactor duty [kW] (isothermal, + endothermic)', E['eSTR000'], kp(res, 'PFR', 'Q_kW'))
    table('Benchmark E -- methane steam reforming PFR, 1000 K, 1 atm (Xu & Froment 1989; PR78 + E-PPR78)',
          cols, rows, 'The sample\'s own equilibrium correlations and its atm pressures are findings (README).')
    print('\n  reference PFR: pressure drop %s Pa (not reproduced), stored residence time %s s'
          % (U['pFR000']['deltaP'], U['pFR000']['residenceTime']))
    plant_lines(res, 'Choupo')
    prof = res.get('profiles', {}).get('PFR', {}).get('columns', {}) if res else {}
    if 'T' in prof:
        print('  Choupo T profile: %.2f K at the inlet, %.2f K at the outlet (isothermal by construction)'
              % (prof['T'][0], prof['T'][-1]))


CASES = {
    'distillation01_methanol_acetone_pressure_swing': case_B,
    'extraction01_water_acetone_mibk': case_C,
    'recycle01_cavett_as_shipped': case_A,
    'methanol01_co2_hydrogenation': case_D,
    'reforming01_methane_steam_pfr': case_E,
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
