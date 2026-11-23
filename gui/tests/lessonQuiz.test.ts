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
  lessonQuiz.test -- every EduTool ends with a learning quiz (DEV.md 4c C158).

  THE COVERAGE REQUIREMENT IS THE TABLE `QUIZZES` BELOW.  C158's first wave
  is a sample for Vitor's review: standard-state (C32) and six tools from
  six disciplines.  The other tools wait for that review, so the test does
  not yet require a quiz of every tool; it requires one of every tool in the
  table, holds each to the shape, and refuses a quiz that is drawn without
  being in the table.  When every tool has one, the requirement becomes
  "every live tool in the registry" -- the arm that would say so is (a).

    (a) every tool in the table is a LIVE tool of the registry;
    (b) every question: an id unique in its quiz, a question ending in a
        question mark, 3 to 5 distinct options (standard-state's six are
        Yes/No and are the one named exception), one `correct` in range,
        a feedback that explains (not a word), at least one step, and every
        step a step THAT LESSON HAS; a declared origin is one the tool's
        registry entry declares;
    (c) the source draws it: each quiz is rendered by exactly one
        <LessonQuiz> in the tool's own file, with the lesson it names, and
        no file draws a quiz the table does not hold;
    (d) the rendered tool shows it, every question, for the tools that
        render in the node test environment (McCabe lives inside
        MethodsWorkspace, which reaches Plotly at module scope, so (c) is
        its arm).

  WHAT THIS DOES NOT CHECK, and cannot: whether a question tests a concept
  rather than trivia, whether its distractors are the misconceptions the
  lesson warns against, whether its feedback is right, and whether a number
  in a question needed an origin.  That is the pedagogy, and it is Vitor's.
\*---------------------------------------------------------------------------*/

import { readFileSync, readdirSync } from "node:fs";
import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";

//  Four tools whose lesson steps live in their own file import the plot
//  module, which needs a browser; the plot is not under test here.
vi.mock("../src/ui/plotting/plotly.js", () => ({
  Plot: () => null,
  PLOT_COLORS: { series: ["#26c6da", "#ffb74d"] },
  PLOT_CONFIG: {},
  darkLayout: { font: {}, xaxis: {}, yaxis: {}, legend: {}, margin: {} },
}));


import type { QuizQuestion, QuizStepRef } from "../src/ui/methods/lessonQuiz.js";
import { METHOD_TOOLS, type MethodToolId } from "../src/ui/methods/registry.js";
import { STANDARD_STATE_QUIZ, STANDARD_STATE_STEPS } from "../src/ui/methods/standardStateLesson.js";
import { MCCABE_QUIZ, MCCABE_STEPS } from "../src/ui/methods/mccabeLesson.js";
import { DR_QUIZ, DR_STEPS } from "../src/ui/methods/dataReconciliationLesson.js";
import { SIMPLICITY_QUIZ, SIMPLICITY_STEPS } from "../src/ui/methods/correlationSimplicityLesson.js";
import { BUND_QUIZ, BUND_STEPS } from "../src/ui/methods/bundLesson.js";
import { LADDER_QUIZ, LADDER_SECTIONS } from "../src/ui/methods/reactorLadderLesson.js";
import { FEL_QUIZ, FEL_STEPS } from "../src/ui/methods/frontEndLoadingLesson.js";
import { IP_QUIZ, IP_STEPS } from "../src/ui/methods/ipStrategyLesson.js";
import { StandardStateTool } from "../src/ui/methods/StandardStateTool.js";
import { DataReconciliationTool } from "../src/ui/methods/DataReconciliationTool.js";
import { CorrelationSimplicityTool } from "../src/ui/methods/CorrelationSimplicityTool.js";
import { BundTool } from "../src/ui/methods/BundTool.js";
import { ReactorLadderTool } from "../src/ui/methods/ReactorLadderTool.js";
import { FrontEndLoadingTool } from "../src/ui/methods/FrontEndLoadingTool.js";
import { IpStrategyTool } from "../src/ui/methods/IpStrategyTool.js";
import { TREE_QUIZ, TREE_STEPS } from "../src/ui/methods/treeOfChemistryLesson.js";
import { TreeOfChemistryTool } from "../src/ui/methods/TreeOfChemistryTool.js";
import { PATENT_QUIZ, PATENT_STEPS } from "../src/ui/methods/patentExpiryLesson.js";
import { PatentExpiryTool } from "../src/ui/methods/PatentExpiryTool.js";
import { ECON_ERRORS_QUIZ, ECON_ERRORS_STEPS } from "../src/ui/methods/economicsErrorsLesson.js";
import { EconomicsErrorsTool } from "../src/ui/methods/EconomicsErrorsTool.js";
import { PLANT_RUN_QUIZ, PLANT_RUN_STEPS } from "../src/ui/methods/plantRunLesson.js";
import { PlantRunTool } from "../src/ui/methods/PlantRunTool.js";
import { SITE_PROCESS_PRICE_QUIZ, SITE_PROCESS_PRICE_STEPS } from "../src/ui/methods/siteProcessPriceLesson.js";
import { SiteProcessPriceTool } from "../src/ui/methods/SiteProcessPriceTool.js";
import { DEMAND_QUIZ, DEMAND_STEPS } from "../src/ui/methods/demandForecastLesson.js";
import { DemandForecastTool } from "../src/ui/methods/DemandForecastTool.js";
import { PlantCostTool } from "../src/ui/methods/PlantCostTool.js";
import { PLANT_COST_QUIZ, PLANT_COST_STEPS } from "../src/ui/methods/plantCostLesson.js";
import { FaultDiagnosisTool } from "../src/ui/methods/FaultDiagnosisTool.js";
import { FAULT_DIAGNOSIS_QUIZ, FAULT_DIAGNOSIS_STEPS } from "../src/ui/methods/faultDiagnosisLesson.js";
import { DryerSelectionTool } from "../src/ui/methods/DryerSelectionTool.js";
import { DRYER_SELECTION_QUIZ, DRYER_SELECTION_STEPS } from "../src/ui/methods/dryerSelectionLesson.js";
import { STACK_QUIZ, STACK_STEPS } from "../src/ui/methods/stackDispersionLesson.js";
import { CampaignPlanTool } from "../src/ui/methods/CampaignPlanTool.js";
import { TransferUnitTool } from "../src/ui/methods/TransferUnitTool.js";
import {
  TRANSFER_UNIT_QUIZ, TRANSFER_UNIT_STEPS,
} from "../src/ui/methods/transferUnitLesson.js";
import { SD_QUIZ, SD_STEPS } from "../src/ui/methods/sentenceToDecisionLesson.js";
import { SentenceToDecisionTool } from "../src/ui/methods/SentenceToDecisionTool.js";
import { CAMPAIGN_PLAN_QUIZ, CAMPAIGN_PLAN_STEPS } from "../src/ui/methods/campaignPlanLesson.js";
import { AdsorbentSelectionTool } from "../src/ui/methods/AdsorbentSelectionTool.js";
import { ADS_SEL_QUIZ, ADS_SEL_STEPS } from "../src/ui/methods/adsorbentSelectionLesson.js";
import { LinearAlgebraTool } from "../src/ui/methods/LinearAlgebraTool.js";
import { LA_QUIZ, LA_STEPS } from "../src/ui/methods/linearAlgebraLesson.js";

