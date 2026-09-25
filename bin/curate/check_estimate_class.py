#!/usr/bin/env python3
"""Gate: the AACE estimate-class table has ONE home, and the engine reads it.

WHY THIS GATE EXISTS.  The classification had TWO homes and they disagreed
without anything noticing.  `docs/design-heuristics.md` carried a hand-written
table putting -30/+50 against Class 5 and -20/+30 against Class 4; the engine
stamped Class 4 with -30/+50 through a two-branch step whose comparison was
INVERTED --

    acc_lo = (estimateClass <= 4) ? -30.0 : -15.0;

-- so the CRUDEST class printed the NARROWEST band and Classes 1 through 4 all
printed the same one.  Neither home matched AACE 18R-97.  Nobody saw it
because no case in the corpus declares Class 5, so the wrong branch was never
reached and no golden could pin it: *a branch no case reaches is a branch no
golden can see.*

WHAT IT CHECKS, and each arm exists because something specific went wrong:

  (a) ONE HOME EXISTS.  `src/postProcessing/EstimateClass.H` carries all five
      classes.  An absent or collapsed table REFUSES -- a gate over a table
      that is not there would be green over nothing.
  (b) THE ENGINE READS IT.  `EconomicsPass.cpp` calls into the namespace and
      carries NO literal accuracy number of its own.  This is a SOURCE arm,
      because no output can distinguish a value read from the table from an
      identical literal typed beside it -- the 2026-09-06 `check_cost_
      provenance` arm (k) shape.
  (c) MONOTONICITY, the property the inverted comparison violated.  A class
      that is LESS defined must not have a NARROWER band than one that is
      more defined, on either side.  This is the arm that would have caught
      the original defect, and it is a property of the numbers rather than a
      transcription of them -- so it stays true if the standard is revised.
  (d) THE DOC TABLE AGREES WITH THE ONE HOME, value by value.  Two homes are
      unavoidable here (a student reads prose, the engine reads C++), so the
      gate is the single source: `check_verdict_parity`'s precedent.
  (e) THE DEFAULT IS ANNOUNCED.  A case that declares no `accuracyBand` gets
      the class's pessimistic corner AND an `[assumed]` advisory naming
      18R-97's rule.  A default that is USED is announced (2026-09-06); a
      silent one is indistinguishable from a declaration.
  (f) A DECLARED BAND IS SILENT AND IS HONOURED.  Silence must keep meaning
      "nothing was assumed", so a case that declares one must produce NO
      advisory and must print ITS numbers.
  (g) AN UNREGISTERED CLASS REFUSES BY NAME.  The old code branched on
      `<= 4`, so 0, 9 or -3 selected a band by arithmetic accident.

WHAT IT DOES NOT CHECK, stated so the green line cannot imply it:

  * whether the transcription from 18R-97 Table 1 is CORRECT.  That is a
    reading of a paid document and no machine here can verify it; arm (c)
    checks internal consistency only.  The reading is recorded in
    docs/design/how-a-process-design-is-staged.md 1.
  * whether any case's DECLARED band is a defensible risk analysis.  The
    standard says the band comes from one; nothing here can audit that.
  * the band is published to five surfaces and pinned by NO golden row kind.
    That is a live instance of the 2026-08-12 rule (published => pinned) and
    is named here rather than implied.

SABOTAGE-VERIFIED 2026-09-25; the observed output is in the commit message.
"""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HOME = ROOT / "src/postProcessing/EstimateClass.H"
PASS = ROOT / "src/postProcessing/EconomicsPass.cpp"
DOC = ROOT / "docs/design-heuristics.md"
CASE = "tutorials/steady/economics/economics01_esterification_dcf"

ROW = re.compile(
    r"\{\s*(\d)\s*,\s*([-+\d.]+)\s*,\s*([-+\d.]+)\s*,"
    r"\s*([-+\d.]+)\s*,\s*([-+\d.]+)\s*,\s*([-+\d.]+)\s*,\s*([-+\d.]+)\s*,")


