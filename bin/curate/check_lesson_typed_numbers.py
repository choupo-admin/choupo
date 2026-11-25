#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_lesson_typed_numbers -- a number a lesson types from a case equals the case's golden.

    bin/curate/check_lesson_typed_numbers.py             the gate
    bin/curate/check_lesson_typed_numbers.py --scan      list the unregistered candidates
    bin/curate/check_lesson_typed_numbers.py --selftest  the sabotage arms

WHY THIS EXISTS (DEV.md 4c C455, class 4).  A lesson types a number a witness
case prints, and the case's `expected` file is the only record of what the
engine prints TODAY.  The 2026-11-19 sweep (docs/reviews/2026-11-19-edutools-
batch-ef, -kl, -op) found the two drifting apart: limitingReactant quoted a
converter inlet of 3.589 and X = 0.355 where the golden gave 3.584 and 0.350;
runLog quoted flash13's final residual twice, 4.4550e-16 at one line and
1.8432e-13 at another; solventMixture's comparison ran backwards against the
solvent02 golden; psychro likewise.  Each was a literal typed once, after a
run that a later re-record moved.  Nothing connected the literal to the row.

WHAT IS CHECKED.  Two populations.

  (1) REGISTERED -- TYPED below: (lesson file, the literal exactly as typed,
      the case, the golden row "kind name key", optional scale).  The gate
      reads the case's `expected`, takes the row, and fails when the typed
      literal differs from scale x golden by more than HALF A UNIT OF THE
      LAST TYPED DIGIT (so 4.2262 holds 4.22615 and fails 4.2271; 4.4550e-16
      fails 1.8432e-13).  A literal no longer in its file, a case or row that
      is gone, are stale entries and fail asking for removal.
  (2) CANDIDATES -- the scan: a literal of four or more significant digits
      (no trailing zero), in a lesson file that NAMES a case (its directory
      name appears in the file), equal to a non-integer row of that case's
      `expected` to the typed precision, and not registered.  Counted per
      file and pinned in debt_registry.LESSON_TYPED_CANDIDATES, a RATCHET:
      a file may not gain one (REGISTER it, which is the cheap way to make
      it kept, or rewrite it as read from the case), and a fall asks the pin
      to be lowered.  A fall also catches DRIFT of an unregistered literal:
      when a re-record moves the golden, the literal stops matching its row,
      the candidate disappears and the pin must be lowered -- the reviewer
      who lowers it finds the drift.  `--scan` prints the candidates.

WHAT IS NOT CHECKED, said plainly.  A number that is DERIVED from several
rows (the limitingReactant 3.584 is a ratio of two streams' compositions,
and a stream's compositions are NOT golden rows: the row kinds recorded for
a stream are F and T) is not reached -- the remedy there is to pin the
composition rows in the case's golden (a golden record, not this gate's
business) or a GUI test that reads the converged output.  A literal that
differs from every row by more than half a unit is not seen by the scan
(it is a candidate only while it still MATCHES): the registry is the
defence for the numbers that matter.  The scan matches by value, so a
coincidence of four digits can be registered wrongly; the registrant reads
the sentence.

