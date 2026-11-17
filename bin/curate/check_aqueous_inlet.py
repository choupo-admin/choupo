#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_aqueous_inlet -- 3 former gates run as ARMS of one script (DEV.md 4c C419).

Former gates, each moved here verbatim as a function (its own docstring first,
its own checks, its own printed lines): check_aqueous_analysis, check_aqueous_qualifier, check_material_wrapper.
Each arm prints exactly what its gate printed; this runner prints ONE claim
line first (`check_aqueous_inlet: OK -- ...`) that carries every arm's own claim, then
the arms' output, and exits non-zero when any arm does.  An arm that fails does
not stop the others: every verdict is reported.
"""

import contextlib
import io
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

def arm_aqueous_analysis():
    """Gate: a laboratory ANALYSIS is a first-class inlet, and the reconciliation
it needs happens in the OPEN -- recorded, bounded, and never silent.

    bin/curate/check_aqueous_analysis.py

WHY THIS EXISTS.  Slice A1 of docs/design/aqueous-analysis-inlet-scope.md
adds a SEVENTH canonical inlet form, and almost none of it is visible to any
other check.  The conversion happens on READ, so by the time a KPI or a mass
balance sees the case it is an ordinary component-basis stream: a golden
master cannot tell a correct reconciliation from a wrong one, cannot tell
either from an adjustment that silently stopped happening, and cannot tell
any of the three from a refusal that stopped firing.  Only two things can --
recomputing the arithmetic independently, and provoking the refusals on
purpose.

INVENTORY IS NOT MEASUREMENT, which is the whole reason this form exists
beside `speciesMolarFlows` rather than inside it, and check_stream_basis.py
guards the other side of that line (an INVENTORY that does not close in
charge is refused, and must stay refused).

WHAT THIS CHECKS -- the six arms of the scope doc, section 6.

  1. THREE LAYERS, THREE HOMES.  The witness resolves end to end and each
     layer is where it was ratified to be: the MEASUREMENT in `0/feed`, the
     RECONCILED conserved inventory in `converged/feed` under `calculated {}`,
     the EQUILIBRIUM in the solved answer.

  2. THE AUTHORED FILE IS IMMUTABLE.  `0/feed` is byte-identical after the
     run (O1).  This is the arm that proves layer 1 was not consumed by the
     thing that read it -- a reconciliation written back into the measurement
     would destroy the measurement, and the next run would reconcile the
     reconciliation.

  3. THE ARITHMETIC, RECOMPUTED HERE.  The ion balance is recomputed from the
     authored mg/L (including the `as CaCO3` surrogate and its declared
     `perFormulaUnit`) and must agree with what the engine reported; the
     imbalance BEFORE must be non-zero, AFTER zero, every adjustment must be
     listed, and the charge the adjustments moved must equal the residue that
     was there to move.

  4. FIVE REFUSALS, EACH BY NAME, fired through the real reader: no density
     route; a correction beyond the declared limit; pH named as the balancing
     variable; `weightedLeastSquares` declared with no `enforce ( ... )`; the
     least-squares-only `maximumCorrection { ... in sigma; }` spelling met on a
     single-species rule; two material forms in one file.
     Plus the two halves of the no-rule posture
     (Q3): an analysis that does NOT close and declares no rule REFUSES naming
     both legal remedies, and one that DOES close passes through with the
     imbalance announced.

     AMENDED 2026-08-09 WHEN A2 SHIPPED.  The `weightedLeastSquares` arm used
     to pin the refusal "THE NAMED NEXT SLICE", and A2 built the method, so
     the arm follows the CLAIM rather than the wording: WLS with no declared
     conservation law still refuses, because the unconstrained minimum of
     Sum((x-m)/sigma)^2 is the measurement itself and the record would then
     claim a reconciliation that never happened.  Everything ABOUT the least
     squares belongs to check_aqueous_reconciliation.py; this file keeps the
     A1 grammar's edge only.

  5. THE NEGATIVE.  The same case with an ordinary `componentMolarFlows` feed
     produces NO reconciliation record.  The machinery does not switch itself
     on.

WHAT THIS DOES NOT CHECK, said plainly:
  * WHETHER THE RECONCILED WATER IS RIGHT.  Absorbing a residue into chloride
    is a CONVENTION, not a measurement: it produces a charge-balanced water,
    never the true one.  Nothing here can tell a well-chosen absorber from a
    badly-chosen one -- that judgement is the author's, which is exactly why
    the rule must be declared and the correction bounded.
  * THE UNCERTAINTIES.  A1's witness parses and carries them and its
    single-species rule does not read them.  That they are CONSUMED is A2's
    claim and is checked in check_aqueous_reconciliation.py, on A2's witness;
    asserting it here would claim coverage of a case that does not exercise
    it.
  * THE ITERATIVE DENSITY.  Refused by name here; nothing checks that an
    iteration, once built, converges.

SABOTAGE, PERFORMED AND OBSERVED (2026-08-09, in an isolated worktree).
Arm 3 was verified by disabling the adjustment step in StreamStateIO.cpp --
the single line `mTot[target] = after;` commented out, so the rule is parsed,
the limit is checked, the record is written, and the correction is simply
never applied.  Rebuilt, this gate failed with BOTH halves of arm 3:

    the imbalance AFTER is 0.7813442487 % -- the reconciliation did not
      close the charge balance it exists to close
    reconciliation is recorded but NOT applied: imbalance after = 0.7813 %
      (before 0.7813 %) -- the record says an adjustment was made and the
      numbers say it was not

