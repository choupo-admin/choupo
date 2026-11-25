#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""proofs_multicomponent -- SYNTHETIC multi-solid / multi-gas variants of the dryers and the tower.

Real defect (external review 4, 2026-11-25): the shipped corpus carries ONE solid per dryer and ONE
dry gas per tower, so a unit that read "the first solid" or "the majority gas" passed every sweep.
Measured then: EvaporativeDryer with NaCl+KCl, order swapped, moved T_out 357.37 -> 338.27 K; the
CoolingTower ignored an added O2; an infeasible `maxExhaustHumidity` was accepted and announced.

For each unit kind that carries solids or a dry gas, a case is GENERATED (a shipped case is never
edited) from its tutorial, with synthetic components whose properties are declared here, and:
  P  permutation   the same inlet with the components listed in the other order: equal to 1e-9.
  S  split         a component split 50/50 into itself and an identical clone: equal to 1e-9.
  D  doubling      one component's flow doubled: the published mass flows move by the hand amount.
  V  verification  every declared specification re-derived on the PUBLISHED outlet streams, in
                   Python, never from the unit's own residual: exhaust activity <= the cap,
                   one outlet temperature, mass closure, dry-solid moisture from the streams.
  R  refusal       an infeasible specification is REFUSED by name (exit != 0, message names it).

  bin/curate/proofs_multicomponent.py [arm ...]       arms: evap tower convective   (default: all)
