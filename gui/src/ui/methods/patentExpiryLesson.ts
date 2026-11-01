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
  Patent expiry and generic entry -- the lesson (commission C195).

  THE TASK, in one sentence (CLAUDE.md section 10): a student in a
  pharmaceutical plant-design group, whose business case is a generic entrant
  at loss of exclusivity, must decide what volume and what price per year the
  plant's economics should read, and how much of the revenue is at risk if
  the entry is late or the price falls further; the theory (discounting) is
  the economics chapter of the Theory Guide, `ch:economics`.

  Every statement about the engine or the case cites where it was read:
  `rampUp`, `projectLife`, `discountRate`, `streamFactor fromBatchPlan` and
  the single `price` of a product are the grammar of system/postDict and
  constant/economics of tutorials/batch/plant/apalutamide01_tablets
  (src/postProcessing/EconomicsPass.cpp reads `rampUp` as a production
  fraction of the first operating years, each in [0, 1]).  Every number
  about the market is in patentExpiryMath.ts with its origin word, and the
  sources actually read are PATENT_SOURCES there.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";

export const PATENT_NOT_ADVICE =
  "This page is not a freedom-to-operate analysis and not legal advice.  "
  + "Whether a generic may be sold on a given date depends on patents, "
  + "supplementary protection certificates, data and market exclusivity and "
  + "litigation in each country, and only a patent attorney's reading of the "
  + "claims can say.  The apalutamide dossier itself lists the European "
  + "counterparts and their certificates as NOT verified (section 3.6).";

