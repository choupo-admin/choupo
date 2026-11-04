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
"""check_extractor_validation -- the liquid-liquid extractor's first validation
against measured tie lines, its shortcut check, and its declared HETS
(DEV.md 4c C219, first phase).

Holds, from runs it performs itself:

  (a) THE PUBLISHED AAD IS A RECOMPUTATION.  `lle01_acetic_mibk_perry` is run;
      from the measured dataset (constant/experiments/*.dat, parsed here) and
      the model's own CSV (`tie_unifac.csv`) the average absolute deviation of
      every column is recomputed by linear interpolation at the measured
      raffinate acid fractions, and must equal the engine's `validation`
      block and the case's `aad` rows to 1e-9 (the engine's number moved by
      nobody's hand).  The VERDICT WORD of each column is decided here from
      the band the case header declares (AAD <= 0.01 `agrees`, <= 0.03
      `approximate`, else `misses`), and the case header must state the
      overall verdict (`misses`) -- a header that claims agreement the
      numbers do not give is the 2026-08-12 failure.
  (b) THE DATASET IS SELF-CONSISTENT: every measured phase composition sums
      to 1 within the printed table's rounding (1.5e-4), and its provenance
      block names Perry's Table 15-8 and Sherwood, Evans & Longcor 1939.
  (c) PERRY'S PRINTED ARITHMETIC.  Example 15-1 (Xf 0.25, Xr 0.01, Ys 0.001,
      K' 0.656, E 1.85) gives N = 4.3 by Eq. (15-43), recomputed here from
      the formula as the page prints it; Example 15-2's pseudo-solute
      Eqs. (15-90)/(15-91) give 0.251 / 0.0016 and N = 4.5; Example 15-3's
      N_or = 6.0; E from the slopes (0.833, 0.656; 199.8/80) rounds to 1.85.
      The engine's `extractionShortcut` op (case `extractionShortcut01_*`)
      must reproduce each to 1e-9 of the independent recomputation, and the
      printed (rounded) values to the digits Perry prints.
  (d) TWO BOOKS, ONE CASCADE.  Treybal's Eq. (10.38), (E^(N+1) - E)/(E^(N+1)
      - 1), evaluated at Perry's N equals (Xf - Xr)/(Xf - Ys/K') to 1e-12,
      both here and in the engine's two published columns.
  (e) THE EXTRACTOR'S SHORTCUT KPIs.  `extract03_acetic_acid_mibk_perry` is
      run; `E_shortcut` = sqrt(Kp_feedEnd Kp_raffinateEnd) S/F with S/F read
      from the case's own `0/` files, and `N_shortcut` recomputed from Perry's
      formula on the feed, solvent and raffinate flows the run published, both
      to 1e-9; the shortcut is within one stage of the rigorous count (a
      CHECK that disagrees by more says the equilibrium is not straight, and
      the gate would then say so rather than pass).
  (f) THE HETS.  `height_m` = stages x `hets_m` exactly; the same case with
      `hetsSource` deleted REFUSES by name (exit non-zero, the message names
      `hetsSource`), and `hetsSource` without `hets` refuses too.
  (g) SOURCE: the extractor and the op both call
      `extractionShortcut::stages` and neither re-writes the logarithm.

SABOTAGE, performed by hand on 2026-11-04 and restored (engine rebuilt):
  S1  ExtractionShortcut.H `(1.0 - 1.0 / E)` -> `(1.0 + 1.0 / E)` in
      `stages()`  -> caught by (c) and (e) (N 4.29 -> 5.49 against 4.3) and,
      through the op, by (d)'s engine columns.

NOT CHECKED, said plainly: the shortcut against the rigorous count on any
case other than extract03 (one witness); a HETS value (none ships); stage
efficiency (out of this phase: the definition for liquid-liquid stages needs
its own page of Perry's); the UNIFAC miss itself is pinned, not explained --
a curated LLE parameter set would move the verdict.
"""
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROPS = ROOT / "choupoProps"
SOLVE = ROOT / "choupoSolve"
LLE = ROOT / "tutorials/props/compare/lle01_acetic_mibk_perry"
SHORT = ROOT / "tutorials/props/compare/extractionShortcut01_perry_example15_1"
EX3 = ROOT / "tutorials/steady/absorption/extract03_acetic_acid_mibk_perry"
HDR = ROOT / "src/unitOperations/separation/ExtractionShortcut.H"
EXSRC = ROOT / "src/unitOperations/separation/Extractor.cpp"
OPSRC = ROOT / "src/propertyOps/ExtractionShortcutOp.cpp"

