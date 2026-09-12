/*---------------------------------------------------------------------------*\
  THE COLUMN DRAWS ITSELF (2026-09-07).

  Task #79 gave the distillation column five specification sheets -- shell,
  trays, condenser, reboiler, refluxDrum.  The condenser and the reboiler are
  `shellTubeHX` items and the exchanger datasheet already draws that kind; the
  column's OWN equipment, the tower and the tray stack, had no drawing at all.

  THE DATASHEET FOLLOWS THE EQUIPMENT KIND, NOT THE UNIT TYPE, and the
  schematic is dispatched on the sheet's own `equipment` word -- the same
  registered-type word the sizers are keyed on.  A kind with no drawing gets a
  LABELLED BOX with its ports and its sizing table, because approximating one
  kind's geometry with another's puts a claim on the page that no number
  supports.

  THE FIXTURES BELOW ARE TRANSCRIPTIONS of sheets the engine really writes for
  `tutorials/steady/distillation/column09_tray_hydraulics`, because `design/`
  is a run output and gitignored (`check_design_sheet` arm (g) enforces that in
  both directions), so no committed file can be read here.  A transcription
  drifts from its original in silence, so `check_design_sheet` arm (l) RUNS the
  witness and holds these fixtures to what it wrote -- the same treatment the
  exchanger and stirred-tank fixtures get in `designSheet.test.ts`.

  WHAT THE WITNESS IS.  A benzene/toluene column, 15 stages, feed on stage 8,
  the hydraulics in DESIGN mode (the case declares no `diameter`, so the pass
  designs one).  The rectifying trays need 1.22206 m and the stripping trays
  0.96948111 m -- 20.67 % apart -- so the tower is built STRAIGHT at
  1.22206 m, the WIDER of the two, and Choupo prices no transition cone.  The
  worst tray is stage 7, at 80.0 % of flood.

  THE TOWER INVERTED ON 2026-09-12, AND WHICH HALF IS THE WIDE ONE IS THE
  LESSON.  Everything in the paragraph above used to read the other way round:
  rectifying 1.2095 m against stripping 1.3158 m, the STRIPPING section wider,
  8.08 % apart.  Nothing in this file or in the drawing changed.  What changed
  is that `d6a984701` stopped the column reading its feed's thermal state from
  the wrong home: `operation.feedQuality` defaulted to 1.0, saturated liquid,
  while the feed stream itself declares `vaporFraction 0.6972418857`.  The
  sheets below carry that number on every port block -- the feed arrives 69.7 %
  VAPOUR.

  A vapour feed enters ABOVE the feed tray and leaves the stripping section
  alone; a liquid feed runs down through it and every stripping tray has to
  carry it.  So correcting the phase moved the traffic upward, and the
  geometry followed: the rectifying diameter barely moved (1.2095 -> 1.22206 m,
  up 1.0 %) while the stripping diameter fell by a quarter (1.3158 ->
  0.96948111 m, down 26.3 %).  The reboiler duty is the same fact in energy:
  1279.3 -> 647.1 kW, very nearly halved, because the feed no longer has to be
  boiled.  A student who takes one thing from this file should take that: THE
  PHASE OF THE FEED DECIDES WHICH HALF OF A COLUMN IS THE WIDE ONE.

  AND THE GAP CROSSED ITS OWN RULE OF THUMB.  Whether to swage is ECONOMIC and
  Choupo does not decide it: below roughly 15-20 % difference the transition
  cone costs more than the plate a narrower section saves, and the old 8.08 %
  was comfortably below that.  Today's 20.67 % is ABOVE it -- the first
  geometry in this corpus where a real designer would actually price a swaged
  tower -- and Choupo STILL builds straight and prices no cone, because it has
  no correlation for one (`ColumnSize` says so at the site, and
  `equipmentSchematic.ts:180-196` says why the drawing never shows one).  What
  was an academic limitation on this witness is now a visible one.  That is a
  finding about the corpus, not a defect in the drawing.
\*---------------------------------------------------------------------------*/
import { describe, expect, it } from "vitest";
import { parseDesignSheet, unitDesignSheets } from "../src/case/designSheet.js";
import {
  columnTowerSvg, fallbackBoxSvg, hasSchematic, noSchematicReason,
} from "../src/case/equipmentSchematic.js";
import { columnDatasheetHtml, columnDatasheetOdsRows }
  from "../src/ui/ColumnDatasheet.js";
