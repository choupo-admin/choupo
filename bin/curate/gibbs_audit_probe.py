#!/usr/bin/env python3
"""The case's own thermophysical package, asked from Python (DEV.md 4c C173).

    from gibbs_audit_probe import ask, build

`build()` compiles bin/curate/_gibbsAuditProbe.cpp against the tree's
libchoupo.so and returns None, or a refusal string -- a check that cannot
run must not pass, so a caller FAILS on a refusal, never skips.  `ask(case,
lines)` sends request lines (NAMES, LNPHI, K, GRES, REACT, REACTIDEAL; the
probe's own header lists them) and returns one list of floats per line, or
raises with the probe's ERR text.

The probe calls NO unit operation: it builds the case's package exactly as
the binaries do and asks it for ln phi, K, g_res and the fugacity condition
of one reaction, so a gate can hold a unit's answer to the package it
declares without reusing the unit's arithmetic.
"""
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
PROBE = BUILD / "gibbsAuditProbe"
SRC = ROOT / "bin" / "curate" / "_gibbsAuditProbe.cpp"

_built = False


def build():
    global _built
    if _built:
        return None
    lib = BUILD / "libchoupo.so"
    if not lib.exists():
        return "libchoupo.so is not built -- a check that cannot run must not pass"
    p = subprocess.run(
        ["g++", "-std=c++17", "-O2", "-I" + str(ROOT / "src"), "-I" + str(ROOT),
         str(SRC), str(lib), "-Wl,-rpath," + str(BUILD), "-o", str(PROBE)],
        capture_output=True, text=True)
    if p.returncode != 0:
        return ("the audit probe did not compile -- the ThermoPackage surface"
                " moved:\n" + p.stderr[-1500:])
    _built = True
    return None


def ask(case, lines, workdir):
    req = Path(workdir) / ("probe_%d.txt" % abs(hash((str(case), tuple(lines)))))
    req.write_text("\n".join(lines) + "\n")
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(PROBE), str(case), str(req)], env=env,
                       capture_output=True, text=True, timeout=600)
    if "<<<PROBE" not in p.stdout:
        raise RuntimeError("probe failed: " + (p.stderr or p.stdout)[-800:])
    body = p.stdout.split("<<<PROBE")[1].split("PROBE>>>")[0].strip().splitlines()
    out = []
    for l in body:
        if not l.startswith("OK"):
            raise RuntimeError("probe: " + l)
        toks = l.split()[1:]
        try:
            out.append([float(t) for t in toks])
        except ValueError:
            out.append(toks)
    return out
