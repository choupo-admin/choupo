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
  LIQUID PROPERTIES USED -- the place a student reads where each unit took its
  liquid density, viscosity, surface tension or diffusivity from.

  THE TASK, IN ONE SENTENCE: "I ran the plant; this pump (vessel, exchanger)
  used a liquid density -- WHICH number, at what state, where did it come
  from, and is that a number I should trust?"  So each row leads with the
  property and its number, then the state it was asked at, then the source IN
  THE ENGINE'S OWN WORDS, with the engine's class word beside it (`kernel`,
  `bypass`, `declared`) as text, never as a colour alone.

  Two surfaces, one row: `UnitLiquidProperties` (the selected unit's Property
  panel) and `LiquidPropertiesReport` (the Reports section for the whole
  run).  The block is the engine's (`propertySources`, adapters/
  propertySourcesPayload.ts); NOTHING is computed or reworded here.  A field
  the page does not know is shown in a generic "more" row, so what the
  property kernel adds later is visible the day it is written.
\*---------------------------------------------------------------------------*/

import { IconExternalLink } from "@tabler/icons-react";
import { Anchor, Badge, Box, Group, Stack, Text } from "@mantine/core";

import { useStore } from "../state/store.js";
import { liquidPropertySourcesLink } from "../case/modelDocs.js";
import { useMeasuredBoxWidth } from "./methods/methodsChrome.js";
import {
  propertyWords, rowsByUnit, rowsOfUnit, stateText, valueText,
  type PropertySourceRow, type PropertySourcesReport,
} from "../adapters/propertySourcesPayload.js";

/** The engine's class word, as a mark.  The word is the engine's, verbatim;
 *  the colour only helps, and a word the page does not know is neutral. */
const CLASS_COLOR: Record<string, string> = { kernel: "teal", bypass: "orange", declared: "blue" };

export function ClassMark({ sourceClass }: { sourceClass: string }) {
  const word = sourceClass || "unclassified";
  return (
    <Badge variant="light" size="sm" radius="sm" tt="none"
      color={CLASS_COLOR[sourceClass] ?? "gray"}
      data-source-class={word} title={`source class: ${word}`}>
      {word}
    </Badge>
  );
}

const show = (v: unknown): string => {
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return String(v); }
};

/** Every field of a row or of the block the page has no column for, as
 *  `name: value`.  Renders nothing when there is none. */
export function MoreRow({ extra }: { extra: Record<string, unknown> }) {
  const keys = Object.keys(extra);
  if (keys.length === 0) return null;
  return (
    <Text size="xs" c="dimmed" data-liquid-more style={{ overflowWrap: "anywhere" }}>
      <Text span fw={600}>more</Text>{" "}
      {keys.map((k, i) => (
        <span key={k}>{i ? "; " : ""}{k}: {show(extra[k])}</span>
      ))}
    </Text>
  );
}

/** The number, or the engine's own phrase when it recorded none. */
function ValueLine({ row }: { row: PropertySourceRow }) {
  const v = valueText(row);
  const state = stateText(row);
  return (
    <Box>
      <Group justify="space-between" align="baseline" gap={8} wrap="wrap">
        <Text size="sm" fw={600} data-liquid-property>{propertyWords(row.property)}</Text>
        {v ? <Text size="sm" ff="monospace" fw={600} data-liquid-value>{v}</Text>
           : <Text size="sm" c="dimmed" data-liquid-value>value not recorded</Text>}
      </Group>
      {state && <Text size="xs" c="dimmed" ff="monospace" data-liquid-state>{state}</Text>}
    </Box>
  );
}

function SourceLine({ row }: { row: PropertySourceRow }) {
  return (
    <Group gap={6} align="flex-start" wrap="nowrap">
      <Box style={{ flex: "0 0 auto", paddingTop: 1 }}><ClassMark sourceClass={row.sourceClass} /></Box>
      <Text size="xs" data-liquid-label style={{ overflowWrap: "anywhere" }}>{row.label}</Text>
    </Group>
  );
}

function GuideLink() {
  return (
    <Anchor href={liquidPropertySourcesLink()} target="_blank" rel="noopener"
      c="accent.4" data-liquid-guide-link
      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <IconExternalLink size={13} />
      <Text size="xs">Theory — where a unit takes its liquid properties from</Text>
    </Anchor>
  );
}

/** One row as a small stacked block: used in the Property panel, and in the
 *  Reports section when the page is too narrow for columns. */
function StackedRow({ row, unit }: { row: PropertySourceRow; unit?: string }) {
  return (
    <Stack gap={3} data-liquid-row p="xs"
      style={{ border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))", borderRadius: 4 }}>
      <ValueLine row={row} />
      {unit !== undefined && row.unit !== unit && (
        <Text size="xs" c="dimmed" data-liquid-consumer style={{ overflowWrap: "anywhere" }}>
          taken by {row.unit} ({row.consumerType})
        </Text>
      )}
      <SourceLine row={row} />
      <MoreRow extra={row.extra} />
    </Stack>
  );
}

