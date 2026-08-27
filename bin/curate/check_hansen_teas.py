#!/usr/bin/env python3
"""Gate: the Hansen split is read, audited against an independent delta, and
absent honestly.

    bin/curate/check_hansen_teas.py

WHY THIS EXISTS.  The Hildebrand parameter is one number and carries no
hydrogen bonding, so it cannot tell a polar solvent from a hydrogen-bonding
one of the same cohesive energy density.  The corpus shows the failure
plainly: ethanol and water sit 21.96 MPa^0.5 apart on the ladder and are
miscible in all proportions.  The three-parameter Hansen split is the answer,
and a Teas diagram (Teas, J. Paint Technol. 40 (1968) 19) is how it is drawn
-- the fractions fd/fp/fh sum to 1, so each solvent is a point in a ternary.

THE ENGINE NOW READS THE SPLIT.  THE CATALOGUE DOES NOT CARRY IT.  Those are
two different sentences and this gate exists to keep them apart, because the
tempting failure here is not a wrong number -- it is a plausible one.  Hansen
parameters are widely tabulated in sources this repository cannot
redistribute, and a triple typed from memory would produce a Teas point that
looks entirely reasonable and is fiction.  Nothing is invented; a component
with no `hansen {}` block simply has none, and the run says so.

WHAT THIS GATE CHECKS.

  (a) THE HONEST ABSENCE.  With no component declaring a triple, the run says
      the DATA is missing and the CAPABILITY is not -- naming the block it
      would read.  A capability that reports itself as unimplemented sends
      the next reader to build what already exists; one that stays silent
      lets the absence read as "nothing more to say here".

  (b) THE SUM RULE IS AUDITED AGAINST AN INDEPENDENT DELTA.  delta^2 = dD^2 +
      dP^2 + dH^2, and this op DERIVES delta from the latent heat and the
      molar volume -- a different route entirely from wherever a triple came
      from.  The gate builds a probe whose triples are constructed to close,
      requires the reported deviation to be ~0, then breaks ONE of them by a
      factor of 1000 (the MPa^0.5-for-Pa^0.5 slip, the single likeliest data
      error there is) and requires the audit to catch it.

  (c) A PARTIAL TRIPLE REFUSES BY NAME.  dD alone is not partial information
      about the split -- it is a coordinate that would be plotted somewhere
      wrong.  The refusal names the component and the remedy.

  (d) THE TEAS FRACTIONS SUM TO 100 and are recomputed here from the printed
      dD/dP/dH rather than trusted.

  (e) THE MAGNITUDE CAVEAT IS ALWAYS PRINTED.  A Teas diagram NORMALISES the
      triple away, so two solvents with the same balance of forces and very
      different cohesive strength land on the same point.  A reader who
      forgets that reads the picture as a miscibility map, which it is not.
      Printed every time, not only when it bites -- the same posture as the
      Hildebrand caveat beside it.

WHAT THIS GATE DOES **NOT** COVER, stated so its green line cannot imply it.
The probe triples are SYNTHETIC: their direction is arbitrary and their
magnitude is taken from the engine's own derived delta, so the sum rule
closes BY CONSTRUCTION.  That tests the machinery and NOTHING about any
substance -- no Hansen parameter in this gate, or anywhere in this tree, is a
physical claim.  It follows that the audit's power against a REAL triple is
untested here: a triple wrong in direction but right in magnitude passes the
sum rule, and nothing in this repository can currently catch that.  Said
plainly because it is the audit's real limit: the sum rule constrains the
LENGTH of the vector and says nothing about where it points.

SABOTAGE-VERIFIED 2026-08-26, five times; OBSERVED output below, verbatim.

S1 -- the sum-rule audit made to compare the trio against ITSELF, so the
deviation is identically zero.  Caught only by the unit-slip arm, which is
the point of having it: the closing probe still closes:

    - benzene's dD written in MPa^0.5 where Pa^0.5 is meant -- a factor of 1000 -- moved the sum-rule deviation only to 0.0 %

S2 -- the all-or-nothing check removed, so dH silently defaults to 0:

    - the partial-triple refusal does not name the component and what is required

S3 -- THE ONE TO KNOW: the Teas fractions normalised by the MAGNITUDE
sqrt(dD^2+dP^2+dH^2) instead of the SUM dD+dP+dH.  The output still looks
exactly like a Teas diagram -- three fractions, plausible ordering, the right
solvent nearest each corner -- and it is wrong.  Only recomputing each row
from its own printed components sees it:

    - benzene: the Teas fractions sum to 144.30, not 100
    - benzene: fd = 92.8 is not dD/(dD+dP+dH) = 64.3 recomputed from the row
    - acetone: the Teas fractions sum to 163.70, not 100
    ... every row

S4 -- the honest-absence paragraph reverted to "the split is not implemented":

    - the absence is announced without distinguishing missing data from a missing capability

S5 -- the magnitude caveat dropped from the table:

    - the Teas table does not state that the fractions discard magnitude -- two solvents of very different cohesive strength plot at the same point, and a reader who is not told reads the triangle as a miscibility map
"""

