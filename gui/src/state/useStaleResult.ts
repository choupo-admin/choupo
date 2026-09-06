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
  useStaleResult -- the ONE place the app asks "is what I am drawing still the
  answer to what is declared?".  The decision itself lives in
  case/staleness.ts (pure, tested without a browser); this is only the store
  binding, so the three surfaces that dim -- the canvas, the result
  workspaces, and the Run control's count -- cannot drift into three different
  answers.
\*---------------------------------------------------------------------------*/

import { useMemo } from "react";

import { applyScratch } from "../case/scratch.js";
import { runInputsOf, stalenessOf, type Staleness } from "../case/staleness.js";
import { useStore } from "./store.js";

export function useStaleResult(): Staleness {
  const caseFiles = useStore((s) => s.caseFiles);
  const scratchEdits = useStore((s) => s.scratchEdits);
  const runResult = useStore((s) => s.runResult);
  const runInputs = useStore((s) => s.runInputs);
  return useMemo(
    () => stalenessOf(runInputsOf(applyScratch(caseFiles, scratchEdits), scratchEdits),
                      runInputs, !!runResult),
    [caseFiles, scratchEdits, runInputs, runResult],
  );
}
