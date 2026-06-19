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
  Choupo GUI -- structural equality for dict ASTs

  Used by round-trip tests:   parse(text) == parse(serialize(parse(text)))
\*---------------------------------------------------------------------------*/

import { Dict, type DictValue } from "./types.js";

export function dictEquals(a: Dict, b: Dict): boolean {
  if (a.entries.length !== b.entries.length) return false;
  for (let i = 0; i < a.entries.length; i++) {
    const ea = a.entries[i]!;
    const eb = b.entries[i]!;
    if (ea.key !== eb.key) return false;
    if (!valueEquals(ea.value, eb.value)) return false;
  }
  return true;
}

export function valueEquals(a: DictValue, b: DictValue): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "scalar":
      // Compare on the canonical SI value only.  The unit + originalValue
      // metadata is preserved by the parser so the text serializer can
      // round-trip verbatim, but it is intentionally NOT compared here:
      // `fromJson` cannot reconstruct it (the JSON bridge only carries
      // plain numbers), and a JSON round-trip is just as valid as a
      // text round-trip from the semantic point of view.
      return numberEquals(a.value,
        (b as { kind: "scalar"; value: number }).value,
      );
    case "word":
      return a.value === (b as { kind: "word"; value: string }).value;
    case "scalarList": {
      const bv = (b as { kind: "scalarList"; value: number[] }).value;
      if (a.value.length !== bv.length) return false;
      return a.value.every((x, i) => numberEquals(x, bv[i]!));
    }
    case "wordList": {
      const bv = (b as { kind: "wordList"; value: string[] }).value;
      if (a.value.length !== bv.length) return false;
      return a.value.every((x, i) => x === bv[i]);
    }
    case "dictList": {
      const bv = (b as { kind: "dictList"; value: Dict[] }).value;
      if (a.value.length !== bv.length) return false;
      return a.value.every((x, i) => dictEquals(x, bv[i]!));
    }
    case "dict":
      return dictEquals(a.value,
        (b as { kind: "dict"; value: Dict }).value,
      );
    case "reference":
      return a.name === (b as { kind: "reference"; name: string }).name;
  }
}

function numberEquals(a: number, b: number): boolean {
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  return a === b;
}
