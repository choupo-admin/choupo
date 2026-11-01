# Patent expiry and generic entry: an EduTool on the calendar that decides a generic plant

**The task, in one sentence (CLAUDE.md section 10).**  A student of a
pharmaceutical plant-design group, whose business case is a generic entrant
at loss of exclusivity (`tutorials/batch/plant/apalutamide01_tablets`,
`donepezil01_tablets`), has to decide what volume and price per year the
plant's economics should read, and how much revenue is at risk if the entry
is late or the price falls further; the page answers that first, the
theory it uses (a present value) is the economics chapter of the Theory
Guide, `ch:economics`.

Commission C195 (DECIDED 2026-11-02, the architect's scope after Vítor:
in the pharmaceutical industry the market is much influenced by patents and
generics).  Tool id `patent-expiry`, shelf *Process design & economics*,
kind `notes`, no engine run.  Files: `gui/src/ui/methods/patentExpiryMath.ts`
(the arithmetic, React-free), `patentExpiryLesson.ts` (8 steps, 5 quiz
questions, limits), `PatentExpiryTool.tsx`, `gui/tests/patentExpiry.test.ts`,
the section `sec:edu-patent-expiry` of `docs/eduToolsGuide.tex`.

## 1. What the case's economics can hold (read, not recalled)

* `src/postProcessing/EconomicsPass.cpp` reads `rampUp` (lines 964-990) as
  a list of at most `projectLife` entries, each in [0, 1], "the share of the
  design production reached in one operating year", 1 thereafter; it scales
  the revenue and the variable group of COM_d, not the working capital
  (`docs/ai/case-layout.md`, the start-up years paragraph).
* The apalutamide case declares `projectLife 10`, `discountRate 0.10`,
  `streamFactor fromBatchPlan`, `production perYear 10156 kg` in the batch
  plan (14.0 million tablets at 0.72546 g) and ONE price,
  `price 5513.8` EUR/kg of `packagedTablets` in `constant/economics`
  (4.0 EUR a tablet).  A price that varies by year cannot be written.
* Year 0 of the cash flow is the end of construction = the launch
  (README section 0), so the NPV is discounted to the launch.

Consequence for the output: the page gives (a) the year-by-year table, (b) a
`rampUp` list = tablets sold / Q, which is a volume profile in the case's
own grammar, and (c) ONE price p* that gives the same present value as the
falling prices for the same volumes (the discounted-volume-weighted average
price, p* = PV / sum N_j d_j).  The equivalence is exact only for the
declared discount rate and does not reproduce taxes or the working capital;
the page says so.

## 2. The model

Market year k counts years since the FIRST generic entry (the first entry is
the loss of exclusivity plus a lag, default 7 months, the EC mean).  The
newcomer launches in market year 1 + d.  In operating year j (market year
k = 1 + d + j - 1):

    V0  = S0 / P0                                   (volume held constant)
    g_k = (G(k-1) + G(k)) / 2                       (G cumulative, end of year)
    n_k = rivals(k) + 1
    N_j = min(V0 g_k w(n_k), Q)
    p_j = P0 rho f                                  (rho by producers OR by time)
    R_j = N_j p_j,   PV = sum R_j (1+i)^-j,   PV_e = PV (1+i)^-d

Every curve is data the student reads and edits: five curves (price by
producers, price by time, cumulative generic share, rivals per year, the
newcomer's share by producers), every point with an origin word.  A point a
study states is `stated`; interpolations, continuations and illustrations
are `assumed` with a reason; a point the student edits becomes `assumed`
("edited on this page by you").

The sensitivity moves ONE thing at a time on the same curves: the entrant
late by 1 and by 2 years, and the price ratio multiplied by 0.5 (an
`assumed` stress, editable).  Two PVs are shown for a reason found while
building it: discounted to the entrant's own launch, a one-year-late entrant
is +1.2 % better (it skips the thin early years and starts in a mature
market), which hides the delay; discounted to the first generic entry it is
-8.0 % (two years late: -18.0 %).  A reader comparing them needs a common
date, so both columns are printed.

## 3. Sources actually read (2026-11-01)

* Conrad R, Lutter R, *Generic Competition and Drug Prices: New Evidence
  Linking Greater Generic Competition and Lower Generic Drug Prices*, FDA,
  December 2019, <https://www.fda.gov/media/133509/download>, p. 2 (the
  prose under the figure): generic AMP 39 % below the brand's pre-entry AMP
  with one generic producer, 54 % with two, 79 % with four, more than 95 %
  with six or more; invoice basis 31, 44, 73, more than 95 %.  Median over
  products with initial generic entry 2015-2017, US retail.  The values for
  three and five producers are in the report's figure only; the figure
  could not be read from the PDF text, so 3 and 5 are `assumed`
  interpolations and the 6+ point is the bound (0.05) of "more than 95 %".