export const PATENT_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "In this industry the patent decides the business case",
    body: "A drug-product plant is a few tens of millions of euros of "
      + "equipment making a tablet whose price is set by something that is "
      + "not the equipment: the calendar of the originator's exclusivity. "
      + "While a patent, a certificate or a regulatory protection holds, the "
      + "originator is the only seller and sets the price; when it ends, "
      + "generic producers enter, the price falls steeply and the volume "
      + "moves from the originator to the generics. A group that designs a "
      + "generic plant is therefore designing for a market that does not "
      + "exist yet, whose size and price on the day of launch are the "
      + "result of this calendar and of how many rivals arrive. The "
      + "apalutamide case states it: the dispersion is claimed by US "
      + "12,303,493 B2 with an anticipated expiry on 3 December 2035 (an "
      + "assumption by Google Patents, not a legal conclusion), and the "
      + "European counterparts and their certificates were not verified. "
      + "The plant is built to launch when exclusivity ends, and year 0 of "
      + "its cash flow is that launch.",
  },
  {
    n: 2,
    title: "What the plant's economics reads from the market",
    body: "The economics block of the case does not model a market. It "
      + "reads a production in kilograms of packaged tablets a year (the "
      + "batch plan's `production`), a fraction of that production reached "
      + "in each of the first operating years (`rampUp`, each between 0 and "
      + "1, one entry per year, 1 afterwards), and ONE price per kilogram "
      + "for the whole life (`price` in constant/economics), and discounts "
      + "every year to the launch at the declared discount rate over "
      + "`projectLife` years. A price that falls year by year cannot be "
      + "written in that grammar. So this page computes the volume and the "
      + "price of each year from the market curves, and then gives the "
      + "pair the grammar can hold: a `rampUp` list that carries the volume "
      + "profile, and the single price that carries the same discounted "
      + "revenue (step 7). The revenue of operating year j is the product of "
      + "what is sold and the price it is sold at.",
    formula: String.raw`R_j = N_j\,p_j`,
    where: [
      { sym: "R_j", means: "revenue of operating year j", unit: "EUR per year" },
      { sym: "N_j", means: "tablets the plant sells in operating year j", unit: "tablets per year" },
      { sym: "p_j", means: "net ex-factory price per tablet in operating year j", unit: "EUR per tablet" },
      { sym: "j", means: "operating year of the cash flow, 1 to the project life (year 0 is the launch)" },
    ],
  },
  {
    n: 3,
    title: "The market the originator leaves behind",
    body: "Start from what the originator sells. Its annual net sales in "
      + "the market divided by its net ex-factory price per tablet give the "
      + "volume of the molecule the market consumes, which the page holds "
      + "constant (a lower price lets more patients afford the medicine, "
      + "and the page does not model that). For apalutamide the dossier "
      + "derives 1039 million EUR a year in Europe from the originator's "
      + "company-wide sales and a European share that is itself an "
      + "estimate, and takes a reference price of 19.13 EUR a tablet, "
      + "which gives about 54 million tablets a year. These are the "
      + "inputs you replace with your own market study; the origin word of "
      + "each is on the page.",
    formula: String.raw`V_0=\frac{S_0}{P_0}`,
    where: [
      { sym: "V_0", means: "volume of the molecule the market consumes before loss of exclusivity", unit: "tablets per year" },
      { sym: "S_0", means: "the originator's annual net sales in the market before loss of exclusivity", unit: "EUR per year" },
      { sym: "P_0", means: "the originator's net ex-factory price per tablet before loss of exclusivity", unit: "EUR per tablet" },
    ],
  },
  {
    n: 4,
    title: "Price erosion is a curve, and there are two ways to index it",
    body: "A generic enters below the originator's price and falls further "
      + "as rivals arrive. The page offers two published readings and "
      + "lets you pick one. The first indexes the price by the NUMBER of "
      + "generic producers: the United States FDA's median generic price "
      + "was 39 % below the brand's pre-entry price with one producer, 54 "
      + "% with two, 79 % with four and more than 95 % with six or more "
      + "(Conrad and Lutter 2019, p. 2; US retail, 2015-2017 entries). The "
      + "second indexes it by TIME since the first generic entry: in the "
      + "European Commission's sector inquiry generics entered about 25 % "
      + "below the originator's price and were 40 % below it after two "
      + "years (EC 2009, p. 1; an average over medicines, 2000-2007). The "
      + "two disagree by a wide margin at four producers, and that is the "
      + "lesson: the price of the day you launch is not a number, it is a "
      + "range that depends on how many rivals are there. Points the "
      + "studies state are marked `stated`; points the page interpolated "
      + "or extended are marked `assumed` and say why. Both curves are "
      + "yours to edit.",
    formula: String.raw`p = P_0\,\rho\,f`,
    where: [
      { sym: "p", means: "the generic's net ex-factory price per tablet", unit: "EUR per tablet" },
      { sym: "\\rho", means: "generic price divided by the originator's price before loss of exclusivity, read from the chosen curve" },
      { sym: "f", means: "depth factor of the sensitivity: 1 follows the curve, 0.5 makes every price half the curve's" },
    ],
  },
  {
    n: 5,
    title: "Volume moves to the generics along a second curve",
    body: "The generics' share of the molecule's volume grows after the "
      + "first entry: about 30 % at the end of the first year and 45 % "
      + "after two (EC 2009, p. 2). The curve is cumulative, read at the "
      + "END of each year, so the share during year k is the mean of its "
      + "two ends. The study stops there for what this page read, so the "
      + "points after year two are an illustration the page chose and are "
      + "marked `assumed`. The generic share is shared among the producers "
      + "on the market. The page's default is an equal split among the "
      + "producers, because no study read states a share by entrant for a "
      + "product class, and the split is a curve you can edit. The "
      + "newcomer sells what the market gives it, up to the plant's "
      + "design production.",
    formula: String.raw`g_k=\frac{G(k-1)+G(k)}{2}\qquad N_j=\min\!\big(V_0\,g_k\,w(n_k),\;Q\big)`,
    where: [
      { sym: "g_k", means: "generic share of the molecule's volume, averaged over market year k" },
      { sym: "G", means: "cumulative generic share at the END of a market year (the curve)" },
      { sym: "k", means: "market year: years since the first generic entry, 1 for the first twelve months" },
      { sym: "w", means: "the newcomer's share of the generic volume, a curve of the number of producers" },
      { sym: "n_k", means: "generic producers on the market in year k, the newcomer included" },
      { sym: "Q", means: "the plant's design production", unit: "tablets per year" },
    ],
  },
  {
    n: 6,
    title: "Late by a year: the market moves on without you",
    body: "If the plant launches d years after the first generic entry, "
      + "its first operating year is market year d + 1. It skips the thin "
      + "early years, so it meets a market that has already gone to more "
      + "producers, a lower price and a higher generic share, and the "
      + "cash flow starts later. Discounting to the launch hides the "
      + "lateness itself, since every case then starts at year 0; to "
      + "compare an on-time and a late entrant the revenues must be "
      + "brought to the same date, the first generic entry. The page "
      + "shows both. The three sensitivities (one year late, two years "
      + "late, a price curve twice as deep) each move one thing from the "
      + "base on the same curves; they are not forecasts and carry no "
      + "probability.",
    formula: String.raw`\mathrm{PV}=\sum_{j=1}^{L}\frac{R_j}{(1+i)^{j}}\qquad \mathrm{PV}_{e}=\frac{\mathrm{PV}}{(1+i)^{d}}`,
    where: [
      { sym: "\\mathrm{PV}", means: "present value of the revenues at the launch (year 0)", unit: "EUR" },
      { sym: "L", means: "operating years of the project (the case's projectLife)" },
      { sym: "i", means: "discount rate (the case's discountRate)" },
      { sym: "d", means: "years between the first generic entry and the launch of the newcomer" },
      { sym: "\\mathrm{PV}_{e}", means: "the same revenues brought back to the first generic entry", unit: "EUR" },
    ],
  },
  {
    n: 7,
    title: "The numbers to paste into the case",
    body: "The case can hold a volume profile and one price. The volume "
      + "profile is the `rampUp` list: the tablets sold in each year "
      + "divided by the design production Q, which is the grammar's own "
      + "meaning (a fraction of the design production reached in that "
      + "year; the case's economics scales revenue and the variable costs "
      + "with it, and the working capital does not follow it). The one "
      + "price must reproduce the revenue the falling price would have "
      + "earned, in present value, so it is the discounted-volume-weighted "
      + "average price. It is NOT the simple average of the "
      + "yearly prices: the early years, when the price is highest, are "
      + "discounted least, so they weigh more here than in a simple "
      + "average of volumes. It is the right constant only for the "
      + "discount rate you gave it. Paste both, run the case, and compare its revenue "
      + "line with the table above.",
    formula: String.raw`p^{*}=\frac{\mathrm{PV}}{\sum_{j} N_j\,(1+i)^{-j}}\qquad u_j=\frac{N_j}{Q}`,
    where: [
      { sym: "p^{*}", means: "the constant price that gives the same present value as the falling prices, for the same volumes", unit: "EUR per tablet" },
      { sym: "u_j", means: "the rampUp entry of operating year j: the fraction of the design production sold" },
    ],
  },
  {
    n: 8,
    title: "What this page does not say",
    body: "It does not say when a generic can lawfully enter: that is a "
      + "freedom-to-operate question, answered by reading claims and "
      + "certificates country by country, and the page has no patent data. "
      + "It does not predict how many rivals arrive or what share you "
      + "win; the two curves for that are an illustration and say so. The "
      + "price curves are published medians of other products in other "
      + "years, one for the United States retail market and one for an "
      + "average of European medicines, and a single product in a single "
      + "country, with tenders or reference pricing, can be far from "
      + "either. The databases that would give a price-erosion curve for "
      + "your product class are commercial and cannot be shipped here, so "
      + "the curve you defend in your report is the one you cite yourself.",
  },
];

