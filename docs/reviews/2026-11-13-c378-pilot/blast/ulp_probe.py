#!/usr/bin/env python3
"""Platform sensitivity probe.  Runs each case once clean and once per (fn, every)
pattern under an LD_PRELOAD shim that moves every N-th result of one libm
function by one ulp (the shim of docs/reviews/2026-11-13-ci00-absent-species-closure).
Reports per run: exit code, the largest relative move of any published number,
whether the liquid-density source ids (the resolver's decisions) changed, and
whether the set of advisory/refusal lines mentioning the density changed.
Usage: ulp_probe.py <repoRoot> <scratchDir> <case> [<case> ...]"""
import json, os, re, shutil, subprocess, sys
from pathlib import Path

root, S = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
S.mkdir(parents=True, exist_ok=True)
shim = root / "docs/reviews/2026-11-13-ci00-absent-species-closure/ulp_shim.c"
so = S / "ulp.so"
subprocess.run(["gcc", "-O1", "-fPIC", "-shared", "-fno-builtin", "-o", str(so), str(shim), "-ldl", "-lm"], check=True)
PATTERNS = [("pow", 1), ("pow", 3), ("pow", 101), ("exp", 1), ("exp", 7), ("log", 1), ("log", 13)]
IGN = shutil.ignore_patterns("converged", "reports", "iterations", "design", "log*", "*.csv")
SKIP = re.compile(r"(wall|time_s|elapsed|seconds|clock|iterations|Iter|nIter|evaluations|calls|^\.convergence|history)", re.I)


def flat(o, p=""):
    if isinstance(o, dict):
        for k, v in o.items(): yield from flat(v, f"{p}.{k}")
    elif isinstance(o, list):
        for i, v in enumerate(o): yield from flat(v, f"{p}[{i}]")
    elif isinstance(o, (int, float)) and not isinstance(o, bool):
        yield p, float(o)


def run(case, pat):
    d = S / "run"
    if d.exists(): shutil.rmtree(d)
    shutil.copytree(root / case, d, ignore=IGN)
    env = dict(os.environ, CHOUPO_HOME=str(root), LC_ALL="C")
    if pat:
        env.update(ULP_FN=pat[0], ULP_EVERY=str(pat[1]), LD_PRELOAD=str(so))
    r = subprocess.run([str(root / "choupoSolve"), str(d)], capture_output=True, text=True, env=env, timeout=1800)
    out = r.stdout + r.stderr
    m = re.search(r"<<<Choupo:result-begin>>>\n(.*?)\n<<<Choupo:result-end>>>", out, re.S)
    js = json.loads(m.group(1)) if m else None
    srcs = sorted({(u.get("unit"), u.get("property"), u.get("sourceId"))
                   for u in (js or {}).get("propertySources", {}).get("used", [])})
    dens = sorted({re.sub(r"[-+]?\d+\.\d+(e[-+]?\d+)?", "#", l.strip())
                   for l in out.splitlines()
                   if ("liquid density" in l or "[hypothesis]" in l or "pressure not applied" in l.lower())})
    return r.returncode, js, srcs, dens


for case in sys.argv[3:]:
    rc0, j0, s0, d0 = run(case, None)
    f0 = dict(flat(j0)) if j0 else {}
    print(f"{case}: clean exit {rc0}, {len(f0)} numbers, density sources {[x[2] for x in s0 if x[1] and 'ensity' in x[1]]}")
    for pat in PATTERNS:
        rc, j, s, d = run(case, pat)
        f = dict(flat(j)) if j else {}
        worst, wk = 0.0, ""
        for k, v in f0.items():
            if SKIP.search(k) or k not in f: continue
            den = max(abs(v), abs(f[k]), 1e-300)
            r_ = abs(v - f[k]) / den
            if abs(v) < 1e-9 and abs(f[k]) < 1e-9: r_ = 0.0
            if r_ > worst: worst, wk = r_, k
        flags = []
        if rc != rc0: flags.append(f"EXIT {rc0}->{rc}")
        if s != s0: flags.append(f"SOURCES {set(s) ^ set(s0)}")
        if d != d0: flags.append(f"DENSITY-LINES {sorted(set(d) ^ set(d0))[:3]}")
        print(f"   {pat[0]}/{pat[1]}: exit {rc}, worst rel {worst:.2e} at {wk[:80]} {' '.join(flags)}")
