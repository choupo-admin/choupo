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
  StreamsSummary -- the at-a-glance band at the top of the Streams workspace.

  This is where the global balances live now (they used to be bar charts
  defaulted in the Plots workspace -- a closure number buried in a chart
  title).  After any steady run it shows, read-only:

    - mass closure line  (IN / OUT / closure %, green tick or amber flag)
    - energy as a SIGNED Δ  (NOT "conserved" -- the gap is physical:
      utilities + heat of reaction)
    - a compact per-component IN / OUT / closure-% table
    - one duties row per column (Q_reboiler / Q_condenser + allocated
      utility + €/h), read from the same kpis + utilityAllocation the
      canvas duty stubs already use.

  All numbers come from case/balances.ts (the single source of truth shared
  with the demoted plots) and honour the TopBar Units menu.
\*---------------------------------------------------------------------------*/

import { Box, Group, Stack, Table, Text, Tooltip } from "@mantine/core";
import { IconCircleCheck, IconAlertTriangle, IconArrowsSplit2 } from "@tabler/icons-react";

import type { RunResult } from "../adapters/SolverAdapter.js";
import { massBalance, energyBalance, unitEnergy } from "../case/balances.js";
import {
  flowBasis,
  formatFlow,
  type FlowUnit,
} from "../state/displayUnits.js";

const MASS_TOL = 1e-3; // 0.1 % closure is "green"
const ENERGY_TOL = 1e-2; // 1 % first-law closure is "green" (H rounding-limited)
const MAX_BAND_ROWS = 4; // advisory / boundary rows shown; the rest -> "see Log"

/** Pick a mass unit for the summary: keep the user's if mass-basis, else the
 *  matching time scale in kg (the balance is intrinsically a mass balance). */
function massUnit(flow: FlowUnit): FlowUnit {
  if (flowBasis(flow) === "mass") return flow;
  return flow.endsWith("/h") ? "kg/h" : "kg/s";
}

interface DutyRow {
  unit: string;
  port: "reboiler" | "condenser";
  kW: number;
  utility?: string;
  eurH?: number;
}

function columnDuties(result: RunResult): DutyRow[] {
  const rows: DutyRow[] = [];
  const kpis = result.kpis ?? {};
  for (const [unit, k] of Object.entries(kpis)) {
    for (const port of ["reboiler", "condenser"] as const) {
      const key = port === "reboiler" ? "Q_reboiler_kW" : "Q_condenser_kW";
      const kW = k[key];
      if (typeof kW !== "number") continue;
      const alloc = result.utilityAllocation?.find(
        (a) => a.unit === unit && a.port === port,
      );
      rows.push({ unit, port, kW, utility: alloc?.utility, eurH: alloc?.eur_h });
    }
  }
  return rows;
}

