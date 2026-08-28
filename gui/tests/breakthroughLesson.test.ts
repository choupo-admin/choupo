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
  The adsorption-breakthrough lesson.  Every ARITHMETIC claim the page makes
  about its own witness is RECOMPUTED here from the case's dicts and its
  golden KPIs -- never quoted -- so a page that drifted from the engine it
  explains would fail rather than mislead.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  BREAKTHROUGH_LIMITS, BREAKTHROUGH_STEPS,
} from "../src/ui/methods/breakthroughLesson.js";

const SRC = readFileSync(
  new URL("../src/ui/methods/BreakthroughTool.tsx", import.meta.url), "utf-8");

/** The tool's own witness, read from the repository tree (the GUI bundle's
 *  case glob does not reach the `expected` golden). */
const CASE = "../../tutorials/batch/adsorber/batch13_breakthrough_co2/";
const FLOWSHEET = readFileSync(
  new URL(CASE + "system/flowsheetDict", import.meta.url), "utf-8");
const GOLDEN = readFileSync(new URL(CASE + "expected", import.meta.url), "utf-8");

const prose = (s: string): string => s.replace(/\s+/g, " ");

/** One golden KPI of the `bed` unit, by key. */
function kpi(key: string): number {
  const m = new RegExp(`^kpi\\s+bed\\s+${key}\\s+(\\S+)`, "m").exec(GOLDEN);
  if (m === null) throw new Error(`golden has no KPI ${key}`);
  return Number(m[1]);
}

/** One declared scalar of the witness's `operation {}` block. */
function declared(key: string): number {
  const m = new RegExp(`^\\s+${key}\\s+(?:\\[[-0-9 ]+\\]\\s+)?([0-9.eE+-]+)`, "m")
    .exec(FLOWSHEET);
  if (m === null) throw new Error(`flowsheetDict declares no ${key}`);
  return Number(m[1]);
}

// ---------------------------------------------------------------------------

describe("the breakthrough lesson", () => {
  it("has five steps, numbered without a gap", () => {
    expect(BREAKTHROUGH_STEPS).toHaveLength(5);
    expect(BREAKTHROUGH_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5]);
  });

  it("opens on the thing that makes adsorption different: no steady state", () => {
    //  This is the first unsteady separation in the sequence, and a page that
    //  did not say so would read as one more staircase.
    const s1 = BREAKTHROUGH_STEPS[0]!;
    expect(prose(s1.body)).toContain("A fixed bed never does");
    expect(prose(s1.body)).toContain("HISTORY");
  });

  it("prints the two equations the unit actually integrates", () => {
    const s1 = BREAKTHROUGH_STEPS[0]!;
    //  The conservation equation and the LINEAR DRIVING FORCE beside it --
    //  the transport assumption, named where a reader meets the model.
    expect(s1.formula).toContain("ρ_b ∂q_i/∂t");
    expect(s1.formula).toContain("D_ax ∂²c_i/∂z²");
    expect(s1.formula).toContain("∂q_i/∂t = k_i · (q*_i − q_i)");
    expect(prose(s1.note!)).toContain("LINEAR DRIVING FORCE");
    expect(prose(s1.note!)).toContain("first-order upwind");
  });

  it("defines the mass-transfer zone and why it crawls", () => {
    const s2 = BREAKTHROUGH_STEPS.find((s) => s.n === 2)!;
    expect(prose(s2.body)).toContain("MASS-TRANSFER ZONE");
    expect(s2.formula).toContain("R_f  = ε + ρ_b · q*(c_in) / c_in");
    expect(s2.formula).toContain("u_zone = u / R_f");
    expect(s2.formula).toContain("t_st = (L / u) · R_f");
  });

  it("says the S-curve is the zone passing the exit, not a new object", () => {
    const s3 = BREAKTHROUGH_STEPS.find((s) => s.n === 3)!;
    expect(prose(s3.body)).toContain("picture of the ZONE itself");
    expect(prose(s3.body)).toContain("steepness IS the zone");
    expect(s3.formula).toContain("∫₀^∞ (1 − c_out/c_in) dt = t_st");
  });
});

