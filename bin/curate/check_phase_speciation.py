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
phase.  The reader verified the block's closure against that overall.  But the
ions are in the AQUEOUS phase and nowhere else.

In `flash17_two_liquids_reactive` the old check passes to 2e-12 -- and it
passes by LUCK OF THE DECLARATION: that case's organic admits
`members ( benzene ethanol )`, no acid, so "total acetic" and "aqueous acetic"
are the same number.  Section 1 below removes that luck arithmetically and
shows the two verdicts diverge: against the TOTAL the drifted block still
closes, against the AQUEOUS phase it does not.  A check written to catch
drift, waving drift through.

What is asserted:

  1. THE DIVERGENCE ITSELF.  Move acid into the organic phase.  The top-level
     basis (overall) accepts a block that the aqueous basis refuses.  If this
     stops diverging, the two bases have become the same thing and the rest of
     this gate is measuring nothing.
  2. THE POSITIVE.  flash17's own converged/liquid carries the nested form,
     carries NO top-level speciation, and its decomposition sums back to the
     overall material exactly.  A run whose output silently reverted to the
     flat form would pass every KPI test in the suite.
  3. THREE REFUSALS, each actually fired through the real reader (choupo-lint
     on a scratch case), never asserted from the source text:
       a. a top-level block beside a phases{} naming an aqueous phase;
       b. a block hung on the ORGANIC phase, which has no ion network;
       c. two phases each carrying one.

