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
  Choupo GUI -- Display menu (units + significant figures) in the TopBar

  Lets the student switch the displayed units for pressure / temperature /
  flow without re-running the solver.  The simulator output stays in
  canonical SI; only the on-screen formatting (StreamsTable, node
  tooltips, plot axes) reacts.

  Flow includes both molar (kmol/h, kmol/s, mol/h, mol/s) and mass
  (kg/h, kg/s, g/h, g/s).  Mass-basis is read straight from the
  `F_mass` field the solver emits, so the GUI never
  needs the per-component molar masses to make the switch.
\*---------------------------------------------------------------------------*/

import {
  ActionIcon,
  Box,
  Chip,
  Group,
  Menu,
  SegmentedControl,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconAdjustments } from "@tabler/icons-react";

import {
  PRESETS,
  type ConcentrationUnit,
  type DisplayPrefs,
  type FlowUnit,
  type PressureUnit,
  type TemperatureUnit,
  type TimeUnit,
} from "../state/displayUnits.js";
import { useStore } from "../state/store.js";
import type { ReactNode } from "react";

// One labelled row of the display sheet: dimmed label left, control fills the rest.
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Group gap="sm" wrap="nowrap" align="center">
      <Text size="xs" c="dimmed" style={{ width: 44, flexShrink: 0 }}>
        {label}
      </Text>
      <Box style={{ flex: 1, minWidth: 0 }}>{children}</Box>
    </Group>
  );
}

const PRESSURE_OPTS: PressureUnit[] = ["bar", "Pa", "kPa", "MPa", "atm", "psi"];
// Flow is split by BASIS into two short rows -- a single row of 8 units is the
// widget that overflows.  Both rows bind the same `flow` pref.
const MOLAR_FLOW: FlowUnit[] = ["kmol/h", "kmol/s", "mol/h", "mol/s"];
const MASS_FLOW: FlowUnit[] = ["kg/h", "kg/s", "g/h", "g/s"];
// Concentration (molality): mol/kg <-> mmol/kg is exact.  mg/L needs a molar
// mass for EVERY plotted species (none for arbitrary speciation tables) -- so
// it is omitted from the UI, not shown greyed-out, until a molar-mass map lands.
const CONC_OPTS: ConcentrationUnit[] = ["mol/kg", "mmol/kg"];
const SIG_OPTS = [2, 3, 4, 5, 6];

const tempLabel = (u: TemperatureUnit) => (u === "degC" ? "°C" : "K");

export function UnitsMenu() {
  const prefs = useStore((s) => s.displayPrefs);
  const setPrefs = useStore((s) => s.setDisplayPrefs);

  type UnitTriple = Pick<DisplayPrefs, "pressure" | "temperature" | "flow">;
  const applyPreset = (p: UnitTriple) => setPrefs(p);

  const summary =
    `${prefs.pressure} · ${prefs.temperature === "degC" ? "°C" : "K"} · ${prefs.flow}`;

  const presetMatches = (p: UnitTriple): boolean =>
    p.pressure === prefs.pressure &&
    p.temperature === prefs.temperature &&
    p.flow === prefs.flow;

  const activePreset =
    Object.entries(PRESETS).find(([, p]) => presetMatches(p))?.[0] ?? "";
  const flowIn = (g: FlowUnit[]) => (g.includes(prefs.flow) ? prefs.flow : "");

  return (
    <Menu shadow="md" width={380} position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          size="lg"
          aria-label="Display settings"
          title={`Display: ${summary}`}
        >
          <IconAdjustments size={18} />
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown>
        <Stack gap="sm" p="xs">
          <Row label="Preset">
            <Chip.Group
              value={activePreset}
              onChange={(v) => {
                const p = PRESETS[v as keyof typeof PRESETS];
                if (p) applyPreset(p);
              }}
            >
              <Group gap={6} wrap="wrap">
                {Object.entries(PRESETS).map(([name, p]) => (
                  <Tooltip
                    key={name}
                    label={`${p.pressure} · ${tempLabel(p.temperature)} · ${p.flow}`}
                    withArrow
                  >
                    <Box>
                      <Chip value={name} size="xs" variant="outline">
                        {name}
                      </Chip>
                    </Box>
                  </Tooltip>
                ))}
              </Group>
            </Chip.Group>
          </Row>

          <Row label="Pressure">
            <SegmentedControl
              fullWidth
              size="xs"
              data={PRESSURE_OPTS}
              value={prefs.pressure}
              onChange={(v) => setPrefs({ pressure: v as PressureUnit })}
            />
          </Row>

          <Group gap="sm" wrap="nowrap" align="center">
            <Text size="xs" c="dimmed" style={{ width: 44, flexShrink: 0 }}>
              Temp
            </Text>
            <SegmentedControl
              size="xs"
              data={[
                { label: "K", value: "K" },
                { label: "°C", value: "degC" },
              ]}
              value={prefs.temperature}
              onChange={(v) => setPrefs({ temperature: v as TemperatureUnit })}
            />
            <Text size="xs" c="dimmed">
              Time
            </Text>
            <SegmentedControl
              size="xs"
              data={["s", "min", "h"]}
              value={prefs.time}
              onChange={(v) => setPrefs({ time: v as TimeUnit })}
            />
          </Group>

          <Row label="Flow">
            <SegmentedControl
              fullWidth
              size="xs"
              data={MOLAR_FLOW}
              value={flowIn(MOLAR_FLOW)}
              onChange={(v) => setPrefs({ flow: v as FlowUnit })}
            />
          </Row>
          <Row label="">
            <SegmentedControl
              fullWidth
              size="xs"
              data={MASS_FLOW}
              value={flowIn(MASS_FLOW)}
              onChange={(v) => setPrefs({ flow: v as FlowUnit })}
            />
          </Row>

          <Row label="Molality">
            <SegmentedControl
              size="xs"
              data={CONC_OPTS}
              value={CONC_OPTS.includes(prefs.concentration) ? prefs.concentration : ""}
              onChange={(v) => setPrefs({ concentration: v as ConcentrationUnit })}
            />
          </Row>

          <Row label="Sig figs">
            <SegmentedControl
              size="xs"
              data={SIG_OPTS.map(String)}
              value={String(prefs.sigFigs)}
              onChange={(v) => setPrefs({ sigFigs: Number(v) })}
            />
          </Row>
        </Stack>
      </Menu.Dropdown>
    </Menu>
  );
}
