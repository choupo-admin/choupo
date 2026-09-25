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
  The approach-to-equilibrium lesson, pinned where it would rot silently.

  This page exists because one specific thing had never been said out loud, so
  these cases hold THAT sentence first: positive is conservative only for an
  EXOTHERMIC reaction.  A lesson that loses it keeps its layout and drops its
  reason for existing, and no gate anywhere can notice.

  The rest pins the claims that are ABOUT THE ENGINE and therefore go false
  when the engine moves: the separation (chemistry shifted, state not), the
  three caveats being the engine's own, and the two absences named rather than
  implied.

  AND IT PINS THE TOOL'S ONE PIECE OF ARITHMETIC.  `verdictOf` is the whole of
  the TypeScript on that page -- one comparison of two engine numbers under a
  direction the witness declares -- so it is the only thing there a unit test
  can reach at all.  The engine runs in a browser; nothing here runs it.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  APPROACH_LIMITS, APPROACH_STEPS,
} from "../src/ui/methods/approachToEquilibriumLesson.js";
import {
  APPROACH_WITNESSES, approachOverrides, thermicityOf, verdictOf,
  wantedSignOf,
} from "../src/ui/methods/ApproachToEquilibriumTool.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const TOOL_SRC = readFileSync(
  new URL("../src/ui/methods/ApproachToEquilibriumTool.tsx", import.meta.url),
  "utf-8");

/** Line breaks are LAYOUT; asserting through them makes a re-wrap look like a
 *  changed claim. */
const prose = (s: string): string => s.replace(/\s+/g, " ").trim();

const step = (n: number) => APPROACH_STEPS.find((s) => s.n === n)!;
const all = (n: number): string => {
  const s = step(n);
  return prose([s.title, s.body, s.note ?? "",
    ...(s.derivation ?? []).map((d) => d.step)].join(" "));
};

