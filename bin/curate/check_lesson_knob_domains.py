#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_lesson_knob_domains -- a lesson's slider stays inside the model's validity.

    bin/curate/check_lesson_knob_domains.py             the gate
    bin/curate/check_lesson_knob_domains.py --scan      list every knob found, declared or not
    bin/curate/check_lesson_knob_domains.py --selftest  the sabotage arms

WHY THIS EXISTS (DEV.md 4c C455, class 5).  A knob's min and max are typed by
whoever builds the page, and nothing ties them to the validity the engine (or
physics) declares.  The 2026-11-19 sweep (docs/reviews/2026-11-19-edutools-
batch-ef, -gh, -ij, -op) found the sliders leaving the model's domain again
and again: the Merkel air-moisture knob reaching supersaturated air (about
60 % of its range at 25 C), the drying humidity knob to 0.04 kg/kg at 300 K
(saturation is 0.0225), the Levenspiel feed temperature to 360 K while the
ethanol-rich end of its own feed box boils at 351 K (the page then runs a
liquid-phase rate law on a vapour), saltMixing's temperature sliders taking
the KCl Pitzer record past its 4.8 mol/kg validity, the overpressure P2 knob
above the relieving pressure.  The engine refuses by name, and the student
meets a refusal the page invited.

WHAT IS CHECKED.  The knobs the scan finds -- an object with `id:`/`key:` and
`min:`/`max:` (the KNOBS arrays of the Tool files) and a JSX Slider/KnobNumber/
NumberInput with numeric min= and max= -- are in one of two states:

  (a) DECLARED in DOMAINS below: (file, knob id, validity lo, validity hi,
      reason).  A validity bound is a number, a value READ from the tree
      (("read", path, regex, scale): a record's declared range), or an
      expression over the page's other knobs' coded ranges and defaults
      (("expr", "..."), with `psat_water(T)` available).  The gate FAILS
      when the coded min is below lo or the coded max above hi, naming how
      much of the coded range lies outside.  An entry flagged `violates=True`
      is a KNOWN violation, the work list of whoever fixes the page: it
      must STILL violate (when the page is fixed the gate asks for the flag
      to be removed, and from then the bound is held).  An entry whose knob
      is gone fails asking for its removal.
  (b) UNDECLARED -- everything else.  A RATCHET as classes 1, 2 and 4: per
      file, the count is pinned in debt_registry.LESSON_KNOBS_UNDECLARED and
      may only fall; a new knob must be declared with its validity, or be
      declared as unbounded by physics (lo/hi None with a reason).

WHAT IS NOT CHECKED, said plainly.  A validity that depends on the model's
OUTPUT (saltMixing's eutonic molality at a temperature; the overpressure
relieving pressure of a given loop) is not a constant and is not expressed
here -- those are listed as candidates in the report that introduced this
gate.  A bound taken at the page's defaults or at the coldest corner of its
own box is the reviewer's rule, not a proof the page cannot leave the domain
elsewhere.  `psat_water` is a Magnus formula (about 0.5 % between 0 and 60 C),
an independent bound, not the engine's vapour pressure.  Per-file counts
cannot tell one knob swapped for another.

THE REAL DEFECTS IT WOULD HAVE CAUGHT.  DryingCurveTool airY max 0.04 against
Y_sat(300 K) = 0.0225; MerkelTool airMoisture max 5 kmol/h against the
saturation moisture of its default air (2.1 kmol/h); LevenspielTool T max
360 K against the ethanol normal boiling point 351.44 K (data/standards/
components/ethanol.dat).  All three were KNOWN violations until 2026-11-22, when the
sliders were clamped and the entries became held bounds.
"""
import math
import os
import re
import sys
import tempfile
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

import lesson_scan as ls                                          # noqa: E402
from debt_registry import LESSON_KNOBS_UNDECLARED                 # noqa: E402

LABEL = "check_lesson_knob_domains"
M = "gui/src/ui/methods/"

NUMRX = r"-?\d+(?:\.\d+)?(?:e[-+]?\d+)?"


def _obj(anchor):
    return re.compile(
        r'\b' + anchor + r':\s*"(?P<id>[\w.]+)"(?P<body>(?:(?!\b' + anchor + r':\s*").){0,900}?)'
        r"\bmin:\s*(?P<min>" + NUMRX + r")\s*,\s*max:\s*(?P<max>" + NUMRX + r")", re.S | re.I)


OBJ_ID, OBJ_KEY = _obj("id"), _obj("key")
DEF = re.compile(r"\bdef:\s*(" + NUMRX + ")", re.I)
JSX = re.compile(r"<(?:Slider|RangeSlider|NumberInput|KnobNumber)\b(?P<chunk>.*?)/>", re.S)
JMIN = re.compile(r"\bmin=\{(" + NUMRX + r")\}")
JMAX = re.compile(r"\bmax=\{(" + NUMRX + r")\}")
JID = re.compile(r"\bvalue=\{([^}]+)\}")


def psat_water(T):
    """Saturation pressure of water in Pa, Magnus (Alduchov & Eskridge 1996),
    about 0.5 % between 0 and 60 C: an independent bound, not the engine's."""
    c = T - 273.15
    return 610.94 * math.exp(17.625 * c / (c + 243.04))


def scan_file(text):
    """[(id, min, max, def)] -- object-form knobs, then JSX-form knobs."""
    out = []
    t = text
    spans = []
    for rx in (OBJ_ID, OBJ_KEY):
        for m in rx.finditer(t):
            if any(a <= m.start() < b for a, b in spans):
                continue
            spans.append((m.start(), m.end()))
            d = DEF.search(m.group("body"))
            out.append((m.group("id"), float(m.group("min")), float(m.group("max")),
                        float(d.group(1)) if d else None))
    seen = Counter()
    for m in JSX.finditer(t):
        ch = m.group("chunk")
        a, b = JMIN.search(ch), JMAX.search(ch)
        if not (a and b):
            continue
        v = JID.search(ch)
        ident = (v.group(1).strip() if v else "?")
        seen[ident] += 1
        if seen[ident] > 1:
            ident += "#%d" % seen[ident]
        out.append((ident, float(a.group(1)), float(b.group(1)), None))
    return out


def knobs(root):
    res = {}
    for rel in ls.lesson_files(root):
        with open(os.path.join(root, rel), encoding="utf-8", errors="replace") as f:
            text = ls.strip_comments(f.read())
        found = scan_file(text)
        if found:
            res[rel] = found
    return res


#  (file, knob id, validity lo, validity hi, reason, violates?)
#  A bound: None (unbounded), a number, ("read", path, regex, scale) or ("expr", "python expression").
#  In an expression `k("id")` is the file's knob `id` with .min .max .dflt.
DOMAINS = [
    (M + "DryingCurveTool.tsx", "airY", 0.0,
     ("expr", "0.622 * psat_water(k('airT').min) / (101325.0 - psat_water(k('airT').min))"),
     "air humidity ratio cannot exceed saturation at the knob box's coldest air temperature "
     "(Y_sat(300 K) = 0.0225 kg/kg; the knob goes to 0.04, supersaturated air the engine refuses; clamped to 0.02 on 11-22)", False),
    (M + "MerkelTool.tsx", "airMoisture", 0.0,
     ("expr", "(psat_water(k('airT').dflt) / (101325.0 - psat_water(k('airT').dflt))) * k('dryAirFlow').dflt"),
     "the water vapour carried by the default air cannot exceed saturation at its default temperature "
     "(about 2.1 kmol/h at 25 C and 65 kmol/h of dry air; the knob goes to 5, about 58 % of its range "
     "supersaturated; clamped to 2 on 11-22)", False),
    (M + "LevenspielTool.tsx", "T", None,
     ("read", "data/standards/components/ethanol.dat", r"^Tb\s+(" + NUMRX + r");", 1.0),
     "the liquid-phase rate law is only meaningful below the feed's bubble point, and the ethanol-rich end "
     "of the page's own feed box boils near the ethanol normal boiling point (351.44 K); the knob was 360 K, now 351 (11-22)",
     False),
    (M + "FlashOperatingLineTool.tsx", "z", 0.0, 1.0, "a mole fraction lies in [0, 1]", False),
    (M + "FlashOperatingLineTool.tsx", "vf", 0.0, 1.0,
     "the vapour fraction of a two-phase feed lies in [0, 1] (q = 1 - vf: the page's feed is partly vaporised, "
     "never a sub-cooled liquid, which is q > 1)", False),
    (M + "PonchonSavaritTool.tsx", "xD", 0.0, 1.0, "a distillate mole fraction lies in [0, 1]", False),
    (M + "EquilibriumOrRateBasedTool.tsx", "e", None, None,
     "log10(lambda), lambda = m V / L, a positive ratio with no physical bound: the relation HETP = "
     "H_OG ln(lambda)/(lambda-1) holds for every lambda > 0 (Seader, Henley and Roper Eq. 7-87); the "
     "slider spans 0.1 to 10, the page's own choice", False),
    (M + "OverpressureTool.tsx", "Kd", 0.0, 1.0, "a discharge coefficient lies in (0, 1]", False),
    (M + "OverpressureTool.tsx", "Kb", 0.0, 1.0, "a back-pressure correction factor lies in (0, 1]", False),
    (M + "StiffChemistryTool.tsx", "logLam", 3.0, 10.0,
     "log10 of the fastest rate in 1/s: radicals settle in about 1e-9 s and NOx chemistry in about 1e-3 s "
     "(Theory Guide ch:stiff-ode), so 1e3 to 1e10 /s spans the chemistry the page is about; the page is "
     "arithmetic on stability functions and runs no engine case", False),
    (M + "StiffChemistryTool.tsx", "logH", -10.0, -2.0,
     "log10 of the step in s: from below the radical time scale to above the 3 ms window of nox03 "
     "(endTime 3e-2 s there, writeInterval 1e-3 s); the arithmetic is defined for every step", False),
    (M + "TransferUnitTool.tsx", "R", 0.0, 1.0, "a recovery (fraction of the solute absorbed) lies in [0, 1)", False),
    (M + "TransferUnitTool.tsx", "A", 0.0, None, "an absorption factor L/(mG) is positive and has no upper bound by physics", False),
    (M + "TransferUnitTool.tsx", "H", 0.0, None, "a height of a transfer unit is positive and has no upper bound by physics", False),
]


def bound(root, spec, knobs_in_file):
    if spec is None or isinstance(spec, (int, float)):
        return spec
    kind = spec[0]
    if kind == "read":
        _k, path, rx, scale = spec
        with open(os.path.join(root, path), errors="replace") as f:
            m = re.search(rx, f.read(), re.M)
        if not m:
            raise ValueError("no match for /%s/ in %s" % (rx, path))
        return float(m.group(1)) * scale
    if kind == "expr":
        def k(i):
            for ident, lo, hi, d in knobs_in_file:
                if ident == i:
                    return type("K", (), {"min": lo, "max": hi, "dflt": d})()
            raise KeyError(i)
        return float(eval(spec[1], {"__builtins__": {}}, {"psat_water": psat_water, "k": k}))
    raise ValueError(kind)


def evaluate(root):
    bad = []
    found = knobs(root)
    declared = set()
    nviol = nhold = 0
    for rel, kid, lo_s, hi_s, why, violates in DOMAINS:
        ent = next(((i, a, b, d) for i, a, b, d in found.get(rel, []) if i == kid), None)
        if ent is None:
            bad.append("DOMAINS %s %s: the knob is gone (or no longer scanned) -- remove the entry" % (rel, kid))
            continue
        declared.add((rel, kid))
        _i, cmin, cmax, _d = ent
        try:
            lo, hi = bound(root, lo_s, found[rel]), bound(root, hi_s, found[rel])
        except (ValueError, KeyError, OSError) as e:
            bad.append("DOMAINS %s %s: the validity could not be read (%s) -- re-point it" % (rel, kid, e))
            continue
        out = []
        if lo is not None and cmin < lo - 1e-12 * max(1.0, abs(lo)):
            out.append("min %g is below the validity %g" % (cmin, lo))
        if hi is not None and cmax > hi + 1e-12 * max(1.0, abs(hi)):
            frac = (cmax - hi) / (cmax - cmin) if cmax > cmin else 1.0
            out.append("max %g is above the validity %.6g (%.0f %% of the coded range)" % (cmax, hi, 100 * frac))
        if out and not violates:
            bad.append("%s knob %s leaves the model's domain: %s -- %s" % (rel, kid, "; ".join(out), why))
        elif violates and not out:
            bad.append("%s knob %s is inside its validity now (min %g, max %g) -- remove violates=True so the "
                       "bound is held" % (rel, kid, cmin, cmax))
        elif violates:
            nviol += 1
        else:
            nhold += 1
    have = Counter()
    for rel, lst in found.items():
        for i, *_ in lst:
            if (rel, i) not in declared:
                have[rel] += 1
    for rel, n in sorted(have.items()):
        pin = LESSON_KNOBS_UNDECLARED.get(rel)
        if pin is None:
            bad.append("%s: %d knob(s) with a coded range and no declared validity, no pin -- declare each in "
                       "DOMAINS (a bound from the engine/data/physics, or None with a reason)" % (rel, n))
        elif n > pin:
            bad.append("%s: %d undeclared knobs, pinned at %d -- declare the new one in DOMAINS" % (rel, n, pin))
        elif n < pin:
            bad.append("%s: %d undeclared knobs, pinned at %d -- lower debt_registry.LESSON_KNOBS_UNDECLARED "
                       "to %d" % (rel, n, pin, n))
    for rel, pin in sorted(LESSON_KNOBS_UNDECLARED.items()):
        if rel not in have:
            bad.append("%s: pinned at %d but has none -- remove its entry" % (rel, pin))
    return bad, have, nhold, nviol


def selftest():
    fails = 0
    with tempfile.TemporaryDirectory(prefix="knobs_") as td:
        ls.private_root(ROOT, td)
        bad, *_ = evaluate(td)
        if bad:
            print("selftest: baseline not green: %s" % bad[0])
            return 1

        def arm(name, path, old, new, expect, every=False):
            nonlocal fails
            p = os.path.join(td, path)
            with open(p, encoding="utf-8") as f:
                t = f.read()
            if old and old not in t:
                print("selftest %s: edit did not apply" % name)
                fails += 1
                return
            with open(p, "w", encoding="utf-8") as f:
                f.write(t.replace(old, new) if every else (t.replace(old, new, 1) if old else t + new))
            bad, *_ = evaluate(td)
            with open(p, "w", encoding="utf-8") as f:
                f.write(t)
            ok = any(expect in b for b in bad)
            print("selftest %-44s %s" % (name, "caught" if ok else "NOT CAUGHT %s" % bad[:1]))
            fails += 0 if ok else 1

        arm("a mole-fraction slider widened past 1", M + "FlashOperatingLineTool.tsx",
            "<Slider min={0.02} max={0.98}", "<Slider min={0.02} max={1.2}", "leaves the model's domain")
        arm("a fixed slider widened back to supersaturation", M + "DryingCurveTool.tsx",
            "def: 0.010, min: 0.001, max: 0.02", "def: 0.010, min: 0.001, max: 0.04", "leaves the model's domain")
        arm("a new slider with no declared validity", M + "FlashOperatingLineTool.tsx", "",
            '\nconst x = <Slider min={0} max={9} step={1} value={newKnob} />;\n', "undeclared knobs")
    return 1 if fails else 0


def main(argv=None):
    args = argv if argv is not None else sys.argv[1:]
    if args and args[0] == "--selftest":
        return selftest()
    if args and args[0] == "--scan":
        for rel, lst in sorted(knobs(ROOT).items()):
            for i, a, b, d in lst:
                print("%s %s min=%g max=%g def=%s" % (rel, i, a, b, d))
        return 0
    root = args[0] if args else ROOT
    bad, have, nhold, nviol = evaluate(root)
    if bad:
        for b in bad:
            print("  " + b)
        print("%s: FAILED (%d finding(s))" % (LABEL, len(bad)))
        return 1
    print("%s: OK %d knob(s) held inside a declared validity, %d KNOWN violation(s) still violating "
          "(the page fixer's list), %d undeclared knob(s) in %d file(s) each at its pin (ratchet: may only "
          "fall).  NOT checked: a validity that is the model's output (a saturation molality, a relieving "
          "pressure), a corner of the box other than the declared one, a knob built in code the scan "
          "does not read." % (LABEL, nhold, nviol, sum(have.values()), len(have)))
    for rel, kid, lo, hi, why, violates in DOMAINS:
        if violates:
            print("  KNOWN VIOLATION %s %s: %s" % (rel, kid, why[:190]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
