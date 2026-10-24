#!/usr/bin/env python3
"""Gate: Choupo's DSPM-DE pore and NanoFiltran agree on the SAME model --
code-to-code, to the two programs' discretisation error.

    bin/curate/check_nanofiltran_reference.py

WHY THIS EXISTS (2026-10-22, DEV.md 4c C138 slice 2).  Slice 1 built a
finite-difference pore solver for the DSPM-DE law, "the method of
NanoFiltran" (Geraldes & Alves, J. Membr. Sci. 321 (2008) 172-182), and
compared it with nothing but itself and an analytic limit.  Vitor handed
over NanoFiltran; it lives in bin/curate/nanofiltran/ (as received, built
and run by regenerate.py), and its numbers are committed in
bin/curate/nanofiltran/reference.tsv and, as ANCHOR rows, in the golden
case tutorials/props/membrane/nanofiltran01_dspmde_reference/expected.
This gate holds the agreement -- WITHOUT gfortran: a check that cannot run
must not pass, and this one never needs the compiler; regenerating the
reference is regenerate.py's own job, and it REFUSES without gfortran.

WHAT THIS GATE CHECKS.

  (a) THE INPUTS ARE THE RULE'S.  The committed NanoFiltran inputs
      (bin/curate/nanofiltran/cases/) equal what regenerate.py's input rule
      writes from the shipped example (pure Python, no compiler), and the
      vendored sources hash to the values the README records -- so the
      anchors cannot have been produced from a hand-edited input or a
      modified program.
  (b) THE ANCHORS ARE THE TABLE'S.  Every reference.tsv row has an anchor
      row in the case's `expected` carrying the same extrapolated permeate
      concentration (1e-11 relative), and no anchor row lacks a table row.
  (c) CODE TO CODE.  The case is run at 401, 801 and 1601 nodes; per row the
      observed order of Choupo's pore is measured (1.8..2.2 wherever the
      differences stand above round-off) and its Richardson extrapolation is
      compared with NanoFiltran's (ND 102 / 204): within 2e-6 relative on
      every one of the table's rows.
  (d) THE CASE'S OWN GRID.  At the case's 801 nodes every row lies inside
      the anchor's tolerance, and that tolerance is at least the measured
      801-node error (so a too-tight anchor fails here, not at random).
  (e) THE DECLARATIONS REFUSE.  An unknown `hindrance`, `activity` and
      `wallClosure` word, `wallClosure` and `activity bulkOverPoreDavies`
      under `method closedForm`, and a non-DSPM-DE law on the bench -- each
      refuses by name.

WHAT THIS GATE DOES NOT CHECK, said plainly: whether NanoFiltran is right
(two programs agreeing is verification, not validation); the as-received
program's Davies rows (its ln-for-log10 constant is a finding, the anchors
use the one-line-corrected copy); the default DSPM-DE path (its goldens and
check_pore_solver arm (d) hold it); any measured membrane.

BY-HAND SABOTAGES (2026-10-22), each restored (engine ones rebuilt) and the
gate re-run to OK:
  S1  DechadilokDeen2006 K_d = H instead of H/Phi (the legacy diffusive
      factor) -> FAILED, but NOT where predicted: the case no longer RAN --
      at J_v = 2e-5 m/s on 401 nodes the pore's continuation in J_v stalled
      (DSPM-DE refused), so arm (c) reported the run, not a disagreement.
  S2  A(eps, T) divided by ln 10 (NanoFiltran's own constant on log10) ->
      FAILED (c)+(d) on example_davies: Choupo then gives Na+ 7.824252 where
      the as-received NanoFiltran gives 7.824214 -- the finding reproduced to
      5e-6 (the rest is the constant's fifth figure).
  S3  `wallClosure porePermeate` ignored (the B_s closure kept) -> FAILED
      (c)/(d), and not only on the polarised op: at k = 10 m/s the wall
      closure still moves the example's trace Na+ by 1.0e-5.
  S4  one anchor's value edited in `expected` -> FAILED (b).
  S5  the membrane charge in one committed INPUT.XLS edited -> FAILED (a).
  S6  the `hindrance` refusal removed (an unknown word falls to legacy) ->
      FAILED (e) -- the run still exited 1, because the legacy pore stalls as
      in S1, and only the needle (the refusal's own sentence) told the two
      apart: a refusal for another reason is not the refusal under test.
"""
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from hashlib import sha256
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "bin" / "curate" / "nanofiltran"))
import regenerate as nf  # noqa: E402  (pure-Python input rule; never builds here)

CASE = ROOT / "tutorials" / "props" / "membrane" / "nanofiltran01_dspmde_reference"
PROPS = ROOT / "choupoProps"
GRIDS = (401, 801, 1601)
CASE_NODES = 801
TOL_CODE = 2.0e-6          # Choupo extrapolated vs NanoFiltran extrapolated