/** THE SELECTED UNIT'S ROWS.  Nothing at all (no empty box) when the run has
 *  no block or the unit has no row. */
export function UnitLiquidPropertiesRows({ report, unit }: {
  report: PropertySourcesReport | undefined; unit: string;
}) {
  const rows = rowsOfUnit(report, unit);
  if (rows.length === 0) return null;
  return (
    <Stack gap={6} data-liquid-properties={unit}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Liquid properties used</Text>
      {rows.map((r) => <StackedRow key={`${r.unit}|${r.property}|${r.sourceId}`} row={r} unit={unit} />)}
      <GuideLink />
    </Stack>
  );
}

export function UnitLiquidProperties({ unit }: { unit: string }) {
  const report = useStore((s) => s.runResult?.propertySources);
  return <UnitLiquidPropertiesRows report={report} unit={unit} />;
}

/** The engine's findings, with the engine's own tag beside each sentence. */
function Findings({ report }: { report: PropertySourcesReport }) {
  const items: { tag: string; text: string }[] = [
    ...report.pricedTwice.map((text) => ({ tag: "twice", text })),
    ...report.mismatches.map((text) => ({ tag: "mismatch", text })),
    ...report.constantBesideComputed.map((text) => ({ tag: "constant", text })),
  ];
  if (items.length === 0) return null;
  return (
    <Stack gap={4} mb="sm" data-liquid-findings>
      {items.map((f, i) => (
        <Text key={i} size="sm" style={{ overflowWrap: "anywhere" }}>
          <Badge variant="light" size="xs" radius="sm" tt="none" color="yellow" mr={6}>[{f.tag}]</Badge>
          {f.text}
        </Text>
      ))}
    </Stack>
  );
}

/** THE WHOLE RUN: a table grouped by unit, the same columns as the panel. */
export function LiquidPropertiesReport({ report }: { report: PropertySourcesReport }) {
  const groups = rowsByUnit(report);
  const host = useMeasuredBoxWidth<HTMLDivElement>();
  //  Columns only where they fit; a phone gets the stacked row instead.
  const narrow = host.width > 0 && host.width < 640;
  if (groups.length === 0) return null;
  return (
    <Box ref={host.ref} data-liquid-report>
      <Findings report={report} />
      {narrow ? (
        <Stack gap="sm">
          {groups.map((g) => (
            <Box key={g.unit} data-liquid-unit={g.unit}>
              <Text size="sm" fw={600} ff="monospace">{g.unit}{" "}
                <Text span size="xs" c="dimmed" fw={400}>({g.consumerType})</Text></Text>
              <Stack gap={8} mt={2} pl="xs"
                style={{ borderLeft: "2px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))" }}>
                {g.rows.map((r) => <StackedRow key={`${r.property}|${r.sourceId}`} row={r} />)}
              </Stack>
            </Box>
          ))}
        </Stack>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "var(--mantine-font-size-sm)" }}>
          <thead>
            <tr style={{ textAlign: "left" }}>
              {["unit", "property", "value", "state", "source"].map((h) => (
                <th key={h} style={{ padding: "4px 8px 4px 0", fontWeight: 600,
                  borderBottom: "1px solid var(--mantine-color-dark-4)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => g.rows.map((r, i) => (
              <tr key={`${g.unit}|${r.property}|${r.sourceId}`} data-liquid-row
                data-liquid-unit={i === 0 ? g.unit : undefined}
                style={{ verticalAlign: "top",
                  borderTop: i === 0 ? "1px solid var(--mantine-color-dark-5)" : undefined }}>
                <td style={{ padding: "4px 12px 4px 0", width: "20%", maxWidth: 240,
                  overflowWrap: "anywhere", fontFamily: "monospace" }}>
                  {i === 0 ? <>{g.unit}<Text size="xs" c="dimmed" ff="monospace">({g.consumerType})</Text></> : null}
                </td>
                <td style={{ padding: "4px 12px 4px 0", whiteSpace: "nowrap" }} data-liquid-property>{propertyWords(r.property)}</td>
                <td style={{ padding: "4px 8px 4px 0", whiteSpace: "nowrap", fontFamily: "monospace" }} data-liquid-value>
                  {valueText(r) || <Text span c="dimmed" ff="inherit">value not recorded</Text>}
                </td>
                <td style={{ padding: "4px 8px 4px 0", whiteSpace: "nowrap", fontFamily: "monospace",
                  color: "var(--mantine-color-dimmed)" }}>{stateText(r)}</td>
                <td style={{ padding: "4px 0" }}>
                  <SourceLine row={r} />
                  <MoreRow extra={r.extra} />
                </td>
              </tr>
            )))}
          </tbody>
        </table>
      )}
      <Box mt="xs"><GuideLink /></Box>
      <MoreRow extra={report.extra} />
    </Box>
  );
}
