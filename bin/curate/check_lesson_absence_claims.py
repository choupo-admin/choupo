#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_lesson_absence_claims -- a lesson's "we do not have X" is held to the tree.

    bin/curate/check_lesson_absence_claims.py             the gate
    bin/curate/check_lesson_absence_claims.py --selftest  the sabotage arms

WHY THIS EXISTS (DEV.md 4c C455, class 2).  CLAUDE.md §10 says: BURY THE
ABSENCE YOU JUST FILLED -- a capability commit greps for the sentence that
said it was missing.  At the lesson layer nobody did.  The 2026-11-19 outside
sweep of all 75 lessons (docs/reviews/2026-11-19-edutools-batch-*/REPORT.md)
found "we do not have X" outliving X again and again: boron "not curated"
after C198 landed Dickson's constant, glucose "has no Cp, refuses" after the
Gibbs reactor took a declared solid, "no vendor quotation" after C98 made a
quoted item a case input, "no severe fits" and "unweighted" after the fit
grades and `weighting uncertainty`, drying "linear R only" after the
falling-rate tables.  A student reads the sentence as a fact about the
engine; the engine had moved.

WHAT IS CHECKED.  Every line of gui/src/ui/methods/**/*.ts(x) OUTSIDE comments
that matches an ABSENCE pattern (not implemented / not built / has no / does
not have / refuses / missing / there is no / ...) is a SENTENCE, and it is in
exactly one of three states:

  (a) CLAIMED -- registered in CLAIMS below with `needle` (a substring of the
      line), what it says is absent, and PROBES that verify the absence still
      holds in the tree: ("absent", glob, regex) fails when the tree grows the
      thing; ("present", glob, regex) fails when the evidence for the claim
      (an engine message, a record's own statement) is gone.  A probe whose
      glob selects no file fails: a probe over nothing proves nothing.  A
      claim whose needle no longer occurs on a hit line is STALE and fails
      asking for its removal (the sentence was rewritten: the claim has done
      its work).
  (b) KNOWN_FALSE -- registered with the reason it is false against the tree
      today.  It is listed in the gate's output on every run, as the work
      list of whoever fixes the lesson; the entry must be removed when the
      sentence is rewritten (same staleness rule).
  (c) UNCLASSIFIED -- everything else.  A RATCHET, as class 1: per file, the
      count of such lines is pinned in debt_registry.LESSON_ABSENCE_UNCLASSIFIED
      and may only fall; a file may not gain one (a new absence sentence is
      CLAIMED with a probe, or rewritten), and a fall must lower the pin.

WHAT IS NOT CHECKED, said plainly.  A line is a hit by its wording; a
sentence in other words ("nothing in the tree prices this") is not seen.  The
unclassified population (most of it a page saying what IT does not model,
which no probe of the tree can verify) is counted, not judged; the ratchet
stops it growing.  A probe is a grep: it proves the absence of a word, not of
a capability.  Per-file counts cannot tell one sentence swapped for another.

THE REAL DEFECTS IT WOULD HAVE CAUGHT.  The operator-panels lesson says "Today
only the first slice exists ... the lock [is] not built yet" while the engine
reads a `lock` block and a read-only GUI workspace is on main
(src/postProcessing/panel/PanelPass.cpp, docs/design/operator-panel-in-the-
case.md): a "not built" sentence with no probe.  The fast/slow page announces
batch electrodialysis as "not built yet" while BatchElectrodialysis is
registered (src/unitOperations/batch/BatchUnitOperation.cpp:149) and
tutorials/batch/electrodialysis ships.  Both were KNOWN_FALSE until 2026-11-22 (rewritten); the
boron/glucose/vendor-quote sentences of the sweep were fixed by the C453
slices before this gate, and the same pattern would have refused them.
"""
import os
import re
import sys
import tempfile
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

import lesson_scan as ls                                       # noqa: E402
from debt_registry import LESSON_ABSENCE_UNCLASSIFIED          # noqa: E402

LABEL = "check_lesson_absence_claims"

ABSENCE = re.compile("|".join([
    r"not (yet )?(curated|implemented|supported|available|built|modelled|modeled|shipped|in the catalogue)",
    r"\b(has|have) no\b",
    r"does not (yet )?(have|support|model|carry|ship|include|know)",
    r"\brefus(e|es|ed|ing|al)\b",
    r"\bmissing\b",
    r"there is no ",
    r"we do not",
    r"\bunweighted\b",
    r"isn't (yet )",
    r"\bno [a-z -]{0,30}(is|are) shipped",
    r"\bno record\b",
]), re.I)

M = "gui/src/ui/methods/"

#  file, needle, what is claimed absent, probes
CLAIMS = [
    (M + "epsilonNtuLesson.ts", "is not implemented, and neither is any multi-shell",
     "crossflow in the heat exchanger unit",
     [("present", "src/unitOperations/heatTransfer/HeatExchanger.cpp", r"a real arrangement, not implemented")]),
    (M + "plantRunMath.ts", "announced as not implemented and straight line is used",
     "a depreciation method other than straightLine",
     [("present", "src/postProcessing/EconomicsPass.cpp", r"not implemented \(only straightLine\)")]),
    (M + "pinchLesson.ts", "supertargeting step this tool has not built",
     "a supertargeting (total-annual-cost over dTmin) step",
     [("absent", "src/**/*.cpp", r"[Ss]upertarget"),
      ("absent", M + "Pinch*.tsx", r"[Ss]upertarget"),
      ("absent", M + "pinchMoments.tsx", r"[Ss]upertarget")]),
    (M + "stackDispersionLesson.ts", "A cold jet's momentum rise is not built",
     "a momentum-rise term for a jet with no temperature excess",
     [("absent", M + "stackDispersionMath.ts", r"function \w*[Mm]omentum|momentumFlux|[Mm]omentumRise\s*[=(]")]),
    (M + "bjerrumLesson.ts", "knob is not built",
     "a background-electrolyte knob on the Bjerrum page",
     [("absent", M + "BjerrumTool.tsx", r"[Bb]ackground")]),
    (M + "equilibriumLandscapesLesson.ts", "glucose beside the gases refused",
     "history: the refusal the engine gave when the page was written is still recorded in ReactionGibbs.H",
     [("present", "src/propertyOps/ReactionGibbs.H", r"heat of sublimation")]),
    (M + "equilibriumLandscapesLesson.ts", "with no heat capacity at all still refuses",
     "the engine's refusal of a record with no liquidHeatCapacity (the glucose sentence the sweep found, "
     "now true as rewritten: glucose carries a Cp, a record with none still refuses)",
     [("present", "src/thermo/Component.cpp", r"h_formation liquid leg needs liquidHeatCapacity"),
      ("present", "data/standards/components/glucose.dat", r"^liquidHeatCapacity")]),
    (M + "processSafetyLesson.ts", "No record in Choupo carries decomposition kinetics",
     "decomposition kinetics or a T_D24 in any shipped record",
     [("absent", "data/standards/**/*.dat", r"decompositionKinetics|decompositionActivation|\bT_D24\b|\bSADT\b")]),
    (M + "poolFireLesson.ts", "The engine does not model fire radiation",
     "fire radiation in the engine",
     [("absent", "src/**/*.cpp", r"[Vv]iew factor|[Ff]ire radiation|thermal radiation flux")]),
    (M + "merkelLesson.ts", "needs a packing model this engine does not have",
     "a packing model (fill height / plan area) in the cooling tower unit",
     [("absent", "src/unitOperations/heatTransfer/CoolingTower.cpp",
       r"lookup\w*\(\s*\"(packing\w*|fill\w*|planArea|height|area)\"")]),
    (M + "optimizersLesson.ts", "An optimiser refuses such a run",
     "history: the driver's replay check that refuses an optimum at a point that breaks conservation is in the tree",
     [("present", "src/outerDriver/OptimizationDriver.cpp", r"this is NOT an optimum and none is")]),
    (M + "relaxationLesson.ts", "plants, is not built in Choupo",
     "an inexact (loosened) inner tolerance in the recycle loop of a flowsheet",
     [("absent", "src/unitOperations/flowsheet/*.cpp", r"[Ii]nexact"),
      ("absent", "src/solver/*.cpp", r"[Ii]nexact")]),
    (M + "dataReconciliationLesson.ts", "exists and is not built here",
     "a Bayesian fault probability (a prior per meter) in the reconciliation page code",
     [("absent", M + "dataReconciliationRun.ts", r"faultProbab|failurePrior|priorProbab|posteriorFault")]),
]

#  file, needle, why it is false today (the work list of the lesson's fixer)
KNOWN_FALSE = [
]


def hits(root):
    """{rel: [(lineno, text)]} -- absence lines outside comments."""
    out = {}
    for rel in ls.lesson_files(root):
        with open(os.path.join(root, rel), encoding="utf-8", errors="replace") as f:
            text = ls.strip_comments(f.read())
        for n, line in enumerate(text.split("\n"), 1):
            if ABSENCE.search(line):
                out.setdefault(rel, []).append((n, line))
    return out


def evaluate(root):
    bad, found = [], hits(root)
    covered = set()

    def locate(rel, needle):
        for n, line in found.get(rel, []):
            if needle in line:
                return n
        return None

    nprobe = 0
    for rel, needle, claim, probes in CLAIMS:
        n = locate(rel, needle)
        if n is None:
            bad.append("CLAIM %s %r: the sentence is gone (or no longer an absence line) -- "
                       "remove the claim from CLAIMS" % (rel, needle))
            continue
        covered.add((rel, n))
        for kind, glob, rx in probes:
            nprobe += 1
            ok, hit = ls.probe(root, kind, glob, rx)
            if not ok:
                if kind == "absent" and hit and "selects no file" not in hit:
                    bad.append("%s:%d says there is no %s, but the tree has it: %s matches /%s/ -- "
                               "rewrite the sentence" % (rel, n, claim, hit, rx))
                else:
                    bad.append("%s:%d claim about %s: probe (%s, %s, /%s/) failed (%s)"
                               % (rel, n, claim, kind, glob, rx, hit))
    nfalse = 0
    for rel, needle, why in KNOWN_FALSE:
        n = locate(rel, needle)
        if n is None:
            bad.append("KNOWN_FALSE %s %r: the sentence is gone -- remove the entry "
                       "(thank you for fixing it)" % (rel, needle))
            continue
        covered.add((rel, n))
        nfalse += 1
    have = Counter()
    for rel, lst in found.items():
        for n, _ in lst:
            if (rel, n) not in covered:
                have[rel] += 1
    for rel, n in sorted(have.items()):
        pin = LESSON_ABSENCE_UNCLASSIFIED.get(rel)
        if pin is None:
            ex = [t.strip()[:70] for k, t in found[rel] if (rel, k) not in covered][:2]
            bad.append("%s: %d absence sentence(s) in a file with no pin (%s) -- CLAIM each with a "
                       "probe of the tree, or rewrite" % (rel, n, " | ".join(ex)))
        elif n > pin:
            ex = [t.strip()[:70] for k, t in found[rel] if (rel, k) not in covered][-2:]
            bad.append("%s: %d unclassified absence sentences, pinned at %d (%s) -- a new "
                       "'we do not have X' needs a claim and a probe" % (rel, n, pin, " | ".join(ex)))
        elif n < pin:
            bad.append("%s: %d unclassified, pinned at %d -- lower debt_registry."
                       "LESSON_ABSENCE_UNCLASSIFIED to %d" % (rel, n, pin, n))
    for rel, pin in sorted(LESSON_ABSENCE_UNCLASSIFIED.items()):
        if rel not in have:
            bad.append("%s: pinned at %d but has none -- remove its entry" % (rel, pin))
    return bad, have, len(CLAIMS), nprobe, nfalse


def selftest():
    """Sabotage arms on a private root: methods/ files copied, everything else linked."""
    fails = 0
    with tempfile.TemporaryDirectory(prefix="absence_") as td:
        ls.private_root(ROOT, td)
        bad, *_ = evaluate(td)
        if bad:
            print("selftest: baseline not green: %s" % bad[0])
            return 1

        def arm(name, edit, expect):
            nonlocal fails
            path, old, new = edit
            p = os.path.join(td, path)
            with open(p, encoding="utf-8") as f:
                t = f.read()
            if old and old not in t:
                print("selftest %s: edit did not apply" % name)
                fails += 1
                return
            with open(p, "w", encoding="utf-8") as f:
                f.write(t.replace(old, new, 1) if old else t + new)
            bad, *_ = evaluate(td)
            with open(p, "w", encoding="utf-8") as f:
                f.write(t)
            ok = any(expect in b for b in bad)
            print("selftest %-34s %s" % (name, "caught" if ok else "NOT CAUGHT (%s)" % bad[:1]))
            fails += 0 if ok else 1

        arm("new absence sentence", (M + "bodeLesson.ts", "", '\nconst x = "The engine has no gain scheduling.";\n'),
            "unclassified absence sentences")
        arm("probe: thing grew in the tree", (M + "BjerrumTool.tsx", "", '\nconst k = "Background";\n'),
            "the tree has it")
        arm("claim sentence rewritten", (M + "bjerrumLesson.ts", "knob is not built", "knob is built"),
            "the sentence is gone")
        arm("a 'not built yet' sentence put back", (M + "FastSlowTool.tsx", "Not on this page: a cascade", "Not built yet: a cascade"),
            "a new 'we do not have X'")
    return 1 if fails else 0


def main(argv=None):
    args = argv if argv is not None else sys.argv[1:]
    if args and args[0] == "--selftest":
        return selftest()
    root = args[0] if args else ROOT
    bad, have, nclaims, nprobe, nfalse = evaluate(root)
    if bad:
        for b in bad:
            print("  " + b)
        print("%s: FAILED (%d finding(s))" % (LABEL, len(bad)))
        return 1
    print("%s: OK %d absence claim(s) held by %d probe(s) of the tree, %d KNOWN FALSE listed for "
          "the lesson's fixer, %d unclassified sentence(s) in %d file(s) each at its pin (ratchet: may "
          "only fall).  NOT checked: a sentence in other words, whether a grep probe proves a "
          "capability absent, or a page's own 'this page does not model' (counted, not judged)."
          % (LABEL, nclaims, nprobe, nfalse, sum(have.values()), len(have)))
    for rel, needle, why in KNOWN_FALSE:
        print("  KNOWN FALSE %s %r: %s" % (rel, needle, why[:200]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
