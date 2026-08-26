#!/usr/bin/env python3
"""Second-liquid gate: the reactive path's TWO-liquid answer is really two
liquids, and the equality that ties them holds at the answer.

WHY THIS EXISTS.  A golden-master KPI check cannot see this.  The two liquids
leave as ONE apparent liquid stream -- deliberately, the split is internal
state like the speciation's ions -- so every stream number, every KPI and the
whole mass balance would look exactly the same if the organic phase silently
stopped forming and the case quietly reverted to one liquid.  The first build
of this slice did precisely that: it reported |r| = 7.7e-10, a perfectly
converged-looking answer, on a state whose organic phase did not exist.

So this gate reads what only the announcement can tell it:

  1. the phase decision is TAKEN and announced, and lands on PRESENT;
  2. the answer carries a real organic phase -- a non-trivial fraction of the
     liquid, and a composition genuinely different from the aqueous one (two
     phases of the same composition is one phase wearing two names, which is
     the K = 1 saddle this repository documents elsewhere);
  3. ln(a_org / a_aq) is at MACHINE ZERO for every member.  This is the
     equilibrium itself, printed.  If it is not zero the split is not
     converged, whatever the outer residual says -- and an inner solve
     converged to only a few digits is noise under the outer Newton's
     finite-difference Jacobian, which is exactly what made three earlier
     designs stall;
  4. the saturation pre-check uses the DECLARED phases: the same feed above
     its three-phase bubble pressure must report a subsaturated liquid with
     no vapour, at a Sum p_eq near 0.36 atm.  Computed on ONE liquid that sum
     comes out near 16 atm -- an error large enough to wave the case into a
     Newton hunting a vapour that is not there.

Contract: docs/design/reactive-second-liquid-proposal.md section 14.
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "choupoSolve"
CASE = ROOT / "tutorials/steady/flash/flash17_two_liquids_reactive"

bad = []


def run(case):
    p = subprocess.run([str(SOLVE), str(case)],
                       capture_output=True, text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr


rc, out = run(CASE)
if rc != 0:
    bad.append(f"{CASE.name}: exited {rc} -- the three-phase reactive flash "
               f"must solve.  Output:\n" + out[-2500:])
else:
    #  ---- 1. the decision is announced and lands on PRESENT ----------------
    if not re.search(r"\[phases\] declared second liquid on the feed: PRESENT",
                     out):
        bad.append("the phase decision is not announced as PRESENT on the "
                   "feed -- either the split stopped forming or the "
                   "announcement stopped printing; both are silent here")

    #  ---- 2. a REAL organic phase at the answer ---------------------------
    m = re.search(r"second liquid \(organic\): ([0-9.]+) % of the backbone",
                  out)
    if not m:
        bad.append("the answer reports no organic phase -- the case declares "
                   "two liquids and the numbers came from one, which is the "
                   "failure mode no stream number can show")
    else:
        frac = float(m.group(1))
        if not (0.1 < frac < 99.0):
            bad.append(f"organic phase is {frac} % of the backbone liquid -- "
                       f"outside any physical reading of this feed")

    #  ---- 2b/3. composition really differs, and the activities agree ------
    rows = re.findall(r"^\s+(\w+)\s+([0-9.eE+-]+)\s+([0-9.eE+-]+)"
                      r"\s+([0-9.eE+-]+)\s*$", out, re.M)
    rows = [r for r in rows if r[0] in ("benzene", "ethanol")]
    if len(rows) != 2:
        bad.append("the two-liquid table did not print both members "
                   "(benzene, ethanol) -- it is the only place the equality "
                   "of activity is visible")
    for name, xorg, xaq, lnratio in rows:
        if abs(float(xorg) - float(xaq)) < 1.0e-6:
            bad.append(f"{name}: x_org = {xorg} and x_aq = {xaq} are the same "
                       f"composition -- that is the TRIVIAL root (one phase "
                       f"wearing two names), not a split")
        if abs(float(lnratio)) > 1.0e-8:
            bad.append(f"{name}: ln(a_org/a_aq) = {lnratio} at the answer -- "
                       f"the liquid-liquid equality is NOT satisfied, so the "
                       f"inner split is not converged whatever the outer "
                       f"residual reports")

    if not re.search(r"V/F = 0\.32", out):
        bad.append("V/F moved off 0.32 -- the reference three-phase answer "
                   "changed; re-record deliberately or find out why")

#  ---- 4. the pre-check accounts for the DECLARED phases -------------------
#  Same feed, raised above its three-phase bubble pressure: no vapour at all.
with tempfile.TemporaryDirectory() as td:
    sub = Path(td) / CASE.name
    shutil.copytree(CASE, sub)
    fd = sub / "system" / "flowsheetDict"
    fd.write_text(re.sub(r"P\s+0\.35\s+atm;", "P 0.50 atm;", fd.read_text()))
    for stale in ("converged", "reports"):
        if (sub / stale).exists():
            shutil.rmtree(sub / stale)
    rc2, out2 = run(sub)
    if rc2 != 0:
        bad.append(f"the same feed at 0.50 atm exited {rc2} -- a subsaturated "
                   f"two-liquid state is an answer, not a failure")
    else:
        m2 = re.search(r"subsaturated liquid at \(T,P\).*?sum p_eq = "
                       r"([0-9.]+) atm", out2, re.S)
        if not m2:
            bad.append("at 0.50 atm the case did not report a subsaturated "
                       "liquid -- the pre-check is summing partial pressures "
                       "over a liquid the case does not declare")
        elif not (0.30 < float(m2.group(1)) < 0.45):
            bad.append(f"pre-check Sum p_eq = {m2.group(1)} atm.  The "
                       f"three-phase value is ~0.36; a number in the tens is "
                       f"the single-liquid computation, with benzene priced "
                       f"at x ~ 1e-4 times a gamma ~ 1e3")

if bad:
    print("second-liquid gate FAILED:")
    for b in bad:
        print("  - " + b)
    sys.exit(1)

print("second-liquid gate: three phases with chemistry; organic phase real, "
      "activities equal to machine zero, pre-check on the declared phases")
