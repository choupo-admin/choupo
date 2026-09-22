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

//  KaTeX's contrib entries carry no typings of their own (the package types
//  only its main entry).  mhchem is imported for its SIDE EFFECT -- it
//  registers \ce{} on the katex instance and exports nothing -- so the module's
//  existence is the whole shape there is to declare.  See methods/lessonTex.ts
//  for why \ce{} is this project's declaration that a token is a SUBSTANCE
//  rather than a symbol a reader is owed a definition of.
declare module "katex/contrib/mhchem";
