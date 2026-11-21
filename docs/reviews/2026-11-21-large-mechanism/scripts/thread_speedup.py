#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""thread_speedup -- wall time of a case's `sensitivity { }` block on 1..T threads.

    thread_speedup.py CASE --threads 1,2,3 [--repeat 2] [--bin DIR]

Copies CASE to a temporary directory for each run, adds `threads N;` to the vessel's
solver block, unsets CHOUPO_THREADS (so the declared count is the one used), and prints
per thread count the minimum wall time, the speed-up against the first count and whether
sensitivity.csv is byte-identical to the first count's.  CHOUPO_HOME must be set.
"""
import argparse
import os
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("case")
    ap.add_argument("--threads", default="1,2,3")
    ap.add_argument("--repeat", type=int, default=2)
    ap.add_argument("--bin", default=str(Path(__file__).resolve().parents[4] / "build/linux64Gcc"))
    a = ap.parse_args()
    src = Path(a.case)
    env = {k: v for k, v in os.environ.items() if k != "CHOUPO_THREADS"}
    first_t, first_csv = None, None
    for n in [int(x) for x in a.threads.split(",")]:
        best, csv, used = None, None, "?"
        for _ in range(a.repeat):
            d = Path(tempfile.mkdtemp(prefix="thr_"))
            c = d / src.name
            shutil.copytree(src, c, ignore=shutil.ignore_patterns("[0-9]*e-*", "latest"))
            fs = c / "system/flowsheetDict"
            s = fs.read_text()
            s2 = re.sub(r"(solver\s*\{)", rf"\1 threads {n}; ", s, count=1)
            fs.write_text(s2)
            t0 = time.perf_counter()
            r = subprocess.run([str(Path(a.bin) / "choupoBatch"), str(c)], capture_output=True,
                               text=True, env=env)
            dt = time.perf_counter() - t0
            out = r.stdout + r.stderr
            if r.returncode != 0:
                print(f"threads {n}: exit {r.returncode}: " + " | ".join(out.strip().splitlines()[-2:])[:300])
                shutil.rmtree(d, ignore_errors=True)
                break
            m = re.search(r"of them on (\d+) thread", out)
            used = m.group(1) if m else "?"
            csv = (c / "sensitivity.csv").read_bytes()
            best = dt if best is None else min(best, dt)
            shutil.rmtree(d, ignore_errors=True)
        if best is None:
            continue
        if first_t is None:
            first_t, first_csv = best, csv
        print(f"{src.name}: threads {n} (used {used})  wall {best:8.2f} s  speed-up {first_t / best:5.2f}"
              f"  sensitivity.csv identical to the first: {csv == first_csv}")


if __name__ == "__main__":
    main()
