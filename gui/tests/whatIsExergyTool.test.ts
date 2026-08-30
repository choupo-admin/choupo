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
  "What is exergy?" -- the price-tag page, built 2026-08-30 the same day
  the `exergy` bench op landed (citation-first: no page before its engine
  surface exists).  These pins hold: the re-addition of the engine's two
  published legs (the page's only physics beside one exact product), the
  witness being bundled with both rows, the declared-dead-state posture,
  the structural zero, Gouy-Stodola, and the honest absences -- chemical
  exergy refused BY THE ENGINE and merely reported here, no flowsheet
  exergy balance, no cycle material.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { tutorialByName } from "../src/cases/tutorials.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import {
  DEAD_P0_PA, DEAD_T0_K, EXERGY_INTERROGATION, EXERGY_META, EXERGY_WITNESS,
  lostWork, rebuildExergy,
} from "../src/ui/methods/WhatIsExergyTool.js";

const SRC = readFileSync(
  new URL("../src/ui/methods/WhatIsExergyTool.tsx", import.meta.url),
  "utf-8");
const prose = (src: string): string => src.replace(/\s+/g, " ");

describe("the registry entry", () => {
  it("is live, notes-kind, and teaches the declared dead state", () => {
    const e = METHOD_TOOLS.find((m) => m.id === "what-is-exergy");
    expect(e, "the tool left the registry").toBeTruthy();
    expect(e!.kind).toBe("notes");
    expect(e!.status).toBe("live");
    expect(e!.teaches).toContain("DECLARES");
    expect(e!.teaches).toContain("Gouy-Stodola");
  });
});

describe("the witness reaches the browser", () => {
  it("is bundled with BOTH rows: the state and the structural zero", () => {
    const t = tutorialByName(EXERGY_WITNESS);
    expect(t, `${EXERGY_WITNESS} is not bundled — the page would show an `
      + "empty table").toBeTruthy();
    const props = t!.files.rawFiles!["system/propsDict"]!;
    expect(props).toContain("name        b_state;");
    expect(props).toContain("name        b_dead;");
    expect(props).toContain("deadState");
  });

  it("the page's mirrored dead state matches the case dict", () => {
    const props = tutorialByName(EXERGY_WITNESS)!.files.rawFiles![
      "system/propsDict"]!;
    expect(props).toContain(`T0 ${DEAD_T0_K} K`);
    expect(props).toContain(`P0 ${DEAD_P0_PA / 1e5} bar`);
  });
});

describe("the arithmetic — a re-addition and one product", () => {
  it("rebuilds b from the witness golden's own legs", () => {
    //  The values the case's `expected` pins (re-verified against the
    //  engine on every runTests): dh − T0ds must land on b_physical.
    const lg = rebuildExergy({
      dh: 2987.32, T0ds: 850.601, b_physical: 2136.71,
    })!;
    expect(lg).toBeTruthy();
    expect(lg.rebuilt).toBeCloseTo(lg.b, 1);
    expect(lg.gap).toBeLessThan(5e-2);
  });

  it("returns null rather than a partial ledger", () => {
    expect(rebuildExergy({ dh: 1, T0ds: 0 })).toBeNull();
    expect(rebuildExergy(undefined)).toBeNull();
  });

  it("Gouy-Stodola is one exact product", () => {
    expect(lostWork(298.15, 1.0)).toBeCloseTo(298.15, 9);
    expect(lostWork(330, 2.5)).toBeCloseTo(825, 9);
  });
});

