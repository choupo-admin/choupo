#!/usr/bin/env python3
"""Gate: a module record may carry SEVERAL rated tests, each kept as the
source states it, and a case names the one it inverts.
    bin/curate/check_rated_tests.py

WHY THIS EXISTS (DEV.md 4c C189, slice 2).  A data sheet often quotes more
than one standard test -- an NaCl test and an MgSO4 test, a typical and a
minimum rejection, a test at another pressure -- and each is a different
operating point or a different KIND of number.  Averaging them, or keeping
only one, loses what the source said.  So a `kind membraneModule` record
carries `ratedTests ( { ... } { ... } );`, the old `ratedTest {}` stays and
is read as a list of ONE, each test keeps its own optional facts
(`rejectionValueType`, `pressureBasis`, `pH`, `permeateFlowBasis`,
`soluteBasis`, `source`, `id`), and `rejection { <s> fromRatedTest; }` takes
the one test of that solute or, when two share it, the one the case names:
`rejection { <s> ( fromRatedTest <id> ); }`.  An optional fact the record
does not state is ABSENT -- never printed, and ANNOUNCED where the inversion
needs a reading of it.

WHY A GATE OF ITS OWN, not an arm of check_membrane_modules.  That gate
holds the shipped records against a second transcription of their
DOCUMENTS; this one holds the GRAMMAR and the SELECTION against a fixture
that is explicitly HYPOTHETICAL (no manufacturer published it).  Mixing the
two would put an invented test beside transcribed ones in one gate's
table.  check_membrane_modules arm (f) does run every test of every shipped
record (the list form included).

THE FIXTURE.  Built in a temporary directory, never in data/standards: a
copy of membrane25 whose case-local constant/assets/ gains a record
`Hypothetical-4040` (NF270-4040's hardware, renamed, its header saying it is
a gate fixture) carrying the tests each arm needs.  The SHIPPED records keep
exactly the tests they have.

WHAT THIS GATE CHECKS (every run is RUN here):
  (a) SINGLE FORM == LIST OF ONE.  membrane15, membrane16 and membrane25,
      each run twice on copies that differ ONLY in the record's form
      (`ratedTest { ... }` vs `ratedTests ( { ... } );`): stdout and stderr
      must be byte-identical (the copy's directory name normalised).
  (b) BOTH FORMS REFUSE: a record declaring `ratedTest {}` AND `ratedTests`
      refuses by name ("declares BOTH").
  (c) TWO SOLUTES, PRINTED APART, THE RIGHT ONE CHOSEN.  Hypothetical-4040
      carries an NaCl test FIRST (no optional fact) and the MgSO4 test
      SECOND (every optional fact declared, numbers identical to NF270-4040's
      sheet).  The run prints one `Rated test <id>:` line each; the NaCl line
      carries no optional fact (absent stays absent), the MgSO4 line carries
      each one; the derived R_int(MgSO4) equals the shipped membrane25's to
      1e-9 (a selector that took the first test, or the NaCl one, could not);
      the caveat line says which test was chosen and says NONE of the
      "does not state" sentences, while the shipped membrane25 says all three.
  (d) ONE SOLUTE, TWO TESTS.  Two MgSO4 tests `a` (the sheet's numbers) and
      `b` (8 bar, 0.95 -- hypothetical): `MgSO4 fromRatedTest;` REFUSES naming
      both ids and the list form; `MgSO4 ( fromRatedTest b );` runs and its
      R_int equals that of a record carrying test b ALONE (single form) to
      1e-12, and differs from a's.
  (e) THE RECORD'S OWN REFUSALS: two tests of one solute without ids; two
      tests with one id; an empty list; an unknown key; an unknown
      `rejectionValueType` word; a range written as one number; a list
      written without `range`.
  (f) THE INVERSION'S REFUSALS: an unknown id; an id naming another
      solute's test; a range; a net driving pressure; a permeate flow from a
      separate test; a solute stated as another formula; the list form with
      a word other than fromRatedTest.
  (g) A GAUGE PRESSURE is announced made absolute ("bar absolute") and the
      run converges.

WHAT IT DOES NOT CHECK: that any optional fact is TRUE of a real element (no
shipped record declares one -- a curation act); the KPIs of two derived
solutes from two tests in one unit (suffixed keys, published, no witness);
any conversion between a solute and its stated formula (refused instead).

SABOTAGE-VERIFIED 2026-10-31 (by hand, rebuilt, run, restored):
  S1  RatedTestInversion.cpp selectRatedTest: `return *ofSolute.front();`
      reached also when two tests share the solute (the size check removed)
      CAUGHT by (d): "unnamed duplicate: the probe ran to exit 0 -- no
      refusal".
  S2  MembraneModule.cpp: the both-forms refusal disabled (`if (false &&
      ...)`; ratedTest then ratedTests both appended)
      CAUGHT by (b), but NOT as predicted: the run still refused -- by the
      duplicate-solute rule ("ratedTests[0] and ratedTests[1] are both MgSO4
      tests and at least one carries no `id`"), so (b) failed on the missing
      "declares BOTH" text.  Recorded as measured: (b) holds the REASON, not
      only the exit code, which is what caught it.
  S3  SpiralWoundModule.cpp print: `if (rt.hasPH)` -> `if (true)`
      CAUGHT by (c): "the NaCl line prints an optional fact the record does
      not state: ', pH'".  Arm (a) does NOT catch it (the shipped records
      carry one test and both forms print "pH 0" alike: (a) compares the two
      forms with each other, not with the previous binary).
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
BIN = ROOT / "choupoSolve"
M15 = ROOT / "tutorials/steady/membranes/membrane15_module_nf270_4040"
M16 = ROOT / "tutorials/steady/membranes/membrane16_module_sw30hr_8040"
M25 = ROOT / "tutorials/steady/membranes/membrane25_rated_test_inversion_nf270_4040"

fails = []


def fail(msg):
    fails.append(msg)
    print("  FAIL " + msg)


def copy_case(src, dst):
    #  A probe is not its donor: the sealed manifest stays behind, and so do
    #  run outputs (check_membrane_modules' builder, the same move).
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
        "converged", "log.*", "expected", "reports", "design", "propertyManifest"))


def run(case):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(BIN), str(case)], capture_output=True, text=True,
                       timeout=900, env=env, cwd=str(case))
    return r.returncode, r.stdout, r.stderr


def result_of(out):
    if "<<<Choupo:result-begin>>>" not in out:
        return None
    return json.loads(out.split("<<<Choupo:result-begin>>>")[1].split("<<<Choupo:result-end>>>")[0])


RATED_BLOCK = re.compile(r"\nratedTest\s*\{[^}]*\}")


def record_path(case, name):
    """The record the case runs: its own mirror, made from the catalogue's
    when it has none (so both forms are edits of the SAME text)."""
    p = case / "constant/assets" / (name + ".dat")
    if not p.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(ROOT / "data/standards/assets" / (name + ".dat"), p)
    return p


def to_list_form(path):
    s = path.read_text()
    m = RATED_BLOCK.search(s)
    if not m:
        raise RuntimeError("no ratedTest {} block in %s" % path)
    body = m.group(0)[1:]
    inner = body[body.index("{"):]
    s2 = s[:m.start()] + "\nratedTests\n(\n" + inner + "\n);" + s[m.end():]
    path.write_text(s2)


#  NF270-4040's sheet test, as the record carries it (the numbers only).
SHEET = """solute MgSO4; feedMassFraction 2.0e-3; P 4.8 bar; T 298.15 K;
        recovery 0.15; permeateFlow 9.5 m3/d; rejection 0.97;"""
SHEET_B = """solute MgSO4; feedMassFraction 2.0e-3; P 8.0 bar; T 298.15 K;
        recovery 0.15; permeateFlow 9.5 m3/d; rejection 0.95;"""
NACL = """id naclStd; solute NaCl; feedMassFraction 2.0e-3; P 4.8 bar; T 298.15 K;
        recovery 0.15; permeateFlow 9.5 m3/d; rejection 0.50;"""
FULL = """id mgso4Typical; """ + SHEET + """
        rejectionValueType typical; pressureBasis feedAbsolute; pH 7;
        permeateFlowBasis sameTest; source "gate fixture, hypothetical";"""


def fixture(case, rated_text):
    """Hypothetical-4040 in the case's constant/assets: NF270-4040's hardware
    renamed, carrying `rated_text` in place of the sheet's ratedTest; and the
    NFderived unit pointed at it."""
    src = record_path(case, "NF270-4040").read_text()
    s = RATED_BLOCK.sub("\n" + rated_text, src, count=1)
    s = re.sub(r"\nname\s+NF270-4040;", "\nname           Hypothetical-4040;", s, count=1)
    s = ("// GATE FIXTURE (bin/curate/check_rated_tests.py): HYPOTHETICAL rated tests\n"
         "// built in a temporary directory -- no manufacturer published them.\n") + s
    (case / "constant/assets/Hypothetical-4040.dat").write_text(s)
    p = case / "system/flowsheetDict"
    t = p.read_text()
    t2 = t.replace("module           NF270-4040;     // data/standards/assets/, its ratedTest {} is inverted",
                   "module           Hypothetical-4040;", 1)
    if t2 == t:
        raise RuntimeError("fixture: NFderived's module line not found")
    p.write_text(t2)


def ask(case, entry):
    p = case / "system/flowsheetDict"
    t = p.read_text()
    #  The DECLARATION (an indented line), never the header comment's quote.
    t2 = re.sub(r"(?m)^(\s+)rejection \{ MgSO4 fromRatedTest; \}",
                lambda m: m.group(1) + "rejection { %s }" % entry, t, count=1)
    if t2 == t:
        raise RuntimeError("fixture: NFderived's rejection line not found")
    p.write_text(t2)


def tests_list(*blocks):
    return "ratedTests\n(\n" + "\n".join("    { %s }" % b for b in blocks) + "\n);"


def R_int(so):
    j = result_of(so)
    return None if j is None else j.get("kpis", {}).get("NFderived", {}).get("R_int_fromRatedTest_MgSO4")


def probe(tmp, label, rated_text, entry=None):
    d = tmp / label
    copy_case(M25, d)
    fixture(d, rated_text)
    if entry:
        ask(d, entry)
    return run(d)


def refusal(tmp, label, rated_text, must, entry=None):
    rc, so, se = probe(tmp, label, rated_text, entry)
    out = so + se
    if rc == 0:
        fail("(%s) %s: the probe ran to exit 0 -- no refusal" % (label[0], label))
        return
    missing = [m for m in must if m not in out]
    if missing:
        fail("(%s) %s: exit %d but the message lacks %r:\n%s" % (label[0], label, rc, missing, out[-700:]))
        return
    print("  (%s) %s: refused (exit %d)" % (label[0], label, rc))


def main():
    if not BIN.exists():
        print("check_rated_tests: COULD NOT RUN -- no %s (make all)" % BIN)
        return 2
    tmp = Path(tempfile.mkdtemp(prefix="check_rated_tests_"))
    try:
        # ---- (a) single form == list of one -------------------------------
        for case, name in ((M15, "NF270-4040"), (M16, "SW30HR-380"), (M25, "NF270-4040")):
            outs = []
            for form in ("single", "list"):
                d = tmp / ("a_" + case.name[:10] + "_" + form)
                copy_case(case, d)
                rec = record_path(d, name)
                if form == "list":
                    to_list_form(rec)
                rc, so, se = run(d)
                outs.append((rc, so.replace(str(d), "<CASE>").replace(d.name, "<CASE>"),
                             se.replace(str(d), "<CASE>").replace(d.name, "<CASE>")))
            if outs[0][0] != 0:
                fail("(a) %s did not run (exit %d):\n%s" % (case.name, outs[0][0], (outs[0][1] + outs[0][2])[-600:]))
            elif outs[0] != outs[1]:
                a, b = outs[0][1].splitlines(), outs[1][1].splitlines()
                diff = [(x, y) for x, y in zip(a, b) if x != y][:3]
                fail("(a) %s: the list-of-one form is not byte-identical to the single form "
                     "(exit %d/%d; first differing stdout lines %r)" % (case.name, outs[0][0], outs[1][0], diff))
            else:
                print("  (a) %s: single form and list of one byte-identical (stdout %d lines, stderr %d lines)"
                      % (case.name, len(outs[0][1].splitlines()), len(outs[0][2].splitlines())))

        # ---- the shipped witness, for (c) ------------------------------------
        d = tmp / "shipped25"
        copy_case(M25, d)
        rc, so25, se25 = run(d)
        R25 = R_int(so25)
        if rc != 0 or R25 is None:
            fail("(c) membrane25 did not run (exit %d)" % rc)
        absent = ("does not state whether the rejection", "does not state what its pressure",
                  "does not state whether the permeate flow")
        for a in absent:
            if a not in so25 or a not in se25:
                fail("(c) membrane25 (no optional fact declared) does not announce %r on stdout and stderr" % a)

        # ---- (b) both forms refuse -----------------------------------------
        refusal(tmp, "both forms", "ratedTest { %s }\n%s" % (SHEET, tests_list(SHEET)),
                ["Hypothetical-4040", "declares BOTH", "`ratedTests ( ... )`"])

        # ---- (c) two solutes, printed apart, the right one chosen -----------
        rc, so, se = probe(tmp, "c_two_solutes", tests_list(NACL, FULL))
        if rc != 0:
            fail("(c) the two-solute fixture did not run (exit %d):\n%s" % (rc, (so + se)[-700:]))
        else:
            nacl = [l for l in so.splitlines() if l.startswith("  Rated test naclStd:")]
            mgso4 = [l for l in so.splitlines() if l.startswith("  Rated test mgso4Typical:")]
            if len(nacl) != 1 or len(mgso4) != 1:
                fail("(c) expected one `Rated test naclStd:` and one `Rated test mgso4Typical:` line, got %d and %d"
                     % (len(nacl), len(mgso4)))
            else:
                for opt in (", stated as", ", rejection ", ", pressure ", ", pH", ", permeate flow ", "; source:"):
                    if opt in nacl[0].split(": permeate")[1].replace(", rejection 50.00 %", ""):
                        fail("(c) the NaCl line prints an optional fact the record does not state: %r" % opt)
                for opt in (", rejection typical", ", pressure feedAbsolute", ", pH 7",
                            ", permeate flow sameTest", "; source: gate fixture, hypothetical"):
                    if opt not in mgso4[0]:
                        fail("(c) the MgSO4 line does not print the declared %r: %s" % (opt, mgso4[0]))
                print("  (c) printed apart:\n      %s\n      %s" % (nacl[0], mgso4[0]))
            R = R_int(so)
            if R is None or R25 is None or abs(R - R25) > 1e-9:
                fail("(c) R_int(MgSO4) from the second test is %r, not membrane25's %r" % (R, R25))
            else:
                print("  (c) the MgSO4 test chosen from [NaCl, MgSO4]: R_int %.12f = membrane25's %.12f" % (R, R25))
            if "test 'mgso4Typical' chosen, of 2 on the record" not in so:
                fail("(c) the caveat line does not say which test was chosen")
            for a in absent:
                if a in so:
                    fail("(c) a fully declared test still announces %r" % a)

        # ---- (d) one solute, two tests ---------------------------------------
        A = "id a; " + SHEET
        B = "id b; " + SHEET_B
        refusal(tmp, "d unnamed duplicate", tests_list(A, B),
                ["2 MgSO4 tests (ids a, b)", "( fromRatedTest <id> )"])
        rc, so, se = probe(tmp, "d_named_b", tests_list(A, B), "MgSO4 ( fromRatedTest b );")
        rc1, so1, se1 = probe(tmp, "d_b_alone", "ratedTest { %s }" % SHEET_B)
        Rb, Rb1 = R_int(so), R_int(so1)
        if rc != 0 or rc1 != 0 or Rb is None or Rb1 is None:
            fail("(d) the named-b probes did not run (exit %d/%d):\n%s" % (rc, rc1, (so + se + so1 + se1)[-700:]))
        elif abs(Rb - Rb1) > 1e-12 or R25 is None or abs(Rb - R25) < 1e-6:
            fail("(d) `( fromRatedTest b )` gives R_int %.12f; b alone %.12f; a (membrane25) %r" % (Rb, Rb1, R25))
        else:
            print("  (d) `MgSO4 ( fromRatedTest b );` -> R_int %.12f = test b alone %.12f, != test a %.12f"
                  % (Rb, Rb1, R25))

        # ---- (e) the record's own refusals ------------------------------------
        refusal(tmp, "e no ids", tests_list(SHEET, SHEET_B), ["both MgSO4 tests", "`id <word>;`"])
        refusal(tmp, "e same id", tests_list("id a; " + SHEET, "id a; " + NACL.replace("id naclStd; ", "")),
                ["two rated tests carry the id 'a'"])
        refusal(tmp, "e empty list", "ratedTests ( );", ["ratedTests"])
        refusal(tmp, "e unknown key", "ratedTest { %s rejectionValuType typical; }" % SHEET,
                ["rejectionValuType", "rejectionValueType"])
        refusal(tmp, "e unknown value type", "ratedTest { %s rejectionValueType median; }" % SHEET,
                ["median", "typical", "minimum"])
        refusal(tmp, "e range as one number", "ratedTest { %s rejectionValueType range; }" % SHEET,
                ["`rejection ( 0.96 0.99 );`"])
        refusal(tmp, "e list without range",
                "ratedTest { %s }" % SHEET.replace("rejection 0.97;", "rejection ( 0.96 0.99 );"),
                ["declare `rejectionValueType range;`"])

        # ---- (f) the inversion's refusals ---------------------------------------
        refusal(tmp, "f unknown id", tests_list("id a; " + SHEET), ["no rated test with id 'zz'", "a"],
                entry="MgSO4 ( fromRatedTest zz );")
        refusal(tmp, "f id of another solute", tests_list(NACL, "id a; " + SHEET),
                ["test 'naclStd'", "is a NaCl test, not a MgSO4 one"], entry="MgSO4 ( fromRatedTest naclStd );")
        refusal(tmp, "f range",
                "ratedTest { %s rejectionValueType range; }" % SHEET.replace("rejection 0.97;", "rejection ( 0.96 0.98 );"),
                ["RANGE", "ONE observed value"])
        refusal(tmp, "f net driving", "ratedTest { %s pressureBasis netDriving; }" % SHEET, ["NET DRIVING"])
        refusal(tmp, "f separate flow", "ratedTest { %s permeateFlowBasis separateTest; }" % SHEET,
                ["NOT measured in the rejection test"])
        refusal(tmp, "f other formula", "ratedTest { %s soluteBasis Mg; }" % SHEET, ["AS Mg", "not done here"])
        refusal(tmp, "f bad list word", "ratedTest { %s }" % SHEET, ["`( fromRatedTest <id> )`"],
                entry="MgSO4 ( fromDataSheet a );")

        # ---- (g) a gauge pressure ------------------------------------------------
        rc, so, se = probe(tmp, "g_gauge", "ratedTest { %s pressureBasis feedGauge; }" % SHEET)
        if rc != 0 or "bar(g) + 1.01325 bar (standard atmosphere) = 5.81325 bar absolute" not in so:
            fail("(g) the gauge probe: exit %d, announcement %s" % (rc, "absent" if rc == 0 else "-"))
        else:
            print("  (g) gauge announced and made absolute: R_int %.6f (absolute reading %.6f)" % (R_int(so), R25 or 0))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if fails:
        print("check_rated_tests: FAILED (%d)" % len(fails))
        return 1
    print("check_rated_tests: OK -- `ratedTest {}` and `ratedTests ( {..} )` with one test give byte-identical runs "
          "of membrane15/16/25; both forms on one record refuse; a hypothetical two-solute record prints each test on "
          "its own line with exactly the optional facts it declares and the inversion takes the MgSO4 test listed "
          "second (R_int = membrane25's to 1e-9); two MgSO4 tests refuse an unnamed request and `( fromRatedTest b )` "
          "reproduces test b alone to 1e-12; 7 record refusals and 7 inversion refusals fire by name; an undeclared "
          "value type, pressure meaning and permeate-flow basis are announced on membrane25 and not on a fully "
          "declared test; a gauge pressure is announced made absolute.  NOT CHECKED: any optional fact against a "
          "real data sheet (no shipped record declares one), two derived solutes in one unit, formula conversion.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
