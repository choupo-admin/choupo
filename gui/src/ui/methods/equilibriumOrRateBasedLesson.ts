/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  equilibriumOrRateBasedLesson -- the lesson text of the EduTool
  `equilibrium-or-rate-based`, "Equilibrium stages or a rate-based model?".

  THE SOURCE RULE (the commission, 2026-11-13).  Every recommendation on this
  page is one of: (E) something the engine demonstrates on the page; (R) a
  statement read in a source that could be opened, listed in
  lessonReferences.json; (A) an assumption of the page, used only for the
  page's own arithmetic choices.  A recommendation with neither an (E) nor an
  (R) is not written; the ones dropped for that reason are listed in
  docs/design/equilibrium-or-rate-based.md.

  Every `file:line` below is held to its text by
  gui/tests/equilibriumOrRateBased.test.ts.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";

/** The student's task, the page's first line. */
export const EQ_RB_TASK = "I have to design or rate a column: is an equilibrium-stage "
  + "model with one efficiency enough, or do I need a rate-based model, and how wrong "
  + "can the simple one be?";

/** The opening, before any model is named. */
export const EQ_RB_OPENING = "A tray never brings its vapour all the way to equilibrium "
  + "with its liquid.  The usual way to design with that fact is to keep equilibrium "
  + "stages and multiply them by an efficiency.  The other way is to stop pretending "
  + "the stage is at equilibrium and compute the rate at which each component crosses "
  + "the interface: a rate-based, or nonequilibrium, model.  This page asks when the "
  + "first is enough, shows on the engine how wrong it can be, and says where the "
  + "published comparisons found that it was not.";

/** What the engine has and has not, stated before anything is run. */
export const EQ_RB_ENGINE_SCOPE = "Choupo has the first way and not the second.  A "
  + "Wang-Henke column reads a declared Murphree efficiency "
  + "(DistillationColumn.cpp:1597) and folds it into an effective K-value "
  + "(DistillationColumn.cpp:1729); the simultaneous MESH method refuses one rather "
  + "than solve ideal stages in its place (DistillationColumn.cpp:2397).  A binary "
  + "column at total reflux can compute its tray efficiency from the tray's geometry "
  + "(DistillationColumn.cpp:5059, binary only).  There is no rate-based column: a "
  + "rate-based mode is planned and not built, so everything this page says about "
  + "rate-based models comes from the papers it cites.";

