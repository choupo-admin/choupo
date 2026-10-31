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
"""check_aqueous_solvent_home -- the aqueous solvent has ONE home (DEV.md 4c C188).

THE DEFECT THIS GUARDS.  The aqueous solvent is DECLARED --
`equilibrium { aqueous { solvent <name>; } }`, default water -- and the
classifier was handed the declaration, but the package did not keep it, so
every unit that needed the solvent found it BY NAME: the spiral-wound module
and the ion exchanger and the electrodialysis stack with `indexOf("water")`,
the batch diafilter and batch electrodialysis with `name == "water"`, the
Pitzer assembly with `cn == "water"` (it never read the declaration at all),
the flowsheet's outlet-name guard with its own fallback loop.  A case that
declared another aqueous solvent was obeyed by the classifier and ignored by
every unit downstream of it.

THE RULE.  `ThermoPackage::aqueousSolventName()` / `findAqueousSolvent()` /
`aqueousSolventIndex()` are the one home; the declaration is read by ONE
reader (`ThermoPackage::declaredAqueousSolventIn`, called by both
electrolyte assemblies) and stamped on the package by `stampAqueousSolvent`,
which refuses by name a solvent that is not a component.  The default word `water` lives in ONE place,
`ThermoPackage::defaultAqueousSolvent()`.

ARMS.
  (a) SOURCE: no string literal that IS exactly "water" anywhere in src/
      (comments stripped; a literal of prose that merely CONTAINS the word,
      such as a refusal message, is not one) outside the one home and the
      pinned props-bench exceptions (debt_registry.
      AQUEOUS_SOLVENT_NAME_LITERALS) -- each pinned with its reason and
      its exact count, and a pin whose count no longer matches FAILS (stale
      or grown, either way someone must look).
  (b) SOURCE: the declaration has ONE reader -- `lookupWord("solvent")` on
      the aqueous block appears once, in ThermoPackage.cpp inside
      `declaredAqueousSolventIn`, and never in ThermoPackageBuilder.cpp.
  (c) SOURCE: every unit that prices an aqueous carrier reads the home.
  (d) BEHAVIOUR: a copy of a Pitzer case (evaporator06) and of a REACTIVE
      case (flash09) declaring `aqueous { solvent noSuchSolvent; }` -- a
      name that is not among `components` -- REFUSES, naming the solvent.
  (e) BEHAVIOUR: the same two cases run as shipped (exit 0), and the Pitzer
      copy declaring `solvent water;` explicitly -- the path that STAMPS the
      package -- reproduces the undeclared run's converged/ state byte for
      byte.

WHAT THIS DOES NOT CHECK.  No corpus case declares a non-water aqueous
solvent, so no arm shows a unit actually computing on one; a declared
non-water solvent reaching a unit whose physics is water's own (EDCell's
MW_WATER_KG, the speciation stack's water Debye-Hueckel surface) is NOT
detected here -- the props-bench `speciate` op refuses that by name; the
units do not yet.

SABOTAGES, by hand, 2026-10-31 (outputs recorded as printed; each restored
and rebuilt after):
  S1  `iWater = thermo.indexOf("water");` put back in IonExchanger.cpp
      -> "FAIL  src/unitOperations/separation/IonExchanger.cpp: string
         literal "water" identifies the solvent by name (1 site(s)) -- read
         ThermoPackage::aqueousSolventName() / ..."
         "FAIL  src/unitOperations/separation/IonExchanger.cpp does not read
         the aqueous solvent's home"
  S2  the DECLARATION dropped: declaredAqueousSolventIn() returns the
      default whatever the case declares (a `lookupWord("solvent")` kept
      inside it, so arm (b) stays green on purpose), rebuilt
      -> "FAIL  (d) Pitzer copy declaring `solvent noSuchSolvent;` (not a
         component) ran to exit 0 -- the declaration was not honoured" and
         the same line for the reactive copy.
  S3  the REFUSAL dropped: the Pitzer assembly's absent() replaced by
      `solventIdx = 0` and the check removed from stampAqueousSolvent,
      rebuilt
      -> "FAIL  (d) Pitzer copy declaring `solvent noSuchSolvent;` (not a
         component) ran to exit 0 -- the declaration was not honoured"
         (ONE failure: the reactive assembly keeps its own absent() refusal,
         so only the Pitzer arm sees this sabotage -- which is why both
         witnesses are here.  What the sabotaged engine did is the point:
         it RAN, taking component 0 as the solvent, at exit 0.)
Exit 0 = all hold.  Exit 1 = a named failure.
"""

import os
import re
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gate_prereq import require_solver

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "src")
SOLVER = os.path.join(ROOT, "choupoSolve")

