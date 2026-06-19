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

import {
  MantineProvider,
  localStorageColorSchemeManager,
} from "@mantine/core";
import { Notifications } from "@mantine/notifications";

import { AppShell } from "./ui/AppShell.js";
import { ErrorBoundary } from "./ui/ErrorBoundary.js";
import { LiveReload } from "./ui/LiveReload.js";
import { theme } from "./theme.js";

// Persist the student's light/dark/auto choice across reloads.  First-ever
// load (nothing stored) falls back to `defaultColorScheme` below.
const colorSchemeManager = localStorageColorSchemeManager({
  key: "choupo-color-scheme",
});

export function App() {
  // The GUI boots BLANK (no case auto-loaded -- see store.bootCase).  The last
  // case is reachable via File -> "Reopen last…"; we no longer restore it on
  // mount.
  //
  // Colour scheme: default LIGHT so a student's first impression is bright and
  // welcoming (not a funeral).  A 3-way toggle in the TopBar (light / dark /
  // system) lets anyone override; the choice persists via colorSchemeManager.
  // "system" = follow the OS/browser `prefers-color-scheme`.

  return (
    <MantineProvider
      theme={theme}
      defaultColorScheme="light"
      colorSchemeManager={colorSchemeManager}
    >
      <Notifications position="bottom-right" zIndex={1000} />
      <LiveReload />
      <ErrorBoundary scope="AppShell">
        <AppShell />
      </ErrorBoundary>
    </MantineProvider>
  );
}
