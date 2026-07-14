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
  Choupo GUI -- dict AST types

  Mirror of Choupo::Dictionary (src/core/Dictionary.{H,cpp}).
  Entries are stored as an ordered list so serialisation reproduces the
  source order.  Each value carries a discriminator so empty word/scalar
  lists remain distinguishable (the C++ parser collapses empty lists to
  empty scalar lists; we preserve that, but the explicit tag lets the
  GUI layer up-cast confidently when the schema demands).
\*---------------------------------------------------------------------------*/

export type DictValue =
  | {
      kind: "scalar";
      // `value` is ALWAYS in canonical SI.  When the input carried a
      // named unit suffix (e.g. `P 1 bar;`), we record:
      //   `unit`           = the suffix string ("bar", "kmol/h", "degC")
      //   `originalValue`  = the number as it appeared in the dict (1)
      // so the serializer can round-trip the source verbatim.  Raw-SI
      // entries (no suffix) leave both fields undefined.
      value: number;
      unit?: string;
      originalValue?: number;
      // Explicit physical dimensions from the bracket form
      // `key [M L T Theta N] value;`.  These are already canonical SI;
      // retaining the five exponents is essential when the AST crosses
      // the GUI's JSON bridge before being serialized for the engine.
      dimensions?: [number, number, number, number, number];
    }
  | { kind: "word"; value: string }
  | { kind: "scalarList"; value: number[] }
  | { kind: "wordList"; value: string[] }
  | { kind: "dictList"; value: Dict[] }
  | { kind: "dict"; value: Dict }
  // $var reference (resolved by the C++ engine against
  // the root's `variables {... }` block at solve time).  The GUI
  // stores the name as-is so the Property panel can display "$A" and
  // the round-trip serializer can write it back unchanged.
  | { kind: "reference"; name: string };

export interface DictEntry {
  key: string;
  value: DictValue;
}

export class Dict {
  readonly name: string;
  readonly entries: DictEntry[] = [];

  constructor(name = "") {
    this.name = name;
  }

  has(key: string): boolean {
    return this.entries.some((e) => e.key === key);
  }

  get(key: string): DictValue | undefined {
    return this.entries.find((e) => e.key === key)?.value;
  }

  set(key: string, value: DictValue): void {
    const i = this.entries.findIndex((e) => e.key === key);
    if (i >= 0) this.entries[i] = { key, value };
    else this.entries.push({ key, value });
  }

  keys(): string[] {
    return this.entries.map((e) => e.key);
  }
}
