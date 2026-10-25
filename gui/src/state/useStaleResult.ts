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

import { changedParts, declaredInputsOf, stalenessOf, type Staleness } from "../case/staleness.js";
import { useStore } from "./store.js";
import { useCaseMode } from "./useCaseMode.js";

/** WHICH run the screen draws: a two-mode case shown in Properties & data
 *  draws its props run (store.propsRunResult, DEV.md 4c C157), so its
 *  staleness is that run's stamp against the case -- never the Process
 *  run's, which a fit's own record would otherwise make read as stale. */
function useDrawnRun(): { result: unknown; inputs: ReturnType<typeof useStore.getState>["runInputs"] } {
  const { modes, propsView } = useCaseMode();
  const props = modes !== null && propsView;
  const runResult = useStore((s) => (props ? s.propsRunResult : s.runResult));
  const runInputs = useStore((s) => (props ? s.propsRunInputs : s.runInputs));
  return { result: runResult, inputs: runInputs };
}

export function useStaleResult(): Staleness {
  const caseFiles = useStore((s) => s.caseFiles);
  const scratchEdits = useStore((s) => s.scratchEdits);
  const { result: runResult, inputs: runInputs } = useDrawnRun();
  return useMemo(
    () => stalenessOf(declaredInputsOf(caseFiles, scratchEdits), runInputs, !!runResult),
    [caseFiles, scratchEdits, runInputs, runResult],
  );
}

/** The same question, with the PARTS that differ (case/staleness.ts
 *  `changedParts`; null when the run's stamp carries none) -- for a reader
 *  that can attribute a part to what it draws (the props calculation map,
 *  DEV.md 4c C154). */
export function useStaleParts(): Staleness & { changed: string[] | null } {
  const caseFiles = useStore((s) => s.caseFiles);
  const scratchEdits = useStore((s) => s.scratchEdits);
  const { result: runResult, inputs: runInputs } = useDrawnRun();
  return useMemo(() => {
    const now = declaredInputsOf(caseFiles, scratchEdits);
    return { ...stalenessOf(now, runInputs, !!runResult), changed: changedParts(now, runInputs) };
  }, [caseFiles, scratchEdits, runInputs, runResult]);
}
