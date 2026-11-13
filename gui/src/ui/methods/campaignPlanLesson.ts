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
  campaignPlanLesson -- the lesson of the `campaign-plan` EduTool (DEV.md 4c
  C249 c): how a batch plant is organised, and how a continuous machine sits
  inside a lot regime.

  Every claim about the engine carries the file and line it was read at
  (BatchPlanPass.H and .cpp, the two cases' postDict); tests/campaignPlan.test.ts
  holds each line to the text it quotes.  The two textbooks are cited by
  title and chapter only, as the engine's header does: neither was read for
  this page.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";

export const CAMPAIGN_PLAN_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A batch plant is a recipe of stages, run in trains",
    body: "A drug-product plant makes a lot, not a flow. The recipe is a list of "
      + "stages in order (dissolve, spray-dry, blend, press, coat, pack), and "
      + "the stages that run lot by lot together form a train. Two trains are "
      + "decoupled by a store (a bin of dried powder that QC releases), so "
      + "each has its own hours and its own campaigns. A stage is a batch "
      + "stage (a vessel that is charged, processed, discharged and cleaned) "
      + "or a semicontinuous one (a machine that runs through the lot). "
      + "Choupo keeps the steady flowsheet as the material balance per kilogram "
      + "of product and lays this plan on top of it: the flowsheet says how "
      + "much each stage handles, the plan says when (BatchPlanPass.H:31-42, "
      + "the plan never re-runs the flowsheet, line 42).",
  },
  {
    n: 2,
    title: "The lot is the unit QC releases, and it fixes the number of lots",
    body: "A lot is the quantity that is made, tested and released as one "
      + "unit. In the engine the lot is declared as a mass of one stream "
      + "(BatchPlanPass.H:98) and every stage handles a fixed number of "
      + "kilograms per kilogram of product (BatchPlanPass.H:97). The plant "
      + "makes a whole number of lots, so the year's lots are the demand "
      + "divided by the lot, rounded up (BatchPlanPass.H:113; the engine "
      + "guards the rounding by one part in a billion, BatchPlanPass.cpp:518). A "
      + "batch vessel is sized by what its stage handles: the volume is the "
      + "mass per lot divided by the bulk density and the fill fraction "
      + "(BatchPlanPass.H:101-102). The lot is therefore both an equipment choice "
      + "and a regulatory one: halve it and you need twice the lots.",
    formula: String.raw`N=\left\lceil \frac{Q}{B}\right\rceil,\qquad V_j=\frac{f_j\,B}{\rho_j\,\varphi_j}`,
    where: [
      { sym: "N", means: "lots made in a year, a whole number" },
      { sym: "Q", means: "product demanded in a year", unit: "kg/yr" },
      { sym: "B", means: "product in one lot, the unit QC releases", unit: "kg" },
      { sym: "V_j", means: "volume of the vessel of batch stage j", unit: "m3" },
      { sym: "f_j", means: "kilograms stage j handles per kilogram of product", unit: "kg/kg" },
      { sym: "\\rho_j", means: "bulk density of what the stage holds", unit: "kg/m3" },
      { sym: "\\varphi_j", means: "fill fraction of the vessel" },
    ],
  },
  {
    n: 3,
    title: "The cycle of a stage, and the stage that paces the train",
    body: "A stage's cycle is the time one lot occupies it: charging, "
      + "processing, discharging and cleaning (BatchPlanPass.H:108). A new lot "
      + "cannot enter the train faster than its slowest stage releases the "
      + "room, so the train's limiting cycle time is the largest cycle in it "
      + "(BatchPlanPass.H:111), and the stage that holds it is the limiting "
      + "stage. A stage's utilisation is its cycle against that limit "
      + "(BatchPlanPass.H:112): the limiting stage is at 1 and every other "
      + "stage waits. The Gantt chart below is drawn by the same code that "
      + "draws the engine's plan; the limiting stage is outlined. Move the "
      + "lot, the operating time of the dryer or the number of tanks and watch "
      + "the outline jump from one stage to another. This is the teaching "
      + "method of the batch chapters of Biegler, Grossmann and Westerberg, "
      + "Systematic Methods of Chemical Process Design (Prentice Hall, 1997), "
      + "and of Seider, Seader, Lewin and Widagdo, Product and Process Design "
      + "Principles (Wiley); the engine cites both by title and so does this "
      + "page.",
    formula: String.raw`t_j=t_{\mathrm{ch},j}+t_{\mathrm{pr},j}+t_{\mathrm{di},j}+t_{\mathrm{cl},j},\qquad T_{\mathrm{L}}=\max_j\frac{t_j}{N_{\mathrm{op},j}},\qquad u_j=\frac{t_j}{N_{\mathrm{op},j}\,T_{\mathrm{L}}}`,
    where: [
      { sym: "t_j", means: "cycle of stage j: the time one lot occupies one unit", unit: "h" },
      { sym: "t_{\\mathrm{ch},j}", means: "charging time of stage j", unit: "h" },
      { sym: "t_{\\mathrm{pr},j}", means: "processing time of stage j (the operating time of a semicontinuous stage)", unit: "h" },
      { sym: "t_{\\mathrm{di},j}", means: "discharging time of stage j", unit: "h" },
      { sym: "t_{\\mathrm{cl},j}", means: "cleaning time between two lots at stage j", unit: "h" },
      { sym: "T_{\\mathrm{L}}", means: "limiting cycle time of the train: the interval at which a lot can enter it", unit: "h" },
      { sym: "N_{\\mathrm{op},j}", means: "units of stage j that run out of phase, taking alternate lots" },
      { sym: "u_j", means: "utilisation of stage j: its share of the limiting cycle" },
    ],
  },
  {
    n: 4,
    title: "Parallel units: in phase, out of phase",
    body: "Two identical units can be used in two ways. In phase they take the "
      + "same lot together and each handles half of it: the vessels are "
      + "half the size and the cycle is unchanged. Out of phase they take "
      + "alternate lots: the vessels are the same size but a lot enters "
      + "the stage every half cycle, so the stage's contribution to the "
      + "limit is its cycle divided by 2 (BatchPlanPass.H:111). That is the cheapest "
      + "way to unload a limiting stage, and the engine's own remedy when a plan "
      + "is refused (BatchPlanPass.H:138-140). In the Gantt chart an "
      + "out-of-phase stage has one lane per unit and its lots alternate "
      + "between them. Try the second tank on the page: the tank that was "
      + "pacing the train stops doing so.",
  },
  {
    n: 5,
    title: "Campaigns, changeovers and the year's hours",
    body: "Lots of one product are made in campaigns of a declared number of "
      + "lots, and a clean (the changeover) separates two campaigns "
      + "(BatchPlanPass.H:114). One campaign of n lots takes the time for the "
      + "first lot to pass through every stage plus one limiting cycle for "
      + "each lot after it (BatchPlanPass.H:120), where o_j is when stage j "
      + "starts in the campaign: a stage fed by earlier ones starts when "
      + "their discharge starts (BatchPlanPass.H:115-119). The hours the "
      + "train needs in the year are the campaigns plus their changeovers "
      + "(BatchPlanPass.H:121) and a stage's busy hours add its own "
      + "cycles (BatchPlanPass.H:122); each is compared with the hours the "
      + "train is available (BatchPlanPass.H:123). The engine refuses a "
      + "plan whose hours exceed the available ones, with the number and "
      + "the remedies. The year chart in the engine half of the page, below, shows "
      + "the first campaign only: the later ones repeat it shifted.",
    formula: String.raw`\mathrm{span}(n)=\max_j\left(o_j+t_j\right)+(n-1)\,T_{\mathrm{L}},\qquad H=\sum_{\mathrm{campaigns}}\left[\mathrm{span}(n)+t_{\mathrm{co}}\right],\qquad \omega=\frac{H}{H_{\mathrm{av}}}`,
    where: [
      { sym: "\\mathrm{span}(n)", means: "time to make n lots in one campaign, from the first charge to the last discharge", unit: "h" },
      { sym: "n", means: "lots in the campaign" },
      { sym: "o_j", means: "start of stage j in the campaign, counted from the first stage", unit: "h" },
      { sym: "H", means: "hours the train needs in the year", unit: "h/yr" },
      { sym: "t_{\\mathrm{co}}", means: "changeover: the clean between two campaigns of one product", unit: "h" },
      { sym: "H_{\\mathrm{av}}", means: "hours the train is available in the year (shifts, days, the plant's calendar)", unit: "h/yr" },
      { sym: "\\omega", means: "occupancy of the train: the share of its available hours the plan uses" },
    ],
  },
  {
    n: 6,
    title: "A continuous machine inside a lot regime: the spray dryer",
    body: "A spray dryer runs continuously, yet the plant sells lots. The "
      + "industrial arrangement, and the one the engine encodes, is to give "
      + "the dryer a lot by the tank that feeds it. In apalutamide01 the "
      + "dryer is a semicontinuous stage whose operating time is the "
      + "flowsheet's own, because its hardware fixes its rate "
      + "(tutorials/batch/plant/apalutamide01_tablets/system/postDict:178: "
      + "operatingTime fromFlowsheet), and the solution tank that feeds it "
      + "is held until the dryer has taken the whole lot (postDict:170: "
      + "dischargeTime throughFedStage; engine BatchPlanPass.H:109). So the "
      + "tank's cycle is its own steps plus the dryer's run, and the "
      + "tank, not the dryer, is the stage that paces the train. The dryer "
      + "is not cleaned between lots but at the campaign changeover "
      + "(postDict:178 declares cleanTime 0 h; the changeover of 48 h is at "
      + "postDict:113, seven lots a campaign at postDict:112). What carries the "
      + "lot's identity is the tank: the dryer's output over the run it takes "
      + "belongs to the lot in the tank. ICH Q13 on continuous manufacturing "
      + "lets a batch be defined by a quantity, a time or the input, and "
      + "the plan uses the input definition (design guide, section "
      + "Organising a multi-product plant). Slide the dryer's operating time "
      + "in the first toy: while it is shorter than the tank's other steps "
      + "the dryer idles, and a second tank out of phase gives the dryer "
      + "back the limit.",
    formula: String.raw`t_{\mathrm{op}}=\frac{f_j\,B}{N_{\mathrm{ip},j}\,r_j},\qquad t_{\mathrm{di,tank}}=t_{\mathrm{pr,dryer}}`,
    where: [
      { sym: "t_{\\mathrm{op}}", means: "operating time of a semicontinuous stage when it runs at the machine's own rate", unit: "h" },
      { sym: "N_{\\mathrm{ip},j}", means: "units of stage j that take the same lot together, each handling a part of it" },
      { sym: "r_j", means: "mass rate of the machine of stage j", unit: "kg/h" },
      { sym: "t_{\\mathrm{di,tank}}", means: "discharging time of the tank that feeds the dryer", unit: "h" },
      { sym: "t_{\\mathrm{pr,dryer}}", means: "operating time of the dryer it feeds", unit: "h" },
    ],
  },
  {
    n: 7,
    title: "Two products on one plant: why the order barely matters, and when it does",
    body: "Several products on one set of equipment are made in "
      + "single-product campaigns, in an order the student declares and "
      + "the engine never chooses (BatchPlanPass.H:159-162). Between two "
      + "products every stage is cleaned at once, so the train waits for "
      + "the longest of the stages' cleans (BatchPlanPass.H:210), and the "
      + "year is the campaigns of each product plus those cleans "
      + "(BatchPlanPass.H:214). The clean can depend on the direction: a "
      + "trace of a yellow pigment must be rinsed from a pan before a white "
      + "coat, but a trace of white hides in a yellow one. With the cleans "
      + "that depend on the stage alone, any order costs the same "
      + "(BatchPlanPass.H:219-220). With directional cleans, two products "
      + "pay both directions once whichever goes first, because the plan "
      + "wraps the clean after the last campaign to the first product: "
      + "donepezil02 in the engine half is 928.2 h and 2127 h either way. "
      + "From three products the cycle matters: A then B then C then A pays "
      + "different pairs of directions than A then C then B then A, and the "
      + "order is a real decision. The cheapest of the orders is not "
      + "necessarily the best: it is the one with the fewest hours, and "
      + "demand, shelf life and the safety stock decide the rest. "
      + "Mixed sequencing inside a campaign is a larger problem that the "
      + "engine does not take on.",
    formula: String.raw`H=\sum_i\left[S_i+\left(c_i-1\right)t_{\mathrm{co}}+C_i\right],\qquad C_i=\max_j\,c_{ij}`,
    where: [
      { sym: "i", means: "a product, in the order of the campaigns" },
      { sym: "S_i", means: "sum of the spans of all the campaigns of product i", unit: "h" },
      { sym: "c_i", means: "campaigns of product i in the year" },
      { sym: "C_i", means: "clean after the last campaign of product i, before the next product", unit: "h" },
      { sym: "c_{ij}", means: "clean at stage j after product i, before the next one: declared for that direction or the stage's own", unit: "h" },
    ],
  },
];