export const PATENT_QUIZ: readonly QuizQuestion[] = [
  {
    id: "rampup-meaning",
    q: "In the case's economics, what does an entry of `rampUp` mean?",
    options: [
      "The fraction of the design production reached in that operating year",
      "The price in that operating year, as a fraction of the launch price",
      "The share of the molecule's market won in that year",
      "The discount factor applied to that year",
    ],
    correct: 0,
    feedback: "It is the fraction of the design production sold in that "
      + "year, between 0 and 1; the economics scales revenue and the "
      + "variable costs with it. Nothing in that grammar carries a price "
      + "by year, which is why the page gives one constant price beside "
      + "the list.",
    steps: [2, 7],
  },
  {
    id: "stated-assumed",
    q: "A point on a price curve is marked `assumed`. What does that tell you?",
    options: [
      "The study measured it but with a large error",
      "The page interpolated, extended or chose it, and gives a reason; the study read does not state that number",
      "It was taken from a commercial database",
      "It has been checked against your product class",
    ],
    correct: 1,
    feedback: "`stated` means a published study the page read gives that "
      + "very number, with its page. `assumed` is everything else: a "
      + "straight line between two stated points, a plateau, an equal "
      + "split. None is dressed as literature.",
    steps: [4, 5],
    origins: ["assumption"],
  },
  {
    id: "two-curves",
    q: "The US curve by number of producers and the EU curve by time give different prices at four producers. What should you conclude?",
    options: [
      "One of the studies is wrong and should be discarded",
      "Use the average of the two, which is exact",
      "The launch price is a range that depends on the market and the product, so the report should state which curve it uses and show the other as a sensitivity",
      "The EU curve applies only to antibiotics",
    ],
    correct: 2,
    feedback: "They measure different things in different markets and "
      + "years: US retail medians by entrants, an EU average of "
      + "medicines by time. Neither is a forecast for your tablet. State "
      + "the choice and its reason, and let the sensitivity show what the "
      + "other would do.",
    steps: [4, 8],
  },
  {
    id: "late-entry",
    q: "The entrant launches one year late. Discounted to its own launch, the revenue is almost unchanged, yet the page says it is worse off. Why?",
    options: [
      "The page has a rounding error",
      "A late entrant skips the early years but starts them later; only revenue brought to the same date, the first generic entry, shows that loss",
      "The price rises when the entrant is late",
      "The discount rate changes with the date",
    ],
    correct: 1,
    feedback: "Discounting to the launch makes every case start at year "
      + "0, so lateness itself disappears from the number. Bring both "
      + "revenue streams to the first generic entry and the late one is "
      + "discounted for the year it waited, which is the second PV on "
      + "the page.",
    steps: [6],
  },
  {
    id: "not-fto",
    q: "The page starts from a loss-of-exclusivity date of 3 December 2035 for the apalutamide case. Does that tell you that a generic may lawfully be sold from then?",
    options: [
      "Yes, patent expiry is the only barrier",
      "No, because the date is only a US date and Europe has no patents",
      "Yes, if the EC curve is selected",
      "No: it is the case's declared assumption; counterparts, certificates and litigation in each country decide, and the dossier lists them as not verified",
    ],
    correct: 3,
    feedback: "The date is Google Patents' anticipated expiry of one US "
      + "patent, an assumption by that service. European patents, "
      + "supplementary protection certificates and data protection can "
      + "all move the date, and only a patent attorney's reading of the "
      + "claims can say. The page is not a freedom-to-operate analysis.",
    steps: [1, 8],
    origins: ["reference"],
  },
];

