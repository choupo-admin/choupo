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
  3. FIVE REFUSALS, each fired through the real reader (choupo-lint on a
     scratch case), never asserted from the source text -- including (e),
     a top-level block on a part-vapour stream, where `overall` is liquid
     PLUS vapour and there is nothing checkable to check it against.

CASES (d) AND (e) ARE THE ONES THAT MATTER.  (a), (b) and (c) are STRUCTURE: which
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


#  RUN THE CASES.  This gate reads converged/ output, so depending on someone
#  having produced it first makes the verdict depend on ORDER: the same tree
#  scored 328/0 and 327/1 on consecutive suite runs, which is a gate measuring
#  the schedule rather than the code.  It runs them itself -- a few seconds --
#  and a SKIP is then only possible when the binary is missing, which is a
#  fact worth saying out loud rather than passing over.
SOLVER = os.path.join(ROOT, "choupoSolve")
if not os.path.exists(SOLVER):
    print("SKIP  no choupoSolve binary -- build first (make)")
    sys.exit(0)
for case in ("flash17_two_liquids_reactive", "flash16_calcite_precipitation"):
    r = subprocess.run([SOLVER, os.path.join(FLASH, case)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        fail("%s does not run (exit %d) -- this gate reads its output, so a "
             "broken case is a blind gate, never a silent pass" % (case, r.returncode))
if fails:
    print("\n%d failure(s)." % len(fails))
    sys.exit(1)

for path, label in ((LIQ17, "flash17"), (LIQ16, "flash16")):
    if not os.path.exists(path):
        fail("%s produced no converged/ state even though it ran" % label)
        sys.exit(1)

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


def drop_nested_to_top(t):
    """The nested form flattened: speciation at the top, no phases{} block.

    Used to build the two-phase case, which must have NO phases block (that
    is the point: nothing names the aqueous phase) while still carrying a
    speciation."""
    head, rest = t.split("\nphases", 1)
    m = re.search(r"\n *speciation\n *\{.*?\n *\}\n", rest, re.S)
    spec = m.group(0) if m else ""
    spec = "\n".join(l[8:] if l.startswith(" " * 8) else l
                     for l in spec.split("\n"))
    return head + spec


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

    #  (e) THE PHASE BOUNDARY ONE OUT.  A stream that is part vapour with a
    #  TOP-LEVEL block: `overall` is liquid plus vapour and the ions are in
    #  the liquid, so there is nothing checkable to check it against.
    #
    #  This was reachable and reproduced: giving a reactive feed
    #  `vaporFraction 0.30` produced a block claiming ALL the acid in
    #  solution, at the pH of a fully-liquid stream -- the vapour fraction
    #  changing nothing -- because the post-solve pass speciates the material
    #  AS IT IS, as a liquid, and the closure check used the total on both
    #  sides.  The pass no longer writes one; the reader refuses one written
    #  by hand or carried in an old file.
    def two_phase_top_level(t):
        flat = drop_nested_to_top(t)
        return re.sub(r"(P\s+[\d.eE+]+ Pa;\n)", r"\1vaporFraction   0.30;\n",
                      flat, count=1)

    lint_refuses("(e) top-level block on a 30 % vapour stream",
                 two_phase_top_level, "% vapour", raw=raw17)

# ---------------------------------------------------------------------------
#  4. THE PSD RIDES WITH ITS POPULATION, and the first law comes back.
#
#  Two things landed this week with nothing guarding them, which is the same
#  as not having landed: a regression would revert either in silence and every
#  KPI would stay green, because KPIs read neither stream files nor duties.
# ---------------------------------------------------------------------------
CRYST = os.path.join(ROOT, "tutorials", "steady", "crystallisation",
                     "crystalliser02_msmpr")
MAGMA = os.path.join(CRYST, "converged", "magma")

r = subprocess.run([SOLVER, CRYST], capture_output=True, text=True)
if r.returncode != 0:
    fail("crystalliser02_msmpr does not run (exit %d)" % r.returncode)
elif not os.path.exists(MAGMA):
    fail("crystalliser02_msmpr produced no converged/magma")
else:
    magma = open(MAGMA).read()
    #  A size distribution describes a POPULATION of particles.  At the top
    #  level it can only ever describe one, which is why the field had to be
    #  documented as "the combined solid phase" -- a single curve over two
    #  minerals is not a physical object.
    if re.search(r"^particleSizeDistribution$", magma, re.M):
        fail("crystalliser02 writes its PSD at the TOP LEVEL: the distribution "
             "is back to describing 'the combined solid' instead of the "
             "population it belongs to")
    elif "particleSizeDistribution" not in magma:
        fail("crystalliser02 writes NO PSD at all -- the case that carries the "
             "size distribution stopped carrying it")
    else:
        m = re.search(r"\n    solid\n    \{\n(.*?)\n    \}", magma, re.S)
        if not m or "particleSizeDistribution" not in m.group(1):
            fail("crystalliser02's PSD is not inside the solid phase")
        else:
            nbins = len(re.findall(r"[-\d.eE+]+", m.group(1).split("diameter")[1]
                                   .split(")")[0]))
            ok("crystalliser02: the PSD rides inside the solid phase (%d bins)"
               % nbins)

#  THE FIRST LAW.  flash19 published NO duty until the dissolution heat was
#  read from the ADMITTED solid phase's own record.  A flash forming
#  1096 mg/kg of calcite with no energy balance passed every test in the
#  suite, because a missing duty is an absent KPI and absence was never
#  asserted against.
r = subprocess.run([SOLVER, os.path.join(FLASH, "flash19_organic_and_precipitate")],
                   capture_output=True, text=True)
out = (r.stdout or "") + (r.stderr or "")
if r.returncode != 0:
    fail("flash19 does not run (exit %d)" % r.returncode)
elif "duty UNAVAILABLE" in out:
    fail("flash19 publishes NO duty again -- a precipitating flash without a "
         "first law.  The dissolution heat is curated in the substance's own "
         "solidPhases equilibrium; the caloric path has stopped reading it")
elif '"Q_kW"' not in out:
    fail("flash19 emits no Q_kW at all")
else:
    q = float(re.search(r'"Q_kW":\s*([-\d.eE+]+)', out).group(1))
    #  And the number must come from the ADMITTED phase.  CaCO3 declares two
    #  polymorphs whose heats differ by 2.3 kJ/mol; reading the record's first
    #  entry instead of the case's declaration would let the ORDER OF THE FILE
    #  decide the energy.
    if "-28.0788" not in out:
        fail("flash19's duty is not sourced from the admitted phase's dH "
             "(-28.0788 kJ/mol, calcite).  Reading aragonite (-25.7316) or the "
             "record's first entry lets the file's order decide the energy")
    else:
        ok("flash19: first law published, Q = %.2f kW, dHsoln from the "
           "ADMITTED phase (calcite, not aragonite)" % q)

# ---------------------------------------------------------------------------
#  5. A PHASE NAME ASSERTS SOMETHING, so it must be checkable and checked.
#
#  Outlets are bound POSITIONALLY (produced[k] takes outputs[k]) and a
#  two-liquid unit returns its phases in an order set by the solver's seeding
#  bias.  So `outputs ( aqueous organic )` was correct in the extraction case
#  only because water happens to be declared first: reorder the components and
#  the water-rich phase leaves through the nozzle labelled `organic`, silently,
#  with every KPI green.
# ---------------------------------------------------------------------------
EXTR = os.path.join(ROOT, "tutorials", "steady", "absorption",
                    "extraction01_waterButanol")


def solve_refuses(label, case_src, mutate_case, expect):
    """Copy a case, apply mutate_case(dir), require choupoSolve to REFUSE.

    The mutation takes the whole DIRECTORY, not one file, and that is not
    generality for its own sake: renaming an outlet in flowsheetDict without
    renaming its 0/ state file trips the COMPLETENESS refusal first, and a
    negative test that fires an earlier refusal proves that refusal rather
    than its own.  Cost the first time this was written, twice."""
    tmp = tempfile.mkdtemp(prefix="phasename.")
    try:
        dst = os.path.join(tmp, "case")
        shutil.copytree(case_src, dst)
        for junk in ("converged", "reports"):
            shutil.rmtree(os.path.join(dst, junk), ignore_errors=True)
        mutate_case(dst)
        r = subprocess.run([SOLVER, dst], capture_output=True, text=True)
        out = (r.stdout or "") + (r.stderr or "")
        if r.returncode == 0:
            fail("%s -- ACCEPTED.  A name that is never checked against what "
                 "it names is the defect this exists for." % label)
        elif expect not in out:
            fail("%s -- refused for the wrong reason.  Expected %r, got: %s"
                 % (label, expect, out.strip()[-250:]))
        else:
            ok("%s -- refused, naming it" % label)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if not os.path.isdir(EXTR):
    fail("extraction01_waterButanol is gone -- the two-liquid naming rule has "
         "no case to be checked on")
else:
    def swap_names(d):
        fd = os.path.join(d, "system", "flowsheetDict")
        body = open(fd).read().replace("outputs     ( aqueous  organic )",
                                       "outputs     ( organic  aqueous )")
        open(fd, "w").write(body)

    solve_refuses("(f) the two liquid outlets named the wrong way round",
                  EXTR, swap_names, "carries LESS")

#  ...and a name that asserts a phase the system CANNOT have.  vlle03 is three
#  synthetic components with no water at all, and it used to call its liquids
#  `aqueous` and `organic` -- so the swap check above skipped in silence,
#  exactly where the names meant least.  It now says liquidA / liquidB.
VLLE = os.path.join(FLASH, "vlle03_audit_artificial")
if os.path.isdir(VLLE):
    fd = open(os.path.join(VLLE, "system", "flowsheetDict")).read()
    if re.search(r"outputs.*\baqueous\b", fd):
        fail("vlle03 names an outlet 'aqueous' again, in a system of synthetic "
             "components with no water: the name asserts a phase the system "
             "cannot have")
    else:
        ok("vlle03: synthetic liquids carry neutral names, not a chemistry "
           "they do not have")
        def call_it_aqueous(d):
            fd = os.path.join(d, "system", "flowsheetDict")
            body = open(fd).read().replace("( vapor  liquidA  liquidB )",
                                           "( vapor  aqueous  liquidB )")
            open(fd, "w").write(body)
            #  ...and the 0/ state with it, or the COMPLETENESS refusal fires
            #  first and this test proves that one instead.
            os.rename(os.path.join(d, "0", "liquidA"),
                      os.path.join(d, "0", "aqueous"))

        solve_refuses("(g) an 'aqueous' outlet in a system with no solvent",
                      VLLE, call_it_aqueous, "no solvent")

#  ------------------------------------------------------------------------
#  (h) THE ROUND TRIP.  Case (e) fires the reader's refusal on a hand-written
#  file, and it passed all day while the WRITER was producing exactly such a
#  file: the post-solve pass's "essentially all liquid" test was fixed in
#  6328479c and a later commit, re-applied over a stale tree, put the old
#  all-vapour test back.  The engine wrote a converged/ state it would then
#  REFUSE to read, and nothing noticed, because the gate exercised the reader
#  alone.  So: run a reactive case whose feed declares 30 % vapour, then feed
#  its own output back in.  Whatever the engine writes, it must be able to
#  read.
F13 = os.path.join(FLASH, "flash13_acetic_ethanol_vacuum_flash")
if not os.path.isdir(F13):
    fail("(h) flash13 is gone -- the writer/reader round trip has no case")
else:
    tmp = tempfile.mkdtemp(prefix="roundtrip.")
    try:
        dst = os.path.join(tmp, "case")
        shutil.copytree(F13, dst)
        for junk in ("converged", "reports"):
            shutil.rmtree(os.path.join(dst, junk), ignore_errors=True)
        with open(os.path.join(dst, "0", "feed"), "a") as f:
            f.write("\nvaporFraction   0.30;\n")
        r1 = subprocess.run([SOLVER, dst], capture_output=True, text=True)
        conv = os.path.join(dst, "converged")
        if r1.returncode != 0:
            fail("(h) the 30 %%-vapour feed case does not run (exit %d) -- a "
                 "two-phase feed is legal; only the report on it was not.  "
                 "Tail:\n%s" % (r1.returncode, (r1.stdout + r1.stderr)[-500:]))
        elif not os.path.isdir(conv):
            fail("(h) the case ran but wrote no converged/ state")
        else:
            written = open(os.path.join(conv, "feed")).read()
            if re.search(r"^speciation$", written, re.M):
                fail("(h) the engine wrote a TOP-LEVEL speciation on a 30 % "
                     "vapour stream -- the block cannot say which material it "
                     "describes, and the reader refuses this very file")
            for fn in os.listdir(conv):
                shutil.copy(os.path.join(conv, fn), os.path.join(dst, "0", fn))
            r2 = subprocess.run([SOLVER, dst], capture_output=True, text=True)
            if r2.returncode != 0:
                fail("(h) the engine REFUSES ITS OWN OUTPUT: converged/ copied "
                     "back into 0/ does not load (exit %d).  Tail:\n%s"
                     % (r2.returncode, (r2.stdout + r2.stderr)[-500:]))
            else:
                ok("(h) a 30 % vapour feed: no unnameable block written, and "
                   "the engine reads back what it wrote")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

#  ------------------------------------------------------------------------
#  (i) THE REPORT.  The CSV a student reads outside the GUI is one row per
#  stream on the OVERALL material, which for flash19's liquid says nothing
#  about the split that case exists to show.  streamTable writes a phases.csv
#  beside it -- long format, one row per (stream, phase, component) -- and
#  the aqueous side is DERIVED there too, the fluid minus the organic.  What
#  is checked is that it closes: an artefact that decomposes a material and
#  does not sum back to it is worse than no artefact.
F19 = os.path.join(FLASH, "flash19_organic_and_precipitate")
PH = os.path.join(F19, "reports", "streams", "phases.csv")
ST = os.path.join(F19, "reports", "streams", "streamTable.csv")
r = subprocess.run([SOLVER, F19], capture_output=True, text=True)
if r.returncode != 0:
    fail("(i) flash19 does not run (exit %d)" % r.returncode)
elif not os.path.exists(PH):
    fail("(i) flash19 writes no phases.csv -- a stream with two liquids and a "
         "precipitate reported as though it had one phase")
else:
    import csv as _csv
    rows = list(_csv.DictReader(open(PH)))
    seen_phases = {row["phase"] for row in rows}
    if seen_phases != {"aqueous", "organic", "solid"}:
        fail("(i) phases.csv names %s -- flash19 carries all three"
             % (", ".join(sorted(seen_phases)) or "nothing"))
    #  Checked against converged/liquid, NOT against streamTable.csv: that
    #  table prints its mole fractions to six DECIMALS, and flash19's CaCO3
    #  sits at 1.03e-4, so the comparison measured the column's formatting
    #  quantum (5e-3 relative) instead of the arithmetic.  The first version
    #  of this check did exactly that and reported a 2.8e-4 "failure" that
    #  was print rounding.  The state file carries full precision, and
    #  report-vs-state is the more useful question anyway: two artefacts of
    #  one run must agree.
    csvph = {}
    for row in rows:
        if row["stream"] != "liquid":
            continue
        csvph[(row["phase"], row["component"])] = float(row["n_kmol_per_h"])
    liq = open(os.path.join(F19, "converged", "liquid")).read()
    worst, worst_k = 0.0, ""
    checked = 0
    for ph in ("aqueous", "organic", "solid"):
        state = phase_amounts(liq, ph) or {}
        for c, v in state.items():
            got = csvph.get((ph, c), 0.0)
            err = abs(got - v) / max(abs(v), 1e-30)
            checked += 1
            if err > worst:
                worst, worst_k = err, "%s/%s" % (ph, c)
    if checked == 0:
        fail("(i) converged/liquid names no phases -- nothing to check the "
             "report against, so this proves nothing")
    elif worst > 1e-6:
        fail("(i) phases.csv disagrees with converged/liquid -- worst %s off "
             "by %.2e relative" % (worst_k, worst))
    else:
        ok("(i) phases.csv agrees with converged/liquid on %d entries "
           "(worst %s, %.1e rel)" % (checked, worst_k, worst))

print()
if fails:
    print("%d failure(s)." % len(fails))
    sys.exit(1)
print("phase gate: every block names its phase, the crystal is a phase and "
      "not a species, the PSD rides with its population, the first law is "
      "published, and the reader refuses each way of being vague.")
sys.exit(0)
