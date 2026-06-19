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
  caseName -- map the store's internal case tag (`tutorialName`) to a short,
  human-readable label for display + download filenames.

  The tag encodes the case's ORIGIN:
    "steady/flash01_benzene_toluene"   a bundled tutorial (its id)
    "local:/abs/path/to/my_case"        a case on disk (absolute path)
    "external:my_case"                  a clipboard-uploaded, in-memory case
\*---------------------------------------------------------------------------*/

export function caseDisplayName(tutorialName: string): string {
  if (tutorialName.startsWith("focus:")) return `${tutorialName.slice("focus:".length)} · focus`;
  if (tutorialName.startsWith("local:")) {
    const p = tutorialName.slice("local:".length);
    const parts = p.split(/[/\\]/).filter(Boolean);
    return parts[parts.length - 1] || p;
  }
  if (tutorialName.startsWith("external:")) return tutorialName.slice("external:".length);
  return tutorialName;
}

/** The absolute directory of a local case tag, or null if not a local case. */
export function localCaseDir(tutorialName: string): string | null {
  return tutorialName.startsWith("local:") ? tutorialName.slice("local:".length) : null;
}
