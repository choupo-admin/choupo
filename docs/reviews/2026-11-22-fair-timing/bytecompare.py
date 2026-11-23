#!/usr/bin/env python3
"""Byte-identity harness: run a fixed set of tracked cases and hash everything they write.

    docs/reviews/2026-11-22-fair-timing/bytecompare.py LABEL [all]       (writes build/scratch/bc/LABEL.tsv; `all` = every shipped tutorial)
    docs/reviews/2026-11-22-fair-timing/bytecompare.py diff A B         (compares two label files)

Each case is copied to build/scratch/bc/LABEL/<name>, run with the binary its `application` names
(CHOUPO_HOME = this tree), and every file of the copy (stdout/stderr first) is hashed.  Wall-time lines
are dropped from text before hashing (the `drop` patterns below, each a line that varies run to run).
Run it before and after a change; `diff` prints every file whose hash moved.
"""
import hashlib, os, re, shutil, subprocess, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
CASES = """batch/combustion/nox03_millerbowman_large batch/combustion/nox03_millerbowman_large_seulex
batch/combustion/nox02_millerbowman_denox batch/combustion/ignition01_h2o2 batch/combustion/ignition01_h2o2_seulex
batch/combustion/ignition04_h2air_sensitivity batch/combustion/kinetics02_h2o2_falloff
ctrl/ctrl01_cstr_temp_control ctrl/ctrl11_esterification_jacket ctrl/ctrl12_williams_otto
unsteady/unsteady01_startup_transient unsteady/unsteady06_reactor_fill_and_react
steady/reactors/cstr01_first_order steady/reactors/cstr07_lhhw_methylAcetate steady/reactors/aceticAcid01_gibbsReactor
steady/reactors/ammoniaReactor02_equilibrium steady/reactors/cstr04_adiabatic
steady/distillation/column05_reactive_methylacetate steady/flowsheets/process03_recycle""".split()
DROP = re.compile(r'(\d{4}-\d\d-\d\dT|\bwall\b|elapsed|\bCPU\b|\bcpu\b|[0-9.]+ ?ms\b|seconds|\[ode-stats\]|\(commit [0-9a-f]+\)|timestamp|Date:|date )', re.I)
out = os.path.join(ROOT, 'build/scratch/bc')
BIN = {'choupoSolve': 'choupoSolve', 'choupoBatch': 'choupoBatch', 'choupoCtrl': 'choupoCtrl',
       'choupoSemiContinuous': 'choupoSemiContinuous', 'choupoProps': 'choupoProps'}


def norm(b, label=''):
    try:
        t = b.decode('utf-8')
    except UnicodeDecodeError:
        return b
    t = t.replace('/bc/' + label + '/', '/bc/L/')       # the label is in every printed path
    t = re.sub(r'(commit[ "\':]*)[0-9a-f]{7,12}', r'\1H', t)   # the engine's own commit stamp (banner, citation block)
    return ''.join(l for l in t.splitlines(True) if not DROP.search(l)).encode()


def corpus():
    """Every shipped tutorial of the five binaries (curation excluded): the dirs holding system/controlDict."""
    found = []
    for top in ('steady', 'unsteady', 'ctrl', 'batch', 'props', 'plant'):
        for dp, dn, fs_ in os.walk(os.path.join(ROOT, 'tutorials', top)):
            if os.path.isfile(os.path.join(dp, 'system', 'controlDict')):
                found.append(os.path.relpath(dp, os.path.join(ROOT, 'tutorials'))); dn[:] = []
    return sorted(found)


def one(args):
    c, label, keep = args
    rows = []
    if True:
        src = os.path.join(ROOT, 'tutorials', c); name = os.path.basename(c)
        d = os.path.join(out, 'run', name)      # ONE path for every label: a package hash includes it
        subprocess.run(['rm', '-rf', d])
        shutil.copytree(src, d, ignore=shutil.ignore_patterns('expected'), symlinks=True)
        app = re.search(r'^application\s+(\w+);', open(d + '/system/controlDict').read(), re.M).group(1)
        p = subprocess.run([os.path.join(os.environ.get('BC_BIN', os.path.join(ROOT, 'build/linux64Gcc')), BIN[app]), d], capture_output=True, cwd=d,
                           env=dict(os.environ, CHOUPO_HOME=ROOT), timeout=1800)
        rows.append((name + '/<stdout>', hashlib.sha256(norm(p.stdout, label)).hexdigest()))
        rows.append((name + '/<stderr>', hashlib.sha256(norm(p.stderr, label)).hexdigest()))
        rows.append((name + '/<exit>', str(p.returncode)))
        for dp, _, fs in os.walk(d):
            for f in sorted(fs):
                full = os.path.join(dp, f)
                if f.startswith('log.'): continue
                rows.append((os.path.relpath(full, out + '/run'), hashlib.sha256(norm(open(full, 'rb').read(), label)).hexdigest()))
        print(name, 'exit', p.returncode, flush=True)
    if not keep: subprocess.run(['rm', '-rf', d])
    return rows


def run(label, all_cases=False):
    out = os.path.join(ROOT, 'build/scratch/bc'); os.makedirs(out, exist_ok=True)
    cases = corpus() if all_cases else CASES
    from multiprocessing.pool import ThreadPool
    rows = [r for rs in ThreadPool(int(os.environ.get('BC_JOBS', '3'))).map(one, [(c, label, not all_cases) for c in cases]) for r in rs]
    open(os.path.join(out, label + '.tsv'), 'w').write(''.join('%s\t%s\n' % r for r in sorted(rows)))
    print(len(cases), 'cases,', len(rows), 'rows ->', os.path.join(out, label + '.tsv'))


def diff(a, b):
    out = os.path.join(ROOT, 'build/scratch/bc')
    A = dict(l.rstrip('\n').split('\t') for l in open(os.path.join(out, a + '.tsv')))
    B = dict(l.rstrip('\n').split('\t') for l in open(os.path.join(out, b + '.tsv')))
    moved = [k for k in sorted(set(A) | set(B)) if A.get(k) != B.get(k)]
    print('%d files compared, %d moved' % (len(set(A) | set(B)), len(moved)))
    for k in moved[:40]: print('  MOVED', k)


if __name__ == '__main__':
    if sys.argv[1] == 'diff': diff(sys.argv[2], sys.argv[3])
    else: run(sys.argv[1], len(sys.argv) > 2 and sys.argv[2] == 'all')