export const EQ_RB_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "One number per tray: the Murphree efficiency",
    body: "Equilibrium stages with an efficiency is, in the words of the column papers "
      + "this page read, the approach often used: the vapour and liquid leaving a stage "
      + "are taken to be in equilibrium, and the departure of a real tray is handled by "
      + "an efficiency.  Murphree's vapour efficiency says how far the vapour travels, "
      + "on its way up through one tray, from what entered the tray towards the vapour "
      + "that would be in equilibrium with the liquid leaving it.  With E = 1 the tray "
      + "is an equilibrium stage.  The definition holds for each component, and nothing "
      + "in it says that every component of a mixture has the same efficiency.  A "
      + "rate-based model writes, instead, the rate at which each component crosses "
      + "the interface, from mass-transfer coefficients and an interfacial area, and "
      + "the efficiency becomes something it computes rather than something you "
      + "declare.",
    formula: String.raw`\begin{aligned} y_{i,j} &= E_{\mathrm{MV}}\,y^{*}_{i,j} + \left(1 - E_{\mathrm{MV}}\right) y_{i,j+1} \\ y^{*}_{i,j} &= K_{i,j}\,x_{i,j} \end{aligned}`,
    where: [
      { sym: "y_{i,j}", means: "mole fraction of component i in the vapour leaving tray j" },
      { sym: "E_{\\mathrm{MV}}", means: "the Murphree vapour efficiency, one number per tray in the engine" },
      { sym: "y^{*}_{i,j}", means: "the vapour that would be in equilibrium with the liquid leaving tray j" },
      { sym: "y_{i,j+1}", means: "mole fraction of i in the vapour entering tray j from the tray below" },
      { sym: "K_{i,j}", means: "the equilibrium ratio of component i at tray j" },
      { sym: "x_{i,j}", means: "mole fraction of i in the liquid leaving tray j" },
    ],
    note: "The engine applies this relation with one efficiency for every component "
      + "and every tray, the reboiler and a partial condenser excepted "
      + "(DistillationColumn.cpp:1729).",
  },
  {
    n: 2,
    title: "Demonstration 1: the efficiency you assume decides a trace specification",
    body: "Take one benzene and toluene column and run it at seven efficiencies, twice: "
      + "once as the tutorial ships it, which leaves a few per cent of toluene in the "
      + "distillate, and once taller and at higher reflux, which leaves parts per "
      + "million.  The equations are the same in both.  What changes is how many trays "
      + "the efficiency acts on: each tray removes a fraction of what is left, so a "
      + "small loss of efficiency per tray compounds over the whole column, and on a "
      + "trace specification it is the exponent that moves.  The overall efficiency "
      + "relates the equilibrium stages a separation needs to the real trays that "
      + "deliver it; the engine's tray sweep shows that, for this column, the trays a "
      + "10 ppm specification needs rise roughly in proportion to one over the "
      + "efficiency, while the impurity at a fixed number of trays moves by decades.",
    formula: String.raw`E_{\mathrm{O}} = \frac{N_{\mathrm{eq}}}{N_{\mathrm{real}}}`,
    where: [
      { sym: "E_{\\mathrm{O}}", means: "the overall column efficiency" },
      { sym: "N_{\\mathrm{eq}}", means: "the equilibrium stages the separation needs" },
      { sym: "N_{\\mathrm{real}}", means: "the real trays that deliver it" },
    ],
    note: "The column is benzene and toluene on the Wang-Henke method, near-ideal and "
      + "binary: the easy case.  The point is not that it fails; it is how fast the "
      + "answer moves with the one number you declared.",
  },
  {
    n: 3,
    title: "Demonstration 2: one tray, three correlations and a measurement",
    body: "If the efficiency matters that much, where does it come from?  The engine "
      + "can compute it for one binary tray at total reflux from the tray's geometry "
      + "and the two phases' properties, by three published correlations: AIChE, Chan "
      + "and Fair, and Syeda and Chuang.  The tray is a 14 % hole-area sieve tray of a "
      + "1.2 m test column, cyclohexane and n-heptane at 34 kPa, whose overall "
      + "efficiency was measured over its load range.  Two things show at once.  The "
      + "measured efficiency stays between 63 and 74 % from an F-factor of 1 to 2, "
      + "and falls only as the tray approaches flood: for one binary tray, in "
      + "its normal range, one number is a fair summary.  And the three correlations, "
      + "on the same tray, disagree with each other by more than the measurement "
      + "varies; two of them were fitted on data that include these very trays.",
    formula: String.raw`F_s = u_V\,\sqrt{\rho_V}`,
    where: [
      { sym: "F_s", means: "the F-factor, the load of the tray", unit: "(m/s)(kg/m³)^0.5" },
      { sym: "u_V", means: "vapour velocity on the tower's cross-sectional area", unit: "m/s" },
      { sym: "\\rho_V", means: "vapour density", unit: "kg/m³" },
    ],
    note: "For a binary the Murphree efficiencies of the two components are the same "
      + "number, because both the vapour and its equilibrium value sum to one; the "
      + "engine computes the efficiency for a binary only and refuses a third component "
      + "(DistillationColumn.cpp:5059).",
  },
  {
    n: 4,
    title: "What the engine cannot show, and what a rate-based model found on real columns",
    body: "The engine cannot give two components of one mixture different efficiencies, "
      + "and it has no rate-based column, so the cases where one efficiency is not "
      + "enough are taken from published work: four papers read for this page, and four "
      + "read by the project's coordinating session and not opened for this page (the "
      + "Pelkonen card below, and three papers behind rows of the decision table and of "
      + "the costs, each marked where it is used).  Each card below says what was "
      + "compared, what the equilibrium-stage model got wrong, and the source.",
  },
  {
    n: 5,
    title: "The decision",
    body: "The table puts what survived in one place.  Every row names where it comes "
      + "from: a demonstration on this page, or a paper you can open.  Rows that could "
      + "not be traced to either were left out, and the design note lists them.",
  },
];