export const PATENT_LIMITS: readonly LessonLimit[] = [
  {
    id: "not-fto",
    title: "This is not a freedom-to-operate analysis.",
    body: PATENT_NOT_ADVICE,
  },
  {
    id: "curves",
    title: "The curves are other products' medians, and two of them are illustrations.",
    body: "The price curves come from two studies of other medicines in "
      + "other years; the generic volume share is stated for the first "
      + "two years only; the number of rivals and the newcomer's share "
      + "have no source and are marked `assumed`. A commercial database "
      + "would give a curve for your product class; its figures cannot "
      + "be redistributed here, so the page ships none.",
  },
  {
    id: "frozen-market",
    title: "The molecule's volume is held constant and the originator's reply is not modelled.",
    body: "Lower prices raise the volume in practice, and the originator "
      + "cuts its price, launches an authorised generic or switches "
      + "patients to a new formulation; the page models none of that. "
      + "The originator's price also falls after entry (EC 2009 says so "
      + "without a figure), which is why the generic's price ratio is "
      + "taken against the originator's price BEFORE loss of exclusivity.",
  },
  {
    id: "grammar",
    title: "The case reads a constant price, so the pasted pair is an equivalent, not the profile.",
    body: "The single price reproduces the present value of the falling "
      + "revenue at the discount rate you declared. Change the discount "
      + "rate in the case and the equivalence is lost; undiscounted "
      + "totals, taxes and the working capital, which does not follow "
      + "`rampUp`, are not reproduced exactly. Re-run the page with the "
      + "case's own rate.",
  },
];
