/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  Model applicability (Explorer, 2026-11-25).  The defect: picking
  tertButylbenzene with UNIFAC ended in "[stderr] *** choupoProps fatal error:
  UNIFAC: component(s) tertButylbenzene have no group decomposition, so UNIFAC
  cannot price them." and nothing to do next.

  Two behaviours are held:
    1. a model that cannot price the chosen set is DISABLED with its reason in
       one line, and the model that runs is the nearest that can, said aloud;
    2. when the engine refuses anyway, the sentence comes back in plain words,
       with what to do next and the one model that would run, the engine's own
       text kept verbatim.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { CATALOGUE, metaByName } from "../src/case/catalogue.js";
import { hasPair } from "../src/case/pairsCatalogue.js";
import {
  ACTIVITY_MODELS, activityVerdict, chooseActivity, chooseEos, chooseTransport, eosVerdict, refusalAdvice, transportVerdict,
  type ApplicabilityCtx,
} from "../src/case/modelApplicability.js";

/** A catalogue-free context: only `bare` has no groups, no Tc/Pc and no Vliq. */
const ctx: ApplicabilityCtx = {
  metaOf: (c) => (c === "bare" ? { name: c } as never : { name: c, tc: 500, pc: 30, vliq: 1e-4 } as never),
  hasUnifac: (c) => c !== "bare",
  hasPair: (model, a, b) => model === "NRTL" && a !== "bare" && b !== "bare",
};

const REAL: ApplicabilityCtx = {
  metaOf: (c) => metaByName(c, CATALOGUE),
  hasUnifac: (c) => metaByName(c, CATALOGUE)?.hasUnifac ?? false,
  hasPair,
};

describe("a model that cannot price the set is disabled with its reason", () => {
  it("UNIFAC names the component without groups, in one line", () => {
    const v = activityVerdict("UNIFAC", ["toluene", "bare"], ctx);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("no UNIFAC groups for bare");
    expect(v.reason).not.toMatch(/\n/);
  });
  it("ideal always prices; NRTL names the pair; Wilson names the volume; SRK/PR name Tc, Pc", () => {
    expect(activityVerdict("ideal", ["bare", "bare2"], ctx).ok).toBe(true);
    expect(activityVerdict("NRTL", ["bare", "toluene"], ctx).reason).toBe("no curated NRTL pair for bare–toluene");
    expect(activityVerdict("Wilson", ["bare", "toluene"], ctx).reason).toBe("no liquid molar volume (Vliq) for bare");
    expect(eosVerdict("PR", ["bare"], ctx).reason).toBe("no critical constants (Tc, Pc) for bare");
    expect(eosVerdict("idealGas", ["bare"], ctx).ok).toBe(true);
  });
  it("the default falls to a model that can, and SAYS which", () => {
    const c = chooseActivity("UNIFAC", ["toluene", "bare"], ctx);
    expect(c.changed).toBe(true);
    expect(c.model).toBe("ideal");   // NRTL has no pair with `bare`, Wilson has no Vliq for it
    expect(c.note).toMatch(/UNIFAC cannot price this set \(no UNIFAC groups for bare\); running ideal mixing instead\./);
    const same = chooseActivity("UNIFAC", ["toluene", "benzene"], ctx);
    expect(same).toEqual({ model: "UNIFAC", changed: false, note: null });
    expect(chooseEos("SRK", ["bare"], ctx).model).toBe("idealGas");
  });
  it("on the real catalogue every disabled model carries a reason and an enabled one does not", () => {
    for (const set of [["water", "ethanol"], ["tertButylbenzene", "water"], ["tertButylbenzene", "toluene"]]) {
      for (const m of ACTIVITY_MODELS) {
        const v = activityVerdict(m, set, REAL);
        expect(v.ok === (v.reason === undefined), `${m} ${set}`).toBe(true);
      }
      expect(chooseActivity("UNIFAC", set, REAL).model).toBeTruthy();
    }
  });
  it("the verdict agrees with the record for EVERY catalogue component (UNIFAC iff it carries groups)", () => {
    for (const m of CATALOGUE) {
      const v = activityVerdict("UNIFAC", [m.name], REAL);
      expect(v.ok, m.name).toBe(m.hasUnifac);
    }
  });
});

