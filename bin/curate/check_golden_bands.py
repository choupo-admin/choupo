#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: a golden's two claims hold -- the closure residuals carry their
ABSOLUTE band on disk, every row has a class, and the comparator behaves in each
form and in each mode.

    bin/curate/check_golden_bands.py

WHY THIS EXISTS (C384, 2026-11-13).  A golden is TWO CLAIMS.  On the platform
that recorded it: "this has not moved" -- the band written in the file, tight.
On another platform: "this reproduces as well as this kind of number can" -- the
file passed through ONE table, bin/curate/golden_bands.tsv, in a temporary
stream never written to the tree.  The CI runner disagreed with the maintainer's
machine on 2763 rows of the nightly sweep (counts of evaluations, condition
numbers, optimiser answers, closure residuals), every one of which equals its
golden on the recording platform.  Only the closure residuals are written on
disk in their class form, because their meaning is absolute on any platform.

WHAT IT CHECKS, over every `expected*` file of tutorials/ and data/:

  (a) EVERY ROW HAS A CLASS.  The table's last line is the `direct` class, so
      nothing escapes classification; a table that stops covering a row fails.
  (b) RESIDUALS ON DISK.  A `boundary global residual_kW`, `kpi <unit>
      H_closure_gap_kW` or `kpi <ledger> energy_residual_kJ` row carries the
      ABSOLUTE form (`abs:<v>`), never a relative band, never below the 1e-9
      floor; and where the term of its band can be read (the unit's Q_kW or the
      ledger's energy terms in the SAME golden, or `residual_denom_kW` from the
      suite's cached output, CHOUPO_SUITE_OUTPUTS) the band equals the
      prescribed fraction of it (to 1 %).  Boundary rows with no cached output
      are held to their form only, and the count is printed.
  (c) THE TRANSFORMATION, as behaviour: passed through the table, a count row
      becomes 2.0, a condition number 2.0, an optimiser objective 1e-2 and a
      fitted parameter 5e-2; a direct result, an `exact` row and an anchor are
      left alone; a row already looser is never tightened.
  (d) THE COMPARATOR, in each form AND each mode.  `bin/runTests` is run on
      copies of two small cases with CHOUPO_GOLDEN_MODE forced: a wrong value
      FAILS and a right one PASSES in the relative form, the `abs:` form and the
      `exact` form (strict and cross); and a count/objective row off by a factor
      FAILS in strict mode and PASSES in cross mode, while one off by ten times
      still FAILS in cross mode.
  (e) THE GATE'S OWN CHECKER rejects a residual with a relative band, a wrong
      absolute value and a band under the floor.

NOT CHECKED: that a class's band is physically right (the table carries the
measurement it rests on); that direct rows are tight; anchor and `exact` rows.

    reads: bin/curate/golden_bands.tsv bin/curate/golden_bands.py bin/runTests
    reads: bin/curate/recording_platform.txt tutorials/ data/curation/
