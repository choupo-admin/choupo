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
  THE CORPUS ARM IS THE POINT OF THIS FILE.

  The unit tests below pin the four states on hand-built fixtures, which is
  worth having.  But the defect this module exists to end lived for months
  precisely because no test ever asked the reader about a REAL case: every
  shipped dict is schemaVersion 2, the reader looked for v1 keys, and a
  fixture written by the same hand that wrote the reader would have agreed
  with it.

  So the load-bearing test sweeps every tutorial in the index and requires:

      NO CASE MAY READ AS UNDECLARED WHILE ITS OWN DICT DECLARES A MODEL.

  That arm fails on the code as it stood, and it is what makes the legacy
  impossible to reintroduce.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { caseThermo, thermoSentence } from "../src/case/caseThermo.js";
import { TUTORIALS } from "../src/cases/tutorials.js";

describe("caseThermo: four states, none of them a guess", () => {
  it("reads the v2 gammaPhi world -- a declared model is DECLARED", () => {
    const t = caseThermo({
      schemaVersion: 2,
      components: ["benzene", "toluene"],
      equilibrium: {
        formulation: "gammaPhi",
        liquid: { activityModel: { model: "NRTL" } },
        vapour: { fugacityModel: "idealGas" },
      },
    });
    expect(t.schemaVersion).toBe(2);
    expect(t.formulation).toBe("gammaPhi");
    expect(t.liquid.state).toBe("declared");
    expect(t.liquid.model).toBe("NRTL");
    expect(t.liquid.where).toBe("equilibrium.liquid.activityModel");
    expect(t.vapour.state).toBe("declared");
    expect(t.vapour.model).toBe("idealGas");
  });

  it("A DECLARED `ideal` IS DECLARED -- the case chose it, and that is the "
    + "whole defect", () => {
    //  268 corpus cases say `activityModel { model ideal; }` in so many
    //  words.  The old reader printed the same word with the opposite claim
    //  attached: that the author declared nothing.  A reader cannot then
    //  tell a deliberate ideal assumption from a forgotten one.
    const t = caseThermo({
      schemaVersion: 2,
      equilibrium: {
        formulation: "gammaPhi",
        liquid: { activityModel: { model: "ideal" } },
        vapour: { fugacityModel: "idealGas" },
      },
    });
    expect(t.liquid.state).toBe("declared");
    expect(t.liquid.model).toBe("ideal");
  });

  it("reads the dilute-solution world off the SOLUTES group", () => {
    //  ammonia02's own grammar: the solvent takes the Raoult rung and the
    //  solutes the infinite-dilution rung, so the liquid's model word is
    //  `solutionModel`, not `activityModel`.
    const t = caseThermo({
      schemaVersion: 2,
      equilibrium: {
        formulation: "diluteSolution",
        liquid: {
          solvent: { component: "NH3", standardState: "pureLiquid" },
          solutes: {
            components: ["N2", "H2"],
            standardState: "infiniteDilution",
            solutionModel: "henryDilute",
          },
        },
        vapour: { fugacityModel: "SRK" },
      },
    });
    expect(t.liquid.state).toBe("declared");
    expect(t.liquid.model).toBe("henryDilute");
    //  And the 200 bar plant is NOT described as ideal gas.
    expect(t.vapour.model).toBe("SRK");
  });

  it("reads a two-liquid case as one entry per phase", () => {
    const t = caseThermo({
      schemaVersion: 2,
      equilibrium: {
        formulation: "gammaGamma",
        liquidPhases: [
          { name: "aqueous", activityModel: { model: "NRTL" } },
          { name: "organicPhase", activityModel: { model: "NRTL" } },
        ],
      },
    });
    expect(t.liquid.state).toBe("declared");
    expect(t.liquid.perPhase).toEqual(["aqueous: NRTL", "organicPhase: NRTL"]);
    //  No vapour block at all -- a fact about the case, not a gap.
    expect(t.vapour.state).toBe("noPhase");
  });

  it("accepts the bare-word form as well as the block form", () => {
    const t = caseThermo({
      schemaVersion: 2,
      equilibrium: { liquid: { activityModel: "davies" } },
    });
    expect(t.liquid.model).toBe("davies");
  });

  it("a phase block with no model word is noModel, and names the "
    + "formulation that settles it", () => {
    const t = caseThermo({
      schemaVersion: 2,
      equilibrium: { formulation: "gammaPhi", liquid: { solvent: { component: "water" } } },
    });
    expect(t.liquid.state).toBe("noModel");
    expect(t.liquid.model).toBeNull();
    expect(thermoSentence(t.liquid, "liquid", t.formulation))
      .toContain("gammaPhi");
  });

  it("REFUSES a file with no equilibrium block instead of reporting an "
    + "absence", () => {
    const t = caseThermo({ schemaVersion: 2, components: ["water"] });
    expect(t.unreadableReason).toBeTruthy();
    expect(t.unreadableReason).toContain("no equilibrium block");
    expect(t.liquid.state).toBe("unreadable");
    //  The sentence a surface draws must not be the word "ideal".
    expect(thermoSentence(t.liquid, "liquid", null)).not.toMatch(/ideal/i);
  });

  it("KEEPS NO v1 FALLBACK: the retired flat keys are not consulted", () => {
    //  A fallback to dead grammar is the legacy again under another name.
    //  A file in the retired form reads as unreadable and says so.
    const t = caseThermo({
      activityModel: { model: "NRTL" },
      equationOfState: { model: "SRK" },
    });
    expect(t.liquid.state).toBe("unreadable");
    expect(t.unreadableReason).toBeTruthy();
  });

  it("no thermoPhysPropDict at all is unreadable, not 'ideal'", () => {
    const t = caseThermo(undefined);
    expect(t.unreadableReason).toContain("no thermoPhysPropDict");
    expect(t.vapour.state).toBe("unreadable");
  });
});

