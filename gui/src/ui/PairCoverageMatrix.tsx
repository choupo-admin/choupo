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
  PairCoverageMatrix
  ==================

  The cure for the NRTL "all-or-nothing" cliff.  An activity model like NRTL
  needs an interaction parameter set for EVERY binary pair: N components =
  N(N-1)/2 pairs.  Turning NRTL on when the library has only one of them used
  to be a silent wall.  This matrix makes the coverage VISIBLE: an N×N grid,
  each off-diagonal cell coloured by where that pair RESOLVED (and, for a local
  file, what its provenance.source says) -- so the student SEES, before
  trusting any VLE prediction, exactly which interactions are real data, which
  are placeholders, and which silently defaulted to ideal.

  It reads the engine's emitted `thermoResolution` (RunResult) -- never a
  re-walk of the resolution rules in TypeScript (one source of truth).  Shown
  after a run; before a run there is nothing resolved yet to show.
\*---------------------------------------------------------------------------*/

import { Badge, Box, Group, Table, Text } from "@mantine/core";

import type { PairResolution } from "../adapters/SolverAdapter.js";

interface CellInfo {
  label: string;
  color: string;
  /** longer text for the hover title */
  title: string;
  /** the "missing/placeholder" cells the student must act on */
  flag: "ok" | "soft" | "danger";
  /** WHERE the pair resolved -- the owning sector/node, "library", "inline",
   *  or "" (ideal-default).  Surfaced per cell so per-sector ownership is
   *  visible at a glance in a multi-sector plant (the auditability point). */
  node: string;
}

/** The owning node/sector a pair resolved at, from its source path. */
function nodeOf(r: PairResolution): string {
  if (r.status === "standard") return "library";
  if (r.status === "inline") return "inline";
  if (r.status === "idealDefault") return "";
  // perNode / caseRoot: the folder that owns constant/binaryPairs
  const cut = r.source.indexOf("/constant/");
  if (cut < 0) return r.status === "caseRoot" ? "plant root" : "local";
  const seg = r.source.slice(0, cut).split("/").filter(Boolean).pop() ?? "";
  return seg || (r.status === "caseRoot" ? "plant root" : "local");
}

/** Map a pair's resolution to a coloured cell. */
/** Exported for the focused audit tests (forum #79-5). */
export function badgeForTest(r: PairResolution): CellInfo { return classify(r); }

function classify(r: PairResolution | undefined): CellInfo {
  if (!r) return { label: "?", color: "gray", title: "not resolved", flag: "soft", node: "" };
  const src = r.source;
  const node = nodeOf(r);
  switch (r.status) {
    case "inline":
      return { label: "inline", color: "teal", title: `inline in thermoPackage`, flag: "ok", node };
    case "standard":
      {
        // origin is ORTHOGONAL to tier (forum #79-4): status says WHERE it
        // resolved; origin says WHAT CLASS of confidence it carries.  A
        // standard `assumed`/`predictive` pair must not masquerade as green.
        const cls = r.origin && r.origin !== "unattributed" ? r.origin : r.provSource;
        if (cls === "predictive")
          return { label: "predictive", color: "orange",
            title: `standard, but MODEL-DERIVED surrogate — ${src}${provNote(r)}`, flag: "danger", node };
        if (cls === "assumed")
          return { label: "assumed", color: "yellow",
            title: `standard, but an engineering ASSUMPTION — ${src}${provNote(r)}`, flag: "soft", node };
        if (cls === "estimated")
          return { label: "estimated", color: "yellow",
            title: `standard, but group-contribution ESTIMATE — ${src}${provNote(r)}`, flag: "soft", node };
        if (cls === "placeholder")
          return { label: "placeholder", color: "red",
            title: `standard PLACEHOLDER — ${src}`, flag: "danger", node };
        return { label: (cls && cls !== "inline" ? cls : undefined) ?? "library", color: "teal",
          title: `standard library — ${src}${provNote(r)}`, flag: r.promotedDespite ? "soft" : "ok", node };
      }
    case "perNode":
    case "caseRoot": {
      // POLICY by the typed origin (forum #77-2); provSource is legacy fallback
      // for results emitted before the origin field existed.
      const cls = r.origin && r.origin !== "unattributed" ? r.origin : r.provSource;
      if (cls === "placeholder")
        return { label: "placeholder", color: "red",
          title: `LOCAL PLACEHOLDER (not fitted) — ${src}`, flag: "danger", node };
      if (cls === "regressed" || cls === "fitted")
        return { label: "fitted", color: "green", title: `fitted + promoted — ${src}`,
          flag: r.promotedDespite ? "soft" : "ok", node };
      if (cls === "predictive")
        return { label: "predictive", color: "orange",
          title: `MODEL-DERIVED surrogate, not data — ${src}${provNote(r)}`, flag: "danger", node };
      if (cls === "assumed")
        return { label: "assumed", color: "yellow",
          title: `engineering assumption — ${src}${provNote(r)}`, flag: "soft", node };
      return { label: cls && cls.length > 0 ? cls : "local", color: "yellow",
        title: `local file — ${src}${provNote(r)}`, flag: "soft", node };
    }
    case "idealDefault":
      return { label: "ideal", color: "orange",
        title: "no parameters found anywhere — defaulted to IDEAL (no interaction)", flag: "danger", node };
    default:
      return { label: r.status, color: "gray", title: r.status, flag: "soft", node };
  }
}

