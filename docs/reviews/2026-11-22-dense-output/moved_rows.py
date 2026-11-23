"""The rows that move when the write grid comes from the integrator's own dense output (C473 h).

usage: moved_rows.py OUT.tsv [case ...]      (default: the cases whose files bytecompare.py found moved)

For each case: run it twice on THIS tree's binary, once declaring `solver { denseOutput hermite; }` (the driver's cubic Hermite, what
every row was before) and once as shipped (the integrator's own dense output); then a tight reference (the case with
rtol 1e-11, atol 1e-20, free stepping, Rodas4 where the case's integrator is not seulex-only).  A row MOVES when any
column differs by more than 1e-9 of the column maximum.  OUT.tsv lists every moved (case, t, column) with old, new and
reference and the two errors scaled by the column maximum; stdout summarises per case: moved rows, largest change and
the worst error old vs new against the reference.
"""
import csv, os, re, shutil, subprocess, sys
import numpy as np
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
B = os.path.join(ROOT, 'build/linux64Gcc/choupoBatch')
SCR = os.path.join(ROOT, 'build/scratch_densesparse/moved')
CASES = ['batch/reactor/batch06_adaptive_runaway', 'batch/reactor/batch30_fast_equilibrium_full',
         'batch/reactor/batch31_fast_equilibrium_reduced', 'batch/reactor/batch32_fast_intermediate_full',
         'batch/reactor/batch33_fast_intermediate_reduced', 'batch/combustion/nox02_millerbowman_denox',
         'batch/combustion/nox03_millerbowman_large', 'batch/combustion/nox03_millerbowman_large_seulex']


def run(case, tag, hermite=False, ref=False):
    d = os.path.join(SCR, os.path.basename(case) + '_' + tag)
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(SCR, exist_ok=True)
    shutil.copytree(os.path.join(ROOT, 'tutorials', case), d, ignore=shutil.ignore_patterns('expected'))
    cp = d + '/system/controlDict'
    c = open(cp).read()
    if ref:
        c = re.sub(r'rtol\s+[0-9.eE+-]+;', 'rtol 1e-11;', c)
        c = re.sub(r'atol\s+[0-9.eE+-]+;', 'atol 1e-20;', c)
        if 'rtol' not in c:
            raise SystemExit(case + ': no rtol to tighten')
        fp = d + '/system/flowsheetDict'
        f = open(fp).read()
        open(fp, 'w').write(re.sub(r'integrator\s+\w+;', 'integrator Rodas4;', f))
    if 'solutionControl' not in c:
        c += '\nsolutionControl { write false; }\n'
    if os.path.exists(d + '/trajectory.csv'):
        os.remove(d + '/trajectory.csv')
    open(cp, 'w').write(c)
    if hermite:                 # the declared key: the driver's cubic Hermite, as before 2026-11-22
        fp = d + '/system/flowsheetDict'
        f = open(fp).read()
        out, pos = [], 0
        for m in re.finditer(r'type\s+batchReactor\s*;', f):
            nxt = re.search(r'\btype\s+\w+\s*;', f[m.end():])
            seg_end = m.end() + (nxt.start() if nxt else len(f) - m.end())
            sm = re.search(r'\bsolver\s*\{', f[m.end():seg_end])
            if sm:
                at = m.end() + sm.end()
                out.append(f[pos:at]); out.append(' denseOutput hermite;'); pos = at
            else:
                out.append(f[pos:m.end()]); out.append('\n        solver { denseOutput hermite; }'); pos = m.end()
        out.append(f[pos:])
        open(fp, 'w').write(''.join(out))
    env = dict(os.environ, CHOUPO_HOME=ROOT)
    rr = subprocess.run([B, d], cwd=d, capture_output=True, text=True, env=env, timeout=3600)
    if rr.returncode:
        raise SystemExit(case + ' ' + tag + ': exit %d: %s' % (rr.returncode, (rr.stdout + rr.stderr)[-300:]))
    R = list(csv.DictReader(open(d + '/trajectory.csv')))
    keys = [k for k in R[0] if k not in ('t', 'time')]
    return [float(r['t']) for r in R], keys, np.array([[float(r[k]) for k in keys] for r in R])


def main():
    out = sys.argv[1]
    cases = sys.argv[2:] or CASES
    rows_out = ['case\tt\tmax_change\tworst_column\terr_old\terr_new\tclass']
    print('per case: moved rows (of all rows), largest change, worst error vs tight reference old -> new, and the moved'
          ' rows by their own worst error: BETTER (new < old/2), LEVEL (within a factor 2), WORSE (new > 2 old)')
    for case in cases:
        t, keys, old = run(case, 'old', hermite=True)
        _, _, new = run(case, 'new')
        _, _, ref = run(case, 'ref', ref=True)
        assert ref.shape == new.shape == old.shape, (case, ref.shape, new.shape)
        cm = np.abs(ref).max(0)
        cm[cm == 0] = 1
        D = np.abs(new - old) / cm
        eo = np.abs(old - ref) / cm
        en = np.abs(new - ref) / cm
        moved = np.where(D.max(1) > 1e-9)[0]
        cls = {'BETTER': 0, 'LEVEL': 0, 'WORSE': 0, 'WORSE>2x': 0}
        for i in moved:
            a_, b_ = eo[i].max(), en[i].max()
            c = 'BETTER' if b_ < 0.5 * a_ else ('LEVEL' if b_ <= 2.0 * a_ else 'WORSE')
            cls[c] += 1
            rows_out.append('%s\t%.9g\t%.2e\t%s\t%.2e\t%.2e\t%s' % (
                os.path.basename(case), t[i], D[i].max(), keys[int(D[i].argmax())], a_, b_, c))
        print('%-46s rows %d moved %d  largest change %.2e  worst error %.2e -> %.2e  BETTER %d LEVEL %d WORSE %d'
              % (os.path.basename(case), len(t), len(moved), D.max(), eo.max(), en.max(),
                 cls['BETTER'], cls['LEVEL'], cls['WORSE']), flush=True)
    open(out, 'w').write('\n'.join(rows_out) + '\n')
    print('->', out, len(rows_out) - 1, 'moved rows listed')


if __name__ == '__main__':
    main()
