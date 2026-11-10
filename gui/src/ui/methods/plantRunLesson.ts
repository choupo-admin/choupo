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
  What a plant costs to run, and when it pays -- the lesson
  (commission C212, item B).

  THE TASK, in one sentence (CLAUDE.md section 10): a student who has the
  mass and energy balance of a plant, and an investment, must be able to turn
  them into a cost of production, a cash flow and a verdict -- and know, line
  by line, which factor is theirs to declare, which book tabulates it,
  and which part Choupo computes and which part it does not.

  Written in our own words from open or primary sources; nothing is taken
  from lecture material.  The plant is an illustration and so is every
  number that is not an engine line with its file and line.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";

export const PLANT_RUN_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "The cost of production, line by line, and Choupo's three-term version of it",
    body: "The cost of production is what it costs to make the product for "
      + "a year, before the plant is paid for. It is built in four groups: "
      + "direct costs (what changes with the quantity made and with the "
      + "crew: raw materials, which come from the mass balance and never "
      + "from a percentage; labour; supervision; utilities; maintenance; "
      + "operating supplies; royalties; catalysts and solvents; laboratory), "
      + "indirect costs (the plant overhead), fixed costs (depreciation, "
      + "local taxes, insurance, rent) and general expenses (administration, "
      + "distribution and selling, research), with the cost of borrowing "
      + "added at the end. Each line outside the mass balance is a factor "
      + "times a base, and the factor is yours: the table points to the "
      + "book that tabulates it (a pointer, not a number: read it there and "
      + "declare your value with that source). Choupo does it in three terms: a fraction of the "
      + "fixed capital, a multiple of the labour bill and a multiple of the "
      + "bills for materials and utilities (Turton's form). The two are "
      + "set side by side on one plant below, and the difference is "
      + "explained term by term; it is not an error in either.",
    formula: String.raw`T=\frac{A}{1-s-r}\qquad \mathrm{COM}_d=0.180\,I+2.73\,C_{OL}+1.23\,(C_{RM}+C_{UT}+C_{WT})`,
    where: [
      { sym: "T", means: "cost of production: every line below, depreciation included, financing not", unit: "million EUR per year" },
      { sym: "A", means: "the sum of every line that is not itself a fraction of T", unit: "million EUR per year" },
      { sym: "s", means: "distribution and selling, as a fraction of T" },
      { sym: "r", means: "research and development, as a fraction of T" },
      { sym: "\\mathrm{COM}_d", means: "the engine's cost of manufacture without depreciation", unit: "million EUR per year" },
      { sym: "I", means: "fixed capital investment", unit: "million EUR" },
      { sym: "C_{OL}", means: "cost of operating labour: the hired crew times the wage", unit: "million EUR per year" },
      { sym: "C_{RM}", means: "cost of raw materials, from the mass balance times the price", unit: "million EUR per year" },
      { sym: "C_{UT}", means: "cost of utilities", unit: "million EUR per year" },
      { sym: "C_{WT}", means: "cost of waste treatment; the engine sets it to zero", unit: "million EUR per year" },
    ],
  },
  {
    n: 2,
    title: "Labour by shifts: operators on duty are not operators on the payroll",
    body: "A post that must be staffed during every hour the plant runs "
      + "needs more than one person, because a person works about 1960 h a "
      + "year (49 weeks of 40 h in the engine's default) and the post has "
      + "to be covered for the hours the plant works. The post is staffed "
      + "for the shifts you choose: one shift a day, two, or three, on the "
      + "days a year the plant operates. Divide the hours the post is "
      + "covered by the hours one person works and round the crew up. "
      + "Round the clock, 8760 h, that is 4.47 people per post; Choupo "
      + "uses 4.5 for every plant, and applies it to the operators per "
      + "shift from Turton's correlation or from a crew you declare. The "
      + "wage is the loaded cost of an hour paid, so the labour bill is the "
      + "crew times the wage times the hours paid.",
    formula: String.raw`H_{post}=n_{s}\,h_{s}\,D\qquad N_{hired}=\left\lceil N_{shift}\,\frac{H_{post}}{H_{op}}\right\rceil\qquad C_{OL}=N_{hired}\,w\,H_{op}`,
    where: [
      { sym: "H_{post}", means: "hours a year a post must be staffed", unit: "hour per year" },
      { sym: "n_{s}", means: "shifts worked per day" },
      { sym: "h_{s}", means: "hours in a shift", unit: "hour" },
      { sym: "D", means: "days a year the plant operates", unit: "day per year" },
      { sym: "N_{hired}", means: "operators on the payroll" },
      { sym: "N_{shift}", means: "operators needed on duty during a shift" },
      { sym: "H_{op}", means: "hours one operator is paid for in a year", unit: "hour per year" },
      { sym: "w", means: "loaded wage per hour paid", unit: "EUR per hour" },
    ],
  },
  {
    n: 3,
    title: "Depreciation by asset class, against one straight line",
    body: "Depreciation is not a payment; it is the part of the cost of "
      + "the plant the tax rules let you charge to each year. Charged to "
      + "the year, it lowers the taxable income, so it saves tax, and the "
      + "cash flow gets the depreciation back. Different assets are "
      + "written off over different lives: engineering and start-up in a "
      + "few years, equipment in about ten, buildings in decades, and the "
      + "last two may keep a residual value. The lives and the residuals "
      + "are set by the tax rules of the country and the year; the page "
      + "gives illustrations, and you declare yours. Writing the whole plant "
      + "off over one life, as Choupo does, is simpler and changes when the "
      + "tax is saved, not the total: the sooner the shield, the more it "
      + "is worth at a positive discount rate. Choupo has straight line "
      + "only; any other word is announced and straight line is used.",
    formula: String.raw`d_{j}=\sum_{k}\frac{I_{k}\,(1-\rho_{k})}{L_{k}}\;[\,j\le L_{k}\,]\qquad \mathrm{PV}_{shield}=\sum_{j}\frac{t\,d_{j}}{(1+i)^{j}}`,
    where: [
      { sym: "d_{j}", means: "depreciation charged in year j", unit: "million EUR per year" },
      { sym: "k", means: "an asset class" },
      { sym: "I_{k}", means: "cost of the assets of class k", unit: "million EUR" },
      { sym: "\\rho_{k}", means: "residual value of class k, as a fraction of its cost" },
      { sym: "L_{k}", means: "depreciation life of class k", unit: "year" },
      { sym: "j", means: "year, counted from the start of operation" },
      { sym: "\\mathrm{PV}_{shield}", means: "present value of the tax saved by depreciating", unit: "million EUR" },
      { sym: "t", means: "tax rate on taxable income" },
      { sym: "i", means: "discount rate" },
    ],
  },
  {
    n: 4,
    title: "Fixed and variable costs, and the capacity at which the plant breaks even",
    body: "Some costs do not move with the quantity made (the crew, the "
      + "maintenance, the depreciation, the taxes); others do (raw "
      + "materials, utilities, catalysts, a royalty on sales). Draw sales "
      + "and the total cost against the fraction of the capacity that is "
      + "sold: the lines cross at the break-even capacity, the fraction "
      + "below which the plant loses money. There are three of them and "
      + "they are not the same number: on the total cost with depreciation "
      + "(accounting), on the cash cost without it (cash), and the fraction "
      + "at which the NPV is zero. Quote which. The last one must use the "
      + "same revenue and costs as the NPV (this is class 2 of the page on "
      + "ways an economics goes wrong): put the break-even back in the NPV "
      + "and it must return zero, which the page does. Choupo computes both "
      + "when the case declares `breakEven {}`: the operating one, with the "
      + "fixed and variable costs it used printed, and the NPV one, found by "
      + "pricing the same appraisal again; it ships no verdict.",
    formula: String.raw`x^{*}=\frac{F}{S-V}\qquad F=C(0)\qquad V=C(1)-C(0)`,
    where: [
      { sym: "x^{*}", means: "break-even capacity: the fraction of the design production at which sales equal the total cost" },
      { sym: "F", means: "the part of the total cost that does not move with the quantity: the cost at zero sales", unit: "million EUR per year" },
      { sym: "S", means: "sales at full capacity", unit: "million EUR per year" },
      { sym: "V", means: "the part of the total cost that grows from zero to full capacity", unit: "million EUR per year" },
      { sym: "C(x)", means: "total cost of production when a fraction x of the capacity is sold", unit: "million EUR per year" },
    ],
  },
  {
    n: 5,
    title: "The cash flow, the discount rate, and what NPV, IRR and payback say",
    body: "Each year: sales less the cost of production is the gross "
      + "profit; tax is charged on what is left after depreciation; "
      + "depreciation, which was never paid, comes back; the investment and "
      + "the working capital go out at the start and the working capital "
      + "(and, taxed, the salvage) return at the end. Discount each year to "
      + "now: the sum is the NPV, the discount rate at which it is zero is "
      + "the IRR, and the discounted payback is the year in which the "
      + "running total of discounted flows turns positive. The discount "
      + "rate is yours: it can be built from a risk-free component and a "
      + "risk premium, and the components multiply, not add; if the flows "
      + "are in current prices, inflation is a component too, and if they "
      + "are in constant prices it is not. This is what Choupo's appraisal "
      + "computes (it has more besides: a construction schedule, a ramp-up "
      + "and financing).",
    formula: String.raw`C_{j}=(S-K-d_{j})(1-t)+d_{j}\qquad \mathrm{NPV}=-(I+W)+\sum_{j=1}^{n}\frac{C_{j}}{(1+i)^{j}}+\frac{W+\sigma\,I\,(1-t)}{(1+i)^{n}}\qquad 1+i=(1+T_{1})(1+T_{2})`,
    where: [
      { sym: "C_{j}", means: "after-tax cash flow of operating year j", unit: "million EUR per year" },
      { sym: "S", means: "sales of the year", unit: "million EUR per year" },
      { sym: "K", means: "cash cost of production of the year: the cost without depreciation and financing", unit: "million EUR per year" },
      { sym: "d_{j}", means: "depreciation charged in year j", unit: "million EUR per year" },
      { sym: "t", means: "tax rate on taxable income" },
      { sym: "\\mathrm{NPV}", means: "net present value at the discount rate", unit: "million EUR" },
      { sym: "I", means: "fixed capital investment, paid at year 0", unit: "million EUR" },
      { sym: "W", means: "working capital, paid at year 0 and recovered at the end", unit: "million EUR" },
      { sym: "n", means: "project life", unit: "year" },
      { sym: "i", means: "discount rate" },
      { sym: "\\sigma", means: "salvage value recovered at the end, as a fraction of the fixed capital" },
      { sym: "T_{1}", means: "first component of the discount rate, for example the risk-free rate" },
      { sym: "T_{2}", means: "second component, for example the risk premium; inflation when the flows are in current prices" },
    ],
  },
  {
    n: 6,
    title: "Sensitivity: which input moves the answer, and by how much per cent",
    body: "Move one input at a time by the same relative amount, say "
      + "10 %, and read the NPV at each end: the bars, sorted, are the "
      + "tornado. The elasticity puts the bars in one unit: the relative "
      + "change of the NPV for a relative change of the input, so that "
      + "inputs of different kinds (a price, a capital, a rate) can be "
      + "ranked together. Look first at the cost inputs that are "
      + "about a tenth of the cost of production or more; a factor that is "
      + "two per cent of the cost cannot decide the project however hard "
      + "it is argued about. Choupo's `sensitivity {}` block does the same "
      + "one-at-a-time calculation on the inputs the case declares. It "
      + "attaches no probability to any input and is not an uncertainty "
      + "analysis, and neither is this page: inputs move together in "
      + "reality, and a tornado does not.",
    formula: String.raw`E_{x}=\frac{\mathrm{NPV}(x_{0}(1+\delta))-\mathrm{NPV}(x_{0}(1-\delta))}{2\,\delta\;\mathrm{NPV}(x_{0})}`,
    where: [
      { sym: "E_{x}", means: "elasticity of the NPV to the input x: per cent of NPV per per cent of x" },
      { sym: "x_{0}", means: "the value of the input in the base case" },
      { sym: "\\delta", means: "the relative step, for example 0.10 for 10 %" },
      { sym: "\\mathrm{NPV}(x)", means: "net present value when the input has the value x and everything else is as in the base case", unit: "million EUR" },
    ],
  },
  {
    n: 7,
    title: "The market arithmetic that feeds the price and the volume",
    body: "A price or a cost quoted for another year must be brought to "
      + "the price level of the year of the analysis before it is used: "
      + "multiply by the ratio of a price index now to the index in the "
      + "year of the quotation (for equipment, a plant-cost index; the "
      + "page does not give one, you declare yours with its source). A "
      + "figure in another currency is multiplied by a rate you declare "
      + "and date. The market a plant can supply is first estimated from "
      + "apparent consumption, production plus imports minus exports; "
      + "customs data are often FOB (free on board, at the exporter's "
      + "port) and the buyer pays CIF (cost, insurance, freight), so the "
      + "uplift for freight and insurance, which you declare, is added "
      + "before comparing with a delivered price. The unit gross margin, "
      + "the price less the raw-material cost per unit, is the first "
      + "check that a product is worth making at all. For the volume "
      + "forecast itself, see the demand-forecast page.",
    formula: String.raw`P_{now}=P_{x}\,\frac{J_{now}}{J_{x}}\qquad A=Q+M-X\qquad P_{CIF}=P_{FOB}\,(1+\phi+\nu)\qquad g=p-\frac{C_{RM}}{N}`,
    where: [
      { sym: "P_{now}", means: "a price or cost brought to the price level of the year of the analysis" },
      { sym: "P_{x}", means: "the price or cost as quoted in year x" },
      { sym: "J_{now}", means: "price index in the year of the analysis" },
      { sym: "J_{x}", means: "price index in the year of the quotation" },
      { sym: "A", means: "apparent consumption of the market", unit: "tonne per year" },
      { sym: "Q", means: "domestic production", unit: "tonne per year" },
      { sym: "M", means: "imports", unit: "tonne per year" },
      { sym: "X", means: "exports", unit: "tonne per year" },
      { sym: "P_{CIF}", means: "price delivered, with cost, insurance and freight" },
      { sym: "P_{FOB}", means: "price free on board at the exporter's port" },
      { sym: "\\phi", means: "freight, as a fraction of the FOB price; declared" },
      { sym: "\\nu", means: "insurance, as a fraction of the FOB price; declared" },
      { sym: "g", means: "unit gross margin", unit: "EUR per unit" },
      { sym: "p", means: "selling price", unit: "EUR per unit" },
      { sym: "C_{RM}", means: "raw-material bill of the year", unit: "EUR per year" },
      { sym: "N", means: "units sold in the year", unit: "unit per year" },
    ],
  },
  {
    n: 8,
    title: "What this page does not say",
    body: "It is not financial or legal advice. The plant, its prices, its "
      + "wages, its tax rate and its discount rate are round numbers that "
      + "show the arithmetic; they are not a market study, a quotation or "
      + "a Choupo run. A factor's starting value is an illustration, not the value of a typical "
      + "chemical plant and says nothing about yours. A one-at-a-time "
      + "sensitivity is not a measure of risk. The itemised cost is not "
      + "what Choupo computes, and the two are shown side by side on "
      + "purpose, so that you can see what each includes.",
  },
];

