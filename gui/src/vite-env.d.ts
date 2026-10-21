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

/// <reference types="vite/client" />

declare module "virtual:local-component-catalogue" {
  const bodies: string[];
  export default bodies;
}

//  The private tier's EVIDENCE and PAIR PARAMETERS (DEV.md 4c C117): the same
//  plugin, two more directories, `{ file, body }` because the filename is the
//  dataset's id and the pair's model folder.  scripts/localCataloguePlugin.ts.
declare module "virtual:local-evidence" {
  const entries: { file: string; body: string }[];
  export default entries;
}
declare module "virtual:local-pair-parameters" {
  const entries: { file: string; body: string }[];
  export default entries;
}

//  The exported layout page's viewer (DEV.md 4c C81): three.js and Choupo's
//  own drawing compiled into one script by scripts/layoutViewerPlugin.ts,
//  with three.js's version and its MIT licence text.
declare module "virtual:layout-viewer" {
  export const script: string;
  export const threeVersion: string;
  export const threeLicence: string;
}

//  KaTeX's contrib entries carry no typings of their own (the package types
//  only its main entry).  mhchem is imported for its SIDE EFFECT -- it
//  registers \ce{} on the katex instance and exports nothing -- so the module's
//  existence is the whole shape there is to declare.  See methods/lessonTex.ts
//  for why \ce{} is this project's declaration that a token is a SUBSTANCE
//  rather than a symbol a reader is owed a definition of.
declare module "katex/contrib/mhchem";
