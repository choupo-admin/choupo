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
  DeclaredViews -- A FLOWSHEET CASE'S OWN FIGURES AND TABLES, first in its
  results (C271).

  A steady case declares `references` and `views` in `system/postDict`, the
  grammar a props case declares in its propsDict; the ENGINE resolves every
  name, scales every unit, computes every difference and writes the numbers,
  which ride the result's `postProcessing` block and the CSVs under
  `postProcessing/` (docs/design/a-post-processing-dictionary.md, section 7).
  This component DRAWS them -- with the same `ViewFigure` and table renderer a
  props run's review screen uses, each with the author's note -- in the order
  the case declares them.  It computes nothing: a number the engine did not
  write is not drawn.

  The home is the Plots workspace (the results' graphics, where a student
  goes after a run): its first row, and the view it lands on when the run
  carries any.  A case that declares none shows nothing here and nothing
  moves.
\*---------------------------------------------------------------------------*/

import { Box, Text } from "@mantine/core";

import type { RunResult } from "../adapters/SolverAdapter.js";
import { declaredViewsOf } from "../case/postProcessing.js";
import { ViewFigure } from "./plotting/ViewFigure.js";

export function DeclaredViews({ result }: { result: Pick<RunResult, "postProcessing" | "csvFiles"> }) {
  const items = declaredViewsOf(result.postProcessing);
  const csvFiles = result.csvFiles ?? {};
  if (items.length === 0) {
    return <Text size="sm" c="dimmed">This case declares no views (`views` in system/postDict).</Text>;
  }
  return (
    <Box data-declared-views="" style={{ display: "grid", gap: 12,
      gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))" }}>
      {items.map((it) => (
        <Box key={`${it.op}/${it.name}`} data-declared-view={it.name}
          style={{ minWidth: 0, ...(it.kind === "table" ? { gridColumn: "1 / -1" } : {}) }}>
          <ViewFigure item={it} csv={csvFiles[it.file]} references={result.postProcessing?.references} />
        </Box>
      ))}
    </Box>
  );
}
