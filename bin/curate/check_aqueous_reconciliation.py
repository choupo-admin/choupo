#!/usr/bin/env python3
"""Gate: constrained WEIGHTED LEAST SQUARES reconciles a laboratory analysis
into ONE admissible inlet, and it can never see the chemistry it feeds.

    bin/curate/check_aqueous_reconciliation.py

WHY THIS EXISTS.  Slice A2 of docs/design/aqueous-analysis-inlet-scope.md.
Like A1, essentially none of it is visible to a golden master: the fit happens
on READ, so by the time a KPI exists the case is an ordinary component-basis
stream.  A golden cannot tell a correct fit from a wrong one, cannot tell
either from a fit that quietly stopped weighting by 1/sigma^2, and cannot tell
any of them from a refusal that stopped firing.  Two things can -- solving the
same constrained least-squares problem independently here, and provoking the
refusals on purpose -- and one more thing matters that no amount of running
can show, so it is checked as a COMPILE FACT instead.

VITOR'S RULING, which is what the whole slice is shaped by:

    laboratory analysis -> reconciliation -> ONE conserved admissible
    composition -> aqueous equilibrium / speciation

    "Weighted least squares should reconcile the authored laboratory analysis
     into one physically admissible inlet specification.  It must NOT become
     part of the aqueous-equilibrium solver itself ... not a coupled loop in
     which equilibrium starts modifying measurements to make the chemistry
     easier to satisfy."

WHAT THIS CHECKS.

  A1  THE FIT, RECOMPUTED HERE.  The witness's constrained WLS problem is
      rebuilt from the AUTHORED mg/L (the `as CaCO3` surrogates included) and
      solved by an independent hand-rolled KKT elimination in this file, then
      compared to the engine row by row.  Reading the engine's own answer back
      would check nothing.

  A2  THE SIX INSPECTABLE FIELDS, per adjusted quantity: reported value,
      adjusted value, declared sigma AND weight, the NORMALIZED correction in
      sigma, the CONSTRAINT RESPONSIBLE, and the contribution to each law's
      closure.  Present in converged/<stream> AND in the result JSON.

  A3  THE TWO IDENTITIES THE REPORT PUBLISHES MUST HOLD.
        (a) the per-law parts of a correction (`causedBy`) SUM to that row's
            `correctionSigma` -- the attribution is a KKT identity, not a
            share invented afterwards;
        (b) the closures of one law over all rows SUM to minus that law's own
            residual before -- the corrections really did remove the residue
            they are credited with.
      Both are exact, so both are checked at 1e-9 relative.

  A4  IT DISTRIBUTES, IT DOES NOT DUMP.  The claim that distinguishes A2 from
      A1: at least three quantities move, none by more than 1 sigma, and the
      largest correction in PER CENT is far below A1's 5.12 % single shove.

  A5  THE LIMIT REFUSES, NAMING THE NUMBERS.  `maximumCorrection { value 0.2;
      in sigma; }` against a fit whose worst correction is 0.2813 sigma
      refuses, and the message carries BOTH numbers.

  A6  NO SILENT SIGMA.  An analyte with no uncertainty refuses, naming
      `genericWaterAnalysis-v1` -- the versioned default profile that was
      reserved and DELIBERATELY NOT SHIPPED -- and both one-line remedies.
      And the positive half: `uncertainties { default <x> percent; }` is
      accepted and every row ANNOUNCES which source its sigma came from.

  A7  THE ONE-WAY BOUNDARY, AS A COMPILE FACT.  Two independent readings:
        (a) SOURCE -- src/streams/AnalysisReconciler.{H,cpp} include nothing
            from thermo/, and their text never names ThermoPackage,
            SpeciationSolver, ReactiveVLE, ElectrolyteModel or ActivityModel;
        (b) OBJECT -- the compiled AnalysisReconciler.o references EXACTLY ONE
            Choupo symbol, `Choupo::solver::activeSetQP`.  Not "no forbidden
            symbol" (a blacklist ages badly); the whitelist is one name long,
            so any new reach into the runtime fails here whatever it is
            called.
      Same posture as the one-entry lockdown in check_solid_service A8: a
      second door becomes a failing build rather than a code-review hope.

  A8  THE PEDAGOGICAL SEPARATION IS IN THE OUTPUT.  A measurement-correction
      and a chemistry result must be impossible to confuse, and not by the
      reader remembering a paragraph:
        * `reportedValue` appears on every correction row and NOWHERE in the
          speciation block -- a laboratory reported it, or it was calculated,
          never both;
        * `correctionSigma` (a measurement-quality unit) appears only on the
          measurement side;
        * the two use different KEY SPACES: sheet labels here (`alkalinity`,
          `totalHardness`), species ids there (`HCO3`);
        * the solved pH and the measured one do not share a key -- the
          reconciliation block spells its own `pHReported`;
        * the legend is present and says so in words.

  A9  FIVE MORE REFUSALS, each by name: an element row with
      `elementalConservation` NOT enforced (a measured number nothing reads);
      `elementalConservation` enforced with no element row (a law that expands
      to zero constraints); `perFormulaUnit` on an element row (arithmetic
      given a second home); an unknown word in `enforce ( ... )`; an
      `uncertainties` entry no analyte consumed.

  A10 THE SNAPSHOT IS STILL FEEDABLE.  `converged/feed` is re-read as `0/feed`
      and solves.  `calculated {}` claims the reader ignores it; this is the
      arm that checks the claim, and writing it found a real bug on its first
      run (see below).

WHAT THIS DOES NOT CHECK, said plainly:
  * WHETHER THE RECONCILED WATER IS THE TRUE ONE.  It is the composition
    closest to what was measured, in the metric the author declared, that
    satisfies the laws.  Declare different uncertainties and a different
    composition is "closest".  Nothing here -- and nothing anywhere -- can say
    the sample really held these amounts.
  * WHETHER THE DECLARED UNCERTAINTIES ARE RIGHT.  They are the author's
    claim about his laboratory.  The gate checks they are USED and that their
    ORIGIN is announced, never that 2 % is true of anyone's ICP.
  * GROSS ERROR DETECTION.  A large objective means the measurements and the
    laws disagree; nothing here decides WHICH measurement is the culprit, and
    A2 does not claim to.
  * THE OTHER BINARIES.  Only choupoSolve reads this form.

SABOTAGE, PERFORMED AND OBSERVED (2026-08-09, isolated git worktree, full
rebuild for each).  Four, and the two that surprised me are the ones worth
reading.

  S0  THE FIRST ATTEMPT NEVER REACHED THE GATE, and that is a result.  The
      sigma scaling of the constraint rows was replaced by 1.0
      (`row[r] = c.coeff[r] * 1.0;`), meaning to make the fit unweighted.  It
      also breaks the change of variables, so the answer no longer satisfies
      the law it was solved under, and the RECONCILER'S OWN guard refused
      before anything was written:

        ERROR: analysis reconciliation: constraint 'electroneutrality' is
        still violated at the answer (residual 6.49935e-05, was 6.49973e-05).

      Recorded because it locates the defence: most arithmetic damage inside
      the solver is caught by the solver, and the gate's job is the damage
      that produces a VALID answer.  S1 and S2 below are that kind.

  S1  THE DECLARED UNCERTAINTIES IGNORED.  In StreamStateIO the per-row sigma
      was made a flat 3 % of each measurement
      (`q.sigma = 0.03 * std::abs(a.measured);`) instead of the row's own
      declared percentage -- the fit stops honouring the uncertainties while
      the record still publishes them.  Internally consistent, so no engine
      guard fires.  Observed:

        A1: row 'Ca' adjusted 2.0758803 mmol/L, independent KKT says
          2.0844465 (diff 1.71e-05, tol 1e-09)
        A1: row 'Cl' adjusted 1.2733946 mmol/L, independent KKT says
          1.2791982 (diff 1.16e-05, tol 1e-09)
        A1: row 'alkalinity' adjusted 2.8783660 mmol/L, independent KKT says
          2.8896948 (diff 2.27e-05, tol 1e-09)
        A1: row 'totalHardness' adjusted 2.0758803 mmol/L, independent KKT
          says 2.0844465 (diff 1.71e-05, tol 1e-09)

      MEASURED, not assumed: the corpus golden ALSO caught this one --
      `kpi.flash01.p_eq_sum_atm: got 0.0747853124141 expected 0.074797651023
      (reltol 1e-4)`.  On THIS witness the weighting reaches the answer far
      enough to move a KPI.  That is a property of the witness (the calcium
      the fit moves is the calcium the carbonate equilibrium is built on), not
      a general guarantee, and the arm is kept because it names WHAT broke --
      four rows, each with the number it should have had -- where the golden
      says only that one pressure sum differs in the fifth digit.

  S2  THE CLOSURE DECOUPLED FROM ITS LAW.  The per-row contribution was
      changed from `cons[k].coeff[r] * o.correction` to `o.correction`, i.e.
      the report credits each row with moving MOLES where the law counts
      EQUIVALENTS -- the exact confusion that hides on a monovalent ion and
      surfaces on a divalent one.  Observed:

        A3b: law 'electroneutrality' had residual 3.610963e-08 and the
          corrections credited with closing it sum to 1.699882e-08 -- the
          report says the residue was removed by rows that did not remove it
        A3b: law 'elementalConservation:Ca' had residual 9.833463e-09 and the
          corrections credited with closing it sum to -2.907078e-09

      NOTHING ELSE FIRED.  The answer is untouched (closure is report-only),
      the corpus golden PASSED, every one of the six fields was still present
      and every number in the record still looked reasonable.  A3b is the sole
      defence for the sixth inspectable field, which is the one that ties a
      measurement correction to the balance it exists to close.

  S3  THE BOUNDARY BREACHED, twice, and the two attempts do not agree -- which
      is why arm A7 has two readings and why its blind spot is stated here
      rather than discovered later.

      S3a  `#include "thermo/ThermoPackage.H"` plus a call to
           `ThermoPackage::n()` behind a never-taken branch.  Observed:

             A7a: src/streams/AnalysisReconciler.cpp includes
               thermo/ThermoPackage.H -- the reconciler must not be able to
               reach the equilibrium surface [...]
             A7a: src/streams/AnalysisReconciler.cpp names ThermoPackage

           **A7b DID NOT FIRE.**  `n()` is defined inline in the header, so
           the compiler emitted no undefined symbol and the object file still
           referenced exactly one Choupo name.  THE OBJECT READING SEES
           OUT-OF-LINE REACH ONLY.  That is A7b's stated blind spot, it is why
           A7a exists beside it, and a gate claiming more than it has is worse
           than one that reports less.

      S3b  `#include "thermo/ElementComposition.H"` plus a call to
           `parseElementalFormula` (out-of-line).  BOTH readings fired:

             A7a: src/streams/AnalysisReconciler.cpp includes
               thermo/ElementComposition.H [...]
             A7b: AnalysisReconciler.o references Choupo symbols beyond the
               one allowed (Choupo::solver::activeSetQP):
               Choupo::parseElementalFormula(std::__cxx11::basic_string<...>)

TWO REAL BUGS THIS GATE FOUND WHILE BEING WRITTEN, before any sabotage.

  * ARM A10 FAILED ON ITS FIRST RUN, and on analysis01 too: the `measured {}`
    writer emitted a trailing `// sigma ...` note BEFORE the row's closing
    brace, so the comment swallowed the `}` and `converged/<stream>` stopped
    parsing -- three unclosed braces.  A1 had shipped the claim "the reader
    IGNORES the block, so the file stays feedable as state" with nothing
    checking it.  Fixed in the same commit; the arm stays.
  * AND TWO IN THE GATE ITSELF, both the shape of a check that reads the
    wrong thing and passes: a find-then-brace-match locked onto the empty
    braces inside the legend that talks ABOUT `analysisReconciliation`
    (reported as "no record") -- hence uncomment(); and one shared
    record-field reader walked to the next `{` in a species file and returned
    calcium's MOLAR MASS as its charge, so the oracle was solving a different
    problem from the engine.  Both are named at their sites.
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
CASE = ROOT / "tutorials/steady/flash/analysis02_weighted_least_squares"
SRC = ROOT / "src/streams"
OBJ = ROOT / "build/linux64Gcc/src/streams/AnalysisReconciler.o"

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


def uncomment(text):
    """Dict text with comments removed.

    Structural extraction MUST run on this and not on the raw file.  The
    `calculated {}` legend talks ABOUT `analysisReconciliation` and shows
    `speciation {}` in prose, so a naive find-then-brace-match locks onto the
    empty braces inside the comment and reports the record missing -- which is
    exactly what happened on this gate's first run.
    """
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


def block(text, key, start=0):
    """The body of `key { ... }` in a dict file (brace-matched)."""
    i = text.find(key, start)
    if i < 0:
        return None
    i = text.find("{", i)
    if i < 0:
        return None
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
    m = re.search(r"(?<![\w:])" + re.escape(key) + r"\s+(-?[0-9.eE+-]+)", text)
    return float(m.group(1)) if m else None


def has_key(text, key):
    """The key is present with SOME value -- used for the fields that are not
    numbers (`constraintResponsible` names a law, not a quantity)."""
    return re.search(r"^\s*" + re.escape(key) + r"\s+\S", text, re.M) is not None


def rows_of(adjblock):
    """label -> body, for the nested per-quantity rows."""
    out, i = {}, 0
    while True:
        m = re.compile(r"^ {12}([A-Za-z]\w*)\s*$", re.M).search(adjblock, i)
        if not m:
            return out
        body = block(adjblock, m.group(1), m.start())
        out[m.group(1)] = body or ""
        i = m.end()


def variant(feed_body, tag):
    td = tempfile.mkdtemp()
    sub = pathlib.Path(td) / tag
    shutil.copytree(CASE, sub)
    for stale in ("converged", "reports"):
        if (sub / stale).exists():
            shutil.rmtree(sub / stale)
    (sub / "0" / "feed").write_text(feed_body)
    rc, out = run(sub)
    return rc, out, sub, td


def refuses(tag, body, needles, why):
    rc, out, _sub, td = variant(body, tag)
    try:
        if rc == 0:
            bad.append(f"A5/A6/A9: refusal '{tag}' did not fire -- {why}")
            return
        for needle in ([needles] if isinstance(needles, str) else needles):
            if needle not in out:
                bad.append(f"A5/A6/A9: refusal '{tag}' fired but not by name "
                           f"(looked for '{needle}').  Got:\n" + out[-900:])
    finally:
        shutil.rmtree(td, ignore_errors=True)


# ---------------------------------------------------------------------------
#  The witness's sheet, as a template the refusal variants edit.  Kept here
#  rather than read from the case so a variant cannot accidentally inherit an
#  edit made to the case for another reason.
# ---------------------------------------------------------------------------
TAIL = "T               313.15 K;\nP               101325 Pa;\n"
SHEET = """aqueousAnalysis
{{
    network            carbonate;
    basis              mg/L;
    defaultQualifier   dissolved;    // slice C: no default of any kind
    sampleTemperature  293.15 K;
    density   {{ value 998.4 kg/m3;  provenance measured; }}
    volumetricFlow     2.0 m3/h;
    pH                 7.6;
    closureTolerance   0.5 percent;
{unc}
    reconciliation
    {{
        method   weightedLeastSquares;
        enforce  ( {enforce} );
        maximumCorrection {{ value {limit}; in sigma; }}
    }}

    analytes
    {{
        Ca    {{ value  84.0 mg/L; {uCa} }}
        Cl    {{ value  45.0 mg/L;  uncertainty 5 percent; }}
        alkalinity
        {{
            species         HCO3;
            value          143.0 mg/L;
            as             CaCO3;
            perFormulaUnit   2;
            uncertainty      4 percent;
        }}
{hardness}    }}
}}
"""
HARDNESS = """        totalHardness
        {
            element         Ca;
            value          208.0 mg/L;
            as             CaCO3;
            uncertainty      3 percent;
        }
