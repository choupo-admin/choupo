#!/usr/bin/env python3
"""Gate: the sizing and costing tables can be defended from themselves.

    bin/curate/check_cost_provenance.py

WHY THIS EXISTS.  Leg 4 of the student walkthrough is the one that decides
whether the student passes: sizing, costing, and whether they can say where
each number came from when the jury asks.  The tables printed

    knockout  vessel  SS316  V_R [m3] 7.6882 ...
    knockout  vessel  3.05   1.00     18104   141231   166653

and between `F_M 3.05` and `C_TM 166653` stood eleven numbers and five
decisions -- the correlation and its coefficients, the size driver, the base
year, the price index and its 2001 reference, the currency rate, two
bare-module factors and the 1.18 -- all computed inside the pass, none said.
`V_R = 7.6882` was the same entry whether a residence time, a space velocity
or the author produced it, and `VesselSize` computed exactly that distinction
and discarded it with `(void)basis`.

THE CENTRAL ARM DOES WHAT THE STUDENT WOULD DO.  It takes the printed
coefficients and the printed indices, redoes the arithmetic in Python, and
requires the result to match the printed total.  That is the only test of the
claim being made: not that a block appears, but that the block is SUFFICIENT.

WHAT THIS GATE CHECKS, on a probe built from a real corpus case:

  (a) C_TM RECOMPUTES FROM THE PRINTED NUMBERS ALONE.  Nothing is read from
      the source or from the JSON: K1/K2/K3, S, CEPCI/CEPCI_2001, EUR/USD,
      B1/B2, F_M and the 1.18 all come off the console block, and

          C_p = 10^(K1 + K2 log10 S + K3 (log10 S)^2) x index x fx
          C_BM = C_p (B1 + B2 F_M F_P);   C_TM = 1.18 C_BM

      must land on the printed C_purchased, C_bare_mod and C_total_mod to
      0.1 %.  This is also the arm that catches TOO FEW DIGITS: the block's
      first version printed `B1, B2 = 2.2, 1.8` and `F_M = 3` (setprecision on
      a fresh stream is SIGNIFICANT digits), from which a reader reconstructs
      7.6 instead of 7.801, lands 2.6 % out, and concludes THEY made the
      mistake.  A provenance line too coarse to reproduce is worse than none.

  (b) THE SIZE'S RULE IS NAMED.  `basis: drum V = Q*tau` appears, so the
      volume can be attributed to a design argument rather than to a table.

  (c) THE IDEAL-GAS FLOW IS ANNOUNCED, AND ITS VALUE REPRODUCES THE VOLUME.
      Every residence-time and space-velocity size is driven by N R T / P
      computed regardless of the case's declared thermo package -- fine at a
      drum's 1 bar, a fifth undersized at 50 bar with Z = 0.8, and previously
      stated only in a source comment.  The printed Q times the declared tau
      must give the printed V_R.

  (d) THE COEFFICIENTS ARE ATTRIBUTED.  The block names Turton and Appendix A.
      A formula with anonymous constants is not checkable, and this project
      does not let a citation live only in a comment.

  (e) F_M IS **NOT** CITED IN THIS BLOCK, deliberately: it is a per-material
      datum whose own record carries its citation, and a second home for it
      here is exactly the duplication the arity doctrine forbids.  Checked, so
      that a later "helpful" addition cannot pass silently.

  (f) THE DESIGN CSV CARRIES THE DESIGN ARGUMENT.  `reports/design/sizing.csv`
      is the file that goes into the report, and a volume is the same entry
      whether a residence time, a space velocity or the author produced it.
      Solving that on the console alone would be half the fix.

  (g) THE ECONOMICS CSV REPRODUCES ITS OWN TOTAL.  This arm reads ONLY the
      file -- no console, no JSON, no source -- and recomputes C_TM from the
      columns sitting beside it.  Arm (a)'s standard, applied to the artefact.

  (h) A FAILING REPORT DOES NOT SILENCE THE ONES AFTER IT.  The chain loop had
      no guard, so the first report to throw killed every report after it and
      said nothing about the ones that never ran -- "never reached" reading as
      "produced nothing", which is absence read as a result, one layer out.
      The probe declares `economics` with no postDict at all: it must refuse,
      the report beside it must still write its artefact, and the run must
      state how many failed.

  (i) THE COSTING NUMBER IS UNMOVED by the audit.  An announcement that
      changes an answer is not an announcement.

ADDED 2026-09-06 -- A NUMBER A STUDENT MUST DEFEND, WITH NO WAY TO TELL WHAT
THEY DECLARED FROM WHAT THE ENGINE ASSUMED.  The block above proves the total
can be RECOMPUTED.  It could not tell whether the constants it recomputes from
were CHOSEN.  Three of them -- the price index, the weld joint efficiency, the
corrosion allowance -- were `lookupScalarOrDefault` literals announced nowhere,
and the pass's own header re-read two of them with a SECOND set of defaults
that happened to agree with the model's.

  (j) THE HEADER STATES THE INDEX THAT PRICED.  The banner's CEPCI, the
      provenance line's `index: CEPCI x / y` and costs.csv's `cepci` column
      are one fact on three surfaces.  The probe declares 861, which is NOT
      the engine's built-in default, so a header carrying a hard-coded index
      is caught rather than agreeing by coincidence -- the probe declared 820
      until this date and could not have told the two apart.

  (k) SOURCE -- THE HEADER DOES NOT RE-DERIVE WHAT THE MODEL PRICED WITH, and
      each of the four price-index constants has exactly ONE home in
      `Turton.{H,cpp}` outside comments.  A source arm, and the limit is
      worth stating rather than hiding: NO output arm can separate a header
      that re-reads the dict from one that draws the model, because when the
      case declares the key both find the same number and when it does not
      both fall back to literals that agree.  That agreement IS the defect --
      the banner was accidentally true -- so a structural claim is checked
      structurally.

  (l) A DEFAULT THAT IS USED IS ANNOUNCED, ON EVERY SURFACE.  The probe
      declares neither `year`, `cepci2001`, `usdToEur` nor `jointEfficiency`:
      each must be announced at its site WITH THE VALUE USED, replayed in the
      end-of-run ASSUMPTIONS AND CAVEATS block, and present in the result
      JSON.  The CatalystPellet posture -- a warning at its own site only has
      been delivered and not received.

  (m) A DECLARED VALUE ANNOUNCES NOTHING -- the negative, and the arm that
      keeps silence worth reading.  `L_over_D`, `corrosionAllow` and `cepci`
      ARE declared by the probe and must appear in no announcement.

  (n) THE SHEET SAYS WHICH.  `design/flash01/vessel` carries an
      `assumed ( ... )` list that is EXACTLY what the run announced for that
      unit.  The specification sheet is the page somebody audits a project
      from, and an input the engine supplied that the page does not name
      reads as one the author declared.

  (p) THE RETIRED NAME IS REFUSED (2026-10-05, DEV.md 4c C38 item 2).
      `method Guthrie;` prices nothing and its refusal names `Turton`; the
      source registers no `Guthrie` key.  See `check_retired_name_refused`.

  (q) THE WORKING CAPITAL BUILT UP RECOMPUTES, GROSS AND NET (2026-10-07,
      DEV.md 4c C44 slice 4).  On greenAmmoniaIndustrialN2 every line of
      `workingCapital { ... }` -- raw-material stock, process inventory,
      product stock (valued at COST), receivables, minimum cash, payables --
      is recomputed from the case's declarations and the run's published
      streams and held inventories; the net is the cash flow's WC; the
      fraction form keeps WC = 0.15 x FCI with no build-up; a unitless or a
      missing day count is refused BY NAME.  See `check_working_capital`.

  (o) A DECISION SAYS WHOSE IT IS.  `refuseOnMissingPrice` decides whether an
      appraisal REFUSES on an absent price or reports zero revenue, and it was
      a float read with a silent default.  Two probes, built here because
      every shipped economics case declares the key (measured 2026-09-06: 6 of
      6) and the default path therefore has NO corpus witness -- a guard whose
      only case satisfies it is a guard nothing tests.

WHAT THE 2026-09-06 ARMS DELIBERATELY DO NOT CHECK:

  * WHETHER ANY DEFAULT'S VALUE IS RIGHT.  `StirredTank` assumes L/D = 2.5 and
    `VesselSize` assumes 3.0 for the same key, asking the same question.  That
    disagreement is RECORDED in `sizing/DesignDefaults.{H,cpp}` and NOT
    reconciled: picking one moves every un-declared vessel's D, H, t_wall,
    weight and capital cost, which is a curation decision reserved for Vitor.
    This gate checks that both are SAID, never that either is right.
  * THE OTHER SILENT DEFAULTS.  14 more sit in `EconomicsPass` (projectLife,
    discountRate, taxRate, ... ), 2 in `SprayDryerSize`, 2 in `PinchPass`, 1 in
    `CompressorSize`.  They are measured and named in the design record, not
    wired.

SABOTAGE-VERIFIED 2026-08-27, nine times; every quoted line is OBSERVED.

S1 -- the whole provenance block suppressed.  Arms (a) and (d).

S2 -- B1/B2 printed in SIGNIFICANT digits again (`setprecision(2)` on a fresh
stream, which is what the block SHIPPED with on its first run).  This is the
arm's reason for existing, and it fires quantitatively:

    (a) C_bare_mod recomputed from the PRINTED numbers is 24354.3 against the
        printed 24707 (-1.43 %)

S3 -- the Turton attribution line dropped.  Arm (d).

S4 -- `d.basis = basis` reverted to `(void)basis`.  Arms (b) AND (c) --
and that coupling is worth knowing: the ideal-gas note is printed INSIDE the
basis line, so losing the basis loses the announcement too.  (c) is therefore
NOT independent of (b), and S5 is what tests it alone.

S5 -- the ideal-gas note silenced with the basis kept.  Arm (c) only.

S6 -- the provenance block's F_M column made to read B1.  Arm (a), both
through the recomputation (-18.67 %) and through the two-tables-disagree
check, which is the one that names the cause rather than the symptom.

S7 -- `sizing.csv` loses its `basis` column.  Arm (f): the volume is in the
file and the rule that produced it is not, so the file cannot be defended.

S8 -- `costs.csv` reverted to three numbers and nothing else.  Arm (g), naming
all eleven columns that vanished: "the file states a total nobody can
reproduce from it".

S9 -- the chain's per-report `catch` made to re-throw, restoring the
kill-the-chain behaviour.  Arm (h), both halves.  The FIRST attempt at this
sabotage did not COMPILE, which proves nothing at all; it was rewritten until
it built and ran, because a sabotage that fails to build has tested nothing.

SABOTAGE-VERIFIED AGAIN 2026-09-06, eight more times, BY HAND under
`bin/curate/destructive_session.py`'s disk journal -- never by the gate, which
may not patch a source and rebuild the engine (the 2026-08-18 tree-poisoning
shape; `check_gate_selftest` is the only gate permitted it).  Every line below
is OBSERVED, and none of the eight survived.

S10 -- the header reverted to re-reading the costing dict with its own
`year`/`cepci` defaults, exactly as it stood before this slice.  Arm (k), all
three claims, and NOTHING ELSE -- which is the stated limit made visible:

    (k) CostingPass.cpp reads `year` from the costing dict with a default of
        its own. ...
    (k) CostingPass.cpp no longer draws the model's published pricing factors.

S11 -- `designDefault::valueOr` made silent (the value still taken, the print
and the advisory dropped).  Arm (l), for `jointEfficiency`.  Arm (n) does NOT
fire, because the record was still marked -- the two halves are independent
and S12 is what tests the other one alone.

S12 -- `d.assume(a.key)` removed, the announcement kept.  Arm (n) only.

S13 -- the sheet writer's `assumed ( ... )` block dropped, the record intact.
Arm (n), with the SAME sentence S12 produced.  Worth knowing before trusting
it: arm (n) cannot tell "the record lost the mark" from "the writer stopped
writing it" -- it sees one absence and names both causes at once.

S14 -- `priceIndexOr`'s announcement silenced.  Arm (l), three times:

    (l) `year` was NOT declared by the probe and the run said nothing ...
    (l) `cepci2001` ... (l) `usdToEur` ...

S15 -- `refuseOnMissingPriceOf` reverted to
`lookupScalarOrDefault("refuseOnMissingPrice", 1.0) != 0.0`.  Arm (o).

S16 -- the announcement made UNCONDITIONAL: it fires even when the case
declared the value (the value itself unchanged, so no number moves).  Arms (m)
twice and (n) once.  This is the negative's own test, and it is the sabotage
worth having: an announcement that fires on everything is the failure mode the
end-of-run block exists to prevent, and it looks MORE thorough, not less.

S17 -- the four in-class member initialisers restored in `Guthrie.H` (named
`Turton.H` since 2026-10-05, DEV.md 4c C38 item 2) beside
the constructor that assigns all four unconditionally.  Arm (k), four times,
one per literal.  Note what this sabotage does NOT do: it changes no output at
all, because the initialisers were dead the whole time.  Only a source arm can
see a second home that is never read.

AND A DEFECT IN THIS GATE, found by running the new arms.  They were first
inserted AFTER the `finally: shutil.rmtree(tmp)` -- so they checked for files
in a directory that had already been deleted, and reported "the design report
wrote no sizing.csv" about a run that had written it.  The gate was testing an
empty directory and blaming the engine.  A check must be inside the scope of
the thing it checks.

WHAT THIS GATE DOES **NOT** COVER, stated so its OK line cannot imply it:

  * It does not check that any COEFFICIENT IS RIGHT.  It proves the printed
    numbers are self-consistent and sufficient to reproduce the total; whether
    Turton's Appendix A really says 3.4974 is a curation question, and no copy
    of that book is in this repository.
  * Only the vessel / log-quadratic path is exercised.  The power-law items
    (crystalliser, spray dryer, cyclone) print a different coefficient triple
    and are NOT recomputed here.
  * It says nothing about whether the SIZE is a good design -- only about
    where it came from.
  * The `basis` string is console-only: it is not in the result JSON and no
    golden row pins it.  A word is not a golden value, and this gate is the
    only thing standing behind it.
"""
import csv
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CASE = ROOT / "tutorials/steady/flash/flash01_benzene_toluene"
BIN = ROOT / "choupoSolve"

