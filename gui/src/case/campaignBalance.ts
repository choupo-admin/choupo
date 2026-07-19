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
-------------------------------------------------------------------------------
  campaignBalance -- the PURE projection of the engine-owned batch campaign
  KPIs (`kpis.campaign`) into the display model the CampaignBalancePlot
  renders.  NO physics here: no enthalpy, no formula parsing, no integrals
  -- the numbers are the engine's ledger verbatim, and an engine refusal
  (elements withheld, energy unavailable) stays a REFUSAL in the model,
  never a fabricated zero.
\*---------------------------------------------------------------------------*/

export type EnergyState = "available" | "refused" | "malformed";

export interface CampaignBalanceView {
  /** kpis.campaign present at all (a batch/campaign run). */
  present: boolean;
  /** Required keys that are missing/non-finite in a payload that claims
   *  them (truncated payload, stale WASM, engine regression).  A malformed
   *  claim is NEVER completed with fabricated zeros -- the affected panel
   *  refuses and names the field. */
  malformed?: string[];
  mass?: {
    initialKg: number;
    finalKg: number;
    externalOutKg: number;
    residualKg?: number;
    closureRel?: number;
  };
  /** INFORMATIVE molar totals (engine-emitted): total moles are NOT a
   *  conserved quantity in a reacting campaign -- no closure is claimed. */
  moles?: { initialKmol: number; finalKmol: number; externalOutKmol: number };
  /** Per-element relative closure; absent entirely = the engine WITHHELD
   *  the elemental claim (an unparseable formula) -- UNAVAILABLE state. */
  elements?: { symbol: string; closureRel: number }[];
  /** Engine-declared element_balance_partial = 1: the declared elements are
   *  shown, but no complete elemental closure is stamped. */
  elementsPartial: boolean;
  worstElementClosureRel?: number;
  /** "available" = engine claimed AND every term is finite;
   *  "refused"   = energy_balance_available = 0 (named gaps in the log);
   *  "malformed" = the flag says 1 but a required term is missing. */
  energyState: EnergyState;
  energy?: {
    dHVesselsKJ: number;
    qLedgerKJ: number;
    hExternalKJ: number;
    closureRel?: number;
  };
}

export function campaignBalanceView(
  campaign: { [k: string]: number } | undefined,
): CampaignBalanceView {
  const fin = (k: string): boolean =>
    campaign !== undefined && Number.isFinite(campaign[k]);
  if (!campaign || (!fin("mass_kg_initial") && !fin("mass_kg_final")))
    return { present: false, elementsPartial: false, energyState: "refused" };

  const view: CampaignBalanceView = { present: true, elementsPartial: false,
                                      energyState: "refused" };
  const malformed: string[] = [];

  // The C++ contract emits ALL THREE mass terms; a missing one is a
  // malformed payload, never a silently-closed campaign.
  if (fin("mass_kg_initial") && fin("mass_kg_final")
      && fin("mass_kg_external_out"))
  {
    view.mass = {
      initialKg: campaign["mass_kg_initial"]!,
      finalKg: campaign["mass_kg_final"]!,
      externalOutKg: campaign["mass_kg_external_out"]!,
      ...(fin("mass_residual_kg")
        ? { residualKg: campaign["mass_residual_kg"] } : {}),
      ...(fin("mass_closure_rel")
        ? { closureRel: campaign["mass_closure_rel"] } : {}),
    };
  }
  else
  {
    for (const k of ["mass_kg_initial", "mass_kg_final",
                     "mass_kg_external_out"])
      if (!fin(k)) malformed.push(k);
  }

  if (fin("moles_kmol_initial") && fin("moles_kmol_final")
      && fin("moles_kmol_external_out")) {
    view.moles = {
      initialKmol: campaign["moles_kmol_initial"]!,
      finalKmol: campaign["moles_kmol_final"]!,
      externalOutKmol: campaign["moles_kmol_external_out"]!,
    };
  }

  const elements = Object.keys(campaign)
    .map((k) => /^element_([A-Za-z]+)_closure_rel$/.exec(k))
    .filter((m): m is RegExpExecArray =>
      m !== null && m[1] !== "worst" && Number.isFinite(campaign[m[0]]))
    .map((m) => ({ symbol: m[1]!, closureRel: campaign[m[0]]! }));
  if (elements.length > 0) {
    view.elements = elements.sort((a, b) => a.symbol.localeCompare(b.symbol));
    view.elementsPartial = campaign["element_balance_partial"] === 1;
    if (campaign["element_worst_closure_rel"] !== undefined)
      view.worstElementClosureRel = campaign["element_worst_closure_rel"];
  }

  if (campaign["energy_balance_available"] === 1) {
    // Availability claims the FULL, finite term set -- a truncated payload
    // must not draw a false first-law identity out of fabricated zeros.
    if (fin("energy_dH_vessels_kJ") && fin("energy_Q_ledger_kJ")
        && fin("energy_H_external_kJ"))
    {
      view.energyState = "available";
      view.energy = {
        dHVesselsKJ: campaign["energy_dH_vessels_kJ"]!,
        qLedgerKJ: campaign["energy_Q_ledger_kJ"]!,
        hExternalKJ: campaign["energy_H_external_kJ"]!,
        ...(fin("energy_closure_rel")
          ? { closureRel: campaign["energy_closure_rel"] } : {}),
      };
    }
    else
    {
      view.energyState = "malformed";
      for (const k of ["energy_dH_vessels_kJ", "energy_Q_ledger_kJ",
                       "energy_H_external_kJ"])
        if (!fin(k)) malformed.push(k);
    }
  }
  if (malformed.length > 0) view.malformed = malformed;
  return view;
}