describe("the design consequence — a switched bed is only partly used", () => {
  const s4 = BREAKTHROUGH_STEPS.find((s) => s.n === 4)!;

  it("states the consequence, both halves of it", () => {
    //  Downstream still clean, upstream saturated -- and the waste set by the
    //  WIDTH of the zone.  Either half alone is not the lesson.
    expect(prose(s4.body)).toContain("everything upstream of the zone is saturated");
    expect(prose(s4.body)).toContain("downstream is still clean");
    expect(prose(s4.body)).toContain("how WIDE the zone is");
    expect(s4.formula).toContain("LUB = L · (1 − t_b / t_st)");
  });

  it("says which way it goes: sharp usable, broad wasteful", () => {
    expect(prose(s4.note!)).toContain("A sharp zone means a bed you can use almost fully");
    expect(prose(s4.note!)).toContain("broad one means switching early");
  });

  it("its numbers are the engine's own, recomputed from the golden", () => {
    //  The page quotes t_b(5 %), t_st and the unused LENGTH.  Recomputed here
    //  from the witness's golden KPIs and declared bed length, so a page that
    //  drifted from its own case fails instead of teaching a stale number.
    const tb = kpi("t_breakthrough_5pct_CO2");
    const tst = kpi("t_stoichiometric_CO2");
    const L = declared("L");
    expect(Math.round(tb)).toBe(2891);
    expect(Math.round(tst)).toBe(3041);
    const lub = L * (1 - tb / tst);
    expect(lub).toBeGreaterThan(0.024);
    expect(lub).toBeLessThan(0.026);           // "some 2.5 cm"
    expect((1 - tb / tst) * 100).toBeCloseTo(4.93, 1);   // "about 5 %"
    for (const s of ["2891 s", "3041 s", "0.5 m bed", "2.5 cm", "5 %"])
      expect(prose(s4.note!), `the note lost ${s}`).toContain(s);
  });

  it("the retention factor and the announced front time agree with step 2", () => {
    //  t_st = (L/u) R_f is the page's formula; the engine publishes both, so
    //  the identity is checkable rather than asserted.
    const Rf = kpi("retention_factor_CO2");
    const tst = kpi("t_stoichiometric_CO2");
    expect((declared("L") / declared("u")) * Rf).toBeCloseTo(tst, 6);
    expect(Math.round(Rf)).toBe(304);
    expect(declared("L") / declared("u")).toBe(10);
    const s2 = BREAKTHROUGH_STEPS.find((s) => s.n === 2)!;
    expect(prose(s2.note!)).toContain("R_f ≈ 304");
    expect(prose(s2.note!)).toContain("L/u = 10 s");
    expect(prose(s2.note!)).toContain("3040 s");
  });
});

describe("what sharpens or broadens the zone, and the cyclic reality", () => {
  const s5 = BREAKTHROUGH_STEPS.find((s) => s.n === 5)!;

  it("names the isotherm as the self-sharpening mechanism, both directions", () => {
    expect(prose(s5.body)).toContain("FAVOURABLE isotherm");
    expect(prose(s5.body)).toContain("constant pattern");
    expect(prose(s5.body)).toContain("UNFAVOURABLE isotherm");
    expect(prose(s5.body)).toContain("spreads for the whole length of the bed");
  });

  it("names the two broadening mechanisms that do not care about the isotherm", () => {
    expect(prose(s5.body)).toContain("finite LDF coefficient");
    expect(prose(s5.body)).toContain("axial dispersion smears the front");
  });

  it("prints the isotherm the engine really uses — competitive, van't Hoff", () => {
    //  Adsorbent::loading is the extended (competitive) Langmuir with a shared
    //  site denominator, and LangmuirIsotherm::affinity is van't Hoff.  A page
    //  naming a plain single-species Langmuir would understate the engine.
    expect(s5.formula).toContain("q*_i = q_sat,i · b_i(T) · p_i / (1 + Σ_j b_j(T) · p_j)");
    expect(s5.formula).toContain("b(T) = b(T_ref) · exp[ −(ΔH_ads/R)(1/T − 1/T_ref) ]");
  });

  it("gets the sign of the temperature effect right", () => {
    //  dH_ads < 0 => b falls as T rises => the bed holds less => the front
    //  arrives sooner.  The witness record's own dH_ads pins the premise.
    const rec = readFileSync(new URL(
      CASE + "constant/parameters/adsorption/equilibria/zeolite13X/CO2.dat",
      import.meta.url), "utf-8");
    const dH = Number(/dH_ads\s+(-?[0-9.eE+-]+)/.exec(rec)![1]);
    expect(dH).toBeLessThan(0);
    expect(prose(s5.note!)).toContain("ΔH_ads is negative");
    expect(prose(s5.note!)).toContain("front arrives sooner");
  });

  it("says why breakthrough time is a commercial number: beds run in PAIRS", () => {
    expect(prose(s5.note!)).toContain("PAIRS");
    expect(prose(s5.note!)).toContain("breakthrough time IS the cycle time");
    //  And that this plot is the loading half only.
    expect(prose(s5.note!)).toContain("ONE loading step");
  });
});