export const CAMPAIGN_PLAN_QUIZ: readonly QuizQuestion[] = [
  {
    id: "limiting",
    q: "A train has stages of cycle 7 h, 4 h and 3 h, and the 7 h stage gets a second unit out of phase. What now limits the train?",
    options: [
      "Still the 7 h stage",
      "The 4 h stage, because 7 h over two units is 3.5 h",
      "The 3 h stage",
      "Nothing: the train has no limit with two units",
    ],
    correct: 1,
    feedback: "Each stage contributes its cycle divided by its units out of "
      + "phase, so the stages count as 3.5 h, 4 h and 3 h, and the largest, the "
      + "4 h stage, now paces the train.",
    steps: [3, 4],
  },
  {
    id: "tank",
    q: "Why is the solution tank, not the spray dryer, the limiting stage of the apalutamide spray-drying train?",
    options: [
      "The tank is bigger than the dryer",
      "The tank is held through the dryer's run, so its cycle includes that run and its own steps",
      "The dryer is cleaned between lots",
      "The tank is out of phase",
    ],
    correct: 1,
    feedback: "The tank discharges through the stage it feeds, so its cycle is "
      + "its charge, its processing and the dryer's whole run plus its clean. "
      + "The dryer itself is not cleaned between lots, so its cycle is just its run.",
    steps: [6],
  },
  {
    id: "lots",
    q: "A plant makes 10 156 kg a year in lots of 410.4 kg. How many lots does it make?",
    options: ["24", "25", "24.75", "26"],
    correct: 1,
    feedback: "10 156 divided by 410.4 is 24.75, and the plant makes whole lots, "
      + "so 25 (25 lots make 10 260 kg, a little more than demanded).",
    steps: [2],
  },
  {
    id: "two-products",
    q: "Two products, with a clean of 8 h from yellow to white and 2 h from white to yellow. Does the campaign order change the year's hours?",
    options: [
      "Yes: white first saves 6 h",
      "No: the year pays both directions once whichever goes first",
      "Yes: yellow first saves 6 h",
      "Only if the campaigns are longer than 8 h",
    ],
    correct: 1,
    feedback: "The clean after the last campaign wraps round to the first "
      + "product, so both directions are paid once in either order and the "
      + "hours are identical. The order changes only the Gantt chart.",
    steps: [7],
  },
  {
    id: "three-products",
    q: "From three products, the order of the campaigns can change the year's hours. Through what?",
    options: [
      "Only through the directional cleans, because the set of directions paid changes",
      "Through the lot size",
      "Through the number of units out of phase",
      "It never does: the engine takes the order as given",
    ],
    correct: 0,
    feedback: "With cleans that depend on the stage alone every order costs "
      + "the same. A directional clean makes the pairs of neighbouring "
      + "products matter, and three products have two distinct cycles "
      + "that pay different pairs.",
    steps: [7],
  },
  {
    id: "occupancy",
    q: "A train needs 3 900 h in a year and is available 3 840 h. What does the engine do?",
    options: [
      "Prints the plan with 101.6 % occupancy",
      "Refuses the plan, naming the number and the remedies",
      "Removes the last campaign",
      "Adds a unit out of phase",
    ],
    correct: 1,
    feedback: "A plan whose hours exceed the available ones is not a plan: the "
      + "engine refuses it, naming the hours and the remedies (an out-of-phase "
      + "unit, a larger lot, more hours). It never removes a campaign for you.",
    steps: [5],
  },
];

