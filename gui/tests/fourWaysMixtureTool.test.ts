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
  "Four ways to price a mixture" -- the models lesson (owner's ask,
  2026-08-31: COSMO-SAC, PC-SAFT and the rest presented properly).  These
  pins hold: the witness is bundled with all four scan ops and the
  measured dataset, the AAD table draws the ENGINE's validation block (no
  page arithmetic), every quoted static number matches the golden it is
  quoted from (two homes pinned against each other), the COSMO-SAC card
  carries the synthetic-surrogate licence honesty, and PC-SAFT/COSMO-SAC
  are deliberately NOT AAD rows, with the reason on the page.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { tutorialByName } from "../src/cases/tutorials.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import {
  AAD_MODELS, MIXTURE_INTERROGATION, MIXTURE_WITNESS, MODEL_LADDER,
} from "../src/ui/methods/FourWaysMixtureTool.js";

const SRC = readFileSync(
  new URL("../src/ui/methods/FourWaysMixtureTool.tsx", import.meta.url),
  "utf-8");
const prose = (src: string): string => src.replace(/\s+/g, " ");

//  The goldens the page quotes static numbers from -- re-read here so the
//  page's copy is pinned against the file runTests re-verifies.
const ROOT = new URL("../../", import.meta.url);
const flash20 = readFileSync(new URL(
  "tutorials/steady/flash/flash20_ethanol_water_pcsaft/expected", ROOT),
  "utf-8");
const fitNRTL02 = readFileSync(new URL(
  "tutorials/steady/optimisation/fitNRTL02_thermoml_isobars/expected", ROOT),
  "utf-8");

describe("the registry entry", () => {
  it("is live, notes-kind, anchored to the PC-SAFT chapter", () => {
    const e = METHOD_TOOLS.find((m) => m.id === "four-ways-mixture");
    expect(e, "the tool left the registry").toBeTruthy();
    expect(e!.kind).toBe("notes");
    expect(e!.status).toBe("live");
    expect(e!.discipline).toBe("Thermodynamics");
    expect(e!.theory).toBe("ch:pcsaft");
    expect(e!.teaches).toContain("KNOW");
    expect(e!.teaches).toContain("PC-SAFT");
  });
});

describe("the witness reaches the browser", () => {
  it("is bundled with all four scans, the consistency op and the data", () => {
    const t = tutorialByName(MIXTURE_WITNESS);
    expect(t, `${MIXTURE_WITNESS} is not bundled — the page would show an `
      + "empty table").toBeTruthy();
    const props = t!.files.rawFiles!["system/propsDict"]!;
    for (const m of AAD_MODELS)
      expect(props, `${m.op} left the witness`).toContain(m.op);
    expect(props).toContain("vleConsistency");
    expect(props).toContain("etoh_water_1atm");
  });
});

describe("the static quotes match their goldens", () => {
  //  A number quoted in prose is a second home; each is pinned against
  //  the golden runTests re-verifies, so the two cannot drift apart.
  it("flash20's twin-flash K-values and V/F", () => {
    expect(flash20).toMatch(/flashNRTL\s+K_ethanol\s+3\.8955/);
    expect(flash20).toMatch(/flashPCSAFT\s+K_ethanol\s+11\.4711/);
    expect(flash20).toMatch(/flashNRTL\s+V_over_F\s+0\.5120/);
    expect(flash20).toMatch(/flashPCSAFT\s+V_over_F\s+0\.6489/);
    expect(prose(SRC)).toContain("K_ethanol = 3.90");
    expect(prose(SRC)).toContain("K_ethanol = 11.47");
    expect(prose(SRC)).toContain("V/F = 0.512");
    expect(prose(SRC)).toContain("V/F = 0.649");
  });

  it("fitNRTL02's held-out lesson", () => {
    expect(fitNRTL02).toMatch(/aad_heldout_K\s+0\.3857/);
    expect(fitNRTL02).toMatch(/score_catalogue_pair_at_101kPa aad\s+0\.0821/);
    expect(prose(SRC)).toContain("0.0821 K");
    expect(prose(SRC)).toContain("0.3857 K");
    expect(prose(SRC)).toContain("4.7");
  });
});

describe("the ladder's claims", () => {
  it("five rungs, each citing an engine surface or witness", () => {
    expect(MODEL_LADDER).toHaveLength(5);
    for (const m of MODEL_LADDER) {
      expect(m.cite, `${m.name} lost its citation`)
        .toMatch(/src\/|tutorials\/|cosmoSAC01|flash20/);
      expect(m.knows.length).toBeGreaterThan(10);
    }
  });

  it("COSMO-SAC carries the licence honesty, by name", () => {
    const cosmo = MODEL_LADDER.find((m) => m.name.includes("COSMO"))!;
    expect(cosmo.note).toContain("SYNTHETIC teaching surrogates");
    expect(cosmo.note).toContain("bin/choupo-import-cosmo");
    expect(cosmo.note).toContain("refuses");
  });

  it("PC-SAFT is an EoS with an association scheme, not an activity model", () => {
    const pcsaft = MODEL_LADDER.find((m) => m.name.includes("PC-SAFT"))!;
    expect(pcsaft.knows).toContain("association");
    expect(pcsaft.knows).toContain("2B");
    expect(prose(SRC)).toContain("Not an activity model");
  });

  it("the fitted rung teaches evidence scope, not superiority", () => {
    const fitted = MODEL_LADDER.find((m) => m.name.includes("NRTL"))!;
    expect(fitted.note).toContain("only "
      + "there");
    expect(fitted.note).toContain("not a law");
  });
});

describe("the honest absences", () => {
  it("PC-SAFT and COSMO-SAC are deliberately not AAD rows", () => {
    expect(AAD_MODELS.map((m) => m.op)).toEqual(
      ["txy_ideal", "txy_wilson", "txy_nrtl", "txy_unifac"]);
    expect(prose(SRC)).toContain("deliberately NOT rows");
    expect(prose(SRC)).toContain("A missing row is honest");
  });

  it("no page arithmetic on the score — the engine's validation block", () => {
    expect(prose(SRC)).toContain("engine’s own validation block");
    expect(prose(SRC)).toContain("computes nothing");
  });

  it("ends on the interrogation, five questions", () => {
    expect(MIXTURE_INTERROGATION).toHaveLength(5);
    const all = MIXTURE_INTERROGATION.join(" ").toLowerCase();
    for (const k of ["know", "evidence", "predictive", "gamma-phi", "measured"]) {
      expect(all, `the interrogation lost "${k}"`).toContain(k);
    }
  });

  it("hands off to mixingRules and the trust page", () => {
    expect(SRC).toContain("mixrules01_natural_gas");
    expect(SRC).toContain("When a property database lies to you");
  });
});
