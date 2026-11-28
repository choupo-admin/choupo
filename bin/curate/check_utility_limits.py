#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_utility_limits -- a thermal-feasibility proof on the PUBLISHED result
of every shipped steady case, and on a geometry-perturbed copy of each
exchanger-like case (2026-11-25, external review 5).

THE REAL DEFECTS IT WOULD HAVE CAUGHT (named, as the gate rule asks):
  (1) condenser01_film_nusselt with nTubes 24 -> 34 left at 284.51 K with the
      coolant at 300 K; reboiler_water_copper with the feed cut to 8 kmol/h
      left as vapour at 638.81 K with the heating medium at 393 K.  Both
      converged and closed the first law; the phaseChanger geometry mode
      priced flux x area with no bound on the latent heat the feed has.
  (2) heatExchanger03_pure_water_plateau: the published profile was the
      constant-C curve anchored at the eps-NTU end temperatures, with no duty
      or enthalpy column, so no field of the file could show whether energy
      was conserved along it (the reviewer's 67.6 against 133.6 kW at half
      length was NOT reproduced here: the old file carried no H to form it).

WHAT IS CHECKED, FROM THE RESULT JSON ALONE (no entropy is published; the
second law is checked in its LOCAL form, which for a heat-transfer pair is
exactly "no node where the heat flows uphill"):
  heatExchanger  : T_hot_out >= T_cold_in, T_cold_out <= T_hot_in; the
                   segment minimum approach dT_min_segments > 0 (the verdict
                   comes from the segments, never from the terminal pair);
                   the segment energy residual of the published profile
                   <= 1e-6 relative; the profile's own columns: Q_cum
                   monotone and ending at the unit's duty, T_hot >= T_cold at
                   every node, vf columns present.
  phaseChanger   : (geometry mode) the outlet T against the utility's inlet T
                   (T_utility_in), and |Q| <= the phase's capacity
                   (Q_capacity_kW).
  every allocated utility (utilityAllocation): the catalogue's T_in against
                   the process temperature it serves (heating utility not
                   colder, cooling utility not hotter).
Run:   check_utility_limits.py            shipped cases of heat/ and plant/
       check_utility_limits.py --arms     the counterexample arms
       check_utility_limits.py --sweep J  the perturbation sweep, J jobs
