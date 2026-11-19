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
  THE COMPRESSOR DATASHEET READS THE ENGINE'S SHEET (DEV.md 4c C440 gap 4).

  The fixture is a TRANSCRIPTION of the sheet the engine writes for
  `tutorials/steady/rotating/compressor03_staged_design` (unit compressor1:
  air, 1 -> 12 bar, centrifugal, three sections, two intercoolers), because
  `design/` is a run output and gitignored.  A transcription drifts in silence,
  so the figures asserted below are the ones the case's README works by hand
  (stage 1: r 2.357, T out 412.4 K, head 87.04 kJ/kg, 427.3 kW).
\*---------------------------------------------------------------------------*/
import { describe, expect, it } from "vitest";
import { parseDesignSheet } from "../src/case/designSheet.js";
import { cell, compressorDatasheetHtml, compressorOdsRows, compressorView }
  from "../src/case/compressorDatasheet.js";

const SHEET = `recordType  designSheet;

unit        "compressor1";
tag         C-101;
equipment   compressor;
material    SS316;
basis       "power = W_shaft (unit result; pass-through)";

inlets
{
    port0
    {
        global      "feed";
        bc          fixedValue;
        T           298.15 K;
        P           100000 Pa;
        F           0.12638889 kmol/s;
        mdot        3.6457181 kg/s;
        vapourFraction 1;
    }
}

outlets
{
    port0
    {
        global      "out";
        bc          computed;
        T           694.78217 K;
        P           1200000 Pa;
        F           0.12638889 kmol/s;
        mdot        3.6457181 kg/s;
        vapourFraction 1;
    }
}

sizing
{
    MW                    28.845242 kg/kmol;
    P_out                 1200000 Pa;
    Q_inlet               11279.254 m3/h;
    Q_intercoolers        847.54166 kW;
    T_dischargeLimit      450 K;
    T_dischargeMax        412.44047 K;
    driverMargin          [0 0 0 0 0] 1.1;
    driverRating          1410.1168 kW;
    headPerImpeller       29983.186 J/kg;
    intercooler1_Tin      412.44047 K;
    intercooler1_Tout     298.15 K;
    intercooler1_dP       0.137895 bar;
    intercooler1_duty     423.77083 kW;
    intercooler2_Tin      412.44047 K;
    intercooler2_Tout     298.15 K;
    intercooler2_dP       0.137895 bar;
    intercooler2_duty     423.77083 kW;
    nCasings              [0 0 0 0 0] 3;
    nElements             [0 0 0 0 0] 9;
    nIntercoolers         [0 0 0 0 0] 2;
    nStages               [0 0 0 0 0] 3;
    power                 1504.3186 kW;
    powerGas              1269.2321 kW;
    powerShaft            1281.9244 kW;
    powerUnitSinglePass   1504.3186 kW;
    pressureDesign        17 bar;
    rOverall              [0 0 0 0 0] 12;
    rStage                [0 0 0 0 0] 2.3568044;
    ratio                 [0 0 0 0 0] 12;
    stage1_Pin            1 bar;
    stage1_Pout           2.3568044 bar;
    stage1_Tin            298.15 K;
    stage1_Tout           412.44047 K;
    stage1_Zavg           [0 0 0 0 0] 1;
    stage1_dhCheck        [0 0 0 0 0] -0.0016364262;
    stage1_elements       [0 0 0 0 0] 3;
    stage1_etaPoly        [0 0 0 0 0] 0.75;
    stage1_head           87035.809 J/kg;
    stage1_n              [0 0 0 0 0] 1.6090244;
    stage1_power          427.30813 kW;
    stage1_ratio          [0 0 0 0 0] 2.3568044;
    stage2_Pin            2.2189094 bar;
    stage2_Pout           5.2295353 bar;
    stage2_Tin            298.15 K;
    stage2_Tout           412.44047 K;
    stage2_Zavg           [0 0 0 0 0] 1;
    stage2_dhCheck        [0 0 0 0 0] -0.0016364262;
    stage2_elements       [0 0 0 0 0] 3;
    stage2_etaPoly        [0 0 0 0 0] 0.75;
    stage2_head           87035.809 J/kg;
    stage2_n              [0 0 0 0 0] 1.6090244;
    stage2_power          427.30813 kW;
    stage2_ratio          [0 0 0 0 0] 2.3568044;
    stage3_Pin            5.0916403 bar;
    stage3_Pout           12 bar;
    stage3_Tin            298.15 K;
    stage3_Tout           412.44047 K;
    stage3_Zavg           [0 0 0 0 0] 1;
    stage3_dhCheck        [0 0 0 0 0] -0.0016364262;
    stage3_elements       [0 0 0 0 0] 3;
    stage3_etaPoly        [0 0 0 0 0] 0.75;
    stage3_head           87035.809 J/kg;
    stage3_n              [0 0 0 0 0] 1.6090244;
    stage3_power          427.30813 kW;
    stage3_ratio          [0 0 0 0 0] 2.3568044;
}

//  Inputs this sizer was not given and supplied itself.  Each was announced at
//  its site and appears in the run's ASSUMPTIONS AND CAVEATS block with the
//  value used.  Declare it in the case's \`designRules {}\` to make it yours.
assumed          ( coolerDropFraction coolerDropMin etaPolytropic mechLossFraction driverMargin );

//  What the compressor was designed as.  Numbers per stage are the \`sizing {}\`
//  keys \`stageN_*\` and \`intercoolerN_*\`; the words are here.
compressor
{
    machine         centrifugal;
    machineBy       selected;
    selection       "inlet 6639 cfm (1.128e+04 m3/h), overall ratio 12: inside the chart region 'Multistage / Single-Stage Centrif.' (Brown 2005, Fig 1-2, p.3)";
    driver          electricMotor;
    stages          3;
    intercoolers    2;
    stagesBy        limit;
    limiting        "the fewest sections whose hottest discharge (412.4 K) is within the limit 450 K";
    declared        ( maxDischargeT );
    //  inputs the case did not declare, and the page each was read at
    sources
    (
        {
            key         coolerDropFraction;
            source      "the intercooler pressure drop as a fraction of the absolute pressure at its entrance (Brown 2005, p.200)";
        }
        {
            key         coolerDropMin;
            source      "the floor of the intercooler pressure drop, 2 psi, where 2 % would be unrealistically small (Brown 2005, p.200)";
        }
        {
            key         etaPolytropic;
            source      "the estimated centrifugal stage (polytropic) efficiency a sizing starts from (Brown 2005, p.196); the flow-coefficient chart of Fig 5-27 is not used";
        }
        {
            key         mechLossFraction;
            source      "1 % mechanical loss for a centrifugal estimate (Brown 2005, p.199); Eq 2.78 adds the loss to the power and the book gives no basis for the 1 %, so it is taken as a fraction of the gas power";
        }
        {
            key         driverMargin;
            source      "API recommends the motor at 110 % of the greatest power the compressor needs (Brown 2005, p.307)";
        }
    );
    notes
    (
        "the intercoolers return the gas to the machine's inlet temperature, the basis of Brown 2005 Fig 2-2 and Example 2-4 (p.47-50); declare \`intercoolTemperature\` for the cooling water's own."
        "impellers per section = polytropic head / head per impeller, rounded up (a fraction under 0.2 dropped), Brown 2005 p.196; at most eight per casing (p.197); a section is one casing at least."
        "no motor efficiency is declared, so the electrical input is not computed; Brown 2005 p.301-310 gives none as a number."
        "the flowsheet's unit is ONE adiabatic pass; \`powerUnitSinglePass\` is its \`W_shaft\` and is the size the costing reads, unchanged.  \`powerShaft\` is the staged, intercooled machine; the intercoolers are listed here, not placed as exchanger items of the plant."
        "the unit's own \`eta\` is an ISENTROPIC efficiency for its single pass; the design uses the source's efficiency for the machine and stage (shown per stage as \`stageN_etaPoly\`), so the two powers are not expected to agree."
        "the gas is priced as a vapour at every stage and intercooler outlet (no condensation between stages is tested); Z and the compression exponent come from the case's package."
        "\`stageN_dhCheck\` is the polytropic gas power of Brown Eq 2.78 against the package's own enthalpy rise for the same stage: a closure of the real-gas arithmetic, not a claim about the machine."
        "a design standard motor size is not selected; the driver is the rating the 110 % rule asks for."
    );
}
`;

