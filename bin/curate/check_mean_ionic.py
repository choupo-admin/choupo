#!/usr/bin/env python3
"""Gate: gamma_pm is DERIVED from charges, and it is the measurable one.

    bin/curate/check_mean_ionic.py

WHY THIS EXISTS.  Every gamma the speciation published before 2026-08-10 was
a SINGLE-ION activity coefficient, and a single-ion gamma is not measurable --
it depends on the convention that splits a neutral combination into charged
halves.  What experiment reports, and what every published seawater or
single-salt table quotes, is the mean ionic coefficient

    gamma_pm = ( gamma_+^nu+ * gamma_-^nu- )^(1/(nu+ + nu-)) .

So a case comparing against a published table had to combine the ions BY HAND
in a header comment, and the hand calculation went stale exactly as a derived
number with no home does: `pitzer_seawater_verify` claimed "all pins STILL in
their published band" after E_theta was activated, having re-checked the two
1-1 salts whose gamma_pm is a square root of two adjacent numbers.  The four
DIVALENT salts -- the ones E_theta actually moves -- were never recomputed,
and four of them are now outside their quoted bands.

WHAT THIS CHECKS, all from fresh runs of the corpus witness:

  (R1) THE VALUE IS RIGHT, by an INDEPENDENT closure: this script recomputes
       gamma_pm in python from the per-ion gammas the SAME run published, for
       every declared pair, and requires agreement to 1e-5 relative.  It
       recomputes from the charges too -- it does not read the engine's nu
       back.  The tolerance is 1e-5 and not machine epsilon because the
       result JSON prints six significant figures, so this comparison is
       between two numbers each rounded there; it is still four orders of
       magnitude tighter than the smallest exponent error possible
       (swapping nu+ and nu- moves the divalent gamma_pm by 33-45 %, and
       the 1-1 pairs not at all -- which is the whole reason R2 insists the
       witness keeps covering unsymmetrical salts).
  (R2) THE STOICHIOMETRY IS DERIVED FROM CHARGE, not from a name: the 2:1,
       1:2 and 2:2 pairs must come out with nu+/nu- = 1/2, 2/1 and 1/1, and
       the announcement must say so with the charges it used.  A gate that
       only checked 1-1 salts would be blind to the entire defect above.
  (R3) THE REDUCTION IDENTITY, in TWO claims at two tolerances (repaired
       2026-09-03): on the single-salt PIN A composition the published
       gamma_pm must be the GEOMETRIC MEAN of the per-ion gammas to machine
       level -- the arithmetic sanity check a wrong exponent breaks -- and
       the two ion gammas, analytically equal for a 1:1 salt, must agree to
       1e-6, which is what the speciation solve delivers (measured: 1.65e-8).
       It used to demand BOTH at 1e-12 and was green over ROUNDING: the
       result JSON printed six significant digits, so `0.657172` was compared
       with `0.657172`.  The precision fix made the real digits visible and
       the arm went red -- a check passing because its input was blunted.
  (R4) TWO REFUSALS fire by name, through the real reader: an anion named as
       the cation, and a species that is not in the computed table.

WHAT THIS DOES **NOT** COVER, stated so the green line cannot imply it:

  * it does NOT check that any gamma_pm AGREES WITH MEASUREMENT.  It checks
    that the engine combines its own ions correctly.  The seawater
    disagreement (4 of 6 below the published bands) is a FINDING recorded in
    the case header and in VALIDATION.md, deliberately not a gate: turning it
    green would require choosing between "the bands are loose" and "E_theta is
    misapplied", and the primaries needed to choose are not held.
  * it does not check the single-ion gammas themselves, nor the Pitzer kernel
    (check_*, the case goldens and the HMW oracle do that).
  * it covers the `speciate` op only.  MolecularActivity publishes no ions.
  * R3's geometric arm cannot tell a geometric from an ARITHMETIC mean on the
    1:1 salt it runs on -- for two equal numbers they coincide.  R1 is what
    separates them, on the 2:1 / 1:2 / 2:2 pairs where the ions differ.

SABOTAGE-VERIFIED 2026-08-10; OBSERVED output recorded, not predicted.

Sabotage 1 -- exponents swapped (nu+ <-> nu-), which is invisible on every
1-1 salt and wrong on all four divalent ones:

    check_mean_ionic: FAILED
      R1: seawater gamma_pm_Ca_Cl = 0.2877 but (g_Ca^1 * g_Cl^2)^(1/3) over
      the run's own per-ion gammas is 0.4459 (rel 3.5e-01)
      R1: seawater gamma_pm_Mg_Cl = 0.3072 ... (rel 3.3e-01)
      R1: seawater gamma_pm_Na_SO4 = 0.1905 ... (rel 4.5e-01)
    (the three 1-1 pairs pass unchanged -- the defect is invisible on them)

Sabotage 2 -- the charge sign check removed:

    check_mean_ionic: FAILED
      R4: `cation Cl; anion Na;` was ACCEPTED -- a mean ionic coefficient
      is defined for one positive and one negative species, and naming them
      backwards must refuse, not compute
"""

