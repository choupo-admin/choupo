#!/usr/bin/env python3
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
     variable; `weightedLeastSquares` declared with no `enforce ( ... )`; two
     material forms in one file.  Plus the two halves of the no-rule posture
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
    p = subprocess.run([str(SOLVE), "-case", str(case)],
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

refuses("iterative",
        analysis(density="    density { value 998.4 kg/m3; "
                         "provenance iterative; }\n"),
        "A1 accepts ONE provenance",
        "an ITERATIVE density is a declared A1 gap -- permitted only with "
        "explicit authorisation, and an iteration whose convergence must be "
        "visible is its own slice")

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
      "density, correction over the limit, pH as the balancing variable, "
      "weightedLeastSquares without an enforce list, two material forms, no rule on a non-closing "
      "analysis) and a closing analysis passes through ANNOUNCED; a plain "
      "componentMolarFlows stream produces no record at all.  NOT CHECKED: "
      "whether the reconciled water is RIGHT (absorbing a residue into one "
      "ion is a convention, not a measurement), and whether the carried "
      "uncertainties are USED -- A1 only records them.")
