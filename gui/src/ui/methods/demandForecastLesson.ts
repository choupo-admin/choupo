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
  Demand forecast for a drug product -- the lesson (commission C210,
  synthesis item E8).

  THE TASK, in one sentence (CLAUDE.md section 10): a student in a
  pharmaceutical plant-design group must put a yearly volume under the
  plant's economics, and needs to see three ways of getting one from the
  same history, the factor by which the plant outruns the market made
  explicit, and the units checked, before the number is typed into the case.

  The engine reads the result as `rampUp`, the design production of the
  `batchPlan` and `streamFactor fromBatchPlan`
  (src/postProcessing/EconomicsPass.cpp: `rampUp` entries in [0, 1];
  `streamFactor` a number or the word fromBatchPlan).  Everything about the
  market is in demandForecastMath.ts and is an assumption of the student.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";

export const DEMAND_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A forecast is an assumption with a method behind it",
    body: "A plant is sized for a quantity that has not been sold yet. "
      + "The history of the market is a measurement; the volume of the "
      + "years the plant will operate is not, and no method turns the one "
      + "into the other without assuming something. This page gives three "
      + "ways of doing it on the same history, so that the assumption each "
      + "makes is visible and so that the spread between them is the size "
      + "of what you do not know. The question each answers is the same: "
      + "how many packs of this molecule will the market consume in each "
      + "year the plant runs, and how many of those can be yours.",
  },
  {
    n: 2,
    title: "Units first: thousands and millions",
    body: "A series of sales is given in packs, in thousands of packs, in "
      + "millions of packs, or in defined daily doses (the DDD is the "
      + "assumed average daily dose of the drug in its main indication, "
      + "defined by the WHO's ATC/DDD methodology). A slip of one scale "
      + "multiplies every later number by 1000 and gives a plant a "
      + "thousand times too large or too small, with an economics that "
      + "looks fine. So the page asks the unit of the series and the unit "
      + "you want the answer in, and computes nothing until both are said. "
      + "It converts through the plain unit. It refuses a series whose "
      + "adjacent years differ by a factor of ten or more, which is how a "
      + "thousands value pasted among millions looks, unless you confirm "
      + "the jump is real; and it warns when the plant and the forecast "
      + "differ by two orders of magnitude.",
    formula: String.raw`x_{\mathrm{units}}=x\,f_{\mathrm{scale}}\qquad f_{\mathrm{scale}}\in\{1,\;10^{3},\;10^{6}\}`,
    where: [
      { sym: "x_{\\mathrm{units}}", means: "the quantity in plain units (packs or doses)", unit: "packs or doses per year" },
      { sym: "x", means: "the quantity as written in the series" },
      { sym: "f_{\\mathrm{scale}}", means: "the scale of the series: 1 for units, 1000 for thousands, 1 000 000 for millions" },
    ],
  },
  {
    n: 3,
    title: "Method A: a trend fitted to the history",
    body: "Fit a straight line through the years observed by least squares. "
      + "The slope is the average yearly change; R-squared says how much of "
      + "the scatter the line explains; the standard error s says how far a "
      + "year typically sits from the line. The slope's t statistic and p "
      + "value tell you whether the data can distinguish the trend from "
      + "no trend at all, and with eight or ten years they often cannot. "
      + "The band around a future year is the prediction interval of a "
      + "NEW observation: it is wider than the line's own uncertainty "
      + "because it includes a year's scatter, and it widens the further "
      + "the year is from the middle of the history. What the method "
      + "assumes, and no statistic tests, is that whatever made the "
      + "history straight continues: no new competitor, no guideline "
      + "change, no price cut.",
    formula: String.raw`y=a+b\,t\qquad b=\frac{S_{ty}}{S_{tt}}\qquad R^{2}=1-\frac{\mathrm{SSE}}{S_{yy}}\qquad \hat y_0\pm t_{\nu}\,s\sqrt{1+\frac{1}{n}+\frac{(t_0-\bar t)^{2}}{S_{tt}}}`,
    where: [
      { sym: "y", means: "market volume of the molecule in a year", unit: "packs per year" },
      { sym: "t", means: "calendar year" },
      { sym: "a", means: "intercept of the fitted line" },
      { sym: "b", means: "slope: the average yearly change", unit: "packs per year per year" },
      { sym: "S_{ty}", means: "sum over the years of (year - mean year)(volume - mean volume)" },
      { sym: "S_{tt}", means: "sum over the years of (year - mean year) squared" },
      { sym: "S_{yy}", means: "sum over the years of (volume - mean volume) squared" },
      { sym: "R^{2}", means: "share of the variance of the history that the line explains" },
      { sym: "\\mathrm{SSE}", means: "sum of the squared residuals of the fit" },
      { sym: "\\hat y_0", means: "the fitted value in the forecast year", unit: "packs per year" },
      { sym: "t_{\\nu}", means: "Student's t quantile for the chosen level with n - 2 degrees of freedom" },
      { sym: "s", means: "standard error of the regression: the square root of SSE over n - 2", unit: "packs per year" },
      { sym: "n", means: "number of years in the history" },
      { sym: "t_0", means: "the forecast year" },
      { sym: "\\bar t", means: "the mean of the years in the history" },
    ],
  },
  {
    n: 4,
    title: "Method B: count the doses from the patients",
    body: "Instead of extending the sales, count the patients: the "
      + "population, times the fraction who have the condition, times the "
      + "fraction treated with drugs, times the fraction of those treated "
      + "who are on this molecule (the treatment share), times the fraction "
      + "of days the dose is actually taken. Each patient-day is one DDD "
      + "(or more, if the usual dose is a multiple), and a pack holds a "
      + "number of them. The method needs no history, which is its "
      + "strength for a new market, and every factor in it is a number "
      + "from a prevalence study or an estimate, which is its weakness: "
      + "five uncertain factors multiplied. Comparing its base year with "
      + "the last observed year of the history is the one check available, "
      + "and the page prints the ratio.",
    formula: String.raw`P=\frac{N\,p\,q\,m\,c\,u\,365}{D_{\mathrm{pack}}}`,
    where: [
      { sym: "P", means: "packs of the molecule consumed in a year", unit: "packs per year" },
      { sym: "N", means: "population of the market", unit: "persons" },
      { sym: "p", means: "prevalence of the condition: the fraction of the population that has it" },
      { sym: "q", means: "fraction of patients under drug treatment" },
      { sym: "m", means: "treatment share: the fraction of the treated patients on this molecule" },
      { sym: "c", means: "adherence: the fraction of days the dose is taken" },
      { sym: "u", means: "defined daily doses taken per patient per day when the dose is taken", unit: "DDD per day" },
      { sym: "D_{\\mathrm{pack}}", means: "defined daily doses in one pack", unit: "DDD per pack" },
    ],
  },
  {
    n: 5,
    title: "Method C: the share a product wins follows an S-curve",
    body: "A new product does not take its final share on the first day. "
      + "The share it holds j years after launch is often described by a "
      + "logistic curve: slow at first, fastest around a midpoint, then "
      + "flattening toward a ceiling. Three numbers define it: the "
      + "ceiling, the number of years to half of it, and a steepness. "
      + "None of the three can be estimated from the market's own "
      + "history; they are assumptions about the competitive position of "
      + "your product (the patent-expiry tool shows how a generic's share "
      + "is shaped by the number of rivals). The volume is the market "
      + "volume, held at the last observation or taken from the trend, "
      + "times this share.",
    formula: String.raw`S(j)=\frac{S_{\max}}{1+e^{-k\,(j-j_{1/2})}}`,
    where: [
      { sym: "S(j)", means: "share of the market volume the product holds in operating year j" },
      { sym: "S_{\\max}", means: "the share the product tends to: the ceiling of the curve" },
      { sym: "j", means: "operating year, 1 for the first year the plant sells" },
      { sym: "e", means: "Euler's number, the base of the natural exponential" },
      { sym: "k", means: "steepness of the curve", unit: "per year" },
      { sym: "j_{1/2}", means: "the operating year in which the share is half the ceiling", unit: "year" },
    ],
  },
  {
    n: 6,
    title: "The capacity factor: the number a plant is filled with",
    body: "Whatever the method, what the plant sells is the market "
      + "volume, times the share of it the plant holds, times a capacity "
      + "factor. In a sound forecast the factor is 1. A factor above 1 "
      + "means the plant sells more than the share of the market that was "
      + "forecast, and the only way that is true is that something else "
      + "provides the volume: another country, another indication, a "
      + "contract. That is a claim about the world, not a property of "
      + "the plant, and it has to be argued where it is used. The page "
      + "therefore shows the factor as a line, the factor that would be "
      + "needed to fill the plant, the sold quantity as a fraction of the "
      + "whole market, and it marks any year in which the plant would "
      + "have to sell more than the entire market.",
    formula: String.raw`N_j=M_j\,s_j\,\varphi\qquad \varphi_{\mathrm{fill}}=\frac{Q}{\overline{M s}}`,
    where: [
      { sym: "N_j", means: "packs the plant sells in operating year j", unit: "packs per year" },
      { sym: "M_j", means: "market volume of the molecule in operating year j, from the method", unit: "packs per year" },
      { sym: "s_j", means: "share of the market the plant holds in year j" },
      { sym: "\\varphi", means: "capacity factor: an assumption, 1 when the forecast share is all the plant sells" },
      { sym: "\\varphi_{\\mathrm{fill}}", means: "the factor that would make the mean forecast fill the plant exactly" },
      { sym: "Q", means: "design production of the plant", unit: "packs per year" },
      { sym: "\\overline{M s}", means: "the mean over the horizon of market volume times share", unit: "packs per year" },
    ],
  },
  {
    n: 7,
    title: "What the case's economics reads",
    body: "The batch plan's economics reads the design production in "
      + "kilograms, and a list `rampUp` with the fraction of that "
      + "production sold in each of the first operating years, each "
      + "between 0 and 1; the year's flows then come from the plan "
      + "(`streamFactor fromBatchPlan`). The page turns the sold quantity "
      + "into that list by dividing it by the design production and "
      + "capping at 1, and the design production into kilograms through "
      + "the tablets in a pack and the mass of a packaged tablet. A year "
      + "capped at 1 means the market, as forecast, would take more than "
      + "the plant can make: the plant, not the market, limits the "
      + "revenue there, and the page says so.",
    formula: String.raw`u_j=\min\!\left(1,\;\frac{N_j}{Q}\right)\qquad G=Q\,n_{\mathrm{t}}\,w_{\mathrm{t}}`,
    where: [
      { sym: "u_j", means: "the rampUp entry of operating year j: the fraction of the design production sold, between 0 and 1" },
      { sym: "G", means: "design production in mass", unit: "kg per year" },
      { sym: "n_{\\mathrm{t}}", means: "tablets in one pack" },
      { sym: "w_{\\mathrm{t}}", means: "mass of one packaged tablet", unit: "kg" },
    ],
  },
  {
    n: 8,
    title: "What the page does not say",
    body: "It does not say what the market will do. The trend assumes the "
      + "past continues; the dose count assumes five factors you "
      + "estimated; the S-curve assumes a competitive position you "
      + "chose. The three disagreeing is the finding, not a failure, and "
      + "the report should show the spread rather than the one you "
      + "prefer. The history in the page is an invented illustration; "
      + "replace it with a series you can cite, and state its source and "
      + "unit.",
  },
];