import type { UnitSpec } from "../src/case/types.js";

const SHELL = `/*--------------------------------*- Choupo -*--------------------------------*\\
  EQUIPMENT SPECIFICATION SHEET -- WRITTEN BY THE RUN.

  This file is REGENERATED WHOLE on every run: the \`design/\`
  tree is removed and rebuilt, exactly as \`converged/\` is.  Do
  not edit it -- an edit is destroyed by the next run without a
  word.  The inputs that produced it are \`system/postDict\`'s
  \`sizing {}\` block and the case's converged state.

  It is a Choupo dictionary: every value carries the unit it is
  in, named as the dict grammar names it.  The units are the
  ones the SIZER declared where it computed the value; they are
  not all canonical SI, which is why each one is written down.
\\*---------------------------------------------------------------------------*/

recordType  designSheet;

unit        "column09";
equipment   vessel;
item        shell;
material    carbonSteel;
basis       "straight tower at the wider section; D from the tray hydraulics, H = (nTrays-1)*traySpacing + disengagement + sump; t_wall ASME thin-wall";

//  THE PORTS BELOW ARE THE UNIT'S, NOT THIS ITEM'S.  \`column09\` realises several
//  physical items and the flowsheet wires only the unit; the streams between the
//  items are internal to it and this engine does not model them.
inlets
{
    port0
    {
        global      "feed";
        bc          fixedValue;
        T           370 K;
        P           101325 Pa;
        F           0.027777778 kmol/s;
        mdot        2.3646528 kg/s;
        vapourFraction 0.69724189;
    }
}

outlets
{
    port0
    {
        global      "distillate";
        bc          computed;
        T           354.2479 K;
        P           101325 Pa;
        F           0.013888889 kmol/s;
        mdot        1.0944595 kg/s;
        vapourFraction 0;
    }
    port1
    {
        global      "bottoms";
        bc          computed;
        T           381.5141 K;
        P           101325 Pa;
        F           0.013888889 kmol/s;
        mdot        1.2701933 kg/s;
        vapourFraction 0;
    }
}

sizing
{
    D                     1.22206 m;
    D_rectifying          1.22206 m;
    D_stripping           0.96948111 m;
    H                     9.2 m;
    V_R                   10.791027 m3;
    nTrays                [0 0 0 0 0] 14;
    pressureDesign        2 bar;
    swageGap              [0 0 0 0 0] 0.2066829;
    t_wall                0.0038736489 m;
    traySpacing           0.5 m;
    weight                1074.0392 kg;
}

//  Inputs this sizer was not given and supplied itself.  Each was announced at
//  its site and appears in the run's ASSUMPTIONS AND CAVEATS block with the
//  value used.  Declare it in the case's \`designRules {}\` to make it yours.
assumed          ( disengagementHeight sumpHeight );

cost
{
    currency        EUR;
    sizeKey         V_R;
    correlation     log-quadratic;
    purchased       22602.637;
    bareModule      91992.734;
    totalModule     108551.43;
    factors
    {
        B1                  2.25;
        B2                  1.82;
        C_TM_over_C_BM      1.18;
        Cp_2001             11894.548;
        F_M                 1;
        F_P                 1;
        K1                  3.4974;
        K2                  0.4485;
        K3                  0.1074;
        S                   10.791027;
        cepci               820;
        cepci2001           397;
        usdToEur            0.92;
        year                2026;
    }
}`;

