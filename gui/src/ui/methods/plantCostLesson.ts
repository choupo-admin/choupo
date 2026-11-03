/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  What a plant costs to build -- the lesson (DEV.md 4c C212 A).

  THE TASK, in one sentence (CLAUDE.md section 10): a student who has a list
  of equipment and must put a number on the capital to build the plant sees
  four ways of getting it (a multiplier, a factored estimate, the engine's
  bare-module route, an itemised build-up), the working capital three ways,
  and a loan, each as an editable calculation, and sees that the spread
  between methods is the lesson.

  Every default number is an ILLUSTRATION.  The only numbers that are not are
  Lang's three factors (his papers are cited) and the engine's constants
  (file and line); no typical range is printed, only a pointer to the
  chapter that tabulates each fraction.  The engine facts are held to their source lines by
  tests/plantCost.test.ts.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";

export const PLANT_COST_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A capital cost is an estimate, and its class says how good",
    body: "Before the plant exists, what it costs to build is an estimate, "
      + "and an estimate is classified by how much of the design has been "
      + "drawn: the earlier the stage, the wider the band around the number. "
      + "The methods on this page (a multiplier on the purchased equipment, "
      + "a factored estimate, the bare-module route) belong to the early "
      + "classes; none of them is a quotation. Their use is to put a "
      + "defensible number on the capital, and to show how far apart "
      + "defensible numbers can be. The classes themselves, and what each "
      + "stage of design decides, are on the Front-End Loading page; they "
      + "are not repeated here.",
    leadsTo: {
      tool: "front-end-loading",
      toolLabel: "Front-End Loading: how industry stages a design",
      stepTitle: "An estimate class is defined by what has been drawn",
      body: "The class of an estimate, its accuracy band and the stage at "
        + "which it is made.",
    },
  },
  {
    n: 2,
    title: "Lang's method: fixed capital is a multiple of the purchased equipment",
    body: "Lang proposed that the fixed capital of a process plant is its "
      + "purchased equipment cost times a single number that depends on the "
      + "kind of process: 3.10 for a plant that processes solids, 3.63 for "
      + "solids with fluids, 4.74 for fluids (H. J. Lang, Chem. Eng. 54(10) "
      + "117 (1947), and 55(6) 112 (1948)). Fluids need more piping, "
      + "instruments and structure per euro of machine, so the multiplier "
      + "rises. It is the quickest estimate there is, and its price is that "
      + "it hides everything it adds. Choupo's engine prints the same "
      + "multiplier as a cross-check line: 3.63 times the sum of the "
      + "purchased costs, labelled as not used in the fixed capital "
      + "(EconomicsPass.cpp:2696-2697; the print is at line 3219). The "
      + "factor can be declared as langFactor.",
    formula: String.raw`F_{\mathrm{L}}=K\,C_{\mathrm{Be}}`,
    where: [
      { sym: "F_{\\mathrm{L}}", means: "fixed capital by Lang's method", unit: "million EUR" },
      { sym: "K", means: "Lang factor for the type of process: 3.10 solids, 3.63 solids with fluids, 4.74 fluids" },
      { sym: "C_{\\mathrm{Be}}", means: "purchased cost of the equipment, delivered", unit: "million EUR" },
    ],
  },
  {
    n: 3,
    title: "The factored estimate: every addition is a fraction you declare",
    body: "Open Lang's multiplier up and you get a factored, or percentage, "
      + "estimate. The direct costs are the equipment plus what it takes to "
      + "put it to work: installation, piping, instrumentation, electrical "
      + "work, buildings, yard improvements, land, service facilities and "
      + "insulation, each a fraction f of the purchased equipment cost. The "
      + "indirect costs (engineering and supervision, construction "
      + "expenses, the contractor's fee, the contingency) are fractions g "
      + "of the direct cost. Every fraction is YOUR input. Beside each "
      + "direct input the page prints a pointer, without a number, to the "
      + "chapter that tabulates it (Peters, Timmerhaus & West, ch. 6, by "
      + "type of process): read it there and declare your value with "
      + "that source. The page prints no typical range, because a range not "
      + "checked against its book would be a source it does not have. The "
      + "defaults the knobs start from are illustrations.",
    formula: String.raw`D=C_{\mathrm{Be}}\left(1+\sum_{i}f_i\right)\qquad I=D\sum_{j}g_j\qquad F_{\mathrm{f}}=D+I`,
    where: [
      { sym: "D", means: "direct costs of the plant", unit: "million EUR" },
      { sym: "C_{\\mathrm{Be}}", means: "purchased cost of the equipment, delivered", unit: "million EUR" },
      { sym: "f_i", means: "direct item i (installation, piping, ...) as a fraction of C_Be" },
      { sym: "I", means: "indirect costs", unit: "million EUR" },
      { sym: "g_j", means: "indirect item j (engineering, construction expenses, fee, contingency) as a fraction of the direct cost" },
      { sym: "F_{\\mathrm{f}}", means: "fixed capital by the factored estimate", unit: "million EUR" },
    ],
  },
  {
    n: 4,
    title: "Choupo's own route, and three numbers that disagree",
    body: "Choupo does not use a plant-wide multiplier. It sizes each item, "
      + "prices it by a correlation as a purchased cost Cp, multiplies by "
      + "that item's bare-module factor (the installation, piping and "
      + "instruments that kind of item brings with it) to get C_BM, and "
      + "each item's total module cost is 1.18 times that (contingency "
      + "and fee: CostingModel.H:69, used at Turton.cpp:722). The fixed "
      + "capital is then 1.18 times the sum of the C_BM plus a site "
      + "factor, default 0.50, times the sum of the base-case C_BM, for "
      + "the site development and the auxiliary facilities "
      + "(EconomicsPass.cpp:2690, the default at :2553). On this page the "
      + "items are at base conditions, so the base-case sum equals the "
      + "C_BM sum; the engine takes each item's material and pressure "
      + "factors into account and the page does not. The equipment list "
      + "below is invented, an illustration with no vendor and no "
      + "quotation. The three methods give three different fixed capitals "
      + "for it. They are different methods, with different inputs, built "
      + "for different stages: the spread between them is not an error to "
      + "remove but the honest size of the uncertainty at this stage.",
    formula: String.raw`C_{\mathrm{BM}}=\sum_{k}C_{p,k}F_{\mathrm{BM},k}\qquad F_{\mathrm{e}}=a\,C_{\mathrm{BM}}+b\,C_{\mathrm{BM},0}\qquad \sigma=\frac{\max(F_{\mathrm{L}},F_{\mathrm{f}},F_{\mathrm{e}})}{\min(F_{\mathrm{L}},F_{\mathrm{f}},F_{\mathrm{e}})}`,
    where: [
      { sym: "C_{\\mathrm{BM}}", means: "sum of the bare-module costs of the items", unit: "million EUR" },
      { sym: "C_{p,k}", means: "purchased cost of item k", unit: "million EUR" },
      { sym: "F_{\\mathrm{BM},k}", means: "bare-module factor of item k: installed cost over purchased cost" },
      { sym: "F_{\\mathrm{e}}", means: "fixed capital by the bare-module route", unit: "million EUR" },
      { sym: "a", means: "contingency and fee multiplier on C_BM: 1.18 in the engine" },
      { sym: "b", means: "site factor on the base-case bare-module sum: 0.50 in the engine" },
      { sym: "C_{\\mathrm{BM},0}", means: "bare-module sum at base conditions (the page sets it equal to C_BM)", unit: "million EUR" },
      { sym: "F_{\\mathrm{L}}", means: "fixed capital by Lang's method (step 2)", unit: "million EUR" },
      { sym: "F_{\\mathrm{f}}", means: "fixed capital by the factored estimate (step 3)", unit: "million EUR" },
      { sym: "\\sigma", means: "spread of the three: the largest over the smallest" },
    ],
  },
  {
    n: 5,
    title: "Working capital: three methods, and the spread printed",
    body: "The fixed capital builds the plant; the working capital keeps it "
      + "running before the first sale pays for anything. Three rules are "
      + "in use. Itemised: what the plant holds and owes, in days: "
      + "raw-material stock at the purchase price, product stock at the "
      + "cost to make it, receivables at the SALES price, a minimum cash "
      + "(zero here, the engine has it), less payables to suppliers; a day "
      + "of an annual figure is 1/365 of it, as in the engine "
      + "(EconomicsPass.cpp:216). A fraction of the annual sales. A "
      + "fraction of the fixed capital (the engine's fallback is 0.15, "
      + "EconomicsPass.cpp:2505). They answer one question and give "
      + "different numbers; the page prints the spread. A book may "
      + "quote working capital as a share of the TOTAL capital investment, "
      + "which is a different base from the fixed capital: a share x of "
      + "the total is x/(1-x) of the fixed (the page converts it; it "
      + "gives no share, declare yours with your source). The itemised "
      + "build-up is the engine's `workingCapital { ... }` model "
      + "(buildWorkingCapital, EconomicsPass.cpp:240; it takes product "
      + "stock from the case's storage tanks, which this page replaces by "
      + "days). The Economics errors page, class 5, shows the same three "
      + "methods differing by an order of magnitude on another plant.",
    formula: String.raw`W_{\mathrm{i}}=\frac{d_{\mathrm{r}}M+d_{\mathrm{p}}K+d_{\mathrm{s}}S+d_{\mathrm{k}}K-d_{\mathrm{y}}M}{365}\qquad W_{\mathrm{S}}=\alpha\,S\qquad W_{\mathrm{F}}=\beta\,F`,
    where: [
      { sym: "W_{\\mathrm{i}}", means: "itemised working capital", unit: "million EUR" },
      { sym: "d_{\\mathrm{r}}", means: "days of raw-material purchases held in stock", unit: "day" },
      { sym: "M", means: "annual raw-material bill", unit: "million EUR per year" },
      { sym: "d_{\\mathrm{p}}", means: "days of product held in stock, valued at cost", unit: "day" },
      { sym: "K", means: "annual cash cost of manufacture, without depreciation", unit: "million EUR per year" },
      { sym: "d_{\\mathrm{s}}", means: "days of sales customers still owe (receivables)", unit: "day" },
      { sym: "S", means: "annual sales at the sales price", unit: "million EUR per year" },
      { sym: "d_{\\mathrm{k}}", means: "days of cash cost held as minimum cash", unit: "day" },
      { sym: "d_{\\mathrm{y}}", means: "days of the raw-material bill still owed to suppliers (payables)", unit: "day" },
      { sym: "W_{\\mathrm{S}}", means: "working capital as a fraction of the sales", unit: "million EUR" },
      { sym: "\\alpha", means: "that fraction of the annual sales" },
      { sym: "W_{\\mathrm{F}}", means: "working capital as a fraction of the fixed capital", unit: "million EUR" },
      { sym: "\\beta", means: "that fraction of the fixed capital" },
      { sym: "F", means: "fixed capital", unit: "million EUR" },
    ],
  },
  {
    n: 6,
    title: "Financing: a loan changes who pays, and adds interest during construction",
    body: "A share of the capital may be borrowed. The equity is the rest. "
      + "During construction the lender pays out in instalments; the "
      + "interest on what has been drawn is not paid in cash but added to "
      + "the balance (the interest during construction, IDC), so the loan "
      + "at start-up is larger than the sum of the draws. In operation the "
      + "interest on the balance is paid every year; the grace years repay "
      + "nothing; then the principal is repaid over the term, either as "
      + "equal total payments (annuity) or equal principal (linear). The "
      + "table below is that schedule year by year. It is the schedule the "
      + "engine writes to reports/economics/financing.csv when a case "
      + "declares financing { } (EconomicsPass.cpp:548): draws at the end "
      + "of each construction year (:1640), construction interest "
      + "capitalised (:1652), interest paid on the opening balance in "
      + "operation (:1673). One difference: the page spreads the draws "
      + "evenly over the construction years, the engine follows the case's "
      + "capital schedule. With a one-year construction the whole outlay "
      + "is made at its end and no interest accrues, as in the engine. The "
      + "engine also shows the equity cash flow and the tax effect, which "
      + "the page does not.",
    formula: String.raw`B_k=B_{k-1}(1+r)+Q_k\qquad A=P\,\frac{r}{1-(1+r)^{-n}}\qquad Y_t=r\,B_{t-1}`,
    where: [
      { sym: "B_k", means: "loan balance at the end of construction year k", unit: "million EUR" },
      { sym: "B_{k-1}", means: "loan balance at the end of the previous construction year", unit: "million EUR" },
      { sym: "r", means: "annual interest rate on the balance" },
      { sym: "Q_k", means: "amount drawn at the end of construction year k: the debt share of the capital outlay of that year", unit: "million EUR" },
      { sym: "A", means: "constant yearly payment of an annuity (interest plus principal)", unit: "million EUR per year" },
      { sym: "P", means: "balance at start-up: draws plus capitalised interest", unit: "million EUR" },
      { sym: "n", means: "repayment years, after the grace years" },
      { sym: "Y_t", means: "interest paid in operating year t", unit: "million EUR per year" },
      { sym: "B_{t-1}", means: "balance at the start of operating year t", unit: "million EUR" },
    ],
  },
  {
    n: 7,
    title: "What this page does not say",
    body: "It is not a risk analysis: it prints no probability and no "
      + "confidence interval, and the spread between methods is not one. A "
      + "factor is not a quote: a fixed capital built from percentages "
      + "stands in for the quotation you do not have yet, and the first "
      + "vendor price replaces the factor, not the other way round. Every "
      + "default number is an illustration; the equipment, the factors "
      + "and the days are round numbers chosen so that each calculation can "
      + "be followed by hand. No typical range is printed, because none "
      + "has been checked against its book. Cost indices, location, currency and year "
      + "are not handled: a cost from an old table must be brought to the "
      + "year and the place of your plant before it is added to anything.",
  },
];