function provNote(r: PairResolution): string {
  return r.provSource && r.provSource.length > 0 ? ` (${r.provSource})` : "";
}

export function PairCoverageMatrix({ components, resolution }: {
  components: string[];
  resolution: PairResolution[];
}) {
  if (components.length < 2 || resolution.length === 0) return null;

  // Lookup by unordered pair key.
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const map = new Map<string, PairResolution>();
  for (const r of resolution) map.set(key(r.i, r.j), r);

  // Only show components that actually participate in the model's pairs (an
  // inert solute with no pairs would just add empty rows).  Fall back to all.
  const inPairs = new Set<string>();
  for (const r of resolution) { inPairs.add(r.i); inPairs.add(r.j); }
  const comps = components.filter((c) => inPairs.has(c));
  const shown = comps.length >= 2 ? comps : components;

  // Tally for the headline + per-sector ownership (which node each local pair
  // came from -- the auditability point for a multi-sector plant).
  let nOk = 0, nSoft = 0, nDanger = 0, nTotal = 0;
  const bySector = new Map<string, number>();
  for (let a = 0; a < shown.length; a++)
    for (let b = a + 1; b < shown.length; b++) {
      nTotal++;
      const info = classify(map.get(key(shown[a]!, shown[b]!)));
      if (info.flag === "ok") nOk++;
      else if (info.flag === "danger") nDanger++;
      else nSoft++;
      if (info.node && info.node !== "library" && info.node !== "inline"
          && info.node !== "plant root")
        bySector.set(info.node, (bySector.get(info.node) ?? 0) + 1);
    }
  const sectorSummary = [...bySector.entries()].map(([n, c]) => `${n} (${c})`).join(", ");

  return (
    <Box>
      <Group gap="xs" mb={6} align="center">
        <Text size="sm" fw={600} c="accent">Binary-pair coverage</Text>
        <Text size="xs" c="dimmed">
          {nTotal} pair{nTotal === 1 ? "" : "s"}: {nOk} data/library
          {nSoft > 0 ? `, ${nSoft} local` : ""}
          {nDanger > 0 ? `, ` : ""}
          {nDanger > 0 && <Text span c="orange.4" fw={600}>{nDanger} placeholder/ideal</Text>}
        </Text>
        {sectorSummary && (
          <Text size="xs" c="accent" title="Pairs owned by a specific sector's constant/binaryPairs">
            · per-sector: {sectorSummary}
          </Text>
        )}
      </Group>

      {nDanger > 0 && (
        <Text size="xs" c="dimmed" mb={6}>
          Orange/red cells are unconstrained interactions — the VLE there is a guess.
          Fit them (props fit workflow) and promote into the owning node, or accept ideal deliberately.
        </Text>
      )}

      <Table withTableBorder withColumnBorders fz="xs"
        style={{ fontFamily: "var(--mantine-font-family-monospace)" }}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th />
            {shown.map((c) => (
              <Table.Th key={c} style={{ writingMode: "vertical-rl", textTransform: "none" }}>
                {c}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {shown.map((ci, a) => (
            <Table.Tr key={ci}>
              <Table.Th style={{ textTransform: "none", whiteSpace: "nowrap" }}>{ci}</Table.Th>
              {shown.map((cj, b) => {
                if (a === b)
                  return <Table.Td key={cj} style={{ background: "light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-6))" }} />;
                const info = classify(map.get(key(ci, cj)));
                const sector = info.node && info.node !== "library"
                  && info.node !== "inline" && info.node !== "plant root";
                return (
                  <Table.Td key={cj} ta="center" title={info.title}>
                    <Badge color={info.color} variant={info.flag === "ok" ? "light" : "filled"}
                      size="xs" radius="sm" styles={{ root: { textTransform: "none" } }}>
                      {info.label}
                    </Badge>
                    {info.node && (
                      <Text size="8px" mt={1} c={sector ? "cyan.4" : "dimmed"} style={{ lineHeight: 1 }}>
                        @{info.node}
                      </Text>
                    )}
                  </Table.Td>
                );
              })}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Group gap="md" mt={6}>
        <LegendChip color="teal" label="library / inline (data)" />
        <LegendChip color="green" label="fitted + promoted" />
        <LegendChip color="yellow" label="local file" />
        <LegendChip color="red" label="placeholder (not fitted)" />
        <LegendChip color="orange" label="ideal-default (no params)" />
      </Group>
    </Box>
  );
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <Group gap={4} align="center">
      <Badge color={color} variant="filled" size="xs" radius="sm" style={{ width: 14, padding: 0 }}> </Badge>
      <Text size="9px" c="dimmed">{label}</Text>
    </Group>
  );
}