describe("the honest half — every limit, and its arithmetic", () => {
  it("keeps every limit id", () => {
    const ids = BREAKTHROUGH_LIMITS.map((l) => l.id);
    for (const id of ["isothermal-witness", "constant-velocity",
      "single-adsorbate", "one-dimension", "mesh", "one-loading-step"])
      expect(ids, `limit ${id} went missing`).toContain(id);
    expect(new Set(ids).size).toBe(BREAKTHROUGH_LIMITS.length);
  });

  it("says the heat is absent from THIS run, not from the engine", () => {
    //  The engine carries adiabatic and wall-cooled beds; the witness declares
    //  neither.  Claiming the engine cannot do it would be the easier lie.
    const l = BREAKTHROUGH_LIMITS.find((x) => x.id === "isothermal-witness")!;
    expect(prose(l.body)).toContain("The engine does carry adiabatic and wall-cooled beds");
    expect(prose(l.body)).toContain("declaration");
    expect(FLOWSHEET).not.toContain("energyBalance");
    expect(declared("T")).toBe(298);
  });

  it("carries the constant-velocity price the engine itself announces", () => {
    const l = BREAKTHROUGH_LIMITS.find((x) => x.id === "constant-velocity")!;
    expect(kpi("carrier_fabricated_mol")).toBeCloseTo(9.19, 2);
    expect(kpi("physical_mass_closure_rel")).toBeCloseTo(0.108, 3);
    expect(prose(l.body)).toContain("9.19 mol");
    expect(prose(l.body)).toContain("physical_mass_closure_rel ≈ 0.108");
    //  And that the CO2 balance the curve is drawn from is NOT the damaged one.
    expect(Math.abs(kpi("mass_closure_CO2"))).toBeLessThan(1e-12);
    expect(prose(l.body)).toContain("closes at machine level");
  });

  it("does not claim competition is absent from the engine, only from the plot", () => {
    const l = BREAKTHROUGH_LIMITS.find((x) => x.id === "single-adsorbate")!;
    expect(prose(l.body)).toContain("competitive extended Langmuir");
    expect(prose(l.body)).toContain("no fixed-bed case in the corpus runs two adsorbing species");
    //  The witness really does declare one LDF coefficient, on CO2 alone.
    const ks = FLOWSHEET.slice(FLOWSHEET.indexOf("kLDF"))
      .match(/\[0 0 -1 0 0\]/g) ?? [];
    expect(ks).toHaveLength(1);
  });

  it("the mesh arithmetic is right, and recomputed from the case", () => {
    //  First-order upwind adds numerical dispersion of order u*dz/2.  The page
    //  claims it EXCEEDS the declared physical D_ax on this case; recomputed
    //  from the witness's own u, L, nCells and Dax.
    const u = declared("u"), L = declared("L"), n = declared("nCells");
    const dax = declared("Dax");
    const dNum = (u * (L / n)) / 2;
    expect(dNum).toBeCloseTo(1.25e-4, 10);
    expect(dNum).toBeGreaterThan(dax);
    const l = BREAKTHROUGH_LIMITS.find((x) => x.id === "mesh")!;
    expect(prose(l.body)).toContain("u·Δz/2");
    expect(prose(l.body)).toContain("1.25e-4 m²/s");
    expect(prose(l.body)).toContain("1e-4 m²/s");
    expect(prose(l.body)).toContain("at least as much spreading as the physics");
  });

  it("names channelling and the radial profile as 1-D casualties", () => {
    const l = BREAKTHROUGH_LIMITS.find((x) => x.id === "one-dimension")!;
    expect(prose(l.body)).toContain("channels gas past whole regions");
    expect(prose(l.body)).toContain("radial velocity and temperature profiles");
  });

  it("says a working bed does not start clean", () => {
    const l = BREAKTHROUGH_LIMITS.find((x) => x.id === "one-loading-step")!;
    expect(prose(l.body)).toContain("usable swing is smaller than q*");
    expect(prose(l.body)).toContain("shorter than the one drawn from a clean bed");
  });
});