describe("the Gibbs-reactor approach lesson", () => {
  it("has six steps, numbered without a gap, in the commissioned order", () => {
    expect(APPROACH_STEPS).toHaveLength(6);
    expect(APPROACH_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("opens on a reactor that declares NO reactions, and names the trap", () => {
    //  The power and the trap are one sentence, and a page that states only
    //  the first half has sold the method rather than taught it.
    expect(all(1)).toContain("minimises the mixture's Gibbs energy");
    expect(all(1)).toContain(
      "A reactor that needs no mechanism also cannot be told one it should "
      + "respect");
    expect(prose(step(1).formula!)).toContain(String.raw`A\,n = b`);
  });

  it("says the driver is DATA AVAILABILITY, not the project stage", () => {
    //  The correction the architect's own framing needed: the ladder is real,
    //  and what moves you up it is information arriving, not the calendar.
    const s = all(2);
    expect(s).toContain("DATA AVAILABILITY, not the date");
    expect(s).toContain("licensor");
    expect(s).toMatch(/very first screening flowsheet/);
  });

  it("keeps the two temperatures apart, which is the teachable line", () => {
    //  GibbsReactor.cpp:143-149 announces exactly this, and the page must not
    //  round it off into "the reactor runs hotter".
    const f = prose(step(3).formula!);
    expect(f).toContain(String.raw`n_\mathrm{eq}(T + \Delta T,\; P)`);
    expect(f).toContain(String.raw`h_i(T,\, P)`);
    expect(all(3)).toContain(
      "enthalpy, Psat and the energy balance stay at the physical T");
    expect(all(3)).toContain("ElementPotential.cpp:47");
  });

  it("states THE SIGN unmistakably, and that positive is not universal", () => {
    //  This is the sentence the page was commissioned for.  If exactly one
    //  assertion in this file survives, it should be this one.
    const s = all(4);
    expect(s).toContain(
      "POSITIVE IS CONSERVATIVE ONLY FOR AN EXOTHERMIC REACTION");
    expect(s).toContain("Both signs are accepted and the engine constrains "
      + "neither");
    expect(s).toMatch(/steam reforming/);
    const f = prose(step(4).formula!);
    expect(f).toContain(String.raw`\Delta H_\mathrm{rxn} < 0`);
    expect(f).toContain(String.raw`\Delta T > 0`);
    expect(f).toContain(String.raw`\Delta H_\mathrm{rxn} > 0`);
    expect(f).toContain(String.raw`\Delta T < 0`);
  });

  it("carries the three caveats the engine prints ITSELF, all three", () => {
    const s = all(5);
    expect(s).toContain("EMPIRICAL");
    expect(s).toContain("GLOBAL");
    expect(s).toContain("AT HIGH PRESSURE IT WILL ABSORB MISSING FUGACITY "
      + "CORRECTIONS");
    //  The reformer is the case where GLOBAL bites hardest, because the two
    //  reactions on one catalyst want OPPOSITE signs.
    expect(s).toMatch(/opposite/i);
    //  And the high-pressure caveat is concrete, not a warning label.
    expect(s).toContain("gibbs10_ammonia_fugacity");
  });

  it("cites the PRIMARY source for every claim it takes from outside", () => {
    //  Project doctrine: cite the primary source per value, never the
    //  aggregator's arrangement.  Two claims on this page come from outside
    //  the tree, and both name the document they came from.
    expect(all(3)).toContain(
      "Johnson Matthey, Guide to Approach-to-Equilibrium, flyer, c. 2020");
    expect(all(6)).toContain("doi:10.1002/cctc.202400890");
    //  and the numbers that come from INSIDE the tree say which is a golden
    //  and which was measured by hand, because those rot differently.
    expect(all(5)).toContain("was measured by switching that package's "
      + "`fugacityModel` to `idealGas`");
  });

  it("names the two absences rather than implying them", () => {
    const s = all(6);
    expect(s).toContain("FRACTIONAL or extent approach");
    expect(s).toContain("not interchangeable");
    expect(s).toContain("PELLET EFFECTIVENESS FACTOR");
    expect(s).toContain("CatalystPellet.cpp");
  });

  it("gives every equation a where-list — the gate holds it, so does this", () => {
    for (const s of APPROACH_STEPS)
      if (s.formula)
        expect(s.where?.length, `step ${s.n} has a formula and no glosses`)
          .toBeGreaterThan(0);
  });
});

describe("what the page declines to claim", () => {
  it("says the panel runs the case twice and declares no approach", () => {
    const l = APPROACH_LIMITS.find((x) => x.id === "two-runs-not-one")!;
    expect(prose(l.body)).toContain("Nothing on this page writes "
      + "`temperatureApproach` into a dict");
  });

  it("bounds the equivalence to an ideal-gas package, in the limits", () => {
    //  The equivalence is EXACT on these two witnesses and is not exact
    //  everywhere; a page that claimed it in general would be wrong at the
    //  one pressure where the third caveat lives.
    const l = APPROACH_LIMITS.find(
      (x) => x.id === "exact-only-for-an-ideal-gas")!;
    expect(prose(l.body)).toContain("fugacityModel idealGas");
    expect(prose(l.body)).toContain("GibbsMethod.cpp:64–94");
  });

  it("says no ΔT anywhere on the page is calibrated against anything", () => {
    const l = APPROACH_LIMITS.find(
      (x) => x.id === "no-number-here-is-calibrated")!;
    expect(prose(l.body)).toContain("there is no measurement anywhere in this "
      + "tool");
  });
});

describe("the tool's one piece of arithmetic", () => {
  it("calls ΔT = 0 the same question, whichever direction is good", () => {
    expect(verdictOf(0.3, 0.3, 0, true)).toBe("equilibrium");
    expect(verdictOf(0.3, 0.2, 0, false)).toBe("equilibrium");
  });

  it("reads a product mole fraction FALLING as short of equilibrium", () => {
    //  The shift witness: y_CO2 falls as the evaluation temperature rises, so
    //  a positive approach under-predicts.  These are the engine's own
    //  published values at 800 K and 850 K.
    expect(verdictOf(0.33590768315, 0.317590043863, 50, true)).toBe("short");
    //  and the same pair the other way round is the reactor beating
    //  equilibrium, which is what a negative approach does to an exothermic
    //  reaction.
    expect(verdictOf(0.33590768315, 0.354, -50, true)).toBe("beyond");
  });

  it("inverts for a metric where LESS is more converted", () => {
    //  The reformer witness: y_CH4 is unconverted feed.  A POSITIVE approach
    //  lowers the slip, which is the reactor beating equilibrium -- the exact
    //  mistake the page exists to make visible.
    expect(verdictOf(0.0024289965616, 0.000698983877988, 50, false))
      .toBe("beyond");
    expect(verdictOf(0.0024289965616, 0.0942344102656, -50, false))
      .toBe("short");
  });

  it("reads the thermicity off the engine's duty sign, not off a name", () => {
    //  GibbsReactor.cpp:323 -- Q_kW is heat ADDED to hold T.
    expect(thermicityOf(-3.44038833106)).toBe("exothermic");   // shift at 800 K
    expect(thermicityOf(57.7812038582)).toBe("endothermic");   // reformer, 1000 K
    expect(thermicityOf(0)).toBe("thermally neutral");
    expect(thermicityOf(null)).toBeNull();
  });

  it("derives the WANTED sign from the thermicity and from nothing else", () => {
    expect(wantedSignOf(thermicityOf(-3.44))).toBe("positive");
    expect(wantedSignOf(thermicityOf(57.78))).toBe("negative");
    expect(wantedSignOf(thermicityOf(0))).toBeNull();
  });

  it("moves the feed temperature with the reactor, and asserts the unit", () => {
    //  Both halves matter.  A feed left behind makes Q_kW carry sensible heat
    //  and its SIGN stops being the thermicity (measured: the shift reactor at
    //  1200 K with an 800 K feed reports +2.04 kW and is exothermic).  The
    //  unit assertion is methodRun's refusal channel: the substitution keeps
    //  the declared unit and replaces only the number.
    const ov = approachOverrides(900);
    expect(ov).toEqual([
      { file: "system/flowsheetDict", key: "T", value: 900, unit: "K" },
      { file: "0/feed", key: "T", value: 900, unit: "K" },
    ]);
  });
});

describe("the witnesses, and why they are these two", () => {
  it("pairs one exothermic and one endothermic Gibbs case", () => {
    expect(APPROACH_WITNESSES.map((w) => w.witness)).toEqual([
      "steady/gibbs/gibbs01_water_gas_shift",
      "steady/gibbs/gibbs02_steam_reforming",
    ]);
    //  Opposite directions of goodness is the whole point of the pair: the
    //  same slider, the same verdict rule, opposite wanted signs.
    expect(APPROACH_WITNESSES.map((w) => w.moreIsMoreConverted))
      .toEqual([true, false]);
  });

  it("starts each witness at its own case temperature", () => {
    //  A slider left behind on a witness swap runs the second case at the
    //  first one's condition, silently.
    for (const w of APPROACH_WITNESSES) {
      expect(w.T0).toBeGreaterThanOrEqual(w.Tmin);
      expect(w.T0).toBeLessThanOrEqual(w.Tmax);
    }
    expect(APPROACH_WITNESSES.map((w) => w.T0)).toEqual([800, 1000]);
  });

  it("records the measured equivalence rather than asserting it", () => {
    //  The header carries the two comparisons that were run against the native
    //  binary before the page was written.  They are the evidence for the
    //  central claim of the interactive, and a header that loses them leaves
    //  the claim standing on nothing.
    const h = prose(TOOL_SRC);
    expect(h).toContain("temperatureApproach 50 at 800 K y_CO = "
      + "0.182409956137");
    expect(h).toContain("temperatureApproach 50 at 1000 K y_CH4 = "
      + "0.000698983877988");
    expect(h).toContain("0.280059 against 0.281596");
  });
});

describe("the registry entry", () => {
  it("is live, shelved under reaction engineering, and says what it teaches", () => {
    const e = METHOD_TOOLS.find((m) => m.id === "approach-to-equilibrium")!;
    expect(e.status).toBe("live");
    expect(e.discipline).toBe("Reaction engineering");
    expect(e.kind).toBe("notes");
    expect(prose(e.teaches)).toContain(
      "positive is conservative only for an EXOTHERMIC reaction");
  });
});
