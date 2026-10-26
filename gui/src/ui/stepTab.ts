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
  stepTab -- A STEP IN ITS OWN TAB (DEV.md 4c C172 slice 3b; Vitor: "um
  double click na caixa fazia abrir um tab com tudo detalhado!").

  The workflow's counterpart of a unit's INTERNALS page (ui/unitFocus.ts):
  a double click on a step's box -- or Enter, or the card's "Open" -- opens
  a NEW browser tab with everything about that step: its results, figures,
  parameters, verdict, and what it reads and writes.  Pop-out beats modal
  (gui-credo §2.4): the diagram stays where the reader left it.

  THE STASH.  The tab is a real tab (gui-credo §4, "Tab citizenship"): the
  parent writes the case it shows and the properties run under ONE stable
  key per case (latest wins, never consumed), so F5 reproduces the tab and
  two steps of one case share one copy -- a run's CSVs can be megabytes, and
  a key per step would multiply them.  The address names the step:
  `?step=<key>&id=op:<first op>`.  A stash that is gone, or too large for
  the browser's storage, is said by name, never a blank tab.
\*---------------------------------------------------------------------------*/

import type { RunResult } from "../adapters/SolverAdapter.js";
import type { CaseFiles } from "../case/types.js";
import { caseModesOf } from "../case/caseModes.js";

/** The stash key of a case's step tabs. */
export function stepStashKey(caseName: string): string {
  return `choupo.step.${caseName}`;
}

/** What the parent leaves for a step tab. */
export interface StepStash {
  caseName: string;
  files: CaseFiles;
  /** the properties run, when there is one */
  result: RunResult | null;
}

/** The address of a step's tab. */
export function stepTabSearch(key: string, stepId: string): string {
  return `?step=${encodeURIComponent(key)}&id=${encodeURIComponent(stepId)}`;
}

/** The step a step tab's address names, "" none. */
export function stepIdInSearch(search: string): string {
  return new URLSearchParams(search).get("id") ?? "";
}

/** The stash a step tab's address names, or null. */
export function readStepStash(search: string): StepStash | null {
  if (typeof window === "undefined") return null;
  const key = new URLSearchParams(search).get("step");
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as StepStash : null;
  } catch {
    return null;
  }
}

/** Open a step of the open case in its own tab.  The run's log is left out
 *  of the stash (the Log is the parent's); everything else the step's page
 *  reads travels. */
export function openStepTab(stepId: string): void {
  void import("../state/store.js").then(({ useStore }) => {
    const st = useStore.getState();
    const twoMode = caseModesOf(st.caseFiles) !== null;
    const result = (twoMode ? st.propsRunResult : st.runResult) ?? null;
    const key = stepStashKey(st.tutorialName || "case");
    const stash: StepStash = {
      caseName: st.tutorialName,
      files: st.caseFiles,
      result: result ? { ...result, log: "" } : null,
    };
    try {
      window.localStorage.setItem(key, JSON.stringify(stash));
    } catch {
      void import("@mantine/notifications").then(({ notifications }) => notifications.show({
        color: "orange", autoClose: 8000,
        message: "This case's run is too large for the browser's storage, so the step cannot open in a tab of its own.  "
          + "Its card beside the diagram shows what it reads, the model, what it writes and its verdict.",
      }));
      return;
    }
    const w = window.open(`${window.location.pathname}${stepTabSearch(key, stepId)}`, "_blank");
    if (w) w.opener = null;
  });
}
