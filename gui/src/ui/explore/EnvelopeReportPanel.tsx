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
  EnvelopeReportPanel -- how each branch of a mixture P-T envelope ended, in
  the engine's words, beside the figure (EnvelopeLens).  Its own module, with
  no plotting import, so a test can render it from a recorded run.
\*---------------------------------------------------------------------------*/

import { Badge, Box, Stack, Text } from "@mantine/core";

import { branchEndLabel, type EnvelopeReport } from "../../case/phaseEnvelopeLens.js";

/** How each branch ended, in the engine's words, beside the figure.  Exported
 *  so a test can render it from a recorded run without the engine. */
export function EnvelopeReportPanel({ report }: { report: EnvelopeReport }) {
  return (
    <Stack gap={6} style={{ flexShrink: 0 }} data-testid="envelope-report">
      <Text size="xs" fw={600} c="dimmed" tt="uppercase">Where each branch ended, and why (the engine)</Text>
      {report.branches.map((b) => (
        <Box key={b.branch}>
          <Badge size="sm" variant="light" tt="none"
            color={b.end === "stopped" ? "orange" : b.end === "neverStarted" ? "gray" : "teal"}>
            {branchEndLabel(b)}
          </Badge>
          {b.startSentence && <Text size="xs" mt={2}>{b.startSentence}</Text>}
          {b.sentence && <Text size="xs" mt={2}>{b.sentence}</Text>}
          {b.cricondenthermSentence && <Text size="xs" mt={2}>{b.cricondenthermSentence}</Text>}
        </Box>
      ))}
      {report.method && <Text size="xs" c="dimmed">{report.method}</Text>}
      {report.notes.map((l, k) => <Text key={k} size="xs" c="dimmed">{l}</Text>)}
      <Text size="xs" c="dimmed">
        Every point drawn is the engine&apos;s.  The two branches are never joined: where a branch
        stopped, the figure stops, and the nose between them is left open.
      </Text>
    </Stack>
  );
}
