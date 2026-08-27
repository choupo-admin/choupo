#!/usr/bin/env python3
"""Gate: a missing UNIFAC a_mn is announced, not silently taken as ideal.

    bin/curate/check_unifac_gaps.py

WHY THIS EXISTS.  `UNIFAC::lnGammaGroups` reads the main-group interaction
parameter a_mn from the published table and falls back to 0.0 when the pair
is absent.  a = 0 makes Psi = exp(-a/T) = 1, which is the ATHERMAL --
ideal -- contribution for that group interaction.  So a mixture whose groups
the table does not connect was being priced as partly ideal, with no crash,
no NaN, and an activity coefficient that looks entirely reasonable.  That is
the shape the ProblemDivergence contract exists to catch, and UNIFAC sat on
its own published list of UNCOVERED downgrades.

MEASURED ON THIS CATALOGUE, before anything was built: 245 components carry
UNIFAC groups, giving 29 890 binary combinations; 15 distinct main groups are
in play, needing 210 directed pairs, of which 30 are absent; and 671 of the
binary combinations (2.2 %) touch at least one of them.  Small, and not
nothing -- and invisible either way, which is the part that matters.

ANNOUNCED, NOT REFUSED.  The gap is in HANSEN (1991), not in this catalogue:
the published table genuinely does not report every main-group pair, so no
curation act fills it and refusing would make 671 usable-with-a-caveat
systems unusable.  Same posture as the extrapolated sub-273 K Antoine and the
sub-band Davies -- the engine states what it did and judges nothing.

WHAT THIS GATE CHECKS.

  (a) THE ANNOUNCEMENT FIRES on a system whose groups the table does not
      fully connect, naming the missing main-group pairs AND the components
      that carry them.  A caveat that names only `CF2/CCOO` leaves the reader
      to work out which of their substances carries which group, and a caveat
      that needs homework is one that gets skipped.

  (b) IT SAYS WHAT THE FALLBACK MEANS.  "no a_mn" is a fact about a table;
      "taken as 0, which is Psi = 1, the athermal contribution" is what the
      reader's number actually suffered.  Naming the mechanism is the
      difference between a warning and a shrug.

  (c) IT REACHES THE READER TWICE -- at its site and in the end-of-run
      ASSUMPTIONS AND CAVEATS block.

  (d) EXACTLY ONCE ON THE CONSOLE.  The package is rebuilt once per outer
      iteration and once per finite-difference perturbation, so "announce
      once per construction" is not once: the first version printed the
      paragraph twice on a two-point scan.  A guard scoped to an object the
      caller recreates in a loop guards nothing -- the same defect
      VaporPressureModel::noteRange paid for with 102 identical paragraphs.

  (e) THE NEGATIVE, AND IT IS THE ONE THAT MATTERS: a system whose groups the
      table fully connects says NOTHING.  Without it this gate would pass
      just as happily if every UNIFAC run announced a gap, which is noise,
      and noise is how a real warning gets ignored.

  (f) THE COUNT IS RECOMPUTED HERE from the two data files, independently of
      the engine, and required to be non-zero -- a gate whose subject has
      silently disappeared from the catalogue must fail rather than pass.

WHAT THIS GATE DOES **NOT** COVER.  It does not check any a_mn VALUE against
Hansen (1991) -- the table was imported wholesale and this gate reads it as
given.  It says nothing about whether UNIFAC's answer is right where the
table IS complete, nor about how large the error from an athermal pair
actually is (that would need measured data for a system nobody has
parameters for, which is the same gap one level down).  And it covers the
original/VLE table only; UnifacLLE and Modified UNIFAC are not implemented.

SABOTAGE-VERIFIED 2026-08-27, five times; OBSERVED output below, verbatim.
The fifth SURVIVED first contact and the defect was in this gate, not in the
engine -- which is why there are five recorded and not four.

S1 -- the announcement suppressed entirely:

    - a system whose groups the table does not connect ran without announcing it -- part of that mixture was priced as ideal in silence
    - the announcement does not say what the fallback MEANS
    - the announcement does not say the gap is in the published table
    - the announcement did not reach the end-of-run caveat block

S2 -- the console echo latched on the model OBJECT again instead of asking
AdvisoryLog, so it announces once per package rebuild:

    - the announcement printed 2 times on a two-point scan.  The package is rebuilt per iteration and per FD perturbation, so a guard scoped to the model instance guards nothing

S3 -- the gap test inverted, so every system announces:

    - compare_vle_etoh_water's groups are fully connected by the table, yet the run announced a gap.  An announcement that fires on everything is noise, and noise is how a real warning gets ignored

S4 -- the athermal meaning dropped from the message, leaving a true and
useless sentence about a table:

    - the announcement does not say what the fallback MEANS -- `no a_mn` is a fact about a table; `taken as 0, which is Psi = 1, the athermal contribution` is what the reader's number suffered

S5 -- the component names stripped from the message.  **THIS SURVIVED**, and
the reason is the defect class this project keeps paying for: the check
searched the WHOLE RUN for the two names, and both components are also named
by their own `[unreviewed]` advisories, so it passed on lines that have
nothing to do with the announcement.  A check that passes for the wrong
reason is worse than a missing one, because it reports coverage it does not
have.  Scoped to the `[unifac]` line, it then fired:

    - the announcement does not name the components that carry the unconnected groups -- a caveat that needs homework is one that gets skipped
"""