BANDS = (0.01, 0.03)          # declared in the lle01 header, a priori
fails = []


def fail(msg):
    fails.append(msg)
    print("FAIL  " + msg)


def run(binary, case_dir):
    p = subprocess.run([str(binary), "."], cwd=case_dir, capture_output=True,
                       text=True, timeout=900,
                       env={"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"})
    return p.returncode, p.stdout, p.stderr


def result_json(out):
    i = out.find("<<<Choupo:result-begin>>>")
    j = out.find("<<<Choupo:result-end>>>")
    if i < 0 or j < 0:
        return None
    return json.loads(out[i + len("<<<Choupo:result-begin>>>"):j])


def close(a, b, tol):
    return abs(a - b) <= tol * max(1.0, abs(b))


# ---- independent recomputation of Perry's formulas (NOT the engine's header) --
def perry_N(Xf, Xr, Ys, K, E):
    eq = Ys / K
    return math.log((Xf - eq) / (Xr - eq) * (1 - 1 / E) + 1 / E) / math.log(E)


def treybal_fraction(N, E):
    return (E ** (N + 1) - E) / (E ** (N + 1) - 1)


def parse_dataset(path):
    txt = path.read_text()
    cols = re.findall(r"name\s+(\w+);", txt)
    body = txt[re.search(r"^data\s*$", txt, re.M).start():]
    nums = [float(x) for x in re.findall(r"-?\d+\.\d+", body)]
    n = len(cols)
    rows = [nums[i:i + n] for i in range(0, len(nums), n)]
    return cols, rows, txt


def read_csv(path):
    lines = path.read_text().splitlines()
    head = lines[0].split(",")
    return head, [[float(v) for v in ln.split(",")] for ln in lines[1:] if ln.strip()]


def golden_aad(case):
    out = {}
    for line in (case / "expected").read_text().splitlines():
        f = line.split()
        if len(f) >= 4 and f[0] == "aad":
            out[f[2]] = float(f[3])
    return out


def verdict(aad):
    return "agrees" if aad <= BANDS[0] else ("approximate" if aad <= BANDS[1] else "misses")


