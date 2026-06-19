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
  Choupo GUI -- Colours menu in the TopBar

  Two orthogonal choices, persisted with the display-unit prefs (no solver
  re-run, no disk write to the case):

    Encoding (colorMode)  -- what the stream colour MEANS
        phase        (default)  semantic phase from the solver (vf + solids)
        temperature             viridis gradient over the run's T range
        pressure                viridis gradient over the run's P range

    Palette (colorScheme) -- which phase colours are used in `phase` mode
        default                 the project cyan / orange lineup
        cvd-safe                colour-blind-safe + projector-legible

  Sibling of the Units menu (same store + persistence pattern).  Phase is the
  shipped default and one click away; the property modes are an opt-in
  re-encoding with a continuous-scale legend on the canvas
  (docs/ai/gui-credo.md: phase colour is semantic and never repainted on
  interaction --- a deliberate display MODE is the sanctioned exception).
\*---------------------------------------------------------------------------*/

import { ActionIcon, Box, Menu, Text } from "@mantine/core";
import { IconPalette, IconCheck } from "@tabler/icons-react";

import { useStore } from "../state/store.js";
import { type ColorMode, type ColorScheme, type ColorMap, gradientCss } from "./plotting/palette.js";

const MODE_OPTS: { value: ColorMode; label: string; hint: string }[] = [
  { value: "phase", label: "Phase", hint: "vapour / liquid / two-phase (solver)" },
  { value: "temperature", label: "Temperature", hint: "gradient over T (blue → red)" },
  { value: "pressure", label: "Pressure", hint: "gradient over P (blue → red)" },
];

const MAP_OPTS: { value: ColorMap; label: string; hint: string }[] = [
  { value: "turbo", label: "Turbo", hint: "blue → green → red (intuitive, default)" },
  { value: "coolwarm", label: "Cool–Warm", hint: "blue → grey → red (ParaView default)" },
  { value: "viridis", label: "Viridis", hint: "colour-blind-safe (not T-intuitive)" },
];

const SCHEME_OPTS: { value: ColorScheme; label: string; hint: string }[] = [
  { value: "default", label: "Default", hint: "project cyan / orange" },
  { value: "cvd-safe", label: "Colour-blind-safe", hint: "deuteranopia + projector" },
];

export function ColoursMenu() {
  const colorMode = useStore((s) => s.displayPrefs.colorMode);
  const colorScheme = useStore((s) => s.displayPrefs.colorScheme);
  const colorMap = useStore((s) => s.displayPrefs.colorMap);
  const setPrefs = useStore((s) => s.setDisplayPrefs);

  const modeLabel = MODE_OPTS.find((o) => o.value === colorMode)?.label ?? colorMode;
  const summary =
    colorMode === "phase"
      ? `phase · ${colorScheme === "cvd-safe" ? "cvd-safe" : "default"}`
      : `${modeLabel.toLowerCase()} gradient`;

  return (
    <Menu shadow="md" width={260} position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          size="lg"
          aria-label="Stream colours"
          title={`Stream colours: ${summary}`}
        >
          <IconPalette size={18} />
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>Colour by</Menu.Label>
        {MODE_OPTS.map((o) => (
          <Menu.Item
            key={o.value}
            onClick={() => setPrefs({ colorMode: o.value })}
            rightSection={o.value === colorMode ? <IconCheck size={14} /> : null}
          >
            <Text size="sm" fw={500}>
              {o.label}
            </Text>
            <Text size="xs" c="dimmed">
              {o.hint}
            </Text>
          </Menu.Item>
        ))}

        {colorMode !== "phase" && (
          <>
            <Menu.Divider />
            <Menu.Label>Gradient ({colorMode})</Menu.Label>
            {MAP_OPTS.map((o) => (
              <Menu.Item
                key={o.value}
                onClick={() => setPrefs({ colorMap: o.value })}
                rightSection={o.value === colorMap ? <IconCheck size={14} /> : null}
              >
                <Text size="sm" fw={500}>
                  {o.label}
                </Text>
                <Box
                  style={{
                    height: 8,
                    borderRadius: 2,
                    margin: "2px 0",
                    background: gradientCss(o.value),
                  }}
                />
                <Text size="xs" c="dimmed">
                  {o.hint}
                </Text>
              </Menu.Item>
            ))}
          </>
        )}

        <Menu.Divider />
        <Menu.Label>Phase palette</Menu.Label>
        {SCHEME_OPTS.map((o) => (
          <Menu.Item
            key={o.value}
            onClick={() => setPrefs({ colorScheme: o.value })}
            rightSection={o.value === colorScheme ? <IconCheck size={14} /> : null}
          >
            <Text size="sm" fw={500}>
              {o.label}
            </Text>
            <Text size="xs" c="dimmed">
              {o.hint}
            </Text>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
