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
  Stream terminal node (feed source / product sink).
\*---------------------------------------------------------------------------*/

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Group, Stack, Text, Tooltip } from "@mantine/core";
import { IconBolt } from "@tabler/icons-react";

import type { StreamSpec } from "../case/types.js";
import { scalarToSI } from "../dict/scalarSI.js";
import { useStore } from "../state/store.js";
import { phaseColor as phaseColorFor } from "./plotting/palette.js";
import {
  formatFlow,
  formatTemperature,
  formatPressure,
  temperatureLabel,
  pressureLabel,
  flowBasis,
  type FlowUnit,
  type TemperatureUnit,
  type PressureUnit,
} from "../state/displayUnits.js";

interface StreamTerminalData {
  name: string;
  role: "feed" | "product";
  stream: StreamSpec | null;
  /** Phase colour from the latest run, if any.  Drives the border so the
   *  eye traces a stream end-to-end (terminal border + edge stroke). */
  phaseColor?: string;
  /** Phase label ("liquid", "vapour", "slurry",...) -- shown as a
   *  small chip when present. */
  phaseLabel?: string;
  /** Compact phase GLYPH (L / V / 2φ / S+L / S) shown coloured on the chip
   *  header, with the full word on hover -- less verbose than the word, never
   *  colour-alone (accessibility). */
  phaseGlyph?: string;
  /** Utility category from the latest run (e.g. "steamLP", "coolingWater").
   *  Non-undefined means this terminal is a plant utility, not a process
   *  feed/product -- shown with a bolt icon + the category name. */
  utilityCategory?: string;
  /** Resolved conditions from the latest converged run (F kmol/s, F_mass
   *  kg/s, T K, P Pa).  Preferred over the dict spec so a utility stream
   *  whose T comes from the catalogue reads its real value, not 0. */
  resolved?: { F: number; F_mass?: number; F_solid_mass?: number; F_solid?: number; T: number; P: number; vf?: number };
  /** Deterministic PFD stream number (GUI-derived) + whether the SHOW toggle
   *  wants it rendered.  A small badge before the name; the same number keys
   *  the Streams table. */
  streamNumber?: number;
  showNumbers?: boolean;
  /** For a renamed boundary outlet: the child-qualified origin
   *  (e.g. "DRYING/ExhaustClean") shown as a subordinate "from ..." line so
   *  the rename is visible, never silent. */
  streamOrigin?: string;
  /** Distillation duty stub: "reboiler" (heating, docks at the column's
   *  base) or "condenser" (cooling, top).  dutyKW is filled post-run from
   *  the column's Q_reboiler_kW / Q_condenser_kW KPI. */
  dutyPort?: "reboiler" | "condenser" | "Q" | "power";
  tier?: "heating" | "cooling" | "power";
  dutyKW?: number;
  /** Utility named explicitly on the column port (operation.<port>.utility).
   *  When absent the allocation picks one by temperature level. */
  utilityName?: string;
  /** Allocated utility + cost from the latest run (the solver's
   *  utilityAllocation) --- authoritative; shown in preference to the
   *  declared utilityName once a run exists. */
  dutyUtility?: string;
  dutyEurH?: number;
  [key: string]: unknown;
}

