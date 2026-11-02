#!/usr/bin/env python3
# =============================================================================
#        \|/       C hemicals     | Open-source, glass-box chemical process simulator
#       \\|//      H eat-transfer | https://choupo.org
#      \\\|///     O perations    |
#       \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
#        \|/       P roperties    | Licence: GPL-3.0-or-later
#         |        O ptimization  |
#        /|\                      |
# -----------------------------------------------------------------------------
#     SPDX-License-Identifier: GPL-3.0-or-later
#     Credit and attribution: see AUTHORS
#     Required legal notices:  see NOTICE
# =============================================================================
"""Gate: the compaction bench (`compactionFit`, DEV.md 4c C195) fits what its
case declares, and refuses what it cannot fit.

    bin/curate/check_compaction_bench.py

WHY THIS EXISTS.  The op publishes Heckel's mean yield pressure, Kawakita's a
and 1/b and the Ryshkewitch-Duckworth sigma_0 and k_b of a literature
excipient, and a tablet-press design is built on those numbers.  A golden
pins what a run PRINTS, so a wrong-but-stable fit (a window applied one point
too wide, ln taken of D instead of 1/(1-D), the Kawakita slope and intercept
swapped) would pass the suite for ever.  Only a recomputation from the
DECLARATION can see it.

WHAT THIS CHECKS, by RUNNING the witnesses in a scratch copy:

  (a) EVERY FIT REPRODUCES.  For every `compactionFit` op of every witness,
      the dataset is read from the case's OWN file, the window from the
      case's OWN propsDict, and each declared model is refitted here by
      ordinary least squares on its authors' line (Heckel ln(1/(1-D)) vs P;
      Kawakita P/C vs P; Ryshkewitch-Duckworth ln(sigma_t) vs porosity), with
      no code shared with the engine.  The engine's published parameters, R2
      and point counts must agree to 1e-6 relative.
  (b) THE REFUSALS FIRE BY NAME.  On a copy of the first witness: a Heckel
      window holding fewer than 4 points refuses naming "parameters + 2"; a
      window holding no point refuses naming "NO point"; a Heckel block with
      no window refuses naming "never chosen".  Each must exit non-zero AND
      say why -- a refusal for another reason would prove nothing.
  (c) THE PAPER'S VALUE IS PRINTED, NOT FITTED.  Where the case declares
      `reported {}`, the JSON carries paper_<key> equal to the declared
      number, and the fitted value is NOT equal to it (a fitted value that
      came back identical to the paper's would mean it was copied).

WHAT THIS DOES NOT CHECK: whether the transcription of the dataset from its
source is right (a human reads it back -- reviewStatus interim), nor whether
the declared window is the right one (the case's own reason says why).

SABOTAGE (by hand, 2026-11-02).  In src/propertyOps/CompactionFit.cpp the
Kawakita constant `const scalar bk = L.m / L.q;` was changed to
`L.q / L.m` (b and 1/b swapped -- the slope over the intercept is the
algebra a student gets backwards), the engine rebuilt and the gate run: arm
(a) FAILED on all four Kawakita fits (kawakita_invb_MPa 0.1116 against the
recomputed 8.965 on mcc_inDie) while the witness itself exited 0 and
printed a plausible-looking number.  Restored from a copy and rebuilt; the
gate passed again.  A window sabotage (`P > hi` -> `P >= hi`) was
considered and NOT used: no witness row sits exactly on a declared bound,
so it could not have fired -- a sabotage that cannot fire proves nothing.
"""
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT
WITNESSES = [
    ROOT / "tutorials/props/powder/compaction01_mcc",
    ROOT / "tutorials/props/powder/compaction02_dcpd_brittle",
]
REL = 1e-6
failures = []


def run(case):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(BUILD / "choupoProps"), str(case)], capture_output=True,
                       text=True, timeout=600, env=env, cwd=str(case))
    return r.returncode, r.stdout + r.stderr


