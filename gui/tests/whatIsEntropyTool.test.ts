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
  "What is entropy?" -- the ledger page, built 2026-08-30 AFTER the engine
  trace (docs/design/entropy-glass-box-trace.md) and the ratified spine.
  These pins hold: the ledger arithmetic (the page's ONLY physics -- two
  exact formulas plus a re-addition of engine numbers), the witness being
  bundled, the spine's order, the honest absences the ruling demanded, and
  the PC-SAFT convention divergence staying MARKED rather than silently
  fixed or silently dropped.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { tutorialByName } from "../src/cases/tutorials.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import {
  ENTROPY_WITNESS, INTERROGATION, LEDGER_META, R_GAS,
  WITNESS_P_PA, WITNESS_T_K, WITNESS_Y,
  minSeparationWork, mixingLine, pressureLine, rebuildLedger,
} from "../src/ui/methods/WhatIsEntropyTool.js";

const SRC = readFileSync(
  new URL("../src/ui/methods/WhatIsEntropyTool.tsx", import.meta.url),
  "utf-8");
const prose = (src: string): string => src.replace(/\s+/g, " ");

describe("the registry entry", () => {
  it("is live, is of the notes kind, and teaches the ledger", () => {
    const e = METHOD_TOOLS.find((m) => m.id === "what-is-entropy");
    expect(e, "the tool left the registry").toBeTruthy();
    expect(e!.kind).toBe("notes");
    expect(e!.status).toBe("live");
    expect(e!.teaches).toContain("LEDGER");
  });
});

describe("the witness reaches the browser", () => {
  it("is in the bundled corpus with the ledger op", () => {
    const t = tutorialByName(ENTROPY_WITNESS);
    expect(t, `${ENTROPY_WITNESS} is not bundled — the page would show an `
      + "empty ledger").toBeTruthy();
    const props = t!.files.rawFiles!["system/propsDict"]!;
    expect(props).toContain("name        ledger;");
    for (const k of ["s_ig_N2", "s_ig_O2", "S_ig", "S_R", "S_real"]) {
      expect(props, `the witness stopped publishing ${k}`).toContain(k);
    }
  });

  it("the page's mirrored state matches the case dict", () => {
    const props = tutorialByName(ENTROPY_WITNESS)!.files.rawFiles![
      "system/propsDict"]!;
    expect(props).toContain(`T            ${WITNESS_T_K} K`);
    expect(props).toContain(`P            ${WITNESS_P_PA / 1e5} bar`);
    expect(props).toContain(`N2 ${WITNESS_Y.N2}`);
    expect(props).toContain(`O2 ${WITNESS_Y.O2}`);
  });
});

describe("the ledger arithmetic — the page's only physics", () => {
  it("carries the engine's own R to the digit", () => {
    //  src/core/Constants.H:47.  A rounded R here would open a gap between
    //  the page's re-addition and the engine's total.
    expect(R_GAS).toBe(8.314462618);
  });

  it("mixing line: exact at 50/50 (R ln 2) and at the witness composition", () => {
    expect(mixingLine([0.5, 0.5])).toBeCloseTo(R_GAS * Math.log(2), 9);
    expect(mixingLine([0.79, 0.21])).toBeCloseTo(4.2729, 3);
    expect(mixingLine([1.0, 0.0])).toBe(0);
  });

  it("pressure line: −R ln 2 at the witness 2 bar", () => {
    expect(pressureLine(2.0e5)).toBeCloseTo(-R_GAS * Math.log(2), 9);
    expect(pressureLine(1.0e5)).toBe(-0);
  });

  it("minimum separation work is T times the mixing line", () => {
    expect(minSeparationWork(400, [0.5, 0.5]))
      .toBeCloseTo(400 * R_GAS * Math.log(2), 6);
  });

  it("rebuilds the WITNESS golden's own numbers to the engine's S_ig", () => {
    //  The values pinned in the case's `expected` (the suite re-verifies
    //  them against the engine on every run): the page's re-addition must
    //  land on the engine's assembled S_ig within round-off of the
    //  published 4-decimal diagnostics.
    const lg = rebuildLedger({
      s_ig_N2: 200.1887, s_ig_O2: 213.8979,
      S_ig: 201.5778, S_R: -0.0192, S_real: 201.5586,
    })!;
    expect(lg).toBeTruthy();
    expect(lg.rebuilt).toBeCloseTo(lg.S_ig, 3);
    expect(lg.gap).toBeLessThan(1e-3);
    expect(lg.pure).toBeCloseTo(0.79 * 200.1887 + 0.21 * 213.8979, 6);
    expect(lg.S_real).toBeCloseTo(lg.S_ig + lg.S_R, 6);
  });

  it("returns null rather than a partial ledger when a key is missing", () => {
    expect(rebuildLedger({ S_ig: 1, S_R: 0, S_real: 1 })).toBeNull();
    expect(rebuildLedger(undefined)).toBeNull();
  });
});

