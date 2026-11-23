"""Before/after of the dense output on ONE binary, with the shipped byte-identity harness (C473 h).

usage: bc_dense.py LABEL hermite|integrator [prefix ...]

Runs docs/reviews/2026-11-22-fair-timing/bytecompare.py's `one()` on every shipped tutorial under the prefixes (default:
batch/, ctrl/, unsteady/, steady/reactors/, plant/) and writes build/scratch/bc/LABEL.tsv.  With `hermite`, every
`batchReactor` unit of the copy declares `solver { denseOutput hermite; }` (the driver's cubic Hermite: what every row was
before 2026-11-22); with `integrator` the cases run as shipped.  Compare the two with `bytecompare.py diff A B`.
The only other difference is the one announcement line that names the interpolant.
"""
import os, re, shutil, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '2026-11-22-fair-timing'))
import bytecompare as bc

label, mode = sys.argv[1], sys.argv[2]
prefixes = sys.argv[3:] or ['batch/', 'ctrl/', 'unsteady/', 'steady/reactors/', 'plant/']
_copytree = shutil.copytree


def copytree(src, dst, *a, **k):
    r = _copytree(src, dst, *a, **k)
    fp = os.path.join(dst, 'system', 'flowsheetDict')
    if mode == 'hermite' and os.path.isfile(fp):
        t = open(fp).read()
        out, pos = [], 0
        for m in re.finditer(r'type\s+batchReactor\s*;', t):
            nxt = re.search(r'\btype\s+\w+\s*;', t[m.end():])
            seg_end = m.end() + (nxt.start() if nxt else len(t) - m.end())
            sm = re.search(r'\bsolver\s*\{', t[m.end():seg_end])
            if sm:
                at = m.end() + sm.end()
                out.append(t[pos:at]); out.append(' denseOutput hermite;'); pos = at
            else:
                out.append(t[pos:m.end()]); out.append('\n        solver { denseOutput hermite; }'); pos = m.end()
        out.append(t[pos:])
        open(fp, 'w').write(''.join(out))
    return r


bc.shutil.copytree = copytree
bc.corpus = lambda: [c for c in sorted(set(bc_corpus())) if any(c.startswith(p) for p in prefixes)]


def _all():
    found = []
    for top in ('steady', 'unsteady', 'ctrl', 'batch', 'props', 'plant'):
        for dp, dn, fs_ in os.walk(os.path.join(bc.ROOT, 'tutorials', top)):
            if os.path.isfile(os.path.join(dp, 'system', 'controlDict')):
                found.append(os.path.relpath(dp, os.path.join(bc.ROOT, 'tutorials')))
                dn[:] = []
    return sorted(found)


bc_corpus = _all
if __name__ == '__main__':
    bc.run(label, True)
