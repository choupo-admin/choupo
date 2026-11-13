#!/usr/bin/env python3
"""One by-hand sabotage: apply (find -> replace) once in <file>, rebuild, run the
listed checks, restore the file with `git checkout --`, rebuild.  Writes the logs
under <scratchDir>/<tag>/.  A restored file is clock-different, hence the rebuild.
Usage: sabotage.py <repoRoot> <scratchDir> <tag> <file> <find> <replace> <check> [<check> ...]
A check is a shell command run from <repoRoot> (e.g. "bin/curate/check_density_pilot.py",
"bin/runTests --scope tutorials/steady/rotating/pump01_water")."""
import subprocess, sys
from pathlib import Path

root, S, tag, f, find, repl = sys.argv[1:7]
checks = sys.argv[7:]
root = Path(root).resolve(); out = Path(S).resolve() / tag; out.mkdir(parents=True, exist_ok=True)
p = root / f
t = p.read_text()
if t.count(find) != 1:
    sys.exit(f"{tag}: the find text occurs {t.count(find)} times in {f}")
p.write_text(t.replace(find, repl))
try:
    b = subprocess.run("nice -n 10 make all -j2", shell=True, cwd=root, capture_output=True, text=True)
    (out / "build.log").write_text(b.stdout + b.stderr)
    if b.returncode:
        print(f"{tag}: BUILD FAILED"); sys.exit(1)
    for i, c in enumerate(checks):
        r = subprocess.run(c, shell=True, cwd=root, capture_output=True, text=True)
        (out / f"check{i}.log").write_text(r.stdout + r.stderr)
        lines = [l for l in (r.stdout + r.stderr).splitlines() if l.strip()]
        key = [l for l in lines if l.startswith(("FAIL", "PASS ", "OK", "Summary", "TOTAL")) or ": OK" in l or ": FAIL" in l]
        print(f"{tag}: exit {r.returncode}  {c}")
        for l in (key[-8:] if key else lines[-3:]):
            print("     " + l[:220])
finally:
    subprocess.run(["git", "checkout", "--", f], cwd=root)
    b = subprocess.run("nice -n 10 make all -j2", shell=True, cwd=root, capture_output=True, text=True)
    print(f"{tag}: restored, rebuild exit {b.returncode}")
