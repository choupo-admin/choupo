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
"""check_registry_scan -- two files may not claim one record's identity.

THE BUG THIS GUARDS.  Every catalogue registry is filled by walking a
directory and keying each record by a name read from INSIDE the file:

    for (auto& e : fs::directory_iterator(dir))
        registry()[nameInsideTheFile] = record;

The file's identity is its PATH, the registry's key is its CONTENT, and
nothing tied the two together.  Two files claiming the same key left the
answer to whichever `fs::directory_iterator` visited last -- an order that is
neither sorted nor portable.  Six registries had the pattern (materials,
membranes, adsorbents, Henry pairs, solution pairs, utilities), and the same
shape sat in the speciation network, where the price was measurable rather
than hypothetical:

    flash16, with CO3-formation.dat duplicated under a second filename, ran
    to completion, exit 0, and reported pH 6.02020872708 against the correct
    6.02023176857.  A species formed twice is two equations for one unknown;
    the network absorbed it and moved the answer in the sixth digit.  Nothing
    printed.  Nothing failed.

What is asserted -- each refusal fired through the real binary, never read
off the source:

  (a) TWO FILES, ONE SCAN, SAME KEY, in a registry -- two Henry records
      declaring the same (solute, solvent) pair inside one case's
      constant/parameters/Henry/.
  (b) TWO RECORDS FORMING ONE SPECIES -- the case above, which used to be
      the silent wrong answer.
  (c) THE CONTROL -- the same two cases, unmutated, still run.  A refusal
      that fires on everything guards nothing.
  (d) THE TIER OVERRIDE IS ANNOUNCED, not refused: a case-local record
      replacing a catalogue record of the same key is deliberate, and says
      so.  Fired on an UNSEALED case -- a sealed case never reads the
      catalogue, so there is nothing to override and nothing to announce.
  (e) THE CATALOGUE ITSELF is swept statically for the same collision, so a
      curation act that introduces one is caught without waiting for a case
      to happen to load that registry.

Exit 0 = all hold.  Exit 1 = a named failure.
"""

import collections
import os
import re
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gate_prereq import require_solver

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SOLVER = os.path.join(ROOT, "choupoSolve")
STD = os.path.join(ROOT, "data", "standards")
FLASH16 = os.path.join(ROOT, "tutorials", "steady", "flash",
                       "flash16_calcite_precipitation")
FLASH01 = os.path.join(ROOT, "tutorials", "steady", "flash",
                       "flash01_benzene_toluene")
UNSEALED = os.path.join(ROOT, "tutorials", "steady", "crystallisation",
                        "overlay02_nacl_calorimetric")
HENRY = os.path.join(STD, "parameters", "Henry", "Ar-water.dat")

fails = []


def fail(msg):
    fails.append(msg)
    print("FAIL  " + msg)


def ok(msg):
    print("  ok   " + msg)


#  A CHECK THAT CANNOT RUN MUST NOT PASS.  This used to print SKIP and exit
#  0 -- see bin/curate/gate_prereq.py for what that cost and where it is
#  latent (inside the suite) versus live (standalone, and gate_manifest).
require_solver(SOLVER)


def run_mutated(case, mutate):
    """Copy `case`, apply `mutate(dir)`, run it, return (rc, output)."""
    tmp = tempfile.mkdtemp(prefix="regscan.")
    try:
        dst = os.path.join(tmp, "case")
        shutil.copytree(case, dst)
        for junk in ("converged", "reports", "iterations"):
            shutil.rmtree(os.path.join(dst, junk), ignore_errors=True)
        mutate(dst)
        r = subprocess.run([SOLVER, dst], capture_output=True, text=True)
        return r.returncode, (r.stdout + r.stderr)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def refuses(label, case, mutate, expect):
    rc, out = run_mutated(case, mutate)
    if rc == 0:
        fail("%s: the case RAN (exit 0) -- the collision was absorbed "
             "silently, which is the whole defect" % label)
    elif expect not in out:
        fail("%s: refused (exit %d) but not for this reason -- expected a "
             "message carrying %r.  A negative test that trips an EARLIER "
             "refusal proves that refusal, not this one.  Tail:\n%s"
             % (label, rc, expect, out[-600:]))
    else:
        ok("%s: refused, naming both files" % label)


# ---------------------------------------------------------------------------
#  (a) two Henry records, one directory, one pair
# ---------------------------------------------------------------------------
def dup_henry(dst):
    d = os.path.join(dst, "constant", "parameters", "Henry")
    os.makedirs(d, exist_ok=True)
    for name in ("Ar-water.dat", "argon-in-water.dat"):
        shutil.copy(HENRY, os.path.join(d, name))