/*  ---- THE CORPUS ARM ------------------------------------------------------
 *  Swept over the tutorial index the app itself ships, so it moves with the
 *  corpus instead of pinning a number that would drift.  */
describe("caseThermo over the shipped corpus", () => {
  const withThermo = TUTORIALS
    .map((t) => ({ name: t.name, tp: t.files.thermoPackage }))
    .filter((e) => e.tp && Object.keys(e.tp).length > 0);

  it("the index carries thermoPhysPropDicts to sweep", () => {
    expect(withThermo.length).toBeGreaterThan(50);
  });

  it("NO CASE READS AS UNDECLARED WHILE ITS OWN DICT DECLARES A MODEL", () => {
    //  This is the arm that fails on the retired reader.  It asks the one
    //  question the panel was getting wrong, of every case at once.
    const liars: string[] = [];
    for (const { name, tp } of withThermo) {
      const eq = tp?.["equilibrium"];
      if (!eq || typeof eq !== "object") continue;      // judged below
      const text = JSON.stringify(eq);
      const declaresLiquid = /"(activityModel|solutionModel)"/.test(text);
      const declaresVapour = /"fugacityModel"/.test(text);
      const t = caseThermo(tp);
      if (declaresLiquid && t.liquid.state !== "declared")
        liars.push(`${name}: liquid declared but read as ${t.liquid.state}`);
      if (declaresVapour && t.vapour.state !== "declared")
        liars.push(`${name}: vapour declared but read as ${t.vapour.state}`);
    }
    expect(liars, liars.slice(0, 8).join("\n")).toEqual([]);
  });

  it("every case with an equilibrium block is READABLE -- none refuses", () => {
    //  The mirror: a refusal must be reserved for a file this reader really
    //  cannot parse.  If the corpus starts refusing, the grammar moved and
    //  this reader has to move with it -- which is the signal this arm
    //  exists to give.
    const refused = withThermo
      .filter((e) => e.tp?.["equilibrium"] !== undefined)
      .filter((e) => caseThermo(e.tp).unreadableReason !== null)
      .map((e) => e.name);
    expect(refused, refused.slice(0, 8).join("\n")).toEqual([]);
  });

  it("a case with NO equilibrium block refuses rather than claiming ideal",
    () => {
      const noEq = withThermo.filter((e) => e.tp?.["equilibrium"] === undefined);
      for (const e of noEq) {
        const t = caseThermo(e.tp);
        expect(t.unreadableReason, e.name).toBeTruthy();
      }
    });
});

/*  ---- THE SOURCE ARM ------------------------------------------------------
 *  The corpus arm proves the READER is right.  This one proves there is only
 *  ONE of it.  Three surfaces drifted together and stayed wrong together
 *  because each held its own copy of the question; a fourth copy would do the
 *  same, and nothing but this arm would notice.  */
describe("one home, and no v1 fallback anywhere", () => {
  const SURFACES = [
    "src/ui/ThermoView.tsx",
    "src/ui/CaseIntro.tsx",
    "src/ui/PropertyPanel.tsx",
  ];

  it("no surface reads the RETIRED flat keys off the thermoPhysPropDict",
    () => {
      //  `tp["activityModel"]` / `tp["equationOfState"]` at the TOP level is
      //  the v1 form the v2 contract retired on 2026-07-17.  A per-unit
      //  `thermo { activityModel ...; }` override and a propsDict op's
      //  `activityModel pitzerHMW;` are LIVE grammar in different slots, so
      //  the arm targets the top-level read on the package specifically.
      const offenders: string[] = [];
      for (const f of SURFACES) {
        const src = code(f);
        for (const key of ["activityModel", "equationOfState"]) {
          const re = new RegExp(`\\btp\\s*\\[\\s*["']${key}["']`, "g");
          const n = (src.match(re) ?? []).length;
          //  ThermoView keeps ONE read of `activityModel` for the NRTL pair
          //  list, which is a different question; the model word itself must
          //  come from caseThermo.
          if (key === "equationOfState" && n > 0)
            offenders.push(`${f}: reads the retired tp["${key}"]`);
        }
      }
      expect(offenders, offenders.join("\n")).toEqual([]);
    });

  it("every surface asks caseThermo", () => {
    for (const f of SURFACES)
      expect(code(f), f).toContain("caseThermo(");
  });

  /** Comments stripped before any source arm reads a file.  CLAUDE.md
   *  records the mirror of this trap from check_sector_hierarchy: a symbol
   *  named only in a BLOCK COMMENT satisfied a "calls it" arm until both
   *  comment forms were stripped -- PROSE IS NOT A CALL.  It is not a
   *  defect either: the first run of the arm below failed on the comment
   *  this very fix wrote to EXPLAIN the old falsehood. */
  const code = (f: string): string =>
    readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");

  it("no surface still prints the old falsehoods", () => {
    //  The two sentences Vitor read on a 200 bar Haber-Bosch plant.
    for (const f of SURFACES) {
      expect(code(f), f).not.toContain("defaults to ideal");
      expect(code(f), f).not.toContain('?? "idealGas"');
      expect(code(f), f).not.toContain('?? "ideal"');
    }
  });
});
