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
"""check_phase_speciation -- the aqueous speciation must name its phase.

THE BUG THIS GUARDS.  A stream's `speciation {}` block used to sit at the top
level, beside `componentMolarFlows` -- which is the OVERALL material, every
phase -- and the reader verified its closure against that overall.  The ions
are in the AQUEOUS phase and nowhere else.

Two live instances, and both passed every test in the suite:

  flash17  the check closes to 2e-12, BY LUCK OF THE DECLARATION: that case's
           organic admits `members ( benzene ethanol )`, no acid, so "total
           acetic" and "aqueous acetic" are the same number.  91.1 % of its
           benzene sat in a phase the file could not mention.

  flash16  58.9 % of the calcium is SOLID calcite, and the mineral sat among
           the aqueous species -- a crystal reported as a dissolved one --
           because without it the block described less matter than the stream
           carried and the closure check said so.

What is asserted:

  1. THE POSITIVE.  Both cases write the nested form, carry no top-level
     block, and their decompositions sum back to the overall exactly.  Output
     that silently reverted to the flat form would pass every KPI test there
     is.
  2. flash16's aqueous phase holds the DISSOLVED calcium only, and the
     calcite is a solid phase -- with the apparent total untouched.
  3. FOUR REFUSALS, each fired through the real reader (choupo-lint on a
     scratch case), never asserted from the source text.

CASE (d) IS THE ONE THAT MATTERS.  (a), (b) and (c) are STRUCTURE: which
block sits where.  Structure survives the fix being reverted -- putting the
reader's basis back to `overall` leaves all three passing, which was verified
by sabotage before this file was wired in.  Only (d) exercises the check
itself: it moves acid out of the aqueous phase without touching the overall
material or the block, so only a reader checking against the carrying phase
can refuse it.

Exit 0 = all hold.  Exit 1 = a named failure.
"""

import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FLASH = os.path.join(ROOT, "tutorials", "steady", "flash")
LIQ17 = os.path.join(FLASH, "flash17_two_liquids_reactive", "converged", "liquid")
LIQ16 = os.path.join(FLASH, "flash16_calcite_precipitation", "converged", "liquid")
LINT = os.path.join(ROOT, "bin", "choupo-lint")
NUM = re.compile(r"(\w+)\s+([-\d.eE+]+)\s+kmol/h;")
ACID = "aceticAcid"

fails = []


def fail(msg):
    fails.append(msg)
    print("FAIL  " + msg)


def ok(msg):
    print("  ok   " + msg)


def phase_amounts(text, phase):
    """The componentMolarFlows of one named phase, speciation excluded."""
    m = re.search(r"\n    %s\n    \{\n(.*?)\n    \}\n" % phase, text, re.S)
    if not m:
        return None
    body = m.group(1).split("speciation")[0]
    return {k: float(v) for k, v in NUM.findall(body)}


def overall_of(text):
    return {k: float(v) for k, v in
            NUM.findall(text.split("\nphases")[0].split("componentMolarFlows", 1)[1])}


for path, label in ((LIQ17, "flash17"), (LIQ16, "flash16")):
    if not os.path.exists(path):
        print("SKIP  %s has no converged/ -- run the case first" % label)
        sys.exit(0)

raw17, raw16 = open(LIQ17).read(), open(LIQ16).read()

# ---------------------------------------------------------------------------
#  1. THE POSITIVE -- the nested form, and a decomposition that closes.
# ---------------------------------------------------------------------------
for raw, label, phases in ((raw17, "flash17", ("aqueous", "organic")),
                           (raw16, "flash16", ("aqueous", "solid"))):
    if "\nphases" not in raw:
        fail("%s has NO phases{} block: its phases are unnameable again and "
             "the speciation is back on the overall material" % label)
        continue
    if re.search(r"^speciation$", raw, re.M):
        fail("%s carries a TOP-LEVEL speciation beside its phases{}: the "
             "block must live inside phases.aqueous" % label)
    overall = overall_of(raw)
    got = {p: phase_amounts(raw, p) for p in phases}
    missing = [p for p, v in got.items() if v is None]
    if missing:
        fail("%s does not name the phase(s) %s" % (label, ", ".join(missing)))
        continue
    worst, worst_c = 0.0, ""
    for c, tot in overall.items():
        err = abs(tot - sum(v.get(c, 0.0) for v in got.values()))
        if err > worst:
            worst, worst_c = err, c
    scale = max(abs(v) for v in overall.values())
    if worst > 1e-9 * max(scale, 1.0):
        fail("%s: the phase decomposition does not sum back to the overall "
             "material -- worst '%s' off by %.3e kmol/h" % (label, worst_c, worst))
    else:
        ok("%s: nested form, %s, closes (worst %s %.1e kmol/h)"
           % (label, " + ".join(phases), worst_c, worst))

# ---------------------------------------------------------------------------
#  2. flash16 -- the crystal is a PHASE, and the apparent total is untouched.
# ---------------------------------------------------------------------------
aq16, sol16 = phase_amounts(raw16, "aqueous"), phase_amounts(raw16, "solid")
if aq16 is None or sol16 is None:
    fail("flash16 does not name both an aqueous and a solid phase -- the "
         "precipitate is back among the dissolved species")