export const PLANT_RUN_QUIZ: readonly QuizQuestion[] = [
  {
    id: "crew-hired",
    q: "A plant needs 6 operators on duty and works 3 shifts of 8 h on 330 days. One operator is paid 1960 h a year. How many operators are on the payroll?",
    options: [
      "6, the number on duty in a shift",
      "18, three crews of six",
      "25: the posts are staffed 7920 h a year, 7920/1960 = 4.04 people per post, 6 x 4.04 = 24.2, rounded up",
      "36, to cover sickness",
    ],
    correct: 2,
    feedback: "The crew follows from the hours a post must be covered and the "
      + "hours one person works, not from the number of shifts. Round the "
      + "clock, 8760 h, it would be 4.47 per post; Choupo uses 4.5.",
    steps: [2],
    origins: ["assumption"],
  },
  {
    id: "turton-vs-itemised",
    q: "The itemised cost without depreciation and the engine's COM_d come out 6 million apart on the same plant. What is the right conclusion?",
    options: [
      "One of them has an error and must be corrected",
      "They group the same bills differently: the engine charges a fixed fraction of the capital, multiples of the labour and of the bills, and has no waste term; the difference is read term by term",
      "The itemised one is always the larger",
      "COM_d includes depreciation and the itemised one does not",
    ],
    correct: 1,
    feedback: "COM_d is 0.180 I + 2.73 C_OL + 1.23 (C_RM + C_UT + C_WT) and "
      + "excludes depreciation; the factors stand for what the itemised "
      + "lines add up to on a typical plant. Neither is more correct; the "
      + "page shows each term of one against the group of lines it stands for.",
    steps: [1],
  },
  {
    id: "dep-classes",
    q: "A plant is written off over classes (3, 10 and 25 years) instead of one 10-year straight line. At a positive discount rate, what changes?",
    options: [
      "The total depreciated changes",
      "Nothing: the tax saved is the same",
      "When the tax is saved changes, so the present value of the tax shield changes; the total depreciated up to the residuals does not",
      "The NPV before tax changes",
    ],
    correct: 2,
    feedback: "Depreciation moves tax between years. Money saved earlier is "
      + "worth more, so the order matters at i > 0. Choupo writes the whole "
      + "plant off over one life, straight line.",
    steps: [3],
  },
  {
    id: "break-even-npv",
    q: "A report finds a break-even capacity of 40 % but the plant is just break-even in NPV at 61 %. Which is the more likely reason?",
    options: [
      "The NPV is wrong",
      "The 40 % is on cash cost without depreciation, or on another revenue; the NPV break-even carries the capital and the time value",
      "Break-even capacities are always lower than 61 %",
      "Tax makes the NPV break-even lower",
    ],
    correct: 1,
    feedback: "Quote which break-even is meant. The accounting one includes "
      + "depreciation, the cash one does not, and the NPV one also pays for "
      + "the capital at the discount rate. Put any of them back in the cash "
      + "flow it came from: only the last one returns an NPV of zero.",
    steps: [4],
  },
  {
    id: "rate-composition",
    q: "A risk-free component of 3 % and a risk premium of 6 % give a discount rate of what?",
    options: [
      "9 %, the sum",
      "9.18 %, since 1.03 x 1.06 - 1 = 0.0918",
      "18 %, the product of the percentages",
      "3 %, the lower",
    ],
    correct: 1,
    feedback: "The components multiply: (1 + T1)(1 + T2) = 1 + i. With flows "
      + "in current prices inflation is one more factor; in constant prices "
      + "it is left out.",
    steps: [5],
    origins: ["assumption"],
  },
  {
    id: "elasticity",
    q: "An elasticity of NPV to the selling price of 5 and to the fixed capital of -1.6 means what?",
    options: [
      "The capital matters more than the price",
      "A 1 % rise in the price raises the NPV by about 5 %, a 1 % rise in the capital lowers it by about 1.6 %; the price is the bigger lever for this plant",
      "Both are errors, elasticities lie between -1 and 1",
      "The NPV is 5 million",
    ],
    correct: 1,
    feedback: "Elasticity is the per cent change of the NPV per per cent "
      + "change of the input. It is not a probability and not a size of "
      + "uncertainty: a lever can be large and still well known.",
    steps: [6],
  },
  {
    id: "index",
    q: "A cost of 10 in a year when the index was 400 is brought to a year when it is 500. What is the new cost?",
    options: ["8", "12.5", "10", "50"],
    correct: 1,
    feedback: "cost x index_now / index_then = 10 x 500/400 = 12.5. Using "
      + "the ratio the wrong way round lowers a cost that has risen.",
    steps: [7],
  },
];

