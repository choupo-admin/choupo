#!/usr/bin/env python3
"""Gate: a column's feed has ONE thermal state, and a contradiction REFUSES.

    bin/curate/check_feed_thermal_state.py

WHY THIS EXISTS.  `operation.feedQuality` was a SECOND HOME for a fact the
feed stream already carries, and on the single-feed solver paths nothing
reconciled the two.  `column01_benzene_toluene` -- this project's flagship
distillation tutorial, the one students run -- declared

    0/feed          T 370 K;  vaporFraction 0.6972418857;
    flowsheetDict   feedQuality 1.0;

which is a 69.7 % vapour feed and a saturated liquid at the same time.  The
column read the dict, the first-law report read the stream, and the plant lost
630.861080 kW -- 24.68 % of its exchanged energy -- for months, at exit 0, with
the suite green.  A golden pins what a run PRINTS, and this run printed the
same wrong number every time.

Eight more cases carried the same copied feed file.  Two more -- stripper01 and
stripper02 -- carried the defect with NO contradiction visible in the text at
all: they declare no `vaporFraction`, so the state was never written down, and
an unpinned (T, P, z) MEANS its own equilibrium (R-E2).  Their feeds resolve
two-phase; `feedQuality 1.0` was simply false about them; and that was the
WHOLE of each plant's residual, 12.794585 kW and 17.480393 kW.

THAT LAST PAIR IS WHY ARM (d) EXISTS.  A rule that compares `feedQuality`
against the DECLARED `vaporFraction` field would have passed both strippers and
looked complete.  The engine resolves the state instead, and arm (d) is the only
arm that can tell the two rules apart.

WHAT THIS GATE CHECKS.

  (a) THE REFUSAL FIRES on a case whose `feedQuality` contradicts its feed's
      resolved state, and the message NAMES BOTH NUMBERS and BOTH REMEDIES.
      A refusal that states a rule without stating the edit teaches only
      unease (invariant I5), and this one will be met cold by anyone holding
      a case of their own: eleven shipped tutorials reached a converged
      answer through this contradiction until 2026-09-12.

  (b) THE NEGATIVE: the same case with `feedQuality` deleted RUNS.  Without
      this arm the gate would be satisfied by a column that refuses
      everything.

  (c) THE SECOND NEGATIVE: an AGREEING `feedQuality` runs AND is silent.  The
      key survives as a cross-check, and a cross-check that shouts when it
      agrees is noise.

  (d) THE RESOLVED-STATE ARM: a feed that declares NO `vaporFraction` and
      resolves two-phase still contradicts `feedQuality 1.0`, and still
      refuses.  See above -- this is the stripper shape.

  (e) SOURCE: the second home stays deleted.  No site in
      DistillationColumn.cpp may read `feedQuality` as a VALUE with a default;
      it may only be looked up to be cross-checked and refused.

  (f) SOURCE: neither duty site prices the distillate at the top tray's
      `T[0]`.  `makeDistillate` publishes it at its own bubble point, and a
      duty that prices a state the unit does not publish is the same defect
      one band down -- 1.095541 kW on column01 and live on every non-reactive
      column in the corpus until 2026-09-12.

  (g) OUTPUT: the flagship's own first law, read from the engine's report and
      never recomputed here, closes at or below 1e-6 kW.  Arms (e) and (f) are
      source arms and cannot tell a correct edit from a correct-looking one;
      this arm is what says the physics agrees.

WHAT THIS GATE DOES NOT CHECK, said plainly rather than implied:

  * THE MULTI-FEED BRANCH.  `solveSimultaneous`'s `feeds ( ... )` path reads
    each feed's DECLARED `vf` and refuses a contradicting `quality`, but does
    not RESOLVE an unpinned feed and does not price a two-phase one at the
    equilibrium compositions.  Not live on today's corpus (every multi-feed
    case declares single-phase feeds) and deliberately not fixed blind: the
    two cases it would move, column04 and column08, are the two whose energy
    residuals are undiagnosed.
  * WHETHER A DECLARED FEED STATE IS TRUE OF THE FEED.  A pinned
    `vaporFraction 0.0` at a temperature above the bubble point is a
    declaration the engine honours; this gate checks that the case says ONE
    thing, not that the thing is right.
  * THE REACTIVE PATH's distillate temperature, which is knowingly the top
    tray's and says so.

SABOTAGES PERFORMED (each applied to the tree, the file read back off disk to
confirm the edit landed, the gate run, then reverted).  Results are in the
slice record, docs/design/the-state-a-unit-computes-with.md.
"""