WHAT THE SABOTAGE ALSO SHOWED, and it corrects the expectation this gate was
written under: **the witness's golden moved too** -- pH 8.1349 against the
recorded 7.9077, p_eq_sum 0.07373 against 0.07477.  So on THIS witness the
corpus would have caught it as well.  That is a property of the witness, not
of the corpus: chloride is the first link of a chain that reaches the pH
here (Cl fixes CaCl2, which fixes CaCO3, which fixes CO2), and an analysis
whose absorber is a true spectator would move no KPI at all.  The arm is
kept because it names WHAT broke rather than reporting that two numbers
differ, and because the next witness may not be so obliging.
"""
    import json
    import pathlib
    import re
    import shutil
    import subprocess
    import sys
    import tempfile

    ROOT = pathlib.Path(__file__).resolve().parents[2]
    SOLVE = ROOT / "choupoSolve"
    CASE = ROOT / "tutorials/steady/flash/analysis01_water_analysis_inlet"

    #  Periodic-table values, hard-coded so the recomputation is INDEPENDENT.
    #  Reading them out of src/thermo/AtomicWeights.cpp would make this arm agree
    #  with the engine by construction, which is not a check.
    ATOMIC = {"Ca": 40.078, "C": 12.011, "O": 15.999}

    bad = []


    def run(case):
        p = subprocess.run([str(SOLVE), str(case)],
                           capture_output=True, text=True, timeout=300)
        return p.returncode, p.stdout + p.stderr


    def result(out):
        m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                      out, re.S)
        return json.loads(m.group(1)) if m else None


    def variant(feed_body, tag):
        """Copy the sealed case with a replacement 0/feed; return (rc, out, dir)."""
        td = tempfile.mkdtemp()
        sub = pathlib.Path(td) / tag
        shutil.copytree(CASE, sub)
        for stale in ("converged", "reports"):
            if (sub / stale).exists():
                shutil.rmtree(sub / stale)
        (sub / "0" / "feed").write_text(feed_body)
        rc, out = run(sub)
        return rc, out, sub, td


    TAIL = "T               313.15 K;\nP               101325 Pa;\n"

    #  The witness's analysis, as a template the refusal variants edit.  Kept
    #  here rather than read from the case so a variant cannot accidentally
    #  inherit an edit made to the case for another reason.
    ANALYSIS = """aqueousAnalysis
{{
    network            carbonate;
    basis              mg/L;
    defaultQualifier   dissolved;    // slice C: no default of any kind
    sampleTemperature  293.15 K;
{density}    volumetricFlow     2.0 m3/h;
    pH                 7.6;
    closureTolerance   0.5 percent;
{recon}
    analytes
    {{
        Ca    {{ value  84.0 mg/L;  uncertainty 2 percent; }}
        Cl    {{ value {cl} mg/L;  uncertainty 5 percent; }}
        alkalinity
        {{
            species         HCO3;
            value          143.0 mg/L;
            as             CaCO3;
            perFormulaUnit   2;
            uncertainty      4 percent;
        }}
    }}
}}
"""
    DENSITY = "    density   { value 998.4 kg/m3;  provenance measured; }\n"
    RECON = """    reconciliation
    {{
        method             {method}
        maximumCorrection  {limit} percent;
    }}
