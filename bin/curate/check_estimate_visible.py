#!/usr/bin/env python3
"""Gate: a GENERATED component does not read like a curated one in the Explorer.

    bin/curate/check_estimate_visible.py

WHY THIS EXISTS.  `choupoProps estimateComponent` writes a component `.dat` a
student promotes into their case and simulates with, and it does the honest
thing: every value it derived carries its own provenance block --

    provenance
    {
        Tc { origin estimated; method "Joback";
             methodVersion "joback-poling5e-table2-2";
             inputFingerprint "CH3:2,ketone:1";
             uncertainty { status unquantified; reason "..."; } }
    }

Nothing read them.  The Explorer's component inspector drew `reviewStatus`,
`role` and `provenance.source synthetic`, and walked straight past the
per-value blocks -- so a component whose Tc is a first-order group estimate
(Joback carries ~10 % on Tc) appeared on screen exactly like a measured
critical temperature.  The inspector's own type union had carried an
`estimate` mark kind since it was written and NOTHING EVER CONSTRUCTED ONE:
a declared vocabulary with no emitter, which is the shape this project keeps
finding.

THE CONTRACT IS ACROSS TWO LANGUAGES, so it needs a check that spans them.
The writer is C++ (`src/propertyOps/EstimateComponent.cpp`); the reader is
TypeScript (`gui/src/case/componentRecord.ts`), and its unit tests run against
a TRANSCRIPTION of the engine's output, because the generated file is a run
output and gitignored.  A transcription can drift from its original in
silence.  This gate is what stops that: it RUNS the generator and compares the
engine's live output against the fixture the GUI tests are written on.

WHAT THIS GATE CHECKS:

  (a) THE GENERATOR STILL EMITS PER-VALUE PROVENANCE.  Running the corpus
      witness produces a record with at least one `provenance {}` sub-block
      that DECLARES `origin` -- which is the reader's structural rule, and the
      only thing that makes a per-value block one.  The rule is structural on
      both sides on purpose: a list of field names would be a second home for
      the engine's vocabulary and would go stale the first time a generator
      learns a new value.

  (b) EACH BLOCK CARRIES WHAT THE INSPECTOR DRAWS: `origin`, `method`, and an
      `uncertainty { status }`.  `unquantified` is a real answer and the panel
      shows it as one; a block with no status at all is a different and worse
      thing, and the reader distinguishes them.

  (c) THE GUI FIXTURE AGREES WITH THE ENGINE.  Every per-value fact the live
      record declares for the witness component must appear verbatim in
      `gui/tests/componentRecord.test.ts`.  When the generator changes its
      method version, its fingerprint format or its uncertainty wording, this
      arm fails and names the drift, instead of the GUI tests going on passing
      against a record the engine no longer writes.

SABOTAGE-VERIFIED 2026-09-03, three times; every arm fired on the sabotage
named beside it and the gate passed again once reverted.

S1 -- `origin` dropped from the writer's per-value block.  Arm (a): the record
      still has a `provenance {}` and the reader would find nothing in it, so
      the gate reports zero per-value blocks rather than a missing key.

S2 -- `uncertainty` dropped from the writer's block.  Arm (b), naming the
      field and what the panel would stop being able to say.

S3 -- `methodVersion` changed in the writer.  Arm (c): the fixture the GUI
      tests are built on no longer describes the engine's output, and the
      gate says which fact diverged.  This is the arm that exists because the
      GUI cannot read the generated file itself.

TWO MORE SABOTAGES WERE RUN ON THE READER, and they belong to the vitest
suite rather than to this gate, but one of them is worth recording here
because of how it went:

S4 -- the reader's `origin` requirement dropped, so ANY sub-dict of
      `provenance` would count as a per-value block.  **It SURVIVED its first
      run**: every sub-dict in the acetone fixture happens to declare
      `origin`, so the rule the test claimed to check had no case that could
      fail it -- *a guard whose only case satisfies it is a guard nothing
      tests*.  `componentRecord.test.ts` now carries a `validity {}` block
      (real vocabulary: `thermo/PairAudit.H` reads exactly that) beside a real
      per-value block, and the sabotage fires.

S5 -- the derived-origin filter narrowed so `measured` counted as derived.
      The curated-record arm fires: an `estimate` mark on a measured record is
      the same defect pointing the other way.

WHAT THIS GATE DOES **NOT** COVER:

  * It does not check any NUMBER.  `check_estimates` recomputes the Joback
    values against the recipe; this gate is only about whether the record says
    HOW it produced them and whether the reader can see it.
  * It does not run the GUI.  That the inspector renders the section is the
    vitest suite's (`componentRecord.test.ts`); this gate guarantees the
    fixture those tests use is still the engine's own output.
  * Only the Joback path of `estimateComponent` is exercised.  A future
    generator with a different `input` is not run here.
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CASE = ROOT / "tutorials/props/estimate/estimate_acetone"
PROPS = ROOT / "choupoProps"
GUI_TEST = ROOT / "gui/tests/componentRecord.test.ts"


def strip_comments(t):
    t = re.sub(r"/\*.*?\*/", " ", t, flags=re.S)
    return re.sub(r"//[^\n]*", " ", t)


def provenance_body(text):
    """The body of the top-level `provenance { ... }`, braces matched."""
    m = re.search(r"^\s*provenance\s*\n?\s*\{", text, re.M)
    if not m:
        return None
    depth = 0
    for i in range(m.end() - 1, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[m.end():i]
    return None


def value_blocks(body):
    """{field: block-body} for each sub-dict that DECLARES `origin`.

    The same structural rule the GUI reader applies, deliberately: a name list
    here would be the second home the reader was written to avoid.
    """
    out = {}
    i = 0
    while i < len(body):
        m = re.compile(r"([A-Za-z_][A-Za-z0-9_]*)\s*\{").search(body, i)
        if not m:
            break
        depth, j = 0, m.end() - 1
        while j < len(body):
            if body[j] == "{":
                depth += 1
            elif body[j] == "}":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        inner = body[m.end():j]
        if re.search(r"^\s*origin\s+\S+\s*;", inner, re.M):
            out[m.group(1)] = inner
        i = j + 1
    return out


def word(body, key):
    m = re.search(rf'^\s*{key}\s+"?([^";]+)"?\s*;', body, re.M)
    return m.group(1).strip() if m else ""


def main():
    fails = []
    if not PROPS.exists():
        print("check_estimate_visible: FAIL")
        print("  - choupoProps is not built -- the gate cannot run, so it "
              "must not pass")
        return 1

    tmp = Path(tempfile.mkdtemp(prefix="choupo-estvis-"))
    try:
        work = tmp / "case"
        shutil.copytree(CASE, work)
        for stale in (work / "constant" / "components").glob("*.estimated.dat"):
            stale.unlink()
        p = subprocess.run([str(PROPS), "."], cwd=str(work),
                           capture_output=True, text=True, timeout=600)
        if p.returncode != 0:
            fails.append("the witness case exited %d -- the generator must "
                         "run" % p.returncode)
        gen = sorted((work / "constant" / "components").glob("*.estimated.dat"))
        if not gen:
            fails.append("estimateComponent wrote no *.estimated.dat -- there "
                         "is nothing for the inspector to read")
            return _report(fails)
        raw = strip_comments(gen[0].read_text())

        # ---- (a) the generator still emits per-value provenance ----------
        body = provenance_body(raw)
        if body is None:
            fails.append("the generated record carries no `provenance {}` "
                         "block at all")
            body = ""
        blocks = value_blocks(body)
        if not blocks:
            fails.append("the generated record's `provenance {}` declares NO "
                         "sub-block carrying `origin` -- the reader's "
                         "structural rule finds nothing, so a generated "
                         "component would draw exactly like a curated one")

        # ---- (b) each block carries what the inspector draws -------------
        for field, blk in sorted(blocks.items()):
            if not word(blk, "origin"):
                fails.append("provenance.%s declares no `origin`" % field)
            if not word(blk, "method"):
                fails.append("provenance.%s declares no `method` -- the panel "
                             "can name the value but not what produced it"
                             % field)
            unc = re.search(r"uncertainty\s*\{([^}]*)\}", blk)
            if not unc:
                fails.append("provenance.%s declares no `uncertainty {}` -- "
                             "the panel loses the record's own answer about "
                             "its error, and `unquantified` is an answer"
                             % field)
            elif not word(unc.group(1), "status"):
                fails.append("provenance.%s's uncertainty block declares no "
                             "`status`" % field)

        # ---- (c) the GUI fixture agrees with the engine ------------------
        if not GUI_TEST.exists():
            fails.append("%s is missing -- the reader's tests are what this "
                         "arm keeps honest" % GUI_TEST.name)
        else:
            fixture = GUI_TEST.read_text()
            for field, blk in sorted(blocks.items()):
                for key in ("origin", "method", "methodVersion",
                            "inputFingerprint"):
                    v = word(blk, key)
                    if v and v not in fixture:
                        fails.append(
                            "the engine writes `%s %s` for %s and the GUI "
                            "fixture in %s does not contain it -- the reader's "
                            "tests are written against a record the engine no "
                            "longer produces"
                            % (key, v, field, GUI_TEST.name))
                unc = re.search(r"uncertainty\s*\{([^}]*)\}", blk)
                if unc:
                    st = word(unc.group(1), "status")
                    if st and st not in fixture:
                        fails.append(
                            "the engine writes uncertainty status `%s` for %s "
                            "and the GUI fixture does not contain it"
                            % (st, field))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    return _report(fails, locals().get("blocks"))


def _report(fails, blocks=None):
    if fails:
        print("check_estimate_visible: FAIL")
        for f in fails:
            print("  - " + f)
        return 1
    n = len(blocks) if blocks else 0
    print("check_estimate_visible: OK -- the generated component carries "
          "per-value provenance on %d value(s), each declaring an `origin`, a "
          "`method` and an `uncertainty { status }`, which is exactly the "
          "structural rule the Explorer's inspector reads (a sub-dict that "
          "declares `origin`; never a list of field names); and every one of "
          "those facts appears verbatim in the GUI fixture, so the reader's "
          "tests are written against the record the engine actually writes.  "
          "NOT COVERED: any NUMBER (check_estimates recomputes those against "
          "the recipe); whether the inspector RENDERS the section (that is the "
          "vitest suite); and any generator path other than Joback." % n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
