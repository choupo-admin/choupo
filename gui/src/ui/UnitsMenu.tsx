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

import { ActionIcon, Box, Button, Group, Menu, NumberInput, Text, Tooltip } from "@mantine/core";
import { IconAdjustments, IconCheck } from "@tabler/icons-react";

import {
  PRESETS,
  type ConcentrationUnit,
  type DisplayPrefs,
  type FlowUnit,
  type PressureUnit,
  type TemperatureUnit,
  type TimeUnit,
  flowBasis,
} from "../state/displayUnits.js";
import { useStore } from "../state/store.js";

const PRESSURE_OPTS: PressureUnit[] = ["bar", "Pa", "kPa", "MPa", "atm", "psi"];
const TEMP_OPTS: TemperatureUnit[] = ["K", "degC"];
const TIME_OPTS: TimeUnit[] = ["s", "min", "h"];
const FLOW_OPTS: FlowUnit[] = [
  "kmol/h",
  "kmol/s",
  "mol/h",
  "mol/s",
  "kg/h",
  "kg/s",
  "g/h",
  "g/s",
];
// Concentration (molality): mol/kg <-> mmol/kg is exact.  mg/L needs a molar
// mass for EVERY plotted species; the plot layer has none for arbitrary
// speciation tables, so the option stays disabled with an honest tooltip
// (no fake numbers) until a molar-mass map reaches the plots.
const CONC_OPTS: ConcentrationUnit[] = ["mol/kg", "mmol/kg", "mg/L"];
const MG_L_AVAILABLE = false;
const SIG_OPTS = [2, 3, 4, 5, 6];

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

  return (
    <Menu shadow="md" width={260} position="bottom-end" withinPortal>
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
        <Menu.Label>Presets</Menu.Label>
        {Object.entries(PRESETS).map(([name, p]) => (
          <Menu.Item
            key={name}
            onClick={() => applyPreset(p)}
            rightSection={presetMatches(p) ? <IconCheck size={14} /> : null}
          >
            <Text size="sm" fw={500}>
              {name}
            </Text>
            <Text size="xs" c="dimmed">
              {p.pressure} · {p.temperature === "degC" ? "°C" : "K"} · {p.flow}
            </Text>
          </Menu.Item>
        ))}

        <Menu.Divider />
        <Menu.Label>Pressure</Menu.Label>
        {PRESSURE_OPTS.map((u) => (
          <Menu.Item
            key={u}
            onClick={() => setPrefs({ pressure: u })}
            rightSection={u === prefs.pressure ? <IconCheck size={14} /> : null}
          >
            {u}
          </Menu.Item>
        ))}

        <Menu.Divider />
        <Menu.Label>Temperature</Menu.Label>
        {TEMP_OPTS.map((u) => (
          <Menu.Item
            key={u}
            onClick={() => setPrefs({ temperature: u })}
            rightSection={u === prefs.temperature ? <IconCheck size={14} /> : null}
          >
            {u === "degC" ? "°C" : "K"}
          </Menu.Item>
        ))}

        <Menu.Divider />
        <Menu.Label>Time</Menu.Label>
        {TIME_OPTS.map((u) => (
          <Menu.Item
            key={u}
            onClick={() => setPrefs({ time: u })}
            rightSection={u === prefs.time ? <IconCheck size={14} /> : null}
          >
            {u}
          </Menu.Item>
        ))}

        <Menu.Divider />
        <Menu.Label>
          Flow ({flowBasis(prefs.flow) === "mass" ? "mass" : "molar"} basis)
        </Menu.Label>
        {FLOW_OPTS.map((u) => (
          <Menu.Item
            key={u}
            onClick={() => setPrefs({ flow: u })}
            rightSection={u === prefs.flow ? <IconCheck size={14} /> : null}
          >
            {u}
            <Text size="xs" c="dimmed" component="span" ml={6}>
              {flowBasis(u)}
            </Text>
          </Menu.Item>
        ))}

        <Menu.Divider />
        <Menu.Label>Concentration (molality)</Menu.Label>
        {CONC_OPTS.map((u) => {
          if (u === "mg/L" && !MG_L_AVAILABLE) {
            // pointer-events is off on a disabled Menu.Item, so the Tooltip
            // hangs off a wrapping Box to keep the hover alive.
            return (
              <Tooltip
                key={u}
                label="mg/L needs a molar mass for every plotted species — not available for arbitrary speciation tables, so the converted value would be invented"
                multiline
                w={250}
                withArrow
                position="left"
              >
                <Box>
                  <Menu.Item disabled>{u}</Menu.Item>
                </Box>
              </Tooltip>
            );
          }
          return (
            <Menu.Item
              key={u}
              onClick={() => setPrefs({ concentration: u })}
              rightSection={u === prefs.concentration ? <IconCheck size={14} /> : null}
            >
              {u}
            </Menu.Item>
          );
        })}

        <Menu.Divider />
        <Menu.Label>Significant figures</Menu.Label>
        <Group gap={4} px="sm" py={4} wrap="nowrap">
          {SIG_OPTS.map((n) => (
            <Button
              key={n}
              size="compact-xs"
              variant={n === prefs.sigFigs ? "filled" : "default"}
              onClick={() => setPrefs({ sigFigs: n })}
            >
              {n}
            </Button>
          ))}
        </Group>

        <Menu.Divider />
        <Menu.Label>Pinch grid — minor-stream cutoff</Menu.Label>
        <Group gap={8} px="sm" py={4} align="flex-start" wrap="nowrap">
          <NumberInput
            value={prefs.pinchParetoPct}
            onChange={(v) =>
              setPrefs({
                pinchParetoPct:
                  typeof v === "number" ? Math.max(0, Math.min(50, v)) : 5,
              })
            }
            min={0}
            max={50}
            step={1}
            w={90}
            size="xs"
            suffix=" %"
            aria-label="Pinch grid minor-stream cutoff (% of process duty)"
          />
          <Text size="xs" c="dimmed" style={{ flex: 1 }}>
            of the total process duty — smaller streams are omitted from the
            grid DRAWING (announced in its footer); the targets and matches
            always count every stream.  0 % draws all.
          </Text>
        </Group>
      </Menu.Dropdown>
    </Menu>
  );
}
