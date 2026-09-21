import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CATALOGUE } from "../src/case/catalogue.js";
import { buildLocalUnifac } from "../src/case/unifacGroups.js";
import { PLOT_KINDS, classifySelection, viewsFor } from "../src/case/exploreViews.js";
import { LENS_SHORT } from "../src/case/exploreLenses.js";

// no case-local UNIFAC overrides -> coverage comes from the standard catalogue
const NO_LOCAL = buildLocalUnifac({});
const views = (sel: string[]) => viewsFor(sel, CATALOGUE, NO_LOCAL);

// McCabe-Thiele and the psychrometric chart LEFT the Explorer 2026-08-15: both
// are METHOD CONSTRUCTIONS and now live in the Methods workspace (their PlotKind
// entries are gone, so "never offered here" is enforced by the type system, not
// by assertions).  classifySelection is untouched — humid-gas still gates the
// VLE views OFF for a carrier-gas pair.

describe("Explore view relevance — only physically-meaningful views are offered", () => {
  it("water+benzene (aqueous-organic): VLE + binary LLE, NEVER scaling", () => {
    expect(classifySelection(["water", "benzene"], CATALOGUE)).toBe("aqueous-organic");
    const v = views(["water", "benzene"]);
    expect(v.has("txy")).toBe(true);
    expect(v.has("gamma")).toBe(true);
    expect(v.has("binaryLle")).toBe(true);
    // the bug Vítor caught: scaling must NOT appear for an aqueous-organic pair
    expect(v.has("scaling")).toBe(false);
  });

  it("benzene+toluene (organic-mixture): the binary VLE family is offered", () => {
    const v = views(["benzene", "toluene"]);
    expect(v.has("txy")).toBe(true);
    expect(v.has("yx")).toBe(true);      // same front door as the T-x-y
    expect(v.has("gamma")).toBe(true);
  });

  //  D4 (2026-09-21).  The equilibrium curve y*(x) is the most familiar
  //  diagram in VLE and was reachable ONLY through a `View:` SegmentedControl
  //  that the plot component drew inside its own box — a fourth chrome home
  //  the lens strip never showed, with the SET pill overlaid across its label.
  //  Vitor reported it missing three times.  A lens, or it is not findable.
  it("the equilibrium curve y(x) is a LENS wherever the T-x-y is", () => {
    for (const pair of [["benzene", "toluene"], ["ethanol", "water"]]) {
      const v = views(pair);
      expect(v.has("txy")).toBe(true);
      expect(v.has("yx")).toBe(true);
    }
    //  and nowhere the T-x-y is not — it is the same engine run.
    expect(views(["water"]).has("yx")).toBe(false);
    expect(views(["water", "NaCl"]).has("yx")).toBe(false);
    expect(views(["water", "ethanol", "benzene"]).has("yx")).toBe(false);
  });

  //  D5 (2026-09-21).  The binary flash is a METHOD CONSTRUCTION — its own
  //  header called it "the next member of the operating-line graphical-method
  //  family" — and on 2026-08-28 the SAME construction was built again in
  //  EduTools over the same case/binaryFlash.ts geometry.  Two homes for one
  //  construction, one of them on the wrong plane (gui-credo §9, ratified
  //  2026-08-15).  This assertion USED to read `expect(v.has("flash")).toBe(
  //  true)` with the comment "same front door as the T-x-y", which is the
  //  finding: a test can pin a defect as firmly as it pins a fix.
  it("the binary flash is NOT an Explorer lens — it is an EduTools tool", () => {
    expect((PLOT_KINDS as readonly string[]).includes("flash")).toBe(false);
    for (const pair of [["benzene", "toluene"], ["ethanol", "water"]])
      expect([...views(pair)]).not.toContain("flash");
    //  It did not simply vanish: the EduTools registry offers it LIVE, and
    //  the geometry module both hosts read STAYS where the surviving host
    //  imports it.  Checked, not assumed -- a first draft of this arm looked
    //  for "binaryFlash" in the registry, which declares tools by ID and
    //  imports nothing, so it would have failed on correct code.
    const reg = readFileSync(
      new URL("../src/ui/methods/registry.ts", import.meta.url), "utf8");
    expect(reg).toMatch(/id:\s*"flash-operating-line"[\s\S]{0,400}?status:\s*"live"/);
    const tool = readFileSync(
      new URL("../src/ui/methods/FlashOperatingLineTool.tsx", import.meta.url), "utf8");
    expect(tool).toMatch(/from "\.\.\/\.\.\/case\/binaryFlash\.js"/);
  });

  //  ...and the rail's "what unlocks next" line must say where it went.  That
  //  line is prose in the component, so it is read from the SOURCE — the same
  //  way exploreTheoryAnchors.test.ts reaches the property lists.  It named
  //  "binary flash" as an Explorer lens and "γ(x)" for a strip that says
  //  "activity γ": a promise about a strip, written without reading it.
  it("the unlock line names the lenses the strip will show, and EduTools for the rest", () => {
    const src = readFileSync(
      new URL("../src/ui/ExploreWorkspace.tsx", import.meta.url), "utf8");
    const m = src.match(/return "\+1 VLE compound → ([^"]*)";/);
    expect(m, "the +1-VLE-compound unlock line moved or was reworded — this gate has gone blind")
      .toBeTruthy();
    const line = m![1]!;
    const ours = line.slice(0, line.indexOf("("));
    //  NO FALSE PROMISE: every lens word the line offers as OURS must be one
    //  the pair actually unlocks.  It said "binary flash", which this strip no
    //  longer has, and "γ(x)" for a button that reads "activity γ".
    //
    //  MEASURED, and the arm is deliberately one-directional because of it:
    //  +1 VLE compound also unlocks `delta`, which the line does not name.
    //  Requiring COMPLETENESS would be the register's D14 (derive the line
    //  from the diffed viewsFor set), a later slice; what is pinned here is
    //  that nothing it names is stale.
    const unlocked = new Set([...views(["benzene", "toluene"])]
      .filter((k) => !views(["benzene"]).has(k)).map((k) => LENS_SHORT[k]));
    for (const word of ours.split(",").map((w) => w.trim()).filter(Boolean))
      expect(unlocked, `the line offers "${word}", which +1 VLE compound does not unlock here`)
        .toContain(word);
    //  …and the constructions that moved are named as EduTools', not as ours.
    expect(line).toMatch(/EduTools/);
    expect(ours).not.toMatch(/flash|McCabe/i);
  });

  //  D2 (2026-09-21).  `viewsFor` added `gibbsmap` for EVERY 2+ selection,
  //  before any class gate, and the engine op refuses a selection with no
  //  stoichiometric freedom BY NAME (GibbsMapOp.cpp: N <= M).  Measured
  //  natively on all four selections below: the first three REFUSED, the
  //  fourth ran 626 rows.  So on every binary in the catalogue the student
  //  met a lens whose only possible outcome was a red error.
  it("the equilibrium map is offered only where the engine can answer", () => {
    expect(views(["benzene", "toluene"]).has("gibbsmap")).toBe(false);  // C,H: N = M = 2
    expect(views(["ethanol", "water"]).has("gibbsmap")).toBe(false);    // C,H,O: N 2 < M 3
    expect(views(["water", "NaCl"]).has("gibbsmap")).toBe(false);       // H,O,Na,Cl: N 2 < M 4
    expect(views(["N2", "H2", "NH3"]).has("gibbsmap")).toBe(true);      // N,H: N 3 > M 2
  });

  it("water+NaCl (aqueous-electrolyte): scaling, NEVER a VLE T-x-y", () => {
    expect(classifySelection(["water", "NaCl"], CATALOGUE)).toBe("aqueous-electrolyte");
    const v = views(["water", "NaCl"]);
    expect(v.has("scaling")).toBe(true);
    expect(v.has("txy")).toBe(false);
  });

  it("N2+water (humid-gas): NEVER scaling or a VLE T-x-y (its chart lives in Methods)", () => {
    expect(classifySelection(["N2", "water"], CATALOGUE)).toBe("humid-gas");
    const v = views(["N2", "water"]);
    expect(v.has("scaling")).toBe(false);
    expect(v.has("txy")).toBe(false);
  });

  it("water+ethanol+benzene: ternary views, NEVER scaling", () => {
    const v = views(["water", "ethanol", "benzene"]);
    expect(v.has("ternary")).toBe(true);
    expect(v.has("ternaryLle")).toBe(true);
    expect(v.has("scaling")).toBe(false);
  });

  it("pure water: phase + steam, never a binary/mixture view", () => {
    const v = views(["water"]);
    expect(v.has("phase")).toBe(true);
    expect(v.has("steam")).toBe(true);
    expect(v.has("txy")).toBe(false);
    expect(v.has("scaling")).toBe(false);
  });

  it("scan is always offered", () => {
    expect(views(["water"]).has("scan")).toBe(true);
    expect(views(["water", "benzene"]).has("scan")).toBe(true);
  });
});