Exit 0 = all hold.  Exit 1 = a named failure.
"""

import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CASE = os.path.join(ROOT, "tutorials", "steady", "flash",
                    "flash17_two_liquids_reactive")
LIQ = os.path.join(CASE, "converged", "liquid")
NUM = re.compile(r"(\w+)\s+([-\d.eE+]+)\s+kmol/h;")

fails = []


def fail(msg):
    fails.append(msg)
    print("FAIL  " + msg)


def ok(msg):
    print("  ok   " + msg)


# ---------------------------------------------------------------------------
#  Parse the reference stream file into (overall, aqueous, organic, species).
# ---------------------------------------------------------------------------
def parse(text):
    head, rest = text.split("\nphases", 1)
    overall = {k: float(v) for k, v in NUM.findall(
        head.split("componentMolarFlows", 1)[1])}
    aq_part, org_part = rest.split("organic", 1)
    aq_cmf = aq_part.split("speciation")[0]
    aqueous = {k: float(v) for k, v in NUM.findall(aq_cmf)}
    organic = {k: float(v) for k, v in NUM.findall(org_part)}
    spec_txt = aq_part.split("speciation", 1)[1] if "speciation" in aq_part else ""
    species = {k: float(v) for k, v in NUM.findall(spec_txt)}
    return overall, aqueous, organic, species


if not os.path.exists(LIQ):
    print("SKIP  flash17 has no converged/ -- run the case first "
          "(bin/runCase tutorials/steady/flash/flash17_two_liquids_reactive)")
    sys.exit(0)

raw = open(LIQ).read()

# ---------------------------------------------------------------------------
#  2. THE POSITIVE -- the written form is the nested one.
# ---------------------------------------------------------------------------
if "\nphases" not in raw:
    fail("flash17 converged/liquid has NO phases{} block: the two liquids are "
         "back to being unnameable, and the speciation is hung on the overall "
         "material again")
    print("\n%d failure(s)." % len(fails))
    sys.exit(1)

if re.search(r"^speciation$", raw, re.M):
    fail("flash17 converged/liquid carries a TOP-LEVEL speciation block "
         "alongside its phases{}: the block must live inside phases.aqueous, "
         "which is the material it describes")

overall, aqueous, organic, species = parse(raw)
ok("nested form written (phases{ aqueous{ ...speciation } organic{} })")

worst, worst_c = 0.0, ""
for c, tot in overall.items():
    err = abs(tot - aqueous.get(c, 0.0) - organic.get(c, 0.0))
    if err > worst:
        worst, worst_c = err, c
scale = max(abs(v) for v in overall.values())
if worst > 1e-9 * max(scale, 1.0):
    fail("the phase decomposition does not sum back to the overall material: "
         "worst '%s' off by %.3e kmol/h" % (worst_c, worst))
else:
    ok("decomposition closes (worst %s: %.1e kmol/h)" % (worst_c, worst))

#  The split must be REAL.  A gate that passes on an organic holding nothing
#  would survive the phase disappearing, which is the failure it exists for.
org_frac = sum(organic.values()) / max(sum(overall.values()), 1e-300)
if org_frac <= 0.0:
    fail("the organic phase holds NOTHING -- a decomposition of one phase "
         "into itself proves nothing about the two-liquid path")
else:
    ok("organic phase is real (%.2f %% of the liquid; %.1f %% of the benzene)"
       % (org_frac * 100.0,
          organic.get("benzene", 0.0) / max(overall.get("benzene", 1e-300), 1e-300) * 100.0))

# ---------------------------------------------------------------------------
#  1. THE DIVERGENCE -- remove the luck and watch the two bases disagree.
#
#  The speciation totals stay as they are (the block "has not been re-run");
#  what moves is the MATERIAL: some acid steps into the organic phase, exactly
#  what flash17's declaration currently forbids.  Against the OVERALL that
#  block still closes -- the acid is still in the stream.  Against the AQUEOUS
#  phase it must not: the aqueous no longer holds it all.
# ---------------------------------------------------------------------------
ACID = "aceticAcid"
if ACID not in overall:
    fail("flash17 no longer carries %s -- this gate's arithmetic assumed it"
         % ACID)
else:
    #  m = A n through the one declared bridge (acetic -> Acetate, nu = +1);
    #  the block's own collapse is HAc + Acetate (H/OH are mediators).
    block_total = species.get("HAc", 0.0) + species.get("Acetate", 0.0)
    moved = 0.25 * overall[ACID]
    aq_acid = overall[ACID] - moved              # a quarter steps into the organic

    err_overall = abs(block_total - overall[ACID])
    err_aqueous = abs(block_total - aq_acid)
    tol = 1e-6 * max(overall[ACID], 1e-30)

    if err_overall > tol:
        fail("the reference block does not even close against the overall "
             "(%.3e) -- the divergence test has no baseline" % err_overall)
    elif err_aqueous <= tol:
        fail("moving %.0f %% of the acid into the organic did NOT break the "
             "aqueous-basis check: the two bases no longer diverge, so the "
             "nested form is guarding nothing" % 25.0)
    else:
        ok("the two bases DIVERGE as they must: with a quarter of the acid in "
           "the organic, overall-basis error %.1e (accepts), aqueous-basis "
           "error %.1e (refuses)" % (err_overall, err_aqueous))

# ---------------------------------------------------------------------------
#  3. THREE REFUSALS -- fired through the real reader, not read off the source.
# ---------------------------------------------------------------------------
LINT = os.path.join(ROOT, "bin", "choupo-lint")


def lint_refuses(label, mutate, expect):
    """Build a scratch case whose 0/liquid carries `mutate(raw)` and require
       choupo-lint to REFUSE it, naming `expect`."""
    tmp = tempfile.mkdtemp(prefix="phasespec.")
    try:
        dst = os.path.join(tmp, "case")
        shutil.copytree(CASE, dst)
        for junk in ("converged", "reports"):
            shutil.rmtree(os.path.join(dst, junk), ignore_errors=True)
        with open(os.path.join(dst, "0", "liquid"), "w") as f:
            f.write(mutate(raw))
        r = subprocess.run([LINT, dst], capture_output=True, text=True)
        out = (r.stdout or "") + (r.stderr or "")
        if r.returncode == 0:
            fail("%s -- ACCEPTED.  The reader must refuse this; it is the "
                 "ambiguity the nested form exists to remove." % label)
        elif expect not in out:
            fail("%s -- refused, but for the wrong reason.  Expected text "
                 "%r; got: %s" % (label, expect, out.strip()[-300:]))
        else:
            ok("%s -- refused, naming it" % label)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


#  (a) a top-level block beside a phases{} that names the aqueous phase
def dup_top_level(t):
    spec = "\nspeciation\n{\n    network   ( aceticAcid );\n" \
           "    basis     stoichiometric;\n    HAc    0.09324022498 kmol/h;\n}\n"
    head, rest = t.split("\nphases", 1)
    return head + spec + "\nphases" + rest


#  Add a block to the organic phase, leaving the aqueous one alone.
def add_to_organic(t):
    return t.replace(
        "    organic\n    {\n        componentMolarFlows",
        "    organic\n    {\n        speciation\n        {\n"
        "            network   ( aceticAcid );\n"
        "            basis     stoichiometric;\n"
        "            HAc    0.0 kmol/h;\n        }\n"
        "        componentMolarFlows", 1)


#  Strip the aqueous phase's block, keeping its componentMolarFlows.
def drop_aqueous_spec(t):
    return re.sub(r"\n *speciation\n *\{.*?\n *\}\n", "\n", t, count=1,
                  flags=re.S)


#  (b) the block hung on the ORGANIC phase ONLY -- an organic liquid has no
#      ion network to decompose.  The aqueous block must be REMOVED first, or
#      the two-phase refusal (c) fires before this one ever gets a chance:
#      found by this gate on its first run, and worth keeping in mind -- a
#      negative test that trips an EARLIER refusal proves that refusal, not
#      the one it was written for.
def spec_on_organic_only(t):
    return add_to_organic(drop_aqueous_spec(t))


#  (c) two phases each carrying one
def spec_on_both(t):
    return add_to_organic(t)


if not os.path.exists(LINT):
    fail("bin/choupo-lint not found -- the refusals cannot be fired for real, "
         "and asserting them from the source text would prove nothing")
else:
    lint_refuses("(a) top-level block beside phases.aqueous",
                 dup_top_level, "belongs INSIDE it")
    lint_refuses("(b) speciation on the organic phase alone",
                 spec_on_organic_only, "no ion network to decompose")
    lint_refuses("(c) two phases each carrying a speciation",
                 spec_on_both, "two accounts of the same chemistry")

    #  (d) THE DECISIVE ONE.  Everything above is STRUCTURE: which block sits
    #  where.  Structure survives the fix being reverted -- put the reader's
    #  basis back to `overall` and (a), (b), (c) all still pass, because they
    #  never exercise the check itself.  That was verified by sabotage, and it
    #  is why this case exists.
    #
    #  Move a quarter of the acid from the aqueous phase into the organic.
    #  The OVERALL material is untouched, so the phase decomposition still
    #  sums; the speciation block is untouched, so it still accounts for ALL
    #  the acid.  Against the overall it therefore closes -- and the aqueous
    #  phase no longer holds what it claims.  Only a reader checking the block
    #  against the phase that carries it can refuse this.
    def acid_into_organic(t):
        head, rest = t.split("\nphases", 1)
        aq_part, org_part = rest.split("    organic", 1)
        m = re.search(r"(%s\s+)([-\d.eE+]+)(\s+kmol/h;)" % ACID, aq_part)
        if not m:
            return t                      # no acid in the aqueous: nothing to move
        full = float(m.group(2))
        aq_part = aq_part[:m.start()] + m.group(1) + repr(full * 0.75) \
                + m.group(3) + aq_part[m.end():]
        org_part = org_part.replace(
            "componentMolarFlows\n        {",
            "componentMolarFlows\n        {\n            %s    %s kmol/h;"
            % (ACID, repr(full * 0.25)), 1)
        return head + "\nphases" + aq_part + "    organic" + org_part

    lint_refuses("(d) the aqueous phase no longer holds the acid its "
                 "speciation claims",
                 acid_into_organic, "the AQUEOUS phase")

print()
if fails:
    print("%d failure(s)." % len(fails))
    sys.exit(1)
print("phase-speciation gate: the block names its phase, and the reader "
      "refuses every way of being vague about which.")
sys.exit(0)