const TRAYS = `/*--------------------------------*- Choupo -*--------------------------------*\\
  EQUIPMENT SPECIFICATION SHEET -- WRITTEN BY THE RUN.

  This file is REGENERATED WHOLE on every run: the \`design/\`
  tree is removed and rebuilt, exactly as \`converged/\` is.  Do
  not edit it -- an edit is destroyed by the next run without a
  word.  The inputs that produced it are \`system/postDict\`'s
  \`sizing {}\` block and the case's converged state.

  It is a Choupo dictionary: every value carries the unit it is
  in, named as the dict grammar names it.  The units are the
  ones the SIZER declared where it computed the value; they are
  not all canonical SI, which is why each one is written down.
\\*---------------------------------------------------------------------------*/

recordType  designSheet;

unit        "column09";
equipment   sieveTrays;
item        trays;
material    carbonSteel;
basis       "nTrays as the hydraulics pass rated them (a stage carrying vapour traffic is a tray); tray area = pi D^2 / 4 at the tower diameter";

//  THE PORTS BELOW ARE THE UNIT'S, NOT THIS ITEM'S.  \`column09\` realises several
//  physical items and the flowsheet wires only the unit; the streams between the
//  items are internal to it and this engine does not model them.
inlets
{
    port0
    {
        global      "feed";
        bc          fixedValue;
        T           370 K;
        P           101325 Pa;
        F           0.027777778 kmol/s;
        mdot        2.3646528 kg/s;
        vapourFraction 0.69724189;
    }
}

outlets
{
    port0
    {
        global      "distillate";
        bc          computed;
        T           354.2479 K;
        P           101325 Pa;
        F           0.013888889 kmol/s;
        mdot        1.0944595 kg/s;
        vapourFraction 0;
    }
    port1
    {
        global      "bottoms";
        bc          computed;
        T           381.5141 K;
        P           101325 Pa;
        F           0.013888889 kmol/s;
        mdot        1.2701933 kg/s;
        vapourFraction 0;
    }
}

sizing
{
    A                     1.1729377 m2;
    D                     1.22206 m;
    nTrays                [0 0 0 0 0] 14;
    traySpacing           0.5 m;
}`;

const DRUM = `/*--------------------------------*- Choupo -*--------------------------------*\\
  EQUIPMENT SPECIFICATION SHEET -- WRITTEN BY THE RUN.

  This file is REGENERATED WHOLE on every run: the \`design/\`
  tree is removed and rebuilt, exactly as \`converged/\` is.  Do
  not edit it -- an edit is destroyed by the next run without a
  word.  The inputs that produced it are \`system/postDict\`'s
  \`sizing {}\` block and the case's converged state.

  It is a Choupo dictionary: every value carries the unit it is
  in, named as the dict grammar names it.  The units are the
  ones the SIZER declared where it computed the value; they are
  not all canonical SI, which is why each one is written down.
\\*---------------------------------------------------------------------------*/

recordType  designSheet;

unit        "column09";
equipment   vessel;
item        refluxDrum;
material    carbonSteel;
basis       "V = Q_condensate * residenceTime; Q_condensate is the overhead vapour condensed, priced at the LIQUID density of the top-tray temperature; D and H from L_over_D; t_wall ASME thin-wall";

//  THE PORTS BELOW ARE THE UNIT'S, NOT THIS ITEM'S.  \`column09\` realises several
//  physical items and the flowsheet wires only the unit; the streams between the
//  items are internal to it and this engine does not model them.
inlets
{
    port0
    {
        global      "feed";
        bc          fixedValue;
        T           370 K;
        P           101325 Pa;
        F           0.027777778 kmol/s;
        mdot        2.3646528 kg/s;
        vapourFraction 0.69724189;
    }
}

outlets
{
    port0
    {
        global      "distillate";
        bc          computed;
        T           354.2479 K;
        P           101325 Pa;
        F           0.013888889 kmol/s;
        mdot        1.0944595 kg/s;
        vapourFraction 0;
    }
    port1
    {
        global      "bottoms";
        bc          computed;
        T           381.5141 K;
        P           101325 Pa;
        F           0.013888889 kmol/s;
        mdot        1.2701933 kg/s;
        vapourFraction 0;
    }
}

sizing
{
    D                     0.8011089 m;
    H                     2.4033267 m;
    L_over_D              [0 0 0 0 0] 3;
    Q_condensate          0.0040379837 m3/s;
    V_R                   1.2113951 m3;
    pressureDesign        2 bar;
    residenceTime         300 s;
    t_wall                0.0035727115 m;
    weight                169.6375 kg;
}

cost
{
    currency        EUR;
    sizeKey         V_R;
    correlation     log-quadratic;
    purchased       6520.9346;
    bareModule      26540.204;
    totalModule     31317.44;
    factors
    {
        B1                  2.25;
        B2                  1.82;
        C_TM_over_C_BM      1.18;
        Cp_2001             3431.6159;
        F_M                 1;
        F_P                 1;
        K1                  3.4974;
        K2                  0.4485;
        K3                  0.1074;
        S                   1.2113951;
        cepci               820;
        cepci2001           397;
        usdToEur            0.92;
        year                2026;
    }
}`;