TAU = 300.0

#  THE PROBE'S COSTING BLOCK DECLARES `cepci` AND NOTHING ELSE, and both
#  halves of that are load-bearing (2026-09-06):
#
#    * `cepci` is declared at a value that is NOT the engine's built-in
#      default, so a header printing a hard-coded index is caught by arm (j).
#      It was 820 -- which IS the default -- until this date, so the header
#      and the priced index agreed for two reasons at once and the arm could
#      not tell them apart.
#    * `year`, `cepci2001` and `usdToEur` are NOT declared, so all three are
#      taken from the engine and must be ANNOUNCED (arm (k)).
#    * `jointEfficiency` is NOT declared either, so the SIZER defaults one --
#      while `L_over_D` and `corrosionAllow` ARE declared, which is what
#      makes arm (l), the negative, mean anything.
CEPCI_PROBE = 861.0

POST = """\
sizing
{
    units
    (
        {
            unitName    flash01;
            type        vessel;
            material    SS316;
            designRules
            {
                residenceTime   %g;
                flowKey         F_alpha;
                L_over_D        3.0;
                pressureDesign  3.0;
                corrosionAllow  0.003;
            }
        }
    );
}

costing
{
    method  Turton;
    cepci   %g;
}
""" % (TAU, CEPCI_PROBE)

