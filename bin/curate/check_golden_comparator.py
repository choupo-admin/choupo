#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the golden comparison has tests of its OWN.

    bin/curate/check_golden_comparator.py

THE REAL DEFECT THIS WOULD HAVE CAUGHT.  An expected value at or below 1e-9
was compared absolutely at the relative tolerance, so 999 rows in 181 cases
could move by any factor and pass (C429, 2026-11-18).  A diffusivity published
8.455e-10 against a golden 7.568e-10 (+11.7 %) was "PASS" for months, and the
suite that guards everything else had no test of the one function every verdict
goes through.  While writing this gate a second defect of the same family was
found in the same function: awk coerces the words `nan` and `inf` to 0, so an
actual `nan` PASSED against an expected 0 or any `abs:` band.

WHAT IT CHECKS.  It runs bin/curate/within_tol.awk -- the ONE file bin/runTests
(within_tol) runs; nothing is extracted into a second implementation, and arm
(f) fails if bin/runTests stops calling that file or grows another comparison
-- on tables of (actual, expected, band, verdict):

  (a) tiny non-zero values (1e-12, 1e-30) moved 1e-3 relative FAIL, 1e-6 PASS;
      the large value (1e12) likewise; the 1e-9 boundary on both sides.
  (b) an expected exactly 0: |actual| against the band, absolute (declared
      `abs:` band, or the plain tolerance read as absolute: the claim an
      exact-0 row has always made).
  (c) negatives and sign flips (-1e-10 against 1e-10 FAIL, whatever the band
      is unless it is as wide as the value).
  (d) NaN and inf in the ACTUAL FAIL always (both signs, both band forms, an
      expected of 0 included); in the EXPECTED, REFUSED; a malformed band is
      REFUSED; an empty actual is MISSING.  A missing row is a verdict of its
      own; an EXTRA row in the actual is not the comparator's business (it has
      one input per EXPECTED row) -- the arm pins that there is one verdict
      per expected row.
  (e) EVERY class of bin/curate/golden_bands.tsv at its edge: the band the
      class prescribes (read from golden_bands.py, never typed here) with the
      actual just inside (0.99 of the band) and just outside (1.01), both
      signs, and the `abs:` token form.  A class added to the table without a
      sample here FAILS the gate.
  (f) the wiring: bin/runTests calls within_tol.awk and carries no `ae > 1e-9`
      floor; the single-shot form (the one runTests uses) and the batch form
      give the same verdict on every table row.