"""
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import golden_bands as gb  # noqa: E402

ROOT = gb.ROOT
NAME = "check_golden_bands"


def cache_block(golden):
    d = os.environ.get("CHOUPO_SUITE_OUTPUTS")
    if not d or golden.name != "expected":
        return None
    key = str(golden.parent.relative_to(ROOT)).replace("/", "__") + ".out"
    f = Path(d) / key
    return f.read_text(errors="replace") if f.is_file() else None


def check_text(text, label, block=None):
    """(violations, rows held on form alone) for one golden's text."""
    bad = []
    form_only = 0
    gv = gb.golden_values(text)
    for _, toks in gb.parse_rows(text):
        kind, name, key, _, tol = (t[0] for t in toks[:5])
        claim = toks[5][0] if len(toks) > 5 else ""
        cls = gb.classify(kind, name, key)
        if cls is None:
            bad.append(f"{label}: {kind} {name} {key} belongs to no class of the table")
            continue
        if cls.group not in ("residual", "zero") or claim == "anchor" or tol == "exact":
            continue
        row = f"{label}: {kind} {name} {key}"
        if cls.rule in ("abs", "abs_if_tiny"):
            #  C429: an `abs` class puts every NON-ZERO row of its keys on the absolute
            #  band max(param, 1e-4 x |e|) (abs_if_tiny: abs:param, only a row recorded at
            #  round-off); an expected 0 keeps the absolute band it was authored with.
            want, why = gb.prescribed(cls, kind, name, key, gv, block, toks[3][0])
            if want is None:
                continue
            if not tol.startswith("abs:"):
                bad.append(f"{row} is a round-off quantity of class {cls.name} banded {tol}: its band must be the "
                           f"ABSOLUTE {want} (a relative band on a residual is the C429 blindness in reverse)")
                continue
            try:
                v = float(tol[4:])
            except ValueError:
                bad.append(f"{row}: band {tol} is not abs:<number>")
                continue
            wv = float(want[4:])
            if abs(v - wv) > 0.01 * wv:
                bad.append(f"{row}: band {tol} but class {cls.name} prescribes {want}")
            continue
        if not tol.startswith("abs:"):
            bad.append(f"{row} is a closure residual ({cls.name}) banded {tol}: a residual is compared on an "
                       f"ABSOLUTE band written in the row (abs:<v>), never a relative one")
            continue
        try:
            v = float(tol[4:])
        except ValueError:
            bad.append(f"{row}: band {tol} is not abs:<number>")
            continue
        if v < gb.FLOOR * (1 - 1e-9):
            bad.append(f"{row}: absolute band {v:g} is below the 1e-9 floor")
            continue
        want, why = gb.prescribed(cls, kind, name, key, gv, block, toks[3][0])
        term_known = want is not None and not (cls.name == "residual_boundary"
                                               and gb.boundary_denominator(block) is None)
        if not term_known:
            form_only += 1
            if cls.name == "residual_boundary" and block is None:
                continue
            if cls.name == "residual_boundary":
                if want != tol:
                    bad.append(f"{row}: no residual_denom_kW is published, so the band is {want}; the row has {tol}")
                continue
            bad.append(f"{row}: the term of its band cannot be read ({why})")
            continue
        wv = float(want[4:])
        if abs(v - wv) > 0.01 * wv:
            bad.append(f"{row}: band {tol} but the class prescribes {want}")
    return bad, form_only


def arm_checker():
    """(e) the checker rejects what it must."""
    problems = []
    good = ("kpi     unit    Q_kW                  1000             1e-4\n"
            "kpi     unit    H_closure_gap_kW      1e-9             abs:1e-05\n"
            "boundary global residual_kW           0.5              abs:0.001\n")
    bad, _ = check_text(good, "synthetic-good", None)
    if bad:
        problems.append("the checker rejects the prescribed forms: " + "; ".join(bad))
    bad, _ = check_text(good.replace("abs:1e-05", "1e-4"), "synthetic-residual", None)
    if not any("ABSOLUTE band" in b for b in bad):
        problems.append("a residual row with a relative band was NOT rejected")
    bad, _ = check_text(good.replace("abs:1e-05", "abs:1e-03"), "synthetic-value", None)
    if not any("prescribes" in b for b in bad):
        problems.append("an absolute band of the wrong value was NOT rejected")
    bad, _ = check_text(good.replace("abs:1e-05", "abs:1e-12"), "synthetic-floor", None)
    if not any("floor" in b for b in bad):
        problems.append("an absolute band below the 1e-9 floor was NOT rejected")
    return problems


def arm_transformation():
    """(c) the cross-platform transformation."""
    src = ("diag    fit_x    iter                 42             1e-4\n"
           "diag    fit_x    minimax_evaluations  400            1e-4\n"
           "diag    fit_x    cond_JtJ             300            1e-4\n"
           "diag    fit_x    chi2                 0.5            1e-4\n"
           "diag    fit_antoine B                 3000           1e-4\n"
           "kpi     flash    V_over_F             0.3            1e-4\n"
           "ledger  reactor  energy.valid         valid          exact\n"
           "diag    fit_y    iter                 9              1e-4  anchor\n"
           "diag    fit_x    rms                  0.3            0.5\n")
    new, _, _ = gb.apply_text(src, None, ("platform",))
    rows = {(t[1][0], t[2][0], t[0][0]): t[4][0] for _, t in gb.parse_rows(new)}
    want = [(("fit_x", "iter", "diag"), "2", "a count row"),
            (("fit_x", "minimax_evaluations", "diag"), "2", "a count row"),
            (("fit_x", "cond_JtJ", "diag"), "2", "a condition number"),
            (("fit_x", "chi2", "diag"), "0.01", "an objective"),
            (("fit_antoine", "B", "diag"), "0.05", "a fitted parameter"),
            (("flash", "V_over_F", "kpi"), "1e-4", "a direct result (left alone)"),
            (("reactor", "energy.valid", "ledger"), "exact", "an exact row (left alone)")]
    problems = []
    for k, w, what in want:
        if rows.get(k) != w:
            problems.append(f"transformation: {what} {k} became {rows.get(k)}, expected {w}")
    if rows.get(("fit_x", "rms", "diag")) != "0.5":
        problems.append("transformation tightened a row that was already looser (0.5 -> %s)" % rows.get(("fit_x", "rms", "diag")))
    anchor_line = [l for l in new.split("\n") if l.endswith("anchor")][0]
    if "1e-4" not in anchor_line:
        problems.append("transformation touched an anchor row")
    return problems