refuses("(a) two Henry files declaring one pair", FLASH01, dup_henry,
        "both declare the Henry pair 'Ar-water'")

# ---------------------------------------------------------------------------
#  (b) two chemistry records forming one species -- the silent wrong answer
# ---------------------------------------------------------------------------
def dup_formation(dst):
    d = os.path.join(dst, "constant", "chemistry")
    shutil.copy(os.path.join(d, "CO3-formation.dat"),
                os.path.join(d, "CO3-formation-copy.dat"))


refuses("(b) two records forming the species CO3", FLASH16, dup_formation,
        "two records both declare the formation of 'CO3'")

# ---------------------------------------------------------------------------
#  (c) the control -- unmutated, both still run
# ---------------------------------------------------------------------------
for case in (FLASH01, FLASH16):
    rc, out = run_mutated(case, lambda d: None)
    if rc != 0:
        fail("(c) %s no longer runs unmutated (exit %d) -- the guard refuses "
             "the honest corpus.  Tail:\n%s"
             % (os.path.basename(case), rc, out[-600:]))
    else:
        ok("(c) %s still runs unmutated" % os.path.basename(case))

# ---------------------------------------------------------------------------
#  (d) the deliberate tier override is ANNOUNCED, never silent
# ---------------------------------------------------------------------------
def local_henry(dst):
    d = os.path.join(dst, "constant", "parameters", "Henry")
    os.makedirs(d, exist_ok=True)
    shutil.copy(HENRY, os.path.join(d, "argon-in-water.dat"))


rc, out = run_mutated(UNSEALED, local_henry)
if rc != 0:
    fail("(d) the unsealed override case does not run (exit %d) -- a case-"
         "local record REPLACING a catalogue one is legal, not a refusal.  "
         "Tail:\n%s" % (rc, out[-600:]))
elif "[override] Henry pair 'Ar-water'" not in out:
    fail("(d) a case-local Henry record replaced the catalogue's silently -- "
         "the substitution must be announced (the same posture Database.cpp "
         "takes for a case-local component)")
else:
    ok("(d) the tier override runs and announces itself")

# ---------------------------------------------------------------------------
#  (e) the catalogue itself, swept statically
# ---------------------------------------------------------------------------
def word(body, key):
    m = re.search(r"(?m)^\s*" + key + r"\s+([^;\s]+)\s*;", body)
    return m.group(1) if m else None


def sweep(subdir, kind, keys, label):
    """kind = (keyword, value) selecting the records this registry owns."""
    d = os.path.join(STD, subdir)
    if not os.path.isdir(d):
        fail("(e) %s: %s does not exist -- this sweep is looking at nothing"
             % (label, subdir))
        return
    seen = collections.defaultdict(list)
    for fn in sorted(os.listdir(d)):
        if not fn.endswith(".dat"):
            continue
        body = open(os.path.join(d, fn), errors="replace").read()
        body = re.sub(r"/\*.*?\*/", "", body, flags=re.S)
        body = re.sub(r"//[^\n]*", "", body)
        if kind and word(body, kind[0]) != kind[1]:
            continue
        vals = [word(body, k) for k in keys]
        if any(v is None for v in vals):
            continue
        seen["|".join(vals)].append(fn)
    n = sum(len(v) for v in seen.values())
    #  A sweep that matched NOTHING is not a clean sweep, it is a blind one --
    #  the first draft of this file read `name` from the utilities (whose key
    #  is `utility`) and `kind` from the chemistry records (whose key is
    #  `recordType`), and reported both as passing with 0 records.
    if n == 0:
        fail("(e) %s: matched 0 records in %s -- the selector is wrong, so "
             "this sweep proves nothing" % (label, subdir))
        return
    hits = {k: v for k, v in seen.items() if len(v) > 1}
    for k, v in hits.items():
        fail("(e) %s: '%s' is claimed by %s -- the engine would keep whichever "
             "the filesystem listed last" % (label, k, " and ".join(v)))
    if not hits:
        ok("(e) %s: %d record(s), no two claiming one identity" % (label, n))


sweep("assets", ("kind", "constructionMaterial"), ["name"], "materials")
sweep("assets", ("kind", "RO"), ["name"], "RO membranes")
sweep("assets", ("kind", "NF"), ["name"], "NF membranes")
sweep("assets", ("kind", "adsorbent"), ["name"], "adsorbents")
sweep("parameters/Henry", None, ["solute", "solvent"], "Henry pairs")
sweep("parameters/solution", None, ["solute", "solvent"], "solution pairs")
sweep("utilities", None, ["utility"], "utilities")
sweep("chemistry", ("recordType", "aqueousSpeciation"), ["species"],
      "formation reactions")