THE REAL DEFECT IT WOULD HAVE CAUGHT.  limitingReactantLesson typed 3.589 and
0.355 for greenAmmoniaPEQ_baseCase while the run gave 3.584 and 0.350
(batch-ef REPORT 8); had the literal been registered against a row, the
re-record that moved it would have failed here.  runLog's second residual is
the other defect: 1.8432e-13 against a golden of 4.4550e-16.
"""
import os
import re
import sys
import tempfile
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

import lesson_scan as ls                                          # noqa: E402
from debt_registry import LESSON_TYPED_CANDIDATES                 # noqa: E402

LABEL = "check_lesson_typed_numbers"
# The tree it reads (bin/integrate --plan reach): the case goldens and the lessons.
SCAN_ROOTS = ("tutorials", "gui/src/ui/methods")

M = "gui/src/ui/methods/"

#  (lesson file, literal as typed, case dir name, golden row "kind name key"[, scale])
TYPED = [
    (M + "BjerrumTool.tsx", "0.9997", "bjerrum01_carbonate_pH", "diag base_8p0 aw"),
    (M + "DeclaredPathwaysTool.tsx", "0.451305381529", "equil02_methanol_declared_pathways", "kpi gibbs y_CH4"),
    (M + "DeclaredPathwaysTool.tsx", "0.609773723464", "equil02_methanol_declared_pathways", "kpi declared conversion_methanolSynthesis"),
    (M + "EquilibriumLandscapesTool.tsx", "0.323866847046", "gibbs10_ammonia_fugacity", "kpi ammonia y_NH3"),
    (M + "FlashOperatingLineTool.tsx", "0.30398", "flash01_benzene_toluene", "kpi flash01 V_over_F"),
    (M + "FlashOperatingLineTool.tsx", "0.30398357314", "flash01_benzene_toluene", "kpi flash01 V_over_F"),
    (M + "gasLine.ts", "1.78433840676e-5", "pipe09_isothermal_gas_line", "kpi P1 viscosity"),
    (M + "PcSaftTheoryTool.tsx", "3.817", "flash20_ethanol_water_pcsaft", "kpi flashNRTL K_ethanol"),
    (M + "SourWaterTool.tsx", "0.007862483", "stripper02_sour_water_h2s", "csv reports/unitOperations/tower/profile.csv 7:m_H2Saq"),
    (M + "SourWaterTool.tsx", "0.27828666", "stripper02_sour_water_h2s", "csv reports/unitOperations/tower/profile.csv 1:m_HS"),
    (M + "SourWaterTool.tsx", "0.28899549", "stripper02_sour_water_h2s", "csv reports/unitOperations/tower/profile.csv 7:m_HS"),
    (M + "SourWaterTool.tsx", "356.19447", "stripper02_sour_water_h2s", "kpi tower T_top"),
    (M + "SourWaterTool.tsx", "371.451137452", "stripper02_sour_water_h2s", "kpi tower T_bottom"),
    (M + "SourWaterTool.tsx", "371.45114", "stripper02_sour_water_h2s", "kpi tower T_bottom"),
    (M + "SourWaterTool.tsx", "7.6355899", "stripper02_sour_water_h2s", "csv reports/unitOperations/tower/profile.csv 7:pH"),
    (M + "SourWaterTool.tsx", "7.6463758e-06", "stripper02_sour_water_h2s", "csv reports/unitOperations/tower/profile.csv 7:m_HCO3"),
    (M + "SourWaterTool.tsx", "8.2130876", "stripper02_sour_water_h2s", "csv reports/unitOperations/tower/profile.csv 1:pH"),
    (M + "SourWaterTool.tsx", "8.4947876", "stripper02_sour_water_h2s", "csv reports/unitOperations/tower/profile.csv 0:pH"),
    (M + "VanHeerdenTool.tsx", "0.00126615", "cstr08_furusawa_bistable", "kpi reactor V_R"),
    (M + "WhatIsExergyTool.tsx", "4.22615345389", "compressor01_air", "kpi compressor01 dS_gen"),
    (M + "WhatIsExergyTool.tsx", "4.2262", "compressor01_air", "kpi compressor01 dS_gen"),
    (M + "compressionLesson.ts", "0.1379", "compressor03_staged_design", "equipment compressor1 values.intercooler1_dP"),
    (M + "compressionLesson.ts", "1.0231", "ammonia02_full_plant", "equipment makeupComp values.stage1_Zavg"),
    (M + "compressionLesson.ts", "1.6090244", "compressor03_staged_design", "equipment compressor1 values.stage1_n"),
    (M + "compressionLesson.ts", "2.3568", "compressor03_staged_design", "equipment compressor1 values.rStage"),
    (M + "compressionLesson.ts", "28.845", "compressor03_staged_design", "equipment compressor1 values.MW"),
    (M + "declaredPathwaysLesson.ts", "3.228", "equil04_reforming_carbon_declared_pathways", "kpi complete Kp_methaneCracking"),
    (M + "dryingLesson.ts", "300.5343", "dryer02_characteristic_curves", "kpi concave T_wb"),
    (M + "layoutExercise.ts", "1.894", "ammonia02_full_plant", "layout separation:separator:letdown value"),
    (M + "overpressure.ts", "399.459968689", "relief02_acetone_fire_case", "diag relieving T"),
    (M + "overpressure.ts", "4994421.174", "greenAmmonia02_feasibility50bar", "kpi FeedPreheater P"),
    (M + "reactorLadderLesson.ts", "0.420716387613", "ladder01_wgs_three_rungs", "kpi gibbs y_CO2"),
    (M + "reactorLadderLesson.ts", "0.8195501646", "ladder01_wgs_three_rungs", "kpi approach conversion_wgs"),
    (M + "reactorLadderLesson.ts", "0.8414", "ladder01_wgs_three_rungs", "kpi kinetic X_limiting"),
    (M + "reactorLadderLesson.ts", "0.841432775225", "ladder01_wgs_three_rungs", "kpi kinetic X_limiting"),
    (M + "reactorLadderLesson.ts", "20.6270966354", "ladder01_wgs_three_rungs", "kpi approach Kp_wgs"),
    (M + "reactorLadderLesson.ts", "28.1586609387", "ladder01_wgs_three_rungs", "kpi limit Kp_wgs"),
    (M + "reactorLadderLesson.ts", "28.1587", "ladder01_wgs_three_rungs", "kpi limit Kp_wgs"),
    (M + "routeScreeningLesson.ts", "0.21185113285", "screen01_methanol_routes", "kpi equilB conversion_routeB"),
    (M + "routeScreeningLesson.ts", "0.3321", "screen01_methanol_routes", "kpi gibbsC y_water"),
    (M + "routeScreeningLesson.ts", "0.4991", "screen01_methanol_routes", "kpi gibbsC y_CH4"),
    (M + "routeScreeningLesson.ts", "0.529340322518", "screen01_methanol_routes", "kpi equilA conversion_routeA"),
    (M + "routeScreeningLesson.ts", "1.9134e-3", "screen01_methanol_routes", "kpi equilA Kp_routeA"),
    (M + "routeScreeningLesson.ts", "2.2039e-5", "screen01_methanol_routes", "kpi equilB Kp_routeB"),
    (M + "syngasExercise.ts", "0.2485", "gibbs11_carbon_deposition", "kpi reformerLow F_solid_kmol_h"),
    (M + "syngasExercise.ts", "0.7358", "psa01_h2_psa", "kpi h2psa recovery_H2"),
    (M + "syngasExercise.ts", "0.9848", "psa01_h2_psa", "kpi h2psa purity_H2"),
    (M + "OptimizersTool.tsx", "0.03479", "optim06_integer_stages", "kpi column01 V_strip"),
    (M + "OptimizersTool.tsx", "2.8994", "optim06_integer_stages", "kpi column01 R"),
    (M + "OptimizersTool.tsx", "0.979999", "optim06_integer_stages", "kpi column01 x_D_LK"),
    (M + "optimizersLesson.ts", "0.03479", "optim06_integer_stages", "kpi column01 V_strip"),
    (M + "optimizersLesson.ts", "2.8994", "optim06_integer_stages", "kpi column01 R"),
    (M + "optimizersLesson.ts", "0.979999", "optim06_integer_stages", "kpi column01 x_D_LK"),
]

NUM = re.compile(r"(?<![\w.])(\d+\.\d{3,}(?:e[+-]?\d+)?|\d\.\d+e[+-]?\d+)(?![\w])", re.I)


def case_index(root):
    idx = {}
    for dp, dn, fns in os.walk(os.path.join(root, "tutorials")):
        if "expected" in fns and os.path.isfile(os.path.join(dp, "system", "controlDict")):
            idx[os.path.basename(dp)] = os.path.join(dp, "expected")
        dn[:] = [d for d in dn if d not in ("0", "constant", "system", "curation", "converged",
                                             "internalStates") and not d.startswith("0.")]
    return idx


def read_rows(path):
    rows = {}
    with open(path, errors="replace") as f:
        for line in f:
            if line.startswith("#") or not line.strip():
                continue
            t = line.split()
            if len(t) < 4:
                continue
            try:
                rows[" ".join(t[:3])] = float(t[3])
            except ValueError:
                pass
    return rows


def half_unit(lit):
    """Half a unit of the last typed digit, in the literal's own scale."""
    mant, _, ex = lit.lower().partition("e")
    dec = len(mant.split(".")[1]) if "." in mant else 0
    return 0.5 * 10.0 ** (-dec) * 10.0 ** (int(ex) if ex else 0)