HOME = "src/thermo/ThermoPackage.cpp"
#  Configuration, not a waiver: the one home holds the default word once.
HOME_LITERALS = 1
#  Every other exact "water" literal is a props-bench op whose SUBJECT is
#  water itself -- an accepted violation, so it lives in the registry.
from debt_registry import AQUEOUS_SOLVENT_NAME_LITERALS
PINS = AQUEOUS_SOLVENT_NAME_LITERALS
ALLOWED = dict(PINS)
ALLOWED[HOME] = (HOME_LITERALS, "the ONE home: ThermoPackage::defaultAqueousSolvent()")

#  (c) every unit that prices an aqueous carrier reads the home.
UNITS = [
    "src/unitOperations/membrane/SpiralWoundModule.cpp",
    "src/unitOperations/batch/BatchDiafilter.cpp",
    "src/unitOperations/batch/BatchElectrodialysis.cpp",
    "src/unitOperations/electrochem/ElectrodialysisStack.cpp",
    "src/unitOperations/separation/IonExchanger.cpp",
    "src/unitOperations/flowsheet/Flowsheet.cpp",
    "src/thermo/transport/StokesEinstein.cpp",
]
HOME_CALL = re.compile(r"\b(aqueousSolventIndex|findAqueousSolvent|aqueousSolventName)\s*\(")

fails = []


def fail(msg):
    fails.append(msg)
    print("FAIL  " + msg)


def ok(msg):
    print("  ok   " + msg)


def code_only(text):
    """Strip // and /* */ comments, keep string and char literals intact."""
    out, i, n = [], 0, len(text)
    while i < n:
        c = text[i]
        if c == '"' or c == "'":
            q = c
            j = i + 1
            while j < n and text[j] != q:
                j += 2 if text[j] == "\\" else 1
            out.append(text[i:j + 1])
            i = j + 1
        elif text.startswith("//", i):
            j = text.find("\n", i)
            i = n if j < 0 else j
        elif text.startswith("/*", i):
            j = text.find("*/", i + 2)
            i = n if j < 0 else j + 2
        else:
            out.append(c)
            i += 1
    return "".join(out)


# --- (a) no exact "water" literal outside the home and the pins -------------
seen = {}
nScanned = 0
for d, _, files in os.walk(SRC):
    for f in files:
        if not f.endswith((".cpp", ".H", ".h", ".hpp")):
            continue
        p = os.path.join(d, f)
        rel = os.path.relpath(p, ROOT)
        nScanned += 1
        code = code_only(open(p, errors="replace").read())
        k = len(re.findall(r'"water"', code))
        if k:
            seen[rel] = k
for rel, k in sorted(seen.items()):
    if rel not in ALLOWED:
        fail('%s: string literal "water" identifies the solvent by name'
             ' (%d site(s)) -- read ThermoPackage::aqueousSolventName() /'
             ' findAqueousSolvent() / aqueousSolventIndex()' % (rel, k))
    elif ALLOWED[rel][0] != k:
        fail('%s: %d "water" literal(s), pinned at %d (%s) -- a pin that'
             ' grew is a new name recognition; one that shrank must be'
             ' re-pinned' % (rel, k, ALLOWED[rel][0], ALLOWED[rel][1]))
for rel, (k, why) in ALLOWED.items():
    if rel not in seen:
        fail('%s: pinned at %d "water" literal(s) and now carries none --'
             ' remove the pin' % (rel, k))
nonpinned = [r for r in seen if r not in ALLOWED]
if not nonpinned:
    ok('(a) no "water" literal names the solvent outside the one home'
       ' (%d src files scanned; %d pinned props-bench literals)'
       % (nScanned, sum(v[0] for v in PINS.values())))

# --- (b) one reader of the declaration -------------------------------------
#  The key is read in ThermoPackage.cpp, inside declaredAqueousSolventIn(),
#  and NOWHERE in the builder (which calls that reader).
bld = code_only(open(os.path.join(SRC, "thermo", "ThermoPackageBuilder.cpp")).read())
tpc = code_only(open(os.path.join(SRC, "thermo", "ThermoPackage.cpp")).read())
RD = re.compile(r'\baq\w*\s*->\s*lookupWord\s*\(\s*"solvent"\s*\)')
inBuilder = len(RD.findall(bld))
m = re.search(r"ThermoPackage::declaredAqueousSolventIn\([^)]*\)\s*\{(.*?)\n\}",
              tpc, re.S)
inside = len(RD.findall(m.group(1))) if m else 0
total = len(RD.findall(tpc))
if inBuilder == 0 and inside == 1 and total == 1:
    ok("(b) `aqueous.solvent` has ONE reader, ThermoPackage::"
       "declaredAqueousSolventIn()")
else:
    fail("(b) `aqueous.solvent` is read %d time(s) in ThermoPackageBuilder.cpp"
         " and %d in ThermoPackage.cpp (%d inside declaredAqueousSolventIn)"
         " -- it must be exactly one, there" % (inBuilder, total, inside))