else:
    if re.search(r"\bcalcite\b", raw16):
        fail("flash16 still reports 'calcite' by mineral name in the stream "
             "file: a crystal is a PHASE of its owning component (CaCO3), not "
             "an aqueous species")
    else:
        ok("flash16: the mineral is a solid phase of CaCO3, not a species row")
    solid = sol16.get("CaCO3", 0.0)
    aq = aq16.get("CaCO3", 0.0)
    total = overall_of(raw16).get("CaCO3", 0.0)
    if solid <= 0.0:
        fail("flash16 precipitates NOTHING -- a case named "
             "'calcite_precipitation' with an empty solid phase is not "
             "exercising this at all")
    elif abs(total - solid - aq) > 1e-9 * max(total, 1.0):
        fail("flash16: the CaCO3 apparent total (%.8f) is not the aqueous "
             "(%.8f) plus the solid (%.8f) -- the material changed, not just "
             "its phase" % (total, aq, solid))
    else:
        ok("flash16: CaCO3 %.5f = aqueous %.5f (%.1f %%) + solid %.5f (%.1f %%), "
           "apparent total untouched"
           % (total, aq, aq / total * 100.0, solid, solid / total * 100.0))

# ---------------------------------------------------------------------------
#  3. THE REFUSALS -- fired through the real reader.
# ---------------------------------------------------------------------------
def lint_refuses(label, mutate, expect, case="flash17_two_liquids_reactive",
                 raw=None):
    tmp = tempfile.mkdtemp(prefix="phasespec.")
    try:
        dst = os.path.join(tmp, "case")
        shutil.copytree(os.path.join(FLASH, case), dst)
        for junk in ("converged", "reports"):
            shutil.rmtree(os.path.join(dst, junk), ignore_errors=True)
        with open(os.path.join(dst, "0", "liquid"), "w") as f:
            f.write(mutate(raw))
        r = subprocess.run([LINT, dst], capture_output=True, text=True)
        out = (r.stdout or "") + (r.stderr or "")
        if r.returncode == 0:
            fail("%s -- ACCEPTED.  The reader must refuse this." % label)
        elif expect not in out:
            fail("%s -- refused, but for the wrong reason.  Expected %r; got: %s"
                 % (label, expect, out.strip()[-300:]))
        else:
            ok("%s -- refused, naming it" % label)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def dup_top_level(t):
    spec = ("\nspeciation\n{\n    network   ( aceticAcid );\n"
            "    basis     stoichiometric;\n    HAc    0.09324022498 kmol/h;\n}\n")
    head, rest = t.split("\nphases", 1)
    return head + spec + "\nphases" + rest


def add_to_organic(t):
    return t.replace(
        "    organic\n    {\n        componentMolarFlows",
        "    organic\n    {\n        speciation\n        {\n"
        "            network   ( aceticAcid );\n"
        "            basis     stoichiometric;\n"
        "            HAc    0.0 kmol/h;\n        }\n"
        "        componentMolarFlows", 1)


def drop_aqueous_spec(t):
    return re.sub(r"\n *speciation\n *\{.*?\n *\}\n", "\n", t, count=1, flags=re.S)


def spec_on_organic_only(t):
    #  The aqueous block must go FIRST, or the two-phase refusal fires before
    #  this one is ever reached.  Found the first time this gate ran: a
    #  negative test that trips an EARLIER refusal proves that refusal, not
    #  the one it was written for.
    return add_to_organic(drop_aqueous_spec(t))


def acid_into_organic(t):
    """Move a quarter of the acid out of the aqueous phase.

    The OVERALL material is untouched, so the decomposition still sums; the
    speciation block is untouched, so it still accounts for ALL the acid.
    Against the overall it therefore closes -- and the aqueous phase no
    longer holds what its own block claims."""
    head, rest = t.split("\nphases", 1)
    aq_part, org_part = rest.split("    organic", 1)
    m = re.search(r"(%s\s+)([-\d.eE+]+)(\s+kmol/h;)" % ACID, aq_part)
    if not m:
        return t
    full = float(m.group(2))
    aq_part = (aq_part[:m.start()] + m.group(1) + repr(full * 0.75)
               + m.group(3) + aq_part[m.end():])
    org_part = org_part.replace(
        "componentMolarFlows\n        {",
        "componentMolarFlows\n        {\n            %s    %s kmol/h;"
        % (ACID, repr(full * 0.25)), 1)
    return head + "\nphases" + aq_part + "    organic" + org_part


if not os.path.exists(LINT):
    fail("bin/choupo-lint not found -- the refusals cannot be fired for real, "
         "and asserting them from the source text would prove nothing")
elif "\nphases" not in raw17:
    fail("flash17 has no phases{} -- the refusals have nothing to mutate")
else:
    lint_refuses("(a) top-level block beside phases.aqueous",
                 dup_top_level, "belongs INSIDE it", raw=raw17)
    lint_refuses("(b) speciation on the organic phase alone",
                 spec_on_organic_only, "no ion network to decompose", raw=raw17)
    lint_refuses("(c) two phases each carrying a speciation",
                 add_to_organic, "two accounts of the same chemistry", raw=raw17)
    #  The decisive one -- see the module docstring.
    lint_refuses("(d) the aqueous phase no longer holds the acid its "
                 "speciation claims",
                 acid_into_organic, "the AQUEOUS phase", raw=raw17)

print()
if fails:
    print("%d failure(s)." % len(fails))
    sys.exit(1)
print("phase-speciation gate: every block names its phase, the crystal is a "
      "phase and not a species, and the reader refuses each way of being vague.")
sys.exit(0)
