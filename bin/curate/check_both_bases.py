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
"""check_both_bases -- where the package resolves ions, EVERY stream shows both.

THE BUG THIS GUARDS.  The post-solve speciation pass was written inside
`if (thermo.hasReactiveEquilibrium())`.  A Pitzer or eNRTL package resolves
ions too -- that is what a molality model IS -- it simply carries no
equilibrium NETWORK, so the whole family fell outside the guard.  The result
was one architecture with two behaviours:

    flash16 (reactive)          feed AND liquid carry `speciation { ... }`
    crystalliser06 (eNRTL)      NOT ONE ION, on any stream, including the feed

and nothing failed, because the corpus only ever asserted the block where it
already existed.  Two further defects sat underneath:

  * the salt reached the runtime as a REDUCED identity component (name, MW,
    role), so `dissociatesTo` -- declared right there in its record -- was
    invisible to the engine that had just read it;
  * the stream READER refused any speciation block on a case with no reactive
    chemistry, so even once written, the engine was producing a file it would
    not read back.

What is asserted, on the real binaries, never from source text:

  1. THE POSITIVE, on a non-reactive electrolyte case: every liquid-bearing
     stream carries a block, `network ( completeDissociation )`, and the ions
     are the ones the salt's own record declares.
  2. THE INLET.  Vitor's rule, in his words: "ate a entrada tem de ter a
     especiacao."  A feed nobody speciates is exactly the stream a student
     most wants to compare an outlet against.
  3. THE CRYSTAL IS NOT AN ION.  The precipitated solid stays in the solid
     phase; the block decomposes the LIQUID.  Reporting st.s among the
     species is the flash16 error (58.9 % of the calcium was solid calcite
     sitting among the dissolved), and it closes just fine while being wrong.
  4. THE ROUND TRIP.  The written file is read back by the real reader, whose
     closure check verifies m = A n against the same declared bridges.  This
     is what makes (1) more than a print statement.
  5. TWO FIRED REFUSALS, through the reader on a scratch copy:
     (a) a block whose ion amount has been altered -- must refuse, naming the
         master and both numbers;
     (b) a block on a case whose components declare NO bridge and which has
         no network -- names that answer to nothing must not be believed.
  6. THE NEGATIVE, on a case that CAN be got wrong: evaporator01_brine puts
     NaCl -- a salt whose record declares `dissociatesTo` -- inside a
     MOLECULAR gammaPhi package that lumps it.  The rule is the MODEL's, not
     the substance's: a declared bridge does not mean the world in force
     resolves ions.  The first cut of this pass guarded on the components
     alone and would have decorated 51 molecular cases in this corpus with
     invented ions; a benzene/toluene negative would have passed throughout.
     A negative witness that cannot fail is not a witness.

SABOTAGE-VERIFIED.  Reverting the model guard (`anyBridge && hasElectrolyte()`
back to `anyBridge`) and rebuilding makes assertion 6 fail by name --
"a molecular case got a speciation block on concentrated, feed".  That is the
difference between this file and a decoration, and it is the check to redo if
anyone edits the guard.

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
LINT = os.path.join(ROOT, "bin", "choupo-lint")

#  The non-reactive electrolyte witness: eNRTL, a real solid product, and a
#  feed that is pure brine -- so it exercises the inlet, the mother liquor and
#  the crystal in one case.
CASE = os.path.join(ROOT, "tutorials", "steady", "crystallisation",
                    "crystalliser06_nacl_antisolvent")
#  THE NEGATIVE WITNESS, and the choice matters more than it looks.
#  evaporator01_brine carries NaCl -- whose record declares `dissociatesTo`
#  right there -- inside a MOLECULAR gammaPhi/ideal package that lumps it.
#  A benzene/toluene case would also get no block, and would have proved
#  nothing: the first cut of this pass guarded on the components alone, and
#  under that guard 51 molecular cases in this corpus (every acetic-acid
#  reactor, both ammonia plants, the CO2 absorber, the whole membrane family)
#  gained an invented ion decomposition while a benzene/toluene negative sat
#  there passing.  The witness must be a case that CAN be got wrong.
MOLECULAR = os.path.join(ROOT, "tutorials", "steady", "evaporation",
                         "evaporator01_brine")
#  ...and a SEPARATE witness for the "names answer to nothing" refusal, which
#  needs a case with NO bridge at all.  evaporator01_brine cannot serve: its
#  NaCl declares one, so a grafted block there is refused by the CLOSURE check
#  instead, and a test that only reads the exit code would report the wrong
#  refusal as fired.  Two claims, two witnesses.
NOBRIDGE = os.path.join(ROOT, "tutorials", "steady", "flash",
                        "flash01_benzene_toluene")

NUM = re.compile(r"(\w+)\s+([-\d.eE+]+)\s+kmol/h;")

fails = []


def fail(msg):
    fails.append(msg)
    print("FAIL  " + msg)


def ok(msg):
    print("  ok   " + msg)


def run(case):
    return subprocess.run([SOLVER, case], capture_output=True, text=True, cwd=ROOT)


def spec_of(text):
    """The speciation block's species -> kmol/h, wherever it sits."""
    m = re.search(r"speciation\s*\n\s*\{(.*?)\n\s*\}", text, re.S)
    if not m:
        return None
    return dict((k, float(v)) for k, v in NUM.findall(m.group(1)))