# ---------------------------------------------------------------------------
#  (g) the same failure in different clothing: a propsDict `experimental`
#      entry's `name` IS its CSV's filename (exp_<name>.csv).  Two entries
#      sharing one name wrote over each other, and the overlay then drew one
#      dataset's points twice under two labels.  They are LIST entries, not
#      dict keys, so the parser's duplicate-key refusal never sees them.
# ---------------------------------------------------------------------------
PROPS = os.path.join(ROOT, "choupoProps")
VLE = os.path.join(ROOT, "tutorials", "props", "compare", "compare_vle_etoh_water")
if not os.path.exists(PROPS):
    fail("(g) no choupoProps binary -- cannot fire the dataset-name refusal")
else:
    tmp = tempfile.mkdtemp(prefix="regscan.")
    try:
        dst = os.path.join(tmp, "case")
        shutil.copytree(VLE, dst)
        #  The tutorial directory holds the CSVs of whoever ran it last (run
        #  output, gitignored).  Copying them along would make the "nothing
        #  written" assertion below read a leftover and call it a write --
        #  which is exactly what it did on the first run of this gate.
        for f in os.listdir(dst):
            if f.startswith("exp_") and f.endswith(".csv"):
                os.remove(os.path.join(dst, f))
        pd = os.path.join(dst, "system", "propsDict")
        text = open(pd).read()
        blk = text[text.index("experimental\n("):]
        entry = blk[blk.index("{"):blk.index("}") + 1]
        open(pd, "w").write(text.replace(entry + "\n);",
                                         entry + "\n    " + entry + "\n);", 1))
        r = subprocess.run([PROPS, dst], capture_output=True, text=True)
        out = r.stdout + r.stderr
        if r.returncode == 0:
            fail("(g) a propsDict with two datasets of one name RAN -- the "
                 "second silently overwrote the first one's CSV")
        elif "are both named 'etoh_water_1atm'" not in out:
            fail("(g) refused (exit %d) but not for this reason.  Tail:\n%s"
                 % (r.returncode, out[-500:]))
        elif [f for f in os.listdir(dst) if f.startswith("exp_")]:
            fail("(g) refused, but only after writing a CSV -- the check must "
                 "run before the loop, not inside it")
        else:
            ok("(g) two datasets of one name: refused, nothing written")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

# ---------------------------------------------------------------------------
#  (f) the symmetric-pair models look a file up under ONE canonical spelling
#      -- sorted, `min-max.dat` (NRTL.cpp, UNIQUAC.cpp, Wilson.cpp all build
#      the name as `a < b ? a-b : b-a`).  A curated pair written the other way
#      round is never opened: the model reports idealDefault while the file
#      sits in the very directory it just searched.  Announced, so not silent
#      -- but the announcement says "no parameters" about a pair that has
#      them, which is worse than useless.  Henry and Pitzer are NOT swept:
#      their keys are directional (solute-solvent, cation-anion).
# ---------------------------------------------------------------------------
SYMMETRIC = ("NRTL", "UNIQUAC", "Wilson")
unreachable, npair = [], 0
for base in (os.path.join(ROOT, "data", "standards", "parameters"),
             os.path.join(ROOT, "data", "local", "parameters")):
    for model in SYMMETRIC:
        d = os.path.join(base, model)
        if not os.path.isdir(d):
            continue
        for fn in sorted(os.listdir(d)):
            if not fn.endswith(".dat"):
                continue
            npair += 1
            stem = fn[:-4]
            a, _, b = stem.partition("-")
            canon = (a + "-" + b) if a < b else (b + "-" + a)
            if not b or canon != stem:
                unreachable.append((os.path.join(d, fn), canon + ".dat"))
for d, _, files in os.walk(os.path.join(ROOT, "tutorials")):
    if os.path.basename(os.path.dirname(d)) != "parameters":
        continue
    if os.path.basename(d) not in SYMMETRIC:
        continue
    for fn in sorted(files):
        if not fn.endswith(".dat"):
            continue
        npair += 1
        stem = fn[:-4]
        a, _, b = stem.partition("-")
        canon = (a + "-" + b) if a < b else (b + "-" + a)
        if not b or canon != stem:
            unreachable.append((os.path.join(d, fn), canon + ".dat"))
for path, canon in unreachable:
    fail("(f) %s is never opened -- the resolver builds the name sorted, so "
         "this pair must be called %s or the model silently falls back to "
         "ideal" % (os.path.relpath(path, ROOT), canon))
if not unreachable:
    ok("(f) %d symmetric-pair file(s), every one under the name the resolver "
       "actually builds" % npair)

print()
if fails:
    print("%d failure(s)." % len(fails))
    sys.exit(1)
print("registry-scan: every identity has exactly one file.")
sys.exit(0)