def arm_blind():
    """(f) C429: the checker is not blind below 1e-9.  (1) each class matches the rows it
    claims and nothing else; (2) the class table puts round-off rows on an absolute band and
    leaves physical rows relative; (3) the comparator itself (`within_tol`, cut out of
    bin/runTests) judges a non-zero value below 1e-9 relatively.  -> problems"""
    problems = []
    claims = [  # (kind, name, key, the class it must be in)
        ("kpi", "campaign", "mass_closure_rel", "residual_closure"),
        ("kpi", "campaign", "element_C_closure_rel", "residual_closure"),
        ("kpi", "NF", "kpi_solute_closure_rel_final", "residual_closure"),
        ("kpi", "cyclone", "fluidMassClosure", "residual_closure"),
        ("kpi", "plant", "mass_residual_kg", "residual_mass_abs"),
        ("diag", "tris_half", "chargeResidual", "residual_charge"),
        ("diag", "monovalentWater", "poreResidual_p2", "residual_pore"),
        ("diag", "monovalentWater", "poreCurrent_p1", "residual_pore"),
        ("diag", "monovalentWater", "permeateCharge_max", "residual_pore"),
        ("kpi", "CSTR", "newtonResidual", "residual_newton"),
        ("diag", "thiele", "newton_residual", "residual_newton"),
        ("diag", "h_identity", "water_kirchhoff_rel", "residual_identity"),
        ("diag", "h_identity", "worst_rel_err", "residual_identity"),
        ("kpi", "bed", "mass_closure_CO2", "residual_identity"),
        ("diag", "calciteEq_25C", "SI_calcite", "residual_saturation"),
        ("kpi", "bed", "carrier_fabricated_mol", "zero_balance"),
        ("kpi", "bed", "carrier_makeup_rel", "zero_balance"),
        ("kpi", "bed", "deltaP_first_to_out_Pa", "zero_pressure_drop"),
        ("kpi", "bed", "Q_kW", "zero_duty"),
        ("boundary", "global", "Q_boundary_kW", "zero_duty"),
        ("closure", "flash", "remaining_kW", "zero_duty")]
    for kind, name, key, want in claims:
        c = gb.classify(kind, name, key)
        if c is None or c.name != want:
            problems.append(f"blind arm: {kind} {name} {key} is in class {c.name if c else None}, expected {want}")
    physical = [("kpi", "ED", "D_ion_HTart"), ("kpi", "ED", "D_ion_Mg"), ("kpi", "u", "D_eff"),
                ("diag", "carb", "m_CO3"), ("diag", "carb", "Robs_Br_p1"), ("diag", "membrane", "c_porePerm_Cl_pN"),
                ("diag", "membrane", "poreTolerance"), ("kpi", "col", "y_CHN"), ("kpi", "bed", "n_H_final"),
                ("diag", "membrane", "partitionPerm_SON_pN"), ("diag", "carb", "pH"),
                ("kpi", "bed", "closure_worst_abs_nope")]
    for kind, name, key in physical:
        c = gb.classify(kind, name, key)
        if c is not None and c.name != "direct":
            problems.append(f"blind arm: the physical row {kind} {name} {key} is caught by class {c.name}: "
                            "a residual class must match residuals by name and by meaning, nothing else")
    src = ("kpi     ED      D_ion_HTart          7.568e-10        1e-4\n"
           "kpi     campaign mass_closure_rel    4.5e-16          1e-4\n"
           "kpi     campaign mass_closure_rel    3e-3             1e-4\n"
           "kpi     campaign mass_closure_rel    0                1e-3\n"
           "kpi     bed     Q_kW                 7.3e-12          1e-4\n"
           "kpi     bed     Q_kW                 1500             1e-4\n"
           "kpi     bed     Q_kW                 0                1e-4\n")
    new, _, _ = gb.apply_text(src, None, ("residual", "zero"))
    got = [t[4][0] for _, t in gb.parse_rows(new)]
    want = ["1e-4", "abs:1e-09", "abs:3e-07", "1e-3", "abs:0.0001", "1e-4", "1e-4"]
    if got != want:
        problems.append(f"blind arm: apply gave {got}, expected {want} (physical row relative; round-off closure absolute "
                        "and never tighter than 1e-4 relative; a duty of real size and an expected 0 untouched)")
    rejected, _ = check_text(new, "synthetic-blind", None)
    if rejected:
        problems.append("blind arm: the checker rejects the prescribed absolute forms: " + "; ".join(rejected))
    bad, _ = check_text(src, "synthetic-relative", None)
    if not any("round-off quantity" in b for b in bad):
        problems.append("blind arm: a round-off row left on a RELATIVE band was NOT rejected")
    # (3) the comparator, cut out of bin/runTests
    text = (ROOT / "bin" / "runTests").read_text()
    i = text.index("\nwithin_tol() {")
    j = text.index("\n}\n", i)
    fn = text[i:j + 3]
    cases = [("8.455e-10", "7.568e-10", "1e-4", 1, "physical 7.568e-10 published as 8.455e-10: FAIL"),
             ("7.5681e-10", "7.568e-10", "1e-4", 0, "physical value inside its relative band: PASS"),
             ("5e-5", "0", "1e-4", 0, "expected 0 stays absolute: inside"),
             ("2e-4", "0", "1e-4", 1, "expected 0 stays absolute: outside"),
             ("2e-13", "1e-13", "abs:1e-9", 0, "abs: band, round-off moved inside it"),
             ("2e-8", "1e-13", "abs:1e-9", 1, "abs: band, round-off moved beyond it"),
             ("1e-14", "1e-17", "1e-4", 1, "round-off on a RELATIVE band is judged relatively now: FAIL")]
    for a, e, t, want_rc, what in cases:
        r = subprocess.run(["bash", "-c", fn + f'\nwithin_tol "{a}" "{e}" "{t}"; echo $?'],
                           capture_output=True, text=True, env=dict(os.environ, ROOT=str(ROOT)))
        rc = int((r.stdout.strip().splitlines() or ["99"])[-1])
        if rc != want_rc:
            problems.append(f"blind arm: within_tol {a} vs {e} band {t} ({what}) exited {rc}, expected {want_rc}")
    return problems


