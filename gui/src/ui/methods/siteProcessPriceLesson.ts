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
  Where to build it, what to make, and what it sells for -- the lesson
  (commission C212, the market side).

  THE TASK, in one sentence (CLAUDE.md section 10): a student who must decide
  where a plant goes, which route it runs and what the product earns at the
  plant gate must be able to do the three pieces of arithmetic that none of the
  other economics pages does -- a weighted site choice and how fragile its
  ranking is, a patent example turned into a per-kg basis, and the margin
  chain between the shelf and the ex-factory price -- and know that every
  weight, margin and tax rate is theirs to declare with a source.

  Nothing here is a figure about any place, patent or market.  No margin, tax
  rate or weight is shipped; the starting values are round numbers labelled
  illustration.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";

export const SITE_PROCESS_PRICE_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "Choosing the site: a weighted matrix of criteria you declare",
    body: "A site is chosen against criteria, and the honest first step is to "
      + "write them down. The page lists prompts, not answers: proximity to "
      + "raw materials and to customers, availability and price of utilities, "
      + "qualification and cost of labour, transport access, climate, "
      + "incentives and land. You keep the ones that matter for your plant, "
      + "give each a weight, and give each candidate site a score from 0 to "
      + "10 on each criterion. The weighted score of a site is the sum of "
      + "weight times score, divided by the sum of the weights, so it stays "
      + "on the 0 to 10 scale. The weights and the scores are your "
      + "judgements, and the page ships none: a ranking of real places would "
      + "be a number nobody here could source. The matrix does not decide; it makes "
      + "the judgement visible so that it can be argued with.",
    formula: String.raw`S_i=\frac{\sum_j w_j\,s_{ij}}{\sum_j w_j}`,
    where: [
      { sym: "S_i", means: "weighted score of site i, on the same 0 to 10 scale as the scores" },
      { sym: "w_j", means: "weight of criterion j: how much you care about it, in any non-negative scale" },
      { sym: "s_{ij}", means: "score you give site i on criterion j", unit: "0 to 10" },
    ],
  },
  {
    n: 2,
    title: "How fragile is the ranking: the weight at which it changes",
    body: "A ranking that flips when one weight moves by a tenth is not a "
      + "decision, it is a coin. Hold every other weight and move one: the "
      + "score of each site is a straight line in that weight, so two sites "
      + "tie at exactly one weight, which has a closed form. The page "
      + "computes it for the current leader against every other site, for "
      + "every criterion, and reports the nearest weight at which the "
      + "leader is overtaken, with the site that overtakes. If that weight "
      + "is close to the one you declared, the choice rests on a weight you "
      + "should defend or measure; if the leader is never overtaken, the "
      + "criterion does not matter to the ranking. The plot shows the "
      + "score of every site as the weight of the chosen criterion sweeps from zero upward.",
    formula: String.raw`x^{*}=\frac{R_a-R_b}{s_{bj}-s_{aj}}\qquad R_a=\sum_{k\neq j} w_k\,s_{ak}`,
    where: [
      { sym: "x^{*}", means: "the weight of criterion j at which sites a and b have the same score" },
      { sym: "R_a", means: "weighted sum of the scores of site a on every criterion except j" },
      { sym: "R_b", means: "the same sum for site b" },
      { sym: "s_{aj}", means: "score of site a on criterion j", unit: "0 to 10" },
      { sym: "s_{bj}", means: "score of site b on criterion j", unit: "0 to 10" },
      { sym: "w_k", means: "weight of criterion k, held fixed" },
      { sym: "s_{ak}", means: "score of site a on criterion k", unit: "0 to 10" },
    ],
    note: "A negative x* means the two sites never tie for a real weight; equal scores on j mean they never tie at all.",
  },
  {
    n: 3,
    title: "Choosing the process from patents: a method, as a checklist",
    body: "A patent is a description of a route written to be defended, not "
      + "to be built from, so it is read with a method. Start from the "
      + "patents cited in an encyclopedia entry on the product or its class: "
      + "someone already chose them. Group them by owner. Separate the "
      + "industrial examples from the laboratory-scale ones, by the batch "
      + "size each example states. Read the Examples section for "
      + "temperatures, pressures, times and yields, and copy each with its "
      + "example number. Check that one patent covers the whole route, from "
      + "your raw material to your product, or name the steps it leaves "
      + "out. Search in the public search services of the patent offices "
      + "(a national office, the European Patent Office and the World "
      + "Intellectual Property Organization each publish one), look up each "
      + "document's status in the register of the office concerned, and "
      + "record the number you read. Reading a patent is not a "
      + "freedom-to-operate opinion: only a patent attorney gives that.",
    leadsTo: {
      tool: "ip-strategy",
      toolLabel: "Patent or secret",
      stepTitle: "What a patent buys, and what it costs",
      body: "What a patent protects, and what the owner pays for it, is taught on the intellectual-property page.",
    },
  },
  {
    n: 4,
    title: "A patent example as a mass basis: per kilogram of product",
    body: "An example reads like a recipe: so many kilograms of this, so many "
      + "of that, so much solvent, so much product. To compare it with another "
      + "route, or to size a plant, put every quantity per kilogram of "
      + "isolated product. The sum of everything charged over the product "
      + "is the process mass intensity; the same without the product itself "
      + "is the waste per kilogram, the E-factor. The yield compares the "
      + "product with what the limiting reactant could give in theory, so "
      + "you need its moles and the molar mass of the product, both from "
      + "the example and your own data; the page does not look them up. A "
      + "large solvent term is the usual surprise, and it is where a route "
      + "on paper becomes a different route on a plant.",
    formula: String.raw`\mathrm{PMI}=\frac{m_{\mathrm{in}}}{m_P}\qquad E=\frac{m_{\mathrm{in}}-m_P}{m_P}\qquad Y=\frac{m_P}{n_L\,M_P}`,
    where: [
      { sym: "\\mathrm{PMI}", means: "process mass intensity: everything charged per kg of product", unit: "kg per kg" },
      { sym: "m_{\\mathrm{in}}", means: "total mass charged: reactants, reagents, solvents and work-up", unit: "kg" },
      { sym: "m_P", means: "mass of isolated product", unit: "kg" },
      { sym: "E", means: "E-factor: waste per kg of product", unit: "kg per kg" },
      { sym: "Y", means: "yield: isolated product over the theoretical amount" },
      { sym: "n_L", means: "amount of limiting reactant charged", unit: "mol" },
      { sym: "M_P", means: "molar mass of the product", unit: "kg per mol" },
    ],
  },
  {
    n: 5,
    title: "The same example as a cycle time, and a scale factor",
    body: "A patent rarely states the cycle; it states the reaction time. "
      + "The cycle of a batch is the reaction, the work-up and the cleaning "
      + "between batches, and the last two are yours to declare. Product "
      + "over cycle time is the rate one vessel delivers, which is what the "
      + "plant-cost and running-cost pages need to size and to price the "
      + "year. To reach the batch you want, multiply every quantity by the "
      + "ratio of the target to the example's product; the cycle time does "
      + "not scale with it. It is a bookkeeping scale-up: heat removal, "
      + "mixing and filtration do not scale this way, and the page says "
      + "nothing about them.",
    formula: String.raw`\dot m_P=\frac{m_P}{t_R+t_W+t_C}\qquad f=\frac{m_{\mathrm{target}}}{m_P}`,
    where: [
      { sym: "\\dot m_P", means: "product per hour of the cycle", unit: "kg per hour" },
      { sym: "t_R", means: "reaction time", unit: "hour" },
      { sym: "t_W", means: "work-up time", unit: "hour" },
      { sym: "t_C", means: "cleaning and turnaround between batches", unit: "hour" },
      { sym: "f", means: "factor applied to every charged quantity" },
      { sym: "m_{\\mathrm{target}}", means: "the batch of product you want", unit: "kg" },
    ],
  },
  {
    n: 6,
    title: "From the shelf price to the plant gate: the margin chain, going down",
    body: "What the patient pays is not what the plant receives. Between "
      + "them stand taxes, a pharmacy, a wholesaler and, in some markets, "
      + "fixed fees. Each stage takes its share in one of four ways, and "
      + "the ways are not interchangeable: a share OF the price the stage "
      + "sells at, a markup ON the price the stage pays, a tax ADDED on "
      + "top, or a fixed amount per pack. A margin of one fifth means two different "
      + "prices depending on which. Percentage stages commute, but a "
      + "fixed amount per pack does not: it is taken before or after a "
      + "percentage and the result differs, so declare the order the "
      + "rule gives. The page takes every stage as your declared "
      + "input and ships none: read the regulation of your market and "
      + "declare each stage with its source. Then it walks from the shelf "
      + "price down to the ex-factory price, showing what each stage took.",
    formula: String.raw`P_{k+1}=P_k\,(1-r_k)\quad\text{or}\quad\frac{P_k}{1+r_k}\quad\text{or}\quad P_k-a_k`,
    where: [
      { sym: "P_k", means: "price entering stage k from above", unit: "currency per pack" },
      { sym: "P_{k+1}", means: "price leaving stage k below", unit: "currency per pack" },
      { sym: "r_k", means: "the share, markup or tax rate of stage k, as you declare it" },
      { sym: "a_k", means: "fixed amount per pack taken by stage k", unit: "currency per pack" },
    ],
    leadsTo: {
      tool: "plant-running-cost",
      toolLabel: "What a plant costs to run, and when it pays",
      stepTitle: "The market arithmetic that feeds the price and the volume",
      body: "The ex-factory price is the price of the running-cost page; its market step does the index, currency and unit-margin arithmetic.",
    },
  },
  {
    n: 7,
    title: "And back up: from the price you need to the price on the shelf",
    body: "The chain also runs the other way, and that is the direction a "
      + "business case asks: if the plant needs a given ex-factory price to "
      + "pay, what must the shelf price be, and is that a price the market "
      + "will pay? Walk the stages in reverse with each inverse operation. "
      + "The two directions must return the number you started from, and "
      + "the page shows the check. A shelf price that comes out far above "
      + "the going price of competing products is a result, not a mistake: "
      + "it says the plant cannot pay with those margins. For the volume "
      + "that price will sell see the demand forecast, and for the date "
      + "from which generics lower it see the patent-expiry page.",
    formula: String.raw`P_k=\frac{P_{k+1}}{1-r_k}\quad\text{or}\quad P_{k+1}(1+r_k)\quad\text{or}\quad P_{k+1}+a_k`,
    where: [
      { sym: "P_k", means: "price entering stage k from above", unit: "currency per pack" },
      { sym: "P_{k+1}", means: "price leaving stage k below", unit: "currency per pack" },
      { sym: "r_k", means: "the share, markup or tax rate of stage k, as you declare it" },
      { sym: "a_k", means: "fixed amount per pack taken by stage k", unit: "currency per pack" },
    ],
  },
  {
    n: 8,
    title: "What this page does not say",
    body: "It is not legal advice and not a market study. It names no "
      + "place, patent, margin or tax rate, and ranks no real site. Every "
      + "starting value is a round number labelled illustration, to show "
      + "the arithmetic, and says nothing about your plant or your market. "
      + "A weighted matrix summarises your judgements; it does not "
      + "produce them. A patent example is one inventor's experiment, not "
      + "a plant's design, and its status and scope are for a patent "
      + "attorney to read. The margins and taxes that apply to a medicine "
      + "are set by the rules of each market and change; read them there "
      + "and declare them with the source.",
  },
];

