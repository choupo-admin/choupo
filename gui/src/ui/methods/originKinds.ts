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
  originKinds -- WHERE A NUMBER ON AN EDUTOOL CAME FROM, the four words and
  what each one means (DEV.md 4c C112, points 15 and 18).

  An external review asked that every result an EduTool shows say whether
  the C++ engine or the page computed it.  The commander's ruling on the
  scope: a visible ORIGIN mark per value, or per panel where every value
  shares one -- NOT a per-value provenance sheet across sixty pages.  So
  there are exactly four origins, and a panel names the ones its numbers
  have:

    engine      computed by Choupo's C++ engine.  On these pages that is
                either a run of the page's witness case in this browser
                (WebAssembly) or the recorded run of a named case.  Which of
                the two a panel is says in its mark's note.
    page        computed ON THIS PAGE -- by its own TypeScript, or as
                arithmetic written out in it -- from numbers shown on it: a
                closed form a reader can redo by hand.  It is not the engine
                and must never look like it.
    reference   read from a cited source -- a paper, a standard, a data
                sheet, a book -- and not computed anywhere in Choupo.
    assumption  an INPUT: a value the reader sets (a slider, a field) or
                the example's author declared.  Not a result.

  The words are deliberately plain, and the list is CLOSED: a fifth origin
  is a decision about what a student is told, not a refactor.

  This module is pure (no JSX, no React) because the registry imports it,
  and the registry is transpiled and imported by bin/curate/method_tools.mjs
  to publish the homepage's tool list -- which now carries each tool's
  origins, so the homepage's claim about what the EduTools compute is
  derived from the same declarations the pages draw.
\*---------------------------------------------------------------------------*/

export const ORIGIN_KINDS = ["engine", "page", "reference", "assumption"] as const;

export type OriginKind = typeof ORIGIN_KINDS[number];

/** What each word means, in the sentence the legend prints.  ONE home: the
 *  in-app legend and the tooltip of every mark read it. */
export const ORIGIN_MEANING: Readonly<Record<OriginKind, string>> = {
  engine: "computed by Choupo's C++ engine -- run in this browser "
    + "(WebAssembly) on the page's witness case, or the recorded run of a "
    + "named case",
  page: "computed on this page -- by its own TypeScript, or as arithmetic "
    + "written out on it -- from numbers shown there: a closed form you can "
    + "redo by hand; not the engine",
  reference: "read from a cited source (a paper, a standard, a data sheet), "
    + "not computed in Choupo",
  assumption: "an input -- a value you set with a control, or one the "
    + "example's author declared -- not a result",
};

/** The mark's colour per origin (Mantine palette names).  Distinct hues, and
 *  the WORD is always printed beside the colour: colour does not survive a
 *  greyscale print or a colour-blind reader. */
export const ORIGIN_COLOR: Readonly<Record<OriginKind, string>> = {
  engine: "teal",
  page: "violet",
  reference: "orange",
  assumption: "gray",
};