export function StreamTerminal({ data, selected }: NodeProps) {
  const { name, role, stream, phaseColor, phaseLabel, phaseGlyph, utilityCategory, resolved,
          streamNumber, showNumbers, streamOrigin,
          dutyPort, tier, dutyKW, utilityName, dutyUtility, dutyEurH } =
    data as StreamTerminalData;
  const prefs = useStore((s) => s.displayPrefs);

  // Distillation duty stub (reboiler / condenser): a compact tier-coloured
  // marker docked to the column's base / top, with its source handle
  // pointing at the column.  Conveys "heat at the base, cold at the top".
  if (dutyPort) {
    const isPower = tier === "power";
    const heating = tier === "heating";
    const color = isPower ? "#9775fa" : heating ? "#e8590c" : "#22b8cf";
    const icon = isPower ? "⚡" : heating ? "♨" : "❄";
    // Stub docks below the unit for heating + power (handle points up), above
    // for cooling.  W (shaft work) for the power tier, Q (heat) otherwise.
    const handleTop = heating || isPower;
    const valLabel = isPower ? "W" : "Q";
    return (
      <div
        style={{
          background: "rgba(0,0,0,0.35)",
          border: `1.5px dashed ${color}`,
          borderRadius: 8,
          padding: "5px 9px",
          minWidth: 96,
          fontFamily: "Inter, sans-serif",
          boxShadow: selected ? `0 0 0 2px ${color}` : "none",
        }}
      >
        <Handle type="source"
          position={handleTop ? Position.Top : Position.Bottom}
          style={{ background: color, width: 8, height: 8 }} />
        <Group gap={5} wrap="nowrap">
          <Text size="13px">{icon}</Text>
          <Text size="10px" fw={700} ff="monospace" tt="uppercase"
                style={{ color, letterSpacing: 0.4 }}>
            {dutyPort === "Q" ? "duty" : dutyPort}
          </Text>
          {/* Allocated utility (post-run, authoritative) wins over the
              declared name; e.g. "steamLP", "electricity", "(carried...)". */}
          {(dutyUtility ?? utilityName) && (
            <Text size="10px" fw={600} ff="monospace" c="dimmed">
              {dutyUtility ?? utilityName}
            </Text>
          )}
        </Group>
        <Text size="xs" c="dimmed" ff="monospace">
          {dutyKW !== undefined && Number.isFinite(dutyKW)
            ? `${valLabel} = ${dutyKW > 0 ? "+" : ""}${dutyKW.toFixed(1)} kW`
            : isPower ? "electricity" : heating ? "heating" : "cooling"}
          {dutyEurH !== undefined && Number.isFinite(dutyEurH) && dutyEurH !== 0
            ? `  ·  ${dutyEurH.toFixed(1)} €/h`
            : ""}
        </Text>
      </div>
    );
  }

  const isFeed = role === "feed";
  const isUtility = utilityCategory !== undefined && utilityCategory !== "";

  // The phase palette hues are tuned for a DARK canvas; on a white (light-mode)
  // chip the bright cyan/orange wash out.  onChip darkens a phase colour for
  // light mode (color-mix toward black) while keeping the bright hue on dark,
  // so the glyph / L / V / border stay legible in BOTH themes.
  const onChip = (c: string) =>
    `light-dark(color-mix(in srgb, ${c} 58%, black), ${c})`;

  // Phase colour is SEMANTIC -- it never changes on selection.
  // Selection signals through a halo box-shadow ring in the project
  // accent; the phase-coloured border underneath stays put.
  const borderColor = phaseColor
    ? onChip(phaseColor)
    : "light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-3))";
  // Solid border once we have a phase (post-run); dashed otherwise so
  // the pre-run terminal still reads as a boundary marker, not a unit.
  const borderStyle = phaseColor ? "solid" : "dashed";
  // Two-phase: show the L/V fractions INLINE after the name (L then V, each in
  // its own phase colour); single-phase shows just the glyph.  vf is the engine
  // flash result (post-run); no repetition on the state line below.
  const vfVal = resolved?.vf;
  const isTwoPhase = vfVal !== undefined && vfVal > 0.001 && vfVal < 0.999;
  const liqColor = onChip(phaseColorFor("liquid", prefs.colorScheme));
  const vapColor = onChip(phaseColorFor("vapour", prefs.colorScheme));

  return (
    <div
      style={{
        background: "light-dark(var(--mantine-color-white), transparent)",
        border: `1.5px ${borderStyle} ${borderColor}`,
        borderRadius: 18,
        padding: "8px 12px",
        minWidth: 110,
        fontFamily: "Inter, sans-serif",
        transition: "border-color 150ms ease, border-style 150ms ease, box-shadow 150ms ease",
        boxShadow: selected
          ? "0 0 0 2px var(--mantine-color-accent-3), 0 0 8px rgba(38, 198, 218, 0.4)"
        : "var(--mantine-shadow-sm)",
      }}
    >
      {isFeed ? null : <Handle type="target" position={Position.Left} />}
      <Stack gap={2}>
        {/* FEED / PRODUCT dropped -- redundant: the flowsheet's edge arrows + the
            boundary position already say which is which (Vitor 2026-06-14). Only
            the utility marker stays (it is NOT derivable from the topology). */}
        {isUtility && (
          <Group gap={2} wrap="nowrap">
            <IconBolt size={11} color="var(--mantine-color-yellow-5)" />
            <Text size="10px" fw={600} ff="monospace"
                  style={{ color: "var(--mantine-color-yellow-3)", letterSpacing: 0.4 }}>
              {utilityCategory}
            </Text>
          </Group>
        )}
        {/* Name + phase GLYPH right after it, coloured by the engine's phase
            semantic, full word on hover.  V vapour, L liquid, S solid, 2φ
            two-phase, S+L slurry (VLLE L1/L2 = a later slice). */}
        <Group gap={6} wrap="nowrap" align="center">
          {showNumbers && streamNumber !== undefined && (
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              minWidth: 18, height: 18, padding: "0 4px", borderRadius: 9,
              fontSize: 11, fontWeight: 700, fontFamily: "monospace", lineHeight: 1,
              color: "light-dark(#fff, #111)",
              background: "light-dark(var(--mantine-color-gray-7), var(--mantine-color-gray-4))",
            }}>{streamNumber}</span>
          )}
          <Text size="md" fw={700} c="var(--mantine-color-text)">
            {name}
          </Text>
          {isTwoPhase ? (
            // Two-phase: L and V with their fractions, inline after the name,
            // each in its own phase colour.  No repetition on the line below.
            <Text size="sm" fw={700} ff="monospace" c="dimmed" style={{ letterSpacing: 0.3 }}>
              <span style={{ color: liqColor }}>L {(1 - (vfVal as number)).toFixed(2)}</span>
              {" · "}
              <span style={{ color: vapColor }}>V {(vfVal as number).toFixed(2)}</span>
            </Text>
          ) : phaseGlyph ? (
            <Tooltip label={phaseLabel ?? ""} disabled={!phaseLabel} withArrow openDelay={200}>
              <Text size="sm" fw={700} ff="monospace"
                    style={{ color: phaseColor ? onChip(phaseColor) : undefined, letterSpacing: 0.3, cursor: "default" }}>
                {phaseGlyph}
              </Text>
            </Tooltip>
          ) : null}
        </Group>
        {/* Renamed boundary outlet: show the child origin so the rename is
            visible (the dict name stays primary; this is the subordinate
            "where it came from" -- forum 2026-06-15, no silent crutch). */}
        {streamOrigin && (
          <Text size="10px" c="dimmed" ff="monospace" style={{ letterSpacing: 0.2 }}>
            from {streamOrigin}
          </Text>
        )}
        {(stream || resolved) && (
          <Text size="xs" c="dimmed" ff="monospace">
            {/* T AND P always, no F=/T=/P= prefixes (Vitor 2026-06-11): the
                units already name each quantity -- kg/h is a flow, degC a
                temperature, bar a pressure.  Just the state, clean. */}
            {formatFlowFor(prefs.flow, resolved, stream)}
            {" "}· {formatTfor(prefs.temperature, resolved?.T ?? scalarToSI(stream?.T))}{" "}{temperatureLabel(prefs.temperature)}
            {" "}· {formatPfor(prefs.pressure, resolved?.P ?? scalarToSI(stream?.P))}{" "}{pressureLabel(prefs.pressure)}
          </Text>
        )}
      </Stack>
      {isFeed ? <Handle type="source" position={Position.Right} /> : null}
    </div>
  );
}

