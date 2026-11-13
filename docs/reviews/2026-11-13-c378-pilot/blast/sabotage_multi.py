#!/usr/bin/env python3
"""Several by-hand sabotages at once (to reproduce a set of survivors in one build).
Usage: sabotage_multi.py <repoRoot> <scratchDir> <tag> <spec.json> <check> [<check> ...]
spec.json: [[file, find, replace], ...].  Applies all, rebuilds, runs the checks,
restores every file with `git checkout --`, rebuilds.  Logs under <scratchDir>/<tag>/."""
import json, subprocess, sys
from pathlib import Path

root, S, tag, spec = sys.argv[1:5]
checks = sys.argv[5:]
root = Path(root).resolve(); out = Path(S).resolve() / tag; out.mkdir(parents=True, exist_ok=True)
edits = json.loads(Path(spec).read_text())
files = sorted({e[0] for e in edits})
try:
    for f, find, repl in edits:
        p = root / f; t = p.read_text()
        if t.count(find) != 1:
            sys.exit(f"{tag}: find occurs {t.count(find)} times in {f}")
        p.write_text(t.replace(find, repl))
    b = subprocess.run("nice -n 10 make all -j2", shell=True, cwd=root, capture_output=True, text=True)
    (out / "build.log").write_text(b.stdout + b.stderr)
    if b.returncode:
        print(f"{tag}: BUILD FAILED"); sys.exit(1)
    for i, c in enumerate(checks):
        r = subprocess.run(c, shell=True, cwd=root, capture_output=True, text=True)
        (out / f"check{i}.log").write_text(r.stdout + r.stderr)
        key = [l for l in (r.stdout + r.stderr).splitlines()
               if l.startswith(("FAIL", "NOSUBJ")) or ": OK" in l or ": FAIL" in l or "PASS " in l[:6] and "/" in l]
        print(f"{tag}: exit {r.returncode}  {c[:120]}")
        for l in key[-6:]:
            print("     " + l[:200])
finally:
    subprocess.run(["git", "checkout", "--"] + files, cwd=root)
    b = subprocess.run("nice -n 10 make all -j2", shell=True, cwd=root, capture_output=True, text=True)
    print(f"{tag}: restored, rebuild exit {b.returncode}")
