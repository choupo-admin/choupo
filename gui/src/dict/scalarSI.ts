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

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  A flowsheetDict scalar crosses to JSON either as a bare SI number OR as a
  unit-bearing STRING ("900 K", "35 bar", "400 kmol/h") -- json.ts keeps the
  unit so the engine's units-mandatory readers are satisfied.  Anything that
  DISPLAYS a stream/operation value (the canvas node, the Properties panel)
  must turn that string back into canonical SI first; otherwise a known input
  renders as 0 or "—" (the feed-shows-nothing bug Vítor hit).  Plain numbers
  pass through unchanged; an unparseable value returns NaN so the caller can
  fall back to "—".
\*---------------------------------------------------------------------------*/

import { parseScalarString } from "./json.js";
import { lookupUnit, affineToK } from "./units.js";

export function scalarToSI(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return NaN;
  const p = parseScalarString(v);
  if (!p) {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }
  if (!p.unit) return p.value;
  const u = lookupUnit(p.unit);
  if (!u) return p.value;
  return u.affine ? affineToK(p.value, p.unit) : p.value * u.factor;
}