describe("compressor datasheet", () => {
  const sheet = parseDesignSheet(SHEET);
  const view = compressorView(sheet);

  it("parses the compressor block and the staged numbers", () => {
    expect(sheet?.compressor?.machine).toBe("centrifugal");
    expect(sheet?.compressor?.machineBy).toBe("selected");
    expect(view?.stages.length).toBe(3);
    expect(view?.intercoolers.length).toBe(2);
    expect(view?.stages[0]?.ratio?.value).toBeCloseTo(2.3568044, 6);
    expect(view?.stages[0]?.Tout?.value).toBeCloseTo(412.44047, 4);
    expect(cell(view?.stages[0]?.power)).toBe("427.308 kW");
  });

  it("carries the totals, the driver and every defaulted input with its page", () => {
    const labels = view?.totals.map((t) => t.label) ?? [];
    expect(labels).toContain("Driver rating");
    expect(labels).toContain("Unit's single-pass power (costing size)");
    expect(view?.sources.length).toBe(5);
    for (const s of view?.sources ?? []) expect(s.source).toMatch(/Brown 2005/);
    expect(view?.declared).toEqual(["maxDischargeT"]);
  });

  it("draws the page and the spreadsheet from the same rows", () => {
    const html = compressorDatasheetHtml(view!);
    expect(html).toContain("centrifugal");
    expect(html).toContain("Intercoolers (listed, not plant items)");
    expect(compressorOdsRows(view!).length).toBeGreaterThan(10);
  });

  it("draws nothing for a sheet without a compressor block", () => {
    const power = SHEET.replace(/compressor\n\{[\s\S]*$/, "");
    expect(compressorView(parseDesignSheet(power))).toBeNull();
  });
});
