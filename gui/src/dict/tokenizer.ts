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
  Choupo GUI -- dict tokenizer

  Faithful port of the C++ tokenizer in src/core/Dictionary.cpp.

  Token kinds:  Word | Number | LBrace | RBrace | LParen | RParen | Semi | End

  - Word chars: alnum + _. - + : / [ ]   (CAS numbers + setScalarAtPath syntax)
  - Quoted strings:  "foo bar"  → Word token with the inner content
  - Numbers: anything parseFloat consumes in full; otherwise demoted to Word
  - Comments: line comments to EOL, and C-style block comments
\*---------------------------------------------------------------------------*/

export type TokKind =
  | "word"
  | "number"
  | "lbrace"
  | "rbrace"
  | "lparen"
  | "rparen"
  | "semi"
  | "end";

export interface Token {
  kind: TokKind;
  text: string;
  number: number;
  line: number;
  col: number;
}

const isDigit = (c: string) => c >= "0" && c <= "9";
const isAlpha = (c: string) =>
  (c >= "A" && c <= "Z") || (c >= "a" && c <= "z");
const isAlnum = (c: string) => isAlpha(c) || isDigit(c);
const isSpace = (c: string) => c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f" || c === "\v";

const isWordChar = (c: string) =>
  isAlnum(c) ||
  c === "_" ||
  c === "." ||
  c === "-" ||
  c === "+" ||
  c === ":" ||
  c === "/" ||
  c === "[" ||
  c === "]" ||
  c === "$";       // for $var references (resolved at solve time by the C++ engine)

/**
 * std::stod-style parse: returns [value, consumedCount].
 * Accepts ±, decimal point, exponent.  Anything trailing → not a full match.
 */
function tryStod(s: string): { value: number; consumed: number } | null {
  // Manual scan to know exactly how many chars were consumed (parseFloat
  // does not expose that).  Grammar of an accepted prefix:
  //   [+-]?  (digits. digits? |. digits | digits)  ([eE] [+-]? digits)?
  let i = 0;
  if (s[i] === "+" || s[i] === "-") i++;
  let mantissa = 0;
  let sawDot = false;
  while (i < s.length) {
    const c = s[i]!;
    if (isDigit(c)) {
      mantissa++;
      i++;
    } else if (c === "." && !sawDot) {
      sawDot = true;
      i++;
    } else {
      break;
    }
  }
  if (mantissa === 0) return null;
  if (i < s.length && (s[i] === "e" || s[i] === "E")) {
    let j = i + 1;
    if (s[j] === "+" || s[j] === "-") j++;
    let expDigits = 0;
    while (j < s.length && isDigit(s[j]!)) {
      expDigits++;
      j++;
    }
    if (expDigits > 0) i = j;
  }
  const consumed = i;
  const value = Number(s.slice(0, consumed));
  if (!Number.isFinite(value)) return null;
  return { value, consumed };
}

export class Tokenizer {
  private pos = 0;
  private line = 1;
  private col = 1;

  constructor(private readonly src: string,
    public readonly file: string,
  ) {}

  loc(): string {
    return `${this.file}:${this.line}:${this.col}`;
  }

  next(): Token {
    this.skipWhitespaceAndComments();
    const tok: Token = {
      kind: "end",
      text: "",
      number: 0,
      line: this.line,
      col: this.col,
    };
    if (this.pos >= this.src.length) return tok;
    const c = this.src[this.pos]!;

    switch (c) {
      case "{": this.advance(); tok.kind = "lbrace"; tok.text = "{"; return tok;
      case "}": this.advance(); tok.kind = "rbrace"; tok.text = "}"; return tok;
      case "(": this.advance(); tok.kind = "lparen"; tok.text = "("; return tok;
      case ")": this.advance(); tok.kind = "rparen"; tok.text = ")"; return tok;
      case ";": this.advance(); tok.kind = "semi";   tok.text = ";"; return tok;
    }

    // Quoted string: "..." emits a Word whose text is the inner content.
    // Mirrors src/core/Dictionary.cpp -- used for free-form prose values
    // (description, citations, notes).
    if (c === '"') {
      this.advance();
      let s = "";
      while (this.pos < this.src.length && this.src[this.pos] !== '"') {
        if (this.src[this.pos] === "\\" && this.pos + 1 < this.src.length) {
          s += this.src[this.pos + 1];
          this.pos += 2;
          this.col += 2;
          continue;
        }
        s += this.src[this.pos]!;
        this.advance();
      }
      if (this.pos >= this.src.length) {
        throw new Error(`${this.loc()}: unterminated string literal`);
      }
      this.advance();
      tok.kind = "word";
      tok.text = s;
      return tok;
    }

    if (this.isNumberStart()) {
      tok.text = this.readToken();
      const parsed = tryStod(tok.text);
      if (parsed !== null && parsed.consumed === tok.text.length) {
        tok.kind = "number";
        tok.number = parsed.value;
      } else {
        tok.kind = "word";
      }
      return tok;
    }

    tok.text = this.readToken();
    if (tok.text === "") {
      throw new Error(`${this.loc()}: unexpected character '${c}'`);
    }
    tok.kind = "word";
    return tok;
  }

  private advance(): void {
    if (this.pos < this.src.length) {
      if (this.src[this.pos] === "\n") {
        this.line++;
        this.col = 1;
      } else {
        this.col++;
      }
      this.pos++;
    }
  }

  private isNumberStart(): boolean {
    if (this.pos >= this.src.length) return false;
    const c = this.src[this.pos]!;
    if (isDigit(c)) return true;
    if (c === "+" || c === "-" || c === ".") {
      const n = this.src[this.pos + 1];
      if (n !== undefined && (isDigit(n) || n === ".")) return true;
    }
    return false;
  }

  private readToken(): string {
    let out = "";
    while (this.pos < this.src.length) {
      const c = this.src[this.pos]!;
      if (isWordChar(c) || c === "e" || c === "E") {
        out += c;
        this.advance();
      } else break;
    }
    return out;
  }

  private skipWhitespaceAndComments(): void {
    while (this.pos < this.src.length) {
      const c = this.src[this.pos]!;
      if (isSpace(c)) {
        this.advance();
        continue;
      }
      if (c === "/" && this.src[this.pos + 1] === "/") {
        while (this.pos < this.src.length && this.src[this.pos] !== "\n") {
          this.advance();
        }
        continue;
      }
      if (c === "/" && this.src[this.pos + 1] === "*") {
        this.advance();
        this.advance();
        while (this.pos + 1 < this.src.length &&
          !(this.src[this.pos] === "*" && this.src[this.pos + 1] === "/")
        ) {
          this.advance();
        }
        if (this.pos + 1 < this.src.length) {
          this.advance();
          this.advance();
        }
        continue;
      }
      break;
    }
  }
}
