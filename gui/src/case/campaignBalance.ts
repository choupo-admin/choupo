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

export interface CampaignBalanceView {
  /** kpis.campaign present at all (a batch/campaign run). */
  present: boolean;
  mass?: {
    initialKg: number;
    finalKg: number;
    externalOutKg: number;
    residualKg?: number;
    closureRel?: number;
  };
  /** Per-element relative closure; absent entirely = the engine WITHHELD
   *  the elemental claim (an unparseable formula) -- UNAVAILABLE state. */
  elements?: { symbol: string; closureRel: number }[];
  worstElementClosureRel?: number;
  /** energy_balance_available === 1; when false the engine refused the
   *  claim (named gaps in the log) and no energy numbers are shown. */
  energyAvailable: boolean;
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
  if (!campaign || campaign["mass_kg_initial"] === undefined
      || campaign["mass_kg_final"] === undefined)
    return { present: false, energyAvailable: false };

  const view: CampaignBalanceView = {
    present: true,
    mass: {
      initialKg: campaign["mass_kg_initial"]!,
      finalKg: campaign["mass_kg_final"]!,
      externalOutKg: campaign["mass_kg_external_out"] ?? 0,
      ...(campaign["mass_residual_kg"] !== undefined
        ? { residualKg: campaign["mass_residual_kg"] } : {}),
      ...(campaign["mass_closure_rel"] !== undefined
        ? { closureRel: campaign["mass_closure_rel"] } : {}),
    },
    energyAvailable: campaign["energy_balance_available"] === 1,
  };

  const elements = Object.keys(campaign)
    .map((k) => /^element_([A-Za-z]+)_closure_rel$/.exec(k))
    .filter((m): m is RegExpExecArray => m !== null && m[1] !== "worst")
    .map((m) => ({ symbol: m[1]!, closureRel: campaign[m[0]]! }));
  if (elements.length > 0) {
    view.elements = elements.sort((a, b) => a.symbol.localeCompare(b.symbol));
    if (campaign["element_worst_closure_rel"] !== undefined)
      view.worstElementClosureRel = campaign["element_worst_closure_rel"];
  }

  if (view.energyAvailable) {
    view.energy = {
      dHVesselsKJ: campaign["energy_dH_vessels_kJ"] ?? 0,
      qLedgerKJ: campaign["energy_Q_ledger_kJ"] ?? 0,
      hExternalKJ: campaign["energy_H_external_kJ"] ?? 0,
      ...(campaign["energy_closure_rel"] !== undefined
        ? { closureRel: campaign["energy_closure_rel"] } : {}),
    };
  }
  return view;
}