export function StreamsSummary({
  result,
  flow,
}: {
  result: RunResult;
  flow: FlowUnit;
}) {
  const mb = massBalance(result.streams, result.componentMolarMass);
  // Energy balance now CLOSES: it counts the energy the units add (heat duties
  // + shaft work), not just the boundary-stream enthalpy.
  const { heatKw, workKw } = unitEnergy(result.utilityAllocation, result.kpis);
  const eb = energyBalance(result.streams, { heatKw, workKw });
  const u = massUnit(flow);
  const duties = columnDuties(result);

  const massOk = mb.closureErr < MASS_TOL;
  const closurePct = (mb.closureErr * 100).toFixed(mb.closureErr < 1e-4 ? 4 : 2);
  const energyOk = eb.skipped === 0 && eb.closureErr < ENERGY_TOL;
  const energyPct = (eb.closureErr * 100).toFixed(eb.closureErr < 1e-4 ? 4 : 2);

  // Per-component rows, biggest first; closure-% per component.
  const compRows = mb.visibleComponents
    .map((c) => {
      const ci = mb.inPerComp[c] ?? 0;
      const co = mb.outPerComp[c] ?? 0;
      const err = ci > 1e-15 ? Math.abs(ci - co) / ci : co > 1e-15 ? 1 : 0;
      return { c, ci, co, err };
    })
    .sort((a, b) => Math.max(b.ci, b.co) - Math.max(a.ci, a.co));

  return (
    <Box
      style={{
        padding: "8px 12px",
        borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
        background: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-8))",
      }}
    >
      {/* Solver advisories (bounds active at the solution, rating exceedances,
          auto-init) -- "no silent crutch" surfaced where a student reads the
          results, not buried in the Log. */}
      {result.advisories && result.advisories.length > 0 && (
        <Stack gap={2} mb={6}>
          <Text size="xs" fw={600} tt="uppercase" c="dimmed" style={{ letterSpacing: 0.4 }}>
            Solver advisories ({result.advisories.length})
          </Text>
          {result.advisories.slice(0, MAX_BAND_ROWS).map((a, i) => (
            <Group key={i} gap={6} align="baseline" wrap="nowrap">
              <IconAlertTriangle
                size={13}
                color={a.severity === "warning"
                  ? "var(--mantine-color-yellow-5)"
                  : "var(--mantine-color-blue-4)"}
                style={{ flexShrink: 0, transform: "translateY(2px)" }}
              />
              <Text size="xs" ff="monospace" c={a.severity === "warning" ? "yellow.4" : "dimmed"}>
                <Text span fw={600}>[{a.category}] {a.locus}:</Text> {a.message}
              </Text>
            </Group>
          ))}
          {result.advisories.length > MAX_BAND_ROWS && (
            <Text size="xs" ff="monospace" c="dimmed">
              +{result.advisories.length - MAX_BAND_ROWS} more — see Log
            </Text>
          )}
        </Stack>
      )}

      {/* Model-boundary audit: adjacent units on different thermo models.
          H is the conserved truth, T the model-dependent readout -- the enthalpy
          the two models disagree about, shown (held, never a silent T-nudge).
          A REFUSED boundary (speciation change -- a single ΔH would lie) is the
          hardest event the audit emits, so it takes the red register; routine
          ΔH rows take indigo (info) -- grape/purple is already taken on the
          canvas by the two-phase stroke + power stub.  Each number is guarded
          with an em-dash fallback: a payload missing a field must read
          "ΔH — kJ/mol", never a literal "undefined". */}
      {result.modelBoundaries && result.modelBoundaries.length > 0 && (() => {
        const boundaries = result.modelBoundaries!;
        const nRefused = boundaries.filter((b) => b.refused).length;
        return (
        <Stack gap={2} mb={6}>
          <Text size="xs" fw={600} tt="uppercase" c="dimmed" style={{ letterSpacing: 0.4 }}>
            Model boundaries ({boundaries.length}{nRefused > 0 ? ` · ${nRefused} refused` : ""})
          </Text>
          {boundaries.slice(0, MAX_BAND_ROWS).map((b, i) => (
            <Group key={i} gap={6} align="baseline" wrap="nowrap">
              <IconArrowsSplit2
                size={13}
                color={b.refused
                  ? "var(--mantine-color-red-6)"
                  : "var(--mantine-color-indigo-4)"}
                style={{ flexShrink: 0, transform: "translateY(2px)" }}
              />
              <Tooltip
                multiline
                w={290}
                label="A model boundary is not a physical device: H is the conserved truth, T the model-dependent readout — ΔH is what the two models disagree by at the stream's (T,P,z)."
              >
                <Text size="xs" ff="monospace" c={b.refused ? "red.5" : "dimmed"} style={{ cursor: "help" }}>
                  <Text span fw={600}>model boundary {b.producer}→{b.consumer} ({b.stream}):</Text>{" "}
                  {b.refused
                    ? <><Text span fw={700}>REFUSED</Text> — {b.reason ?? "speciation change"}</>
                    : `ΔH ${b.dH_kJ_per_mol?.toFixed(3) ?? "—"} kJ/mol (${b.dH_kW?.toFixed(2) ?? "—"} kW), implied ΔT ${b.implied_dT_K?.toFixed(2) ?? "—"} K`}
                </Text>
              </Tooltip>
            </Group>
          ))}
          {boundaries.length > MAX_BAND_ROWS && (
            <Text size="xs" ff="monospace" c="dimmed">
              +{boundaries.length - MAX_BAND_ROWS} more — see Log
            </Text>
          )}
        </Stack>
        );
      })()}

      <Group gap="xl" align="flex-start" wrap="wrap">
        {/* Mass closure */}
        <Stack gap={2}>
          <Group gap={6} align="center">
            {massOk ? (
              <IconCircleCheck size={15} color="var(--mantine-color-teal-5)" />
            ) : (
              <IconAlertTriangle size={15} color="var(--mantine-color-yellow-5)" />
            )}
            <Text size="xs" fw={600} tt="uppercase" c="dimmed" style={{ letterSpacing: 0.4 }}>
              Mass balance
            </Text>
          </Group>
          <Text size="sm" ff="monospace">
            in {formatFlow(mb.inSum, u)} · out {formatFlow(mb.outSum, u)} {u}
          </Text>
          <Text size="xs" c={massOk ? "teal.4" : "yellow.5"} ff="monospace">
            closure {closurePct} %
          </Text>
        </Stack>

        {/* Energy balance -- the FULL first law (streams + duties + work).  It
            CLOSES for a converged case: the duty a flash/heater/column/compressor
            adds is counted, not dropped. */}
        <Stack gap={2}>
          <Group gap={6} align="center">
            {energyOk ? (
              <IconCircleCheck size={15} color="var(--mantine-color-teal-5)" />
            ) : (
              <IconAlertTriangle size={15} color="var(--mantine-color-yellow-5)" />
            )}
            <Text size="xs" fw={600} tt="uppercase" c="dimmed" style={{ letterSpacing: 0.4 }}>
              Energy balance
            </Text>
          </Group>
          <Tooltip
            multiline
            w={290}
            label="First law over the plant boundary: feed enthalpy + heat duties (heating − cooling) + shaft work = product enthalpy. The duty is the energy a flash / heater / column / compressor adds; counting it is what closes the balance (a closed mass balance does NOT imply a closed energy balance unless the duties are included)."
          >
            <Text size="sm" ff="monospace" style={{ cursor: "help" }}>
              streams in {eb.inKw.toFixed(1)} · out {eb.outKw.toFixed(1)} kW
              {(Math.abs(heatKw) > 0.05 || Math.abs(workKw) > 0.05) && (
                <Text span size="sm" ff="monospace" c="dimmed">
                  {"  + "}
                  {Math.abs(heatKw) > 0.05 ? `heat ${heatKw >= 0 ? "+" : "−"}${Math.abs(heatKw).toFixed(1)}` : ""}
                  {Math.abs(workKw) > 0.05 ? `${Math.abs(heatKw) > 0.05 ? " · " : ""}work ${workKw >= 0 ? "+" : "−"}${Math.abs(workKw).toFixed(1)}` : ""}
                  {" kW"}
                </Text>
              )}
            </Text>
          </Tooltip>
          {eb.skipped > 0 ? (
            <Text size="xs" c="yellow.5" ff="monospace">
              {eb.skipped} stream(s) skipped (no enthalpy)
            </Text>
          ) : (
            <Text size="xs" c={energyOk ? "teal.4" : "yellow.5"} ff="monospace">
              closure {energyPct} %
            </Text>
          )}
        </Stack>

        {/* Per-component table */}
        {compRows.length > 0 && (
          <Box style={{ minWidth: 260 }}>
            <Table withRowBorders={false} verticalSpacing={1} horizontalSpacing="sm" fz="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th><Text size="9px" c="dimmed" tt="uppercase">component</Text></Table.Th>
                  <Table.Th ta="right"><Text size="9px" c="dimmed" tt="uppercase">in</Text></Table.Th>
                  <Table.Th ta="right"><Text size="9px" c="dimmed" tt="uppercase">out</Text></Table.Th>
                  <Table.Th ta="right"><Text size="9px" c="dimmed" tt="uppercase">Δ%</Text></Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {compRows.map(({ c, ci, co, err }) => (
                  <Table.Tr key={c}>
                    <Table.Td><Text size="xs" ff="monospace">{c}</Text></Table.Td>
                    <Table.Td ta="right"><Text size="xs" ff="monospace">{formatFlow(ci, u)}</Text></Table.Td>
                    <Table.Td ta="right"><Text size="xs" ff="monospace">{formatFlow(co, u)}</Text></Table.Td>
                    <Table.Td ta="right">
                      <Text size="xs" ff="monospace" c={err < MASS_TOL ? "dimmed" : "yellow.5"}>
                        {(err * 100).toFixed(err < 1e-4 ? 3 : 1)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Text size="9px" c="dimmed" ff="monospace" mt={2}>mass flow ({u})</Text>
          </Box>
        )}

        {/* Column duties */}
        {duties.length > 0 && (
          <Box>
            <Text size="xs" fw={600} tt="uppercase" c="dimmed" mb={2} style={{ letterSpacing: 0.4 }}>
              Column duties
            </Text>
            <Table withRowBorders={false} verticalSpacing={1} horizontalSpacing="sm" fz="xs">
              <Table.Tbody>
                {duties.map((d) => (
                  <Table.Tr key={`${d.unit}.${d.port}`}>
                    <Table.Td>
                      <Text size="xs" ff="monospace">
                        {d.port === "reboiler" ? "♨" : "❄"} {d.unit}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right"><Text size="xs" ff="monospace">{d.kW.toFixed(1)} kW</Text></Table.Td>
                    <Table.Td>
                      <Text size="xs" ff="monospace" c="dimmed">{d.utility ?? "—"}</Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="xs" ff="monospace" c="dimmed">
                        {d.eurH !== undefined ? `${d.eurH.toFixed(1)} €/h` : ""}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Box>
        )}
      </Group>
    </Box>
  );
}