import { QP_QUIZ, QP_STEPS } from "../src/ui/methods/activeSetQpLesson.js";
import { ActiveSetQpTool } from "../src/ui/methods/ActiveSetQpTool.js";

import { ISO_QUIZ, ISO_STEPS } from "../src/ui/methods/adsorptionIsothermsLesson.js";
import { AdsorptionIsothermsTool } from "../src/ui/methods/AdsorptionIsothermsTool.js";

import { APPROACH_QUIZ, APPROACH_STEPS } from "../src/ui/methods/approachToEquilibriumLesson.js";
import { ApproachToEquilibriumTool } from "../src/ui/methods/ApproachToEquilibriumTool.js";

import { BATCH_QUIZ, BATCH_STEPS } from "../src/ui/methods/batchAdsorptionLesson.js";
import { BatchAdsorptionTool } from "../src/ui/methods/BatchAdsorptionTool.js";

import { BJERRUM_QUIZ, BJERRUM_STEPS } from "../src/ui/methods/bjerrumLesson.js";
import { BjerrumTool } from "../src/ui/methods/BjerrumTool.js";

import { BODE_QUIZ, BODE_STEPS } from "../src/ui/methods/bodeLesson.js";
import { BodeTool } from "../src/ui/methods/BodeTool.js";

import { BATCH_MEMBRANE_QUIZ, BATCH_MEMBRANE_STEPS } from "../src/ui/methods/batchMembraneLesson.js";

import { BREAKTHROUGH_QUIZ, BREAKTHROUGH_STEPS } from "../src/ui/methods/breakthroughLesson.js";

import { CASE_ASSEMBLY_QUIZ, CASE_ASSEMBLY_STEPS } from "../src/ui/methods/caseAssemblyLesson.js";
import { CaseAssemblyTool } from "../src/ui/methods/CaseAssemblyTool.js";

import { CHROM_QUIZ, CHROM_STEPS } from "../src/ui/methods/chromatographyLesson.js";
import { ChromatographyTool } from "../src/ui/methods/ChromatographyTool.js";

import { COMPRESSION_QUIZ, COMPRESSION_STEPS } from "../src/ui/methods/compressionLesson.js";
import { CompressionTool } from "../src/ui/methods/CompressionTool.js";

