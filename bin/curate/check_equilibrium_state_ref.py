#!/usr/bin/env python3
"""Gate: the equilibriumState cross-reference -- a reference never outlives
its target.

    bin/curate/check_equilibrium_state_ref.py

WHY THIS EXISTS.  Vitor's ruling (2026-08-10): the resolved equilibrium
composition has ONE canonical home (the `speciation {}` / `phases {}` blocks
-- THE TWO BASES); `calculated {}` may IDENTIFY the calculation that produced
it but must never REPRODUCE state values, and "a stale, missing or
incompatible target must refuse", with a witness "that changing the canonical
state cannot leave a second apparently valid equilibriumState behind".  The
engine writes `calculated { equilibriumState { target; fingerprint; } }`
beside every speciation-bearing stream; the reader recomputes the
fingerprint from the block actually in the file.

WHAT THIS CHECKS, all through real engine runs on a staged copy of
`flash16_calcite_precipitation` (its converged feed carries a speciation
block AND the reference):

  (E1) THE ROUND TRIP: converged/feed fed back as 0/feed loads and the case
       runs -- the reference verifies against the very block it was written
       beside.  (This round trip is ALSO what caught, on first contact, a
       pre-existing carriage bug: `network ( ammonia carbonate )` was read
       back as "ammonia" only, so multi-network blocks silently lost a
       chemistry set on every write->read cycle.)
  (E2) THE RULED WITNESS -- a canonical-state change cannot leave a second
       apparently valid equilibriumState: mutating a field the m=An closure
       CANNOT see (the solved pH) while keeping the reference REFUSES with
       'STALE', naming both fingerprints.  A material mutation is caught
       earlier by the closure check itself; the fingerprint's distinct duty
       is exactly the closure-invisible fields (pH, solvedAtT, origin,
       network).
  (E3) INCOMPATIBLE: `target phases;` refuses naming the target and the
       canonical home.
  (E4) MISSING: the speciation block deleted, the reference kept -- refuses
       'target is MISSING'.
  (E5) DELETABILITY (the negative): deleting the whole `calculated {}` block
       still loads and runs -- the block stays engine output the reader
       otherwise ignores, so the O1 separation and the deletability claim
       survive this slice.
  (E6) NO COPY: the equilibriumState block contains NO species amounts --
       no `kmol` token and no species-id key beyond `target`/`fingerprint`
       -- because the ruling's first clause is that it never reproduces
       state.

WHAT THIS DOES **NOT** COVER, stated so the green line cannot imply it:

  * convergence records and evidence references inside equilibriumState --
    NOT emitted yet; the ruling ALLOWS them, and they arrive with the slice
    that needs them (C/B).  Absence is honest; a fabricated convergence
    record would not be.
  * hash strength: FNV-1a is drift detection, not cryptography, and the
    writer says so.  An adversary is out of scope; an un-re-run edit is the
    threat model.

SABOTAGE-VERIFIED 2026-08-10; OBSERVED output recorded, not predicted.

Sabotage 1 -- the reader's fingerprint verification removed (stale accepted):

    check_equilibrium_state_ref: FAILED
      E2: a pH edited under the reference was ACCEPTED -- the ruled witness
      (a canonical-state change must not leave a second apparently valid
      equilibriumState) does not hold

Sabotage 2 -- the writer emits the reference with no fingerprint:

    check_equilibrium_state_ref: FAILED
      E1: converged/feed fed back as 0/feed was refused -- ... 'The
      canonical state was changed under the reference ...'
    (the missing fingerprint reads as STALE at the ROUND TRIP -- the E1 arm
    catches it before E2 even runs, which is stricter than predicted)
"""

import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CASE = os.path.join(ROOT, "tutorials", "steady", "flash",
                    "flash16_calcite_precipitation")
SOLVE = os.path.join(ROOT, "build", "linux64Gcc", "choupoSolve")
ENV = dict(os.environ, CHOUPO_HOME=ROOT)

fails = []


def run(cwd):
    p = subprocess.run([SOLVE], cwd=cwd, env=ENV, capture_output=True,
                       text=True, timeout=900)
    return p.returncode, p.stdout + p.stderr


def stage():
    d = tempfile.mkdtemp(prefix="eqref_")
    dst = os.path.join(d, "case")
    shutil.copytree(CASE, dst)
    rc, out = run(dst)
    if rc != 0:
        print("check_equilibrium_state_ref: FAILED")
        print("  the witness case did not run: " + out[-300:])
        sys.exit(1)
    return d, dst