describe("the spine's order and claims", () => {
  it("intuition (same energy, different worth) before the boxed formula", () => {
    //  Pinned on the SECTION TITLES: the formula string also lives in the
    //  EXERGY_META constant declared above the JSX, so a bare indexOf on
    //  it would measure declaration order, not the page's.
    const iInt = SRC.indexOf("Same energy, different worth");
    const iDef = SRC.indexOf("The formula, and the declaration inside it");
    expect(iInt).toBeGreaterThan(0);
    expect(iDef).toBeGreaterThan(0);
    expect(iInt).toBeLessThan(iDef);
  });

  it("the dead state is a DECLARATION the engine refuses to assume", () => {
    expect(prose(SRC)).toContain("your environment is your fact");
    expect(prose(SRC)).toContain("refuses to run");
  });

  it("the zero is the RESTRICTED dead state's, and says so everywhere", () => {
    //  2026-08-31 review: (T0, P0, x) at the stream's own composition is
    //  the restricted (thermo-mechanical) dead state, not the complete
    //  environmental one -- claiming "indistinguishable from the
    //  environment" would silently zero a chemical exergy the op refuses.
    expect(prose(SRC)).toContain("restricted dead state");
    expect(prose(SRC)).toContain("composition held fixed");
    expect(SRC).not.toContain("indistinguishable from the environment");
    expect(prose(SRC)).toContain("maximum useful work");
    //  the exclusions are stated, not implied
    expect(prose(SRC)).toContain("kinetic");
    expect(prose(SRC)).toContain("potential");
  });

  it("the entropy leg is displayed at the engine's own sign", () => {
    //  The engine publishes T0*(s-s0) = +850.60 for the witness; showing
    //  -850.60 under that label mislabeled the quantity (the SIGNED
    //  contribution is negative, the quantity is not).
    expect(SRC).not.toContain("-lg.T0ds");
    expect(prose(SRC)).toContain("sign the engine publishes");
  });

  it("every claim carries a citation into the engine or the witness", () => {
    expect(EXERGY_META).toHaveLength(5);
    for (const m of EXERGY_META) {
      expect(m.cite, `${m.line} lost its citation`)
        .toMatch(/src\/|tutorials\//);
      expect(m.question.length).toBeGreaterThan(10);
    }
  });

  it("the structural zero and the datum-independence are both claimed", () => {
    expect(prose(SRC)).toContain("both legs exactly");
    expect(prose(SRC)).toContain("datum-independence");
    expect(prose(SRC)).toContain("all drop out");
  });

  it("datum-independent is NOT model-independent, and the page says so", () => {
    expect(prose(SRC)).toContain("not model-independent");
    //  the overclaim the 2026-08-31 review caught, gone for good
    expect(prose(SRC)).not.toContain("compared across thermodynamic models");
    //  the mixing-line cancellation stays, said precisely: it is the
    //  IDEAL line, composition-only -- exact at fixed composition
    expect(prose(SRC)).toContain("ideal-mixing line");
  });

  it("Gouy-Stodola names the machines' own KPI, on the adiabatic basis", () => {
    expect(SRC).toContain("dS_gen");
    expect(SRC).toContain("IsentropicCore.cpp");
    expect(prose(SRC)).toContain("T0 times the entropy generated");
    //  the equivalence stream-Δs = generation holds for the ADIABATIC
    //  contract and must not be generalised to units with heat transfer
    expect(prose(SRC).toLowerCase()).toContain("adiabatic");
    //  energy units, not pseudo-monetary ones
    expect(SRC).not.toContain("money-units");
    //  the slider's claim holds s_gen fixed, explicitly
    expect(prose(SRC)).toContain("FIXED entropy generation");
  });

  it("ends on the interrogation, five questions", () => {
    expect(EXERGY_INTERROGATION).toHaveLength(5);
    const all = EXERGY_INTERROGATION.join(" ").toLowerCase();
    for (const k of ["dead state", "chemical", "destroyed", "datum", "zero"]) {
      expect(all, `the interrogation lost "${k}"`).toContain(k);
    }
  });
});

describe("the honest absences", () => {
  it("chemical exergy is reported as the ENGINE's refusal, not taught", () => {
    //  The op refuses `chemical true;` naming the standard-environment
    //  model it would need; the page reports that refusal and teaches no
    //  chemical-exergy formula.
    expect(prose(SRC)).toMatch(/CHEMICAL exergy[^.]*refuses/);
    expect(prose(SRC)).toContain("Szargut");
    expect(SRC).not.toContain("b_ch");
  });

  it("no flowsheet exergy balance is claimed, as a STATUS, not a law", () => {
    //  2026-08-31 review: "streams carry no entropy column" is an
    //  implementation trace, not the thermodynamic reason -- the honest
    //  statement is what is not implemented and what a real ledger needs.
    expect(prose(SRC)).toContain("no audited flowsheet-wide exergy balance");
    expect(prose(SRC)).toContain("entropy-generation terms");
    expect(SRC).toContain("docs/design/entropy-glass-box-trace.md");
  });

  it("no cycle material — one page, one mental model", () => {
    expect(SRC).not.toContain("Carnot");
    expect(SRC).not.toContain("Rankine cycle");
  });
});
