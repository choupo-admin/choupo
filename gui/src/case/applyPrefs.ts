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
  Choupo GUI -- apply the TopBar display preferences to a CaseFiles

  Before each Run we splice the user-picked display units into the
  case's controlDict via the `units {... }` block.  The solver then
  honours them in every print site, so the log and the StreamsTable
  agree.

  Behaviour:
    * Pressure / temperature / flow are taken from displayPrefs.
    * Any existing `units` block in the case file is REPLACED (not
      merged) -- the UI menu is the authoritative source of truth
      when the user clicks Run.  If you want to override per case,
      put it in the dict and bypass the menu (the menu reflects the
      session preset, the dict reflects per-case overrides; the
      menu wins on conflict because the user clicked it more
      recently).
\*---------------------------------------------------------------------------*/

import type { CaseFiles } from "./types.js";
import type { JsonDict } from "../dict/index.js";
import type { DisplayPrefs } from "../state/displayUnits.js";

export function withDisplayPrefs(files: CaseFiles,
  prefs: DisplayPrefs,
): CaseFiles {
  const tempUnit = prefs.temperature === "degC" ? "degC" : "K";
  const unitsBlock: JsonDict = {
    pressure: prefs.pressure,
    temperature: tempUnit,
    flow: prefs.flow,
    // Significant figures the C++ log should honour, so the streamed log
    // matches the GUI tables.  DisplayUnits::readFrom reads it.
    significantFigures: prefs.sigFigs,
  };
  const nextControl: JsonDict = {
...files.controlDict,
    units: unitsBlock,
  };
  return {...files, controlDict: nextControl };
}