export const DEMAND_QUIZ: readonly QuizQuestion[] = [
  {
    id: "units-first",
    q: "A series reads 5200, 5410, 5630, then 6010000. What do you do?",
    options: [
      "Use it: growth is growth",
      "Stop: the last value is probably in packs among thousands, a slip of 1000; correct the series or confirm the jump is real",
      "Delete the last value and fit through the other three",
      "Convert everything to millions",
    ],
    correct: 1,
    feedback: "A jump of three orders of magnitude between adjacent years is "
      + "the signature of a unit slip. The page refuses it until corrected "
      + "or confirmed.",
    steps: [2],
  },
  {
    id: "r2-not-forecast",
    q: "The fitted trend has an R-squared of 0.98. What does that say about next year's volume?",
    options: [
      "That it will be within 2 % of the line",
      "That the line describes the history well; the next year's band is the prediction interval, and nothing in R-squared says the trend continues",
      "That the slope is exactly right",
      "That the p value of the slope is 0.98",
    ],
    correct: 1,
    feedback: "R-squared measures the fit to the past. A forecast adds the "
      + "scatter of a new year (the prediction interval) and the "
      + "assumption that the cause of the trend persists, which no "
      + "statistic tests.",
    steps: [3],
  },
  {
    id: "prediction-band",
    q: "Why is the prediction interval of a new year wider than the uncertainty of the fitted line at that year?",
    options: [
      "Because the line is fitted with few points",
      "Because it adds the scatter of a single year, the 1 under the square root, to the uncertainty of the line",
      "Because t is larger than 2",
      "It is not wider",
    ],
    correct: 1,
    feedback: "The line's own uncertainty has the terms 1/n and the distance "
      + "from the mean year; a new observation also has its own random "
      + "scatter, which the leading 1 adds.",
    steps: [3],
  },
  {
    id: "capacity-factor",
    q: "A report multiplies the forecast of the national market by 6 'to fill the plant'. What is the factor?",
    options: [
      "A property of the plant",
      "A unit conversion",
      "An assumption that something other than the forecast market, such as other countries, supplies five more markets' worth of volume; it must be argued, and the sold quantity compared with the market",
      "A safety factor on the price",
    ],
    correct: 2,
    feedback: "A factor of 6 means the plant sells six times the whole "
      + "forecast market. The page shows that ratio and marks the years in "
      + "which the sold quantity exceeds the market.",
    steps: [6],
  },
  {
    id: "ramp-cap",
    q: "In a year the forecast sold quantity is 3 million packs and the plant makes 2 million. What is the rampUp entry?",
    options: [
      "1.5",
      "1: the entry is a fraction of the design production, between 0 and 1, and the plant is the limit",
      "0.5",
      "0",
    ],
    correct: 1,
    feedback: "The engine refuses a rampUp entry above 1. The year is "
      + "capped, and the page marks it as limited by the plant.",
    steps: [7],
  },
];

export const DEMAND_LIMITS: readonly LessonLimit[] = [
  {
    id: "illustration",
    title: "The history, the population and the shares on this page are an invented illustration.",
    body: "No number here comes from a market study. They are round values "
      + "chosen so that the three methods can be compared; replace them "
      + "with a series and with factors you can cite, and write the source "
      + "and the year next to each in the report.",
  },
  {
    id: "assumptions",
    title: "Each method has an assumption nothing on the page tests.",
    body: "The trend assumes the cause of the past growth persists. The "
      + "dose count assumes its five factors, and treats the treated "
      + "population as growing at one steady rate. The S-curve assumes "
      + "the ceiling and the speed. Agreement between two methods is "
      + "encouraging and is not evidence; disagreement is the size of the "
      + "uncertainty.",
  },
  {
    id: "no-price",
    title: "Only the volume is forecast, not the price.",
    body: "The price a generic receives depends on how many rivals there "
      + "are, which is the subject of the patent-expiry tool; the volume "
      + "here does not move with it. A series of sales of the whole "
      + "molecule, branded and generic, is what the methods assume.",
  },
];