#  The vendored sources, byte for byte as received (README.md records them).
SOURCE_SHA256 = {
    "src/NANOFILTRAN.F": "104962dd36dc31d1f4794e93e682e1394639586414d3ad6a076c8e31f15e3f33",
    "src/LINEAR.F":      "704852b0b5ed5ab057964e24878bd433f3dbcedc3550594165d2728fb806d5b9",
    "src/SIMPLEX.F":     "c0d158ede21f05b3b5e80bf7a88babc9aca8df41b8bbe23f40e06476b3660e99",
    "shipped/INPUT.XLS": "0e56d7ab07b0d17382411606d31ca75798239a2741bded3208bccbb900d84442",
    "shipped/IONS.XLS":  "bbf2b6e7703b63fd3ea8c9c4c101b5e6cd75ac9a8c3b0e1bc8414f1a8a68f859",
}

fails = []


def run_case(case_dir):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(PROPS), str(case_dir)], capture_output=True, text=True,
                       timeout=1800, env=env)
    return r.returncode, r.stdout + r.stderr


def diags_of(out):
    if "<<<Choupo:result-begin>>>" not in out:
        return None
    res = json.loads(out.split("<<<Choupo:result-begin>>>")[1]
                        .split("<<<Choupo:result-end>>>")[0])
    return {o["name"]: o.get("diagnostics", {}) for o in res.get("operationResults", [])}


def copy_case(dst, nodes=None, props=None):
    shutil.copytree(CASE, dst, ignore=shutil.ignore_patterns("expected"))
    pd = dst / "system" / "propsDict"
    text = pd.read_text()
    if nodes is not None:
        text = re.sub(r"nodes\s+\d+;", f"nodes {nodes};", text)
    if props is not None:
        text = props(text)
    pd.write_text(text)
    return dst


def anchors():
    rows = {}
    if not (CASE / "expected").is_file():
        fails.append("(b) the case has no `expected` file")
        return rows
    for line in (CASE / "expected").read_text().splitlines():
        f = line.split()
        if len(f) >= 6 and f[0] == "diag" and f[5] == "anchor":
            rows[(f[1], f[2])] = (float(f[3]), float(f[4]))
    return rows


# ---- (a) ------------------------------------------------------------------
def arm_inputs():
    here = ROOT / "bin" / "curate" / "nanofiltran"
    for rel, h in SOURCE_SHA256.items():
        p = here / rel
        if not p.is_file():
            fails.append(f"(a) {rel} is missing")
        elif sha256(p.read_bytes()).hexdigest() != h:
            fails.append(f"(a) {rel} no longer hashes to the value recorded as received")
    n = 0
    if (here / "cases" / "IONS.XLS").read_bytes() != nf.ions_xls():
        fails.append("(a) cases/IONS.XLS differs from what the matching rule writes")
    for case in nf.CASES:
        for p, jv in enumerate(case["jv"], 1):
            f = here / "cases" / f"{case['op']}_p{p}" / "INPUT.XLS"
            if not f.is_file() or f.read_bytes() != nf.input_xls(case, jv, nf.NDS[1]):
                fails.append(f"(a) {f.relative_to(here)} is missing or differs from the rule")
            n += 1
    return n


# ---- (b) ------------------------------------------------------------------
def arm_anchors(ref, anc):
    keys = set()
    for r in ref:
        key = (r["op"], f"c_perm_{r['ion']}_p{r['point']}")
        keys.add(key)
        if key not in anc:
            fails.append(f"(b) no anchor row for {key[0]} {key[1]}")
            continue
        v, _ = anc[key]
        if abs(v - r["cp_ext"]) > 1e-11 * abs(r["cp_ext"]) + 1e-300:
            fails.append(f"(b) anchor {key[0]} {key[1]} = {v!r} but reference.tsv says "
                         f"{r['cp_ext']!r}")
    extra = sorted(set(anc) - keys)
    if extra:
        fails.append(f"(b) anchor rows with no reference.tsv row: {extra}")
    return len(keys)