fails = []


def add_reports(case_dir, kinds):
    """Add report kinds to a case's controlDict, MERGING into any existing
    `reports {}` block.  Appending a second block is refused by the dict layer
    -- correctly: "key 'reports' is declared TWICE ... the file's order would
    decide the answer" -- and the probe must not trip over a guard that is
    doing its job."""
    cd = Path(case_dir) / "system" / "controlDict"
    txt = cd.read_text()
    body = "".join(f"    {k} {{ }}\n" for k in kinds)
    m = re.search(r"(reports\s*\{)", txt)
    if m:
        txt = txt[:m.end()] + "\n" + body + txt[m.end():]
    else:
        txt += "\nreports\n{\n" + body + "}\n"
    cd.write_text(txt)



def strip_comments(src: str) -> str:
    """C++ source with its comments removed.  The arity arm below counts
    LITERALS, and every one of them is also NAMED in a comment explaining why
    it now has one home -- so a count over the raw text would count the
    explanation as a second copy of the thing it explains."""
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    return re.sub(r"//[^\n]*", "", src)


def check_price_index_arity(fails):
    """(k) SOURCE -- the header does not RE-DERIVE what the model priced with,
    and each of the four price-index constants has exactly one home.

    A source arm, and the reason is a limit worth stating rather than hiding:
    no OUTPUT arm can separate a header that re-reads the dict from one that
    draws the model, because when the case declares the key both find the same
    number, and when it does not both fall back to literals that agree today.
    That agreement is exactly the defect -- the banner was ACCIDENTALLY true --
    so the claim being made here is structural and is checked structurally.
    Arm (j) covers what an output arm CAN see: a header printing something
    other than the index that priced."""
    cp = strip_comments((ROOT / "src/postProcessing/CostingPass.cpp")
                        .read_text(errors="replace"))
    for key in ("year", "cepci", "cepci2001", "usdToEur"):
        if re.search(r'lookupScalarOrDefault\s*\(\s*"%s"' % key, cp):
            fails.append(
                "(k) CostingPass.cpp reads `%s` from the costing dict with a "
                "default of its own.  The costing MODEL resolves the same key "
                "and does the pricing: two homes for one constant, and the "
                "header is true only while the two literals happen to agree. "
                " Draw `CostingModel::pricingFactors()` instead." % key)
    if "pricingFactors" not in cp:
        fails.append(
            "(k) CostingPass.cpp no longer draws the model's published "
            "pricing factors.  A header that computes its own is the second "
            "home under another name (the 2026-09-05 first-law rule).")

    g = strip_comments((ROOT / "src/postProcessing/costing/Turton.cpp")
                       .read_text(errors="replace")) \
      + strip_comments((ROOT / "src/postProcessing/costing/Turton.H")
                       .read_text(errors="replace"))
    for lit in ("2026.0", "820.0", "397.0", "0.92"):
        n = len(re.findall(re.escape(lit), g))
        if n > 1:
            fails.append(
                "(k) the price-index literal %s appears %d times in "
                "Turton.{H,cpp} outside comments.  It had three homes on "
                "2026-09-06 -- the constructor's default, a dead in-class "
                "member initialiser, and the pass's own header -- and they "
                "agreed, which is what made the drift invisible." % (lit, n))


