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
  ThermoView
  ==========

  Render `constant/propertyDict` as a human-friendly table so the
  student SEES the thermo layer that the simulator is using --- which
  activity model, which EoS, which binary interaction pairs, which
  transport correlations.  Without this, the thermoPackage is just a
  file in `constant/` that the student rarely opens; this surfaces it
  alongside the run output, where it is most relevant.

  Read-only.  Authoring happens by editing the dict on disk; the GUI
  only shows what is there.
\*---------------------------------------------------------------------------*/

import { Badge, Box, Group, ScrollArea, Stack, Table, Text, Title } from "@mantine/core";

import { useStore } from "../state/store.js";
import type { JsonDict, JsonValue } from "../dict/json.js";
import type { ComponentCoverage } from "../adapters/SolverAdapter.js";
import { PairCoverageMatrix } from "./PairCoverageMatrix.js";

/** Per-component thermo coverage: which capabilities each component carries,
 *  so a gap (no Antoine -> no VLE; no Vliq -> no pump) is visible before you
 *  trust the flowsheet.  ✗ = a gap to fill (props bench -> promote). */
function ComponentCoverageTable({ rows }: { rows: ComponentCoverage[] }) {
  const mark = (ok: boolean) => (
    <Text size="sm" fw={700} c={ok ? "green.5" : "red.5"}>{ok ? "✓" : "✗"}</Text>
  );
  const head = (label: string, help: string) => (
    <Table.Th ta="center" title={help}>{label}</Table.Th>
  );
  return (
    <>
      <Table withTableBorder striped fz="sm" ff="monospace" w="auto">
        <Table.Thead><Table.Tr>
          <Table.Th>component</Table.Th>
          {head("criticals", "Tc, Pc — equation of state / corresponding states")}
          {head("Psat", "Antoine / vapour pressure — VLE, flash, distillation")}
          {head("Vliq", "liquid molar volume — pump, liquid density")}
          {head("Cp_ig", "ideal-gas heat capacity — energy balances")}
          {head("ΔGf", "formation data — Gibbs reactor")}
        </Table.Tr></Table.Thead>
        <Table.Tbody>
          {rows.map((r) => (
            <Table.Tr key={r.name}>
              <Table.Td>
                {r.name}{r.nonvolatile && <Text span size="10px" c="dimmed"> · solute</Text>}
              </Table.Td>
              <Table.Td ta="center">{mark(r.criticals)}</Table.Td>
              <Table.Td ta="center">
                {r.nonvolatile ? <Text size="xs" c="dimmed">n/a</Text> : mark(r.psat)}
              </Table.Td>
              <Table.Td ta="center">{mark(r.vliq)}</Table.Td>
              <Table.Td ta="center">{mark(r.cpIdealGas)}</Table.Td>
              <Table.Td ta="center">{mark(r.gibbs)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Text size="xs" c="dimmed" mt={4} maw={640}>
        <Text span c="red.5" fw={700}>✗</Text> is a GAP: no Psat → no VLE/flash; no Vliq → no pump /
        liquid density; no Cp_ig → no energy balance; no ΔGf → no Gibbs reactor. Fill a gap with the
        props bench (estimate / fit) and promote it into <code>constant/</code>. Solutes carry no
        Psat by design (n/a). A dissociating salt (one with <code>dissociatesTo</code>) derives its
        formation datum from its IONS (Σν·hf_aq − ΔH_soln) — a ✗ under ΔGf there is the ion-derived
        route, not a gap; do NOT add a component-level standardThermochemistry block to a salt.
      </Text>
    </>
  );
}

export function ThermoView() {
  const tp = useStore((s) => s.caseFiles.thermoPackage);
  const propsDict = useStore((s) => s.caseFiles.propsDict);
  const extraFiles = useStore((s) => s.caseFiles.extraFiles);
  const thermoResolution = useStore((s) => s.runResult?.thermoResolution);
  const componentCoverage = useStore((s) => s.runResult?.componentCoverage);
  // A propertyPackage case: the thermo source is constant/propertyDict (the
  // engine assembles it via the ThermoPackageBuilder); thermoPackage is empty.
  const ppText = extraFiles?.["constant/propertyDict"];
  const ppName = ppText?.match(/^\s*package\s+(\S+?)\s*;/m)?.[1] ?? null;
  // Per-OP activity engines (speciate / scalingScan select their own model in
  // the propsDict): a "water + ideal" package here is only the VLE skeleton --
  // showing "ideal" alone for an I=7 brine case reads as a bug.
  const opEngines = new Map<string, number>();
  {
    const ops = propsDict?.["operations"];
    if (Array.isArray(ops))
      for (const op of ops) {
        if (!op || typeof op !== "object" || Array.isArray(op)) continue;
        const od = op as { [k: string]: unknown };
        const am = od["activityModel"];
        if (typeof am === "string")
          opEngines.set(am, (opEngines.get(am) ?? 0) + 1);
      }
  }
  if (!tp) {
    return (
      <Box p="md">
        <Text c="dimmed">No thermoPackage loaded.</Text>
      </Box>
    );
  }

  const components = stringList(tp["components"]);
  const activity = tp["activityModel"] as JsonDict | undefined;
  const eos = tp["equationOfState"] as JsonDict | undefined;
  const transport = tp["transport"] as JsonDict | undefined;
  const liquidViscosity = tp["liquidViscosity"] as JsonDict | undefined;

  return (
    <ScrollArea h="100%">
      <Stack gap="md" p="md" style={{ maxWidth: 900 }}>

        {/* Components -- post-run, a COVERAGE table (which capabilities each
            component carries, so a gap like "no Antoine -> no VLE" is visible);
            pre-run, just the names. */}
        <Box>
          <SectionTitle text="Components" />
          {components.length === 0 ? (
            <Text c="dimmed" size="sm">(none)</Text>
          ) : componentCoverage && componentCoverage.length > 0 ? (
            <ComponentCoverageTable rows={componentCoverage} />
          ) : (
            <>
              <Group gap="xs" wrap="wrap">
                {components.map((c) => (
                  <Badge key={c} variant="light" color="cyan" size="md"
                    radius="sm" styles={{ root: { textTransform: "none" } }}>
                    {c}
                  </Badge>
                ))}
              </Group>
              <Text size="xs" c="dimmed" mt={4}>Run to see each component's thermo coverage (ready vs gap).</Text>
            </>
          )}
        </Box>

        {/* Activity model */}
        <Box>
          <SectionTitle text="Activity model" />
          {ppName && (
            <Text size="sm" mb={4}>
              property package: <Text span ff="monospace" c="accent">{ppName}</Text>
              <Text span c="dimmed"> — selected in constant/propertyDict; the
              engine assembles it (components, ions, pairs, methods) from
              data/standards/propertyPackages/.</Text>
            </Text>
          )}
          {activity ? <ModelBlock dict={activity} /> : !ppName &&
            <Text c="dimmed" size="sm">(not declared — defaults to ideal)</Text>}
          {opEngines.size > 0 && (
            <Text size="sm" mt={4}>
              per-operation engines (propsDict):{" "}
              {[...opEngines.entries()].map(([m, n]) =>
                `${m}${n > 1 ? ` (×${n} ops)` : ""}`).join(", ")}
              <Text span c="dimmed"> — these override the package model inside
              their operations (the multi-ion speciation path).</Text>
            </Text>
          )}
        </Box>

        {/* Binary-pair coverage matrix (from the run's emitted resolution).
            Surfaces the NRTL "all-or-nothing" cliff: which pairs are real
            data, placeholders, or silently ideal-defaulted. */}
        {thermoResolution && thermoResolution.length > 0 && (
          <Box>
            <PairCoverageMatrix components={components} resolution={thermoResolution} />
          </Box>
        )}

        {/* Equation of state */}
        <Box>
          <SectionTitle text="Equation of state" />
          {eos ? <ModelBlock dict={eos} /> :
            <Text c="dimmed" size="sm">(not declared — defaults to ideal gas)</Text>}
        </Box>

        {/* Transport */}
        {(transport || liquidViscosity) && (
          <Box>
            <SectionTitle text="Transport" />
            {transport && <TransportBlock dict={transport} />}
            {liquidViscosity && (
              <Box mt="xs">
                <Text size="xs" c="dimmed">Liquid viscosity (top-level legacy form)</Text>
                <ModelBlock dict={liquidViscosity} />
              </Box>
            )}
          </Box>
        )}

      </Stack>
    </ScrollArea>
  );
}

function SectionTitle({ text }: { text: string }) {
  return <Title order={5} c="accent" mb={6}>{text}</Title>;
}

/** Render a `{ model X; pairs (...); ...}` block: model name as a badge,
 *  then any pairs sub-list as a table, then leftover scalar fields. */
function ModelBlock({ dict }: { dict: JsonDict }) {
  const model = typeof dict["model"] === "string" ? (dict["model"] as string) : "(unspecified)";
  const pairs = Array.isArray(dict["pairs"]) ? (dict["pairs"] as JsonDict[]) : [];
  const scalars: [string, string][] = [];
  for (const [k, v] of Object.entries(dict)) {
    if (k === "model" || k === "pairs") continue;
    if (typeof v === "number" || typeof v === "string") scalars.push([k, String(v)]);
  }
  return (
    <Stack gap={6}>
      <Group gap="xs">
        <Text size="sm">model:</Text>
        <Badge variant="filled" color="teal" size="sm" radius="sm"
          styles={{ root: { textTransform: "none" } }}>{model}</Badge>
      </Group>

      {pairs.length > 0 && (
        <Table withTableBorder withColumnBorders striped highlightOnHover
          style={{ fontFamily: "var(--mantine-font-family-monospace)", fontSize: 12 }}>
          <Table.Thead>
            <Table.Tr>
              {pairKeys(pairs).map((k) => <Table.Th key={k}>{k}</Table.Th>)}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {pairs.map((p, i) => (
              <Table.Tr key={i}>
                {pairKeys(pairs).map((k) => (
                  <Table.Td key={k}>{formatPairCell(p[k])}</Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      {scalars.length > 0 && (
        <Box>
          {scalars.map(([k, v]) => (
            <Text key={k} size="xs" c="dimmed">{k}: {v}</Text>
          ))}
        </Box>
      )}
    </Stack>
  );
}

/** Render the `transport {}` sub-block, listing each sub-model
 *  (gasViscosity / thermalConductivity / diffusivity / liquidViscosity /
 *  liquidConductivity / liquidDiffusivity). */
function TransportBlock({ dict }: { dict: JsonDict }) {
  const subKeys = [
    "model",                          // legacy gas viscosity at top-level
    "thermalConductivity",
    "diffusivity",
    "liquidViscosity",
    "liquidConductivity",
    "liquidDiffusivity",
  ];
  // Top-level "model" for gas viscosity is a string, not a sub-dict.
  const gasViscModel = typeof dict["model"] === "string" ? (dict["model"] as string) : null;
  return (
    <Stack gap={6}>
      {gasViscModel && (
        <Group gap="xs">
          <Text size="sm">gas viscosity:</Text>
          <Badge variant="light" color="orange" size="sm" radius="sm"
            styles={{ root: { textTransform: "none" } }}>{gasViscModel}</Badge>
        </Group>
      )}
      {subKeys.filter((k) => k !== "model").map((k) => {
        const sub = dict[k];
        if (!sub || typeof sub !== "object" || Array.isArray(sub)) return null;
        const model = typeof (sub as JsonDict)["model"] === "string"
          ? ((sub as JsonDict)["model"] as string) : "(unspecified)";
        return (
          <Group key={k} gap="xs">
            <Text size="sm">{k}:</Text>
            <Badge variant="light" color="orange" size="sm" radius="sm"
              styles={{ root: { textTransform: "none" } }}>{model}</Badge>
          </Group>
        );
      })}
    </Stack>
  );
}

function stringList(v: JsonValue | undefined): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function pairKeys(pairs: JsonDict[]): string[] {
  const seen = new Set<string>();
  for (const p of pairs) for (const k of Object.keys(p)) seen.add(k);
  // Conventional order first, then anything else
  const order = ["i", "j", "a_ij", "b_ij", "a_ji", "b_ji", "alpha", "A_ij", "A_ji"];
  return [...order.filter((k) => seen.has(k)),
          ...Array.from(seen).filter((k) => !order.includes(k))];
}

function formatPairCell(v: JsonValue | undefined): string {
  if (v === undefined || v === null) return "—";
  if (typeof v === "number") {
    const abs = Math.abs(v);
    if (v === 0) return "0";
    if (abs >= 1e-3 && abs < 1e6) return Number(v.toPrecision(5)).toString();
    return v.toExponential(2);
  }
  return String(v);
}
