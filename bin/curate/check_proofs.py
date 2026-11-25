#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_proofs -- the proofs of nine over the whole steady corpus, held to a ledger that may only shrink.

    bin/curate/check_proofs.py                     # NIGHTLY: runs the six proofs over every steady and plant case
    bin/curate/check_proofs.py --results DIR       # judges results already measured (proofs.py's *.jsonl); no engine
    bin/curate/check_proofs.py --propose           # prints the ledger rows the measured corpus would need (never writes)
    bin/curate/check_proofs.py --jobs N            # cases at a time (default CHOUPO_PROOFS_JOBS or 3)

WHY THIS EXISTS (C492, 2026-11-25).  Six proofs that no case golden can see were run once over 376 cases
(bin/curate/proofs.py, docs/audits/2026-11-25-proofs-corpus.md) and each found a REAL defect that a green
suite had carried for months:
  T2 (component order reversed): `acetone06_luyben_column_C1` reports x_B_HK 0.884 with the list one way and
      0.095 with it reversed -- the key purities were taken by list position (C504); the same class in the
      membranes' `c_ret_elem`, the electrodialysis `demin_ratio` and PhaseChanger's `Q_latent` (C514);
  T6 (a no-op restart from converged/): `stripper01_sour_water` moved its bottoms temperature 0.7 K when its own
      written state was read back, because converged/ dropped the feed's declared phase (C516), and
      `marcilla01` refused its own written speciation block;
  T4 (closures recomputed outside the engine): claus01's 5e-5 of mass was the record's MW against its formula (C517);
  T1/T3/T5: the homogeneity, the unit writing and the admissibility the engine had never been asked.
A fix lands, the golden moves, and nothing keeps the NEXT defect of the class out: this gate is that.

