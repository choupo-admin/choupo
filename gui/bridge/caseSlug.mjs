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
-------------------------------------------------------------------------------
File
    gui/bridge/caseSlug.mjs

Description
    A CASE'S IDENTITY IN THE WORKSPACE, and nothing else.

    Two pure functions, extracted from `claudeBridge.mjs` on 2026-09-08 so a
    test can reach them: that module opens a server the moment it is imported,
    so its rules could only ever be checked by READING it, and a rule nobody
    can run is a rule nobody can sabotage-test.

    THE RULE.  A case is identified by its SLUG.  The folder on disk keeps
    whatever name the student gave it -- the authoring guide asks for
    `PascalCase` on a case root (decided 2026-05-27) -- and the importer
    ADOPTS that folder rather than materialising a lowercase twin beside it.

    WHY IT EXISTS.  `slugifyName` lowercases, so a PascalCase folder can never
    equal its own slug; the importer's own "same name = SAME case" guard
    compared the slug against the folder NAME, never fired, and wrote a copy.
    The student then edited the copy while the folder they had opened stood
    still -- silently, twice in a row, on the case Vítor built for PEQ.  The
    two rules that collided were the guide's (PascalCase) and the importer's
    (lowercase); adopting keeps both.

    WHAT IS REFUSED RATHER THAN GUESSED.  Two DIFFERENT folders slugifying to
    one slug is a question with no defensible answer, so it is named and
    refused.  An EXACT-name folder wins over a merely slugifying one: it is
    the more specific match, and it is what every case imported before this
    resolved to, so nothing already on disk moves.
\*---------------------------------------------------------------------------*/

// Turn an arbitrary display NAME into a safe single-folder slug: lowercase,
// every illegal run -> '-', collapse repeats, strip leading non-alnum (so the
// first char is alnum), tidy a trailing separator; empty -> "case".
export function slugifyName(raw) {
  const s = String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")   // any illegal run -> single '-'
    .replace(/-{2,}/g, "-")           // collapse repeats
    .replace(/^[^a-z0-9]+/, "")       // leading char must be alnum
    .replace(/[-_]+$/, "");           // tidy a trailing separator
  return s || "case";
}

// Which EXISTING case answers to `slug`?  `folders` is the list of case
// folder NAMES already in the workspace (the caller filters to real cases --
// this function knows about names, not about the filesystem).
//
// Returns `{ name }` for the folder to adopt, `{ error }` when two different
// folders claim the slug, or null when none does.
export function adoptExistingCase(slug, folders) {
  const claimants = (folders || []).filter(
    (n) => n === slug || slugifyName(n) === slug,
  );
  if (claimants.length === 0) return null;
  if (claimants.includes(slug)) return { name: slug };   // exact match wins
  if (claimants.length > 1) {
    return { error: `two case folders both answer to '${slug}': `
      + claimants.join(", ")
      + ". A case's identity is its slug, so these cannot both be opened under"
      + " it -- rename one of them and try again." };
  }
  return { name: claimants[0] };
}
