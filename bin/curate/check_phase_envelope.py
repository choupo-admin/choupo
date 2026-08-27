#!/usr/bin/env python3
"""Gate: the P-T envelope draws only points that are on the curve, and says
where it stopped and why.

    bin/curate/check_phase_envelope.py

WHY THIS EXISTS.  A phase envelope is drawn to find two things: the
CRICONDENTHERM (the highest temperature at which the feed can hold a liquid --
what a pipeline is designed against) and the retrograde region beside it.
Both live at the nose, and the nose is where every simple method fails.  An
envelope op that quietly extrapolates a nose is worse than one that has none,
because the nose is the answer.

AND THE DEFECT THIS GATE WAS BUILT AROUND IS NOT THE NOSE.  Both saturation
solvers bracket T in 200-700 K and are warm-started from the previous
pressure step, so Newton can converge to a DIFFERENT ROOT and report success.
The first version of the op traced a C3/C4/C5 bubble branch 243 -> 332 K to
16 bar and then reported 268 K at 19 bar -- a bubble temperature FALLING as
pressure rises, which is impossible -- and the cricondentherm detector read
the matching spike on the dew branch as a maximum and published 371.492 K.
A plausible number, confidently reported, from a root nobody asked for.
*A converged point is not necessarily a point on this curve.*

WHAT THIS GATE CHECKS.

  (a) THE BUBBLE CURVE NEVER FALLS.  T_bubble(P) is monotonically increasing
      up to the critical point -- physics, not a heuristic -- so every drawn
      bubble point is checked against its predecessor, from the CSV, here.

  (b) THE DEW CURVE IS CONTINUOUS.  It is not monotone (the cricondentherm is
      an interior maximum), so the test is that no step exceeds a multiple of
      the branch's own median step.  Recomputed here from the CSV rather than
      trusted from the op.

  (c) A ROOT JUMP IS REPORTED AS ONE, and distinguished from a turning point
      in the text: they have different remedies, and calling a jump a
      turning point invents a feature of the mixture.

  (d) AN EMPTY BRANCH IS NOT A STOPPED BRANCH.  envelope01's bubble line lies
      below the solver's own 200 K bracket and produces nothing; the first
      version reported "stopped at 1.000 bar, last converged point 0.000 K at
      0.000 bar", a sentence about nothing.

  (e) A CRICONDENTHERM IS CLAIMED ONLY FOR AN INTERIOR MAXIMUM, and is
      labelled as BRACKETED rather than refined.  envelope01 has a genuine
      one and reports it; envelope02's apparent maximum is the discarded
      jump's endpoint and must NOT be reported.  Both directions are pinned,
      because a detector that only ever fires is as useless as one that never
      does.

  (f) THE UNCLOSED NOSE IS NAMED, with the algorithm that would close it
      (Michelsen 1980) and the statement that it is a different algorithm and
      not a tolerance.

  (g) ONE HOME FOR THE DEW RESIDUAL.  `DewPoint::compute` is the only place
      sum(y_i/K_i) = 1 is solved; the op must not carry a second copy.
      Checked by reading the source, because two implementations that both
      converge produce two slightly different curves and nothing says which.

WHAT THIS GATE DOES **NOT** COVER, stated so its green line cannot imply it.
No number in either witness is checked against a MEASURED envelope -- the
feeds are plausible, not sampled, and the K-values come from Peng-Robinson
over an ideal liquid.  Both cases are STRUCTURAL witnesses: they pin what the
op reports and refuses to report, never that the curve is right.  The gate
says nothing about the nose itself (it is not drawn), about the critical
point (not located), or about whether the continuity thresholds would catch a
SMALL root jump -- they are sized to catch the discontinuous kind, and a jump
inside the noise of the branch's own steps would pass.

SABOTAGE-VERIFIED 2026-08-27, six times; OBSERVED output below, verbatim.
One of them PROVED NOTHING on its first attempt and is recorded as what it
was, because a sabotage aimed at a line that is not load-bearing is a green
run that means nothing.

S1 -- the bubble monotonicity guard removed, i.e. the original defect put
back:

    - envelope02: the drawn bubble curve FALLS, 334.703 K at 17.000 bar to 266.011 K at 18.000 bar.  A bubble temperature cannot drop as pressure rises; that point is on another root
    - envelope02 reports a cricondentherm.  Its highest kept dew point is the ENDPOINT left by the discarded jump

S2 -- the dew continuity guard removed:

    - envelope02: a drawn dew step is 172.1x its immediate predecessor (86.929 K after 0.505 K) -- a jump, not a curve

S3 -- a root jump reported through the turning-point branch instead:

    - envelope02's branches jump root and the run does not say so -- a discarded point that is not explained reads as a mixture that simply ends there

S4 -- **PROVED NOTHING.**  It removed `if (best == 0 || best + 1 >= size)
return;`, which reads like the endpoint guard and is not: the search loop
runs over interior indices only, so `best` can never BE an endpoint and the
line is redundant.  The gate stayed green and the sabotage said nothing about
it.  A sabotage must attack the line the behaviour rests on, and finding
which one that is is the work.

S4b -- the same intent against the load-bearing guard, the comparison with
both neighbours:

    - envelope02 reports a cricondentherm.  Its highest kept dew point is the ENDPOINT left by the discarded jump, not an interior maximum -- this is exactly the false 371.492 K the first version published

S5 -- an empty branch routed through the stopped-branch report.  Note the
first line: it does not merely misreport, it reads `b.pts.back()` on an empty
vector and the run dies of a signal:

    - envelope01 did not run (exit -11)
    - envelope01's bubble branch produces no point at all, and the run does not distinguish that from a branch that STOPPED

S6 -- the unclosed-nose statement softened in the header:

    - the unclosed nose is not named with the algorithm that would close it and the statement that it is a different algorithm -- otherwise a reader tries to tune it
"""