export const SITE_PROCESS_PRICE_QUIZ: readonly QuizQuestion[] = [
  {
    id: "weights-sum",
    q: "Two sites score 6 and 8 on criterion 1 (weight 3) and 9 and 5 on criterion 2 (weight 1). What are their weighted scores?",
    options: ["6.75 and 7.25", "7.5 and 6.5", "15 and 13", "6 and 8"],
    correct: 0,
    feedback: "(3 x 6 + 1 x 9)/4 = 6.75 and (3 x 8 + 1 x 5)/4 = 7.25. Dividing by the sum of "
      + "the weights keeps the score on the 0 to 10 scale.",
    steps: [1],
  },
  {
    id: "flip-weight",
    q: "A flip weight for a criterion is close to the weight you declared. What does that say?",
    options: [
      "The criterion is unimportant",
      "The choice rests on a weight you should defend or measure, because a small change of it changes the leader",
      "The scores are wrong",
      "The leader is certain",
    ],
    correct: 1,
    feedback: "The flip weight is where the leader is overtaken. If it is far from your weight, or "
      + "does not exist, the ranking is robust to that criterion; if it is near, it is not.",
    steps: [2],
  },
  {
    id: "patent-order",
    q: "Which is the right first move in reading patents for a route?",
    options: [
      "Take the one with the highest yield",
      "Start from the patents cited in an encyclopedia entry, then group them by owner",
      "Take the newest",
      "Take the one with the fewest pages",
    ],
    correct: 1,
    feedback: "Someone already chose the cited patents; owner grouping shows who actually makes the "
      + "product. The highest yield may be a laboratory example nobody scaled.",
    steps: [3],
  },
  {
    id: "pmi",
    q: "An example charges 10, 6, 60 and 30 kg and isolates 7.5 kg of product. What is the process mass intensity and the E-factor?",
    options: ["14.13 and 13.13", "13.13 and 14.13", "106 and 98.5", "1.0 and 0"],
    correct: 0,
    feedback: "The total charged is 106 kg: 106/7.5 = 14.13 kg per kg, and (106 - 7.5)/7.5 = 13.13. "
      + "The E-factor is one less than the PMI because the product itself is not waste.",
    steps: [4],
  },
  {
    id: "margin-basis",
    q: "A pharmacy sells at 14.55 and says its margin is 20 %. What did it pay if the 20 % is a share of the selling price, and what if it is a markup on cost?",
    options: [
      "11.64 in both cases",
      "11.64 for a share of the selling price, 12.13 for a markup on cost",
      "12.13 for a share, 11.64 for a markup",
      "14.55 less 20 in both cases",
    ],
    correct: 1,
    feedback: "A share of the selling price: 14.55 x (1 - 0.2) = 11.64. A markup on cost: "
      + "14.55 / 1.2 = 12.125. Declare which one your market's rule means.",
    steps: [6],
  },
  {
    id: "round-trip",
    q: "You walk the chain from the shelf down to the ex-factory price and then back up with the inverse operations. What should you get?",
    options: [
      "A somewhat higher shelf price, because margins compound",
      "The shelf price you started from, exactly",
      "The ex-factory price",
      "A price that depends on the order of the stages",
    ],
    correct: 1,
    feedback: "Each stage's up step is the inverse of its down step, so the round trip returns "
      + "the starting price to round-off. If it does not, a stage is declared inconsistently.",
    steps: [6, 7],
  },
];

export const SITE_PROCESS_PRICE_LIMITS: readonly LessonLimit[] = [
  {
    id: "illustrations",
    title: "The numbers on this page are illustrations.",
    body: "The criteria weights, the scores, the patent example and every margin and tax rate "
      + "are round numbers chosen to show the arithmetic. None is a figure about a real place, "
      + "patent or market. A margin or a tax rate that cannot be read from a primary source "
      + "would be falsely sourced, so the page leaves them to you.",
  },
  {
    id: "not-advice",
    title: "Not legal advice, not a market study, not a patent opinion.",
    body: "What a patent covers, whether it is in force and whether you may use a route are "
      + "questions for a patent attorney. The regulation of prices and margins of medicines "
      + "differs between markets and changes; the page cannot know yours.",
  },
  {
    id: "judgement",
    title: "A matrix organises judgement; it does not replace it.",
    body: "The weighted score is only as good as the weights and scores, which are yours. "
      + "The crossing weight shows how fragile the ranking is to each weight alone, not to "
      + "several at once, and says nothing about the probability of any of them.",
  },
];