def significant(lit):
    mm = lit.lower().split("e")[0].replace(".", "").lstrip("0")
    return len(mm) >= 4 and not mm.endswith("0")


def evaluate(root):
    bad = []
    idx = case_index(root)
    cache = {}

    def rows_of(case):
        if case not in cache:
            cache[case] = read_rows(idx[case]) if case in idx else None
        return cache[case]

    texts = {}
    for rel in ls.lesson_files(root):
        with open(os.path.join(root, rel), encoding="utf-8", errors="replace") as f:
            texts[rel] = f.read()

    registered = set()
    for ent in TYPED:
        rel, lit, case, row = ent[:4]
        scale = ent[4] if len(ent) > 4 else 1.0
        registered.add((rel, lit))
        if rel not in texts or not re.search(r"(?<![\w.])" + re.escape(lit) + r"(?![\w])", texts[rel]):
            bad.append("TYPED %s %s: the literal is no longer in the file -- remove the entry" % (rel, lit))
            continue
        rows = rows_of(case)
        if rows is None:
            bad.append("TYPED %s %s: case %s has no expected file (renamed or removed) -- re-point the entry"
                       % (rel, lit, case))
            continue
        if row not in rows:
            bad.append("TYPED %s %s: %s has no golden row %r -- re-point the entry" % (rel, lit, case, row))
            continue
        want = rows[row] * scale
        if abs(float(lit) - want) > half_unit(lit) * 1.0001:
            bad.append("%s types %s but the golden of %s [%s] is %.12g (half-unit %.3g): the lesson "
                       "number drifted from the case -- retype it from the golden"
                       % (rel, lit, case, row, want, half_unit(lit)))
    cands = candidates(texts, idx, cache, registered)
    have = Counter(rel for rel, *_ in cands)
    for rel, n in sorted(have.items()):
        pin = LESSON_TYPED_CANDIDATES.get(rel)
        if pin is None:
            bad.append("%s: %d typed number(s) equal to a golden row of a case it names (%s) with no pin -- "
                       "register each in TYPED (file, literal, case, row)"
                       % (rel, n, ", ".join(sorted({c[1] for c in cands if c[0] == rel})[:4])))
        elif n > pin:
            bad.append("%s: %d unregistered typed number(s) equal to a golden, pinned at %d -- register the "
                       "new one in TYPED" % (rel, n, pin))
        elif n < pin:
            bad.append("%s: %d candidate(s), pinned at %d -- one no longer matches its golden (a re-record "
                       "moved it: DRIFT, retype the lesson) or was registered/removed; lower "
                       "debt_registry.LESSON_TYPED_CANDIDATES to %d" % (rel, n, pin, n))
    for rel, pin in sorted(LESSON_TYPED_CANDIDATES.items()):
        if rel not in have:
            bad.append("%s: pinned at %d but has no candidate -- remove its entry (or look for drift)" % (rel, pin))
    return bad, cands


