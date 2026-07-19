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
  CampaignBalancePlot -- the batch campaign's global balances, drawn
  DIRECTLY from the engine-owned `kpis.campaign` numbers (the ledger the
  C++ closes; docs/ai/energy.md).  The GUI computes NOTHING here -- no
  enthalpy, no formula parsing, no integrals; it renders exactly what the
  engine claimed, including the honest refusals:

    MASS      M_initial  vs  M_final + M_external_out   [kg]
              + residual / closure.
    ELEMENTS  per-element relative closure (kmol-atom conservation) --
              the true invariant of a reacting campaign.  When the engine
              withheld the claim (an unparseable formula), the state is
              UNAVAILABLE, never a fabricated zero.
    ENERGY    dH(vessels)  vs  Q(ledger) - H(external out)  [kJ]
              + residual / closure -- ONLY when the engine says
              energy_balance_available = 1; otherwise UNAVAILABLE with a
              pointer to the log's named gaps.
\*---------------------------------------------------------------------------*/

import { Badge, Group, Stack, Text } from "@mantine/core";

import { campaignBalanceView } from "../../case/campaignBalance.js";
import { Plot, PLOT_COLORS, PLOT_CONFIG, darkLayout } from "./plotly.js";

interface CampaignBalancePlotProps {
  campaign: { [k: string]: number };
}

const fmtSci = (v: number) => v.toExponential(2);
const fmtKg = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(1) : v.toPrecision(4));