NOT CHECKED: that a given golden's band is the right band (check_golden_bands),
nor that a run's number is right.
"""
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "bin" / "curate"))
import golden_bands as gb  # noqa: E402

AWK = ROOT / "bin" / "curate" / "within_tol.awk"
fails = []
nrows = 0


def batch(rows):
    data = "".join("\t".join(r[:3]) + "\n" for r in rows)
    p = subprocess.run(["awk", "-v", "batch=1", "-f", str(AWK)], input=data,
                       capture_output=True, text=True)
    return p.stdout.split("\n")[:-1]


def single(a, e, t):
    p = subprocess.run(["awk", "-v", f"a={a}", "-v", f"e={e}", "-v", f"t={t}", "-f", str(AWK)])
    return {0: "PASS", 1: "FAIL", 2: "MISSING", 3: "REFUSED"}.get(p.returncode, f"EXIT{p.returncode}")


def run_table(label, rows):
    """rows: (actual, expected, band, verdict, what)"""
    global nrows
    got = batch(rows)
    if len(got) != len(rows):
        fails.append(f"({label}) {len(rows)} rows in, {len(got)} verdicts out (one verdict per expected row)")
        return
    for r, g in zip(rows, got):
        nrows += 1
        if g != r[3]:
            fails.append(f"({label}) actual {r[0]!r} expected {r[1]!r} band {r[2]!r}: {g}, wanted {r[3]} -- {r[4]}")
        s = single(r[0], r[1], r[2])
        if s != g:
            fails.append(f"({label}) single-shot gives {s} but batch gives {g} for {r[:3]}")


def mv(x, f):
    return repr(x * (1 + f))


def arm_a():
    rows = []
    for e in (1e-12, 1e-30, 1e-10, 1e-9, 1.0000001e-9, 1e12, -1e-12):
        for f, v in ((1e-3, "FAIL"), (-1e-3, "FAIL"), (1e-6, "PASS"), (-1e-6, "PASS"), (0.0, "PASS")):
            rows.append((mv(e, f), repr(e), "1e-4", v, f"{e:g} moved {f:+g} relative"))
        rows.append((mv(e, 11.7e-2), repr(e), "1e-4", "FAIL", f"{e:g} moved +11.7 % (the ed08 HTart row)"))
        rows.append((mv(e, 1.0), repr(e), "1e-4", "FAIL", f"{e:g} doubled"))
    rows.append(("8.455e-10", "7.568e-10", "1e-4", "FAIL", "the C429 row itself"))
    rows.append(("7.5681e-10", "7.568e-10", "1e-4", "PASS", "inside"))
    run_table("a", rows)


def arm_b():
    run_table("b", [
        ("1e-12", "0", "abs:1e-9", "PASS", "zero expected, tiny actual, declared abs band"),
        ("2e-9", "0", "abs:1e-9", "FAIL", "zero expected, actual beyond the declared abs band"),
        ("-2e-9", "0", "abs:1e-9", "FAIL", "same, negative"),
        ("1e-12", "0", "1e-4", "PASS", "no abs band: plain tolerance read as absolute, inside"),
        ("1e-3", "0", "1e-4", "FAIL", "no abs band: outside"),
        ("0", "0", "1e-4", "PASS", "zero against zero"),
        ("-0", "0", "1e-4", "PASS", "negative zero"),
        ("0", "0", "abs:0", "PASS", "zero abs band, zero actual"),
        ("1e-300", "0", "abs:0", "FAIL", "zero abs band admits nothing"),
        ("0", "1e-30", "1e-4", "FAIL", "expected tiny non-zero, actual 0: relative 1"),
        ("0", "1e-30", "abs:1e-9", "PASS", "same under a declared abs band"),
    ])


def arm_c():
    run_table("c", [
        ("-1e-10", "1e-10", "1e-4", "FAIL", "sign flip, relative"),
        ("1e-10", "-1e-10", "1e-4", "FAIL", "sign flip, relative, other way"),
        ("-1e-10", "1e-10", "abs:1e-12", "FAIL", "sign flip under an abs band narrower than the value"),
        ("-1e-10", "1e-10", "abs:1e-9", "PASS", "an abs band wider than the move admits it, by declaration"),
        ("-5", "-5", "1e-4", "PASS", "negative equal"),
        ("-5.0004", "-5", "1e-4", "PASS", "negative, 8e-5 relative inside"),
        ("-5.0006", "-5", "1e-4", "FAIL", "negative, 1.2e-4 relative outside"),
    ])


def arm_d():
    rows = []
    for a in ("nan", "NaN", "-nan", "+nan", "inf", "-inf", "+inf", "Infinity", "abc", "1e", "--1"):
        for e, t in (("0", "1e-4"), ("0", "abs:1e-9"), ("1", "0.5"), ("1e-10", "abs:1"), ("-3", "1e-4")):
            rows.append((a, e, t, "FAIL", f"non-finite or non-numeric actual {a!r} against {e} ({t})"))
    for e in ("nan", "inf", "-inf", "NaN", "xyz", "1e"):
        rows.append(("1", e, "1e-4", "REFUSED", f"expected {e!r} cannot be pinned"))
        rows.append(("nan", e, "1e-4", "REFUSED", f"expected {e!r}, refused before the actual is read"))
    rows += [("1", "1", "abs:", "REFUSED", "empty abs token"),
             ("1", "1", "abs:x", "REFUSED", "malformed abs token"),
             ("1", "1", "", "REFUSED", "empty band"),
             ("1", "1", "tight", "REFUSED", "word as band"),
             ("", "1", "1e-4", "MISSING", "row missing from the actual"),
             ("", "0", "abs:1", "MISSING", "missing, zero expected"),
             ("", "1e-30", "1e-4", "MISSING", "missing, tiny expected")]
    run_table("d", rows)


# one sample row per class: (class, kind, name, key, expected, extra golden rows for the band's term)
SAMPLES = [
    ("count", "diag", "t", "evaluations", "100", []),
    ("condition", "diag", "t", "cond_JtJ", "1e4", []),
    ("parameter", "diag", "fit_x", "A", "1.5", []),
    ("objective", "diag", "t", "chi2", "3.2", []),
    ("residual_boundary", "boundary", "global", "residual_kW", "1e-7", []),
    ("residual_hx", "kpi", "hx1", "H_closure_gap_kW", "1e-9", [("kpi", "hx1", "Q_kW", "1000")]),
    ("residual_ledger", "kpi", "led1", "energy_residual_kJ", "1e-6", [("kpi", "led1", "energy_kJ_initial", "1e6")]),
    ("residual_closure", "kpi", "t", "mass_closure_rel", "2e-12", []),
    ("residual_energy_closure", "kpi", "t", "energy_closure_rel", "2e-7", []),
    ("residual_mass_abs", "kpi", "t", "mass_residual_kg", "1e-10", []),
    ("residual_charge", "diag", "t", "chargeResidual", "3e-13", []),
    ("residual_pore", "diag", "t", "poreResidual_p1", "1e-12", []),
    ("residual_newton", "kpi", "t", "newtonResidual", "1e-13", []),
    ("residual_identity", "diag", "t", "worst_rel_err", "1e-12", []),
    ("residual_saturation", "diag", "t", "SI_calcite", "1e-12", []),
    ("zero_balance", "kpi", "t", "carrier_fabricated_mol", "1e-12", []),
    ("zero_pressure_drop", "kpi", "t", "deltaP_first_to_out_Pa", "1e-9", []),
    ("zero_duty", "kpi", "t", "Q_kW", "1e-7", []),
    ("zero_dH", "kpi", "t", "energy_dH_vessels_kJ", "4e-7", []),
    # the abs_if_tiny classes leave a row of real size on the band it carries
    ("zero_duty", "kpi", "t", "Q_kW", "5", []),
]


def band_of(cls, kind, name, key, e, extra):
    rows = [(k, n, ky, v) for (k, n, ky, v) in extra] + [(kind, name, key, e)]
    text = "".join(f"{k} {n} {ky} {v} 1e-12\n" for (k, n, ky, v) in rows)
    new, _, skipped = gb.apply_text(text, None, ("all",))
    for line in new.split("\n"):
        t = line.split()
        if len(t) >= 5 and (t[0], t[1], t[2]) == (kind, name, key):
            return t[4]
    return None


def arm_e():
    table_classes = {c.name for c in gb.classes() if c.rule != "none"}
    sampled = {s[0] for s in SAMPLES}
    for missing in sorted(table_classes - sampled):
        fails.append(f"(e) class {missing} of golden_bands.tsv has no edge sample in this gate")
    for stale in sorted(sampled - table_classes):
        fails.append(f"(e) the gate samples class {stale}, which golden_bands.tsv no longer has")
    rows = []
    for cls, kind, name, key, e, extra in SAMPLES:
        c = gb.classify(kind, name, key)
        if c is None or c.name != cls:
            fails.append(f"(e) the sample {kind} {name} {key} classifies as {c.name if c else None}, not {cls}")
            continue
        tol = band_of(cls, kind, name, key, e, extra)
        if tol is None:
            fails.append(f"(e) class {cls}: the sample row vanished from apply_text")
            continue
        ev = float(e)
        if tol.startswith("abs:"):
            b = float(tol[4:])
            if b <= 0:
                fails.append(f"(e) class {cls}: a non-positive abs band {tol}")
                continue
            for sgn in (+1, -1):
                rows.append((repr(ev + sgn * 0.99 * b), repr(ev), tol, "PASS", f"{cls} abs just inside ({sgn:+d})"))
                rows.append((repr(ev + sgn * 1.01 * b), repr(ev), tol, "FAIL", f"{cls} abs just outside ({sgn:+d})"))
            # an abs band never reads relatively: a move 1e6 x the value but inside the band passes
            rows.append((repr(ev + 0.5 * b), repr(ev), tol, "PASS", f"{cls} abs is absolute whatever |e| is"))
        else:
            b = float(tol)
            for sgn in (+1, -1):
                rows.append((repr(ev * (1 + sgn * 0.99 * b)), repr(ev), tol, "PASS", f"{cls} rel just inside ({sgn:+d})"))
                rows.append((repr(ev * (1 + sgn * 1.01 * b)), repr(ev), tol, "FAIL", f"{cls} rel just outside ({sgn:+d})"))
    # the abs: token form, hand-written
    rows += [("1.0000000009", "1", "abs:1e-9", "PASS", "abs: token, inside"),
             ("1.000000002", "1", "abs:1e-9", "FAIL", "abs: token, outside"),
             ("1e-30", "1e-31", "abs:1e-9", "PASS", "abs: a factor 10 move on a tiny value is inside"),
             ("1e12", "1e12", "abs:1", "PASS", "abs: large, equal"),
             ("1000000000001.5", "1e12", "abs:1", "FAIL", "abs: large, outside")]
    run_table("e", rows)


def arm_f():
    rt = (ROOT / "bin" / "runTests").read_text()
    m = re.search(r"\nwithin_tol\(\) \{\n(.*?)\n\}\n", rt, re.S)
    if not m or "within_tol.awk" not in m.group(1):
        fails.append("(f) bin/runTests within_tol() does not run bin/curate/within_tol.awk")
    elif re.search(r"\bae\b|diff", m.group(1)):
        fails.append("(f) bin/runTests within_tol() carries comparison arithmetic of its own")
    if re.search(r"ae\s*>\s*1e-9", re.sub(r"(?m)^\s*#.*$", "", rt)):
        fails.append("(f) bin/runTests carries the `ae > 1e-9` floor of the C429 defect")
    if "ae > 1e-9" in AWK.read_text() or "1e-9" in re.sub(r"#.*", "", AWK.read_text()):
        fails.append("(f) within_tol.awk carries a numeric floor")


def main():
    if not AWK.is_file():
        print(f"check_golden_comparator: FAILED\n  {AWK} is missing: no comparison to test")
        return 1
    arm_a(); arm_b(); arm_c(); arm_d(); arm_e(); arm_f()
    if nrows < 200:
        fails.append(f"only {nrows} table rows ran (a gate over nothing passes nothing)")
    if fails:
        print("check_golden_comparator: FAILED")
        for f in fails:
            print("  " + f)
        return 1
    print(f"check_golden_comparator: OK -- bin/curate/within_tol.awk, the one file bin/runTests runs, gives "
          f"the wanted verdict on {nrows} table rows: tiny, large and boundary values moved 1e-3 and 1e-6 relative, "
          "exact-zero expecteds, sign flips, NaN/inf/non-numbers in the actual (FAIL) and the expected (REFUSED), "
          "missing rows, malformed bands, and every class of golden_bands.tsv just inside and just outside its "
          "band.  NOT CHECKED: that a golden's band is the right one (check_golden_bands) or that a run's "
          "number is right.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