import { COLUMN_CONTROL_QUIZ, COLUMN_CONTROL_STEPS } from "../src/ui/methods/columnControlLesson.js";
import { ColumnControlTool } from "../src/ui/methods/ColumnControlTool.js";

import { DP_QUIZ, DP_STEPS } from "../src/ui/methods/databaseToParametersLesson.js";
import { DatabaseToParametersTool } from "../src/ui/methods/DatabaseToParametersTool.js";

import { PATHWAYS_QUIZ, PATHWAYS_STEPS } from "../src/ui/methods/declaredPathwaysLesson.js";
import { DeclaredPathwaysTool } from "../src/ui/methods/DeclaredPathwaysTool.js";

import { DRYING_QUIZ, DRYING_STEPS } from "../src/ui/methods/dryingLesson.js";
import { DryingCurveTool } from "../src/ui/methods/DryingCurveTool.js";

import { EM_QUIZ, EM_STEPS } from "../src/ui/methods/electrolyteModelsLesson.js";
import { ElectrolyteModelsTool } from "../src/ui/methods/ElectrolyteModelsTool.js";

import { EP_QUIZ, EP_STEPS } from "../src/ui/methods/elementPotentialLesson.js";
import { ElementPotentialTool } from "../src/ui/methods/ElementPotentialTool.js";

import { ENTU_QUIZ, ENTU_STEPS } from "../src/ui/methods/epsilonNtuLesson.js";
import { EpsilonNtuTool } from "../src/ui/methods/EpsilonNtuTool.js";

import { LANDSCAPE_QUIZ, LANDSCAPE_STEPS } from "../src/ui/methods/equilibriumLandscapesLesson.js";
import { EquilibriumLandscapesTool } from "../src/ui/methods/EquilibriumLandscapesTool.js";

import { EQ_RB_QUIZ, EQ_RB_STEPS } from "../src/ui/methods/equilibriumOrRateBasedLesson.js";
import { EquilibriumOrRateBasedTool } from "../src/ui/methods/EquilibriumOrRateBasedTool.js";

import { FAST_SLOW_QUIZ, FAST_SLOW_STEPS } from "../src/ui/methods/fastSlowLesson.js";
import { FastSlowTool } from "../src/ui/methods/FastSlowTool.js";

import { FUG_QUIZ, FUG_STEPS } from "../src/ui/methods/fugLesson.js";
import { FugShortcutTool } from "../src/ui/methods/FugShortcutTool.js";

import { FLUID_QUIZ, FLUID_STEPS } from "../src/ui/methods/fluidisedBedsLesson.js";
import { FluidisedBedsTool } from "../src/ui/methods/FluidisedBedsTool.js";

import { GMP_LAYOUT_QUIZ, GMP_LAYOUT_STEPS } from "../src/ui/methods/gmpLayoutLesson.js";
import { GmpLayoutTool } from "../src/ui/methods/GmpLayoutTool.js";

import { KNOW_K_QUIZ, KNOW_K_STEPS } from "../src/ui/methods/knowKLesson.js";
import { KnowKTool } from "../src/ui/methods/KnowKTool.js";

import { HUNTER_NASH_QUIZ, HUNTER_NASH_STEPS } from "../src/ui/methods/hunterNashLesson.js";
import { TieTriangleTool } from "../src/ui/methods/TieTriangleTool.js";

import { LS_QUIZ, LS_STEPS } from "../src/ui/methods/leastSquaresLesson.js";
import { LeastSquaresTool } from "../src/ui/methods/LeastSquaresTool.js";

import { LETDOWN_QUIZ, LETDOWN_STEPS } from "../src/ui/methods/letdownLesson.js";
import { LetdownTool } from "../src/ui/methods/LetdownTool.js";

import { LEVENSPIEL_QUIZ, LEVENSPIEL_STEPS } from "../src/ui/methods/levenspielLesson.js";

import { LIMITING_QUIZ, LIMITING_STEPS } from "../src/ui/methods/limitingReactantLesson.js";
import { LimitingReactantTool } from "../src/ui/methods/LimitingReactantTool.js";

import { KREMSER_QUIZ, KREMSER_STEPS } from "../src/ui/methods/kremserLesson.js";
import { KremserTool } from "../src/ui/methods/KremserTool.js";

import { LUB_SCALEUP_QUIZ, LUB_SCALEUP_STEPS } from "../src/ui/methods/lubScaleupLesson.js";
import { LubScaleupTool } from "../src/ui/methods/LubScaleupTool.js";

import { MATERIALS_QUIZ, MATERIALS_STEPS } from "../src/ui/methods/materialsLesson.js";
import { MaterialsTool } from "../src/ui/methods/MaterialsTool.js";

import { CLAUS_QUIZ, CLAUS_STEPS } from "../src/ui/methods/ClausGibbsTool.js";