import itertools
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
UF = ROOT / "data" / "standards" / "parameters" / "UNIFAC"
COMP = ROOT / "data" / "standards" / "components"

#  A system the table does NOT fully connect, and one it does.
GAP_PAIR = ("1234Tetramethylbenzene", "R13I1")
CLEAN = ROOT / "tutorials" / "props" / "compare" / "compare_vle_etoh_water"


def tables():
    sub2main = {m.group(1): m.group(2) for m in re.finditer(
        r"\{\s*name\s+(\S+?)\s*;.*?mainGroup\s+(\S+?)\s*;",
        (UF / "groups.dat").read_text(), re.S)}
    have = {(m.group(1), m.group(2)) for m in re.finditer(
        r"\{\s*i\s+(\S+?)\s*;\s*j\s+(\S+?)\s*;\s*a\s+\S+?\s*;\s*\}",
        (UF / "interactions.dat").read_text())}
    return sub2main, have


def mains_of(stem, sub2main):
    t = (COMP / f"{stem}.dat").read_text(errors="ignore")
    m = re.search(r"\bunifac\s*\((.*?)\)\s*;", t, re.S)
    if not m:
        return set()
    return {sub2main.get(g, g)
            for g in re.findall(r"group\s+(\S+?)\s*;", m.group(1))}


def probe(tmp: Path, a: str, b: str) -> Path:
    d = tmp / f"{a}_{b}"
    (d / "system").mkdir(parents=True)
    (d / "constant").mkdir(parents=True)
    (d / "system" / "controlDict").write_text(
        'application choupoProps;\ndescription "unifac gap probe";\n'
        'verbosity 3;\n')
    (d / "constant" / "thermoPhysPropDict").write_text(
        "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
        f"components ( {a} {b} );\nequilibrium\n{{\n formulation gammaPhi;\n"
        " liquid { activityModel UNIFAC; standardState pureLiquid; }\n"
        " vapour { fugacityModel idealGas; }\n}\n")
    (d / "system" / "propsDict").write_text(
        "operations\n(\n    {\n        name g;\n        type propertyScan1D;\n"
        f"        vary {{ variable x[{b}]; from 0.3; to 0.7; n 2; }}\n"
        f"        state {{ T 350 K; P 1 bar; composition {{ {a} 0.5; {b} 0.5; }} }}\n"
        f"        properties ( gamma_{b} );\n"
        "        output { file g.csv; }\n    }\n);\n")
    return d