import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "src" / "unitOperations" / "distillation" / "DistillationColumn.cpp"

#  The fixture's components come from a shipped case's `constant/` tree, read
#  only.  The FLOWSHEET and the STREAM are written here: a gate that fires a
#  refusal must own the case that provokes it, or the day somebody fixes the
#  shipped case the gate stops testing anything (the check_true_ions shape).
DONOR = ROOT / "tutorials" / "steady" / "distillation" / "column01_benzene_toluene"

CONTROL = """\
application   choupoSolve;
description   "check_feed_thermal_state fixture";
verbosity     2;
"""

FLOWSHEET = """\
units
(
    {
        name        probeColumn;
        type        distillationColumn;
        in          feed;
        outputs     ( distillate  bottoms );

        operation
        {
            nStages        15;
            feedStage      8;
            refluxRatio    2.0;
            distillateRate 50.0 kmol/h;
%(quality)s            P              1.01325 bar;
        }

        compositionTol   1e-7;
        maxOuterIter     200;
    }
);
"""

FEED = """\
componentMolarFlows
{
    benzene    50 kmol/h;
    toluene    50 kmol/h;
}

T               370 K;
P               101325 Pa;
%(vf)s"""

PRODUCT = """\
componentMolarFlows
{
    benzene    %(b)s kmol/h;
    toluene    %(t)s kmol/h;
}

T               %(T)s K;
P               101325 Pa;
vaporFraction   0.0;
"""


def build_fixture(root: Path, quality: str, vf: str) -> Path:
    """Write a one-column case.  `quality` and `vf` are whole lines, or ''."""
    case = root / "feedStateProbe"
    if case.exists():
        shutil.rmtree(case)
    (case / "system").mkdir(parents=True)
    (case / "0").mkdir()
    shutil.copytree(DONOR / "constant", case / "constant")
    #  The sealed manifest is the donor's, and this is not the donor.
    (case / "constant" / "propertyManifest").unlink(missing_ok=True)
    (case / "system" / "controlDict").write_text(CONTROL)
    (case / "system" / "flowsheetDict").write_text(FLOWSHEET % {"quality": quality})
    (case / "0" / "feed").write_text(FEED % {"vf": vf})
    (case / "0" / "distillate").write_text(
        PRODUCT % {"b": "49.06", "t": "0.94", "T": "353.63"})
    (case / "0" / "bottoms").write_text(
        PRODUCT % {"b": "0.94", "t": "49.06", "T": "382.89"})
    return case


def run(case: Path):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(ROOT / "choupoSolve"), "."], cwd=str(case),
                       env=env, capture_output=True, text=True, timeout=900)
    return p.returncode, p.stdout + p.stderr


def strip_comments(text: str) -> str:
    """Remove // and /* */ so prose cannot satisfy a source arm.

    Paid for by check_sector_hierarchy arm (g), where a symbol named only in
    a BLOCK comment satisfied a "the code calls it" test.  Prose is not a call.
    """
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