def result_of(out):
    if "<<<Choupo:result-begin>>>" not in out:
        return None
    return json.loads(out.split("<<<Choupo:result-begin>>>")[1]
                      .split("<<<Choupo:result-end>>>")[0])


def strip_comments(t):
    t = re.sub(r"/\*.*?\*/", " ", t, flags=re.S)
    return re.sub(r"//[^\n]*", " ", t)


def blocks(text, open_at):
    """The text inside the brace that opens at or after index open_at."""
    i = text.index("{", open_at)
    depth = 0
    for j in range(i, len(text)):
        if text[j] == "{":
            depth += 1
        elif text[j] == "}":
            depth -= 1
            if depth == 0:
                return text[i + 1:j], j
    raise ValueError("unbalanced braces")


def ops_of(case):
    t = strip_comments((case / "system/propsDict").read_text())
    ops = []
    pos = 0
    while True:
        m = re.search(r"\{", t[pos:])
        if not m:
            break
        start = pos + m.start()
        try:
            body, end = blocks(t, start)
        except ValueError:
            break
        if re.search(r"\btype\s+compactionFit\s*;", body):
            #  prose entries out, so a key named inside a sentence is never read
            ops.append(re.sub(r"\b(reason|source|material)\s+\"[^\"]*\"\s*;", " ", body))
        pos = end + 1
    return ops


def word(body, key):
    m = re.search(r"(?<![A-Za-z_])" + key + r"\s+\"?([^\";\s]+)\"?\s*;", body)
    return m.group(1) if m else None


def sub(body, key):
    m = re.search(r"(?<![A-Za-z_])" + key + r"\s*\{", body)
    if not m:
        return None
    inner, _ = blocks(body, m.start())
    return inner


def pressure_mpa(body, key):
    m = re.search(key + r"\s+([-+0-9.eE]+)\s+MPa\s*;", body)
    if not m:
        raise ValueError(f"{key} not declared in MPa in the propsDict")
    return float(m.group(1))


def scalar(body, key):
    m = re.search(r"(?<![A-Za-z_])" + key + r"\s+([-+0-9.eE]+)\s*;", body)
    return float(m.group(1)) if m else None


def read_dataset(case, rel):
    p = case / (rel if rel.endswith(".dat") else rel + ".dat")
    t = re.sub(r'"[^"]*"', '""', strip_comments(p.read_text()))
    c0 = re.search(r"\bcolumns\s*\(", t).end()
    d0 = re.search(r"\bdata\s*\(", t[c0:]).end() + c0
    cols = re.findall(r"\{\s*name\s+(\w+)\s*;\s*unit\s+([^;\s]+)\s*;\s*\}", t[c0:d0])
    nums = [float(x) for x in re.findall(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?",
                                         t[d0:t.index(")", d0)])]
    nc = len(cols)
    rows = [nums[i:i + nc] for i in range(0, len(nums) - nc + 1, nc)]
    return {c[0]: [r[k] for r in rows] for k, c in enumerate(cols)}, len(rows)


def rel_density(ds, n, op):
    if "D" in ds:
        return ds["D"]
    if "porosity" in ds:
        return [1.0 - e for e in ds["porosity"]]
    m = re.search(r"trueDensity\s+([-+0-9.eE]+)\s+g/cm3\s*;", op)
    rho = float(m.group(1))
    return [d / rho for d in ds["density"]]


def line(x, y):
    n = len(x)
    xb, yb = sum(x) / n, sum(y) / n
    sxx = sum((a - xb) ** 2 for a in x)
    sxy = sum((a - xb) * (b - yb) for a, b in zip(x, y))
    syy = sum((b - yb) ** 2 for b in y)
    m = sxy / sxx
    q = yb - m * xb
    rss = sum((b - (m * a + q)) ** 2 for a, b in zip(x, y))
    return m, q, (1.0 - rss / syy) if syy > 0 else 1.0, n


def agree(label, got, want):
    if got is None:
        failures.append(f"{label}: not published (expected {want:.8g})")
        return
    if abs(got - want) > REL * max(abs(want), 1e-12):
        failures.append(f"{label}: engine {got:.10g}, recomputed {want:.10g}")


