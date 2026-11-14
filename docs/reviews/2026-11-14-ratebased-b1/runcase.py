#!/usr/bin/env python3
"""runcase.py <repo> <scratch> <case-name> <tag> [--keep-outer] [--edit old=>new ...] [--env K=V ...]
Copies tutorials/steady/distillation/<case-name> into <scratch>/runs/<tag>, applies
edits to system/flowsheetDict (or file:old=>new), runs choupoSolve, writes out.txt and
result.json, prints exit code, wall time and the first ERROR line."""
import json, os, shutil, subprocess, sys, time
from pathlib import Path

repo, scratch, case, tag = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3], sys.argv[4]
args = sys.argv[5:]
keep_outer = "--keep-outer" in args
edits, envs = [], {}
i = 0
while i < len(args):
    if args[i] == "--edit":
        edits.append(args[i + 1]); i += 2
    elif args[i] == "--env":
        k, v = args[i + 1].split("=", 1); envs[k] = v; i += 2
    else:
        i += 1
src = repo / "tutorials/steady/distillation" / case
dst = scratch / "runs" / tag
if dst.exists():
    shutil.rmtree(dst)
shutil.copytree(src, dst, ignore=shutil.ignore_patterns("converged", "reports", "iterations", "log.*", "*.csv"))
if not keep_outer:
    (dst / "system/outerDict").unlink(missing_ok=True)
for e in edits:
    rel = "system/flowsheetDict"
    if "::" in e:
        rel, e = e.split("::", 1)
    old, new = e.split("=>", 1)
    old = old.replace("\\n", "\n"); new = new.replace("\\n", "\n")
    f = dst / rel
    t = f.read_text()
    if old not in t:
        print(f"EDIT TARGET MISSING in {rel}: {old!r}"); sys.exit(3)
    f.write_text(t.replace(old, new, 1))
env = dict(os.environ, CHOUPO_HOME=str(repo))
env.update(envs)
t0 = time.time()
p = subprocess.run([str(repo / "choupoSolve"), "."], cwd=dst, env=env, capture_output=True, text=True)
wall = time.time() - t0
out = p.stdout + p.stderr
(dst / "out.txt").write_text(out)
a, b = out.find("<<<Choupo:result-begin>>>"), out.find("<<<Choupo:result-end>>>")
if a >= 0 and b >= 0:
    try:
        r = json.loads(out[a + len("<<<Choupo:result-begin>>>"):b])
        (dst / "result.json").write_text(json.dumps(r, indent=1))
    except ValueError as ex:
        print("JSON parse failed", ex)
err = next((l for l in out.splitlines() if "ERROR" in l or "error" in l.lower() and "what()" in l), "")
print(f"{tag}: exit {p.returncode} wall {wall:.2f}s  first-error: {err[:300]}")
