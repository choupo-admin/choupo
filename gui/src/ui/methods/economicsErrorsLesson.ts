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
  Ways a pharmaceutical-plant economics goes wrong -- the lesson
  (commission C210, synthesis item E7).

  THE TASK, in one sentence (CLAUDE.md section 10): a student in a
  pharmaceutical plant-design group has an economics chapter to write and
  must be able to tell, before handing it in, whether each of eight common
  mistakes is in it, and which of them Choupo would have caught.

  The mistakes are error CLASSES met in earlier design reports; no product,
  group or report is named.  The arithmetic is standard (present value,
  straight-line depreciation, tax on taxable income); the guard of each class
  is read from the engine and held to its source by tests/economicsErrors.test.ts.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";

export const ECON_ERRORS_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "An economics chapter is arithmetic, and arithmetic can be wrong without looking wrong",
    body: "The economics of a plant is a chain: what is sold, at what price, "
      + "less what it costs, less tax, discounted. Every link is a standard "
      + "formula, so the mistakes that matter are rarely in a formula; they "
      + "are in what is put into it, and a number out of the wrong units or "
      + "the wrong year looks exactly as plausible as the right one. This "
      + "page takes eight such mistakes, each as a small example you can "
      + "edit: the wrong calculation and the right one on the same inputs, "
      + "side by side, and, under each, what Choupo does about it. Read from "
      + "the engine, the answer is one of four words: it refuses (the run "
      + "stops), it announces (the run goes on and says so), it constructs "
      + "the quantity correctly in one place without comparing it with "
      + "yours, or it does nothing, and then the check is yours. Several "
      + "classes have no guard at all, and the page says so.",
  },
  {
    n: 2,
    title: "1. A sold quantity that is not the plant's production",
    body: "A plant makes at most its design production Q, and a market "
      + "buys at most its demand D, of which a new entrant wins a share s. "
      + "What can be sold is the smaller of the two. Two ways to break it: "
      + "multiply the quantity by a factor chosen so that the plant is full "
      + "(the factor is an assumption about the market, not a property of "
      + "the plant), or read a series in thousands of packs as millions, "
      + "which multiplies everything by 1000 and, because the revenue then "
      + "dwarfs the investment, produces an absurd return. A sold quantity "
      + "above Q is impossible whatever the market, and it is the first "
      + "thing to test.",
    formula: String.raw`N=\min\!\big(Q,\;D\,s\big)\qquad \varphi_{\mathrm{fill}}=\frac{Q}{D\,s}`,
    where: [
      { sym: "N", means: "quantity the plant can sell", unit: "million packs per year" },
      { sym: "Q", means: "design production of the plant", unit: "million packs per year" },
      { sym: "D", means: "demand of the market for the product", unit: "million packs per year" },
      { sym: "s", means: "share of that demand the plant can win" },
      { sym: "\\varphi_{\\mathrm{fill}}", means: "the factor that would be needed to make the share fill the plant: a number to be argued, not applied" },
    ],
  },
  {
    n: 3,
    title: "2. One quantity, two revenues: the break-even is not the NPV's",
    body: "The break-even is the quantity at which the project just pays "
      + "for itself. If the net present value is computed at one price and "
      + "the break-even at another (a price taken from a different table, a "
      + "different year, a different packaging), the two statements are "
      + "about two different plants: the NPV can be strongly positive while "
      + "the break-even says the plant must sell more than it sells. The "
      + "test is a single line: put the break-even quantity back into the "
      + "NPV; it must return zero. The annual after-tax cash flow below is "
      + "the one the next class uses.",
    formula: String.raw`C=\big[(p-v)N-F-d\big](1-t)+d\qquad \mathrm{NPV}=-I+C\,a\qquad N^{*}=\frac{\left(\dfrac{I}{a}-d\right)\dfrac{1}{1-t}+F+d}{p-v}`,
    where: [
      { sym: "C", means: "annual after-tax cash flow", unit: "million EUR per year" },
      { sym: "p", means: "price per pack", unit: "EUR per pack" },
      { sym: "v", means: "variable cost per pack", unit: "EUR per pack" },
      { sym: "F", means: "fixed annual costs without depreciation", unit: "million EUR per year" },
      { sym: "d", means: "annual depreciation, straight line: the investment divided by the depreciable life", unit: "million EUR per year" },
      { sym: "t", means: "tax rate on taxable income" },
      { sym: "I", means: "fixed capital investment, paid at year 0", unit: "million EUR" },
      { sym: "a", means: "present value factor of L equal yearly payments at the discount rate" },
      { sym: "\\mathrm{NPV}", means: "net present value at the discount rate", unit: "million EUR" },
      { sym: "N^{*}", means: "the quantity at which the NPV is zero, at the price p", unit: "million packs per year" },
    ],
  },
  {
    n: 4,
    title: "3. The tax is charged on taxable income, not on sales",
    body: "A company pays tax on what is left after it has deducted "
      + "what the sales cost to make and the depreciation of the plant. "
      + "Charging the rate on sales instead takes tax on money that never "
      + "was profit: with a 21 % rate it takes a fifth of the sales whatever the "
      + "margin, which on a margin of twenty or thirty per cent is most or "
      + "all of the operating profit, and the "
      + "project looks like a loser, or, with the rate typed in the wrong "
      + "place, like a winner. The depreciation is deducted for tax but is "
      + "not a cash payment, so it comes back into the cash flow.",
    formula: String.raw`T=t\,\big(S-K-d\big)\qquad C=S-K-T`,
    where: [
      { sym: "T", means: "tax paid in the year", unit: "million EUR per year" },
      { sym: "S", means: "sales of the year: the price times the quantity", unit: "million EUR per year" },
      { sym: "K", means: "cost of manufacture of the year without depreciation: variable plus fixed costs", unit: "million EUR per year" },
    ],
  },
  {
    n: 5,
    title: "4. A royalty is paid while a licensed patent covers the product",
    body: "A royalty is a payment for the right to use a protected "
      + "invention. Once the patent has expired nothing is owed, and a "
      + "generic plant designed for the day of expiry owes none at all; "
      + "charging it for the whole life of the project subtracts a cost "
      + "that does not exist. The opposite error is as common: a royalty "
      + "at a rate looks like a cost of doing business, but if the patent "
      + "is live and you hold no licence, the product cannot lawfully be "
      + "sold, and no royalty line repairs that. The royalty is sales "
      + "times the rate, for the years in which a licence you hold applies.",
    formula: String.raw`R_j=r\,S\quad (j\le E),\qquad R_j=0\quad (j>E)`,
    where: [
      { sym: "R_j", means: "royalty paid in operating year j", unit: "million EUR per year" },
      { sym: "r", means: "royalty rate on net sales, from the licence you hold" },
      { sym: "j", means: "operating year, 1 to the project life" },
      { sym: "E", means: "number of operating years in which the licensed patent is still in force; 0 when it has expired before the launch" },
    ],
  },
  {
    n: 6,
    title: "5. Working capital: three methods, three very different numbers",
    body: "The money tied up in running the plant (raw material in stock, "
      + "customers who have not paid, cash kept for wages, less what "
      + "suppliers have not been paid yet) is the working capital. Three "
      + "rules are in use: a fraction of the fixed capital, a fraction of "
      + "the annual sales, and a build-up from days of stock, receivables, "
      + "cash and payables. They answer the same question with numbers "
      + "that can differ by a large factor, and picking whichever suits the "
      + "result is a choice about the result. It is invested at the start "
      + "and recovered at the end, so what it costs the NPV is only its "
      + "time value, which the page shows apart from its size.",
    formula: String.raw`W_A=\alpha\,I\qquad W_B=\beta\,S\qquad W_C=\frac{\delta_s M+\delta_r S+\delta_c K-\delta_p M}{365}`,
    where: [
      { sym: "W_A", means: "working capital as a fraction of the fixed capital", unit: "million EUR" },
      { sym: "W_B", means: "working capital as a fraction of the annual sales", unit: "million EUR" },
      { sym: "W_C", means: "working capital built up from days of stock, receivables and cash, less payables", unit: "million EUR" },
      { sym: "\\alpha", means: "fraction of the fixed capital, method A" },
      { sym: "\\beta", means: "fraction of the annual sales, method B" },
      { sym: "M", means: "annual purchases of raw material", unit: "million EUR per year" },
      { sym: "\\delta_s", means: "days of raw material held in stock", unit: "day" },
      { sym: "\\delta_r", means: "days of sales that customers still owe", unit: "day" },
      { sym: "\\delta_c", means: "days of cost of manufacture kept as cash", unit: "day" },
      { sym: "\\delta_p", means: "days of raw-material purchases not yet paid to suppliers", unit: "day" },
    ],
  },
  {
    n: 7,
    title: "6. A discount rate of 40-80 % does not produce an IRR of hundreds of per cent",
    body: "The discount rate is the return you require; it is chosen by "
      + "you, before the calculation, as the return the money could earn "
      + "elsewhere at a comparable risk, and it enters the NPV. The IRR is "
      + "something else: the discount rate at which the NPV of this cash "
      + "flow is zero. It does not depend on the rate you chose. An IRR of "
      + "several hundred per cent therefore says that the cash flow is "
      + "enormous next to the investment, which is almost always a scale "
      + "mistake upstream (class 1), not a feature of the rate. A rate that "
      + "high has its own cost: it discounts the later years to nothing "
      + "and flips the NPV of a sound long project to negative. Draw the "
      + "NPV against the rate and read both off the same curve.",
    formula: String.raw`\mathrm{NPV}(i)=\sum_{j=0}^{L}\frac{C_j}{(1+i)^{j}}\qquad \mathrm{NPV}(i^{\mathrm{IRR}})=0`,
    where: [
      { sym: "i", means: "discount rate: a requirement you set" },
      { sym: "C_j", means: "cash flow at the end of year j; the investment, negative, at j = 0", unit: "million EUR" },
      { sym: "L", means: "project life", unit: "year" },
      { sym: "i^{\\mathrm{IRR}}", means: "internal rate of return: the rate at which this cash flow has zero NPV, a result" },
    ],
  },
  {
    n: 8,
    title: "7. A utility bill 1000 times its own arithmetic: units",
    body: "A price is quoted per unit (per kilowatt-hour, per gigajoule, "
      + "per cubic metre, per litre), and the quantity is measured in "
      + "another. Multiplying a number of litres by a price per cubic "
      + "metre is a factor of 1000 off; a quantity in gigajoules by a "
      + "price per kilowatt-hour is a factor of 278. The bill is the "
      + "quantity converted into the unit the price is quoted in, times the "
      + "price, and a quantity of energy cannot be priced per volume at "
      + "all. The page converts through the SI base unit and refuses to mix "
      + "an energy with a volume.",
    formula: String.raw`B=\frac{q\,f_q}{f_p}\,c`,
    where: [
      { sym: "B", means: "the bill", unit: "EUR" },
      { sym: "q", means: "the quantity, as measured, in its own unit" },
      { sym: "f_q", means: "the quantity's unit in the SI base unit (joule or cubic metre)" },
      { sym: "f_p", means: "the unit the price is quoted per, in the same SI base unit" },
      { sym: "c", means: "the price, per its unit", unit: "EUR per priced unit" },
    ],
  },
  {
    n: 9,
    title: "8. A building cost per square metre five times another's",
    body: "A cost per square metre depends on what the square metre is: a "
      + "classified clean room with its air handling, a warehouse, an "
      + "office; on the year; on whether services and fit-out are in it. "
      + "Two reports quoting 200 and 1000 EUR per m2 for 'the building' "
      + "are not wrong because one is smaller; they are unanswerable "
      + "because neither says what it is. A unit cost is a declaration, "
      + "with its year, its source and the reason it describes this "
      + "building. The total is area times the declared unit cost, and the "
      + "spread between two declarations is the size of the question you "
      + "have to answer in the report.",
    formula: String.raw`C_{\mathrm{b}}=A\,u`,
    where: [
      { sym: "C_{\\mathrm{b}}", means: "building cost", unit: "million EUR" },
      { sym: "A", means: "floor area of the building", unit: "m2" },
      { sym: "u", means: "declared unit cost, with its year, source and reason", unit: "EUR per m2" },
    ],
  },
  {
    n: 10,
    title: "What the guards cover, and what they cannot",
    body: "Look at the guard under each example. Choupo refuses a few "
      + "things that are arithmetically impossible (a ramp above 1, two "
      + "homes for the year's hours, a price with no source). It "
      + "announces a few (an IRR above 200 %, an IRR that may not be "
      + "unique). It computes its own chain correctly in one place and "
      + "writes the lines you can compare yours with. For royalties, for a "
      + "break-even by hand, for the choice of working-capital method, for "
      + "the size of the discount rate and for a unit cost it does not "
      + "judge, and the page says: you must check it. A green run proves "
      + "the engine's chain is consistent; it does not prove the inputs you "
      + "gave it are the inputs of the plant you described.",
  },
];