export function CampaignBalancePlot({ campaign }: CampaignBalancePlotProps) {
  const view = campaignBalanceView(campaign);
  const m0 = view.mass?.initialKg;
  const mF = view.mass?.finalKg;
  const mOut = view.mass?.externalOutKg;
  const massClosure = view.mass?.closureRel;
  const massResidual = view.mass?.residualKg;

  const elements = (view.elements ?? []).map((e) => e.symbol);
  const elementsAvailable = view.elements !== undefined;
  const worstElement = view.worstElementClosureRel;

  const energyAvailable = view.energyState === "available";
  const dH = view.energy?.dHVesselsKJ;
  const qLedger = view.energy?.qLedgerKJ;
  const hExternal = view.energy?.hExternalKJ;
  const energyClosure = view.energy?.closureRel;

  if (!view.present) {
    return (
      <Stack align="center" justify="center" h="100%">
        <Text c="dimmed">This run carries no campaign balance KPIs.</Text>
      </Stack>
    );
  }
  if (view.mass === undefined || m0 === undefined || mF === undefined
      || mOut === undefined) {
    // A payload that names the campaign but misses a REQUIRED mass term is
    // MALFORMED -- never drawn as a silently-closed campaign.
    return (
      <Stack align="center" justify="center" h="100%">
        <Text c="orange" fw={600}>Campaign payload MALFORMED</Text>
        <Text c="dimmed" size="sm" ta="center" maw={420}>
          Required field(s) missing: {(view.malformed ?? []).join(", ")}.
          A stale WASM build or a truncated result block — re-run; nothing
          is drawn from fabricated zeros.
        </Text>
      </Stack>
    );
  }

  // ---- mass bars: INITIAL vs FINAL + EXTERNAL OUT -------------------------
  const massData = [
    {
      type: "bar" as const,
      name: "final inventory",
      x: ["INITIAL", "FINAL + OUT"],
      y: [null, mF] as (number | null)[],
      text: ["", `final<br>${fmtKg(mF)} kg`],
      textposition: "inside" as const,
      textfont: { size: 11, color: "#10242b" },
      marker: { color: PLOT_COLORS.series[0] },
      hovertemplate: "final inventory = %{y:.6g} kg<extra></extra>",
    },
    {
      type: "bar" as const,
      name: "external out",
      x: ["INITIAL", "FINAL + OUT"],
      y: [null, mOut] as (number | null)[],
      text: ["", mOut > 1e-12 ? `out<br>${fmtKg(mOut)} kg` : ""],
      textposition: "inside" as const,
      textfont: { size: 11, color: "#10242b" },
      marker: { color: PLOT_COLORS.series[1] },
      hovertemplate: "external out = %{y:.6g} kg<extra></extra>",
    },
    {
      type: "bar" as const,
      name: "initial charge",
      x: ["INITIAL", "FINAL + OUT"],
      y: [m0, null] as (number | null)[],
      text: [`initial<br>${fmtKg(m0)} kg`, ""],
      textposition: "inside" as const,
      textfont: { size: 11, color: "#10242b" },
      marker: { color: PLOT_COLORS.series[2] },
      hovertemplate: "initial charge = %{y:.6g} kg<extra></extra>",
    },
  ];

  // ---- element closure bars ----------------------------------------------
  const elementData = elementsAvailable
    ? [{
        type: "bar" as const,
        name: "closure",
        x: elements,
        y: elements.map((e) => campaign[`element_${e}_closure_rel`] ?? 0),
        marker: { color: PLOT_COLORS.series[3] },
        hovertemplate: "%{x}: |ΔN|/N = %{y:.3e}<extra></extra>",
      }]
    : [];

  // ---- energy bars: dH(vessels) vs Q - H_out ------------------------------
  const energyData = energyAvailable
    ? [
        {
          type: "bar" as const,
          name: "ΔH vessels",
          x: ["ΔH vessels", "Q − H_out"],
          y: [dH!, null] as (number | null)[],
          marker: { color: PLOT_COLORS.series[4] },
          hovertemplate: "ΔH vessels = %{y:.6g} kJ<extra></extra>",
        },
        {
          type: "bar" as const,
          name: "Q − H_out",
          x: ["ΔH vessels", "Q − H_out"],
          y: [null, qLedger! - hExternal!] as (number | null)[],
          marker: { color: PLOT_COLORS.series[5] },
          hovertemplate: "Q − H_out = %{y:.6g} kJ<extra></extra>",
        },
      ]
    : [];

  const smallPlot = (
    data: unknown[], title: string, yTitle: string,
  ) => (
    <Plot
      data={data as never}
      layout={{
        ...darkLayout,
        title: { text: title, font: { ...darkLayout.font, size: 12 } },
        barmode: "stack",
        bargap: 0.45,
        showlegend: false,
        margin: { l: 60, r: 12, t: 34, b: 28 },
        yaxis: {
          ...darkLayout.yaxis,
          title: { text: yTitle },
          exponentformat: "e" as const,
        },
        xaxis: { ...darkLayout.xaxis, title: { text: "" } },
      }}
      config={PLOT_CONFIG}
      style={{ width: "100%", height: "100%", minHeight: 0 }}
      useResizeHandler
    />
  );

  return (
    <Stack gap="xs" h="100%" style={{ minHeight: 0 }}>
      <Group gap="xs" wrap="wrap">
        <Badge variant="light" color={massClosure !== undefined && massClosure < 1e-6 ? "teal" : "yellow"}>
          mass closure {massClosure !== undefined ? fmtSci(massClosure) : "?"}
          {massResidual !== undefined ? ` (residual ${fmtSci(massResidual)} kg)` : ""}
        </Badge>
        {elementsAvailable ? (
          <Badge variant="light" color={worstElement !== undefined && worstElement < 1e-6 ? "teal" : "yellow"}>
            worst element closure {worstElement !== undefined ? fmtSci(worstElement) : "?"}
          </Badge>
        ) : (
          <Badge variant="light" color="gray">
            elements UNAVAILABLE — a formula withheld the claim (see the log)
          </Badge>
        )}
        {energyAvailable ? (
          <Badge variant="light" color={energyClosure !== undefined && energyClosure < 1e-6 ? "teal" : "yellow"}>
            energy closure {energyClosure !== undefined ? fmtSci(energyClosure) : "?"}
          </Badge>
        ) : view.energyState === "malformed" ? (
          <Badge variant="light" color="orange">
            energy MALFORMED — claimed available but missing: {(view.malformed ?? []).join(", ")}
          </Badge>
        ) : (
          <Badge variant="light" color="gray">
            energy UNAVAILABLE — the engine refused the claim (named gaps in the log)
          </Badge>
        )}
      </Group>
      <Group grow align="stretch" style={{ flex: 1, minHeight: 0 }}>
        {smallPlot(massData, "Mass — initial vs final + out", "mass (kg)")}
        {elementsAvailable
          ? smallPlot(elementData, "Element conservation |ΔN|/N", "relative closure")
          : (
            <Stack align="center" justify="center">
              <Text c="dimmed" size="sm" ta="center" maw={260}>
                Elemental balance UNAVAILABLE — the engine withheld the claim
                (an unparseable formula); the log names the species.
              </Text>
            </Stack>
          )}
        {energyAvailable
          ? smallPlot(energyData, "Energy — ΔH vessels vs Q − H_out", "energy (kJ)")
          : (
            <Stack align="center" justify="center">
              <Text c="dimmed" size="sm" ta="center" maw={260}>
                {view.energyState === "malformed"
                  ? "Energy claim MALFORMED — a required term is missing"
                    + " from the payload; nothing is drawn from fabricated"
                    + " zeros."
                  : "Energy balance UNAVAILABLE — the campaign ledger has"
                    + " missing pieces; the log lists each gap verbatim."
                    + "  Mass stays valid."}
              </Text>
            </Stack>
          )}
      </Group>
    </Stack>
  );
}
