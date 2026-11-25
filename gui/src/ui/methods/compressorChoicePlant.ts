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
  compressorChoicePlant -- a RECORDED run, not a live one.

  The reference plant (tutorials/plant/greenAmmoniaPEQ_baseCase) takes about
  34 s to solve in the browser, which is longer than a classroom page should
  wait, so the four compressors of the plant are carried here as the numbers
  the engine wrote, and the page labels them so.

  HOW THEY WERE TAKEN (2026-11-25, this tree's native choupoSolve, commit
  e59b529fbf plus the C510 sheet export).  The shipped case declares the four
  compressors without a `design {}` block, so its sheets carry no machine
  chart and no inlet volume.  A SCRATCH COPY of the case, with an empty
  `design { }` added to each of the four `designRules`, was solved; its four
  `design/<unit>/compressor` sheets give the actual inlet flow and the overall
  ratio below (`inletFlow_cfm`, `overallRatio`) and the engine's own selection.
  The shipped case was not edited.  The sheets also give `powerShaft`, the
  staged design's shaft power, listed for reference.

  tests/compressorChoice.test.ts holds these four to the engine's own rule: each
  point's pick, by the page's copy of the rule against the chart the live air
  run publishes, is the machine the engine named when the run was taken.
\*---------------------------------------------------------------------------*/

export interface PlantCompressor {
  /** the unit's name in the case */
  name: string;
  /** actual inlet flow [cfm], from the sheet's `inletFlow_cfm` */
  cfm: number;
  /** overall pressure ratio, from the sheet's `overallRatio` */
  ratio: number;
  /** the machine the engine named when the run was taken */
  machine: string;
  /** the staged design's shaft power, `powerShaft` [kW] */
  powerShaftKW: number;
}

export const PLANT_COMPRESSORS: readonly PlantCompressor[] = [
  { name: "N2Boost", cfm: 2680.4048, ratio: 3.77536, machine: "centrifugal", powerShaftKW: 2374.4509 },
  { name: "MakeupComp1", cfm: 3040.9143, ratio: 2.2237342, machine: "centrifugal", powerShaftKW: 5465.3978 },
  { name: "MakeupComp2", cfm: 1395.4287, ratio: 2.2674662, machine: "centrifugal", powerShaftKW: 5796.8272 },
  { name: "RecycleComp", cfm: 1369.3247, ratio: 1.0770158, machine: "centrifugal", powerShaftKW: 920.39195 },
];

/** The sentence the page prints under the chart. */
export const PLANT_RECORD =
  "the four compressors of greenAmmoniaPEQ_baseCase, from a run of this tree's engine taken on 2026-11-25 "
  + "(a scratch copy with an empty `design { }` added to each, so the engine publishes their duties; the "
  + "shipped case is unchanged). RecycleComp's ratio, 1.08, is below the chart's lowest edge: the engine takes "
  + "the first machine whose flow range holds its flow.";
