/*---------------------------------------------------------------------------*\
  campaignBalance tests -- the pure projection of the engine-owned batch
  campaign KPIs into the display model.  The three Codex-ratified states:
  closed vessel, external outlet, and the honest UNAVAILABLE refusals
  (elements withheld / energy refused are STATES, never zeros).
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { campaignBalanceView } from "../src/case/campaignBalance.js";

describe("campaignBalanceView", () => {
  it("closed batch: M0 = Mf, elements + energy closed (recipe01 shape)", () => {
    const v = campaignBalanceView({
      mass_kg_initial: 0.9816, mass_kg_final: 0.9816,
      mass_kg_external_out: 0, mass_closure_rel: 2.3e-16,
      mass_residual_kg: 2.2e-16,
      element_C_closure_rel: 1.1e-15, element_H_closure_rel: 1.0e-15,
      element_O_closure_rel: 1.1e-15, element_worst_closure_rel: 1.1e-15,
      energy_balance_available: 1,
      energy_dH_vessels_kJ: 5839.9, energy_Q_ledger_kJ: -149.26,
      energy_H_external_kJ: -5989.16, energy_closure_rel: 6.0e-16,
    });
    expect(v.present).toBe(true);
    expect(v.mass?.initialKg).toBeCloseTo(0.9816, 6);
    expect(v.mass?.externalOutKg).toBe(0);
    expect(v.elements?.map((e) => e.symbol)).toEqual(["C", "H", "O"]);
    expect(v.worstElementClosureRel).toBeCloseTo(1.1e-15, 20);
    expect(v.energyState).toBe("available");
    // The engine's first-law identity carries through verbatim:
    // dH(vessels) = Q(ledger) - H(external out).
    expect(v.energy!.dHVesselsKJ)
      .toBeCloseTo(v.energy!.qLedgerKJ - v.energy!.hExternalKJ, 6);
  });

  it("external outlet: M0 = Mf + Mout (the discharge is IN the balance)", () => {
    const v = campaignBalanceView({
      mass_kg_initial: 2.0, mass_kg_final: 1.25, mass_kg_external_out: 0.75,
      mass_closure_rel: 1e-15, energy_balance_available: 0,
    });
    expect(v.mass!.initialKg)
      .toBeCloseTo(v.mass!.finalKg + v.mass!.externalOutKg, 12);
  });

  it("refusals are STATES: elements withheld and energy unavailable never fabricate zeros", () => {
    const v = campaignBalanceView({
      mass_kg_initial: 1.0, mass_kg_final: 1.0, mass_kg_external_out: 0,
      energy_balance_available: 0,
      // no element_* keys: the engine withheld the elemental claim
    });
    expect(v.elements).toBeUndefined();       // UNAVAILABLE, not []
    expect(v.energyState).toBe("refused");
    expect(v.energy).toBeUndefined();         // no numbers to draw
  });

  it("no campaign block at all (a steady run)", () => {
    expect(campaignBalanceView(undefined).present).toBe(false);
  });

  it("CAUSAL: element_balance_partial = 1 is an independent PARTIAL state"
     + " -- series kept, no full-closure stamp", () => {
    const v = campaignBalanceView({
      mass_kg_initial: 1.0, mass_kg_final: 1.0, mass_kg_external_out: 0,
      element_C_closure_rel: 2e-4, element_H_closure_rel: 1e-4,
      element_worst_closure_rel: 2e-4,
      element_balance_partial: 1,
      energy_balance_available: 0,
    });
    expect(v.elements?.map((e) => e.symbol)).toEqual(["C", "H"]);
    expect(v.elementsPartial).toBe(true);   // shown, but never a green seal
  });

  it("CAUSAL: available flag with a missing energy term is MALFORMED, not zeros", () => {
    const v = campaignBalanceView({
      mass_kg_initial: 1.0, mass_kg_final: 1.0, mass_kg_external_out: 0,
      energy_balance_available: 1,
      energy_dH_vessels_kJ: 5839.9, energy_Q_ledger_kJ: -149.26,
      // energy_H_external_kJ ABSENT -- a truncated payload
    });
    expect(v.energyState).toBe("malformed");
    expect(v.energy).toBeUndefined();          // no false identity to draw
    expect(v.malformed).toContain("energy_H_external_kJ");
  });

  it("CAUSAL: a missing mass_kg_external_out is MALFORMED, never a closed campaign", () => {
    const v = campaignBalanceView({
      mass_kg_initial: 2.0, mass_kg_final: 1.25,
      // mass_kg_external_out ABSENT: the C++ contract always emits it
    });
    expect(v.present).toBe(true);
    expect(v.mass).toBeUndefined();
    expect(v.malformed).toContain("mass_kg_external_out");
  });
});