describe("the spine's order and claims", () => {
  it("intuition (mixed, never unmixed) before the boxed definition", () => {
    const iMix = SRC.indexOf("never unmix by themselves");
    const iDef = SRC.indexOf("dS = δq_rev / T");
    expect(iMix).toBeGreaterThan(0);
    expect(iDef).toBeGreaterThan(0);
    expect(iMix).toBeLessThan(iDef);
  });

  it("the datum contrast: s_298 measured, the enthalpy datum a convention", () => {
    expect(prose(SRC)).toContain("third law");
    expect(prose(SRC)).toContain("a calorimeter can MEASURE");
    expect(prose(SRC)).toContain("an agreement, not a measurement");
  });

  it("every ledger line carries a citation into the engine", () => {
    expect(LEDGER_META).toHaveLength(5);
    for (const m of LEDGER_META) {
      expect(m.cite, `${m.line} lost its citation`).toMatch(/src\/|data\//);
      expect(m.question.length).toBeGreaterThan(10);
    }
  });

  it("the seven-names line explains why grepping 'entropy' fails", () => {
    expect(prose(SRC)).toContain(
      "s_298 → s_formation → s_pure_ig → S_ig → S_residual → S_real");
  });

  it("the machine witness names dS_gen and the cancellation", () => {
    expect(SRC).toContain("dS_gen");
    expect(prose(SRC)).toContain("cancel in the difference");
    expect(SRC).toContain("IsentropicCore.cpp");
  });

  it("ends on the interrogation, five questions", () => {
    expect(INTERROGATION).toHaveLength(5);
    expect(INTERROGATION[0]).toContain("datum");
    const all = INTERROGATION.join(" ").toLowerCase();
    for (const k of ["residual", "reference pressure", "cancel"]) {
      expect(all, `the interrogation lost "${k}"`).toContain(k);
    }
  });
});

describe("the honest absences and the marked divergence", () => {
  it("no Carnot, no exergy teaching, no Boltzmann formula", () => {
    //  Ruled out at the spine review: the page keeps ONE mental model.
    //  The molecular story gets one sentence, no equations.  "exergy" may
    //  appear EXACTLY once, inside the honest what-the-engine-does-NOT-
    //  carry sentence -- an absence stated is not material taught.
    expect(SRC).not.toContain("Carnot");
    const ex = SRC.match(/exergy/gi) ?? [];
    expect(ex).toHaveLength(1);
    expect(prose(SRC)).toMatch(/does NOT carry[^.]*exergy/);
    expect(SRC).not.toContain("k_B");
    expect(SRC).not.toContain("ln W");
    expect(SRC).not.toContain("ln Ω");
  });

  it("the PC-SAFT convention divergence stays MARKED", () => {
    //  The external review's explicit condition: documented, not silently
    //  fixed and not silently dropped.
    expect(prose(SRC)).toContain("(T,ρ) convention");
    expect(prose(SRC)).toContain("recorded divergence");
  });

  it("points at the trace record and states what the engine does NOT carry", () => {
    expect(SRC).toContain("docs/design/entropy-glass-box-trace.md");
    expect(prose(SRC)).toContain("wet-steam entropy");
  });
});
