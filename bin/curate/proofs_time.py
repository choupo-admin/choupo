#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""proofs_time -- three of the proofs of nine on the TIME-INTEGRATED binaries (a MEASUREMENT, nothing pinned).

    bin/curate/proofs_time.py [T3 T4 T6 ...|all] [--jobs=N] [--case=tutorials/batch/...]

The time-integrated cases (choupoBatch, choupoCtrl, choupoSemiContinuous) write `<t>/` instants in the layout
of `0/`; proofs.py's machinery (copy, run, compare, three verdicts) is reused as is.

  T3 unit writing     proofs.t3 unchanged: bar/kPa/kmol/h/kW values of 0/ and the dicts written in SI.
  T4 closure outside  ATOMS of every vessel's holdup (0/internalStates and the last <t>/internalStates), read
                      from the state files and the component records by proofs_closure's own reader (never the
                      engine's ledger).  Judged only for a CLOSED system: no stream file in 0/, no recipe, no
                      reaction-free requirement (a reaction conserves atoms; that is what is proved).  An open
                      system is NOT JUDGED: the cumulative external flows are not in the state files.
  T6 restart          the case run to its end; the same case restarted from an interior instant t_m (the
                      <t_m>/ directory renamed 0/, startTime = t_m) must end on the uninterrupted answer.
                      A vessel that writes `notRestored` refuses the restart: NOT JUDGED by name.  A controller's
                      memory is in no record (settled-contracts.md, the time-integrated layout): a ctrl case
                      with an integral term is EXPECTED to differ, and the verdict says which kpi.