export const PLANT_COST_QUIZ: readonly QuizQuestion[] = [
  {
    id: "lang-hides",
    q: "A plant that processes only solids has purchased equipment of 3.0 million EUR. Lang's solids factor gives what fixed capital, and what does it hide?",
    options: [
      "9.3 million EUR; it hides every addition (installation, piping, buildings, ...) inside one number",
      "3.63 million EUR; it hides nothing",
      "14.2 million EUR; it hides the contingency only",
      "9.3 million EUR; it is a quotation",
    ],
    correct: 0,
    feedback: "3.10 times 3.0 is 9.3 million EUR. The multiplier is the sum of "
      + "all the additions of a typical plant of that kind; it cannot say "
      + "which of them your plant has more or less of.",
    steps: [2],
  },
  {
    id: "factor-base",
    q: "The direct items are fractions of the purchased equipment cost; the indirect items of the direct cost. If you apply the indirect fractions to the equipment cost instead, what happens?",
    options: [
      "Nothing: the base does not matter",
      "The indirect costs are understated, because the direct cost is larger than the equipment cost",
      "The indirect costs are overstated",
      "The fixed capital is unchanged but the working capital changes",
    ],
    correct: 1,
    feedback: "A fraction is only meaningful with its base. The direct cost is "
      + "the equipment times (1 + the sum of the direct fractions), so the "
      + "same fractions on the equipment cost alone give a smaller number.",
    steps: [3],
  },
  {
    id: "spread-lesson",
    q: "The three methods give 9, 11 and 15 million EUR for the same equipment list. What do you do?",
    options: [
      "Report the 11, the middle one",
      "Pick the method whose number suits the result you want",
      "Report the range, say which method is which, and say that at this stage the spread is the size of the uncertainty",
      "Average them and quote three significant figures",
    ],
    correct: 2,
    feedback: "The methods are different, so their disagreement is information "
      + "about the stage of the estimate. Picking one for convenience, or "
      + "averaging, hides it.",
    steps: [4],
  },
  {
    id: "receivables-price",
    q: "Receivables are the sales that customers have not yet paid. At what price are they valued in the itemised working capital?",
    options: [
      "At the cost of manufacture",
      "At the raw-material price",
      "At the sales price",
      "At the fixed capital divided by the life",
    ],
    correct: 2,
    feedback: "The customer owes the sales price of what was delivered, so "
      + "receivables are days of the annual sales, as in the engine's "
      + "build-up. Product in stock, not yet sold, is valued at cost.",
    steps: [5],
  },
  {
    id: "idc",
    q: "A two-year construction draws half the loan at the end of each year at 6 %. What is the loan at start-up?",
    options: [
      "Exactly the sum of the draws",
      "The sum of the draws plus the interest on the first draw for the second year, which is capitalised",
      "The sum of the draws minus the interest",
      "Zero until the plant starts",
    ],
    correct: 1,
    feedback: "The first draw is outstanding during the second year; its interest "
      + "is added to the balance, not paid in cash. The interest on the "
      + "second draw starts in the first operating year.",
    steps: [6],
  },
];