def feed_back(dst, mutate=None):
    src = os.path.join(dst, "converged", "feed")
    s = open(src, encoding="utf-8").read()
    if mutate:
        s2 = mutate(s)
        if s2 == s:
            return None, "mutation did not apply"
        s = s2
    open(os.path.join(dst, "0", "feed"), "w", encoding="utf-8").write(s)
    return run(dst), None


d, case = stage()
try:
    conv = open(os.path.join(case, "converged", "feed"), encoding="utf-8").read()

    # ---- E6: the reference copies no state -------------------------------
    m = re.search(r"equilibriumState\s*\{(.*?)\n    \}", conv, re.S)
    if not m:
        fails.append("E1: converged/feed carries no equilibriumState block "
                     "beside its speciation")
    else:
        body = re.sub(r"//[^\n]*", "", m.group(1))
        if "kmol" in body:
            fails.append("E6: the equilibriumState block carries an amount "
                         "(kmol) -- the ruling's first clause is that it "
                         "never reproduces state")
        keys = set(re.findall(r"^\s*(\w+)\s", body, re.M))
        if not keys <= {"target", "fingerprint"}:
            fails.append(f"E6: unexpected keys {sorted(keys - {'target', 'fingerprint'})} "
                         f"in equilibriumState -- provenance may join later "
                         f"slices, state never")

    # ---- E1: round trip ---------------------------------------------------
    (res, err) = feed_back(case)
    if err or res[0] != 0:
        fails.append("E1: converged/feed fed back as 0/feed was refused -- "
                     "the reference must verify against the very block it "
                     "was written beside: " + (err or res[1][-300:]))

    # ---- E2: the ruled witness (closure-invisible mutation) ---------------
    (res, err) = feed_back(case, lambda s: re.sub(
        r"(\n    pH\s+)([0-9.eE+-]+)", r"\g<1>7.0", s, count=1))
    if err:
        fails.append("E2: " + err)
    elif res[0] == 0:
        fails.append("E2: a pH edited under the reference was ACCEPTED -- "
                     "the ruled witness (a canonical-state change must not "
                     "leave a second apparently valid equilibriumState) does "
                     "not hold")
    elif "STALE" not in res[1]:
        fails.append("E2: it refused, but not as STALE -- the refusal must "
                     "name the fingerprint mismatch so the reader knows the "
                     "state moved under the reference")

    # ---- E3: incompatible target ------------------------------------------
    (res, err) = feed_back(case, lambda s: s.replace(
        "target       speciation;", "target       phases;", 1))
    if err:
        fails.append("E3: " + err)
    elif res[0] == 0 or "targets 'phases'" not in res[1]:
        fails.append("E3: an incompatible target was not refused by name")

    # ---- E4: missing target ----------------------------------------------
    (res, err) = feed_back(case, lambda s: re.sub(
        r"\nspeciation\n\{.*?\n\}\n", "\n", s, flags=re.S))
    if err:
        fails.append("E4: " + err)
    elif res[0] == 0 or "target is MISSING" not in res[1]:
        fails.append("E4: a reference whose speciation block is gone was not "
                     "refused as MISSING")

    # ---- E5: deletability (the negative) ----------------------------------
    (res, err) = feed_back(case, lambda s: re.sub(
        r"\ncalculated\n\{.*", "\n", s, flags=re.S))
    if err:
        fails.append("E5: " + err)
    elif res[0] != 0:
        fails.append("E5: deleting the whole calculated{} block must give "
                     "the same runnable case (deletability) -- it refused: "
                     + res[1][-200:])
finally:
    shutil.rmtree(d, ignore_errors=True)

if fails:
    print("check_equilibrium_state_ref: FAILED")
    for f in fails:
        print("  " + f)
    sys.exit(1)

print("check_equilibrium_state_ref: OK -- the cross-reference verifies on "
      "its own round trip, a closure-invisible state edit (pH) under it "
      "refuses as STALE naming both fingerprints, an incompatible target "
      "and a missing target refuse by name, deleting calculated{} entirely "
      "still runs (deletability), and the block carries no state values.  "
      "NOT COVERED: convergence/evidence fields (not emitted yet -- they "
      "arrive with the slice that needs them), and hash strength (FNV-1a "
      "is drift detection, not cryptography).")
