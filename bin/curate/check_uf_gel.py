#!/usr/bin/env python3
"""check_uf_gel -- ultrafiltration by gel polarisation (2026-09-30, C27).

`transport gelPolarisation` (src/unitOperations/membrane/transport/
GelPolarisation.H) is the spiral-wound module's law for a UF membrane:
pressure-controlled flux J = A_w dP until the gel-forming solute's wall
concentration reaches its declared gel concentration c_g, then the
mass-transfer-limited flux J = k ln(c_g (1 - S)/(c_b - S c_g)) with a
DECLARED sieving coefficient S.  The witness
tutorials/steady/membranes/membrane19_uf_gel_polarisation is gel-limited
from its first node.  This gate holds, from the runs themselves:

  (a) the closed form NODE BY NODE: the published J_w profile equals
      k ln(c_g (1 - S)/(c_b - S c_g)) on the published c_b to 1e-9, and
      the wall excess Gamma = (c_g - c_b)/c_b;
  (b) the PLATEAU: the same module fed at 5 bar instead of 3 delivers the
      same flux to 1e-12 -- past the gel point the pump buys nothing;
  (c) the PRESSURE-CONTROLLED regime: fed at 1.1 bar (0.1 bar across the
      membrane) the wall stays below c_g and the flux is exactly A_w dP;
  (d) Michaels' form: with S = 0 the first node carries k ln(c_g/c_b);
  (e) the solute balance: the module's own solute_closure_rel below 1e-9;
  (f) four refusals fired through the reader: no `gel {}` block, no
      `source`, a solute with no sieving coefficient, and S = 1.

NOT CHECKED: any measured UF -- the membrane, c_g, S and k of the witness
are hypothetical teaching values and its header says so; the protein's
osmotic pressure and charge, which the law does not have.
"""
import json
import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CASE = ROOT / "tutorials/steady/membranes/membrane19_uf_gel_polarisation"
BIN = ROOT / "choupoSolve"
C_GEL_MASS, S_BSA, K = 250.0, 0.01, 1.0e-5
A_W = 5.0e-5 / 1.0e5          # m/(s Pa), the record's 5e-5 m/(s bar)


def fail(msg):
    print(f"check_uf_gel: FAILED\n  {msg}")
    sys.exit(1)


def run(case_dir):
    p = subprocess.run([str(BIN), "."], cwd=case_dir, capture_output=True,
                       text=True, timeout=600,
                       env={"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"})
    return p.returncode, p.stdout + p.stderr


def result(out):
    a = out.find("<<<Choupo:result-begin>>>")
    b = out.find("<<<Choupo:result-end>>>")
    if a < 0 or b < 0:
        fail("no result block in the run's output")
    return json.loads(out[a + len("<<<Choupo:result-begin>>>"):b])


def copy(tmp, tag, edits=()):
    d = Path(tmp) / tag
    shutil.copytree(CASE, d)
    for rel, old, new in edits:
        f = d / rel
        t = f.read_text()
        if old not in t:
            fail(f"edit anchor not found in {rel}: {old!r}")
        f.write_text(t.replace(old, new, 1))
    return d


def solved(tmp, tag, edits=()):
    rc, out = run(copy(tmp, tag, edits))
    if rc != 0:
        fail(f"the '{tag}' run failed (exit {rc}):\n{out[-800:]}")
    return result(out)