"""


    def analysis(density=DENSITY, method="adjustChloride;", limit="10",
                 recon=None, cl="45.0"):
        r = recon if recon is not None else RECON.format(method=method, limit=limit)
        return ANALYSIS.format(density=density, recon=r, cl=cl) + TAIL


    def block(text, key):
        """The body of `key { ... }` in a dict file (one nesting level)."""
        i = text.find(key)
        if i < 0:
            return None
        i = text.find("{", i)
        depth, j = 0, i
        while j < len(text):
            if text[j] == "{":
                depth += 1
            elif text[j] == "}":
                depth -= 1
                if depth == 0:
                    return text[i + 1:j]
            j += 1
        return None


    def scal(text, key):
        m = re.search(r"\b" + key + r"\s+(-?[0-9.eE+-]+)", text)
        return float(m.group(1)) if m else None


    def refuses(tag, body, needle, why):
        rc, out, _sub, td = variant(body, tag)
        try:
            if rc == 0:
                bad.append(f"REFUSAL '{tag}' did not fire -- {why}")
            elif needle not in out:
                bad.append(f"REFUSAL '{tag}' fired but not by name (looked for "
                           f"'{needle}').  Got:\n" + out[-700:])
        finally:
            shutil.rmtree(td, ignore_errors=True)


    # ---- 1 + 2.  THREE LAYERS, and layer 1 is immutable -----------------------
    feed0 = (CASE / "0" / "feed").read_bytes()
    if b"aqueousAnalysis" not in feed0:
        bad.append("the witness's 0/feed is not an aqueousAnalysis -- the case "
                   "this gate exists for is not the case on disk")
    rc, out = run(CASE)
    if rc != 0:
        bad.append(f"{CASE.name}: exited {rc} -- the analysis-inlet witness must "
                   "solve.  Output:\n" + out[-2000:])
    res = result(out)

    if (CASE / "0" / "feed").read_bytes() != feed0:
        bad.append("0/feed CHANGED during the run.  The authored file is the "
                   "MEASUREMENT and is never rewritten (O1): a reconciliation "
                   "written back into it would destroy what it reconciled, and "
                   "the next run would reconcile the reconciliation")

    conv = CASE / "converged" / "feed"
    calc = block(conv.read_text(), "calculated") if conv.is_file() else None
    if calc is None:
        bad.append("converged/feed carries no `calculated {}` block -- layer 2 "
                   "(the reconciled conserved inventory, with every correction "
                   "recorded) has no home, which is the gap A1 exists to close")
    recon = block(calc, "analysisReconciliation") if calc else None
    inv = block(calc, "conservedInventory") if calc else None
    if calc is not None and recon is None:
        bad.append("`calculated {}` carries no `analysisReconciliation {}`")
    if calc is not None and inv is None:
        bad.append("`calculated {}` carries no `conservedInventory {}` -- the "
                   "reconciled inventory is layer 2 itself")
    #  Layer 3: the equilibrium really was solved FROM layer 2.
    if res is not None and "pH" not in res["kpis"].get("flash01", {}):
        bad.append("the flash reports no pH -- layer 3 (the equilibrium the "
                   "reconciled inventory feeds) is not there to check")

    # ---- 3.  THE ARITHMETIC, RECOMPUTED INDEPENDENTLY -------------------------
    if recon:
        before = scal(recon, "chargeImbalanceBefore")
        after = scal(recon, "chargeImbalanceAfter")
        residue = scal(recon, "chargeResidueBefore")

        #  Recompute the ion balance from the AUTHORED sheet.  Species MWs come
        #  from the case's own sealed records; the surrogate MW is summed from
        #  the periodic table above, exactly as `as CaCO3` means.
        def species_mw(sp):
            t = (CASE / "constant" / "species" / f"{sp}.dat").read_text()
            b = block(t, "MW")
            return scal(b, "value") if b else None

        def species_z(sp):
            t = (CASE / "constant" / "species" / f"{sp}.dat").read_text()
            return scal(t, "charge")

        mw_caco3 = ATOMIC["Ca"] + ATOMIC["C"] + 3 * ATOMIC["O"]
        m = {"Ca": 84.0 / species_mw("Ca"),
             "Cl": 45.0 / species_mw("Cl"),
             "HCO3": 2.0 * 143.0 / mw_caco3}
        cat = sum(v * species_z(k) for k, v in m.items() if species_z(k) > 0)
        ani = -sum(v * species_z(k) for k, v in m.items() if species_z(k) < 0)
        cbe = 100.0 * (cat - ani) / (cat + ani)

        if before is None or abs(before - cbe) > 1e-4:
            bad.append(f"the reported ion balance {before} % disagrees with an "
                       f"independent recomputation from the authored mg/L "
                       f"({cbe:.6f} %) -- one of the two conversions is wrong, "
                       "and the `as CaCO3` surrogate is where to look first")
        if before is None or abs(before) < 1e-6:
            bad.append("the imbalance BEFORE is zero -- the witness no longer "
                       "exercises a reconciliation at all, so every arm below it "
                       "passes over an analysis that never needed one")
        if after is None or abs(after) > 1e-9:
            bad.append(f"the imbalance AFTER is {after} % -- the reconciliation "
                       "did not close the charge balance it exists to close")

        adj = block(recon, "adjustments")
        rows = re.findall(r"(\w+)\s*\{([^}]*)\}", adj or "")
        if not rows:
            bad.append("no adjustment is LISTED.  A record that says a"
                       " correction was applied without saying to what and by how"
                       " much is the thing this slice was built to stop")
        moved = 0.0
        for sp, body in rows:
            corr = scal(body, "correction")
            meas = scal(body, "measured")
            rec_ = scal(body, "reconciled")
            if corr is None or meas is None or rec_ is None:
                bad.append(f"adjustment row '{sp}' does not state measured, "
                           "reconciled AND correction")
                continue
            if abs((meas + corr) - rec_) > 1e-12:
                bad.append(f"adjustment row '{sp}' does not add up: measured "
                           f"{meas} + correction {corr} != reconciled {rec_}")
            moved += corr * species_z(sp)
        #  THE SUM OF THE ADJUSTMENTS IS THE IMBALANCE THAT WAS THERE.  Weighted
        #  by charge, because an adjustment moves MOLES and what it has to cancel
        #  is EQUIVALENTS -- the two coincide only for a monovalent ion, which is
        #  exactly the accident that would hide a bug on the day a divalent one
        #  is adjusted.
        if residue is not None and abs(moved + residue) > 1e-12:
            bad.append(f"the adjustments move {moved:.12g} kmol/h of charge "
                       f"against a residue of {residue:.12g} -- their sum is not "
                       "the imbalance they were applied to cancel")
        #  ...and the record must not merely CLAIM: if the rule was parsed and
        #  the numbers never moved, the two halves disagree.
        if before is not None and after is not None \
                and abs(before) > 1e-6 and abs(after - before) < 1e-9:
            bad.append(f"reconciliation is recorded but NOT applied: imbalance "
                       f"after = {after} % (before {before} %) -- the record says "
                       "an adjustment was made and the numbers say it was not")

    # ---- 4.  THE REFUSALS, EACH BY NAME ---------------------------------------
    refuses("nodensity", analysis(density=""), "declares no DENSITY ROUTE",
            "mg/L is per VOLUME and a stream carries a FLOW; without a measured "
            "density the reader would have to invent one, and inventing it from "
            "the analysis is the ITERATION A1 declares as a gap")

    #  REWRITTEN TWICE (slice B, 2026-08-10).  First rewrite made `iterative`
    #  the authorised route; Vitor REJECTED that build (the map was constant in
    #  rho -- an iteration in name only), so `iterative` now refuses OUTRIGHT,
    #  stating the missing machinery, and the honest direct closure lives under
    #  `derivedDiluteVolume` (its own gate: check_derived_density).
    refuses("iterative",
            analysis(density="    density { provenance iterative; }\n"),
            "no composition-dependent volume closure",
            "`provenance iterative` names machinery that is not numerically "
            "present -- it must refuse until a composition-dependent volume "
            "model defines a real fixed point (slice B: BLOCKED)")

    refuses("overlimit", analysis(limit="2"), "maximumCorrection",
            "a 5.12 % correction against a declared 2 % limit stops being a "
            "reconciliation and becomes the analysis rewritten to fit")

    refuses("phbalance",
            analysis(recon=RECON.format(method="adjustSingleSpecies;\n"
                                               "        species            pH;",
                                        limit="10")),
            "as the balancing variable",
            "pH may participate in a reconciliation only under an explicit "
            "declared rule, and that rule grammar is A2's")

    #  A2 SHIPPED weightedLeastSquares, so the "named next slice" refusal is gone
    #  and this arm follows the claim rather than the wording: WLS declared with
    #  no `enforce ( ... )` still refuses, because least squares with no
    #  constraint returns the measurement unchanged while the record claims a
    #  reconciliation happened.  (check_aqueous_reconciliation.py owns everything
    #  ABOUT the least squares; this arm only holds the A1 grammar's edge.)
    refuses("wls", analysis(method="weightedLeastSquares;"),
            "declares no `enforce",
            "weighted least squares with no declared conservation law is not a "
            "reconciliation -- the unconstrained minimum is the measurement "
            "itself, so the record would claim a correction that never happened")

    #  A2 added `maximumCorrection { value 3; in sigma; }`, and it belongs to the
    #  least squares alone: a single-species rule has only the measured value to
    #  bound against, because it does not require the ion it moves to declare an
    #  uncertainty at all.  Pinned here so the sigma spelling meeting the wrong
    #  method says which method it belongs to, instead of the parser's honest but
    #  unhelpful "entry 'maximumCorrection' is not a scalar".
    refuses("sigmalimitonrule",
            analysis(recon=RECON.format(method="adjustChloride;", limit="10")
                     .replace("maximumCorrection  10 percent;",
                              "maximumCorrection { value 3; in sigma; }")),
            "is the WEIGHTED-LEAST-SQUARES form",
            "the sigma form bounds a correction against a declared uncertainty, "
            "and a single-species rule may be moving an ion that declares none")

    refuses("twoforms",
            analysis() + "componentMolarFlows\n{\n    water 100 kmol/h;\n}\n",
            "conflicting material-flow specifications",
            "the seventh canonical form is exclusive with the other six, for the "
            "same reason they are exclusive with each other: two material blocks "
            "cannot say which one the author meant")

    #  Q3, BOTH HALVES.  No rule declared: refuse when it does not close...
    refuses("norule", analysis(recon=""), "There are exactly two legal remedies",
            "an analysis that does not close and declares no rule must refuse "
            "naming both remedies -- adjusting it silently would hide a "
            "laboratory fault inside a result")

    #  ...and pass through, ANNOUNCED, when it does.  Chloride at 47.30 mg/L puts
    #  the balance inside the 0.5 % band without any rule at all.
    rc, out, sub, td = variant(analysis(recon="", cl="47.30"), "closes")
    try:
        if rc != 0:
            bad.append("an analysis that CLOSES within the declared tolerance was "
                       "refused although it declares no rule -- the pass-through "
                       "half of the no-rule posture is gone.  Output:\n"
                       + out[-700:])
        elif "within the" not in out or "NO adjustment applied" not in out:
            bad.append("the closing analysis passed through SILENTLY.  Silence "
                       "cannot distinguish 'balanced' from 'nobody looked' -- the "
                       "measured imbalance must be announced with the fact that "
                       "nothing was adjusted.  Output:\n" + out[-700:])
        else:
            cf = sub / "converged" / "feed"
            c2 = block(cf.read_text(), "calculated") if cf.is_file() else ""
            if c2 and "adjustedSpecies" in c2:
                bad.append("a pass-through analysis recorded an adjustedSpecies "
                           "-- nothing was adjusted and the record says otherwise")
    finally:
        shutil.rmtree(td, ignore_errors=True)

    # ---- 5.  THE NEGATIVE: the machinery does not switch itself on ------------
    rc, out, sub, td = variant(
        "componentMolarFlows\n{\n"
        "    CO2      0.002857542513 kmol/h;\n"
        "    CaCO3    0.002857542513 kmol/h;\n"
        "    CaCl2    0.001334283426 kmol/h;\n"
        "    water  110.8098894     kmol/h;\n}\n" + TAIL, "components")
    try:
        if rc != 0:
            bad.append("the equivalent COMPONENT-basis feed did not solve, so the "
                       f"negative cannot be checked (exit {rc}):\n" + out[-700:])
        else:
            cf = sub / "converged" / "feed"
            body = cf.read_text() if cf.is_file() else ""
            if "analysisReconciliation" in body or "conservedInventory" in body:
                bad.append("a plain componentMolarFlows stream produced a "
                           "reconciliation record -- the analysis machinery "
                           "switched itself on for a stream that declared no "
                           "analysis")
            if "[analysis]" in out:
                bad.append("a plain componentMolarFlows stream announced an "
                           "[analysis] line")
    finally:
        shutil.rmtree(td, ignore_errors=True)


    if bad:
        print("check_aqueous_analysis: FAILED")
        for b in bad:
            print("  " + b)
        sys.exit(1)

    print("check_aqueous_analysis: OK -- the analysis inlet resolves through its "
          "three separately recorded layers (measurement in 0/, reconciled "
          "inventory in converged/ under calculated{}, equilibrium in the "
          "answer); the authored file is byte-identical after the run; the ion "
          "balance recomputed here from the authored mg/L (with the `as CaCO3` "
          "surrogate) agrees with the engine's, is non-zero before, zero after, "
          "and the charge the listed adjustments move equals the residue they "
          "cancel; eight refusals fire BY NAME (no density route, iterative "
          "(REFUSED outright -- no composition-dependent volume closure exists; "
          "the honest direct closure is derivedDiluteVolume, gate "
          "check_derived_density), correction over the limit, pH as the "
          "balancing variable, "
          "weightedLeastSquares without an enforce list, a sigma limit on a single-species rule, two material forms, no rule on a non-closing "
          "analysis) and a closing analysis passes through ANNOUNCED; a plain "
          "componentMolarFlows stream produces no record at all.  NOT CHECKED: "
          "whether the reconciled water is RIGHT (absorbing a residue into one "
          "ion is a convention, not a measurement), and whether the carried "
          "uncertainties are USED -- A1 only records them.")


def arm_aqueous_qualifier():
    """Gate: the analytical qualifier (slice C) -- no default, no inference.

    bin/curate/check_aqueous_qualifier.py