describe("the liquid-transport correlations are offered by what the record holds", () => {
  const tctx: ApplicabilityCtx = {
    ...ctx,
    metaOf: (c) => ({ name: c, tc: 500, tb: 350,
      viscForms: c === "ANDRADE_ONLY" ? ["andrade"] : c === "none" ? [] : ["chemsepEq101"],
      condForms: ["chemsepEq16"] }) as never,
  };
  it("Andrade is off for a chemsepEq101 record, with the reason; chemsepEq101 is on", () => {
    expect(transportVerdict("viscosity_liquid", "Andrade", ["water"], tctx).reason).toBe("no andrade coefficients in the record of water");
    expect(transportVerdict("viscosity_liquid", "chemsepEq101", ["water"], tctx).ok).toBe(true);
    expect(transportVerdict("thermal_conductivity_liquid", "chemsepEq16", ["water"], tctx).ok).toBe(true);
  });
  it("the pick moves to the first model every selected record can answer, and says so", () => {
    const c = chooseTransport("viscosity_liquid", "Andrade", ["water", "ethanol"], tctx);
    expect(c).toEqual({ model: "chemsepEq101", changed: true,
      note: "Andrade cannot answer for this set (no andrade coefficients in the record of water, ethanol); running chemsepEq101 instead." });
    expect(chooseTransport("viscosity_liquid", "chemsepEq101", ["water"], tctx).changed).toBe(false);
    expect(chooseTransport("viscosity_liquid", "Andrade", ["none"], tctx).changed).toBe(false);   // none can: the engine's refusal is explained instead
  });
  it("on the real catalogue: a record's own form is the form its verdict accepts", () => {
    for (const m of CATALOGUE.slice(0, 200)) {
      for (const f of m.viscForms ?? []) {
        const model = f === "andrade" ? "Andrade" : f === "vogel" ? "Vogel" : f;
        expect(transportVerdict("viscosity_liquid", model, [m.name], REAL).ok, `${m.name} ${f}`).toBe(true);
      }
    }
  });
});

describe("a refusal comes back with what it means, what to do next and one click", () => {
  const stderr = "[stderr] *** choupoProps fatal error: UNIFAC: component(s) bare have no group decomposition, so UNIFAC cannot price them.";
  const state = { activity: "UNIFAC", eos: "idealGas", comps: ["toluene", "bare"] };

  it("UNIFAC without groups: plain words, next step, the model that would run, raw kept", () => {
    const a = refusalAdvice(`choupoProps did not finish: ${stderr}`, state, ctx);
    expect(a.plain).toMatch(/UNIFAC prices a liquid from the molecular groups.*bare has no group decomposition/);
    expect(a.next).toMatch(/Run ideal mixing instead/);
    expect(a.tryActivity).toBe("ideal");
    expect(a.raw).toContain("[stderr] *** choupoProps fatal error: UNIFAC: component(s) bare");
  });
  it("NRTL pair, Wilson volume, cubic constants and the unregistered conductivity model", () => {
    const n = refusalAdvice("NRTL: the case declares NRTL, but 1 binary pair(s) have no parameters and would therefore run as IDEAL: bare-toluene (x)",
      { activity: "NRTL", eos: "idealGas", comps: ["toluene", "bare"] }, ctx);
    expect(n.plain).toMatch(/none is curated for bare-toluene/);
    expect(n.tryActivity).toBeDefined();
    const w = refusalAdvice("Wilson: component 'bare' has Vliq <= 0 -- add 'Vliq' to its data/components/*.dat",
      { activity: "Wilson", eos: "idealGas", comps: ["bare"] }, ctx);
    expect(w.plain).toMatch(/liquid molar volume/);
    const e = refusalAdvice("PR: component 'bare' is missing Tc or Pc", { activity: "ideal", eos: "PR", comps: ["bare"] }, ctx);
    expect(e.tryEos).toBe("idealGas");
    const l = refusalAdvice("LiquidConductivityModel: unknown model 'Latini'.  Registered: SatoRiedel chemsepEq16 satoRiedel",
      state, ctx);
    expect(l.next).toBe("Pick SatoRiedel.");
  });
  it("an unforeseen sentence is passed on, never swallowed", () => {
    const a = refusalAdvice("*** choupoProps fatal error: something nobody foresaw", state, ctx);
    expect(a.plain).toBe("something nobody foresaw");
    expect(a.raw).toContain("nobody foresaw");
    expect(refusalAdvice("", state, ctx).plain).toBe("The engine stopped without giving a reason.");
  });
});