/** A finding from a paper, drawn in a block marked as taken from a reference. */
export interface ReferenceFinding {
  /** Which entry of lessonReferences.json it rests on (its first author). */
  source: string;
  setting: string;
  found: string;
  /** At most one sentence quoted; null when the card paraphrases only. */
  quote: string | null;
}
export const REFERENCE_FINDINGS: readonly ReferenceFinding[] = [
  {
    source: "Taylor, Wilkinson and Kooijman (2010)",
    setting: "Two commercial H2S stripping columns with 20 real trays, 60 or more "
      + "components, modelled before with 10 equilibrium stages and one stage "
      + "efficiency of 50 % for every component.",
    found: "With equal efficiencies the equilibrium-stage model put 0.08 ppm of H2S in "
      + "the bottoms of one column where the plant measured 15 ppm; the rate-based "
      + "model gave 5 ppm with the trays modelled as valve trays and the AIChE "
      + "coefficients, and 12 ppm with sieve trays and the Chan and Fair coefficients.  The "
      + "component efficiencies it computed went from about 20 % at the top to 60 % at "
      + "the bottom for the light components, and from about 40 % to 60 % for the heavy "
      + "ones; some Murphree efficiencies lay outside zero to one.  Changing only the "
      + "thermodynamic model moved the predicted H2S by several orders of magnitude.",
    quote: "for columns such as the two H2S stripping columns described in this "
      + "exercise the proper course of action is to use a rate-based model.",
  },
  {
    source: "Springer, van der Molen and Krishna (2002)",
    setting: "Water, ethanol, methanol and acetone at total reflux in a laboratory "
      + "bubble-cap column, started near the surface that divides the composition "
      + "space into two distillation regions.",
    found: "The measured composition trajectories crossed the distillation boundary.  "
      + "A nonequilibrium model with Maxwell-Stefan diffusion followed the experiments; "
      + "the equilibrium-stage model failed even qualitatively, because the components' "
      + "Murphree efficiencies differ.",
    quote: null,
  },
  {
    source: "Pelkonen, Górak, Ohligschläger and Kaesemann (2001)",
    setting: "Acetone, methanol, 2-propanol and water at total reflux and atmospheric "
      + "pressure on 3 m of structured packing in a 100 mm column, with the composition "
      + "at the distributor 2 m up held fixed.  Read by the project's coordinating "
      + "session, not opened for this page.",
    found: "The models led to different reboiler products: the nonequilibrium-stage "
      + "model agreed with the experiment, in which the reboiler filled with water, "
      + "while the equilibrium-stage model and a model with equal diffusivities "
      + "predicted that it filled with 2-propanol.  The paper attributes the difference "
      + "to diffusional interactions near a distillation boundary, the one set by the "
      + "2-propanol and water azeotrope.",
    quote: null,
  },
  {
    source: "Thiele, Faber, Repke, Thielert and Wozny (2006)",
    setting: "Reactive absorption of H2S, CO2 and NH3 into a dilute potash solution in "
      + "a packed pilot column, sour gas treatment.",
    found: "The equilibrium model failed to predict the selective removal of H2S and "
      + "over-predicted the absorption of CO2, against both the pilot measurements and "
      + "a rate-based model with the reactions in the liquid film.",
    quote: null,
  },
  {
    source: "Jakobsson, Aittamaa, Keskinen and Ilme (2002)",
    setting: "An industrial dehexaniser of 3.7 m diameter with 40 valve trays, its "
      + "measurements reconciled and compared with an efficiency model.",
    found: "In multicomponent mixtures efficiencies have been measured to vary from "
      + "plate to plate and from component to component on the same plate.  Both an "
      + "efficiency-based and a rate-based model are only as good as their mass-transfer "
      + "correlations, which have often been developed from binary data on small "
      + "columns.",
    quote: null,
  },
];

