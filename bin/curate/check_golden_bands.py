#!/usr/bin/env python3
"""Gate: every golden row's band is the one its CLASS prescribes, and the
comparator fails a wrong value in each of the three forms of the column.

    bin/curate/check_golden_bands.py

WHY THIS EXISTS (C384, 2026-11-13).  The goldens pinned every number at a
relative 1e-4.  A second platform cannot reproduce that for a count of
evaluations (decided by a 1e-6 comparison on a max-norm objective), a condition
number, a fitted parameter or the round-off residual of a closure: the CI
runner disagreed on 2763 rows of the nightly sweep while every one of them
equals its golden on the maintainer's machine.  A band is therefore chosen by
WHAT KIND OF NUMBER the row holds, in one table (bin/curate/golden_bands.tsv),
and this gate holds the table against the corpus.

WHAT IT CHECKS, over every `expected*` file of tutorials/ and data/:

  (a) FORM.  A row of a class has the band its class prescribes: a count or a
      condition number is not left at 1e-4 by hand; an optimiser's answer is
      not left tighter than its stopping tolerance; a closure RESIDUAL
      (boundary residual_kW, kpi H_closure_gap_kW, kpi energy_residual_kJ)
      carries an ABSOLUTE band (`abs:<v>`), never a relative one, and never
      below the 1e-9 floor.
  (b) VALUE.  Where the term of an absolute band can be read -- the unit's
      Q_kW or the ledger's energy terms in the SAME golden, or the
      `residual_denom_kW` of the suite's cached output (CHOUPO_SUITE_OUTPUTS)
      -- the band equals the prescribed fraction of it (to 1 %).  Without a
      cached output a boundary row is held to its form only, and the number of
      rows held on form alone is printed.
  (c) THE COMPARATOR.  Three arms run `bin/runTests` on a copy of a small case
      with a wrong value in a relative row, an `abs:` row and an `exact` row:
      each must FAIL, and each must PASS with the right value.
  (d) SELF-TEST OF THE GATE.  The same checker is fed synthetic goldens and
      must reject a count row hand-pinned at 1e-4 and a residual row with a
      relative band, and accept the prescribed forms.

NOT CHECKED: that a class's band is physically right (the table carries the
measurement it rests on); rows of no class (direct results keep whatever band
their case authored); anchor and `exact` rows.

    reads: bin/curate/golden_bands.tsv bin/curate/golden_bands.py bin/runTests
    reads: tutorials/ data/curation/
"""
import os
import re
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
    """Violations of one golden's text; also returns the count of rows judged on form alone."""
    bad = []
    form_only = 0
    gv = gb.golden_values(text)
    for _, toks in gb.parse_rows(text):
        kind, name, key, _, tol = (t[0] for t in toks[:5])
        claim = toks[5][0] if len(toks) > 5 else ""
        if claim == "anchor" or tol == "exact":
            continue
        cls = gb.classify(kind, name, key)
        if cls is None:
            continue
        row = f"{label}: {kind} {name} {key}"
        if cls.rule == "rel":
            try:
                ok = abs(float(tol) - cls.param) <= 1e-9 * max(1.0, cls.param)
            except ValueError:
                ok = False
            if not ok:
                bad.append(f"{row} is a {cls.name} row banded {tol}; the class prescribes {cls.param:g}")
            continue
        # an absolute class
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


def all_goldens():
    return gb.goldens()


def arm_synthetic():
    """(d) the checker must reject and accept the right things."""
    problems = []
    good = ("kpi     unit    Q_kW                  1000             1e-4\n"
            "kpi     unit    H_closure_gap_kW      1e-9             abs:1e-05\n"
            "diag    fit_x   minimax_evaluations   400              2\n"
            "diag    fit_x   cond_JtJ              300              2\n"
            "boundary global residual_kW           0.5              abs:0.001\n")
    bad, _ = check_text(good, "synthetic-good", None)
    if bad:
        problems.append("the checker rejects the prescribed forms: " + "; ".join(bad))
    count_by_hand = good.replace("minimax_evaluations   400              2", "minimax_evaluations   400              1e-4")
    bad, _ = check_text(count_by_hand, "synthetic-count", None)
    if not any("minimax_evaluations" in b for b in bad):
        problems.append("a count row hand-pinned at 1e-4 was NOT rejected")
    rel_resid = good.replace("abs:1e-05", "1e-4")
    bad, _ = check_text(rel_resid, "synthetic-residual", None)
    if not any("ABSOLUTE band" in b for b in bad):
        problems.append("a residual row with a relative band was NOT rejected")
    wrong_value = good.replace("abs:1e-05", "abs:1e-03")
    bad, _ = check_text(wrong_value, "synthetic-value", None)
    if not any("prescribes" in b for b in bad):
        problems.append("an absolute band of the wrong value was NOT rejected")
    under_floor = good.replace("abs:1e-05", "abs:1e-12")
    bad, _ = check_text(under_floor, "synthetic-floor", None)
    if not any("floor" in b for b in bad):
        problems.append("an absolute band below the 1e-9 floor was NOT rejected")
    return problems


