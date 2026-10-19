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
  Honest "expired" panel for an isolated pop-out tab (?focus= / ?internals= /
  ?explore=mccabe&key= / ?layout=)
  whose localStorage stash is gone (cleared storage, a different browser, a
  pre-stable-key build).  A pop-out tab is a REAL tab: when its source is gone
  it refuses honestly instead of silently degrading into the welcome / parent
  screen while its URL claims otherwise (gui-credo §4 "Tab citizenship").
\*---------------------------------------------------------------------------*/

import { Alert, Box, Text } from "@mantine/core";
import { IconClockX } from "@tabler/icons-react";

export function ExpiredTabPanel({ kind }: {
  kind: "focus" | "internals" | "explore" | "layout" | "building";
}) {
  const what = kind === "focus" ? "mini-flowsheet" : kind === "explore" ? "McCabe-Thiele"
    : kind === "layout" ? "3D plant layout" : kind === "building" ? "GMP building" : "internals";
  return (
    <Box
      style={{
        height: "var(--choupo-vh)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))",
      }}
    >
      <Alert
        color="yellow"
        variant="light"
        icon={<IconClockX size={18} />}
        title={`This ${what} tab has expired`}
        maw={480}
      >
        <Text size="sm">
          Its data was stashed by the parent case and is gone (storage
          cleared, or a different browser).  {kind === "explore"
            ? "Reopen it from EduTools in the top bar — pick “Distillation (McCabe-Thiele)”, choose the two compounds, and press the pop-out button in its toolbar."
            : kind === "layout"
            ? "Reopen it from the parent — run the case, open Reports → “Plant layout (3D)” and press “Open in new tab” (or the same button under the EduTools plant-layout bench)."
            : kind === "building"
            ? "Reopen it from the parent — run the case, open Reports → “Plant layout (3D)” and press “Open in new tab” beside “GMP interior”.  A case that declares no building {} in its layoutDict has none to open."
            : "Reopen it from the parent case — double-click the unit on the flowsheet."}
        </Text>
      </Alert>
    </Box>
  );
}