import { COSMO_QUIZ, COSMO_STEPS } from "../src/ui/methods/CosmoSacTheoryTool.js";

import { LC_QUIZ, LC_STEPS } from "../src/ui/methods/LocalCompositionTool.js";

import { FLASH_QUIZ, FLASH_STEPS } from "../src/ui/methods/FlashOperatingLineTool.js";

const GUI = new URL("../", import.meta.url);
const read = (rel: string): string => readFileSync(new URL(rel, GUI), "utf-8");

interface QuizEntry {
  quiz: readonly QuizQuestion[];
  quizName: string;
  lesson: readonly QuizStepRef[];
  lessonName: string;
  /** The file (under gui/) that draws the quiz. */
  file: string;
  /** The tool's component, when it renders in the node environment. */
  tool?: FunctionComponent;
  /** A named exception to the 3-5 options rule. */
  minOptions?: { n: number; why: string };
}

/** THE COVERAGE REQUIREMENT: the tools that must end with a quiz. */
const QUIZZES: Partial<Record<MethodToolId, QuizEntry>> = {
  "standard-state": {
    quiz: STANDARD_STATE_QUIZ, quizName: "STANDARD_STATE_QUIZ",
    lesson: STANDARD_STATE_STEPS, lessonName: "STANDARD_STATE_STEPS",
    file: "src/ui/methods/StandardStateTool.tsx", tool: StandardStateTool,
    minOptions: { n: 2, why: "C32's six questions are Yes/No, as the brief asked" },
  },
  mccabe: {
    quiz: MCCABE_QUIZ, quizName: "MCCABE_QUIZ",
    lesson: MCCABE_STEPS, lessonName: "MCCABE_STEPS",
    file: "src/ui/MethodsWorkspace.tsx",
  },
  "data-reconciliation": {
    quiz: DR_QUIZ, quizName: "DR_QUIZ", lesson: DR_STEPS, lessonName: "DR_STEPS",
    file: "src/ui/methods/DataReconciliationTool.tsx", tool: DataReconciliationTool,
  },
  "correlation-simplicity": {
    quiz: SIMPLICITY_QUIZ, quizName: "SIMPLICITY_QUIZ",
    lesson: SIMPLICITY_STEPS, lessonName: "SIMPLICITY_STEPS",
    file: "src/ui/methods/CorrelationSimplicityTool.tsx", tool: CorrelationSimplicityTool,
  },
  bund: {
    quiz: BUND_QUIZ, quizName: "BUND_QUIZ", lesson: BUND_STEPS, lessonName: "BUND_STEPS",
    file: "src/ui/methods/BundTool.tsx", tool: BundTool,
  },
  "reactor-ladder": {
    quiz: LADDER_QUIZ, quizName: "LADDER_QUIZ",
    lesson: LADDER_SECTIONS, lessonName: "LADDER_SECTIONS",
    file: "src/ui/methods/ReactorLadderTool.tsx", tool: ReactorLadderTool,
  },
  "front-end-loading": {
    quiz: FEL_QUIZ, quizName: "FEL_QUIZ", lesson: FEL_STEPS, lessonName: "FEL_STEPS",
    file: "src/ui/methods/FrontEndLoadingTool.tsx", tool: FrontEndLoadingTool,
  },
  "ip-strategy": {
    quiz: IP_QUIZ, quizName: "IP_QUIZ", lesson: IP_STEPS, lessonName: "IP_STEPS",
    file: "src/ui/methods/IpStrategyTool.tsx", tool: IpStrategyTool,
  },
  "tree-of-chemistry": {
    quiz: TREE_QUIZ, quizName: "TREE_QUIZ", lesson: TREE_STEPS, lessonName: "TREE_STEPS",
    file: "src/ui/methods/TreeOfChemistryTool.tsx", tool: TreeOfChemistryTool,
  },
  "patent-expiry": {
    quiz: PATENT_QUIZ, quizName: "PATENT_QUIZ", lesson: PATENT_STEPS, lessonName: "PATENT_STEPS",
    file: "src/ui/methods/PatentExpiryTool.tsx", tool: PatentExpiryTool,
  },
  "economics-errors": {
    quiz: ECON_ERRORS_QUIZ, quizName: "ECON_ERRORS_QUIZ", lesson: ECON_ERRORS_STEPS, lessonName: "ECON_ERRORS_STEPS",
    file: "src/ui/methods/EconomicsErrorsTool.tsx", tool: EconomicsErrorsTool,
  },
  "plant-running-cost": {
    quiz: PLANT_RUN_QUIZ, quizName: "PLANT_RUN_QUIZ", lesson: PLANT_RUN_STEPS, lessonName: "PLANT_RUN_STEPS",
    file: "src/ui/methods/PlantRunTool.tsx", tool: PlantRunTool,
  },
  "site-process-price": {
    quiz: SITE_PROCESS_PRICE_QUIZ, quizName: "SITE_PROCESS_PRICE_QUIZ", lesson: SITE_PROCESS_PRICE_STEPS, lessonName: "SITE_PROCESS_PRICE_STEPS",
    file: "src/ui/methods/SiteProcessPriceTool.tsx", tool: SiteProcessPriceTool,
  },
  "demand-forecast": {
    quiz: DEMAND_QUIZ, quizName: "DEMAND_QUIZ", lesson: DEMAND_STEPS, lessonName: "DEMAND_STEPS",
    file: "src/ui/methods/DemandForecastTool.tsx", tool: DemandForecastTool,
  },
  "sentence-to-decision": {
    quiz: SD_QUIZ, quizName: "SD_QUIZ", lesson: SD_STEPS, lessonName: "SD_STEPS",
    file: "src/ui/methods/SentenceToDecisionTool.tsx", tool: SentenceToDecisionTool,
  },
  "campaign-plan": {
    quiz: CAMPAIGN_PLAN_QUIZ, quizName: "CAMPAIGN_PLAN_QUIZ", lesson: CAMPAIGN_PLAN_STEPS, lessonName: "CAMPAIGN_PLAN_STEPS",
    file: "src/ui/methods/CampaignPlanTool.tsx", tool: CampaignPlanTool,
  },
  "transfer-unit": {
    quiz: TRANSFER_UNIT_QUIZ, quizName: "TRANSFER_UNIT_QUIZ", lesson: TRANSFER_UNIT_STEPS, lessonName: "TRANSFER_UNIT_STEPS",
    file: "src/ui/methods/TransferUnitTool.tsx", tool: TransferUnitTool,
  },
  "adsorbent-selection": {
    quiz: ADS_SEL_QUIZ, quizName: "ADS_SEL_QUIZ", lesson: ADS_SEL_STEPS, lessonName: "ADS_SEL_STEPS",
    file: "src/ui/methods/AdsorbentSelectionTool.tsx", tool: AdsorbentSelectionTool,
  },
  "linear-algebra-without-pain": {
    quiz: LA_QUIZ, quizName: "LA_QUIZ", lesson: LA_STEPS, lessonName: "LA_STEPS",
    file: "src/ui/methods/LinearAlgebraTool.tsx", tool: LinearAlgebraTool,
  },
  //  No `tool`: its figures need Plotly, which does not load under node; the
  //  rendered quiz is checked in stackDispersion.test.ts, with the plot mocked.
  "stack-dispersion": {
    quiz: STACK_QUIZ, quizName: "STACK_QUIZ", lesson: STACK_STEPS, lessonName: "STACK_STEPS",
    file: "src/ui/methods/StackDispersionTool.tsx",
  },
  "plant-cost": {
    quiz: PLANT_COST_QUIZ, quizName: "PLANT_COST_QUIZ", lesson: PLANT_COST_STEPS, lessonName: "PLANT_COST_STEPS",
    file: "src/ui/methods/PlantCostTool.tsx", tool: PlantCostTool,
  },
  "dryer-selection": {
    quiz: DRYER_SELECTION_QUIZ, quizName: "DRYER_SELECTION_QUIZ",
    lesson: DRYER_SELECTION_STEPS, lessonName: "DRYER_SELECTION_STEPS",
    file: "src/ui/methods/DryerSelectionTool.tsx", tool: DryerSelectionTool,
  },
  "fault-diagnosis": {
    quiz: FAULT_DIAGNOSIS_QUIZ, quizName: "FAULT_DIAGNOSIS_QUIZ",
    lesson: FAULT_DIAGNOSIS_STEPS, lessonName: "FAULT_DIAGNOSIS_STEPS",
    file: "src/ui/methods/FaultDiagnosisTool.tsx", tool: FaultDiagnosisTool,
  },
  "active-set-qp": {
    quiz: QP_QUIZ, quizName: "QP_QUIZ", lesson: QP_STEPS, lessonName: "QP_STEPS",
    file: "src/ui/methods/ActiveSetQpTool.tsx", tool: ActiveSetQpTool,
  },
  "adsorption-isotherms": {
    quiz: ISO_QUIZ, quizName: "ISO_QUIZ", lesson: ISO_STEPS, lessonName: "ISO_STEPS",
    file: "src/ui/methods/AdsorptionIsothermsTool.tsx", tool: AdsorptionIsothermsTool,
  },
  "approach-to-equilibrium": {
    quiz: APPROACH_QUIZ, quizName: "APPROACH_QUIZ", lesson: APPROACH_STEPS, lessonName: "APPROACH_STEPS",
    file: "src/ui/methods/ApproachToEquilibriumTool.tsx", tool: ApproachToEquilibriumTool,
  },
  "batch-adsorption": {
    quiz: BATCH_QUIZ, quizName: "BATCH_QUIZ", lesson: BATCH_STEPS, lessonName: "BATCH_STEPS",
    file: "src/ui/methods/BatchAdsorptionTool.tsx", tool: BatchAdsorptionTool,
  },
  bjerrum: {
    quiz: BJERRUM_QUIZ, quizName: "BJERRUM_QUIZ", lesson: BJERRUM_STEPS, lessonName: "BJERRUM_STEPS",
    file: "src/ui/methods/BjerrumTool.tsx", tool: BjerrumTool,
  },
  bode: {
    quiz: BODE_QUIZ, quizName: "BODE_QUIZ", lesson: BODE_STEPS, lessonName: "BODE_STEPS",
    file: "src/ui/methods/BodeTool.tsx", tool: BodeTool,
  },
  "batch-membrane": {
    quiz: BATCH_MEMBRANE_QUIZ, quizName: "BATCH_MEMBRANE_QUIZ", lesson: BATCH_MEMBRANE_STEPS, lessonName: "BATCH_MEMBRANE_STEPS",
    file: "src/ui/methods/BatchMembraneTool.tsx",
  },
  breakthrough: {
    quiz: BREAKTHROUGH_QUIZ, quizName: "BREAKTHROUGH_QUIZ", lesson: BREAKTHROUGH_STEPS, lessonName: "BREAKTHROUGH_STEPS",
    file: "src/ui/methods/BreakthroughTool.tsx",
  },
  "case-assembly": {
    quiz: CASE_ASSEMBLY_QUIZ, quizName: "CASE_ASSEMBLY_QUIZ", lesson: CASE_ASSEMBLY_STEPS, lessonName: "CASE_ASSEMBLY_STEPS",
    file: "src/ui/methods/CaseAssemblyTool.tsx", tool: CaseAssemblyTool,
  },
  chromatography: {
    quiz: CHROM_QUIZ, quizName: "CHROM_QUIZ", lesson: CHROM_STEPS, lessonName: "CHROM_STEPS",
    file: "src/ui/methods/ChromatographyTool.tsx", tool: ChromatographyTool,
  },
  compression: {
    quiz: COMPRESSION_QUIZ, quizName: "COMPRESSION_QUIZ", lesson: COMPRESSION_STEPS, lessonName: "COMPRESSION_STEPS",
    file: "src/ui/methods/CompressionTool.tsx", tool: CompressionTool,
  },
  "column-control": {
    quiz: COLUMN_CONTROL_QUIZ, quizName: "COLUMN_CONTROL_QUIZ", lesson: COLUMN_CONTROL_STEPS, lessonName: "COLUMN_CONTROL_STEPS",
    file: "src/ui/methods/ColumnControlTool.tsx", tool: ColumnControlTool,
  },
  "database-to-parameters": {
    quiz: DP_QUIZ, quizName: "DP_QUIZ", lesson: DP_STEPS, lessonName: "DP_STEPS",
    file: "src/ui/methods/DatabaseToParametersTool.tsx", tool: DatabaseToParametersTool,
  },
  "declared-pathways": {
    quiz: PATHWAYS_QUIZ, quizName: "PATHWAYS_QUIZ", lesson: PATHWAYS_STEPS, lessonName: "PATHWAYS_STEPS",
    file: "src/ui/methods/DeclaredPathwaysTool.tsx", tool: DeclaredPathwaysTool,
  },
  drying: {
    quiz: DRYING_QUIZ, quizName: "DRYING_QUIZ", lesson: DRYING_STEPS, lessonName: "DRYING_STEPS",
    file: "src/ui/methods/DryingCurveTool.tsx", tool: DryingCurveTool,
  },
  "electrolyte-models": {
    quiz: EM_QUIZ, quizName: "EM_QUIZ", lesson: EM_STEPS, lessonName: "EM_STEPS",
    file: "src/ui/methods/ElectrolyteModelsTool.tsx", tool: ElectrolyteModelsTool,
  },
  "element-potential": {
    quiz: EP_QUIZ, quizName: "EP_QUIZ", lesson: EP_STEPS, lessonName: "EP_STEPS",
    file: "src/ui/methods/ElementPotentialTool.tsx", tool: ElementPotentialTool,
  },
  entu: {
    quiz: ENTU_QUIZ, quizName: "ENTU_QUIZ", lesson: ENTU_STEPS, lessonName: "ENTU_STEPS",
    file: "src/ui/methods/EpsilonNtuTool.tsx", tool: EpsilonNtuTool,
  },
  "equilibrium-landscapes": {
    quiz: LANDSCAPE_QUIZ, quizName: "LANDSCAPE_QUIZ", lesson: LANDSCAPE_STEPS, lessonName: "LANDSCAPE_STEPS",
    file: "src/ui/methods/EquilibriumLandscapesTool.tsx", tool: EquilibriumLandscapesTool,
  },
  "equilibrium-or-rate-based": {
    quiz: EQ_RB_QUIZ, quizName: "EQ_RB_QUIZ", lesson: EQ_RB_STEPS, lessonName: "EQ_RB_STEPS",
    file: "src/ui/methods/EquilibriumOrRateBasedTool.tsx", tool: EquilibriumOrRateBasedTool,
  },
  "fast-and-slow": {
    quiz: FAST_SLOW_QUIZ, quizName: "FAST_SLOW_QUIZ", lesson: FAST_SLOW_STEPS, lessonName: "FAST_SLOW_STEPS",
    file: "src/ui/methods/FastSlowTool.tsx", tool: FastSlowTool,
  },
  fug: {
    quiz: FUG_QUIZ, quizName: "FUG_QUIZ", lesson: FUG_STEPS, lessonName: "FUG_STEPS",
    file: "src/ui/methods/FugShortcutTool.tsx", tool: FugShortcutTool,
  },
  "fluidised-beds": {
    quiz: FLUID_QUIZ, quizName: "FLUID_QUIZ", lesson: FLUID_STEPS, lessonName: "FLUID_STEPS",
    file: "src/ui/methods/FluidisedBedsTool.tsx", tool: FluidisedBedsTool,
  },
  "gmp-layout": {
    quiz: GMP_LAYOUT_QUIZ, quizName: "GMP_LAYOUT_QUIZ", lesson: GMP_LAYOUT_STEPS, lessonName: "GMP_LAYOUT_STEPS",
    file: "src/ui/methods/GmpLayoutTool.tsx", tool: GmpLayoutTool,
  },
  "how-do-we-know-k": {
    quiz: KNOW_K_QUIZ, quizName: "KNOW_K_QUIZ", lesson: KNOW_K_STEPS, lessonName: "KNOW_K_STEPS",
    file: "src/ui/methods/KnowKTool.tsx", tool: KnowKTool,
  },
  "hunter-nash": {
    quiz: HUNTER_NASH_QUIZ, quizName: "HUNTER_NASH_QUIZ", lesson: HUNTER_NASH_STEPS, lessonName: "HUNTER_NASH_STEPS",
    file: "src/ui/methods/TieTriangleTool.tsx", tool: TieTriangleTool,
  },
  "least-squares": {
    quiz: LS_QUIZ, quizName: "LS_QUIZ", lesson: LS_STEPS, lessonName: "LS_STEPS",
    file: "src/ui/methods/LeastSquaresTool.tsx", tool: LeastSquaresTool,
  },
  letdown: {
    quiz: LETDOWN_QUIZ, quizName: "LETDOWN_QUIZ", lesson: LETDOWN_STEPS, lessonName: "LETDOWN_STEPS",
    file: "src/ui/methods/LetdownTool.tsx", tool: LetdownTool,
  },
  levenspiel: {
    quiz: LEVENSPIEL_QUIZ, quizName: "LEVENSPIEL_QUIZ", lesson: LEVENSPIEL_STEPS, lessonName: "LEVENSPIEL_STEPS",
    file: "src/ui/methods/LevenspielTool.tsx",
  },
  "limiting-reactant": {
    quiz: LIMITING_QUIZ, quizName: "LIMITING_QUIZ", lesson: LIMITING_STEPS, lessonName: "LIMITING_STEPS",
    file: "src/ui/methods/LimitingReactantTool.tsx", tool: LimitingReactantTool,
  },
  kremser: {
    quiz: KREMSER_QUIZ, quizName: "KREMSER_QUIZ", lesson: KREMSER_STEPS, lessonName: "KREMSER_STEPS",
    file: "src/ui/methods/KremserTool.tsx", tool: KremserTool,
  },
  "lub-scaleup": {
    quiz: LUB_SCALEUP_QUIZ, quizName: "LUB_SCALEUP_QUIZ", lesson: LUB_SCALEUP_STEPS, lessonName: "LUB_SCALEUP_STEPS",
    file: "src/ui/methods/LubScaleupTool.tsx", tool: LubScaleupTool,
  },
  materials: {
    quiz: MATERIALS_QUIZ, quizName: "MATERIALS_QUIZ", lesson: MATERIALS_STEPS, lessonName: "MATERIALS_STEPS",
    file: "src/ui/methods/MaterialsTool.tsx", tool: MaterialsTool,
  },
  "claus-gibbs": {
    quiz: CLAUS_QUIZ, quizName: "CLAUS_QUIZ", lesson: CLAUS_STEPS, lessonName: "CLAUS_STEPS",
    file: "src/ui/methods/ClausGibbsTool.tsx",
  },
  "cosmo-sac-theory": {
    quiz: COSMO_QUIZ, quizName: "COSMO_QUIZ", lesson: COSMO_STEPS, lessonName: "COSMO_STEPS",
    file: "src/ui/methods/CosmoSacTheoryTool.tsx",
  },
  "local-composition": {
    quiz: LC_QUIZ, quizName: "LC_QUIZ", lesson: LC_STEPS, lessonName: "LC_STEPS",
    file: "src/ui/methods/LocalCompositionTool.tsx",
  },
  "flash-operating-line": {
    quiz: FLASH_QUIZ, quizName: "FLASH_QUIZ", lesson: FLASH_STEPS, lessonName: "FLASH_STEPS",
    file: "src/ui/methods/FlashOperatingLineTool.tsx",
  },
};