import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from math import gcd

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CASE = os.path.join(ROOT, "tutorials", "props", "electrolyte",
                    "pitzer_seawater_verify")
PROPS = os.path.join(ROOT, "build", "linux64Gcc", "choupoProps")
ENV = dict(os.environ, CHOUPO_HOME=ROOT)

#  The charges this gate uses are its OWN, transcribed here rather than read
#  back from the engine: a gate that imports the number under test cannot
#  falsify it.
Z = {"Na": +1, "K": +1, "Mg": +2, "Ca": +2, "Cl": -1, "SO4": -2}

fails = []


def run(cwd):
    p = subprocess.run([PROPS], cwd=cwd, env=ENV, capture_output=True,
                       text=True, timeout=900)
    return p.returncode, p.stdout + p.stderr


def result_json(text):
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  text, re.S)
    return json.loads(m.group(1)) if m else None


def diagnostics(res, opname):
    for o in res.get("operationResults", []):
        if o.get("name") == opname:
            return o.get("diagnostics", {})
    return {}


def expected_pm(d, cat, ani):
    """gamma_pm recomputed in python from the run's OWN per-ion gammas."""
    zp, zm = Z[cat], -Z[ani]
    g = gcd(zp, zm)
    nup, num = zm // g, zp // g
    return ((d[f"gamma_{cat}"] ** nup) * (d[f"gamma_{ani}"] ** num)) \
        ** (1.0 / (nup + num)), nup, num


rc, out = run(CASE)
res = result_json(out)
if rc != 0 or res is None:
    print("check_mean_ionic: FAILED")
    print("  the witness case did not run -- "
          + next((l for l in out.splitlines() if "ERROR" in l), "").strip())
    sys.exit(1)

sea = diagnostics(res, "seawater")
red = diagnostics(res, "reduction_nacl")

# ---- R1 + R2: every published gamma_pm, recomputed independently ---------
pairs = [k for k in sea if k.startswith("gamma_pm_")]
if len(pairs) < 6:
    fails.append(f"R2: the witness publishes {len(pairs)} mean ionic "
                 f"coefficient(s); this gate needs the 2:1 / 1:2 / 2:2 pairs "
                 f"to be able to see an exponent defect at all")

seen_stoich = set()
for k in sorted(pairs):
    cat, ani = k[len("gamma_pm_"):].split("_")
    if cat not in Z or ani not in Z:
        fails.append(f"R2: pair {cat}/{ani} carries a charge this gate does "
                     f"not know -- extend Z, do not read it from the engine")
        continue
    want, nup, num = expected_pm(sea, cat, ani)
    got = sea[k]
    seen_stoich.add((nup, num))
    #  1e-5: the JSON carries six significant figures (see the docstring).
    if abs(got - want) > 1e-5 * max(1.0, abs(want)):
        fails.append(f"R1: seawater {k} = {got:.4f} but "
                     f"(g_{cat}^{nup} * g_{ani}^{num})^(1/{nup + num}) over "
                     f"the run's own per-ion gammas is {want:.4f} "
                     f"(rel {abs(got - want) / abs(want):.1e})")
    #  the DERIVATION must be announced, with the charges it used
    pat = (rf"gamma_pm\({cat},{ani}\): nu\+ {nup}, nu- {num} derived from "
           rf"z\({cat}\) = {Z[cat]}, z\({ani}\) = {Z[ani]}")
    if not re.search(pat, out):
        fails.append(f"R2: {k} was published without announcing its derived "
                     f"stoichiometry (nu+ {nup}, nu- {num} from the charges) "
                     f"-- a reader must not have to re-derive it")

for need in [(1, 1), (1, 2), (2, 1)]:
    if need not in seen_stoich:
        fails.append(f"R2: no pair exercised nu+/nu- = {need[0]}/{need[1]}; "
                     f"the witness must keep covering unsymmetrical salts")