def candidates(texts, idx, cache, registered):
    out = []
    for rel, t in texts.items():
        words = set(re.findall(r"\w+", t))
        named = [c for c in idx if c in words]
        if not named:
            continue
        allrows = defaultdict(list)
        for c in named:
            if c not in cache or cache[c] is None:
                cache[c] = read_rows(idx[c])
            for k, v in cache[c].items():
                if abs(v - round(v)) > 1e-6:
                    allrows[c].append((k, v))
        seen = set()
        for line in t.split("\n"):
            for m in NUM.finditer(line):
                lit = m.group(1)
                if (rel, lit) in registered or (rel, lit) in seen or not significant(lit):
                    continue
                x, h = float(lit), half_unit(lit)
                for c, rs in allrows.items():
                    hit = next(((k, v) for k, v in rs if abs(v - x) <= h * 1.0001), None)
                    if hit:
                        seen.add((rel, lit))
                        out.append((rel, lit, c, hit[0]))
                        break
    return out


def selftest():
    """Sabotage arms on a private root: the lesson files AND the goldens are copies."""
    fails = 0
    with tempfile.TemporaryDirectory(prefix="typed_") as td:
        ls.private_root(ROOT, td, linked=("src", "data", "bin", "docs"))
        for case, exp in case_index(ROOT).items():
            rel = os.path.relpath(os.path.dirname(exp), ROOT)
            os.makedirs(os.path.join(td, rel, "system"), exist_ok=True)
            open(os.path.join(td, rel, "system", "controlDict"), "w").close()
            with open(exp, "rb") as src, open(os.path.join(td, rel, "expected"), "wb") as dst:
                dst.write(src.read())
        idx = case_index(td)
        bad, _ = evaluate(td)
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
            bad, _ = evaluate(td)
            with open(p, "w", encoding="utf-8") as f:
                f.write(t)
            ok = any(expect in b for b in bad)
            print("selftest %-44s %s" % (name, "caught" if ok else "NOT CAUGHT %s" % bad[:1]))
            fails += 0 if ok else 1

        rel = lambda case: os.path.relpath(idx[case], td)          # noqa: E731
        arm("golden re-recorded: 4th digit moves", rel("compressor01_air"), "4.22615345389", "4.2271",
            "drifted from the case")
        arm("golden re-recorded: 8th digit moves", rel("stripper02_sour_water_h2s"), "356.19446911", "356.19412",
            "drifted from the case")
        arm("typed literal removed (stale entry)", M + "VanHeerdenTool.tsx", "0.00126615", "0.00126",
            "no longer in the file", every=True)
        # a NEW literal equal to another golden row of a case a lesson names, unregistered
        rows = read_rows(idx["flash01_benzene_toluene"])
        typed_here = {e[1] for e in TYPED if e[0].endswith("FlashOperatingLineTool.tsx")}
        lit = next("%.5f" % v for k, v in rows.items()
                   if k.startswith("kpi") and abs(v - round(v)) > 1e-3 and significant("%.5f" % v)
                   and "%.5f" % v not in typed_here)
        arm("a new typed golden number, unregistered", M + "FlashOperatingLineTool.tsx", "",
            '\nconst typed = "%s";\n' % lit, "register each in TYPED")
    return 1 if fails else 0


def main(argv=None):
    args = argv if argv is not None else sys.argv[1:]
    if args and args[0] == "--selftest":
        return selftest()
    if args and args[0] == "--scan":
        _b, cands = evaluate(ROOT)
        for rel, lit, c, row in sorted(cands):
            print("%s %s == %s [%s]" % (rel, lit, c, row))
        return 0
    root = args[0] if args else ROOT
    bad, cands = evaluate(root)
    if bad:
        for b in bad:
            print("  " + b)
        print("%s: FAILED (%d finding(s))" % (LABEL, len(bad)))
        return 1
    print("%s: OK %d typed number(s) equal their golden row to half a unit of the last digit; %d unregistered "
          "candidate(s) in %d file(s) each at its pin (ratchet: may only fall, a fall may be DRIFT).  NOT "
          "checked: a number derived from several rows, a literal that already differs from every row, a "
          "case a lesson does not name." % (LABEL, len(TYPED), len(cands), len({r for r, *_ in cands})))
    return 0


if __name__ == "__main__":
    sys.exit(main())
