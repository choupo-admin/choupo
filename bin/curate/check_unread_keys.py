#!/usr/bin/env python3
# =============================================================================
#        \|/       C hemicals     | Open-source, glass-box chemical process simulator
#       \\|//      H eat-transfer | https://choupo.org
#      \\\|///     O perations    |
#       \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
#        \|/       P roperties    | Licence: GPL-3.0-or-later
#         |        O ptimization  |
#        /|\                      |
# -----------------------------------------------------------------------------
#     SPDX-License-Identifier: GPL-3.0-or-later
#     Credit and attribution: see AUTHORS
#     Required legal notices:  see NOTICE
# =============================================================================
"""check_unread_keys -- a key written and never read is a wrong answer.

THE BUG THIS GUARDS.  `murphreeEficiency 0.70;` -- one letter short -- parses
cleanly, sits in the operation dict, is never consulted, and the column runs
with the ideal-tray default.  Exit 0, nothing said, and the distillate toluene
moves 2.47 -> 0.94 kmol/h.  The student defends a purity they did not compute.

The project's own doctrine ("no silent crutch: the solver ANNOUNCES what it
does, never disguises it") was being broken one layer BELOW every unit
operation, by the dictionary itself.

WHAT MAKES THE DIAGNOSIS PRECISE.  The dict records two things: keys PRESENT
that a lookup consulted, and keys the CODE asked for whether present or not.
`murphreeEficiency` is present-but-unread; `murphreeEfficiency` is
asked-for-but-absent.  Edit distance 1 -- so the engine names the key the
author meant, because the unit's own code named it while looking and came away
empty.  No hand-kept list of legal names to drift from what the code reads.

What is asserted, on the real binary:

  1. IT FIRES.  A deliberately misspelt key in a scratch copy is reported by
     name, with the correct suggestion.  Without this the whole mechanism
     could be dead and every other assertion would still pass.
  2. IT SAYS WHAT IT COSTS.  The message must state that the run continued on
     the defaults -- "unused key" reads as tidiness; "the value you declared
     did nothing" is the actual news.
  3. THE NEGATIVE.  The unmodified case reports NOTHING.  A pass that warned
     about every key would satisfy (1) and be useless; only this says it does
     not cry wolf.
  4. THE CORPUS CARRIES ONLY THE EXPLAINED ONES.  The scan must find exactly
     the keys listed in EXPECTED below and no others, so a NEW dead key in a
     new case shows up as a failure here instead of scrolling past in a log.

(4) ANSWERED THE DESIGN QUESTION, AND CHANGED THE ANSWER.  This was built to
measure first and then escalate the announcement to a REFUSAL, which is what
the doctrine (declare -> verify -> refuse) usually calls for.  The measurement
said no.

The corpus's only dead keys are `bodyDiameter` and `numberOfTurns` on the two
cyclones of the plant tutorial -- and they are unread for a legitimate reason:
the Cyclone SHORT-CIRCUITS when its feed carries no solids ("nothing to
separate -- pass the gas through clean rather than fail") and returns before
reading its geometry.  The keys really did nothing; the unit really did
nothing; both are correct.

So a unit may lawfully leave its hardware keys unread, and a refusal would
break a case that is physically fine.  ANNOUNCE is the right level, not the
timid one -- and this is why, written down, so nobody re-opens it as an
oversight.  (It also surfaced a modelling gap worth its own decision: that
plant pins `RecoveredDust F = 0` as its expected answer, i.e. its cyclone
recovers nothing because the spray dryer hands it no entrained fines.)

Exit 0 = all hold.  Exit 1 = a named failure.
"""

import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SOLVER = os.path.join(ROOT, "choupoSolve")
WITNESS = os.path.join(ROOT, "tutorials", "steady", "distillation",
                       "column11_murphree")

fails = []


def fail(msg):
    fails.append(msg)
    print("FAIL  " + msg)


def ok(msg):
    print("  ok   " + msg)


def run(case):
    return subprocess.run([SOLVER, case], capture_output=True, text=True, cwd=ROOT)


#  Single-pass cache (2026-08-24): under bin/runTests the CORPUS ARM below
#  reads the suite's own case pass (env CHOUPO_SUITE_OUTPUTS -- the cached
#  file holds stdout+stderr merged, which is what this arm greps).  The
#  witness and negative arms above it ALWAYS run live -- they mutate a copy
#  and need a fresh run by construction.  Standalone invocations see no env
#  var; a case absent from the cache is run live, never silently skipped.
_CACHE = os.environ.get("CHOUPO_SUITE_OUTPUTS")


def corpus_output(case):
    if _CACHE:
        rel = os.path.relpath(case, ROOT).replace(os.sep, "__")
        f = os.path.join(_CACHE, rel + ".out")
        if os.path.isfile(f):
            return open(f, errors="replace").read()
    o = run(case)
    return o.stdout + o.stderr


if not os.path.exists(SOLVER):
    print("SKIP  no choupoSolve binary -- build first (make)")
    sys.exit(0)