def check_policy_is_named(fails):
    """(o) A DECISION SAYS WHOSE IT IS.  `refuseOnMissingPrice` decides whether
    an appraisal REFUSES on an absent price or reports zero revenue -- the
    difference between an appraisal and a number -- and it was a float read
    with a silent default.  A case that declares it must announce NOTHING; a
    case that does not must be told the engine chose.

    Every shipped economics case declares it (measured 2026-09-06: 6 of 6), so
    the default path has no corpus witness at all -- which is precisely why it
    is built here.  A guard whose only case satisfies it is a guard nothing
    tests."""
    src = ROOT / "tutorials/steady/economics/economics01_esterification_dcf"
    tmp = tempfile.mkdtemp(prefix="price_policy_")
    try:
        for name, strip in (("declared", False), ("silent", True)):
            d = Path(tmp) / name
            shutil.copytree(src, d)
            if strip:
                pd = d / "system" / "postDict"
                pd.write_text("\n".join(
                    l for l in pd.read_text().splitlines()
                    if "refuseOnMissingPrice" not in l) + "\n")
            p = subprocess.run([str(BIN), str(d)], capture_output=True,
                               text=True, cwd=str(ROOT), timeout=300)
            out = p.stdout + p.stderr
            said = re.search(
                r"\[assumed\] economics: refuseOnMissingPrice was NOT declared",
                out)
            if strip and not said:
                fails.append(
                    "(o) a case that does not declare `refuseOnMissingPrice` "
                    "is not told so: the appraisal refuses on the ENGINE's "
                    "policy and its output reads exactly like one whose "
                    "author chose to refuse")
            if not strip and said:
                fails.append(
                    "(o) a case that DECLARES `refuseOnMissingPrice` is told "
                    "it was assumed.  Silence has to keep meaning 'nothing "
                    "was assumed', or the announcement is noise the reader "
                    "learns to skip")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def check_retired_name_refused(fails):
    """(p) THE RETIRED NAME IS REFUSED, AND THE REFUSAL NAMES ITS SUCCESSOR
    (2026-10-05, DEV.md 4c C38 item 2).  The costing model was registered as
    `Guthrie` while every coefficient in it was Turton's, then carried
    `Guthrie` as an announced alias for a month.  The alias is gone: one
    registered name, no dual reader.  Two halves, because each can be lost
    without the other:

      * SOURCE: `CostingModel.cpp` registers no `Guthrie` key.  An alias put
        back would make the behavioural half below pass for the wrong reason
        only if it also stayed silent, so the registration is checked where
        it lives.
      * BEHAVIOUR: a probe declaring `method Guthrie;` must not price -- no
        costing row may be printed -- and its message must come through the
        one refusal home (`unknown costing method 'Guthrie'`, with the
        registered list) AND name `Turton` as the name to write, because the
        closest-name suggestion cannot reach `Turton` from `Guthrie` and a
        refusal that lists the registry without saying which entry replaced
        the old word leaves the reader guessing."""
    src = strip_comments((ROOT / "src/postProcessing/costing/CostingModel.cpp")
                         .read_text(errors="replace"))
    if re.search(r'registerType\(\s*"Guthrie"', src):
        fails.append("(p) CostingModel.cpp registers `Guthrie` again -- the "
                     "retired name is a second home for one model (the alias "
                     "was retired 2026-10-05, DEV.md 4c C38 item 2)")
    tmp = tempfile.mkdtemp(prefix="cost_retired_")
    try:
        d = Path(tmp) / "probe"
        shutil.copytree(CASE, d)
        (d / "system" / "postDict").write_text(
            POST.replace("method  Turton;", "method  Guthrie;"))
        if "method  Guthrie;" not in (d / "system" / "postDict").read_text():
            fails.append("(p) the probe could not be built: the fixture no "
                         "longer declares `method  Turton;`")
            return
        p = subprocess.run([str(BIN), str(d)], capture_output=True, text=True,
                           cwd=str(ROOT), timeout=300)
        out = p.stdout + p.stderr
        if re.search(r"^\s+flash01\s+vessel\s+[\d.]+\s+[\d.]+\s+\d+", out, re.M):
            fails.append("(p) `method Guthrie;` PRICED the probe -- the "
                         "retired name is still accepted")
        if "unknown costing method 'Guthrie'" not in out:
            fails.append("(p) `method Guthrie;` is not refused through the "
                         "one refusal home (`unknown costing method "
                         "'Guthrie'` absent from the run's output)")
        if "Write `method Turton;`" not in out:
            fails.append("(p) the refusal of `method Guthrie;` does not name "
                         "`Turton` as the name to write")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


#  THE WORKING-CAPITAL WITNESS (2026-10-07, DEV.md 4c C44 slice 4): the one
#  corpus case that declares `workingCapital { ... }` as a model.
WCCASE = ROOT / "tutorials/plant/greenAmmoniaIndustrialN2"


def _nc(text):
    return re.sub(r'//[^\n]*', '', re.sub(r'/\*.*?\*/', '', text, flags=re.S))


def _kpi_line(out, unit):
    for line in out.splitlines():
        if line.strip().startswith('"%s": {' % unit) and '"FCI"' in line:
            return dict((k, float(v)) for k, v in re.findall(
                r'"(\w+)": *(-?[0-9][0-9.eE+-]*)', line))
    return None


