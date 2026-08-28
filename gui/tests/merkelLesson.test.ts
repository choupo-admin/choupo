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
  The cooling-tower lesson.  A page about a METHOD's assumptions is worth
  nothing if the assumptions drift from the engine that computes the answer,
  so the checkable half is CHECKED and not quoted:

    * every hypothesis the page attributes to Merkel is read back out of
      CoolingTower.{H,cpp} — a page claiming a hypothesis the engine does not
      make, or dropping one it does, fails here;
    * every number quoted in the prose is recomputed from the witness's own
      golden `expected` file (the wet bulb, the evaporated fraction, the
      Chebyshev-4 deviation), so a page that flatters the method fails here
      too;
    * the ordering claim — definitions before the diagram, consequences and
      limits after — is read off the RENDER site, not off an import.

  The honesty half is pinned as prose, because that is what it is: the page
  must go on saying that KaV/L is declared rather than predicted, and that
  the make-up it reports is evaporation ALONE.  Both are sentences a later
  edit removes for reading more smoothly, and both are why the page can be
  trusted.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { MERKEL_LIMITS, MERKEL_STEPS } from "../src/ui/methods/merkelLesson.js";
import { chebyshevDeviation, kelvinToC } from "../src/ui/methods/MerkelTool.js";

const SRC = readFileSync(
  new URL("../src/ui/methods/MerkelTool.tsx", import.meta.url), "utf-8");
const ENGINE_H = readFileSync(
  new URL("../../src/unitOperations/heatTransfer/CoolingTower.H", import.meta.url),
  "utf-8");
const ENGINE_CPP = readFileSync(
  new URL("../../src/unitOperations/heatTransfer/CoolingTower.cpp", import.meta.url),
  "utf-8");
const GOLDEN = readFileSync(
  new URL("../../tutorials/steady/heat/coolingTower01_merkel/expected",
    import.meta.url), "utf-8");

const prose = (s: string): string => s.replace(/\s+/g, " ");
const step = (n: number) => MERKEL_STEPS.find((s) => s.n === n)!;
const limit = (id: string) => MERKEL_LIMITS.find((l) => l.id === id)!;

/** One KPI out of the witness's golden-master file — the same numbers
 *  bin/runTests compares the engine against. */
function golden(key: string): number {
  const m = new RegExp("^kpi\\s+tower01\\s+" + key + "\\s+([-+0-9.eE]+)", "m")
    .exec(GOLDEN);
  expect(m, `KPI ${key} is not in the witness golden`).not.toBeNull();
  return Number(m![1]);
}

describe("the lesson is complete and numbered", () => {
  it("has five steps, numbered without a gap", () => {
    expect(MERKEL_STEPS).toHaveLength(5);
    expect(MERKEL_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5]);
  });

  it("gives every step a title and a body of real length", () => {
    for (const s of MERKEL_STEPS) {
      expect(s.title.length, `step ${s.n} has no title`).toBeGreaterThan(0);
      expect(s.body.length, `step ${s.n} has no body`).toBeGreaterThan(200);
    }
  });
});

describe("the one idea the page exists for: the driving force is not a ΔT", () => {
  it("says the heat leaves by EVAPORATION, and prints the enthalpy potential", () => {
    const s1 = step(1);
    expect(prose(s1.body)).toContain("EVAPORATES");
    expect(s1.formula).toContain("h*(T_water) − h_air");
    //  The unit matters: the potential is per kg of DRY air, which is why the
    //  diagram's y-axis is not a temperature.
    expect(s1.formula).toContain("kJ per kg dry air");
  });

  it("names the lumping as an assumption where it is first used", () => {
    //  Overclaiming here would be the easy mistake: one potential in place of
    //  two transfer processes is a hypothesis, not a derivation.
    expect(prose(step(1).note!)).toContain("ASSUMPTION");
    expect(prose(step(1).note!)).toContain("Lewis factor of one");
  });
});