/** One row of the decision aid.  `origin` names the demonstration or the paper. */
export interface DecisionRow {
  situation: string;
  use: string;
  why: string;
  origin: string;
}
export const DECISION_ROWS: readonly DecisionRow[] = [
  {
    situation: "A binary or near-ideal mixture, a per-cent specification, the trays "
      + "between weeping and flood.",
    use: "Equilibrium stages with one efficiency.",
    why: "A binary has one Murphree efficiency.  The measured efficiency of one tray "
      + "stayed between 63 and 74 % over its normal load range, and a 0.1 error in the "
      + "efficiency moved a per-cent impurity by about a fifth.",
    origin: "Demonstrations 1 (bulk) and 2 on this page",
  },
  {
    situation: "A trace specification, in ppm, reached over many trays.",
    use: "Equilibrium stages only if the efficiency is known to a few points; "
      + "otherwise carry a margin in trays and check how the impurity moves with it.",
    why: "At a fixed number of trays the impurity moved by about a factor of four for "
      + "0.1 of efficiency, and the trays a 10 ppm specification needs went from 27 to "
      + "63 between efficiencies of 1.0 and 0.4.  On a real stripper, one assumed "
      + "efficiency for all components put the bottoms impurity two orders of "
      + "magnitude below the plant.",
    origin: "Demonstration 1 (trace) on this page; Taylor, Wilkinson and Kooijman (2010)",
  },
  {
    situation: "A multicomponent mixture whose components transfer at very different "
      + "rates: light gases with heavy hydrocarbons, a solute stripped with steam.",
    use: "A rate-based model, or at least efficiencies that differ by component and "
      + "along the column.",
    why: "With three or more components the component efficiencies are almost always "
      + "unequal, and can exceed one or fall below zero: species transfer at different "
      + "rates, and the efficiencies are set equal only for lack of anything better.  "
      + "Computed component efficiencies went from about 20 % to 60 % along one column "
      + "and differed between light and heavy components; one number cannot hold that.",
    origin: "Taylor, Wilkinson and Kooijman (2010); Jakobsson et al. (2002); "
      + "Krishnamurthy and Taylor (1985), read by the project's coordinating session; Taylor and Krishna (2000), read by the project's coordinating session",
  },
  {
    situation: "Azeotropic distillation of three or more components near a distillation "
      + "boundary.",
    use: "A rate-based model with multicomponent diffusion.",
    why: "There the equilibrium-stage model predicted the wrong product, not a wrong "
      + "percentage: on a packed column it filled the reboiler with 2-propanol where "
      + "the experiment filled it with water, and in a tray column the measured "
      + "trajectories crossed a boundary an equilibrium-stage model cannot cross.  The "
      + "nonequilibrium model followed the experiments in both.",
    origin: "Springer, van der Molen and Krishna (2002); Pelkonen et al. (2001)",
  },
  {
    situation: "Reactive absorption or desorption, such as sour gas treatment.",
    use: "A rate-based model with the reactions in it.",
    why: "The equilibrium model got the selectivity of H2S over CO2 wrong against pilot "
      + "measurements.",
    origin: "Thiele et al. (2006)",
  },
  {
    situation: "A reactive column: reaction and separation in the same column.",
    use: "Equilibrium stages for preliminary design; a rate-based model for final design "
      + "and control, and for the column's dynamics.",
    why: "A review of reactive distillation reports that nonequilibrium studies have shown "
      + "where equilibrium models fall short for final design and control, and its "
      + "authors hold the nonequilibrium model essential for describing the dynamics.",
    origin: "Taylor and Krishna (2000), read by the project's coordinating session",
  },
  {
    situation: "Any column, before the choice between the two.",
    use: "Check the vapour-liquid equilibrium model first.",
    why: "A rate-based model inherits it: on the H2S stripper, changing the "
      + "thermodynamic model alone moved the prediction by orders of magnitude.",
    origin: "Taylor, Wilkinson and Kooijman (2010)",
  },
];