def main() -> int:
    failures = []
    tmp = Path(tempfile.mkdtemp(prefix="choupo-feedstate-"))
    try:
        # ---- (a) the refusal, and what it must say -----------------------
        case = build_fixture(tmp, "            feedQuality    1.0;\n",
                             "vaporFraction   0.6972418857;\n")
        rc, out = run(case)
        if rc == 0:
            failures.append(
                "(a) a case declaring `feedQuality 1.0` against a feed stream "
                "that declares `vaporFraction 0.6972418857` RAN TO EXIT 0.  "
                "The feed's thermal state has two homes again and the engine "
                "is choosing one in silence -- which is the 630.861080 kW "
                "defect this gate exists to keep closed.")
        else:
            #  The two numbers.  A refusal that says "these disagree" without
            #  saying what they are sends the reader back to the dicts to work
            #  out what the engine already knows.
            for what, pat in (
                ("the DECLARED feedQuality", r"feedQuality\s*=\s*1\.000000"),
                ("the RESOLVED vapour fraction", r"vapour fraction 0\.697242"),
                ("the RESOLVED q", r"q\s*=\s*0\.302758"),
            ):
                if not re.search(pat, out):
                    failures.append(
                        f"(a) the refusal never names {what} -- a reader "
                        "cannot act on a contradiction whose two sides are "
                        "not both quoted")
            for what, phrase in (
                ("the delete-the-key remedy", "DELETE `feedQuality`"),
                ("the fix-the-stream remedy", "vaporFraction 0.000000;"),
                ("which home is recommended", "Deleting the key is the recommended fix"),
            ):
                if phrase not in out:
                    failures.append(
                        f"(a) the refusal never states {what}.  Eleven shipped "
                        "tutorials reached a converged answer through this "
                        "contradiction, so this message is met cold by people "
                        "holding cases of their own: it must carry the edit, "
                        "not only the rule.")

        # ---- (b) the negative: no feedQuality, it runs --------------------
        case = build_fixture(tmp, "", "vaporFraction   0.6972418857;\n")
        rc, out = run(case)
        if rc != 0:
            failures.append(
                "(b) the SAME case with `feedQuality` deleted did not run "
                f"(exit {rc}).  The refusal in (a) proves nothing if the "
                "column refuses a two-phase feed as such.  Last lines:\n"
                + "\n".join(out.strip().splitlines()[-6:]))

        # ---- (c) the second negative: agreeing, and SILENT ---------------
        case = build_fixture(tmp, "            feedQuality    0.3027581143;\n",
                             "vaporFraction   0.6972418857;\n")
        rc, out = run(case)
        if rc != 0:
            failures.append(
                "(c) a feedQuality that AGREES with the feed stream was "
                f"refused (exit {rc}).  The key survives as a cross-check; "
                "agreement must pass.")
        elif "contradicts the feed stream" in out:
            failures.append(
                "(c) a feedQuality that agrees with the feed stream still "
                "printed the contradiction message -- a cross-check that "
                "shouts when it agrees is noise the reader learns to skip.")

        # ---- (d) the RESOLVED-state arm (the stripper shape) -------------
        #  No vaporFraction is declared at all, so nothing in the case text
        #  contradicts `feedQuality 1.0`.  The engine must resolve the state
        #  and refuse anyway.  A rule that read only the declared field would
        #  pass this and leave 30.27 kW across stripper01/02 untouched.
        case = build_fixture(tmp, "            feedQuality    1.0;\n", "")
        rc, out = run(case)
        if rc == 0:
            failures.append(
                "(d) a feed that DECLARES NO vapour fraction and RESOLVES "
                "two-phase ran to exit 0 under `feedQuality 1.0`.  The rule "
                "has been narrowed to compare against the declared field, "
                "which is exactly the rule that leaves stripper01 (12.794585 "
                "kW) and stripper02 (17.480393 kW) broken while looking "
                "complete.")
        elif "resolved at its own (T, P, z)" not in out:
            failures.append(
                "(d) the refusal fired but does not say the state was "
                "RESOLVED -- a reader whose case declares no vapour fraction "
                "must be told where the number came from.")

        # ---- (e) SOURCE: the second home stays deleted --------------------
        src = strip_comments(SRC.read_text())
        if re.search(r'lookupScalarOrDefault\(\s*"feedQuality"', src):
            failures.append(
                "(e) DistillationColumn.cpp reads `feedQuality` with a "
                "DEFAULT again.  That is the second home, restored: a feed "
                "with no declared quality silently becomes a saturated liquid "
                "whatever its stream says.  `feedQuality` may be looked up "
                "only to be cross-checked and refused.")

        # ---- (f) SOURCE: the duty prices the published distillate ---------
        #  Both solver paths build `dStream` before their duty block; pricing
        #  at T[0] is pricing the top tray's DEW point for a stream published
        #  at its BUBBLE point.  Count, do not merely detect: a presence test
        #  is satisfied by whichever site is still correct (the trap
        #  check_internal_states arm (o) paid for).
        bad = len(re.findall(r"H\(\s*D\s*,\s*T\[0\]", src))
        if bad:
            failures.append(
                f"(f) {bad} duty site(s) price the distillate at the top "
                "tray's T[0].  `makeDistillate` publishes it at its own "
                "bubble point, so the duty would be pricing a state this unit "
                "does not hand downstream -- 1.095541 kW on column01, and "
                "live on every non-reactive column in the corpus before "
                "2026-09-12.")

        # ---- (g) OUTPUT: the flagship's own first law ---------------------
        #  Read from the engine's report.  This gate computes no balance of
        #  its own: a second home for the first law is the defect one band up
        #  (2026-09-05, the GUI that summed its own).
        rc, out = run(DONOR)
        if rc != 0:
            failures.append(f"(g) {DONOR.name} did not run (exit {rc})")
        else:
            gb = DONOR / "reports" / "balances" / "globalEnergyBoundary.csv"
            if not gb.exists():
                failures.append("(g) the flagship printed no "
                                "globalEnergyBoundary report to read")
            else:
                row = [l for l in gb.read_text().splitlines()
                       if l.startswith("residual,")]
                if not row:
                    failures.append("(g) globalEnergyBoundary.csv carries no "
                                    "`residual` row")
                else:
                    res = float(row[0].split(",")[1])
                    if abs(res) > 1.0e-6:
                        failures.append(
                            f"(g) {DONOR.name} closes its plant-boundary first "
                            f"law at {res:.6f} kW.  It was 631.956148 kW "
                            "(24.68 %) until 2026-09-12 and 0.000000 kW after; "
                            "anything above 1e-6 kW means one of the three "
                            "state mismatches is back.  Arms (e) and (f) are "
                            "source arms and cannot see this.")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if failures:
        print("check_feed_thermal_state: FAILED")
        for f in failures:
            print("  " + f)
        return 1

    print("check_feed_thermal_state: OK -- a distillation column takes its "
          "feed's thermal state from the STREAM, resolving it where the "
          "stream leaves it unpinned, and REFUSES an `operation.feedQuality` "
          "that contradicts it, naming both numbers and both remedies; an "
          "agreeing feedQuality passes silently and a case with none runs; "
          "neither duty site prices the distillate at the top tray's "
          "temperature instead of the one it publishes; and the flagship "
          "column01_benzene_toluene closes its plant-boundary first law at or "
          "below 1e-6 kW, read from the engine's own report.  SCANNED: a "
          "fixture case written by this gate (four variants) and "
          "src/unitOperations/distillation/DistillationColumn.cpp.  NOT "
          "CHECKED: the simultaneous MULTI-feed branch, which reads each "
          "feed's declared vf but neither resolves an unpinned one nor prices "
          "a two-phase one at the equilibrium compositions (not live on "
          "today's corpus); whether a DECLARED feed state is true of the feed; "
          "and the reactive distillate temperature, which is knowingly the "
          "top tray's and says so.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
