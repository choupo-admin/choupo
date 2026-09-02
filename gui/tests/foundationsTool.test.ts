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
  "The four laws: accepted, then tested" -- the first page of the
  thermodynamics shelf.  These pins hold: that it IS first; that it carries
  no physics of its own (the source is read for the tokens that would mean
  it did); that both witnesses are bundled and publish what the page reads;
  that the readers refuse a partial result rather than inventing a row; that
  the honest absence (no per-unit S_gen) is on the page and the Sommerfeld
  line stays an attribution; and that every formula's symbols are glossed.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { tutorialByName } from "../src/cases/tutorials.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import {
  CYCLE_WITNESS, EXERGY_OP, EXERGY_WITNESS, INTERROGATION, LIMITS, STEPS,
  TURBINE_UNIT, readCycle, readExergy,
} from "../src/ui/methods/FoundationsTool.js";

const SRC = readFileSync(
  new URL("../src/ui/methods/FoundationsTool.tsx", import.meta.url), "utf-8");
const THEORY = readFileSync(
  new URL("../../docs/theoryGuide.tex", import.meta.url), "utf-8");
const prose = (s: string): string => s.replace(/\s+/g, " ");

describe("the registry entry", () => {
  it("is live, of the notes kind, and FIRST on the thermodynamics shelf", () => {
    const e = METHOD_TOOLS.find((m) => m.id === "foundations");
    expect(e, "the tool left the registry").toBeTruthy();
    expect(e!.kind).toBe("notes");
    expect(e!.status).toBe("live");
    expect(e!.teaches).toContain("FAILED ATTEMPT TO VIOLATE");
    //  The six pages that presuppose it come after it, in registry order --
    //  a student who opens the shelf meets the laws before the concepts.
    const thermo = METHOD_TOOLS.filter((m) => m.discipline === "Thermodynamics");
    expect(thermo[0]!.id).toBe("foundations");
  });

  it("anchors at ch:foundations, and the chapter exists in the guide", () => {
    const e = METHOD_TOOLS.find((m) => m.id === "foundations")!;
    expect(e.theory).toBe("ch:foundations");
    expect(THEORY).toContain("\\label{ch:foundations}");
    //  and the chapter is about the laws, not merely labelled so
    expect(THEORY).toContain("The four laws: accepted, then tested");
    expect(THEORY).toContain("summary of every failed attempt");
  });
});

describe("zero physics in TypeScript", () => {
  it("the page computes nothing: no log/exp/pow, no ** operator", () => {
    //  The formulas are TEXT in the lesson steps; the numbers are engine
    //  KPIs and diagnostics; the only arithmetic is a re-addition the page
    //  names as its own (case/balances.ts, the Streams summary's helper).
    expect(SRC).not.toMatch(/Math\.(log|exp|pow|sqrt)/);
    expect(SRC).not.toMatch(/[A-Za-z0-9_)\]]\s*\*\*\s*[-(0-9A-Za-z]/);
    expect(SRC).not.toMatch(/8\.314/);
  });
});

describe("the witnesses reach the browser", () => {
  it("the cycle case is bundled and carries the turbine by name", () => {
    const t = tutorialByName(CYCLE_WITNESS);
    expect(t, `${CYCLE_WITNESS} is not bundled -- the closure table would `
      + "never appear").toBeTruthy();
    const fs = t!.files.rawFiles!["system/flowsheetDict"]!;
    expect(fs).toContain(`name        ${TURBINE_UNIT};`);
    expect(fs).toContain("type        turbine;");
  });

  it("the exergy case is bundled and runs the op OFF the dead state", () => {
    const t = tutorialByName(EXERGY_WITNESS);
    expect(t, `${EXERGY_WITNESS} is not bundled`).toBeTruthy();
    const props = t!.files.rawFiles!["system/propsDict"]!;
    expect(props).toContain(`name        ${EXERGY_OP};`);
    expect(props).toContain("type        exergy;");
    //  the page finds the op by T != T0; the case must keep one such op
    expect(props).toContain("T            400 K");
    expect(props).toContain("T0 298.15 K");
  });
});

