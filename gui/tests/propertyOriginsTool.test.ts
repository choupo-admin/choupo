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
  "Where do properties come from?" -- the provenance page, built 2026-08-31
  on the owner's request (the estimation methods and the data each component
  carries, presented to students).  These pins hold: the page's mirrored
  reference values against the CASE DICT itself (two homes for a cited
  number must be pinned against each other), the error column being page
  arithmetic on the engine's published estimates, the anatomy citing engine
  surfaces, the uncited rows staying VISIBLE gaps, and the settled-
  architecture claims -- estimation is curation-time, never runtime, and
  unsourced must never become falsely sourced.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { tutorialByName } from "../src/cases/tutorials.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import {
  ANATOMY, ORIGIN_ROWS, ORIGINS_INTERROGATION, ORIGINS_WITNESS,
  pctError, REFERENCE, REFERENCE_SOURCE,
} from "../src/ui/methods/PropertyOriginsTool.js";

const SRC = readFileSync(
  new URL("../src/ui/methods/PropertyOriginsTool.tsx", import.meta.url),
  "utf-8");
const prose = (src: string): string => src.replace(/\s+/g, " ");

describe("the registry entry", () => {
  it("is live, notes-kind, on the Thermodynamics shelf", () => {
    const e = METHOD_TOOLS.find((m) => m.id === "property-origins");
    expect(e, "the tool left the registry").toBeTruthy();
    expect(e!.kind).toBe("notes");
    expect(e!.status).toBe("live");
    expect(e!.discipline).toBe("Thermodynamics");
    expect(e!.teaches).toContain("PROVENANCE");
    expect(e!.teaches).toContain("curation-time act");
  });
});

describe("the witness reaches the browser", () => {
  it("is bundled, estimates from groups, and cites its reference", () => {
    const t = tutorialByName(ORIGINS_WITNESS);
    expect(t, `${ORIGINS_WITNESS} is not bundled — the page would show an `
      + "empty table").toBeTruthy();
    const props = t!.files.rawFiles!["system/propsDict"]!;
    expect(props).toContain("type        estimateComponent;");
    expect(props).toContain("group CH3;");
    expect(props).toContain("group ketone;");
    expect(props).toContain("reference");
  });

  it("the page's mirrored reference values match the case dict", () => {
    //  REFERENCE is a second home for the case's own cited numbers; this
    //  pin is what keeps the two from drifting apart.  Whitespace in the
    //  dict is layout, so the comparison flattens it.
    const p = prose(tutorialByName(ORIGINS_WITNESS)!.files.rawFiles![
      "system/propsDict"]!);
    expect(p).toContain(`source "${REFERENCE_SOURCE}";`);
    expect(p).toContain(`Tb ${REFERENCE.Tb_K} K;`);
    expect(p).toContain(`Tc ${REFERENCE.Tc_K} K;`);
    expect(p).toContain(`Pc ${REFERENCE.Pc_bar.toFixed(1)} bar;`);
    expect(p).toContain(`omega ${REFERENCE.omega};`);
  });
});

describe("the arithmetic — a signed percentage and nothing else", () => {
  it("pctError is exact and signed", () => {
    expect(pctError(103, 100)).toBeCloseTo(3, 12);
    expect(pctError(97, 100)).toBeCloseTo(-3, 12);
    expect(pctError(47.0, 47.0)).toBe(0);
  });

  it("Joback's error on acetone's criticals is a couple of percent", () => {
    //  The estimates are the witness golden's own published diagnostics
    //  (re-verified against the engine on every runTests); the page prose
    //  claims "a couple of percent on the criticals" and this is that
    //  claim, computed the way the page computes it.
    expect(Math.abs(pctError(322.11, REFERENCE.Tb_K))).toBeLessThan(3);
    expect(Math.abs(pctError(500.56, REFERENCE.Tc_K))).toBeLessThan(3);
    expect(Math.abs(pctError(48.02, REFERENCE.Pc_bar))).toBeLessThan(3);
    expect(Math.abs(pctError(0.30, REFERENCE.omega))).toBeLessThan(3);
  });

  it("every cited row's ref is the REFERENCE constant, verbatim", () => {
    for (const r of ORIGIN_ROWS) {
      if (r.ref === null) continue;
      expect(r.ref, `${r.key} cites a number REFERENCE does not hold`)
        .toBe((REFERENCE as Record<string, number>)[r.key]);
    }
  });

  it("the uncited rows are a visible gap, not a silent omission", () => {
    const uncited = ORIGIN_ROWS.filter((r) => r.ref === null)
      .map((r) => r.key);
    expect(uncited).toEqual(["dHf_kJmol", "Hvap_kJmol", "Cp298"]);
    expect(prose(SRC)).toContain("a visible gap, not a hidden one");
  });

  it("the error column is declared as page arithmetic", () => {
    expect(prose(SRC)).toContain("computed on this page");
    expect(prose(SRC)).toContain("nothing can be arranged");
  });
});

describe("the spine's order and claims", () => {
  it("origins before the live estimate, anatomy before the questions", () => {
    const i1 = SRC.indexOf("Three origins, one file");
    const i2 = SRC.indexOf("Estimation, live");
    const i3 = SRC.indexOf("What each field feeds");
    const i4 = SRC.indexOf("Back to the number");
    expect(i1).toBeGreaterThan(0);
    expect(i2).toBeGreaterThan(i1);
    expect(i3).toBeGreaterThan(i2);
    expect(i4).toBeGreaterThan(i3);
  });

  it("every anatomy card cites an engine surface", () => {
    expect(ANATOMY).toHaveLength(7);
    for (const m of ANATOMY) {
      expect(m.cite, `${m.field} lost its citation`).toMatch(/src\//);
      expect(m.question.length).toBeGreaterThan(10);
    }
  });

  it("omega is taught as a parameter of a model", () => {
    expect(prose(SRC)).toContain("PARAMETER OF A MODEL");
  });

  it("Antoine is taught as fitted, with a window", () => {
    expect(prose(SRC)).toContain("FITTED, not measured");
    expect(prose(SRC)).toContain("declared window");
  });

  it("ends on the interrogation, five questions", () => {
    expect(ORIGINS_INTERROGATION).toHaveLength(5);
    const all = ORIGINS_INTERROGATION.join(" ").toLowerCase();
    for (const k of ["measured", "fitted", "estimated", "rung", "review"]) {
      expect(all, `the interrogation lost "${k}"`).toContain(k);
    }
  });
});

describe("the settled-architecture claims", () => {
  it("estimation is a curation-time act, never a runtime one", () => {
    expect(prose(SRC)).toContain("curation-time act, never a runtime one");
    expect(prose(SRC)).toContain("reads curated records");
  });

  it("unsourced must never become falsely sourced", () => {
    expect(prose(SRC)).toContain("unsourced must never become falsely sourced");
    expect(prose(SRC)).toContain("proposal file");
  });

  it("hands off to the trust page rather than duplicating it", () => {
    expect(SRC).toContain("When a property database lies to you");
    expect(prose(SRC)).toContain("SOURCES disagree");
  });
});