# ---- R3: the single-salt reduction identity ------------------------------
#
#  TWO CLAIMS, TWO TOLERANCES, and separating them is the whole repair
#  (2026-09-03).  This arm read
#
#      abs(gna - gcl) > 1e-12 or abs(pm - gna) > 1e-12
#
#  and it was GREEN from the day it shipped until the result-JSON emitter
#  stopped rounding to six significant digits.  Both ion gammas printed as
#  `0.657172`, so 1e-12 compared two ROUNDED copies of one number.  Measured
#  once the true digits appeared: gamma_Na and gamma_Cl differ by 1.65e-8
#  relative -- the speciation fixed point's own convergence, not an
#  arithmetic error -- while gamma_pm equals sqrt(gamma_Na*gamma_Cl) to the
#  last digit printed.
#
#  So the arithmetic is checked AS arithmetic, at machine level, and the
#  coincidence of the two ions is checked at the level the solver actually
#  delivers, with that said out loud.  A tolerance a blunted input satisfied
#  is not a tolerance; it is a coincidence with a number written beside it.
GEOMETRIC_TOL = 1e-12    # exact: gamma_pm IS sqrt(g+ g-) for nu+ = nu- = 1
SOLVER_TOL = 1e-6        # the two ions coincide only to the speciation solve
if red:
    pm = red.get("gamma_pm_Na_Cl")
    gna, gcl = red.get("gamma_Na"), red.get("gamma_Cl")
    if pm is None or gna is None:
        fails.append("R3: PIN A publishes no gamma_pm_Na_Cl -- the reduction "
                     "identity has no subject")
    else:
        want = math.sqrt(gna * gcl)
        if abs(pm - want) > GEOMETRIC_TOL * max(1.0, abs(pm)):
            fails.append(f"R3: on the 1:1 single-salt composition gamma_pm "
                         f"({pm}) must be the geometric mean of the per-ion "
                         f"gammas ({gna}/{gcl} -> {want}); a wrong exponent "
                         f"shows here as a mismatch")
        if abs(gna - gcl) > SOLVER_TOL * max(1.0, abs(pm)):
            fails.append(f"R3: the two ion gammas of a 1:1 single salt have "
                         f"drifted apart by {abs(gna - gcl):.3e} "
                         f"({gna}/{gcl}), past the {SOLVER_TOL:g} the "
                         f"speciation solve delivers -- they are analytically "
                         f"equal here, so this is the solver, not the mean")

# ---- R4: the two refusals, through the real reader -----------------------


def probe(mutate, label, must_contain):
    d = tempfile.mkdtemp(prefix="meanionic_")
    dst = os.path.join(d, "case")
    try:
        shutil.copytree(CASE, dst)
        p = os.path.join(dst, "system", "propsDict")
        s = open(p, encoding="utf-8").read()
        open(p, "w", encoding="utf-8").write(mutate(s))
        rc2, out2 = run(dst)
        if rc2 == 0:
            fails.append(f"R4: {label} was ACCEPTED -- {must_contain[1]}")
        elif must_contain[0] not in out2:
            fails.append(f"R4: {label} refused, but without saying why "
                         f"(expected the refusal to mention "
                         f"'{must_contain[0]}')")
    finally:
        shutil.rmtree(d, ignore_errors=True)


probe(lambda s: s.replace("{ cation Na; anion Cl;  }",
                          "{ cation Cl; anion Na;  }", 1),
      "`cation Cl; anion Na;`",
      ("one POSITIVE and one NEGATIVE",
       "a mean ionic coefficient is defined for one positive and one "
       "negative species, and naming them backwards must refuse, not compute"))

probe(lambda s: s.replace("{ cation Na; anion Cl;  }",
                          "{ cation Zz; anion Cl;  }", 1),
      "a cation that is not in the species table",
      ("is not in the computed species table",
       "a pair naming a species the run does not have must refuse by name"))

if fails:
    print("check_mean_ionic: FAILED")
    for f in fails:
        print("  " + f)
    sys.exit(1)

print("check_mean_ionic: OK -- every published gamma_pm recomputed "
      "independently from the run's own per-ion gammas and the species "
      f"charges ({len(pairs)} pair(s), 1:1 / 2:1 / 1:2 / 2:2 all covered), "
      "each with its derived nu+/nu- announced; on the single-salt "
      "composition gamma_pm IS the geometric mean of its two ions to machine "
      f"level and those two agree to {SOLVER_TOL:g} -- the speciation solve's "
      "own convergence, NOT machine level, which this arm used to demand and "
      "got only from six-digit rounded output; a backwards cation/anion pair "
      "and an unknown species both refuse by name.  NOT COVERED: whether any "
      "gamma_pm AGREES WITH MEASUREMENT -- it does not for 4 of the 6 "
      "seawater salts, which is a recorded finding in the case header and "
      "VALIDATION.md, not a gate; the single-ion gammas and the Pitzer kernel "
      "themselves; a geometric vs ARITHMETIC mean on the 1:1 salt (for two "
      "equal numbers they coincide -- R1's unsymmetrical pairs separate "
      "them); ops other than `speciate`.")