/*  The two exchanger siblings, trimmed to what this page reads: the reader
 *  needs `item` to tell a condenser from a reboiler, and the tower drawing
 *  needs only to know that each exists.  Their full sheets are held to the
 *  engine by the exchanger fixtures in `designSheet.test.ts`. */
const HX = (item: string, Q: number, A: number) => `
recordType  designSheet;

unit        "column09";
equipment   shellTubeHX;
item        ${item};
material    carbonSteel;
basis       "A = Q/(U*LMTD) with U and LMTD author-set";

inlets  { port0 { global "feed"; bc fixedValue; T 370 K; mdot 2.3646528 kg/s; } }
outlets { port0 { global "distillate"; bc computed; T 354.2479 K; mdot 1.0944595 kg/s; } }

sizing
{
    A                     ${A} m2;
    Q_kW                  ${Q} kW;
}
`;

const FILES: { [rel: string]: string } = {
  "design/column09/shell": SHELL,
  "design/column09/trays": TRAYS,
  "design/column09/refluxDrum": DRUM,
  //  Kept current with the run even though no gate holds them: a stand-in
  //  that carries last month's duties still tells a reader a number, and the
  //  reboiler's is the most legible consequence of the 2026-09-12 feed fix.
  "design/column09/condenser": HX("condenser", -1282.9154, 53.454809),
  "design/column09/reboiler": HX("reboiler", 647.13807, 47.583682),
};

/*  The KPIs the witness publishes, as its `expected` golden records them.
 *  `feedStage` and `nStages` are ECHOES of the case's own `operation {}` and
 *  are labelled as the author's wherever they appear; `diameterDesigned` is the
 *  engine's own answer to who chose the diameter. */
const KPIS: { [k: string]: number } = {
  nStages: 15, feedStage: 8, nTrays: 14,
  diameter: 1.22206001598, diameter_rectifying: 1.22206001598,
  diameter_stripping: 0.969481110388, diameterDesigned: 1,
  floodApproach_max: 0.8, floodStage: 7,
  downcomerBackup_max_mm: 199.917404254, downcomerFloodStages: 0,
  weepingStages: 0, dP_column_kPa: 12.5887948054,
  Q_condenser_kW: -1282.91541137, Q_reboiler_kW: 647.138073182,
};

/*  The unit as the case declares it -- DESIGN mode: no `diameter` in the
 *  hydraulics block, which is what makes the tower diameter Choupo's. */
const UNIT: UnitSpec = {
  name: "column09",
  type: "distillationColumn",
  in: "feed",
  outputs: ["distillate", "bottoms"],
  operation: {
    nStages: 15, feedStage: 8, refluxRatio: 2.0,
    hydraulics: {
      trayType: "sieve", traySpacing: 0.5, weirHeight: 0.05,
      holeDiameter: 0.005, holeAreaFraction: 0.10,
      downcomerAreaFraction: 0.12, weirLengthFraction: 0.77,
      orificeCoefficient: 0.84, floodFraction: 0.80, K2: 30.7,
    },
  },
};

/*  The SAME column with the diameter DECLARED, which is `column10_flooding`'s
 *  shape: the hydraulics pass then RATES the trays against a tower the author
 *  chose and `diameterDesigned` is 0.  Held here rather than against
 *  `column10` itself because that case ships no `system/postDict` and so has
 *  no specification sheet to read -- stated plainly so the next reader knows
 *  this arm is a construction and not a corpus witness. */
const RATED_UNIT: UnitSpec = {
  ...UNIT,
  operation: {
    ...UNIT.operation,
    hydraulics: { ...(UNIT.operation["hydraulics"] as object), diameter: 1.10 },
  },
};
const RATED_KPIS = { ...KPIS, diameterDesigned: 0 };

