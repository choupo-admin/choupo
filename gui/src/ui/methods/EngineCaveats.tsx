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
  EngineCaveats -- the engine's own warnings on the runs behind the page,
  drawn ONCE by the tool frame above every EduTool (DEV.md 4c C112, point
  17; the collection is case/engineCaveats.ts).  When a knob takes a witness
  outside a model's declared range, this is where the page says so, in the
  engine's words and with the component or unit they are about -- so a curve
  drawn past a correlation's validity is never drawn in silence.

  One thin row when there is something to say, folded to a count with a
  visible toggle; nothing at all when the runs raised no warning (silence
  keeps meaning "nothing raised").
\*---------------------------------------------------------------------------*/

import { useState } from "react";
import { Box, Group, Stack, Text, UnstyledButton } from "@mantine/core";

import { useEngineCaveats } from "../../case/engineCaveats.js";

export function EngineCaveats(): JSX.Element | null {
  const caveats = useEngineCaveats();
  const [open, setOpen] = useState(false);
  if (caveats.length === 0) return null;
  const validity = caveats.filter((c) => c.category === "validity").length;
  return (
    <Box px={12} pb={4} style={{ flexShrink: 0 }} data-engine-caveats={caveats.length}>
      <Group gap={6} wrap="wrap" align="center">
        <Text size="xs" c="yellow.8" fw={600}>
          The engine flagged {caveats.length} caveat{caveats.length === 1 ? "" : "s"}
          {validity > 0 ? ` (${validity} about a model used outside its validity)` : ""}
          {" "}on the runs behind this page.
        </Text>
        <UnstyledButton onClick={() => setOpen((o) => !o)} aria-expanded={open}
          style={{ fontSize: "var(--mantine-font-size-xs)",
            color: "var(--mantine-color-anchor)", textDecoration: "underline" }}>
          {open ? "hide them" : "read them"}
        </UnstyledButton>
      </Group>
      {open && (
        <Stack gap={2} mt={4}>
          {caveats.map((c) => (
            <Text key={`${c.category}|${c.locus}|${c.message}`} size="xs"
              style={{ whiteSpace: "normal", overflowWrap: "anywhere", lineHeight: 1.3 }}>
              <Text span fw={600}>[{c.category}] {c.locus}:</Text> {c.message}
            </Text>
          ))}
        </Stack>
      )}
    </Box>
  );
}