def main():
    for b in (PROPS, SOLVE):
        if not b.exists():
            print(f"check_extractor_validation: FAILED -- {b.name} is missing; build first")
            return 1

    # ---------------- (a), (b): the validation reading ----------------------
    cols, rows, dtxt = parse_dataset(LLE / "constant/experiments/perry_table15_8_sherwood1939.dat")
    if len(rows) != 6 or len(cols) != 6:
        fail(f"dataset parse: {len(rows)} rows x {len(cols)} columns, expected 6 x 6")
    for r in rows:
        if abs(sum(r[:3]) - 1) > 1.5e-4 or abs(sum(r[3:]) - 1) > 1.5e-4:
            fail(f"measured tie line {r} does not sum to 1 within the table's rounding")
    if "Table 15-8" not in dtxt or "Sherwood" not in dtxt or "1939" not in dtxt:
        fail("the dataset's provenance must name Perry's Table 15-8 and Sherwood, Evans & Longcor 1939")

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td) / "lle"
        shutil.copytree(LLE, tmp)
        for f in list(tmp.glob("*.csv")) + list(tmp.glob("log.*")):
            f.unlink()
        rc, out, err = run(PROPS, tmp)
        if rc != 0:
            fail(f"lle01 did not run (exit {rc}): {err[-300:]}")
            return report()
        js = result_json(out)
        mh, mrows = read_csv(tmp / "tie_unifac.csv")
    mrows.sort()
    val = {a["property"]: a for a in js["validation"][0]["aad"]}
    pinned = golden_aad(LLE)
    worst = "agrees"
    for j, name in enumerate(cols):
        if j == 0:
            continue                       # the abscissa
        mj = mh.index(name)
        errs = []
        for r in rows:
            x = r[0]
            for a, b in zip(mrows, mrows[1:]):
                if a[0] <= x <= b[0]:
                    t = (x - a[0]) / (b[0] - a[0])
                    errs.append(abs(a[mj] + t * (b[mj] - a[mj]) - r[j]))
                    break
        if len(errs) != 6:
            fail(f"{name}: only {len(errs)} of 6 measured abscissae inside the model range")
            continue
        aad = sum(errs) / len(errs)
        if not close(val[name]["aadAbs"], aad, 1e-9):
            fail(f"{name}: engine AAD {val[name]['aadAbs']} != recomputed {aad}")
        key = f"tie_unifac.{name}.aadAbs"
        if key not in pinned or not close(pinned[key], aad, 1e-4):
            fail(f"{name}: the case's aad row ({pinned.get(key)}) does not hold the recomputed {aad}")
        v = verdict(aad)
        if ["agrees", "approximate", "misses"].index(v) > ["agrees", "approximate", "misses"].index(worst):
            worst = v
    hdr = (LLE / "system/propsDict").read_text()
    if f"`{worst}`" not in hdr:
        fail(f"the lle01 header does not state the verdict `{worst}` the numbers give")
    if js["validation"][0]["aad"][0]["status"] != "ok":
        fail("the overlay status is not ok")

    # ---------------- (c), (d): Perry's and Treybal's arithmetic ------------
    N_A = perry_N(0.25, 0.01, 0.001, 0.656, 1.85)
    if round(N_A, 1) != 4.3:
        fail(f"Example 15-1 arithmetic gives {N_A}, Perry prints 4.3")
    XfB = 0.25 + (199.8 - 198.7) * 0.0983 / 80
    YsB = 0.001 + (80 - 67.5) * 0.01 / 199.8
    N_B = perry_N(XfB, 0.01, YsB, 0.656, 1.85)
    if round(XfB, 3) != 0.251 or round(YsB, 4) != 0.0016 or round(N_B, 1) != 4.5:
        fail(f"Example 15-2 arithmetic gives XfB {XfB}, YsB {YsB}, N {N_B}; Perry prints 0.251, 0.0016, 4.5")
    N_or = 4.5 * math.log(1.85) / (1 - 1 / 1.85)
    if round(N_or, 1) != 6.0:
        fail(f"Example 15-3 arithmetic gives {N_or}, Perry prints 6.0")
    E_sl = math.sqrt(0.833 * 0.656) * 199.8 / 80
    if round(E_sl, 2) != 1.85:
        fail(f"E from the slopes gives {E_sl}, Perry prints 1.85")
    for N, E, Xf, Xr, Ys in ((N_A, 1.85, 0.25, 0.01, 0.001), (N_B, 1.85, XfB, 0.01, YsB)):
        if not close(treybal_fraction(N, E), (Xf - Xr) / (Xf - Ys / 0.656), 1e-12):
            fail("Treybal Eq. (10.38) and Perry Eq. (15-43) disagree at the same N")

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td) / "sc"
        shutil.copytree(SHORT, tmp)
        rc, out, err = run(PROPS, tmp)
        if rc != 0:
            fail(f"extractionShortcut01 did not run (exit {rc})")
            return report()
        ops = {o["name"]: o["diagnostics"] for o in result_json(out)["operationResults"]}
    A, S, B = ops["ex15_1_caseA"], ops["ex15_1_E_from_slopes"], ops["ex15_2_caseB"]
    checks = ((A["N"], N_A), (B["N"], N_B), (B["XfB"], XfB), (B["YsB"], YsB),
              (B["N_or"], perry_N(XfB, .01, YsB, .656, 1.85) * math.log(1.85) / (1 - 1 / 1.85)),
              (S["E"], E_sl), (S["N"], perry_N(.25, .01, .001, .656, E_sl)),
              (A["fractionTaken"], (0.25 - 0.01) / (0.25 - 0.001 / 0.656)))
    for got, want in checks:
        if not close(got, want, 1e-9):
            fail(f"engine extractionShortcut {got} != independent recomputation {want}")
    for d in (A, S, B):
        if not close(d["fractionTaken"], d["fractionRequired"], 1e-12):
            fail("the engine's Treybal fraction differs from the hand ratio")
    if (round(A["N"], 1), round(B["N"], 1), round(B["N_or"], 1)) != (4.3, 4.5, 6.0):
        fail("the engine does not reproduce Perry's printed 4.3 / 4.5 / 6.0")

    # ---------------- (e), (f): the extractor's KPIs and HETS ----------------
    rc, out, err = run(SOLVE, EX3)
    if rc != 0:
        fail(f"extract03 did not run (exit {rc}): {err[-300:]}")
        return report()
    js = result_json(out)
    k = js["kpis"]["extractor01"]
    def flows(name):
        txt = (EX3 / "0" / name).read_text()
        return {m.group(1): float(m.group(2)) for m in
                re.finditer(r"^\s*(\w+)\s+([0-9.eE+-]+) kmol/h;", txt, re.M)}
    feed, solv = flows("feed"), flows("solvent")
    Fc, Sx = feed["water"], solv["methylIsobutylKetone"]
    E = math.sqrt(k["Kp_feedEnd"] * k["Kp_raffinateEnd"]) * Sx / Fc
    if not close(k["E_shortcut"], E, 1e-9):
        fail(f"E_shortcut {k['E_shortcut']} != sqrt(K1 Kr) S/F = {E}")
    raf = js["streams"]["raffinate"]["composition"]
    Xr = raf["aceticAcid"] / raf["water"]
    Nsc = perry_N(feed["aceticAcid"] / Fc, Xr, solv["aceticAcid"] / Sx, k["Kp_raffinateEnd"], E)
    if not close(k["N_shortcut"], Nsc, 1e-9):
        fail(f"N_shortcut {k['N_shortcut']} != recomputed {Nsc}")
    if abs(k["N_shortcut"] - k["stages"]) > 1.0:
        fail(f"the shortcut ({k['N_shortcut']}) is more than one stage from the rigorous {k['stages']}")
    if not close(k["height_m"], k["stages"] * k["hets_m"], 1e-12):
        fail("height_m != stages x hets_m")

    for label, edit in (("hetsSource deleted", lambda t: re.sub(r"\n\s*hetsSource[^\n]*", "", t)),
                        ("hets deleted", lambda t: re.sub(r"\n\s*hets\s+[^\n]*", "", t))):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td) / "e3"
            shutil.copytree(EX3, tmp)
            fs = tmp / "system/flowsheetDict"
            fs.write_text(edit(fs.read_text()))
            rc, out, err = run(SOLVE, tmp)
            msg = out + err
            if rc == 0 or "hets" not in msg:
                fail(f"{label}: expected a refusal naming hets/hetsSource, got exit {rc}")

    # ---------------- (g): source -----------------------------------------
    for src in (EXSRC, OPSRC):
        t = re.sub(r"//[^\n]*|/\*.*?\*/", "", src.read_text(), flags=re.S)
        if not re.search(r"(extractionShortcut|xs)::stages", t):
            fail(f"{src.name} does not call extractionShortcut::stages")
        if re.search(r"std::log\([^)]*\)\s*/\s*std::log\(", t):
            fail(f"{src.name} writes its own Kremser logarithm instead of the one home")
    if "1.0 - 1.0 / E" not in HDR.read_text():
        fail("ExtractionShortcut.H no longer carries Perry's (1 - 1/E) factor")
    return report()


def report():
    if fails:
        print(f"check_extractor_validation: FAILED ({len(fails)} finding(s))")
        return 1
    print("check_extractor_validation: OK -- the lle01 AADs (5 columns, 6 tie lines) recomputed from the "
          "measured data and the model CSV to 1e-9 and pinned, verdict `misses` stated in the header; "
          "Perry Examples 15-1..15-3 (4.3, 4.5, 6.0, E 1.85, 0.251, 0.0016) recomputed and reproduced by "
          "the op, Treybal Eq. (10.38) agreeing at 1e-12; the extractor's N_shortcut/E_shortcut and "
          "height = N x HETS recomputed, 2 HETS refusals fired, source arm.  NOT checked: the shortcut "
          "on a second cascade; any HETS value; stage efficiency; the UNIFAC miss is pinned, not explained.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