def main():
    if not BIN.exists():
        fail(f"{BIN} is missing -- build first; a check that cannot run must"
             " not pass")
    mw = None
    for line in (CASE / "constant/components/BSA.dat").read_text().splitlines():
        f = line.split()
        if len(f) >= 2 and f[0] == "MW":
            mw = float(f[1].rstrip(";"))
    if not mw:
        fail("could not read BSA's MW from the witness's record")
    cg = C_GEL_MASS / mw
    FS = "system/flowsheetDict"

    with tempfile.TemporaryDirectory() as tmp:
        base = solved(tmp, "witness")
        k = base["kpis"]["UF"]
        col = base["profiles"]["UF"]["columns"]
        worst = 0.0
        for J, cb, G in zip(col["J_w"], col["c_b_BSA"], col["Gamma_BSA"]):
            want = K * math.log(cg * (1 - S_BSA) / (cb - S_BSA * cg))
            worst = max(worst, abs(J - want) / want)
            if abs(J - want) > 1e-9 * want:
                fail(f"(a) node flux {J:.12g} against the closed form"
                     f" {want:.12g} at c_b {cb:.6g} kmol/m3")
            if abs(G - (cg - cb) / cb) > 1e-9 * G:
                fail(f"(a) wall excess {G:.10g} against (c_g - c_b)/c_b ="
                     f" {(cg - cb) / cb:.10g}")
        nodes = len(col["J_w"])

        hi = solved(tmp, "5bar",
                    [("0/feed", "P               3.0 bar;",
                      "P               5.0 bar;")])["kpis"]["UF"]
        if abs(hi["J_w_avg"] - k["J_w_avg"]) > 1e-12 * k["J_w_avg"]:
            fail(f"(b) at 5 bar the flux is {hi['J_w_avg']:.12g}, at 3 bar"
                 f" {k['J_w_avg']:.12g}: the plateau is not flat")

        lo = solved(tmp, "1.1bar",
                    [("0/feed", "P               3.0 bar;",
                      "P               1.1 bar;")])["kpis"]["UF"]
        want = A_W * 0.1e5
        if abs(lo["J_w_avg"] - want) > 1e-9 * want:
            fail(f"(c) at 0.1 bar the flux is {lo['J_w_avg']:.12g}, A_w dP ="
                 f" {want:.12g}: the pressure-controlled regime is not the"
                 " pure-water law")

        m0 = solved(tmp, "S0", [(FS, "sieving   { BSA 0.01; }",
                                 "sieving   { BSA 0.0; }")])
        c0 = m0["profiles"]["UF"]["columns"]
        want = K * math.log(cg / c0["c_b_BSA"][0])
        if abs(c0["J_w"][0] - want) > 1e-9 * want:
            fail(f"(d) S = 0: first node {c0['J_w'][0]:.12g}, Michaels"
                 f" k ln(c_g/c_b) = {want:.12g}")

        if k["solute_closure_rel"] > 1e-9:
            fail(f"(e) solute_closure_rel {k['solute_closure_rel']:.3g}")

        refusals = [
            ("no gel block", [(FS, "                gel\n", "                nogel\n")],
             "no `gel { solute; c_gel; sieving {};"),
            ("no source", [(FS, "                    source    \"hypothetical",
                            "                    note      \"hypothetical")],
             "declares no `source`"),
            ("a solute with no sieving",
             [(FS, "sieving   { BSA 0.01; }", "sieving   { }")],
             "no sieving coefficient for solute 'BSA'"),
            ("S = 1", [(FS, "sieving   { BSA 0.01; }",
                        "sieving   { BSA 1.0; }")],
             "must lie in [0, 1)"),
        ]
        for tag, edits, want_msg in refusals:
            rc, out = run(copy(tmp, tag.replace(" ", "_"), edits))
            if rc == 0 or want_msg not in out:
                fail(f"(f) {tag}: expected a refusal naming \"{want_msg}\","
                     f" got exit {rc}:\n{out[-600:]}")

    print(f"check_uf_gel: OK -- membrane19's flux equals the gel-limited"
          f" closed form k ln(c_g (1 - S)/(c_b - S c_g)) at all {nodes} nodes"
          f" (worst {worst:.1e}); 3 -> 5 bar leaves it unchanged (the"
          f" plateau); at 0.1 bar it is exactly A_w dP; with S = 0 it is"
          f" Michaels' k ln(c_g/c_b); the solute closes; {len(refusals)}"
          f" refusals fired by name.  NOT CHECKED: any measured UF (every"
          f" UF number in the witness is a hypothetical teaching value),"
          f" the protein's osmotic pressure and charge.")


if __name__ == "__main__":
    main()