WHY THIS EXISTS.  Vitor's slice-C ruling (2026-08-10): whether a reported
value is a dissolved concentration, a total, or a free-ion measurement is a
property of the SAMPLE PREPARATION and the analytical method -- a fact about
the laboratory Choupo cannot infer safely.  The proposal's "default to
dissolved, announced" was REJECTED: there is NO default at all.  The grammar
is a block-level `defaultQualifier` with per-analyte `qualifier` overrides;
a row neither resolves REFUSES; `total` and `freeIon` are parsed and
PRESERVED but their calculation refuses until their meaning is honoured.

WHAT THIS CHECKS, all through real engine runs on staged copies of
`analysis01_water_analysis_inlet` (which now declares
`defaultQualifier dissolved;`):

  (Q1) THE DECLARED CASE runs, and the resolved snapshot PRESERVES the
       semantics as data: `defaultQualifier dissolved;` in the
       analysisReconciliation record and `qualifier dissolved;` on every
       measured row -- with no inline comment inside a row (the
       row-swallowing trap this writer has hit before, and hit AGAIN
       building this slice: the first draft's `// from defaultQualifier`
       ate each row's uncertainty and closing brace).
  (Q2) NEITHER RESOLVES: `defaultQualifier` removed and no row qualifier --
       refuses naming the analyte and BOTH remedies.
  (Q3) A PER-ROW OVERRIDE resolves that row -- with the default removed and
       `qualifier dissolved;` added to every analyte row, the case runs
       identically (same pH as the reference run).
  (Q4) `total` REFUSES at resolution, naming the collapse it would commit
       (dissolved / total-recoverable / particulate-bearing).
  (Q5) `freeIon` REFUSES at resolution, naming the speciation boundary and
       the preservation promise (never quietly reinterpreted as a total).
  (Q6) an UNKNOWN word refuses naming the vocabulary.

WHAT THIS DOES **NOT** COVER, stated so the green line cannot imply it:

  * the SEMANTICS of `total` and `freeIon` -- they have none yet, by ruling;
    when a future slice defines them, this gate's Q4/Q5 arms must be
    rewritten, not merely deleted;
  * the A1/A2 reconciliation arithmetic (check_aqueous_analysis /
    check_aqueous_reconciliation own it);
  * whether `dissolved` is TRUE of any given laboratory sheet -- that is the
    author's declaration, which is the whole point.

SABOTAGE-VERIFIED 2026-08-10; OBSERVED output recorded, not predicted.

Sabotage 1 -- the resolution refusal removed (unqualified rows silently
accepted):

    check_aqueous_qualifier: FAILED
      Q2: an analyte with no qualifier and no defaultQualifier was ACCEPTED
      -- the ruling is that there is NO default, announced or otherwise

Sabotage 2 -- freeIon quietly reinterpreted (the refusal replaced by a
fall-through to dissolved):

    check_aqueous_qualifier: FAILED
      Q5: a freeIon analyte was ACCEPTED -- it must refuse at resolution;
      reinterpreting a free-ion measurement as a total is exactly what the
      preservation clause forbids
"""

    import os
    import re
    import shutil
    import subprocess
    import sys
    import tempfile

    ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    CASE = os.path.join(ROOT, "tutorials", "steady", "flash",
                        "analysis01_water_analysis_inlet")
    SOLVE = os.path.join(ROOT, "build", "linux64Gcc", "choupoSolve")
    ENV = dict(os.environ, CHOUPO_HOME=ROOT)

    fails = []


    def run(cwd):
        p = subprocess.run([SOLVE], cwd=cwd, env=ENV, capture_output=True,
                           text=True, timeout=900)
        return p.returncode, p.stdout + p.stderr


    def pH_of(out):
        m = re.search(r'"pH":\s*([0-9.eE+-]+)', out)
        return float(m.group(1)) if m else None


    def staged(mutate=None):
        d = tempfile.mkdtemp(prefix="qual_")
        dst = os.path.join(d, "case")
        shutil.copytree(CASE, dst)
        if mutate:
            p = os.path.join(dst, "0", "feed")
            s = open(p, encoding="utf-8").read()
            s2 = mutate(s)
            if s2 == s:
                shutil.rmtree(d, ignore_errors=True)
                return None, None, "mutation did not apply"
            open(p, "w", encoding="utf-8").write(s2)
        rc, out = run(dst)
        return (d, dst), (rc, out), None


    NO_DEFAULT = lambda s: re.sub(r"\n\s*defaultQualifier\s+dissolved;\n", "\n", s)


    def per_row(s):
        s = NO_DEFAULT(s)
        #  every analyte row is the sub-dict spelling in this case
        s = s.replace("{ value  84.0 mg/L;",
                      "{ value  84.0 mg/L;  qualifier dissolved;")
        s = s.replace("{ value  45.0 mg/L;",
                      "{ value  45.0 mg/L;  qualifier dissolved;")
        s = s.replace("value          143.0 mg/L;",
                      "value          143.0 mg/L;\n            qualifier      dissolved;")
        return s


    # ---- Q1: the declared case, and the preserved semantics -------------------
    st, (rc, out), err = staged()
    try:
        if rc != 0:
            fails.append("Q1: the declared witness refused -- " + out[-300:])
            base_pH = None
        else:
            base_pH = pH_of(out)
            conv = open(os.path.join(st[1], "converged", "feed"),
                        encoding="utf-8").read()
            if "defaultQualifier       dissolved;" not in conv:
                fails.append("Q1: the resolved snapshot does not preserve "
                             "`defaultQualifier dissolved;` in the "
                             "analysisReconciliation record")
            rows = re.findall(r"^\s+\w+ \{ amount [^\n]*\}", conv, re.M)
            for r in rows:
                if "qualifier dissolved;" not in r:
                    fails.append(f"Q1: a measured row lost its qualifier: {r[:80]}")
                if re.search(r"qualifier[^}]*//[^}]*\b(uncertainty|\})", r):
                    fails.append("Q1: an inline comment inside a measured row -- "
                                 "the row-swallowing trap")
    finally:
        if st:
            shutil.rmtree(st[0], ignore_errors=True)

    # ---- Q2: neither resolves --------------------------------------------------
    st, res, err = staged(NO_DEFAULT)
    if err:
        fails.append("Q2: " + err)
    else:
        rc, out = res
        shutil.rmtree(st[0], ignore_errors=True)
        if rc == 0:
            fails.append("Q2: an analyte with no qualifier and no "
                         "defaultQualifier was ACCEPTED -- the ruling is that "
                         "there is NO default, announced or otherwise")
        elif "defaultQualifier" not in out or "qualifier" not in out:
            fails.append("Q2: it refused, but without naming both remedies")

    # ---- Q3: per-row overrides resolve without a default ----------------------
    st, res, err = staged(per_row)
    if err:
        fails.append("Q3: " + err)
    else:
        rc, out = res
        shutil.rmtree(st[0], ignore_errors=True)
        if rc != 0:
            fails.append("Q3: per-row `qualifier dissolved;` on every analyte "
                         "did not resolve -- " + out[-300:])
        elif base_pH is not None:
            got = pH_of(out)
            if got is None or abs(got - base_pH) > 1e-9:
                fails.append(f"Q3: the per-row spelling changed the answer "
                             f"(pH {got} vs {base_pH}) -- a spelling that moves "
                             f"a number is not a spelling")

    # ---- Q4/Q5/Q6: the three refusing words -----------------------------------
    for word, q, need in [
        ("total",   "Q4", "must be defined precisely"),
        ("freeIon", "Q5", "speciation"),
        ("murky",   "Q6", "vocabulary"),
    ]:
        st, res, err = staged(lambda s, w=word: s.replace(
            "{ value  84.0 mg/L;", "{ value  84.0 mg/L;  qualifier " + w + ";"))
        if err:
            fails.append(f"{q}: {err}")
            continue
        rc, out = res
        shutil.rmtree(st[0], ignore_errors=True)
        if rc == 0:
            fails.append(f"{q}: a {word} analyte was ACCEPTED -- it must refuse "
                         f"at resolution"
                         + ("; reinterpreting a free-ion measurement as a total "
                            "is exactly what the preservation clause forbids"
                            if word == "freeIon" else ""))
        elif need not in out:
            fails.append(f"{q}: '{word}' refused, but the refusal does not say "
                         f"why (expected it to mention '{need}')")

    if fails:
        print("check_aqueous_qualifier: FAILED")
        for f in fails:
            print("  " + f)
        sys.exit(1)

    print("check_aqueous_qualifier: OK -- the declared case preserves its "
          "qualifiers as data (block default + every measured row, no inline "
          "row comments); an unresolved analyte refuses naming both remedies; "
          "per-row overrides resolve to the identical answer; total, freeIon "
          "and an unknown word each refuse naming their reason.  NOT COVERED: "
          "total/freeIon SEMANTICS (none exist yet, by ruling -- Q4/Q5 must be "
          "rewritten when a slice defines them), the reconciliation arithmetic "
          "(its own gates), and whether `dissolved` is true of a given sheet "
          "(the author's declaration, which is the point).")


def arm_material_wrapper():
    """Gate: the `material { ... }` wrapper — one rule, and ONE form per inlet.

    bin/curate/check_material_wrapper.py

WHY THIS EXISTS.  Vítor's aqueous-analysis ruling (2026-08-10) made a
total flow and a laboratory analysis one heading, because neither means
anything without the other.  His correction to the proposal is the part
this gate pins:

    "the parser understands both alternatives" does NOT mean the same
    stream may contain two competing material specifications.

So the wrapper is READ for every canonical form, and a stream declaring
the wrapper beside a top-level material form is REFUSED rather than
resolved by a precedence nobody declared.

WHAT THIS CHECKS, all from fresh runs:

  (A1) THE CANONICAL ROUND TRIP.  `analysis01_water_analysis_inlet` with
       its `aqueousAnalysis` block moved inside `material { ... }`
       resolves to the SAME answer as the corpus case: same pH, same
       conserved inventory, same reconciliation.  A spelling that changed
       an answer would not be a spelling.
  (A2) THE AMBIGUITY REFUSAL fires, naming the offending key -- a wrapper
       beside a bare top-level form.
  (A3) ONE RULE, NO SPECIAL CASE: the wrapper also serves a NON-analysis
       form (componentMolarFlows), because a wrapper that only worked for
       the form it was introduced for would be a second grammar wearing
       the first one's name.

WHAT THIS DOES **NOT** COVER, stated so the green line cannot imply it:

  * it does not check the WRITER, because there is none to check: the
    analysis form is author-only input, and `converged/` emits the
    RESOLVED `componentMolarFlows` + `speciation` + `calculated {}`.  The
    "writer emits only the canonical form" clause of the ruling has no
    subject for this form, and inventing a writer to satisfy a clause
    would be worse than reporting that.
  * it does not check `equilibriumState`.  RESOLVED 2026-08-10 (this
    note used to say "escalated, not decided here"): Vitor ruled it a
    CROSS-REFERENCE, never a copy -- the canonical home stays THE TWO
    BASES, and `calculated { equilibriumState }` carries only a target +
    fingerprint the reader re-verifies.  Its own gate is
    check_equilibrium_state_ref.
  * it does not check the analytical qualifier (slice C) or calculated
    density (slice B).

SABOTAGE-VERIFIED 2026-08-10; OBSERVED output recorded, not predicted.

Sabotage 1 -- the ambiguity refusal removed (the wrapper silently wins):

    check_material_wrapper: FAILED
      A2: a stream declaring `material {}` AND a top-level
      componentMolarFlows was ACCEPTED -- exactly one authoritative
      material-input form is selected per inlet, and an undeclared
      precedence is what this refusal exists to prevent

Sabotage 2 -- form detection left on the top level while reading moved
into the wrapper (the detect/read split):

    check_material_wrapper: FAILED
      A1: the wrapped case refused where the corpus case runs -- 'stream
      state feed: no material-flow specification ...'; detection and
      reading must share one source
"""

    import json
    import os
    import re
    import shutil
    import subprocess
    import sys
    import tempfile

    ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    CASE = os.path.join(ROOT, "tutorials", "steady", "flash",
                        "analysis01_water_analysis_inlet")
    CMF_CASE = os.path.join(ROOT, "tutorials", "steady", "flash",
                            "flash01_benzene_toluene")
    SOLVE = os.path.join(ROOT, "build", "linux64Gcc", "choupoSolve")
    ENV = dict(os.environ, CHOUPO_HOME=ROOT)

    fails = []


    def run(cwd):
        p = subprocess.run([SOLVE], cwd=cwd, env=ENV, capture_output=True,
                           text=True, timeout=900)
        return p.returncode, p.stdout + p.stderr


    def result_json(text):
        m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                      text, re.S)
        return json.loads(m.group(1)) if m else None


    def wrap_block(path, key):
        """Move the top-level `key { ... }` block inside `material { ... }`.

    Anchored at column 0 deliberately: an earlier draft matched the key
    inside a COMMENT (the file documents its own grammar) and wrapped a
    fragment, producing an unmatched brace instead of a test."""
        s = open(path, encoding="utf-8").read()
        m = re.search(rf"^{key}\s*$", s, re.M)
        if not m:
            return False
        i = m.start()
        j = s.index("{", i)
        depth, k = 0, j
        while True:
            if s[k] == "{":
                depth += 1
            elif s[k] == "}":
                depth -= 1
            if depth == 0:
                break
            k += 1
        block, rest = s[i:k + 1], s[:i] + s[k + 1:]
        open(path, "w", encoding="utf-8").write(
            rest.rstrip() + "\n\nmaterial\n{\n    "
            + block.replace("\n", "\n    ") + "\n}\n")
        return True


    def stage(src):
        d = tempfile.mkdtemp(prefix="matwrap_")
        dst = os.path.join(d, os.path.basename(src))
        shutil.copytree(src, dst)
        return d, dst


    # ---- A1: the canonical round trip ---------------------------------------
    rc0, out0 = run(CASE)
    base = result_json(out0)
    tmp, case = stage(CASE)
    try:
        feed = os.path.join(case, "0", "feed")
        if not wrap_block(feed, "aqueousAnalysis"):
            fails.append("A1: no top-level `aqueousAnalysis` block in the witness "
                         "case -- the gate's subject moved")
        else:
            rc1, out1 = run(case)
            got = result_json(out1)
            if rc1 != 0 or got is None:
                first = next((l for l in out1.splitlines() if "ERROR" in l), "")
                fails.append(f"A1: the wrapped case refused where the corpus case "
                             f"runs -- '{first.strip()}'; detection and reading "
                             f"must share one source")
            elif base is not None:
                pb = base["kpis"]["flash01"]["pH"]
                pg = got["kpis"]["flash01"]["pH"]
                if abs(pg - pb) > 1e-9 * max(1.0, abs(pb)):
                    fails.append(f"A1: the wrapper CHANGED the answer -- pH {pg} "
                                 f"wrapped vs {pb} bare.  A spelling that moves a "
                                 f"number is not a spelling.")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    # ---- A2: ambiguous double specification refuses -------------------------
    tmp, case = stage(CASE)
    try:
        feed = os.path.join(case, "0", "feed")
        wrap_block(feed, "aqueousAnalysis")
        with open(feed, "a", encoding="utf-8") as f:
            f.write("\ncomponentMolarFlows\n{\n    water  1.0 kmol/h;\n}\n")
        rc2, out2 = run(case)
        if rc2 == 0:
            fails.append("A2: a stream declaring `material {}` AND a top-level "
                         "componentMolarFlows was ACCEPTED -- exactly one "
                         "authoritative material-input form is selected per "
                         "inlet, and an undeclared precedence is what this "
                         "refusal exists to prevent")
        elif "AMBIGUOUS" not in out2 or "componentMolarFlows" not in out2:
            fails.append("A2: it refused, but without naming the ambiguity or the "
                         "offending key -- a refusal a reader cannot act on is "
                         "half a refusal")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    # ---- A3: one rule -- the wrapper serves a NON-analysis form -------------
    if os.path.isdir(CMF_CASE):
        rcb, outb = run(CMF_CASE)
        baseb = result_json(outb)
        tmp, case = stage(CMF_CASE)
        try:
            feed = os.path.join(case, "0", "feed")
            if os.path.exists(feed) and wrap_block(feed, "componentMolarFlows"):
                rc3, out3 = run(case)
                got3 = result_json(out3)
                if rc3 != 0 or got3 is None:
                    first = next((l for l in out3.splitlines() if "ERROR" in l), "")
                    fails.append(f"A3: the wrapper failed on a NON-analysis form "
                                 f"-- '{first.strip()}'.  It is one rule, or it is "
                                 f"a second grammar wearing the first one's name.")
                elif baseb is not None:
                    kb = sorted(baseb["kpis"])[0]
                    a = baseb["kpis"][kb]
                    b = got3["kpis"].get(kb, {})
                    for k, v in a.items():
                        if k in b and abs(b[k] - v) > 1e-9 * max(1.0, abs(v)):
                            fails.append(f"A3: the wrapper changed {kb}.{k} "
                                         f"({b[k]} vs {v})")
                            break
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    if fails:
        print("check_material_wrapper: FAILED")
        for f in fails:
            print("  " + f)
        sys.exit(1)

    print("check_material_wrapper: OK -- the `material { ... }` wrapper resolves"
          " identically to the bare form (analysis AND componentMolarFlows: one"
          " rule), and a wrapper beside a top-level form is refused by name."
          "  NOT COVERED: the writer (the analysis form is author-only input;"
          " converged/ emits the resolved material, so the ruling's"
          " writer-emits-canonical clause has no subject here), the"
          " `equilibriumState` cross-reference (its own gate:"
          " check_equilibrium_state_ref), and slices C/B.")


ARMS = [
    ("aqueous_analysis", arm_aqueous_analysis),
    ("aqueous_qualifier", arm_aqueous_qualifier),
    ("material_wrapper", arm_material_wrapper),
]


def _claim(name, text):
    from gate_claim import claim_in
    import re
    c = claim_in(text, "check_" + name)
    c = c if c else (text.strip().splitlines() or ["(no output)"])[-1].strip()
    return "[" + name + "] " + re.sub(r"^\s*(\[[^\]]+\]|[\w.\-]+:)\s*OK\b\s*(--)?\s*", "", c)


def main():
    results = []
    for name, fn in ARMS:
        buf = io.StringIO()
        rc = 0
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
            try:
                r = fn()
                rc = r if isinstance(r, int) else 0
            except SystemExit as e:
                rc = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
                if isinstance(e.code, str):
                    print(e.code)
            except Exception:
                traceback.print_exc()
                rc = 1
        results.append((name, rc, buf.getvalue()))
    bad = [n for n, rc, _ in results if rc != 0]
    if bad:
        print("check_aqueous_inlet: FAILED -- arm(s) " + ", ".join(bad))
    else:
        print("check_aqueous_inlet: OK -- " + " || ".join(_claim(n, t) for n, _, t in results))
    for name, rc, text in results:
        print("--- arm check_%s (exit %d)" % (name, rc))
        sys.stdout.write(text if text.endswith("\n") or not text else text + "\n")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
