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
  Three-way colour-scheme toggle: Light / Dark / System.  Default is LIGHT
  (see App.tsx) so a student's first impression is bright, not a funeral; the
  choice persists (localStorageColorSchemeManager).  "System" follows the
  OS/browser `prefers-color-scheme`.
\*---------------------------------------------------------------------------*/

import {
  ActionIcon,
  Menu,
  Tooltip,
  useMantineColorScheme,
  type MantineColorScheme,
} from "@mantine/core";
import { IconSun, IconMoon, IconDeviceDesktop } from "@tabler/icons-react";

const ICON = { light: IconSun, dark: IconMoon, auto: IconDeviceDesktop } as const;
const LABEL = { light: "Light", dark: "Dark", auto: "System" } as const;
const ORDER: MantineColorScheme[] = ["light", "dark", "auto"];

export function ColorSchemeToggle() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const Active = ICON[colorScheme];

  return (
    <Menu position="bottom-end" withinPortal width={150}>
      <Menu.Target>
        <Tooltip label={`Theme: ${LABEL[colorScheme]}`} withArrow>
          <ActionIcon
            variant="subtle"
            size="sm"
            color="gray"
            aria-label="Colour scheme"
          >
            <Active size={15} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Theme</Menu.Label>
        {ORDER.map((s) => {
          const I = ICON[s];
          return (
            <Menu.Item
              key={s}
              leftSection={<I size={15} />}
              onClick={() => setColorScheme(s)}
              fw={colorScheme === s ? 700 : undefined}
            >
              {LABEL[s]}
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
}