// Flow label honouring the molar/mass basis the student picked.  Molar
// reads the SI molar flow (kmol/s); mass reads F_mass (kg/s), which only
// the run result carries --- so pre-run on a mass basis we show "—".
// The flow is the TOTAL of the fluid AND the solid phase (F_solid_mass /
// the solid moles): a crystalliser's `crystals` product is PURE solid
// (fluid F = 0), so a fluid-only label would read 0 and hide the product.
function formatFlowFor(
  flow: FlowUnit,
  resolved: { F: number; F_mass?: number; F_solid_mass?: number; F_solid?: number } | undefined,
  stream: StreamSpec | null,
): string {
  if (flowBasis(flow) === "mass") {
    const fluid = resolved?.F_mass;
    const si = fluid === undefined ? undefined : fluid + (resolved?.F_solid_mass ?? 0);
    if (si !== undefined && Number.isFinite(si) && si > 0) return `${formatFlow(si, flow)} ${flow}`;
    // Pre-run on a mass basis we cannot know kg/h (it needs the molar mass the
    // solver computes) -- but the AUTHORED molar flow IS known, so show it
    // honestly in kmol/h rather than "—": a feed input is always visible.
    const molar = resolved?.F ?? scalarToSI(stream?.F);
    if (molar !== undefined && Number.isFinite(molar) && molar > 0) return `${formatFlow(molar, "kmol/h")} kmol/h`;
    return "—";
  }
  const fluid = resolved?.F ?? scalarToSI(stream?.F);
  const si = fluid === undefined ? undefined : fluid + (resolved?.F_solid ?? 0);
  if (si === undefined || !Number.isFinite(si) || si <= 0) return "—";
  return `${formatFlow(si, flow)} ${flow}`;
}

// Temperature label; treats a missing / non-physical (<= 0 K) value as "—".
function formatTfor(unit: TemperatureUnit, K: number | undefined): string {
  if (K === undefined || !Number.isFinite(K) || K <= 0) return "—";
  return formatTemperature(K, unit);
}

// Pressure label (shown when the canvas colours streams by pressure).
function formatPfor(unit: PressureUnit, Pa: number | undefined): string {
  if (Pa === undefined || !Number.isFinite(Pa) || Pa <= 0) return "—";
  return formatPressure(Pa, unit);
}
