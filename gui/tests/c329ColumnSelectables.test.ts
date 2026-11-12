/*---------------------------------------------------------------------------*\
  C329: the distillation column's block still opens its own chapter, and each
  word chosen INSIDE it (total reflux, a tray-efficiency model, the tray
  pressure-drop route, a packing model) opens the section that derives it.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { theoryLink, unitSlotTheoryLink } from "../src/case/modelDocs.js";

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