Exit 1 on any violation.  NOT COVERED: entropy from an independent property
evaluation (the engine publishes none), dynamic and batch jackets, dryers.
"""
import concurrent.futures as cf
import json
import math
import os
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'bin/curate'))
SOLVE = ROOT / 'build' / 'linux64Gcc' / 'choupoSolve'
SCR = Path(os.environ['HOME']) / '.cache/choupo/rev5/sweep'
TYPES = ('heatExchanger', 'phaseChanger', 'boiler', 'condenser', 'evaporator',
         'heater', 'multiStreamHX', 'coolingTower')
TOL = 1.0e-6


def utility_T_in():
    out = {}
    for f in (ROOT / 'data/standards/utilities').glob('*.dat'):
        t = f.read_text(errors='replace')
        tier = re.search(r'^\s*tier\s+(\w+)', t, re.M)
        m = re.search(r'^\s*T_in\s+([-+0-9.eE]+)\s*(K|C)?', t, re.M)
        if tier and m:
            v = float(m.group(1))
            if m.group(2) == 'C':
                v += 273.15
            out[f.stem] = (tier.group(1), v)
    return out


UT = None


def violations(j):
    """-> list of strings; [] = thermally feasible as published."""
    global UT
    if UT is None:
        UT = utility_T_in()
    v = []
    for u, k in (j.get('kpis') or {}).items():
        if 'T_hot_out' in k and 'T_cold_in' in k:
            if k['T_hot_out'] < k['T_cold_in'] - 1e-6:
                v.append('%s: hot outlet %.2f K below cold inlet %.2f K' % (u, k['T_hot_out'], k['T_cold_in']))
            if k['T_cold_out'] > k['T_hot_in'] + 1e-6:
                v.append('%s: cold outlet %.2f K above hot inlet %.2f K' % (u, k['T_cold_out'], k['T_hot_in']))
            if 'dT_min_segments' in k and k['dT_min_segments'] < -1e-9:
                v.append('%s: temperature cross inside the exchanger, min approach %.3f K' % (u, k['dT_min_segments']))
            if 'profile_residual' in k and k['profile_residual'] > TOL:
                v.append('%s: segment energy residual %.2e' % (u, k['profile_residual']))
            p = ((j.get('profiles') or {}).get(u) or {}).get('columns')
            if p is None:
                continue
            if k.get('profile_segmentwise', 1.0) == 0.0:
                continue            # announced ILLUSTRATIVE (no enthalpy datum): no verdict claimed
            if 'Q_cum' not in p:
                v.append('%s: published profile carries no per-segment duty (Q_cum)' % u)
                continue
            q = p['Q_cum']
            if any(b < a - 1e-9 * max(1.0, abs(b)) for a, b in zip(q, q[1:])):
                v.append('%s: Q_cum not monotone' % u)
            if abs(q[-1] - k['Q']) > 1e-6 * max(1.0, abs(k['Q'])):
                v.append('%s: profile ends at %.6g W, the unit reports %.6g W' % (u, q[-1], k['Q']))
            if any(h < c - 1e-9 for h, c in zip(p['T_hot'], p['T_cold'])):
                v.append('%s: profile has a node with T_hot < T_cold' % u)
        if 'T_utility_in' in k and 'T_out' in k and 'vf_in' in k:
            Tu = k['T_utility_in']
            if k['vf_in'] >= 0.5 and k['T_out'] < Tu - 1e-6:
                v.append('%s: condensate leaves at %.2f K, colder than the coolant inlet %.2f K' % (u, k['T_out'], Tu))
            if k['vf_in'] < 0.5 and k['T_out'] > Tu + 1e-6:
                v.append('%s: outlet at %.2f K, hotter than the heating medium inlet %.2f K' % (u, k['T_out'], Tu))
            if 'Q_capacity_kW' in k and abs(k.get('Q_kW', 0.0)) > k['Q_capacity_kW'] * (1 + 1e-6) + 1e-9:
                v.append('%s: |Q| %.3f kW exceeds the phase capacity %.3f kW' % (u, abs(k['Q_kW']), k['Q_capacity_kW']))
    for a in j.get('utilityAllocation') or []:
        if not a.get('allocated') or a['utility'] not in UT:
            continue
        tier, Tin = UT[a['utility']]
        T = a.get('T', -1)
        if T <= 0:
            continue
        if tier == 'heating' and Tin < T - 1e-6:
            v.append('%s: heating utility %s at %.1f K serves a process at %.1f K' % (a['unit'], a['utility'], Tin, T))
        if tier == 'cooling' and Tin > T + 1e-6:
            v.append('%s: cooling utility %s at %.1f K serves a process at %.1f K' % (a['unit'], a['utility'], Tin, T))
    return v


def extract(stdout):
    m = re.search(r'<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>', stdout, re.S)
    return json.loads(m.group(1)) if m else None


def run(d, tmo=300):
    p = subprocess.run([str(SOLVE), '.'], cwd=d, capture_output=True, text=True, errors='replace', timeout=tmo,
                       env=dict(os.environ, CHOUPO_HOME=str(ROOT)))
    return p.returncode, p.stdout, p.stderr


def classify(rc, out, err):
    j = extract(out)
    if rc < 0 or rc >= 128 or 'terminate called' in err or 'Segmentation' in err:
        return 'CRASH', ['rc=%d' % rc]
    if rc != 0:
        e = [x for x in err.split('\n') if x.startswith('ERROR')]
        return ('REFUSED' if e else 'NOTCONV'), [(e[-1] if e else err.strip().split('\n')[-1:][0] if err.strip() else '')[:200]]
    if j is None:
        return 'NORESULT', []
    v = violations(j)
    return ('INFEASIBLE' if v else 'OK'), v


def heat_cases():
    import case_records
    out = []
    for top in ('tutorials/steady', 'tutorials/plant'):
        for fd in sorted((ROOT / top).rglob('system/flowsheetDict')):
            d = fd.parent.parent
            t = fd.read_text(errors='replace')
            if re.search(r'^\s*type\s+(%s)\s*;' % '|'.join(TYPES), t, re.M) and (d / 'system/controlDict').exists():
                if re.search(r'application\s+choupoSolve', (d / 'system/controlDict').read_text()):
                    out.append(d)
    return out


def fresh(case, dst):
    import case_records
    import shutil
    dst = Path(dst)
    if dst.exists():
        shutil.rmtree(dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    case_records.copytree(case, dst)
    for junk in ('converged', 'reports', 'problemDivergence'):
        x = dst / junk
        if x.is_dir():
            shutil.rmtree(x)
    return dst


def shipped(jobs):
    bad = 0
    cases = heat_cases()

    def one(c):
        d = fresh(c, SCR / 'shipped' / c.name)
        try:
            rc, o, e = run(d)
            return c, classify(rc, o, e)
        finally:
            import shutil
            shutil.rmtree(d, ignore_errors=True)
    with cf.ThreadPoolExecutor(jobs) as ex:
        for c, (k, why) in ex.map(one, cases):
            if k not in ('OK',):
                print('%-9s %s %s' % (k, c.relative_to(ROOT), why))
                bad += 1
    print(('check_utility_limits: OK -- %d shipped exchanger-like steady cases: no outlet beyond the stream that heats or cools it, no phase exhausted, every profile conserves energy by segment; NOT checked: entropy, batch and dynamic jackets, dryers' % len(cases)) if not bad else
          'check_utility_limits: FAIL -- %d of %d cases' % (bad, len(cases)))
    return bad


# ---- the counterexample arms: the OLD answers, as the old binary published them
def arms():
    bad = 0
    old_condenser = {'kpis': {'cond': {'T_utility_in': 300.0, 'T_out': 284.507, 'vf_in': 1.0, 'Q_kW': -1314.67,
                                       'Q_capacity_kW': 1129.7}}}
    old_boiler = {'kpis': {'reb': {'T_utility_in': 393.0, 'T_out': 638.814, 'vf_in': 0.0, 'Q_kW': 111.84,
                                   'Q_capacity_kW': 90.5}}}
    # the old interpolated profile: no duty column at all
    old_hx = {'kpis': {'hx': {'T_hot_out': 584.1, 'T_cold_in': 480.0, 'T_cold_out': 523.5, 'T_hot_in': 700.0, 'Q': 172897.3}},
              'profiles': {'hx': {'columns': {'T_hot': [700, 584.1], 'T_cold': [523.5, 480.0], 'position': [0, 1]}}}}
    # a crossing exchanger and an infeasible heating utility
    cross = {'kpis': {'hx': {'T_hot_out': 400.0, 'T_cold_in': 300.0, 'T_cold_out': 380.0, 'T_hot_in': 500.0, 'Q': 1.0,
                             'dT_min_segments': -3.0}}}
    ut = {'utilityAllocation': [{'unit': 'h', 'utility': 'steamLP', 'allocated': True, 'T': 600.0}]}
    for name, j in (('old condenser (284.5 K vs coolant 300 K)', old_condenser), ('old boiler (638.8 K vs medium 393 K)', old_boiler),
                    ('old interpolated profile (no duty column)', old_hx), ('internal temperature cross', cross),
                    ('steamLP serving a 600 K process', ut)):
        v = violations(j)
        print('ARM %-45s %s' % (name, 'FAILS as it must: ' + v[0] if v else 'NOT CAUGHT'))
        bad += 0 if v else 1
    return bad


# ---- the perturbation sweep ------------------------------------------------------
KEYS = ('area', 'nTubes', 'tubeL', 'U', 'UA', 'Q', 'T_in', 'h')
FACTORS = (0.5, 0.7, 1.5, 2.0)


def unit_blocks(t):
    """(start, end) of each top-level dict inside `units ( ... )` whose type is exchanger-like."""
    m = re.search(r'^\s*units\s*\(', t, re.M)
    if not m:
        return []
    i, blocks, depth, start = m.end(), [], 0, None
    while i < len(t):
        c = t[i]
        if c == '{':
            if depth == 0:
                start = i
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0 and start is not None:
                blk = t[start:i + 1]
                if re.search(r'\btype\s+(%s)\s*;' % '|'.join(TYPES), blk):
                    blocks.append((start, i + 1))
        elif c == ')' and depth == 0:
            break
        i += 1
    return blocks


def sites(t):
    out = []
    for a, b in unit_blocks(t):
        for m in re.finditer(r'(?m)^(\s*)(%s)(\s+)([-+0-9.eE]+)' % '|'.join(KEYS), t[a:b]):
            out.append((a + m.start(4), a + m.end(4), m.group(2)))
    return out


def sweep_one(args):
    c, idx, f = args
    c = Path(c)
    d = fresh(c, SCR / 'sweep' / ('%s_%d_%g' % (c.name, idx, f)))
    try:
        fd = d / 'system/flowsheetDict'
        t = fd.read_text()
        a, b, key = sites(t)[idx]
        val = float(t[a:b]) * f
        if key == 'nTubes':
            val = max(1, round(val))
        fd.write_text(t[:a] + repr(val) + t[b:])
        rc, o, e = run(d, 240)
        k, why = classify(rc, o, e)
        return (c.name, key, f, k, why)
    except subprocess.TimeoutExpired:
        return (c.name, '?', f, 'TIMEOUT', [])
    except Exception as ex:
        return (c.name, '?', f, 'TOOL', [repr(ex)[:120]])
    finally:
        import shutil
        shutil.rmtree(d, ignore_errors=True)


def sweep(jobs, only=None):
    tasks = []
    for c in heat_cases():
        if only and only not in c.name:
            continue
        n = len(sites((c / 'system/flowsheetDict').read_text()))
        for i in range(min(n, 8)):
            for f in FACTORS:
                tasks.append((str(c), i, f))
    print('sweep: %d runs, %d jobs' % (len(tasks), jobs), flush=True)
    tally, rows = {}, []
    with cf.ProcessPoolExecutor(jobs) as ex:
        for r in ex.map(sweep_one, tasks):
            tally[r[3]] = tally.get(r[3], 0) + 1
            if r[3] not in ('OK', 'REFUSED'):
                rows.append(r)
                print(r, flush=True)
    print('SWEEP TALLY', tally)
    return 1 if any(r[3] in ('INFEASIBLE', 'CRASH', 'TIMEOUT') for r in rows) else 0


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[:1] == ['--arms']:
        sys.exit(1 if arms() else 0)
    if a[:1] == ['--sweep']:
        sys.exit(sweep(int(a[1]) if len(a) > 1 else 4, a[2] if len(a) > 2 else None))
    sys.exit(1 if shipped(int(a[0]) if a else 4) else 0)
