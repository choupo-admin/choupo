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
  userCode -- detect a case that ships its own C++ (a `code/` folder with a
  custom unit op or property method).  Such a case must be COMPILED
  (bin/buildCode -> g++) into a per-case binary; the browser cannot compile
  C++ and the prebuilt WASM does not contain the custom type, so running it in
  the GUI would fail with a raw "UnitOperation::New: unknown type '...'".

  We detect it up front and show a clear, friendly message instead.
\*---------------------------------------------------------------------------*/

import type { CaseFiles } from "./types.js";

/** True if the case (or any of its sectors) ships C++ under a `code/` folder. */
export function caseHasUserCode(caseFiles: CaseFiles): boolean {
  const raw = caseFiles.rawFiles;
  if (!raw) return false;
  return Object.keys(raw).some(
    (p) => /(^|\/)code\/[^/]+\.(cpp|cc|cxx|hpp|h|H)$/.test(p),
  );
}

/** The friendly explanation shown when the GUI is asked to run such a case. */
export const USER_CODE_MSG =
  "This case ships its own C++ in a code/ folder (a custom unit op or property "
  + "method). The browser cannot compile C++, so it cannot run here. Build + run "
  + "it locally, on a machine with the Choupo repo + a compiler:  bin/buildCode "
  + "<case>  then  runCase <case>.";
