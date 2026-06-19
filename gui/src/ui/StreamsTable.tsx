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
  Streams tab.  One row per stream (feed / intermediate / product) with
  F, T, P and component-mole-fraction columns.

  Columns honour the TopBar Units menu (gui/src/ui/UnitsMenu.tsx) ---
  the solver always emits canonical SI, the table converts at render
  time.  Flow can be molar OR mass; mass-basis reads `F_mass` (kg/s)
  from the solver output.
\*---------------------------------------------------------------------------*/

import {
  ActionIcon,
  Badge,
  Box,
  Group,
  ScrollArea,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconExternalLink, IconFileSpreadsheet } from "@tabler/icons-react";
import { useState } from "react";

import { computePerStream } from "../case/streamComposition.js";
import { streamNumberResolver } from "../case/streamNumbering.js";
import { downloadOds, type OdsValue } from "../case/odsExport.js";
import {
  flowBasis,
  flowToDisplay,
  formatFlow,
  formatPressure,
  formatSig,
  formatTemperature,
  kToDisplay,
  paToDisplay,
  temperatureLabel,
} from "../state/displayUnits.js";
import { useStore } from "../state/store.js";
import { popOutStreamsHtml } from "./streamsPopOut.js";

const ROLE_COLORS = {
  feed: "accent",
  intermediate: "gray",
  product: "orange",
} as const;

