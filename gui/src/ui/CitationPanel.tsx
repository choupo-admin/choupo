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
  CitationPanel -- HOW TO CITE, drawn (DEV.md 4c C171 B).  It draws the text
  case/citation.ts composes and formats nothing itself: the Help menu's
  "How to cite…" and every case's About show this one panel, and the zip's
  CITATION.txt is the same text.  A copy button, because the text exists to
  be pasted into a bibliography.
\*---------------------------------------------------------------------------*/

import { Alert, Box, Button, CopyButton, Group, Text } from "@mantine/core";
import { useEffect, useState } from "react";

import { caseCitations, citationText } from "../case/citation.js";
import { engineVersionSnapshot, loadEngineVersion, type EngineVersion } from "../case/engineVersion.js";
import type { JsonDict } from "../dict/index.js";

/** The engine this page runs, read once per page (null until read, or when
 *  there is no stamp -- the text then says so). */
export function useEngineVersionStamp(): EngineVersion | null {
  const [v, setV] = useState<EngineVersion | null>(engineVersionSnapshot());
  useEffect(() => {
    let live = true;
    loadEngineVersion(import.meta.env.BASE_URL).then((r) => { if (live) setV(r); });
    return () => { live = false; };
  }, []);
  return v;
}

/** The citation for a case (`controlDict` given) or for Choupo alone (null). */
export function CitationPanel({ controlDict }: { controlDict: JsonDict | null }) {
  const engine = useEngineVersionStamp();
  const refs = controlDict ? caseCitations(controlDict) : null;
  const text = citationText(refs ? refs.citations : null, engine);
  return (
    <Box data-citation="">
      {refs?.problem && (
        <Alert color="red" variant="light" mb="xs" p="xs">
          <Text size="sm">{refs.problem}</Text>
        </Alert>
      )}
      <Box component="pre" data-citation-text=""
        style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0,
          fontSize: 13, lineHeight: 1.45, padding: "8px 10px", borderRadius: 4,
          fontFamily: "var(--mantine-font-family-monospace)",
          background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))",
          border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))" }}>
        {text}
      </Box>
      <Group gap="xs" mt="xs">
        <CopyButton value={text}>
          {({ copied, copy }) => (
            <Button size="xs" variant="default" onClick={copy}>
              {copied ? "Copied" : "Copy the citation"}
            </Button>
          )}
        </CopyButton>
        <Text size="xs" c="dimmed">
          A downloaded case carries the same text as CITATION.txt.
        </Text>
      </Group>
    </Box>
  );
}
