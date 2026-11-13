#!/usr/bin/env python3
"""Run every shipped case holding a `pump` or `cstr` unit on a scratch copy.

Usage (from the repository root):
    python3 -I docs/reviews/2026-11-13-density-pilot-plan/run_reach_cases.py <scratch_dir> [verbosity] [type-regex] [subdir]

The default type regex is `pump|cstr` (the pilot's reach, item 1); item 3
passes the wrapper consumers' types and a different subdir, and keeps only
cases whose thermoPhysPropDict names water and whose application is
choupoSolve.

For each case: copy it to <scratch_dir>/cases/<name>, raise controlDict
verbosity (default 3), run the binary named by `application`, keep log.txt and
the result JSON block the binary prints (result.json).  Prints one line per
case: name, exit code, seconds.
"""
import os, re, shutil, subprocess, sys, time, json

ROOT = os.getcwd()
scratch = os.path.abspath(sys.argv[1])
verb = sys.argv[2] if len(sys.argv) > 2 else "3"
types = sys.argv[3] if len(sys.argv) > 3 else "pump|cstr"
sub = sys.argv[4] if len(sys.argv) > 4 else "cases"
pat = re.compile(r'\btype\s+(' + types + r')\s*;')

def case_root(path):
    # the HIGHEST ancestor holding a .cho marker: a sector's own unit
    # folder may carry one, but the case is the plant that contains it
    d = os.path.dirname(path)
    best = None
    while d.startswith(os.path.join(ROOT, "tutorials")) and d != os.path.join(ROOT, "tutorials"):
        if any(f.endswith(".cho") for f in os.listdir(d)):
            best = d
        d = os.path.dirname(d)
    return best

cases = set()
for dp, dn, fn in os.walk(os.path.join(ROOT, "tutorials")):
    if "/iterations" in dp or "/converged" in dp:
        continue
    for f in fn:
        if f != "flowsheetDict":
            continue
        p = os.path.join(dp, f)
        try:
            txt = open(p, encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        if pat.search(txt):
            c = case_root(p)
            if c:
                cases.add(c)

def wants(c):
    if sub == "cases":
        return True
    has_water = False
    for dp, dn, fn in os.walk(c):
        if "thermoPhysPropDict" in fn and re.search(r'\bwater\b', open(os.path.join(dp, "thermoPhysPropDict"), errors="replace").read()):
            has_water = True
    cd = os.path.join(c, "system", "controlDict")
    app = re.search(r'^\s*application\s+(\w+)', open(cd).read(), re.M) if os.path.exists(cd) else None
    return has_water and (app is None or app.group(1) == "choupoSolve")

cases = {c for c in cases if wants(c)}
os.makedirs(os.path.join(scratch, sub), exist_ok=True)
env = dict(os.environ, CHOUPO_HOME=ROOT)
for c in sorted(cases):
    name = os.path.basename(c)
    dst = os.path.join(scratch, sub, name)
    if os.path.exists(dst):
        shutil.rmtree(dst)
    shutil.copytree(c, dst, ignore=shutil.ignore_patterns("iterations", "converged", "reports", "design"))
    cd = os.path.join(dst, "system", "controlDict")
    app = "choupoSolve"
    if os.path.exists(cd):
        t = open(cd).read()
        m = re.search(r'^\s*application\s+(\w+)\s*;', t, re.M)
        if m:
            app = m.group(1)
        if re.search(r'^\s*verbosity\s+\d+\s*;', t, re.M):
            t = re.sub(r'^(\s*verbosity\s+)\d+(\s*;)', r'\g<1>' + verb + r'\2', t, flags=re.M)
        open(cd, "w").write(t)
    t0 = time.time()
    with open(os.path.join(dst, "log.txt"), "w") as log:
        r = subprocess.run([os.path.join(ROOT, app), "."], cwd=dst, stdout=log,
                           stderr=subprocess.STDOUT, env=env, timeout=1800)
    txt = open(os.path.join(dst, "log.txt"), errors="replace").read()
    i = txt.rfind('{ "version"')
    if i >= 0:
        open(os.path.join(dst, "result.json"), "w").write(txt[i:])
    print(f"{name}\t{os.path.relpath(c, ROOT)}\t{r.returncode}\t{time.time()-t0:.1f}", flush=True)
