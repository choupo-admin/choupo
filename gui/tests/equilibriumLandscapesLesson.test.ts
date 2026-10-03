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
  The equilibrium-landscapes lesson, pinned where it would rot silently.

  What the page was commissioned for is held first: the sign the engine
  assigns is PER CELL and read from the feed's OVERALL thermicity, which is
  why a minor endothermic product inside an exothermic feed is moved BEYOND
  its equilibrium -- and the correction the biological page received the
  same day: there is NO hydrogen on the biological route, the electron donor
  is the organism's substrate, and the temperature approach does NOT transfer
  to an enzyme.

  The rest pins the claims ABOUT THE ENGINE that go false when the engine
  moves, the witnesses' identities, and the tool's arithmetic -- grouping,
  an argmax over two sets of engine numbers, and a tally read off the run's
  own diagnostics.  The engine runs in a browser; nothing here runs it.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  LANDSCAPE_LIMITS, LANDSCAPE_STEPS,
} from "../src/ui/methods/equilibriumLandscapesLesson.js";
import {
  CONTRAST_ANCHORS, FIXATION_WITNESS, LANDSCAPE_DT_KNOB, LANDSCAPE_WITNESSES,
  ROUTE_ROWS, SRK_CONTRAST, approachOverride, curvesOf, largestShift,
  routeKey, tallyOf, tallyWord, type Curve,
} from "../src/ui/methods/EquilibriumLandscapesTool.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import type { GibbsMapData } from "../src/ui/plotting/gibbsMapCsv.js";

const TOOL_SRC = readFileSync(
  new URL("../src/ui/methods/EquilibriumLandscapesTool.tsx", import.meta.url),
  "utf-8");

/** Line breaks are LAYOUT; asserting through them makes a re-wrap look like a
 *  changed claim. */
const prose = (s: string): string => s.replace(/\s+/g, " ").trim();

const step = (n: number) => LANDSCAPE_STEPS.find((s) => s.n === n)!;
const all = (n: number): string => {
  const s = step(n);
  return prose([s.title, s.body, s.note ?? "",
    ...(s.derivation ?? []).map((d) => d.step)].join(" "));
};