WHAT IT HOLDS, per proof, over the corpus of proofs.cases_all():
  (a) every VIOLATES is in the ledger bin/curate/proofs_ledger.tsv with a reason and a date; a violation that is
      NOT there fails (a new defect, or the tool's own error: both are findings);
  (b) a ledger row whose case no longer violates fails until the row is deleted -- the ledger only SHRINKS;
  (c) the NOT JUDGED count of each (proof, reason class) is pinned in the same file.  A count above its pin fails
      (a proof went blind on something it used to judge); a count below it fails until the pin is lowered (the
      ratchet).  `tool error` is a class and is pinned at 0: a proof that crashes is never a verdict;
  (d) the proof itself is alive: the `--sabotage` flip of proofs.py is NOT run here (it is the tool's own check,
      run by hand when proofs.py changes); a corpus with ZERO judged cases for a proof fails.

COST.  Measured 2026-11-25 on the laptop, 3 cases at a time at nice 12: see docs/architecture/verification-and-
validation.md.  Nightly only (suite_lanes.txt, NIGHTLY): a proof runs the engine once per case per proof.
Python standard library only; scratch is a private temporary directory removed at the end.
"""
import json
import os
import re
import shutil
import sys
import tempfile
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import gatekit  # noqa: E402

LEDGER = HERE / 'proofs_ledger.tsv'
PROOFS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6']

# ---- the reason classes of a NOT JUDGED (the ONE place a message is turned into a pinned class) -------------------


def reason_class(t, why):
    w = why
    if w.startswith('base run refused') or w.startswith('base run did not converge'):
        return 'base run refuses or does not converge'
    if w.startswith('tool error'):
        return 'tool error'
    if t == 'T1':
        if 'outerDict' in w:
            return 'outerDict (an outer driver varies the case)'
        m = re.search(r'declared size/duty/volume: .* in (\w+) unit \S+ \(', w)
        if m:
            return 'declared size, no unit rule: ' + m.group(1)
        if 'outside' in w and 'declared size' in w:
            return 'declared size outside a unit block'
        if 'not a plain number' in w:
            return 'declared size is not a plain number'
        if 'feeds not identified' in w or 'no feed stream identified' in w:
            return 'feeds not identifiable'
        if 'module record and no operation' in w:
            return 'module record without an operation block'
    if t == 'T2' and 'components' in w:
        return 'fewer than 2 components'
    if t == 'T3' and w.startswith('no value in'):
        return 'no unit-bearing value to rewrite'
    if t == 'T4':
        if 'carries blocks the independent reader' in w:
            return 'stream blocks the independent reader does not handle'
        if 'has no componentMolarFlows' in w or 'no file under converged' in w:
            return 'no converged/ stream files'
        if 'no `units (` list' in w or 'observer units' in w or 'no units parsed' in w:
            return 'flowsheet the independent reader cannot parse'
        if 'candidate state files' in w:
            return 'stream state file not unique'
        if 'pseudo-components' in w:
            return 'pseudo-component formula'
        return 'other independent-reader limit'
    if t == 'T5' and 'publishes no streams' in w:
        return 'the result publishes no streams'
    if t == 'T6' and 'holds no state files' in w:
        return 'no converged/ stream files'
    return 'other'


# ---- the ledger ---------------------------------------------------------------------------------------------------

def read_ledger():
    """-> (violations {(proof, case): (date, reason)}, pins {(proof, class): (count, date)}, problems [str])"""
    viol, pins, problems = {}, {}, []
    if not LEDGER.exists():
        return viol, pins, ['no ledger %s' % LEDGER]
    for n, ln in enumerate(LEDGER.read_text().splitlines(), 1):
        if not ln.strip() or ln.lstrip().startswith('#'):
            continue
        f = ln.split('\t')
        if f[0] == 'VIOLATES' and len(f) >= 5:
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', f[3]) or not f[4].strip():
                problems.append('ledger line %d: a violation row needs a date and a reason' % n)
            viol[(f[1], f[2])] = (f[3], f[4])
        elif f[0] == 'NOTJUDGED' and len(f) >= 5:
            try:
                pins[(f[1], f[2])] = (int(f[3]), f[4])
            except ValueError:
                problems.append('ledger line %d: the count is not an integer' % n)
        else:
            problems.append('ledger line %d: unreadable (%r)' % (n, ln[:60]))
    return viol, pins, problems


def read_results(d):
    res = {}
    for t in PROOFS:
        rows = []
        for p in sorted(Path(d).glob(t + '.*.jsonl')):
            if 'sabotage' in p.name:
                continue
            rows += [json.loads(x) for x in p.read_text().splitlines() if x.strip()]
        res[t] = rows
    return res


def judge(res):
    """-> (failures [str], summary lines [str], proposed ledger rows [str])"""
    viol, pins, problems = read_ledger()
    fails = list(problems)
    prop, lines = [], []
    seen_viol, counts = set(), Counter()
    for t in PROOFS:
        c = Counter(r['verdict'] for r in res.get(t, []))
        lines.append('%s: HOLDS %d, VIOLATES %d, NOT JUDGED %d' % (t, c['HOLDS'], c['VIOLATES'], c['NOT JUDGED']))
        if not res.get(t):
            fails.append('%s: no result at all (the proof did not run)' % t)
            continue
        if c['HOLDS'] == 0:
            fails.append('%s: not one case HOLDS (a proof that judges nothing is not alive)' % t)
        for r in res[t]:
            key = (t, r['case'])
            if r['verdict'] == 'VIOLATES':
                seen_viol.add(key)
                prop.append('VIOLATES\t%s\t%s\t%s\t%s' % (t, r['case'], '<date>', r['why'][:160].replace('\t', ' ')))
                if key not in viol:
                    fails.append('%s VIOLATES %s: not in the ledger -- %s' % (t, r['case'], r['why'][:200]))
            elif r['verdict'] == 'NOT JUDGED':
                counts[(t, reason_class(t, r['why']))] += 1
    for key in sorted(viol):
        if key not in seen_viol and key[0] in res and res[key[0]]:
            fails.append('ledger row %s %s no longer violates: delete it (the ledger only shrinks)' % key)
    for key, n in sorted(counts.items()):
        prop.append('NOTJUDGED\t%s\t%s\t%d\t<date>\t<reason>' % (key[0], key[1], n))
        want = pins.get(key, (0, ''))[0]
        if n > want:
            fails.append('%s NOT JUDGED "%s": %d against a pin of %d (a proof went blind on %d case(s))' % (key[0], key[1], n, want, n - want))
        elif n < want:
            fails.append('%s NOT JUDGED "%s": %d below its pin of %d: lower the pin in the ledger (ratchet)' % (key[0], key[1], n, want))
    for key in sorted(pins):
        if key not in counts and key[0] in res and res[key[0]]:
            fails.append('%s NOT JUDGED "%s": now 0 against a pin of %d: delete the pin row' % (key[0], key[1], pins[key][0]))
    return fails, lines, prop


def main(argv):
    jobs = int(os.environ.get('CHOUPO_PROOFS_JOBS', '3'))
    results = None
    for i, a in enumerate(argv):
        if a == '--jobs':
            jobs = int(argv[i + 1])
        if a == '--results':
            results = argv[i + 1]
    scratch = None
    try:
        if results:
            res = read_results(results)
        else:
            try:
                binp = gatekit.binary('choupoSolve')
            except gatekit.GateRefusal as e:
                print('FAIL: %s' % e)
                return 1
            scratch = tempfile.mkdtemp(prefix='checkproofs.')
            os.environ['PROOFS_SCRATCH'] = scratch
            os.environ['PROOFS_BIN'] = str(binp)
            try:
                os.nice(12)
            except OSError:
                pass
            import proofs
            res = proofs.run_corpus(proofs.cases_all(), PROOFS, jobs=jobs, quiet=True)
        fails, lines, prop = judge(res)
        if '--propose' in argv:
            print('\n'.join(lines))
            print('\n'.join(prop))
            return 0
        ncase = len(res['T1'])
        return gatekit.verdict(
            'check_proofs', fails,
            '%d steady and plant cases, six proofs each, held to the ledger: ' % ncase + '; '.join(lines)
            + '.  NOT checked: the time-integrated binaries (T3/T4/T6 run by hand, nothing pinned), the sabotage flip of proofs.py (run by hand when it changes)')
    finally:
        if scratch:
            shutil.rmtree(scratch, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