def check_working_capital(fails):
    """(q) THE WORKING CAPITAL BUILT UP RECOMPUTES, GROSS AND NET (2026-10-07,
    DEV.md 4c C44 slice 4).  On greenAmmoniaIndustrialN2, which declares
    `workingCapital { rawMaterialStock; receivables; payables; minimumCash; }`
    in days, every line is RECOMPUTED here from the case's own declarations
    and the run's published streams and items -- never from the engine's
    arithmetic:

      * R and C_RM from constant/economics' prices x each stream's F_mass x
        3600 x streamFactor x 8760; the revenue KPI must be R;
      * the cost of manufacture per kg of product = COM_d / annual product
        mass; each component held valued at the price of the raw material
        that carries most of it (by mass) and any other at that cost --
        NEVER at the sales price;
      * process inventory = the held `mass.<c>` of every item that is not a
        product tank x its unit cost; product stock = the product tanks';
        raw-material stock = days/365 x the purchases of each raw material
        (no raw-material tank here);
      * receivables = days/365 x R, minimum cash = days/365 x COM_d,
        payables = days/365 x C_RM;
      * gross = the five assets, NET = gross - payables, and the run's `WC`
        IS the net, TCI = FCI + net, year 0 of the cash flow invests
        -(FCI + net), and the fraction-rule comparison is 0.15 x FCI;
      * the console says both names, GROSS (capital circulante) and NET
        (fundo de maneio).
    Probes, on copies: `workingCapital 0.15;` must give WC = 0.15 x FCI and
    publish NO build-up (the old rule untouched); a unitless `receivables 30;`
    and a missing `payables` are each refused BY NAME.

    SABOTAGES, BY HAND, 2026-10-07, in EconomicsPass.cpp, each restored with
    `cp` and the engine rebuilt; the gate then returned OK:
      S1  the cash flow given the GROSS figure (`WC = wcb.gross`)  -> FAILED:
          "economics.WC = 78499704.8517, recomputed 51240571.88", TCI and
          year 0 with it.
      S2  held material valued at the SALES price (R / product mass in place
          of COM_d / product mass)  -> FAILED: "economics.WC_productStock =
          24786513.2033, recomputed 28376722.41", and the totals.
      S3  the unit requirement on the days removed  -> FAILED: "a unitless
          `receivables 30;` is not refused BY NAME".
      S4  payables not subtracted (`net = gross`)  -> FAILED:
          "economics.WC_net = 78499704.8517, recomputed 51240571.88".
    NOT CHECKED: whether 30/30/15 days are the right policy -- the case's
    declared assumptions -- and whether valuing product at COM_d per kg (cost
    of manufacture, overheads included) is the accounting a given reader
    wants; the rule is printed, so it can be argued with.
    """
    post = _nc((WCCASE / "system" / "postDict").read_text(errors="replace"))
    m = re.search(r'\bworkingCapital\s*\{([^}]*)\}', post)
    if not m:
        fails.append("(q) %s declares no `workingCapital { ... }` model -- this "
                     "arm CANNOT RUN and must not pass." % WCCASE.name)
        return
    days = {k: float(v) for k, v in re.findall(r'\b(\w+)\s+([0-9.]+)\s*day\s*;',
                                               m.group(1))}
    sf = float(re.search(r'\bstreamFactor\s+([0-9.]+)', post).group(1))
    H = sf * 8760.0
    prices = _nc((WCCASE / "constant" / "economics").read_text(errors="replace"))

    def priced(block):
        b = re.search(r'\b%s\s*\((.*?)\n\);' % block, prices, re.S).group(1)
        return [(s, float(p)) for s, p in re.findall(
            r'stream\s+(\w+)\s*;\s*price\s+([0-9.]+)\s*;', b)]
    raws, prods = priced("rawMaterials"), priced("products")

    p = subprocess.run([str(BIN), str(WCCASE)], capture_output=True, text=True,
                       cwd=str(ROOT), timeout=600)
    out = p.stdout + p.stderr
    if p.returncode != 0:
        fails.append("(q) %s failed (rc=%d)" % (WCCASE.name, p.returncode))
        return
    e = _kpi_line(out, "economics")
    if e is None:
        fails.append("(q) the run publishes no economics KPI line")
        return

    def stream(name):
        sl = next((l for l in out.splitlines()
                   if l.strip().startswith('"%s": {' % name) and '"F_mass"' in l), "")
        fm = float(re.search(r'"F_mass": *([-0-9.eE+]+)', sl).group(1))
        comp = {k: float(v) for k, v in re.findall(
            r'"(\w+)": *([-0-9.eE+]+)', re.search(r'"composition": *\{([^}]*)\}', sl).group(1))}
        return fm, comp
    mw = {}
    for f in (WCCASE / "constant" / "components").glob("*.dat"):
        mm = re.search(r'^\s*MW\s+([0-9.eE+-]+)', _nc(f.read_text(errors="replace")), re.M)
        mw[f.stem] = float(mm.group(1))

    R = sum(pr * stream(s)[0] * 3600.0 * H for s, pr in prods)
    C_RM = sum(pr * stream(s)[0] * 3600.0 * H for s, pr in raws)
    prodMass = sum(stream(s)[0] * 3600.0 * H for s, _ in prods)
    c_prod = e["COM_d"] / prodMass
    #  the raw material carrying most of each component, by mass
    best = {}
    for s, pr in raws:
        fm, comp = stream(s)
        mbar = sum(z * mw[c] for c, z in comp.items())
        for c, z in comp.items():
            kg = fm * z * mw[c] / mbar
            if kg > best.get(c, (0.0, 0.0))[0]:
                best[c] = (kg, pr)
    cost = lambda c: best[c][1] if c in best else c_prod

    tank_stream = re.search(r'\bstorage\s*\(\s*\{[^}]*\bstream\s+(\w+)', post).group(1)
    prod_streams = {s for s, _ in prods}
    proc, prodstock = 0.0, 0.0
    for line in out.splitlines():
        if '"inventory": {' not in line:
            continue
        item = re.search(r'"item": "([^"]+)"', line).group(1)
        inv = dict((k, float(v)) for k, v in re.findall(
            r'"mass\.(\w+)": *(-?[0-9][0-9.eE+-]*)',
            re.search(r'"inventory": \{([^}]*)\}', line).group(1)))
        v = sum(kg * cost(c) for c, kg in inv.items() if c != "total")
        if item.startswith(re.search(r'\bstorage\s*\(\s*\{[^}]*\bname\s+(\w+)',
                                     post).group(1) + "/") and tank_stream in prod_streams:
            prodstock += v
        else:
            proc += v
    want = {
        "WC_rawMaterialStock": days["rawMaterialStock"] / 365.0 * C_RM,
        "WC_processInventory": proc,
        "WC_productStock": prodstock,
        "WC_receivables": days["receivables"] / 365.0 * R,
        "WC_minimumCash": days["minimumCash"] / 365.0 * e["COM_d"],
        "WC_payables": days["payables"] / 365.0 * C_RM,
        "productionCostPerKg": c_prod,
        "revenue": R,
    }
    want["WC_gross"] = (want["WC_rawMaterialStock"] + proc + prodstock
                        + want["WC_receivables"] + want["WC_minimumCash"])
    want["WC_net"] = want["WC_gross"] - want["WC_payables"]
    want["WC"] = want["WC_net"]
    want["TCI"] = e["FCI"] + want["WC_net"]
    want["WC_fractionRule"] = 0.15 * e["FCI"]
    for k, w in want.items():
        g = e.get(k)
        if g is None or abs(g - w) > 1e-6 * max(abs(w), 1.0):
            fails.append("(q) economics.%s = %s, recomputed %.6f from the case's "
                         "declarations and the run's streams and items" % (k, g, w))
    y0 = re.search(r'\{ "year": 0, "investment": (-?[0-9.eE+-]+)', out)
    if not y0 or abs(float(y0.group(1)) + e["FCI"] + want["WC_net"]) > \
            1e-6 * (e["FCI"] + want["WC_net"]):
        fails.append("(q) year 0 of the cash flow does not invest -(FCI + NET "
                     "working capital)")
    for phrase in ("GROSS working capital (capital circulante)",
                   "NET working capital (fundo de maneio)",
                   "the fraction rule this replaces"):
        if phrase not in out:
            fails.append("(q) the console does not say `%s`" % phrase)

    #  ---- probes on copies -----------------------------------------------
    def probe(edit):
        tmp = tempfile.mkdtemp(prefix="cost_wc_")
        d = Path(tmp) / WCCASE.name
        shutil.copytree(WCCASE, d, ignore=shutil.ignore_patterns(
            "design", "reports", "converged", "postProcessing"))
        pd = d / "system" / "postDict"
        pd.write_text(edit(pd.read_text(errors="replace")))
        q = subprocess.run([str(BIN), str(d)], capture_output=True, text=True,
                           cwd=str(ROOT), timeout=600)
        shutil.rmtree(tmp, ignore_errors=True)
        return q.returncode, q.stdout + q.stderr
    blk = re.compile(r'workingCapital\s*\{[^}]*\}', re.S)
    rc, o = probe(lambda t: blk.sub("workingCapital 0.15;", t, count=1))
    ef = _kpi_line(o, "economics")
    if rc != 0 or ef is None or abs(ef["WC"] - 0.15 * ef["FCI"]) > 1e-6 * ef["FCI"] \
            or "WC_gross" in ef:
        fails.append("(q) with `workingCapital 0.15;` the run must keep WC = "
                     "0.15 x FCI and publish no build-up (rc=%d)" % rc)
    rc, o = probe(lambda t: re.sub(r'receivables\s+30\s+day;', 'receivables 30;', t, count=1))
    if rc == 0 or not re.search(r'receivables[^\n]*carries no unit', o):
        fails.append("(q) a unitless `receivables 30;` is not refused BY NAME")
    rc, o = probe(lambda t: re.sub(r'payables\s+30\s+day;', '', t, count=1))
    if rc == 0 or "payables <n> day;" not in o:
        fails.append("(q) a missing `payables` is not refused BY NAME")


