# The start-up years of a cash flow

**Status: SHIPPED 2026-10-11 on branch `claude/c63-startup-years`, not merged.**
Commission DEV.md 4c **C63** (Vítor, 2026-10-11: *"Sabes se foi feita a
análise económica com anos de arranque e capital circulante e fundo de
maneio?"*, then *"Avança"* to the commander's proposal).

## 1. What was there

`src/postProcessing/EconomicsPass.cpp` built a discounted cash flow with ONE
construction year: the whole fixed capital investment (FCI) and the working
capital (WC) at t = 0, full production from year 1.  `constructionPeriod`
other than 1 was read and ANNOUNCED as not implemented (2026-08-27,
[`the-key-nobody-read-in-the-postdict.md`](the-key-nobody-read-in-the-postdict.md)),
so `ammonia02_full_plant`, which declares 2, was discounted over one.  The
working capital was already built up from what the plant holds and owes
(C44 slice 4); what was missing was WHEN money moves before and just after
start-up.

## 2. The grammar (opt-in, in the postDict's `economics {}` block)

```
constructionPeriod  3;                  // whole years >= 1
capitalSchedule     ( 0.3 0.5 0.2 );    // FCI share at the END of each
                                        // construction year; sums to 1
rampUp              ( 0.6 0.85 );       // production fraction of the first
                                        // operating years; 1 thereafter
startupCostFraction 0.10;               // start-up cost x FCI, year 1
```

Refusals, each by name with the remedy: a non-integer or < 1 period; a
schedule of the wrong length, with an entry outside [0, 1], or whose sum is
not 1 (the sum is printed); a period above 1 with no schedule; an empty
ramp-up, one longer than `projectLife`, or with an entry outside [0, 1]; a
negative start-up fraction.  A misspelled key is caught by the postDict
audit like every other key of the block (the menu of the block's reader now
lists the four).

## 3. The convention, and where it was read

READ: CAPCOST 2017 (`capcost_2017_rev2.xlsm`, sha256 `2747f01f...f428e4`),
the program Turton, Shaeiwitz, Bhattacharyya & Whiting distribute with
*Analysis, Synthesis and Design of Chemical Processes* (5th ed.) -- the same
file `costing/Turton.cpp` transcribes its coefficients from.  Worksheet
"COM Summary": "Construction period" (C47), "Distribution of Fixed Capital
Investment (must sum to one)" by "End of year One ... Five" (B49:C54),
"Project Life (Years after Startup)" (C45).  Worksheet "Cash Flow Analysis",
B48:L63, read formula by formula:

* the FCI fraction of construction year k is spent at the END of year k and
  discounted as (1+i)^-k (rows 50, 51);
* the working capital is invested at the end of the LAST construction year,
  the same instant as the last capital fraction (row 52);
* operation starts the year after, and lasts the project life counted after
  start-up -- the meaning `projectLife` always had here;
* depreciation starts in the first operating year (row 53);
* the working capital is recovered at the end of the last operating year
  (row 63).

NOT READ: the book's profitability chapter itself, Peters & Timmerhaus, or
Seider.  What is cited is the authors' program, and only for what its cells
show.

**Where time zero is -- the one departure from CAPCOST.**  CAPCOST's year 0
is the START of the project.  Choupo's year 0 has always been the END of
construction (the start-up instant, where FCI and WC sat for the one
construction year), and it stays there so that every one-year case is
unchanged byte for byte.  Construction year k of N is therefore at
t = k - N <= 0 and its outflow is compounded forward by the same factor
1/(1+i)^t.  The IRR, both paybacks and the sign of the NPV do not depend on
the reference; the NPV itself is CAPCOST's times (1+i)^N, and a run with
N > 1 prints both.

## 4. The decisions the brief left open

* **N > 1 with no schedule REFUSES** (rejected: a uniform default).  The
  schedule moves the NPV by an amount of the same order as the construction
  delay itself, and an even split would be a policy nobody chose -- the rule
  `workingCapital {}` already applies to its day counts.  The refusal names
  CAPCOST's own two-year example, `( 0.6 0.4 )`.
* **The ramp-up scales the revenue and the VARIABLE group of COM_d only.**
  COM_d as the pass assembles it is three groups, each proportional to one
  direct cost: 0.180 FCI + 2.73 C_OL + 1.23 (C_RM + C_UT + C_WT).  The first
  two (equipment-driven and labour-driven) stay; the third follows
  throughput.  The split is the equation's own structure, so it was not
  refused.  Not modelled: a ramp-up that degrades yield or quality (p scales
  products and raw materials alike), a utility bill not proportional to
  throughput.  CAPCOST has no ramp-up; no source was read for this rule.
* **The working capital does NOT follow the ramp-up** (rejected: a WC
  increment each ramp year).  It is invested in full at the end of
  construction -- CAPCOST's row 52 -- because the stocks, cash and credit
  lines are in place before the first product ships.  ANNOUNCED
  (`[assumed] economics`) whenever a ramp-up is declared.
* **The start-up cost is a FRACTION of FCI, an EXPENSE of operating year 1**
  (rejected: a money amount, which would not follow the FCI when a sweep
  moves the plant's size; rejected: capitalising and depreciating it).  It
  is deducted from year 1's taxable income like COM_d.  CAPCOST's cash-flow
  sheet carries no start-up line, so neither choice was read in a source;
  both are stated defaults of the pass, printed on the line itself, and are
  for Vítor to confirm or reverse.
* **A loss year earns a tax credit** -- unchanged, the pass's standing
  convention (a negative taxable income times the tax rate), now reachable
  in year 1 through the start-up cost.
* **The simple payback** keeps its closed form FCI / CF when the operating
  cash flow is one number; with a ramp-up or a start-up cost it becomes the
  operating time at which the undiscounted operating cash flows add up to
  the FCI (the same rule when CF is constant).

## 5. What a student sees

The DCF block prints the construction period and schedule, the ramp-up and
the COM_d,t formula, the start-up cost and its tax treatment, the NPV at the
start of construction, and the YEAR-BY-YEAR TABLE (t, p_t, capital, revenue,
COM_d,t, start-up, depreciation, tax, cash flow, discount factor, cumulative
DCF).  `reports/economics/cashFlow.csv` and `.ods` and the result JSON carry
the same rows from t = 1 - N; the two extra columns (`productionFraction`,
`startupCost_<cur>`) and the JSON `economics.timeline` object appear ONLY
when a key is declared.  Witness `tutorials/steady/economics/
economics03_startup_years`: ammonia02's plant and costing, N = 3,
`( 0.3 0.5 0.2 )`, `( 0.6 0.85 )`, 0.10 x FCI; its postDict redoes every row
by hand (NPV 78.3 M EUR against 103.6 M for the one-year timeline, IRR 22.1 %
against 34.2 %).

## 6. Measured, not argued

Byte identity, against a build of the parent commit (7b3be9e28), on every
economics case in the corpus run from a copy: eight of the ten are identical
on stdout+stderr and on every file the run writes (timestamps aside).
`ChemicalPlantTutorial` differs by ONE stderr line: its economics block
carries a key nothing reads (`langFactor`, unread because the pass refuses on
a missing price file first), so the audit prints the menu of keys the block's
reader looked for, and that menu now names the four new keys.  That is the
audit doing its job, not a moved answer.  `ammonia02_full_plant` and
`greenAmmoniaBasicDesign` move, because they now declare the timeline (§7).

Gate: `check_cost_provenance` arm (r) recomputes the witness's timeline
from its declarations and published KPIs (every `cashFlow.csv` row, the
NPV, the IRR, the discounted payback), probes the two schedule refusals and
the one-year shape.  Four by-hand sabotages, none survived: the ramp-up
scaling the fixed group, the start-up cost taken after tax, the WC at the
first construction year, the sum check removed (caught only by its probe).
The probes' first run failed on a correct engine -- they edited the header
comment that quotes the keys -- and now edit only the `economics {}` block.

## 7. The moved rows (NOT recorded; Vítor's list)

`ammonia02_full_plant` (declares `capitalSchedule ( 0.6 0.4 )`, CAPCOST's
example, labelled an author-set assumption):
* `kpi economics NPV` 103 568 804.819 -> 100 252 472.54 -- 60 % of the FCI is
  now spent a year before start-up and compounded by 1.1: the difference is
  exactly 0.6 x 0.1 x FCI = 3 316 332;
* `kpi economics IRR` 0.341648 -> 0.293506 -- the same cash flows over a
  longer investment;
* `kpi economics paybackYears` 3.584 -> 3.805 -- the compounded capital takes
  longer to recover.

`greenAmmoniaBasicDesign` (declares N = 3, `( 0.25 0.45 0.30 )`,
`( 0.70 0.90 )`, 0.08 -- all labelled author-set assumptions):
* `kpi economics NPV` -328 925 057.033 -> -329 516 187.135 -- the plant loses
  money every operating year (COM_d 428.3 M against revenue 387.7 M), so the
  ramp-up REDUCES the early losses (variable costs scale down) while the
  compounded construction capital and the 4.33 M start-up cost add to them;
  the net is a small move.  IRR and payback were and stay undefined.

## 8. Not done

* A ramped working capital; a ramp-up that degrades yield.  (Land as a
  year-0 item was listed here as not done; it was BUILT on 2026-10-17,
  DEV.md 4c C82, at CAPCOST's own placement -- see
  `a-plant-layout-is-declared-and-checked.md` section 12.)
* CAPCOST's COM_d coefficient for labour is 2.76 (cell C34) where this pass
  uses 2.73; the difference was found while reading the sheet and is NOT
  touched here -- it would move every economics golden.
* The book's chapter and a second textbook were not read; the
  start-up-cost and ramp-up conventions rest on the reasoning above, not on
  a source.
