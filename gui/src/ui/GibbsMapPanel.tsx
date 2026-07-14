/*  GibbsMapPanel — the props-workspace renderer for the `gibbsMap` op
 *  (forum-ratified: docs/design/gibbs-map-forum-2026-07-02.md).
 *
 *  Left: the labelled iso-line map (GibbsMapPlot) with auto-caption,
 *  optional cited industrial window and user-declared kinetic band read
 *  from the op's own dict.  Right: the click-a-point drill-down — the
 *  clicked cell's full equilibrium composition (the solver's numbers for
 *  that cell, straight from the CSV) and the equivalent gibbsReactor dict,
 *  copy-ready.  The map is a case generator, not a picture.
 */
import { useMemo, useState } from "react";
import { Box, Button, Code, Group, ScrollArea, Stack, Table, Text } from "@mantine/core";
import type { JsonDict } from "../dict/index.js";
import {
  GibbsMapPlot, parseGibbsMapCsv, gibbsReactorDictFor,
  type GibbsMapCell, type WindowBox,
} from "./plotting/GibbsMapPlot.js";

function windowFrom(op: JsonDict, key: string): WindowBox | null {
  const w = op[key] as JsonDict | undefined;
  if (!w || typeof w !== "object") return null;
  const n = (k: string) => (typeof w[k] === "number" ? (w[k] as number) : NaN);
  const box: WindowBox = {
    Tmin_C: n("Tmin") - 273.15, Tmax_C: n("Tmax") - 273.15,
    Pmin_bar: n("Pmin") / 1e5, Pmax_bar: n("Pmax") / 1e5,
    label: typeof w["label"] === "string" ? (w["label"] as string) : key,
  };
  return Number.isFinite(box.Tmin_C) && Number.isFinite(box.Pmin_bar) ? box : null;
}

export function GibbsMapPanel({ op, csv }: {
  op: JsonDict;
  csv: string;
}) {
  const data = useMemo(() => parseGibbsMapCsv(csv), [csv]);
  const [cell, setCell] = useState<GibbsMapCell | null>(null);
  const [copied, setCopied] = useState(false);

  if (!data) {
    return <Text c="dimmed" p="md">gibbsMap: the output CSV is missing or unreadable — see the Log.</Text>;
  }

  const metric = (op["metric"] ?? {}) as JsonDict;
  const mtype = String(metric["type"] ?? "metric");
  const mtarget = String(metric["species"] ?? metric["product"] ?? "");
  const metricLabel = mtype === "elementYield"
    ? `${String(metric["element"] ?? "E")}-yield to ${mtarget} (atoms of ${String(metric["element"] ?? "E")} in ${mtarget} / fed)`
    : `x_${mtarget} (mole fraction — composition, not yield)`;

  const elements = ((op["elements"] ?? []) as unknown[]).map(String);
  const speciesAtoms = (((op["species"] ?? []) as JsonDict[]) ?? []).map((s) => ({
    name: String(s["name"] ?? "?"),
    atoms: ((s["atoms"] ?? []) as unknown[]).map(Number),
  }));
  const feed: Record<string, number> = {};
  const feedDict = (op["feed"] ?? {}) as JsonDict;
  for (const [k, v] of Object.entries(feedDict)) if (typeof v === "number") feed[k] = v;

  const feedStr = Object.entries(feed).map(([k, v]) => `${k}:${v}`).join(" ");
  const caption =
    `metric: ${metricLabel} · feed (mol): ${feedStr} · ΔT approach: ${data.deltaT} K` +
    ` · grid ${data.Ts.length}×${data.Ps.length}` +
    (data.deltaT !== 0 ? " · EQUILIBRIUM AT T+ΔT (empirical, calibrated; 0 = true equilibrium)" : "");

  return (
    <Box style={{ position: "absolute", inset: 0, display: "flex" }}>
      <Box style={{ flex: cell ? "1 1 62%" : "1 1 100%", minWidth: 0 }}>
        <GibbsMapPlot
          data={data} metricLabel={metricLabel} caption={caption}
          window={windowFrom(op, "industrialWindow")}
          kineticBand={windowFrom(op, "kineticBand")}
          onCell={setCell}
        />
      </Box>
      {cell && (
        <Box style={{ flex: "1 1 38%", minWidth: 0, borderLeft: "1px solid #333" }}>
          <ScrollArea h="100%" type="auto" px="sm" py="xs">
            <Stack gap="xs">
              <Group justify="space-between">
                <Text fw={700} size="sm">
                  {(cell.T_K - 273.15).toFixed(0)} °C · {(cell.P_Pa / 1e5).toFixed(2)} bar
                </Text>
                <Button size="compact-xs" variant="subtle" onClick={() => setCell(null)}>close</Button>
              </Group>
              <Text size="xs" c="dimmed">
                Equilibrium composition of THIS solved cell (no interpolation):
              </Text>
              <Table withTableBorder striped highlightOnHover fz="xs">
                <Table.Tbody>
                  {data.species.map((sp) => (
                    <Table.Tr key={sp}>
                      <Table.Td><Code>{sp}</Code></Table.Td>
                      <Table.Td style={{ textAlign: "right" }}>
                        {Number.isFinite(cell.x[sp] ?? NaN) ? (cell.x[sp] as number).toPrecision(5) : "—"}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                  <Table.Tr>
                    <Table.Td><Text size="xs" fw={600}>{mtype}</Text></Table.Td>
                    <Table.Td style={{ textAlign: "right" }}>
                      <Text size="xs" fw={600}>{cell.metric.toPrecision(5)}</Text>
                    </Table.Td>
                  </Table.Tr>
                </Table.Tbody>
              </Table>
              <Group justify="space-between">
                <Text size="xs" c="dimmed">The gibbsReactor case for this point:</Text>
                <Button size="compact-xs" variant="light"
                  onClick={() => {
                    navigator.clipboard?.writeText(
                      gibbsReactorDictFor(cell, elements, speciesAtoms, feed));
                    setCopied(true); setTimeout(() => setCopied(false), 1500);
                  }}>
                  {copied ? "copied ✓" : "copy dict"}
                </Button>
              </Group>
              <Code block style={{ fontSize: 10, whiteSpace: "pre" }}>
                {gibbsReactorDictFor(cell, elements, speciesAtoms, feed)}
              </Code>
            </Stack>
          </ScrollArea>
        </Box>
      )}
    </Box>
  );
}