describe("the wet bulb is the floor, and the approach is the price", () => {
  it("says WET bulb, and says the dry bulb is not the floor", () => {
    const s2 = step(2);
    expect(prose(s2.body)).toContain("WET-BULB temperature");
    expect(s2.formula).toContain("approach = T_water,out − T_wb,in");
    expect(prose(s2.note!)).toContain("dry bulb is not the floor");
  });

  it("gives the design consequence: a small approach is a large tower", () => {
    //  The claim the whole page turns on, and the one a textbook states
    //  loosely.  It is true of THIS engine: the integrand 1/(h* − h) diverges
    //  at the wet-bulb floor, which is exactly what its rating bisection
    //  brackets, and a design below the floor is refused rather than answered.
    const note = prose(step(2).note!);
    expect(note).toContain("grows without bound");
    expect(note).toContain("refused by name");
    expect(ENGINE_CPP).toContain("thermodynamic floor of an evaporative tower");
    expect(ENGINE_CPP).toMatch(/diverging at the\s+\/\/\s+wet-bulb floor|Me\(T_out\) is monotone/);
  });

  it("quotes the witness's own wet bulb, and quotes it correctly", () => {
    //  ~19.9 °C against a 25 °C dry bulb: the several kelvin a student loses
    //  by reading the wrong thermometer.  Recomputed from the golden, so the
    //  prose cannot drift from the case it describes.
    const tWbC = kelvinToC(golden("T_wb_in"));
    expect(tWbC.toFixed(1)).toBe("19.9");
    expect(prose(step(2).note!)).toContain("19.9 °C");
    expect(prose(step(2).note!)).toContain("25 °C dry bulb");
  });
});

describe("range belongs to the process, not to the tower", () => {
  it("prints the sensible-heat balance that fixes it", () => {
    const s3 = step(3);
    expect(s3.formula).toContain("Q = L · cp_L · range");
    expect(s3.formula).toContain("range = T_water,in − T_water,out");
    //  The operating line's slope is where L/G enters the diagram.
    expect(s3.formula).toContain("(L·cp_L / G)");
  });

  it("names the engine's two spec modes and the either/or between them", () => {
    const note = prose(step(3).note!);
    expect(note).toContain("RATING");
    expect(note).toContain("DESIGN");
    expect(note).toContain("exactly one may be declared");
    expect(ENGINE_CPP).toContain("specify EXACTLY ONE of");
    //  And the pinch, with the engine's own remedy rather than a vague one.
    expect(note).toContain("PINCHED");
    expect(ENGINE_CPP).toContain("PINCHED at L/G");
  });
});

describe("the Merkel integral, printed as the engine evaluates it", () => {
  it("carries cp_L inside the integral, not a bare dT", () => {
    //  The classical form the engine integrates is cp_L dT/(h* − h); a page
    //  printing ∫dT/(h* − h) would be quoting a different quantity from the
    //  one the KPI reports.
    const s4 = step(4);
    expect(s4.formula).toContain("Me = KaV/L");
    expect(s4.formula).toContain("cp_L dT / (h*(T) − h(T))");
    expect(s4.formula).toContain("[T_out → T_in]");
    expect(ENGINE_H).toContain("INT_{T_out}^{T_in}  cpL dT / (h*(T) - h(T))");
  });

  it("says the group does NOT separate Ka from V", () => {
    //  The limit a student will otherwise walk straight past: Me sizes
    //  nothing on its own.
    expect(prose(step(4).note!)).toContain("K, a and V never appear apart");
  });

  it("quotes the Chebyshev-4 agreement at the size it actually has", () => {
    //  ~4e-5 on the witness.  Recomputed from the golden through the tool's
    //  own helper, so the page cannot inflate a shortcut's error into drama
    //  nor hide a real one.
    const check = chebyshevDeviation({
      merkelNumber: golden("merkelNumber"),
      merkelNumber_chebyshev4: golden("merkelNumber_chebyshev4"),
    })!;
    expect(check.nearlyExact).toBe(true);
    expect(Math.round(check.relDeviation / 1e-5)).toBe(4);
    expect(prose(step(4).note!)).toContain("about 4e-5");
  });
});

