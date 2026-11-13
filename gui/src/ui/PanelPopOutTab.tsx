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
  PanelPopOutTab -- the `?panel=<key>` tab: the operator panel full-window, on
  a second screen (DEV.md 4c C371, slice S2).  A thin wrapper on the
  LayoutPopOutTab precedent: read the stash the parent wrote
  (case/panelPopOut.ts), follow the browser's `storage` event, title the tab
  with the case and the run's fingerprint, dim with the sentence saying why
  when the case has moved since the run, refuse honestly when the stash is
  gone.  The board is the SAME one the workspace draws (ui/PanelWorkspace).
\*---------------------------------------------------------------------------*/

import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Text } from "@mantine/core";
import { IconClockExclamation } from "@tabler/icons-react";

import {
  panelKeyOf, panelTabStaleness, panelTabTitle, readPanelStash,
} from "../case/panelPopOut.js";
import { ExpiredTabPanel } from "./ExpiredTabPanel.js";
import { PanelBoard } from "./PanelWorkspace.js";

function readNow(key: string | null) {
  if (!key) return null;
  try { return readPanelStash(window.localStorage, key); } catch { return null; }
}

export function PanelPopOutTab(): JSX.Element {
  const key = useMemo(
    () => (typeof window === "undefined" ? null : panelKeyOf(window.location.search)), []);
  const [stash, setStash] = useState(() => readNow(key));
  useEffect(() => {
    if (!key) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === key || e.key === null) setStash(readNow(key));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);
  const title = stash ? panelTabTitle(stash) : null;
  useEffect(() => { if (title) document.title = title; }, [title]);
  if (!stash) return <ExpiredTabPanel kind="panel" />;
  const stale = panelTabStaleness(stash);
  return (
    <Box style={{
      height: "var(--choupo-vh)", width: "100vw", display: "flex", flexDirection: "column", overflow: "hidden",
      background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))",
    }}>
      {stale.stale && (
        <Alert color="yellow" variant="light" mx="md" mt="sm" py={6} icon={<IconClockExclamation size={16} />}>
          <Text size="xs">
            The case has moved since this run
            {stale.pendingEdits > 0 ? ` (${stale.pendingEdits} edit${stale.pendingEdits === 1 ? "" : "s"} pending)` : ""}
            , so the panel below is the answer to the case as it WAS.  Run the case again in the parent tab and this tab redraws.
          </Text>
        </Alert>
      )}
      <Box className={stale.stale ? "choupo-stale-body" : undefined} style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <PanelBoard report={stash.panel} trajectory={stash.trajectory} caseName={stash.caseName} />
      </Box>
    </Box>
  );
}
