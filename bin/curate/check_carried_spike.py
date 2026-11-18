#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_carried_spike -- the C427 spike's scripted criteria S2, S3, S4 (S1 and
S5 are `bin/runTests --scope` and a timing, run by hand and reported).

    bin/curate/check_carried_spike.py

THE REAL DEFECT IT WOULD HAVE CAUGHT (a spike gate names it): before the
carried-quantity kinds, a stream could carry only a size distribution, and a
quantity of any other kind had no home -- so a polymer's moments or a
material's mass put on a stream either vanished at the first unit or were
copied through a reaction unchanged.  This gate holds that (S2) a mass flow
and two chain moments ride a mixer and a splitter and come out as the kinds'
own laws say; (S2b) the moments through a reactor agree with the closed form
and a material handed to that reactor is refused by name; (S3) a kind on an
inlet of a unit that does not model it is refused before the solve, authored
or produced; (S4) the state files round-trip and an old file without the
block reads as "none carried".

Not wired into bin/runTests (a spike's verdict, DEV.md is the architect's).
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
CASE = ROOT / "bin" / "curate" / "carried_spike" / "mixsplit"
ENV = dict(os.environ, CHOUPO_HOME=str(ROOT))
FAIL = []
OK = []


def run(binary, case, timeout=600):
    return subprocess.run([str(ROOT / binary), str(case)], capture_output=True,
                          text=True, timeout=timeout, env=ENV, cwd=str(case))


def carried(path):
    """{name: (kind, [values])} of a state file's carried block."""
    t = Path(path).read_text()
    m = re.search(r"^carried\s*\{(.*)\n\}\s*$", t, re.S | re.M)
    out = {}
    if not m:
        return out
    for q in re.finditer(r"(\w+)\s*\{\s*kind\s+(\w+);.*?values\s*\(([^)]*)\)", m.group(1), re.S):
        out[q.group(1)] = (q.group(2), [float(x) for x in q.group(3).split()])
    return out


def check(cond, ok, bad):
    (OK if cond else FAIL).append(ok if cond else bad)


def fresh(tmp, name):
    d = Path(tmp) / name
    shutil.copytree(CASE, d)
    return d