describe("what Merkel assumes — the page states all of it, and only it", () => {
  it("names the three hypotheses the engine announces, plus the cp one", () => {
    const body = prose(step(5).body);
    expect(body).toContain("LEWIS FACTOR AS ONE");
    expect(body).toContain("WATER FLOW CONSTANT");
    expect(body).toContain("EXIT AIR IS SATURATED");
    expect(body).toContain("specific heats once, at mean temperatures");
    //  Each is the engine's own, read back out of the unit that computes the
    //  answer.  A hypothesis the page invents, or one the engine makes and
    //  the page drops, separates these.
    expect(ENGINE_H).toContain("Lewis factor = 1");
    expect(ENGINE_H).toContain("NEGLECTED");
    expect(ENGINE_H).toContain("exit air is assumed SATURATED");
    expect(ENGINE_H).toContain("evaluated once at the");
  });

  it("keeps the Lewis-factor claim inside the range the engine states", () => {
    //  "Near 1 for air-water" is a near-coincidence of one pair, and the
    //  number comes from the unit's own header, not from this page.
    expect(prose(step(5).body)).toContain("0.87");
    expect(ENGINE_H).toContain("0.87");
    expect(prose(limit("lewis-one").body)).toContain("0.87");
  });

  it("says the neglected evaporation is small AND not zero, at its real size", () => {
    const pct = golden("evaporation_pct_of_L");
    expect(pct.toFixed(1)).toBe("2.4");
    const note = prose(step(5).note!);
    expect(note).toContain("2.4 % of the water fed");
    expect(note).toContain("Small, and not zero");
    //  And the compensating half, which is what keeps this honest rather than
    //  alarming: the loss IS honoured at the boundary.
    expect(note).toContain("boundary mass balance is exact");
  });

  it("does not claim a comparison the engine cannot make", () => {
    //  Poppe's formulation is named as the thing Choupo does NOT implement;
    //  a page implying the comparison is available would be inventing it.
    expect(prose(step(5).note!)).toContain("Choupo implements Merkel only");
    expect(prose(step(5).note!)).toContain("comparison is not available here");
  });
});