export const ECON_ERRORS_QUIZ: readonly QuizQuestion[] = [
  {
    id: "sold-min",
    q: "A plant produces 14 million packs a year. The market it can win is 8 million. A report sells 14 million 'to fill the plant'. What is wrong?",
    options: [
      "Nothing: a plant is built to be filled",
      "The sold quantity is set by the plant, but the market buys 8 million; filling the plant is a factor to argue (here 1.75), not a quantity to book",
      "The price should be lowered by 1.75",
      "The plant should be 8 times bigger",
    ],
    correct: 1,
    feedback: "What can be sold is the smaller of the plant's production and the "
      + "market's share. The factor that would make the market fill the plant "
      + "is an assumption about the market and has to be argued and shown.",
    steps: [2],
  },
  {
    id: "break-even-back",
    q: "How do you test that a break-even and an NPV describe the same plant?",
    options: [
      "Check that both are positive",
      "Put the break-even quantity into the NPV at the NPV's own price: it must return zero",
      "Compare the discount rate with the tax rate",
      "Check that the payback is under ten years",
    ],
    correct: 1,
    feedback: "The break-even is defined as the quantity that makes the NPV "
      + "zero. If the NPV at that quantity is not zero, the two were computed "
      + "from different revenues.",
    steps: [3],
  },
  {
    id: "tax-base",
    q: "Sales are 30 million, cost of manufacture 20 million, depreciation 3 million, tax rate 21 %. How much tax?",
    options: [
      "6.3 million (21 % of sales)",
      "1.47 million (21 % of taxable income 7)",
      "2.1 million (21 % of the operating margin 10)",
      "0, depreciation is not deductible",
    ],
    correct: 1,
    feedback: "Taxable income is 30 - 20 - 3 = 7; 21 % of it is 1.47. The rate "
      + "on sales gives 6.3, more than four times as much.",
    steps: [4],
  },
  {
    id: "royalty-window",
    q: "A generic plant is designed for the day the patent expires. Should the economics carry a royalty on its sales?",
    options: [
      "Yes, at the originator's rate, for the whole life",
      "No: after expiry nothing is owed; and if the patent were still live without your licence, no royalty line would make the sale lawful",
      "Yes, but only half",
      "Yes, as a percentage of the investment",
    ],
    correct: 1,
    feedback: "A royalty is paid for a licensed right that is still in force. "
      + "Choupo charges a declared royalty only in the years of the "
      + "window you declare and refuses a royalty with no end, but it has "
      + "no patent calendar to catch a window declared wrongly or a "
      + "licence you do not hold.",
    steps: [5, 10],
    origins: ["assumption"],
  },
  {
    id: "irr-rate",
    q: "A report discounts at 60 % and gets an IRR of 400 %. What does the IRR tell you about the 60 %?",
    options: [
      "That 60 % was too low",
      "That 60 % produced the 400 %",
      "Nothing: the IRR does not depend on the rate; 400 % says the cash flow is huge against the investment, which points to a scale error upstream",
      "That the NPV is negative",
    ],
    correct: 2,
    feedback: "The IRR is the rate at which this cash flow has zero NPV; it is "
      + "independent of the rate you chose. An IRR far above any plausible "
      + "return is a symptom to trace back to the inputs, the same symptom "
      + "Choupo prints a warning for above 200 %.",
    steps: [7],
  },
  {
    id: "units-bill",
    q: "A pump uses 500 kW for 6000 hours. The tariff is 0.10 EUR per kWh. A report multiplies 10 800 (the energy in GJ) by 0.10. By what factor is the bill wrong?",
    options: [
      "1000",
      "278: one GJ is 277.8 kWh, so the report is low by that factor",
      "3.6",
      "It is right, the energy is in GJ",
    ],
    correct: 1,
    feedback: "The energy is 3 000 000 kWh, so the bill is 300 000 EUR; 10 800 "
      + "x 0.10 gives 1080 EUR. The quantity must be converted into the "
      + "unit the price is quoted in before it is multiplied.",
    steps: [8],
  },
  {
    id: "unit-cost",
    q: "Two reports give 200 and 1000 EUR per m2 for a building. What do you need before you can say which is right?",
    options: [
      "A third report to take the average",
      "What each square metre is (class of room, services in or out), the year, the source and the reason it fits this building",
      "The exchange rate",
      "Nothing: the lower is conservative",
    ],
    correct: 1,
    feedback: "Choupo requires a source and a reason for a declared quote and "
      + "for the land price; it does not compare the values. The declaration "
      + "is what makes a spread something you can resolve.",
    steps: [9],
  },
];

export const ECON_ERRORS_LIMITS: readonly LessonLimit[] = [
  {
    id: "illustrations",
    title: "The numbers on this page are illustrations.",
    body: "The plant, its costs and its prices are round numbers chosen to "
      + "show each mistake; none is a market study, a vendor quotation or a "
      + "result of a Choupo run. The formulas are the standard ones for a "
      + "year-end discounted cash flow with straight-line depreciation, no "
      + "inflation, no financing and no construction period; the engine's "
      + "own appraisal has more (a construction schedule, a ramp-up, "
      + "financing), and the page does not reproduce it.",
  },
  {
    id: "guards",
    title: "The guard under each class is what the engine does, not what a project needs.",
    body: "Each guard cites the engine source it was read from; a guard "
      + "marked as doing nothing means Choupo has no such check today, not "
      + "that the mistake is unimportant. The list of eight classes is not "
      + "the list of all mistakes; it is the list of what earlier reports "
      + "show.",
  },
  {
    id: "not-advice",
    title: "Not financial or legal advice.",
    body: "Whether a royalty is owed, a licence is held or a patent is in "
      + "force is a legal question that the page cannot answer. A discount "
      + "rate is a judgement of risk the page only displays.",
  },
];