* European Commission, Pharmaceutical Sector Inquiry, fact sheet *Prices,
  time to generic entry and consumer savings*, pp. 1-2 (the fact sheet is
  headed "Preliminary Report"; it is the one the Commission lists with the
  Final Report of 8 July 2009 at
  <https://competition-policy.ec.europa.eu/sectors/pharmaceuticals-health-services/pharmaceutical-sector-inquiry_en>):
  generics enter about 25 % below the originator's pre-expiry price and are
  40 % below it after two years (sample: generic entry 2000-2007);
  originator prices also fall (no figure); generics reach about 30 % of the
  volume at the end of year one and 45 % after two; the average gap between
  loss of exclusivity and first generic entry exceeds seven months.
* The apalutamide dossier, sections 3.3, 3.4, 3.6, 4.4 (this repository):
  the European demand arithmetic (2121 MUSD x 0.533 x 0.92 = 1039 MEUR),
  the 19.13 EUR reference price, the exclusivity facts.

NOT read, and therefore nothing from them is shipped: the EC Final Report
and its Staff Working Document (only the fact sheet), any commercial
price-erosion database (not redistributable), any study of the share an
entrant wins.  The rivals-per-year and the newcomer's-share curves are
`assumed` for that reason.

## 4. Honest limits, written on the page

* NOT a freedom-to-operate analysis; the dossier section 3.6 lists the
  European counterparts (EP 3226841 B1, EP 3925598 B1, EP 3842034 B1) and
  the SPCs as NOT verified, and 3 December 2035 is Google Patents'
  anticipated expiry of one US patent.
* The curves are other products' medians (US retail by entrants; an EU
  average by time) and disagree at four producers (4.0 against 11.5 EUR a
  tablet): the page makes the student choose and say which.
* The molecule's volume is held constant; the originator's reply (price cut,
  authorised generic, switch to a new formulation) is not modelled.
* The default curves give about 10 million tablets a year at the plateau
  (generic share 0.75 x newcomer's split 1/4 x 54.3 M) against the 14.0
  million the case produces from year 1 (a 25 % share of the molecule):
  the page prints the gap rather than tuning a plateau to close it.

## 5. Alternatives considered and rejected

* **A full calendar model with patents, SPCs and data exclusivity as inputs.**
  Rejected: it would look like a freedom-to-operate tool and has no
  verified data; the loss-of-exclusivity date is one declared input with
  its origin.
* **Shipping a commercial database's erosion curve for the product class.**
  Rejected: not redistributable (Vítor's scope), and the page then could not
  show where each number came from.
* **Interpolating the FDA 3- and 5-producer values from the figure.**
  Rejected: the figure was not readable here; a value read by eye from a
  picture I could not open would be dressed as literature.  Linear
  interpolation between stated neighbours is declared `assumed`.
* **Discounting only to the launch.**  Rejected after the build showed the
  late entrant looking +1.2 % better; both dates are printed.
* **Pasting a year-by-year price into the case.**  Not possible in the
  grammar; the equivalent constant price is the honest substitute, and a
  `price`-by-year key in `economics` would be an engine change nobody has
  asked for.
* **A Monte Carlo over the curves.**  Rejected: no distribution is
  sourced; the page says its sensitivities are readings, not predictions.

## 6. Gates

`check_edutool_form`, `check_lesson_symbols`, `check_method_tools`,
`check_curator_parity`, `check_theory_citations`, `check_guide_anchors`,
`check_guide_pdf_fresh`, `check_decision_index`; tests
`gui/tests/patentExpiry.test.ts` (recomputes every number from the declared
curves by hand arithmetic and holds the defaults to the case read from
disk) and `gui/tests/lessonQuiz.test.ts`.