def run_tests_on(case_dir, mode):
    env = dict(os.environ)
    env["CHOUPO_HOME"] = str(ROOT)
    env["CHOUPO_GOLDEN_MODE"] = mode
    p = subprocess.run([str(ROOT / "bin" / "runTests"), str(case_dir)], capture_output=True,
                       text=True, cwd=str(ROOT), env=env, timeout=900)
    return p.returncode, p.stdout + p.stderr


def arm_comparator():
    """(d) forms x modes, and the platform-class rows between modes.  -> (problems, runs)"""
    problems = []
    runs = 0
    for exe in ("choupoBatch", "choupoProps"):
        if not (ROOT / exe).exists():
            return [f"{exe} is not built: the comparator arms cannot run (a gate that cannot run does not pass)"], 0
    srcs = {"batch": ROOT / "tutorials" / "batch" / "reactor" / "batch01_first_order",
            "fit": ROOT / "tutorials" / "props" / "curation" / "curate03_thermoml_fixture_bubble"}
    base = {k: (v / "expected").read_text() for k, v in srcs.items()}
    qrow = [l for l in base["batch"].split("\n") if l.startswith("kpi") and "energy_Q_ledger_kJ" in l]
    wrow = [l for l in base["batch"].split("\n") if l.endswith(" exact") and l.startswith("ledger")]
    irow = [l for l in base["fit"].split("\n") if l.split()[2:3] == ["iter"] and l.startswith("diag")]
    crow = [l for l in base["fit"].split("\n") if l.split()[2:3] == ["chi2"] and l.startswith("diag")]
    if not (qrow and wrow and irow and crow):
        return ["the two witness cases no longer carry the rows these arms edit: re-point them"], 0
    qrow, wrow, irow, crow = qrow[0], wrow[0], irow[0], crow[0]
    qv = float(qrow.split()[3])
    iv = float(irow.split()[3])
    cv = float(crow.split()[3])
    with tempfile.TemporaryDirectory(prefix="gb_arm_") as tmp:
        d = {}
        for k, src in srcs.items():
            d[k] = Path(tmp) / k
            # C421 exception: the copy is handed to a nested bin/runTests (the comparator arms); tried through case_records.copytree on 2026-11-17 and the gate FAILED (8 arms expected PASS and runTests exited 1 on the materialised copy), so the plain copy stays.
            shutil.copytree(src, d[k], ignore=shutil.ignore_patterns("reports", "converged", "iterations", "expected",
                                                                     "postProcessing", "fit_history*", "parity*"))

        def attempt(which, label, mode, edits, want_pass):
            nonlocal runs
            text = base[which]
            for old, new in edits:
                text = text.replace(old, new)
            (d[which] / "expected").write_text(text)
            rc, out = run_tests_on(d[which], mode)
            runs += 1
            if (rc == 0) != want_pass:
                problems.append(f"{label} [{mode}]: expected {'PASS' if want_pass else 'FAIL'}, runTests exited {rc}; "
                                "last lines: " + " | ".join(out.strip().splitlines()[-4:])[:500])

        k = qrow.split()
        mk = lambda v, t: f"{k[0]} {k[1]} {k[2]} {v:.12g} {t}"
        w = wrow.split()
        wrong_word = " ".join(w[:3] + ["not-the-word"] + w[4:])
        for mode in ("strict", "cross"):
            attempt("batch", "relative, right value", mode, [(qrow, mk(qv, "1e-4"))], True)
            attempt("batch", "relative, wrong value", mode, [(qrow, mk(qv * 1.01, "1e-4"))], False)
            attempt("batch", "abs:, inside the band", mode, [(qrow, mk(qv * 1.01, f"abs:{abs(qv) * 0.02:.6g}"))], True)
            attempt("batch", "abs:, outside the band", mode, [(qrow, mk(qv * 1.01, f"abs:{abs(qv) * 0.005:.6g}"))], False)
            attempt("batch", "exact, right word", mode, [], True)
            attempt("batch", "exact, wrong word", mode, [(wrow, wrong_word)], False)
        # the platform classes between the modes: a count and an objective
        ik, ck = irow.split(), crow.split()
        mki = lambda v: f"{ik[0]} {ik[1]} {ik[2]} {v:.12g} {ik[4]}"
        mkc = lambda v: f"{ck[0]} {ck[1]} {ck[2]} {v:.12g} {ck[4]}"
        attempt("fit", "count 2x off", "strict", [(irow, mki(iv / 2))], False)
        attempt("fit", "count 2x off", "cross", [(irow, mki(iv / 2))], True)
        attempt("fit", "count 10x off", "cross", [(irow, mki(iv / 10))], False)
        attempt("fit", "objective 0.5 % off", "strict", [(crow, mkc(cv * 1.005))], False)
        attempt("fit", "objective 0.5 % off", "cross", [(crow, mkc(cv * 1.005))], True)
        attempt("fit", "objective 10 % off", "cross", [(crow, mkc(cv * 1.10))], False)
    return problems, runs


