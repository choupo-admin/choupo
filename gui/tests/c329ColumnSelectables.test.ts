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
  C329: the distillation column's block still opens its own chapter, and each
  word chosen INSIDE it (total reflux, a tray-efficiency model, the tray
  pressure-drop route, a packing model) opens the section that derives it.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { theoryLink, unitSlotTheoryLink } from "../src/case/modelDocs.js";
import { keyHelp } from "../src/case/keyHelp.js";

const dest = (url: string) => decodeURIComponent(/nameddest=([^&]+)/.exec(url)?.[1] ?? "");

describe("C329 column selectables -> theory sections", () => {
  it("the column block keeps its chapter", () => {
    expect(dest(theoryLink("distillationColumn"))).toBe("ch:distillation");
  });

  const cases: [string, string, string][] = [
    ["model", "totalReflux", "sec:total-reflux"],
    ["operation.efficiency.model", "AIChE", "sec:eff-aiche"],
    ["operation.efficiency.model", "ChanFair", "sec:eff-chanfair"],
    ["operation.efficiency.model", "SyedaChuang", "sec:eff-syeda"],
    ["operation.hydraulics.pressureDropModel", "BollesFair", "sec:bolles-fair"],
    ["operation.packing.model", "RochaBravoFair", "sec:packing-rbf"],
    ["operation.packing.model", "Delft", "sec:packing-delft"],
  ];
  for (const [path, token, want] of cases) {
    it(`${path} ${token} -> ${want}`, () => {
      expect(dest(unitSlotTheoryLink("distillationColumn", path, token))).toBe(want);
      expect(dest(unitSlotTheoryLink("column", path, token))).toBe(want);
    });
  }

  it("a word with no section of its own falls back to the unit's chapter", () => {
    expect(dest(unitSlotTheoryLink("distillationColumn", "model", "WangHenke"))).toBe("ch:distillation");
  });
});

//  F1 on a REAL case file.  keyHelp's `line` is 1-based (the tokenizer
//  counts from 1, and keyAtLine compares against its token lines); the line
//  numbers are found here from the file itself, so the test holds the
//  convention rather than a remembered number.
describe("C329 F1 on the column's selectables in shipped cases", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const caseFile = (c: string) =>
    resolve(here, `../../tutorials/steady/distillation/${c}/system/flowsheetDict`);
  const lineOf = (text: string, re: RegExp) => {
    const i = text.split("\n").findIndex((l) => re.test(l));
    if (i < 0) throw new Error(`no line matches ${re}`);
    return i + 1;                                   // 1-based
  };
  const f1 = (file: string, text: string, line: number) =>
    dest(keyHelp(file, text, line).guide?.url ?? "");

  it("trayEfficiency06_syedaChuang_yanagi14", () => {
    const file = "tutorials/steady/distillation/trayEfficiency06_syedaChuang_yanagi14/system/flowsheetDict";
    const text = readFileSync(caseFile("trayEfficiency06_syedaChuang_yanagi14"), "utf8");
    expect(f1(file, text, lineOf(text, /^\s*model\s+totalReflux;/))).toBe("sec:total-reflux");
    expect(f1(file, text, lineOf(text, /^\s*model\s+SyedaChuang;/))).toBe("sec:eff-syeda");
    expect(f1(file, text, lineOf(text, /^\s*pressureDropModel\s+BollesFair;/))).toBe("sec:bolles-fair");
    //  an unrelated key of the same unit keeps the unit's chapter
    expect(f1(file, text, lineOf(text, /^\s*weirHeight\s/))).toBe("ch:distillation");
    expect(f1(file, text, lineOf(text, /^\s*type\s+distillationColumn;/))).toBe("ch:distillation");
  });

  it("packing03_schulz_delft_0p10bar", () => {
    const file = "tutorials/steady/distillation/packing03_schulz_delft_0p10bar/system/flowsheetDict";
    const text = readFileSync(caseFile("packing03_schulz_delft_0p10bar"), "utf8");
    expect(f1(file, text, lineOf(text, /^\s*model\s+totalReflux;/))).toBe("sec:total-reflux");
    expect(f1(file, text, lineOf(text, /^\s*model\s+Delft;/))).toBe("sec:packing-delft");
    expect(f1(file, text, lineOf(text, /^\s*corrugationAngle\s/))).toBe("ch:distillation");
  });
});