describe("the limits carry the absences, each one checked against the engine", () => {
  it("keeps every limit id", () => {
    const ids = MERKEL_LIMITS.map((l) => l.id);
    for (const id of ["lewis-one", "constant-water-flow", "saturated-exit-air",
      "no-packing-model", "water-losses", "one-dimensional-counterflow"])
      expect(ids, `limit ${id} went missing`).toContain(id);
  });

  it("says KaV/L is DECLARED, not predicted — and the engine agrees", () => {
    const l = limit("no-packing-model");
    expect(l.title).toContain("DECLARED, not predicted");
    expect(prose(l.body)).toContain("no packing-characteristic correlation");
    //  The narrow, checkable half of that claim: the unit reads a Merkel
    //  number and a target temperature out of operation{}, and nothing about
    //  a fill, an area or a coefficient.  (It cannot prove no correlation
    //  exists anywhere in the tree; it fires the day this unit grows one.)
    const reads = [...ENGINE_CPP.matchAll(/lookupScalar\("([A-Za-z_]+)"/g)]
      .map((m) => m[1]);
    expect(reads).toContain("merkelNumber");
    for (const invented of ["Ka", "packingHeight", "fillArea", "area", "volume"])
      expect(reads, `the unit now reads ${invented}: the limit is stale`)
        .not.toContain(invented);
  });

  it("says fan power and pressure drop are absent — the cost of an approach", () => {
    //  The page tells the reader a tight approach is expensive; the thing it
    //  cannot price is exactly the fan and pump work.  Saying so is the
    //  difference between a caveat and a boast.
    const body = prose(limit("no-packing-model").body);
    expect(body).toContain("fan power");
    expect(body).toContain("pressure drop");
  });

  it("says make-up here is evaporation ALONE, and calls it a lower bound", () => {
    const l = limit("water-losses");
    expect(prose(l.title)).toContain("EVAPORATION only");
    const body = prose(l.body);
    expect(body).toContain("drift");
    expect(body).toContain("blowdown");
    expect(body).toContain("LOWER BOUND");
    //  The engine says the same thing in its own console line and its own
    //  comment; the page is repeating it, not inventing it.
    expect(ENGINE_CPP).toContain("drift/blowdown not modelled");
  });

  it("keeps the saturated-exit closure attached to the number it produces", () => {
    //  It is not a decoration: the evaporation, hence the make-up, is
    //  computed FROM that assumed exit state.
    expect(prose(limit("saturated-exit-air").body))
      .toContain("evaporation — hence the make-up — is computed from it");
  });

  it("names the geometry it never had: counter-current, 1-D, steady", () => {
    const body = prose(limit("one-dimensional-counterflow").body);
    expect(body).toContain("no crossflow tower");
    expect(body).toContain("no transients");
    //  Recirculation is the one that bites in the field, because it moves the
    //  wet bulb the tower actually sees — the floor of the whole page.
    expect(body).toContain("recirculation");
  });
});

describe("the tool renders it as a scrolling lesson", () => {
  it("scrolls, is centred, and is no longer a panel", () => {
    expect(SRC).toContain('overflowY: "auto"');
    expect(SRC).toContain("maxWidth: 940");
    //  Comments are not code: a header describing chrome the file no longer
    //  uses would otherwise read as the chrome itself.
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    expect(code).not.toContain("MethodSetupRail");
  });

  it("has ONE lesson renderer, used by BOTH branches", () => {
    //  The no-data branch is exactly where a reader has nothing else to read,
    //  so the explanation must survive there.  A second copy would be the
    //  same page maintained twice.
    expect((SRC.match(/const lessonStep = /g) ?? []).length).toBe(1);
    const guard = SRC.indexOf('if (mode === "current" && !active) {');
    expect(guard).toBeGreaterThan(0);
    expect(SRC.indexOf("const lessonStep = "),
      "the renderer is defined inside a branch").toBeLessThan(guard);
    const empty = SRC.slice(guard, SRC.indexOf("const nPoints = active"));
    expect(empty, "the empty state shows no lesson")
      .toContain("[1, 2, 3, 4, 5].map(lessonStep)");
    expect(empty, "the empty state drops the limits").toContain("{lessonLimits}");
  });

  it("renders the definitions BEFORE the diagram and the consequences AFTER", () => {
    //  The RENDER site, never a lazy import or a type name: the ordering
    //  claim is about where the reader meets each thing.
    const plot = SRC.indexOf("<MerkelDiagram");
    expect(plot).toBeGreaterThan(0);
    for (const n of [1, 2, 3, 4])
      expect(SRC.indexOf(`{lessonStep(${n})}`), `step ${n} is after the diagram`)
        .toBeLessThan(plot);
    expect(SRC.indexOf("{lessonStep(5)}"),
      "the assumptions step is before the diagram").toBeGreaterThan(plot);
    expect(SRC.lastIndexOf("{lessonLimits}"),
      "the limits are before the diagram").toBeGreaterThan(plot);
  });

  it("keeps the knobs beside the diagram, in a two-column grid", () => {
    expect(SRC).toContain('gridTemplateColumns: "minmax(200px, 240px) 1fr"');
    expect(SRC).toContain("{controls}");
  });

  it("still prints the engine's refusal VERBATIM", () => {
    //  A pinched L/G and a below-wet-bulb target are the two constructions
    //  that teach the most, and both arrive as the engine's own message.
    expect(SRC).toContain("{err}");
    expect(SRC).toContain('title="The engine did not solve this construction"');
  });

  it("keeps the quoted method hypotheses and the make-up qualifier on the page", () => {
    expect(SRC).toContain("{METHOD_HYPOTHESES}");
    //  The KPI line reports evaporation as the make-up; the qualifier that
    //  keeps that honest must be beside it, not only in the limits list.
    expect(prose(SRC)).toContain("drift and blowdown are not modelled");
  });

  it("renders the limits list from the data, not a second copy", () => {
    expect(SRC).toContain("MERKEL_LIMITS.map");
    expect((SRC.match(/MERKEL_LIMITS/g) ?? []).length).toBe(2);   // import + map
  });
});