def main():
    problems = []
    problems += arm_checker()
    problems += arm_transformation()
    problems += arm_blind()
    cmp_problems, n_cmp = arm_comparator()
    problems += cmp_problems
    n_rows = n_form_only = 0
    per_class = {}
    for g in gb.goldens():
        text = g.read_text()
        label = str(g.relative_to(ROOT))
        bad, form_only = check_text(text, label, cache_block(g))
        problems += bad
        n_form_only += form_only
        for _, toks in gb.parse_rows(text):
            c = gb.classify(toks[0][0], toks[1][0], toks[2][0])
            if c is not None:
                n_rows += 1
                per_class[c.name] = per_class.get(c.name, 0) + 1
    if n_rows == 0:
        problems.append("no golden row was read: the table or the corpus is not being read")
    if problems:
        print(f"{NAME}: FAIL -- {len(problems)} problem(s):")
        for p in problems[:60]:
            print("  - " + p)
        if len(problems) > 60:
            print(f"  ... and {len(problems) - 60} more")
        return 1
    res = sum(v for k, v in per_class.items() if k.startswith("residual_"))
    print(f"{NAME}: OK -- all {n_rows} golden row(s) have a class ({', '.join(f'{k} {v}' for k, v in sorted(per_class.items()))}); "
          f"the {res} closure-residual row(s) carry the absolute form on disk ({n_form_only} boundary row(s) on FORM alone, "
          f"no cached output carried the term); the cross-platform transformation gives a count 2.0, a condition number 2.0, "
          f"an objective 1e-2 and a parameter 5e-2 and leaves direct, exact and anchor rows alone; the comparator failed a "
          f"wrong value and passed a right one in the relative, abs: and exact forms, strict and cross, and a count and an "
          f"objective off by a factor failed strict, passed cross and failed cross at ten times ({n_cmp} runs).  "
          f"NOT CHECKED: that a band is physically right, that direct rows are tight, anchor and exact rows.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
