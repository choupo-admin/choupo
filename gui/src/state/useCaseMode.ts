/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  useCaseMode -- which mode the open case is SHOWN in, one home for the shell,
  the menu and the props view (DEV.md 4c C151, C152).

  `propsView` is the one question every surface asks: is the centre the
  Properties & data screen?  True for a props-only case, and for a two-mode
  case in Properties & data; false for a flowsheet-only case and a two-mode
  case in Process.
\*---------------------------------------------------------------------------*/

import { caseModesOf, type CaseMode, type CaseModes } from "../case/caseModes.js";
import { useStore } from "./store.js";

export function useCaseMode(): { modes: CaseModes | null; mode: CaseMode; propsView: boolean } {
  const propsDict = useStore((s) => s.caseFiles.propsDict);
  const flowsheet = useStore((s) => s.caseFiles.flowsheet);
  const controlDict = useStore((s) => s.caseFiles.controlDict);
  const chosen = useStore((s) => s.caseModeFor[s.tutorialName]);
  const modes = caseModesOf({ propsDict, flowsheet, controlDict });
  if (!modes) {
    const props = Boolean(propsDict) && !flowsheet;
    return { modes: null, mode: props ? "props" : "process", propsView: props };
  }
  const mode = chosen ?? modes.defaultMode;
  return { modes, mode, propsView: mode === "props" };
}