/** What each choice costs, each sentence with its origin. */
export const EQ_RB_COSTS: readonly { text: string; origin: string }[] = [
  {
    text: "An equilibrium-stage model needs one efficiency, and that number is the "
      + "uncertain part: three correlations disagree on one tray by more than the "
      + "measurement varies.",
    origin: "Demonstration 2 on this page",
  },
  {
    text: "A rate-based model needs mass-transfer coefficients and an interfacial area "
      + "for the trays or packing, from correlations often developed on binary data in "
      + "small columns; on one column the rate-based model gave 5 ppm with valve trays "
      + "and the AIChE coefficients and 12 ppm with sieve trays and the Chan and Fair "
      + "coefficients.",
    origin: "Jakobsson et al. (2002); Taylor, Wilkinson and Kooijman (2010)",
  },
  {
    text: "What a rate-based model needs is the scarce part: design data for the trays or "
      + "packing, from which the transfer coefficients, areas and hold-ups come; "
      + "hydrodynamic and mass-transfer parameters; and physical properties such as "
      + "diffusion coefficients, viscosity and surface tension.  For reactive columns the "
      + "authors report the hydrodynamic and mass-transfer parameters to be badly lacking.",
    origin: "Taylor and Krishna (2000), read by the project's coordinating session",
  },
  {
    text: "On a tray, the flow pattern assumed for the liquid alone raises the overall "
      + "transfer rate by up to about 20 %, plug flow against fully mixed.",
    origin: "Taylor and Kooijman (2014), read by the project's coordinating session",
  },
  {
    text: "In the reactive tray-column comparisons one review reports, an equilibrium "
      + "model with an efficiency agreed closely with the rate-based model only when "
      + "the tray efficiency could be predicted correctly.",
    origin: "Taylor and Krishna (2000), read by the project's coordinating session",
  },
  {
    text: "The size of the problem, as one paper counts it for its own formulation: a "
      + "ten-stage column with three components is 70 equations on equilibrium stages "
      + "against 160 on nonequilibrium stages, and fifty stages with five components "
      + "are 550 against no fewer than 1 300; per stage, 2c + 1 variables against "
      + "5c + 1, for c components.  The authors call the difference considerable, but "
      + "a minor drawback once the sparse equations are solved as such.",
    origin: "Krishnamurthy and Taylor (1985), read by the project's coordinating session",
  },
  {
    text: "On the two strippers, with 60 or more components, the authors found no "
      + "significant penalty in calculation speed, convergence or the availability of "
      + "properties.",
    origin: "Taylor, Wilkinson and Kooijman (2010)",
  },
];

export const EQ_RB_LIMITS: readonly LessonLimit[] = [
  {
    id: "no-rate-based",
    title: "No rate-based model in the engine.",
    body: "Everything this page says a rate-based model does is taken from the papers "
      + "it cites.  The engine cannot show two components of one mixture with "
      + "different efficiencies, nor a reaction in the liquid film.",
  },
  {
    id: "easy-column",
    title: "Demonstration 1 is the easy case.",
    body: "Benzene and toluene are near-ideal and binary, and the Wang-Henke column "
      + "assumes constant molar overflow.  The trace column's four numbers (30 stages, "
      + "feed on stage 20, reflux 3, distillate 45 kmol/h) and the 10 ppm target are "
      + "the page's own choices, picked so the effect is plain; no plant is described.  "
      + "The bottom of that column sits slightly above the declared range of toluene's "
      + "vapour-pressure fit, which the engine announces in the run log.",
  },
  {
    id: "measured",
    title: "The measured points were not re-read for this page.",
    body: "The seven measured efficiencies of demonstration 2 are the tree's "
      + "transcription of Yanagi and Sakata (1982): two runs tabulated in the paper "
      + "and five read off one of its figures, by the author of the efficiency models' "
      + "design record.",
  },
  {
    id: "incomplete",
    title: "The list of situations is incomplete.",
    body: "It holds only what could be traced to a source opened for this page.  A "
      + "review often cited for these recommendations, Taylor, Krishna and Kooijman, "
      + "Real-world modeling of distillation (Chem. Eng. Prog., July 2003), could not be "
      + "opened and is not used; reading it is the next step that could add rows.",
  },
  {
    id: "browser",
    title: "Runs in your browser.",
    body: "Every number is the engine compiled to run in the browser, on four tutorial "
      + "cases, with declared numbers changed only where the page says so.",
  },
];
