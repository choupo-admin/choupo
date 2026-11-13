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
  usePanelPopOut -- the store binding of the panel pop-out (DEV.md 4c C371,
  slice S2), on the useLayoutPopOut precedent.  What a stash holds and when
  it exists is decided in case/panelPopOut.ts (pure, tested); this file only
  reads the store and touches the browser.

    openPanelPopOut()      write the open case's stash and open `?panel=<key>`;
                           a blocked store or popup opens nothing.
    usePanelPopOutFollow   mounted ONCE in the main shell: where a stash for the
                           open case exists, keep it current.
\*---------------------------------------------------------------------------*/

import { useEffect } from "react";

import {
  casePanelStash, followedPanelStash, panelTabKey, panelTabUrl, readPanelStash,
  refreshPanelStash, writePanelStash,
} from "../case/panelPopOut.js";
import { useStore } from "./store.js";

export function openPanelPopOut(): void {
  const stash = casePanelStash(useStore.getState());
  if (!stash) return;
  try {
    const key = writePanelStash(window.localStorage, stash);
    window.open(panelTabUrl(window.location.pathname, key), "_blank", "noopener");
  } catch { /* localStorage / popup blocked -- nothing to do */ }
}

export function usePanelPopOutFollow(): void {
  const tutorialName = useStore((s) => s.tutorialName);
  const runResult = useStore((s) => s.runResult);
  const runInputs = useStore((s) => s.runInputs);
  const caseFiles = useStore((s) => s.caseFiles);
  const scratchEdits = useStore((s) => s.scratchEdits);
  useEffect(() => {
    if (typeof window === "undefined" || tutorialName === "") return;
    let store: Storage;
    try { store = window.localStorage; } catch { return; }
    const prev = readPanelStash(store, panelTabKey(tutorialName));
    if (!prev) return;
    const next = followedPanelStash(
      { tutorialName, runResult, runInputs, caseFiles, scratchEdits }, prev);
    if (next) refreshPanelStash(store, next);
  }, [tutorialName, runResult, runInputs, caseFiles, scratchEdits]);
}
