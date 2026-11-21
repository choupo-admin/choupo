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
  adsorbentCatalogue -- the READER of what the catalogue holds for each
  adsorbent, for the `adsorbent-selection` EduTool (DEV.md 4c C459).

  It reads, as raw text, every record of data/standards/assets/ and keeps the
  ones that say `kind adsorbent;`, and every pair record under
  data/standards/parameters/adsorption/equilibria/<adsorbent>/.  Nothing is
  copied: a new adsorbent record dropped in the folder appears on the page,
  and the test of the tool recounts the folder to prove it.

  `?raw` with `eager: true` is load-bearing (check_gui_static arm
  check_glob_raw): a bare glob over .dat files makes the production build parse
  each record as JavaScript.
\*---------------------------------------------------------------------------*/

import {
  parseAdsorbentRecord, parsePairRecord,
  type CatalogueIdentity, type PairIdentity,
} from "./adsorbentSelectionData.js";

const ASSETS = import.meta.glob("../../../../data/standards/assets/*.dat", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

const PAIRS = import.meta.glob(
  "../../../../data/standards/parameters/adsorption/equilibria/*/*.dat", {
    query: "?raw", import: "default", eager: true,
  }) as Record<string, string>;

export interface CatalogueAdsorbent {
  identity: CatalogueIdentity;
  /** The record exactly as it is on disk. */
  raw: string;
  /** Path under the repository, for the reader who wants to open it. */
  path: string;
  pairs: { path: string; raw: string; pair: PairIdentity }[];
}

/** Every adsorbent the standards catalogue holds, by name. */
export function catalogueAdsorbents(): CatalogueAdsorbent[] {
  const out: CatalogueAdsorbent[] = [];
  for (const [key, raw] of Object.entries(ASSETS)) {
    const identity = parseAdsorbentRecord(raw);
    if (!identity) continue;
    const pairs: CatalogueAdsorbent["pairs"] = [];
    for (const [pk, praw] of Object.entries(PAIRS)) {
      const folder = pk.split("/").slice(-2, -1)[0];
      if (folder !== identity.name) continue;
      const pair = parsePairRecord(praw);
      if (pair) pairs.push({ path: pk.replace(/^(\.\.\/)+/, ""), raw: praw, pair });
    }
    pairs.sort((a, b) => a.pair.adsorbate.localeCompare(b.pair.adsorbate));
    out.push({ identity, raw, path: key.replace(/^(\.\.\/)+/, ""), pairs });
  }
  return out.sort((a, b) => a.identity.name.localeCompare(b.identity.name));
}