# --- 1 + 2. it fires, and it says what it costs -----------------------------
tmp = tempfile.mkdtemp(prefix="unreadkeys-")
try:
    dst = os.path.join(tmp, "c")
    shutil.copytree(WITNESS, dst)
    fsd = os.path.join(dst, "system", "flowsheetDict")
    text = open(fsd, errors="replace").read()
    if "murphreeEfficiency" not in text:
        fail("the witness case no longer declares murphreeEfficiency -- this"
             " gate would be testing nothing")
    open(fsd, "w").write(text.replace("murphreeEfficiency", "murphreeEficiency"))

    r = run(dst)
    out = r.stdout + r.stderr
    if "murphreeEficiency" not in out:
        fail("a misspelt key ran SILENTLY -- the diagnostic did not fire at"
             " all (this is the original defect, back)")
    elif "murphreeEfficiency" not in out.split("murphreeEficiency", 1)[1][:400]:
        fail("the key was reported but no correction offered; the model looked"
             " for `murphreeEfficiency` and that is the whole point of"
             " tracking asked-for-but-absent keys")
    else:
        ok("a misspelt key is reported BY NAME, with the key the model looked"
           " for offered as the correction")

    if "did not compute" not in out and "no effect" not in out:
        fail("the message does not say what the slip COSTS -- 'unused key'"
             " reads as tidiness, not as a result the author did not compute")
    else:
        ok("the message states the cost: the run continued on the defaults")
finally:
    shutil.rmtree(tmp, ignore_errors=True)

# --- 3. the negative --------------------------------------------------------
r = run(WITNESS)
out = r.stdout + r.stderr
if "[dict]" in out:
    fail("the UNMODIFIED witness case reports dead keys: %s"
         % [l for l in out.splitlines() if "[dict]" in l][:3])
else:
    ok("NEGATIVE: the correctly-spelled case reports nothing -- it does not"
       " cry wolf")

# --- 4. the corpus is clean -------------------------------------------------
cases = []
for base, dirs, files in os.walk(os.path.join(ROOT, "tutorials")):
    ctrl = os.path.join(base, "system", "controlDict")
    if not os.path.exists(ctrl):
        continue
    dirs[:] = [d for d in dirs
               if d not in ("converged", "reports", "0", "constant", "system",
                            "postProcessing")]
    body = open(ctrl, errors="replace").read()
    body = re.sub(r"/\*.*?\*/", "", body, flags=re.S)
    body = re.sub(r"//[^\n]*", "", body)
    m = re.search(r"(?m)^\s*application\s+(\w+)", body)
    if m and m.group(1) == "choupoSolve":
        cases.append(base)

dead = []
for c in cases:
    for line in corpus_output(c).splitlines():
        if line.startswith("[dict]   "):
            dead.append((os.path.relpath(c, ROOT), line.strip()))

#  The EXPLAINED set: unit -> key, each unread for a reason stated in the
#  header above.  Anything outside it is a finding.
EXPECTED = {
    ("tutorials/plant/ChemicalPlantTutorial", "DRYING.CY", "bodyDiameter"),
    ("tutorials/plant/ChemicalPlantTutorial", "DRYING.CY", "numberOfTurns"),
    ("tutorials/plant/lithiumBrinePlant", "FINISHING.recoverer", "bodyDiameter"),
    ("tutorials/plant/lithiumBrinePlant", "FINISHING.recoverer", "numberOfTurns"),
    #  The economics sweep re-runs the same sugar plant, so it carries the
    #  same inert cyclone.  Listed explicitly rather than matched by unit
    #  name: an exemption keyed on "any DRYING.CY anywhere" would silently
    #  cover a future case that has a real reason to fail.
    ("tutorials/plant/sugarPlantEconomicsSweep", "DRYING.CY", "bodyDiameter"),
    ("tutorials/plant/sugarPlantEconomicsSweep", "DRYING.CY", "numberOfTurns"),
}

seen = set()
for c, line in dead:
    m = re.search(r"unit '([^']+)' operation\{\}: `([^`]+)`", line)
    if m:
        seen.add((c, m.group(1), m.group(2)))

print("\n  corpus: %d steady cases scanned, %d dead-key report(s), %d distinct"
      % (len(cases), len(dead), len(seen)))

unexpected = seen - EXPECTED
if unexpected:
    for c, u, k in sorted(unexpected):
        print("     NEW  %-46s %s: `%s`" % (c, u, k))
    fail("%d dead key(s) outside the explained set -- a declared value that did"
         " nothing, and nobody has said why" % len(unexpected))
else:
    ok("the corpus's dead keys are exactly the %d explained cyclone ones (the"
       " unit short-circuits on a solids-free feed, by design)" % len(EXPECTED))

missing = EXPECTED - seen
if missing:
    #  Not a failure: someone may have fixed the plant.  But say it, because a
    #  stale exemption is how an allow-list becomes a blindfold.
    print("  note: %d explained key(s) no longer reported -- if the plant was"
          " fixed, trim EXPECTED above." % len(missing))

print()
if fails:
    print("check_unread_keys: %d FAILURE(S)" % len(fails))
    sys.exit(1)
print("check_unread_keys: all hold")
sys.exit(0)