def run_tests_on(case_dir):
    env = dict(os.environ)
    env["CHOUPO_HOME"] = str(ROOT)
    p = subprocess.run([str(ROOT / "bin" / "runTests"), str(case_dir)], capture_output=True,
                       text=True, cwd=str(ROOT), env=env, timeout=900)
    return p.returncode, p.stdout + p.stderr


def arm_comparator():
    """(c) a wrong value fails, a right value passes, in each of the three forms."""
    problems = []
    src = ROOT / "tutorials" / "batch" / "reactor" / "batch01_first_order"
    if not (ROOT / "choupoBatch").exists():
        return ["choupoBatch is not built: the comparator arms cannot run (a gate that cannot run does not pass)"], 0
    base = (src / "expected").read_text()
    rows = [l for l in base.split("\n") if l.startswith("kpi") and "energy_Q_ledger_kJ" in l]
    word = [l for l in base.split("\n") if l.endswith(" exact") and l.startswith("ledger")]
    if not rows or not word:
        return ["batch01_first_order no longer carries a numeric kpi row and an exact row: re-point this arm"], 0
    qrow, wrow = rows[0], word[0]
    qv = float(qrow.split()[3])
    with tempfile.TemporaryDirectory(prefix="gb_arm_") as tmp:
        d = Path(tmp) / "probe"
        shutil.copytree(src, d, ignore=shutil.ignore_patterns("reports", "converged", "iterations", "expected"))

        def attempt(label, new_q_row, new_w_row, want_pass):
            text = base.replace(qrow, new_q_row).replace(wrow, new_w_row)
            (d / "expected").write_text(text)
            rc, out = run_tests_on(d)
            ok = (rc == 0)
            if ok != want_pass:
                problems.append(f"{label}: expected {'PASS' if want_pass else 'FAIL'}, runTests exited {rc}; last lines: "
                                + " | ".join(out.strip().splitlines()[-4:])[:600])
            return out

        k = qrow.split()
        mk = lambda v, t: f"{k[0]} {k[1]} {k[2]} {v:.12g} {t}"
        # relative form
        attempt("relative, right value", mk(qv, "1e-4"), wrow, True)
        attempt("relative, wrong value", mk(qv * 1.01, "1e-4"), wrow, False)
        # absolute form
        attempt("abs:, inside the band", mk(qv * 1.01, f"abs:{abs(qv) * 0.02:.6g}"), wrow, True)
        attempt("abs:, outside the band", mk(qv * 1.01, f"abs:{abs(qv) * 0.005:.6g}"), wrow, False)
        # exact form
        w = wrow.split()
        wrong_word = " ".join(w[:3] + ["not-the-word"] + w[4:])
        attempt("exact, right word", qrow, wrow, True)
        attempt("exact, wrong word", qrow, wrong_word, False)
    return problems, 6


def main():
    problems = []
    problems += arm_synthetic()
    cmp_problems, n_cmp = arm_comparator()
    problems += cmp_problems
    n_rows = n_form_only = n_abs = 0
    per_class = {}
    for g in all_goldens():
        text = g.read_text()
        label = str(g.relative_to(ROOT))
        block = cache_block(g)
        bad, form_only = check_text(text, label, block)
        problems += bad
        n_form_only += form_only
        for _, toks in gb.parse_rows(text):
            kind, name, key, _, tol = (t[0] for t in toks[:5])
            claim = toks[5][0] if len(toks) > 5 else ""
            if claim == "anchor" or tol == "exact":
                continue
            c = gb.classify(kind, name, key)
            if c is not None:
                n_rows += 1
                per_class[c.name] = per_class.get(c.name, 0) + 1
    if n_rows == 0:
        problems.append("no golden row belongs to any class: the table or the corpus is not being read")
    if problems:
        print(f"{NAME}: FAIL -- {len(problems)} problem(s):")
        for p in problems[:60]:
            print("  - " + p)
        if len(problems) > 60:
            print(f"  ... and {len(problems) - 60} more")
        return 1
    print(f"{NAME}: OK -- {n_rows} classed golden row(s) hold the band of their class "
          f"({', '.join(f'{k} {v}' for k, v in sorted(per_class.items()))}); "
          f"{n_form_only} boundary residual row(s) were held on FORM alone (no cached output carried the term); "
          f"the comparator failed a wrong value and passed a right one in all three forms "
          f"(relative, abs:, exact: {n_cmp} runs); the checker rejected a count hand-pinned at 1e-4, a residual with "
          f"a relative band, a wrong absolute value and a band under the 1e-9 floor.  NOT CHECKED: that a band is "
          f"physically right, rows of no class, anchor and exact rows.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
