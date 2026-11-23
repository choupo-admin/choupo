#!/usr/bin/env python3
"""Consumption-ledger diff: every shipped tutorial run with CHOUPO_RECORD_LEDGER, before vs after.

    ledgercompare.py BIN_DIR LABEL        (writes build/scratch/lc/LABEL.tsv: case, sha of '- ' lines, of '@ pin' lines,
                                           number of '@ catalogue' lines, sha of the '@ catalogue' lines)
    ledgercompare.py diff A B

The architect's ruling of 2026-11-22: the ledger records what a run READ for its answer.  A case that asks for
no Henry constant no longer lists the Henry catalogue; what must NOT move is every `- ` line (what the resolver
seam was asked), every `@ pin` line (what the run CONSUMED) and everything else the run writes (bytecompare.py).
"""
import hashlib, os, re, shutil, subprocess, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '2026-11-22-fair-timing'))
import bytecompare as bc

ROOT = bc.ROOT
out = os.path.join(ROOT, 'build/scratch/lc')


def one(args):
    c, bindir, label = args
    name = os.path.basename(c)
    d = os.path.join(out, 'run', name)
    subprocess.run(['rm', '-rf', d])
    shutil.copytree(os.path.join(ROOT, 'tutorials', c), d, ignore=shutil.ignore_patterns('expected'), symlinks=True)
    app = re.search(r'^application\s+(\w+);', open(d + '/system/controlDict').read(), re.M).group(1)
    led = os.path.join(out, 'run', name + '.ledger')
    if os.path.exists(led): os.remove(led)
    subprocess.run([os.path.join(bindir, bc.BIN[app]), d], capture_output=True, cwd=d, timeout=1800,
                   env=dict(os.environ, CHOUPO_HOME=ROOT, CHOUPO_RECORD_LEDGER=led))
    lines = open(led).read().splitlines() if os.path.exists(led) else []
    asked = [l for l in lines if l.startswith('- ') or l.startswith('+ ')]
    pins = [l for l in lines if l.startswith('@ pin ')]
    cat = [l for l in lines if l.startswith('@ catalogue ')]
    other = [l for l in lines if l not in asked and l not in pins and l not in cat]
    h = lambda ls: hashlib.sha256('\n'.join(ls).encode()).hexdigest()[:16]
    subprocess.run(['rm', '-rf', d]);
    if os.path.exists(led): os.remove(led)
    return (name, h(asked), h(pins), str(len(cat)), h(cat), h(other))


def run(bindir, label):
    os.makedirs(out, exist_ok=True)
    from multiprocessing.pool import ThreadPool
    rows = ThreadPool(int(os.environ.get('BC_JOBS', '3'))).map(one, [(c, bindir, label) for c in bc.corpus()])
    open(os.path.join(out, label + '.tsv'), 'w').write(''.join('\t'.join(r) + '\n' for r in sorted(rows)))
    print(len(rows), 'cases ->', os.path.join(out, label + '.tsv'))


def diff(a, b):
    A = {l.split('\t')[0]: l.rstrip('\n').split('\t') for l in open(os.path.join(out, a + '.tsv'))}
    B = {l.split('\t')[0]: l.rstrip('\n').split('\t') for l in open(os.path.join(out, b + '.tsv'))}
    names = sorted(set(A) | set(B))
    askedMoved = [n for n in names if A.get(n, [0, 1])[1] != B.get(n, [0, 2])[1]]
    pinsMoved = [n for n in names if A.get(n, [0, 0, 1])[2] != B.get(n, [0, 0, 2])[2]]
    otherMoved = [n for n in names if A.get(n, [0] * 6)[5] != B.get(n, [0] * 6)[5]]
    catMoved = [n for n in names if A.get(n, [0] * 5)[4] != B.get(n, [0] * 5)[4]]
    fewer = [n for n in catMoved if n in A and n in B and int(B[n][3]) < int(A[n][3])]
    more = [n for n in catMoved if n in A and n in B and int(B[n][3]) > int(A[n][3])]
    print('%d cases: asked-lines moved %d, @ pin moved %d, other lines moved %d, @ catalogue moved %d (fewer %d, more %d)'
          % (len(names), len(askedMoved), len(pinsMoved), len(otherMoved), len(catMoved), len(fewer), len(more)))
    for tag, ls in (('ASKED', askedMoved), ('PIN', pinsMoved), ('OTHER', otherMoved), ('MORE', more)):
        for n in ls[:20]: print('  MOVED', tag, n)
    if fewer:
        d = [int(A[n][3]) - int(B[n][3]) for n in fewer]
        print('  fewer: min %d max %d lines' % (min(d), max(d)))


if __name__ == '__main__':
    if sys.argv[1] == 'diff': diff(sys.argv[2], sys.argv[3])
    else: run(sys.argv[1], sys.argv[2])