def recompute(case, op, diag, name):
    checked = 0
    dataset = word(op, "dataset")
    h = sub(op, "heckel")
    if h is not None:
        ds, n = read_dataset(case, word(h, "dataset") or dataset)
        D = rel_density(ds, n, op)
        lo, hi = pressure_mpa(h, "Pmin"), pressure_mpa(h, "Pmax")
        pts = [(P, math.log(1.0 / (1.0 - d))) for P, d in zip(ds["P"], D) if lo <= P <= hi]
        m, q, r2, k = line([a for a, _ in pts], [b for _, b in pts])
        agree(f"{name} heckel_Py_MPa", diag.get("heckel_Py_MPa"), 1.0 / m)
        agree(f"{name} heckel_A", diag.get("heckel_A"), q)
        agree(f"{name} heckel_R2", diag.get("heckel_R2"), r2)
        agree(f"{name} n_heckel", diag.get("n_heckel"), float(k))
        checked += 1
    kw = sub(op, "kawakita")
    if kw is not None:
        ds, n = read_dataset(case, word(kw, "dataset") or dataset)
        if "C" in ds:
            C = ds["C"]
        elif "V" in ds:
            m0 = re.search(r"initialVolume\s+([-+0-9.eE]+)\s+mL\s*;", kw)
            V0 = float(m0.group(1))
            C = [(V0 - v) / V0 for v in ds["V"]]
        else:
            D0 = scalar(kw, "initialRelativeDensity")
            C = [1.0 - D0 / d for d in rel_density(ds, n, op)]
        lo, hi = pressure_mpa(kw, "Pmin"), pressure_mpa(kw, "Pmax")
        pts = [(P, P / c) for P, c in zip(ds["P"], C) if lo <= P <= hi]
        m, q, r2, k = line([a for a, _ in pts], [b for _, b in pts])
        agree(f"{name} kawakita_a", diag.get("kawakita_a"), 1.0 / m)
        agree(f"{name} kawakita_invb_MPa", diag.get("kawakita_invb_MPa"), q / m)
        agree(f"{name} kawakita_R2", diag.get("kawakita_R2"), r2)
        agree(f"{name} n_kawakita", diag.get("n_kawakita"), float(k))
        checked += 1
    ry = sub(op, "ryshkewitch")
    if ry is not None:
        ds, n = read_dataset(case, word(ry, "dataset") or dataset)
        D = rel_density(ds, n, op)
        if "sigma_t" in ds:
            s = ds["sigma_t"]
        else:
            s = [2.0 * F / (math.pi * d * t) for F, d, t in zip(ds["F"], ds["d"], ds["t"])]
        emin = scalar(ry, "porosityMin")
        emax = scalar(ry, "porosityMax")
        emin = 0.0 if emin is None else emin
        emax = 1.0 if emax is None else emax
        pts = [(1.0 - d, math.log(v)) for d, v in zip(D, s) if emin <= 1.0 - d <= emax]
        m, q, r2, k = line([a for a, _ in pts], [b for _, b in pts])
        agree(f"{name} ryshkewitch_sigma0_MPa", diag.get("ryshkewitch_sigma0_MPa"), math.exp(q))
        agree(f"{name} ryshkewitch_kb", diag.get("ryshkewitch_kb"), -m)
        agree(f"{name} ryshkewitch_R2", diag.get("ryshkewitch_R2"), r2)
        agree(f"{name} n_ryshkewitch", diag.get("n_ryshkewitch"), float(k))
        checked += 1
    rep = sub(op, "reported")
    if rep is not None:
        for key, dk in (("Py", "heckel_Py_MPa"), ("A", "heckel_A"), ("a", "kawakita_a"),
                        ("invb", "kawakita_invb_MPa"), ("sigma0", "ryshkewitch_sigma0_MPa"),
                        ("kb", "ryshkewitch_kb")):
            v = scalar(rep, key)
            if v is None:
                mm = re.search(r"(?<![A-Za-z_])" + key + r"\s+([-+0-9.eE]+)\s+MPa\s*;", rep)
                v = float(mm.group(1)) if mm else None
            if v is None:
                continue
            agree(f"{name} paper_{dk}", diag.get("paper_" + dk), v)
            if diag.get(dk) is not None and diag.get(dk) == v:
                failures.append(f"{name} {dk}: the fitted value equals the paper's to the"
                                " last digit -- copied, not fitted?")
    return checked