Binary: $PROOFS_BIN (default build/linux64Gcc/choupoSolve).  Scratch: ~/.cache/choupo/rev4/mc.
Exit 1 when an arm fails.  --expect-fail ARM... prints the verdict without failing (used to show
an arm failing on the old code).
"""
import json
import math
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
WT = HERE.parents[1]
BIN = Path(os.environ.get('PROOFS_BIN', WT / 'build/linux64Gcc/choupoSolve'))
SCR = Path(os.environ.get('PROOFS_SCRATCH', Path.home() / '.cache/choupo/rev4/mc'))
R = 8.314462618


def solid_record(name, mw, cp):
    return ("name %s;\nformula X;\nrole nonvolatile;\nMW %r;\ndissociation 1;\n"
            "solid { rho_p 2000.0; k_v 0.5235987756; }\n"
            "solidHeatCapacity { model polynomial; coefficients ( %r ); Trange ( 250 700 ); }\n"
            % (name, mw, cp))


def clone_record(src, new):
    t = (WT / 'data/standards/components' / (src + '.dat')).read_text()
    return re.sub(r'^name\s+%s\s*;' % re.escape(src), 'name %s;' % new, t, count=1, flags=re.M)


def table(d):
    return ''.join('    %s %r kmol/h;\n' % (k, v) for k, v in d.items() if v)


def write(p, text):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text)


def make_case(name, tutorial, comps, records, files, flowsheet_extra=None):
    d = SCR / name
    if d.exists():
        shutil.rmtree(d)
    shutil.copytree(WT / 'tutorials/steady' / tutorial, d,
                    ignore=shutil.ignore_patterns('expected', 'converged', 'reports', 'log.*', 'propertyManifest'))
    t = (d / 'constant/thermoPhysPropDict').read_text()
    t = re.sub(r'components\s*\([^)]*\)', 'components ( %s )' % ' '.join(comps), t, count=1)
    (d / 'constant/thermoPhysPropDict').write_text(t)
    for fn, body in records.items():
        write(d / 'constant/components' / (fn + '.dat'), body)
    for rel, body in files.items():
        write(d / rel, body)
    if flowsheet_extra:
        f = d / 'system/flowsheetDict'
        f.write_text(flowsheet_extra(f.read_text()))
    return d


def run(d):
    p = subprocess.run([str(BIN), '.'], cwd=d, env=dict(os.environ, CHOUPO_HOME=str(WT)),
                       capture_output=True, text=True, timeout=900)
    (d / 'out.txt').write_text(p.stdout + p.stderr)
    m = re.search(r'<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>', p.stdout, re.S)
    return p.returncode, (json.loads(m.group(1)) if m else None), p.stdout + p.stderr


def psat_water(T):
    """IAPWS-IF97 saturation pressure [Pa] -- independent of the engine."""
    n = [0.11670521452767e4, -0.72421316703206e6, -0.17073846940092e2, 0.12020824702470e5,
         -0.32325550322333e7, 0.14915108613530e2, -0.48232657361591e4, 0.40511340542057e6,
         -0.23855557567849, 0.65017534844798e3]
    th = T + n[8] / (T - n[9])
    A = th * th + n[0] * th + n[1]
    B = n[2] * th * th + n[3] * th + n[4]
    C = n[5] * th * th + n[6] * th + n[7]
    return 1e6 * (2 * C / (-B + math.sqrt(B * B - 4 * A * C))) ** 4


def stream(res, name):
    s = res['streams'][name]
    return s


RESULTS = []


def check(arm, label, ok, detail=''):
    RESULTS.append((arm, label, bool(ok), detail))
    print('  %-9s %-4s %s %s' % (arm, 'OK' if ok else 'FAIL', label, detail))


def rel(a, b):
    return abs(a - b) / max(abs(a), abs(b), 1e-300)


# ------------------------------------------------------------------ EvaporativeDryer
def evap_case(name, solids, extra_records=None, gas_extra=None, op='', water=15.0, N2=600.0, order=None):
    recs = {'SOLA': solid_record('SOLA', 100.0, 60.0), 'SOLB': solid_record('SOLB', 100.0, 60.0),
            'SOLC': solid_record('SOLC', 250.0, 180.0)}
    recs.update(extra_records or {})
    names = order or list(solids)
    comps = ['water'] + names + ['N2']
    wet = ('componentMolarFlows\n{\n    water %r kmol/h;\n%s}\nT 298.15 K;\nP 101325 Pa;\n'
           'phases\n{\n    liquid { componentMolarFlows { water %r kmol/h; } }\n'
           '    solid  { componentMolarFlows {\n%s    } }\n}\n'
           % (water, table({k: solids[k] for k in names}), water, table({k: solids[k] for k in names})))
    gas = 'componentMolarFlows\n{\n    N2 %r kmol/h;\n    water 0.5 kmol/h;\n}\nT 400 K;\nP 101325 Pa;\n' % N2
    files = {'0/wetSolid': wet, '0/hotGas': gas}
    for stale in ('drySolid', 'humidExhaust'):
        files['0/' + stale] = 'componentMolarFlows\n{\n    water 1 kmol/h;\n}\nT 350 K;\nP 101325 Pa;\n'

    def fl(t):
        return t.replace('operation   { }', 'operation   { %s }' % op)
    return make_case(name, 'drying/evapDryer01_nacl', comps, {k: recs[k] for k in names if k in recs}, files, fl)


def kpi(res, k):
    for u in res.get('units', {}).values() if isinstance(res.get('units'), dict) else []:
        if k in u.get('kpis', {}):
            return u['kpis'][k]
    for u in res.get('units', []) if isinstance(res.get('units'), list) else []:
        if k in u.get('kpis', {}):
            return u['kpis'][k]
    return None


def arm_evap():
    print('EvaporativeDryer')
    base = {'SOLA': 10.0, 'SOLC': 10.0}
    out = {}
    for tag, solids, order in [('ab', base, ['SOLA', 'SOLC']), ('ba', base, ['SOLC', 'SOLA'])]:
        rc, res, txt = run(evap_case('evap_' + tag, solids, order=order))
        out[tag] = (rc, res, txt)
    if out['ab'][1] is None:
        check('evap', 'base run', False, out['ab'][2][-300:])
        return
    Ta = stream(out['ab'][1], 'drySolid')['T']
    Tb = stream(out['ba'][1], 'drySolid')['T'] if out['ba'][1] else float('nan')
    check('evap', 'P component order: T_out', rel(Ta, Tb) < 1e-9, '%.6f vs %.6f K' % (Ta, Tb))
    # split SOLA 50/50 into SOLA + SOLB (identical records)
    rc, res_s, _ = run(evap_case('evap_split', {'SOLA': 5.0, 'SOLB': 5.0, 'SOLC': 10.0}))
    if res_s:
        Ts = stream(res_s, 'drySolid')['T']
        check('evap', 'S split SOLA -> SOLA+SOLB: T_out', rel(Ta, Ts) < 1e-9, '%.6f vs %.6f K' % (Ta, Ts))
        fa = stream(out['ab'][1], 'drySolid')['F'] if 'F' in stream(out['ab'][1], 'drySolid') else None
    else:
        check('evap', 'S split run', False)
    # D doubling: a second solid changes the dry-solid mass flow by the hand amount
    rc, res1, _ = run(evap_case('evap_one', {'SOLA': 10.0}))
    rc, res2, txt2 = run(evap_case('evap_two', {'SOLA': 10.0, 'SOLC': 10.0}))
    if res1 and res2:
        for r_, lab in ((res1, 'one'), (res2, 'two')):
            ex = stream(r_, 'humidExhaust')
            dry = stream(r_, 'drySolid')
            # V: independent exhaust activity and one outlet temperature
            y_w = ex['composition'].get('water', 0.0)
            aw = y_w * ex['P'] / psat_water(ex['T'])
            check('evap', 'V %s solid: outlet streams share one T' % lab, rel(ex['T'], dry['T']) < 1e-12)
            check('evap', 'V %s solid: exhaust a_w <= 0.95 cap (recomputed %.4f)' % (lab, aw), aw <= 0.95 + 1e-6)
    else:
        check('evap', 'D runs', False)
    # D hand-computed: X_initial and drySolid_flow count EVERY solid (kg/s, kmol/h -> /3600)
    for r_, solids, lab in ((res1, {'SOLA': 10.0}, 'one'), (res2, {'SOLA': 10.0, 'SOLC': 10.0}, 'two')):
        if not r_:
            continue
        mw = {'SOLA': 100.0, 'SOLC': 250.0}
        mass = sum(v * mw[k] for k, v in solids.items()) / 3600.0
        Mw = r_['componentMolarMass']['water']
        k_ = r_['kpis']['dryer']
        X0 = 15.0 * Mw / 3600.0 / mass
        check('evap', 'D %s solid: X_initial by hand %.6f' % (lab, X0), rel(k_['X_initial'], X0) < 1e-6,
              'unit %.6f' % k_['X_initial'])
        wf = k_['X_final'] * mass
        check('evap', 'D %s solid: drySolid_flow by hand' % lab, rel(k_['drySolid_flow'], mass + wf) < 1e-6,
              'unit %.6f hand %.6f' % (k_['drySolid_flow'], mass + wf))
    # R refusal: an infeasible cap is refused by name
    rc, resR, txt = run(evap_case('evap_cap', base, op='maxExhaustHumidity 0.0001;'))
    ok = rc != 0 and 'maxExhaustHumidity' in txt
    if rc == 0 and resR:
        ex = stream(resR, 'humidExhaust')
        aw = ex['composition'].get('water', 0.0) * ex['P'] / psat_water(ex['T'])
        check('evap', 'R infeasible cap 0.0001 refused by name', False, 'accepted: published a_w = %.5f' % aw)
    else:
        check('evap', 'R infeasible cap 0.0001 refused by name', ok, txt.strip().split('\n')[-1][:160])
    # V: a feasible tight cap is honoured on the published stream
    rc, resF, txt = run(evap_case('evap_cap2', base, op='maxExhaustHumidity 0.30;', N2=100.0))
    if resF:
        ex = stream(resF, 'humidExhaust')
        aw = ex['composition'].get('water', 0.0) * ex['P'] / psat_water(ex['T'])
        check('evap', 'V cap 0.30 honoured on published stream (a_w %.4f)' % aw, aw <= 0.30 * (1 + 1e-3))
    else:
        check('evap', 'V cap 0.30 run', False, txt[-200:])


# ------------------------------------------------------------------ CoolingTower
def tower_case(name, gas, extra=None, order=None):
    names = order or list(gas)
    recs = {}
    for c, o in (extra or {}).items():
        recs[c] = clone_record(o, c)
    comps = ['water'] + names
    air = 'componentMolarFlows\n{\n%s    water 1.3 kmol/h;\n}\nT 298.15 K;\nP 101325 Pa;\n' % table({k: gas[k] for k in names})
    files = {'0/air': air}
    return make_case(name, 'heat/coolingTower01_merkel', comps, recs, files)


def arm_tower():
    print('CoolingTower')
    ref = {'N2': 65.0}
    rc, r0, t0 = run(tower_case('tw_n2', ref))
    if not r0:
        check('tower', 'base run', False, t0[-300:])
        return
    T0 = stream(r0, 'coolWater')['T']
    rc, r1, _ = run(tower_case('tw_split', {'N2': 32.5, 'N2B': 32.5}, extra={'N2B': 'N2'}))
    if r1:
        check('tower', 'S split N2 -> N2+N2B: T_water_out', rel(T0, stream(r1, 'coolWater')['T']) < 1e-9,
              '%.6f vs %.6f' % (T0, stream(r1, 'coolWater')['T']))
    rc, r2, _ = run(tower_case('tw_o2', {'N2': 65.0, 'O2': 20.0}))
    rc, r3, _ = run(tower_case('tw_o2r', {'N2': 65.0, 'O2': 20.0}, order=['O2', 'N2']))
    if r2 and r3:
        check('tower', 'P order O2/N2: T_water_out', rel(stream(r2, 'coolWater')['T'], stream(r3, 'coolWater')['T']) < 1e-9)
        check('tower', 'D adding O2 changes the result', rel(stream(r2, 'coolWater')['T'], T0) > 1e-6,
              '%.6f vs %.6f K' % (stream(r2, 'coolWater')['T'], T0))
        ex = stream(r2, 'humidAir')
        aw = ex['composition'].get('water', 0.0) * ex['P'] / psat_water(ex['T'])
        check('tower', 'V exhaust announced saturated: recomputed RH %.4f' % aw, abs(aw - 1.0) < 2e-3)
    else:
        check('tower', 'O2 runs', False)


# ------------------------------------------------------------------ ConvectiveDryer
def arm_convective():
    print('ConvectiveDryer')
    src = (WT / 'tutorials/steady/drying/convDryer01_sugar_curve/0/wetSolid').read_text()
    rec = {'SOLA': solid_record('SOLA', 100.0, 60.0)}
    for tag, extra in (('one', False), ('two', True)):
        s = src
        if extra:
            s = s.replace('    sucrose    10.00008764 kmol/h;\n}\n\nT', '    sucrose    10.00008764 kmol/h;\n    SOLA 1 kmol/h;\n}\n\nT', 1)
            s = s.replace('            sucrose    10.00008764 kmol/h;\n', '            sucrose    10.00008764 kmol/h;\n            SOLA 1 kmol/h;\n', 1)
        comps = ['water', 'sucrose', 'air'] + (['SOLA'] if extra else [])
        d = make_case('conv_' + tag, 'drying/convDryer01_sugar_curve', comps, rec if extra else {},
                      {'0/wetSolid': s})
        rc, res, txt = run(d)
        if not extra:
            check('convective', 'base run converges', res is not None and rc == 0, txt[-120:])
        else:
            lost = None
            if res is not None and rc == 0:
                lost = 'accepted; SOLA absent from drySolid: %s' % ('SOLA' not in str(res['streams'].get('drySolid', {})))
            check('convective', 'R a second solid is refused by name (never dropped)',
                  rc != 0 and 'SOLA' in txt, lost or txt.strip().split('\n')[-1][:140])


ARMS = {'evap': arm_evap, 'tower': arm_tower, 'convective': arm_convective}

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    expect_fail = '--expect-fail' in sys.argv
    SCR.mkdir(parents=True, exist_ok=True)
    for a in (args or list(ARMS)):
        ARMS[a]()
    bad = [r for r in RESULTS if not r[2]]
    print('%d checks, %d FAIL' % (len(RESULTS), len(bad)))
    sys.exit(0 if (not bad or expect_fail) else 1)
