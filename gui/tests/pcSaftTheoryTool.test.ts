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
  "PC-SAFT, derived" had no test until 2026-09-28, when an external review
  found three false claims on it and the owner's standing instruction put
  its equations into KaTeX.  These pins hold the corrections (each checked
  against PCSAFT.cpp or the flash20 golden), the derivation's closure from
  the Helmholtz surface to the properties, and every equation parsing.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { PCSAFT_STEPS } from "../src/ui/methods/PcSaftTheoryTool.js";
import { texParses } from "../src/ui/methods/lessonTex.js";

const SRC = readFileSync(
  new URL("../src/ui/methods/PcSaftTheoryTool.tsx", import.meta.url), "utf-8");
const UNIFAC = readFileSync(
  new URL("../src/ui/methods/UnifacTheoryTool.tsx", import.meta.url), "utf-8");
const FLASH20 = readFileSync(new URL(
  "../../tutorials/steady/flash/flash20_ethanol_water_pcsaft/expected",
  import.meta.url), "utf-8");
const prose = (s: string): string => s.replace(/\s+/g, " ");
const BODY = SRC.slice(SRC.indexOf("export function PcSaftTheoryTool"));
const STEPS = PCSAFT_STEPS.map((s) =>
  [s.body, s.after ?? "", s.assumes].join(" ")).join(" ");

describe("the registry entry", () => {
  it("is live and no longer says an activity model cannot express it", () => {
    const e = METHOD_TOOLS.find((m) => m.id === "pcsaft-theory")!;
    expect(e.status).toBe("live");
    expect(e.teaches).not.toContain("which no activity model on this shelf can express");
    expect(e.teaches).toContain("Henry");
  });
});

describe("the claims an external review caught, checked against the engine", () => {
  it("a supercritical component is NOT beyond every activity-model approach", () => {
    expect(prose(STEPS)).not.toContain("cannot even express");
    expect(prose(STEPS)).toContain("Henry's law");
  });

  it("a missing UNIFAC pair is athermal, not an ideal mixture — here and on the UNIFAC page", () => {
    expect(prose(BODY)).not.toContain("throw away <em>the entire interaction</em>");
    expect(prose(BODY)).toContain("the combinatorial term and every other group pair stay");
    expect(UNIFAC).not.toContain("Two models fall back to ideal");
    expect(prose(UNIFAC)).toContain("the mixture does not become ideal");
  });

  it("flash20 is quoted from its golden, not as 'a few per cent'", () => {
    expect(prose(BODY)).not.toContain("only a few per cent");
    const kpi = (unit: string, key: string): number => {
      const m = FLASH20.match(new RegExp(`kpi\\s+${unit}\\s+${key}\\s+(\\S+)`));
      return Number(m![1]);
    };
    //  the numbers the page prints are the golden's, to the digits printed
    expect(kpi("flashPCSAFT", "V_over_F").toFixed(3)).toBe("0.649");
    expect(kpi("flashNRTL", "V_over_F").toFixed(3)).toBe("0.512");
    expect(kpi("flashPCSAFT", "K_ethanol").toFixed(2)).toBe("11.47");
    expect(kpi("flashNRTL", "K_ethanol").toFixed(3)).toBe("3.896");
    expect(kpi("flashPCSAFT", "K_water").toFixed(3)).toBe("0.581");
    expect(kpi("flashNRTL", "K_water").toFixed(3)).toBe("0.602");
    for (const s of ["V/F = 0.649", "0.512", "K_{\\mathrm{ethanol}} = 11.47",
      "3.896", "0.581", "0.602"]) expect(SRC).toContain(s);
    expect(prose(BODY)).toContain("not a measurement at this state");
  });

  it("does not claim the engine refuses a mismatched scheme (it cannot)", () => {
    expect(prose(BODY)).not.toContain("the engine refuses a profile whose declared scheme");
    expect(prose(BODY)).toContain("a known scheme paired with the wrong numbers runs");
  });
});

describe("the derivation closes, from the surface to the properties", () => {
  it("defines the reduced Helmholtz energy and the NUMBER density", () => {
    expect(SRC).toContain("\\\\tilde a \\\\equiv \\\\frac{A^{\\\\mathrm{res}}}{NkT}");
    expect(prose(STEPS)).toContain("is the NUMBER density");
    expect(SRC).not.toContain("a_res / NkT");
  });

  it("writes out both dispersion averages with the energy reduced by kT", () => {
    const disp = PCSAFT_STEPS.find((s) => s.n === 4)!;
    const eq2 = (disp.eq2 ?? []).join(" ");
    expect(eq2).toContain("\\overline{m^2 \\varepsilon \\sigma^3} = \\sum_i \\sum_j");
    expect(eq2).toContain("\\left(\\frac{\\varepsilon_{ij}}{kT}\\right)^{\\!2}");
    expect(eq2).toContain("(1 - k_{ij})");
  });

  it("closes association from X to a_assoc", () => {
    const assoc = PCSAFT_STEPS.find((s) => s.n === 5)!;
    expect((assoc.eq2 ?? []).join(" ")).toContain(
      "\\ln X^A_i - \\frac{X^A_i}{2}");
  });

  it("derives Z, P and ln phi, and says two roots are not an equilibrium", () => {
    const s6 = PCSAFT_STEPS.find((s) => s.n === 6)!;
    const eq = (s6.eq ?? []).join(" ");
    expect(eq).toContain("Z = 1 + \\rho");
    expect(eq).toContain("P = \\rho\\, k T\\, Z");
    expect(eq).toContain("\\ln \\varphi_i");
    expect(prose(s6.after!)).toContain("Two roots are two CANDIDATE phases");
    expect(prose(s6.after!)).toContain("mechanically unstable");
  });

  it("every citation names PCSAFT.cpp", () => {
    for (const s of PCSAFT_STEPS) expect(s.cites).toContain("PCSAFT.cpp:");
  });
});

describe("checks and mathematics", () => {
  it("four check questions, the review's three among them", () => {
    expect(BODY.match(/<Check\b/g) ?? []).toHaveLength(4);
    for (const q of ["switch the attraction", "the same fit",
      "is its mixture equilibrium validated"]) {
      expect(prose(BODY)).toContain(q);
    }
  });

  it("every equation and inline symbol parses under the lessons' KaTeX", () => {
    const tex: string[] = [...SRC.matchAll(/<M t="([^"]+)"/g)].map((m) => m[1]!);
    for (const s of PCSAFT_STEPS) {
      tex.push(...(s.eq ?? []), ...(s.eq2 ?? []));
      for (const t of [s.body, s.after ?? "", s.assumes]) {
        const parts = t.split("$");
        expect(parts.length % 2, `unbalanced $ in step ${s.n}`).toBe(1);
        for (let i = 1; i < parts.length; i += 2) tex.push(parts[i]!);
      }
    }
    expect(tex.length).toBeGreaterThan(40);
    for (const t of tex) expect(texParses(t), `does not parse: ${t}`).toBe(true);
    expect(SRC).not.toContain('ff="monospace" style={{ whiteSpace: "pre-wrap" }}');
  });
});
