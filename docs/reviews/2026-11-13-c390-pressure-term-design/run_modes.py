#!/usr/bin/env python3
"""run_modes.py <repo-root> <scratch-dir> <case-rel-path> [modes...]
Copy a case to <scratch>/runs/<name>_<mode>, run it with CHOUPO_C390=<mode>
('' = baseline), parse the result JSON, and compare the stream/kpi/boundary
golden rows of the case's `expected` against it.  Writes only under scratch."""
import sys, os, shutil, subprocess, json, csv, math
repo, scr, case = os.path.abspath(sys.argv[1]), sys.argv[2], sys.argv[3]
modes = sys.argv[4:] or ["", "Avliq", "Arec", "Brec", "Akern", "Bkern"]
name = os.path.basename(case.rstrip("/"))
src = os.path.join(repo, case)
binmap = {"choupoSolve": "choupoSolve"}
def run(mode):
    d = os.path.join(scr, "runs", f"{name}_{mode or 'base'}")
    shutil.rmtree(d, ignore_errors=True); shutil.copytree(src, d)
    env = dict(os.environ); env["CHOUPO_C390"] = mode
    env["PATH"] = repo + ":" + env.get("PATH", "")
    p = subprocess.run([os.path.join(repo, "choupoSolve"), "."], cwd=d, env=env,
                       capture_output=True, text=True, timeout=1800)
    log = p.stdout + p.stderr
    open(os.path.join(d, "log"), "w").write(log)
    js = None
    if "<<<Choupo:result-begin>>>" in log:
        body = log.split("<<<Choupo:result-begin>>>", 1)[1]
        body = body.split("<<<Choupo:result-end>>>", 1)[0]
        try: js = json.loads(body)
        except Exception as e: js = None
    bu = {}
    f = os.path.join(d, "reports/balances/energyBalance_byUnit.csv")
    if os.path.exists(f):
        for row in csv.reader(open(f)):
            if not row: break
            if len(row) > 9 and row[0] != "unit":
                bu[row[0]] = (row[3], row[4], row[5], row[9])
    return p.returncode, js, bu, log
def rows():
    out = []
    if not os.path.exists(os.path.join(src, "expected")): return out
    for ln in open(os.path.join(src, "expected")):
        t = ln.split()
        if not t or t[0].startswith("#"): continue
        if t[0] in ("stream", "kpi", "boundary") and len(t) >= 5:
            out.append(t)
    return out
def val(js, t):
    try:
        if t[0] == "stream": return float(js["streams"][t[1]][t[2]])
        if t[0] == "kpi": return float(js["kpis"][t[1]][t[2]])
        if t[0] == "boundary" and t[1] == "global": return float(js["globalEnergyBoundary"][t[2]])
    except Exception: return None
    return None
def tol(t, ref):
    s = t[4]
    if s.startswith("abs:"): return float(s[4:])
    return float(s) * max(abs(ref), 1e-30)
R = rows()
for m in modes:
    rc, js, bu, log = run(m)
    print(f"=== {name} mode={m or 'base'} rc={rc}")
    if js is None:
        print("   no result JSON; tail:"); print("\n".join(log.splitlines()[-8:])); continue
    g = js.get("globalEnergyBoundary", {})
    print(f"   plant residual_kW={g.get('residual_kW')} pct={g.get('residual_pct')}")
    for u, v in bu.items(): print(f"   unit {u}: dH={v[0]} items={v[1]} closure%={v[2]} remaining={v[3]}")
    for k, v in js.get("kpis", {}).items():
        if "dT" in v: print(f"   kpi {k}.dT={v['dT']} T_out={v.get('T_out')}")
    moved = []
    for t in R:
        ref = float(t[3]) if t[3].replace('.','',1).replace('-','',1).replace('e','',1).replace('+','',1).isdigit() else None
        try: ref = float(t[3])
        except ValueError: continue
        x = val(js, t)
        if x is None: continue
        if abs(x - ref) > tol(t, ref):
            moved.append((t[0], t[1], t[2], ref, x, (x - ref) / ref if ref else float('inf')))
    print(f"   golden rows checked={len(R)} moved={len(moved)}")
    for mv in moved[:40]:
        print(f"     {mv[0]:8s} {mv[1]:22s} {mv[2]:18s} {mv[3]:.10g} -> {mv[4]:.10g}  rel {mv[5]:+.3e}")