def main():
    if not BIN.exists():
        print("check_cost_provenance: FAIL -- choupoSolve missing; run `make all`")
        return 1

    tmp = tempfile.mkdtemp(prefix="cost_prov_")
    try:
        d = Path(tmp) / "probe"
        shutil.copytree(CASE, d)
        (d / "system" / "postDict").write_text(POST)
        #  Ask for the ARTEFACTS too.  The console block and the CSV are the
        #  same claim on two surfaces, and the CSV is the one that goes into
        #  the report -- solving it on screen only would be half the fix.
        #  `boom` is a report that cannot run (no sizing of its own kind);
        #  it is here to prove the chain survives one failing member.
        add_reports(d, ["design", "economics"])
        p = subprocess.run([str(BIN), str(d)], capture_output=True, text=True,
                           cwd=str(ROOT), timeout=300)
        out = p.stdout + p.stderr

        # ---- the printed costing row (F_M, F_P, three costs)
        row = re.search(r"^\s+flash01\s+vessel\s+([\d.]+)\s+([\d.]+)\s+"
                        r"(\d+)\s+(\d+)\s+(\d+)\s*$", out, re.M)
        if not row:
            print("check_cost_provenance: FAIL -- the probe printed no costing "
                  "row; nothing below can be checked\n" + out[-2500:])
            return 1
        F_M, F_P = float(row.group(1)), float(row.group(2))
        Cp_p, CBM_p, CTM_p = (float(row.group(i)) for i in (3, 4, 5))

        # ---- the provenance block, read as a reader would
        idx = re.search(r"index: CEPCI\s+([\d.]+)\s*/\s*([\d.]+)\s*=\s*([\d.]+)"
                        r"\s+currency:\s+([\d.]+)\s+EUR/USD", out)
        prov = re.search(r"^\s+flash01\s+log-quadratic\s+V_R = ([\d.]+)\s+"
                         r"([\d.]+),\s*([\d.]+),\s*([\d.]+)\s+"
                         r"([\d.]+),\s*([\d.]+)\s+([\d.]+)\s+\((\w+)\)",
                         out, re.M)
        if not idx or not prov:
            fails.append("(a) the provenance block is absent or unreadable -- "
                         "the table cannot be defended from itself")
        else:
            cepci, cepci2001 = float(idx.group(1)), float(idx.group(2))
            fx = float(idx.group(4))
            S = float(prov.group(1))
            K1, K2, K3 = (float(prov.group(i)) for i in (2, 3, 4))
            B1, B2 = float(prov.group(5)), float(prov.group(6))
            fm_block = float(prov.group(7))

            l = math.log10(S)
            Cp = 10 ** (K1 + K2 * l + K3 * l * l) * (cepci / cepci2001) * fx
            CBM = Cp * (B1 + B2 * fm_block * F_P)
            CTM = 1.18 * CBM

            for label, got, want in (("C_purchased", Cp, Cp_p),
                                     ("C_bare_mod", CBM, CBM_p),
                                     ("C_total_mod", CTM, CTM_p)):
                if want == 0 or abs(got - want) / want > 1e-3:
                    fails.append(
                        f"(a) {label} recomputed from the PRINTED numbers is "
                        f"{got:.1f} against the printed {want:.0f} "
                        f"({100*(got-want)/max(want,1):+.2f} %).  Either the "
                        "block omits a factor or it prints too few digits to "
                        "reproduce -- both leave a reader who does the "
                        "arithmetic believing they made the error")
            if abs(fm_block - F_M) > 1e-9:
                fails.append(f"(a) F_M differs between the two tables: "
                             f"{F_M} in the costing row, {fm_block} in the "
                             "provenance block -- one fact, two printings")

        # ---- (b) the size's rule
        if not re.search(r"basis:\s*drum V = Q\*tau", out):
            fails.append("(b) the sizing table does not name the rule that "
                         "produced the volume; V_R is reported, not defended")

        # ---- (c) the ideal-gas flow, announced and reproducing V_R
        q = re.search(r"IDEAL GAS,\s*([\d.eE+-]+)\s*m3/s", out)
        if not q:
            fails.append("(c) the ideal-gas volumetric flow is not announced; "
                         "N R T / P is used whatever thermo the case declares, "
                         "and only a source comment said so")
        elif prov:
            Q = float(q.group(1))
            V = float(prov.group(1))
            if V == 0 or abs(Q * TAU - V) / V > 2e-4:
                fails.append(f"(c) the printed Q ({Q}) times the declared tau "
                             f"({TAU}) gives {Q*TAU:.4f}, not the printed "
                             f"V_R {V} -- the announcement does not describe "
                             "the number it sits beside")

        # ---- (d) attribution
        if "Turton" not in out or "Appendix A" not in out:
            fails.append("(d) the coefficient block names no source; a formula "
                         "with anonymous constants is not checkable")

        # ---- (e) F_M is NOT cited here (its record is its one home)
        blk = re.search(r"K1-K3, B1, B2 and the 1\.18:(.*?)\n\n", out, re.S)
        if blk and re.search(r"F_M[^\n]*(Turton|Appendix|doi|ISBN)", blk.group(1)):
            fails.append("(e) F_M has acquired a citation in the costing "
                         "block; it is a per-material datum and its record is "
                         "its one home -- a second is the arity sin")

        # ---- (f) the design CSV carries the design ARGUMENT
        dcsv = d / "reports" / "design" / "sizing.csv"
        if not dcsv.exists():
            fails.append("(f) the design report wrote no sizing.csv -- the "
                         "student has a screen table and nothing to put in a "
                         "report")
        else:
            rows = list(csv.DictReader(dcsv.open()))
            if not rows or "basis" not in rows[0]:
                fails.append("(f) sizing.csv has no `basis` column; the volume "
                             "is in the file and the rule that produced it is "
                             "not, so the file cannot be defended")
            elif not rows[0]["basis"] or rows[0]["basis"] == "(not stated)":
                fails.append("(f) sizing.csv's basis column is empty")

        # ---- (g) the economics CSV REPRODUCES ITS OWN TOTAL
        ecsv = d / "reports" / "economics" / "costs.csv"
        if not ecsv.exists():
            fails.append("(g) the economics report wrote no costs.csv")
        else:
            rows = [r for r in csv.DictReader(ecsv.open())
                    if r["unit"] != "TOTAL"]
            if not rows:
                fails.append("(g) costs.csv has no equipment rows")
            else:
                r = rows[0]
                missing = [k for k in ("S", "K1_or_CpRef", "K2_or_SRef",
                                       "K3_or_n", "B1", "B2", "F_M", "F_P",
                                       "cepci", "cepci2001", "usdToEur")
                           if k not in r]
                if missing:
                    fails.append("(g) costs.csv omits " + ", ".join(missing)
                                 + " -- the file states a total nobody can "
                                   "reproduce from it")
                else:
                    try:
                        S = float(r["S"])
                        l = math.log10(S)
                        cp = (10 ** (float(r["K1_or_CpRef"])
                                     + float(r["K2_or_SRef"]) * l
                                     + float(r["K3_or_n"]) * l * l)
                              * float(r["cepci"]) / float(r["cepci2001"])
                              * float(r["usdToEur"]))
                        ctm = 1.18 * cp * (float(r["B1"])
                                           + float(r["B2"]) * float(r["F_M"])
                                           * float(r["F_P"]))
                        want = float(r["totalModule_EUR"])
                        if want == 0 or abs(ctm - want) / want > 1e-3:
                            fails.append(
                                f"(g) costs.csv does not reproduce its own "
                                f"total: {ctm:.2f} recomputed from its columns "
                                f"against {want:.2f} stated "
                                f"({100*(ctm-want)/max(want,1):+.2f} %)")
                    except (ValueError, KeyError) as e:
                        fails.append(f"(g) costs.csv columns are unreadable: {e}")

        # ---- (j) THE HEADER STATES THE INDEX THAT PRICED
        #  Three surfaces, one fact: the banner, the provenance line's
        #  `index: CEPCI x / y`, and costs.csv's own `cepci` column.  The
        #  probe declares 861, which is NOT the engine's built-in default, so
        #  a header carrying a hard-coded index is caught here rather than
        #  agreeing by coincidence.
        ban = re.search(r"Method:\s+(\S+)\s+Year:\s+([\d.]+)\s+CEPCI:\s+([\d.]+)",
                        out)
        if not ban:
            fails.append("(j) the costing header states no price index at "
                         "all; the total below it cannot be dated")
        else:
            ban_cepci = float(ban.group(3))
            if abs(ban_cepci - CEPCI_PROBE) > 1e-9:
                fails.append(
                    f"(j) the header states CEPCI {ban_cepci} where the case "
                    f"declares {CEPCI_PROBE}.  A header is what a student "
                    "defends the total with, and this one names an index the "
                    "case did not choose")
            if idx and abs(ban_cepci - float(idx.group(1))) > 1e-9:
                fails.append(
                    f"(j) the header states CEPCI {ban_cepci} and the "
                    f"provenance line says the costs were priced at "
                    f"{idx.group(1)}.  One index, two printings, and the "
                    "reader has no way to know which one bought the number")

        # ---- (l) A DEFAULT THAT IS USED IS ANNOUNCED, AND ON EVERY SURFACE
        #  The probe declares neither `year`, `cepci2001`, `usdToEur` nor
        #  `jointEfficiency`.  Each must be announced at its site, replayed in
        #  the end-of-run caveat block, and present in the result JSON -- the
        #  CatalystPellet posture: a warning at its own site only has been
        #  delivered and not received.
        assumed_lines = re.findall(r"^\s+\[assumed\] ([^\n]+)$", out, re.M)
        caveats = out[out.find("ASSUMPTIONS AND CAVEATS"):] \
            if "ASSUMPTIONS AND CAVEATS" in out else ""
        jsonblk = re.search(r"<<<Choupo:result-begin>>>(.*?)"
                            r"<<<Choupo:result-end>>>", out, re.S)
        jtxt = jsonblk.group(1) if jsonblk else ""
        for key, where in (("year", "costing"), ("cepci2001", "costing"),
                           ("usdToEur", "costing"),
                           ("jointEfficiency", "vessel 'flash01'")):
            at_site = [l for l in assumed_lines
                       if l.startswith(where + ":") and key in l]
            if not at_site:
                fails.append(
                    f"(l) `{key}` was NOT declared by the probe and the run "
                    f"said nothing: the number below was computed with a "
                    f"value nobody chose, and the output is identical to one "
                    f"where somebody did")
                continue
            if not re.search(r"built-in default\s+[-\d.eE+]+", at_site[0]):
                fails.append(
                    f"(l) the `{key}` announcement does not state the VALUE "
                    "that was used.  A reader told only that something was "
                    "assumed cannot check it")
            if key not in caveats:
                fails.append(
                    f"(l) `{key}`'s announcement never reaches the end-of-run "
                    "ASSUMPTIONS AND CAVEATS block -- delivered at its site "
                    "and not received")
            if key not in jtxt or '"category": "assumed"' not in jtxt:
                fails.append(
                    f"(l) `{key}`'s announcement is absent from the result "
                    "JSON, so a reader who never opens the log never meets it")

        # ---- (m) A DECLARED VALUE ANNOUNCES NOTHING -- the negative
        #  Silence has to keep meaning "nothing was assumed".  The probe
        #  DECLARES `L_over_D`, `corrosionAllow` and `cepci`; if any of them
        #  is announced anyway, the block becomes noise and the reader learns
        #  to skip it, which is the summary block's own failure mode.
        #  MATCHED ON A WORD BOUNDARY.  A plain `in` test for `cepci` also
        #  matches `cepci2001` -- which the probe deliberately does NOT
        #  declare -- so the first draft of this arm accused the engine of
        #  announcing a declared key.  A pattern that matches something other
        #  than its subject is a check that fires on the wrong evidence.
        for key in ("L_over_D", "corrosionAllow", "cepci"):
            if any(re.search(r"\b%s\b" % key, l) for l in assumed_lines):
                fails.append(
                    f"(m) `{key}` is DECLARED by the probe and is "
                    "announced as an engine default anyway.  An announcement "
                    "that fires on a declared value makes silence meaningless")

        # ---- (n) THE SHEET SAYS WHICH
        #  The specification sheet is the page somebody AUDITS the project
        #  from, and it could not tell a declared input from an assumed one:
        #  `L_over_D 3.0;` read identically either way.  The list must be
        #  EXACTLY what the console announced for that unit -- a sheet that
        #  under-reports is worse than one that says nothing, because a reader
        #  takes its silence for a declaration.
        sheet = d / "design" / "flash01" / "vessel"
        if not sheet.is_file():
            fails.append("(n) the probe wrote no specification sheet, so the "
                         "assumed-input list cannot be checked")
        else:
            stext = sheet.read_text(errors="replace")
            m = re.search(r"^assumed\s*\(([^)]*)\)\s*;", stext, re.M)
            got = set(m.group(1).split()) if m else set()
            want = {"jointEfficiency"}
            if got != want:
                fails.append(
                    f"(n) the sheet's `assumed (...)` list is {sorted(got)} "
                    f"where the run assumed {sorted(want)}.  A reader audits "
                    "from this page: an input the engine supplied and the "
                    "page does not name reads as one the author declared")

        # ---- (h) a failing report does not silence the ones after it
        boom = Path(tmp) / "boom"
        shutil.copytree(CASE, boom)
        #  `economics` with NO postDict at all: it must refuse (there is
        #  nothing to serialise) and `streamTable`, which the base case
        #  already declares, must still produce its artefact.
        #  Only `economics` is ADDED.  The base case already declares
        #  `streamTable`, and declaring it twice in one block is refused
        #  outright by the dict layer -- so the survivor arm uses the report
        #  that is already there rather than tripping a guard doing its job.
        (boom / "system" / "postDict").unlink(missing_ok=True)
        add_reports(boom, ["economics"])
        bout = subprocess.run([str(BIN), str(boom)], capture_output=True,
                              text=True, cwd=str(ROOT), timeout=300)
        btxt = bout.stdout + bout.stderr
        if "economics FAILED" not in btxt:
            fails.append("(h) a report that cannot run did not report itself "
                         "as failing")
        if not (boom / "reports" / "streams" / "streamTable.csv").exists():
            fails.append("(h) a report declared AFTER a failing one produced "
                         "no artefact -- one failure silences the rest, and "
                         "'never reached' reads as 'produced nothing'")
        if "report(s) failed and produced NO artefact" not in btxt:
            fails.append("(h) the run does not state how many reports failed; "
                         "a reader who scrolled past the red line never learns "
                         "something is missing")

    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    check_price_index_arity(fails)
    check_policy_is_named(fails)
    check_retired_name_refused(fails)
    check_working_capital(fails)

    if fails:
        print("check_cost_provenance: FAIL")
        for f in fails:
            print("  - " + f)
        return 1

    print("check_cost_provenance: OK -- the WORKING CAPITAL built up on "
          "greenAmmoniaIndustrialN2 RECOMPUTES line by line (stocks valued at "
          "COST, receivables, cash, payables; GROSS = capital circulante, NET = "
          "fundo de maneio = the cash flow's WC), the fraction form is "
          "untouched and malformed day counts are refused by name; "
          "the costing total RECOMPUTES to 0.1 % "
          "from the printed coefficients, indices and factors alone (nothing "
          "read from source or JSON), the two tables agree on F_M, the size "
          "names the rule that produced it, the ideal-gas volumetric flow is "
          "announced and reproduces V_R at the declared tau, and the "
          "coefficients are attributed to Turton App. A while F_M is "
          "deliberately left to its own record.  THE ARTEFACTS CARRY THE SAME "
          "CLAIM: sizing.csv has the design ARGUMENT in a column, costs.csv "
          "reproduces its own stated total from its own columns, and the "
          "report chain survives a failing member with the count stated -- so "
          "a reader who never sees the console can still defend the numbers.  "
          "NOT COVERED: whether any coefficient is RIGHT (no copy of that book "
          "is in this repository), the power-law items (crystalliser / spray "
          "dryer / cyclone), whether the size is a GOOD design, and any GOLDEN "
          "pinning -- `basis` is a word, no golden row reads it, and this gate "
          "is all that stands behind it.  AND, since 2026-09-06: WHAT THE "
          "READER DECLARED IS TOLD APART FROM WHAT THE ENGINE ASSUMED -- the "
          "header states the index that actually priced (probe declares a "
          "NON-default CEPCI, so a hard-coded header cannot agree by "
          "coincidence), the pass re-derives no price index of its own and "
          "each of the four price constants has one home outside comments (a "
          "SOURCE arm: no output can separate a re-read from a draw when both "
          "find the same number), every default that was USED is announced at "
          "its site with its value AND in the caveat block AND in the result "
          "JSON, every value the case DECLARED is announced nowhere, the "
          "specification sheet's `assumed ( ... )` list is exactly what was "
          "assumed, and `refuseOnMissingPrice` says whose decision it is.  "
          "NOT COVERED THERE: whether any default's VALUE is right -- L/D is "
          "2.5 in StirredTank and 3.0 in VesselSize for the same key, "
          "recorded and deliberately NOT reconciled (reserved for Vitor) -- "
          "and the 19 other silent defaults named in the design record.  "
          "AND, since 2026-10-05: the model's ONE registered name is "
          "`Turton`, and `method Guthrie;` is REFUSED through the one "
          "refusal home, naming `Turton` (source + behaviour).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