import re
import statistics
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
GAS = ROOT / "tutorials" / "props" / "molecular" / "envelope01_natural_gas"
JUMP = ROOT / "tutorials" / "props" / "molecular" / "envelope02_root_jump"
OP = ROOT / "src" / "propertyOps" / "PhaseEnvelope.cpp"


def run(case: Path):
    p = subprocess.run([str(BUILD / "choupoProps"), str(case)],
                       capture_output=True, text=True, timeout=900)
    return p.returncode, p.stdout + p.stderr


def curves(case: Path):
    """curve -> [(P, T)] read from the run's OWN csv, in file order."""
    hits = sorted(case.rglob("envelope.csv"))
    if not hits:
        return {}
    out = {}
    for line in hits[0].read_text().splitlines()[1:]:
        f = line.split(",")
        if len(f) == 3:
            out.setdefault(f[2], []).append((float(f[0]), float(f[1])))
    return out


def main() -> int:
    fails, notes = [], []

    # ---- (g) one home for the dew residual -------------------------------
    src = OP.read_text()
    if "DewPoint::compute" not in src or "BubblePoint::compute" not in src:
        fails.append("the envelope op does not call BubblePoint::compute and"
                     " DewPoint::compute -- the saturation residuals must have"
                     " ONE home, or the envelope and the units draw two"
                     " slightly different curves with nothing to say which")
    if re.search(r"y\[i\]\s*/\s*K\[i\]", src) or re.search(r"x\[i\]\s*\*\s*K\[i\]", src):
        fails.append("the envelope op contains its own saturation residual --"
                     " a second home for sum(y_i/K_i) = 1")
    if not fails:
        notes.append("the saturation residuals have one home")

    for case, label in ((GAS, "envelope01"), (JUMP, "envelope02")):
        rc, out = run(case)
        if rc != 0:
            fails.append(f"{label} did not run (exit {rc})")
            continue
        cs = curves(case)

        # ---- (a) the bubble curve never falls ---------------------------
        bub = cs.get("bubble", [])
        for i in range(1, len(bub)):
            if bub[i][1] < bub[i-1][1]:
                fails.append(
                    f"{label}: the drawn bubble curve FALLS, {bub[i-1][1]:.3f}"
                    f" K at {bub[i-1][0]/1e5:.3f} bar to {bub[i][1]:.3f} K at"
                    f" {bub[i][0]/1e5:.3f} bar.  A bubble temperature cannot"
                    " drop as pressure rises; that point is on another root")
                break

        # ---- (b) the dew curve is continuous ----------------------------
        dew = cs.get("dew", [])
        #  A LOCAL test, not a global one, and deliberately not a copy of the
        #  op's own rule.  A dew curve legitimately takes large steps at low
        #  pressure and small ones near the nose, so comparing every step to
        #  the branch's GLOBAL median flags the honest steep start -- which is
        #  what the first version of this arm did on envelope01 (14.451 K
        #  against a median of 0.759).  What a root jump actually looks like
        #  is a step tens of times its IMMEDIATE neighbour, so that is what is
        #  measured.
        if len(dew) >= 4:
            steps = [abs(dew[i][1] - dew[i-1][1]) for i in range(1, len(dew))]
            worst, at = 0.0, 0
            for i in range(1, len(steps)):
                prev = max(steps[i-1], 1.0e-9)
                if steps[i] / prev > worst:
                    worst, at = steps[i] / prev, i
            if worst > 10.0:
                fails.append(
                    f"{label}: a drawn dew step is {worst:.1f}x its immediate"
                    f" predecessor ({steps[at]:.3f} K after"
                    f" {steps[at-1]:.3f} K) -- a jump, not a curve")
            else:
                notes.append(f"{label} dew steps within 10x their neighbour"
                             f" (worst {worst:.1f}x)")

    # ---- (c)(d)(e)(f) the announcements ---------------------------------
    rc, gas = run(GAS)
    rc2, jump = run(JUMP)

    if "never started" not in gas:
        fails.append("envelope01's bubble branch produces no point at all, and"
                     " the run does not distinguish that from a branch that"
                     " STOPPED -- the two have different remedies")
    else:
        notes.append("an empty branch is reported as never started")

    if "DIFFERENT ROOT" not in jump:
        fails.append("envelope02's branches jump root and the run does not say"
                     " so -- a discarded point that is not explained reads as"
                     " a mixture that simply ends there")
    elif "not a feature of the mixture" not in jump:
        fails.append("the root-jump report does not distinguish itself from a"
                     " turning point, so the reader takes the stopping"
                     " pressure for a property of the feed")
    else:
        notes.append("a root jump is reported as one, and not as a turning point")

    # ---- (e) both directions -------------------------------------------
    if "CRICONDENTHERM" not in gas:
        fails.append("envelope01's dew branch has an interior temperature"
                     " maximum and no cricondentherm is reported -- a detector"
                     " that never fires pins nothing")
    elif "BRACKETED" not in gas:
        fails.append("the cricondentherm is reported without saying it is a"
                     " BRACKETED maximum of the traced points; a reader takes"
                     " a refined extremum from it")
    else:
        notes.append("envelope01's interior maximum is reported, as bracketed")

    if "CRICONDENTHERM" in jump:
        fails.append("envelope02 reports a cricondentherm.  Its highest kept"
                     " dew point is the ENDPOINT left by the discarded jump,"
                     " not an interior maximum -- this is exactly the false"
                     " 371.492 K the first version published")
    else:
        notes.append("envelope02 claims no cricondentherm from a jump endpoint")

    if "Michelsen" not in gas or "not a tolerance" not in gas:
        fails.append("the unclosed nose is not named with the algorithm that"
                     " would close it and the statement that it is a different"
                     " algorithm -- otherwise a reader tries to tune it")
    else:
        notes.append("the unclosed nose names Michelsen (1980)")

    if fails:
        print("check_phase_envelope: FAILED")
        for f in fails:
            print("  -", f)
        return 1

    print("check_phase_envelope: OK -- " + "; ".join(notes) + "."
          "  NOT COVERED: no number in either witness is checked against a"
          " MEASURED envelope (the feeds are plausible, not sampled, and the"
          " K-values are Peng-Robinson over an ideal liquid) -- both are"
          " STRUCTURAL witnesses for what the op reports and refuses to"
          " report.  The nose itself is not drawn and the critical point is"
          " not located.  The continuity thresholds are sized for the"
          " discontinuous kind of root jump; one inside the noise of the"
          " branch's own steps would pass unseen.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
