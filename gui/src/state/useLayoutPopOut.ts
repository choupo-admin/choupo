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
  useLayoutPopOut -- the store binding of the 3D layout pop-out (DEV.md 4c
  C78).  What a stash holds, when it exists and how it follows its parent
  are decided in case/layoutPopOut.ts (pure, tested); this file only reads
  the store and touches the browser.

    openLayoutPopOut(s)    write a stash under its STABLE key and open
                           `?layout=<key>` (the `?internals=` mechanics,
                           ui/unitFocus.ts).  A blocked store or popup opens
                           nothing, never a tab that would boot expired.
    popOutCaseLayout()     the Reports button: the open case's stash, built
                           from the store at the moment of the click.
    useLayoutPopOutFollow  mounted ONCE in the main shell: where a stash for
                           the open case exists, keep it current, so an open
                           tab redraws the parent's latest run and dims when
                           the parent's case has moved since it.  Where none
                           exists it writes nothing, and it reduces the case
                           (a fingerprint) only when one does.
\*---------------------------------------------------------------------------*/

import { useEffect } from "react";

import {
  caseLayoutStash, followedCaseStash, layoutTabKey, layoutTabUrl,
  readLayoutStash, refreshLayoutStash, writeLayoutStash, type LayoutPopOutStash,
} from "../case/layoutPopOut.js";
import { useStore } from "./store.js";

/** Open the `?layout=` tab on a stash. */
export function openLayoutPopOut(stash: LayoutPopOutStash): void {
  try {
    const key = writeLayoutStash(window.localStorage, stash);
    window.open(layoutTabUrl(window.location.pathname, key), "_blank", "noopener");
  } catch { /* localStorage / popup blocked -- nothing to do */ }
}

/** Pop the open case's plot plan out.  Nothing opens when the case has no
 *  drawable layout (the button is not drawn then either). */
export function popOutCaseLayout(): void {
  const stash = caseLayoutStash(useStore.getState());
  if (stash) openLayoutPopOut(stash);
}

export function useLayoutPopOutFollow(): void {
  const tutorialName = useStore((s) => s.tutorialName);
  const runResult = useStore((s) => s.runResult);
  const runInputs = useStore((s) => s.runInputs);
  const caseFiles = useStore((s) => s.caseFiles);
  const scratchEdits = useStore((s) => s.scratchEdits);
  useEffect(() => {
    if (typeof window === "undefined" || tutorialName === "") return;
    let store: Storage;
    try { store = window.localStorage; } catch { return; }
    const prev = readLayoutStash(store, layoutTabKey("case", tutorialName));
    if (!prev) return;
    const next = followedCaseStash(
      { tutorialName, runResult, runInputs, caseFiles, scratchEdits }, prev);
    if (next) refreshLayoutStash(store, next);
  }, [tutorialName, runResult, runInputs, caseFiles, scratchEdits]);
}