def network_of(text):
    m = re.search(r"network\s*\(\s*([^)]*?)\s*\)", text)
    return m.group(1).strip() if m else None


def phase_amounts(text, phase):
    m = re.search(r"\n    %s\n    \{\n(.*?)\n    \}\n" % phase, text, re.S)
    if not m:
        return None
    return dict((k, float(v)) for k, v in NUM.findall(m.group(1).split("speciation")[0]))


if not os.path.exists(SOLVER):
    print("SKIP  no choupoSolve binary -- build first (make)")
    sys.exit(0)

# ---------------------------------------------------------------------------
#  Run the witness.  This gate reads converged/ output, so producing it here
#  rather than depending on someone else having run first keeps the verdict
#  off the suite's schedule.
# ---------------------------------------------------------------------------
r = run(CASE)
if r.returncode != 0:
    fail("crystalliser06 did not run (exit %d): %s"
         % (r.returncode, (r.stderr or r.stdout)[-400:]))
    sys.exit(1)

conv = os.path.join(CASE, "converged")
states = {f: open(os.path.join(conv, f), errors="replace").read()
          for f in sorted(os.listdir(conv))
          if os.path.isfile(os.path.join(conv, f))}

# --- 1. the positive, on every liquid-bearing stream ------------------------
def carries_bridge(t):
    m = re.search(r"componentMolarFlows\s*\n\{(.*?)\n\}", t, re.S)
    f = dict((k, float(v)) for k, v in NUM.findall(m.group(1))) if m else {}
    return f.get("NaCl", 0.0) != 0.0


missing = []
for name, t in states.items():
    vf = re.search(r"(?m)^vaporFraction\s+([-\d.eE+]+)", t)
    if vf and float(vf.group(1)) > 0.999:
        continue                       # all vapour: no aqueous phase at all
    if not carries_bridge(t):
        continue                       # no bridging component, no ions to show
    if spec_of(t) is None:
        missing.append(name)
if missing:
    fail("crystalliser06: liquid-bearing stream(s) with NO speciation: %s"
         % ", ".join(missing))
else:
    ok("every liquid-bearing stream of crystalliser06 carries a speciation block")

nets = set(network_of(t) for t in states.values() if spec_of(t) is not None)
if nets != {"completeDissociation"}:
    fail("network label(s) %s -- a block with no equilibrium network behind it"
         " must say so, so a reader can tell it from a solved one" % sorted(nets))
else:
    ok("the block names its provenance: network ( completeDissociation )")

#  The ions are the salt's own, not a name guess.
saltrec = os.path.join(CASE, "constant", "components", "NaCl.dat")
if not os.path.exists(saltrec):
    saltrec = os.path.join(ROOT, "data", "standards", "components", "NaCl.dat")
declared_ions = set(re.findall(r"(\w+)\s+[\d.]+\s*;",
                    re.search(r"dissociatesTo\s*\{(.*?)\}",
                              open(saltrec, errors="replace").read(), re.S).group(1)))
any_spec = next(s for s in states.values() if spec_of(s) is not None)
if set(spec_of(any_spec)) != declared_ions:
    fail("the block's species %s are not the salt's declared dissociatesTo %s"
         % (sorted(spec_of(any_spec)), sorted(declared_ions)))