export function StreamsTable() {
  const result = useStore((s) => s.runResult);
  const prefs = useStore((s) => s.displayPrefs);
  const flowsheet = useStore((s) => s.caseFiles.flowsheet);
  const rawFiles = useStore((s) => s.caseFiles.rawFiles);
  const tutorialName = useStore((s) => s.tutorialName);
  // ABSOLUTE PFD numbers, matching the canvas badges (same resolver): a stream
  // keeps its whole-plant number even when this is a drilled sector view.  A
  // flattened-plant run may name streams differently -- then the lookup misses
  // and the row simply shows no number (graceful).
  const numberOf = streamNumberResolver(tutorialName, flowsheet, rawFiles);

  if (!result) {
    return (
      <Stack align="center" justify="center" h="100%">
        <Text c="dimmed" size="sm">
          No run yet — press Run to populate stream values.
        </Text>
      </Stack>
    );
  }

  // Dynamic cases (choupoBatch, choupoCtrl) do not produce
  // steady-state streams --- their output is a time-series trajectory.
  // Point the student at the Plots tab instead of leaving this view
  // mysteriously empty.
  if (result.streams.length === 0 && result.trajectory) {
    return (
      <Stack align="center" justify="center" h="100%" gap={6}>
        <Text c="dimmed" size="sm">
          This is a dynamic case — there are no steady streams.
        </Text>
        <Text c="dimmed" size="xs">
          Switch to the <strong>Plots</strong> tab to see the
          time-series trajectory of every state variable.
        </Text>
      </Stack>
    );
  }

  const componentSet = new Set<string>();
  for (const s of result.streams) {
    for (const c of Object.keys(s.composition)) componentSet.add(c);
    if (s.solids) for (const c of Object.keys(s.solids)) componentSet.add(c);
  }
  const components = [...componentSet];
  const massBasis = flowBasis(prefs.flow) === "mass";
  // Solid phase: particulate carried in s[] is fluid-independent;
  // show it as a kg/h column whenever any stream carries solids, so a
  // cyclone's capturedSolids stream isn't mysteriously empty.
  const hasSolids = result.streams.some((s) => (s.F_solid_mass ?? 0) > 1e-12);
  const mws = result.componentMolarMass;
  // Mass fractions need MWs; fall back gracefully if the solver
  // didn't emit them (older binary, or a build without).
  const showMassFraction = massBasis && mws !== undefined;
  const fracPrefix = showMassFraction ? "w" : "x";

  // Per-stream composition + total flow with the SOLID phase folded in, in
  // BOTH bases (shared with the pop-out window via case/streamComposition.ts
  // so the two tables can never disagree).  Otherwise a solids-only stream
  // (cyclone capturedSolids) reads F = 0 and an all-zero fluid composition.
  const perStream = computePerStream(result.streams, mws);

  // Sortable columns: click a header to sort asc/desc; default = PFD # ascending
  // (the sequence).  The table AND the .ods export use sortedStreams, so the
  // spreadsheet matches exactly what is on screen.
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "#", dir: "asc" });
  const Fsi = (s: (typeof result.streams)[number]): number => {
    const ps = perStream[s.name];
    return massBasis ? (ps?.totMass ?? 0) : (ps?.totMol ?? s.F);
  };
  const rowVal = (s: (typeof result.streams)[number], key: string): number | string => {
    if (key === "#") return numberOf(s.name) ?? Number.POSITIVE_INFINITY;
    if (key === "name") return s.name;
    if (key === "role") return s.role;
    if (key === "F") return Fsi(s);
    if (key === "T") return s.T;
    if (key === "P") return s.P;
    if (key === "vf") return s.vf ?? -1;
    if (key === "solids") return s.F_solid_mass ?? 0;
    if (key.startsWith("x:")) {
      const c = key.slice(2); const ps = perStream[s.name];
      return (massBasis ? ps?.massFrac[c] : ps?.molFrac[c]) ?? -1;
    }
    return 0;
  };
  const sortedStreams = [...result.streams].sort((a, b) => {
    const va = rowVal(a, sort.key), vb = rowVal(b, sort.key);
    const c = typeof va === "number" && typeof vb === "number"
      ? va - vb : String(va).localeCompare(String(vb));
    return sort.dir === "asc" ? c : -c;
  });
  const toggleSort = (key: string) =>
    setSort((s) => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  const arrow = (key: string) => (sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : "");
  const thSort = { cursor: "pointer", userSelect: "none" as const };

  // .ods (LibreOffice Calc) export: NUMERIC values in the user's units, in the
  // current sort order, so it opens ready to sort / filter / compute.
  const exportOds = () => {
    const headers = [
      "#", "Stream", "Role", `F (${prefs.flow})`,
      `T (${temperatureLabel(prefs.temperature)})`, `P (${prefs.pressure})`, "vf",
      ...(hasSolids ? ["solids (kg/h)"] : []),
      ...components.map((c) => `${fracPrefix}_${c}`),
    ];
    const rows: OdsValue[][] = sortedStreams.map((s) => {
      const ps = perStream[s.name];
      return [
        numberOf(s.name) ?? "",
        s.name,
        s.role,
        massBasis && mws === undefined ? "" : flowToDisplay(Fsi(s), prefs.flow),
        kToDisplay(s.T, prefs.temperature),
        paToDisplay(s.P, prefs.pressure),
        s.vf ?? "",
        ...(hasSolids ? [(s.F_solid_mass ?? 0) > 1e-12 ? (s.F_solid_mass ?? 0) * 3600 : ""] : []),
        ...components.map((c) => (massBasis ? ps?.massFrac[c] : ps?.molFrac[c]) ?? ""),
      ];
    });
    const base = tutorialName.split(/[/:]/).filter(Boolean).pop() || "case";
    downloadOds("Streams", headers, rows, `${base}_streams.ods`);
  };

  const tableJsx = (compact: boolean) => (
    <Table
      striped="even"
      withRowBorders={false}
      verticalSpacing={compact ? 6 : 8}
      horizontalSpacing="md"
      style={{
        fontFamily: "JetBrains Mono, monospace",
        fontSize: compact ? 12 : 13,
      }}
    >
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={{ textAlign: "right", ...thSort }} title="PFD stream number (matches the flowsheet) — click to sort" onClick={() => toggleSort("#")}>#{arrow("#")}</Table.Th>
            <Table.Th style={thSort} onClick={() => toggleSort("name")}>Stream{arrow("name")}</Table.Th>
            <Table.Th style={thSort} onClick={() => toggleSort("role")}>Role{arrow("role")}</Table.Th>
            <Table.Th style={{ textAlign: "right", ...thSort }} onClick={() => toggleSort("F")}>F ({prefs.flow}){arrow("F")}</Table.Th>
            <Table.Th style={{ textAlign: "right", ...thSort }} onClick={() => toggleSort("T")}>
              T ({temperatureLabel(prefs.temperature)}){arrow("T")}
            </Table.Th>
            <Table.Th style={{ textAlign: "right", ...thSort }} onClick={() => toggleSort("P")}>
              P ({prefs.pressure}){arrow("P")}
            </Table.Th>
            <Table.Th
              style={{ textAlign: "right", ...thSort }}
              title="vapour fraction (mole basis, 0 = liquid, 1 = vapour) — click to sort"
              onClick={() => toggleSort("vf")}
            >
              vf{arrow("vf")}
            </Table.Th>
            {hasSolids && (
              <Table.Th style={{ textAlign: "right", ...thSort }} onClick={() => toggleSort("solids")}>solids (kg/h){arrow("solids")}</Table.Th>
            )}
            {components.map((c) => (
              <Table.Th key={c} style={{ textAlign: "right", ...thSort }} onClick={() => toggleSort(`x:${c}`)}>
                {fracPrefix}_{c}{arrow(`x:${c}`)}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sortedStreams.map((s) => {
            // Mass basis folds in the solid phase, so a solids-only
            // stream shows its real kg/h (not the fluid-only F = 0).
            // Total flow with the solid phase folded in, in the active basis.
            const ps = perStream[s.name] ?? {
              molFrac: {},
              massFrac: {},
              totMol: s.F,
              totMass: 0,
            };
            const F_si = massBasis ? ps.totMass : ps.totMol;
            return (
              <Table.Tr key={s.name}>
                <Table.Td style={{ textAlign: "right" }}>
                  <Text size="xs" ff="monospace" c="dimmed">
                    {numberOf(s.name) ?? ""}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" ff="monospace" fw={500}>
                    {s.name}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge
                    size="xs"
                    variant="light"
                    color={ROLE_COLORS[s.role]}
                    radius="sm"
                  >
                    {s.role}
                  </Badge>
                </Table.Td>
                <Table.Td style={{ textAlign: "right" }}>
                  {massBasis && mws === undefined
                    ? "—"
                  : formatFlow(F_si, prefs.flow)}
                </Table.Td>
                <Table.Td style={{ textAlign: "right" }}>
                  {formatTemperature(s.T, prefs.temperature)}
                </Table.Td>
                <Table.Td style={{ textAlign: "right" }}>
                  {formatPressure(s.P, prefs.pressure)}
                </Table.Td>
                <Table.Td style={{ textAlign: "right" }}>
                  {s.vf === undefined ? "—" : formatSig(s.vf)}
                </Table.Td>
                {hasSolids && (
                  <Table.Td style={{ textAlign: "right" }}>
                    {(s.F_solid_mass ?? 0) > 1e-12
                      ? ((s.F_solid_mass ?? 0) * 3600).toFixed(2)
                    : "—"}
                  </Table.Td>
                )}
                {components.map((c) => {
                  const v = showMassFraction ? ps.massFrac[c] : ps.molFrac[c];
                  return (
                    <Table.Td key={c} style={{ textAlign: "right" }}>
                      {v === undefined ? "—" : formatSig(v)}
                    </Table.Td>
                  );
                })}
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
  );

  return (
    <Stack gap={0} h="100%" style={{ minHeight: 0 }}>
      <Group justify="flex-end" px="sm" py={4}
        style={{ borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))" }}>
        <Text size="xs" c="dimmed">
          {result.streams.length} stream{result.streams.length === 1 ? "" : "s"}
        </Text>
        <Tooltip
          label="Download as .ods (OpenDocument Spreadsheet) — opens in LibreOffice Calc, numeric values in your units, in the current sort order"
          withArrow position="left" multiline w={280}
        >
          <ActionIcon size="sm" variant="subtle" color="teal"
            aria-label="Export streams to .ods (LibreOffice Calc)"
            onClick={exportOds}>
            <IconFileSpreadsheet size={14} />
          </ActionIcon>
        </Tooltip>
        <Tooltip
          label="Open the streams table in a separate browser window — keeps the flowsheet in view while you read the table"
          withArrow position="left" multiline w={280}
        >
          <ActionIcon size="sm" variant="subtle" color="cyan"
            onClick={() => popOutStreamsHtml(result, prefs)}>
            <IconExternalLink size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <Box style={{ flex: 1, minHeight: 0 }}>
        <ScrollArea h="100%" type="hover">
          {tableJsx(true)}
        </ScrollArea>
      </Box>
    </Stack>
  );
}