describe("the tool renders it as a scrolling lesson", () => {
  it("scrolls and is no longer a panel", () => {
    expect(SRC).toContain('overflowY: "auto"');
    expect(SRC).toContain('style={{ maxWidth: 940, margin: "0 auto" }}');
    //  Comments are not code: a header describing chrome the file no longer
    //  uses must not decide this.
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    expect(code).not.toContain("MethodSetupRail");
  });

  it("has ONE lesson renderer, above BOTH returns", () => {
    expect((SRC.match(/const lessonStep = /g) ?? []).length).toBe(1);
    const guard = SRC.indexOf("if (view === null) {");
    expect(guard).toBeGreaterThan(0);
    expect(SRC.indexOf("const lessonStep = "),
      "the renderer is defined inside a branch").toBeLessThan(guard);
    const empty = SRC.slice(guard, SRC.lastIndexOf("  return ("));
    expect(empty, "the no-curve state shows no lesson")
      .toContain("[1, 2, 3, 4, 5].map(lessonStep)");
    expect(empty, "the no-curve state hides the limits").toContain("{lessonLimits}");
  });

  it("puts the definitions before the plot and the consequences after", () => {
    //  The RENDER site, not an import: the plot is where the reader's eye
    //  lands, and the ordering claim is about that point in the page.
    const plot = SRC.indexOf("<TrajectoryPlot");
    expect(plot).toBeGreaterThan(0);
    for (const n of [1, 2, 3, 4, 5])
      //  A step that is not rendered at all returns -1, which is LESS than
      //  the plot index -- so "before the plot" would pass on a missing step.
      //  Assert presence first, then position.
      expect(SRC.indexOf(`{lessonStep(${n})}`), `step ${n} is not rendered`)
        .toBeGreaterThan(0);
    for (const n of [1, 2, 3])
      expect(SRC.indexOf(`{lessonStep(${n})}`), `step ${n} is after the plot`)
        .toBeLessThan(plot);
    for (const n of [4, 5])
      expect(SRC.indexOf(`{lessonStep(${n})}`), `step ${n} is before the plot`)
        .toBeGreaterThan(plot);
    expect(SRC.lastIndexOf("{lessonLimits}")).toBeGreaterThan(plot);
    //  The knobs sit BESIDE the plot, in the two-column grid.
    expect(SRC).toContain('gridTemplateColumns: "minmax(200px, 240px) 1fr"');
  });

  it("keeps the engine's refusal verbatim, in ONE place", () => {
    //  A refusal is a teaching surface: never paraphrased, and never lost to
    //  a layout change.  It is hoisted like the lesson, so both branches show
    //  it and neither carries a second copy of the words.
    expect(SRC).toContain("its message, verbatim");
    expect(SRC).toContain("{err}");
    expect((SRC.match(/its message, verbatim/g) ?? []).length).toBe(1);
    expect((SRC.match(/\{refusal\}/g) ?? []).length).toBe(2);
  });

  it("keeps the normalisation provenance and the KPI glossary", () => {
    //  c_in is never invented; the caption says which anchor was used, and
    //  the table says what each engine number means.
    expect(SRC).toContain("{view.norm.caption}");
    expect(SRC).toContain("retention_factor: how many hold-up times");
    expect(SRC).toContain("c_out/c_in final: the late plateau");
  });

  it("renders every step's formula in a bordered monospace box", () => {
    expect(SRC).toContain('ff="monospace"');
    expect(SRC).toContain("borderLeft: \"3px solid var(--mantine-color-default-border)\"");
  });
});