const live = METHOD_TOOLS.filter((t) => t.status === "live");
const quizzed = live.filter((t) => QUIZZES[t.id] !== undefined);

describe("the quiz coverage (C158)", () => {
  it("(a) every tool the table requires is a live tool of the registry", () => {
    const ids = new Set(live.map((t) => t.id));
    for (const id of Object.keys(QUIZZES)) expect(ids.has(id as MethodToolId), id).toBe(true);
    expect(quizzed.length).toBe(Object.keys(QUIZZES).length);
    expect(quizzed.length).toBeGreaterThanOrEqual(7);
  });
});

describe.each(quizzed.map((t) => [t.id, t] as const))("%s: its quiz", (id, t) => {
  const e = QUIZZES[id]!;
  it("(b) has the shape, and every step it names is a step of its lesson", () => {
    expect(e.quiz.length, "about five questions").toBeGreaterThanOrEqual(4);
    expect(e.quiz.length, "about five questions").toBeLessThanOrEqual(7);
    expect(new Set(e.quiz.map((q) => q.id)).size).toBe(e.quiz.length);
    const steps = new Set(e.lesson.map((s) => s.n));
    const lo = e.minOptions?.n ?? 3;
    for (const q of e.quiz) {
      expect(q.q.trim().endsWith("?"), q.id).toBe(true);
      expect(q.options.length, `${q.id}: options`).toBeGreaterThanOrEqual(lo);
      expect(q.options.length, `${q.id}: options`).toBeLessThanOrEqual(5);
      expect(new Set(q.options).size, `${q.id}: repeated option`).toBe(q.options.length);
      expect(Number.isInteger(q.correct), q.id).toBe(true);
      expect(q.correct, q.id).toBeGreaterThanOrEqual(0);
      expect(q.correct, q.id).toBeLessThan(q.options.length);
      expect(q.feedback.trim().length, `${q.id}: feedback`).toBeGreaterThan(40);
      expect(q.steps.length, `${q.id}: names no step`).toBeGreaterThan(0);
      for (const n of q.steps) expect(steps.has(n), `${q.id}: step ${n} is not in the lesson`).toBe(true);
      for (const k of q.origins ?? [])
        expect(t.origins as readonly string[], `${q.id}: origin "${k}" the tool does not declare`)
          .toContain(k);
    }
  });
  it("(c) is drawn by its own tool, with its own lesson", () => {
    const src = read(e.file);
    const calls = [...src.matchAll(/<LessonQuiz\b[^>]*?questions=\{(\w+)\}[^>]*?lesson=\{(\w+)\}/gs)];
    const mine = calls.filter((c) => c[1] === e.quizName);
    expect(mine.length, `${e.file} draws ${e.quizName}`).toBe(1);
    expect(mine[0]?.[2]).toBe(e.lessonName);
  });
  if (e.tool) {
    it("(d) the rendered tool shows every question", () => {
      const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(e.tool!)));
      expect(html).toContain("data-lesson-quiz");
      for (const q of e.quiz) expect(html, q.id).toContain(`data-quiz-question="${q.id}"`);
    });
  }
});

describe("no quiz outside the table", () => {
  it("(c) every <LessonQuiz> in the GUI draws a quiz the table holds", () => {
    const files = ["src/ui/MethodsWorkspace.tsx",
      ...readdirSync(new URL("src/ui/methods/", GUI))
        .filter((f) => f.endsWith(".tsx") && f !== "lessonQuiz.tsx")
        .map((f) => `src/ui/methods/${f}`)];
    const known = new Set(Object.values(QUIZZES).map((e) => e!.quizName));
    let seen = 0;
    for (const f of files) {
      const src = read(f);
      for (const m of src.matchAll(/<LessonQuiz\b[^>]*?questions=\{(\w+)\}/gs)) {
        seen++;
        expect(known.has(m[1] ?? ""), `${f} draws ${m[1]}, which no QUIZZES entry holds`).toBe(true);
      }
      //  A quiz drawn any other way would escape the table.
      expect((src.match(/<LessonQuiz\b/g) ?? []).length, f)
        .toBe([...src.matchAll(/<LessonQuiz\b[^>]*?questions=\{\w+\}/gs)].length);
    }
    expect(seen).toBe(Object.keys(QUIZZES).length);
  });
});