const drawing = () => {
  const shell = parseDesignSheet(SHELL)!;
  const trays = parseDesignSheet(TRAYS)!;
  return columnTowerSvg({
    shell, trays,
    hasCondenser: true, hasReboiler: true, hasRefluxDrum: true,
    kpis: KPIS,
  });
};

describe("the sheet reader carries the ports the sheet has always written", () => {
  it("reads the shell's inlets and outlets, with their temperatures", () => {
    const s = parseDesignSheet(SHELL)!;
    expect(s.inlets.map((p) => p.global)).toEqual(["feed"]);
    expect(s.outlets.map((p) => p.global)).toEqual(["distillate", "bottoms"]);
    expect(s.inlets[0]!.T).toBeCloseTo(370, 6);
    expect(s.outlets[0]!.T).toBeCloseTo(354.2479, 4);
    expect(s.outlets[1]!.T).toBeCloseTo(381.5141, 4);
    //  The mass flow is the engine's own total, not F * Sigma z_i MW_i.
    expect(s.inlets[0]!.mdot).toBeCloseTo(2.3646528, 6);
  });

  it("leaves a key the sheet does not carry UNDEFINED, never zero", () => {
    const s = parseDesignSheet(`
recordType designSheet;
unit "u"; equipment vessel; item shell; material carbonSteel; basis "b";
inlets { port0 { global "x"; bc computed; } }
sizing { D 1 m; }
`)!;
    expect(s.inlets[0]!.T).toBeUndefined();
    expect(s.inlets[0]!.mdot).toBeUndefined();
  });

  it("finds every item of the unit, and only that unit's", () => {
    const { sheets } = unitDesignSheets(FILES, "column09");
    expect(sheets.map((s) => s.item).sort())
      .toEqual(["condenser", "reboiler", "refluxDrum", "shell", "trays"]);
    expect(unitDesignSheets(FILES, "somethingElse").sheets).toHaveLength(0);
  });
});

describe("the schematic is dispatched on the equipment word", () => {
  it("draws a tower for sieveTrays and nothing else", () => {
    expect(hasSchematic("sieveTrays")).toBe(true);
    //  `vessel` is the shell's OWN word and the reflux drum's and a flash
    //  drum's.  Keying the tower on it would put fourteen trays inside every
    //  drum in the corpus.
    expect(hasSchematic("vessel")).toBe(false);
    expect(hasSchematic("shellTubeHX")).toBe(false);
    expect(hasSchematic("crystalliser")).toBe(false);
  });

  it("says WHY a kind has no drawing, in that kind's own terms", () => {
    expect(noSchematicReason("shellTubeHX")).toMatch(/RATING geometry/);
    expect(noSchematicReason("vessel")).toMatch(/labelled box beats a wrong picture/i);
    expect(noSchematicReason("vessel")).toMatch(/'vessel'/);
  });

  it("the fallback box carries the ports and NO dimension", () => {
    const drum = parseDesignSheet(DRUM)!;
    const svg = fallbackBoxSvg(drum);
    expect(svg).toContain("vessel");
    expect(svg).toContain("column09 · refluxDrum");
    expect(svg).toContain("feed");
    expect(svg).toContain("distillate");
    //  Not one sizing number reaches the box: 0.799 m, 2.397 m and 1.202 m3
    //  are on its table, and a box a reader could measure would be a claim.
    expect(svg).not.toContain("0.799");
    expect(svg).not.toContain("2.397");
    expect(svg).not.toContain("1.202");
    //  AND NO PROSE.  The reason a kind has no drawing is a sentence, an SVG
    //  has no reflow, and the first version cut it at both ends inside the
    //  viewBox.  It is printed beside the picture instead.
    expect(svg).not.toMatch(/labelled box beats/);
  });
});

