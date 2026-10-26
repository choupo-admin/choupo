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
  StatusBar -- the app's foot: WHICH engine this tab runs, and which adapter
  answered the last run (DEV.md 4c C172 item 5).

  Both used to sit in the top bar beside the case's identity and its Run, as
  badges the eye met before the case's question.  They are true and worth
  having -- a user landing on /app/ must know what they are about to run, and
  a MOCK run must be unmistakable -- but they are implementation metadata,
  not the case, so they live here: one thin row, read when wanted.

  The version is the stamp the WASM build writes BESIDE the binaries
  (wasm/version.json, case/engineVersion.ts).  An unreadable or missing stamp
  shows NO version rather than a plausible default: bin/runGui refuses the
  stamp-vs-binary mismatch where both are on disk, which this component
  cannot do.  The adapter is the store's `adapterKind`, set by the TopBar's
  run orchestrator; a MOCK run is drawn in yellow, never quietly.
\*---------------------------------------------------------------------------*/

import { Badge, Group, Text, Tooltip } from "@mantine/core";
import { useEffect, useState } from "react";

import { engineVersionLabel, fetchEngineVersion, type EngineVersion } from "../case/engineVersion.js";
import { useStore } from "../state/store.js";

export const STATUS_BAR_PX = 24;

export function StatusBar() {
  const [engineVersion, setEngineVersion] = useState<EngineVersion | null>(null);
  useEffect(() => {
    fetchEngineVersion(import.meta.env.BASE_URL).then((v) => { if (v) setEngineVersion(v); });
  }, []);
  const adapter = useStore((s) => s.adapterKind);
  return (
    <Group component="footer" role="contentinfo" gap="sm" px="sm" wrap="nowrap" data-status-bar=""
      style={{ height: STATUS_BAR_PX, minWidth: 0, overflow: "hidden",
        borderTop: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
        background: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-7))" }}>
      {engineVersion && (
        <Tooltip withArrow multiline w={260}
          label={engineVersion.version === "Choupo-dev"
            ? "Development build (the continuously-updated latest, OpenFOAM-dev style) -- no stability promises.  Stable releases: choupo.org/releases"
            : "The engine version this app runs -- releases, development line and citation at choupo.org/releases"}>
          <Badge size="xs" radius="sm" variant="light" data-engine-version=""
            color={engineVersion.version === "Choupo-dev" ? "orange" : "gray"}
            styles={{ root: { textTransform: "none", cursor: "help", fontSize: 11, height: 18,
              //  the light variant's own text is 2.3:1 on its tint (C168 audit)
              color: engineVersion.version === "Choupo-dev"
                ? "light-dark(var(--mantine-color-orange-9), var(--mantine-color-orange-3))"
                : "light-dark(var(--mantine-color-dark-7), var(--mantine-color-gray-1))" } }}>
            {engineVersionLabel(engineVersion)}
          </Badge>
        </Tooltip>
      )}
      {adapter && (
        <Tooltip withArrow multiline w={260}
          label={adapter === "wasm"
            ? "The last run used the real engine, compiled to WebAssembly and run in this browser."
            : "The last run used the MOCK solver: its numbers are NOT real."}>
          <Badge size="xs" radius="sm" variant="light" data-adapter={adapter}
            color={adapter === "wasm" ? "accent" : "yellow"}
            styles={{ root: { fontSize: 11, height: 18,
              color: "light-dark(var(--mantine-color-dark-7), var(--mantine-color-gray-1))" } }}>
            {adapter === "wasm" ? "engine: WASM" : `engine: ${adapter.toUpperCase()}`}
          </Badge>
        </Tooltip>
      )}
      {!engineVersion && !adapter && (
        <Text size="11px" c="dimmed">no engine stamp and no run yet in this tab</Text>
      )}
    </Group>
  );
}