else:
    ok("the species are the salt's DECLARED ions (%s), never a name guess"
       % ", ".join(sorted(declared_ions)))

# --- 2. the inlet ----------------------------------------------------------
#  A domain inlet is a stream no unit produces.  Read the topology rather than
#  trusting a name: "brine" is only the feed because nothing makes it.
fsd = open(os.path.join(CASE, "system", "flowsheetDict"), errors="replace").read()
fsd = re.sub(r"/\*.*?\*/", "", fsd, flags=re.S)
fsd = re.sub(r"//[^\n]*", "", fsd)
produced = set(re.findall(r"(?m)^\s*out(?:put)?\s+(\w+)\s*;", fsd))
produced |= set(w for m in re.findall(r"(?m)^\s*outputs\s*\(([^)]*)\)", fsd)
                for w in m.split())
inlets = [n for n in states if n not in produced]
if not inlets:
    fail("could not identify a domain inlet from the topology -- the inlet"
         " assertion would pass by describing nothing")
else:
    #  An inlet that carries no bridging component has no ions to report --
    #  the antisolvent feed here is pure ethanol.  The claim is about the
    #  inlets that DO carry the salt, and it must find at least one, or it
    #  passes by describing nothing.
    def carries_salt(t):
        m = re.search(r"componentMolarFlows\s*\n\{(.*?)\n\}", t, re.S)
        f = dict((k, float(v)) for k, v in NUM.findall(m.group(1))) if m else {}
        return f.get("NaCl", 0.0) != 0.0

    salty = [n for n in inlets if carries_salt(states[n])]
    if not salty:
        fail("no domain inlet carries the salt -- assertion (2) would pass"
             " without testing an inlet")
    else:
        bad = [n for n in salty if spec_of(states[n]) is None]
        if bad:
            fail("INLET(S) with no speciation: %s -- the feed is exactly the"
                 " stream a student compares the outlet against" % ", ".join(bad))
        else:
            ok("the salt-bearing domain inlet(s) %s carry the speciation too"
               % ", ".join(salty))

# --- 3. the crystal is not an ion ------------------------------------------
crystal = None
for name, t in states.items():
    if phase_amounts(t, "solid"):
        crystal = (name, t)
        break
if crystal is None:
    fail("no stream carries a solid phase -- this case was chosen because one"
         " does; without it assertion (3) tests nothing")
else:
    name, t = crystal
    liq = phase_amounts(t, "aqueous") or phase_amounts(t, "liquid")
    sol = phase_amounts(t, "solid")
    sp = spec_of(t)
    #  Na from the block must match the LIQUID's salt, not liquid + crystal.
    ion = sorted(declared_ions)[0]
    salt_liq = liq.get("NaCl", 0.0)
    salt_sol = sol.get("NaCl", 0.0)
    got = sp.get(ion, 0.0)
    if salt_sol <= 0.0:
        fail("stream '%s' has a solid phase with no NaCl in it" % name)
    elif abs(got - salt_liq) > 1e-6 * max(1.0, abs(salt_liq)):
        fail("stream '%s': the block reports %.6g kmol/h of %s while the"
             " LIQUID holds %.6g (the crystal holds %.6g) -- a precipitated"
             " solid is being reported as a dissolved ion"
             % (name, got, ion, salt_liq, salt_sol))
    else:
        ok("stream '%s': the block decomposes the LIQUID (%.4g kmol/h), the"
           " %.4g kmol/h crystal stays solid" % (name, salt_liq, salt_sol))

# --- 4. the round trip ------------------------------------------------------
#  choupo-lint loads 0/ , so the check needs the written state IN 0/ -- read
#  back by the same reader that refuses a block which does not close.
def lint_with_state(edit=None, case=CASE):
    """Copy the case, put converged/ in as 0/, optionally edit, then lint."""
    tmp = tempfile.mkdtemp(prefix="bothbases-")
    dst = os.path.join(tmp, os.path.basename(case))
    shutil.copytree(case, dst)
    src = os.path.join(dst, "converged")
    zero = os.path.join(dst, "0")
    shutil.rmtree(zero, ignore_errors=True)
    shutil.copytree(src, zero)
    if edit:
        edit(zero)
    p = subprocess.run([LINT, dst], capture_output=True, text=True, cwd=ROOT)
    shutil.rmtree(tmp, ignore_errors=True)
    return p


