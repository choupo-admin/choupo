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
  Choupo GUI -- dict parser

  Faithful port of the recursive-descent parser in
  src/core/Dictionary.cpp.  Grammar:

      entry    := keyword (value ';' | sub_dict | scalar_list ';'
                            | word_list ';' | dict_list ';' )
      sub_dict := '{' entry* '}'                  -- NO trailing semicolon
      scalar_list:= '(' number* ')'
      word_list:= '(' word*   ')'
      dict_list:= '(' sub_dict* ')'
      value    := number | word
      comments := line comments or C-style block comments

  An optional `FoamFile {... }` header at top is skipped (compatibility).
\*---------------------------------------------------------------------------*/

import { Tokenizer, type Token, type TokKind } from "./tokenizer.js";
import { Dict, type DictValue } from "./types.js";
import { affineToK, lookupUnit } from "./units.js";

export interface ParseOptions {
  sourceName?: string;
}

export function parse(text: string, opts: ParseOptions = {}): Dict {
  const root = new Dict("<root>");
  const tk = new Tokenizer(text, opts.sourceName ?? "<inline>");
  const p = new Parser(tk);
  p.parseInto(root);
  return root;
}

class Parser {
  private cur: Token;

  constructor(private readonly tk: Tokenizer) {
    this.cur = this.tk.next();
  }

  parseInto(root: Dict): void {
    if (this.cur.kind === "word" && this.cur.text === "FoamFile") {
      this.cur = this.tk.next();
      this.expect("lbrace", "{ after FoamFile");
      this.skipUntilMatchingBrace();
      this.cur = this.tk.next();
    }
    this.parseEntries(root, true);
  }