describe("the tower is drawn from the sheets and nothing else", () => {
  it("draws all fourteen trays, to scale, at the declared spacing", () => {
    const d = drawing();
    expect(d.nTrays).toBe(14);
    expect(d.traysDrawn).toBe(14);
    //  H 9.2 m over D 1.22206 m is 7.53 -- inside the 1.5-12 band where a
    //  true-scale tower is still legible (equipmentSchematic.ts:217), so the
    //  drawing IS to scale and says so.  The narrower tower is a taller-looking
    //  one: this ratio was 6.99 before the feed fix.
    expect(d.toScale).toBe(true);
  });

  it("labels both section diameters and the swage gap, and draws no cone", () => {
    const d = drawing();
    const notes = d.notes.map((n) => n.text).join(" | ");
    //  RECTIFYING is now the WIDER section -- see the header.  The labels are
    //  `fmt` at 4 significant figures (equipmentSchematic.ts:86), so 1.22206
    //  renders 1.222 and 0.96948111 renders 0.9695.
    expect(notes).toContain("the rectifying trays need ⌀1.222 m");
    expect(notes).toContain("the stripping trays need ⌀0.9695 m");
    //  The gap is the ENGINE's: `swageGap = (big - sml) / big` at
    //  ColumnSize.cpp:228, published on the sheet, and the caption only
    //  multiplies it by 100 (equipmentSchematic.ts:470).  0.2066829 -> 20.67.
    expect(notes).toMatch(/20\.67 % apart/);
    expect(notes).toMatch(/sizes the shell STRAIGHT/);
    //  20.67 % is ABOVE the 15-20 % rule of thumb, where a real designer would
    //  price a swaged tower -- and the tower is STILL not swaged, because
    //  Choupo prices no transition cone in ANY case.  That is why no drawing
    //  here ever shows one, and why this assertion did not have to change when
    //  the gap crossed the band: the dashed outline is what a section would
    //  need, and the note says so in as many words.
    expect(notes).toMatch(/not a wall anybody would build/);
    expect(d.svg).not.toMatch(/swage transition|transition cone drawn/);
    //  Both section diameters are on the DRAWING too: the narrower one beside
    //  the dashed outline, the built one on the diameter line.
    expect(d.svg).toContain("⌀0.9695 m");
    expect(d.svg).toContain("D 1.222 m");
  });

  it("marks the feed tray, and marks it as the AUTHOR's stage", () => {
    const svg = drawing().svg;
    expect(svg).toContain("stage 8 (declared)");
    expect(svg).toContain("rectifying");
    expect(svg).toContain("stripping");
  });

  it("names the flood approach and WHICH tray reaches it", () => {
    const d = drawing();
    expect(d.notes.map((n) => n.text).join(" | "))
      .toContain("the worst tray runs at 80.0 % of flood, and it is stage 7");
    //  And it is MARKED AT THE TRAY, not only reported as a number a reader
    //  would have to count tray lines to locate.
    expect(d.svg).toContain("worst tray 80.0 % of flood (Choupo)");
  });

  /*  SYNTHETIC, and said so: no corpus case ships a one-tray column or a
   *  100:1 tower, so these two are CONSTRUCTIONS over the witness's own sheet
   *  shape.  They pin the two branches that decide whether the picture is
   *  drawn to scale and whether the trays are drawn one by one -- both of
   *  which the caption then states, so a branch nobody exercises is a caption
   *  that could go quietly false. */
  const shellWith = (D: number, H: number, n: number) => parseDesignSheet(`
recordType  designSheet;
unit        "column09";
equipment   vessel;
item        shell;
material    carbonSteel;
basis       "b";
inlets  { port0 { global "feed"; bc fixedValue; T 370 K; } }
outlets { port0 { global "distillate"; bc computed; T 353.6 K; }
          port1 { global "bottoms";    bc computed; T 382.9 K; } }
sizing
{
    D            ${D} m;
    H            ${H} m;
    nTrays       [0 0 0 0 0] ${n};
    traySpacing  0.5 m;
}
`)!;

  it("a ONE-tray column draws its one tray, not a band saying '1 trays'", () => {
    const d = columnTowerSvg({ shell: shellWith(1.3, 3.0, 1), trays: null,
      hasCondenser: false, hasReboiler: false, hasRefluxDrum: false,
      kpis: { feedStage: 1, diameterDesigned: 1 } });
    expect(d.nTrays).toBe(1);
    expect(d.traysDrawn).toBe(1);
    expect(d.svg).not.toContain("1 trays");
  });

  it("a tower too slender to letter is drawn NOT to scale, and says so", () => {
    //  H/D = 40.  A true-scale shell would be under a pixel wide.
    const d = columnTowerSvg({ shell: shellWith(0.5, 20, 30), trays: null,
      hasCondenser: false, hasReboiler: false, hasRefluxDrum: false,
      kpis: { feedStage: 10, diameterDesigned: 1 } });
    expect(d.toScale).toBe(false);
    //  And the PAGE says it, in the caption a reader acts on.  Both sheets
    //  are needed: without the tray sheet there is no tower to draw at all,
    //  and the page would report that instead -- which is a different fact.
    const html = columnDatasheetHtml(UNIT, KPIS, {
      "design/column09/shell": SHELL.replace(/H  +9\.2 m;/, "H  200 m;"),
      "design/column09/trays": TRAYS,
    });
    expect(html).toContain("NOT to scale");
    expect(columnDatasheetHtml(UNIT, KPIS, FILES)).toContain("TO SCALE");
  });

  it("draws the auxiliaries the run sized, and no others", () => {
    const shell = parseDesignSheet(SHELL)!, trays = parseDesignSheet(TRAYS)!;
    const all = columnTowerSvg({ shell, trays, hasCondenser: true,
      hasReboiler: true, hasRefluxDrum: true, kpis: KPIS }).svg;
    expect(all).toContain("condenser");
    expect(all).toContain("reboiler");
    expect(all).toContain("reflux drum");

    const bare = columnTowerSvg({ shell, trays, hasCondenser: false,
      hasReboiler: false, hasRefluxDrum: false, kpis: KPIS }).svg;
    expect(bare).not.toContain("condenser");
    expect(bare).not.toContain("reflux drum");
    //  The products still leave: with no condenser they leave the tower's own
    //  nozzle instead of the drum's.
    expect(bare).toContain("distillate");
    expect(bare).toContain("bottoms");
  });
});