"""
import json
import re
import shutil
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import proofs                   # noqa: E402
import proofs_closure as pc     # noqa: E402
from proofs import HOLDS, VIOLATES, NOTJ, read, strip_comments, fresh_copy, run_in, base_of, base_problem  # noqa: E402

WT = proofs.WT
APPS = ('choupoBatch', 'choupoCtrl', 'choupoSemiContinuous')


def tcases():
    out = []
    for top in ('tutorials/batch', 'tutorials/ctrl', 'tutorials/unsteady'):
        for cho in sorted((WT / top).rglob('*.cho')):
            d = cho.parent
            if (d / 'system/controlDict').exists() and proofs.app_of(d) in APPS:
                out.append(d)
    return out


def instants(d):
    xs = []
    for x in Path(d).iterdir():
        if x.is_dir() and x.name != '0' and re.fullmatch(r'[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?', x.name):
            xs.append((float(x.name), x))
    return sorted(xs)


def t3(case):
    return proofs.t3(case)


# ------------------------------------------------------------------ T4

ELEMENTS = set('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Th U'.split())


def holdup_atoms(path, croot):
    """-> {element: kmol atoms} of one internalStates file, or raise ValueError."""
    t = strip_comments(read(path))
    m = re.search(r'\bholdup\s*\{', t)
    if not m:
        raise ValueError('%s: no holdup {} block' % path.name)
    body = t[m.end():pc.match_close(t, m.end() - 1, '{', '}')]
    comp = {}
    mm = re.search(r'\bmolarComposition\s*\{([^{}]*)\}', body)
    tm = re.search(r'\btotalMoles\s+([-+0-9.eE]+)', body)
    hm = re.search(r'\bholdupMolar\s*\{([^{}]*)\}', body)
    if mm and tm:
        for e in mm.group(1).split(';'):
            w = e.split()
            if len(w) >= 2:
                comp[w[0]] = float(w[1]) * float(tm.group(1))
    elif hm:
        for e in hm.group(1).split(';'):
            w = e.split()
            if len(w) >= 2:
                comp[w[0]] = float(w[1])
    else:
        raise ValueError('%s: holdup carries neither totalMoles+molarComposition nor holdupMolar' % path.name)
    atoms = {}
    for c, n in comp.items():
        _, a, _ = pc.component_data(c, croot)
        for e, k in a.items():
            atoms[e] = atoms.get(e, 0.0) + n * k
    return atoms


def t4(case):
    case = Path(case)
    r = base_of(case)
    p = base_problem(case, r)
    if p:
        return NOTJ, p
    d = Path(r['dir'])
    fs = strip_comments(read(case / 'system/flowsheetDict'))
    if re.search(r'(?<![\w])recipe\b', fs):
        return NOTJ, 'a recipe adds or removes material at declared times: open system'
    kinds = set()
    for f in (case / '0/internalStates').glob('*'):
        if f.is_file():
            q = re.search(r'\bequipment\s+(\w+)', strip_comments(read(f)))
            kinds.add(q.group(1) if q else '?')
            if 'notRestored' in read(f):
                return NOTJ, 'a vessel state that is more than its holdup (notRestored): the inventory is not the whole atoms'
    if kinds != {'batchReactor'}:
        return NOTJ, 'vessel kind %s: its holdup is not the whole inventory (solid, adsorbed, permeate or distillate leave it)' % sorted(kinds)
    streams = [f for f in (case / '0').iterdir() if f.is_file()]
    if streams:
        return NOTJ, 'open system: stream files in 0/ (%s); the cumulative external flows are not in the state files' % streams[0].name
    ins = instants(d)
    if not ins:
        return NOTJ, 'no <t>/ instant was written'
    last = ins[-1][1]
    try:
        croot = pc.case_root(case)
        worst, nel = 0.0, 0
        for f in sorted((case / '0/internalStates').iterdir()):
            if not f.is_file():
                continue
            fl = last / 'internalStates' / f.name
            if not fl.exists():
                return NOTJ, 'no %s in the last instant %s' % (f.name, last.name)
            a0, a1 = holdup_atoms(f, croot), holdup_atoms(fl, croot)
            bad = [e for e in set(a0) | set(a1) if e not in ELEMENTS]
            if bad:
                return NOTJ, 'pseudo-component formula (symbols %s are not elements)' % sorted(bad)
            for e in set(a0) | set(a1):
                x, y = a0.get(e, 0.0), a1.get(e, 0.0)
                dev = abs(x - y) / max(abs(x), abs(y), 1e-300)
                nel += 1
                if dev > worst:
                    worst, wk = dev, '%s.%s %.9e -> %.9e' % (f.name, e, x, y)
    except (ValueError, LookupError, KeyError, OSError) as e:
        return NOTJ, 'independent reader: %s' % e
    if nel == 0:
        return NOTJ, 'no vessel holdup found'
    if worst > 1e-7:
        return VIOLATES, 'atoms not conserved from 0 to t=%s: %s (dev %.2e)' % (last.name, wk, worst)
    return HOLDS, 'atoms of %d vessel-elements equal from 0 to t=%s (worst %.1e)' % (nel, last.name, worst)


# ------------------------------------------------------------------ T6

# A ledger accumulated since the run's START covers only the restarted segment after a restart (the run says so):
# totals of energy, utilities, reaction heat and the initial inventory are not state, and are not compared.
CUMULATIVE = re.compile(r'(mass_closure_rel|moles_kmol_initial|rtd/|_total_kJ|_total$|energy_|utility_|E_reaction|mass_kg_initial|mass_kg_in_cum|mass_kg_out_cum|mass_residual|_cum$|_seg\d+|element_\w*_(in|out|initial|final)|moles_initial|t_peak|peak_kW)')


def t6(case):
    case = Path(case)
    r = base_of(case)
    p = base_problem(case, r)
    if p:
        return NOTJ, p
    if proofs.app_of(case) == 'choupoCtrl':
        # a controller's memory (integral term, filter, signal generator) is in no state record: settled-contracts.md,
        # the time-integrated layout.  A ctrl restart cannot reproduce the loop; the proof does not apply.
        return NOTJ, 'choupoCtrl: the controller\'s memory is in no state record (settled contract), so a restart cannot be the same run'
    bd = Path(r['dir'])
    ins = instants(bd)
    cd = strip_comments(read(case / 'system/controlDict'))
    m1 = re.search(r'\bendTime\s+([-+0-9.eE]+)', cd)
    m0 = re.search(r'\bstartTime\s+([-+0-9.eE]+)', cd)
    if not m1 or len(ins) < 3:
        return NOTJ, 'fewer than 3 written instants (%d): no interior instant to restart from' % len(ins)
    t_end = float(m1.group(1))
    t_start = float(m0.group(1)) if m0 else 0.0
    mid = min((x for x in ins if x[0] < t_end - 1e-9), key=lambda x: abs(x[0] - 0.5 * (t_start + t_end)), default=None)
    if mid is None:
        return NOTJ, 'no interior instant'
    tm, dm = mid
    d = fresh_copy(case, proofs.SCR / 'T6t' / case.name)
    shutil.rmtree(d / '0')
    shutil.copytree(dm, d / '0')
    cf = d / 'system/controlDict'
    txt = read(cf)
    if m0:
        txt = re.sub(r'(\bstartTime\s+)[-+0-9.eE]+', lambda m: m.group(1) + repr(tm), txt, count=1)
    else:
        txt = re.sub(r'(\bendTime\s+)', 'startTime ' + repr(tm) + ';\n' + r'\1', txt, count=1)
    cf.write_text(txt)
    rr = run_in(d)
    if rr['json'] is None:
        e = rr['err'] or ''
        if re.search(r'notRestored|MORE than its|outside the run|must lie between startTime|sensitivity: the base run|cannot restart|restart.*refus', e):
            return NOTJ, 'the restart is refused by name, or the case declares absolute times: %s' % e[:200]
        return VIOLATES, 'restart from t=%g failed: %s' % (tm, e[:250])
    b0 = {k: v for k, v in proofs.view(r['json']).items() if not CUMULATIVE.search(k)}
    b1 = {k: v for k, v in proofs.view(rr['json']).items() if not CUMULATIVE.search(k)}
    worst, wk, viol, n = proofs.compare(b0, b1, 1, 1e-6, label_all=True)
    return proofs.verdict_from(viol, worst, wk, n, ' [restart from t=%g of %g, tol 1e-6]' % (tm, t_end))


FNS = {'T3': t3, 'T4': t4, 'T6': t6}


def one(c, ts):
    out = []
    for t in ts:
        t0 = time.time()
        try:
            v, why = FNS[t](c)
        except Exception as e:
            v, why = NOTJ, 'tool error %s: %s' % (type(e).__name__, str(e)[:200])
        out.append((t, v, why, round(time.time() - t0, 1)))
    return out


def main(argv):
    ts = [a for a in argv if a in FNS] or ['T3', 'T4', 'T6']
    jobs, named = 1, []
    for a in argv:
        if a.startswith('--jobs='):
            jobs = int(a[7:])
        if a.startswith('--case='):
            named.append(WT / a[7:])
    cases = named or tcases()
    if jobs > 1:
        import concurrent.futures as cf
        with cf.ProcessPoolExecutor(max_workers=jobs) as ex:
            futs = [(c, ex.submit(one, c, ts)) for c in cases]
            got = [(c, f.result()) for c, f in futs]
    else:
        got = [(c, one(c, ts)) for c in cases]
    outd = proofs.SCR / 'results'
    outd.mkdir(parents=True, exist_ok=True)
    rows = {t: [] for t in ts}
    for c, rs in got:
        for t, v, why, secs in rs:
            rows[t].append({'t': t, 'case': str(c.relative_to(WT)), 'app': proofs.app_of(c), 'verdict': v, 'why': why, 'secs': secs})
            print('%s %-11s %-9s %-44s %s' % (t, v, proofs.app_of(c)[6:], c.name, why[:150]), flush=True)
    for t in ts:
        (outd / (t + '.time.jsonl')).write_text(''.join(json.dumps(x) + '\n' for x in rows[t]))
        cnt = {}
        for x in rows[t]:
            cnt[x['verdict']] = cnt.get(x['verdict'], 0) + 1
        print('== %s time-integrated: %s (%d cases)' % (t, cnt, len(cases)))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
