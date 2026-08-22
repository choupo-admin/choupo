#!/usr/bin/env python3
"""The two PID gain refusals FIRE, with their named remedies (I5, W-R-C).

Until 2026-08-22 a PID whose gains{} used the textbook spelling
(`Kc`/`tauI`) parsed, defaulted every gain to zero, and ran the loop with
NO control action at exit 0 -- the closed-loop plot was the open-loop
response with a constant bias.  The constructor now refuses (a) any key in
the closed gains{} dict that is not Kp/Ki/Kd, naming the textbook
conversion, and (b) a controller whose declared gains are all zero.  This
gate builds both probes from a real corpus case and requires each refusal
BY ITS MESSAGE, so the refusals cannot silently rot into acceptance.

A missing binary REFUSES (a check that cannot run must not pass).
"""
import re, shutil, subprocess, sys, tempfile
from pathlib import Path

repo = Path(__file__).resolve().parents[2]
ctrl = repo / "choupoCtrl"
base = repo / "tutorials/ctrl/ctrl02_disturbance_rejection"

if not ctrl.exists():
    print("pid-refusals GATE FAILED: no choupoCtrl binary -- build first"
          " (make).  A check that cannot run must not pass.")
    sys.exit(1)
if not base.is_dir():
    print("pid-refusals GATE FAILED: probe base case"
          " ctrl02_disturbance_rejection is gone -- re-point the gate.")
    sys.exit(1)

def probe(mutate, must_match, label):
    with tempfile.TemporaryDirectory() as td:
        case = Path(td) / "probe"
        shutil.copytree(base, case)
        fd = case / "system/flowsheetDict"
        fd.write_text(mutate(fd.read_text()))
        r = subprocess.run([str(ctrl)], cwd=case, capture_output=True,
                           text=True, timeout=300)
        out = r.stdout + r.stderr
        if r.returncode == 0:
            return f"{label}: the probe RAN (exit 0) -- the refusal is gone"
        if not re.search(must_match, out):
            return (f"{label}: refused, but not with the named message"
                    f" (wanted /{must_match}/)")
        return None

fails = []
f = probe(lambda t: t.replace("Kp       4.0;", "Kc       4.0;", 1),
          r"gains\.Kc is not a gain this controller reads.*Kp = Kc",
          "foreign-key probe (Kc)")
if f: fails.append(f)
f = probe(lambda t: t.replace("Kp       4.0;", "Kp       0.0;")
                     .replace("Ki       0.04;", "Ki       0.0;"),
          r"every gain in gains\{\} is zero",
          "all-zero probe")
if f: fails.append(f)

if fails:
    print("pid-refusals GATE FAILED:")
    for x in fails:
        print("  -", x)
    sys.exit(1)
print("pid-refusals: OK -- both gain refusals fire from a real corpus case"
      " with their named remedies (foreign key -> the Kc/tauI conversion;"
      " all-zero -> declare a gain or remove the controller).")