export const CAMPAIGN_PLAN_LIMITS: readonly LessonLimit[] = [
  {
    id: "two-halves",
    title: "The page has two halves, and they are not the same thing.",
    body: "The toy plants move: their plan is recomputed in this page by a "
      + "second implementation of the engine's method, held by a test to what "
      + "the engine published for two cases (1e-6). The engine halves draw what "
      + "the engine ran, with the same bars, and recompute nothing. Every "
      + "number of a toy is an illustration; every number of an engine half "
      + "is the case's.",
  },
  {
    id: "one-train",
    title: "The toy has one train and no stores.",
    body: "A real plant has several trains decoupled by stores, each with "
      + "its own hours. The method repeats per train; the page shows one. "
      + "Intermediate storage policies (zero wait, no intermediate storage, "
      + "unlimited intermediate storage) are named in the design guide and the "
      + "engine assumes a store only where the case declares a train boundary.",
  },
  {
    id: "no-sequencing",
    title: "No mixed sequencing, no optimisation of the order.",
    body: "The engine plans single-product campaigns and takes the order "
      + "as given. The page lists every order and its hours so you can see "
      + "which pays least; it does not choose, and a minimum of hours is "
      + "not a production plan.",
  },
  {
    id: "cleaning",
    title: "A clean is hours here, not a validation.",
    body: "The page treats a changeover as hours the plant cannot make "
      + "product. What a clean must achieve, and how it is validated, is "
      + "the case's cleaning-validation work (EU GMP Annex 15), and the "
      + "directional hours on the page are illustrations.",
  },
];