"""


def sheet(limit="3", enforce="electroneutrality  elementalConservation",
          hardness=HARDNESS, uCa="uncertainty 2 percent;", unc=""):
    return SHEET.format(limit=limit, enforce=enforce, hardness=hardness,
                        uCa=uCa, unc=unc) + TAIL


# ---------------------------------------------------------------------------
#  A1.  THE FIT, SOLVED INDEPENDENTLY.
#
#  Hand-rolled KKT elimination (Gaussian, partial pivoting) for
#      min Sum ((x-m)/s)^2  s.t.  C x = 0
#  which is  [2W  C^T; C  0][x; lam] = [2W m; 0].  Non-negativity is inactive
#  at this witness's answer -- ASSERTED below rather than assumed, because an
#  equality-only oracle silently agreeing with a bound-constrained engine
#  would be luck.
# ---------------------------------------------------------------------------
def kkt(m, s, C):
    n, mm = len(m), len(C)
    N = n + mm
    A = [[0.0] * (N + 1) for _ in range(N)]
    for i in range(n):
        A[i][i] = 2.0 / s[i] ** 2
        A[i][N] = 2.0 * m[i] / s[i] ** 2
        for k in range(mm):
            A[i][n + k] = C[k][i]
    for k in range(mm):
        for i in range(n):
            A[n + k][i] = C[k][i]
    for c in range(N):
        p = max(range(c, N), key=lambda r: abs(A[r][c]))
        A[c], A[p] = A[p], A[c]
        for r in range(N):
            if r == c:
                continue
            f = A[r][c] / A[c][c]
            for cc in range(c, N + 1):
                A[r][cc] -= f * A[c][cc]
    return [A[i][N] / A[i][i] for i in range(N)]


def species_rec(sp):
    return (CASE / "constant" / "species" / f"{sp}.dat").read_text()


def species_mw(sp):
    """`MW { value <x>; unit g/mol; }` -- a sub-dict."""
    return scal(block(species_rec(sp), "MW"), "value")


def species_z(sp):
    """`charge <z>;` -- a BARE scalar.

    Read separately from the MW on purpose.  A single "find the key then look
    for a value" helper locked onto the next `{` in the file and returned the
    MW block's value as the charge (calcium came out with z = +40.078), which
    the oracle then quietly absorbed.  Two record shapes, two readers.
    """
    return scal(species_rec(sp), "charge")


rc, out = run(CASE)
if rc != 0:
    bad.append(f"A1: {CASE.name} exited {rc} -- the weighted-least-squares "
               "witness must solve.  Output:\n" + out[-2500:])
res = result(out)

conv = CASE / "converged" / "feed"
raw = conv.read_text() if conv.is_file() else ""
calc = block(raw, "calculated")
#  Structural reads go through the comment-stripped copy (see uncomment());
#  `calc` keeps its comments because the legend arm A8 reads them.
calcS = block(uncomment(raw), "calculated")
recon = block(calcS, "analysisReconciliation") if calcS else None
if recon is None:
    bad.append("A1: converged/feed carries no analysisReconciliation record")

mw_caco3 = ATOMIC["Ca"] + ATOMIC["C"] + 3 * ATOMIC["O"]
LAB = ["Ca", "Cl", "alkalinity", "totalHardness"]
meas = [84.0 / species_mw("Ca"),
        45.0 / species_mw("Cl"),
        2.0 * 143.0 / mw_caco3,
        208.0 / mw_caco3]
pct = [0.02, 0.05, 0.04, 0.03]
sig = [pct[i] * meas[i] for i in range(4)]
zCa, zCl, zHCO3 = (species_z(s) for s in ("Ca", "Cl", "HCO3"))
if (zCa, zCl, zHCO3) != (2.0, -1.0, -1.0):
    bad.append(f"A1: the charges read from the sealed species records are "
               f"{(zCa, zCl, zHCO3)}, not (+2, -1, -1) -- the oracle below "
               "would be solving a different problem from the engine and its "
               "agreement, or disagreement, would mean nothing")
CONS = [[zCa, zCl, zHCO3, 0.0],       # electroneutrality
        [1.0, 0.0, 0.0, -1.0]]        # elementalConservation:Ca
oracle = kkt(meas, sig, CONS)

adj = block(recon, "adjustments") if recon else None
rowbodies = rows_of(adj or "")
if set(rowbodies) != set(LAB):
    bad.append(f"A1: the adjustments block lists {sorted(rowbodies)}, expected "
               f"{sorted(LAB)} -- the witness's sheet moved, or rows stopped "
               "being listed; every measured quantity is listed under least "
               "squares, because 'this one did not move' is a result of the "
               "fit and not an absence")

#  The engine's per-hour numbers are per 2.0 m3/h; the oracle is per L.
Q_L_PER_H = 2000.0
if rowbodies and not bad:
    for i, lab in enumerate(LAB):
        b = rowbodies[lab]
        rep = scal(b, "reportedValue")
        got = scal(b, "adjustedValue")
        if rep is None or got is None:
            continue
        want_rep = meas[i] * Q_L_PER_H * 1e-6        # mmol/L -> kmol/h
        want_adj = oracle[i] * Q_L_PER_H * 1e-6
        if abs(rep - want_rep) > 1e-9 * max(1.0, abs(want_rep)):
            bad.append(f"A1: row {lab!r} reportedValue {rep!r} disagrees with "
                       f"the authored sheet ({want_rep!r}) -- the mg/L "
                       "conversion or the `as CaCO3` surrogate is wrong")
        if abs(got - want_adj) > 1e-9 * max(1.0, abs(want_adj)):
            bad.append(f"A1: row {lab!r} adjusted {got * 1e6 / Q_L_PER_H:.7f} "
                       f"mmol/L, independent KKT says "
                       f"{oracle[i]:.7f} (diff "
                       f"{abs(got - want_adj):.2e}, tol 1e-09)")

if recon:
    before = scal(recon, "chargeImbalanceBefore")
    after = scal(recon, "chargeImbalanceAfter")
    if before is None or abs(before) < 1e-6:
        bad.append("A1: the imbalance BEFORE is zero -- the witness no longer "
                   "exercises a reconciliation at all")
    if after is None or abs(after) > 1e-9:
        bad.append(f"A1: the imbalance AFTER is {after} % -- the fit did not "
                   "close the charge balance it exists to close")
    if scal(recon, "objective") is None:
        bad.append("A1: no `objective` reported -- Sum((x-m)/sigma)^2 is what "
                   "the method minimises and a reader cannot see how hard it "
                   "had to push without it")

# ---------------------------------------------------------------------------
#  A2.  THE SIX INSPECTABLE FIELDS.
# ---------------------------------------------------------------------------
SIX = ["reportedValue", "adjustedValue", "sigma", "weight", "correctionSigma",
       "constraintResponsible"]
for lab, b in rowbodies.items():
    for f in SIX:
        if not has_key(b, f):
            bad.append(f"A2: row {lab!r} does not state {f!r}.  A record that "
                       "says a measurement was moved without saying from what, "
                       "by how much of its own uncertainty, and under which "
                       "law is not an inspectable record")
    if block(b, "closure") is None:
        bad.append(f"A2: row {lab!r} states no `closure` -- how much of each "
                   "law's residue this correction removed is the sixth field "
                   "and the one that ties a measurement to a balance")
    if "percent" not in b:
        bad.append(f"A2: row {lab!r} does not state its declared uncertainty")

cons_b = block(recon, "constraints") if recon else None
if cons_b is None:
    bad.append("A2: no `constraints {}` block -- the ACTIVE CONSTRAINTS and "
               "their residuals are part of the required record")
else:
    for nm_ in ("electroneutrality", "elementalConservation:Ca"):
        if nm_ not in cons_b:
            bad.append(f"A2: constraint {nm_!r} is not reported")
    if "binding" not in cons_b:
        bad.append("A2: constraints do not report whether they bind -- 'it "
                   "needed to move nothing' and 'it was never applied' are "
                   "different facts")

#  ...and in the result JSON, which is the only surface the GUI reads.
jrec = None
if res:
    jrec = res["streams"].get("feed", {}).get("analysisReconciliation")
    if jrec is None:
        bad.append("A2: the result JSON carries no analysisReconciliation for "
                   "the feed -- the record exists on disk and not in the "
                   "payload, so nothing reading the payload can show it")
    else:
        for r in jrec.get("adjustments", []):
            for f in ("reportedValue", "adjustedValue", "sigma", "weight",
                      "correctionSigma", "constraintResponsible", "closure"):
                if f not in r:
                    bad.append(f"A2: JSON adjustment {r.get('label')!r} lacks "
                               f"{f!r}")

# ---------------------------------------------------------------------------
#  A3.  THE TWO IDENTITIES.
# ---------------------------------------------------------------------------
if jrec:
    for r in jrec.get("adjustments", []):
        parts = sum(r.get("causedBy", {}).values())
        u = r["correctionSigma"]
        if abs(parts - u) > 1e-9 * max(1.0, abs(u)):
            bad.append(f"A3a: row {r['label']!r} causedBy parts sum to "
                       f"{parts:.7g} sigma, correctionSigma is {u:.7g}.  The "
                       "attribution is a KKT identity; a published explanation "
                       "that does not reconstruct its own answer is worse than "
                       "none")
    for c in jrec.get("constraints", []):
        tot = sum(r.get("closure", {}).get(c["name"], 0.0)
                  for r in jrec.get("adjustments", []))
        rb = c["residualBefore"]
        if abs(tot + rb) > 1e-9 * max(abs(rb), 1e-30):
            bad.append(f"A3b: law {c['name']!r} had residual {rb:.7g} and the "
                       f"corrections credited with closing it sum to {tot:.7g} "
                       "-- the report says the residue was removed by rows "
                       "that did not remove it")
        if abs(c["residualAfter"]) > 1e-9 * max(abs(rb), 1e-30):
            bad.append(f"A3b: law {c['name']!r} still has residual "
                       f"{c['residualAfter']:.7g} at the answer")

# ---------------------------------------------------------------------------
#  A4.  IT DISTRIBUTES, IT DOES NOT DUMP.
# ---------------------------------------------------------------------------
if jrec:
    moved = [r for r in jrec["adjustments"] if abs(r["correctionSigma"]) > 1e-6]
    if len(moved) < 3:
        bad.append(f"A4: only {len(moved)} quantities moved.  The claim that "
                   "separates A2 from A1 is that the correction is SPREAD "
                   "across the measurements in proportion to how uncertain "
                   "each one is, instead of being shoved into one ion")
    worst = max((abs(r["correctionSigma"]) for r in jrec["adjustments"]),
                default=0.0)
    if worst > 1.0:
        bad.append(f"A4: the worst correction is {worst:.4f} sigma.  The "
                   "witness is meant to exercise a fit that stays comfortably "
                   "inside every declared uncertainty -- past 1 sigma it is no "
                   "longer demonstrating 'preserve the measurements where "
                   "possible'")
    if any(r["atNonNegativityBound"] for r in jrec["adjustments"]):
        bad.append("A4: a row sits on its non-negativity bound, so the "
                   "equality-only oracle in arm A1 is not solving the same "
                   "problem the engine is, and its agreement would be an "
                   "accident")

# ---------------------------------------------------------------------------
#  A5.  THE LIMIT REFUSES, NAMING THE NUMBERS.
# ---------------------------------------------------------------------------
#  BOTH numbers must be in the message: what the correction WAS and what was
#  allowed.  A refusal that says only "over the limit" leaves the author
#  guessing which quantity and by how much.
refuses("overlimit", sheet(limit="0.2"),
        ["beyond the declared limit", "0.2813", "0.2000", "alkalinity"],
        "a 0.2813 sigma correction against a declared 0.2 sigma limit stops "
        "being a reconciliation and becomes the analysis rewritten to fit")

# ---------------------------------------------------------------------------
#  A6.  NO SILENT SIGMA -- and the announced positive.
# ---------------------------------------------------------------------------
refuses("nosigma", sheet(uCa=""),
        ["genericWaterAnalysis-v1", "uncertainties { default"],
        "weighted least squares with an unweighted row is not weighted.  The "
        "versioned default profile is deliberately not shipped -- an "
        "uncertainty belongs to a laboratory and a method, not to an analyte "
        "-- so the absence refuses by name instead of inventing sigmas that "
        "would look authoritative because they carried a version")

rc6, out6, sub6, td6 = variant(
    sheet(uCa="", unc="    uncertainties { default 2 percent; }\n"), "defaults")
try:
    if rc6 != 0:
        bad.append("A6: `uncertainties { default <x> percent; }` was refused, "
                   "so the one declared way to state EQUAL WEIGHTS out loud "
                   "does not work.  Output:\n" + out6[-900:])
    elif "uncertainties{} `default`" not in out6:
        bad.append("A6: a row took its sigma from the `default` and the run "
                   "did not say so.  A weighting nobody can see is a silent "
                   "crutch; the ORIGIN of every sigma is announced or the "
                   "reader cannot tell a declared uncertainty from an "
                   "inherited one.  Output:\n" + out6[-900:])
finally:
    shutil.rmtree(td6, ignore_errors=True)

refuses("orphanunc",
        sheet(unc="    uncertainties { majorIons 2 percent; }\n"),
        "no analyte used",
        "an `uncertainties` entry that matches no row key and no declared "
        "class does nothing, and the run would report a weighting the author "
        "did not get")

# ---------------------------------------------------------------------------
#  A7.  THE ONE-WAY BOUNDARY, AS A COMPILE FACT.
# ---------------------------------------------------------------------------
FORBIDDEN_NAMES = ["ThermoPackage", "SpeciationSolver", "ReactiveVLE",
                   "ElectrolyteModel", "ActivityModel", "SpeciationResult",
                   "EquationOfState", "Component"]
for f in ("AnalysisReconciler.H", "AnalysisReconciler.cpp"):
    body = (SRC / f).read_text()
    for inc in re.findall(r'^\s*#\s*include\s+"([^"]+)"', body, re.M):
        if inc.startswith("thermo/"):
            bad.append(f"A7a: src/streams/{f} includes {inc} -- the "
                       "reconciler must not be able to reach the equilibrium "
                       "surface.  The ruling's arrow is one-way and this file "
                       "is what makes that structural rather than a habit")
    stripped = re.sub(r"/\*.*?\*/", "", body, flags=re.S)
    stripped = re.sub(r"//[^\n]*", "", stripped)
    for nmx in FORBIDDEN_NAMES:
        if re.search(r"\b" + nmx + r"\b", stripped):
            bad.append(f"A7a: src/streams/{f} names {nmx} -- it must not be "
                       "able to name the chemistry, so it cannot call it")

if not OBJ.is_file():
    bad.append(f"A7b: {OBJ.relative_to(ROOT)} is absent, so the object-level "
               "reading of the boundary CANNOT RUN.  A check that cannot run "
               "must not pass -- run `make all` and re-run this gate")
else:
    p = subprocess.run(["nm", "-uC", str(OBJ)], capture_output=True, text=True)
    if p.returncode != 0:
        bad.append("A7b: `nm` failed on the reconciler object, so the "
                   "object-level reading CANNOT RUN:\n" + p.stderr[-400:])
    else:
        syms = [ln.strip()[2:].strip() for ln in p.stdout.splitlines()
                if ln.strip().startswith("U ")]
        choupo = sorted({s for s in syms if s.startswith("Choupo::")})
        allowed = "Choupo::solver::activeSetQP"
        stray = [s for s in choupo if not s.startswith(allowed)]
        if stray:
            bad.append("A7b: AnalysisReconciler.o references Choupo symbols "
                       f"beyond the one allowed ({allowed}): "
                       + ", ".join(stray))
        if not any(s.startswith(allowed) for s in choupo):
            bad.append("A7b: AnalysisReconciler.o does not reference "
                       f"{allowed} at all -- either the QP is no longer the "
                       "solver, or this arm is reading the wrong object and "
                       "would pass whatever the file did")

# ---------------------------------------------------------------------------
#  A8.  THE PEDAGOGICAL SEPARATION IS IN THE OUTPUT.
# ---------------------------------------------------------------------------
spec = block(uncomment(raw), "speciation")
if calc is None:
    bad.append("A8: no `calculated {}` block to inspect")
else:
    if "NOT ONE OF THEM IS" not in calc or "reportedValue" not in calc:
        bad.append("A8: the `calculated {}` legend no longer states that "
                   "nothing inside it is a chemistry result.  The separation "
                   "is the point of the slice and a reader meeting the file "
                   "cold has only this to go on")
if spec is not None:
    if "reportedValue" in spec or "correctionSigma" in spec:
        bad.append("A8: the speciation block carries `reportedValue` or "
                   "`correctionSigma`.  Those two fields are the structural "
                   "mark that separates a MEASUREMENT-correction from a "
                   "CHEMISTRY result; if a calculated quantity can carry them "
                   "the mark means nothing")
else:
    bad.append("A8: converged/feed carries no speciation block, so the arm "
               "that checks the two kinds are kept apart has only one of the "
               "two kinds to look at and CANNOT RUN")
if recon and re.search(r"(?<![\w])pH\s+[0-9]", recon):
    bad.append("A8: the reconciliation record uses the bare key `pH`.  The "
               "flash SOLVES a pH into this same file, so two different "
               "numbers would share one key -- exactly the confusion the "
               "block is designed to prevent.  The measured one is "
               "`pHReported`")
if recon and "pHReported" not in recon:
    bad.append("A8: the measured pH is not reported as `pHReported`")
#  Different KEY SPACES: sheet labels here, species ids there.
if spec is not None and rowbodies:
    if "totalHardness" in spec or "alkalinity" in spec:
        bad.append("A8: a sheet LABEL appears in the speciation block -- the "
                   "two key spaces have merged and a reader can no longer "
                   "tell which kind of number he is looking at by its key")
if jrec and "note" not in jrec:
    bad.append("A8: the JSON record carries no `note` saying what kind of "
               "numbers it holds.  A consumer showing the payload raw has no "
               "legend otherwise")

# ---------------------------------------------------------------------------
#  A9.  FIVE MORE REFUSALS.
# ---------------------------------------------------------------------------
refuses("elementunenforced", sheet(enforce="electroneutrality"),
        "does not list `elementalConservation`",
        "an element total carries no material of its own -- its ONLY effect "
        "is the law that ties it to the species rows, so unenforced it is a "
        "measured number nothing reads")

refuses("vacuouselements", sheet(hardness=""),
        "expands to ZERO constraints",
        "a declared law that generates no constraint would pass silently "
        "while claiming to have been enforced -- the permanently-green-gate "
        "shape, inside the engine")

refuses("perFormulaOnElement",
        sheet(hardness=HARDNESS.replace("as             CaCO3;",
                                        "as             CaCO3;\n"
                                        "            perFormulaUnit  1;")),
        "ARITHMETIC",
        "how many Ca there are in a CaCO3 is arithmetic the formula states; "
        "declaring it puts a second home beside a derived number, free to "
        "drift from it.  (A SPECIES row is different: nothing in the formula "
        "says an alkalinity titration counts two bicarbonate per unit.)")

refuses("unknownlaw", sheet(enforce="electroneutrality  massBalance"),
        "is not a conservation law this reconciler knows",
        "a misspelt law would otherwise be silently dropped and the fit would "
        "enforce less than the case declared")

refuses("bothspecieselement",
        sheet(hardness=HARDNESS.replace("element         Ca;",
                                        "element         Ca;\n"
                                        "            species         Ca;")),
        "declares BOTH",
        "a row that is both material and a redundant determination of "
        "material would be counted twice")

# ---------------------------------------------------------------------------
#  A10.  THE SNAPSHOT IS STILL FEEDABLE.
# ---------------------------------------------------------------------------
if conv.is_file():
    rc10, out10, sub10, td10 = variant(conv.read_text(), "roundtrip")
    try:
        if rc10 != 0:
            bad.append("A10: converged/feed cannot be fed back as 0/feed.  "
                       "`calculated {}` claims the reader ignores it so the "
                       "file stays feedable as state -- the same deletability "
                       "test the speciation block passes.  Output:\n"
                       + out10[-900:])
    finally:
        shutil.rmtree(td10, ignore_errors=True)


if bad:
    print("check_aqueous_reconciliation: FAILED")
    for b in bad:
        print("  " + b)
    sys.exit(1)

print("check_aqueous_reconciliation: OK -- constrained weighted least squares "
      "reconciles the witness's four measured quantities to an answer this "
      "gate recomputes INDEPENDENTLY (its own KKT elimination from the "
      "authored mg/L, `as CaCO3` surrogates included) to 1e-9; the charge "
      "balance closes, every adjusted quantity states all six inspectable "
      "fields (reported, adjusted, sigma+weight, correction IN SIGMA, the "
      "constraint responsible, and its contribution to each law's closure) "
      "both on disk and in the result JSON; the two published identities hold "
      "-- the per-law parts sum to the correction and the corrections sum to "
      "the residue they removed; the fit SPREADS across four quantities at "
      "under 0.29 sigma each instead of dumping on one ion; a correction past "
      "`maximumCorrection { in sigma; }` REFUSES with the numbers; a missing "
      "uncertainty refuses naming genericWaterAnalysis-v1 (reserved, "
      "deliberately not shipped) while a declared `default` is accepted and "
      "its use ANNOUNCED per row; the ONE-WAY BOUNDARY holds as a compile "
      "fact on two independent readings (no thermo/ include and no chemistry "
      "type named in the source; the object references exactly ONE Choupo "
      "symbol, solver::activeSetQP); the measurement side is structurally "
      "distinguishable from the chemistry (reportedValue and correctionSigma "
      "appear only there, the key spaces are disjoint, the measured pH is "
      "`pHReported`); five further refusals fire by name; and the resolved "
      "snapshot still re-reads as state.  NOT CHECKED: whether the reconciled "
      "water is the TRUE one (it is the closest admissible one in the metric "
      "the author declared), whether the declared uncertainties are right, "
      "and which measurement is at fault when the objective is large -- A2 "
      "does no gross-error detection and claims none.")
