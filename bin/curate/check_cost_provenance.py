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
      DEV.md 4c C44 slice 4).  On greenAmmoniaPEQ_baseCase every line of
      `workingCapital { ... }` -- raw-material stock, process inventory,
      product stock (valued at COST), receivables, minimum cash, payables --
      is recomputed from the case's declarations and the run's published
      streams and held inventories; the net is the cash flow's WC; the
      fraction form keeps WC = 0.15 x FCI with no build-up; a unitless or a
      missing day count is refused BY NAME.  See `check_working_capital`.

  (r) THE START-UP YEARS RECOMPUTE, ROW BY ROW (2026-10-11, DEV.md 4c
      C63).  On economics03_startup_years the construction schedule, the
      ramp-up and the start-up cost are recomputed from the declarations and
      the published KPIs: every cashFlow.csv row, the NPV, the IRR and the
      discounted payback; a missing or mis-summed schedule refuses by name;
      the one-year form writes the old shape.  See `check_startup_years`.

  (s) THE LAND IS A COST THE READER CAN DEFEND (2026-10-17, DEV.md 4c
      C82).  On ammonia02_full_plant the printed line `Land = P EUR/m2 x A
      m2 = C EUR` recomputes (P x A = C, to the printed digits), A is the
      plot area the layout PUBLISHED in the same run, the price's declared
      `source` is printed beside it, cashFlow.csv's footer carries the same
      C, and TCI stays FCI + WC (the land is a separate line, not in the
      ladder).  See `check_land`.

  (t) THE PARTICULATE LABOUR TERM (2026-10-19, DEV.md 4c C98).  Turton's
      operator count N_OL = (6.29 + 31.7 P^2 + 0.23 N_np)^0.5 lost its P
      term in the engine.  A fluid plant prints P = 0 and announces nothing;
      a declared `particulateSteps { count; source; reason; }` recomputes
      N_OL and C_OL from the printed line; a missing reason, a fractional
      count and a flat scalar are refused; the solid-dose witness without
      its declaration announces the undeclared zero at its site, in the
      caveat block and in the JSON, naming its particulate units.  See
      `check_particulate_labour`.

  (u) A DECLARED QUOTE IS A COST THE READER CAN DEFEND (2026-10-19, DEV.md
      4c C98).  Each quote's costing row recomputes from its provenance row;
      the FCI recomputes from the equipment JSON (a `kind facility` quote
      adds nothing to the siteFactor base); costs.csv reproduces each quote
      from its own columns; escalation and currency recompute on a probe;
      eleven malformed declarations are refused by name.  See
      `check_declared_quotes`.

  (v) A DECLARED CREW PRICES THE LABOUR (2026-10-19, DEV.md 4c C98 round
      2).  On the solid-dose witness the crew's areas, positions and C_OL
      recompute from the printed line and match the published KPIs; the
      Turton comparison recomputes and enters no total (COM_d recomputes
      from the declared C_OL); a fluid plant with no crew publishes the
      correlation's count and no comparison; seven malformed crews are
      refused by name; a crew beside an undeclared P says so and does not
      announce it; the 4.5 positions factor has one home.  See
      `check_operating_crew`.

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

SABOTAGE-VERIFIED 2026-10-19 (DEV.md 4c C98), twelve times, BY HAND under
the destructive-session journal, for arms (t) and (u).  Every line OBSERVED:

S18 -- the P term dropped from N_OL (`0.0 * P^2`).  Arm (t2), twice: the
printed N_OL 2.64 against 11.5663 recomputed, and C_OL 815576 against
3570526.
S19 -- the undeclared-zero announcement silenced.  Arm (t4), three times:
site, caveat block, JSON.
S20 -- the announcement made to fire on every plant.  Arm (t1), the
negative: a fluid plant announced it.
S21 -- a facility quote put into the auxiliary base.  Arms (u1) (a facility
carries a non-zero C_BM_base) and (u2) (the FCI moved by 901739 - 395275
where the quotes predict 876739 - 395275).
S22 -- a quote's C_TM without the 1.18.  Arm (u1) on all eight witness
quotes, and (u2).
S23 -- the source/reason refusal removed.  It SURVIVED its first run: the
arm accepted any refusal whose text held the words `quotes` and `source`,
and the parser's own generic missing-key error holds both.  The arm now
requires the refusal's own remedy ("owes its reader"), and catches it twice.
S24 -- the escalation ignored.  Arm (u2): the USD 2020 quote priced 92000
where 125733 is expected, and the FCI with it.
S25 -- costs.csv's K2 slot written from `cepci2001`.  Arm (u1), all eight
rows "do not reproduce from their own columns".
S26 -- EconomicsPass ignoring `C_BM_base`.  Arms (u1) (FCI 28555352 against
23055352 recomputed from the JSON) and (u2).
S27 -- the particulateSteps reason refusal removed.  Arm (t3) -- tightened
the same way as S23 BEFORE it was run, on the S23 lesson.
S28 -- the other-year cepci refusal removed.  Arm (u3) nocepci, likewise.

ROUND 2 (C98, the declared crew), seven more, same protocol, none survived:

S29 -- the crew ignored, the correlation prices the labour.  Arm (v1) three
times: the crew line no longer adds up (152.5 positions for 11/shift), C_OL
12554801 against the crew's 4074840, the published count not the crew's.
S30 -- the comparison added INTO the total (crew + N_OL).  Arm (v1) three
times (202 positions, C_OL 16629641).
S31 -- the duplicate-area refusal removed.  Arm (v3) dup, rc 0.
S32 -- the undeclared-P announcement no longer suppressed beside a crew.
Arm (v4).
S33 -- a second literal 4.5 for the comparison's positions.  Arm (v5) only:
no output changes, because the two literals agree -- a SOURCE arm is the
only one that can see a second home that is never wrong yet.
S34 -- the published `operatorsPerShift` written from the correlation.  Arm
(v1).
S35 -- the whole-operator refusal turned into `&&`.  Arm (v3) twice: the
fractional AND the zero crew both ran to exit 0.

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
WCCASE = ROOT / "tutorials/plant/greenAmmoniaPEQ_baseCase"


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
    DEV.md 4c C44 slice 4).  On greenAmmoniaPEQ_baseCase, which declares
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
        raw-material stock = what a store attached to a raw-material stream
        holds (the H2 buffer, `gasStorage`, since DEV.md 4c C89) + days/365
        x the purchases of each raw material with no store;
      * receivables = days/365 x R, minimum cash = days/365 x COM_d,
        payables = days/365 x C_RM;
      * gross = the five assets, NET = gross - payables, and the run's `WC`
        IS the net, TCI = FCI + net, year 0 of the cash flow invests
        -(FCI + net), and the fraction-rule comparison is 0.15 x FCI;
      * the console says both names, GROSS (capital circulante) and NET
        (fundo de maneio).
    The same arm holds the GROSS MARGIN (DEV.md 4c C57, 2026-10-10): the
    published `C_RM` must be the recomputed raw-material bill,
    `grossMargin_RM` = R - C_RM and `grossMargin_RM_UT` = R - C_RM - C_UT,
    and the console must print the second line.  SABOTAGE, BY HAND,
    2026-10-10: `grossMargin_RM_UT = R - C_RM` (C_UT dropped) -> FAILED:
    "economics.grossMargin_RM_UT = 56079471.7729, recomputed
    51005207.751824"; restored with `cp`, rebuilt, OK.
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

    #  EVERY STORE ATTACHED TO A STREAM -- a `storage` tank or, since DEV.md
    #  4c C89, a `gasStorage` buffer -- is that stream's stock: a product's
    #  in the product stock, a raw material's in the raw-material stock (and
    #  that raw material then carries no days of purchases).
    store_stream = {}
    for lst in ("storage", "gasStorage"):
        for blk in re.findall(r'\b%s\s*\(\s*(.*?)\n\s*\);' % lst, post, re.S):
            for body in re.findall(r'\{([^}]*)\}', blk):
                nm = re.search(r'\bname\s+(\w+)', body)
                st = re.search(r'\bstream\s+(\w+)', body)
                if nm and st:
                    store_stream[nm.group(1)] = st.group(1)
    prod_streams = {s for s, _ in prods}
    raw_streams = {s for s, _ in raws}
    proc, prodstock, rawstock, raw_with_store = 0.0, 0.0, 0.0, set()
    for line in out.splitlines():
        if '"inventory": {' not in line:
            continue
        item = re.search(r'"item": "([^"]+)"', line).group(1)
        inv = dict((k, float(v)) for k, v in re.findall(
            r'"mass\.(\w+)": *(-?[0-9][0-9.eE+-]*)',
            re.search(r'"inventory": \{([^}]*)\}', line).group(1)))
        v = sum(kg * cost(c) for c, kg in inv.items() if c != "total")
        st = store_stream.get(item.split("/", 1)[0]) if "/" in item else None
        if st in prod_streams:
            prodstock += v
        elif st in raw_streams:
            rawstock += v
            raw_with_store.add(st)
        else:
            proc += v
    C_RM_nostore = sum(pr * stream(s)[0] * 3600.0 * H for s, pr in raws
                       if s not in raw_with_store)
    want = {
        "WC_rawMaterialStock": rawstock
                               + days["rawMaterialStock"] / 365.0 * C_RM_nostore,
        "WC_processInventory": proc,
        "WC_productStock": prodstock,
        "WC_receivables": days["receivables"] / 365.0 * R,
        "WC_minimumCash": days["minimumCash"] / 365.0 * e["COM_d"],
        "WC_payables": days["payables"] / 365.0 * C_RM,
        "productionCostPerKg": c_prod,
        "revenue": R,
        #  THE GROSS MARGIN (DEV.md 4c C57): the raw-material bill and the
        #  two margins a feasibility study is decided on, from the SAME
        #  recomputed R and C_RM; C_UT is the run's own (check_unit_duty_
        #  allocation holds it to the allocation rows).
        "C_RM": C_RM,
        "grossMargin_RM": R - C_RM,
        "grossMargin_RM_UT": R - C_RM - e.get("C_UT", float("nan")),
    }
    if not raw_with_store and "gasStorage" in post:
        fails.append("(q) the case declares a `gasStorage` buffer and no item "
                     "of it holds a priced raw material -- the raw-material "
                     "stock half of this arm went unexercised")
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
    for phrase in ("R - C_RM - C_UT",
                   "GROSS working capital (capital circulante)",
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


SUCASE = ROOT / "tutorials/steady/economics/economics03_startup_years"


def check_startup_years(fails):
    """(r) THE START-UP YEARS RECOMPUTE, ROW BY ROW (2026-10-11, DEV.md 4c
    C63).  On economics03_startup_years, which declares `constructionPeriod`,
    `capitalSchedule`, `rampUp` and `startupCostFraction`, the whole timeline
    is RECOMPUTED here from the postDict's own declarations and the run's
    published KPIs (FCI, WC, revenue, COM_d, C_RM, C_UT) -- never from the
    engine's arithmetic:

      * construction year k of N spends f_k FCI at t = k - N; t = 0 also
        invests the WC; every year is discounted by 1/(1+i)^t;
      * operating year t at production fraction p_t (1 after the list):
        R_t = p_t R, COM_d,t = COM_d - 1.23 (1 - p_t)(C_RM + C_UT) -- only
        the variable group scales; the start-up cost s FCI is deducted in
        year 1; d = FCI / depreciableLife while t <= depreciableLife;
        CF_t = (R_t - COM_d,t - S_t - d_t)(1 - tau) + d_t; + WC at t = N;
      * every row of reports/economics/cashFlow.csv (rounded to whole
        currency units) is that row, the NPV is the sum, the IRR zeroes it,
        and the discounted payback is where the cumulative turns positive;
      * the console names the NPV at the START of construction and announces
        that the WC does not follow the ramp-up.
    Probes, on copies: N = 3 with no schedule REFUSES naming
    `capitalSchedule`; a schedule summing to 0.9 REFUSES printing the sum;
    with the four keys removed and `constructionPeriod 1;` the CSV has NO
    `productionFraction` column, the JSON no `timeline` object, and the NPV
    is the one-year closed form (-FCI - WC at t = 0, full production).
    SABOTAGES, BY HAND, 2026-10-11, in EconomicsPass.cpp under
    `destructive_session`'s journal, each restored byte for byte and the
    engine rebuilt; the gate then returned OK:
      S1  the ramp-up scales the FIXED group too (COM_d,t = p COM_d)
          -> FAILED: "economics.NPV = 83242548.4524, recomputed
          78315195.448214", the IRR, the payback, rows 1 and 2.
      S2  the start-up cost taken after tax instead of deducted
          -> FAILED: NPV 77259998.8132, row 1 "4161972, recomputed
          5322688.05".
      S3  the WC invested at the FIRST construction year
          -> FAILED: NPV 76574121.0009, rows -2 and 0.
      S4  the schedule's sum check removed
          -> FAILED: "a capitalSchedule summing to 0.9 is not refused naming
          its sum (rc=0)" -- and ONLY that, which is why the probe exists.
    The first run of the two refusal probes FAILED on a correct engine: they
    edited the postDict's header COMMENT, which quotes the same keys, so the
    case ran unchanged and was "not refused"; a probe now edits only the
    `economics {}` block.
    NOT CHECKED: whether the conventions are right (WC not ramped, start-up
    expensed in year 1 -- stated defaults, put to Vitor); a schedule's
    REALISM.
    """
    if not SUCASE.exists():
        fails.append("(r) %s is missing -- this arm CANNOT RUN and must not "
                     "pass." % SUCASE.name)
        return
    post = _nc((SUCASE / "system" / "postDict").read_text(errors="replace"))
    econ = re.search(r'\beconomics\s*\{(.*?)\n\}', post, re.S)
    if not econ:
        fails.append("(r) %s declares no economics block" % SUCASE.name)
        return
    eb = econ.group(1)

    def num(key):
        m = re.search(r'\b%s\s+([-0-9.eE+]+)\s*;' % key, eb)
        return float(m.group(1)) if m else None

    def lst(key):
        m = re.search(r'\b%s\s*\(([^)]*)\)' % key, eb)
        return [float(x) for x in m.group(1).split()] if m else None
    N = int(num("constructionPeriod"))
    sched, ramp = lst("capitalSchedule"), lst("rampUp")
    s_frac = num("startupCostFraction")
    life, i, tau = int(num("projectLife")), num("discountRate"), num("taxRate")
    dlife = int(num("depreciableLife"))
    if not (N > 1 and sched and ramp and s_frac):
        fails.append("(r) %s must declare all four start-up keys with N > 1 "
                     "-- otherwise this arm tests nothing" % SUCASE.name)
        return

    def run_copy(edit=None):
        tmp = tempfile.mkdtemp(prefix="cost_su_")
        d = Path(tmp) / SUCASE.name
        shutil.copytree(SUCASE, d, ignore=shutil.ignore_patterns(
            "design", "reports", "converged", "postProcessing", "iterations"))
        if edit:
            #  The edit reaches ONLY the `economics {}` block: the file's
            #  header quotes the same keys in a comment, and a probe that
            #  edits the comment proves nothing (it did, on its first run).
            pd = d / "system" / "postDict"
            txt = pd.read_text(errors="replace")
            m = re.search(r'\neconomics\s*\{', txt)
            pd.write_text(txt[:m.start()] + edit(txt[m.start():]))
        q = subprocess.run([str(BIN), str(d)], capture_output=True, text=True,
                           cwd=str(ROOT), timeout=600)
        csvp = d / "reports" / "economics" / "cashFlow.csv"
        csvt = csvp.read_text() if csvp.exists() else ""
        shutil.rmtree(tmp, ignore_errors=True)
        return q.returncode, q.stdout + q.stderr, csvt

    rc, out, csvt = run_copy()
    if rc != 0:
        fails.append("(r) %s failed (rc=%d)" % (SUCASE.name, rc))
        return
    e = _kpi_line(out, "economics")
    if e is None or not csvt:
        fails.append("(r) the run publishes no economics KPI line or no "
                     "cashFlow.csv")
        return
    FCI, WC, R, COM = e["FCI"], e["WC"], e["revenue"], e["COM_d"]
    V = e["C_RM"] + e["C_UT"]
    d_ann = FCI / dlife
    S = s_frac * FCI
    want = {}
    for k in range(1, N + 1):
        want[k - N] = -sched[k - 1] * FCI
    want[0] -= WC
    for t in range(1, life + 1):
        p = ramp[t - 1] if t <= len(ramp) else 1.0
        com = COM - 1.23 * (1.0 - p) * V
        d_t = d_ann if t <= dlife else 0.0
        st = S if t == 1 else 0.0
        want[t] = (p * R - com - st - d_t) * (1.0 - tau) + d_t
    want[life] += WC
    npv = sum(cf / (1.0 + i) ** t for t, cf in want.items())
    if abs(npv - e["NPV"]) > 1e-8 * max(abs(npv), 1.0):
        fails.append("(r) economics.NPV = %.6f, recomputed %.6f from the "
                     "declared timeline" % (e["NPV"], npv))
    irr = e.get("IRR")
    if irr is None or not math.isfinite(irr):
        fails.append("(r) the witness publishes no IRR -- it is meant to be "
                     "profitable, so the IRR arm cannot run")
    else:
        at = sum(cf / (1.0 + irr) ** t for t, cf in want.items())
        if abs(at) > 1e-6 * FCI:
            fails.append("(r) NPV at the published IRR %.6f is %.3f, not zero"
                         % (irr, at))
    cum, prev, pb = 0.0, 0.0, None
    for t in sorted(want):
        disc = want[t] / (1.0 + i) ** t
        prev, cum = cum, cum + disc
        if cum >= 0.0 and t > 0:
            pb = (t - 1) + (-prev / disc)
            break
    if pb is None or abs(pb - e["paybackYears"]) > 1e-8 * max(pb, 1.0):
        fails.append("(r) economics.paybackYears = %s, recomputed %s"
                     % (e.get("paybackYears"), pb))
    rows = [l for l in csvt.splitlines() if l and not l.startswith("#")]
    head = rows[0].split(",")
    if "productionFraction" not in head or not any(
            h.startswith("startupCost_") for h in head):
        fails.append("(r) cashFlow.csv carries no productionFraction / "
                     "startupCost columns on a case that declares the keys")
    else:
        iy, icf = head.index("year"), head.index(
            next(h for h in head if h.startswith("cashFlow_")))
        seen = {}
        for l in rows[1:]:
            c = l.split(",")
            if len(c) != len(head) or not re.fullmatch(r'-?\d+', c[iy]):
                break
            seen[int(c[iy])] = float(c[icf])
        if sorted(seen) != sorted(want):
            fails.append("(r) cashFlow.csv years %s, expected %s"
                         % (sorted(seen), sorted(want)))
        for t, cf in want.items():
            if t in seen and abs(seen[t] - cf) > 1.0:
                fails.append("(r) cashFlow.csv year %d: cash flow %.0f, "
                             "recomputed %.2f" % (t, seen[t], cf))
    for phrase in ("NPV at the START of construction",
                   "does NOT follow the ramp-up",
                   "an EXPENSE of operating year 1",
                   "year by year ("):
        if phrase not in out:
            fails.append("(r) the console does not say `%s`" % phrase)

    #  ---- probes on copies -----------------------------------------------
    rc, o, _ = run_copy(lambda t: re.sub(r'\n\s*capitalSchedule\s*\([^)]*\)\s*;',
                                         '\n', t, count=1))
    if rc == 0 or "no capitalSchedule is declared" not in o:
        fails.append("(r) constructionPeriod %d with no capitalSchedule is not "
                     "refused BY NAME (rc=%d)" % (N, rc))
    rc, o, _ = run_copy(lambda t: re.sub(r'capitalSchedule\s*\([^)]*\)',
                                         'capitalSchedule ( 0.3 0.4 0.2 )', t,
                                         count=1))
    if rc == 0 or "sums to 0.9" not in o:
        fails.append("(r) a capitalSchedule summing to 0.9 is not refused "
                     "naming its sum (rc=%d)" % rc)

    def one_year(t):
        t = re.sub(r'\n\s*(capitalSchedule|rampUp)\s*\([^)]*\)\s*;', '\n', t)
        t = re.sub(r'\n\s*startupCostFraction\s+[0-9.]+\s*;', '\n', t)
        return re.sub(r'constructionPeriod\s+\d+\s*;', 'constructionPeriod 1;', t)
    rc, o, c1 = run_copy(one_year)
    e1 = _kpi_line(o, "economics")
    if rc != 0 or e1 is None:
        fails.append("(r) the one-year form of the witness failed (rc=%d)" % rc)
    else:
        cf_op = lambda t: ((e1["revenue"] - e1["COM_d"]
                            - (e1["FCI"] / dlife if t <= dlife else 0.0))
                           * (1.0 - tau) + (e1["FCI"] / dlife if t <= dlife else 0.0))
        npv1 = -(e1["FCI"] + e1["WC"]) + sum(
            cf_op(t) / (1.0 + i) ** t for t in range(1, life + 1)) \
            + e1["WC"] / (1.0 + i) ** life
        if abs(npv1 - e1["NPV"]) > 1e-8 * max(abs(npv1), 1.0):
            fails.append("(r) the one-year NPV is %.6f, the closed form %.6f"
                         % (e1["NPV"], npv1))
        if "productionFraction" in c1 or '"timeline"' in o:
            fails.append("(r) a case declaring none of the keys writes the "
                         "start-up columns or the JSON timeline -- it must be "
                         "byte-identical to the old shape")


LANDCASE = ROOT / "tutorials/plant/ammonia02_full_plant"


def check_land(fails):
    """(s) THE LAND RECOMPUTES FROM ITS PRINTED LINE (DEV.md 4c C82).  The
    console line, the plot the layout published, the declared source and the
    CSV footer are four surfaces of one number; each is read here as text
    and they must agree."""
    if not LANDCASE.exists():
        fails.append("(s) %s is missing -- this arm CANNOT RUN and must not "
                     "pass." % LANDCASE.name)
        return
    tmp = tempfile.mkdtemp(prefix="cost_land_")
    try:
        d = Path(tmp) / "land"
        shutil.copytree(LANDCASE, d, ignore=shutil.ignore_patterns(
            "reports", "converged", "design", "iterations"))
        p = subprocess.run([str(BIN), str(d)], capture_output=True, text=True,
                           cwd=str(ROOT), timeout=600)
        out = p.stdout + p.stderr
        if p.returncode != 0:
            fails.append(f"(s) the land witness exited {p.returncode}")
            return
        m = re.search(r"Land = ([\d.]+) EUR/m2 x ([\d.]+) m2\s+=\s+(\d+)\s+EUR", out)
        if not m:
            fails.append("(s) the console prints no `Land = P EUR/m2 x A m2 = C EUR`"
                         " line -- the land's cost cannot be defended from itself")
            return
        P, A, C = float(m.group(1)), float(m.group(2)), float(m.group(3))
        if abs(P * A - C) > 0.5 * P + 1.0:
            fails.append(f"(s) {P} x {A} = {P * A:.0f}, the line prints {C:.0f}")
        pa = re.search(r'"plot": \{[^}]*"plotArea": ([-0-9.eE+]+)', out)
        if not pa or abs(float(pa.group(1)) - A) > 0.05:
            fails.append(f"(s) the land's area {A} m2 is not the plot the layout"
                         f" published ({pa.group(1) if pa else 'none'} m2)")
        src = re.search(r'\n    land\n    \{.*?source\s+"([^"]*)"',
                        (LANDCASE / "system" / "postDict").read_text(), re.S)
        if not src or ("price: " + src.group(1)) not in out:
            fails.append("(s) the land's declared `source` is not printed beside its cost")
        foot = {}
        for line in (d / "reports/economics/cashFlow.csv").read_text().splitlines():
            f = line.split(",")
            if len(f) >= 2 and not line.startswith("#"):
                foot.setdefault(f[0], f[1])
        try:
            if abs(float(foot["land"]) - C) > 1.0:
                fails.append(f"(s) cashFlow.csv says land {foot['land']}, the console {C:.0f}")
            if abs(float(foot["TCI"]) - float(foot["FCI"]) - float(foot["WC"])) > 1.0:
                fails.append("(s) TCI is not FCI + WC beside a declared land: the land"
                             " is a separate line, never inside the ladder")
        except (KeyError, ValueError) as e:
            fails.append(f"(s) cashFlow.csv lacks a footer line: {e}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


#  ---------------------------------------------------------------------------
#  (t) and (u): DEV.md 4c C98 -- the particulate labour term and the declared
#  quotes.  Both run on copies: a probe built from economics01 (a fluid plant:
#  no particulate unit, an unsized `separator` a quote may price) and the
#  shipped apalutamide witness (a solid-dose plant that declares both).
#  ---------------------------------------------------------------------------
ECONCASE = ROOT / "tutorials/steady/economics/economics01_esterification_dcf"
OSDCASE = ROOT / "tutorials/plant/apalutamide01_tablets"


def _copy_case(src, tmp, name):
    d = Path(tmp) / name
    shutil.copytree(src, d, ignore=shutil.ignore_patterns(
        "reports", "converged", "design", "iterations"))
    return d


def _run(d, timeout=600):
    p = subprocess.run([str(BIN), str(d)], capture_output=True, text=True,
                       cwd=str(ROOT), timeout=timeout)
    return p.returncode, p.stdout + p.stderr


def _econ_kpi(out, key):
    m = re.search(r'^    "economics": \{[^\n]*"%s": (-?[0-9.eE+-]+)' % key, out, re.M)
    return float(m.group(1)) if m else None


def _insert_into_block(text, block, body):
    """Insert `body` right after the opening brace of the top-level `block`."""
    m = re.search(r"^%s\s*\n\{" % block, text, re.M)
    assert m, block
    return text[:m.end()] + "\n" + body + "\n" + text[m.end():]


N_OL_RE = re.compile(
    r"N_OL = sqrt\(6\.29 \+ 31\.7 x P\^2 \+ 0\.23 x N_np\) = "
    r"sqrt\(6\.29 \+ 31\.7 x (\d+)\^2 \+ 0\.23 x ([\d.]+)\) = ([\d.]+)/shift"
    r" -> ([\d.]+) operating positions")
ANNOUNCE = "particulateSteps was NOT declared"


def check_particulate_labour(fails):
    """(t) THE PARTICULATE LABOUR TERM (DEV.md 4c C98).  Turton's operator
    count is N_OL = (6.29 + 31.7 P^2 + 0.23 N_np)^0.5 and the engine dropped
    P.  Checked here, each on a run:

      t1  a fluid plant that declares nothing prints the P term at P = 0, its
          N_OL recomputes from the printed numbers, and NOTHING is announced
          (no particulate unit: the zero is not a choice anyone missed);
      t2  `particulateSteps { count 2; ... }` declared: the printed N_OL is
          sqrt(6.29 + 31.7 x 4 + 0.23 N_np), C_OL = 4.5 N_OL x rate x hours
          recomputes, the declared source is printed, nothing is announced;
      t3  a missing `reason`, a fractional count and a flat scalar each
          REFUSE by name;
      t4  the solid-dose witness with its declaration REMOVED announces the
          undeclared zero on the console, in the end-of-run caveat block
          and in the result JSON, naming its particulate units; with it
          (as shipped) nothing is announced and P = 6 is on the line."""
    tmp = tempfile.mkdtemp(prefix="cost_labour_")
    try:
        # ---- t1
        d = _copy_case(ECONCASE, tmp, "t1")
        rc, out = _run(d)
        m = N_OL_RE.search(out)
        if rc != 0 or not m:
            fails.append("(t1) economics01 does not print the operator count"
                         " WITH its particulate term (`N_OL = sqrt(6.29 + 31.7"
                         " x P^2 + 0.23 x N_np) = sqrt(...)`), rc=%d" % rc)
        else:
            P, Nnp, nol = int(m.group(1)), float(m.group(2)), float(m.group(3))
            if P != 0 or abs(math.sqrt(6.29 + 0.23 * Nnp) - nol) > 0.006:
                fails.append("(t1) undeclared P must be 0 and N_OL recompute:"
                             " P=%d N_OL=%g" % (P, nol))
        if ANNOUNCE in out:
            fails.append("(t1) a fluid plant with no particulate unit announced"
                         " the undeclared particulate steps -- an announcement"
                         " that fires on everything is read by nobody")

        # ---- t2
        d = _copy_case(ECONCASE, tmp, "t2")
        pdp = d / "system" / "postDict"
        pdp.write_text(_insert_into_block(pdp.read_text(), "economics",
            '    particulateSteps { count 2; source "probe count"; '
            'reason "two solids steps, for the gate"; }'))
        rc, out = _run(d)
        m = N_OL_RE.search(out)
        if rc != 0 or not m:
            fails.append("(t2) a declared particulateSteps run printed no"
                         " operator line (rc=%d)" % rc)
        else:
            P, Nnp = int(m.group(1)), float(m.group(2))
            nol, pos = float(m.group(3)), float(m.group(4))
            want = math.sqrt(6.29 + 31.7 * 4 + 0.23 * Nnp)
            if P != 2 or abs(want - nol) > 0.006 or abs(4.5 * want - pos) > 0.06:
                fails.append("(t2) declared P = 2: the line says P=%d N_OL=%g"
                             " positions=%g; recomputed N_OL=%g" % (P, nol, pos, want))
            sal = re.search(r"salary/operator = ([\d.]+) EUR/h x ([\d.]+) h/yr", out)
            col = re.search(r"C_OL \(labour\)\s+=\s+(\d+)\s+EUR/yr", out)
            if not sal or not col:
                fails.append("(t2) the salary or C_OL line is missing")
            else:
                c = 4.5 * want * float(sal.group(1)) * float(sal.group(2))
                if abs(c - float(col.group(1))) > 1e-3 * c + 2:
                    fails.append("(t2) C_OL %s does not recompute from the declared"
                                 " P (%.0f)" % (col.group(1), c))
            if "source: probe count" not in out:
                fails.append("(t2) the declared count's source is not printed"
                             " beside it")
        if ANNOUNCE in out:
            fails.append("(t2) a DECLARED particulateSteps was announced")

        # ---- t3 refusals
        for tag, body, why in (
            ("noreason", 'particulateSteps { count 2; source "s"; }',
             "which steps were counted"),
            ("frac", 'particulateSteps { count 1.5; source "s"; reason "r"; }',
             "whole number"),
            ("flat", 'particulateSteps 2;', "must be a block"),
        ):
            d = _copy_case(ECONCASE, tmp, "t3" + tag)
            pdp = d / "system" / "postDict"
            pdp.write_text(_insert_into_block(pdp.read_text(), "economics",
                                              "    " + body))
            rc, out = _run(d)
            if rc == 0 or "particulateSteps" not in out or why not in out:
                fails.append("(t3) `%s` was not refused by name (rc=%d, '%s'"
                             " expected in the message)" % (body, rc, why))

        # ---- t4
        if not OSDCASE.exists():
            fails.append("(t4) %s is missing -- this arm CANNOT RUN and must"
                         " not pass" % OSDCASE.name)
            return
        d = _copy_case(OSDCASE, tmp, "t4shipped")
        rc, out = _run(d)
        m = N_OL_RE.search(out)
        if rc != 0 or not m or int(m.group(1)) != 6:
            fails.append("(t4) the shipped solid-dose witness does not print P"
                         " = 6 on its operator line (rc=%d)" % rc)
        if ANNOUNCE in out:
            fails.append("(t4) the shipped witness DECLARES its count and was"
                         " announced anyway")
        d = _copy_case(OSDCASE, tmp, "t4undeclared")
        pdp = d / "system" / "postDict"
        #  The crew goes too (C98 round 2): beside a declared crew the zero
        #  prices nothing and is deliberately not announced (arm (v4)).
        txt = re.sub(r"\n    particulateSteps\n    \{.*?\n    \}\n", "\n",
                     pdp.read_text(), flags=re.S)
        txt = re.sub(r"\n    operatingCrew\n    \{.*?\n    \}\n", "\n",
                     txt, flags=re.S)
        if "particulateSteps" in txt.split("economics", 1)[-1].replace(
                "`particulateSteps`", ""):
            fails.append("(t4) the probe could not remove the declaration")
        pdp.write_text(txt)
        rc, out = _run(d)
        if rc != 0:
            fails.append("(t4) the witness without its declaration exited %d" % rc)
        else:
            site = re.search(r"\[assumed\] economics: " + ANNOUNCE + r"[^\n]*", out)
            if not site or "SD (sprayDryer)" not in site.group(0) \
                    or "coatingDryer (solidDryer)" not in site.group(0):
                fails.append("(t4) the undeclared zero is not announced at its"
                             " site naming the particulate units (SD,"
                             " coatingDryer)")
            tail = out.split("ASSUMPTIONS AND CAVEATS")[-1] \
                if "ASSUMPTIONS AND CAVEATS" in out else ""
            if ANNOUNCE not in tail:
                fails.append("(t4) the undeclared zero is not replayed in the"
                             " end-of-run caveat block")
            js = out[out.find('"advisories"'):] if '"advisories"' in out else ""
            if ANNOUNCE not in js:
                fails.append("(t4) the undeclared zero is not in the result"
                             " JSON's advisories")
            m = N_OL_RE.search(out)
            if not m or int(m.group(1)) != 0:
                fails.append("(t4) without the declaration P must be 0 on the"
                             " operator line")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


QUOTE_ROW_RE = re.compile(
    r"^  (\S+)\s+declared-quote\s+(installed|purchased), (equipment|facility)\s+"
    r"([\d.eE+]+) \(([\d.]+)\) x ([\d.eE+-]+), DECLARED\s+([\d.]+), ([\d.]+)",
    re.M)


def _table_row(out, name):
    m = re.search(r"^  %s\s+quote\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(\d+)\s+(\d+)"
                  % re.escape(name), out, re.M)
    return tuple(float(x) for x in m.groups()) if m else None


def check_declared_quotes(fails):
    """(u) A DECLARED QUOTE IS A COST THE READER CAN DEFEND (DEV.md 4c C98).

      u1  on the shipped solid-dose witness every quote's provenance row
          (value, year, index-and-currency factor, B1) RECOMPUTES its costing
          row: C_p = value x factor, C_BM = B1 x C_p, C_TM = 1.18 C_BM; each
          quote's source and reason are printed; the FCI KPI recomputes as
          contingencyFee SUM C_BM + siteFactor SUM C_BM_base with a facility
          adding NOTHING to the base (from the result JSON alone); costs.csv
          reproduces each quote row from its own columns (K1 x cepci / K2 x
          K3 = purchased, x B1 = bare module); every quote has an `equipment`
          entry in the JSON carrying its source;
      u2  on the probe (economics01 + quotes): a USD quote of another year is
          escalated by CEPCI_run / cepci and converted by usdToEur, a
          purchased quote takes the CASE's factor, the FCI moves by exactly
          1.18 SUM C_BM + 0.5 SUM base of the quotes, and a run with no
          quotes prints no `declared-quote` at all;
      u3  REFUSED by name: no source, no reason, a negative value, a unit
          name that is SIZED, an unknown unit, an `item` named like a unit,
          both `unit` and `item`, a purchased quote with no factor, another
          year with no cepci, an unknown `kind`, a duplicate."""
    tmp = tempfile.mkdtemp(prefix="cost_quotes_")
    try:
        # ---- u1, the witness
        if not OSDCASE.exists():
            fails.append("(u1) %s is missing -- this arm CANNOT RUN and must"
                         " not pass" % OSDCASE.name)
        else:
            d = _copy_case(OSDCASE, tmp, "u1")
            add_reports(d, ["economics"])
            rc, out = _run(d)
            rows = QUOTE_ROW_RE.findall(out)
            if rc != 0 or len(rows) < 2:
                fails.append("(u1) the witness printed %d declared-quote"
                             " provenance rows (rc=%d)" % (len(rows), rc))
            for (name, basis, kind, val, yr, fac, b1, b2) in rows:
                t = _table_row(out, name)
                if not t:
                    fails.append("(u1) quote %s has no costing-table row" % name)
                    continue
                Cp = float(val) * float(fac)
                Cbm = float(b1) * Cp
                if abs(Cp - t[2]) > 1 or abs(Cbm - t[3]) > 1 \
                        or abs(1.18 * Cbm - t[4]) > 1:
                    fails.append("(u1) quote %s: the printed %s x %s, B1 %s do not"
                                 " recompute its row %s" % (name, val, fac, b1, t))
                blk = out.split("Declared quotes --", 1)[-1]
                if not re.search(r"^    %s \(%s, %s\)  source: \S" % (
                        re.escape(name), basis, kind), blk, re.M):
                    fails.append("(u1) quote %s's source is not printed beside"
                                 " it" % name)
            # FCI from the JSON alone
            eq = [l for l in out.splitlines() if l.startswith('    { "unit": ')
                  and '"cost": {' in l]
            sbm = sb0 = 0.0
            nfac = 0
            for l in eq:
                bm = float(re.search(r'"bareModule": ([-0-9.eE+]+)', l).group(1))
                pu = float(re.search(r'"purchased": ([-0-9.eE+]+)', l).group(1))
                sbm += bm
                base = re.search(r'"C_BM_base": ([-0-9.eE+]+)', l)
                b1 = re.search(r'"B1": ([-0-9.eE+]+)', l)
                b2 = re.search(r'"B2": ([-0-9.eE+]+)', l)
                if base:
                    sb0 += float(base.group(1))
                    if '"basis": "declared quote, installed, facility"' in l:
                        nfac += 1
                        if float(base.group(1)) != 0.0:
                            fails.append("(u1) a facility quote carries a"
                                         " non-zero C_BM_base")
                    if '"source": ' not in l:
                        fails.append("(u1) a quote's equipment entry carries"
                                     " no source")
                elif b1 and b2:
                    sb0 += pu * (float(b1.group(1)) + float(b2.group(1)))
                else:
                    sb0 += bm
            fci = _econ_kpi(out, "FCI")
            want = 1.18 * sbm + 0.5 * sb0
            if fci is None or abs(fci - want) > 1e-6 * want + 1:
                fails.append("(u1) the FCI KPI %s is not 1.18 SUM C_BM + 0.5"
                             " SUM C_BM_base = %.0f recomputed from the"
                             " equipment JSON" % (fci, want))
            if nfac < 1:
                fails.append("(u1) the witness carries no `kind facility` quote,"
                             " so the base rule is untested")
            csvp = d / "reports/economics/costs.csv"
            if csvp.exists():
                rd = list(csv.DictReader(csvp.open()))
                q = [r for r in rd if r.get("correlation") == "declared-quote"]
                if len(q) != len(rows):
                    fails.append("(u1) costs.csv carries %d quote rows, the"
                                 " console %d" % (len(q), len(rows)))
                pk = [k for k in rd[0] if k.startswith("purchased_")][0]
                bk = [k for k in rd[0] if k.startswith("bareModule_")][0]
                for r in q:
                    #  `S` is the quote's batch-plan scale (DEV.md 4c C99),
                    #  1 on a quote that does not scale.
                    cp = float(r["K1_or_CpRef"]) * float(r["cepci"]) \
                        / float(r["K2_or_SRef"]) * float(r["K3_or_n"]) \
                        * float(r["S"])
                    if abs(cp - float(r[pk])) > 0.01 \
                            or abs(cp * float(r["B1"]) - float(r[bk])) > 0.01:
                        fails.append("(u1) costs.csv row %s does not reproduce"
                                     " from its own columns" % r["unit"])
            else:
                fails.append("(u1) the witness wrote no costs.csv")

        # ---- u2, the probe
        d = _copy_case(ECONCASE, tmp, "u2base")
        rc, base_out = _run(d)
        if QUOTE_ROW_RE.search(base_out) or "Declared quotes --" in base_out \
                or '"type": "declaredQuote"' in base_out:
            fails.append("(u2) a case with no quotes prints a quote row")
        fci0 = _econ_kpi(base_out, "FCI")
        d = _copy_case(ECONCASE, tmp, "u2")
        pdp = d / "system" / "postDict"
        pdp.write_text(_insert_into_block(pdp.read_text(), "costing", """\
    quotes
    (
        { unit separator; value 100000; currency USD; year 2020; cepci 600;
          basis purchased; bareModuleFactor 2.0;
          bareModuleFactorSource "probe factor"; kind equipment;
          source "probe"; reason "the gate"; }
        { item controlRoom; value 50000; currency EUR; year 2026;
          basis installed; kind facility; source "probe"; reason "the gate"; }
    );"""))
        rc, out = _run(d)
        t = _table_row(out, "separator")
        f = _table_row(out, "controlRoom")
        if rc != 0 or not t or not f:
            fails.append("(u2) the probe's two quotes have no costing rows"
                         " (rc=%d)" % rc)
        else:
            cp = 100000 * 820.0 / 600.0 * 0.92
            if abs(t[2] - cp) > 1 or abs(t[3] - 2 * cp) > 1 \
                    or abs(t[4] - 2.36 * cp) > 2:
                fails.append("(u2) the USD 2020 purchased quote: row %s, expected"
                             " C_p %.0f (x 820/600 x 0.92), C_BM = 2 C_p,"
                             " C_TM = 1.18 C_BM" % (t, cp))
            if abs(f[2] - 50000) > 1 or abs(f[3] - 50000) > 1:
                fails.append("(u2) the EUR installed quote's row is %s" % (f,))
            fci = _econ_kpi(out, "FCI")
            want = fci0 + 1.18 * (2 * cp + 50000) + 0.5 * (2 * cp)
            if fci is None or fci0 is None or abs(fci - want) > 2:
                fails.append("(u2) the FCI moved from %s to %s; the quotes"
                             " predict %.0f (a facility adds nothing to the"
                             " base)" % (fci0, fci, want))
            if "bareModuleFactor source: probe factor" not in out:
                fails.append("(u2) a purchased quote's factor source is not"
                             " printed")

        # ---- u3, refusals
        ok = ('value 1000; currency EUR; year 2026; basis installed; '
              'kind equipment; source "s"; reason "r";')
        cases = [
            ("nosource", '{ unit separator; value 1000; currency EUR; year 2026;'
             ' basis installed; kind equipment; reason "r"; }', "owes its reader"),
            ("noreason", '{ unit separator; value 1000; currency EUR; year 2026;'
             ' basis installed; kind equipment; source "s"; }', "owes its reader"),
            ("negative", '{ unit separator; value -5; currency EUR; year 2026;'
             ' basis installed; kind equipment; source "s"; reason "r"; }',
             "positive"),
            ("sized", "{ unit reactor; " + ok + " }", "SIZED"),
            ("unknownunit", "{ unit nowhere; " + ok + " }", "names no unit"),
            ("itemisunit", "{ item separator; " + ok + " }", "declare `unit"),
            ("both", "{ unit separator; item x; " + ok + " }", "EXACTLY ONE"),
            ("nofactor", '{ unit separator; value 1000; currency EUR; year 2026;'
             ' basis purchased; kind equipment; source "s"; reason "r"; }',
             "bareModuleFactor"),
            ("nocepci", '{ unit separator; value 1000; currency EUR; year 2019;'
             ' basis installed; kind equipment; source "s"; reason "r"; }',
             "No index is defaulted"),
            ("kind", '{ unit separator; value 1000; currency EUR; year 2026;'
             ' basis installed; kind machine; source "s"; reason "r"; }',
             "Accepted"),
            ("duplicate", "{ unit separator; " + ok + " } { unit separator; "
             + ok + " }", "second quote"),
        ]
        for tag, entry, why in cases:
            d = _copy_case(ECONCASE, tmp, "u3" + tag)
            pdp = d / "system" / "postDict"
            pdp.write_text(_insert_into_block(pdp.read_text(), "costing",
                                              "    quotes ( %s );" % entry))
            rc, out = _run(d)
            if rc == 0 or "quotes" not in out or why not in out:
                fails.append("(u3) %s: not refused by name (rc=%d, '%s' expected"
                             " in the message)" % (tag, rc, why))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


CREW_RE = re.compile(r"operating crew, DECLARED: (.*?) = (\d+)/shift -> ([\d.]+)"
                     r" operating positions \(x ([\d.]+)\)")
CMP_RE = re.compile(r"\[comparison, enters NO total\] N_OL = sqrt\(6\.29 \+ 31\.7 x "
                    r"P\^2 \+ 0\.23 x N_np\) = sqrt\(6\.29 \+ 31\.7 x (\d+)\^2 \+ 0\.23 x"
                    r" ([\d.]+)\) = ([\d.]+)/shift -> ([\d.]+) operating positions")


def check_operating_crew(fails):
    """(v) A DECLARED CREW PRICES THE LABOUR, AND THE CORRELATION IS PRINTED
    BESIDE IT AS A COMPARISON THAT ENTERS NO TOTAL (2026-10-19, DEV.md 4c C98
    round 2, Vitor: "Equipa declarada pelo caso").

      v1  the shipped solid-dose witness: the crew line's areas sum to its
          operators per shift, x the printed positions factor gives its
          positions, and C_OL = positions x rate x hours; the published KPIs
          `operatorsPerShift`, `operatingPositions`, `C_OL` carry the SAME
          numbers; the comparison line recomputes Turton's N_OL with the
          declared P, `C_OL_correlation` is its labour, and COM_d recomputes
          from the DECLARED C_OL (0.180 FCI + 2.73 C_OL + 1.23 (C_RM + C_UT))
          -- so the comparison is in no total;
      v2  a fluid plant with no crew publishes `operatorsPerShift` = the
          correlation's N_OL and NO `_correlation` key, and prints no crew
          line and no comparison label;
      v3  REFUSED by name: a fractional, a zero operators-per-shift, a
          missing source, a missing reason, an empty `areas`, a duplicate
          area, a flat scalar;
      v4  a crew beside an UNDECLARED P on a solids plant: the comparison
          line says P was not declared, and the undeclared-zero
          announcement does NOT fire (the zero prices nothing);
      v5  SOURCE: the positions factor 4.5 has ONE home in EconomicsPass.cpp
          outside comments -- the two routes may not carry two copies."""
    tmp = tempfile.mkdtemp(prefix="cost_crew_")
    try:
        # ---- v1
        if not OSDCASE.exists():
            fails.append("(v1) %s is missing -- this arm CANNOT RUN and must not"
                         " pass" % OSDCASE.name)
        else:
            d = _copy_case(OSDCASE, tmp, "v1")
            rc, out = _run(d)
            m = CREW_RE.search(out)
            c = CMP_RE.search(out)
            if rc != 0 or not m or not c:
                fails.append("(v1) the witness prints no declared-crew line or no"
                             " comparison line (rc=%d)" % rc)
            else:
                areas = [int(x) for x in re.findall(r" (\d+)(?: \+|$)", m.group(1))]
                per, pos, fac = int(m.group(2)), float(m.group(3)), float(m.group(4))
                if sum(areas) != per or abs(fac * per - pos) > 0.06:
                    fails.append("(v1) the crew line does not add up: areas %s,"
                                 " %d/shift, %g positions at x %g"
                                 % (areas, per, pos, fac))
                sal = re.search(r"salary/operator = ([\d.]+) EUR/h x ([\d.]+) h/yr", out)
                rate_h = float(sal.group(1)) * float(sal.group(2)) if sal else 0.0
                col = _econ_kpi(out, "C_OL")
                if col is None or abs(col - fac * per * rate_h) > 1e-6 * col + 1:
                    fails.append("(v1) C_OL %s is not the crew's %g positions x"
                                 " the wage (%.0f)" % (col, fac * per, fac * per * rate_h))
                if _econ_kpi(out, "operatorsPerShift") != per \
                        or abs((_econ_kpi(out, "operatingPositions") or 0) - fac * per) > 1e-9:
                    fails.append("(v1) the published operatorsPerShift /"
                                 " operatingPositions are not the crew's")
                P, Nnp, nol = int(c.group(1)), float(c.group(2)), float(c.group(3))
                want = math.sqrt(6.29 + 31.7 * P * P + 0.23 * Nnp)
                if abs(want - nol) > 0.006 \
                        or abs((_econ_kpi(out, "operatorsPerShift_correlation") or 0) - want) > 1e-6:
                    fails.append("(v1) the comparison N_OL %g (published %s) is not"
                                 " sqrt(6.29 + 31.7 P^2 + 0.23 N_np) = %g"
                                 % (nol, _econ_kpi(out, "operatorsPerShift_correlation"), want))
                cc = _econ_kpi(out, "C_OL_correlation")
                if cc is None or abs(cc - fac * want * rate_h) > 1e-6 * cc + 1:
                    fails.append("(v1) C_OL_correlation %s is not the correlation's"
                                 " positions x the wage (%.0f)" % (cc, fac * want * rate_h))
                fci, com = _econ_kpi(out, "FCI"), _econ_kpi(out, "COM_d")
                crm, cut = _econ_kpi(out, "C_RM"), _econ_kpi(out, "C_UT")
                if None in (fci, com, crm, cut, col) or \
                        abs(0.180 * fci + 2.73 * col + 1.23 * (crm + cut) - com) > 1e-6 * com + 1:
                    fails.append("(v1) COM_d %s does not recompute from the DECLARED"
                                 " C_OL -- the comparison entered a total" % com)

        # ---- v2
        d = _copy_case(ECONCASE, tmp, "v2")
        rc, out = _run(d)
        m = N_OL_RE.search(out)
        if rc != 0 or not m:
            fails.append("(v2) the fluid plant printed no correlation line")
        else:
            if abs((_econ_kpi(out, "operatorsPerShift") or -1) - float(m.group(3))) > 0.006:
                fails.append("(v2) without a crew the published operatorsPerShift"
                             " is not the correlation's N_OL")
            if _econ_kpi(out, "operatorsPerShift_correlation") is not None \
                    or "operating crew, DECLARED" in out or "[comparison" in out:
                fails.append("(v2) a case with no crew carries a crew line, a"
                             " comparison label or a `_correlation` KPI")

        # ---- v3
        good = ('{ area "a"; operatorsPerShift 2; }')
        for tag, body, why in (
            ("frac", 'operatingCrew { areas ( { area "a"; operatorsPerShift 1.5; } );'
                     ' source "s"; reason "r"; }', "whole people"),
            ("zero", 'operatingCrew { areas ( { area "a"; operatorsPerShift 0; } );'
                     ' source "s"; reason "r"; }', "whole people"),
            ("nosource", 'operatingCrew { areas ( %s ); reason "r"; }' % good,
             "staffing plan"),
            ("noreason", 'operatingCrew { areas ( %s ); source "s"; }' % good,
             "staffing plan"),
            ("empty", 'operatingCrew { areas ( ); source "s"; reason "r"; }',
             "is EMPTY"),
            ("dup", 'operatingCrew { areas ( %s %s ); source "s"; reason "r"; }'
                    % (good, good), "declared TWICE"),
            ("flat", 'operatingCrew 5;', "must be a block"),
        ):
            d = _copy_case(ECONCASE, tmp, "v3" + tag)
            pdp = d / "system" / "postDict"
            pdp.write_text(_insert_into_block(pdp.read_text(), "economics",
                                              "    " + body))
            rc, out = _run(d)
            if rc == 0 or "operatingCrew" not in out or why not in out:
                fails.append("(v3) %s: not refused by name (rc=%d, '%s' expected"
                             " in the message)" % (tag, rc, why))

        # ---- v4
        if OSDCASE.exists():
            d = _copy_case(OSDCASE, tmp, "v4")
            pdp = d / "system" / "postDict"
            pdp.write_text(re.sub(r"\n    particulateSteps\n    \{.*?\n    \}\n", "\n",
                                  pdp.read_text(), flags=re.S))
            rc, out = _run(d)
            if rc != 0 or "(P = 0: particulateSteps NOT declared)" not in out:
                fails.append("(v4) beside a declared crew, the comparison does not"
                             " say P was not declared (rc=%d)" % rc)
            if ANNOUNCE in out:
                fails.append("(v4) the undeclared-P announcement fired beside a"
                             " declared crew, where the zero prices nothing")

        # ---- v5
        src = strip_comments((ROOT / "src/postProcessing/EconomicsPass.cpp")
                             .read_text(errors="replace"))
        n = len(re.findall(r"(?<![\d.])4\.5(?![\d])", src))
        if n != 1:
            fails.append("(v5) the positions factor 4.5 appears %d times in"
                         " EconomicsPass.cpp outside comments; the crew and the"
                         " correlation must share ONE home" % n)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


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
    check_startup_years(fails)
    check_land(fails)
    check_particulate_labour(fails)
    check_declared_quotes(fails)
    check_operating_crew(fails)

    if fails:
        print("check_cost_provenance: FAIL")
        for f in fails:
            print("  - " + f)
        return 1

    print("check_cost_provenance: OK -- the PARTICULATE LABOUR TERM (C98): "
          "the operator line prints Turton's 31.7 P^2 with the P used, a "
          "declared `particulateSteps` recomputes N_OL and C_OL from the "
          "printed numbers with its source beside it, a malformed declaration "
          "is refused by name, an undeclared zero is ANNOUNCED (site, caveat "
          "block, JSON) only where the flowsheet holds a particulate unit; "
          "the DECLARED QUOTES (C98) of apalutamide01_tablets recompute row "
          "by row from their printed value, index factor and B1 (C_TM = 1.18 "
          "C_BM), the FCI KPI recomputes from the equipment JSON with a "
          "facility adding nothing to the auxiliary base, costs.csv "
          "reproduces each quote from its own columns, a USD quote of another "
          "year escalates and converts as printed, and eleven malformed "
          "quotes are refused by name; a DECLARED CREW (C98 round 2) prices "
          "the labour (areas sum, x the one positions factor, x the wage = "
          "the published C_OL), Turton's correlation is printed and "
          "published beside it as a comparison that enters no total (COM_d "
          "recomputes from the declared C_OL), a case with no crew publishes "
          "the correlation's count and no comparison, seven malformed crews "
          "are refused by name, and the 4.5 has one home; "
          "the LAND of ammonia02_full_plant "
          "recomputes from its printed line (price x the plot area the layout "
          "published = its cost, its declared source printed beside it, the "
          "CSV footer the same, TCI still FCI + WC); "
          "the START-UP YEARS of "
          "economics03_startup_years RECOMPUTE row by row from the declared "
          "construction schedule, ramp-up and start-up cost (NPV, IRR, "
          "payback, every cashFlow.csv row), a missing or mis-summed schedule "
          "is refused by name, and the one-year form keeps the old shape; "
          "the WORKING CAPITAL built up on "
          "greenAmmoniaPEQ_baseCase RECOMPUTES line by line (stocks valued at "
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
