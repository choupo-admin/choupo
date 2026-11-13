#!/usr/bin/env python3
"""Sealed vs unsealed twin: run a sealed case as shipped, and a copy with its
constant/propertyManifest removed (the catalogue becomes visible; the case's
own mirrored records still win as case-local).  Compare every number in the
result JSON.  Usage: seal_twin.py <repoRoot> <scratchDir> <case> [<case> ...]
Writes only under <scratchDir>."""
import json, os, re, shutil, subprocess, sys
from pathlib import Path

root, scratch = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
scratch.mkdir(parents=True, exist_ok=True)
SOLVE = root / "choupoSolve"
IGN = shutil.ignore_patterns("converged", "reports", "iterations", "design", "log*", "*.csv")


def run(d, hidden=False):
    env = dict(os.environ, CHOUPO_HOME=str(root), LC_ALL="C")
    if hidden:
        env.pop("CHOUPO_HOME")
    app = "choupoSolve"
    cd = d / "system" / "controlDict"
    if cd.exists():
        m = re.search(r"^\s*application\s+(\w+)\s*;", cd.read_text(), re.M)
        if m: app = m.group(1)
    r = subprocess.run([str(root / app), str(d)], capture_output=True, text=True, env=env, timeout=1800,
                       cwd=str(scratch))
    out = r.stdout + r.stderr
    m = re.search(r"<<<Choupo:result-begin>>>\n(.*?)\n<<<Choupo:result-end>>>", out, re.S)
    return r.returncode, (json.loads(m.group(1)) if m else None), out


def flat(o, p=""):
    if isinstance(o, dict):
        for k, v in o.items(): yield from flat(v, f"{p}.{k}")
    elif isinstance(o, list):
        for i, v in enumerate(o): yield from flat(v, f"{p}[{i}]")
    elif isinstance(o, (int, float)) and not isinstance(o, bool):
        yield p, float(o)


SKIP = re.compile(r"(wall|time|elapsed|seconds|clock)", re.I)
for c in sys.argv[3:]:
    name = Path(c).name
    a = scratch / f"{name}_sealed"; b = scratch / f"{name}_unsealed"; h = scratch / f"{name}_hidden"
    for d in (a, b, h):
        if d.exists(): shutil.rmtree(d)
        shutil.copytree(root / c, d, ignore=IGN)
    for m in b.rglob("propertyManifest"):
        m.unlink()
    ra, ja, oa = run(a); rb, jb, ob = run(b); rh, jh, oh = run(h, hidden=True)
    (scratch / f"{name}_sealed.log").write_text(oa); (scratch / f"{name}_unsealed.log").write_text(ob)
    (scratch / f"{name}_hidden.log").write_text(oh)
    print(f"{c}: catalogue hidden: exit {rh}" + ("" if rh == 0 else "  last: " + oh.strip().splitlines()[-1][:300]))
    if jh is not None and ja is not None:
        fh = dict(flat(jh)); fa_ = dict(flat(ja))
        nd = sum(1 for k in fa_ if not SKIP.search(k) and k in fh and abs(fa_[k]-fh[k]) > 1e-12*max(abs(fa_[k]),abs(fh[k]),1e-300))
        print(f"    hidden vs shipped: {nd} numbers differ")
    if ja is None or jb is None:
        print(f"{c}: exit sealed {ra}, unsealed {rb}; JSON {'ok' if ja else 'none'}/{'ok' if jb else 'none'}")
        continue
    fa, fb = dict(flat(ja)), dict(flat(jb))
    diffs = []
    for k in sorted(set(fa) | set(fb)):
        if SKIP.search(k): continue
        x, y = fa.get(k), fb.get(k)
        if x is None or y is None:
            diffs.append((k, x, y, float("inf"))); continue
        r = abs(x - y) / max(abs(x), abs(y), 1e-300)
        if r > 1e-12: diffs.append((k, x, y, r))
    src = [l for l in ob.splitlines() if "liquidDensity" in l and ("referenceEquation" in l or "Rackett" in l or "recordVolume" in l)][:3]
    print(f"{c}: exit {ra}/{rb}; {len(diffs)} numbers differ (>1e-12 rel)")
    for k, x, y, r in sorted(diffs, key=lambda t: -t[3])[:6]:
        print(f"    {k}: sealed {x!r}  unsealed {y!r}  rel {r:.2e}")