# ---- (c), (d) ---------------------------------------------------------------
def arm_code_to_code(tmp, ref, anc):
    runs = {}
    for n in GRIDS:
        rc, out = run_case(copy_case(tmp / f"g{n}", nodes=n))
        d = diags_of(out) if rc == 0 else None
        if d is None:
            fails.append(f"(c) the case did not run at {n} nodes (exit {rc}):\n{out[-1500:]}")
            return None
        runs[n] = d
    worst, orders, worst_case_grid = 0.0, [], 0.0
    ratio = (GRIDS[2] - 1) / (GRIDS[1] - 1)
    for r in ref:
        key = f"c_perm_{r['ion']}_p{r['point']}"
        try:
            v = [runs[n][r["op"]][key] for n in GRIDS]
        except KeyError:
            fails.append(f"(c) the case publishes no {r['op']} {key}")
            continue
        ext = v[2] + (v[2] - v[1]) / (ratio * ratio - 1.0)
        e1, e2 = v[1] - v[0], v[2] - v[1]
        if abs(e2) > 1e-9 * abs(v[2]) and abs(e1) > 0:
            p = math.log(abs(e1 / e2), 2.0)
            orders.append(p)
            if not 1.8 <= p <= 2.2:
                fails.append(f"(c) {r['op']} {key}: observed order {p:.2f} (expected 2)")
        rel = abs(ext - r["cp_ext"]) / abs(r["cp_ext"])
        worst = max(worst, rel)
        if rel > TOL_CODE:
            fails.append(f"(c) {r['op']} {key}: Choupo extrapolated {ext:.10g} vs "
                         f"NanoFiltran {r['cp_ext']:.10g} -- {rel:.2e} relative > {TOL_CODE}")
        # (d) the case's own grid against its anchor tolerance
        here = runs[CASE_NODES][r["op"]][key]
        err = abs(here - r["cp_ext"]) / abs(r["cp_ext"])
        worst_case_grid = max(worst_case_grid, err)
        a = anc.get((r["op"], key))
        if a is not None:
            if err > a[1]:
                fails.append(f"(d) {r['op']} {key}: {CASE_NODES} nodes is {err:.2e} from "
                             f"NanoFiltran, outside its anchor tolerance {a[1]:.1e}")
    return worst, orders, worst_case_grid


# ---- (e) ------------------------------------------------------------------
def arm_refusals(tmp):
    probes = [
        ("hindrance banana", lambda t: t.replace("hindrance  DechadilokDeen2006;",
                                                 "hindrance  banana;", 1),
         ["unknown DSPM-DE hindrance 'banana'", "DechadilokDeen2006", "legacy"]),
        ("activity banana", lambda t: t.replace("activity   ideal;", "activity   banana;", 1),
         ["unknown DSPM-DE activity 'banana'", "bulkOverPoreDavies"]),
        ("wallClosure banana", lambda t: t.replace("wallClosure porePermeate;",
                                                   "wallClosure banana;", 1),
         ["unknown DSPM-DE pore solver wallClosure 'banana'", "porePermeate"]),
        ("wallClosure under closedForm",
         lambda t: t.replace("{ method finiteDifference; nodes 801; wallClosure porePermeate; }",
                             "{ method closedForm; wallClosure porePermeate; }", 1),
         ["only the solved pore can close"]),
        ("bulkOverPoreDavies under closedForm",
         lambda t: re.sub(r"(name\s+example_davies;.*?)poreSolver \{[^}]*\}",
                          r"\1poreSolver { method closedForm; }", t, count=1, flags=re.S),
         ["bulkOverPoreDavies", "the closed form does not have"]),
        ("another law on the bench", lambda t: t.replace("transport DSPM-DE;",
                                                         "transport SDEM;", 1),
         ["only the DSPM-DE law honours an imposed"]),
    ]
    fired = 0
    for tag, edit, needles in probes:
        case = copy_case(tmp / ("refuse_" + re.sub(r"\W+", "_", tag)), props=edit)
        if (case / "system" / "propsDict").read_text() == (CASE / "system" / "propsDict").read_text():
            fails.append(f"(e) the probe `{tag}` could not be built (its anchor text moved)")
            continue
        rc, out = run_case(case)
        if rc == 0:
            fails.append(f"(e) `{tag}` was ACCEPTED (exit 0)")
            continue
        miss = [s for s in needles if s not in out]
        if miss:
            fails.append(f"(e) `{tag}` exited {rc} without naming {miss}:\n{out[-800:]}")
            continue
        fired += 1
    return fired


def main():
    if not PROPS.exists():
        print("check_nanofiltran_reference: FAILED -- no choupoProps binary (build first)")
        return 1
    ref = nf.read_reference()
    anc = anchors()
    with tempfile.TemporaryDirectory(prefix="nanofiltran_") as d:
        tmp = Path(d)
        n_inputs = arm_inputs()
        n_anch = arm_anchors(ref, anc)
        c2c = arm_code_to_code(tmp, ref, anc)
        fired = arm_refusals(tmp)
    if fails:
        print("check_nanofiltran_reference: FAILED")
        for f in fails:
            print("  " + f)
        return 1
    worst, orders, caseGrid = c2c
    print(f"check_nanofiltran_reference: OK -- {n_inputs} NanoFiltran inputs are the "
          f"matching rule's and its 5 vendored files hash as received; {n_anch} anchors "
          f"equal reference.tsv; Choupo's pore at 401/801/1601 nodes shows order "
          f"{min(orders):.2f}-{max(orders):.2f} and, extrapolated, agrees with NanoFiltran "
          f"extrapolated (ND 102/204) within {worst:.1e} relative on all {len(ref)} rows "
          f"(bound {TOL_CODE:g}); at the case's {CASE_NODES} nodes the worst row is "
          f"{caseGrid:.1e} from NanoFiltran, inside every anchor; {fired} refusals fire by "
          f"name.  NOT CHECKED: whether NanoFiltran is right (code-to-code is not "
          f"validation), the as-received program's Davies constant (a finding), the default "
          f"DSPM-DE path, any measured membrane.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