def run(case_dir, extra_dict=None):
    return subprocess.run([str(ROOT / "choupoSolve"), str(case_dir)],
                          capture_output=True, text=True, cwd=str(ROOT))


def main() -> int:
    fail = []

    # ---- (a) the one home ------------------------------------------------
    if not HOME.exists():
        print("check_estimate_class: FAILED -- src/postProcessing/"
              "EstimateClass.H does not exist.  This gate audits a table; "
              "a verdict over an absent table would describe nothing.")
        return 1
    src = HOME.read_text(encoding="utf-8")
    rows = {}
    for m in ROW.finditer(src):
        cls = int(m.group(1))
        rows[cls] = tuple(float(m.group(i)) for i in range(2, 8))
    if sorted(rows) != [1, 2, 3, 4, 5]:
        print(f"check_estimate_class: FAILED -- the one home parses "
              f"{sorted(rows)} where AACE 18R-97 has classes 1..5.  A "
              "collapsed table REFUSES rather than passing over what is left.")
        return 1

    # ---- (c) monotonicity: the property the inverted comparison violated --
    #      Ordered least-defined (5) to most-defined (1): every band must
    #      NARROW, never widen.  Compared on the PESSIMISTIC corner, which is
    #      what the engine reports.
    for a, b in ((5, 4), (4, 3), (3, 2), (2, 1)):
        lo_a, hi_a = rows[a][3], rows[a][5]      # accLoWide, accHiWide
        lo_b, hi_b = rows[b][3], rows[b][5]
        if not (lo_a <= lo_b and hi_a >= hi_b):
            fail.append(
                f"(c) Class {a} is LESS defined than Class {b} and must not "
                f"have the narrower band: {a} is {lo_a}/{hi_a}, {b} is "
                f"{lo_b}/{hi_b}.  This is exactly the defect the inverted "
                "`estimateClass <= 4` comparison produced.")

    # ---- (b) the engine reads the home and carries no literal of its own --
    pt = PASS.read_text(encoding="utf-8")
    #  PROSE IS NOT A CALL.  The first version of this arm searched for the
    #  bare strings anywhere in the file, and sabotage S5 -- deleting the
    #  `#include` line -- left it GREEN, because the comment block above the
    #  code names `EstimateClass.H` in its own explanation.  That is the
    #  2026-09-06 `topLevelSector` trap repeated: a mention satisfied the
    #  "calls it" half until the comment forms were stripped.  So the arm
    #  requires the DIRECTIVE at a line start and the CALL with its
    #  parenthesis, and a comment can satisfy neither.
    has_include = re.search(r'(?m)^\s*#include\s+"EstimateClass\.H"', pt)
    has_call = re.search(r"estimateClass::find\s*\(", pt)
    if not has_include or not has_call:
        missing = []
        if not has_include:
            missing.append("no `#include \"EstimateClass.H\"` directive")
        if not has_call:
            missing.append("no call to `estimateClass::find(`")
        fail.append(
            "(b) EconomicsPass.cpp does not include and call the one home ("
            + "; ".join(missing) + ").  A second copy of these numbers is "
            "the arity sin, and it is how the two homes came to disagree in "
            "the first place.  Naming the header in a COMMENT does not "
            "satisfy this arm: prose is not a call.")
    band_stmt = re.search(r"scalar\s+acc_lo\s*=\s*([^;]+);", pt)
    if band_stmt and re.search(r"-?\d+\.\d*", band_stmt.group(1)):
        fail.append(
            "(b) the accuracy band is assigned from a LITERAL in "
            f"EconomicsPass.cpp: `{band_stmt.group(1).strip()}`.  It must "
            "come from EstimateClass.H.")

    # ---- (d) the doc table agrees, value by value ------------------------
    doc = DOC.read_text(encoding="utf-8")
    for cls, r in rows.items():
        _, _, loN, loW, hiN, hiW = r
        want = (f"L {int(loN)} to {int(loW)}%".replace("-", "−")
                + f" · H +{int(hiN)} to +{int(hiW)}%")
        if want not in doc:
            fail.append(
                f"(d) docs/design-heuristics.md does not carry Class {cls} as "
                f"the one home has it (expected `{want}`).  Two homes for one "
                "fact are held together by this gate or they drift, which is "
                "what happened before it existed.")

    # ---- (e)(f)(g) behaviour ---------------------------------------------
    r = run(ROOT / CASE)
    if r.returncode != 0:
        fail.append(f"(e) {CASE} did not run (exit {r.returncode}); the "
                    "behavioural arms cannot be judged and must not pass.")
    else:
        out = r.stdout
        if "[assumed] economics: accuracyBand was NOT declared" not in out:
            fail.append(
                "(e) a case declaring no `accuracyBand` does not ANNOUNCE "
                "that the engine supplied one.  A default that is used is "
                "announced, or silence stops meaning `nothing was assumed`.")
        if "18R-97" not in out or "never be pre-determined" not in out:
            fail.append(
                "(e) the announcement does not name 18R-97's own rule that "
                "the band should never be pre-determined.  The reason is the "
                "point; the number alone reads as a fact about the class.")
        cls4 = rows[4]
        want = f"accuracy band {int(cls4[3])}% / +{int(cls4[5])}%"
        if want not in out:
            fail.append(f"(e) the banner does not print `{want}`, the "
                        "pessimistic corner the one home gives Class 4.")

        # (f) a DECLARED band is honoured and silent
        import shutil, tempfile
        with tempfile.TemporaryDirectory() as td:
            probe = Path(td) / "declared"
            shutil.copytree(ROOT / CASE, probe)
            pd = probe / "system" / "postDict"
            txt = pd.read_text(encoding="utf-8")
            pd.write_text(txt.replace("estimateClass       4;",
                                      "estimateClass       4;\n"
                                      "    accuracyBand ( -22 37 );", 1),
                          encoding="utf-8")
            rr = run(probe)
            if "accuracy band -22% / +37%" not in rr.stdout:
                fail.append("(f) a DECLARED `accuracyBand ( -22 37 );` is not "
                            "honoured; the engine printed its own number over "
                            "the author's.")
            if "accuracyBand was NOT declared" in rr.stdout:
                fail.append("(f) a case that DECLARES a band still gets the "
                            "[assumed] advisory.  A declared value announces "
                            "nothing, or the caveat block fills with noise "
                            "and stops being read.")

            # (g) an unregistered class refuses BY NAME
            probe2 = Path(td) / "badclass"
            shutil.copytree(ROOT / CASE, probe2)
            pd2 = probe2 / "system" / "postDict"
            pd2.write_text(pd2.read_text(encoding="utf-8")
                           .replace("estimateClass       4;",
                                    "estimateClass       9;", 1),
                           encoding="utf-8")
            r2 = run(probe2)
            blob = r2.stdout + r2.stderr
            if r2.returncode == 0 or "is not an AACE 18R-97 class" not in blob:
                fail.append(
                    f"(g) estimateClass 9 did not refuse by name (exit "
                    f"{r2.returncode}).  The old code branched on `<= 4`, so "
                    "any integer selected a band by arithmetic accident.")

    if fail:
        print("check_estimate_class: FAILED")
        for f in fail:
            print("  " + f)
        return 1

    print("check_estimate_class: OK -- the AACE 18R-97 classification has ONE "
          f"home ({HOME.relative_to(ROOT)}, 5 classes), the engine reads it "
          "and carries no accuracy literal of its own, the bands NARROW "
          "monotonically from Class 5 to Class 1 on both sides (the property "
          "the old inverted `estimateClass <= 4` violated), "
          "docs/design-heuristics.md reproduces all five value by value, an "
          "undeclared band is ANNOUNCED with the standard's own "
          "never-pre-determined rule, a declared one is honoured SILENTLY, "
          "and an unregistered class REFUSES by name.  It does NOT check that "
          "the transcription from Table 1 is correct (a reading of a paid "
          "document; arm (c) is internal consistency only), nor that any "
          "declared band is a defensible risk analysis, and the band is "
          "published to five surfaces while NO golden row kind reads it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
