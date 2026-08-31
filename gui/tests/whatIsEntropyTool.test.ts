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
    //  All eight from tutorials/props/molecular/entropy01_air_ledger's
    //  `expected`.  The three LINE keys joined the required set on
    //  2026-08-31, when the page stopped recomputing the mixing and
    //  pressure rows in TypeScript and started reading the ones the
    //  explainProperty op publishes -- which is what its caption always
    //  claimed.
    const lg = rebuildLedger({
      s_ig_N2: 200.1887, s_ig_O2: 213.8979,
      pure_line: 203.0676, mixing_line: 4.2733, pressure_line: -5.7631,
      S_ig: 201.5778, S_R: -0.0192, S_real: 201.5586,
    })!;
    expect(lg).toBeTruthy();
    expect(lg.rebuilt).toBeCloseTo(lg.S_ig, 3);
    expect(lg.gap).toBeLessThan(1e-3);
    //  This assertion got STRONGER on 2026-08-31 and its tolerance had to
    //  loosen for that reason.  It used to compare the page's own
    //  composition-weighted sum against itself (exact by construction);
    //  now the page reads the engine's published `pure_line`, so this
    //  compares TWO INDEPENDENTLY PUBLISHED engine numbers -- the assembled
    //  pure line against the per-component s_ig lines it was built from.
    //  They agree to 3.2e-5, which is round-off of the 4-decimal
    //  diagnostics, so the band is 4 decimals and not 6.
    expect(lg.pure).toBeCloseTo(0.79 * 200.1887 + 0.21 * 213.8979, 4);
    expect(lg.S_real).toBeCloseTo(lg.S_ig + lg.S_R, 6);
  });

  it("returns null rather than a partial ledger when a key is missing", () => {
    expect(rebuildLedger({ S_ig: 1, S_R: 0, S_real: 1 })).toBeNull();
    //  a run that publishes the totals but not the LINES is also partial:
    //  the page would otherwise have to invent two of its three rows
    expect(rebuildLedger({
      s_ig_N2: 200.1887, s_ig_O2: 213.8979,
      S_ig: 201.5778, S_R: -0.0192, S_real: 201.5586,
    })).toBeNull();
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

  it("the datum contrast: the ZEROS differ, the experiment is shared", () => {
    //  Tightened after the 2026-08-30 external review: dHf_298 VALUES are
    //  measured too (combustion calorimetry) -- what differs is the zero:
    //  the third law's absolute anchor vs the agreed elements convention.
    //  The old sharp line ("one column is convention; this one is
    //  experiment") taught something false about the enthalpy column.
    expect(prose(SRC)).toContain("third law");
    expect(prose(SRC)).toContain("DETERMINED calorimetrically");
    expect(prose(SRC)).toContain("both columns rest on experiment");
    expect(prose(SRC)).toContain("an agreed convention");
    expect(prose(SRC)).not.toContain("an agreement, not a measurement");
  });

  it("the second law is stated for an ISOLATED system, not any system", () => {
    //  A system's entropy can fall spontaneously by exporting entropy;
    //  what cannot happen is total decrease.  Same review round.
    expect(prose(SRC)).toContain("in an isolated system it cannot decrease");
    expect(prose(SRC)).not.toContain(
      "increases in every process that happens by itself");
  });

  it("the vaporisation leg names the standard states AND the coexistence limit", () => {
    //  The blocking item of the review: (ΔHvap − ΔG)/T without saying the
    //  298 K standard states are off-coexistence reads as a denial of
    //  ΔS = ΔHvap/T where that IS exact (Δg = 0 on the saturation curve).
    //  Pinned on the EVALUATED meta (the note is a concatenated literal in
    //  the source, so a source-text pin would miss it).
    const temp = LEDGER_META.find((m) => m.line.includes("Cp/T"))!;
    expect(temp.note).toContain("not in equilibrium with each other");
    expect(temp.note).toContain("collapses to the familiar ΔHvap/T");
  });

  it("the machines are declared adiabatic and the un-mixing floor ideal-gas", () => {
    expect(prose(SRC)).toContain("adiabatic");
    expect(prose(SRC)).toContain("products delivered at the same T and P");
  });

  it("every ledger line carries a citation into the engine", () => {
    expect(LEDGER_META).toHaveLength(5);
    for (const m of LEDGER_META) {
      expect(m.cite, `${m.line} lost its citation`).toMatch(/src\/|data\//);
      expect(m.question.length).toBeGreaterThan(10);
    }
  });

  it("the seven-names line lists SEVEN names (the review counted six)", () => {
    expect(prose(SRC)).toContain(
      "s_298 → s_formation → s_pure_ig → S_ig → S_residual → S_real"
      + " → dS_gen");
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
    //  The molecular story gets one sentence, no equations.
    //
    //  THIS PIN USED TO COUNT THE WORD -- "exergy" exactly once, inside the
    //  what-the-engine-does-NOT-carry sentence -- and the count was a proxy
    //  for the real rule, which is that the page must not TEACH exergy.
    //  The proxy broke on 2026-08-31 for the right reason: the `exergy` op
    //  had shipped the day before, so the absence sentence became FALSE and
    //  the honest replacement (what is carried, what is still refused)
    //  needs the word four times.  Re-pinned on the rule itself.
    expect(SRC).not.toContain("Carnot");
    expect(SRC.match(/exergy/gi) ?? []).not.toHaveLength(0);
    //  no exergy FORMULA and no dead-state material: that is the sibling
    //  page's whole subject, and one page keeps one mental model
    expect(SRC).not.toMatch(/b\s*=\s*\(h/);
    expect(SRC).not.toContain("dead state");
    expect(SRC).not.toContain("Gouy");
    //  and the mention must stay a STATUS sentence, not a lesson
    expect(prose(SRC)).toMatch(/CHEMICAL exergy/);
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