export const PLANT_RUN_LIMITS: readonly LessonLimit[] = [
  {
    id: "illustrations",
    title: "The numbers on this page are illustrations.",
    body: "The plant, its prices, wages, tax rate and discount rate are "
      + "round numbers chosen to show the arithmetic. The only numbers that "
      + "are not are the engine's coefficients, each with the line of the "
      + "engine it was read at. The factors of the cost of production carry a "
      + "pointer to the book that tabulates them and no range: a range "
      + "recalled and not checked against the book would be falsely sourced.",
  },
  {
    id: "engine",
    title: "Choupo computes less than this page does.",
    body: "Choupo has Turton's three-term cost of manufacture, a crew from "
      + "a correlation or a declaration, straight-line depreciation over "
      + "one life, the cash flow, NPV, IRR, paybacks and a one-at-a-time "
      + "sensitivity, and, when the case declares them, a break-even, a "
      + "royalty charged inside a declared patent window, a building cost "
      + "from the rooms' areas and the working capital by three methods. "
      + "It has no itemised cost of production and no depreciation by "
      + "asset class.",
  },
  {
    id: "not-advice",
    title: "Not financial or legal advice; one at a time is not risk.",
    body: "Depreciation lives, tax rates and royalties are set by the "
      + "rules and contracts that apply to you, which the page cannot "
      + "know. A tornado moves one input at a time and attaches no "
      + "probability to any of them; it ranks levers, it does not "
      + "measure risk.",
  },
];