export const PLANT_COST_LIMITS: readonly LessonLimit[] = [
  {
    id: "illustrations",
    title: "The numbers on this page are illustrations.",
    body: "The equipment lists, their costs, the bare-module multipliers, "
      + "the factors, the days, the rates and the loan terms are round "
      + "numbers chosen to be followed by hand. They are not quotations or "
      + "a result of a Choupo run. The only figures that are not "
      + "illustrations are Lang's three factors, the engine's own "
      + "constants (each cited to the line it was read at). Beside the "
      + "direct items the page points to the chapter that tabulates them "
      + "and prints no number.",
  },
  {
    id: "not-risk",
    title: "Not a risk analysis, and a factor is not a quote.",
    body: "The page prints no uncertainty beyond the spread between "
      + "methods. A percentage stands in for a quotation until you have "
      + "one. The engine's per-item materials and pressure factors, the "
      + "year of the cost data and the location are not on the page.",
  },
  {
    id: "ranges",
    title: "The page prints no typical range.",
    body: "A range quoted from memory and not checked against its book "
      + "would be a source the page does not have. For every fraction, "
      + "every day count and every share, read the cited chapter, or "
      + "another source of your own, and declare the value with it. The "
      + "defaults the knobs start from are illustrations, not the "
      + "book's.",
  },
];