def probe(src, mutate, must, label):
    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp) / src.name
        shutil.copytree(src, d, ignore=shutil.ignore_patterns("expected", "*.csv", "curation"))
        pd = d / "system/propsDict"
        pd.write_text(mutate(pd.read_text()))
        rc, out = run(d)
        if rc == 0:
            failures.append(f"refusal ({label}): the run exited 0")
        elif must not in out:
            failures.append(f"refusal ({label}): exited {rc} but never said '{must}':\n"
                            + out[-800:])


def main():
    nfits = 0
    nops = 0
    for case in WITNESSES:
        if not case.is_dir():
            failures.append(f"witness missing: {case}")
            continue
        rc, out = run(case)
        res = result_of(out)
        if rc != 0 or res is None:
            failures.append(f"{case.name}: run failed (exit {rc}):\n{out[-1500:]}")
            continue
        diags = {o["name"]: o.get("diagnostics", {}) for o in res.get("operationResults", [])}
        for op in ops_of(case):
            name = word(op, "name")
            if name not in diags:
                failures.append(f"{case.name}: op '{name}' published no result")
                continue
            nops += 1
            nfits += recompute(case, op, diags[name], f"{case.name}/{name}")

    first = WITNESSES[0]

    def narrow(t):
        return re.sub(r"(heckel\s*\{[^{}]*?)Pmax\s+[-+0-9.eE]+\s+MPa\s*;",
                      lambda m: m.group(1) + "Pmax PMAXPROBE MPa;", t, count=1)

    def few_points(t):
        # keep the declared Pmin; move Pmax to just above it so 1-3 points remain
        txt = strip_comments(t)
        h = sub(txt, "heckel")
        lo = pressure_mpa(h, "Pmin")
        ds, _ = read_dataset(first, word(h, "dataset") or word(ops_of(first)[0], "dataset"))
        inside = sorted(P for P in ds["P"] if P >= lo)
        return narrow(t).replace("PMAXPROBE", repr(inside[2] if len(inside) > 2 else inside[-1]))

    def empty_window(t):
        return re.sub(r"(heckel\s*\{[^{}]*?)Pmin\s+[-+0-9.eE]+\s+MPa\s*;\s*Pmax\s+[-+0-9.eE]+\s+MPa\s*;",
                      lambda m: m.group(1) + "Pmin 9000 MPa; Pmax 9500 MPa;", t, count=1)

    def no_window(t):
        return re.sub(r"(heckel\s*\{[^{}]*?)Pmin\s+[-+0-9.eE]+\s+MPa\s*;\s*Pmax\s+[-+0-9.eE]+\s+MPa\s*;",
                      lambda m: m.group(1), t, count=1)

    if first.is_dir():
        probe(first, few_points, "parameters + 2", "three points in the window")
        probe(first, empty_window, "NO point", "a window holding no point")
        probe(first, no_window, "never chosen", "no Heckel window declared")

    if failures:
        print("check_compaction_bench: FAIL")
        for f in failures:
            print("  - " + f)
        return 1
    print(f"check_compaction_bench: OK -- {nfits} model fit(s) in {nops} compactionFit op(s) of "
          f"{len(WITNESSES)} witnesses recomputed from each case's own dataset and window "
          "(Heckel, Kawakita, Ryshkewitch-Duckworth, 1e-6); three refusals fire by name "
          "(3 points, an empty window, no window).  Not checked: the transcription from the "
          "source, or whether the declared window is the right one.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