import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
STD = ROOT / "data" / "standards" / "components"
CASE = ROOT / "tutorials" / "props" / "molecular" / "solubility01_hildebrand_ladder"

#  Direction is arbitrary; magnitude comes from the engine at run time.
DIRS = {"benzene": (.90, .30, .20), "acetone": (.75, .55, .30),
        "ethanol": (.55, .35, .75), "water": (.40, .35, .85)}


def run(case: Path):
    p = subprocess.run([str(BUILD / "choupoProps"), str(case)],
                       capture_output=True, text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr


def deltas(case: Path):
    """substance -> derived delta in MPa^0.5, from the run's OWN csv.

    Read from the machine-readable surface rather than scraped off the
    console table: the console is formatted for a human and its columns are
    free to move, while the csv is a contract the GUI already consumes.
    """
    hits = sorted(case.rglob("solubility.csv"))
    if not hits:
        return {}
    d = {}
    for line in hits[0].read_text().splitlines()[1:]:
        f = line.split(",")
        if len(f) > 1:
            try:
                d[f[0]] = float(f[1])
            except ValueError:
                pass
    return d


def build_probe(tmp: Path, mags: dict, break_unit=None, partial=None) -> Path:
    case = tmp / ("probe" + (break_unit or "") + (partial or ""))
    shutil.copytree(CASE, case, dirs_exist_ok=True)
    (case / "constant" / "components").mkdir(parents=True, exist_ok=True)
    for nm, (fd, fp, fh) in DIRS.items():
        if nm not in mags:
            continue
        n = math.sqrt(fd*fd + fp*fp + fh*fh)
        vals = [mags[nm] * 1e3 * x / n for x in (fd, fp, fh)]
        if break_unit == nm:
            vals[0] /= 1000.0          # MPa^0.5 written where Pa^0.5 is meant
        body = (f"\n// PROBE ONLY -- SYNTHETIC direction; magnitude from the\n"
                f"// engine's own derived delta.  No physical claim.\n"
                f"hansen\n{{\n    dD  {vals[0]:.8g};\n    dP  {vals[1]:.8g};\n")
        if partial != nm:
            body += f"    dH  {vals[2]:.8g};\n"
        body += "}\n"
        (case / "constant" / "components" / f"{nm}.dat").write_text(
            (STD / f"{nm}.dat").read_text() + body)
    return case


def main() -> int:
    fails, notes = [], []
    tmp = Path(tempfile.mkdtemp(prefix="hansen_gate_"))
    try:
        # ---- (a) the honest absence ------------------------------------
        rc, out = run(CASE)
        if rc != 0:
            fails.append(f"the shipped ladder case did not run (exit {rc})")
        elif "no component" not in out or "hansen { dD; dP; dH; }" not in out:
            fails.append("with no triple declared, the run does not say that"
                         " the DATA is missing while naming the block it would"
                         " read -- a capability reported as unimplemented sends"
                         " the next reader to build what exists")
        elif "what is absent is the DATA, not the capability" not in out:
            fails.append("the absence is announced without distinguishing"
                         " missing data from a missing capability")
        else:
            notes.append("absent triples announced as missing DATA, block named")
        mags = deltas(CASE)
        for nm in DIRS:
            if nm not in mags:
                fails.append(f"could not read a derived delta for {nm} from the"
                             " ladder case -- the probe's magnitudes come from"
                             " the engine, never from this script")
        if fails:
            print("check_hansen_teas: FAILED")
            for f in fails:
                print("  -", f)
            return 1

        # ---- (b)/(d)/(e) the closing probe ------------------------------
        rc, out = run(build_probe(tmp, mags))
        if rc != 0:
            fails.append(f"the Hansen probe did not run (exit {rc})")
        else:
            m = re.search(r"Worst sum-rule deviation:\s*([\d.]+)\s*%", out)
            if not m:
                fails.append("the run printed no sum-rule deviation -- the"
                             " audit is the reason the triple is read here")
            elif float(m.group(1)) > 0.05:
                fails.append(f"triples built to satisfy delta^2 = dD^2+dP^2+dH^2"
                             f" report a worst deviation of {m.group(1)} % --"
                             " the audit disagrees with its own construction")
            else:
                notes.append("sum rule closes on constructed triples")
            rows = re.findall(r"^\s{6}(\w[\w-]*)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)"
                              r"\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)"
                              r"\s+([\d.]+)\s+([\d.]+)\s*$", out, re.M)
            if len(rows) != len(DIRS):
                fails.append(f"the Hansen table has {len(rows)} row(s), expected"
                             f" {len(DIRS)}")
            for r in rows:
                nm = r[0]
                dD, dP, dH = float(r[1]), float(r[2]), float(r[3])
                fd, fp, fh = float(r[7]), float(r[8]), float(r[9])
                if abs(fd + fp + fh - 100.0) > 0.3:
                    fails.append(f"{nm}: the Teas fractions sum to"
                                 f" {fd+fp+fh:.2f}, not 100")
                s = dD + dP + dH
                if s > 0 and abs(100.0 * dD / s - fd) > 0.3:
                    fails.append(f"{nm}: fd = {fd} is not dD/(dD+dP+dH) ="
                                 f" {100.0*dD/s:.1f} recomputed from the row")
            if rows:
                notes.append(f"{len(rows)} Teas rows, fractions recomputed and"
                             " summing to 100")
            if "DISCARD MAGNITUDE" not in out:
                fails.append("the Teas table does not state that the fractions"
                             " discard magnitude -- two solvents of very"
                             " different cohesive strength plot at the same"
                             " point, and a reader who is not told reads the"
                             " triangle as a miscibility map")
            else:
                notes.append("the magnitude caveat is printed")

        # ---- (b) the audit catches the unit slip ------------------------
        rc, out = run(build_probe(tmp, mags, break_unit="benzene"))
        m = re.search(r"Worst sum-rule deviation:\s*([\d.]+)\s*%", out)
        if rc != 0 or not m:
            fails.append("the unit-slip probe produced no audit line")
        elif float(m.group(1)) < 10.0:
            fails.append(f"benzene's dD written in MPa^0.5 where Pa^0.5 is"
                         f" meant -- a factor of 1000 -- moved the sum-rule"
                         f" deviation only to {m.group(1)} %.  That is the"
                         " single likeliest data error there is and the audit"
                         " exists to catch it")
        else:
            notes.append(f"a 1000x unit slip shows as {m.group(1)} % deviation")

        # ---- (c) a partial triple refuses by name -----------------------
        rc, out = run(build_probe(tmp, mags, partial="ethanol"))
        if rc == 0:
            fails.append("a `hansen {}` block with dD and dP but no dH was"
                         " accepted -- a partial triple is a coordinate that"
                         " will be plotted somewhere wrong")
        elif "ethanol" not in out or "ALL THREE" not in out:
            fails.append("the partial-triple refusal does not name the"
                         " component and what is required")
        else:
            notes.append("a partial triple refuses naming the component")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if fails:
        print("check_hansen_teas: FAILED")
        for f in fails:
            print("  -", f)
        return 1

    print("check_hansen_teas: OK -- " + "; ".join(notes) + "."
          "  NOT COVERED, and it is the audit's real limit: every triple this"
          " gate uses is SYNTHETIC -- an arbitrary direction with its magnitude"
          " taken from the engine's own derived delta, so the sum rule closes"
          " BY CONSTRUCTION.  This tests the machinery and nothing about any"
          " substance; no Hansen parameter here or anywhere in this tree is a"
          " physical claim.  It follows that a triple wrong in DIRECTION but"
          " right in MAGNITUDE passes the sum rule untouched, and nothing in"
          " this repository can currently catch that -- the rule constrains the"
          " length of the vector and says nothing about where it points."
          "  Also not covered: any Teas region or solubility sphere (none is"
          " drawn), and whether a close Teas pair actually mixes (that needs"
          " an activity model and a liquid-liquid flash, not this op).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