p = lint_with_state()
if p.returncode != 0:
    fail("the engine wrote state the READER refuses (exit %d): %s"
         % (p.returncode, (p.stderr or p.stdout)[-500:]))
else:
    ok("round trip: the written speciation reads back and closes (m = A n)")

# --- 5a. fired refusal: a block that no longer closes ------------------------
def perturb(zero):
    for f in sorted(os.listdir(zero)):
        p = os.path.join(zero, f)
        t = open(p, errors="replace").read()
        if spec_of(t) is None:
            continue
        ion = sorted(declared_ions)[0]
        t2 = re.sub(r"(\n\s*%s\s+)([-\d.eE+]+)( kmol/h;)" % ion,
                    lambda m: m.group(1) + repr(float(m.group(2)) * 1.5) + m.group(3),
                    t, count=1)
        open(p, "w").write(t2)
        return


p = lint_with_state(perturb)
if p.returncode == 0:
    fail("a speciation block inflated by 50 %% was ACCEPTED -- the closure"
         " check is not reached on this path, so (4) proves nothing")
elif "does not close" not in (p.stderr + p.stdout) and \
     "NOT collapse" not in (p.stderr + p.stdout):
    fail("the altered block was refused, but not by the closure check: %s"
         % (p.stderr or p.stdout)[-300:])
else:
    ok("REFUSED: an altered block does not collapse back to the material")

# --- 5b. fired refusal: names that answer to nothing -------------------------
grafted = []


def graft(zero):
    """Put a speciation block on a case whose components declare no bridge.

    It must land on an ALL-LIQUID stream.  flash01's feed is 30 % vapour, and
    a top-level block there fires the vapour-fraction refusal instead -- also
    correct, also not the one under test.  A gate that reads only the exit
    code would have scored that as a pass.
    """
    for f in sorted(os.listdir(zero)):
        p = os.path.join(zero, f)
        t = open(p, errors="replace").read()
        if "componentMolarFlows" not in t:
            continue
        if re.search(r"(?m)^phase\s+gas\s*;", t):
            continue
        m = re.search(r"(?m)^vaporFraction\s+([-\d.eE+]+)", t)
        if m and float(m.group(1)) > 1e-6:
            continue
        grafted.append(f)
        open(p, "w").write(t + """
speciation
{
    network   ( completeDissociation );
    basis     stoichiometric;

    Na    1.0 kmol/h;
    Cl    1.0 kmol/h;
}
""")
        return


p = lint_with_state(graft, NOBRIDGE)
out = p.stderr + p.stdout
if not grafted:
    fail("no all-liquid stream in %s to graft onto -- the refusal was never"
         " exercised" % os.path.basename(NOBRIDGE))
elif p.returncode == 0:
    fail("a speciation block was accepted on a case whose components declare"
         " no aqueous bridge -- names that answer to nothing were believed")
elif "answer to nothing" not in out:
    #  Reading only the exit code would let ANY refusal stand in for this one.
    fail("the grafted block was refused, but not by the no-bridge refusal: %s"
         % out[-300:])
else:
    ok("REFUSED: a speciation block on a case with no bridge and no network")

# --- 6. the negative --------------------------------------------------------
r = run(MOLECULAR)
if r.returncode != 0:
    fail("flash01 did not run: %s" % (r.stderr or r.stdout)[-300:])
else:
    convm = os.path.join(MOLECULAR, "converged")
    wrote = [f for f in sorted(os.listdir(convm))
             if os.path.isfile(os.path.join(convm, f))
             and spec_of(open(os.path.join(convm, f), errors="replace").read())]
    if wrote:
        fail("a molecular case got a speciation block on %s -- the pass is"
             " inventing chemistry where the package resolves no ions"
             % ", ".join(wrote))
    else:
        ok("NEGATIVE: a molecular case gets no block -- one basis is its whole"
           " structure")

print()
if fails:
    print("check_both_bases: %d FAILURE(S)" % len(fails))
    sys.exit(1)
print("check_both_bases: all hold")
sys.exit(0)