describe("a number the case declared does not look like a number Choupo computed", () => {
  it("DESIGN mode: the diameter is marked as Choupo's, on the drawing", () => {
    expect(drawing().svg).toContain("D 1.222 m (Choupo)");
  });

  it("RATING mode: the SAME label flips to the author's", () => {
    const shell = parseDesignSheet(SHELL)!, trays = parseDesignSheet(TRAYS)!;
    const svg = columnTowerSvg({ shell, trays, hasCondenser: true,
      hasReboiler: true, hasRefluxDrum: true, kpis: RATED_KPIS }).svg;
    expect(svg).toContain("D 1.222 m (declared)");
    expect(svg).not.toContain("D 1.222 m (Choupo)");
  });

  it("refuses to claim either when the run did not publish diameterDesigned", () => {
    const shell = parseDesignSheet(SHELL)!, trays = parseDesignSheet(TRAYS)!;
    const { diameterDesigned, ...rest } = KPIS;
    void diameterDesigned;
    const svg = columnTowerSvg({ shell, trays, hasCondenser: true,
      hasReboiler: true, hasRefluxDrum: true, kpis: rest }).svg;
    expect(svg).toContain("D 1.222 m (provenance not published)");
    //  The DIAMETER loses its provenance mark; the height and the section
    //  diameters keep theirs, because the run did publish who computed those.
    expect(svg).not.toContain("D 1.222 m (Choupo)");
    expect(svg).not.toContain("D 1.222 m (declared)");
  });

  it("the tray spacing is the AUTHOR's and the tray COUNT is Choupo's", () => {
    const notes = drawing().notes;
    const who = (t: string) => notes.find((n) => n.text.includes(t))?.who;
    expect(who("14 trays rated")).toBe("choupo");
    expect(who("tray spacing 0.5 m")).toBe("declared");
    expect(who("15 equilibrium stages")).toBe("declared");
    expect(who("feed on stage 8")).toBe("declared");
    expect(who("the stripping trays need")).toBe("choupo");
    //  EVERY note either states a provenance or is prose about the drawing.
    //  A dimension with no provenance is the state this page exists to end.
    expect(notes.filter((n) => n.who === null).map((n) => n.text))
      .toEqual([expect.stringContaining("20.67 % apart")]);
  });
});