describe("the readers refuse a partial result", () => {
  it("readExergy rebuilds the golden's own legs, and b = dh - T0ds", () => {
    //  tutorials/props/molecular/exergy01_air_dead_state `expected`, op
    //  b_state: the two legs and their difference, as the engine published
    //  them.  The page prints these; this pins that the reader hands them
    //  through untouched and that the engine's own identity holds on them.
    const x = readExergy({ dh: 2987.32, T0ds: 850.601, b_physical: 2136.71,
      T: 400, T0: 298.15, P: 200000, P0: 100000 })!;
    expect(x).toBeTruthy();
    expect(x.dh).toBe(2987.32);
    expect(x.T0ds).toBe(850.601);
    //  The golden pins each of the three at FOUR significant decimals
    //  independently, so b and (dh - T0ds) may differ by the sum of two
    //  roundings: 2136.71 against 2136.719 is 0.009, and 0.05 is the honest
    //  band, not 0.005.
    expect(x.b).toBeCloseTo(x.dh - x.T0ds, 1);
  });

  it("readExergy returns null rather than a table with an invented leg", () => {
    expect(readExergy(undefined)).toBeNull();
    expect(readExergy({ dh: 1, b_physical: 1, T: 400, T0: 298.15 })).toBeNull();
  });

  it("readCycle returns null when the turbine did not publish dS_gen", () => {
    expect(readCycle(undefined, undefined, undefined)).toBeNull();
    expect(readCycle([], [], { steamTurbine: { eta_isen: 0.85 } })).toBeNull();
    expect(readCycle([], [], { boiler: { Q_kW: 1 } })).toBeNull();
  });

  it("readCycle hands the turbine's KPIs through untouched", () => {
    const c = readCycle([], [], {
      steamTurbine: { dS_gen: 1.234e-3, eta_isen: 0.85 },
    })!;
    expect(c.dSgen).toBe(1.234e-3);
    expect(c.etaIsen).toBe(0.85);
  });
});

describe("the lesson's spine", () => {
  it("runs curse -> postulate -> zeroth -> first -> second -> third -> seam -> tests", () => {
    expect(STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const titles = STEPS.map((s) => s.title.toLowerCase());
    expect(titles[0]).toContain("curse");
    expect(titles[1]).toContain("postulate");
    expect(titles[2]).toContain("zeroth");
    expect(titles[3]).toContain("first law");
    expect(titles[4]).toContain("second law");
    expect(titles[5]).toContain("third law");
    expect(titles[6]).toContain("seam");
    expect(titles[7]).toContain("tested");
  });

  it("every formula glosses its symbols, and the two laws carry a derivation", () => {
    for (const s of STEPS) {
      if (s.formula) {
        expect(s.where, `step ${s.n} has a formula and no gloss`).toBeTruthy();
        expect(s.where!.length).toBeGreaterThan(0);
      }
    }
    expect(STEPS[3]!.derivation!.length).toBeGreaterThan(0);
    expect(STEPS[4]!.derivation!.length).toBeGreaterThan(0);
  });

  it("the seam step reads the vapour-pressure road as kinds of statement", () => {
    const seam = STEPS[6]!;
    const text = (seam.body + " " + seam.derivation!.map((d) => d.step).join(" ")
      + " " + (seam.note ?? "")).toUpperCase();
    for (const k of ["DEDUCTION", "MODEL", "FIT", "DATA", "TEST"]) {
      expect(text, `the seam lost the kind "${k}"`).toContain(k);
    }
    //  the window quoted is the record's own, not a remembered one
    expect(text).toContain("TRANGE (287.7 354.07)");
  });

  it("Sommerfeld stays an ATTRIBUTION", () => {
    expect(prose(SRC)).toContain("He published no such sentence");
    expect(prose(SRC)).toContain("not a source");
  });

  it("the second law is stated as an inequality on S_gen, not on a system", () => {
    expect(prose(SRC)).toContain("‘Entropy always increases’ is wrong as stated");
    expect(STEPS[4]!.formula).toContain("≥ 0");
  });

  it("ends on the interrogation, five questions, the first about layers", () => {
    expect(INTERROGATION).toHaveLength(5);
    expect(INTERROGATION[0]!.toLowerCase()).toContain("layer");
  });
});

describe("the honest absence", () => {
  it("says no unit publishes its own entropy generation, and names the rewrite", () => {
    const l = LIMITS.find((x) => x.id === "no-unit-sgen")!;
    expect(l).toBeTruthy();
    expect(l.title).toContain("No unit operation publishes its own entropy generation");
    expect(l.body).toContain("this paragraph is the one to rewrite");
    //  the day a per-unit S_gen KPI ships, this pin is what fails first --
    //  and it should, because the page would then be lying
    expect(SRC).not.toContain("every unit publishes S_gen");
  });

  it("does not teach a mechanism: no Boltzmann formula, no microstate count", () => {
    expect(SRC).not.toContain("k_B");
    expect(SRC).not.toContain("ln W");
    expect(SRC).not.toContain("ln Ω");
  });
});