  private parseEntries(dict: Dict, topLevel: boolean): void {
    while (true) {
      if (this.cur.kind === "end") {
        if (!topLevel) throw new Error(`${this.tk.loc()}: expected '}'`);
        return;
      }
      if (this.cur.kind === "rbrace") {
        if (topLevel) throw new Error(`${this.tk.loc()}: unmatched '}'`);
        return;
      }
      if (this.cur.kind !== "word") {
        throw new Error(
          `${this.tk.loc()}: expected keyword, got '${this.cur.text}'`,
        );
      }

      const key = this.cur.text;
      this.cur = this.tk.next();

      if (this.cur.kind === "lbrace") {
        const sub = new Dict(key);
        this.cur = this.tk.next();
        this.parseEntries(sub, false);
        this.expect("rbrace", `'}' to close sub-dict '${key}'`);
        dict.set(key, { kind: "dict", value: sub });
        this.cur = this.tk.next();
      } else if (this.cur.kind === "lparen") {
        const value = this.parseList(key);
        dict.set(key, value);
      } else if (this.cur.kind === "number") {
        const original = this.cur.number;
        let value = original;
        let unit: string | undefined;
        this.cur = this.tk.next();
        // Optional unit suffix: `P 1 bar;`, `F 100 kmol/h;`,
        // `T 25 degC;`.  Convert to canonical SI, remember the
        // original token so the serializer can round-trip verbatim.
        if (this.cur.kind === "word") {
          const suffix = this.cur.text;
          const spec = lookupUnit(suffix);
          if (!spec) {
            throw new Error(
              `${this.tk.loc()}: unknown unit suffix '${suffix}' after scalar value of '${key}'`,
            );
          }
          value = spec.affine
            ? affineToK(original, suffix)
          : original * spec.factor;
          unit = suffix;
          this.cur = this.tk.next();
        }
        this.expect("semi", `';' after scalar value of '${key}'`);
        dict.set(key,
          unit !== undefined
            ? { kind: "scalar", value, unit, originalValue: original }
          : { kind: "scalar", value },
        );
        this.cur = this.tk.next();
      } else if (this.cur.kind === "word") {
        const w = this.cur.text;

        if (w.startsWith("[")) {
          const dimensions = this.parseDimensions(key);
          if ((this.cur.kind as TokKind) !== "number") {
            throw new Error(
              `${this.tk.loc()}: expected SI value after dimension set of '${key}'`,
            );
          }
          const value = this.cur.number;
          this.cur = this.tk.next();
          this.expect("semi", `';' after dimensioned scalar value of '${key}'`);
          dict.set(key, { kind: "scalar", value, dimensions });
          this.cur = this.tk.next();
          continue;
        }

        // $var reference: the C++ engine resolves these at solve time
        // against the root's `variables {... }` block.  The GUI
        // stores them as-is for display and round-trip.
        if (w.length > 1 && w.startsWith("$")) {
          const refName = w.slice(1);
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(refName)) {
            throw new Error(
              `${this.tk.loc()}: reference name '${refName}' for key '${key}' must be a plain identifier`,
            );
          }
          this.cur = this.tk.next();
          this.expect("semi", `';' after reference value of '${key}'`);
          dict.set(key, { kind: "reference", name: refName });
          this.cur = this.tk.next();
          continue;
        }

        this.cur = this.tk.next();
        this.expect("semi", `';' after word value of '${key}'`);
        dict.set(key, { kind: "word", value: w });
        this.cur = this.tk.next();
      } else {
        throw new Error(
          `${this.tk.loc()}: unexpected token '${this.cur.text}' after keyword '${key}'`,
        );
      }
    }
  }

  /** Parse `[M L T Theta N]`; leave the cursor on the following token. */
  private parseDimensions(
    key: string,
  ): [number, number, number, number, number] {
    const parts: string[] = [];
    while (true) {
      if (this.cur.kind !== "word" && this.cur.kind !== "number") {
        throw new Error(
          `${this.tk.loc()}: unterminated dimension set for '${key}'`,
        );
      }
      parts.push(this.cur.text);
      const closed = this.cur.text.endsWith("]");
      this.cur = this.tk.next();
      if (closed) break;
    }

    const match = /^\[\s*([+-]?\d+)\s+([+-]?\d+)\s+([+-]?\d+)\s+([+-]?\d+)\s+([+-]?\d+)\s*\]$/.exec(
      parts.join(" "),
    );
    if (!match) {
      throw new Error(
        `${this.tk.loc()}: dimension set for '${key}' must be [M L T Theta N]; got '${parts.join(" ")}'`,
      );
    }
    return match.slice(1).map(Number) as [number, number, number, number, number];
  }

  /** Cursor is at '('. Consumes through the closing ';' and advances past it. */
  private parseList(key: string): DictValue {
    this.cur = this.tk.next();

    if (this.cur.kind === "lbrace") {
      const dicts: Dict[] = [];
      while (this.cur.kind === "lbrace") {
        const sub = new Dict(`${key}[${dicts.length}]`);
        this.cur = this.tk.next();
        this.parseEntries(sub, false);
        this.expect("rbrace", `'}' to close dict in list '${key}'`);
        dicts.push(sub);
        this.cur = this.tk.next();
      }
      this.expect("rparen", `')' to close dict-list '${key}'`);
      this.cur = this.tk.next();
      this.expect("semi", `';' after dict-list '${key}'`);
      this.cur = this.tk.next();
      return { kind: "dictList", value: dicts };
    }

    if (this.cur.kind === "number") {
      const nums: number[] = [];
      while ((this.cur.kind as TokKind) !== "rparen") {
        if (this.cur.kind === "number") {
          nums.push(this.cur.number);
        } else if (this.cur.kind === "word") {
          const n = Number(this.cur.text);
          if (!Number.isFinite(n)) {
            throw new Error(
              `${this.tk.loc()}: expected number, got '${this.cur.text}'`,
            );
          }
          nums.push(n);
        } else {
          throw new Error(
            `${this.tk.loc()}: expected number or ')' in scalar list`,
          );
        }
        this.cur = this.tk.next();
      }
      this.expect("rparen", `')' to close list '${key}'`);
      this.cur = this.tk.next();
      this.expect("semi", `';' after list '${key}'`);
      this.cur = this.tk.next();
      return { kind: "scalarList", value: nums };
    }

    if (this.cur.kind === "word") {
      const words: string[] = [];
      while ((this.cur.kind as TokKind) !== "rparen") {
        if (this.cur.kind !== "word") {
          throw new Error(
            `${this.tk.loc()}: expected word or ')' in word list`,
          );
        }
        words.push(this.cur.text);
        this.cur = this.tk.next();
      }
      this.expect("rparen", `')' to close list '${key}'`);
      this.cur = this.tk.next();
      this.expect("semi", `';' after list '${key}'`);
      this.cur = this.tk.next();
      return { kind: "wordList", value: words };
    }

    if (this.cur.kind === "rparen") {
      // Empty list — C++ stores as empty scalar list.
      this.cur = this.tk.next();
      this.expect("semi", `';' after empty list '${key}'`);
      this.cur = this.tk.next();
      return { kind: "scalarList", value: [] };
    }

    throw new Error(
      `${this.tk.loc()}: unexpected token in list '${key}'`,
    );
  }

  private expect(kind: TokKind, what: string): void {
    if (this.cur.kind !== kind) {
      throw new Error(
        `${this.tk.loc()}: expected ${what}, got '${this.cur.text}'`,
      );
    }
  }

  private skipUntilMatchingBrace(): void {
    let depth = 1;
    while (depth > 0) {
      this.cur = this.tk.next();
      if (this.cur.kind === "end") {
        throw new Error(`${this.tk.loc()}: EOF inside FoamFile header`);
      }
      if (this.cur.kind === "lbrace") depth++;
      if (this.cur.kind === "rbrace") depth--;
    }
  }
}