describe("the printable page", () => {
  it("carries the three provenance classes and no fourth", () => {
    const html = columnDatasheetHtml(UNIT, KPIS, FILES);
    expect(html).toContain("SIZED BY CHOUPO  ·  design/…/shell");
    expect(html).toContain("SIZED BY CHOUPO  ·  design/…/trays");
    expect(html).toContain("RATING RESULT  ·  the tray-hydraulics pass");
    expect(html).toContain("DECLARED BY THE CASE  ·  operation {}");
  });

  it("states in WORDS who chose the diameter, both ways", () => {
    expect(columnDatasheetHtml(UNIT, KPIS, FILES))
      .toMatch(/Diameter chosen by[\s\S]{0,200}the pass DESIGNED it/);
    expect(columnDatasheetHtml(RATED_UNIT, RATED_KPIS, FILES))
      .toMatch(/Diameter chosen by[\s\S]{0,200}the pass RATED the trays/);
  });

  it("shows the sizer's assumptions as assumptions", () => {
    const html = columnDatasheetHtml(UNIT, KPIS, FILES);
    expect(html).toContain("disengagementHeight, sumpHeight");
    expect(html).toContain("Assumed by the sizer");
  });

  it("gives the other three items a labelled box and their own table", () => {
    const html = columnDatasheetHtml(UNIT, KPIS, FILES);
    expect(html).toContain("The other items of this unit");
    expect(html).toContain("SIZED BY CHOUPO  ·  design/…/refluxDrum");
    expect(html).toContain("SIZED BY CHOUPO  ·  design/…/condenser");
    expect(html).toContain("SIZED BY CHOUPO  ·  design/…/reboiler");
    expect(html).toMatch(/No schematic is registered for equipment kind 'vessel'/);
    expect(html).toMatch(/RATING geometry/);
  });

  it("says it is NOT a mechanical data sheet, and draws no nozzle size", () => {
    const html = columnDatasheetHtml(UNIT, KPIS, FILES);
    expect(html).toContain("THIS IS NOT A MECHANICAL VESSEL DATA SHEET");
    expect(html).toMatch(/manholes or handholes/);
    expect(html).toMatch(/stub with a service label/);
  });

  it("says the sizing pass did not run rather than drawing anything", () => {
    //  A NEGATIVE NEEDS A POSITIVE CONTROL, or it goes vacuous the day its
    //  subject changes value and nothing says so.  This arm used to forbid
    //  "1.316", the tower's built diameter until 2026-09-12; the feed fix made
    //  that string absent from every rendering of this page, so the assertion
    //  would have gone on passing while checking nothing at all.  It now names
    //  today's diameter AND proves the page really does print it when the
    //  sheets are there.
    const drawn = columnDatasheetHtml(UNIT, KPIS, FILES);
    expect(drawn, "the control: with the sheets present the page DOES print "
      + "the diameter, so the absence below is a real absence")
      .toContain("1.222");

    const html = columnDatasheetHtml(UNIT, KPIS, {});
    expect(html).toContain("The sizing pass did not run for this column");
    expect(html).not.toContain("SIZED BY CHOUPO  ·  design/…/shell");
    //  Nothing is computed in its place -- the 2026-09-05 rule.
    expect(html).not.toContain("1.222");
  });

  it("distinguishes an UNREADABLE sheet from an absent one", () => {
    const html = columnDatasheetHtml(UNIT, KPIS,
      { "design/column09/shell": "recordType designSheet;\nunit \"column09\"; {{{" });
    expect(html).toContain("could not parse");
    expect(html).not.toContain("The sizing pass did not run");
  });
});

describe("the .ods export keeps the partition the page draws", () => {
  it("labels every row with where the number came from", () => {
    const { sheets } = unitDesignSheets(FILES, "column09");
    const rows = columnDatasheetOdsRows(UNIT, KPIS, sheets);
    const src = (name: string) => rows.find((r) => r[0] === name)?.[3];
    expect(src("shell.D")).toBe("sized by Choupo (design/)");
    expect(src("floodApproach_max")).toBe("rating result (run KPI)");
    expect(src("feedStage")).toBe("declared by the case (operation)");
    expect(src("traySpacing")).toBe("declared by the case (operation)");
    //  Every row says something: a blank provenance column is the one surface
    //  where a design output and a declared input look alike again.
    expect(rows.every((r) => typeof r[3] === "string" && r[3] !== "")).toBe(true);
  });
});