# --- (c) every carrier-pricing unit reads the home --------------------------
for rel in UNITS:
    code = code_only(open(os.path.join(ROOT, rel)).read())
    if not HOME_CALL.search(code):
        fail("%s does not read the aqueous solvent's home" % rel)
if not any(f.startswith(tuple(UNITS)) for f in fails):
    ok("(c) %d carrier-pricing sites read the home" % len(UNITS))

# --- (d)/(e) behaviour ------------------------------------------------------
require_solver(SOLVER)

PITZER = os.path.join(ROOT, "tutorials", "steady", "evaporation",
                      "evaporator06_nacl_pitzer")
REACTIVE = os.path.join(ROOT, "tutorials", "steady", "flash",
                        "flash09_nh3_water_reactive")
BOGUS = "noSuchSolvent"


def run(case):
    return subprocess.run([SOLVER, case], capture_output=True, text=True,
                          cwd=ROOT, timeout=600)


def copy_with_solvent(src, tmp, word):
    dst = os.path.join(tmp, os.path.basename(src) + "_" + word)
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
        "converged", "iterations", "reports", "design", "log.*"))
    tp = os.path.join(dst, "constant", "thermoPhysPropDict")
    t = open(tp).read()
    #  insert into the FIRST `aqueous {` that sits in the equilibrium block
    #  (the caloric block's `aqueous` comes after it).
    new, k = re.subn(r"(\n\s*aqueous\s*\n\s*\{)",
                     r"\1\n        solvent %s;" % word, t, count=1)
    if k != 1:
        raise RuntimeError("no aqueous block in " + tp)
    open(tp, "w").write(new)
    return dst


def converged_of(case):
    d = os.path.join(case, "converged")
    out = {}
    for base, _, files in os.walk(d):
        for f in files:
            p = os.path.join(base, f)
            out[os.path.relpath(p, d)] = open(p, "rb").read()
    return out


tmp = tempfile.mkdtemp(prefix="aqsolv_")
try:
    for label, case in (("Pitzer", PITZER), ("reactive", REACTIVE)):
        r = run(case)
        if r.returncode != 0:
            fail("(e) %s witness %s does not run as shipped (exit %d): %s"
                 % (label, os.path.basename(case), r.returncode,
                    (r.stderr or r.stdout)[-400:]))
        else:
            ok("(e) %s witness %s runs as shipped"
               % (label, os.path.basename(case)))
        bad = copy_with_solvent(case, tmp, BOGUS)
        r = run(bad)
        txt = r.stdout + r.stderr
        if r.returncode == 0:
            fail("(d) %s copy declaring `solvent %s;` (not a component) ran"
                 " to exit 0 -- the declaration was not honoured" % (label, BOGUS))
        elif ("aqueous solvent '%s'" % BOGUS) not in txt:
            fail("(d) %s copy declaring `solvent %s;` failed (exit %d) but"
                 " the refusal does not name the aqueous solvent: %s"
                 % (label, BOGUS, r.returncode, txt[-400:]))
        else:
            ok("(d) %s copy declaring `solvent %s;` refuses by name"
               % (label, BOGUS))

    base = converged_of(PITZER)
    explicit = copy_with_solvent(PITZER, tmp, "water")
    r = run(explicit)
    if r.returncode != 0:
        fail("(e) Pitzer copy declaring `solvent water;` explicitly does not"
             " run (exit %d): %s" % (r.returncode, (r.stderr or r.stdout)[-400:]))
    else:
        got = converged_of(explicit)
        diff = sorted(k for k in set(base) | set(got) if base.get(k) != got.get(k))
        if diff or not base:
            fail("(e) declaring `solvent water;` explicitly moved converged/"
                 " (%d file(s) differ: %s)" % (len(diff), ", ".join(diff[:5])))
        else:
            ok("(e) explicit `solvent water;` (the stamping path) reproduces"
               " the undeclared converged/ byte for byte (%d files)" % len(base))
finally:
    shutil.rmtree(tmp, ignore_errors=True)

if fails:
    print("check_aqueous_solvent_home: %d failure(s)" % len(fails))
    sys.exit(1)
print("check_aqueous_solvent_home: OK -- the aqueous solvent has ONE home"
      " (ThermoPackage::aqueousSolventName, default in"
      " defaultAqueousSolvent): no \"water\" literal names it in src/ outside"
      " the home and %d pinned props-bench files, one reader of"
      " `aqueous.solvent`, %d carrier-pricing sites read it, an undeclared"
      " component refuses by name on the Pitzer and reactive paths.  NOT"
      " checked: a unit computing on a non-water solvent (no corpus case"
      " declares one)." % (len(PINS), len(UNITS)))