def main():
    if not (BUILD / "libchoupo.so").exists():
        print("check_carried_spike: FAILED\n  no build; a check that cannot run must not pass.")
        return 1
    with tempfile.TemporaryDirectory() as tmp:
        # ---- S2a: mixer -> splitter ---------------------------------------
        d = fresh(tmp, "ms")
        r = run("choupoSolve", d)
        check(r.returncode == 0, "S2a run exits 0", "S2a: mixer->splitter case failed:\n" + r.stdout[-600:] + r.stderr[-600:])
        if r.returncode == 0:
            exp = {"flour": 1.25 + 2.75, "PS_mu0": 0.002 + 0.005, "PS_mu2": 8.5 + 31.0}
            for stream, f in (("mixed", 1.0), ("sideA", 0.3), ("sideB", 0.7)):
                got = carried(d / "converged" / stream)
                for k, v in exp.items():
                    g = got.get(k, (None, [float("nan")]))[1][0]
                    rel = abs(g - v * f) / (v * f)
                    check(rel < 1e-12, f"S2a {stream}.{k} = {g:.12g}",
                          f"S2a {stream}.{k} = {g!r}, expected {v*f!r} (rel {rel:.2e})")
            check("global closure 100.000 %" in r.stdout, "S2a mass closure 100.000 % (existing report)",
                  "S2a: the existing mass-balance report does not close")
            check("worst element closure off by 0.0000 %" in r.stdout, "S2a element closure 0.0000 % (existing report)",
                  "S2a: the existing element-balance report does not close")
            check("PS_mu2 [chainMoment" in r.stdout, "S2a report form printed in the stream table",
                  "S2a: the stream table does not print the carried quantities")

            # ---- S4: converged -> 0/ -> rerun, byte-identical ---------------
            d2 = fresh(tmp, "rt")
            for f in ("feedA", "feedB", "mixed", "sideA", "sideB"):
                shutil.copy(d / "converged" / f, d2 / "0" / f)
            r2 = run("choupoSolve", d2)
            same = r2.returncode == 0 and all(
                (d / "converged" / f).read_bytes() == (d2 / "converged" / f).read_bytes()
                for f in ("feedA", "feedB", "mixed", "sideA", "sideB"))
            check(same, "S4 converged -> 0/ -> converged is byte-identical (carried values read back to the same bits)",
                  "S4: a state read back from converged/ does not reproduce converged/ byte for byte")
            # an old file without the block reads as none carried
            d3 = fresh(tmp, "old")
            for f in ("feedA", "feedB"):
                t = (d3 / "0" / f).read_text()
                (d3 / "0" / f).write_text(t[: t.index("carried")])
            r3 = run("choupoSolve", d3)
            check(r3.returncode == 0 and not carried(d3 / "converged" / "sideA")
                  and "carried" not in (d3 / "converged" / "mixed").read_text(),
                  "S4 a state file without the block reads as none carried (and none is written)",
                  "S4: an old file without `carried` did not read as none carried:\n" + r3.stdout[-400:])

        # ---- S2b: the reactor leg, through the kinds ----------------------
        probe = BUILD / "carriedProbe"
        src = ROOT / "bin" / "curate" / "_carriedProbe.cpp"
        c = subprocess.run(["g++", "-std=c++17", "-O2", f"-I{ROOT / 'src'}", f"-I{ROOT}", str(src),
                            str(BUILD / "libchoupo.so"), "-Wl,-rpath," + str(BUILD), "-o", str(probe)],
                           capture_output=True, text=True)
        check(c.returncode == 0, "S2b probe compiled", "S2b: probe did not compile:\n" + c.stderr[-800:])
        if c.returncode == 0:
            p = json.loads(subprocess.run([str(probe)], capture_output=True, text=True, env=ENV).stdout)
            check(abs(p["mixed_mu0"] - 0.007) < 1e-15 and abs(p["mixed_mu2"] - 39.5) < 1e-12,
                  "S2b mixing law of chainMoment adds", "S2b: mixing law wrong: %r" % p)
            check(abs(p["branch_mu0"] - 0.3 * 0.007) < 1e-15, "S2b division law scales with the carrier",
                  "S2b: division law wrong")
            r0 = abs(p["mu0_out_rk4"] - p["mu0_out_closed"]) / p["mu0_out_closed"]
            r2_ = abs(p["mu2_out_rk4"] - p["mu2_out_closed"]) / p["mu2_out_closed"]
            check(r0 < 1e-12 and r2_ < 1e-9, f"S2b reactor moments vs closed form: mu0 {r0:.1e}, mu2 {r2_:.1e}",
                  f"S2b: moments off the closed form (mu0 {r0:.2e}, mu2 {r2_:.2e})")
            check(p["mu1_in"] == p["mu1_out"] and abs(p["chains_in"] - p["chains_out_plus_events"]) < 1e-15,
                  "S2b segments (mu1) unchanged and chain count balanced by the events",
                  "S2b: segment or chain-count balance broken")
            check(p["material_change_refused"] == 1 and p["material_refusal_names_kind"] == 1
                  and p["material_unchanged_accepted"] == 1,
                  "S2b a material handed to the reactor: a change is refused by name, an unchanged value accepted",
                  "S2b: the materialMass kind did not refuse a production term")

        # ---- S3: a kind on an inlet the unit does not model ---------------
        d4 = fresh(tmp, "heater_authored")
        fs = d4 / "system" / "flowsheetDict"
        fs.write_text("units\n(\n    { name H1; type heater; in feedA; outputs ( hot ); operation { T 350 K; } }\n);\n")
        for f in ("feedB", "mixed", "sideA", "sideB"):
            (d4 / "0" / f).unlink()
        shutil.copy(CASE / "0" / "feedA", d4 / "0" / "hot")
        t = (d4 / "0" / "hot").read_text()
        (d4 / "0" / "hot").write_text(t[: t.index("carried")])
        r4 = run("choupoSolve", d4)
        msg = r4.stdout + r4.stderr
        check(r4.returncode != 0 and "chainMoment" in msg and "heater 'H1'" in msg and "does not model that kind" in msg
              and "Mixer inputs" not in msg,
              "S3 authored: heater refuses the chainMoment by kind and unit before any unit runs",
              "S3 authored: not refused as required:\n" + msg[-700:])
        d5 = fresh(tmp, "heater_produced")
        (d5 / "system" / "flowsheetDict").write_text(
            "units\n(\n    { name M1; type mixer; inputs ( feedA feedB ); outputs ( mixed ); }\n"
            "    { name H1; type heater; in mixed; outputs ( hot ); operation { T 350 K; } }\n);\n")
        for f in ("sideA", "sideB"):
            (d5 / "0" / f).unlink()
        shutil.copy(CASE / "0" / "mixed", d5 / "0" / "hot")
        r5 = run("choupoSolve", d5)
        msg = r5.stdout + r5.stderr
        check(r5.returncode != 0 and "heater 'H1'" in msg and "inlet 'mixed'" in msg and "does not model that kind" in msg,
              "S3 produced: the mixer's outlet is refused at the heater's hand-over, naming kind, unit, inlet",
              "S3 produced: not refused as required:\n" + msg[-700:])

    if FAIL:
        print("check_carried_spike: FAILED")
        for f in FAIL:
            print("  - " + f)
        return 1
    for o in OK:
        print("  ok  " + o)
    print(f"check_carried_spike: OK -- {len(OK)} claims held (S2, S3, S4)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