describe("the equilibrium-landscapes lesson", () => {
  it("has six steps, numbered without a gap", () => {
    expect(LANDSCAPE_STEPS).toHaveLength(6);
    expect(LANDSCAPE_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("opens on the kernel and the two permitted metrics, and names the ban", () => {
    const s = all(1);
    expect(s).toContain("ELEMENT YIELD");
    expect(s).toContain("refused by name where the species is also produced");
    expect(s).toContain("GibbsMapOp.cpp:168–213");
    expect(prose(step(1).formula!)).toContain(String.raw`Y_E = \frac{a_{E,p}\, n_p}{b_E}`);
  });

  it("reads the shape off two signs: thermicity and mole change", () => {
    const s = all(2);
    expect(s).toContain("Van 't Hoff");
    expect(s).toContain("mole-conserving");
    expect(s).toContain("the three pressures give the SAME curve");
    const f = prose(step(2).formula!);
    expect(f).toContain(String.raw`\frac{\Delta H_\mathrm{rxn}}{R\,T^{2}}`);
    expect(f).toContain(String.raw`^{-\Delta\nu}`);
    //  The ammonia curve's cold 100 bar leg is a vapour pressure, not a
    //  conversion, and the page must say so where the curve is introduced.
    expect(s).toContain("is reading a vapour pressure");
  });

  it("says the sign is decided PER CELL from the feed's overall thermicity", () => {
    const s = all(3);
    expect(s).toContain("DIRECTION is decided per cell");
    expect(s).toContain("GibbsReactor.cpp:67–161");
    expect(s).toContain("`deltaT_K` column");
    expect(s).toContain("CROSSES a thermicity boundary");
    const f = prose(step(3).formula!);
    expect(f).toContain(String.raw`s = -\operatorname{sgn}\!\left(\Delta H_\mathrm{rxn}\right)`);
  });

  it("makes the local slope the reason one magnitude means different things", () => {
    const s = all(4);
    expect(s).toContain("HORIZONTAL move along the equilibrium curve");
    expect(s).toContain("nothing at all on a flat one");
    expect(s).toMatch(/exchange rate between them/);
  });

  it("draws the GLOBAL caveat on thermal NO and calls it a model limitation", () => {
    const s = all(5);
    expect(s).toContain("GibbsReactor.cpp:364–368");
    expect(s).toContain("reports MORE NO than the true equilibrium");
    expect(s).toContain("LIMITATION OF THE SINGLE-NUMBER MODEL, NOT A FINDING ABOUT FLAMES");
    expect(prose(step(5).formula!)).toContain(String.raw`\ce{N2 + O2 <=> 2 NO}`);
  });

  it("carries NO hydrogen on the biological route -- Vitor's correction of 2026-09-27", () => {
    //  The sentence the correction was about.  A page that shows
    //  N2 + 3 H2 at 298 K as the biological reaction teaches Haber-Bosch
    //  chemistry at ambient conditions, which is a different lesson.
    const s = all(6);
    expect(s).toContain("There is no hydrogen on the biological route");
    expect(s).toContain("PROTONS and ELECTRONS");
    expect(s).toContain("balanced by electron count");
    const f = prose(step(6).formula!);
    expect(f).toContain(String.raw`\ce{C6H12O6(s) + 4 N2 + 6 H2O(l) -> 6 CO2 + 8 NH3}`);
    expect(f).toContain(String.raw`\ce{N2 + 3 H2O(l) -> 2 NH3 + 3/2 O2}`);
    expect(f).toContain(String.raw`\ce{N2 + 3 H2 -> 2 NH3}`);
  });

  it("says what transfers to an enzyme and what does not", () => {
    const s = all(6);
    expect(s).toContain("has no meaning for an enzyme");
    expect(s).toContain("EQUILIBRIUM LIMIT");
    expect(s).toContain("EXTENT BOOKKEEPING");
    expect(s).toContain("`batchReactor` or a `dynamicCSTR`");
    expect(s).toContain("never a Gibbs reactor");
  });

  it("quotes the engine's refusals rather than hiding them", () => {
    const s = all(6);
    //  Measured natively, on a copy of the witness with the sugar route at
    //  310.15 K, and on a gibbsMap with glucose beside gases.
    expect(s).toContain("h_formation liquid leg needs liquidHeatCapacity");
    expect(s).toContain("wrong by a heat of sublimation");
    expect(s).toContain("Component.cpp:1413–1425");
    expect(s).toContain("Reaction.cpp:136–149");
    expect(s).toContain("AmmoniaSynthesisRate.cpp:111–117");
  });

  it("cites nothing for the enzyme, and says so", () => {
    //  Nothing in this repository describes nitrogenase; inventing a
    //  citation converts unsourced into falsely sourced.
    const s = all(6);
    expect(s).toContain("No document in this repository describes nitrogenase");
    expect(s).not.toMatch(/et al\.|doi:/);
  });

  it("gives every equation a where-list -- the gate holds it, so does this", () => {
    for (const s of LANDSCAPE_STEPS)
      if (s.formula)
        expect(s.where?.length, `step ${s.n} has a formula and no glosses`)
          .toBeGreaterThan(0);
  });
});

describe("what the page declines to claim", () => {
  it("bounds every curve to the ideal-gas kernel", () => {
    const l = LANDSCAPE_LIMITS.find((x) => x.id === "ideal-gas-kernel")!;
    expect(prose(l.body)).toContain("ElementPotential.cpp:47–48");
    expect(prose(l.body)).toContain("fugacityModel idealGas");
  });

  it("names the one-condensable branch and says no witness reaches the silent one", () => {
    const l = LANDSCAPE_LIMITS.find((x) => x.id === "gas-phase-metric")!;
    expect(prose(l.body)).toContain("ElementPotential.cpp:71");
    expect(prose(l.body)).toContain("no cell reaches that second branch");
  });

  it("says the sugar route is priced at the datum only, as a refusal", () => {
    const l = LANDSCAPE_LIMITS.find((x) => x.id === "biological-routes-at-the-datum-only")!;
    expect(prose(l.body)).toContain("glucose.dat has no Cp on any rung");
    expect(prose(l.body)).toContain("not asked at 700 K");
  });

  it("names the Gibbs reactors it left out and why", () => {
    const l = LANDSCAPE_LIMITS.find((x) => x.id === "the-survey-is-five-of-twenty-two")!;
    expect(prose(l.body)).toContain("adiabatic");
    expect(prose(l.body)).toContain("Claus");
  });
});

describe("the tool's arithmetic", () => {
  const data = (cells: [number, number, number, boolean][]): GibbsMapData => ({
    cells: cells.map(([T_K, P_Pa, metric, converged]) =>
      ({ T_K, P_Pa, deltaT_K: 0, converged, metric, x: {} })),
    Ts: [...new Set(cells.map((c) => c[0]))].sort((a, b) => a - b),
    Ps: [...new Set(cells.map((c) => c[1]))].sort((a, b) => a - b),
    species: [], solids: [], deltaT: 0,
  });

  it("groups converged cells by pressure, sorted by T, and drops the unconverged", () => {
    const c = curvesOf(data([
      [500, 1e5, 0.9, true], [400, 1e5, 0.95, true], [400, 1e6, 0.5, true],
      [500, 1e6, 0.4, false],
    ]));
    expect(c.map((x) => x.P_Pa)).toEqual([1e5, 1e6]);
    expect(c[0]!.T).toEqual([400, 500]);
    expect(c[0]!.v).toEqual([0.95, 0.9]);
    expect(c[1]!.T).toEqual([400]);          // the unconverged 500 K cell is gone
    expect(curvesOf(null)).toEqual([]);
  });

  it("finds, per pressure, the temperature where the shifted curve parts most", () => {
    //  Two engine curves, matched at (T, P); the argmax is a comparison and
    //  nothing else.  Values are the shape of the ammonia witness at 1 bar:
    //  the largest gap sits in the middle, where the slope is steepest.
    const base: Curve[] = [{ P_Pa: 1e5, T: [300, 400, 500, 600], v: [0.93, 0.50, 0.10, 0.02] }];
    const shifted: Curve[] = [{ P_Pa: 1e5, T: [300, 400, 500, 600], v: [0.90, 0.35, 0.06, 0.015] }];
    const s = largestShift(base, shifted);
    expect(s).toHaveLength(1);
    expect(s[0]!.T).toBe(400);
    expect(s[0]!.delta).toBeCloseTo(-0.15, 12);
    //  A pressure the shifted run lacks yields no row rather than a guess.
    expect(largestShift(base, [{ P_Pa: 1e6, T: [300], v: [0.9] }])).toEqual([]);
  });

  it("reads the engine's tally off the diagnostics and names the run in one word", () => {
    //  The keys are GibbsMapOp.cpp's own, present only when an approach was
    //  declared -- their absence means nothing was assigned.
    expect(tallyOf(undefined)).toBeNull();
    expect(tallyOf({ n_cells: 108 })).toBeNull();
    const exo = tallyOf({
      approachDirection_exothermicSolves: 111,
      approachDirection_endothermicSolves: 0,
      approachDirection_undeterminedSolves: 0,
    })!;
    expect(exo).toEqual({ exo: 111, endo: 0, undetermined: 0 });
    expect(tallyWord(exo)).toBe("exothermic");
    expect(tallyWord({ exo: 0, endo: 109, undetermined: 0 })).toBe("endothermic");
    expect(tallyWord({ exo: 60, endo: 40, undetermined: 1 })).toBe("mixed");
    expect(tallyWord({ exo: 0, endo: 0, undetermined: 3 })).toBeNull();
    expect(tallyWord(null)).toBeNull();
  });

  it("writes ONE dict scalar and asserts the bare unit every witness declares", () => {
    expect(approachOverride(50)).toEqual([
      { file: "system/propsDict", key: "temperatureApproach", value: 50, unit: "" },
    ]);
  });

  it("offers no negative magnitude, because the engine refuses one", () => {
    expect(LANDSCAPE_DT_KNOB.min).toBe(0);
    expect(LANDSCAPE_DT_KNOB.label).toMatch(/MAGNITUDE/);
  });

  it("keys the route table exactly as reactionGibbs names its diagnostics", () => {
    const r = ROUTE_ROWS.find((x) => x.rxn === "heterotrophic")!;
    expect(routeKey(r, "dG_kJ_mol")).toBe("heterotrophic_T298K_dG_kJ_mol");
    //  The rows that are NOT here are refusals the lesson quotes.
    expect(ROUTE_ROWS.some((x) => x.rxn === "heterotrophic" && x.T_K !== 298)).toBe(false);
    expect(ROUTE_ROWS.some((x) => x.rxn === "phototrophic" && x.T_K === 700)).toBe(false);
    expect(ROUTE_ROWS.filter((x) => x.rxn === "haberBosch").map((x) => x.T_K)).toEqual([298, 310, 700]);
  });
});

describe("the witnesses, and why they are these", () => {
  it("covers the table of step 2: five gibbsMap witnesses under props/gibbs", () => {
    expect(LANDSCAPE_WITNESSES.map((w) => w.witness)).toEqual([
      "props/gibbs/landscape01_ammonia_synthesis",
      "props/gibbs/landscape02_water_gas_shift",
      "props/gibbs/landscape03_steam_reforming",
      "props/gibbs/landscape04_methane_combustion",
      "props/gibbs/landscape05_thermal_no",
    ]);
    expect(LANDSCAPE_WITNESSES.map((w) => w.predicted.thermicity))
      .toEqual(["exothermic", "exothermic", "endothermic", "exothermic", "exothermic"]);
    //  The reforming metric is the UNCONVERTED feed, so less is more.
    expect(LANDSCAPE_WITNESSES.map((w) => w.moreIsMoreConverted))
      .toEqual([true, true, false, true, true]);
    //  Only thermal NO spans decades.
    expect(LANDSCAPE_WITNESSES.filter((w) => w.logAxis).map((w) => w.id)).toEqual(["no"]);
  });

  it("reads the contrast off the ammonia witness's anchors, gibbs10 and the fixation witness", () => {
    expect(CONTRAST_ANCHORS.ambient.key).toBe("metric_T25C_P1atm");
    expect(CONTRAST_ANCHORS.converter.key).toBe("metric_T427C_P197atm");
    expect(SRK_CONTRAST).toEqual({
      witness: "steady/gibbs/gibbs10_ammonia_fugacity", unit: "ammonia", kpi: "y_NH3",
    });
    expect(FIXATION_WITNESS).toBe("props/gibbs/landscape06_nitrogen_fixation_routes");
  });

  it("records the measured numbers in the header rather than asserting them", () => {
    //  The header carries what was run natively before the page was written;
    //  a header that loses them leaves the page standing on nothing.
    const h = prose(TOOL_SRC);
    expect(h).toContain("metric_T25C_P1atm 0.937894955707");
    expect(h).toContain("metric_T427C_P197atm 0.30011873919");
    expect(h).toContain("y_NH3 = 0.323866847046");
    expect(h).toContain("heterotrophic 298.15 K dG -165.284655706");
    expect(h).toContain("phototrophic 298.15 K dG 678.607668397");
    expect(h).toContain("haberBosch 700 K dG 54.2847022924");
    expect(h).toContain("h_formation liquid leg needs liquidHeatCapacity");
  });
});

describe("the registry entry", () => {
  it("is live, shelved under reaction engineering, and says what it teaches", () => {
    const e = METHOD_TOOLS.find((m) => m.id === "equilibrium-landscapes")!;
    expect(e.status).toBe("live");
    expect(e.discipline).toBe("Reaction engineering");
    expect(e.kind).toBe("notes");
    expect(prose(e.teaches)).toContain("the biological routes carrying no H₂ at all");
    expect(prose(e.teaches)).toContain("the temperature approach does not");
  });
});