def run(case: Path):
    p = subprocess.run([str(BUILD / "choupoProps"), str(case)],
                       capture_output=True, text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr


def main() -> int:
    fails, notes = [], []
    sub2main, have = tables()

    # ---- (f) the subject is recomputed here, from the data ---------------
    pcs = {}
    for p in sorted(COMP.glob("*.dat")):
        t = p.read_text(errors="ignore")
        m = re.search(r"\bunifac\s*\((.*?)\)\s*;", t, re.S)
        if m:
            pcs[p.stem] = {sub2main.get(g, g)
                           for g in re.findall(r"group\s+(\S+?)\s*;", m.group(1))}
    mains = sorted({g for s in pcs.values() for g in s})
    gaps = [(x, y) for x, y in itertools.permutations(mains, 2)
            if (x, y) not in have]
    affected = sum(1 for a, b in itertools.combinations(sorted(pcs), 2)
                   if any((x, y) not in have
                          for x in pcs[a] for y in pcs[b] if x != y))
    total = len(pcs) * (len(pcs) - 1) // 2
    if not gaps:
        fails.append("no main-group pair in play is missing from the table, so"
                     " this gate has no subject -- if the table gained the"
                     " missing pairs that is good news and this gate should be"
                     " RETIRED, not left permanently green on nothing")
    else:
        notes.append(f"{len(gaps)} of {len(mains)*(len(mains)-1)} directed"
                     f" main-group pairs in play are absent, affecting"
                     f" {affected} of {total} binary combinations"
                     f" ({100.0*affected/total:.1f} %)")

    a, b = GAP_PAIR
    if not ((COMP / f"{a}.dat").is_file() and (COMP / f"{b}.dat").is_file()):
        fails.append(f"the probe pair {a}/{b} is not in the catalogue")
    elif not any((x, y) not in have for x in mains_of(a, sub2main)
                 for y in mains_of(b, sub2main) if x != y):
        fails.append(f"{a}/{b} no longer touches a missing a_mn -- the"
                     " positive cannot fire and pins nothing")

    if fails:
        print("check_unifac_gaps: FAILED")
        for f in fails:
            print("  -", f)
        return 1

    tmp = Path(tempfile.mkdtemp(prefix="unifac_gap_"))
    try:
        # ---- (a)(b)(c)(d) the positive ---------------------------------
        rc, out = run(probe(tmp, a, b))
        if rc != 0:
            fails.append(f"the gap probe did not run (exit {rc}) -- the"
                         " announcement is a caveat, never a refusal: the gap"
                         " is in the published table and no curation fills it")
        else:
            n = len(re.findall(r"^\[unifac\] ", out, re.M))
            if n == 0:
                fails.append("a system whose groups the table does not connect"
                             " ran without announcing it -- part of that"
                             " mixture was priced as ideal in silence")
            elif n > 1:
                fails.append(f"the announcement printed {n} times on a"
                             " two-point scan.  The package is rebuilt per"
                             " iteration and per FD perturbation, so a guard"
                             " scoped to the model instance guards nothing --"
                             " it must ask AdvisoryLog, which outlives the"
                             " rebuild")
            else:
                notes.append("announced exactly once on the console")
            if "Psi = 1" not in out or "ATHERMAL" not in out:
                fails.append("the announcement does not say what the fallback"
                             " MEANS -- `no a_mn` is a fact about a table;"
                             " `taken as 0, which is Psi = 1, the athermal"
                             " contribution` is what the reader's number"
                             " suffered")
            #  LOOK INSIDE THE [unifac] LINE, not anywhere in the output.
            #  The first version searched the whole run and passed while the
            #  names had been stripped from the message: both components are
            #  ALSO named by their own `[unreviewed]` advisories, so the check
            #  was satisfied by lines that have nothing to do with it.
            #  Sabotage 5 survived on exactly that, which is the defect class
            #  this project keeps paying for -- a check that passes for the
            #  wrong reason is worse than one that is missing, because it
            #  reports coverage it does not have.
            line = "".join(l for l in out.splitlines() if l.startswith("[unifac]"))
            if a not in line or b not in line:
                fails.append("the announcement does not name the components"
                             " that carry the unconnected groups -- a caveat"
                             " that needs homework is one that gets skipped")
            if "Hansen" not in out:
                fails.append("the announcement does not say the gap is in the"
                             " published table, so a reader takes it for a"
                             " curation defect and goes looking for a fix that"
                             " does not exist")
            if "ASSUMPTIONS AND CAVEATS" not in out \
                    or out.count("no a_mn for") < 2:
                fails.append("the announcement did not reach the end-of-run"
                             " caveat block -- announced at its site and"
                             " nowhere the reader will meet it")
            else:
                notes.append("replayed in the caveat block")

        # ---- (e) the negative ------------------------------------------
        rc, out = run(CLEAN)
        if rc != 0:
            fails.append(f"the clean case {CLEAN.name} did not run")
        elif "[unifac]" in out:
            fails.append(f"{CLEAN.name}'s groups are fully connected by the"
                         " table, yet the run announced a gap.  An"
                         " announcement that fires on everything is noise, and"
                         " noise is how a real warning gets ignored")
        else:
            notes.append(f"{CLEAN.name} stays silent")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if fails:
        print("check_unifac_gaps: FAILED")
        for f in fails:
            print("  -", f)
        return 1

    print("check_unifac_gaps: OK -- " + "; ".join(notes) + "; the announcement"
          " names the missing main-group pairs, the components carrying them,"
          " the athermal meaning of the a=0 fallback, and Hansen (1991) as"
          " where the gap actually is.  NOT COVERED: any a_mn VALUE against"
          " its primary (the table was imported wholesale and is read as"
          " given), whether UNIFAC is right where the table IS complete, and"
          " how large the error from an athermal pair actually is -- that"
          " would need measured data for a system nobody has parameters for,"
          " which is the same gap one level down.  Original/VLE table only:"
          " UnifacLLE and Modified UNIFAC are not implemented.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
